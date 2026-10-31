// G&L Sketch — interface utilisateur
import { App, THREE, G, COLORS, fmtLen, fmtArea, parseLen, defToJSON, defFromJSON } from './app.js';
import * as T from './tools.js';
import * as O from './ops.js';
import * as F from './features.js';
import { ICONS } from './icons.js';
import { swatchURL } from './textures.js';
import { ViewCube } from './viewcube.js';
import { Assistant } from './assistant.js';
const { Vector3, Matrix4 } = THREE;

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : '';
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOOLGROUPS = [
  [['select', 'Sélectionner', 'Espace'], ['eraser', 'Gomme', 'E'], ['paint', 'Colorier', 'B']],
  [['line', 'Ligne', 'L'], ['arc', 'Arc', 'A'], ['rect', 'Rectangle', 'R'], ['rotrect', 'Rectangle pivoté', ''], ['circle', 'Cercle', 'C'], ['polygon', 'Polygone', '']],
  [['pushpull', 'Pousser / tirer', 'P'], ['offset', 'Décalage', 'F'], ['move', 'Déplacer', 'M'], ['rotate', 'Faire pivoter', 'Q'], ['scale', 'Échelle', 'S'], ['followme', 'Suivez-moi', '']],
  [['tape', 'Mètre', 'T'], ['protractor', 'Rapporteur', ''], ['dimension', 'Cotation', 'D'], ['text', 'Texte', ''], ['text3d', 'Texte 3D', ''], ['section', 'Plan de section', '']],
  [['orbit', 'Orbite', 'O'], ['pan', 'Panoramique', 'H'], ['zoom', 'Zoom', 'Z'], ['zoomwin', 'Zoom fenêtre', ''], ['zoomext', 'Zoom étendu', 'Maj+Z'], ['walk', 'Visite', '']],
];
const TOOLS = TOOLGROUPS.flat();
const TOOLNAME = Object.fromEntries(TOOLS.map(([k, n]) => [k, n])); TOOLNAME.look = 'Regarder autour'; TOOLNAME.place = 'Placer'; TOOLNAME.zoomwin = 'Zoom fenêtre';
const PANELS = [['assistant', 'Assistant Claude', 'sparkle'], ['info', 'Entité', 'info'], ['mat', 'Matières', 'palette'], ['comp', 'Composants', 'component'], ['tags', 'Balises', 'layers'], ['scenes', 'Scènes', 'scenes'], ['styles', 'Styles', 'styles'], ['shadow', 'Ombres', 'sun'], ['outliner', 'Structure', 'tree']];
const KEYMAP = { k: '_backedges', ' ': 'select', e: 'eraser', l: 'line', a: 'arc', r: 'rect', c: 'circle', p: 'pushpull', f: 'offset', m: 'move', q: 'rotate', s: 'scale', t: 'tape', d: 'dimension', b: 'paint', o: 'orbit', h: 'pan', z: 'zoom' };

export class UI {
  constructor(root) {
    this.root = root;
    this.build();
    const app = this.app = new App($('#viewport'));
    app.cloneDefDeep = (id) => O.cloneDefDeep(app, id);
    this.tools = {};
    for (const [k, C] of Object.entries(T.TOOL_CLASSES)) this.tools[k] = new C(app, this);
    this.tools.polygon = T.makePolygonTool(app, this); this.tools.look = T.makeLookTool(app, this);
    this.native = window.glNative || null; if (this.native) this.initNative();
    this.assistant = new Assistant(this, APP_VERSION);
    this.tool = null;
    this.bindEvents();
    app.on('toast', (m) => this.toast(m));
    app.on('frame', () => this.updateLabels());
    app.on('selection', () => { this.renderEntityInfo(); this.tool?.onSelection?.(); this.renderOutliner(); });
    app.on('changed', () => { this.afterChange(); });
    app.on('context', () => { this.renderOutliner(); this.updateContextBar(); });
    app.on('material', () => this.renderMaterials());
    app.on('loaded', () => this.renderAll());
    this.setTool('select');
    this.restoreAutosave();
    this.renderAll();
    this.openPanel('info'); if (innerWidth < 900) this.root.classList.remove('tray-open');
    try { this.viewcube = new ViewCube($('#viewcube'), app); } catch (e) { /* */ }
    this.updateInsets(); new ResizeObserver(() => this.updateInsets()).observe($('.workspace'));
    new MutationObserver(() => this.updateInsets()).observe(this.root, { attributes: true, attributeFilter: ['class'] });
    app.refresh(); app.zoomExtents();
    this.initDownloads();
    this.checkUpdates();
  }
  checkUpdates() {
    if (!/^https?:$/.test(location.protocol) || !/github\.io$/.test(location.hostname) || !APP_BUILD) return;
    const check = async () => { try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); if (j.build && j.build !== APP_BUILD) { this.newBuild = j; $('#updbanner').classList.add('on'); } } catch (e) { /* hors ligne */ } };
    this.checkNow = check; setTimeout(check, 20000); setInterval(check, 10 * 60 * 1000);
  }
  async applyUpdate() {
    if (this.app.dirty && !(await this.confirm('Le modèle a des modifications non enregistrées. Elles seront conservées dans la sauvegarde automatique. Recharger maintenant ?'))) return;
    this.autosave(true); location.replace(location.pathname + '?v=' + encodeURIComponent(this.newBuild?.build || Date.now()));
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root.innerHTML = '';
    try { const th = localStorage.getItem('glsketch-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* */ }
    const menus = [
      ['Fichier', [['Nouveau', 'new', 'Ctrl+N'], ['Ouvrir…', 'open', 'Ctrl+O'], ['Fichiers récents…', 'recent'], ['Enregistrer', 'save', 'Ctrl+S'], ['Enregistrer sous…', 'saveAs', 'Ctrl+Maj+S'], '-', ['Importer (STL, OBJ, projet)…', 'import'], '-', ['Exporter STL (impression 3D)', 'expSTL'], ['Exporter OBJ', 'expOBJ'], ['Exporter GLB (3D)', 'expGLB'], ['Exporter DXF (vue de dessus)', 'expDXF'], ['Exporter image PNG', 'expPNG'], '-', ['Infos sur le modèle…', 'modelInfo']]],
      ['Édition', [['Annuler', 'undo', 'Ctrl+Z'], ['Rétablir', 'redo', 'Ctrl+Y'], '-', ['Couper', 'cut', 'Ctrl+X'], ['Copier', 'copy', 'Ctrl+C'], ['Coller', 'paste', 'Ctrl+V'], ['Coller sur place', 'pasteInPlace'], ['Effacer', 'delete', 'Suppr'], '-', ['Tout sélectionner', 'selectAll', 'Ctrl+A'], ['Tout désélectionner', 'selectNone', 'Ctrl+T'], '-', ['Masquer', 'hide'], ['Afficher tout', 'unhideAll'], '-', ['Créer un groupe', 'group', 'Ctrl+G'], ['Créer un composant…', 'component', 'G'], ['Éclater', 'explode'], ['Rendre unique', 'unique'], ['Fermer le groupe / composant', 'closeCtx', 'Échap'], '-', ['Inverser les faces', 'reverse'], ['Adoucir les arêtes', 'soften'], ['Durcir les arêtes', 'harden'], ['Purger les éléments inutilisés', 'purge']]],
      ['Affichage', [['Thème clair / sombre', 'theme'], ['Grille au sol', 'tg:grid'], '-', ['Axes', 'tg:axes'], ['Guides', 'tg:guides'], ['Arêtes', 'tg:edges'], ['Arêtes arrière', 'tg:backEdges', 'K'], ['Rayons X', 'tg:xray'], ['Géométrie masquée', 'tg:hiddenGeom'], ['Plans de section', 'tg:sections'], ['Coupe de section active', 'tg:sectionCut'], '-', ['Fil de fer', 'fs:wire'], ['Lignes cachées', 'fs:hidden'], ['Ombré', 'fs:shaded'], ['Ombré avec textures', 'fs:textured'], ['Monochrome', 'fs:mono'], '-', ['Ombres', 'shadows'], ['Effacer tous les guides', 'clearGuides']]],
      ['Caméra', [['Iso', 'v:iso'], ['Dessus', 'v:top'], ['Dessous', 'v:bottom'], ['Face', 'v:front'], ['Arrière', 'v:back'], ['Gauche', 'v:left'], ['Droite', 'v:right'], '-', ['Perspective', 'persp'], ['Projection parallèle', 'ortho'], '-', ['Orbite', 't:orbit', 'O'], ['Panoramique', 't:pan', 'H'], ['Zoom', 't:zoom', 'Z'], ['Zoom fenêtre', 't:zoomwin'], ['Zoom étendu', 'zoomext', 'Maj+Z'], ['Zoom sur la sélection', 'zoomsel'], '-', ['Visite (marcher)', 't:walk'], ['Regarder autour', 't:look']]],
      ['Dessiner', [['Ligne', 't:line', 'L'], ['Arc', 't:arc', 'A'], ['Rectangle', 't:rect', 'R'], ['Rectangle pivoté', 't:rotrect'], ['Cercle', 't:circle', 'C'], ['Polygone', 't:polygon'], '-', ['Texte 3D…', 'text3d']]],
      ['Métallerie', [['Garde-corps…', 'gen:gc'], ['Escalier droit…', 'gen:esc'], ['Pergola…', 'gen:perg'], ['Portail…', 'gen:port'], ['Profilé sur mesure…', 'gen:prof'], '-', ['Liste de débit, poids et métré…', 'report']]],
      ['Outils', [['Sélectionner', 't:select', 'Espace'], ['Gomme', 't:eraser', 'E'], ['Colorier', 't:paint', 'B'], '-', ['Déplacer', 't:move', 'M'], ['Faire pivoter', 't:rotate', 'Q'], ['Échelle', 't:scale', 'S'], ['Pousser/tirer', 't:pushpull', 'P'], ['Suivez-moi', 't:followme'], ['Décalage', 't:offset', 'F'], '-', ['Mètre', 't:tape', 'T'], ['Rapporteur', 't:protractor'], ['Cotation', 't:dimension', 'D'], ['Texte', 't:text'], ['Plan de section', 't:section'], '-', ['Adoucir / lisser par angle…', 'softenAngle'], ['Liste de débit et métré…', 'report'], '-', ['Solides : Union', 'solid:union'], ['Solides : Soustraire', 'solid:sub'], ['Solides : Intersection', 'solid:inter'], ['Solides : Couper', 'solid:trim']]],
      ['Fenêtre', PANELS.map(([id, n]) => [n, 'p:' + id])],
      ['Aide', [['Demander à Claude (Assistant)…', 'p:assistant'], '-', ['Raccourcis clavier', 'help', 'F1'], ['À propos', 'about']]],
    ];
    const titlebar = h('header', { class: 'titlebar' },
      h('button', { class: 'ibtn hamb', 'data-tip': 'Menu', html: ICONS.menu, onclick: (e) => { e.stopPropagation(); this.root.classList.toggle('menus-open'); } }),
      h('div', { class: 'brand', html: ICONS.logo + '<span><b>G&amp;L</b> Sketch</span>' }),
      h('nav', { class: 'menus' }, menus.map(([name, items]) => h('div', { class: 'menu' }, h('button', { class: 'mtitle', onclick: (e) => { e.stopPropagation(); this.toggleMenu(e.currentTarget.parentElement); }, onmouseenter: (e) => { if (this.root.querySelector('.menu.open') && !e.currentTarget.parentElement.classList.contains('open')) this.toggleMenu(e.currentTarget.parentElement); } }, name),
        h('div', { class: 'mdrop' }, items.map((it) => (it === '-' ? h('hr') : h('button', { 'data-cmd': it[1], onclick: () => { this.closeMenus(); this.root.classList.remove('menus-open'); this.cmd(it[1]); } }, h('span', {}, it[0]), it[2] ? h('kbd', {}, it[2]) : null))))))),
      h('div', { class: 'docname' }, h('span', { class: 'dot', id: 'dirtydot' }), h('span', { id: 'docname' }, 'Sans titre')),
      h('div', { class: 'tright' },
        h('button', { class: 'asbtn', 'data-tip': 'Signaler un problème ou demander une modification : Claude s\'en occupe', html: ICONS.sparkle + '<span>Assistant</span>', onclick: () => this.openPanel('assistant') }),
        h('i', { class: 'vsep' }),
        h('button', { class: 'ibtn', 'data-tip': 'Annuler', 'data-key': 'Ctrl+Z', html: ICONS.undo, onclick: () => this.cmd('undo') }),
        h('button', { class: 'ibtn', 'data-tip': 'Rétablir', 'data-key': 'Ctrl+Y', html: ICONS.redo, onclick: () => this.cmd('redo') }),
        h('i', { class: 'vsep' }),
        h('button', { class: 'ibtn', id: 'themebtn', 'data-tip': 'Thème clair / sombre', html: ICONS.moon, onclick: () => this.cmd('theme') }),
        h('button', { class: 'ibtn trayToggle', 'data-tip': 'Panneaux', html: ICONS.panel, onclick: () => this.root.classList.toggle('tray-open') })),
    );
    const tb = (cmd, icon, tip, key) => h('button', { class: 'tb', 'data-cmd': cmd, 'data-tip': tip, 'data-key': key || null, html: ICONS[icon], onclick: () => this.cmd(cmd) });
    const grp = (...k) => h('div', { class: 'qgroup' }, ...k);
    const quickbar = h('div', { class: 'quickbar glass' },
      grp(tb('new', 'new', 'Nouveau', 'Ctrl+N'), tb('open', 'open', 'Ouvrir', 'Ctrl+O'), tb('save', 'save', 'Enregistrer', 'Ctrl+S')),
      grp(tb('v:iso', 'iso', 'Vue iso'), tb('v:top', 'top', 'Dessus'), tb('v:front', 'front', 'Face'), tb('v:right', 'right', 'Droite'), tb('v:back', 'back', 'Arrière'), tb('v:left', 'left', 'Gauche'), tb('toggleOrtho', 'persp', 'Perspective / parallèle')),
      grp(tb('fs:wire', 'wire', 'Fil de fer'), tb('fs:hidden', 'hidden', 'Lignes cachées'), tb('fs:shaded', 'shaded', 'Ombré'), tb('fs:textured', 'textured', 'Ombré avec textures'), tb('fs:mono', 'mono', 'Monochrome'), tb('tg:xray', 'xray', 'Rayons X'), tb('tg:backEdges', 'backedges', 'Arêtes arrière', 'K')),
      grp(tb('shadows', 'shadow', 'Ombres'), tb('tg:sectionCut', 'sectioncut', 'Coupe de section'), tb('tg:grid', 'grid', 'Grille au sol')),
      grp(tb('group', 'group', 'Créer un groupe', 'Ctrl+G'), tb('component', 'component', 'Créer un composant', 'G'), tb('solid:union', 'union', 'Union'), tb('solid:sub', 'subtract', 'Soustraire'), tb('solid:inter', 'intersect', 'Intersection')),
      grp(tb('gen:gc', 'gardecorps', 'Garde-corps'), tb('gen:esc', 'stairs', 'Escalier'), tb('gen:perg', 'pergola', 'Pergola'), tb('gen:port', 'gate', 'Portail'), tb('report', 'report', 'Liste de débit / poids')),
      grp(tb('import', 'import', 'Importer'), tb('expSTL', 'export', 'Exporter STL')),
    );
    const rail = h('div', { class: 'rail glass', id: 'palette' }, TOOLGROUPS.map((g) => h('div', { class: 'rgroup' }, g.map(([k, name, key]) => h('button', { class: 'tool', 'data-tool': k, 'data-tip': name, 'data-key': key || null, 'data-side': 'right', html: ICONS[k] + `<span class="lbl">${name}</span>`, onclick: () => (k === 'zoomext' ? this.app.zoomExtents() : k === 'text3d' ? this.cmd('text3d') : this.setTool(k)) })))));
    const tray = h('aside', { class: 'tray glass', id: 'tray' },
      h('div', { class: 'tabs' }, PANELS.map(([id, n, ic]) => h('button', { class: 'tab', 'data-panel': id, 'data-tip': n, html: ICONS[ic], onclick: () => this.openPanel(id) })), h('button', { class: 'tab x', 'data-tip': 'Fermer', html: ICONS.close, onclick: () => this.root.classList.remove('tray-open') })),
      h('div', { class: 'ptitle', id: 'ptitle' }, 'Entité'),
      h('div', { class: 'pscroll' }, PANELS.map(([id]) => h('section', { class: 'panel', id: 'p-' + id }, h('div', { class: 'pbody', id: 'pb-' + id })))),
    );
    const ws = h('main', { class: 'workspace' },
      h('div', { id: 'viewport', class: 'viewport', tabindex: '0' }),
      h('div', { id: 'labels', class: 'labels' }),
      h('div', { id: 'infmark', class: 'infmark' }), h('div', { id: 'inftip', class: 'inftip' }),
      h('div', { id: 'rubber', class: 'rubber' }),
      quickbar, rail, tray,
      h('div', { class: 'scenetabs', id: 'scenetabs' }),
      h('div', { class: 'ctxbar glass', id: 'ctxbar' }),
      h('div', { class: 'viewcube', id: 'viewcube' }),
      h('div', { class: 'statusbar glass' },
        h('div', { class: 'toolchip', id: 'toolchip' }),
        h('div', { class: 'hint', id: 'hint' }, ''),
        h('label', { class: 'vcb' }, h('span', { id: 'vcblabel' }, 'Mesures'), h('input', { id: 'vcb', autocomplete: 'off', inputmode: 'decimal', spellcheck: 'false' }))),
      h('div', { id: 'toast', class: 'toast' }),
      h('div', { id: 'updbanner', class: 'updbanner glass' }, h('span', { html: ICONS.export }), h('span', {}, 'Une nouvelle version de G&L Sketch est disponible.'), h('button', { onclick: () => this.applyUpdate() }, 'Mettre à jour'), h('button', { class: 'later', onclick: () => $('#updbanner').classList.remove('on') }, 'Plus tard')),
      h('div', { class: 'navpad' }, h('button', { 'data-tip': 'Orbite', html: ICONS.orbit, onclick: () => this.setTool('orbit') }), h('button', { 'data-tip': 'Panoramique', html: ICONS.pan, onclick: () => this.setTool('pan') }), h('button', { 'data-tip': 'Zoom étendu', html: ICONS.zoomext, onclick: () => this.app.zoomExtents() }), h('button', { 'data-tip': 'Annuler', html: ICONS.undo, onclick: () => this.app.undo() })),
    );
    this.root.append(titlebar, ws, h('div', { id: 'modal', class: 'modal' }), h('div', { id: 'ctxmenu', class: 'ctxmenu' }), h('div', { id: 'tip', class: 'tip' }), h('input', { type: 'file', id: 'filein', style: 'display:none', accept: '.json,.glsk,.glsketch,.stl,.obj,.txt' }), h('input', { type: 'file', id: 'imgin', style: 'display:none', accept: 'image/*' }));
    document.addEventListener('click', () => { this.closeMenus(); this.hideCtx(); });
    // info-bulles
    const tip = $('#tip'); let tipT = null;
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest?.('[data-tip]'); clearTimeout(tipT);
      if (!el || matchMedia('(pointer:coarse)').matches) { tip.classList.remove('on'); return; }
      tipT = setTimeout(() => {
        tip.innerHTML = esc(el.dataset.tip) + (el.dataset.key ? ` <kbd>${esc(el.dataset.key)}</kbd>` : '');
        const r = el.getBoundingClientRect(); tip.classList.add('on');
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x, y; if (el.dataset.side === 'right') { x = r.right + 10; y = r.top + r.height / 2 - th / 2; } else { x = r.left + r.width / 2 - tw / 2; y = r.bottom + 8; if (y + th > innerHeight - 4) y = r.top - th - 8; }
        tip.style.left = Math.max(6, Math.min(x, innerWidth - tw - 6)) + 'px'; tip.style.top = Math.max(6, y) + 'px';
      }, 350);
    });
    document.addEventListener('mousedown', () => { clearTimeout(tipT); tip.classList.remove('on'); });
  }
  updateInsets() {
    const ws = $('.workspace')?.getBoundingClientRect(); if (!ws || !this.app) return;
    const vis = (el) => el && getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
    const rail = vis($('#palette')), tray = vis($('#tray')), qb = vis($('.quickbar')), sb = vis($('.statusbar'));
    const mobile = rail && rail.width > rail.height;
    const ins = { l: 0, r: 0, t: 0, b: 0 };
    if (mobile) { ins.t = qb ? qb.bottom - ws.top : 0; ins.b = rail ? ws.bottom - rail.top : 0; if (tray) ins.b = Math.max(ins.b, ws.bottom - tray.top); }
    else { ins.l = rail ? rail.right - ws.left : 0; ins.r = tray ? ws.right - tray.left : 0; ins.t = qb ? qb.bottom - ws.top : 0; ins.b = sb ? ws.bottom - sb.top : 0; }
    const k = JSON.stringify(ins); if (k === this._insK) return; this._insK = k; this.app.setInsets(ins);
  }
  toggleMenu(m) { const open = m.classList.contains('open'); this.closeMenus(); if (!open) m.classList.add('open'); }
  closeMenus() { this.root.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }

  // ------------------------------------------------------------ Outils
  setTool(name) {
    if (name === 'zoomwin' && this.toolName !== 'zoomwin') this.prevTool = this.toolName;
    if (this.tool) this.tool.deactivate();
    if (name !== 'select' && name !== 'move' && name !== 'rotate' && name !== 'scale' && name !== 'paint' && name !== 'followme' && this.app.sel.size && ['line', 'rect', 'circle', 'arc', 'polygon', 'pushpull', 'offset', 'tape', 'dimension', 'eraser'].includes(name)) { this.app.sel.clear(); this.app.refreshSelection(); }
    this.tool = this.tools[name]; this.toolName = name; this.tool.activate();
    this.root.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === name));
    const chip = $('#toolchip'); if (chip) chip.innerHTML = (ICONS[name] || ICONS.select) + `<span>${esc(TOOLNAME[name] || name)}</span>`;
    $('#viewport').dataset.tool = name;
    this.hideInf();
  }
  status(t) { $('#hint').textContent = t; }
  vcb(label, value) { $('#vcblabel').textContent = label; const i = $('#vcb'); if (document.activeElement !== i || !i.value) i.placeholder = value || ''; }
  toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2200); }
  rubber(r) {
    const el = $('#rubber'); if (!r) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = Math.min(r.x0, r.x1) + 'px'; el.style.top = Math.min(r.y0, r.y1) + 'px';
    el.style.width = Math.abs(r.x1 - r.x0) + 'px'; el.style.height = Math.abs(r.y1 - r.y0) + 'px';
    el.classList.toggle('cross', r.x1 < r.x0);
  }
  showInf(r, sx, sy) {
    const mk = $('#infmark'), tip = $('#inftip');
    if (!r) { this.hideInf(); return; }
    const LABELS = { end: 'Extrémité', mid: 'Milieu', edge: "Sur l'arête", face: 'Sur la face', axis: { x: "Sur l'axe rouge", y: "Sur l'axe vert", z: "Sur l'axe bleu" }, par: "Parallèle à l'arête", guide: 'Sur le guide', guidept: 'Point de guide', lock: r.label, track: 'Depuis le point', plane: '', ground: '', free: '' };
    const C = { end: COLORS.end, mid: COLORS.mid, edge: COLORS.edge, face: COLORS.face, guide: '#555', guidept: '#555', par: COLORS.par };
    let label = LABELS[r.type]; if (r.type === 'axis') label = LABELS.axis[r.axis] + (r.onEdge ? ' · sur l\'arête' : '');
    if (r.type === 'track') label = 'Depuis le point (' + ({ x: 'rouge', y: 'vert', z: 'bleu' }[r.axis] || '') + ')';
    let col = C[r.type] || (r.type === 'axis' ? COLORS[r.axis] : r.type === 'lock' ? r.color : null);
    const s = this.app.project(r.p);
    if (col && ['end', 'mid', 'edge', 'face', 'guidept'].includes(r.type)) {
      mk.style.display = 'block'; mk.style.left = s.x + 'px'; mk.style.top = s.y + 'px'; mk.style.borderColor = col; mk.style.background = r.type === 'end' || r.type === 'mid' ? col : 'transparent';
      mk.className = 'infmark ' + r.type;
    } else mk.style.display = 'none';
    this.tip(label, sx, sy);
  }
  tip(label, sx, sy) {
    const tip = $('#inftip');
    if (sx != null) { this._tipX = sx; this._tipY = sy; }
    if (!label) { tip.style.display = 'none'; return; }
    tip.textContent = label; tip.style.display = 'block'; tip.style.left = (this._tipX + 16) + 'px'; tip.style.top = (this._tipY + 18) + 'px';
  }
  hideInf() { $('#infmark').style.display = 'none'; $('#inftip').style.display = 'none'; }

  // ---------------------------------------------------------- Événements
  bindEvents() {
    const vp = $('#viewport'); const app = this.app;
    const ev = (e) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, button: e.button, pointerType: e.pointerType }; };
    const pointers = new Map(); let gesture = null; let down = null; let mid = null; let longT = null; let lastTap = null;
    vp.addEventListener('contextmenu', (e) => e.preventDefault());
    vp.addEventListener('pointerdown', (e) => {
      vp.focus({ preventScroll: true }); this.hideCtx(); this.closeMenus();
      vp.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const E = ev(e);
      if (e.pointerType === 'touch' && pointers.size >= 2) {
        clearTimeout(longT);
        if (down && this.tool.pointerUp) this.tool.pointerUp({ ...E, cancel: true });
        down = null; gesture = { pts: new Map(pointers) }; return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey && this.toolName === 'select' && false)) { mid = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; e.preventDefault(); return; }
      if (e.button === 2) { this._rc = E; return; }
      if (e.button !== 0) return;
      down = E;
      if (e.pointerType === 'touch') { longT = setTimeout(() => { if (down && !down.moved) { const d = down; down = null; this.tool.pointerUp?.({ ...d, cancel: true }); this.showCtx(d); } }, 650); this.tool.move?.(E); }
      if (this.tool.pointerDown) this.tool.pointerDown(E); else this.tool.click(E);
    });
    vp.addEventListener('pointermove', (e) => {
      const E = ev(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture) { this.gestureMove(gesture, pointers); return; }
      if (mid) { const dx = e.clientX - mid.x, dy = e.clientY - mid.y; if (e.shiftKey) app.pan(dx, dy); else app.orbit(dx, dy); mid.x = e.clientX; mid.y = e.clientY; return; }
      if (down && Math.hypot(E.x - down.x, E.y - down.y) > 8) { down.moved = true; clearTimeout(longT); }
      if (this.tool.pointerMove) this.tool.pointerMove(E); else this.tool.move(E);
    });
    const up = (e) => {
      const E = ev(e); pointers.delete(e.pointerId); clearTimeout(longT);
      if (gesture) { if (pointers.size === 0) gesture = null; else gesture = { pts: new Map(pointers) }; return; }
      if (mid) { mid = null; return; }
      if (e.button === 2 && this._rc) { this.showCtx(this._rc); this._rc = null; return; }
      if (!down) return;
      const d = down; down = null;
      if (this.tool.pointerUp) this.tool.pointerUp(E);
      else if (d.moved) this.tool.click(E);
      // double-tap tactile
      if (e.pointerType === 'touch' && !d.moved) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 350 && Math.hypot(lastTap.x - E.x, lastTap.y - E.y) < 25) { this.tool.dbl(E); lastTap = null; } else lastTap = { t: now, x: E.x, y: E.y };
      }
    };
    vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
    vp.addEventListener('dblclick', (e) => { if (e.pointerType === 'touch') return; this.tool.dbl(ev(e)); });
    vp.addEventListener('wheel', (e) => { e.preventDefault(); const E = ev(e); const k = e.ctrlKey ? 0.02 : 0.0015; app.zoomAt(E.x, E.y, Math.exp(e.deltaY * k)); if (this.tool._lastE) this.tool.move?.(this.tool._lastE); }, { passive: false });
    vp.addEventListener('pointerleave', (e) => { const over = document.elementFromPoint(e.clientX, e.clientY); if (!over || !vp.contains(over)) this.hideInf(); });

    const vcb = $('#vcb');
    vcb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = vcb.value.trim(); vcb.value = ''; if (v) this.tool.vcbInput(v); vp.focus(); e.preventDefault(); }
      else if (e.key === 'Escape') { vcb.value = ''; vp.focus(); }
      e.stopPropagation();
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('keyup', (e) => this.tool?.keyup?.(e));
    $('#filein').addEventListener('change', (e) => this.onFile(e));
    window.addEventListener('beforeunload', () => this.autosave(true));
  }
  gestureMove(g, pointers) {
    const prev = [...g.pts.values()], cur = [...pointers.values()]; if (cur.length < 2 || prev.length < 2) return;
    const c0 = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 }, c1 = { x: (cur[0].x + cur[1].x) / 2, y: (cur[0].y + cur[1].y) / 2 };
    const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y), d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
    const r = $('#viewport').getBoundingClientRect();
    if (cur.length >= 3) this.app.orbit(c1.x - c0.x, c1.y - c0.y);
    else if (this.toolName === 'orbit' || this.twoFingerOrbit) this.app.orbit(c1.x - c0.x, c1.y - c0.y);
    else this.app.pan(c1.x - c0.x, c1.y - c0.y);
    if (d0 > 10 && d1 > 10 && Math.abs(d1 - d0) > 0.5) this.app.zoomAt(c1.x - r.left, c1.y - r.top, d0 / d1);
    g.pts = new Map(pointers);
  }
  onKey(e) {
    const tgt = e.target; const vcb = $('#vcb');
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT') && tgt !== document.body) return;
    if ($('#modal').classList.contains('on')) return;
    const k = e.key; const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', a: 'selectAll', t: 'selectNone', c: 'copy', x: 'cut', v: 'paste', s: e.shiftKey ? 'saveAs' : 'save', o: 'open', n: 'new', g: 'group' };
      const c = map[k.toLowerCase()]; if (c) { e.preventDefault(); this.cmd(c); return; }
      if (k === 'Control' || k === 'Meta') this.tool.key(e);
      return;
    }
    if (this.tool.key(e)) { e.preventDefault(); return; }
    // saisie directe dans la boîte de mesures
    const vcbChar = /^[0-9.,;\-<>\[\]\/*]$/.test(k) || (vcb.value && /^[a-zA-Z'"]$/.test(k) && !e.altKey);
    if (vcbChar) { vcb.value += k; e.preventDefault(); return; }
    if (k === 'Backspace' && vcb.value) { vcb.value = vcb.value.slice(0, -1); e.preventDefault(); return; }
    if (k === 'Enter' && vcb.value) { const v = vcb.value.trim(); vcb.value = ''; this.tool.vcbInput(v); e.preventDefault(); return; }
    if ((k === 'x' || k === 'X') && !vcb.value && (this.toolName === 'move' || this.toolName === 'rotate')) { vcb.value = 'x'; e.preventDefault(); return; }
    if (k === 'F1') { this.help(); e.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') { this.cmd('delete'); e.preventDefault(); return; }
    if (k === 'Escape') { if (this.toolName !== 'select') this.setTool('select'); else if (this.app.sel.size) { this.app.sel.clear(); this.app.refreshSelection(); } else this.app.exitContext(); return; }
    if (e.shiftKey && (k === 'Z' || k === 'z')) { this.app.zoomExtents(); e.preventDefault(); return; }
    if (k === 'g' || k === 'G') { this.cmd('component'); return; }
    const t = KEYMAP[k.toLowerCase()];
    if (t === '_backedges') { this.cmd('tg:backEdges'); return; }
    if (t && !e.altKey) { e.preventDefault(); this.setTool(t); }
  }

  // ---------------------------------------------------------- Commandes
  async cmd(c) {
    const app = this.app; const st = app.model.style;
    const [kind, arg] = c.includes(':') ? c.split(':') : [c, null];
    switch (kind) {
      case 't': this.setTool(arg); break;
      case 'v': app.setView(arg); break;
      case 'tg': st[arg] = !st[arg]; app.matCache.clear(); app.defCache.clear(); app.refresh(); this.renderStyles(); break;
      case 'fs': st.faces = arg; app.matCache.clear(); app.defCache.clear(); app.refresh(); this.renderStyles(); break;
      case 'p': this.openPanel(arg); break;
      case 'solid': O.solidOp(app, arg); break;
      case 'shadows': app.model.shadow.on = !app.model.shadow.on; app.refresh(); this.renderShadow(); this.renderStyles(); break;
      case 'persp': app.setOrtho(false); this.renderStyles(); break;
      case 'ortho': app.setOrtho(true); this.renderStyles(); break;
      case 'toggleOrtho': app.setOrtho(!app.isOrtho); this.renderStyles(); break;
      case 'theme': { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('glsketch-theme', d.dataset.theme); } catch (e) { /* */ } app.applyTheme(); this.viewcube?.paint(); this.renderStyles(); break; }
      case 'undo': app.undo(); break;
      case 'redo': app.redo(); break;
      case 'zoomext': app.zoomExtents(); break;
      case 'zoomsel': this.zoomSel(); break;
      case 'new': if (await this.confirm('Créer un nouveau modèle ? Les modifications non enregistrées seront perdues.')) { app.newModel(); this.renderAll(); app.zoomExtents(); } break;
      case 'open': case 'import': if (this.native) { const f = await this.native.open(); if (f) this.openData(f.name, f.data, f.path); } else $('#filein').click(); break;
      case 'save': this.saveProject(false); break;
      case 'saveAs': this.saveProject(true); break;
      case 'recent': this.recent(); break;
      case 'gen': this.generator(arg); break;
      case 'report': this.report(); break;
      case 'softenAngle': this.softenAngle(); break;
      case 'expSTL': this.saveFile(this.fileBase() + '.stl', O.exportSTL(app)); break;
      case 'expOBJ': this.saveFile(this.fileBase() + '.obj', O.exportOBJ(app)); break;
      case 'expGLB': this.saveFile(this.fileBase() + '.glb', await O.exportGLB(app)); break;
      case 'expDXF': this.saveFile(this.fileBase() + '.dxf', O.exportDXF(app)); break;
      case 'expPNG': this.exportPNG(); break;
      case 'modelInfo': this.modelInfo(); break;
      case 'delete': this.deleteSel(); break;
      case 'selectAll': { const D = app.activeDef; app.sel.clear(); for (const id of D.faces.keys()) app.sel.add('f:' + id); for (const id of D.edges.keys()) app.sel.add('e:' + id); for (const id of D.insts.keys()) app.sel.add('i:' + id); app.refreshSelection(); break; }
      case 'selectNone': app.sel.clear(); app.refreshSelection(); break;
      case 'hide': this.hideSel(); break;
      case 'unhideAll': app.commit('Afficher tout', () => { const D = app.activeDef; for (const e of D.edges.values()) e.hidden = false; for (const f of D.faces.values()) f.hidden = false; for (const i of D.insts.values()) i.hidden = false; D.touch(); }); break;
      case 'group': O.makeGroup(app, 'group'); break;
      case 'component': { if (!app.sel.size) { this.toast('Sélectionnez des éléments'); break; } const n = await this.prompt('Nom du composant', 'Composant#' + ([...app.model.defs.values()].filter((d) => d.kind === 'component').length + 1)); if (n) O.makeGroup(app, 'component', n); this.renderComponents(); break; }
      case 'explode': O.explode(app); break;
      case 'unique': O.makeUnique(app); break;
      case 'closeCtx': app.exitContext(); break;
      case 'edit': { const k = [...app.sel].find((x) => x[0] === 'i'); if (k) app.enterInstance(+k.slice(2)); break; }
      case 'reverse': app.commit('Inverser les faces', () => { const D = app.activeDef; for (const k of app.sel) if (k[0] === 'f') G.reverseFace(D, +k.slice(2)); }); break;
      case 'soften': case 'harden': app.commit(kind === 'soften' ? 'Adoucir' : 'Durcir', () => { const D = app.activeDef; for (const k of app.sel) if (k[0] === 'e') D.edges.get(+k.slice(2)).soft = kind === 'soften'; D.touch(); }); break;
      case 'purge': O.purgeAll(app); this.renderComponents(); break;
      case 'clearGuides': app.commit('Effacer les guides', () => { app.model.guides = []; }); break;
      case 'copy': this.copySel(false); break;
      case 'cut': this.copySel(true); break;
      case 'paste': this.paste(false); break;
      case 'pasteInPlace': this.paste(true); break;
      case 'text3d': this.text3d(); break;
      case 'help': this.help(); break;
      case 'about': this.modal(`<h3>G&L Sketch</h3><p>Modeleur 3D par surfaces, conçu pour <b>G&L Créations</b> (métallerie, rénovation, pergolas, garde-corps).</p><p>Inspiré du fonctionnement des modeleurs « pousser/tirer » : arêtes collantes, faces automatiques, inférences, groupes et composants.</p><p class="muted">Version ${APP_VERSION}${APP_BUILD ? ' — ' + new Date(APP_BUILD).toLocaleString('fr-FR') : ''}${this.native ? ' — application Windows' : ''}. Mises à jour automatiques via GitHub.</p>`, [['Fermer']]); break;
      case 'intersect': break;
      default: break;
    }
  }
  fileBase() { return (this.app.model.name || 'modele').replace(/[^\w\-àâäéèêëîïôöùûüç ]+/gi, '').trim() || 'modele'; }
  deleteSel() {
    const app = this.app; if (!app.sel.size) return; const D = app.activeDef; const keys = [...app.sel];
    app.commit('Effacer', () => {
      const eids = keys.filter((k) => k[0] === 'e').map((k) => +k.slice(2)); const fids = keys.filter((k) => k[0] === 'f').map((k) => +k.slice(2));
      G.eraseFaces(D, fids); if (eids.length) G.eraseEdges(D, eids);
      for (const k of keys) if (k[0] === 'i') D.insts.delete(+k.slice(2));
      G.removeOrphans(D); O.purgeDefs(app); D.touch();
    });
    app.sel.clear(); app.refreshSelection();
  }
  hideSel() {
    const app = this.app; const D = app.activeDef; const keys = [...app.sel];
    app.commit('Masquer', () => { for (const k of keys) { const id = +k.slice(2); const o = k[0] === 'f' ? D.faces.get(id) : k[0] === 'e' ? D.edges.get(id) : D.insts.get(id); if (o) o.hidden = true; } D.touch(); });
    app.sel.clear(); app.refreshSelection();
  }
  zoomSel() {
    const app = this.app; const D = app.activeDef; const m = app.activeMatrix; const box = new THREE.Box3();
    for (const k of app.sel) { const id = +k.slice(2); if (k[0] === 'f') G.vertsOfFace(D.faces.get(id)).forEach((v) => box.expandByPoint(D.verts.get(v).p.clone().applyMatrix4(m))); if (k[0] === 'e') { const e = D.edges.get(id); box.expandByPoint(D.verts.get(e.a).p.clone().applyMatrix4(m)); box.expandByPoint(D.verts.get(e.b).p.clone().applyMatrix4(m)); } if (k[0] === 'i') { const { box: b, m: mm } = app.instBox([...app.activePath, id]); box.union(b.clone().applyMatrix4(mm)); } }
    if (!box.isEmpty()) app.zoomExtents(box);
  }
  copySel(cut) {
    const app = this.app; const D = app.activeDef; if (!app.sel.size) return;
    const T0 = new G.Def('clip', 'group'); const keys = [...app.sel];
    const fids = keys.filter((k) => k[0] === 'f').map((k) => +k.slice(2)), eids = keys.filter((k) => k[0] === 'e').map((k) => +k.slice(2));
    const m = app.activeMatrix;
    G.copyGeometry(D, T0, fids, eids, m);
    const insts = keys.filter((k) => k[0] === 'i').map((k) => { const it = D.insts.get(+k.slice(2)); return { def: it.def, m: m.clone().multiply(it.m).toArray(), mat: it.mat, name: it.name }; });
    const box = new THREE.Box3(); for (const v of T0.verts.values()) box.expandByPoint(v.p);
    for (const it of insts) { const b = new THREE.Box3(); G.bboxOfDef(app.model.defs, app.model.defs.get(it.def), new Matrix4().fromArray(it.m), b); box.union(b); }
    this.clip = { geo: defToJSON(T0), insts, origin: box.isEmpty() ? new Vector3() : box.min.clone(), defs: this.collectDefs(insts.map((i) => i.def)) };
    if (cut) this.deleteSel();
    this.toast(cut ? 'Coupé' : 'Copié');
  }
  collectDefs(ids) { const out = {}; const walk = (id) => { if (out[id]) return; const d = this.app.model.defs.get(id); if (!d) return; out[id] = defToJSON(d); for (const it of d.insts.values()) walk(it.def); }; ids.forEach(walk); return out; }
  paste(inPlace) {
    const app = this.app; const c = this.clip; if (!c) { this.toast('Presse-papiers vide'); return; }
    for (const [id, j] of Object.entries(c.defs)) if (!app.model.defs.has(+id)) app.model.defs.set(+id, defFromJSON(j));
    // définition temporaire = contenu du presse-papiers
    const ND = defFromJSON({ ...c.geo, id: G.nid(), name: 'Collage', kind: 'group' });
    const o = c.origin; const toL = new Matrix4().makeTranslation(-o.x, -o.y, -o.z);
    for (const v of ND.verts.values()) v.p.applyMatrix4(toL);
    for (const it of c.insts) { const id = G.nid(); ND.insts.set(id, { id, def: it.def, m: new Matrix4().fromArray(it.m).premultiply(toL), mat: it.mat, name: it.name, hidden: false, tag: null }); }
    ND.touch(); ND.pasteTemp = true; app.model.defs.set(ND.id, ND);
    if (inPlace) {
      const lo = app.toLocal(o);
      app.commit('Coller sur place', () => { const id = G.nid(); app.activeDef.insts.set(id, { id, def: ND.id, m: new Matrix4().makeTranslation(lo.x, lo.y, lo.z), hidden: false, mat: null, name: '', tag: null }); app.sel.clear(); app.sel.add('i:' + id); O.explode(app); });
      return;
    }
    const pt = this.tools.place; pt.setDef(ND.id); this.setTool('place');
    const origClick = pt.click.bind(pt);
    pt.click = (e) => { origClick(e); pt.click = origClick; if (app.sel.size === 1) { const k = [...app.sel][0]; const it = app.activeDef.insts.get(+k.slice(2)); if (it && it.def === ND.id) { app.undoStack.pop(); O.explode(app); app.undoStack.splice(-1, 1, app.undoStack[app.undoStack.length - 1]); } } };
  }
  async text3d() {
    const r = await this.form('Texte 3D', [['text', 'Texte', 'G&L Créations'], ['size', 'Hauteur des lettres', '200 mm'], ['depth', 'Épaisseur (extrusion)', '10 mm'], ['stand', 'Debout (vertical)', true, 'checkbox']]);
    if (!r || !r.text) return;
    const size = parseLen(this.app.model, r.size) || 200, depth = parseLen(this.app.model, r.depth) || 0;
    try { const id = O.make3DText(this.app, r.text, size, depth, r.stand); this.tools.place.setDef(id); this.setTool('place'); this.renderComponents(); } catch (e) { this.toast('Erreur : ' + e.message); }
  }

  // ----------------------------------------------------------- Fichiers
  async initDownloads() { try { if (window.claude?.use) this.dl = await window.claude.use('downloads'); } catch (e) { this.dl = null; } }
  async saveFile(name, data) {
    if (this.native) { const p = await this.native.saveAs(name, toBytes(data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data)); if (p) this.toast('Enregistré : ' + p); return p; }
    const ext = name.split('.').pop().toLowerCase();
    const allowed = ['png', 'json', 'txt', 'zip', 'svg', 'html', 'csv', 'pdf'];
    let fname = name, payload = data;
    if (this.dl) {
      if (!allowed.includes(ext)) { payload = O.zipOne(name, data instanceof ArrayBuffer ? new Uint8Array(data) : data); fname = name + '.zip'; }
      try { await this.dl.save({ filename: fname, data: payload instanceof Uint8Array ? new Blob([payload]) : payload }); this.toast('Fichier enregistré : ' + fname); return; }
      catch (e) { if (e && e.code === 'declined') return; if (e && !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) { this.toast('Échec : ' + (e.message || e.code)); return; } }
    }
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async saveProject(as) {
    const j = JSON.stringify(this.app.model.toJSON());
    if (this.native) {
      let p = this.filePath;
      if (!p || as) p = await this.native.saveAs(this.fileBase() + '.glsketch', toBytes(j), true); else await this.native.write(p, toBytes(j));
      if (!p) return; this.filePath = p; this.app.model.name = p.split(/[\\/]/).pop().replace(/\.glsketch(\.json)?$/i, '');
      this.app.dirty = false; this.native.setDirty(false); this.native.addRecent(p); this.afterChange(); this.toast('Projet enregistré'); this.autosave(true); return;
    }
    this.saveFile(this.fileBase() + '.glsketch.json', j); this.app.dirty = false; this.autosave(true);
  }
  exportPNG() { this.app.render(); this.app.tick(); this.app.renderer.domElement.toBlob((b) => this.saveFile(this.fileBase() + '.png', b)); }
  async onFile(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    this.openData(f.name, await f.arrayBuffer());
  }
  async openData(fname, buf, path) {
    const name = fname.toLowerCase();
    try {
      if (name.endsWith('.json') || name.endsWith('.glsk') || name.endsWith('.glsketch') || name.endsWith('.txt')) {
        const j = JSON.parse(new TextDecoder().decode(buf)); if (j.app !== 'G&L Sketch') throw new Error("Ce n'est pas un projet G&L Sketch");
        this.app.load(j); this.app.model.name = fname.replace(/\.glsketch(\.json)?$|\.json$/i, ''); this.filePath = path || null;
        if (this.native) { this.native.setDirty(false); if (path) this.native.addRecent(path); }
        this.renderAll(); this.toast('Projet ouvert');
      } else if (name.endsWith('.stl') || name.endsWith('.obj')) {
        this.toast('Import en cours…'); await new Promise((r) => setTimeout(r, 30));
        const id = O.importMesh(this.app, fname, buf);
        this.tools.place.setDef(id); this.setTool('place'); this.renderComponents(); this.toast('Cliquez pour placer l\'import');
      }
    } catch (err) { this.toast('Impossible d\'ouvrir : ' + err.message); }
  }
  autosave(now) {
    clearTimeout(this._as);
    const go = () => { try { localStorage.setItem('glsketch-autosave', JSON.stringify(this.app.model.toJSON())); } catch (e) { /* stockage indisponible */ } };
    if (now) go(); else this._as = setTimeout(go, 800);
  }
  restoreAutosave() {
    try { const s = localStorage.getItem('glsketch-autosave'); if (!s) return; const j = JSON.parse(s); const D = j.defs.find((d) => d.id === j.root); if (!D || (!D.v.length && !D.i.length)) return; this.app.load(j); setTimeout(() => this.toast('Dernier travail restauré automatiquement'), 400); } catch (e) { /* */ }
  }
  afterChange() { if (this.native) { this.native.setDirty(!!this.app.dirty); this.native.setTitle((this.app.model.name || 'Sans titre') + (this.app.dirty ? ' •' : '') + ' — G&L Sketch'); } this.autosave(); this.renderEntityInfo(); this.renderOutliner(); this.renderComponents(); $('#docname').textContent = this.app.model.name; $('#dirtydot').classList.toggle('on', !!this.app.dirty); }

  // ----------------------------------------------------------- Modales
  modal(html, buttons, onOpen) {
    return new Promise((resolve) => {
      const m = $('#modal'); m.innerHTML = ''; m.classList.add('on');
      const box = h('div', { class: 'mbox' }); box.innerHTML = html;
      const bar = h('div', { class: 'mbtns' });
      buttons.forEach(([label, val, primary]) => bar.append(h('button', { class: primary ? 'primary' : '', onclick: () => { m.classList.remove('on'); resolve(val === undefined ? null : typeof val === 'function' ? val(box) : val); } }, label)));
      box.append(bar); m.append(box);
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); bar.querySelector('.primary')?.click(); } if (e.key === 'Escape') { m.classList.remove('on'); resolve(null); } e.stopPropagation(); });
      if (onOpen) onOpen(box); setTimeout(() => box.querySelector('input')?.focus(), 30);
    });
  }
  prompt(title, def = '') { return this.modal(`<h3>${esc(title)}</h3><input class="full" value="${esc(def)}">`, [['Annuler'], ['OK', (b) => b.querySelector('input').value, true]]); }
  confirm(msg) { return this.modal(`<p>${esc(msg)}</p>`, [['Annuler', false], ['OK', true, true]]); }
  form(title, fields) {
    const html = `<h3>${esc(title)}</h3><div class="${fields.length > 6 ? 'fgrid' : ''}">` + fields.map(([k, label, def, type]) => type === 'checkbox' ? `<label class="row"><input type="checkbox" name="${k}" ${def ? 'checked' : ''}> ${esc(label)}</label>` : type === 'select' ? `<label class="col">${esc(label)}<select name="${k}">${def.map((o) => `<option value="${o[0]}" ${o[2] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>` : `<label class="col">${esc(label)}<input name="${k}" value="${esc(def)}"></label>`).join('') + '</div>';
    return this.modal(html, [['Annuler'], ['OK', (b) => { const o = {}; fields.forEach(([k, , , type]) => { const el = b.querySelector(`[name="${k}"]`); o[k] = type === 'checkbox' ? el.checked : el.value; }); return o; }, true]]);
  }
  async modelInfo() {
    const m = this.app.model;
    const r = await this.form('Infos sur le modèle', [['name', 'Nom du projet', m.name], ['units', 'Unités', [['mm', 'Millimètres', m.units === 'mm'], ['cm', 'Centimètres', m.units === 'cm'], ['m', 'Mètres', m.units === 'm']], 'select'], ['precision', 'Décimales affichées', String(m.precision)]]);
    if (!r) return; m.name = r.name || m.name; m.units = r.units; m.precision = Math.max(0, Math.min(4, parseInt(r.precision) || 0)); this.afterChange(); this.renderEntityInfo(); this.app.refreshAnnotations();
  }
  help() {
    const rows = [['Espace', 'Sélectionner'], ['L', 'Ligne'], ['A', 'Arc'], ['R', 'Rectangle'], ['C', 'Cercle'], ['P', 'Pousser/tirer'], ['F', 'Décalage'], ['M', 'Déplacer (Ctrl = copier)'], ['Q', 'Faire pivoter'], ['S', 'Échelle'], ['T', 'Mètre / guides'], ['D', 'Cotation'], ['B', 'Colorier (Alt = pipette)'], ['E', 'Gomme (Maj = masquer, Ctrl = adoucir)'], ['O / H / Z', 'Orbite / Panoramique / Zoom'], ['Maj+Z', 'Zoom étendu'], ['G', 'Créer un composant'], ['Ctrl+G', 'Créer un groupe'], ['Flèches', 'Verrouiller un axe (→ rouge, ← vert, ↑ bleu, ↓ parallèle)'], ['Maj (maintenu)', "Verrouiller l'inférence"], ['Bouton du milieu', 'Orbite (Maj = panoramique)'], ['Molette', 'Zoom vers le curseur'], ['Saisie au clavier', 'Va directement dans la boîte Mesures (ex : 1500, 3000;2000, 24c, x5, /4)'], ['Double-clic', 'Ouvrir un groupe / répéter pousser-tirer'], ['Échap', 'Annuler l\'opération / fermer le groupe'], ['iPhone', '1 doigt = outil, 2 doigts = déplacer + pincer pour zoomer, 3 doigts = orbite, appui long = menu']];
    this.modal('<h3>Raccourcis</h3><table class="keys">' + rows.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('') + '</table>', [['Fermer']]);
  }

  // ----------------------------------------------------- Menu contextuel
  showCtx(E) {
    const app = this.app; const ent = app.pickEntity(E.x, E.y);
    if (ent && !ent.outside && !app.sel.has(ent.key)) { app.sel.clear(); app.sel.add(ent.key); app.refreshSelection(); }
    const hasI = [...app.sel].some((k) => k[0] === 'i'), hasF = [...app.sel].some((k) => k[0] === 'f'), hasE = [...app.sel].some((k) => k[0] === 'e');
    const nI = [...app.sel].filter((k) => k[0] === 'i').length;
    const items = [];
    if (app.sel.size) {
      items.push(['Effacer', 'delete'], ['Masquer', 'hide'], ['Zoom sur la sélection', 'zoomsel'], '-');
      if (hasI) items.push(['Modifier le groupe/composant', 'edit'], ['Éclater', 'explode'], ['Rendre unique', 'unique']);
      items.push(['Créer un groupe', 'group'], ['Créer un composant…', 'component']);
      if (nI === 2) items.push('-', ['Union', 'solid:union'], ['Soustraire', 'solid:sub'], ['Intersection', 'solid:inter']);
      if (hasF) items.push('-', ['Inverser les faces', 'reverse']);
      if (hasE) items.push('-', ['Adoucir', 'soften'], ['Durcir', 'harden']);
      items.push('-', ['Copier', 'copy'], ['Couper', 'cut']);
    }
    if (this.clip) items.push(['Coller', 'paste']);
    if (app.activePath.length) items.push('-', ['Fermer le groupe', 'closeCtx']);
    items.push('-', ['Zoom étendu', 'zoomext'], ['Afficher tout', 'unhideAll']);
    const m = $('#ctxmenu'); m.innerHTML = '';
    for (const it of items) m.append(it === '-' ? h('hr') : h('button', { onclick: (e) => { e.stopPropagation(); this.hideCtx(); this.cmd(it[1]); } }, it[0]));
    const r = $('#viewport').getBoundingClientRect();
    m.style.display = 'block';
    const x = Math.min(E.x + r.left, window.innerWidth - m.offsetWidth - 6), y = Math.min(E.y + r.top, window.innerHeight - m.offsetHeight - 6);
    m.style.left = x + 'px'; m.style.top = Math.max(6, y) + 'px';
  }
  hideCtx() { $('#ctxmenu').style.display = 'none'; }

  // ----------------------------------------------------- Étiquettes HTML
  updateLabels() {
    const app = this.app; const L = $('#labels'); const parts = [];
    for (const d of app.model.dims) {
      const p = d.a.clone().add(d.o).lerp(d.b.clone().add(d.o), 0.5); const s = app.project(p); if (s.z > 1) continue;
      parts.push(`<div class="dimlbl" style="left:${s.x}px;top:${s.y}px">${esc(fmtLen(app.model, d.a.distanceTo(d.b)))}</div>`);
    }
    for (const t of app.model.texts) { const s = app.project(t.p); if (s.z > 1) continue; parts.push(`<div class="txtlbl" style="left:${s.x}px;top:${s.y}px">${esc(t.text)}</div>`); }
    const html = parts.join(''); if (html !== this._lblHtml) { L.innerHTML = html; this._lblHtml = html; }
  }
  updateContextBar() {
    const app = this.app; const bar = $('#ctxbar');
    if (!app.activePath.length) { bar.style.display = 'none'; return; }
    const names = []; let D = app.model.root;
    for (const iid of app.activePath) { const it = D.insts.get(iid); D = app.model.defs.get(it.def); names.push(D.name); }
    bar.style.display = 'flex'; bar.innerHTML = '';
    bar.append(h('span', {}, 'Modification : ' + names.join(' › ')), h('button', { onclick: () => app.exitContext() }, 'Fermer ✕'));
  }

  // ------------------------------------------------------------ Windows
  initNative() {
    const n = this.native;
    n.onOpenFile((f) => this.openData(f.name, f.data, f.path));
    n.onSaveBeforeClose(async () => { await this.saveProject(false); if (!this.app.dirty) n.closeNow(); });
    document.documentElement.classList.add('native');
  }
  async recent() {
    if (!this.native) { this.toast('Disponible dans la version Windows'); return; }
    const list = await this.native.getRecent();
    if (!list.length) { this.toast('Aucun fichier récent'); return; }
    const pick = await this.modal('<h3>Fichiers récents</h3>' + list.map((p, i) => `<button class="listbtn" data-i="${i}">${esc(p.split(/[\\/]/).pop())}<em>${esc(p)}</em></button>`).join(''), [['Fermer']], (box) => {
      box.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => { $('#modal').classList.remove('on'); const f = await this.native.openPath(list[+b.dataset.i]); if (f) this.openData(f.name, f.data, f.path); else this.toast('Fichier introuvable'); }));
    });
    void pick;
  }

  // ------------------------------------------------------------ Métallerie
  matOptions(def) { return [['mAcier', 'Acier brut'], ['mNoir', 'Acier noir RAL 9005'], ['mAnthracite', 'Anthracite RAL 7016'], ['mCorten', 'Acier Corten'], ['mAlu', 'Alu blanc RAL 9016'], ['mInox', 'Inox brossé']].map(([v, l]) => [v, l, v === def]); }
  num(v, d) { const x = parseLen(this.app.model, v); return x == null ? d : x; }
  async generator(kind) {
    const app = this.app; O.ensureLibMaterials(app); let id = null;
    const L = (v) => fmtLen(app.model, v);
    if (kind === 'gc') {
      const r = await this.form('Garde-corps droit', [['L', 'Longueur totale', L(3000)], ['H', 'Hauteur finie (≥ 1 000 mm)', L(1000)], ['post', 'Poteaux tube carré (côté)', '40'], ['postT', 'Épaisseur poteaux', '2'], ['entraxe', 'Entraxe maxi des poteaux', L(1200)], ['rail', 'Main courante tube carré', '40'], ['railT', 'Épaisseur main courante', '2'], ['lowRail', 'Lisse basse (0 = aucune)', '30'], ['lowGap', 'Hauteur sous lisse basse', '100'],
        ['fill', 'Remplissage', [['barreaux', 'Barreaux verticaux', true], ['lisses', 'Lisses horizontales'], ['tole', 'Tôle Corten'], ['verre', 'Verre feuilleté'], ['aucun', 'Aucun']], 'select'], ['bar', 'Barreaux / lisses tube carré', '20'], ['barT', 'Épaisseur barreaux', '1.5'], ['maxGap', 'Vide maxi entre barreaux (norme : 110)', '110'], ['mat', 'Finition', this.matOptions('mNoir'), 'select'], ['platine', 'Platines de fixation', true, 'checkbox']]);
      if (!r) return;
      const o = { L: this.num(r.L, 3000), H: this.num(r.H, 1000), post: +r.post || 40, postT: parseFloat(String(r.postT).replace(',', '.')) || 2, entraxe: this.num(r.entraxe, 1200), rail: +r.rail || 40, railT: parseFloat(String(r.railT).replace(',', '.')) || 2, lowRail: +r.lowRail || 0, lowGap: +r.lowGap || 100, fill: r.fill, bar: +r.bar || 20, barT: parseFloat(String(r.barT).replace(',', '.')) || 1.5, maxGap: +r.maxGap || 110, mat: r.mat, platine: r.platine };
      if (o.H < 1000) this.toast('Attention : hauteur inférieure à 1 m (norme NF P01-012)');
      id = app.commit('Garde-corps', () => F.genGardeCorps(app, o));
    } else if (kind === 'esc') {
      const r = await this.form('Escalier droit', [['H', 'Hauteur à monter (sol fini à sol fini)', L(2700)], ['R', 'Reculement (longueur au sol)', L(3600)], ['n', 'Nombre de hauteurs de marche (0 = auto)', '0'], ['W', 'Largeur (emmarchement)', L(900)], ['limonH', 'Hauteur des limons (tôle)', '250'], ['limonT', 'Épaisseur des limons', '10'], ['stepT', 'Épaisseur des marches', '40'], ['nose', 'Nez de marche (débord)', '30'],
        ['stepMat', 'Marches', [['mChene', 'Bois chêne', true], ['mPin', 'Bois pin'], ['mAcier', 'Tôle acier'], ['mCorten', 'Tôle Corten']], 'select'], ['mat', 'Limons', this.matOptions('mNoir'), 'select']]);
      if (!r) return;
      const o = { H: this.num(r.H, 2700), R: this.num(r.R, 3600), n: parseInt(r.n) || 0, W: this.num(r.W, 900), limonH: +r.limonH || 250, limonT: +r.limonT || 10, stepT: +r.stepT || 40, nose: +r.nose || 0, stepMat: r.stepMat, mat: r.mat };
      const c = F.stairCalc(o.H, o.R, o.n);
      const ok = await this.modal(`<h3>Calcul de l'escalier</h3><table class="keys"><tr><td>Hauteurs de marche</td><td><b>${c.n}</b> × ${c.h.toFixed(1).replace('.', ',')} mm</td></tr><tr><td>Giron</td><td><b>${c.g.toFixed(1).replace('.', ',')} mm</b> (${c.n - 1} marches)</td></tr><tr><td>Formule de Blondel (2h + g)</td><td><b>${c.blondel.toFixed(0)} mm</b> ${c.blondel >= 600 && c.blondel <= 650 ? '✅ confortable' : '⚠️ hors 600–650'}</td></tr><tr><td>Pente</td><td>${c.angle.toFixed(1).replace('.', ',')}°</td></tr></table>${c.h > 200 ? '<p>⚠️ Marche haute (> 200 mm) : augmentez le nombre de marches.</p>' : ''}`, [['Annuler', false], ['Créer', true, true]]);
      if (!ok) return;
      id = app.commit('Escalier', () => F.genEscalier(app, o));
    } else if (kind === 'perg') {
      const r = await this.form('Pergola', [['L', 'Longueur (façade)', L(4000)], ['P', 'Profondeur', L(3000)], ['H', 'Hauteur totale', L(2500)], ['post', 'Poteaux tube carré', '100'], ['postT', 'Épaisseur poteaux', '4'], ['maxSpan', 'Portée maxi entre poteaux', L(4500)], ['beamH', 'Poutres : hauteur', '150'], ['beamW', 'Poutres : largeur', '50'], ['beamT', 'Poutres : épaisseur', '3'],
        ['roof', 'Couverture', [['ventelles', 'Ventelles / lames', true], ['chevrons', 'Chevrons espacés'], ['polycarbonate', 'Polycarbonate'], ['toile', 'Toile'], ['aucune', 'Aucune']], 'select'], ['slatW', 'Lames : largeur', '40'], ['slatH', 'Lames : hauteur', '80'], ['slatPitch', 'Lames : entraxe', '120'], ['mat', 'Finition', this.matOptions('mAnthracite'), 'select'], ['platine', 'Platines de fixation', true, 'checkbox']]);
      if (!r) return;
      const o = { L: this.num(r.L, 4000), P: this.num(r.P, 3000), H: this.num(r.H, 2500), post: +r.post || 100, postT: +r.postT || 4, maxSpan: this.num(r.maxSpan, 4500), beamH: +r.beamH || 150, beamW: +r.beamW || 50, beamT: +r.beamT || 3, roof: r.roof, slatW: +r.slatW || 40, slatH: +r.slatH || 80, slatPitch: +r.slatPitch || 120, mat: r.mat, platine: r.platine };
      id = app.commit('Pergola', () => F.genPergola(app, o));
    } else if (kind === 'port') {
      const r = await this.form('Portail battant', [['L', 'Largeur de passage', L(3500)], ['H', 'Hauteur', L(1500)], ['leaves', 'Vantaux', [['2', '2 vantaux', true], ['1', '1 vantail']], 'select'], ['frame', 'Cadre tube carré', '60'], ['frameT', 'Épaisseur cadre', '2'], ['fill', 'Remplissage', [['barreaux', 'Barreaux', true], ['lames', 'Lames horizontales'], ['tole', 'Tôle pleine'], ['corten', 'Tôle Corten']], 'select'], ['bar', 'Barreaux / lames (mm)', '25'], ['maxGap', 'Vide entre barreaux / lames', '100'], ['gap', 'Jeu entre vantaux', '20'], ['ground', 'Garde au sol', '50'], ['mat', 'Finition', this.matOptions('mAnthracite'), 'select'], ['pillars', 'Piliers acier 150×150', true, 'checkbox']]);
      if (!r) return;
      const o = { L: this.num(r.L, 3500), H: this.num(r.H, 1500), leaves: +r.leaves, frame: +r.frame || 60, frameT: +r.frameT || 2, fill: r.fill, bar: +r.bar || 25, maxGap: +r.maxGap || 100, gap: +r.gap || 20, ground: +r.ground || 50, mat: r.mat, pillars: r.pillars, pillarW: 150 };
      id = app.commit('Portail', () => F.genPortail(app, o));
    } else if (kind === 'prof') {
      const items = []; for (const c of O.LIBRARY) for (const [n, mk] of c.items) if (mk.length || /Tube|IPE|HEA|UPN|Cornière|Fer|Rond|Carré/.test(n)) items.push([n, mk]);
      const r = await this.form('Profilé sur mesure', [['p', 'Profilé', items.map(([n], i) => [String(i), n, i === 1]), 'select'], ['L', 'Longueur', L(2000)], ['dir', 'Orientation', [['x', 'Horizontal (axe rouge)', true], ['y', 'Horizontal (axe vert)'], ['z', 'Vertical (poteau)']], 'select'], ['mat', 'Finition', this.matOptions('mAcier'), 'select']]);
      if (!r) return;
      const [n, mk] = items[+r.p]; const len = this.num(r.L, 1000);
      const defId = O.libraryDef(app, n, mk, len); const D = app.model.defs.get(defId);
      if (r.mat !== 'mAcier') for (const f of D.faces.values()) f.mat = r.mat;
      if (r.dir !== 'x') {
        const W = new G.Def(n + ' L=' + Math.round(len) + (r.dir === 'z' ? ' (vertical)' : ''), 'component'); const iid = G.nid();
        const m = r.dir === 'z' ? new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)) : new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1));
        const box = new THREE.Box3(); G.bboxOfDef(app.model.defs, D, m, box); m.premultiply(new Matrix4().makeTranslation(-box.min.x, -box.min.y, -box.min.z));
        W.insts.set(iid, { id: iid, def: defId, m, name: '', hidden: false, tag: null, mat: null }); W.touch(); app.model.defs.set(W.id, W);
        this.tools.place.setDef(W.id);
      } else this.tools.place.setDef(defId);
      this.setTool('place'); this.renderComponents(); this.toast('Cliquez pour placer le profilé'); return;
    }
    if (id) { this.tools.place.setDef(id); this.setTool('place'); this.renderComponents(); this.toast('Cliquez pour placer l\'ouvrage (point d\'origine = coin bas gauche)'); }
  }
  async report() {
    const app = this.app; O.ensureLibMaterials(app);
    let scope = 'tout'; let rows, areas;
    const selI = [...app.sel].filter((k) => k[0] === 'i').map((k) => +k.slice(2));
    const compute = () => {
      if (scope === 'sel' && selI.length) {
        const D = app.activeDef; const tmp = new G.Def('tmp'); for (const id of selI) tmp.insts.set(id, D.insts.get(id));
        rows = F.cutList(app, tmp, app.activeMatrix);
      } else rows = F.cutList(app);
      areas = F.areaReport(app);
    };
    compute();
    const f2 = (x, d = 2) => x.toFixed(d).replace('.', ',');
    const html = () => {
      const tot = rows.reduce((a, r) => a + r.totKg, 0);
      const byProfile = new Map(); for (const r of rows) if (/^(Tube|IPE|HEA|UPN|Cornière|Fer|Rond|Carré|Plat |Lisse|Main)/i.test(r.name)) byProfile.set(r.name, (byProfile.get(r.name) || 0) + r.L * r.qty);
      return `<h3>Liste de débit, poids et métré</h3>${selI.length ? `<label class="row"><input type="checkbox" id="rscope" ${scope === 'sel' ? 'checked' : ''}> Seulement la sélection (${selI.length})</label>` : ''}
      <div class="rtable"><table class="keys"><tr><th>Désignation</th><th>Long.</th><th>Section</th><th>Qté</th><th>Poids</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}<div class="muted">${esc(r.mat)}</div></td><td>${Math.round(r.L)}</td><td>${Math.round(r.dims[1])}×${Math.round(r.dims[2])}</td><td><b>${r.qty}</b></td><td>${r.density ? f2(r.totKg, 1) + ' kg' : '—'}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">Aucun groupe ou composant. Les pièces doivent être des groupes/composants (les générateurs le font automatiquement).</td></tr>'}
      <tr><td colspan=4><b>Poids total estimé</b></td><td><b>${f2(tot, 1)} kg</b></td></tr></table></div>
      <div class="sub">Longueur totale par profilé (pour commander les barres de 6 m)</div><table class="keys">${[...byProfile].map(([n, l]) => `<tr><td>${esc(n)}</td><td>${f2(l / 1000)} m</td><td class="muted">≈ ${Math.ceil(l / 6000 * 1.05)} barre(s) de 6 m</td></tr>`).join('')}</table>
      <div class="sub">Surfaces par matière</div><table class="keys">${areas.map((a) => `<tr><td>${esc(a.name)}</td><td>${f2(a.m2)} m²</td></tr>`).join('')}</table>
      <div class="btnrow"><button id="rcsv">Exporter CSV (Excel)</button><button id="rcopy">Copier</button></div>`;
    };
    const wire = (box) => {
      box.querySelector('#rcsv').onclick = () => this.saveFile(this.fileBase() + ' - liste de débit.csv', F.cutListCSV(app, rows, areas));
      box.querySelector('#rcopy').onclick = async () => { try { await navigator.clipboard.writeText(F.cutListCSV(app, rows, areas).replace(/;/g, '\t')); this.toast('Copié : collez dans Excel'); } catch (e) { this.toast('Copie impossible ici'); } };
      const sc = box.querySelector('#rscope'); if (sc) sc.onchange = () => { scope = sc.checked ? 'sel' : 'tout'; compute(); const bar = box.querySelector('.mbtns'); box.innerHTML = html(); box.append(bar); wire(box); };
    };
    this.modal(html(), [['Fermer']], wire);
  }
  async softenAngle() {
    const r = await this.form('Adoucir / lisser les arêtes', [['deg', 'Angle maxi entre faces (degrés)', '20'], ['sel', 'Seulement la sélection', this.app.sel.size > 0, 'checkbox']]);
    if (!r) return; let n = 0;
    this.app.commit('Adoucir les arêtes', () => { n = F.softenByAngle(this.app, parseFloat(String(r.deg).replace(',', '.')) || 20, r.sel); });
    this.toast(n + ' arête(s) modifiée(s)');
  }

  // ----------------------------------------------------------- Panneaux
  openPanel(id) { this.root.classList.add('tray-open'); this.activePanel = id; this.root.querySelectorAll('.tray .panel').forEach((p) => p.classList.toggle('open', p.id === 'p-' + id)); this.root.querySelectorAll('.tray .tab[data-panel]').forEach((t) => t.classList.toggle('on', t.dataset.panel === id)); $('#ptitle').textContent = (PANELS.find((x) => x[0] === id) || [0, ''])[1]; if (id === 'assistant') { this.root.querySelector('.tab[data-panel=assistant]')?.classList.remove('badge'); this.assistant?.render(); } }
  renderAll() { this.renderEntityInfo(); this.renderMaterials(); this.renderComponents(); this.renderTags(); this.renderScenes(); this.renderStyles(); this.renderShadow(); this.renderOutliner(); this.updateContextBar(); $('#docname').textContent = this.app.model.name; }
  renderEntityInfo() {
    const app = this.app; const b = $('#pb-info'); const D = app.activeDef; const sel = [...app.sel]; b.innerHTML = '';
    if (!sel.length) {
      let nf = 0, ne = 0, ni = 0; const walk = (d) => { nf += d.faces.size; ne += d.edges.size; for (const it of d.insts.values()) { ni++; walk(app.model.defs.get(it.def)); } }; walk(app.model.root);
      b.append(h('div', { class: 'muted' }, 'Aucune sélection'), h('div', { class: 'kv' }, h('span', {}, 'Modèle'), h('b', {}, `${nf} faces · ${ne} arêtes · ${ni} groupes/composants`)));
      return;
    }
    const tagSel = () => { const s = h('select', { onchange: (e) => app.commit('Balise', () => { for (const k of app.sel) { const id = +k.slice(2); const o = k[0] === 'f' ? D.faces.get(id) : k[0] === 'e' ? D.edges.get(id) : D.insts.get(id); if (o) o.tag = e.target.value === 'untagged' ? null : e.target.value; } D.touch(); }) }, app.model.tags.map((t) => h('option', { value: t.id }, t.name))); const first = sel[0]; const id = +first.slice(2); const o = first[0] === 'f' ? D.faces.get(id) : first[0] === 'e' ? D.edges.get(id) : D.insts.get(id); s.value = o?.tag || 'untagged'; return h('div', { class: 'kv' }, h('span', {}, 'Balise'), s); };
    if (sel.length === 1) {
      const [t, id] = [sel[0][0], +sel[0].slice(2)];
      if (t === 'f') { const f = D.faces.get(id); const md = f.mat ? app.model.materials.get(f.mat) : null; b.append(h('div', { class: 'etitle' }, 'Face'), h('div', { class: 'kv' }, h('span', {}, 'Surface'), h('b', {}, fmtArea(app.model, G.faceArea(D, f)))), h('div', { class: 'kv' }, h('span', {}, 'Matière'), h('b', {}, md ? md.name : 'Par défaut')), tagSel()); }
      if (t === 'e') { const e = D.edges.get(id); const L = D.verts.get(e.a).p.distanceTo(D.verts.get(e.b).p); b.append(h('div', { class: 'etitle' }, 'Arête'), h('div', { class: 'kv' }, h('span', {}, 'Longueur'), h('b', {}, fmtLen(app.model, L))), h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: e.soft ? 'checked' : null, onchange: (ev) => app.commit('Adoucir', () => { e.soft = ev.target.checked; D.touch(); }) }), ' Adoucie / lissée'), tagSel()); }
      if (t === 'i') {
        const it = D.insts.get(id); const def = app.model.defs.get(it.def); const pos = new Vector3().setFromMatrixPosition(it.m);
        const cnt = this.countInstances(def.id);
        b.append(h('div', { class: 'etitle' }, def.kind === 'component' ? `Composant (${cnt} instance${cnt > 1 ? 's' : ''})` : 'Groupe'),
          h('div', { class: 'kv' }, h('span', {}, 'Définition'), h('input', { value: def.name, onchange: (e) => app.commit('Renommer', () => { def.name = e.target.value; }) })),
          h('div', { class: 'kv' }, h('span', {}, 'Instance'), h('input', { value: it.name || '', placeholder: '—', onchange: (e) => app.commit('Renommer', () => { it.name = e.target.value; }) })),
          h('div', { class: 'kv3' }, h('span', {}, 'Position'), ...['x', 'y', 'z'].map((ax) => h('input', { value: fmtLen(app.model, pos[ax], false), title: ax.toUpperCase(), onchange: (e) => { const v = parseLen(app.model, e.target.value); if (v == null) return; app.commit('Position', () => { const p = new Vector3().setFromMatrixPosition(it.m); p[ax] = v; it.m.setPosition(p); D.touch(); }); } }))),
          h('div', { class: 'kv' }, h('span', {}, 'Volume'), h('b', {}, O.isSolid(app, def.id) ? 'Solide ✓' : 'Non solide')), tagSel());
      }
      return;
    }
    const n = { f: 0, e: 0, i: 0 }; sel.forEach((k) => n[k[0]]++);
    let area = 0; sel.filter((k) => k[0] === 'f').forEach((k) => (area += G.faceArea(D, D.faces.get(+k.slice(2)))));
    let len = 0; sel.filter((k) => k[0] === 'e').forEach((k) => { const e = D.edges.get(+k.slice(2)); len += D.verts.get(e.a).p.distanceTo(D.verts.get(e.b).p); });
    b.append(h('div', { class: 'etitle' }, `${sel.length} entités`), h('div', { class: 'muted' }, `${n.f} faces, ${n.e} arêtes, ${n.i} groupes/composants`));
    if (n.f) b.append(h('div', { class: 'kv' }, h('span', {}, 'Surface totale'), h('b', {}, fmtArea(app.model, area))));
    if (n.e) b.append(h('div', { class: 'kv' }, h('span', {}, 'Longueur totale'), h('b', {}, fmtLen(app.model, len))));
    b.append(tagSel());
  }
  countInstances(defId) { let n = 0; for (const d of this.app.model.defs.values()) for (const it of d.insts.values()) if (it.def === defId) n++; return n; }
  renderMaterials() {
    const app = this.app; const b = $('#pb-mat'); b.innerHTML = '';
    const cur = app.currentMat ? app.model.materials.get(app.currentMat) : null;
    const sw = (md, big) => { const url = md && md.tex ? swatchURL(md) : null; return h('span', { class: 'swatch' + (big ? ' big' : ''), style: `background:${url ? `url(${url}) center/cover` : md ? md.color : 'linear-gradient(135deg,#f3f1ec 50%,#8d9fb8 50%)'};${md && md.opacity < 1 ? 'opacity:.6' : ''}` }); };
    b.append(h('div', { class: 'curmat' }, sw(cur, true), h('div', {}, h('b', {}, cur ? cur.name : 'Par défaut'), h('div', { class: 'muted' }, 'Outil Colorier (B) pour appliquer'))));
    const grid = h('div', { class: 'matgrid' });
    grid.append(h('button', { class: 'mat' + (!app.currentMat ? ' on' : ''), title: 'Par défaut', onclick: () => { app.currentMat = null; this.renderMaterials(); this.setTool('paint'); } }, sw(null)));
    for (const md of app.model.materials.values()) grid.append(h('button', { class: 'mat' + (app.currentMat === md.id ? ' on' : ''), title: md.name, onclick: () => { app.currentMat = md.id; this.renderMaterials(); this.setTool('paint'); } }, sw(md)));
    b.append(grid);
    if (cur) {
      const ed = h('div', { class: 'matedit' },
        h('div', { class: 'kv' }, h('span', {}, 'Nom'), h('input', { value: cur.name, onchange: (e) => { cur.name = e.target.value; this.renderMaterials(); app.emit('changed'); } })),
        h('div', { class: 'kv' }, h('span', {}, 'Couleur'), h('input', { type: 'color', value: cur.color, oninput: (e) => { cur.color = e.target.value; app.invalidateMaterial(cur.id); }, onchange: () => this.renderMaterials() })),
        h('div', { class: 'kv' }, h('span', {}, 'Opacité'), h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: cur.opacity, oninput: (e) => { cur.opacity = +e.target.value; app.invalidateMaterial(cur.id); } })),
        cur.tex ? h('div', { class: 'kv' }, h('span', {}, 'Taille motif'), h('input', { value: fmtLen(app.model, cur.tex.size), onchange: (e) => { const v = parseLen(app.model, e.target.value); if (v) { cur.tex.size = v; app.invalidateMaterial(cur.id); } } })) : null,
        h('div', { class: 'btnrow' },
          h('button', { onclick: () => { const id = app.model.addMaterial({ name: 'Matière ' + app.model.materials.size, color: cur.color }); app.currentMat = id; this.renderMaterials(); } }, 'Dupliquer'),
          h('button', { onclick: () => this.importImageMaterial() }, 'Image…'),
          h('button', { onclick: () => { app.commit('Supprimer matière', () => { for (const d of app.model.defs.values()) { for (const f of d.faces.values()) { if (f.mat === cur.id) f.mat = null; if (f.back === cur.id) f.back = null; } for (const i of d.insts.values()) if (i.mat === cur.id) i.mat = null; d.touch(); } app.model.materials.delete(cur.id); }); app.currentMat = null; this.renderMaterials(); } }, 'Supprimer')));
      b.append(ed);
    } else b.append(h('div', { class: 'btnrow' }, h('button', { onclick: () => { const id = app.model.addMaterial({ name: 'Nouvelle matière', color: '#6aa0d8' }); app.currentMat = id; this.renderMaterials(); } }, 'Nouvelle matière'), h('button', { onclick: () => this.importImageMaterial() }, 'Depuis une image…')));
  }
  importImageMaterial() {
    const inp = $('#imgin'); inp.onchange = async () => {
      const f = inp.files[0]; inp.value = ''; if (!f) return;
      const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const id = this.app.model.addMaterial({ name: f.name.replace(/\.\w+$/, ''), color: '#ffffff', tex: { kind: 'image', data, size: 1000 } });
      this.app.currentMat = id; this.app.model.style.faces = 'textured'; this.app.matCache.clear(); this.app.defCache.clear(); this.app.refresh(); this.renderMaterials(); this.renderStyles();
    }; inp.click();
  }
  renderComponents() {
    const app = this.app; const b = $('#pb-comp'); if (!b) return; b.innerHTML = '';
    const comps = [...app.model.defs.values()].filter((d) => d.kind === 'component' && !d.pasteTemp);
    b.append(h('div', { class: 'sub' }, 'Dans le modèle'));
    if (!comps.length) b.append(h('div', { class: 'muted' }, 'Aucun composant. Sélectionnez puis « G ».'));
    for (const d of comps) b.append(h('button', { class: 'listbtn', onclick: () => { this.tools.place.setDef(d.id); this.setTool('place'); } }, h('span', { html: ICONS.component }), h('span', {}, d.name), h('em', {}, '×' + this.countInstances(d.id))));
    b.append(h('div', { class: 'sub' }, 'Bibliothèque G&L'));
    for (const cat of O.LIBRARY) {
      const det = h('details', {}, h('summary', {}, cat.cat));
      for (const [name, make] of cat.items) det.append(h('button', { class: 'listbtn', onclick: () => { const id = O.libraryDef(app, name, make); this.tools.place.setDef(id); this.setTool('place'); this.toast('Cliquez pour placer « ' + name + ' » (longueur 1 m, ajustez avec Échelle ou Pousser/tirer)'); } }, h('span', { html: ICONS.component }), h('span', {}, name)));
      b.append(det);
    }
    b.append(h('div', { class: 'btnrow' }, h('button', { onclick: () => this.cmd('text3d') }, 'Texte 3D…'), h('button', { onclick: () => this.cmd('import') }, 'Importer STL/OBJ…')));
  }
  renderTags() {
    const app = this.app; const b = $('#pb-tags'); b.innerHTML = '';
    for (const t of app.model.tags) {
      b.append(h('div', { class: 'tagrow' },
        h('input', { type: 'radio', name: 'activetag', checked: app.activeTag === t.id ? 'checked' : null, title: 'Balise active', onchange: () => (app.activeTag = t.id) }),
        h('button', { class: 'eye', html: t.visible ? ICONS.eye : ICONS.eyeoff, onclick: () => { t.visible = !t.visible; app.defCache.clear(); app.refresh(); this.renderTags(); } }),
        h('span', { class: 'tname', ondblclick: async () => { if (t.id === 'untagged') return; const n = await this.prompt('Renommer la balise', t.name); if (n) { t.name = n; this.renderTags(); } } }, t.name),
        t.id !== 'untagged' ? h('button', { class: 'mini', html: ICONS.minus, title: 'Supprimer', onclick: () => app.commit('Supprimer balise', () => { for (const d of app.model.defs.values()) { for (const c of [d.faces, d.edges, d.insts]) for (const o of c.values()) if (o.tag === t.id) o.tag = null; d.touch(); } app.model.tags = app.model.tags.filter((x) => x !== t); if (app.activeTag === t.id) app.activeTag = 'untagged'; this.renderTags(); }) }) : null));
    }
    b.append(h('div', { class: 'btnrow' }, h('button', { onclick: async () => { const n = await this.prompt('Nom de la balise', 'Balise ' + app.model.tags.length); if (n) { app.model.tags.push({ id: 't' + G.nid(), name: n, visible: true }); this.renderTags(); this.renderEntityInfo(); } } }, '+ Ajouter une balise')));
  }
  renderScenes() {
    const app = this.app; const b = $('#pb-scenes'); b.innerHTML = ''; const tabs = $('#scenetabs'); tabs.innerHTML = '';
    app.model.scenes.forEach((s, i) => {
      tabs.append(h('button', { class: 'stab', onclick: () => this.goScene(s) }, s.name));
      b.append(h('div', { class: 'tagrow' }, h('span', { class: 'tname', onclick: () => this.goScene(s) }, s.name),
        h('button', { class: 'mini', title: 'Mettre à jour', onclick: () => { Object.assign(s, this.sceneState(s.name)); this.toast('Scène mise à jour'); } }, '↻'),
        h('button', { class: 'mini', title: 'Renommer', onclick: async () => { const n = await this.prompt('Nom de la scène', s.name); if (n) { s.name = n; this.renderScenes(); } } }, '✎'),
        h('button', { class: 'mini', html: ICONS.minus, onclick: () => { app.model.scenes.splice(i, 1); this.renderScenes(); } })));
    });
    tabs.style.display = app.model.scenes.length ? 'flex' : 'none';
    b.append(h('div', { class: 'btnrow' }, h('button', { onclick: () => { app.model.scenes.push(this.sceneState('Scène ' + (app.model.scenes.length + 1))); this.renderScenes(); app.emit('changed'); } }, '+ Ajouter une scène')));
  }
  sceneState(name) { const a = this.app; return { name, pos: a.camera.position.toArray(), target: a.target.toArray(), ortho: a.isOrtho, fov: a.persp.fov, style: { ...a.model.style }, shadow: { ...a.model.shadow }, tags: a.model.tags.map((t) => [t.id, t.visible]) }; }
  goScene(s) {
    const a = this.app; a.setOrtho(!!s.ortho); a.persp.fov = s.fov || 35; a.persp.updateProjectionMatrix();
    if (s.style) Object.assign(a.model.style, s.style); if (s.shadow) Object.assign(a.model.shadow, s.shadow);
    if (s.tags) for (const [id, v] of s.tags) { const t = a.model.tags.find((x) => x.id === id); if (t) t.visible = v; }
    a.matCache.clear(); a.defCache.clear(); a.refresh(); this.renderStyles(); this.renderShadow(); this.renderTags();
    a.animateCamera(new Vector3().fromArray(s.pos), new Vector3().fromArray(s.target), null, 900);
  }
  renderStyles() {
    const app = this.app; const st = app.model.style; const b = $('#pb-styles'); b.innerHTML = '';
    const fsb = h('div', { class: 'stylegrid' }, [['wire', 'Fil de fer'], ['hidden', 'Lignes cachées'], ['shaded', 'Ombré'], ['textured', 'Textures'], ['mono', 'Monochrome']].map(([k, n]) => h('button', { class: st.faces === k ? 'on' : '', title: n, html: ICONS[k] + `<span>${n}</span>`, onclick: () => this.cmd('fs:' + k) })));
    b.append(fsb);
    for (const [k, n] of [['edges', 'Arêtes'], ['backEdges', 'Arêtes arrière'], ['xray', 'Rayons X'], ['axes', 'Axes'], ['guides', 'Guides'], ['hiddenGeom', 'Géométrie masquée'], ['sections', 'Plans de section'], ['sectionCut', 'Coupe active']]) b.append(h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: st[k] ? 'checked' : null, onchange: () => this.cmd('tg:' + k) }), ' ' + n));
    if (app.model.sections.length) {
      b.append(h('div', { class: 'sub' }, 'Plans de section'));
      for (const s of app.model.sections) b.append(h('div', { class: 'tagrow' }, h('input', { type: 'radio', name: 'sec', checked: s.active ? 'checked' : null, onchange: () => { app.model.sections.forEach((x) => (x.active = x === s)); app.refreshAnnotations(); } }), h('span', { class: 'tname' }, s.name), h('button', { class: 'mini', title: 'Inverser', onclick: () => { s.n.negate(); app.refreshAnnotations(); } }, '⇄'), h('button', { class: 'mini', html: ICONS.minus, onclick: () => { app.model.sections = app.model.sections.filter((x) => x !== s); app.refreshAnnotations(); this.renderStyles(); } })));
      b.append(h('label', { class: 'row' }, h('input', { type: 'radio', name: 'sec', checked: !app.model.sections.some((s) => s.active) ? 'checked' : null, onchange: () => { app.model.sections.forEach((x) => (x.active = false)); app.refreshAnnotations(); } }), ' Aucune coupe'));
    }
    this.root.querySelectorAll('.quickbar .tb').forEach((x) => {
      const c = x.dataset.cmd; let on = false;
      if (c.startsWith('fs:')) on = st.faces === c.slice(3); else if (c.startsWith('tg:')) on = !!st[c.slice(3)]; else if (c === 'shadows') on = app.model.shadow.on; else if (c === 'toggleOrtho') on = app.isOrtho;
      x.classList.toggle('on', on);
    });
  }
  renderShadow() {
    const app = this.app; const sh = app.model.shadow; const b = $('#pb-shadow'); b.innerHTML = '';
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const lblH = h('b', {}, fmtH(sh.hour)), lblM = h('b', {}, months[sh.month - 1]);
    b.append(h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: sh.on ? 'checked' : null, onchange: () => this.cmd('shadows') }), ' Afficher les ombres'),
      h('div', { class: 'kv' }, h('span', {}, 'Heure'), lblH), h('input', { type: 'range', class: 'full', min: '5', max: '21', step: '0.25', value: sh.hour, oninput: (e) => { sh.hour = +e.target.value; lblH.textContent = fmtH(sh.hour); app.render(); } }),
      h('div', { class: 'kv' }, h('span', {}, 'Mois'), lblM), h('input', { type: 'range', class: 'full', min: '1', max: '12', step: '1', value: sh.month, oninput: (e) => { sh.month = +e.target.value; lblM.textContent = months[sh.month - 1]; app.render(); } }),
      h('div', { class: 'kv' }, h('span', {}, 'Latitude'), h('input', { value: sh.lat + '°', onchange: (e) => { sh.lat = parseFloat(e.target.value.replace(',', '.')) || 44; app.render(); } })),
      h('div', { class: 'muted' }, 'Le nord est l\'axe vert (Y). Latitude par défaut : Gard.'));
    function fmtH(x) { const hh = Math.floor(x), mm = Math.round((x - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')}`; }
  }
  renderOutliner() {
    const app = this.app; const b = $('#pb-outliner'); if (!b) return; b.innerHTML = '';
    const walk = (D, path, depth) => {
      for (const it of D.insts.values()) {
        const d = app.model.defs.get(it.def); if (!d) continue; const p = [...path, it.id];
        const inCtx = path.length === app.activePath.length && path.every((x, i) => x === app.activePath[i]);
        const sel = inCtx && app.sel.has('i:' + it.id);
        b.append(h('div', { class: 'outrow' + (sel ? ' on' : '') + (it.hidden ? ' hid' : ''), style: `padding-left:${6 + depth * 14}px`,
          onclick: () => { if (inCtx) { app.sel.clear(); app.sel.add('i:' + it.id); app.refreshSelection(); } },
          ondblclick: () => { app.activePath = path; app.sel.clear(); app.enterInstance(it.id); } },
        h('span', { html: d.kind === 'component' ? ICONS.component : ICONS.group }), h('span', {}, (it.name ? it.name + ' — ' : '') + d.name)));
        if (d.insts.size && depth < 8) walk(d, p, depth + 1);
      }
    };
    walk(app.model.root, [], 0);
    if (!b.children.length) b.append(h('div', { class: 'muted' }, 'Aucun groupe ni composant'));
  }
}

function toBytes(d) { if (typeof d === 'string') return new TextEncoder().encode(d); if (d instanceof ArrayBuffer) return new Uint8Array(d); if (d instanceof DataView) return new Uint8Array(d.buffer); return d; }
