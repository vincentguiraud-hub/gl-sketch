# G&L Sketch – consignes pour Claude

Modeleur 3D « pousser / tirer » (inspiré de SketchUp) de Vincent, artisan (G&L Créations : métallerie, ferronnerie,
pergolas, garde-corps, escaliers, rénovation). Toute l'interface et tous les messages sont **en français**, simples,
pour un artisan non informaticien. Unité interne : millimètre, axe Z vertical (bleu).

## Architecture
- `src/geom.js` : moteur géométrique (sommets/arêtes/faces collants, détection des faces `rebuildPlane`, pousser/tirer,
  décalage, suivez-moi, maillage → faces). Logique pure, sans interface.
- `src/app.js` : modèle (`Model`, sérialisation JSON), rendu three.js (arêtes épaisses `LineSegments2`), caméra, sélection
  3D, **moteur d'inférences** (`infer`), annuler/rétablir (instantanés JSON via `commit`).
- `src/tools.js` : tous les outils (classe `Tool`, aperçu « réel » via `beginLive/liveApply/endLive`).
- `src/ui.js` : interface (barre de titre, rail d'outils, inspecteur à onglets, menus, raccourcis, fichiers, rapports).
- `src/ops.js` : groupes/composants, solides (three-bvh-csg), import/export, bibliothèque acier.
- `src/features.js` : générateurs métallerie (garde-corps, escalier, pergola, portail), liste de débit, poids, métré.
- `src/assistant.js` : panneau « Assistant Claude » (demandes envoyées en tickets GitHub, versions, retour arrière).
- `src/viewcube.js`, `src/icons.js`, `src/textures.js`, `template.html` (CSS + garde-fou de démarrage).
- `build.mjs` produit `dist/index.html` (un seul fichier autonome) + `dist/version.json` + `dist/versions.json`.
- `desktop/` : lanceur Windows Electron (charge l'appli en ligne depuis GitHub Pages ; copie hors connexion). **Ne pas modifier.**
- `tests/` : tests Playwright de bout en bout (`npm test`), qui pilotent l'appli comme un utilisateur (`tests/harness.cjs`).

## Règles
1. Après toute modification : `npm run build` puis `npm test` doivent passer. Sinon rien n'est publié.
2. Corrige la cause réelle d'un problème ; ne désactive pas un test pour le faire passer. Ajoute un test pour chaque bug corrigé quand c'est possible.
3. Garde le comportement de type SketchUp (inférences, raccourcis, boîte Mesures, faces au sol orientées vers le bas, etc.).
4. Compatibilité des fichiers : un projet `.glsketch` enregistré avant doit toujours s'ouvrir (`Model.fromJSON`).
5. Ne pas toucher à `.github/`, `desktop/`, `package.json`, `versions.json` : le robot de publication s'en charge.
6. Pas de dépendance réseau à l'exécution : l'appli doit fonctionner hors connexion (tout est intégré dans `dist/index.html`).
7. Réponse à Vincent : en français, courte, sans jargon, en disant ce qui a changé et comment le vérifier dans le logiciel.
