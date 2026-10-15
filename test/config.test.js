import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_CALLS_PER_HOUR,
  isConfigured,
  normalizeConfig,
  readPeriodMs,
  validSpin,
} from '../src/config.js';

const MINUTE = 60 * 1000;

test('an empty configuration gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
});

test('form values are cleaned: trimmed e-mail, kept password, S-PIN digits', () => {
  const config = normalizeConfig({
    email: '  driver@example.com ',
    password: ' pass word \n',
    spin: ' 12 34 ',
    language: 'it',
    refresh_minutes: 5,
    gps: 'true',
    allow_unlock: 'false',
  });
  assert.equal(config.email, 'driver@example.com');
  assert.equal(config.password, ' pass word ');
  assert.equal(config.spin, '1234');
  assert.equal(config.language, 'fr', 'an unknown language falls back to French');
  assert.equal(config.refresh_minutes, '30', 'an unknown interval falls back to 30 minutes');
  assert.equal(config.gps, true);
  assert.equal(config.allow_unlock, false);
  assert.equal(isConfigured(config), true);
});

test('an S-PIN is four digits', () => {
  assert.equal(validSpin('1234'), true);
  for (const spin of ['', '123', '12345', 'abcd', null]) assert.equal(validSpin(spin), false);
});

test('the read period: the configured one, stretched to stay under the hourly budget', () => {
  const config = normalizeConfig({ refresh_minutes: '15' });
  assert.equal(readPeriodMs(config, 5), 15 * MINUTE, 'one car, 20 calls an hour');
  // Four cars of five calls: 20 calls a cycle, 40 minutes at 30 calls an hour.
  assert.equal(MAX_CALLS_PER_HOUR, 30);
  assert.equal(readPeriodMs(config, 20), 40 * MINUTE);
  assert.equal(readPeriodMs(normalizeConfig({ refresh_minutes: '120' }), 20), 120 * MINUTE);
});
