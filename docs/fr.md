# MySkoda

Suivez vos voitures Škoda dans Gladys : batterie, autonomie et charge des voitures électriques et
hybrides rechargeables, climatisation, verrouillage, portes et fenêtres, carburant, kilométrage, et la
position si vous le souhaitez. L'intégration utilise le cloud de l'application **MySkoda**, comme
l'application officielle et l'intégration Home Assistant `myskoda`.

Sans lien avec Škoda Auto. Développée sans le matériel : vos retours sont les bienvenus.

## Prérequis

- Gladys 5.1.0 ou plus récent.
- Une voiture ajoutée à un compte **MySkoda** (Škoda ID), visible dans l'application officielle, avec
  ses services connectés actifs : Enyaq, Elroq, Citigo e iV, hybrides rechargeables Superb / Octavia /
  Kodiaq iV, et les voitures essence, diesel et GNV connectées (Octavia, Superb, Kodiaq, Karoq,
  Kamiq…), chacune avec ce que le cloud donne pour elle.
- L'adresse e-mail et le mot de passe du compte, et son **S-PIN** si vous voulez verrouiller la
  voiture.

## Configuration

Dans Gladys, **Intégrations → MySkoda → Configuration** :

| Champ                              | Ce qu'il faut saisir                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Adresse e-mail                     | L'adresse de votre Škoda ID, celle avec laquelle vous vous connectez à l'application.                                          |
| Mot de passe                       | Son mot de passe. Il ne sert qu'à se connecter : la session ouverte est ensuite gardée par l'intégration.                      |
| S-PIN                              | Facultatif : le S-PIN à 4 chiffres de l'application, seulement pour verrouiller (ou déverrouiller).                            |
| Langue des noms de fonctionnalités | Français par défaut. Gladys garde un nom une fois l'appareil créé.                                                             |
| Intervalle de rafraîchissement     | Fréquence de lecture du cloud : toutes les 15, 30 (par défaut), 60 ou 120 minutes.                                             |
| Partager la position GPS           | Désactivé par défaut. Activé : la position de stationnement de chaque voiture est lue et affichée.                             |
| Autoriser le déverrouillage        | Désactivé par défaut. Activé : l'action de scène « Déverrouiller une Škoda » fonctionne (voir Verrouillage et déverrouillage). |

Enregistrez, puis cliquez sur **Tester la connexion** : elle liste les voitures du compte, ou dit en
rouge ce qui ne va pas. **Vérifier le S-PIN** contrôle le S-PIN enregistré (un S-PIN faux compte
comme un essai raté). Ouvrez ensuite l'onglet **Découverte** et ajoutez vos voitures.

## Appareils

Un appareil par voiture, nommé d'après le modèle et la plaque (ex. « Škoda Enyaq (AB-123-CD) »).
Chaque voiture reçoit les fonctionnalités que ses services proposent :

| Fonctionnalité                   | Signification                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Niveau de batterie               | État de charge, en % (voitures électriques et hybrides rechargeables).                                                                  |
| Autonomie électrique             | Autonomie sur batterie, en km.                                                                                                          |
| État de la charge                | En charge, branchée, limite atteinte, débranchée (états de borne de recharge de Gladys).                                                |
| Branchée                         | 1 quand un câble est branché.                                                                                                           |
| Charge                           | 1 pendant la charge. Une commande : marche lance la charge, arrêt l'arrête.                                                             |
| Puissance de charge              | En kW, pendant la charge (voitures qui la donnent).                                                                                     |
| Temps de charge restant          | En minutes, pendant la charge (voitures qui le donnent).                                                                                |
| Limite de charge                 | Le niveau où la charge s'arrête, de 50 à 100 % par dizaines. Une commande (Enyaq, Elroq, hybrides récentes).                            |
| Climatisation                    | 1 quand la voiture chauffe ou rafraîchit l'habitacle. Une commande : marche la lance à la température de climatisation, arrêt l'arrête. |
| Température de climatisation     | La température de la climatisation, de 15,5 à 30 °C par demi-degrés. Une commande, enregistrée dans la voiture.                         |
| Température extérieure           | En °C (voitures qui la donnent).                                                                                                        |
| Verrouillée                      | 1 quand la voiture est verrouillée. En lecture seule : le verrouillage est une action de scène.                                         |
| Portière ouverte / Coffre ouvert | 1 quand une portière, ou le coffre, est ouvert.                                                                                         |
| Fenêtre ou toit ouvrant ouvert   | 1 quand une fenêtre ou le toit ouvrant est ouvert.                                                                                      |
| Niveau / autonomie carburant     | En % et en km (voitures essence, diesel, GNV et hybrides rechargeables).                                                                |
| Kilométrage                      | En km.                                                                                                                                  |
| Position GPS                     | « latitude, longitude », seulement si la position GPS est activée.                                                                      |

**Une commande acceptée par le cloud n'est pas une commande exécutée par la voiture.** La voiture
l'exécute de son côté, souvent une ou deux minutes plus tard. L'intégration garde la valeur demandée
jusqu'à dix minutes, relit la voiture deux et six minutes après la commande, puis publie ce que la
voiture signale. Si la voiture ne la signale jamais, l'état réel revient et le widget affiche « Pas
signalée par la voiture ».

## Widget

**Ma Škoda** (choisissez le véhicule dans ses réglages) : batterie et autonomie (carburant et
autonomie pour une voiture essence ou diesel), une liste d'état (charge, limite de charge,
climatisation, portes, dernier relevé) et jusqu'à quatre boutons, libellés selon l'effet d'un appui :
lancer la clim (demande confirmation) ou l'arrêter, lancer ou arrêter la charge, verrouiller (quand la
voiture est déverrouillée et qu'un S-PIN est enregistré ; demande confirmation), actualiser. Une
commande affiche « Demandé, en attente de la voiture » jusqu'à ce que la voiture la signale. Il n'y a
jamais de bouton de déverrouillage.

## Déclencheur de scène

**Charge terminée** : la voiture a cessé de charger en restant branchée (limite de charge atteinte, ou
arrêt par la voiture ou la borne). Filtre facultatif : le véhicule. Variables : niveau de batterie (%)
et autonomie électrique (km). Une charge arrêtée depuis Gladys ne le déclenche pas.

Branchée, débranchée, batterie sous un seuil : utilisez les fonctionnalités de l'appareil dans un
déclencheur « état d'un appareil », elles le font déjà.

## Actions de scène

- **Actualiser une Škoda** : lit maintenant l'état que la voiture a envoyé au cloud (sans la
  réveiller), et donne le niveau de batterie, l'autonomie électrique, branchée, en charge et
  verrouillée aux actions suivantes.
- **Verrouiller une Škoda** : demande à la voiture de se verrouiller, avec le S-PIN de la
  configuration.
- **Déverrouiller une Škoda** : seulement si « Autoriser le déverrouillage » est activé ; demande à la
  voiture de se déverrouiller, avec le S-PIN.

La charge, la limite de charge, la climatisation et sa température sont des fonctionnalités de
l'appareil : une scène les règle avec « Contrôler un appareil ».

## Exemples de scènes

- **Voiture chaude à 7 h 30 en semaine** : à 7 h 15, du lundi au vendredi, régler la Température de
  climatisation à 21 et la Climatisation sur marche.
- **Charger en heures creuses** : à 22 h, si Branchée vaut 1, mettre la Charge sur marche ; à 6 h, la
  mettre sur arrêt. Ou régler la Limite de charge à 100 % avant un long trajet, puis la remettre à
  80 %.
- **Verrouillée chaque nuit** : à 23 h, « Actualiser une Škoda », puis si la sortie verrouillée vaut
  faux, « Verrouiller une Škoda » et envoyer un message « La voiture était ouverte : verrouillage
  demandé ».
- **Charge terminée** : envoyer un message « L'Enyaq est chargée ({{triggerEvent.data.battery_level}}
  %) ».

## Verrouillage et déverrouillage

Le verrouillage et le déverrouillage demandent le **S-PIN** de l'application MySkoda, saisi dans la
configuration. Ce ne sont jamais des interrupteurs d'appareil : un bouton du tableau de bord ou un
assistant vocal ne peut pas ouvrir la voiture.

- **Verrouiller** : l'action de scène « Verrouiller une Škoda » et le bouton du widget (demande
  confirmation).
- **Déverrouiller** : désactivé par défaut. N'activez « Autoriser le déverrouillage » que si une scène
  en a besoin ; l'action de scène « Déverrouiller une Škoda » fonctionne alors. Une scène qui
  déverrouille la voiture peut la laisser ouverte : réfléchissez-y à deux fois.
- **Un S-PIN faux** compte comme un essai raté sur le compte, et le cloud bloque le S-PIN après
  quelques-uns. Une fois refusé, l'intégration ne l'envoie plus avant que vous enregistriez la
  configuration avec le bon.

## Rafraîchissement et quota du cloud

L'intégration lit le cloud avec son propre minuteur (elle ne compte pas sur le sondage de Gladys).
Chaque lecture renvoie l'état que la voiture a envoyé au cloud : elle **ne réveille jamais la
voiture** (le réveil de l'application, limité à quelques-uns par jour et dur pour la batterie 12 V,
n'est jamais utilisé). Une voiture envoie son état quand on la coupe, pendant la charge et après une
commande ; garée et endormie, elle peut rester des heures sans nouvelles, quel que soit le
rafraîchissement choisi.

Une lecture coûte un appel par service que la voiture propose (charge, climatisation, état,
autonomie : 1 à 4), plus le kilométrage une fois par heure et la position si elle est activée. Le
groupe VW ne publie aucun quota mais répond « trop de requêtes » aux clients qui appellent trop
souvent : l'intégration reste sous **30 appels par heure et par compte** (Home Assistant lit toutes
les 30 minutes par défaut), en espaçant les lectures au-delà du rafraîchissement choisi s'il y a
plusieurs voitures. Après un « trop de requêtes », les lectures font une pause de 30 minutes. Une
valeur qui ne change pas est renvoyée à Gladys toutes les 12 heures, pour ne jamais paraître périmée.

## Vie privée et données stockées

- Le mot de passe et le S-PIN restent dans la configuration de Gladys ; le mot de passe ne sert qu'à
  se connecter, le S-PIN qu'à verrouiller ou déverrouiller.
- La session (jetons d'accès et de rafraîchissement du cloud MySkoda) est stockée dans le volume
  `/data` de l'intégration, dans un fichier lisible par elle seule. Rien de tout cela, ni l'adresse
  e-mail, le S-PIN, le VIN, la plaque ou la position, n'apparaît jamais dans les journaux.
- La position GPS est désactivée par défaut ; désactivée, elle n'est jamais lue.
- L'intégration ne parle qu'au service de connexion du groupe VW (identity.vwgroup.io) et au cloud
  MySkoda (mysmob.api.connect.skoda-auto.cz).

## Dépannage

- **« Škoda ne connaît pas cette adresse e-mail »** : le service d'identité n'a aucun Škoda ID pour
  elle (il proposait d'en créer un). Saisissez l'adresse avec laquelle vous vous connectez à
  l'application MySkoda, puis enregistrez ; le mot de passe n'est pas envoyé pour une adresse inconnue.
- **« Votre Škoda ID n'est pas encore activé »** : confirmez-le avec l'e-mail envoyé par Škoda, puis
  enregistrez à nouveau.
- **« Le compte a refusé la connexion »** : vérifiez l'adresse e-mail et le mot de passe (ceux de
  l'application), puis enregistrez. L'intégration ne réessaie pas d'elle-même, pour ne pas bloquer le
  compte.
- **« Votre compte doit d'abord accepter de nouvelles conditions »** : ouvrez l'application MySkoda,
  acceptez-les, puis enregistrez à nouveau la configuration.
- **« Le service de connexion refuse pour le moment »** : trop de tentatives ; patientez quelques
  heures, puis enregistrez à nouveau.
- **Une voiture manque** : vérifiez qu'elle apparaît dans l'application officielle avec le même
  compte. Une voiture dont les services connectés ont expiré ne propose rien et n'est pas affichée.
- **Une fonctionnalité manque** : la voiture ne la propose pas (utilisateur invité, services du
  modèle), ou n'a jamais envoyé la valeur. Un service refusé par le cloud à la première lecture n'est
  plus lu jusqu'au redémarrage.
- **« Le S-PIN a été refusé »** : corrigez-le dans la configuration et enregistrez ; « Vérifier le
  S-PIN » donne les essais restants.
- **Valeurs anciennes** : la voiture n'a pas envoyé son état depuis (endormie, pas de réseau là où
  elle est garée). La ligne « Dernier relevé » du widget donne la date du dernier état.
- Plus de détails : mettez `LOG_LEVEL=debug` sur le conteneur.

## Limites

- Développée sans voiture ni compte, à partir du protocole et des vraies réponses recueillies par
  `skodaconnect/myskoda` : vos retours sont les bienvenus sur le forum ou dans les issues.
- Pas d'événements en direct : l'application MySkoda reçoit les changements par MQTT via Google
  Firebase ; l'intégration lit plutôt le cloud à intervalles réguliers.
- Pas de chauffage d'appoint (brûleur à carburant), ni klaxon ni appels de phares, ni minuteries de
  départ ou profils de charge, ni statistiques de trajets.
- Les commandes passent par le cloud Škoda : s'il est en panne, rien ne marche, et il peut changer
  sans préavis.
- La position est publiée sous forme de texte ; pas de distance au domicile.

## Crédits

Le protocole (connexion, points d'accès, contenus) et les fixtures de test viennent de
[skodaconnect/myskoda](https://github.com/skodaconnect/myskoda) (MIT), la bibliothèque de
l'intégration Home Assistant
[skodaconnect/homeassistant-myskoda](https://github.com/skodaconnect/homeassistant-myskoda) (MIT),
dont le comportement (intervalle de lecture, entités, bornes de cohérence) a été suivi.
