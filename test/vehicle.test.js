// -----------------------------------------------------------------------------
// The car model on the fixtures of skodaconnect/myskoda: what each endpoint
// answer becomes in the snapshot, the published states, and the commands.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  CHARGING_STATION_STATE,
  VEHICLE_FEATURES as F,
  buildVehicleDevice,
  chargeLimit,
  chargingStationState,
  climateTemperature,
  logLabel,
  snapshotOf,
  vehicleCommand,
  vehicleInfo,
  vehicleName,
  vehicleStates,
} from '../src/devices/vehicle.js';
import { fixture } from './helpers/fakeSkoda.js';

const ENDPOINTS = ['charging', 'air-conditioning', 'status', 'driving-range', 'maintenance'];

/** The snapshot of a fixture car, every endpoint read. */
function snapshotOfCar(dir) {
  return Object.assign(
    {},
    ...ENDPOINTS.map((endpoint) => snapshotOf(endpoint, fixture(`${dir}/${endpoint}`))),
  );
}

const stateMap = (snapshot) =>
  Object.fromEntries(vehicleStates(snapshot).map((s) => [s.key, s.value ?? s.text]));

test('an electric car, unplugged: battery, range, charge state, climate, locks', () => {
  const states = stateMap(snapshotOfCar('enyaq'));
  assert.equal(states[F.BATTERY_LEVEL], 37);
  assert.equal(states[F.RANGE], 143);
  assert.equal(states[F.PLUGGED], 0);
  assert.equal(states[F.CHARGING], 0);
  assert.equal(states[F.CHARGING_STATE], CHARGING_STATION_STATE.IDLE);
  assert.equal(states[F.CHARGE_LIMIT], 80);
  assert.equal(states[F.CLIMATE], 0);
  assert.equal(states[F.TARGET_TEMPERATURE], 21);
  assert.equal(states[F.OUTSIDE_TEMPERATURE], -1);
  assert.equal(states[F.LOCKED], 1);
  assert.equal(states[F.DOORS_OPEN], 0);
  assert.equal(states[F.TRUNK_OPEN], 0);
  assert.equal(states[F.WINDOWS_OPEN], 0);
  assert.equal(states[F.ODOMETER], 9538);
  assert.equal(states[F.CHARGE_POWER], 0, 'no stale power once the charge is over');
});

test('plugged in: the cable sensor of the climate answer wins (Home Assistant)', () => {
  // The Elroq says CONNECT_CABLE in its charge state but CONNECTED in its cable sensor.
  const elroq = snapshotOfCar('elroq');
  assert.equal(stateMap(elroq)[F.PLUGGED], 1);
  assert.equal(chargingStationState(elroq), CHARGING_STATION_STATE.EV_CONNECTED);
  assert.equal(stateMap(elroq)[F.CHARGE_LIMIT], 100);
  const ready = snapshotOfCar('enyaq-plugged');
  assert.equal(stateMap(ready)[F.PLUGGED], 1);
  assert.equal(chargingStationState(ready), CHARGING_STATION_STATE.EV_CONNECTED);
  assert.equal(
    chargingStationState({ cablePlugged: true, charging: false, chargeState: 'CONSERVING' }),
    CHARGING_STATION_STATE.PAUSED_BY_VEHICLE,
  );
});

test('a plug-in hybrid charging: power, time left, electric and fuel ranges', () => {
  const states = stateMap(snapshotOfCar('kodiaq-phev'));
  assert.equal(states[F.CHARGING], 1);
  assert.equal(states[F.CHARGING_STATE], CHARGING_STATION_STATE.CHARGING);
  assert.equal(states[F.CHARGE_POWER], 10);
  assert.equal(states[F.CHARGE_TIME_REMAINING], 100);
  assert.equal(states[F.BATTERY_LEVEL], 16);
  assert.equal(states[F.RANGE], 15, 'the electric engine range, not the total');
  assert.equal(states[F.FUEL_RANGE], 200);
  assert.equal(states[F.FUEL_LEVEL], 39);
});

test('a petrol car: fuel level and range, locks, mileage; no battery', () => {
  const states = stateMap(snapshotOfCar('kamiq'));
  assert.equal(states[F.FUEL_LEVEL], 90);
  assert.equal(states[F.FUEL_RANGE], 750);
  assert.equal(states[F.ODOMETER], 77043);
  assert.equal(states[F.BATTERY_LEVEL], undefined);
  assert.equal(states[F.CLIMATE], undefined, 'the climate state INVALID is unknown');
});

test('locks and openings: YES is locked, an open door or boot is not', () => {
  const status = (overall, detail = {}) => snapshotOf('status', { overall, detail });
  assert.equal(status({ locked: 'YES' }).locked, true);
  assert.equal(status({ locked: 'NO' }).locked, false);
  assert.equal(status({ locked: 'OPENED' }).locked, false);
  assert.equal(status({ locked: 'TRUNK_OPENED' }).locked, false);
  assert.equal(status({ locked: 'UNKNOWN' }).locked, undefined);
  // 1 = open on the vehicle features (unlike opening-sensor, where 0 = open).
  const open = status({ doors: 'OPEN', windows: 'CLOSED' }, { trunk: 'OPEN', sunroof: 'OPEN' });
  assert.deepEqual([open.doorsOpen, open.trunkOpen, open.windowsOpen], [true, true, true]);
  const unknown = status({ doors: 'UNKNOWN', windows: 'UNSUPPORTED' }, { sunroof: 'UNSUPPORTED' });
  assert.deepEqual([unknown.doorsOpen, unknown.windowsOpen], [undefined, undefined]);
  assert.equal(stateMap(open)[F.DOORS_OPEN], 1);
});

test('glitches of the cloud are dropped', () => {
  assert.equal(
    snapshotOf('maintenance', { maintenanceReport: { mileageInKm: 429496729 } }).odometerKm,
    undefined,
  );
  assert.equal(
    snapshotOf('air-conditioning', { state: 'OFF', outsideTemperature: { temperatureValue: 85 } })
      .outsideTempC,
    undefined,
  );
  assert.equal(
    snapshotOf('charging', { status: { battery: { stateOfChargeInPercent: 104 } } }).batteryLevel,
    100,
  );
  assert.deepEqual(
    snapshotOf('positions', { positions: [], errors: [{ type: 'VEHICLE_IN_MOTION' }] }),
    {
      latitude: undefined,
      longitude: undefined,
    },
  );
});

test('the position, about one metre', () => {
  const snapshot = snapshotOf('positions', fixture('enyaq/positions'));
  assert.equal(stateMap(snapshot)[F.POSITION], '50.10100, 14.40100');
});

test('names: model and plate for Gladys, model and end of the VIN for the logs', () => {
  const info = vehicleInfo(fixture('garage').vehicles[0], fixture('enyaq/info'));
  assert.equal(vehicleName(info), 'Škoda Enyaq (XX-001-XX)');
  assert.equal(logLabel(info), 'Enyaq …0001');
  assert.equal(info.electric, true);
  assert.ok(info.capabilities.has('CHARGING'));
  // A capability with a status (licence expired...) is not available.
  const karoq = vehicleInfo(fixture('garage').vehicles[8], fixture('karoq-expired/info'));
  assert.equal(karoq.capabilities.has('STATE'), false);
  assert.equal(karoq.capabilities.has('ACCESS'), false);
});

test('commands: charge, climate at the saved temperature, rounded limits', () => {
  assert.deepEqual(vehicleCommand(F.CHARGING, 1), {
    order: 'startCharging',
    expect: { charging: true },
  });
  assert.deepEqual(vehicleCommand(F.CLIMATE, 1, { targetTempC: 19.2 }), {
    order: 'startClimate',
    args: 19,
    expect: { climateOn: true },
  });
  assert.deepEqual(vehicleCommand(F.CLIMATE, 1, {}).args, 21);
  assert.equal(vehicleCommand(F.TARGET_TEMPERATURE, '22,3').args, 22.5);
  assert.equal(climateTemperature(40), 30);
  assert.equal(climateTemperature(10), 15.5);
  assert.equal(chargeLimit(84), 80);
  assert.equal(chargeLimit(35), 50);
  assert.equal(vehicleCommand(F.CHARGE_LIMIT, 96).args, 100);
  assert.equal(vehicleCommand(F.LOCKED, 0), null, 'locking is not a feature command');
  assert.throws(() => vehicleCommand(F.TARGET_TEMPERATURE, ''));
});

test('a car without the charge capability gets no battery feature', () => {
  const gladys = createFakeGladys({ selector: 'myskoda' });
  const info = vehicleInfo(fixture('garage').vehicles[6], fixture('kamiq/info'));
  const device = buildVehicleDevice(
    gladys,
    info,
    { charging: false, climate: false, outside: true, state: true, seen: new Set(['fuelLevel']) },
    { language: 'en' },
  );
  assert.deepEqual(
    device.features.map((f) => f.name),
    ['Fuel level'],
  );
  assert.equal(device.should_poll, false);
});
