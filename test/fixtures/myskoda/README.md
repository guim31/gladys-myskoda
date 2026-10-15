# MySkoda fixtures

Real answers of the MySkoda cloud, taken from the test fixtures of
[skodaconnect/myskoda](https://github.com/skodaconnect/myskoda) (MIT License, Copyright 2024
Frederick Gnodtke), already anonymized there and anonymized further here:

- one directory per car, one file per endpoint (`info`, `charging`, `air-conditioning`, `status`,
  `driving-range`, `maintenance`, `positions`), extracted from the library's `fixtures/*.yaml`;
- `errors.json`: the HTTP status the cloud answered for an endpoint of that car;
- VINs replaced by `TMBMOCK000000000x`, plates by `XX-00x-XX`, positions moved to invented
  coordinates; addresses, service partners and picture URLs removed;
- `garage.json`: the car list of the account, built from the cars above in the format of the
  library's `tests/fixtures/mqtt/vehicles.json`;
- `verify-spin-*.json`: the S-PIN check answers of the library's tests;
- `auth/`: the `window._IDK` script of the two sign-in pages of the library's
  `tests/fixtures/auth/` (kept as the server sends them, hence excluded from Prettier).

| Directory       | Car of the library fixture                                         |
| --------------- | ------------------------------------------------------------------ |
| `enyaq`         | `enyaq_2024_5AZJK2_85` (electric, unplugged)                       |
| `elroq`         | `elroq_2025_PYLJK2_85` (electric, plugged in, limit 100 %)         |
| `enyaq-plugged` | `sonar98_enyaq_2022_5AZJJ2_80` (electric, ready for charging)      |
| `kodiaq-phev`   | `kodiaq_iv_2024_ps7dyc_selection` (plug-in hybrid, charging)       |
| `octavia-phev`  | `octavia_iv_2022_nx34vc_liftback_style` (plug-in hybrid, charging) |
| `citigo`        | `citigoe_iv_2020_ne132e2` (electric)                               |
| `kamiq`         | `kamiq_2021_NW44KD_crossover` (petrol)                             |
| `kodiaq-tdi`    | `kodiaq_2024_ps7d6z_exclusive` (diesel)                            |
| `karoq-expired` | `karoq_2022_nu74nv_se_l_expired_subscription` (services expired)   |
