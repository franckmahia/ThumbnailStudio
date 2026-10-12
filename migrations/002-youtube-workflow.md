# 002 — Parcours YouTube et portrait (12 octobre 2026)

Migration additive appliquée à la lecture/écriture des projets, sans changement de
version IndexedDB (toujours 1, store `projects`). Aucune base SQL ni migration MCP.
Les anciens projets restent compatibles ; valeurs absentes = parcours de composition.

Champs optionnels :

- `youtube`: `id`, `title`, `channel`, `contextSource` (`title` / `description`).
- `portrait`: data URL PNG/JPG ; `portraitSource`: `upload` si photo choisie.
- `referenceConfirmed`: confirmation humaine du visage ; remise à faux en restauration.
- `generationHeadline`: texte souhaité, 100 caractères maximum.
- `renderMode`: `complete` conserve le visuel entier, `overlay` compose les textes locaux.
- `installed`: reçu local `{videoId, sha256, installedAt}`, absent à la restauration.

Nouveau stockage privé serveur : `.runtime/youtube/client.json`, `tokens.json`,
`reviews/<uuid>.json` et `<uuid>.image`. Création à la demande, écritures atomiques,
fichiers 0600. Aucun secret dans IndexedDB ou les exports JSON.

Chaque revue conserve identifiant vidéo, hash SHA-256, fichier exact, dates de
création/expiration/validation/installation et état : `pending`, `approved`,
`installing`, `uncertain`, `installed`. Un redémarrage conserve les états et interdit
la répétition d’un envoi incertain. Les fichiers de revue restent locaux ; aucune
purge automatique pour préserver la trace des envois.

Rollback : relancer la version précédente du code et utiliser les sauvegardes JSON.
Les champs optionnels peuvent être ignorés ; conserver `.runtime/youtube/` pour les
reçus, ou déconnecter avant retrait du parcours. Ne pas convertir une revue incertaine
en revue approuvée pour contourner le blocage.
