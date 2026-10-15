// -----------------------------------------------------------------------------
// Feature names, in the language chosen in the configuration.
//
// A `device` integration does not receive the language of the user (a widget
// request does): feature names follow the `language` setting, and Gladys keeps
// a name once the device is created. Widget contents and action messages use
// multi-language objects instead, so the core picks the viewer's language.
// German says "du", Spanish "usted"; the words are those of the Gladys
// interface where it has them.
// -----------------------------------------------------------------------------

export const NAMES = {
  en: {
    batteryLevel: 'Battery level',
    range: 'Electric range',
    chargingState: 'Charging state',
    plugged: 'Plugged in',
    charging: 'Charging',
    chargePower: 'Charging power',
    chargeTimeRemaining: 'Charging time remaining',
    chargeLimit: 'Charge limit',
    climate: 'Climate control',
    targetTemperature: 'Climate temperature',
    outsideTemperature: 'Outside temperature',
    locked: 'Locked',
    doorsOpen: 'Door open',
    trunkOpen: 'Boot open',
    windowsOpen: 'Window or sunroof open',
    fuelLevel: 'Fuel level',
    fuelRange: 'Fuel range',
    odometer: 'Mileage',
    position: 'GPS position',
  },
  fr: {
    batteryLevel: 'Niveau de batterie',
    range: 'Autonomie électrique',
    chargingState: 'État de la charge',
    plugged: 'Branchée',
    charging: 'Charge',
    chargePower: 'Puissance de charge',
    chargeTimeRemaining: 'Temps de charge restant',
    chargeLimit: 'Limite de charge',
    climate: 'Climatisation',
    targetTemperature: 'Température de climatisation',
    outsideTemperature: 'Température extérieure',
    locked: 'Verrouillée',
    doorsOpen: 'Portière ouverte',
    trunkOpen: 'Coffre ouvert',
    windowsOpen: 'Fenêtre ou toit ouvrant ouvert',
    fuelLevel: 'Niveau de carburant',
    fuelRange: 'Autonomie carburant',
    odometer: 'Kilométrage',
    position: 'Position GPS',
  },
  de: {
    batteryLevel: 'Batteriestand',
    range: 'Elektrische Reichweite',
    chargingState: 'Ladezustand',
    plugged: 'Angeschlossen',
    charging: 'Laden',
    chargePower: 'Ladeleistung',
    chargeTimeRemaining: 'Verbleibende Ladezeit',
    chargeLimit: 'Ladelimit',
    climate: 'Klimatisierung',
    targetTemperature: 'Klimatisierungstemperatur',
    outsideTemperature: 'Außentemperatur',
    locked: 'Verriegelt',
    doorsOpen: 'Tür offen',
    trunkOpen: 'Kofferraum offen',
    windowsOpen: 'Fenster oder Schiebedach offen',
    fuelLevel: 'Kraftstoffstand',
    fuelRange: 'Kraftstoffreichweite',
    odometer: 'Kilometerstand',
    position: 'GPS-Position',
  },
  es: {
    batteryLevel: 'Nivel de batería',
    range: 'Autonomía eléctrica',
    chargingState: 'Estado de la carga',
    plugged: 'Enchufado',
    charging: 'Carga',
    chargePower: 'Potencia de carga',
    chargeTimeRemaining: 'Tiempo de carga restante',
    chargeLimit: 'Límite de carga',
    climate: 'Climatización',
    targetTemperature: 'Temperatura de climatización',
    outsideTemperature: 'Temperatura exterior',
    locked: 'Bloqueado',
    doorsOpen: 'Puerta abierta',
    trunkOpen: 'Maletero abierto',
    windowsOpen: 'Ventanilla o techo abierto',
    fuelLevel: 'Nivel de combustible',
    fuelRange: 'Autonomía de combustible',
    odometer: 'Kilometraje',
    position: 'Posición GPS',
  },
};

/** Feature name in one language. */
export function t(language, key) {
  const table = NAMES[language] ?? NAMES.en;
  const name = table[key];
  if (!name) throw new Error(`Unknown text key: ${key}`);
  return name;
}
