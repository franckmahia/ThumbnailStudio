# Test réel — choisir sa première tâche IA

Réalisé le 12 octobre 2026 pour Franck Mahia.

## Sources vérifiées

- Vidéo : [Projet IA en entreprise : par quelle tâche commencer ?](https://www.youtube.com/watch?v=tLYeRFi-A-k).
- Chaîne : Franck MAHIA, `@franckmahia`.
- Description complète consultée et transcription YouTube automatique exportée dans `transcription-youtube.txt`.
- La vidéo recommande une tâche fréquente, un périmètre accessible et une personne capable de juger l'utilité. Un essai sur quelques dossiers réels permet ensuite de poursuivre, corriger ou arrêter.
- `source-youtube.jpg` : miniature publique de cette même vidéo utilisée comme référence de portrait. La description précise l'usage autorisé d'un avatar et d'une voix de synthèse de Franck.

## Hypothèse créative

Audience : dirigeants et responsables d'équipe qui cherchent le point de départ d'un projet IA.

Accroche : **PROJET IA ? COMMENCEZ ICI.** Le portrait et le geste de Franck dirigent le regard vers une seule tâche sélectionnée parmi plusieurs. Le fond sombre, les caractères ivoire et le bandeau contrasté reprennent la famille visuelle de la première miniature, avec un accent vert pour ce sujet de démarrage.

Signal attendu au stade de la maquette : à 320 × 180, on lit l'accroche et on comprend qu'il faut sélectionner un premier cas d'usage. Règle de décision : garder la composition si ces deux éléments restent immédiatement compréhensibles ; simplifier sinon. Le contrôle visuel est effectué, mais aucun test auprès d'un panel ni aucune mesure de CTR ne l'a encore confirmé.

## Livrables et validation

- `miniature-impact.jpg` : export final 1280 × 720, inférieur à 2 Mio.
- `miniature-impact.png` : même export en PNG, inférieur à 2 Mio.
- `apercu-mobile.jpg` : contrôle de lisibilité à 320 × 180.
- `creation-originale.png` : image générée avant normalisation.
- `prompt.txt` : prompt exact utilisé.

Génération via imagegen natif dans Codex, avec portrait source en référence, sans clé API fournie. Redimensionnement et export avec Pillow. Texte, portrait, geste et composition inspectés ; formats, décodage, dimensions et poids des exports contrôlés.

Textes intégrés dans l'image, non éditables séparément. Préparation manuelle depuis YouTube ; ce test ne valide pas un import d'URL ou un traitement de portrait dans le parcours serveur du studio. Aucun changement de code, aucune publication, aucun commit ou push.

Prochaine décision utile : valider cette direction visuelle pour former une série cohérente avec la première miniature.

Bob consulté via le skill SavoirForge : notamment `entities/franck-mahia.md`, `concepts/parcours-hybride-franck-mahia.md` et `concepts/developpements-github-franck.md`. Le contenu précis de la vidéo a été vérifié directement sur YouTube.
