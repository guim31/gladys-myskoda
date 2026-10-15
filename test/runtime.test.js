// -----------------------------------------------------------------------------
// The runtime against the SDK's fake Gladys and the fake Škoda cloud: reads
// on the container's own timer, publication, commands and their honest
// outcome, the "charge finished" trigger, quotas, outages, the sign-in and its
// refusals, the S-PIN, and calm logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, T0, createWorld } from './helpers/world.js';
import { EMAIL, PASSWORD, SPIN, VINS, fixture } from './helpers/fakeSkoda.js';
import { MESSAGES } from '../src/messages.js';
import { createMemoryStore } from '../src/store.js';

const HOUR = 60 * MINUTE;
const ENYAQ_ONLY = { cars: [VINS.ENYAQ] };
const CREDENTIALS = { email: EMAIL, password: PASSWORD, spin: SPIN };

/** The created device and one of its features, as Gladys passes them to onSetValue. */
function target(world, vin, key) {
  const device = world.gladys.devices.find((d) => d.external_id.endsWith(`:${vin}`));
  const feature = device.features.find((f) => f.external_id.endsWith(`:${key}`));
  return [device, feature];
}

const statesOf = (world, vin, key) =>
  world.fake.states.filter((s) => s.device_feature_external_id === world.feature(vin, key));

/** A charging answer of the Enyaq with other values. */
function charging(status, at = T0 + MINUTE) {
  const body = structuredClone(fixture('enyaq/charging'));
  Object.assign(body.status, status);
  body.carCapturedTimestamp = new Date(at).toISOString();
  return body;
}

test('without credentials: nothing discovered, the status says what to enter', async () => {
  const world = await createWorld({ config: { email: '', password: '' } });
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.notConfigured,
  });
  assert.equal(world.skoda.calls.length, 0);
  await world.stop();
});

test('start: one sign-in, every car discovered, no state before the car is added', async () => {
  const world = await createWorld();
  assert.equal(world.skoda.signInCount, 1);
  assert.equal(world.fake.discoveredDevices.length, 8);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  // Gladys drops the states of a device it does not know.
  assert.equal(world.fake.states.length, 0);
  await world.createAll();
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'battery-level')), 37);
  assert.equal(world.fake.lastState(world.feature(VINS.KODIAQ_PHEV, 'charging')), 1);
  assert.equal(world.fake.lastState(world.feature(VINS.KAMIQ, 'fuel-level')), 90);
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'locked')), 1);
  // The widget is told to bind to the new features.
  assert.ok(world.fake.widgetRefreshes.length > 0);
  // The session is kept, never the password.
  assert.ok(world.store.data.session.refreshToken);
  assert.ok(!JSON.stringify(world.store.data).includes(PASSWORD));
  await world.stop();
});

test('the timer reads the cloud by itself: states reach Gladys without any core poll', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  const calls = world.skoda.carCalls().length;
  world.skoda.data[VINS.ENYAQ].charging = charging({ battery: { stateOfChargeInPercent: 36 } });

  await world.tick(29 * MINUTE);
  assert.equal(world.skoda.carCalls().length, calls, 'nothing before the 30 minutes');
  await world.tick(MINUTE);
  // Charging, climate, status, driving range; the mileage waits for its hour.
  assert.deepEqual(
    world.skoda
      .carCalls()
      .slice(calls)
      .map((c) => c.endpoint),
    ['charging', 'air-conditioning', 'status', 'driving-range'],
  );
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'battery-level')), 36);
  await world.tick(30 * MINUTE);
  assert.equal(world.skoda.carCalls().at(-1).endpoint, 'maintenance', 'hourly');
  // No poll ever came from the core.
  assert.equal(world.fake.wsMessages.filter((m) => m.type?.includes('poll')).length, 0);
  await world.stop();
});

test("the core's poll is a fallback: no cloud call, only what changed", async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  const calls = world.skoda.calls.length;
  const states = world.fake.states.length;
  const [device] = target(world, VINS.ENYAQ, 'battery-level');
  assert.deepEqual(await world.fake.poll(device), { success: true });
  assert.equal(world.skoda.calls.length, calls);
  assert.equal(world.fake.states.length, states);
  await world.stop();
});

test('only the changes are published, and a stable value again twice a day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: T0 });
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  const published = world.fake.states.length;
  await world.tick(30 * MINUTE);
  assert.equal(world.fake.states.length, published, 'nothing changed, nothing sent');

  t.mock.timers.tick(12 * HOUR);
  await world.tick(12 * HOUR);
  assert.equal(statesOf(world, VINS.ENYAQ, 'odometer').length, 2, 'sent again after 12 h');
  await world.stop();
});

test('many cars stretch the reads to stay under 30 calls an hour', async () => {
  const world = await createWorld();
  await world.createAll();
  // 30 calls a cycle (without the hourly mileage) for the nine cars: one read an hour.
  const calls = world.skoda.carCalls().length;
  await world.tick(59 * MINUTE);
  assert.equal(world.skoda.carCalls().length, calls);
  await world.tick(MINUTE);
  assert.ok(world.skoda.carCalls().length > calls);
  await world.stop();
});

test('an endpoint the car refuses at first is dropped, a later refusal is not', async () => {
  const first = await createWorld({ cars: [VINS.KAMIQ], connect: false });
  first.skoda.fail(VINS.KAMIQ, 'air-conditioning', 403);
  await first.gladys.connect();
  await first.tick(30 * MINUTE);
  assert.equal(
    first.skoda.carCalls().filter((c) => c.endpoint === 'air-conditioning').length,
    1,
    'never asked again',
  );
  await first.stop();

  const world = await createWorld({ cars: [VINS.ENYAQ] });
  world.skoda.fail(VINS.ENYAQ, 'air-conditioning', 403);
  await world.tick(30 * MINUTE);
  world.skoda.heal(VINS.ENYAQ, 'air-conditioning');
  await world.tick(30 * MINUTE);
  assert.equal(world.skoda.carCalls().filter((c) => c.endpoint === 'air-conditioning').length, 3);
  assert.ok(world.device(VINS.ENYAQ).features.some((f) => f.external_id.endsWith(':climate')));
  await world.stop();
});

test('starting the climate: accepted by the cloud, held until the car reports it', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  const ack = await world.fake.setValue(...target(world, VINS.ENYAQ, 'climate'), 1);
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(world.skoda.actions.at(-1), {
    vin: VINS.ENYAQ,
    action: 'air-conditioning/start',
    method: 'POST',
    body: {
      heaterSource: 'ELECTRIC',
      targetTemperature: { temperatureValue: 21, unitInCar: 'CELSIUS' },
    },
  });
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'climate')), 1);

  // Two minutes later, a follow-up read of the climate: still the old state.
  const before = world.skoda.carCalls().length;
  await world.tick(2 * MINUTE);
  assert.deepEqual(
    world.skoda
      .carCalls()
      .slice(before)
      .map((c) => c.endpoint),
    ['air-conditioning'],
  );
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'climate')), 1, 'still held');

  // The car reports it.
  const ac = structuredClone(fixture('enyaq/air-conditioning'));
  ac.state = 'HEATING';
  ac.carCapturedTimestamp = new Date(T0 + 3 * MINUTE).toISOString();
  world.skoda.data[VINS.ENYAQ]['air-conditioning'] = ac;
  await world.tick(4 * MINUTE);
  const view = world.runtime.vehicleView(world.device(VINS.ENYAQ).external_id);
  assert.equal(view.pending.size, 0);
  assert.equal(view.lastCommand.outcome, 'confirmed');
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'climate')), 1);
  await world.stop();
});

test('a command the car never reports: the real state comes back after 10 minutes', async () => {
  const world = await createWorld({ cars: [VINS.ENYAQ_PLUGGED] });
  await world.createAll();
  await world.fake.setValue(...target(world, VINS.ENYAQ_PLUGGED, 'charging'), 1);
  assert.equal(world.skoda.actions.at(-1).action, 'charging/start');
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ_PLUGGED, 'charging')), 1);
  for (let i = 0; i < 10; i += 1) await world.tick(MINUTE);
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ_PLUGGED, 'charging')), 0);
  const view = world.runtime.vehicleView(world.device(VINS.ENYAQ_PLUGGED).external_id);
  assert.equal(view.lastCommand.outcome, 'unconfirmed');
  assert.ok(world.logger.lines.info.some((l) => /startCharging not reported by the car/.test(l)));
  await world.stop();
});

test('charge limit and climate temperature: rounded the way the app does', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  await world.fake.setValue(...target(world, VINS.ENYAQ, 'charge-limit'), 87);
  assert.deepEqual(world.skoda.actions.at(-1).body, { targetSOCInPercent: 90 });
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'charge-limit')), 90);
  await world.fake.setValue(...target(world, VINS.ENYAQ, 'target-temperature'), 19.7);
  assert.deepEqual(world.skoda.actions.at(-1).body, {
    temperatureValue: 19.5,
    unitInCar: 'CELSIUS',
  });
  await world.stop();
});

test('a command refused by the cloud: red ack, the known state put back', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  world.skoda.fail(VINS.ENYAQ, 'air-conditioning/start', 403);
  const before = statesOf(world, VINS.ENYAQ, 'climate').length;
  const ack = await world.fake.setValue(...target(world, VINS.ENYAQ, 'climate'), 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /refused this command/);
  // Sent again (forced), so the dashboard toggle goes back to off.
  assert.equal(statesOf(world, VINS.ENYAQ, 'climate').length, before + 1);
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'climate')), 0);
  await world.stop();
});

test('a car without the charge limit refuses the command, nothing sent', async () => {
  const world = await createWorld({ cars: [VINS.OCTAVIA_PHEV] });
  await world.createAll();
  assert.ok(
    !world.device(VINS.OCTAVIA_PHEV).features.some((f) => f.external_id.endsWith(':charge-limit')),
  );
  await assert.rejects(
    world.runtime.order(world.device(VINS.OCTAVIA_PHEV).external_id, 'charge-limit', 80),
    { text: MESSAGES['not-supported'] },
  );
  assert.equal(world.skoda.actions.length, 0);
  await world.stop();
});

test('"charge finished": fired when the car stops charging, still plugged in', async () => {
  const world = await createWorld({ cars: [VINS.KODIAQ_PHEV] });
  await world.createAll();
  const body = structuredClone(fixture('kodiaq-phev/charging'));
  body.status.state = 'CONSERVING';
  body.status.battery.stateOfChargeInPercent = 80;
  world.skoda.data[VINS.KODIAQ_PHEV].charging = body;
  await world.tick(30 * MINUTE);
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'charge_finished',
      data: {
        device: world.device(VINS.KODIAQ_PHEV).external_id,
        battery_level: 80,
        range_km: 15,
      },
    },
  ]);
  assert.equal(world.fake.lastState(world.feature(VINS.KODIAQ_PHEV, 'charging-state')), 2);
  // Unplugged afterwards: nothing more.
  body.status.state = 'CONNECT_CABLE';
  world.skoda.data[VINS.KODIAQ_PHEV]['air-conditioning'].chargerConnectionState = 'DISCONNECTED';
  await world.tick(30 * MINUTE);
  assert.equal(world.fake.sceneEvents.length, 1);
  await world.stop();
});

test('a charge stopped from Gladys is no "charge finished"', async () => {
  const world = await createWorld({ cars: [VINS.KODIAQ_PHEV] });
  await world.createAll();
  await world.fake.setValue(...target(world, VINS.KODIAQ_PHEV, 'charging'), 0);
  const body = structuredClone(fixture('kodiaq-phev/charging'));
  body.status.state = 'READY_FOR_CHARGING';
  body.carCapturedTimestamp = new Date(T0 + MINUTE).toISOString();
  world.skoda.data[VINS.KODIAQ_PHEV].charging = body;
  await world.tick(2 * MINUTE);
  assert.equal(world.fake.lastState(world.feature(VINS.KODIAQ_PHEV, 'charging')), 0);
  assert.deepEqual(world.fake.sceneEvents, []);
  await world.stop();
});

test('too many requests (429): the reads pause for 30 minutes, logged once', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  world.skoda.fail(VINS.ENYAQ, 'charging', 429);
  await world.tick(30 * MINUTE);
  const calls = world.skoda.carCalls().length;
  await world.tick(29 * MINUTE);
  assert.equal(world.skoda.carCalls().length, calls, 'paused');
  world.skoda.heal(VINS.ENYAQ, 'charging');
  await world.tick(MINUTE);
  assert.ok(world.skoda.carCalls().length > calls, 'resumed');
  assert.equal(world.logger.lines.warn.filter((l) => /429/.test(l)).length, 1);
  assert.ok(world.logger.lines.info.some((l) => /accepts requests again/.test(l)));
  await world.stop();
});

test('a cloud outage: one warning, the status follows, one line when it is over', async () => {
  const world = await createWorld();
  await world.createAll();
  world.skoda.network = false;
  for (let i = 0; i < 4; i += 1) await world.tick(HOUR);
  assert.equal(world.logger.lines.warn.length, 1);
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.unreachable,
  });
  world.skoda.network = true;
  await world.tick(HOUR);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    world.logger.lines.info.filter((l) => /again/.test(l)),
    ['The Škoda cloud answers again'],
  );
  await world.stop();
});

test('a refused password: no new sign-in until the configuration is saved again', async () => {
  const world = await createWorld({ ...ENYAQ_ONLY, config: { password: 'wrong password' } });
  assert.equal(world.runtime.blocked, 'auth');
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: MESSAGES.auth });
  for (let i = 0; i < 5; i += 1) await world.tick(30 * MINUTE);
  assert.equal(world.skoda.signInCount, 1);

  await world.fake.configUpdated(CREDENTIALS);
  assert.equal(world.runtime.blocked, null);
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  await world.stop();
});

test('an e-mail address Škoda does not know: said in the status, no retry', async () => {
  const world = await createWorld({ ...ENYAQ_ONLY, config: { email: 'nobody@example.com' } });
  assert.equal(world.runtime.blocked, 'unknown-account');
  assert.deepEqual(world.fake.connectionStatus, {
    connected: false,
    message: MESSAGES['unknown-account'],
  });
  for (let i = 0; i < 3; i += 1) await world.tick(HOUR);
  assert.equal(world.skoda.passwordsPosted, 0, 'the password never left');
  assert.equal(world.skoda.calls.filter((c) => c.path === '/oidc/v1/authorize').length, 1);
  const ack = await world.fake.action('test_connection', {});
  assert.deepEqual(ack, { success: false, error: MESSAGES['unknown-account'] });
  await world.stop();
});

test('new terms to accept in the app: said in the status, no retry', async () => {
  const world = await createWorld({ ...ENYAQ_ONLY, connect: false });
  world.skoda.signInOutcome = 'terms';
  await world.gladys.connect();
  assert.equal(world.runtime.blocked, 'consent');
  assert.deepEqual(world.fake.connectionStatus.message, MESSAGES.consent);
  await world.tick(HOUR);
  assert.equal(world.skoda.signInCount, 1);
  await world.stop();
});

test('a saved session is reused after a restart: no password sign-in', async () => {
  const store = createMemoryStore();
  const first = await createWorld({ ...ENYAQ_ONLY, store });
  await first.stop();
  const second = await createWorld({ ...ENYAQ_ONLY, store, cloud: first.skoda });
  assert.equal(first.skoda.signInCount, 1);
  assert.equal(second.fake.discoveredDevices.length, 1);
  await second.stop();

  // Another account in the configuration drops the saved session.
  first.skoda.password = 'new password';
  const third = await createWorld({
    ...ENYAQ_ONLY,
    store,
    cloud: first.skoda,
    config: { password: 'new password' },
  });
  assert.equal(first.skoda.signInCount, 2);
  assert.equal(third.runtime.blocked, null);
  await third.stop();
});

test('locking: with the S-PIN, held until the car reports it', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ] });
  await world.createAll();
  const device = world.device(VINS.KAMIQ).external_id;
  const ack = await world.fake.sceneAction('lock_vehicle', { device });
  assert.equal(ack.success, true);
  assert.deepEqual(world.skoda.actions.at(-1), {
    vin: VINS.KAMIQ,
    action: 'vehicle-access/lock',
    method: 'POST',
    body: { currentSpin: SPIN },
  });
  assert.ok(world.logger.lines.info.some((l) => /Command lock → Kamiq …0007$/.test(l)));
  await world.stop();
});

test('unlocking is off by default; on, it needs the S-PIN', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ] });
  await world.createAll();
  const device = world.device(VINS.KAMIQ).external_id;
  const ack = await world.fake.sceneAction('unlock_vehicle', { device });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unlocking is off/);
  assert.equal(world.skoda.actions.length, 0, 'nothing sent');

  await world.fake.configUpdated({ ...CREDENTIALS, allow_unlock: true });
  const done = await world.fake.sceneAction('unlock_vehicle', { device });
  assert.equal(done.success, true);
  assert.equal(world.skoda.actions.at(-1).action, 'vehicle-access/unlock');
  await world.stop();
});

test('a refused S-PIN is never sent again until the configuration is saved', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ], config: { spin: '1357' } });
  await world.createAll();
  const device = world.device(VINS.KAMIQ).external_id;
  let ack = await world.fake.sceneAction('lock_vehicle', { device });
  assert.equal(ack.success, false);
  assert.equal(world.runtime.spinRefused, true);
  const lockCalls = () => world.skoda.calls.filter((c) => c.path.endsWith('/lock')).length;
  assert.equal(lockCalls(), 1);
  ack = await world.fake.sceneAction('lock_vehicle', { device });
  assert.match(ack.error, /S-PIN was refused/);
  assert.equal(lockCalls(), 1, 'not sent again');
  assert.deepEqual(await world.fake.action('check_spin', {}), {
    success: false,
    error: MESSAGES.spin,
  });

  await world.fake.configUpdated(CREDENTIALS);
  assert.equal(world.runtime.spinRefused, false);
  ack = await world.fake.sceneAction('lock_vehicle', { device });
  assert.equal(ack.success, true);
  await world.stop();
});

test('without an S-PIN, locking says what to do and sends nothing', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ], config: { spin: '' } });
  await world.createAll();
  const ack = await world.fake.sceneAction('lock_vehicle', {
    device: world.device(VINS.KAMIQ).external_id,
  });
  assert.match(ack.error, /needs the S-PIN/);
  assert.equal(world.skoda.actions.length, 0);
  await world.stop();
});

test('the S-PIN check: green when correct, red with the tries left', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  assert.deepEqual(await world.fake.action('check_spin', {}), {
    success: true,
    data: { message: MESSAGES.spinCorrect },
  });
  await world.fake.configUpdated({ ...CREDENTIALS, spin: '1111' });
  const ack = await world.fake.action('check_spin', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.en, /2 try\(ies\) left/);
  // Once refused, it is not tried again.
  const again = await world.fake.action('check_spin', {});
  assert.deepEqual(again.error, MESSAGES.spin);
  assert.equal(world.skoda.spinTries, 2);
  await world.stop();
});

test('the refresh scene action reads now and gives the values to the scene', async () => {
  const world = await createWorld({ cars: [VINS.KODIAQ_PHEV] });
  await world.createAll();
  world.advance(2 * MINUTE);
  const calls = world.skoda.carCalls().length;
  const ack = await world.fake.sceneAction('refresh_vehicle', {
    device: world.device(VINS.KODIAQ_PHEV).external_id,
  });
  assert.deepEqual(ack, {
    success: true,
    data: {
      outputs: { battery_level: 16, range_km: 15, plugged: true, charging: true, locked: true },
    },
  });
  assert.ok(world.skoda.carCalls().length > calls);
  const unknown = await world.fake.sceneAction('refresh_vehicle', { device: 'ext:other:x' });
  assert.equal(unknown.success, false);
  await world.stop();
});

test('the connection test lists the cars, or says in red what is wrong', async () => {
  const world = await createWorld({ cars: [VINS.ENYAQ, VINS.KAMIQ] });
  const ack = await world.fake.action('test_connection', {});
  assert.deepEqual(ack.data.message, {
    en: 'Connected: 2 vehicle(s) (Škoda Enyaq (XX-001-XX), Škoda Kamiq (XX-007-XX)). S-PIN saved.',
    fr: 'Connecté : 2 véhicule(s) (Škoda Enyaq (XX-001-XX), Škoda Kamiq (XX-007-XX)). S-PIN enregistré.',
    de: 'Verbunden: 2 Fahrzeug(e) (Škoda Enyaq (XX-001-XX), Škoda Kamiq (XX-007-XX)). S-PIN gespeichert.',
    es: 'Conectado: 2 vehículo(s) (Škoda Enyaq (XX-001-XX), Škoda Kamiq (XX-007-XX)). S-PIN guardado.',
  });
  await world.stop();

  const refused = await createWorld({ config: { password: 'wrong password' } });
  assert.deepEqual(await refused.fake.action('test_connection', {}), {
    success: false,
    error: MESSAGES.auth,
  });
  await refused.stop();

  const empty = await createWorld({ config: { email: '', password: '' } });
  assert.deepEqual(await empty.fake.action('test_connection', {}), {
    success: false,
    error: MESSAGES.notSaved,
  });
  await empty.stop();

  const none = await createWorld({ cars: [] });
  assert.deepEqual(none.fake.connectionStatus, { connected: false, message: MESSAGES.noVehicle });
  await none.stop();
});

test('turning the GPS on and off: the position is read, then forgotten', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  await world.fake.configUpdated({ ...CREDENTIALS, gps: true });
  assert.ok(world.device(VINS.ENYAQ).features.some((f) => f.external_id.endsWith(':position')));
  // The user updates the device to add the new feature.
  await world.fake.deviceUpdated(world.device(VINS.ENYAQ));
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'position')), '50.10100, 14.40100');
  await world.fake.configUpdated({ ...CREDENTIALS, gps: false });
  assert.ok(!world.device(VINS.ENYAQ).features.some((f) => f.external_id.endsWith(':position')));
  const view = world.runtime.vehicleView(world.device(VINS.ENYAQ).external_id);
  assert.equal(view.snapshot.latitude, undefined);
  await world.stop();
});

test('the mileage never goes down (the cloud sometimes answers an older value)', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  world.skoda.data[VINS.ENYAQ].maintenance = { maintenanceReport: { mileageInKm: 9000 } };
  await world.tick(HOUR);
  assert.equal(world.fake.lastState(world.feature(VINS.ENYAQ, 'odometer')), 9538);
  await world.stop();
});

test('reconnected to Gladys: every state is sent again', async () => {
  const world = await createWorld(ENYAQ_ONLY);
  await world.createAll();
  const count = statesOf(world, VINS.ENYAQ, 'battery-level').length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(statesOf(world, VINS.ENYAQ, 'battery-level').length, count + 1);
  await world.stop();
});

test('a normal cycle writes nothing at info level, nor above', async () => {
  const world = await createWorld();
  await world.createAll();
  const lines = world.logger.lines;
  const before = { info: lines.info.length, warn: lines.warn.length, error: lines.error.length };
  for (let i = 0; i < 6; i += 1) await world.tick(HOUR);
  world.skoda.data[VINS.ENYAQ].charging = charging({ battery: { stateOfChargeInPercent: 30 } });
  await world.tick(HOUR);
  assert.deepEqual(
    { info: lines.info.length, warn: lines.warn.length, error: lines.error.length },
    before,
  );
  assert.ok(lines.debug.length > 0, 'the details stay at debug level');
  await world.stop();
});

test('no secret of the configuration or of the session ever reaches the logs', async () => {
  const world = await createWorld({ config: { gps: true, allow_unlock: true } });
  await world.createAll();
  await world.fake.action('test_connection', {});
  await world.fake.action('check_spin', {});
  const kamiq = world.device(VINS.KAMIQ).external_id;
  await world.fake.sceneAction('lock_vehicle', { device: kamiq });
  await world.fake.sceneAction('unlock_vehicle', { device: kamiq });
  await world.fake.setValue(...target(world, VINS.ENYAQ, 'climate'), 1);
  world.skoda.expireAccessTokens();
  world.skoda.network = false;
  await world.tick(HOUR);
  world.skoda.network = true;
  await world.tick(HOUR);
  await world.fake.configUpdated({ ...CREDENTIALS, spin: '9999', gps: true });
  await world.fake.action('check_spin', {});
  await world.fake.configUpdated({ ...CREDENTIALS, password: 'wrong password' });
  const text = world.logger.all().join('\n');
  for (const secret of [
    PASSWORD,
    'wrong password',
    EMAIL,
    SPIN,
    '9999',
    'access-token',
    'refresh-token',
    'eyJ',
    'code-',
    VINS.ENYAQ,
    VINS.KAMIQ,
    'XX-001-XX',
    '50.101',
    '14.401',
  ]) {
    assert.ok(!text.includes(secret), `the logs contain ${secret}`);
  }
  await world.stop();
});
