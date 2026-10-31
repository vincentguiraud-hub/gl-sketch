# G&L Sketch

Modeleur 3D de **G&L Créations** (métallerie, ferronnerie, pergolas, garde-corps, rénovation), inspiré des modeleurs « pousser / tirer ».

- **Application en ligne (PC, iPhone, Android)** : https://vincentguiraud-hub.github.io/gl-sketch/
- **Installateur Windows** : onglet *Releases* → `GL-Sketch-Setup.exe`

## Mises à jour
Chaque modification envoyée sur la branche `main` est publiée automatiquement sur GitHub Pages
(workflow « Publier l'application »). Le logiciel Windows charge cette version à chaque démarrage :
**aucune réinstallation n'est nécessaire**. Si l'application est ouverte au moment d'une mise à jour,
un bandeau « Nouvelle version disponible » propose de recharger.

Hors connexion, le logiciel Windows utilise la copie intégrée à l'installateur.
Le lanceur Windows n'est reconstruit que lorsque le dossier `desktop/` change : augmenter alors
`version` dans `desktop/package.json` (il se met à jour tout seul via les Releases).

## Développement
```
npm install
npm run build    # → dist/index.html (application complète en un seul fichier)
```
Rendu : three.js — Booléens : three-bvh-csg — Moteur de géométrie maison (`src/geom.js`).
