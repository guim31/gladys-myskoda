// -----------------------------------------------------------------------------
// Client of the MySkoda API (mysmob.api.connect.skoda-auto.cz), the cloud of
// the MySkoda app. Endpoints and payloads of skodaconnect/myskoda (MIT,
// rest_api.py).
//
// Reads return the state each car last sent to the cloud: none of them wakes
// the car (the wake-up endpoint is never called). Commands are accepted by
// the cloud at once and carried out by the car later.
//
// The tokens live in the session store (src/store.js, /data): an access token
// is used until ten minutes before it expires, then refreshed with the
// refresh token; the password is only used when there is no session or the
// refresh token is refused (once per call).
// -----------------------------------------------------------------------------

import { API_URL, createAuth, jwtExpiry } from './auth.js';
import { ERROR_KINDS, SkodaError, checkApiResponse } from './errors.js';

const MINUTE = 60 * 1000;
const EXPIRY_MARGIN_MS = 10 * MINUTE;
const GENERATIONS =
  'connectivityGenerations=MOD1&connectivityGenerations=MOD2' +
  '&connectivityGenerations=MOD3&connectivityGenerations=MOD4';

/** The data endpoints of a car, by name (src/myskoda.js reads them). */
export const READ_PATHS = {
  status: (vin) => `/v2/vehicle-status/${vin}`,
  'driving-range': (vin) => `/v2/vehicle-status/${vin}/driving-range`,
  charging: (vin) => `/v1/charging/${vin}`,
  'air-conditioning': (vin) => `/v2/air-conditioning/${vin}`,
  maintenance: (vin) => `/v3/vehicle-maintenance/vehicles/${vin}`,
  positions: (vin) => `/v1/maps/positions?vin=${vin}`,
};

/** "Climate at 21.5 °C": the app sends half degrees. */
const halfDegrees = (celsius) => Math.round(Number(celsius) * 2) / 2;

/**
 * @param {object} options
 * @param {object} options.http src/myskoda/http.js
 * @param {{ email: string, password: string }} options.credentials
 * @param {{ get: () => object, set: (partial: object) => void }} options.session
 * @param {() => number} [options.now]
 */
export function createSkodaClient({ http, credentials, session, now = Date.now }) {
  const auth = createAuth({ http });
  let pending = null; // the sign-in or refresh in progress

  const tokens = () => session.get() ?? {};
  const usable = (token) => Boolean(token) && jwtExpiry(token) - EXPIRY_MARGIN_MS > now();

  async function signIn() {
    const fresh = await auth.signIn(credentials);
    session.set(fresh);
    return fresh.accessToken;
  }

  /** An access token, refreshed or signed in again when needed. */
  function accessToken({ force = false } = {}) {
    const { accessToken: access, refreshToken } = tokens();
    if (!force && usable(access)) return Promise.resolve(access);
    pending ??= (async () => {
      try {
        if (refreshToken && jwtExpiry(refreshToken) > now()) {
          try {
            const fresh = await auth.refresh(refreshToken);
            session.set(fresh);
            return fresh.accessToken;
          } catch (err) {
            if (err.kind !== ERROR_KINDS.SESSION_EXPIRED) throw err;
          }
        }
        return await signIn();
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  /**
   * One authenticated call; a 401 refreshes the token and tries once more.
   * @param {string} method
   * @param {string} path below /api
   * @param {object} [options]
   * @param {object} [options.json] body
   * @param {string} options.what label of the call for the errors (no VIN)
   */
  async function call(method, path, { json, what }) {
    for (let attempt = 0; ; attempt += 1) {
      const token = await accessToken({ force: attempt > 0 });
      const response = await http.request(`${API_URL}/api${path}`, {
        method,
        json,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 && attempt === 0) continue;
      checkApiResponse(response.status, response.json(), what);
      return response.json();
    }
  }

  return {
    /** Make sure a session exists (signs in when there is none). */
    async connect() {
      await accessToken();
    },

    /** The cars of the account: [{ vin, name, title, state, systemModelId }]. */
    async garage() {
      const body = await call('GET', `/v2/garage?${GENERATIONS}`, { what: 'Garage' });
      return Array.isArray(body?.vehicles) ? body.vehicles : [];
    },

    /** Specification, plate and capabilities of one car. */
    info(vin) {
      return call('GET', `/v2/garage/vehicles/${vin}?${GENERATIONS}`, { what: 'Vehicle info' });
    },

    /** One data endpoint of READ_PATHS. */
    read(vin, endpoint) {
      const path = READ_PATHS[endpoint];
      if (!path) throw new Error(`Unknown endpoint ${endpoint}`);
      return call('GET', path(vin), { what: endpoint });
    },

    startCharging(vin) {
      return call('POST', `/v1/charging/${vin}/start`, { what: 'Start charging' });
    },
    stopCharging(vin) {
      return call('POST', `/v1/charging/${vin}/stop`, { what: 'Stop charging' });
    },
    setChargeLimit(vin, percent) {
      return call('PUT', `/v1/charging/${vin}/set-charge-limit`, {
        json: { targetSOCInPercent: percent },
        what: 'Charge limit',
      });
    },
    startClimate(vin, celsius) {
      return call('POST', `/v2/air-conditioning/${vin}/start`, {
        json: {
          heaterSource: 'ELECTRIC',
          targetTemperature: { temperatureValue: halfDegrees(celsius), unitInCar: 'CELSIUS' },
        },
        what: 'Start climate',
      });
    },
    stopClimate(vin) {
      return call('POST', `/v2/air-conditioning/${vin}/stop`, { what: 'Stop climate' });
    },
    setTargetTemperature(vin, celsius) {
      return call('POST', `/v2/air-conditioning/${vin}/settings/target-temperature`, {
        json: { temperatureValue: halfDegrees(celsius), unitInCar: 'CELSIUS' },
        what: 'Climate temperature',
      });
    },
    async lock(vin, spin) {
      if (!spin) throw new SkodaError(ERROR_KINDS.SPIN_MISSING, 'No S-PIN configured');
      return call('POST', `/v1/vehicle-access/${vin}/lock`, {
        json: { currentSpin: spin },
        what: 'Lock',
      });
    },
    async unlock(vin, spin) {
      if (!spin) throw new SkodaError(ERROR_KINDS.SPIN_MISSING, 'No S-PIN configured');
      return call('POST', `/v1/vehicle-access/${vin}/unlock`, {
        json: { currentSpin: spin },
        what: 'Unlock',
      });
    },

    /**
     * Check the S-PIN. A wrong one counts as a failed try on the account.
     * @returns {Promise<{ correct: boolean, remainingTries: number|null, lockedSeconds: number }>}
     */
    async verifySpin(spin) {
      if (!spin) throw new SkodaError(ERROR_KINDS.SPIN_MISSING, 'No S-PIN configured');
      const body = await call('POST', '/v1/spin/verify', {
        json: { currentSpin: spin },
        what: 'S-PIN check',
      });
      const status = body?.spinStatus ?? {};
      return {
        correct: body?.verificationStatus === 'CORRECT_SPIN',
        remainingTries: Number.isFinite(status.remainingTries) ? status.remainingTries : null,
        lockedSeconds: Number(status.lockedWaitingTimeInSeconds) || 0,
      };
    },
  };
}
