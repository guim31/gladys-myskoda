# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Škoda cars of a MySkoda account (Škoda ID) in Gladys: one device per car,
  with the battery level, electric range, charging state, plugged in, charging,
  charging power and time remaining, charge limit, climate control and its
  temperature, outside temperature, locked, door, boot and window open, fuel
  level and range, mileage — each car gets what its services offer.
- The GPS position of each car, off by default.
- Commands: start / stop charging, charge limit (50 to 100 %), climate control
  on / off and its temperature. A command accepted by the cloud is held until
  the car reports it (ten minutes at most).
- Locking with the S-PIN (scene action and widget button); unlocking only as a
  scene action, off by default ("Allow unlocking" in the configuration).
- Scene trigger "Charge finished", with the battery level and the electric
  range.
- Scene actions "Refresh a Škoda", "Lock a Škoda" and "Unlock a Škoda".
- Dashboard widget "My Škoda": battery, range, charge, climate, doors, last
  update, and buttons to act on the car.
- Configuration actions "Test the connection" and "Check the S-PIN".
- Clear statuses when the sign-in cannot go on: e-mail address unknown to Škoda
  (the password is then never sent), Škoda ID not activated, terms to accept
  in the app, too many attempts.
- Reads on the integration's own timer, every 15 to 120 minutes (30 by
  default), under 30 calls an hour per account; the car is never woken up.
- Texts in English, French, German and Spanish, and a documentation in the four
  languages.

[Unreleased]: https://github.com/guim31/gladys-myskoda/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-myskoda/releases/tag/v1.0.1
