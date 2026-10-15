// -----------------------------------------------------------------------------
// The dashboard widget: content in the core's vocabulary and budget for every
// fixture car (validateWidgetContent of the SDK: [] = rendered as sent), tiles
// bound to features that exist, and the buttons and their actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MINUTE, T0, createWorld } from './helpers/world.js';
import { SPIN, VINS, fixture } from './helpers/fakeSkoda.js';
import { MESSAGES } from '../src/messages.js';
import { formatUpdated } from '../src/widgets.js';

const get = async (world, vin) => {
  const ack = await world.fake.widgetGet('vehicle', {
    settings: { device: world.device(vin).external_id },
    language: 'fr',
  });
  assert.equal(ack.success, true);
  return ack.data.content;
};
const buttons = (content) => content.components.filter((c) => c.type === 'button');
const actionKeys = (content) => buttons(content).map((b) => b.action?.key ?? 'link');

test('every car: valid content, tiles bound to features that exist once added', async () => {
  const world = await createWorld({ config: { gps: true } });
  try {
    await world.createAll();
    for (const device of world.fake.discoveredDevices) {
      const vin = device.external_id.split(':').pop();
      const content = await get(world, vin);
      assert.deepEqual(validateWidgetContent(content), [], device.name);
      const ids = new Set(device.features.map((f) => f.external_id));
      for (const component of content.components) {
        if (component.device_feature) {
          assert.ok(
            ids.has(component.device_feature),
            `${device.name}: ${component.device_feature}`,
          );
        }
      }
      const keys = actionKeys(content);
      assert.equal(new Set(keys).size, keys.length, `${device.name}: duplicate action key`);
      assert.ok(buttons(content).length <= 4);
      assert.ok(!keys.includes('unlock'), 'never an unlock button');
    }
  } finally {
    await world.stop();
  }
});

test('an electric car: battery and range tiles, charge, limit, climate, doors rows', async () => {
  const world = await createWorld({ cars: [VINS.ENYAQ_PLUGGED] });
  await world.createAll();
  const content = await get(world, VINS.ENYAQ_PLUGGED);
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((t) => t.device_feature.split(':').pop()),
    ['battery-level', 'range'],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((r) => r.label.en),
    ['Charge', 'Charge limit', 'Climate', 'Doors', 'Last update'],
  );
  assert.equal(rows[0].value.en, 'Plugged in');
  assert.equal(rows[2].value.fr, 'Arrêtée (20 °C)');
  assert.deepEqual(actionKeys(content), ['climate_start', 'charge_start', 'refresh']);
  // Starting the climate asks first.
  assert.equal(buttons(content)[0].action.confirm, true);
  await world.stop();
});

test('a petrol car: fuel tiles, no charge, no climate button', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ] });
  await world.createAll();
  const content = await get(world, VINS.KAMIQ);
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((t) => t.label.en),
    ['Fuel', 'Range'],
  );
  assert.deepEqual(actionKeys(content), ['refresh']);
  await world.stop();
});

test('an unlocked car with an S-PIN: a lock button that asks first', async () => {
  const world = await createWorld({ cars: [VINS.KAMIQ] });
  const status = structuredClone(fixture('kamiq/status'));
  status.overall.locked = 'NO';
  status.overall.doorsLocked = 'NO';
  world.skoda.data[VINS.KAMIQ].status = status;
  world.advance(31 * MINUTE);
  await world.runtime.tick();
  await world.createAll();
  const content = await get(world, VINS.KAMIQ);
  const lock = buttons(content).find((b) => b.action?.key === 'lock');
  assert.equal(lock.action.confirm, true);
  const ack = await world.fake.widgetAction(
    'vehicle',
    'lock',
    {},
    {
      settings: { device: world.device(VINS.KAMIQ).external_id },
    },
  );
  assert.deepEqual(ack, { success: true, data: { message: MESSAGES.commandSent } });
  assert.deepEqual(world.skoda.actions.at(-1).body, { currentSpin: SPIN });
  const after = await get(world, VINS.KAMIQ);
  const doors = after.components
    .find((c) => c.type === 'status')
    .items.find((r) => r.label.en === 'Doors');
  assert.equal(doors.value.en, 'Requested, waiting for the car');
  await world.stop();
});

test('widget actions: a command, a refresh, and a refusal in the viewer language', async () => {
  const world = await createWorld({ cars: [VINS.KODIAQ_PHEV] });
  await world.createAll();
  const settings = { device: world.device(VINS.KODIAQ_PHEV).external_id };
  let content = await get(world, VINS.KODIAQ_PHEV);
  assert.deepEqual(actionKeys(content), ['climate_start', 'charge_stop', 'refresh']);
  let ack = await world.fake.widgetAction('vehicle', 'charge_stop', {}, { settings });
  assert.deepEqual(ack.data.message, MESSAGES.commandSent);
  assert.equal(world.skoda.actions.at(-1).action, 'charging/stop');
  content = await get(world, VINS.KODIAQ_PHEV);
  const charge = content.components.find((c) => c.type === 'status').items[0];
  assert.equal(charge.value.en, 'Requested, waiting for the car');

  world.advance(2 * MINUTE);
  ack = await world.fake.widgetAction('vehicle', 'refresh', {}, { settings });
  assert.deepEqual(ack.data.message, MESSAGES.refreshed);

  world.skoda.fail(VINS.KODIAQ_PHEV, 'air-conditioning/start', 403);
  ack = await world.fake.widgetAction('vehicle', 'climate_start', {}, { settings });
  assert.equal(ack.success, false);
  // The last widget read was in French.
  assert.match(ack.error, /a refusé cette commande/);
  await world.stop();
});

test('no device chosen, or not one of ours: a message, not an error', async () => {
  const world = await createWorld({ cars: [VINS.ENYAQ] });
  const none = await world.fake.widgetGet('vehicle', { settings: {}, language: 'en' });
  assert.equal(none.data.content.components[0].text.en, 'Choose a vehicle in the widget settings.');
  const other = await world.fake.widgetGet('vehicle', {
    settings: { device: 'ext:other:thing' },
    language: 'en',
  });
  assert.match(other.data.content.components[0].text.en, /not a vehicle/);
  await world.stop();
});

test('the last update, in the time zone of Gladys', () => {
  assert.deepEqual(formatUpdated(T0, 'Europe/Paris'), {
    en: '15/10, 12:00',
    fr: '15/10 12:00',
    de: '15.10., 12:00',
    es: '15/10, 12:00',
  });
  assert.equal(formatUpdated(undefined), '—');
});
