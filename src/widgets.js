// -----------------------------------------------------------------------------
// Dashboard widget `vehicle` (SDK v0.14+, Gladys 5.1+): one car — two tiles,
// a status list, up to four buttons (climate, charge, lock, refresh).
//
// The tiles are bound to the device features once the car is added to Gladys
// (they then move with every published state); before that they show the last
// known value. The status rows and the button labels are computed here: the
// runtime nudges the widget when they change (src/myskoda.js), the TTL is a
// safety net. A command accepted by the cloud is shown as "requested" until
// the car reports it: the cloud accepting it does not mean the car did it.
// There is no unlock button: unlocking is a scene action, off by default.
// Budget of the core: 8 components, 6 tiles, 1 status (10 rows), 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { VEHICLE_FEATURES as F, pluggedOf, rangeOf } from './devices/vehicle.js';
import { MESSAGES, WIDGET_ISSUES, UserError } from './messages.js';
import { WIDGET_KEYS } from './myskoda.js';

export const TEXT = {
  pickDevice: {
    en: 'Choose a vehicle in the widget settings.',
    fr: 'Choisissez un véhicule dans les réglages du widget.',
    de: 'Wähle in den Widget-Einstellungen ein Fahrzeug.',
    es: 'Elija un vehículo en los ajustes del widget.',
  },
  notVehicle: {
    en: 'This device is not a vehicle of this integration.',
    fr: 'Cet appareil n’est pas un véhicule de cette intégration.',
    de: 'Dieses Gerät ist kein Fahrzeug dieser Integration.',
    es: 'Este dispositivo no es un vehículo de esta integración.',
  },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  range: { en: 'Range', fr: 'Autonomie', de: 'Reichweite', es: 'Autonomía' },
  fuel: { en: 'Fuel', fr: 'Carburant', de: 'Kraftstoff', es: 'Combustible' },
  mileage: { en: 'Mileage', fr: 'Kilométrage', de: 'Kilometerstand', es: 'Kilometraje' },
  charge: { en: 'Charge', fr: 'Charge', de: 'Laden', es: 'Carga' },
  plugged: { en: 'Plugged in', fr: 'Branchée', de: 'Angeschlossen', es: 'Enchufado' },
  unplugged: { en: 'Unplugged', fr: 'Débranchée', de: 'Nicht angeschlossen', es: 'Desenchufado' },
  conserving: {
    en: 'Plugged in, target reached',
    fr: 'Branchée, limite atteinte',
    de: 'Angeschlossen, Ziel erreicht',
    es: 'Enchufado, límite alcanzado',
  },
  chargeLimit: {
    en: 'Charge limit',
    fr: 'Limite de charge',
    de: 'Ladelimit',
    es: 'Límite de carga',
  },
  climate: { en: 'Climate', fr: 'Climatisation', de: 'Klimatisierung', es: 'Climatización' },
  on: { en: 'On', fr: 'En marche', de: 'Ein', es: 'Encendida' },
  requested: {
    en: 'Requested, waiting for the car',
    fr: 'Demandé, en attente de la voiture',
    de: 'Angefragt, wartet auf das Auto',
    es: 'Solicitado, esperando al coche',
  },
  locks: { en: 'Doors', fr: 'Portes', de: 'Türen', es: 'Puertas' },
  locked: { en: 'Locked', fr: 'Verrouillées', de: 'Verriegelt', es: 'Bloqueadas' },
  unlocked: { en: 'Unlocked', fr: 'Déverrouillées', de: 'Entriegelt', es: 'Desbloqueadas' },
  open: {
    en: 'Door or boot open',
    fr: 'Portière ou coffre ouvert',
    de: 'Tür oder Kofferraum offen',
    es: 'Puerta o maletero abierto',
  },
  windowOpen: {
    en: 'Window open',
    fr: 'Fenêtre ouverte',
    de: 'Fenster offen',
    es: 'Ventanilla abierta',
  },
  account: { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta' },
  lastRequest: {
    en: 'Last request',
    fr: 'Dernière demande',
    de: 'Letzte Anfrage',
    es: 'Última solicitud',
  },
  unconfirmed: {
    en: 'Not reported by the car',
    fr: 'Pas signalée par la voiture',
    de: 'Vom Auto nicht gemeldet',
    es: 'No confirmada por el coche',
  },
  lastUpdate: {
    en: 'Last update',
    fr: 'Dernier relevé',
    de: 'Letzte Meldung',
    es: 'Última actualización',
  },
  startClimate: {
    en: 'Start climate',
    fr: 'Lancer la clim',
    de: 'Klima starten',
    es: 'Encender clima',
  },
  stopClimate: {
    en: 'Stop climate',
    fr: 'Arrêter la clim',
    de: 'Klima stoppen',
    es: 'Apagar clima',
  },
  startCharge: {
    en: 'Start charging',
    fr: 'Lancer la charge',
    de: 'Laden starten',
    es: 'Iniciar carga',
  },
  stopCharge: {
    en: 'Stop charging',
    fr: 'Arrêter la charge',
    de: 'Laden stoppen',
    es: 'Parar carga',
  },
  lock: { en: 'Lock', fr: 'Verrouiller', de: 'Verriegeln', es: 'Bloquear' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  map: { en: 'Map', fr: 'Carte', de: 'Karte', es: 'Mapa' },
};

function message(text) {
  return { ttl_seconds: 300, components: [{ type: 'text', variant: 'body', text }] };
}

/** "13/10 14:05": when the car last sent its state, in every language. */
export function formatUpdated(ms, timeZone) {
  if (!Number.isFinite(ms)) return '—';
  const format = (locale) =>
    new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(ms));
  return { en: format('en-GB'), fr: format('fr-FR'), de: format('de-DE'), es: format('es-ES') };
}

const decimal = (value) => String(value).replace('.', ',');

function chargeRow(snapshot, pending) {
  if (pending.has(F.CHARGING)) {
    return { label: TEXT.charge, icon: 'zap', value: TEXT.requested, color: WIDGET_COLORS.INFO };
  }
  const plugged = pluggedOf(snapshot);
  if (snapshot.charging === true) {
    const minutes = snapshot.chargeRemainingMin;
    const left =
      Number.isFinite(minutes) && minutes > 0
        ? ` ${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')}`
        : '';
    const power =
      Number.isFinite(snapshot.chargePowerKw) && snapshot.chargePowerKw > 0
        ? `, ${Math.round(snapshot.chargePowerKw * 10) / 10} kW`
        : '';
    return {
      label: TEXT.charge,
      icon: 'zap',
      value: {
        en: `Charging${left ? `,${left} left` : ''}${power}`,
        fr: `En charge${left ? `, reste${left}` : ''}${decimal(power)}`,
        de: `Lädt${left ? `, noch${left}` : ''}${decimal(power)}`,
        es: `Cargando${left ? `, quedan${left}` : ''}${decimal(power)}`,
      },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (plugged === true) {
    return {
      label: TEXT.charge,
      icon: 'battery',
      value: snapshot.chargeState === 'CONSERVING' ? TEXT.conserving : TEXT.plugged,
      color: WIDGET_COLORS.INFO,
    };
  }
  if (plugged === false) {
    return {
      label: TEXT.charge,
      icon: 'battery',
      value: TEXT.unplugged,
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return { label: TEXT.charge, icon: 'battery', value: '—', color: WIDGET_COLORS.NEUTRAL };
}

function climateRow(snapshot, pending) {
  if (pending.has(F.CLIMATE) || pending.has(F.TARGET_TEMPERATURE)) {
    return { label: TEXT.climate, icon: 'wind', value: TEXT.requested, color: WIDGET_COLORS.INFO };
  }
  const setpoint = Number.isFinite(snapshot.targetTempC) ? snapshot.targetTempC : null;
  const at = (lang) =>
    setpoint === null ? '' : ` (${lang === 'en' ? setpoint : decimal(setpoint)} °C)`;
  if (snapshot.climateOn === true) {
    return {
      label: TEXT.climate,
      icon: 'wind',
      value: {
        en: `${TEXT.on.en}${at('en')}`,
        fr: `${TEXT.on.fr}${at('fr')}`,
        de: `${TEXT.on.de}${at('de')}`,
        es: `${TEXT.on.es}${at('es')}`,
      },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    label: TEXT.climate,
    icon: 'wind',
    value:
      snapshot.climateOn === false
        ? {
            en: `Off${at('en')}`,
            fr: `Arrêtée${at('fr')}`,
            de: `Aus${at('de')}`,
            es: `Apagada${at('es')}`,
          }
        : '—',
    color: WIDGET_COLORS.NEUTRAL,
  };
}

function locksRow(snapshot, pending) {
  if (pending.has(F.LOCKED)) {
    return { label: TEXT.locks, icon: 'lock', value: TEXT.requested, color: WIDGET_COLORS.INFO };
  }
  const opened = snapshot.doorsOpen === true || snapshot.trunkOpen === true;
  return {
    label: TEXT.locks,
    icon: snapshot.locked === false ? 'unlock' : 'lock',
    value: opened
      ? TEXT.open
      : snapshot.windowsOpen === true
        ? TEXT.windowOpen
        : snapshot.locked === true
          ? TEXT.locked
          : snapshot.locked === false
            ? TEXT.unlocked
            : '—',
    color:
      opened || snapshot.windowsOpen === true || snapshot.locked === false
        ? WIDGET_COLORS.WARNING
        : WIDGET_COLORS.SUCCESS,
  };
}

/** When the car last sent something to the cloud. */
const lastUpdate = (snapshot) => {
  const times = [
    snapshot.statusUpdatedAt,
    snapshot.chargingUpdatedAt,
    snapshot.climateUpdatedAt,
  ].filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : undefined;
};

/** The content of the widget for one car (see vehicleView in src/myskoda.js). */
export function vehicleContent(view, { timeZone } = {}) {
  const { device, created, caps, snapshot, pending, lastCommand, issue } = view;
  const ref = (key) => `${device.external_id}:${key}`;
  const createdIds = new Set((created?.features ?? []).map((f) => f.external_id));
  // A tile bound to a feature Gladys does not have shows nothing: inline value then.
  const tile = (key, label, icon, value, unit) =>
    createdIds.has(ref(key))
      ? { type: 'value', label, icon, device_feature: ref(key) }
      : {
          type: 'value',
          label,
          icon,
          value: Number.isFinite(value) ? Math.round(value) : '—',
          ...(Number.isFinite(value) ? { unit } : {}),
        };

  const components = caps.charging
    ? [
        tile(F.BATTERY_LEVEL, TEXT.battery, 'battery', snapshot.batteryLevel, '%'),
        tile(F.RANGE, TEXT.range, 'navigation', rangeOf(snapshot), 'km'),
      ]
    : [
        ...(Number.isFinite(snapshot.fuelLevel)
          ? [tile(F.FUEL_LEVEL, TEXT.fuel, 'droplet', snapshot.fuelLevel, '%')]
          : []),
        ...(Number.isFinite(snapshot.fuelRangeKm)
          ? [tile(F.FUEL_RANGE, TEXT.range, 'navigation', snapshot.fuelRangeKm, 'km')]
          : [tile(F.ODOMETER, TEXT.mileage, 'activity', snapshot.odometerKm, 'km')]),
      ];

  const items = [];
  if (caps.charging) items.push(chargeRow(snapshot, pending));
  if (caps.chargeLimit && Number.isFinite(snapshot.chargeLimit)) {
    items.push({
      label: TEXT.chargeLimit,
      icon: 'battery-charging',
      value: pending.has(F.CHARGE_LIMIT) ? TEXT.requested : `${snapshot.chargeLimit} %`,
      color: pending.has(F.CHARGE_LIMIT) ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (caps.climate) items.push(climateRow(snapshot, pending));
  if (
    caps.state &&
    [snapshot.locked, snapshot.doorsOpen, snapshot.trunkOpen, snapshot.windowsOpen].some(
      (value) => value !== undefined,
    )
  ) {
    items.push(locksRow(snapshot, pending));
  }
  if (WIDGET_ISSUES[issue]) {
    items.push({
      label: TEXT.account,
      icon: 'alert-octagon',
      value: WIDGET_ISSUES[issue],
      color: WIDGET_COLORS.DANGER,
    });
  }
  if (lastCommand?.outcome === 'unconfirmed') {
    items.push({
      label: TEXT.lastRequest,
      icon: 'alert-triangle',
      value: TEXT.unconfirmed,
      color: WIDGET_COLORS.WARNING,
    });
  }
  items.push({
    label: TEXT.lastUpdate,
    icon: 'clock',
    value: formatUpdated(lastUpdate(snapshot), timeZone),
    color: WIDGET_COLORS.NEUTRAL,
  });
  components.push({ type: 'status', items });

  // Buttons, most useful first: the core keeps four.
  const buttons = [];
  if (caps.climate) {
    buttons.push(
      snapshot.climateOn === true
        ? { type: 'button', label: TEXT.stopClimate, icon: 'wind', action: { key: 'climate_stop' } }
        : {
            type: 'button',
            label: TEXT.startClimate,
            icon: 'wind',
            // It heats or cools the car on its battery: asks first.
            action: { key: 'climate_start', confirm: true },
          },
    );
  }
  if (caps.charging && snapshot.charging === true) {
    buttons.push({
      type: 'button',
      label: TEXT.stopCharge,
      icon: 'zap-off',
      action: { key: 'charge_stop' },
    });
  } else if (caps.charging && pluggedOf(snapshot) === true) {
    buttons.push({
      type: 'button',
      label: TEXT.startCharge,
      icon: 'zap',
      action: { key: 'charge_start' },
    });
  }
  if (caps.lock && view.spin && snapshot.locked === false) {
    buttons.push({
      type: 'button',
      label: TEXT.lock,
      icon: 'lock',
      action: { key: 'lock', confirm: true },
    });
  }
  buttons.push({
    type: 'button',
    label: TEXT.refresh,
    icon: 'refresh-cw',
    action: { key: 'refresh' },
  });
  if (caps.position && Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude)) {
    const lat = snapshot.latitude.toFixed(5);
    const lon = snapshot.longitude.toFixed(5);
    buttons.push({
      type: 'button',
      label: TEXT.map,
      icon: 'map-pin',
      link: { url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}` },
    });
  }
  components.push(...buttons.slice(0, 4));
  return { ttl_seconds: 300, components };
}

// Widget action key → [feature, value].
export const VEHICLE_ACTIONS = {
  climate_start: [F.CLIMATE, 1],
  climate_stop: [F.CLIMATE, 0],
  charge_start: [F.CHARGING, 1],
  charge_stop: [F.CHARGING, 0],
};

/**
 * Widgets, keyed like the manifest. `runtime` is src/myskoda.js.
 * A widget action resolves its toast (multi-language), and throws on failure:
 * the core then shows "Action failed — <message>" in red, the message being
 * one plain string. A widget action does not carry the viewer's language, a
 * widget read does: the last one read is used.
 */
export function createWidgets(runtime, { timeZone = process.env.TZ } = {}) {
  let language = 'fr';
  const fail = (text) => new Error(text[language] ?? text.en);
  return {
    [WIDGET_KEYS.VEHICLE]: {
      async get({ settings, language: viewer } = {}) {
        if (typeof viewer === 'string' && viewer) language = viewer.slice(0, 2);
        if (!settings?.device) return message(TEXT.pickDevice);
        const view = runtime.vehicleView(settings.device);
        if (!view) return message(TEXT.notVehicle);
        return vehicleContent(view, { timeZone });
      },
      async action({ actionKey, settings }) {
        try {
          if (actionKey === 'refresh') {
            await runtime.refresh(settings?.device);
            return MESSAGES.refreshed;
          }
          if (actionKey === 'lock') {
            await runtime.access(settings?.device, 'lock');
            return MESSAGES.commandSent;
          }
          const order = VEHICLE_ACTIONS[actionKey];
          if (!order) throw new Error(`Unknown action: ${actionKey}`);
          const [feature, value] = order;
          await runtime.order(settings?.device, feature, value);
          return MESSAGES.commandSent;
        } catch (err) {
          if (err instanceof UserError) throw fail(err.text);
          throw err;
        }
      },
    },
  };
}
