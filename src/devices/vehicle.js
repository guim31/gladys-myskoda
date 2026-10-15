// -----------------------------------------------------------------------------
// Device type: ŠKODA CAR.
//
// One Gladys device per car, keyed on the VIN (it never changes, unlike the
// plate or the name given in the app).
//
// The cloud gives the state in several endpoints (charging, air-conditioning,
// vehicle-status...), each read on its own. Their answers are folded into one
// canonical snapshot (km, °C, minutes, kW); the published states are derived
// from it. Field meanings from skodaconnect/myskoda (MIT, models/) and the
// Home Assistant integration homeassistant-myskoda.
//
// Which features a car gets depends on its capabilities (the `capabilities`
// of its info: CHARGING, AIR_CONDITIONING, STATE...) and, for the optional
// values, on what its answers contained: an Octavia iV gives no charging
// power, a Citigo e iV no charge limit. A value seen once keeps its feature
// (src/store.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from '../i18n.js';

export const VEHICLE_DEVICE_TYPE = 'vehicle';

// Feature keys: part of the external_id, frozen once published.
export const VEHICLE_FEATURES = {
  BATTERY_LEVEL: 'battery-level',
  RANGE: 'range',
  CHARGING_STATE: 'charging-state',
  PLUGGED: 'plugged',
  CHARGING: 'charging',
  CHARGE_POWER: 'charge-power',
  CHARGE_TIME_REMAINING: 'charge-time-remaining',
  CHARGE_LIMIT: 'charge-limit',
  CLIMATE: 'climate',
  TARGET_TEMPERATURE: 'target-temperature',
  OUTSIDE_TEMPERATURE: 'outside-temperature',
  LOCKED: 'locked',
  DOORS_OPEN: 'doors-open',
  TRUNK_OPEN: 'trunk-open',
  WINDOWS_OPEN: 'windows-open',
  FUEL_LEVEL: 'fuel-level',
  FUEL_RANGE: 'fuel-range',
  ODOMETER: 'odometer',
  POSITION: 'position',
};

// Charge session states, the Gladys `charging-station/charging-state` enum
// (OCPP values, translated by the Gladys front).
export const CHARGING_STATION_STATE = {
  CHARGING: 0,
  EV_CONNECTED: 1,
  PAUSED_BY_VEHICLE: 2,
  PAUSED_BY_CHARGER: 3,
  IDLE: 4,
  DISCHARGING: 5,
};

// Charge limits the app offers (Home Assistant: 50 to 100 % by 10).
export const CHARGE_LIMIT_MIN = 50;
export const CHARGE_LIMIT_MAX = 100;
// Climate temperatures the app accepts (Home Assistant: 15.5 to 30 °C, by 0.5).
export const CLIMATE_MIN_C = 15.5;
export const CLIMATE_MAX_C = 30;
export const DEFAULT_CLIMATE_C = 21;

// The cloud sometimes answers 429496729 km (Home Assistant ignores it).
const ODOMETER_MAX_KM = 400000000;
// Outside the bounds Home Assistant trusts, an outside temperature is a glitch.
const OUTSIDE_MIN_C = -50;
const OUTSIDE_MAX_C = 60;

export function vehicleIds(gladys, vin) {
  return gladys.externalIds(VEHICLE_DEVICE_TYPE, vin);
}

// --- The car ------------------------------------------------------------------

/** The capabilities a car offers now (an entry with a status is unavailable). */
export function availableCapabilities(info) {
  const list = info?.capabilities?.capabilities ?? [];
  return new Set(
    list
      .filter((c) => typeof c?.id === 'string' && (c.statuses ?? []).length === 0)
      .map((c) => c.id),
  );
}

/**
 * What the integration needs of a car: the garage entry and its info.
 * @param {object} entry entry of the garage ({ vin, name, title, systemModelId })
 * @param {object|null} details answer of the vehicle info endpoint
 */
export function vehicleInfo(entry, details = null) {
  const spec = details?.specification ?? {};
  const title = String(spec.title || entry.title || '').trim();
  const model = String(spec.model || entry.name || '').trim();
  const capabilities = availableCapabilities(details);
  return {
    vin: String(entry.vin),
    title: title || (model ? `Škoda ${model}` : 'Škoda'),
    model: model || title || 'Škoda',
    modelCode: spec.systemModelId || entry.systemModelId || undefined,
    registration: String(details?.licensePlate ?? '').trim() || null,
    // ACTIVATED, GUEST_USER, NOT_ACTIVATED: a guest has fewer rights.
    state: details?.state ?? entry.state ?? null,
    capabilities,
    electric: capabilities.has('CHARGING'),
  };
}

/** "Škoda Enyaq (AB-123-CD)", "Škoda Kamiq". */
export function vehicleName(info) {
  return info.registration ? `${info.title} (${info.registration})` : info.title;
}

/** A short label for the logs: the model and the end of the VIN, never the plate. */
export const logLabel = (info) => `${info.model} …${info.vin.slice(-4)}`;

// --- Reading -------------------------------------------------------------------

const num = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};
const time = (value) => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : undefined;
};
const upper = (value) => (typeof value === 'string' && value ? value.toUpperCase() : undefined);

/** OPEN → true, CLOSED → false, UNSUPPORTED / UNKNOWN / absent → undefined. */
function openState(value) {
  const state = upper(value);
  if (state === 'OPEN') return true;
  if (state === 'CLOSED') return false;
  return undefined;
}

/** Charge states that mean the cable is in (the car says CONNECT_CABLE otherwise). */
const PLUGGED_STATES = new Set([
  'READY_FOR_CHARGING',
  'CONSERVING',
  'CHARGING',
  'CHARGING_INTERRUPTED',
]);

/**
 * The snapshot fields of one endpoint's answer. Every field of the endpoint is
 * set (undefined when absent), so a value the car stopped sending is cleared.
 * @param {string} endpoint e.g. "charging"
 * @param {object} body the answer
 */
export function snapshotOf(endpoint, body = {}) {
  const a = body ?? {};
  switch (endpoint) {
    case 'charging': {
      const status = a.status ?? {};
      const battery = status.battery ?? {};
      const state = upper(status.state);
      const level = num(battery.stateOfChargeInPercent);
      const rangeM = num(battery.remainingCruisingRangeInMeters);
      return {
        chargingUpdatedAt: time(a.carCapturedTimestamp),
        batteryLevel: level === undefined ? undefined : Math.min(100, Math.max(0, level)),
        batteryRangeKm: rangeM === undefined ? undefined : rangeM / 1000,
        chargeState: state,
        charging: state === undefined || state === 'ERROR' ? undefined : state === 'CHARGING',
        chargePlugged:
          state === 'CONNECT_CABLE' ? false : PLUGGED_STATES.has(state) ? true : undefined,
        chargePowerKw: num(status.chargePowerInKw),
        chargeRemainingMin: num(status.remainingTimeToFullyChargedInMinutes),
        chargeLimit: num(a.settings?.targetStateOfChargeInPercent),
      };
    }
    case 'air-conditioning': {
      const state = upper(a.state);
      const outside = num(a.outsideTemperature?.temperatureValue);
      const connection = upper(a.chargerConnectionState);
      return {
        climateUpdatedAt: time(a.carCapturedTimestamp),
        climateOn: state === undefined || state === 'INVALID' ? undefined : state !== 'OFF',
        targetTempC: num(a.targetTemperature?.temperatureValue),
        outsideTempC:
          outside !== undefined && outside > OUTSIDE_MIN_C && outside < OUTSIDE_MAX_C
            ? outside
            : undefined,
        cablePlugged:
          connection === 'CONNECTED' ? true : connection === 'DISCONNECTED' ? false : undefined,
      };
    }
    case 'status': {
      const overall = a.overall ?? {};
      const detail = a.detail ?? {};
      const locked = upper(overall.locked);
      const windows = openState(overall.windows);
      const sunroof = openState(detail.sunroof);
      return {
        statusUpdatedAt: time(a.carCapturedTimestamp),
        // YES = locked; NO, OPENED (a door open), TRUNK_OPENED = not locked.
        locked:
          locked === 'YES'
            ? true
            : ['NO', 'OPENED', 'TRUNK_OPENED'].includes(locked)
              ? false
              : undefined,
        doorsOpen: openState(overall.doors),
        trunkOpen: openState(detail.trunk),
        windowsOpen:
          windows === undefined && sunroof === undefined
            ? undefined
            : windows === true || sunroof === true,
      };
    }
    case 'driving-range': {
      const engines = [a.primaryEngineRange, a.secondaryEngineRange].filter(Boolean);
      const electric = engines.find((e) => String(e.engineType).toLowerCase() === 'electric');
      const fuel = engines.find((e) => String(e.engineType).toLowerCase() !== 'electric');
      const level = num(fuel?.currentFuelLevelInPercent ?? fuel?.currentSoCInPercent);
      return {
        electricRangeKm: num(electric?.remainingRangeInKm),
        fuelRangeKm: num(fuel?.remainingRangeInKm),
        fuelLevel: level === undefined ? undefined : Math.min(100, Math.max(0, level)),
      };
    }
    case 'maintenance': {
      const km = num(a.maintenanceReport?.mileageInKm);
      return { odometerKm: km !== undefined && km >= 0 && km < ODOMETER_MAX_KM ? km : undefined };
    }
    case 'positions': {
      const vehicle = (a.positions ?? []).find((p) => upper(p?.type) === 'VEHICLE');
      const latitude = num(vehicle?.gpsCoordinates?.latitude);
      const longitude = num(vehicle?.gpsCoordinates?.longitude);
      const valid =
        latitude !== undefined &&
        longitude !== undefined &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180;
      return {
        latitude: valid ? latitude : undefined,
        longitude: valid ? longitude : undefined,
      };
    }
    default:
      return {};
  }
}

// Snapshot fields whose presence decides an optional feature.
export const OPTIONAL_FIELDS = [
  'chargePowerKw',
  'chargeRemainingMin',
  'chargeLimit',
  'targetTempC',
  'outsideTempC',
  'locked',
  'doorsOpen',
  'trunkOpen',
  'windowsOpen',
  'fuelLevel',
  'fuelRangeKm',
  'odometerKm',
];

/** Plugged in: the cable sensor of the climate answer first (Home Assistant). */
export const pluggedOf = (snapshot) => snapshot.cablePlugged ?? snapshot.chargePlugged;

/** The electric range: the driving-range answer first, else the battery's. */
export const rangeOf = (snapshot) => snapshot.electricRangeKm ?? snapshot.batteryRangeKm;

/** Charge session state of the snapshot (null when unknown). */
export function chargingStationState(snapshot) {
  const plugged = pluggedOf(snapshot);
  if (snapshot.charging === true) return CHARGING_STATION_STATE.CHARGING;
  if (plugged === false) return CHARGING_STATION_STATE.IDLE;
  if (plugged === true) {
    // Target reached, the car holds the battery there.
    if (snapshot.chargeState === 'CONSERVING') return CHARGING_STATION_STATE.PAUSED_BY_VEHICLE;
    // Interrupted by the charger (no current).
    if (snapshot.chargeState === 'CHARGING_INTERRUPTED') {
      return CHARGING_STATION_STATE.PAUSED_BY_CHARGER;
    }
    return CHARGING_STATION_STATE.EV_CONNECTED;
  }
  return null;
}

// --- Publishing ----------------------------------------------------------------

/**
 * The discovery payload of one car.
 * @param {object} gladys SDK instance
 * @param {object} info vehicleInfo()
 * @param {object} caps what the car offers (src/myskoda.js capabilities())
 * @param {{ language: string }} options
 */
export function buildVehicleDevice(gladys, info, caps, { language }) {
  const ids = vehicleIds(gladys, info.vin);
  const seen = caps.seen ?? new Set();
  const feature = (key, name, category, type, extra) => ({
    name: t(language, name),
    external_id: ids.feature(key),
    category,
    type,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: 1,
    ...extra,
  });
  // A command whose effect the next reads report.
  const command = { read_only: false, has_feedback: true };
  const features = [];
  const F = VEHICLE_FEATURES;

  if (caps.charging) {
    features.push(
      feature(
        F.BATTERY_LEVEL,
        'batteryLevel',
        CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
        TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_LEVEL,
        { unit: UNITS.PERCENT, max: 100 },
      ),
      feature(
        F.RANGE,
        'range',
        CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
        TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_RANGE_ESTIMATE,
        { unit: UNITS.KM, max: 1000 },
      ),
      feature(
        F.CHARGING_STATE,
        'chargingState',
        CATEGORIES.CHARGING_STATION,
        TYPES.CHARGING_STATION.CHARGING_STATE,
        { max: 5 },
      ),
      feature(
        F.PLUGGED,
        'plugged',
        CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
        TYPES.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
      ),
      feature(
        F.CHARGING,
        'charging',
        CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
        TYPES.ELECTRICAL_VEHICLE_CHARGE.CHARGE_ON,
        command,
      ),
    );
    if (seen.has('chargePowerKw')) {
      features.push(
        feature(
          F.CHARGE_POWER,
          'chargePower',
          CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
          TYPES.ELECTRICAL_VEHICLE_CHARGE.CHARGE_POWER,
          { unit: UNITS.KILOWATT, max: 300 },
        ),
      );
    }
    if (seen.has('chargeRemainingMin')) {
      features.push(
        feature(
          F.CHARGE_TIME_REMAINING,
          'chargeTimeRemaining',
          CATEGORIES.DURATION,
          TYPES.DURATION.INTEGER,
          { unit: UNITS.MINUTES, max: 3000 },
        ),
      );
    }
    if (caps.chargeLimit && seen.has('chargeLimit')) {
      features.push(
        feature(
          F.CHARGE_LIMIT,
          'chargeLimit',
          CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
          TYPES.ELECTRICAL_VEHICLE_CHARGE.TARGET_CHARGE_LIMIT,
          {
            ...command,
            // A setting, not history worth keeping.
            keep_history: false,
            unit: UNITS.PERCENT,
            min: CHARGE_LIMIT_MIN,
            max: CHARGE_LIMIT_MAX,
          },
        ),
      );
    }
  }
  if (caps.climate) {
    features.push(
      feature(
        F.CLIMATE,
        'climate',
        CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
        TYPES.ELECTRICAL_VEHICLE_CLIMATE.CLIMATE_ON,
        command,
      ),
    );
    if (seen.has('targetTempC')) {
      features.push(
        feature(
          F.TARGET_TEMPERATURE,
          'targetTemperature',
          CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
          TYPES.ELECTRICAL_VEHICLE_CLIMATE.TARGET_TEMPERATURE,
          {
            ...command,
            keep_history: false,
            unit: UNITS.CELSIUS,
            min: CLIMATE_MIN_C,
            max: CLIMATE_MAX_C,
          },
        ),
      );
    }
  }
  if (caps.outside && seen.has('outsideTempC')) {
    features.push(
      feature(
        F.OUTSIDE_TEMPERATURE,
        'outsideTemperature',
        CATEGORIES.TEMPERATURE_SENSOR,
        TYPES.SENSOR.DECIMAL,
        { unit: UNITS.CELSIUS, min: OUTSIDE_MIN_C, max: OUTSIDE_MAX_C },
      ),
    );
  }
  if (caps.state) {
    if (seen.has('locked')) {
      // 1 = locked (the lock icon of the Gladys front). Read only: locking
      // goes through a scene action, unlocking is off by default.
      features.push(feature(F.LOCKED, 'locked', CATEGORIES.LOCK, TYPES.LOCK.BINARY));
    }
    // 1 = open, unlike `opening-sensor` (0 = open): the vehicle types say "opened".
    const opened = [
      [F.DOORS_OPEN, 'doorsOpen', 'doorsOpen'],
      [F.TRUNK_OPEN, 'trunkOpen', 'trunkOpen'],
    ];
    for (const [key, name, field] of opened) {
      if (seen.has(field)) {
        features.push(
          feature(
            key,
            name,
            CATEGORIES.ELECTRICAL_VEHICLE_STATE,
            TYPES.ELECTRICAL_VEHICLE_STATE.DOOR_OPENED,
          ),
        );
      }
    }
    if (seen.has('windowsOpen')) {
      features.push(
        feature(
          F.WINDOWS_OPEN,
          'windowsOpen',
          CATEGORIES.ELECTRICAL_VEHICLE_STATE,
          TYPES.ELECTRICAL_VEHICLE_STATE.WINDOW_OPENED,
        ),
      );
    }
    if (seen.has('fuelLevel')) {
      features.push(
        feature(
          F.FUEL_LEVEL,
          'fuelLevel',
          CATEGORIES.LEVEL_SENSOR,
          TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
          { unit: UNITS.PERCENT, max: 100 },
        ),
      );
    }
    if (seen.has('fuelRangeKm')) {
      features.push(
        feature(F.FUEL_RANGE, 'fuelRange', CATEGORIES.DISTANCE_SENSOR, TYPES.SENSOR.DECIMAL, {
          unit: UNITS.KM,
          max: 2000,
        }),
      );
    }
  }
  if (seen.has('odometerKm')) {
    features.push(
      feature(
        F.ODOMETER,
        'odometer',
        CATEGORIES.ELECTRICAL_VEHICLE_STATE,
        TYPES.ELECTRICAL_VEHICLE_STATE.ODOMETER,
        { unit: UNITS.KM, max: 2000000 },
      ),
    );
  }
  if (caps.position) {
    features.push(
      feature(F.POSITION, 'position', CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
        keep_history: false,
        max: 0,
      }),
    );
  }
  return {
    name: vehicleName(info),
    external_id: ids.device,
    // The runtime keeps its own pace (src/myskoda.js): the core never polls it.
    should_poll: false,
    model: info.title,
    features,
  };
}

const round = (value, decimals = 0) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
const binary = (value) => (value === true ? 1 : value === false ? 0 : null);

/** "50.10100, 14.40100" (about one metre). */
export const positionText = (snapshot) =>
  Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude)
    ? `${snapshot.latitude.toFixed(5)}, ${snapshot.longitude.toFixed(5)}`
    : null;

/**
 * States of one car, from its snapshot.
 * @param {object} snapshot canonical snapshot
 * @returns {Array<{ key: string, value?: number, text?: string }>} only the known values
 */
export function vehicleStates(snapshot) {
  const F = VEHICLE_FEATURES;
  // Stale estimates once the charge is over mean nothing.
  const whileCharging = (value) => (snapshot.charging === false ? 0 : value);
  const values = [
    [F.BATTERY_LEVEL, round(snapshot.batteryLevel)],
    [F.RANGE, round(rangeOf(snapshot))],
    [F.CHARGING_STATE, chargingStationState(snapshot)],
    [F.PLUGGED, binary(pluggedOf(snapshot))],
    [F.CHARGING, binary(snapshot.charging)],
    [F.CHARGE_POWER, whileCharging(round(snapshot.chargePowerKw, 1))],
    [F.CHARGE_TIME_REMAINING, whileCharging(round(snapshot.chargeRemainingMin))],
    [F.CHARGE_LIMIT, round(snapshot.chargeLimit)],
    [F.CLIMATE, binary(snapshot.climateOn)],
    [F.TARGET_TEMPERATURE, round(snapshot.targetTempC, 1)],
    [F.OUTSIDE_TEMPERATURE, round(snapshot.outsideTempC, 1)],
    [F.LOCKED, binary(snapshot.locked)],
    [F.DOORS_OPEN, binary(snapshot.doorsOpen)],
    [F.TRUNK_OPEN, binary(snapshot.trunkOpen)],
    [F.WINDOWS_OPEN, binary(snapshot.windowsOpen)],
    [F.FUEL_LEVEL, round(snapshot.fuelLevel)],
    [F.FUEL_RANGE, round(snapshot.fuelRangeKm)],
    [F.ODOMETER, round(snapshot.odometerKm)],
  ];
  const states = values
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({ key, value }));
  const position = positionText(snapshot);
  if (position) states.push({ key: F.POSITION, text: position });
  return states;
}

// --- Commands ------------------------------------------------------------------

function finite(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (String(value ?? '').trim() === '' || !Number.isFinite(n)) throw new Error('Not a number');
  return n;
}

/** A climate temperature the app accepts: 15.5 to 30 °C, by half degrees. */
export function climateTemperature(value) {
  const n = Math.round(finite(value) * 2) / 2;
  return Math.min(CLIMATE_MAX_C, Math.max(CLIMATE_MIN_C, n));
}

/** A charge limit the app accepts: 50 to 100 %, by tens. */
export function chargeLimit(value) {
  const n = Math.round(finite(value) / 10) * 10;
  return Math.min(CHARGE_LIMIT_MAX, Math.max(CHARGE_LIMIT_MIN, n));
}

/**
 * Translate a Gladys command into a cloud order.
 * @param {string} featureKey
 * @param {number|string} value
 * @param {object} snapshot current snapshot (for the climate temperature)
 * @returns {{ order: string, args?: number, expect: object } | null}
 *   `expect`: the snapshot fields the car should report once it did it
 */
export function vehicleCommand(featureKey, value, snapshot = {}) {
  const on = Number(value) === 1;
  switch (featureKey) {
    case VEHICLE_FEATURES.CHARGING:
      return on
        ? { order: 'startCharging', expect: { charging: true } }
        : { order: 'stopCharging', expect: { charging: false } };
    case VEHICLE_FEATURES.CLIMATE:
      return on
        ? {
            order: 'startClimate',
            args: climateTemperature(snapshot.targetTempC ?? DEFAULT_CLIMATE_C),
            expect: { climateOn: true },
          }
        : { order: 'stopClimate', expect: { climateOn: false } };
    case VEHICLE_FEATURES.TARGET_TEMPERATURE: {
      const celsius = climateTemperature(value);
      return { order: 'setTargetTemperature', args: celsius, expect: { targetTempC: celsius } };
    }
    case VEHICLE_FEATURES.CHARGE_LIMIT: {
      const percent = chargeLimit(value);
      return { order: 'setChargeLimit', args: percent, expect: { chargeLimit: percent } };
    }
    default:
      return null;
  }
}
