// -----------------------------------------------------------------------------
// The cloud client against the fake Škoda cloud: the VW Group sign-in (pages,
// cookies, PKCE), its refusals, the token refresh, and the API errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHttp } from '../src/myskoda/http.js';
import { createSkodaClient } from '../src/myskoda/client.js';
import { jwtExpiry, parseLoginPage, pkcePair } from '../src/myskoda/auth.js';
import { ERROR_KINDS } from '../src/myskoda/errors.js';
import { EMAIL, PASSWORD, SPIN, VINS, createFakeSkoda } from './helpers/fakeSkoda.js';

const T0 = Date.UTC(2026, 9, 15, 10, 0, 0);
const page = (name) =>
  readFile(new URL(`./fixtures/myskoda/auth/${name}.html`, import.meta.url), 'utf8');

function setup({ email = EMAIL, password = PASSWORD, session = {} } = {}) {
  let clock = T0;
  const now = () => clock;
  const cloud = createFakeSkoda({ now });
  const saved = { ...session };
  const client = createSkodaClient({
    http: createHttp({ fetchImpl: cloud.fetch }),
    credentials: { email, password },
    session: { get: () => saved, set: (partial) => Object.assign(saved, partial) },
    now,
  });
  return { cloud, client, saved, advance: (ms) => (clock += ms) };
}

test('the login pages: CSRF token, HMAC and relay state of the window._IDK script', async () => {
  const first = parseLoginPage(await page('signin'));
  assert.equal(first.template, 'loginIdentifier');
  assert.equal(first.relayState, '31a17b5c237a12d213c82c8297244967cd5681d2');
  assert.match(first.csrf, /^NAQ2x4Gl/);
  const second = parseLoginPage(await page('identifier'));
  assert.equal(second.template, 'loginAuthenticate');
  assert.equal(second.postAction, 'login/authenticate');
  assert.equal(second.hmac.length, 64);
  assert.throws(() => parseLoginPage('<html>Maintenance</html>'), { kind: ERROR_KINDS.API });
});

test('PKCE: the S256 challenge of RFC 7636', () => {
  assert.deepEqual(pkcePair('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), {
    verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  });
  assert.ok(pkcePair().verifier.length >= 43);
});

test('sign-in: login pages with their cookie, password, app link, token exchange', async () => {
  const { cloud, client, saved } = setup();
  await client.connect();
  assert.equal(cloud.signInCount, 1);
  assert.ok(saved.accessToken && saved.refreshToken);
  assert.equal(jwtExpiry(saved.accessToken), T0 + 3600 * 1000);
  // The redirects were followed by hand: authorize, sign-in page, identifier,
  // password page, authenticate, SSO, callback; then the exchange.
  assert.deepEqual(
    cloud.calls.map((c) => `${c.method} ${c.path.replace(/7f045eee[^/]+/, 'CLIENT')}`),
    [
      'GET /oidc/v1/authorize',
      'GET /signin-service/v1/signin/CLIENT',
      'POST /signin-service/v1/CLIENT/login/identifier',
      'GET /signin-service/v1/CLIENT/login/authenticate',
      'POST /signin-service/v1/CLIENT/login/authenticate',
      'GET /oidc/v1/oauth/sso',
      'GET /oidc/v1/oauth/client/callback/success',
      'POST /api/v1/authentication/exchange-authorization-code',
    ],
  );
  const garage = await client.garage();
  assert.equal(garage.length, 9);
  await client.connect();
  assert.equal(cloud.signInCount, 1, 'a valid token is reused');
});

test('sign-in refusals: wrong password, throttled account, terms to accept', async () => {
  const wrong = setup({ password: 'wrong' });
  await assert.rejects(wrong.client.connect(), { kind: ERROR_KINDS.AUTH });

  const throttled = setup();
  throttled.cloud.signInOutcome = 'throttled';
  await assert.rejects(throttled.client.connect(), { kind: ERROR_KINDS.BLOCKED });

  const terms = setup();
  terms.cloud.signInOutcome = 'terms';
  await assert.rejects(terms.client.connect(), { kind: ERROR_KINDS.CONSENT });

  // No message carries the e-mail address or the password.
  for (const { client } of [setup({ password: 'wrong' })]) {
    const err = await client.connect().catch((e) => e);
    assert.ok(!err.message.includes(EMAIL) && !err.message.includes('wrong'), err.message);
  }
});

test('an unknown e-mail address: the registration page, never the password', async () => {
  // What a probe of the real service showed: the identifier step redirects an
  // unknown address to /signin-service/v1/<client>/register.
  const unknown = setup({ email: 'nobody@example.com' });
  const err = await unknown.client.connect().catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.UNKNOWN_ACCOUNT);
  assert.equal(unknown.cloud.passwordsPosted, 0, 'the password is not posted');
  assert.ok(!unknown.cloud.calls.some((c) => c.path.endsWith('/register')), 'not even opened');

  const other = setup();
  other.cloud.signInOutcome = 'no-password-page';
  await assert.rejects(other.client.connect(), { kind: ERROR_KINDS.UNKNOWN_ACCOUNT });
  assert.equal(other.cloud.passwordsPosted, 0);

  const inactive = setup();
  inactive.cloud.signInOutcome = 'inactive';
  await assert.rejects(inactive.client.connect(), { kind: ERROR_KINDS.ACCOUNT_INACTIVE });
  assert.equal(inactive.cloud.passwordsPosted, 0);
});

test('tokens: refreshed without the password, signed in again once the refresh is refused', async () => {
  const { cloud, client, saved, advance } = setup();
  await client.connect();
  advance(55 * 60 * 1000); // ten minutes before the expiry
  await client.garage();
  assert.equal(cloud.refreshCount, 1);
  assert.equal(cloud.signInCount, 1);

  cloud.revokedRefreshTokens.add(saved.refreshToken);
  advance(55 * 60 * 1000);
  await client.garage();
  assert.equal(cloud.refreshCount, 2);
  assert.equal(cloud.signInCount, 2, 'one password sign-in once the refresh was refused');
});

test('a 401 refreshes the token and tries once more', async () => {
  const { cloud, client } = setup();
  await client.connect();
  cloud.expireAccessTokens();
  const body = await client.read(VINS.ENYAQ, 'charging');
  assert.equal(body.status.battery.stateOfChargeInPercent, 37);
  assert.equal(cloud.refreshCount, 1);
});

test('API errors by status: 429 quota, 412 S-PIN, 404 nothing, 5xx server', async () => {
  const { cloud, client } = setup();
  cloud.fail(VINS.ENYAQ, 'charging', 429);
  await assert.rejects(client.read(VINS.ENYAQ, 'charging'), { kind: ERROR_KINDS.RATE_LIMIT });
  cloud.fail(VINS.ENYAQ, 'charging', 503);
  await assert.rejects(client.read(VINS.ENYAQ, 'charging'), { kind: ERROR_KINDS.SERVER });
  cloud.fail(VINS.ENYAQ, 'status', 404);
  const err = await client.read(VINS.ENYAQ, 'status').catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.NOT_FOUND);
  assert.ok(!err.message.includes(VINS.ENYAQ), 'no VIN in the message');
  await assert.rejects(client.lock(VINS.ENYAQ, '0000'), { kind: ERROR_KINDS.SPIN });
  await assert.rejects(client.lock(VINS.ENYAQ, ''), { kind: ERROR_KINDS.SPIN_MISSING });
  await client.lock(VINS.ENYAQ, SPIN);
  assert.deepEqual(cloud.actions.at(-1), {
    vin: VINS.ENYAQ,
    action: 'vehicle-access/lock',
    method: 'POST',
    body: { currentSpin: SPIN },
  });
});

test('commands: the payloads of the MySkoda app', async () => {
  const { cloud, client } = setup();
  await client.startClimate(VINS.ENYAQ, 21.3);
  await client.setTargetTemperature(VINS.ENYAQ, 19.8);
  await client.setChargeLimit(VINS.ENYAQ, 80);
  await client.startCharging(VINS.ENYAQ);
  assert.deepEqual(
    cloud.actions.map(({ action, method, body }) => [action, method, body]),
    [
      [
        'air-conditioning/start',
        'POST',
        {
          heaterSource: 'ELECTRIC',
          targetTemperature: { temperatureValue: 21.5, unitInCar: 'CELSIUS' },
        },
      ],
      [
        'air-conditioning/settings/target-temperature',
        'POST',
        { temperatureValue: 20, unitInCar: 'CELSIUS' },
      ],
      ['charging/set-charge-limit', 'PUT', { targetSOCInPercent: 80 }],
      ['charging/start', 'POST', null],
    ],
  );
});

test('S-PIN check: correct, or refused with the tries left', async () => {
  const { client } = setup();
  assert.deepEqual(await client.verifySpin(SPIN), {
    correct: true,
    remainingTries: null,
    lockedSeconds: 0,
  });
  assert.deepEqual(await client.verifySpin('1111'), {
    correct: false,
    remainingTries: 2,
    lockedSeconds: 0,
  });
});

test('a network failure names the host, never the URL', async () => {
  const { cloud, client } = setup();
  cloud.network = false;
  const err = await client.connect().catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.NETWORK);
  assert.equal(err.message, 'identity.vwgroup.io unreachable (ECONNREFUSED)');
});
