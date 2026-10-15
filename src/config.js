// -----------------------------------------------------------------------------
// Integration configuration: defaults (they MUST match the `default` values of
// the manifest `config_schema`, see test/manifest.test.js) and normalization,
// so the rest of the code never deals with `undefined` or form strings.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two reads of the cloud. A read never wakes the car, but each
// one is several calls (four to six per car). The VW Group publishes no
// quota and answers 429 to clients that call too often: Home Assistant reads
// every 30 minutes by default. Fifteen minutes is the shortest choice here,
// and more cars stretch it (see readPeriodMs).
export const REFRESH_CHOICES = ['15', '30', '60', '120'];

export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  spin: '',
  language: 'fr',
  refresh_minutes: '30',
  gps: false,
  allow_unlock: false,
};

const choice = (value, choices, fallback) =>
  choices.includes(String(value)) ? String(value) : fallback;
const yes = (value) => value === true || value === 'true';

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  return {
    email: String(config.email ?? '').trim(),
    // Never trimmed inside: a password may contain spaces (a pasted one often
    // ends with a newline, though).
    password: String(config.password ?? '').replace(/[\r\n]+$/, ''),
    // The S-PIN of the MySkoda app: four digits, spaces dropped.
    spin: String(config.spin ?? '').replace(/\s+/g, ''),
    language: choice(config.language, LANGUAGES, DEFAULT_CONFIG.language),
    refresh_minutes: choice(
      config.refresh_minutes,
      REFRESH_CHOICES,
      DEFAULT_CONFIG.refresh_minutes,
    ),
    gps: yes(config.gps),
    allow_unlock: yes(config.allow_unlock),
  };
}

export const isConfigured = (config) => Boolean(config.email && config.password);

/** An S-PIN the app would accept: four digits. */
export const validSpin = (spin) => /^\d{4}$/.test(String(spin ?? ''));

// Calls an hour per account the integration allows itself (no published
// quota: about what Home Assistant does with two cars).
export const MAX_CALLS_PER_HOUR = 30;

/**
 * Period of the reads, in milliseconds: the configured one, stretched when the
 * cars of the account need more calls than the hourly budget allows.
 * @param {object} config normalized config
 * @param {number} callsPerCycle calls of one read of every car
 */
export function readPeriodMs(config, callsPerCycle = 0) {
  const configured = Number(config.refresh_minutes) * 60 * 1000;
  const budget = Math.ceil((callsPerCycle * 60) / MAX_CALLS_PER_HOUR) * 60 * 1000;
  return Math.max(configured, budget);
}
