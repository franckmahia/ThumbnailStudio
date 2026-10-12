# Connexion Google et installation réelle — 12 octobre 2026

Installation confirmée à **09:33:27, Europe/Paris** depuis le bouton du studio.

- Projet Google Cloud privé, non inclus dans le dépôt public.
- YouTube Data API v3 activée avec `gcloud services enable`, puis vérifiée `ENABLED`.
- Client OAuth créé : **Thumbnail Studio local**, type **Application de bureau**.
- Consentement existant du projet : externe, en production.
- Franck a explicitement approuvé la création, les deux permissions YouTube et le
  visuel, puis le passage de l’avertissement Google « application non validée ».
- Client JSON importé via l’interface du studio. Consentement Google effectué dans
  Chrome avec le compte de Franck. Retour OAuth loopback et échange de jetons réussis.
- Chaîne confirmée par `channels.list(mine=true)` : **Franck MAHIA**,
  `UC58uRnwNJhazFRDOuSCMGHw`.
- Vidéo : **Projet IA en entreprise : par quelle tâche commencer ?**,
  `tLYeRFi-A-k`.
- Validation et envoi déclenchés dans l’application. Le SHA-256 a été comparé à celui
  du fichier présenté à Franck avant le clic d’envoi.
- `thumbnails.set` a confirmé l’installation. Le reçu persistant est `installed`.
  Contrôle visuel effectué après rechargement de YouTube Studio : nouveau portrait
  avec la main sous le menton et accroche « PROJET IA ? COMMENCEZ ICI. » visibles.

Le [reçu sans secrets](installation-receipt.json) contient les identifiants publics,
le hash et les dates. La capture publique montre la confirmation dans l’application. Les captures
de Google Cloud, du consentement et de YouTube Studio restent locales et ignorées
par Git pour préserver les informations de compte.

Les fichiers `client.json` et `tokens.json` restent dans `.runtime/youtube/`, en
mode 0600 et ignorés par Git. Le JSON téléchargé dans Téléchargements est aussi en
mode 0600. Aucun secret dans ce dossier de preuves ou dans les sauvegardes projet.

Limites : renouvellement réel du jeton après expiration non forcé ; consentement
Google non validé publiquement.
Aucune mesure de CTR. Aucun changement des autres miniatures lors de cet essai.
Aucun commit, push ou déploiement.

Bob consulté : `decisions/marketingia-cadre-90-jours.md`,
`decisions/traceforge-admin-google-connector-2026-09-12.md`, `entities/franck-mahia.md`.
Cette procédure sans secrets peut être proposée à la queue SavoirForge après revue.
