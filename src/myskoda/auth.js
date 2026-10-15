// -----------------------------------------------------------------------------
// Sign-in to the VW Group identity service, the way the MySkoda Android app
// does it (protocol of skodaconnect/myskoda, MIT, auth/authorization.py):
//
//   1. GET  /oidc/v1/authorize (OAuth2 authorization code + PKCE): a login
//      page whose `window._IDK` script holds a CSRF token, an HMAC and a relay
//      state;
//   2. POST the e-mail address (login/identifier): the password page;
//   3. POST the e-mail address and the password (login/authenticate): a chain
//      of redirects that ends on `myskoda://redirect/login/?code=…`;
//   4. exchange that code at the MySkoda API for an access token (1 hour) and
//      a refresh token (about 180 days), refreshed later without the password.
//
// A refused password, a throttled account or terms to accept in the app stop
// the sign-in with an error the runtime does not retry (src/myskoda.js).
// Nothing here logs: the pages and redirects carry the e-mail address.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';
import { ERROR_KINDS, SkodaError, checkApiResponse, signInError } from './errors.js';

// Client of the MySkoda Android app (skodaconnect/myskoda, const.py).
export const CLIENT_ID = '7f045eee-7003-4379-9968-9355ed2adb06@apps_vw-dilab_com';
export const REDIRECT_URI = 'myskoda://redirect/login/';
export const IDENTITY_URL = 'https://identity.vwgroup.io';
export const API_URL = 'https://mysmob.api.connect.skoda-auto.cz';
const SCOPE =
  'address badge birthdate cars driversLicense dealers email mileage mbb nationalIdentifier ' +
  'openid phone profession profile vin';
const MAX_REDIRECTS = 10;

const base64url = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A PKCE verifier and its S256 challenge. */
export function pkcePair(verifier = base64url(randomBytes(48))) {
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

/**
 * The state of a sign-in page: what its `window._IDK` script holds.
 * @param {string} html
 * @returns {{ csrf: string, hmac: string, relayState: string, template?: string,
 *   error?: string|null, postAction?: string }}
 */
export function parseLoginPage(html) {
  const text = String(html ?? '');
  const csrf = text.match(/csrf_token:\s*['"]([^'"]+)['"]/)?.[1];
  const model = text.match(/templateModel:\s*(\{.*\})\s*,?\s*$/m)?.[1];
  const parsed = parseJson(model);
  if (!csrf || !parsed?.hmac || !parsed?.relayState) {
    throw new SkodaError(ERROR_KINDS.API, 'Sign-in page without its login form (CSRF)');
  }
  return {
    csrf,
    hmac: parsed.hmac,
    relayState: parsed.relayState,
    template: parsed.template,
    error: parsed.error ?? null,
    postAction: parsed.postAction,
  };
}

/** A JSON text parsed, `null` when absent or invalid. */
function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A query parameter of a URL, `null` when absent or not a URL. */
function searchParam(url, name) {
  try {
    return new URL(url).searchParams.get(name);
  } catch {
    return null;
  }
}

/** The `error=` code of a sign-in URL, if any. */
const errorCodeOf = (url) => searchParam(url, 'error');

/** The registration page of the identity service (a probe saw `/signin-service/v1/<client>/register`). */
function isRegistration(url) {
  try {
    return /\/(register|registration|signup)(\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

const unknownAccount = () =>
  new SkodaError(ERROR_KINDS.UNKNOWN_ACCOUNT, 'No Škoda ID for this e-mail address');

/**
 * The VW Group sign-in, then the MySkoda token exchange.
 * @param {object} http src/myskoda/http.js
 */
export function createAuth({ http }) {
  /** Follow the redirects of the sign-in pages until a page (or the app link). */
  async function follow(response) {
    let current = response;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (current.status < 300 || current.status >= 400) return current;
      const location = current.location ?? '';
      if (location.startsWith(REDIRECT_URI.split('://')[0] + '://')) return current;
      const code = errorCodeOf(location);
      if (code) throw signInError(code);
      // Terms or a marketing consent to accept: only the app can do it.
      if (/terms-and-conditions|consent\/marketing/.test(location)) {
        throw new SkodaError(ERROR_KINDS.CONSENT, 'Terms or a consent to accept in the app');
      }
      // An e-mail address that is no Škoda ID goes to the registration page.
      if (isRegistration(location)) throw unknownAccount();
      current = await http.request(location, { cookies: true, headers: { Accept: 'text/html' } });
    }
    throw new SkodaError(ERROR_KINDS.API, 'Too many sign-in redirects');
  }

  function checkPage(response, what) {
    if (response.status >= 500) {
      throw new SkodaError(ERROR_KINDS.SERVER, `${what}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    if (response.status === 429) {
      throw new SkodaError(ERROR_KINDS.BLOCKED, `${what}: HTTP 429`, { status: 429 });
    }
    if (response.status >= 400) {
      throw new SkodaError(ERROR_KINDS.API, `${what}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return parseLoginPage(response.text);
  }

  /** The tokens of the MySkoda API for these credentials. */
  async function signIn({ email, password }) {
    http.clearCookies?.();
    const { verifier, challenge } = pkcePair();
    const authorize = new URL(`${IDENTITY_URL}/oidc/v1/authorize`);
    for (const [key, value] of Object.entries({
      client_id: CLIENT_ID,
      nonce: base64url(randomBytes(12)),
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: 's256',
      prompt: 'login',
    })) {
      authorize.searchParams.set(key, value);
    }
    const html = { Accept: 'text/html' };

    // 1. The login page.
    const first = checkPage(
      await follow(await http.request(authorize.toString(), { cookies: true, headers: html })),
      'Sign-in page',
    );

    // 2. The e-mail address.
    const identified = await follow(
      await http.request(`${IDENTITY_URL}/signin-service/v1/${CLIENT_ID}/login/identifier`, {
        cookies: true,
        headers: html,
        form: { relayState: first.relayState, email, hmac: first.hmac, _csrf: first.csrf },
      }),
    );
    // An unknown address lands on the registration page, not the password one.
    if (isRegistration(identified.url)) throw unknownAccount();
    if (/terms-and-conditions/.test(identified.url)) {
      throw new SkodaError(ERROR_KINDS.CONSENT, 'Terms or a consent to accept in the app');
    }
    let second;
    try {
      second = checkPage(identified, 'E-mail address');
    } catch (err) {
      // A page without the login form: never post the password to it.
      if (err.kind === ERROR_KINDS.API) throw unknownAccount();
      throw err;
    }
    if (second.error) throw signInError(String(second.error));
    // Any page but the password one: the address is not a usable Škoda ID.
    const passwordPage =
      second.template === 'loginAuthenticate' || second.postAction === 'login/authenticate';
    if (!passwordPage) throw unknownAccount();

    // 3. The password: redirects to the app link that carries the code.
    const authenticated = await follow(
      await http.request(`${IDENTITY_URL}/signin-service/v1/${CLIENT_ID}/login/authenticate`, {
        cookies: true,
        headers: html,
        form: {
          relayState: second.relayState,
          email,
          password,
          hmac: second.hmac,
          _csrf: second.csrf,
        },
      }),
    );
    const location = authenticated.location ?? '';
    const code = searchParam(location, 'code');
    if (!code) {
      // A page instead of the app link: the password page again, with its error.
      if (authenticated.status === 200) {
        const page = parseJson(
          authenticated.text.match(/templateModel:\s*(\{.*\})\s*,?\s*$/m)?.[1],
        );
        if (page?.error) throw signInError(String(page.error));
        throw new SkodaError(ERROR_KINDS.API, 'Sign-in ended on a page without a code');
      }
      throw new SkodaError(
        authenticated.status >= 500 ? ERROR_KINDS.SERVER : ERROR_KINDS.API,
        `Sign-in ended without a code (HTTP ${authenticated.status})`,
        { status: authenticated.status },
      );
    }

    // 4. The code for the tokens of the MySkoda API.
    const exchanged = await http.request(
      `${API_URL}/api/v1/authentication/exchange-authorization-code?tokenType=CONNECT`,
      { json: { code, redirectUri: REDIRECT_URI, verifier } },
    );
    checkApiResponse(exchanged.status, exchanged.json(), 'Token exchange');
    return tokensOf(exchanged.json());
  }

  /** New tokens for a refresh token, without the password. */
  async function refresh(refreshToken) {
    const response = await http.request(
      `${API_URL}/api/v1/authentication/refresh-token?tokenType=CONNECT`,
      { json: { token: refreshToken } },
    );
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new SkodaError(
        ERROR_KINDS.SESSION_EXPIRED,
        `Refresh token refused (HTTP ${response.status})`,
        { status: response.status },
      );
    }
    checkApiResponse(response.status, response.json(), 'Token refresh');
    return tokensOf(response.json());
  }

  return { signIn, refresh };
}

function tokensOf(body) {
  if (!body?.accessToken || !body?.refreshToken) {
    throw new SkodaError(ERROR_KINDS.API, 'Token answer without tokens');
  }
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}

/** The expiry of a JWT (ms since the epoch), `0` when unreadable. */
export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
