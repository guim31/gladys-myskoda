// -----------------------------------------------------------------------------
// The integration's runtime: the cars of the MySkoda account, read from the
// cloud on the container's own timer and published to Gladys (only what
// changed, plus a heartbeat).
//
// Reads return the state each car last sent to the cloud: they never wake
// the car (the wake-up endpoint, limited to a few calls a day and hard on the
// 12 V battery, is never called). A car sends its state when it is switched
// off, while it charges and after a command. The pace stays under a budget of
// calls an hour per account (see readPeriodMs).
//
// Commands (charge, climate, charge limit, lock) are accepted or refused by
// the cloud at once; the car carries them out later, and only the next reads
// tell whether it did. Until then the requested value is held on the
// commanded feature (ten minutes at most), and the widget says it is waiting.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, readPeriodMs, validSpin } from './config.js';
import { ERROR_KINDS } from './myskoda/errors.js';
import { createHttp } from './myskoda/http.js';
import { createSkodaClient } from './myskoda/client.js';
import { ActionFailure, MESSAGES, UserError, failureText, userTextOf } from './messages.js';
import {
  OPTIONAL_FIELDS,
  VEHICLE_FEATURES,
  buildVehicleDevice,
  logLabel,
  pluggedOf,
  rangeOf,
  snapshotOf,
  vehicleCommand,
  vehicleIds,
  vehicleInfo,
  vehicleName,
  vehicleStates,
} from './devices/vehicle.js';

const MINUTE = 60 * 1000;
const TICK_MS = MINUTE;
// The list of cars and their capabilities: read again every 6 hours.
const VEHICLE_LIST_REFRESH_MS = 6 * 60 * MINUTE;
const RETRY_MS = 15 * MINUTE;
const RATE_LIMIT_BACKOFF_MS = 30 * MINUTE;
// The mileage moves only when the car is driven: read at most once an hour.
const SLOW_READ_MS = 60 * MINUTE;
// How long a commanded value is held, waiting for the car to report it.
const PENDING_MS = 10 * MINUTE;
// Reads of the commanded endpoint after a command.
const FOLLOW_UP_DELAYS_MS = [2 * MINUTE, 6 * MINUTE];
// A refresh asked by a scene or the widget within a minute of a read reuses it.
const MANUAL_REFRESH_MIN_GAP_MS = MINUTE;
// A value that does not change is sent again twice a day, so Gladys does not
// show it as stale ("no recent value" past 48 h).
const HEARTBEAT_MS = 12 * 60 * MINUTE;
// The end of a charge stopped from Gladys is no "charge finished" event.
const OWN_STOP_MS = 30 * MINUTE;
const WIDGET_NUDGE_MIN_INTERVAL_MS = 10 * 1000;

export const WIDGET_KEYS = { VEHICLE: 'vehicle' };
export const SCENE_TRIGGER_KEYS = { CHARGE_FINISHED: 'charge_finished' };

// Errors the user must act on: no sign-in attempt until the configuration
// changes. Insisting could lock the account.
const BLOCKING_KINDS = new Set([ERROR_KINDS.AUTH, ERROR_KINDS.CONSENT, ERROR_KINDS.BLOCKED]);
// A refusal of the endpoint itself: the car (or the account) does not offer it.
const REFUSALS = new Set([
  ERROR_KINDS.NOT_SUPPORTED,
  ERROR_KINDS.ACCESS_DENIED,
  ERROR_KINDS.NOT_FOUND,
]);

/**
 * The data endpoints read for a car, in order, with the capability (of the
 * car's info) that offers them. `slow`: read at most once an hour.
 */
const READS = [
  { endpoint: 'charging', when: ({ caps }) => caps.has('CHARGING') },
  {
    endpoint: 'air-conditioning',
    when: ({ caps }) => caps.has('AIR_CONDITIONING') || caps.has('OUTSIDE_TEMPERATURE'),
  },
  { endpoint: 'status', when: ({ caps }) => caps.has('STATE') },
  { endpoint: 'driving-range', when: ({ caps }) => caps.has('STATE') },
  { endpoint: 'maintenance', slow: true },
  { endpoint: 'positions', when: ({ caps, gps }) => gps && caps.has('PARKING_POSITION') },
];

// The endpoint that reports the effect of each order.
const ORDER_ENDPOINTS = {
  startCharging: ['charging'],
  stopCharging: ['charging'],
  setChargeLimit: ['charging'],
  startClimate: ['air-conditioning'],
  stopClimate: ['air-conditioning'],
  setTargetTemperature: ['air-conditioning'],
  lock: ['status'],
  unlock: ['status'],
};
// The timestamp telling whether a read is newer than a command.
const EXPECT_TIMESTAMPS = {
  charging: 'chargingUpdatedAt',
  chargeLimit: 'chargingUpdatedAt',
  climateOn: 'climateUpdatedAt',
  targetTempC: 'climateUpdatedAt',
  locked: 'statusUpdatedAt',
};

/** The real cloud client of a configuration. */
export function defaultClientFactory(config, session) {
  return createSkodaClient({
    http: createHttp(),
    credentials: { email: config.email, password: config.password },
    session,
  });
}

export function createMySkoda({
  gladys,
  store,
  logger = createLogger({ name: 'myskoda' }),
  clientFactory = defaultClientFactory,
  now = Date.now,
  timers = true,
}) {
  let config = null;
  let client = null;
  let ticker = null;
  let blocked = null; // error kind that stops the sign-ins until the config changes
  let spinRefused = false; // the S-PIN is not sent again until the config changes
  let lastListAt = 0;
  let lastListAttemptAt = 0;
  let backoffUntil = 0;
  let publishedDevicesJson = null;
  let stopped = false;
  const vehicles = new Map(); // vin → vehicle (see addVehicle)
  const nudges = new Map(); // widget key → { at, timer }
  // Failures already logged: a failure that repeats every read is logged once
  // at warn level, then at debug level until it recovers.
  const failing = new Set();
  let statusSent = null; // last connection status Gladys accepted (serialized)
  let statusWanted = null; // last connection status asked for: [connected, message]

  // --- Helpers ---------------------------------------------------------------

  const createdDevice = (externalId) =>
    (gladys.devices ?? []).find((device) => device.external_id === externalId);

  function findVehicle(deviceExternalId) {
    for (const vehicle of vehicles.values()) {
      if (vehicleIds(gladys, vehicle.info.vin).device === deviceExternalId) return vehicle;
    }
    return null;
  }

  function requireVehicle(deviceExternalId) {
    const vehicle = findVehicle(deviceExternalId);
    if (!vehicle) throw new UserError(MESSAGES.unknownVehicle);
    return vehicle;
  }

  function requireClient() {
    if (!client || blocked)
      throw new UserError(MESSAGES[blocked] ?? MESSAGES.notConfigured, blocked);
  }

  /** The data endpoints to read for a car, now. */
  function activeReads(vehicle, { slowDue = true } = {}) {
    const context = { caps: vehicle.info.capabilities, gps: Boolean(config?.gps) };
    return READS.filter((read) => !read.when || read.when(context))
      .filter((read) => !vehicle.disabled.has(read.endpoint))
      .filter((read) => slowDue || !read.slow)
      .map((read) => read.endpoint);
  }

  /** What a car offers: decides its features (src/devices/vehicle.js). */
  function capabilities(vehicle) {
    const caps = vehicle.info.capabilities;
    const active = new Set(activeReads(vehicle));
    const charging = active.has('charging');
    return {
      charging,
      // Home Assistant: the extended settings, or a MEB car (not MQB).
      chargeLimit:
        charging && (caps.has('EXTENDED_CHARGING_SETTINGS') || !caps.has('CHARGING_MQB')),
      climate: active.has('air-conditioning') && caps.has('AIR_CONDITIONING'),
      outside: active.has('air-conditioning'),
      state: active.has('status') || active.has('driving-range'),
      position: active.has('positions'),
      lock: caps.has('ACCESS'),
      seen: new Set(store.vehicle(vehicle.info.vin).seen ?? []),
    };
  }

  const vehicleDevice = (vehicle) =>
    buildVehicleDevice(gladys, vehicle.info, capabilities(vehicle), { language: config.language });

  // Every read reports the status: send it only when it changes. Reset when
  // Gladys reconnects (resync) or the runtime starts again.
  async function setStatus(connected, message) {
    statusWanted = [connected, message];
    const key = JSON.stringify([connected, message ?? null]);
    if (key === statusSent) return;
    try {
      await gladys.setConnectionStatus(connected, message);
      statusSent = key;
      logRecovery('status', 'Connection status reported again');
    } catch (err) {
      logFailure('status', `Could not report the connection status: ${err.message}`);
    }
  }

  /** Log a failure once (warn), then at debug level while it repeats. */
  function logFailure(key, line) {
    if (failing.has(key)) {
      logger.debug(line);
      return;
    }
    failing.add(key);
    logger.warn(`${line} (logged once until it recovers)`);
  }

  /** One info line when a logged failure is over. */
  function logRecovery(key, line) {
    if (failing.delete(key)) logger.info(line);
  }

  function nudgeWidget(key) {
    const entry = nudges.get(key) ?? { at: 0, timer: null };
    nudges.set(key, entry);
    if (entry.timer) return;
    const delay = entry.at + WIDGET_NUDGE_MIN_INTERVAL_MS - now();
    const fire = () => {
      entry.timer = null;
      entry.at = now();
      try {
        gladys.requestWidgetRefresh(key);
      } catch (err) {
        logger.debug(`Widget nudge skipped: ${err.message}`);
      }
    };
    if (delay <= 0 || !timers) fire();
    else {
      // Trailing nudge: the last change inside the core's 10 s window still lands.
      entry.timer = setTimeout(fire, delay);
      entry.timer.unref?.();
    }
  }

  // --- Publishing ------------------------------------------------------------

  async function publishDevices({ force = false } = {}) {
    const devices = config
      ? [...vehicles.values()]
          .filter((vehicle) => vehicle.readOnce)
          .map(vehicleDevice)
          .filter((device) => device.features.length > 0)
      : [];
    const json = JSON.stringify(devices);
    if (!force && json === publishedDevicesJson) return;
    await gladys.publishDiscoveredDevices(devices);
    publishedDevicesJson = json;
  }

  /** The states to publish: the real ones, a commanded value held while pending. */
  function statesOf(vehicle) {
    const held = [...vehicle.pending].map(([key, pending]) => ({ key, ...pending.state }));
    return [
      ...vehicleStates(vehicle.snapshot).filter((state) => !vehicle.pending.has(state.key)),
      ...held.filter((state) => state.value !== undefined || state.text !== undefined),
    ];
  }

  /**
   * Publish the states that changed (the SDK remembers what Gladys accepted).
   * A device the user has not created yet gets nothing: Gladys would drop it,
   * and onDeviceCreated sends everything once it exists.
   */
  async function publishVehicle(vehicle, { force = false } = {}) {
    const built = vehicleDevice(vehicle);
    const created = createdDevice(built.external_id);
    if (Array.isArray(gladys.devices) && !created) return;
    if (force) gladys.forgetPublishedStates(built.external_id);
    const present = new Set((created ?? built).features.map((f) => f.external_id));
    const states = statesOf(vehicle)
      .map(({ key, value, text }) => ({
        device_feature_external_id: `${built.external_id}:${key}`,
        ...(text !== undefined ? { text } : { state: value }),
      }))
      .filter((state) => present.has(state.device_feature_external_id));
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      logRecovery('publish', 'Publishing states to Gladys works again');
    } catch (err) {
      // Not remembered by the SDK: the next read sends it again.
      logFailure('publish', `Publishing states failed: ${err.message}`);
    }
  }

  async function publishAll(options) {
    for (const vehicle of vehicles.values()) await publishVehicle(vehicle, options);
  }

  // What the widget shows outside of its device-bound tiles.
  const widgetSignature = (vehicle) =>
    JSON.stringify([
      vehicle.snapshot,
      [...vehicle.pending.keys()],
      vehicle.lastCommand?.outcome ?? null,
      blocked,
    ]);

  // --- Snapshots -------------------------------------------------------------

  /** Settle the pending commands against what the car reports now. */
  function settlePending(vehicle) {
    const t = now();
    for (const [key, pending] of vehicle.pending) {
      const snapshot = vehicle.snapshot;
      const done = Object.entries(pending.expect).every(
        ([field, value]) => snapshot[field] === value,
      );
      const newer = Object.keys(pending.expect).some(
        (field) => snapshot[EXPECT_TIMESTAMPS[field]] > pending.at,
      );
      if (done) {
        vehicle.pending.delete(key);
        if (vehicle.lastCommand?.key === key) vehicle.lastCommand.outcome = 'confirmed';
        logger.debug(`${logLabel(vehicle.info)}: ${pending.order} confirmed by the car`);
      } else if (newer || t >= pending.until) {
        vehicle.pending.delete(key);
        if (vehicle.lastCommand?.key === key) vehicle.lastCommand.outcome = 'unconfirmed';
        logger.info(`${logLabel(vehicle.info)}: ${pending.order} not reported by the car`);
      }
    }
  }

  /** Fire "charge finished": the car stopped charging, still plugged in. */
  async function detectChargeFinished(vehicle, previous) {
    const next = vehicle.snapshot;
    if (previous.charging !== true || next.charging !== false || pluggedOf(next) !== true) return;
    if (vehicle.ownStopAt && now() - vehicle.ownStopAt < OWN_STOP_MS) return;
    const data = { device: vehicleIds(gladys, vehicle.info.vin).device };
    if (Number.isFinite(next.batteryLevel)) data.battery_level = Math.round(next.batteryLevel);
    const range = rangeOf(next);
    if (Number.isFinite(range)) data.range_km = Math.round(range);
    try {
      await gladys.publishSceneEvent(SCENE_TRIGGER_KEYS.CHARGE_FINISHED, data);
      logger.debug(`${logLabel(vehicle.info)}: charge finished`);
    } catch (err) {
      logger.warn(`Scene event ${SCENE_TRIGGER_KEYS.CHARGE_FINISHED} refused: ${err.message}`);
    }
  }

  async function applySnapshot(vehicle, changes) {
    const before = widgetSignature(vehicle);
    const previous = vehicle.snapshot;
    // The cloud sometimes answers an older, lower mileage: it never goes down.
    if (changes.odometerKm !== undefined && changes.odometerKm < previous.odometerKm) {
      delete changes.odometerKm;
    }
    vehicle.snapshot = { ...previous, ...changes };
    settlePending(vehicle);
    await detectChargeFinished(vehicle, previous);
    await publishVehicle(vehicle);
    if (widgetSignature(vehicle) !== before) nudgeWidget(WIDGET_KEYS.VEHICLE);
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * Handle a read or command error.
   * `failureKey` marks a periodic call: its repeated failures are logged once.
   */
  async function handleError(err, context, failureKey = null) {
    if (BLOCKING_KINDS.has(err.kind)) {
      if (blocked !== err.kind) {
        logger.warn(`${context}: ${err.message}; no new attempt until the configuration is saved`);
      }
      blocked = err.kind;
      await setStatus(false, MESSAGES[err.kind]);
      nudgeWidget(WIDGET_KEYS.VEHICLE);
      return;
    }
    if (err.kind === ERROR_KINDS.RATE_LIMIT) {
      backoffUntil = now() + RATE_LIMIT_BACKOFF_MS;
      logFailure('rate-limit', `${context}: too many requests (429), reads pause for 30 minutes`);
      return;
    }
    if (err.kind === ERROR_KINDS.SPIN) {
      if (!spinRefused) logger.warn(`${context}: S-PIN refused, not sent again until saved`);
      spinRefused = true;
      return;
    }
    const line = `${context}: ${err.message}`;
    if (failureKey) logFailure(failureKey, line);
    else logger.warn(line);
    if (err.kind === ERROR_KINDS.NETWORK || err.kind === ERROR_KINDS.SERVER) {
      await setStatus(false, MESSAGES.unreachable);
    }
  }

  /** A periodic call worked: end of its logged failure, if any. */
  function cloudAnswered(failureKey, label) {
    logRecovery('rate-limit', 'The Škoda cloud accepts requests again');
    logRecovery(failureKey, `${label}: works again`);
  }

  /**
   * Read a car's endpoints (all, or `only` these). An endpoint the car refuses
   * the first time is dropped for good (until a restart); a refusal after it
   * worked is a passing error.
   * @throws the first error that is not about one endpoint (network, quota, sign-in)
   */
  async function readVehicle(vehicle, { only = null } = {}) {
    const slowDue = now() - vehicle.lastSlowReadAt >= SLOW_READ_MS;
    const endpoints = activeReads(vehicle, { slowDue: Boolean(only) || slowDue }).filter(
      (e) => !only || only.includes(e),
    );
    const memory = store.vehicle(vehicle.info.vin);
    const seenBefore = JSON.stringify(memory.seen ?? []);
    const changes = {};
    let answered = 0;
    let dropped = false;
    let firstError = null;
    // A follow-up read of one endpoint does not delay the next full read.
    if (!only) vehicle.lastReadAt = now();
    if (!only && slowDue) vehicle.lastSlowReadAt = now();
    logger.debug(`Reading ${logLabel(vehicle.info)}: ${endpoints.join(', ') || 'nothing'}`);
    for (const endpoint of endpoints) {
      let body;
      try {
        body = await client.read(vehicle.info.vin, endpoint);
      } catch (err) {
        if (
          err.kind === ERROR_KINDS.NOT_SUPPORTED ||
          (REFUSALS.has(err.kind) && !vehicle.worked.has(endpoint))
        ) {
          vehicle.disabled.add(endpoint);
          dropped = true;
          logger.debug(`${logLabel(vehicle.info)}: ${endpoint} not offered (${err.message})`);
          continue;
        }
        if (
          BLOCKING_KINDS.has(err.kind) ||
          err.kind === ERROR_KINDS.RATE_LIMIT ||
          err.kind === ERROR_KINDS.NETWORK
        ) {
          throw err;
        }
        // An upstream hiccup on one endpoint: the others may answer.
        logger.debug(`${logLabel(vehicle.info)}: ${endpoint} failed (${err.message})`);
        firstError ??= err;
        continue;
      }
      answered += 1;
      vehicle.worked.add(endpoint);
      Object.assign(changes, snapshotOf(endpoint, body));
    }
    if (answered === 0 && firstError) throw firstError;
    const seen = new Set(memory.seen ?? []);
    for (const field of OPTIONAL_FIELDS) if (changes[field] !== undefined) seen.add(field);
    memory.seen = [...seen].sort();
    if (JSON.stringify(memory.seen) !== seenBefore) store.touch();
    const first = !vehicle.readOnce;
    vehicle.readOnce = true;
    if (first || dropped || JSON.stringify(memory.seen) !== seenBefore) {
      await publishDevices().catch((err) =>
        logger.warn(`Publishing the devices failed: ${err.message}`),
      );
    }
    await applySnapshot(vehicle, changes);
    if (answered > 0) await setStatus(true);
  }

  async function safeRead(vehicle, options) {
    const label = `Reading ${logLabel(vehicle.info)}`;
    const failureKey = `read:${vehicle.info.vin}`;
    try {
      await readVehicle(vehicle, options);
    } catch (err) {
      // An outage is one failure, whatever the number of cars: one line.
      const outage = err.kind === ERROR_KINDS.NETWORK || err.kind === ERROR_KINDS.SERVER;
      await handleError(err, outage ? 'Reading the cars' : label, outage ? 'cloud' : failureKey);
      return;
    }
    logRecovery('cloud', 'The Škoda cloud answers again');
    cloudAnswered(failureKey, label);
  }

  function addVehicle(info) {
    const vehicle = {
      info,
      snapshot: {},
      disabled: new Set(),
      worked: new Set(),
      readOnce: false,
      lastReadAt: 0,
      lastSlowReadAt: 0,
      followUps: [], // [{ at, endpoints }]
      pending: new Map(), // feature key → { order, state, expect, at, until }
      lastCommand: null, // { key, order, at, outcome: 'sent' | 'confirmed' | 'unconfirmed' }
      ownStopAt: 0,
    };
    vehicles.set(info.vin, vehicle);
    return vehicle;
  }

  /** The account's cars and their capabilities; new ones appear in the Discovery screen. */
  async function discover() {
    lastListAttemptAt = now();
    const found = [];
    try {
      for (const entry of await client.garage()) {
        if (!entry?.vin) continue;
        let details = null;
        try {
          details = await client.info(entry.vin);
        } catch (err) {
          if (BLOCKING_KINDS.has(err.kind) || err.kind === ERROR_KINDS.RATE_LIMIT) throw err;
          if (err.kind === ERROR_KINDS.NETWORK) throw err;
          logger.debug(`Info of a car: ${err.message}`);
        }
        found.push(vehicleInfo(entry, details));
      }
      lastListAt = now();
    } catch (err) {
      await handleError(err, 'Listing the vehicles', 'list');
      return false;
    }
    cloudAnswered('list', 'Listing the vehicles');
    const seen = new Set();
    for (const info of found) {
      if (seen.has(info.vin)) continue;
      seen.add(info.vin);
      const existing = vehicles.get(info.vin);
      if (existing) {
        // An info that failed this time keeps the capabilities known before.
        existing.info = info.capabilities.size > 0 ? info : { ...info, ...existing.info };
        continue;
      }
      const vehicle = addVehicle(info);
      logger.info(
        `Vehicle found: ${logLabel(info)} (${info.modelCode ?? 'unknown model'}), reads ${
          activeReads(vehicle).join(', ') || 'nothing'
        }`,
      );
      await safeRead(vehicle);
      if (blocked) return false;
    }
    for (const vin of vehicles.keys()) if (!seen.has(vin)) vehicles.delete(vin);
    await publishDevices();
    if (found.length === 0) await setStatus(false, MESSAGES.noVehicle);
    else if (!failing.has('list')) await setStatus(true);
    return true;
  }

  async function connect() {
    try {
      await client.connect();
    } catch (err) {
      await handleError(err, 'Signing in', 'sign-in');
      return false;
    }
    cloudAnswered('sign-in', 'Signing in');
    return discover();
  }

  /** Calls of one read of every car: what the hourly budget is shared by. */
  const callsPerCycle = () =>
    [...vehicles.values()].reduce(
      (sum, vehicle) => sum + activeReads(vehicle, { slowDue: false }).length,
      0,
    );

  async function expirePending(vehicle) {
    if (![...vehicle.pending.values()].some((pending) => now() >= pending.until)) return;
    const before = widgetSignature(vehicle);
    settlePending(vehicle);
    await publishVehicle(vehicle);
    if (widgetSignature(vehicle) !== before) nudgeWidget(WIDGET_KEYS.VEHICLE);
  }

  async function tick() {
    if (!client || blocked || stopped) return;
    const t = now();
    if (t < backoffUntil) return;
    const listDue = vehicles.size === 0 || t - lastListAt >= VEHICLE_LIST_REFRESH_MS;
    // An account without a car (or an outage) is listed again every RETRY_MS.
    if (listDue && t - lastListAttemptAt >= RETRY_MS) {
      await discover();
      if (blocked) return;
    }
    const period = readPeriodMs(config, callsPerCycle());
    for (const vehicle of vehicles.values()) {
      if (blocked || stopped || now() < backoffUntil) return;
      await expirePending(vehicle);
      const due = vehicle.followUps.filter((followUp) => followUp.at <= t);
      if (t - vehicle.lastReadAt >= period) {
        vehicle.followUps = vehicle.followUps.filter((followUp) => followUp.at > t);
        await safeRead(vehicle);
      } else if (due.length > 0) {
        vehicle.followUps = vehicle.followUps.filter((followUp) => followUp.at > t);
        await safeRead(vehicle, { only: [...new Set(due.flatMap((f) => f.endpoints))] });
      }
    }
  }

  function startTicker() {
    stopTicker();
    if (!timers) return;
    ticker = setInterval(() => tick().catch((err) => logger.error('Refresh failed', err)), TICK_MS);
    ticker.unref?.();
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  // --- Commands --------------------------------------------------------------

  /** Whether the car offers an order (its capabilities). */
  function offers(vehicle, order) {
    const caps = capabilities(vehicle);
    switch (order) {
      case 'startCharging':
      case 'stopCharging':
        return caps.charging;
      case 'setChargeLimit':
        return caps.chargeLimit;
      case 'startClimate':
      case 'stopClimate':
      case 'setTargetTemperature':
        return caps.climate;
      case 'lock':
      case 'unlock':
        return caps.lock;
      default:
        return false;
    }
  }

  /**
   * Send an order. Resolves once the cloud accepted it: the car carries it out
   * later (the next reads tell). The requested value is held on `featureKey`.
   */
  async function sendOrder(vehicle, featureKey, order) {
    requireClient();
    const label = `${order.order} → ${logLabel(vehicle.info)}`;
    if (!offers(vehicle, order.order)) {
      // Gladys shows the value the user asked for: put the known one back.
      await publishVehicle(vehicle, { force: true });
      throw new UserError(
        order.order === 'lock' || order.order === 'unlock'
          ? MESSAGES.lockUnsupported
          : MESSAGES[ERROR_KINDS.NOT_SUPPORTED],
        ERROR_KINDS.NOT_SUPPORTED,
      );
    }
    const needsSpin = order.order === 'lock' || order.order === 'unlock';
    if (needsSpin) {
      if (!config.spin) throw new UserError(MESSAGES[ERROR_KINDS.SPIN_MISSING]);
      if (!validSpin(config.spin)) throw new UserError(MESSAGES.spinFormat);
      if (spinRefused) throw new UserError(MESSAGES[ERROR_KINDS.SPIN], ERROR_KINDS.SPIN);
    }
    // The log line names the order and its value, never the S-PIN.
    logger.info(`Command ${label}${order.args !== undefined ? ` (${order.args})` : ''}`);
    try {
      if (needsSpin) await client[order.order](vehicle.info.vin, config.spin);
      else await client[order.order](vehicle.info.vin, order.args);
    } catch (err) {
      await handleError(err, `Command ${label}`);
      await publishVehicle(vehicle, { force: true });
      throw userTextOf(err) ? new UserError(userTextOf(err), err.kind) : err;
    }
    const t = now();
    const [held] = vehicleStates({ ...vehicle.snapshot, ...order.expect }).filter(
      (state) => state.key === featureKey,
    );
    vehicle.pending.set(featureKey, {
      order: order.order,
      state: held ? (held.text !== undefined ? { text: held.text } : { value: held.value }) : {},
      expect: order.expect,
      at: t,
      until: t + PENDING_MS,
    });
    vehicle.lastCommand = { key: featureKey, order: order.order, at: t, outcome: 'sent' };
    if (order.order === 'stopCharging') vehicle.ownStopAt = t;
    vehicle.followUps.push(
      ...FOLLOW_UP_DELAYS_MS.map((delay) => ({
        at: t + delay,
        endpoints: ORDER_ENDPOINTS[order.order],
      })),
    );
    await publishVehicle(vehicle);
    nudgeWidget(WIDGET_KEYS.VEHICLE);
    return 'sent';
  }

  /** A command on a device feature. */
  function send(vehicle, featureKey, value) {
    const order = vehicleCommand(featureKey, value, vehicle.snapshot);
    if (!order) throw new Error(`${featureKey} is read-only`);
    return sendOrder(vehicle, featureKey, order);
  }

  // --- Public API ------------------------------------------------------------

  async function stop() {
    stopped = true;
    stopTicker();
    for (const entry of nudges.values()) clearTimeout(entry.timer);
    nudges.clear();
    client = null;
    await store.flush();
  }

  async function start(newConfig) {
    config = newConfig;
    stopped = false;
    blocked = null;
    spinRefused = false;
    failing.clear();
    statusSent = null;
    backoffUntil = 0;
    lastListAt = 0;
    lastListAttemptAt = 0;
    if (!isConfigured(config)) {
      client = null;
      await publishDevices({ force: true });
      await setStatus(false, MESSAGES.notConfigured);
      return;
    }
    const fingerprint = store.fingerprint(config);
    client = clientFactory(config, store.sessionStore(fingerprint));
    const ok = await connect();
    startTicker();
    if (ok) logger.info(`MySkoda: ${vehicles.size} vehicle(s)`);
  }

  async function restart(newConfig) {
    await stop();
    vehicles.clear();
    publishedDevicesJson = null;
    gladys.forgetPublishedStates();
    await start(newConfig);
    nudgeWidget(WIDGET_KEYS.VEHICLE);
  }

  const credentialsOf = (c) => JSON.stringify([c?.email, c?.password]);

  return {
    start,
    stop,
    tick,

    /** New configuration: sign in again when the account changed, else rebuild. */
    async reconfigure(newConfig) {
      if (!config || credentialsOf(newConfig) !== credentialsOf(config) || blocked || !client) {
        await restart(newConfig);
        return;
      }
      const gpsOff = config.gps && !newConfig.gps;
      // Saving the configuration again is how the user says "the S-PIN is fixed".
      spinRefused = false;
      config = newConfig;
      for (const vehicle of vehicles.values()) {
        if (gpsOff) {
          // The position is not kept once the user turned it off.
          delete vehicle.snapshot.latitude;
          delete vehicle.snapshot.longitude;
        }
      }
      await publishDevices();
      await publishAll();
      if (newConfig.gps)
        for (const vehicle of vehicles.values()) await safeRead(vehicle, { only: ['positions'] });
      nudgeWidget(WIDGET_KEYS.VEHICLE);
    },

    /** A status set from outside the runtime (index.js, failed start). */
    reportStatus(connected, message) {
      return setStatus(connected, message);
    },

    /** (Re)connected to Gladys: devices and every state again. */
    async resync() {
      statusSent = null;
      if (statusWanted) await setStatus(...statusWanted);
      await publishDevices({ force: true });
      await publishAll({ force: true });
      nudgeWidget(WIDGET_KEYS.VEHICLE);
    },

    async scan() {
      if (client && !blocked) await discover();
      else await publishDevices({ force: true });
    },

    /** Gladys created (or updated) a device: its states were dropped until now. */
    async deviceCreated(device) {
      const vehicle = findVehicle(device.external_id);
      if (vehicle) await publishVehicle(vehicle, { force: true });
      nudgeWidget(WIDGET_KEYS.VEHICLE);
    },

    /**
     * The core's poll: a fallback only, no device asks for it (the timer reads
     * the cloud). Never calls the cloud; publishes what changed.
     */
    async poll(device) {
      const vehicle = findVehicle(device.external_id);
      if (vehicle) await publishVehicle(vehicle);
    },

    /**
     * A user command from Gladys (dashboard, scene). Gladys acks a device
     * command within 5 s: past `deadlineMs` (a sign-in first), the command is
     * acknowledged and goes on in the background.
     */
    async setValue(device, feature, value, { deadlineMs } = {}) {
      const vehicle = findVehicle(device.external_id);
      if (!vehicle) throw new Error(`Unknown device ${device.external_id}`);
      const key = feature.external_id.slice(device.external_id.length + 1);
      const sending = send(vehicle, key, value);
      if (!deadlineMs) return sending.then(() => undefined);
      let timer;
      const late = new Promise((resolve) => {
        timer = setTimeout(() => resolve('late'), deadlineMs);
      });
      const first = await Promise.race([sending.then(() => 'sent'), late]).finally(() =>
        clearTimeout(timer),
      );
      if (first === 'late') {
        logger.info('The cloud is slow to accept the command: still running');
        sending.catch((err) => logger.error(`Command failed: ${err.message}`));
      }
      return undefined;
    },

    /** A command of the widget: resolves 'sent', throws a UserError. */
    order(deviceExternalId, featureKey, value) {
      return send(requireVehicle(deviceExternalId), featureKey, value);
    },

    /**
     * Lock or unlock a car (scene actions, widget). Needs the S-PIN; unlocking
     * also needs "Allow unlocking" in the configuration (off by default).
     */
    access(deviceExternalId, action) {
      const vehicle = requireVehicle(deviceExternalId);
      if (action === 'unlock' && !config?.allow_unlock) {
        throw new UserError(MESSAGES.unlockDisabled);
      }
      const locked = action === 'lock';
      return sendOrder(vehicle, VEHICLE_FEATURES.LOCKED, {
        order: locked ? 'lock' : 'unlock',
        expect: { locked },
      });
    },

    /** Read a car again now (scene action, widget button). Never wakes the car. */
    async refresh(deviceExternalId) {
      const vehicle = requireVehicle(deviceExternalId);
      requireClient();
      if (now() - vehicle.lastReadAt >= MANUAL_REFRESH_MIN_GAP_MS) {
        try {
          await readVehicle(vehicle);
        } catch (err) {
          await handleError(err, `Reading ${logLabel(vehicle.info)}`);
          throw userTextOf(err) ? new UserError(userTextOf(err), err.kind) : err;
        }
      }
      return vehicle.snapshot;
    },

    /**
     * Connection test (manifest action): resolves a short summary (green),
     * throws an ActionFailure for anything else (red). It tests the saved
     * configuration: the core sends no form with an action.
     */
    async testConnection() {
      if (!config) throw new ActionFailure(MESSAGES.starting);
      if (!isConfigured(config) || !client) throw new ActionFailure(MESSAGES.notSaved);
      let garage;
      try {
        await client.connect();
        garage = await client.garage();
      } catch (err) {
        logger.warn(`Connection test: ${err.message}`);
        if (BLOCKING_KINDS.has(err.kind)) await handleError(err, 'Connection test');
        throw new ActionFailure(failureText(err));
      }
      if (blocked) await restart(config);
      if (garage.length === 0) throw new ActionFailure(MESSAGES.noVehicle);
      const names = garage.map((entry) => vehicles.get(entry.vin)?.info ?? vehicleInfo(entry));
      const list = names.map(vehicleName).join(', ');
      const spin = config.spin
        ? {
            en: ' S-PIN saved.',
            fr: ' S-PIN enregistré.',
            de: ' S-PIN gespeichert.',
            es: ' S-PIN guardado.',
          }
        : {
            en: ' No S-PIN: locking unavailable.',
            fr: ' Pas de S-PIN : verrouillage indisponible.',
            de: ' Keine S-PIN: Verriegeln nicht möglich.',
            es: ' Sin S-PIN: bloqueo no disponible.',
          };
      return {
        en: `Connected: ${garage.length} vehicle(s) (${list}).${spin.en}`,
        fr: `Connecté : ${garage.length} véhicule(s) (${list}).${spin.fr}`,
        de: `Verbunden: ${garage.length} Fahrzeug(e) (${list}).${spin.de}`,
        es: `Conectado: ${garage.length} vehículo(s) (${list}).${spin.es}`,
      };
    },

    /**
     * S-PIN check (manifest action). A wrong S-PIN counts as a failed try on
     * the account: never repeated by the integration, and refused while the
     * saved S-PIN is the one the cloud already refused.
     */
    async checkSpin() {
      if (!config) throw new ActionFailure(MESSAGES.starting);
      if (!isConfigured(config) || !client) throw new ActionFailure(MESSAGES.notSaved);
      if (!config.spin) throw new ActionFailure(MESSAGES[ERROR_KINDS.SPIN_MISSING]);
      if (!validSpin(config.spin)) throw new ActionFailure(MESSAGES.spinFormat);
      if (spinRefused) throw new ActionFailure(MESSAGES[ERROR_KINDS.SPIN]);
      let result;
      try {
        result = await client.verifySpin(config.spin);
      } catch (err) {
        logger.warn(`S-PIN check: ${err.message}`);
        if (err.kind === ERROR_KINDS.SPIN) spinRefused = true;
        throw new ActionFailure(failureText(err));
      }
      if (result.correct) {
        logger.info('S-PIN check: correct');
        return MESSAGES.spinCorrect;
      }
      spinRefused = true;
      logger.warn('S-PIN check: refused, not sent again until saved');
      const tries = result.remainingTries ?? '?';
      throw new ActionFailure({
        en: `S-PIN refused, ${tries} try(ies) left before the S-PIN is locked. Correct it, then save.`,
        fr: `S-PIN refusé, ${tries} essai(s) restant(s) avant le blocage du S-PIN. Corrigez-le, puis enregistrez.`,
        de: `S-PIN abgelehnt, noch ${tries} Versuch(e) bis zur Sperre der S-PIN. Korrigiere sie und speichere dann.`,
        es: `S-PIN rechazado, quedan ${tries} intento(s) antes del bloqueo del S-PIN. Corríjalo y guarde.`,
      });
    },

    // Read access for the widget and the scene actions.
    vehicleView(deviceExternalId) {
      const vehicle = findVehicle(deviceExternalId);
      if (!vehicle) return null;
      const device = vehicleDevice(vehicle);
      return {
        device,
        created: createdDevice(device.external_id) ?? null,
        info: vehicle.info,
        caps: capabilities(vehicle),
        snapshot: vehicle.snapshot,
        pending: new Set(vehicle.pending.keys()),
        lastCommand: vehicle.lastCommand,
        issue: blocked,
        spin: Boolean(config?.spin) && !spinRefused,
      };
    },
    get blocked() {
      return blocked;
    },
    get spinRefused() {
      return spinRefused;
    },
    // Exposed for the tests.
    _vehicles: vehicles,
  };
}

export { VEHICLE_FEATURES };
