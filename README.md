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

## Assistant Claude (demandes depuis l'appli)
Bouton **Assistant** en haut à droite de G&L Sketch : on décrit un problème ou une amélioration (capture de la vue 3D
et modèle joints automatiquement). La demande devient un ticket GitHub `[Assistant] …` ; le workflow « Assistant Claude »
fait la modification avec Claude Code, lance la compilation et **tous les tests**, puis publie automatiquement si tout
passe. La réponse s'affiche dans l'appli avec un bouton « Mettre à jour ».

Sécurités :
- seules les demandes du propriétaire du dépôt sont traitées ; Claude ne peut pas modifier `.github/` ni `desktop/` ;
- rien n'est publié si la compilation ou un test échoue ;
- avant chaque publication, la version en ligne est sauvegardée (tags `sauvegarde/…` et `version/x.y.z`, liste dans `versions.json`) ;
- **retour arrière** : panneau Assistant → *Versions* (ou écrire « reviens à la version précédente ») ; workflow « Revenir à une version sauvegardée » ;
- la version précédente reste toujours en ligne sur `/precedente/`, proposée automatiquement si l'appli ne démarre plus.

Réglages (une seule fois) : secret `CLAUDE_CODE_OAUTH_TOKEN` dans *Settings → Secrets and variables → Actions*,
et une clé GitHub « fine-grained » (dépôt `gl-sketch`, droits Contents / Issues / Actions en écriture) collée dans l'appli.

## Développement
```
npm install
npm run build    # → dist/index.html (application complète en un seul fichier)
npm test         # tests de bout en bout (Playwright)
```
Rendu : three.js — Booléens : three-bvh-csg — Moteur de géométrie maison (`src/geom.js`).
