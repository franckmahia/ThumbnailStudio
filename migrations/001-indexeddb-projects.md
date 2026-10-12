# Migration 001 — Bibliothèque locale

La migration est appliquée par `web/app.js`, dans `openDB()`, via `onupgradeneeded`.

- Base : IndexedDB `thumbnail-studio`.
- Version : `1`.
- Object store : `projects`, clé primaire `id`.
- Enregistrement : projet JSON version 1, titre, contexte, style, trois variantes
  (accroche/palette), signature, surtitre, image intégrée, provenance et dates.
- Les images importées sont redimensionnées à 1920 px au maximum ; les images
  natives Codex sont conservées dans le projet avec leur qualité de génération.
- Les sauvegardes JSON sont portables. Leur restauration crée un nouvel identifiant.

Pas de base serveur. Cette migration est locale à chaque navigateur et origine
(changer de port ou de navigateur donne une autre bibliothèque). Une version future
doit augmenter le numéro IndexedDB et documenter la migration suivante ici.
