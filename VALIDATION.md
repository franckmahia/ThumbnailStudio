# Vérifications — 12 octobre 2026

## Résultats observés

- Codex CLI `0.159.3`, `codex login status` : **Logged in using ChatGPT**.
- Essai réel de génération native, sans clé API : fichier PNG produit dans
  le dossier `generated_images/` de la session Codex.
  Cette image originale sert de visuel de démonstration dans `web/example.png`.
- Second essai réel **depuis le bouton du studio** : visuel éditorial d’un objet
  lumineux dans un atelier, récupéré automatiquement, affiché et enregistré.
  Le serveur n’avait aucune clé API configurée (`configured: false`).
- Rechargement de la page pendant la génération : reprise du suivi et affichage
  du résultat terminé.
- Modification de la deuxième accroche, de la signature et de la palette :
  prévisualisation et réouverture depuis la bibliothèque vérifiées.
- Export PNG : **1280 × 720**, **1 253 745 octets**.
- Export JPG initial : **1280 × 720**, **124 777 octets**.
- Sauvegarde JSON et restauration : second projet créé avec son image et ses textes.
- Import PNG puis capture d’une image d’un MP4 de test H.264 : résultat appliqué
  aux trois variantes. La vidéo de test est synthétique, sans données personnelles.
- Rendus observés à **1280 px** et **390 px**, sans débordement horizontal à 390 px.
- Aperçu YouTube fictif vérifié ; aucun message d’erreur ou avertissement console
  observé pendant les essais.
- 17 tests Python, 3 tests JavaScript ; Ruff, syntaxe JS et `git diff --check` réussis.

## Limites de cette validation

- La session ChatGPT était déjà authentifiée. Le bouton de connexion appelle le
  flux officiel `codex login`, mais aucun logout/relogin n’a été imposé pour tester
  une authentification vierge ou le renouvellement d’un jeton expiré.
- Les erreurs fournisseurs, contraintes d’origine, validation d’entrée et
  restrictions de lecture de fichiers sont testées avec simulations et HTTP local.
- L’option API à clé n’a pas fait l’objet d’un appel réel. Aucun crédit API acheté
  ou consommé pour cette livraison.
- Les trois variantes utilisent **un seul fond IA** et des compositions textuelles
  locales. Ce ne sont pas trois images IA indépendantes.
- Pas d’évaluation de CTR, de performance sur une chaîne réelle, de portrait
  personnel, de fichier vidéo volumineux ou de navigateur autre que Chromium.
- Aucun commit, push, déploiement ou envoi sur YouTube.

## Suite proposée

Essayer un sujet réel et un portrait choisi par Franck, puis arbitrer entre
génération de fonds et conservation fidèle du visage. La procédure de connexion
native Codex est documentée dans le README et peut être capitalisée dans la queue
Bob/SavoirForge après revue.

## Contexte Bob

Consultation effectuée : `decisions/marketingia-cadre-90-jours.md`,
`concepts/developpements-github-franck.md`. Les autres pages renvoyées par la
recherche générique n’ont pas servi à décider du comportement du studio.

## Extension YouTube avec portrait — 12 octobre 2026

Résultats vérifiés sur le nouveau parcours :

- Import réel depuis le formulaire de `https://www.youtube.com/watch?v=tLYeRFi-A-k` :
  titre « Projet IA en entreprise : par quelle tâche commencer ? », chaîne Franck MAHIA,
  miniature de référence. Aucun client Google configuré, contexte limité au titre
  annoncé par l’interface ; angle métier ajouté manuellement pour l’essai.
- Génération réelle depuis **Générer avec mon visage**, via Codex connecté à ChatGPT,
  image de référence attachée avec `--image`. Aucun appel API à clé.
- Accroche demandée : « PROJET IA ? COMMENCEZ ICI. ». Portrait et texte intégrés
  dans le visuel natif, sans seconde couche de texte à l’export.
- Résultat sauvegardé, rechargement et réouverture de l’aperçu de validation réussis.
- Fichier exact de revue : `examples/parcours-youtube/miniature-test.jpg`, JPEG
  **1280 × 720**, **187 578 octets**, SHA-256
  `26c0474700054e3b3f1da03fb122c90d3e21a6163e4ba9d9637022247b7ec5d9`.
- Validation locale testée dans l’interface. Installation désactivée sans Google
  connecté, avec lien direct vers le guide. Aucun nouvel envoi sur la chaîne.
- Guide Google et aperçus inspectés sur ordinateur et à 390 × 844. Aucun débordement
  horizontal (largeur visible/contenu : 375/375 hors barre de défilement), aucune
  erreur ou alerte console observée. Captures dans `examples/parcours-youtube/`.
- **60 tests Python et 4 tests JavaScript passent**, Ruff et syntaxe JS passent.
  Tests couvrant OAuth state/PKCE, jetons privés, droits incomplets, lien YouTube,
  origine locale, fichier exact, expiration, mauvaise chaîne, idempotence et blocage
  d’un résultat d’envoi incertain même après redémarrage.

Limites précises :

- Client Google non fourni : consentement OAuth réel, renouvellement réel des jetons
  et `thumbnails.set` sont implémentés et testés avec simulations, pas encore validés
  sur la chaîne avec l’API. Le guide intégré permet cette configuration.
- Les deux installations précédentes par YouTube Studio restent un essai distinct,
  consigné dans `examples/INSTALLATION-YOUTUBE.md`. Elles ne prouvent pas ce nouveau
  chemin API ; elles n’ont pas été remplacées lors de cet essai.
- Le premier lancement sous le bac à sable Codex a bloqué l’écriture de son état
  (`readonly database` / `Operation not permitted`). Le test natif a réussi après
  lancement autorisé du serveur hors de ce bac à sable. Le message utilisateur
  recommande le lanceur local dans ce cas ; ce n’était pas une erreur de connexion.
- La ressemblance et l’efficacité commerciale restent à apprécier par Franck.
  Aucune mesure de CTR ou de gain de temps n’a été réalisée.
- Aucun commit, push ou déploiement de cette extension.

Bob consulté pour le fonctionnement natif et les frontières :
`procedures/savoirforge-chatgpt-cloud-provider.md`, `entities/codex-cli-versioning.md`,
`concepts/openai-codex.md`, `concepts/savoirforge-positioning-and-codex-role.md`,
`entities/fmthorizon-revue-humaine.md`. Aucune page canonique modifiée. La procédure
locale documentée peut être proposée à la queue SavoirForge après revue.

## OAuth réel et installation par API — 12 octobre 2026, 09:33 Europe/Paris

Le parcours auparavant simulé a maintenant été validé réellement : client OAuth
bureau dédié, consentement Google avec les deux
permissions demandées, callback local et jetons privés, bonne chaîne vérifiée,
validation du fichier exact, puis installation depuis le bouton du studio.
YouTube a confirmé `thumbnails.set` ; le reçu persistant est `installed` et le
nouveau visuel a été constaté dans YouTube Studio après rechargement.

Vidéo `tLYeRFi-A-k`, même fichier JPEG de 187 578 octets que l’essai natif précédent,
SHA-256 `26c0474700054e3b3f1da03fb122c90d3e21a6163e4ba9d9637022247b7ec5d9`.
Le [dossier de preuves](examples/connexion-google/README.md) contient le reçu
sans secrets et les captures de confirmation. Le renouvellement réel après
expiration n’a pas été forcé. Aucun code modifié pour ce test réel, aucun nouvel
appel de génération, aucun commit/push/déploiement.


## Projet Codex autonome — 12 octobre 2026

- Copie depuis MarketingIA : 51 fichiers publics vérifiés byte à byte avant adaptation
  des chemins du README et du message de configuration API. Caches et traces de
  débogage exclus. La copie d’origine reste disponible.
- Projet Codex **ThumbnailStudio**, répertoire `/Users/fmahia/Dev/ThumbnailStudio`,
  enregistré et vérifié avec `list_projects`.
- Dépôt Git local initialisé sur `main`, sans commit et sans remote.
- Consignes et provenance locales conservées hors du dépôt public. Migrations existantes conservées ;
  aucun changement du schéma IndexedDB ni des règles d’installation YouTube.
- Vérification depuis cette racine : **60 tests Python et 4 tests JavaScript passent**,
  Ruff, syntaxe JS et contrôle des espaces de fin de ligne passent.
- Serveur local basculé sur la nouvelle racine, confirmée par le répertoire de travail
  du processus écoutant sur 127.0.0.1:8790. Même origine et bibliothèque navigateur.
- `/api/status` confirme Codex et YouTube connectés. Le reçu de l’installation réelle
  précédente est toujours `installed`. Client OAuth et jetons copiés en 0600,
  `.runtime/` ignoré par Git. Aucun nouveau consentement ni envoi YouTube déclenché.
- L’enregistrement est confirmé par les outils de l’application Codex ; aucune
  capture de son interface native n’a été réalisée, le contrôle de cette application
  étant indisponible. Aucun commit, push ou déploiement.

## Préparation du dépôt public — 12 octobre 2026

- 60 tests Python et 4 tests JavaScript passent ; syntaxe de `web/app.js` valide.
- Configuration Ruff autonome ajoutée avec les règles standards E4, E7, E9 et F,
  cible Python 3.10. Le projet ne dépend plus des règles du répertoire parent.
  `ruff check server.py youtube_workflow.py tests` passe.
- `.env`, variantes locales, `.runtime/`, fichiers OAuth, clés privées, consignes
  internes et captures Google/YouTube Studio contenant des informations de compte
  restent ignorés. Les fichiers locaux d'origine sont conservés, hors du dépôt.
- Le reçu public conserve la vidéo, le hash et les dates ; les identifiants locaux
  de revue et de configuration Google ont été retirés. La documentation publique
  ne contient plus les identifiants internes de projet ou de session.
- Gitleaks 8.30.1, exécuté sur l'export exact des 48 fichiers indexés : aucun secret
  détecté. Comparaison des fichiers indexés avec les credentials OAuth/API locaux :
  aucune correspondance. Captures et visuels publics inspectés.
- `git diff --cached --check` passe. Aucun nouvel appel de génération ou envoi
  YouTube déclenché pour ces vérifications.
