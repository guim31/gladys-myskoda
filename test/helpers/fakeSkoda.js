// -----------------------------------------------------------------------------
// A fake Škoda cloud behind a fake `fetch`: the VW Group sign-in pages (with
// their cookies, CSRF and PKCE checks), the token exchange and refresh of the
// MySkoda API, and its data and command endpoints, answering with the
// fixtures of test/fixtures/myskoda (from skodaconnect/myskoda, anonymized).
//
// Every request is recorded (`calls`), and the tests can change what a car
// answers (`data`), make an endpoint fail (`fail`), cut the network
// (`network`), refuse the password or ask for new terms (`signInOutcome`).
// An unknown e-mail address is sent to the registration page, as a probe of
// the real service showed (and a password posted after it gets a 500).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fixturesDir = new URL('../fixtures/myskoda/', import.meta.url);
export const fixture = (path) =>
  JSON.parse(readFileSync(new URL(`${path}.json`, fixturesDir), 'utf8'));
const page = (name) => readFileSync(new URL(`auth/${name}.html`, fixturesDir), 'utf8');

export const EMAIL = 'driver@example.com';
export const PASSWORD = 'correct horse battery';
export const SPIN = '2468';

const IDENTITY = 'https://identity.vwgroup.io';
const API = 'https://mysmob.api.connect.skoda-auto.cz';
const CLIENT_ID = '7f045eee-7003-4379-9968-9355ed2adb06@apps_vw-dilab_com';
// What the fixture pages carry.
const SIGNIN_CSRF =
  'NAQ2x4Glcth1cL9I5RTnGSFH0WsN1XT12dqaqkVOjdyMlaHBAjwOorHERrpYRoss0DnTLRB0_Alo4UzY7L6qknd-7Ozv9pin';
const SIGNIN_RELAY = '31a17b5c237a12d213c82c8297244967cd5681d2';
const IDENTIFIER_RELAY = 'd865b506bd6759b20e832c8c692c5ca2669ebd27';
const HMAC = '575452461e126b1873f4655918e14d0ba1a40622b768438fe4dd6d9579bc170c';

/** The anonymized cars of the fixtures, by directory. */
export const VINS = {
  ENYAQ: 'TMBMOCK0000000001', // Enyaq 85 (2024), unplugged
  ELROQ: 'TMBMOCK0000000002', // Elroq 85 (2025), plugged in, limit 100 %
  ENYAQ_PLUGGED: 'TMBMOCK0000000003', // Enyaq 80 (2022), ready for charging
  KODIAQ_PHEV: 'TMBMOCK0000000004', // Kodiaq iV (2024), charging
  OCTAVIA_PHEV: 'TMBMOCK0000000005', // Octavia iV (2022), charging, no charge limit
  CITIGO: 'TMBMOCK0000000006', // Citigo e iV (2020)
  KAMIQ: 'TMBMOCK0000000007', // Kamiq petrol (2021)
  KODIAQ_TDI: 'TMBMOCK0000000008', // Kodiaq diesel (2024)
  KAROQ_EXPIRED: 'TMBMOCK0000000009', // Karoq, services expired
};
export const DIRS = {
  [VINS.ENYAQ]: 'enyaq',
  [VINS.ELROQ]: 'elroq',
  [VINS.ENYAQ_PLUGGED]: 'enyaq-plugged',
  [VINS.KODIAQ_PHEV]: 'kodiaq-phev',
  [VINS.OCTAVIA_PHEV]: 'octavia-phev',
  [VINS.CITIGO]: 'citigo',
  [VINS.KAMIQ]: 'kamiq',
  [VINS.KODIAQ_TDI]: 'kodiaq-tdi',
  [VINS.KAROQ_EXPIRED]: 'karoq-expired',
};
const ENDPOINTS = [
  'charging',
  'air-conditioning',
  'status',
  'driving-range',
  'maintenance',
  'positions',
];

const base64url = (value) =>
  Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A JWT-shaped token (unsigned) with its expiry. */
const jwt = (payload) =>
  `${base64url(JSON.stringify({ alg: 'none' }))}.${base64url(JSON.stringify(payload))}.c2ln`;

const json = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const html = (body, cookie) =>
  new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
const redirect = (location, cookie) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });

/** Each car's answers, endpoint → body (a test may replace one). */
export function defaultCarData() {
  const data = {};
  for (const [vin, dir] of Object.entries(DIRS)) {
    data[vin] = { info: fixture(`${dir}/info`) };
    for (const endpoint of ENDPOINTS) {
      try {
        data[vin][endpoint] = fixture(`${dir}/${endpoint}`);
      } catch {
        // Not in the fixtures: see errors.json.
      }
    }
  }
  return data;
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now] the clock of the token expiries
 * @param {string[]} [options.cars] the VINs of the account (default: all)
 */
export function createFakeSkoda({ now = () => Date.now(), cars } = {}) {
  const garage = fixture('garage');
  const fake = {
    calls: [],
    actions: [],
    data: defaultCarData(),
    garage: { vehicles: garage.vehicles.filter((v) => !cars || cars.includes(v.vin)) },
    // `${vin}:${endpoint}` → HTTP status
    errors: new Map(),
    password: PASSWORD,
    spin: SPIN,
    spinTries: 3,
    // 'ok' | 'terms' | 'throttled' | 'inactive' | 'no-password-page'
    signInOutcome: 'ok',
    network: true,
    signInCount: 0,
    passwordsPosted: 0,
    unknownEmail: false,
    refreshCount: 0,
    revokedRefreshTokens: new Set(),
    accessTokens: new Map(), // token → expiry (ms)
    challenges: new Map(), // code → PKCE challenge
    cookies: new Set(),
    tokenSerial: 0,

    /** The data calls of the cars (not the sign-in, not the token calls). */
    carCalls() {
      return fake.calls.filter((c) => c.endpoint);
    },
    fail(vin, endpoint, status) {
      fake.errors.set(`${vin}:${endpoint}`, status);
    },
    heal(vin, endpoint) {
      fake.errors.delete(`${vin}:${endpoint}`);
    },
    /** Expire every access token (the next call gets a 401). */
    expireAccessTokens() {
      for (const token of fake.accessTokens.keys()) fake.accessTokens.set(token, 0);
    },
  };
  for (const [vin, dir] of Object.entries(DIRS)) {
    try {
      for (const [endpoint, status] of Object.entries(fixture(`${dir}/errors`))) {
        fake.errors.set(`${vin}:${endpoint}`, status);
      }
    } catch {
      // No recorded error for this car.
    }
  }

  function issueTokens() {
    fake.tokenSerial += 1;
    const serial = fake.tokenSerial;
    const access = jwt({ jti: `access-token-${serial}`, exp: Math.floor(now() / 1000) + 3600 });
    const refresh = jwt({
      jti: `refresh-token-${serial}`,
      exp: Math.floor(now() / 1000) + 180 * 24 * 3600,
    });
    fake.accessTokens.set(access, now() + 3600 * 1000);
    return { accessToken: access, refreshToken: refresh, idToken: jwt({ jti: 'id' }) };
  }

  const hasCookie = (init) => /idk_session=s1/.test(init.headers?.Cookie ?? '');

  async function identity(url, init) {
    const form = new URLSearchParams(init.body ?? '');
    const path = url.pathname;
    if (path === '/oidc/v1/authorize') {
      fake.pendingChallenge = url.searchParams.get('code_challenge');
      fake.unknownEmail = false;
      return redirect(
        `${IDENTITY}/signin-service/v1/signin/${CLIENT_ID}?relayState=${SIGNIN_RELAY}`,
        'idk_session=s1; Path=/; Secure; HttpOnly',
      );
    }
    if (path === `/signin-service/v1/signin/${CLIENT_ID}`) {
      return html(page('signin'));
    }
    if (path === `/signin-service/v1/${CLIENT_ID}/login/identifier`) {
      if (form.get('_csrf') !== SIGNIN_CSRF || form.get('relayState') !== SIGNIN_RELAY) {
        return html('<html>Forbidden</html>');
      }
      if (!hasCookie(init)) return html('<html>Session lost</html>');
      if (form.get('email') !== EMAIL) {
        fake.unknownEmail = true;
        return redirect(`/signin-service/v1/${CLIENT_ID}/register?relayState=${SIGNIN_RELAY}`);
      }
      if (fake.signInOutcome === 'inactive') {
        return redirect(
          `/signin-service/v1/${CLIENT_ID}/login/identifier?relayState=x&error=login.errors.account_not_activated`,
        );
      }
      // A page the integration does not know, without the password form.
      if (fake.signInOutcome === 'no-password-page') return html('<html>Something else</html>');
      return redirect(
        `/signin-service/v1/${CLIENT_ID}/login/authenticate?relayState=${IDENTIFIER_RELAY}&email=${encodeURIComponent(form.get('email'))}`,
      );
    }
    if (path === `/signin-service/v1/${CLIENT_ID}/register`) return html(page('signin'));
    if (path === `/signin-service/v1/${CLIENT_ID}/login/authenticate` && init.method === 'GET') {
      return html(page('identifier'));
    }
    if (path === `/signin-service/v1/${CLIENT_ID}/login/authenticate`) {
      fake.signInCount += 1;
      fake.passwordsPosted += 1;
      // What the real service does with a password posted for an unknown address.
      if (fake.unknownEmail) return new Response('<html>Internal error</html>', { status: 500 });
      if (!hasCookie(init) || form.get('hmac') !== HMAC) return html('<html>Bad form</html>');
      if (fake.signInOutcome === 'throttled') {
        return redirect(
          `${IDENTITY}/signin-service/v1/${CLIENT_ID}/login/authenticate?relayState=x&error=login.error.throttled`,
        );
      }
      if (form.get('email') !== EMAIL || form.get('password') !== fake.password) {
        return redirect(
          `${IDENTITY}/signin-service/v1/${CLIENT_ID}/login/authenticate?relayState=x&email=${encodeURIComponent(form.get('email'))}&error=login.errors.password_invalid`,
        );
      }
      if (fake.signInOutcome === 'terms') {
        return redirect(`${IDENTITY}/signin-service/v1/${CLIENT_ID}/terms-and-conditions?x=1`);
      }
      return redirect(`${IDENTITY}/oidc/v1/oauth/sso?clientId=${CLIENT_ID}&relayState=x`);
    }
    if (path === '/oidc/v1/oauth/sso') {
      return redirect(`${IDENTITY}/oidc/v1/oauth/client/callback/success?relayState=x`);
    }
    if (path === '/oidc/v1/oauth/client/callback/success') {
      const code = `code-${fake.signInCount}`;
      fake.challenges.set(code, fake.pendingChallenge);
      return redirect(`myskoda://redirect/login/?code=${code}`);
    }
    return html('<html>Not found</html>');
  }

  async function api(url, init) {
    const path = url.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    if (path === '/api/v1/authentication/exchange-authorization-code') {
      const challenge = fake.challenges.get(body?.code);
      const expected = base64url(createHash('sha256').update(String(body?.verifier)).digest());
      if (!challenge || challenge !== expected) return json({ message: 'invalid code' }, 400);
      fake.challenges.delete(body.code);
      return json(issueTokens());
    }
    if (path === '/api/v1/authentication/refresh-token') {
      fake.refreshCount += 1;
      if (fake.revokedRefreshTokens.has(body?.token)) return json({ message: 'revoked' }, 401);
      return json(issueTokens());
    }
    const token = (init.headers?.Authorization ?? '').replace(/^Bearer /, '');
    const expiry = fake.accessTokens.get(token);
    if (!expiry || expiry <= now()) return json({ message: 'Unauthorized' }, 401);

    if (path === '/api/v2/garage') return json(fake.garage);
    if (path === '/api/v1/spin/verify') {
      if (body?.currentSpin === fake.spin) return json(fixture('verify-spin-correct'));
      fake.spinTries -= 1;
      return json({
        verificationStatus: 'INCORRECT_SPIN',
        spinStatus: {
          remainingTries: fake.spinTries,
          lockedWaitingTimeInSeconds: 0,
          state: 'DEFINED',
        },
      });
    }
    const routes = [
      [/^\/api\/v2\/garage\/vehicles\/([^/]+)$/, 'info'],
      [/^\/api\/v2\/vehicle-status\/([^/]+)$/, 'status'],
      [/^\/api\/v2\/vehicle-status\/([^/]+)\/driving-range$/, 'driving-range'],
      [/^\/api\/v1\/charging\/([^/]+)$/, 'charging'],
      [/^\/api\/v2\/air-conditioning\/([^/]+)$/, 'air-conditioning'],
      [/^\/api\/v3\/vehicle-maintenance\/vehicles\/([^/]+)$/, 'maintenance'],
      [/^\/api\/v1\/maps\/positions$/, 'positions'],
    ];
    for (const [pattern, endpoint] of routes) {
      const match = path.match(pattern);
      if (!match || init.method !== 'GET') continue;
      const vin = match[1] ?? url.searchParams.get('vin');
      fake.calls.at(-1).endpoint = endpoint;
      fake.calls.at(-1).vin = vin;
      const status = fake.errors.get(`${vin}:${endpoint}`);
      if (status) return json({ message: `HTTP ${status}` }, status);
      const answer = fake.data[vin]?.[endpoint];
      return answer === undefined ? json({ message: 'Not found' }, 404) : json(answer);
    }
    const command = path.match(
      /^\/api\/(v1\/charging|v2\/air-conditioning|v1\/vehicle-access)\/([^/]+)\/(.+)$/,
    );
    if (command && init.method !== 'GET') {
      const [, prefix, vin, tail] = command;
      // e.g. "charging/start", "air-conditioning/settings/target-temperature".
      const action = `${prefix.split('/')[1]}/${tail}`;
      const status = fake.errors.get(`${vin}:${action}`);
      if (status) return json({ message: `HTTP ${status}` }, status);
      if (body?.currentSpin !== undefined && body.currentSpin !== fake.spin) {
        return json({ message: 'Precondition failed' }, 412);
      }
      fake.actions.push({ vin, action, method: init.method, body });
      return json(null, 202);
    }
    return json({ message: 'Not found' }, 404);
  }

  fake.fetch = async (input, init = {}) => {
    const url = new URL(input);
    fake.calls.push({ method: init.method ?? 'GET', host: url.host, path: url.pathname });
    if (!fake.network) {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    }
    if (url.origin === IDENTITY) return identity(url, { ...init, method: init.method ?? 'GET' });
    if (url.origin === API) return api(url, { ...init, method: init.method ?? 'GET' });
    throw new Error(`Unexpected host ${url.host}`);
  };
  return fake;
}
