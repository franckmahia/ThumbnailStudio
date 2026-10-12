# Thumbnail Studio

Studio **local** de création de miniatures YouTube, inspiré du parcours de
[Thumbmagic](https://www.thumbmagic.co/use-cases/youtube-thumbnail-maker).
Une identité et une interface originales ; aucune promesse de CTR ou de vues.

Projet autonome : `/Users/fmahia/Dev/ThumbnailStudio`. Issu du prototype initial de MarketingIA.

## Démarrer sur le Mac

Double-cliquer sur `lancer-studio.command`, ou lancer :

```sh
cd /Users/fmahia/Dev/ThumbnailStudio
python3 server.py --open
```

Adresse : **http://127.0.0.1:8790**. `Ctrl+C` dans le terminal arrête le studio.
Python 3.10+ suffit ; aucune dépendance de production à installer.
Pour changer le port : `python3 server.py --port 8791 --open`.
La bibliothèque dépend du navigateur et du port : conserver la même adresse.

## Génération native avec ton compte ChatGPT Pro

Le studio appelle **Codex CLI installé localement**, avec sa connexion officielle
ChatGPT. Il ne copie ni ne lit les jetons OAuth. Aucune clé API n’est requise.
Les limites de génération et d’usage du compte continuent de s’appliquer.

1. Vérifier `codex --version` et `codex login status`. Si nécessaire :
   **Mon studio → Connecter mon compte ChatGPT**, ou `codex login` dans un terminal.
2. Coller le lien YouTube et cliquer **Importer la vidéo**.
3. Vérifier l’image de référence et cocher **Cette image contient bien mon visage**.
   Remplacer la référence par une photo locale si nécessaire.
4. Vérifier le contexte et éventuellement saisir l’accroche souhaitée.
5. **Générer avec mon visage** produit une miniature complète (portrait, décor, texte).
   Vérifier la ressemblance et les mots. Pour changer le texte intégré, modifier
   l’accroche souhaitée puis régénérer. Décocher « miniature complète » permet
   d’ajouter les textes locaux, si voulu.
6. **Valider pour YouTube** affiche le fichier JPG exact et la vidéo cible.
   Cocher la validation, cliquer **Valider ce visuel**, puis **Installer sur YouTube**.

Sans Google connecté, l’import public récupère le titre et la miniature, pas la
transcription ni la description. Ajouter le contexte manuellement. Avec Google,
la description est importée via l’API YouTube. La miniature actuelle sert de
référence, sans détection automatique de visage : choisir une autre photo si besoin.

Le **brief et le portrait de référence** sont transmis à OpenAI via Codex pendant
la génération avec visage. Les autres images importées restent locales tant
qu’elles ne sont pas choisies comme portrait. Sans lien YouTube, le parcours
historique génère un fond et trois compositions avec textes modifiables.

## Connecter YouTube : configuration guidée

**Mon studio → YouTube → Configurer Google, étape par étape** contient le guide,
les liens Google Cloud, l’import du fichier JSON et le bouton de connexion.

1. Créer/sélectionner un projet Google Cloud et activer **YouTube Data API v3**.
2. Configurer le consentement OAuth et ajouter son compte comme utilisateur test
   si le projet est en mode test.
3. Créer un client OAuth de type **Application de bureau** et télécharger son JSON.
4. Importer le JSON dans le studio, puis **Connecter YouTube**. Choisir la chaîne
   propriétaire des vidéos et accorder les deux accès demandés.
5. Revenir au studio : l’état de connexion s’actualise automatiquement.

OAuth utilise le navigateur Google officiel, un callback HTTP loopback sur
`127.0.0.1`, PKCE et un état à usage unique valable 10 minutes. Les accès demandés
sont `youtube.readonly` et `youtube.upload`. Le serveur renouvelle le jeton d’accès
avec le refresh token. En mode test Google, une reconnexion peut être nécessaire
après 7 jours. Le studio stocke client et jetons dans `.runtime/youtube/`, fichiers
privés `0600`, ignorés par Git, jamais inclus dans les sauvegardes de projets.
**Déconnecter de ce studio** supprime les jetons locaux ; la révocation complète
se fait dans [les autorisations Google](https://myaccount.google.com/permissions).

L’installation vérifie l’appartenance de la vidéo à la chaîne connectée. La
validation expire après 30 minutes et lie l’identifiant vidéo au SHA-256 du fichier
immuable. Aucun envoi à la génération ou à la simple validation. Une erreur réseau
après le début d’un envoi entraîne un état incertain, persistant après redémarrage :
vérifier YouTube Studio avant de préparer un nouvel aperçu. Aucun renvoi automatique.
Une installation confirmée est idempotente pour la même validation.

Documentation : [OAuth pour applications locales](https://developers.google.com/identity/protocols/oauth2/native-app),
[installation de miniatures YouTube](https://developers.google.com/youtube/v3/docs/thumbnails/set),
[CLI Codex et images de référence](https://developers.openai.com/codex/cli/reference/).

Une génération à la fois, sans relance ni bascule API automatique. La page peut
être rechargée pendant la génération ; le suivi reprend tant que le serveur reste
actif. Les résultats serveur sont temporaires, en mémoire, pour un maximum de cinq
générations récentes et trente minutes. Les projets sauvegardés restent dans IndexedDB.

## Autres parcours

- Import JPG, PNG, WebP (20 Mo maximum), avec redimensionnement local.
- Import vidéo locale (300 Mo maximum) : choisir une image avec la lecture vidéo.
  La compatibilité MOV/WebM dépend des codecs du navigateur. Pas d’analyse de scènes.
- Prompt prêt à copier dans ChatGPT si l’on préfère y générer le visuel.
- Quatre directions : Éditorial, Impact, Cinéma, Minimal.
- Aperçu dans un faux fil YouTube pour contrôler la lisibilité.
- Export PNG/JPG en **1280 × 720**, sous **2 Mo** ; conversion JPG si nécessaire.
- Bibliothèque locale : recherche, réouverture, duplication, suppression.
- Sauvegarde/restauration d’un projet JSON comprenant le visuel.

## Option API, distincte de l’abonnement

Cette option est facultative, dans **Plus de réglages**. Elle n’est jamais utilisée
à la place de Codex sans une action explicite. L’API OpenAI a sa propre facturation.

Copier `.env.example` en `.env`, renseigner une clé API **localement**, puis
redémarrer le studio. La clé reste côté serveur et est ignorée par Git.
Le contrat attendu est celui de `/v1/images/generations` : image PNG en `b64_json`.
Le fournisseur est configurable par `THUMBNAIL_API_BASE` (HTTPS), `THUMBNAIL_MODEL`
et `THUMBNAIL_SIZE`. Par défaut : OpenAI, `gpt-image-2`, `1536x1024`.
L’image est ensuite recadrée pour l’export 16:9.

Documentation primaire : [génération d’images OpenAI](https://developers.openai.com/api/docs/guides/image-generation),
[CLI Codex](https://learn.chatgpt.com/docs/cli/reference).

## Stockage et limites

- Le serveur écoute uniquement `127.0.0.1` ; aucune mise en ligne du studio. YouTube est facultatif et demande une connexion explicite.
- Les projets sont dans le navigateur. Effacer ses données les supprime : exporter
  un JSON pour conserver une sauvegarde. Schéma documenté dans `migrations/`.
- Codex enregistre ses images dans son propre dossier `generated_images` ; le studio
  ne récupère qu’un fichier image appartenant à la session qu’il vient de lancer.
- Codex est lancé dans un répertoire de travail temporaire avec le shell, les
  sous-agents, les apps et les plugins désactivés. Les clés API héritées sont retirées.
- Les générations et la connexion utilisent Codex ; cette dépendance doit être
  installée, connectée et offrir la génération d’images native.
- Pas de transcription automatique, de détourage local, de garantie d’identité
  parfaite ni de test A/B mesuré. La ressemblance doit être vérifiée humainement.
- La composition reste disponible sans connexion IA. Les styles sont des directions
  de composition ; les trois variantes partagent un même fond.

## Vérifications

```sh
pytest tests
ruff check server.py youtube_workflow.py tests
node --test tests/engine.test.mjs
node --check web/app.js
git diff --check
```

Les tests HTTP ouvrent un port local temporaire. Aucun test automatisé ne lance de
génération payante ou de génération native réelle : le fournisseur et Codex sont
simulés. Les essais natifs réels sont consignés dans `VALIDATION.md`.

## Cadre du prototype

Fait documenté : Thumbmagic propose un parcours source → variantes → personnalisation
→ export. Hypothèse d’usage : un brief et trois compositions rendent la création des
miniatures de Franck plus rapide. Signal à observer : temps de production et retouches
sur trois vidéos réelles. Règle proposée : conserver le parcours s’il produit une
miniature utilisable plus vite que le processus actuel ; sinon revoir le brief ou les
styles. Aucun gain commercial ou de performance YouTube n’est encore mesuré.

Le parcours OAuth et une installation réelle depuis le studio ont été vérifiés le
12 octobre 2026 sur la chaîne Franck MAHIA : voir
[les preuves de connexion et d’installation](examples/connexion-google/README.md).
Prochaine étape : utiliser ce parcours sur une autre vidéo après validation du visuel. Publication, déploiement et push restent séparés.

Bob consulté : `decisions/marketingia-cadre-90-jours.md` et
`concepts/developpements-github-franck.md` (contexte projet et garde-fous).
