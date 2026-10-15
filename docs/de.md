# MySkoda

Verfolge deine Škoda-Autos in Gladys: Batterie, Reichweite und Laden der Elektroautos und
Plug-in-Hybride, Klimatisierung, Verriegelung, Türen und Fenster, Kraftstoff, Kilometerstand und, wenn
du willst, die Position. Die Integration nutzt die Cloud der **MySkoda**-App, wie die offizielle App
und die Home-Assistant-Integration `myskoda`.

Nicht mit Škoda Auto verbunden. Ohne die Hardware entwickelt: Rückmeldungen sind willkommen.

## Voraussetzungen

- Gladys 5.1.0 oder neuer.
- Ein Auto in einem **MySkoda**-Konto (Škoda ID), sichtbar in der offiziellen App, mit aktiven
  vernetzten Diensten: Enyaq, Elroq, Citigo e iV, Plug-in-Hybride Superb / Octavia / Kodiaq iV und die
  vernetzten Benziner, Diesel und Erdgasautos (Octavia, Superb, Kodiaq, Karoq, Kamiq…), jedes mit dem,
  was die Cloud dafür liefert.
- E-Mail-Adresse und Passwort des Kontos und seine **S-PIN**, wenn du das Auto verriegeln willst.

## Konfiguration

In Gladys **Integrationen → MySkoda → Konfiguration**:

| Feld                       | Was einzugeben ist                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| E-Mail-Adresse             | Die Adresse deiner Škoda ID, mit der du dich in der App anmeldest.                                                |
| Passwort                   | Das Passwort dazu. Es dient nur zur Anmeldung: Die geöffnete Sitzung wird danach von der Integration gespeichert. |
| S-PIN                      | Optional: die 4-stellige S-PIN der App, nur zum Verriegeln (oder Entriegeln).                                     |
| Sprache der Funktionsnamen | Standardmäßig Französisch. Gladys behält einen Namen, sobald das Gerät angelegt ist.                              |
| Aktualisierungsintervall   | Wie oft die Cloud gelesen wird: alle 15, 30 (Standard), 60 oder 120 Minuten.                                      |
| GPS-Position teilen        | Standardmäßig aus. Ein: Die Parkposition jedes Autos wird gelesen und angezeigt.                                  |
| Entriegeln erlauben        | Standardmäßig aus. Ein: Die Szenenaktion „Škoda entriegeln“ funktioniert (siehe Verriegeln und Entriegeln).       |

Speichere und klicke dann auf **Verbindung testen**: Der Test listet die Autos des Kontos auf oder sagt in
Rot, was nicht stimmt. **S-PIN prüfen** prüft die gespeicherte S-PIN (eine falsche zählt als
Fehlversuch). Öffne danach den Reiter **Entdecken** und füge deine Autos hinzu.

## Geräte

Ein Gerät pro Auto, benannt nach Modell und Kennzeichen (z. B. „Škoda Enyaq (AB-123-CD)“). Jedes
Auto erhält die Funktionen, die seine Dienste anbieten:

| Funktion                               | Bedeutung                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Batteriestand                          | Ladezustand in % (Elektroautos und Plug-in-Hybride).                                                                               |
| Elektrische Reichweite                 | Reichweite mit der Batterie, in km.                                                                                                |
| Ladezustand                            | Lädt, angeschlossen, Ziel erreicht, nicht angeschlossen (Ladestationszustände von Gladys).                                         |
| Angeschlossen                          | 1, wenn ein Kabel angeschlossen ist.                                                                                               |
| Laden                                  | 1, solange das Auto lädt. Ein Befehl: Ein startet das Laden, Aus stoppt es.                                                        |
| Ladeleistung                           | In kW, beim Laden (Autos, die sie melden).                                                                                         |
| Verbleibende Ladezeit                  | In Minuten, beim Laden (Autos, die sie melden).                                                                                    |
| Ladelimit                              | Der Stand, bei dem das Laden endet, 50 bis 100 % in Zehnerschritten. Ein Befehl (Enyaq, Elroq, neuere Plug-in-Hybride).            |
| Klimatisierung                         | 1, solange das Auto den Innenraum heizt oder kühlt. Ein Befehl: Ein startet sie mit der Klimatisierungstemperatur, Aus stoppt sie. |
| Klimatisierungstemperatur              | Die Temperatur der Klimatisierung, 15,5 bis 30 °C in halben Graden. Ein Befehl, im Auto gespeichert.                               |
| Außentemperatur                        | In °C (Autos, die sie melden).                                                                                                     |
| Verriegelt                             | 1, wenn das Auto verriegelt ist. Nur lesbar: Das Verriegeln ist eine Szenenaktion.                                                 |
| Tür offen / Kofferraum offen           | 1, wenn eine Tür oder der Kofferraum offen ist.                                                                                    |
| Fenster oder Schiebedach offen         | 1, wenn ein Fenster oder das Schiebedach offen ist.                                                                                |
| Kraftstoffstand / Kraftstoffreichweite | In % und km (Benziner, Diesel, Erdgasautos und Plug-in-Hybride).                                                                   |
| Kilometerstand                         | In km.                                                                                                                             |
| GPS-Position                           | „Breitengrad, Längengrad“, nur wenn die GPS-Position eingeschaltet ist.                                                            |

**Ein von der Cloud angenommener Befehl ist kein vom Auto ausgeführter Befehl.** Das Auto führt ihn
selbst aus, oft ein oder zwei Minuten später. Die Integration hält den angefragten Wert bis zu zehn
Minuten, liest das Auto zwei und sechs Minuten nach dem Befehl erneut und veröffentlicht dann, was das
Auto meldet. Meldet das Auto ihn nie, kommt der echte Zustand zurück und das Widget zeigt „Vom Auto
nicht gemeldet“.

## Widget

**Mein Škoda** (wähle das Fahrzeug in seinen Einstellungen): Batterie und Reichweite (Kraftstoff und
Reichweite bei einem Benziner oder Diesel), eine Statusliste (Laden, Ladelimit, Klimatisierung,
Türen, letzte Meldung) und bis zu vier Tasten, beschriftet mit dem, was ein Tippen jetzt bewirkt:
Klima starten (fragt nach Bestätigung) oder stoppen, Laden starten oder stoppen, verriegeln (wenn das
Auto entriegelt ist und eine S-PIN gespeichert ist; fragt nach Bestätigung), aktualisieren. Ein Befehl
zeigt „Angefragt, wartet auf das Auto“, bis das Auto ihn meldet. Eine Taste zum Entriegeln gibt es nie.

## Szenenauslöser

**Laden beendet**: Das Auto hat aufgehört zu laden und ist noch angeschlossen (Ladelimit erreicht oder
vom Auto oder der Ladestation gestoppt). Optionaler Filter: das Fahrzeug. Variablen: Batteriestand (%)
und elektrische Reichweite (km). Ein aus Gladys gestopptes Laden löst ihn nicht aus.

Angeschlossen, nicht angeschlossen, Batterie unter einer Schwelle: Nutze die Funktionen des Geräts in
einem Auslöser „Gerätezustand“, sie können das schon.

## Szenenaktionen

- **Škoda aktualisieren**: liest jetzt den Zustand, den das Auto an die Cloud gesendet hat (ohne es
  zu wecken), und gibt Batteriestand, elektrische Reichweite, angeschlossen, lädt und verriegelt an die
  nächsten Aktionen weiter.
- **Škoda verriegeln**: bittet das Auto, sich zu verriegeln, mit der S-PIN der Konfiguration.
- **Škoda entriegeln**: nur wenn „Entriegeln erlauben“ an ist; bittet das Auto, sich zu entriegeln,
  mit der S-PIN.

Laden, Ladelimit, Klimatisierung und ihre Temperatur sind Funktionen des Geräts: Eine Szene setzt sie
mit „Gerät steuern“.

## Szenenbeispiele

- **Warmes Auto um 7:30 an Werktagen**: um 7:15, Montag bis Freitag, die Klimatisierungstemperatur auf
  21 und die Klimatisierung auf Ein setzen.
- **In der Nebenzeit laden**: um 22:00, wenn Angeschlossen 1 ist, Laden auf Ein setzen; um 6:00 auf
  Aus. Oder das Ladelimit vor einer langen Fahrt auf 100 % setzen und danach wieder auf 80 %.
- **Jede Nacht verriegelt**: um 23:00 „Škoda aktualisieren“, dann, wenn die Ausgabe verriegelt falsch
  ist, „Škoda verriegeln“ und eine Nachricht senden „Das Auto war offen: Verriegeln angefragt“.
- **Laden beendet**: eine Nachricht senden „Der Enyaq ist geladen
  ({{triggerEvent.data.battery_level}} %)“.

## Verriegeln und Entriegeln

Verriegeln und Entriegeln brauchen die **S-PIN** der MySkoda-App, eingegeben in der Konfiguration. Es
sind nie Schalter eines Geräts: Ein Schalter im Dashboard oder ein Sprachassistent kann das Auto nicht
öffnen.

- **Verriegeln**: die Szenenaktion „Škoda verriegeln“ und die Taste im Widget (fragt nach
  Bestätigung).
- **Entriegeln**: standardmäßig aus. Schalte „Entriegeln erlauben“ nur ein, wenn eine Szene es
  braucht; dann funktioniert die Szenenaktion „Škoda entriegeln“. Eine Szene, die das Auto entriegelt,
  kann es offen lassen: Überlege es dir gut.
- **Eine falsche S-PIN** zählt als Fehlversuch auf dem Konto, und die Cloud sperrt die S-PIN nach
  einigen davon. Einmal abgelehnt, sendet die Integration sie nicht mehr, bis du die Konfiguration mit
  der richtigen speicherst.

## Aktualisierung und Cloud-Kontingent

Die Integration liest die Cloud mit ihrem eigenen Timer (sie verlässt sich nicht auf die Abfrage
durch Gladys). Jede Abfrage liefert den Zustand, den das Auto zuletzt an die Cloud gesendet hat und
**weckt das Auto nie** (das Wecken der App, auf wenige pro Tag begrenzt und hart für die
12-V-Batterie, wird nie genutzt). Ein Auto sendet seinen Zustand beim Abschalten, beim Laden und nach
einem Befehl; geparkt und schlafend kann es stundenlang nichts melden, egal welches Intervall gewählt
ist.

Eine Abfrage kostet einen Aufruf pro Dienst, den das Auto anbietet (Laden, Klima, Status, Reichweite:
1 bis 4), dazu den Kilometerstand einmal pro Stunde und die Position, wenn sie an ist. Der VW-Konzern
veröffentlicht kein Kontingent, antwortet aber Clients, die zu oft fragen, mit „zu viele Anfragen“:
Die Integration bleibt unter **30 Aufrufen pro Stunde und Konto** (Home Assistant liest standardmäßig
alle 30 Minuten) und verlängert bei mehreren Autos die Abstände über das gewählte Intervall hinaus.
Nach einem „zu viele Anfragen“ pausieren die Abfragen 30 Minuten. Ein Wert, der sich nicht ändert,
wird alle 12 Stunden erneut an Gladys gesendet, damit er nie als veraltet erscheint.

## Datenschutz und gespeicherte Daten

- Passwort und S-PIN bleiben in der Konfiguration von Gladys; das Passwort dient nur zur Anmeldung,
  die S-PIN nur zum Ver- oder Entriegeln.
- Die Sitzung (Zugangs- und Aktualisierungstoken der MySkoda-Cloud) wird im Volume `/data` der
  Integration gespeichert, in einer Datei, die nur die Integration lesen kann. Nichts davon, weder die
  E-Mail-Adresse noch die S-PIN, die FIN, das Kennzeichen oder die Position, erscheint je in den Logs.
- Die GPS-Position ist standardmäßig aus; ausgeschaltet wird sie nie gelesen.
- Die Integration spricht nur mit dem Anmeldedienst des VW-Konzerns (identity.vwgroup.io) und der
  MySkoda-Cloud (mysmob.api.connect.skoda-auto.cz).

## Fehlerbehebung

- **„Škoda kennt diese E-Mail-Adresse nicht“**: Der Identitätsdienst hat keine Škoda ID dafür (er
  bot an, eine anzulegen). Gib die Adresse ein, mit der du dich in der MySkoda-App anmeldest, und
  speichere; für eine unbekannte Adresse wird das Passwort nicht gesendet.
- **„Deine Škoda ID ist noch nicht aktiviert“**: Bestätige sie mit der E-Mail von Škoda und speichere
  dann erneut.
- **„Das Konto hat die Anmeldung abgelehnt“**: Prüfe E-Mail-Adresse und Passwort (die der App) und
  speichere dann. Die Integration versucht es nicht von selbst erneut, damit das Konto nicht gesperrt
  wird.
- **„Dein Konto muss zuerst neue Bedingungen annehmen“**: Öffne die MySkoda-App, nimm sie an und
  speichere die Konfiguration erneut.
- **„Der Anmeldedienst lehnt die Verbindung gerade ab“**: zu viele Versuche; warte einige Stunden und
  speichere dann erneut.
- **Ein Auto fehlt**: Prüfe, ob es in der offiziellen App mit demselben Konto erscheint. Ein Auto,
  dessen vernetzte Dienste abgelaufen sind, bietet nichts an und wird nicht angezeigt.
- **Eine Funktion fehlt**: Das Auto bietet sie nicht an (Gastnutzer, Dienste des Modells) oder hat den
  Wert nie gesendet. Ein Dienst, den die Cloud bei der ersten Abfrage ablehnt, wird bis zum Neustart
  nicht mehr gelesen.
- **„Die S-PIN wurde abgelehnt“**: Korrigiere sie in der Konfiguration und speichere; „S-PIN prüfen“
  nennt die verbleibenden Versuche.
- **Alte Werte**: Das Auto hat seinen Zustand seitdem nicht gesendet (schlafend, kein Netz am
  Parkplatz). Die Zeile „Letzte Meldung“ im Widget nennt das Datum des letzten Zustands.
- Mehr Details: Setze `LOG_LEVEL=debug` am Container.

## Grenzen

- Ohne Auto und ohne Konto entwickelt, nach dem Protokoll und den echten Antworten, die
  `skodaconnect/myskoda` gesammelt hat: Rückmeldungen im Forum oder in den Issues sind willkommen.
- Keine Live-Ereignisse: Die MySkoda-App empfängt Änderungen per MQTT über Google Firebase; die
  Integration liest stattdessen die Cloud in festen Abständen.
- Keine Standheizung (Kraftstoffbrenner), keine Hupe oder Lichthupe, keine Abfahrtszeiten oder
  Ladeprofile, keine Fahrtenstatistik.
- Die Befehle laufen über die Škoda-Cloud: Fällt sie aus, geht nichts, und sie kann sich ohne
  Vorwarnung ändern.
- Die Position wird als Text veröffentlicht; keine Entfernung zum Zuhause.

## Danksagung

Das Protokoll (Anmeldung, Endpunkte, Inhalte) und die Test-Fixtures stammen aus
[skodaconnect/myskoda](https://github.com/skodaconnect/myskoda) (MIT), der Bibliothek der
Home-Assistant-Integration
[skodaconnect/homeassistant-myskoda](https://github.com/skodaconnect/homeassistant-myskoda) (MIT),
deren Verhalten (Abfrageintervall, Entitäten, Plausibilitätsgrenzen) übernommen wurde.
