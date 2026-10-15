// -----------------------------------------------------------------------------
// Errors of the VW Group sign-in service (identity.vwgroup.io) and of the
// MySkoda API (mysmob.api.connect.skoda-auto.cz), sorted by what the runtime
// does about them (see src/myskoda.js).
//
// The sign-in pages report a refusal through an `error=` query parameter of
// a redirect, or through the `error` of the page's template model; the API
// through its HTTP status (the library skodaconnect/myskoda and the Home
// Assistant integration read nothing more from it).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = {
  // Wrong e-mail address or password: stop, the user must fix the
  // configuration. Insisting could lock the account.
  AUTH: 'auth',
  // The e-mail address is no Škoda ID: the sign-in sends it to the
  // registration page. The password is then never sent.
  UNKNOWN_ACCOUNT: 'unknown-account',
  // The Škoda ID exists but is not activated yet (confirmation e-mail).
  ACCOUNT_INACTIVE: 'account-inactive',
  // The account must accept new terms or a consent in the MySkoda app first.
  CONSENT: 'consent',
  // The sign-in service refuses for now (too many attempts): stop too.
  BLOCKED: 'blocked',
  // The saved refresh token is refused: sign in again with the password.
  SESSION_EXPIRED: 'session-expired',
  // The access token expired (HTTP 401): refresh it, try again once.
  TOKEN_EXPIRED: 'token-expired',
  // HTTP 429: pause the reads.
  RATE_LIMIT: 'rate-limit',
  // No S-PIN in the configuration, for a command that needs one.
  SPIN_MISSING: 'spin-missing',
  // The S-PIN was refused (HTTP 412, or INCORRECT_SPIN): never sent again
  // until the configuration is saved, each wrong try counts.
  SPIN: 'spin',
  // The car (model, licence, guest user) does not offer this.
  NOT_SUPPORTED: 'not-supported',
  // HTTP 403: the account may not do this (guest user, licence expired).
  ACCESS_DENIED: 'access-denied',
  // HTTP 404: no such data for this car.
  NOT_FOUND: 'not-found',
  // HTTP 409: another request of the same kind is still running.
  IN_PROGRESS: 'in-progress',
  // HTTP 400: the request was refused as invalid.
  INVALID: 'invalid',
  NETWORK: 'network',
  SERVER: 'server',
  API: 'api',
};

export class SkodaError extends Error {
  constructor(kind, message, { status, code } = {}) {
    super(message);
    this.name = 'SkodaError';
    this.kind = kind;
    if (status !== undefined) this.status = status;
    if (code !== undefined) this.code = code;
  }
}

// `error=` values of the sign-in redirects (as read by the VW Group clients:
// myskoda, weconnect, CarConnectivity).
const SIGN_IN_ERRORS = {
  'login.errors.password_invalid': ERROR_KINDS.AUTH,
  'login.errors.user_not_found': ERROR_KINDS.UNKNOWN_ACCOUNT,
  'login.error.throttled': ERROR_KINDS.BLOCKED,
  'login.errors.throttled': ERROR_KINDS.BLOCKED,
};

/** The error of a sign-in `error=` code (an unknown one is a refusal too). */
export function signInError(code) {
  const text = String(code);
  const kind =
    SIGN_IN_ERRORS[text] ??
    (/throttl|locked|captcha/i.test(text)
      ? ERROR_KINDS.BLOCKED
      : /not_?activ|not_?verif|unverif|inactive|not_?confirm/i.test(text)
        ? ERROR_KINDS.ACCOUNT_INACTIVE
        : /not_?found|unknown|register/i.test(text)
          ? ERROR_KINDS.UNKNOWN_ACCOUNT
          : ERROR_KINDS.AUTH);
  return new SkodaError(kind, `Sign-in refused (${String(code).slice(0, 60)})`, { code });
}

const STATUS_KINDS = {
  400: ERROR_KINDS.INVALID,
  401: ERROR_KINDS.TOKEN_EXPIRED,
  403: ERROR_KINDS.ACCESS_DENIED,
  404: ERROR_KINDS.NOT_FOUND,
  409: ERROR_KINDS.IN_PROGRESS,
  412: ERROR_KINDS.SPIN,
  429: ERROR_KINDS.RATE_LIMIT,
  501: ERROR_KINDS.NOT_SUPPORTED,
};

/** A short, safe description of an error body: never the whole body. */
function describe(body) {
  if (!body || typeof body !== 'object') return '';
  const first = Array.isArray(body.errors) ? body.errors[0] : undefined;
  const text =
    body.message ?? body.error?.message ?? body.title ?? first?.description ?? first?.message;
  return typeof text === 'string' ? `: ${text.slice(0, 120)}` : '';
}

/**
 * Throw the error an API answer carries, if any.
 * @param {number} status HTTP status
 * @param {object|null} body parsed JSON answer (null when not JSON)
 * @param {string} what what was asked, for the message (never a VIN)
 */
export function checkApiResponse(status, body, what) {
  if (status < 400) return;
  const kind = STATUS_KINDS[status] ?? (status >= 500 ? ERROR_KINDS.SERVER : ERROR_KINDS.API);
  throw new SkodaError(kind, `${what}: HTTP ${status}${describe(body)}`, { status });
}
