// -----------------------------------------------------------------------------
// Texts the runtime sends to Gladys: connection statuses, action results,
// command refusals. Multi-language objects: the core and the browser pick the
// user's language. Kept short: an action toast is cut at 200 characters.
// German says "du", Spanish "usted".
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './myskoda/errors.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the e-mail address and password of your MySkoda account.',
    fr: 'Saisissez l’adresse e-mail et le mot de passe de votre compte MySkoda.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines MySkoda-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta MySkoda.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'The account refused the sign-in: check the e-mail address and the password, then save.',
    fr: 'Le compte a refusé la connexion : vérifiez l’adresse e-mail et le mot de passe, puis enregistrez.',
    de: 'Das Konto hat die Anmeldung abgelehnt: Prüfe E-Mail-Adresse und Passwort und speichere dann.',
    es: 'La cuenta ha rechazado el inicio de sesión: revise el correo y la contraseña, y guarde.',
  },
  [ERROR_KINDS.UNKNOWN_ACCOUNT]: {
    en: 'Škoda does not know this e-mail address: enter the one of your Škoda ID (MySkoda app), then save.',
    fr: 'Škoda ne connaît pas cette adresse e-mail : saisissez celle de votre Škoda ID (appli MySkoda), puis enregistrez.',
    de: 'Škoda kennt diese E-Mail-Adresse nicht: Gib die deiner Škoda ID (MySkoda-App) ein und speichere dann.',
    es: 'Škoda no conoce este correo electrónico: introduzca el de su Škoda ID (app MySkoda) y guarde.',
  },
  [ERROR_KINDS.ACCOUNT_INACTIVE]: {
    en: 'Your Škoda ID is not activated yet: confirm it with the e-mail Škoda sent you, then save again.',
    fr: 'Votre Škoda ID n’est pas encore activé : confirmez-le avec l’e-mail envoyé par Škoda, puis enregistrez à nouveau.',
    de: 'Deine Škoda ID ist noch nicht aktiviert: Bestätige sie mit der E-Mail von Škoda und speichere dann erneut.',
    es: 'Su Škoda ID aún no está activado: confírmelo con el correo que le envió Škoda y vuelva a guardar.',
  },
  [ERROR_KINDS.CONSENT]: {
    en: 'Your account must accept new terms first: open the MySkoda app, accept them, then save here again.',
    fr: 'Votre compte doit d’abord accepter de nouvelles conditions : ouvrez l’appli MySkoda, acceptez-les, puis enregistrez à nouveau ici.',
    de: 'Dein Konto muss zuerst neue Bedingungen annehmen: Öffne die MySkoda-App, nimm sie an und speichere hier erneut.',
    es: 'Su cuenta debe aceptar primero nuevas condiciones: abra la app MySkoda, acéptelas y vuelva a guardar aquí.',
  },
  [ERROR_KINDS.BLOCKED]: {
    en: 'The sign-in service refuses the connection for now (too many attempts). Wait a few hours, then save again.',
    fr: 'Le service de connexion refuse pour le moment (trop de tentatives). Patientez quelques heures, puis enregistrez à nouveau.',
    de: 'Der Anmeldedienst lehnt die Verbindung gerade ab (zu viele Versuche). Warte einige Stunden und speichere dann erneut.',
    es: 'El servicio de inicio de sesión rechaza la conexión por ahora (demasiados intentos). Espere unas horas y guarde de nuevo.',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'The Škoda cloud asks to slow down: reads resume in 30 minutes.',
    fr: 'Le cloud Škoda demande de ralentir : les relevés reprennent dans 30 minutes.',
    de: 'Die Škoda-Cloud bittet um weniger Anfragen: Die Abfragen laufen in 30 Minuten weiter.',
    es: 'La nube de Škoda pide reducir las solicitudes: las lecturas se reanudan en 30 minutos.',
  },
  [ERROR_KINDS.SPIN_MISSING]: {
    en: 'This command needs the S-PIN of the MySkoda app: enter it in the configuration.',
    fr: 'Cette commande demande le S-PIN de l’appli MySkoda : saisissez-le dans la configuration.',
    de: 'Dieser Befehl braucht die S-PIN der MySkoda-App: Gib sie in der Konfiguration ein.',
    es: 'Este comando necesita el S-PIN de la app MySkoda: introdúzcalo en la configuración.',
  },
  [ERROR_KINDS.SPIN]: {
    en: 'The S-PIN was refused: it is no longer sent until you save the right one (each wrong try counts).',
    fr: 'Le S-PIN a été refusé : il n’est plus envoyé tant que vous n’avez pas enregistré le bon (chaque essai faux compte).',
    de: 'Die S-PIN wurde abgelehnt und wird nicht mehr gesendet, bis du die richtige speicherst (jeder Fehlversuch zählt).',
    es: 'El S-PIN ha sido rechazado: no se envía más hasta que guarde el correcto (cada intento fallido cuenta).',
  },
  [ERROR_KINDS.NOT_SUPPORTED]: {
    en: 'This car does not offer this command remotely.',
    fr: 'Cette voiture ne propose pas cette commande à distance.',
    de: 'Dieses Auto bietet diesen Befehl nicht aus der Ferne an.',
    es: 'Este coche no ofrece este comando a distancia.',
  },
  [ERROR_KINDS.ACCESS_DENIED]: {
    en: 'The Škoda cloud refused this command for this car (guest user, or services not active).',
    fr: 'Le cloud Škoda a refusé cette commande pour cette voiture (utilisateur invité, ou services non actifs).',
    de: 'Die Škoda-Cloud hat diesen Befehl für dieses Auto abgelehnt (Gastnutzer oder Dienste nicht aktiv).',
    es: 'La nube de Škoda ha rechazado este comando para este coche (usuario invitado o servicios no activos).',
  },
  [ERROR_KINDS.IN_PROGRESS]: {
    en: 'A request of the same kind is still running on this car: try again in a few minutes.',
    fr: 'Une demande du même type est encore en cours sur cette voiture : réessayez dans quelques minutes.',
    de: 'Eine gleichartige Anfrage läuft noch auf diesem Auto: Versuche es in ein paar Minuten erneut.',
    es: 'Aún hay una solicitud del mismo tipo en curso en este coche: vuelva a intentarlo en unos minutos.',
  },
  unreachable: {
    en: 'The Škoda cloud is unreachable for now, retrying.',
    fr: 'Le cloud Škoda est injoignable pour le moment, nouvel essai en cours.',
    de: 'Die Škoda-Cloud ist gerade nicht erreichbar, neuer Versuch läuft.',
    es: 'La nube de Škoda no está disponible por ahora, nuevo intento en curso.',
  },
  commandSent: {
    en: 'Request accepted by the Škoda cloud. The car carries it out on its own: its next update will tell.',
    fr: 'Demande acceptée par le cloud Škoda. La voiture l’exécute de son côté : sa prochaine mise à jour le dira.',
    de: 'Anfrage von der Škoda-Cloud angenommen. Das Auto führt sie selbst aus: Die nächste Aktualisierung zeigt es.',
    es: 'Solicitud aceptada por la nube de Škoda. El coche la ejecuta por su cuenta: su próxima actualización lo dirá.',
  },
  refreshed: {
    en: 'State read again from the Škoda cloud (the car itself is not woken).',
    fr: 'État relu depuis le cloud Škoda (la voiture elle-même n’est pas réveillée).',
    de: 'Zustand erneut aus der Škoda-Cloud gelesen (das Auto selbst wird nicht geweckt).',
    es: 'Estado leído de nuevo desde la nube de Škoda (el coche en sí no se despierta).',
  },
  notSaved: {
    en: 'No account is saved yet: enter the e-mail address and password, save, then try again.',
    fr: 'Aucun compte n’est encore enregistré : saisissez l’adresse e-mail et le mot de passe, enregistrez, puis réessayez.',
    de: 'Noch kein Konto gespeichert: Gib E-Mail-Adresse und Passwort ein, speichere und versuche es dann erneut.',
    es: 'Todavía no hay ninguna cuenta guardada: introduzca el correo y la contraseña, guarde y vuelva a intentarlo.',
  },
  starting: {
    en: 'The integration is starting: try again in a few seconds.',
    fr: 'L’intégration démarre : réessayez dans quelques secondes.',
    de: 'Die Integration startet: Versuche es in ein paar Sekunden erneut.',
    es: 'La integración se está iniciando: vuelva a intentarlo dentro de unos segundos.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Initialisierung fehlgeschlagen, sieh in den Logs der Integration nach.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  unknownVehicle: {
    en: 'Choose a Škoda of this integration.',
    fr: 'Choisissez une Škoda de cette intégration.',
    de: 'Wähle einen Škoda dieser Integration.',
    es: 'Elija un Škoda de esta integración.',
  },
  noVehicle: {
    en: 'Connected, but the account holds no car: add it in the MySkoda app first.',
    fr: 'Connecté, mais le compte ne contient aucune voiture : ajoutez-la d’abord dans l’appli MySkoda.',
    de: 'Verbunden, aber das Konto enthält kein Auto: Füge es zuerst in der MySkoda-App hinzu.',
    es: 'Conectado, pero la cuenta no tiene ningún coche: añádalo primero en la app MySkoda.',
  },
  unlockDisabled: {
    en: 'Unlocking is off: turn on “Allow unlocking” in the configuration to use it.',
    fr: 'Le déverrouillage est désactivé : activez « Autoriser le déverrouillage » dans la configuration pour l’utiliser.',
    de: 'Das Entriegeln ist aus: Schalte „Entriegeln erlauben“ in der Konfiguration ein, um es zu nutzen.',
    es: 'El desbloqueo está desactivado: active «Permitir el desbloqueo» en la configuración para usarlo.',
  },
  lockUnsupported: {
    en: 'This car cannot be locked or unlocked remotely (no remote access in its services).',
    fr: 'Cette voiture ne peut pas être verrouillée ou déverrouillée à distance (pas d’accès à distance dans ses services).',
    de: 'Dieses Auto lässt sich nicht aus der Ferne ver- oder entriegeln (kein Fernzugriff in seinen Diensten).',
    es: 'Este coche no se puede bloquear ni desbloquear a distancia (sin acceso remoto en sus servicios).',
  },
  spinFormat: {
    en: 'The S-PIN of the configuration is not four digits: correct it, then save.',
    fr: 'Le S-PIN de la configuration ne fait pas quatre chiffres : corrigez-le, puis enregistrez.',
    de: 'Die S-PIN der Konfiguration hat keine vier Ziffern: Korrigiere sie und speichere dann.',
    es: 'El S-PIN de la configuración no tiene cuatro cifras: corríjalo y guarde.',
  },
  spinCorrect: {
    en: 'S-PIN correct.',
    fr: 'S-PIN correct.',
    de: 'S-PIN korrekt.',
    es: 'S-PIN correcto.',
  },
};

// Status rows of the widget, 40 characters at most.
export const WIDGET_ISSUES = {
  [ERROR_KINDS.AUTH]: {
    en: 'Sign-in refused (configuration)',
    fr: 'Connexion refusée (configuration)',
    de: 'Anmeldung abgelehnt (Konfiguration)',
    es: 'Inicio de sesión rechazado',
  },
  [ERROR_KINDS.UNKNOWN_ACCOUNT]: {
    en: 'Unknown e-mail address',
    fr: 'Adresse e-mail inconnue',
    de: 'Unbekannte E-Mail-Adresse',
    es: 'Correo electrónico desconocido',
  },
  [ERROR_KINDS.ACCOUNT_INACTIVE]: {
    en: 'Škoda ID not activated',
    fr: 'Škoda ID non activé',
    de: 'Škoda ID nicht aktiviert',
    es: 'Škoda ID no activado',
  },
  [ERROR_KINDS.CONSENT]: {
    en: 'Terms to accept in the app',
    fr: 'Conditions à accepter dans l’appli',
    de: 'Bedingungen in der App annehmen',
    es: 'Condiciones que aceptar en la app',
  },
  [ERROR_KINDS.BLOCKED]: {
    en: 'Sign-in refused for now',
    fr: 'Connexion refusée pour le moment',
    de: 'Anmeldung gerade abgelehnt',
    es: 'Inicio de sesión rechazado por ahora',
  },
};

/** An Error carrying a multi-language text, for action and widget toasts. */
export class UserError extends Error {
  constructor(text, kind) {
    super(text.en);
    this.text = text;
    if (kind) this.kind = kind;
  }
}

/**
 * A failed manifest action. Thrown, so Gladys shows it in red: the core relays
 * the thrown `message` untouched to the browser, which picks the user's
 * language in a `{ en, fr, de, es }` object. A resolved action is always shown
 * as a success: there is no warning level.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
    this.text = text;
  }
}

/** The multi-language text of a cloud failure, `null` when none fits. */
export function userTextOf(err) {
  if (err instanceof UserError || err instanceof ActionFailure) return err.text;
  if (MESSAGES[err?.kind]) return MESSAGES[err.kind];
  if (err?.kind === ERROR_KINDS.NETWORK || err?.kind === ERROR_KINDS.SERVER) {
    return MESSAGES.unreachable;
  }
  if (err?.kind === ERROR_KINDS.NOT_FOUND) return MESSAGES[ERROR_KINDS.NOT_SUPPORTED];
  return null;
}

/** A text for any failure: the known one, else the cloud's own words. */
export function failureText(err) {
  const known = userTextOf(err);
  if (known) return known;
  const detail = String(err?.message ?? err).slice(0, 120);
  return {
    en: `The Škoda cloud refused the request: ${detail}`,
    fr: `Le cloud Škoda a refusé la requête : ${detail}`,
    de: `Die Škoda-Cloud hat die Anfrage abgelehnt: ${detail}`,
    es: `La nube de Škoda ha rechazado la solicitud: ${detail}`,
  };
}
