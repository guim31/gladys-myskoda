# MySkoda for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that follows Škoda
connected cars — Enyaq, Elroq, Citigo e iV, Superb / Octavia / Kodiaq iV plug-in hybrids, and the
connected petrol, diesel and CNG cars — through the cloud of the **MySkoda** app.

**Not affiliated with Škoda Auto or the Volkswagen Group.** Škoda, MySkoda and Škoda ID are
trademarks of their owners. **Developed without the hardware: feedback welcome.** No car and no
account were available while writing it: the protocol and the test fixtures come from
[skodaconnect/myskoda](https://github.com/skodaconnect/myskoda), whose answers were collected from
real cars.

## What it does

- **One Gladys device per car** (keyed on the VIN), named after its model and plate: battery level,
  electric range, charging state, plugged in, charging, charging power and time remaining, charge
  limit, climate control and its temperature, outside temperature, locked, door / boot / window
  open, fuel level and range, mileage, and the GPS position — **off by default**, for privacy. Each
  car only gets what its services offer.
- **Commands**: start / stop charging, charge limit (50 to 100 %), climate control on / off and its
  temperature. A command accepted by the cloud is not a command carried out by the car: the
  requested value is held until the car reports it (ten minutes at most), and the widget says
  "requested, waiting for the car".
- **Locking** with the S-PIN of the app (scene action, widget button). **Unlocking is off by
  default** and never a switch: only a scene action, once "Allow unlocking" is turned on.
- **Scene trigger** "Charge finished" (the car stopped charging, still plugged in), with the battery
  level and the electric range as variables.
- **Scene actions** "Refresh a Škoda" (fresh values for the next actions), "Lock a Škoda", "Unlock a
  Škoda".
- **Dashboard widget** "My Škoda": battery, range, charge, charge limit, climate, doors, last update,
  and buttons to act on the car.

Everything is described for users in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## Requirements

- Gladys **5.1.0** or later.
- A car added to a MySkoda account (Škoda ID) with its connected services active, the e-mail
  address and password of that account, and its S-PIN to lock the car.

## Installation

In Gladys: **Integrations → Install from GitHub**, paste `https://github.com/guim31/gladys-myskoda`,
then open the integration's **Configuration**: e-mail address, password, optionally the S-PIN,
**Save**, **Test the connection**. Add the cars from the **Discovery** tab.

## How it works

- **Sign-in** (VW Group identity service, OAuth2 with PKCE, as the MySkoda Android app does): login
  page, e-mail address, password, then the authorization code is exchanged at the MySkoda cloud for
  an access token (1 hour) and a refresh token (about 6 months), kept in `/data/myskoda.json` (mode 0600) with a salted fingerprint of the credentials. The password is only used again when the
  refresh token is refused. A refused password, a throttled account or new terms to accept stop
  every attempt until the configuration is saved again (insisting could lock the account).
- **Reads** return the state each car last sent to the cloud: they never wake the car (the wake-up
  endpoint, limited to a few calls a day, is never called). The container reads on its own timer
  (Gladys 5.2 does not poll external devices reliably, GladysAssistant/Gladys#3198); `onPoll` is a
  fallback that never calls the cloud. One read is one call per service of the car (charging,
  air-conditioning, vehicle-status, driving-range), plus the mileage once an hour and the position
  when it is on. The VW Group publishes no quota: the integration stays under 30 calls an hour per
  account (15 to 120 minutes, 30 by default like Home Assistant, stretched with several cars), and a
  429 pauses the reads for 30 minutes. A service refused at the first read (403, 404) is dropped
  until a restart.
- **S-PIN**: sent only to lock or unlock, and with "Check the S-PIN". Once the cloud refuses it, it
  is never sent again until the configuration is saved (each wrong S-PIN counts as a failed try).
- Only the changes are published (`publishChangedStates`), plus a 12-hour heartbeat; the logs stay
  quiet at info level during normal operation (`LOG_LEVEL=debug` for the details), never show a
  secret, the e-mail address, the S-PIN, a full VIN, a plate or a position.

## Limits

- No live events: the MySkoda app gets them by MQTT, authenticated through Google Firebase Cloud
  Messaging; that heavy machinery was left out, the cloud is read on a timer instead.
- No auxiliary heating (a fuel-burning heater, deliberately left out), no horn or lights, no
  departure timers, charging profiles, trip statistics or charge history.
- Everything goes through the Škoda cloud: when it is down or changes, the integration stops working
  until it is fixed.
- The GPS position is published as text (no "distance from home").

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .   # store checks (from a clone)
```

The tests run against the fake Gladys of the SDK and a fake Škoda cloud
([`test/helpers/fakeSkoda.js`](test/helpers/fakeSkoda.js): sign-in pages with cookies, CSRF and
PKCE, token exchange and refresh, data and command endpoints) answering with the fixtures of
skodaconnect/myskoda ([`test/fixtures/myskoda/`](test/fixtures/myskoda/README.md)). To check the
sign-in against the real service (read only, nothing sensitive is printed):

```bash
node scripts/probe.mjs                                          # a fake account: every step until "auth"
MYSKODA_EMAIL=… MYSKODA_PASSWORD=… node scripts/probe.mjs --vehicles   # a real account, read only
```

Project rules for contributors and coding assistants: [`CLAUDE.md`](CLAUDE.md). Versions are set by
the Release workflow (**Actions → Release**), never by hand. A hand-pushed `vX.Y.Z` tag also builds
the image, but then bump `version` in `package.json` and in the manifest (with the `docker_image`
tag) and commit them **before** tagging.

## Credits

- [skodaconnect/myskoda](https://github.com/skodaconnect/myskoda) (MIT License, Copyright 2024
  Frederick Gnodtke): the sign-in flow, the client id of the app, the endpoints, the payloads and the
  test fixtures, ported to JavaScript here.
- The Home Assistant integration
  [skodaconnect/homeassistant-myskoda](https://github.com/skodaconnect/homeassistant-myskoda) (MIT
  License, Copyright 2026 The MySkoda Authors): the entities exposed, the refresh interval, the
  sanity bounds (mileage, outside temperature) and the capability rules (charge limit).

## License

[Apache-2.0](LICENSE)
