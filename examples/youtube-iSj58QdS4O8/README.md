# Test réel — dossier incomplet

Réalisé le 12 octobre 2026 pour Franck Mahia.

- Vidéo source : [IA en entreprise : repérer les dossiers incomplets plus tôt](https://www.youtube.com/watch?v=iSj58QdS4O8).
- Chaîne vérifiée dans YouTube : Franck MAHIA, `@franckmahia`.
- Sujet vérifié dans la description : exemple imaginé d'une aide IA à la réception des dossiers, signalement des informations manquantes, mesure des vrais blocages et des fausses alertes, décision conservée par l'équipe.
- YouTube n'expose pas de transcription pour cette vidéo au moment du test. L'angle s'appuie sur son titre et sa description complète, pas sur une transcription prétendue.
- Référence de portrait : miniature publique de cette même vidéo, conservée dans `source-youtube.jpg`. La description précise que la vidéo utilise un avatar et une voix de synthèse autorisés par Franck.

## Hypothèse créative

« UNE PIÈCE MANQUE. TOUT BLOQUE. » rend immédiatement visible la tension métier décrite dans la vidéo. Un portrait rapproché, un dossier avec une pièce absente et un contraste ivoire/rouge sur fond sombre servent la lecture sur mobile. L'accroche décrit le cas illustré ; elle ne présente pas un résultat client mesuré.

## Fichiers

- `miniature-impact.jpg` : export final 1280 × 720, inférieur à 2 Mio.
- `miniature-impact.png` : export final 1280 × 720, inférieur à 2 Mio.
- `apercu-mobile.jpg` : contrôle de lisibilité à 320 × 180.
- `creation-originale.png` : création native avant normalisation au format YouTube.
- `prompt.txt` : instructions de création et contraintes de préservation du portrait.

## Exécution et limites

Génération avec l'outil imagegen natif disponible dans Codex, avec l'image source en référence ; aucune clé API fournie et aucun appel au fournisseur API optionnel du studio. Normalisation de taille et export avec Pillow. Textes intégrés à l'image par le générateur : ils ne sont pas éditables séparément dans cet export.

Ce test valide une création sur un sujet réel et un portrait de référence. Il n'est pas une validation de l'import automatique d'une URL YouTube ni de la préservation de portrait dans le parcours serveur du studio, qui ne propose pas encore ces fonctions. Aucun changement de code applicatif pour ce test.

Vérifications : inspection de l'image générée, accents et texte exacts, export 16:9, dimensions, décodage PNG/JPEG, poids inférieur à 2 Mio, aperçu mobile. Aucun résultat de CTR mesuré. Aucune publication sur YouTube.

Bob consulté via le skill SavoirForge : notamment `entities/franck-mahia.md`, `concepts/parcours-hybride-franck-mahia.md` et `concepts/developpements-github-franck.md`. Ces pages n'ont pas fourni le lien vidéo ; la source déterminante est la page YouTube vérifiée.
