#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Sign-in probe against the real VW Group identity service and MySkoda cloud,
// with the integration's own client. Read only: it signs in and, with
// --vehicles, counts the cars and reads their state once (no command, no
// wake-up). Nothing sensitive is printed: no token, no address, no VIN, no
// plate, no position.
//
//   node scripts/probe.mjs
//       signs in with a fake account: every step until the refusal of the
//       password (expected outcome: "auth").
//   MYSKODA_EMAIL=… MYSKODA_PASSWORD=… node scripts/probe.mjs [--vehicles]
//       a real account.
// -----------------------------------------------------------------------------

import { createHttp } from '../src/myskoda/http.js';
import { createSkodaClient } from '../src/myskoda/client.js';
import { snapshotOf, vehicleInfo } from '../src/devices/vehicle.js';

const email = process.env.MYSKODA_EMAIL ?? 'probe.nobody@example.com';
const password = process.env.MYSKODA_PASSWORD ?? 'not-the-password-0';
const fakeAccount = !process.env.MYSKODA_EMAIL;

const step = (label, outcome) => console.log(`${label.padEnd(34)} ${outcome}`);

// Every request, by host and path (the query strings and the VINs are left out).
const http = createHttp({
  fetchImpl: async (url, init) => {
    const target = new URL(url);
    const response = await fetch(url, init);
    const path = target.host.startsWith('mysmob')
      ? target.pathname.replace(/\/[A-Z0-9]{17}(?=\/|$)/g, '/<vin>')
      : target.pathname.replace(/[0-9a-f-]{36}@apps_vw-dilab_com/, '<client>');
    step(`  ${init?.method ?? 'GET'} ${target.host}`, `${path} → ${response.status}`);
    return response;
  },
});
const saved = {};
const client = createSkodaClient({
  http,
  credentials: { email, password },
  session: { get: () => saved, set: (partial) => Object.assign(saved, partial) },
});
// Only the kind and the HTTP status: nothing that came back.
const describe = (err) =>
  `${err.kind ?? err.name ?? 'error'}${err.status !== undefined ? ` (HTTP ${err.status})` : ''}`;

try {
  step('Account', fakeAccount ? 'fake (expect "auth")' : 'from MYSKODA_EMAIL');
  await client.connect();
  step('Sign-in + token exchange', 'OK');
  if (process.argv.includes('--vehicles')) {
    const garage = await client.garage();
    step('Vehicles', String(garage.length));
    for (const [index, entry] of garage.entries()) {
      const info = vehicleInfo(entry, await client.info(entry.vin));
      step(
        `Car ${index + 1}`,
        `${info.model} ${info.modelCode ?? ''}, ${info.capabilities.size} capabilities`,
      );
      for (const endpoint of [
        'charging',
        'air-conditioning',
        'status',
        'driving-range',
        'maintenance',
      ]) {
        try {
          const fields = snapshotOf(endpoint, await client.read(entry.vin, endpoint));
          const known = Object.entries(fields)
            .filter(([key, value]) => value !== undefined && !/latitude|longitude/.test(key))
            .map(([key]) => key);
          step(`  ${endpoint}`, known.join(', ') || 'nothing');
        } catch (err) {
          step(`  ${endpoint}`, describe(err));
        }
      }
    }
  }
} catch (err) {
  step('Failed', describe(err));
  process.exit(fakeAccount && err.kind === 'auth' ? 0 : 1);
}
