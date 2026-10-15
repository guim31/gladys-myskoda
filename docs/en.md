# MySkoda

Follow your Škoda cars in Gladys: battery, range and charging of the electric and plug-in hybrid
cars, climate control, locks, doors and windows, fuel, mileage, and the position if you want it. The
integration uses the cloud of the **MySkoda** app, like the official app and the Home Assistant
integration `myskoda`.

Not affiliated with Škoda Auto. Developed without the hardware: feedback welcome.

## Requirements

- Gladys 5.1.0 or later.
- A car added to a **MySkoda** account (Škoda ID), visible in the official app, with its connected
  services active: Enyaq, Elroq, Citigo e iV, Superb / Octavia / Kodiaq iV plug-in hybrids, and the
  connected petrol, diesel and CNG cars (Octavia, Superb, Kodiaq, Karoq, Kamiq…), each with what the
  cloud gives for it.
- The e-mail address and password of the account, and its **S-PIN** if you want to lock the car.

## Configuration

In Gladys, **Integrations → MySkoda → Configuration**:

| Field                         | What to enter                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| E-mail address                | The address of your Škoda ID, the one you sign in to the app with.                                        |
| Password                      | Its password. It is used to sign in only: the session it opens is then kept in the integration's storage. |
| S-PIN                         | Optional: the 4-digit S-PIN of the app, only to lock (or unlock) the car.                                 |
| Language of the feature names | French by default. Gladys keeps a name once the device is created.                                        |
| Refresh interval              | How often the cloud is read: every 15, 30 (default), 60 or 120 minutes.                                   |
| Share the GPS position        | Off by default. On: the parking position of each car is read and shown.                                   |
| Allow unlocking               | Off by default. On: the "Unlock a Škoda" scene action works (see Locking and unlocking).                  |

Save, then click **Test the connection**: it lists the cars of the account, or says in red what is
wrong. **Check the S-PIN** checks the saved S-PIN (a wrong one counts as a failed try). Then open the
**Discovery** tab and add your cars.

## Devices

One device per car, named after the model and the plate (e.g. "Škoda Enyaq (AB-123-CD)"). Each car
gets the features its services offer:

| Feature                 | Meaning                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Battery level           | State of charge, in % (electric and plug-in hybrid cars).                                                   |
| Electric range          | Range on the battery, in km.                                                                                |
| Charging state          | Charging, plugged in, target reached, unplugged (Gladys charging station states).                           |
| Plugged in              | 1 when a cable is connected.                                                                                |
| Charging                | 1 while the car charges. A command: on starts the charge, off stops it.                                     |
| Charging power          | In kW, while charging (cars that report it).                                                                |
| Charging time remaining | In minutes, while charging (cars that report it).                                                           |
| Charge limit            | The level the charge stops at, 50 to 100 % by tens. A command (Enyaq, Elroq, recent plug-in hybrids).       |
| Climate control         | 1 while the car heats or cools its cabin. A command: on starts it at the climate temperature, off stops it. |
| Climate temperature     | The temperature of the climate control, 15.5 to 30 °C by halves. A command, saved in the car.               |
| Outside temperature     | In °C (cars that report it).                                                                                |
| Locked                  | 1 when the car is locked. Read only: locking is a scene action.                                             |
| Door open / Boot open   | 1 when a door, or the boot, is open.                                                                        |
| Window or sunroof open  | 1 when a window or the sunroof is open.                                                                     |
| Fuel level / Fuel range | In % and km (petrol, diesel, CNG and plug-in hybrid cars).                                                  |
| Mileage                 | In km.                                                                                                      |
| GPS position            | "latitude, longitude", only when the GPS position is on.                                                    |

**A command accepted by the cloud is not a command carried out by the car.** The car does it on its
own, often a minute or two later. The integration holds the requested value for up to ten minutes,
reads the car again two and six minutes after the command, and then publishes what the car reports.
When the car never reports it, the real state comes back and the widget says "Not reported by the
car".

## Widget

**My Škoda** (choose the vehicle in its settings): battery and range (fuel and range for a petrol or
diesel car), a status list (charge, charge limit, climate, doors, last update) and up to four buttons,
labelled with what a tap does now: start the climate (asks for confirmation) or stop it, start or
stop charging, lock (when the car is unlocked and an S-PIN is saved; asks for confirmation), refresh.
A command shows "Requested, waiting for the car" until the car reports it. There is never an unlock
button.

## Scene trigger

**Charge finished**: the car stopped charging while still plugged in (charge limit reached, or
stopped by the car or the charger). Optional filter: the vehicle. Variables: battery level (%) and
electric range (km). A charge stopped from Gladys does not fire it.

Plugged in, unplugged, battery under a threshold: use the device features in a "device state"
trigger, they already do it.

## Scene actions

- **Refresh a Škoda**: reads the state the car last sent to the cloud now (it does not wake the car),
  and gives the battery level, the electric range, plugged in, charging and locked to the next
  actions.
- **Lock a Škoda**: asks the car to lock, with the S-PIN of the configuration.
- **Unlock a Škoda**: only when "Allow unlocking" is on; asks the car to unlock, with the S-PIN.

The charge, the charge limit, the climate and its temperature are device features: a scene sets them
with "Control a device".

## Scene examples

- **Warm car at 7:30 on weekdays**: at 7:15, Monday to Friday, set Climate temperature to 21 and
  Climate control to on.
- **Charge during off-peak hours**: at 22:00, if Plugged in is 1, set Charging to on; at 6:00, set it
  to off. Or set the Charge limit to 100 % before a long trip, back to 80 % afterwards.
- **Locked every night**: at 23:00, "Refresh a Škoda", then if the locked output is false, "Lock a
  Škoda" and send a message "The car was unlocked: lock requested".
- **Charge finished**: send a message "The Enyaq is charged ({{triggerEvent.data.battery_level}} %)".

## Locking and unlocking

Locking and unlocking need the **S-PIN** of the MySkoda app, entered in the configuration. They are
never device switches: a dashboard toggle or a voice assistant cannot open the car.

- **Locking**: the "Lock a Škoda" scene action and the widget button (asks for confirmation).
- **Unlocking**: off by default. Turn on "Allow unlocking" only if a scene needs it; then the "Unlock
  a Škoda" scene action works. A scene that unlocks the car can leave it open: think twice.
- **A wrong S-PIN** counts as a failed try on the account, and the cloud locks the S-PIN after a few
  of them. Once refused, the integration never sends it again until you save the configuration with
  the right one.

## Refresh and cloud quota

The integration reads the cloud on its own timer (it does not rely on Gladys polling). Each read
returns the state the car last sent to the cloud: it **never wakes the car** (the wake-up of the app,
limited to a few a day and hard on the 12 V battery, is never used). A car sends its state when it is
switched off, while it charges and after a command; parked and asleep, it may stay hours without
news, whatever the refresh chosen.

A read costs one call per service the car offers (charge, climate, status, range: 1 to 4), plus the
mileage once an hour and the position if it is on. The VW Group publishes no quota but answers "too
many requests" to clients that call too often: the integration stays under **30 calls an hour per
account** (Home Assistant reads every 30 minutes by default), spacing the reads out beyond the chosen
refresh with several cars. After a "too many requests", the reads pause for 30 minutes. A value that
does not change is sent to Gladys again every 12 hours, so it never shows as stale.

## Privacy and stored data

- The password and the S-PIN stay in the Gladys configuration; the password is used to sign in only,
  the S-PIN only to lock or unlock.
- The session (access and refresh tokens of the MySkoda cloud) is stored in the integration's `/data`
  volume, file readable by the integration only. None of it, nor the e-mail address, the S-PIN, the
  VIN, the plate or the position, ever appears in the logs.
- The GPS position is off by default; when off, it is never read.
- The integration talks to the VW Group sign-in service (identity.vwgroup.io) and to the MySkoda
  cloud (mysmob.api.connect.skoda-auto.cz) only.

## Troubleshooting

- **"Škoda does not know this e-mail address"**: the identity service has no Škoda ID for it (it
  offered to create one). Enter the address you sign in to the MySkoda app with, then save; the
  password is not sent for an unknown address.
- **"Your Škoda ID is not activated yet"**: confirm it with the e-mail Škoda sent, then save again.
- **"The account refused the sign-in"**: check the e-mail address and the password (the ones of the
  app), then save. The integration does not try again on its own, to avoid locking the account.
- **"Your account must accept new terms first"**: open the MySkoda app, accept them, then save the
  configuration again.
- **"The sign-in service refuses the connection for now"**: too many attempts; wait a few hours, then
  save again.
- **A car is missing**: check that it appears in the official app with the same account. A car whose
  connected services expired offers nothing and is not shown.
- **A feature is missing**: the car does not offer it (guest user, services of the model), or never
  sent the value. A service the cloud refuses at the first read is no longer read until a restart.
- **"The S-PIN was refused"**: correct it in the configuration and save; "Check the S-PIN" tells the
  tries left.
- **Old values**: the car has not sent its state since (asleep, no network where it is parked). The
  "Last update" row of the widget gives the date of the last state.
- More details: set `LOG_LEVEL=debug` on the container.

## Limits

- Developed without a car or an account, from the protocol and the real answers collected by
  `skodaconnect/myskoda`: feedback welcome on the forum or in the issues.
- No live events: the MySkoda app receives changes by MQTT through Google Firebase; the integration
  reads the cloud on a timer instead.
- No auxiliary heating (fuel-burning heater), no horn or lights, no departure timers or charging
  profiles, no trip statistics.
- The commands go through the Škoda cloud: when it is down, nothing works, and it may change without
  notice.
- The position is published as text; no distance from home.

## Credits

The protocol (sign-in, endpoints, payloads) and the test fixtures come from
[skodaconnect/myskoda](https://github.com/skodaconnect/myskoda) (MIT), the library of the Home
Assistant integration [skodaconnect/homeassistant-myskoda](https://github.com/skodaconnect/homeassistant-myskoda)
(MIT), whose behaviour (refresh interval, entities, sanity bounds) was followed.
