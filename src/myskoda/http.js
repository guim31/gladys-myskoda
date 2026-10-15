// -----------------------------------------------------------------------------
// A small HTTP layer over the global fetch: timeouts, JSON and form bodies,
// redirects returned (never followed) so the sign-in can read them, and a
// cookie jar per host for the sign-in pages (they keep their session in
// cookies, as a browser would).
//
// Error messages name the host only, never the URL: the sign-in redirects
// carry codes and the API paths carry the VIN.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, SkodaError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30000;

/** The `name=value` cookies a response sets. */
export function responseCookies(headers) {
  const lines =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  const cookies = {};
  for (const line of lines) {
    const [pair] = line.split(';');
    const at = pair.indexOf('=');
    if (at > 0) cookies[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  }
  return cookies;
}

/**
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createHttp({ fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  /** host → { name: value } */
  const jars = new Map();

  /**
   * One request. Redirects are returned as they are (`status` 3xx, `location`).
   * @param {string} url
   * @param {object} [options]
   * @param {string} [options.method] default GET, POST with a body
   * @param {Record<string, string>} [options.headers]
   * @param {Record<string, string>} [options.form] form-urlencoded body
   * @param {object} [options.json] JSON body
   * @param {boolean} [options.cookies] send and keep the cookies of the host
   * @returns {Promise<{ status: number, url: string, location: string|null, text: string, json: () => any }>}
   */
  async function request(url, options = {}) {
    const target = new URL(url);
    const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
    let body;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(
        Object.entries(options.form).map(([key, value]) => [key, String(value ?? '')]),
      ).toString();
    }
    const jar = options.cookies ? (jars.get(target.host) ?? {}) : null;
    if (jar && Object.keys(jar).length > 0) {
      headers.Cookie = Object.entries(jar)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }
    let response;
    try {
      response = await fetchImpl(target.toString(), {
        method: options.method ?? (body !== undefined ? 'POST' : 'GET'),
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.cause?.code ?? err?.name ?? 'error';
      throw new SkodaError(ERROR_KINDS.NETWORK, `${target.host} unreachable (${reason})`);
    }
    if (jar) jars.set(target.host, { ...jar, ...responseCookies(response.headers) });
    let text;
    try {
      text = await response.text();
    } catch (err) {
      throw new SkodaError(
        ERROR_KINDS.NETWORK,
        `${target.host}: answer interrupted (${err?.name ?? 'error'})`,
      );
    }
    const location = response.headers.get('location');
    return {
      status: response.status,
      url: target.toString(),
      // Relative redirects resolved against the request.
      location: location ? new URL(location, target).toString() : null,
      text,
      /** The parsed body, `null` when it is not JSON. */
      json() {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      },
    };
  }

  return {
    request,
    /** Forget the cookies (a new sign-in starts from a clean browser). */
    clearCookies() {
      jars.clear();
    },
  };
}
