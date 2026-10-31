// G&L Sketch — modèle, rendu, caméra, inférences
import * as THREE from 'three';
import * as G from './geom.js';
import { makeTexture } from './textures.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

const { Vector3, Matrix4 } = THREE;
export const AX = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
export const COLORS = { x: '#e0242c', y: '#1fa83a', z: '#2453e0', end: '#16a316', mid: '#14b8c4', edge: '#e0242c', face: '#2453e0', par: '#d21cd2', guide: '#333', inter: '#000' };

// ------------------------------------------------------------------ Modèle
export const DEFAULT_MATERIALS = [
  ['Blanc cassé', '#f2efe8'], ['Gris clair', '#c9c9c9'], ['Gris anthracite', '#3d4045'], ['Noir', '#1d1d1f'],
  ['Rouge', '#c0392b'], ['Orange', '#e67e22'], ['Jaune', '#f1c40f'], ['Vert', '#27ae60'], ['Bleu', '#2e6fc1'], ['Bleu ciel', '#8ec5f0'],
  ['Violet', '#8e44ad'], ['Beige', '#d9c7a3'], ['Marron', '#7a4b2a'], ['Sable', '#e3d3ad'],
  ['Acier Corten', '#8a4b26', 'corten', 1000], ['Acier galvanisé', '#b7bcc0', 'metal', 600], ['Acier noir', '#4a4d52', 'metal', 600],
  ['Aluminium', '#d4d7da', 'metal', 600], ['Brique', '#a5523a', 'brick', 1200], ['Bois chêne', '#b88a55', 'wood', 1200],
  ['Bois pin', '#d8b47c', 'wood', 1200], ['Parquet', '#a8774a', 'parquet', 1200], ['Béton', '#9d9d98', 'concrete', 1500], ['Enduit', '#e9e2d3', 'concrete', 1000],
  ['Carrelage', '#e8e4dc', 'tiles', 600], ['Pierre', '#b5a58a', 'stone', 1500], ['Gazon', '#5f8f3a', 'grass', 2000], ['Gravier', '#a19a8c', 'gravel', 1000],
  ['Tuile', '#b4553a', 'roof', 1200], ['Verre', '#9fd3e6', null, 0, 0.35], ['Eau', '#4b8fc2', null, 0, 0.6], ['Placo', '#f4f4f1', null, 0],
];

export class Model {
  constructor() { this.reset(); }
  reset() {
    this.defs = new Map();
    this.root = new G.Def('Modèle', 'root'); this.defs.set(this.root.id, this.root);
    this.materials = new Map();
    for (const m of DEFAULT_MATERIALS) this.addMaterial({ name: m[0], color: m[1], tex: m[2] ? { kind: m[2], size: m[3] } : null, opacity: m[4] ?? 1 });
    this.tags = [{ id: 'untagged', name: 'Sans balise', visible: true, color: '#888888' }];
    this.scenes = []; this.guides = []; this.dims = []; this.texts = []; this.sections = [];
    this.units = 'mm'; this.precision = 0; this.name = 'Sans titre';
    this.style = { grid: true, faces: 'shaded', edges: true, xray: false, backEdges: false, axes: true, guides: true, hiddenGeom: false, sections: true, sectionCut: true, profiles: false };
    this.shadow = { on: false, hour: 14, month: 6, lat: 44 };
  }
  addMaterial(o) {
    const id = o.id || 'm' + G.nid();
    this.materials.set(id, { id, name: o.name, color: o.color || '#cccccc', opacity: o.opacity ?? 1, tex: o.tex || null });
    return id;
  }
  toJSON() {
    const defs = [...this.defs.values()].map(defToJSON);
    return {
      app: 'G&L Sketch', v: 1, name: this.name, units: this.units, precision: this.precision, root: this.root.id, nextId: G.getNextId(),
      defs, materials: [...this.materials.values()], tags: this.tags, scenes: this.scenes, guides: this.guides.map(gToJ), dims: this.dims.map(dToJ),
      texts: this.texts.map((t) => ({ ...t, p: t.p.toArray(), at: t.at?.toArray() })), sections: this.sections.map((s) => ({ ...s, p: s.p.toArray(), n: s.n.toArray() })),
      style: this.style, shadow: this.shadow,
    };
  }
  fromJSON(j) {
    this.reset();
    G.setNextId(j.nextId || 1);
    this.defs = new Map();
    for (const dj of j.defs) { const D = defFromJSON(dj); this.defs.set(D.id, D); }
    this.root = this.defs.get(j.root);
    this.materials = new Map(); for (const m of j.materials || []) this.materials.set(m.id, m);
    this.tags = j.tags || this.tags; this.scenes = j.scenes || []; this.name = j.name || 'Sans titre';
    this.guides = (j.guides || []).map(gFromJ); this.dims = (j.dims || []).map(dFromJ);
    this.texts = (j.texts || []).map((t) => ({ ...t, p: new Vector3().fromArray(t.p), at: t.at ? new Vector3().fromArray(t.at) : null }));
    this.sections = (j.sections || []).map((s) => ({ ...s, p: new Vector3().fromArray(s.p), n: new Vector3().fromArray(s.n) }));
    this.units = j.units || 'mm'; this.precision = j.precision ?? 0;
    Object.assign(this.style, j.style || {}); Object.assign(this.shadow, j.shadow || {});
  }
}
const gToJ = (g) => ({ ...g, p: g.p.toArray(), d: g.d ? g.d.toArray() : null });
const gFromJ = (g) => ({ ...g, p: new Vector3().fromArray(g.p), d: g.d ? new Vector3().fromArray(g.d) : null });
const dToJ = (d) => ({ ...d, a: d.a.toArray(), b: d.b.toArray(), o: d.o.toArray() });
const dFromJ = (d) => ({ ...d, a: new Vector3().fromArray(d.a), b: new Vector3().fromArray(d.b), o: new Vector3().fromArray(d.o) });

export function defToJSON(D) {
  return {
    id: D.id, name: D.name, kind: D.kind, desc: D.desc || '', lib: D.libName || undefined,
    v: [...D.verts.values()].map((v) => [v.id, +v.p.x.toFixed(4), +v.p.y.toFixed(4), +v.p.z.toFixed(4)]),
    e: [...D.edges.values()].map((e) => [e.id, e.a, e.b, (e.soft ? 1 : 0) | (e.hidden ? 2 : 0), e.tag || 0, e.curve || 0]),
    f: [...D.faces.values()].map((f) => ({ id: f.id, l: f.loops, m: f.mat, b: f.back, t: f.tag, h: f.hidden ? 1 : 0 })),
    i: [...D.insts.values()].map((i) => ({ id: i.id, d: i.def, m: i.m.toArray(), n: i.name || '', h: i.hidden ? 1 : 0, t: i.tag || null, mat: i.mat || null })),
  };
}
export function defFromJSON(j, D) {
  D = D || new G.Def(j.name, j.kind);
  D.id = j.id; D.name = j.name; D.kind = j.kind; D.desc = j.desc || ''; if (j.lib) D.libName = j.lib;
  D.verts = new Map(); D.edges = new Map(); D.faces = new Map(); D.insts = new Map(); D.ekey = new Map();
  for (const [id, x, y, z] of j.v) D.verts.set(id, { id, p: new Vector3(x, y, z) });
  for (const [id, a, b, fl, t, c] of j.e) { D.edges.set(id, { id, a, b, soft: !!(fl & 1), hidden: !!(fl & 2), tag: t || null, curve: c || 0 }); D.ekey.set(G.edgeKey(a, b), id); }
  for (const f of j.f) D.faces.set(f.id, { id: f.id, loops: f.l.map((l) => l.slice()), mat: f.m ?? null, back: f.b ?? null, tag: f.t ?? null, hidden: !!f.h });
  for (const i of j.i) D.insts.set(i.id, { id: i.id, def: i.d, m: new Matrix4().fromArray(i.m), name: i.n, hidden: !!i.h, tag: i.t, mat: i.mat });
  D.touch();
  return D;
}

// ---------------------------------------------------------------- Unités
export function fmtLen(model, mm, withUnit = true) {
  const u = model.units; const p = model.precision;
  let v = mm, s = 'mm';
  if (u === 'cm') { v = mm / 10; s = 'cm'; } else if (u === 'm') { v = mm / 1000; s = 'm'; }
  const prec = u === 'm' ? Math.max(p, 2) : u === 'cm' ? Math.max(p, 1) : p;
  let str = v.toFixed(prec).replace('.', ',');
  if (prec > 0 && u !== 'mm') str = str.replace(/,?0+$/, (m) => (m.startsWith(',') ? '' : m)) || '0';
  return withUnit ? str + ' ' + s : str;
}
export function fmtArea(model, mm2) {
  if (model.units === 'm' || mm2 > 1e5) return (mm2 / 1e6).toFixed(2).replace('.', ',') + ' m²';
  return (mm2 / 100).toFixed(1).replace('.', ',') + ' cm²';
}
// Analyse d'une valeur saisie (accepte 1500, 1,5m, 150cm, 1.5 m, 2')
export function parseLen(model, s) {
  s = String(s).trim().toLowerCase().replace(/\s+/g, ''); if (!s) return null;
  const m = s.match(/^(-?[\d.,]+)(mm|cm|m|km|"|'|in|ft)?$/); if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.')); if (isNaN(v)) return null;
  const u = m[2] || model.units;
  const f = { mm: 1, cm: 10, m: 1000, km: 1e6, '"': 25.4, in: 25.4, "'": 304.8, ft: 304.8 }[u];
  return v * f;
}
export function splitList(s) { return String(s).split(/[;x×*]/i).map((t) => t.trim()).filter((t) => t.length); }

// ---------------------------------------------------------------- Application
export class App {
  constructor(container) {
    this.el = container;
    this.model = new Model();
    this.activePath = [];
    this.sel = new Set();          // "f:id" "e:id" "i:id" dans le contexte actif
    this.undoStack = []; this.redoStack = [];
    this.listeners = {};
    this.currentMat = null;
    this.activeTag = 'untagged';
    this.matCache = new Map(); this.texCache = new Map(); this.defCache = new Map();
    this.worldEdges = []; this.worldPoints = []; this.pickMeshes = [];
    this._needRender = true;
    this.lineMats = new Set();
    this.insets = { l: 0, r: 0, t: 0, b: 0 };
    this.initThree();
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, a) { for (const fn of this.listeners[ev] || []) fn(a); }

  // ---------------------------------------------------------------- Three.js
  initThree() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.localClippingEnabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.el.appendChild(r.domElement);
    r.domElement.className = 'gl';
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(35, 1, 1, 5e7); this.persp.up.set(0, 0, 1);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e7, 1e7); this.ortho.up.set(0, 0, 1);
    this.camera = this.persp; this.isOrtho = false;
    this.target = new Vector3(0, 0, 0);
    this.persp.position.set(-6000, -9000, 6000);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8bcc4, 1.3); this.hemi.position.set(0, 0, 1); this.scene.add(this.hemi); this.amb = new THREE.AmbientLight(0xffffff, 0.75); this.scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.25); this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 2;
    this.modelGroup = new THREE.Group(); this.scene.add(this.modelGroup);
    this.overlay = new THREE.Group(); this.overlay.renderOrder = 10; this.scene.add(this.overlay);
    this.selGroup = new THREE.Group(); this.scene.add(this.selGroup);
    this.hoverGroup = new THREE.Group(); this.scene.add(this.hoverGroup);
    this.annot = new THREE.Group(); this.scene.add(this.annot);
    this.axesGroup = this.makeAxes(); this.scene.add(this.axesGroup);
    this.buildGrid();
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(4e5, 4e5), new THREE.ShadowMaterial({ opacity: 0.28 }));
    this.groundShadow.receiveShadow = true; this.groundShadow.visible = false; this.groundShadow.position.z = -0.5; this.scene.add(this.groundShadow);
    this.raycaster = new THREE.Raycaster();
    const ro = new ResizeObserver(() => this.resize()); ro.observe(this.el);
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.tick(); };
    loop();
  }
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    this.w = w; this.h = h; for (const m of this.lineMats) m.resolution.set(w, h); this.applyInsets(); this.updateOrtho(); this.render();
  }
  render() { this._needRender = true; }
  setInsets(o) { this.insets = o; this.applyInsets(); this.render(); }
  applyInsets() {
    const { l, r, t, b } = this.insets; const w = this.w || 1, h = this.h || 1;
    const sx = (l - r) / 2, sy = (t - b) / 2;
    for (const c of [this.persp, this.ortho]) { if (!c) continue; if (Math.abs(sx) < 1 && Math.abs(sy) < 1) c.clearViewOffset(); else c.setViewOffset(w, h, -sx, -sy, w, h); }
  }
  lineMat(o = {}) {
    const m = new LineMaterial({ color: o.color ?? 0x1b1e23, linewidth: o.width ?? 1.2, dashed: !!o.dashed, dashSize: o.dash ?? 40, gapSize: o.gap ?? 40, transparent: o.opacity != null && o.opacity < 1 || !!o.transparent, opacity: o.opacity ?? 1, depthTest: o.depthTest ?? true, worldUnits: false, alphaToCoverage: false });
    m.resolution.set(this.w || 1, this.h || 1); this.lineMats.add(m); return m;
  }
  fatSegments(points, mat) { const g = new LineSegmentsGeometry(); g.setPositions(points.flatMap((p) => [p.x, p.y, p.z])); const l = new LineSegments2(g, mat); if (mat.dashed) l.computeLineDistances(); return l; }
  fatLine(points, mat) { const g = new LineGeometry(); g.setPositions(points.flatMap((p) => [p.x, p.y, p.z])); const l = new Line2(g, mat); if (mat.dashed) l.computeLineDistances(); return l; }
  isDark() { return document.documentElement.dataset.theme === 'dark'; }
  applyTheme() { this.buildGrid(); this.refresh(); }
  buildGrid() {
    if (this.grid) { this.scene.remove(this.grid); this.grid.traverse((o) => { o.geometry?.dispose(); }); }
    const g = this.grid = new THREE.Group(); const box = this.modelBox();
    const size = box.isEmpty() ? 20000 : Math.max(20000, Math.ceil(Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 5000) * 5000 + 20000);
    const c = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3()); const cx = Math.round(c.x / 5000) * 5000, cy = Math.round(c.y / 5000) * 5000;
    const dark = this.isDark(); const minor = [], major = [];
    for (let v = -size; v <= size; v += 1000) { const arr = v % 5000 === 0 ? major : minor; arr.push(new Vector3(cx + v, cy - size, 0), new Vector3(cx + v, cy + size, 0), new Vector3(cx - size, cy + v, 0), new Vector3(cx + size, cy + v, 0)); }
    const mk = (pts, col, op) => { const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); l.position.z = -1; l.renderOrder = -1; return l; };
    g.add(mk(minor, dark ? 0x9aa3b2 : 0x6b7280, dark ? 0.10 : 0.10), mk(major, dark ? 0xaeb6c4 : 0x4b5563, dark ? 0.2 : 0.18));
    g.visible = !!this.model.style.grid && this.model.style.faces !== 'wire'; this.scene.add(g); this.render();
  }
  tick() {
    if (this.anim) this.anim();
    if (!this._needRender) return;
    this._needRender = false;
    this.camera.lookAt(this.target);
    this.persp.position.copy(this.camera.position);
    // plans de découpe adaptés à la distance (précision de profondeur sans tampon logarithmique)
    { const d = this.camera.position.distanceTo(this.target); const mb = this._mbox ||= this.modelBox(); const sz = mb.isEmpty() ? 20000 : mb.getSize(new Vector3()).length();
      const far = Math.max(d * 60, d + sz * 3, 2e5); const near = Math.max(Math.min(d * 0.004, 50), far / 2e5, 0.5);
      if (Math.abs(this.persp.near - near) > 1e-6 || Math.abs(this.persp.far - far) > 1e-3) { this.persp.near = near; this.persp.far = far; this.persp.updateProjectionMatrix(); } }
    this.updateOrtho();
    this.updateClipping();
    this.updateSun();
    this.renderer.render(this.scene, this.camera);
    this.updateHorizon();
    this.emit('frame');
  }
  updateHorizon() {
    const cam = this.camera; const f = new Vector3().subVectors(this.target, cam.position); f.z = 0;
    let y;
    if (f.lengthSq() < 1e-9) y = cam.position.z > this.target.z ? -10 : 110;
    else { const far = cam.position.clone().add(f.normalize().multiplyScalar(1e6)); far.z = cam.position.z * 0 + (this.isOrtho ? this.target.z : cam.position.z); const s = far.clone().project(cam); y = s.z > 1 ? (cam.position.z > this.target.z ? -10 : 110) : (1 - s.y) / 2 * 100; }
    y = Math.max(-10, Math.min(110, y));
    if (Math.abs((this._hz ?? -99) - y) > 0.1) { this._hz = y; this.el.parentElement.style.setProperty('--hz', y.toFixed(2) + '%'); }
  }
  updateOrtho() {
    const o = this.ortho; const d = this.persp.position.distanceTo(this.target);
    const hh = d * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2)); const ww = hh * (this.w / this.h || 1);
    o.left = -ww; o.right = ww; o.top = hh; o.bottom = -hh;
    o.position.copy(this.persp.position); o.lookAt(this.target); o.updateProjectionMatrix();
  }
  setOrtho(on) {
    const pos = this.camera.position.clone();
    this.isOrtho = on; this.camera = on ? this.ortho : this.persp; this.camera.position.copy(pos); this.persp.position.copy(pos);
    this.render(); this.emit('camera');
  }
  makeAxes() {
    const g = new THREE.Group(); const L = 2e6;
    for (const [k, col] of [['x', COLORS.x], ['y', COLORS.y], ['z', COLORS.z]]) {
      const d = AX[k];
      const pos = new THREE.BufferGeometry().setFromPoints([new Vector3(), d.clone().multiplyScalar(L)]);
      g.add(new THREE.Line(pos, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.85 })));
      const neg = new THREE.BufferGeometry().setFromPoints([new Vector3(), d.clone().multiplyScalar(-L)]);
      const nl = new THREE.Line(neg, new THREE.LineDashedMaterial({ color: col, dashSize: 120, gapSize: 120, scale: 1 })); nl.computeLineDistances(); g.add(nl);
    }
    return g;
  }

  // ---------------------------------------------------------------- Contexte
  get activeDef() {
    let D = this.model.root;
    for (const iid of this.activePath) { const it = D.insts.get(iid); if (!it) break; D = this.model.defs.get(it.def); }
    return D;
  }
  matrixOfPath(path) {
    const m = new Matrix4(); let D = this.model.root;
    for (const iid of path) { const it = D.insts.get(iid); if (!it) break; m.multiply(it.m); D = this.model.defs.get(it.def); }
    return m;
  }
  get activeMatrix() { return this.matrixOfPath(this.activePath); }
  toLocal(p) { return p.clone().applyMatrix4(this.activeMatrix.invert()); }
  toWorld(p) { return p.clone().applyMatrix4(this.activeMatrix); }
  dirToLocal(d) { const m = this.activeMatrix; const r = new THREE.Matrix3().setFromMatrix4(m).invert(); return d.clone().applyMatrix3(r).normalize(); }
  enterInstance(iid) { this.activePath = [...this.activePath, iid]; this.sel.clear(); this.refresh(); this.emit('context'); }
  exitContext() { if (!this.activePath.length) return false; const last = this.activePath.pop(); this.sel.clear(); this.sel.add('i:' + last); this.refresh(); this.emit('context'); return true; }

  // -------------------------------------------------------- Annuler / commit
  snapshot() { return JSON.stringify(this.model.toJSON()); }
  commit(label, fn) {
    const before = this.snapshot();
    let res;
    try { res = fn(); } catch (e) { console.error(e); this.restore(before); this.emit('toast', 'Erreur : ' + e.message); return null; }
    this.undoStack.push({ label, s: before, path: this.activePath.slice() }); if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true; this.cleanSel(); this.refresh(); this.emit('changed');
    return res;
  }
  restore(s) { this.model.fromJSON(JSON.parse(s)); this.defCache.clear(); }
  undo() {
    const u = this.undoStack.pop(); if (!u) return;
    this.redoStack.push({ label: u.label, s: this.snapshot(), path: this.activePath.slice() });
    this.restore(u.s); this.activePath = u.path.filter(() => true); this.validatePath(); this.sel.clear(); this.refresh(); this.emit('changed'); this.emit('context');
    this.emit('toast', 'Annuler : ' + u.label);
  }
  redo() {
    const r = this.redoStack.pop(); if (!r) return;
    this.undoStack.push({ label: r.label, s: this.snapshot(), path: this.activePath.slice() });
    this.restore(r.s); this.activePath = r.path; this.validatePath(); this.sel.clear(); this.refresh(); this.emit('changed'); this.emit('context');
  }
  validatePath() {
    let D = this.model.root; const ok = [];
    for (const iid of this.activePath) { const it = D.insts.get(iid); if (!it) break; ok.push(iid); D = this.model.defs.get(it.def); }
    this.activePath = ok;
  }
  cleanSel() {
    const D = this.activeDef;
    for (const k of [...this.sel]) {
      const [t, id] = [k[0], +k.slice(2)];
      if ((t === 'f' && !D.faces.has(id)) || (t === 'e' && !D.edges.has(id)) || (t === 'i' && !D.insts.has(id))) this.sel.delete(k);
    }
  }
  newModel() { this.model.reset(); this.defCache.clear(); this.activePath = []; this.sel.clear(); this.undoStack = []; this.redoStack = []; this.dirty = false; this.anim = null; this.target.set(0, 0, 0); this.camera.position.set(-6000, -9000, 6000); this.refresh(); this.emit('changed'); this.emit('context'); this.emit('loaded'); }
  load(json) { this.model.fromJSON(json); this.defCache.clear(); this.activePath = []; this.sel.clear(); this.undoStack = []; this.redoStack = []; this.refresh(); this.zoomExtents(); this.emit('changed'); this.emit('context'); this.emit('loaded'); }

  // --------------------------------------------------------------- Matières
  tagVisible(t) { if (!t) return true; const tg = this.model.tags.find((x) => x.id === t); return !tg || tg.visible; }
  material(matId, side, faded) {
    const st = this.model.style;
    const mono = st.faces === 'mono' || st.faces === 'hidden';
    const tex = st.faces === 'textured';
    const key = matId + '|' + side + '|' + (faded ? 1 : 0) + '|' + st.faces + '|' + (st.xray ? 1 : 0) + '|' + (this.model.materials.get(matId)?._v || 0);
    let m = this.matCache.get(key); if (m) return m;
    const md = matId ? this.model.materials.get(matId) : null;
    let color = side === 'back' ? '#9aabc4' : '#f4f2ee'; let opacity = 1; let map = null;
    if (md && !mono) {
      color = md.color; opacity = md.opacity ?? 1;
      if (tex && md.tex) map = this.texture(md);
    }
    if (st.faces === 'hidden') color = side === 'back' ? '#ffffff' : '#ffffff';
    const p = { color: map ? '#ffffff' : color, side: side === 'back' ? THREE.BackSide : THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, map };
    if (opacity < 1 || st.xray || faded) {
      p.transparent = true; p.opacity = Math.min(opacity, st.xray ? 0.45 : 1, faded ? 0.28 : 1); p.depthWrite = !(st.xray || faded) && opacity > 0.9;
    }
    m = st.faces === 'hidden' ? new THREE.MeshBasicMaterial(p) : new THREE.MeshLambertMaterial(p);
    if (map && md) m.color.set('#ffffff');
    this.matCache.set(key, m);
    return m;
  }
  texture(md) {
    const k = md.id + '|' + (md._v || 0);
    let t = this.texCache.get(k); if (t) return t;
    t = makeTexture(md, () => this.render());
    this.texCache.set(k, t); return t;
  }
  invalidateMaterial(id) { const md = this.model.materials.get(id); if (md) md._v = (md._v || 0) + 1; this.defCache.clear(); this.refresh(); }

  // ---------------------------------------------------------------- Rendu
  buildDefTemplate(D) {
    const c = this.defCache.get(D.id);
    const sk = D.version + '|' + this.model.style.faces + '|' + this.model.style.hiddenGeom + '|' + this.styleKey();
    if (c && c.key === sk) return c;
    const buckets = new Map(); // matKey|side -> {pos:[], nrm:[], uv:[], tri2face:[]}
    const faceTris = new Map();
    // lissage : faces reliées par des arêtes adoucies partagent des normales moyennées
    let smoothN = null;
    if ([...D.edges.values()].some((e) => e.soft)) {
      const adj = G.adjacency(D); const par = new Map(); const find = (x) => { while (par.has(x) && par.get(x) !== x) x = par.get(x); return x; };
      for (const f of D.faces.values()) par.set(f.id, f.id);
      for (const e of D.edges.values()) { if (!e.soft) continue; const fl = adj.get(G.edgeKey(e.a, e.b)) || []; if (fl.length === 2) { const a = find(fl[0]), b = find(fl[1]); if (a !== b) par.set(a, b); } }
      const fn = new Map(); const vf = new Map();
      for (const f of D.faces.values()) { fn.set(f.id, G.faceNormal(D, f)); for (const vid of G.vertsOfFace(f)) { let a = vf.get(vid); if (!a) vf.set(vid, (a = [])); a.push(f.id); } }
      const cache = new Map();
      smoothN = (fid, vid) => {
        const g = find(fid); const k = g + ':' + vid; let r = cache.get(k); if (r) return r;
        const n0 = fn.get(fid); r = new Vector3();
        for (const o of vf.get(vid) || []) if (find(o) === g && fn.get(o).dot(n0) > 0.2) r.add(fn.get(o));
        r = r.lengthSq() > 0 ? r.normalize() : n0; cache.set(k, r); return r;
      };
    }
    for (const f of D.faces.values()) {
      if (f.hidden && !this.model.style.hiddenGeom) continue;
      const { n, u, v, tris } = G.triangulateFace(D, f); faceTris.set(f.id, tris);
      const md = f.mat ? this.model.materials.get(f.mat) : null; const ts = md?.tex?.size || 1000;
      const mdb = f.back ? this.model.materials.get(f.back) : null; const tsb = mdb?.tex?.size || 1000;
      for (const side of ['front', 'back']) {
        const mk = (side === 'front' ? f.mat || 'null' : f.back || 'none') + '|' + side + '|' + (f.tag || '');
        let b = buckets.get(mk); if (!b) buckets.set(mk, (b = { pos: [], nrm: [], uv: [], t2f: [], mat: side === 'front' ? f.mat : f.back, side, tag: f.tag }));
        const sz = side === 'front' ? ts : tsb;
        for (const t of tris) {
          for (const vid of t) {
            const p = D.verts.get(vid).p; const nn = smoothN ? smoothN(f.id, vid) : n; b.pos.push(p.x, p.y, p.z); b.nrm.push(nn.x, nn.y, nn.z);
            b.uv.push(p.dot(u) / sz, p.dot(v) / sz);
          }
          b.t2f.push(f.id);
        }
      }
    }
    const meshes = [];
    for (const b of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      meshes.push({ g, mat: b.mat, side: b.side, t2f: b.t2f, tag: b.tag });
    }
    const lp = [], lps = [], ltags = new Map();
    for (const e of D.edges.values()) {
      const vis = !e.hidden && !e.soft;
      if (!vis && !this.model.style.hiddenGeom) continue;
      const a = D.verts.get(e.a).p, b = D.verts.get(e.b).p;
      const arr = vis ? lp : lps;
      if (e.tag && e.tag !== 'untagged') { let x = ltags.get(e.tag); if (!x) ltags.set(e.tag, (x = [])); x.push(a.x, a.y, a.z, b.x, b.y, b.z); }
      else arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const mkLines = (arr) => { if (!arr.length) return null; const g = new LineSegmentsGeometry(); g.setPositions(arr); return g; };
    const res = { key: sk, meshes, lines: mkLines(lp), soft: mkLines(lps), tagLines: [...ltags].map(([t, a]) => ({ tag: t, g: mkLines(a) })), faceTris };
    if (c) { c.meshes.forEach((m) => m.g.dispose()); c.lines?.dispose(); c.soft?.dispose(); c.tagLines.forEach((t) => t.g?.dispose()); }
    this.defCache.set(D.id, res);
    return res;
  }
  styleKey() { const s = this.model.style; return s.faces + s.xray + s.hiddenGeom; }

  refresh() {
    this._mbox = null;
    const st = this.model.style;
    this.matCache.forEach(() => { });
    this.modelGroup.clear(); this.worldEdges = []; this.worldPoints = []; this.pickMeshes = [];
    const shadows = this.model.shadow.on;
    this.renderer.shadowMap.enabled = shadows; this.groundShadow.visible = shadows && st.faces !== 'wire';
    const edgeMat = this._edgeMat ||= this.lineMat({ color: 0x1b1e23, width: 1.25 });
    const edgeFaded = this._edgeFaded ||= this.lineMat({ color: 0x1b1e23, width: 1, opacity: 0.22 });
    const softMat = this._softMat ||= this.lineMat({ color: 0x6b7280, width: 1, dashed: true, dash: 40, gap: 40 });
    const backEdge = this._backEdge ||= this.lineMat({ color: 0x374151, width: 1, dashed: true, dash: 30, gap: 30, depthTest: false, opacity: 0.45 });
    const L2 = (geo, mat, m, order) => { const l = new LineSegments2(geo, mat); if (mat.dashed) l.computeLineDistances(); l.matrixAutoUpdate = false; l.matrix.copy(m); if (order) l.renderOrder = order; this.modelGroup.add(l); return l; };
    const ap = this.activePath;
    const walk = (D, m, path, inheritedMat) => {
      const t = this.buildDefTemplate(D);
      const isActive = path.length === ap.length && path.every((x, i) => x === ap[i]);
      const inCtx = path.length >= ap.length && ap.every((x, i) => path[i] === x);
      const faded = ap.length > 0 && !inCtx;
      if (st.faces !== 'wire') {
        for (const mm of t.meshes) {
          if (!this.tagVisible(mm.tag)) continue;
          const matId = mm.side === 'front' ? (mm.mat || inheritedMat) : mm.mat;
          const mesh = new THREE.Mesh(mm.g, this.material(matId, mm.side, faded));
          mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); mesh.matrixWorldNeedsUpdate = true;
          mesh.userData = { path, def: D.id, t2f: mm.t2f, inCtx: isActive };
          mesh.castShadow = shadows; mesh.receiveShadow = shadows;
          this.modelGroup.add(mesh); this.pickMeshes.push(mesh);
        }
      }
      if (st.edges || st.faces === 'wire') {
        if (t.lines) L2(t.lines, faded ? edgeFaded : edgeMat, m);
        for (const tl of t.tagLines) if (tl.g && this.tagVisible(tl.tag)) L2(tl.g, faded ? edgeFaded : edgeMat, m);
        if (st.backEdges && t.lines) L2(t.lines, backEdge, m, 5);
        if (st.hiddenGeom && t.soft) L2(t.soft, softMat, m);
      }
      // cache monde pour inférences
      const vp = new Map();
      const W = (vid) => { let p = vp.get(vid); if (!p) { p = D.verts.get(vid).p.clone().applyMatrix4(m); vp.set(vid, p); } return p; };
      for (const e of D.edges.values()) {
        if ((e.hidden || !this.tagVisible(e.tag)) && !st.hiddenGeom) continue;
        const a = W(e.a), b = W(e.b);
        this.worldEdges.push({ path, def: D.id, id: e.id, a, b, soft: e.soft, inCtx: isActive });
      }
      for (const [vid, p] of vp) this.worldPoints.push({ p, path, def: D.id, vid, inCtx: isActive });
      for (const it of D.insts.values()) {
        if ((it.hidden || !this.tagVisible(it.tag)) && !st.hiddenGeom) continue;
        const cd = this.model.defs.get(it.def); if (!cd) continue;
        walk(cd, m.clone().multiply(it.m), [...path, it.id], it.mat || inheritedMat);
      }
    };
    walk(this.model.root, new Matrix4(), [], null);
    this.modelGroup.updateMatrixWorld(true);
    this.axesGroup.visible = st.axes; if (this.grid) this.grid.visible = !!st.grid && st.faces !== 'wire';
    this.refreshSelection(); this.refreshAnnotations();
    this.render();
    this.emit('refresh');
  }

  // ---------------------------------------------------- Surbrillance sélection
  faceWorldTris(D, fid, m) {
    const t = this.buildDefTemplate(D).faceTris.get(fid); const out = [];
    if (!t) return out;
    for (const tri of t) for (const vid of tri) out.push(D.verts.get(vid).p.clone().applyMatrix4(m));
    return out;
  }
  instBox(path) {
    const m = this.matrixOfPath(path.slice(0, -1)); let D = this.model.root;
    for (const iid of path.slice(0, -1)) D = this.model.defs.get(D.insts.get(iid).def);
    const it = D.insts.get(path[path.length - 1]); const cd = this.model.defs.get(it.def);
    const box = new THREE.Box3(); G.bboxOfDef(this.model.defs, cd, new Matrix4(), box);
    return { box, m: m.multiply(it.m) };
  }
  boxLines(box, m, color, dashed) {
    const c = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([x, y, z]) => new Vector3(x ? box.max.x : box.min.x, y ? box.max.y : box.min.y, z ? box.max.z : box.min.z).applyMatrix4(m));
    const idx = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    const key = '_bx' + color + (dashed ? 'd' : '');
    const mat = this[key] ||= this.lineMat({ color, width: dashed ? 1.2 : 1.6, dashed, dash: 60, gap: 50 });
    return this.fatSegments(idx.map((i) => c[i]), mat);
  }
  refreshSelection() {
    this.selGroup.clear();
    const D = this.activeDef; const m = this.activeMatrix;
    const tris = []; const lines = [];
    for (const k of this.sel) {
      const t = k[0], id = +k.slice(2);
      if (t === 'f') tris.push(...this.faceWorldTris(D, id, m));
      else if (t === 'e') { const e = D.edges.get(id); if (e) lines.push(D.verts.get(e.a).p.clone().applyMatrix4(m), D.verts.get(e.b).p.clone().applyMatrix4(m)); }
      else if (t === 'i' && D.insts.has(id)) { const { box, m: mm } = this.instBox([...this.activePath, id]); this.selGroup.add(this.boxLines(box, mm, 0x1f6fff)); }
    }
    if (tris.length) {
      const g = new THREE.BufferGeometry().setFromPoints(tris);
      const mat = this._selFace ||= new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
      this.selGroup.add(new THREE.Mesh(g, mat));
    }
    if (lines.length) {
      this.selGroup.add(this.fatSegments(lines, this._selLine ||= this.lineMat({ color: 0x2563eb, width: 2.4 })));
    }
    if (this.activePath.length) {
      const { box, m: mm } = this.instBox(this.activePath);
      this.selGroup.add(this.boxLines(box, mm, 0x666666, true));
    }
    this.render(); this.emit('selection');
  }
  setHoverFace(D, fid, m, color = 0xffd23f) {
    this.hoverGroup.clear();
    if (fid) {
      const g = new THREE.BufferGeometry().setFromPoints(this.faceWorldTris(D, fid, m));
      this.hoverGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 })));
    }
    this.render();
  }
  clearHover() { if (this.hoverGroup.children.length) { this.hoverGroup.clear(); this.render(); } }

  // ------------------------------------------------- Annotations / guides / coupes
  refreshAnnotations() {
    this.annot.clear(); const st = this.model.style;
    if (st.guides) {
      const pts = []; const L = 3e5;
      for (const g of this.model.guides) {
        if (g.type === 'line') pts.push(g.p.clone().addScaledVector(g.d, -L), g.p.clone().addScaledVector(g.d, L));
      }
      if (pts.length) {
        const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x444444, dashSize: 50, gapSize: 40, transparent: true, opacity: 0.8 }));
        l.computeLineDistances(); this.annot.add(l);
      }
      const gp = this.model.guides.filter((g) => g.type === 'point');
      for (const g of gp) {
        const s = 40; const p = g.p;
        const cross = [p.clone().add(new Vector3(-s, 0, 0)), p.clone().add(new Vector3(s, 0, 0)), p.clone().add(new Vector3(0, -s, 0)), p.clone().add(new Vector3(0, s, 0)), p.clone().add(new Vector3(0, 0, -s)), p.clone().add(new Vector3(0, 0, s))];
        this.annot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cross), new THREE.LineBasicMaterial({ color: 0x222222 })));
      }
    }
    for (const d of this.model.dims) {
      const off = d.o; const a2 = d.a.clone().add(off), b2 = d.b.clone().add(off);
      const ext = off.clone().normalize().multiplyScalar(Math.min(off.length() * 0.15 + 30, 150));
      const pts = [d.a, a2.clone().add(ext), d.b, b2.clone().add(ext), a2, b2];
      const dir = new Vector3().subVectors(b2, a2).normalize(); const tk = 40; const perp = off.clone().normalize();
      const t1 = dir.clone().add(perp).normalize().multiplyScalar(tk);
      pts.push(a2.clone().sub(t1), a2.clone().add(t1), b2.clone().sub(t1), b2.clone().add(t1));
      this.annot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this._dimMat ||= new THREE.LineBasicMaterial({ color: 0x111111 })));
    }
    for (const t of this.model.texts) if (t.at) this.annot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([t.at, t.p]), this._dimMat));
    // plans de section
    for (const s of this.model.sections) {
      if (!st.sections) continue;
      const { u, v } = G.planeBasis(s.n); const R = s.size || 2000;
      const c = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), v.clone().sub(u)].map((x) => s.p.clone().addScaledVector(x, R));
      const col = s.active ? 0xff7a00 : 0x9a9a9a;
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: col }));
      l.userData.section = s.id; this.annot.add(l);
      const ar = [s.p, s.p.clone().addScaledVector(s.n, -R * 0.3)];
      this.annot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ar), new THREE.LineBasicMaterial({ color: col })));
      const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
      this.annot.add(fill);
    }
    this.render();
  }
  updateClipping() {
    const s = this.model.sections.find((x) => x.active);
    const planes = s && this.model.style.sectionCut ? [new THREE.Plane(s.n.clone().negate(), s.n.dot(s.p))] : [];
    if ((this._clipKey || '') !== JSON.stringify(planes.map((p) => [p.normal.toArray(), p.constant]))) {
      this._clipKey = JSON.stringify(planes.map((p) => [p.normal.toArray(), p.constant]));
      this.renderer.clippingPlanes = planes;
    }
  }
  updateSun() {
    const sh = this.model.shadow;
    // position solaire simplifiée (latitude du Gard ~44°N)
    const decl = 23.44 * Math.sin((2 * Math.PI / 365) * (284 + (sh.month - 0.5) * 30.4));
    const H = (sh.hour - 12) * 15; const lat = sh.lat;
    const r = Math.PI / 180;
    const alt = Math.asin(Math.sin(lat * r) * Math.sin(decl * r) + Math.cos(lat * r) * Math.cos(decl * r) * Math.cos(H * r));
    let az = Math.acos((Math.sin(decl * r) - Math.sin(alt) * Math.sin(lat * r)) / (Math.cos(alt) * Math.cos(lat * r)));
    if (H > 0) az = 2 * Math.PI - az;
    const dir = new Vector3(Math.sin(az) * Math.cos(alt) * -1, -Math.cos(az) * Math.cos(alt) * -1, Math.max(Math.sin(alt), 0.05));
    // azimut mesuré depuis le nord (+Y), sens horaire vers l'est (+X)
    dir.set(-Math.sin(az + Math.PI) * Math.cos(alt), Math.cos(az + Math.PI) * Math.cos(alt) * -1, Math.max(Math.sin(alt), 0.04)).normalize();
    const box = this.modelBox(); const c = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
    const rad = box.isEmpty() ? 5000 : Math.max(box.getSize(new Vector3()).length(), 2000);
    this.sun.position.copy(c).addScaledVector(dir, rad * 2); this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera; cam.left = -rad; cam.right = rad; cam.top = rad; cam.bottom = -rad; cam.near = 1; cam.far = rad * 5; cam.updateProjectionMatrix();
    this.sun.castShadow = sh.on;
    this.sun.intensity = sh.on ? 1.7 : 0.9; this.hemi.intensity = sh.on ? 0.9 : 1.3; this.amb.intensity = sh.on ? 0.55 : 0.75;
    if (!sh.on) { this.sun.position.copy(c).add(new Vector3(-0.45, -0.7, 0.8).multiplyScalar(rad * 2)); }
  }
  modelBox() {
    const b = new THREE.Box3();
    G.bboxOfDef(this.model.defs, this.model.root, new Matrix4(), b);
    return b;
  }

  // ---------------------------------------------------------------- Caméra
  zoomExtents(box) {
    box = box || this.modelBox();
    if (box.isEmpty()) box = new THREE.Box3(new Vector3(-3000, -3000, 0), new Vector3(3000, 3000, 2000));
    const c = box.getCenter(new Vector3()); const r = Math.max(box.getSize(new Vector3()).length() / 2, 300);
    const dir = new Vector3().subVectors(this.camera.position, this.target).normalize();
    const fov = THREE.MathUtils.degToRad(this.persp.fov); const I = this.insets;
    const fw = Math.max(this.w - I.l - I.r, 120), fh = Math.max(this.h - I.t - I.b, 120);
    const kH = fh / this.h; const asp = Math.min(fw / fh, 1);
    const d = r / Math.sin(fov / 2) / Math.max(asp, 0.45) / kH * 1.02;
    this.animateCamera(c.clone().addScaledVector(dir, d), c);
  }
  setView(name) {
    const dirs = { iso: [-1, -1.35, 0.95], top: [0, -0.0001, 1], bottom: [0, 0.0001, -1], front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0] };
    const d = new Vector3(...dirs[name]).normalize(); const dist = this.camera.position.distanceTo(this.target);
    this.animateCamera(this.target.clone().addScaledVector(d, dist), this.target.clone(), () => this.zoomExtents());
  }
  setViewDir(d) { d = d.clone().normalize(); if (Math.abs(d.z) > 0.999) d.y -= 0.0001; const dist = this.camera.position.distanceTo(this.target); this.animateCamera(this.target.clone().addScaledVector(d, dist), this.target.clone(), () => this.zoomExtents()); }
  animateCamera(pos, tgt, done, ms = 450) {
    const p0 = this.camera.position.clone(), t0 = this.target.clone(); const start = performance.now();
    this.anim = () => {
      let k = Math.min((performance.now() - start) / ms, 1); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(p0, pos, e); this.target.lerpVectors(t0, tgt, e); this.render();
      if (k >= 1) { this.anim = null; this.emit('camera'); if (done) done(); }
    };
  }
  orbit(dx, dy) {
    const off = new Vector3().subVectors(this.camera.position, this.target);
    const sph = new THREE.Spherical().setFromVector3(new Vector3(off.x, off.z, -off.y)); // repère Y-up temporaire
    sph.theta -= dx * 0.008; sph.phi -= dy * 0.008; sph.phi = Math.max(0.01, Math.min(Math.PI - 0.01, sph.phi));
    const v = new Vector3().setFromSpherical(sph);
    this.camera.position.copy(this.target).add(new Vector3(v.x, -v.z, v.y));
    this.render();
  }
  pan(dx, dy) {
    const d = this.camera.position.distanceTo(this.target);
    const k = (2 * d * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) / this.h;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0), up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const mv = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
    this.camera.position.add(mv); this.target.add(mv); this.render();
  }
  zoomAt(sx, sy, factor) {
    let p = this.pointUnder(sx, sy);
    if (!p || p.distanceTo(this.camera.position) > this.camera.position.distanceTo(this.target) * 6) p = this.target.clone();
    const nc = p.clone().add(new Vector3().subVectors(this.camera.position, p).multiplyScalar(factor));
    if (nc.distanceTo(p) < 5 && factor < 1) return;
    this.target.copy(p.clone().add(new Vector3().subVectors(this.target, p).multiplyScalar(factor)));
    this.camera.position.copy(nc);
    this.render();
  }
  pointUnder(sx, sy) {
    const hit = this.pickFace(sx, sy, true); if (hit) return hit.point;
    const r = this.ray(sx, sy); const pl = new THREE.Plane(new Vector3(0, 0, 1), 0); const p = new Vector3();
    if (r.ray.intersectPlane(pl, p) && p.distanceTo(this.camera.position) < 1e6) return p;
    return null;
  }

  // ---------------------------------------------------------------- Sélection 3D
  ray(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(ndc, this.camera); return this.raycaster;
  }
  project(p) { const v = p.clone().project(this.camera); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, z: v.z }; }
  clipOK(p) {
    const s = this.model.sections.find((x) => x.active);
    if (!s || !this.model.style.sectionCut) return true;
    return s.n.dot(new Vector3().subVectors(p, s.p)) <= 1e-6;
  }
  pickFace(sx, sy, any = false) {
    const r = this.ray(sx, sy);
    const hits = r.intersectObjects(this.pickMeshes, false);
    for (const h of hits) {
      if (!this.clipOK(h.point)) continue;
      const ud = h.object.userData; if (!any && !ud) continue;
      const fid = ud.t2f[h.faceIndex]; const D = this.model.defs.get(ud.def);
      const f = D.faces.get(fid); if (!f) continue;
      const m = this.matrixOfPath(ud.path);
      const n = G.faceNormal(D, f).transformDirection(m);
      // recaler le point exactement sur le plan de la face
      const p0 = D.verts.get(f.loops[0][0]).p.clone().applyMatrix4(m);
      const point = h.point.clone().addScaledVector(n, n.dot(new Vector3().subVectors(p0, h.point)));
      return { point, path: ud.path, def: ud.def, fid, normal: n, dist: h.distance, back: h.object.material.side === THREE.BackSide };
    }
    return null;
  }
  pickEdge(sx, sy, tolPx = 7, filter) {
    let best = null, bd = tolPx;
    for (const e of this.worldEdges) {
      if (filter && !filter(e)) continue;
      const a = this.project(e.a), b = this.project(e.b);
      if (a.z > 1 || b.z > 1) continue;
      const d = distSeg(sx, sy, a, b);
      if (d.d < bd) {
        const pw = e.a.clone().lerp(e.b, d.t);
        if (!this.clipOK(pw)) continue;
        bd = d.d; best = { ...e, t: d.t, d: d.d };
      }
    }
    if (best) {
      // occlusion simple : l'arête doit être devant la face touchée
      const fh = this.pickFace(sx, sy, true);
      const pw = this.closestOnEdgeToRay(best.a, best.b, sx, sy);
      if (fh && pw.distanceTo(this.camera.position) > fh.dist + Math.max(5, fh.dist * 0.004) && !this.model.style.xray) {
        // arête cachée : on vérifie qu'elle n'appartient pas à la face touchée
        const sameDef = fh.def === best.def && fh.path.join() === best.path.join();
        let onFace = false;
        if (sameDef) { const D = this.model.defs.get(fh.def); const f = D.faces.get(fh.fid); const e = D.edges.get(best.id); if (f && e) { const vs = G.vertsOfFace(f); onFace = vs.has(e.a) && vs.has(e.b); } }
        if (!onFace) return null;
      }
      best.point = pw;
    }
    return best;
  }
  closestOnEdgeToRay(a, b, sx, sy) {
    const r = this.ray(sx, sy).ray; const p = new Vector3();
    r.distanceSqToSegment(a, b, null, p); return p;
  }
  // élément sous le curseur dans le contexte actif (pour l'outil Sélection)
  pickEntity(sx, sy) {
    const ap = this.activePath;
    const e = this.pickEdge(sx, sy, 6);
    const f = this.pickFace(sx, sy);
    const cand = [];
    if (e) cand.push({ kind: 'e', path: e.path, id: e.id, dist: e.point.distanceTo(this.camera.position) - 1e-3 });
    if (f) cand.push({ kind: 'f', path: f.path, id: f.fid, dist: f.dist, hit: f });
    cand.sort((a, b) => a.dist - b.dist);
    for (const c of cand) {
      const pre = ap.every((x, i) => c.path[i] === x);
      if (!pre) continue;
      if (c.path.length === ap.length) return { key: c.kind + ':' + c.id, kind: c.kind, id: c.id, hit: c.hit };
      return { key: 'i:' + c.path[ap.length], kind: 'i', id: c.path[ap.length], hit: c.hit };
    }
    if (cand.length) return { outside: true };
    return null;
  }

  // ---------------------------------------------------------------- Inférences
  // Renvoie un point 3D (monde) avec son type d'inférence
  infer(sx, sy, o = {}) {
    const ray = this.ray(sx, sy).ray;
    const from = o.from || null;
    const skip = o.skip || null;
    const res = (p, type, extra = {}) => ({ p, type, ...extra });
    const lineClosest = (orig, dir) => {
      const p = new Vector3(); const p2 = new Vector3();
      ray.distanceSqToSegment(orig.clone().addScaledVector(dir, -1e7), orig.clone().addScaledVector(dir, 1e7), p2, p);
      return p;
    };
    // 1 — points remarquables
    let best = null, bd = 12;
    const consider = (p, type, extra) => {
      if (!this.clipOK(p)) return;
      const s = this.project(p); if (s.z > 1) return;
      const d = Math.hypot(s.x - sx, s.y - sy) - (type === 'end' ? 2 : 0);
      if (d < bd) { bd = d; best = res(p.clone(), type, extra); }
    };
    for (const wp of this.worldPoints) { if (skip && skip(wp)) continue; consider(wp.p, 'end', { vid: wp.vid, path: wp.path }); }
    for (const e of this.worldEdges) { if (skip && skip(e)) continue; if (e.soft) continue; consider(e.a.clone().lerp(e.b, 0.5), 'mid', { edge: e }); }
    for (const g of this.model.guides) if (g.type === 'point') consider(g.p, 'guidept');
    for (const d of this.model.dims) { consider(d.a, 'end'); consider(d.b, 'end'); }
    if (o.extraPoints) for (const ep of o.extraPoints) consider(ep.p, ep.type || 'end');
    if (best && best.type === 'end') this.trackPoint = best.p.clone();
    // occlusion des points
    if (best && !this.model.style.xray) {
      const fh = this.pickFace(sx, sy, true);
      if (fh && best.p.distanceTo(this.camera.position) > fh.dist + Math.max(8, fh.dist * 0.01)) best = null;
    }

    // 2 — verrouillage d'axe / direction
    if (from && o.lockDir) {
      const dir = o.lockDir.clone().normalize();
      let p = best ? from.clone().addScaledVector(dir, new Vector3().subVectors(best.p, from).dot(dir)) : lineClosest(from, dir);
      return res(p, 'lock', { dir, color: o.lockColor || COLORS.par, label: o.lockLabel ?? 'Verrouillé', from: o.lockLabel === '' ? null : from });
    }
    // plan verrouillé (rectangle, cercle…)
    if (o.plane) {
      const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(o.plane.n, o.plane.p);
      if (best) { const q = new Vector3(); pl.projectPoint(best.p, q); best.p = q; return best; }
      const q = new Vector3(); if (!ray.intersectPlane(pl, q)) return null;
      // axes dans le plan
      if (from) {
        let ab = null, abd = 10;
        for (const [k, d] of Object.entries(AX)) {
          if (Math.abs(d.dot(o.plane.n)) > 0.01) continue;
          const c = from.clone().addScaledVector(d, new Vector3().subVectors(q, from).dot(d));
          const s = this.project(c); const dd = Math.hypot(s.x - sx, s.y - sy);
          if (dd < abd) { abd = dd; ab = res(c, 'axis', { axis: k, from }); }
        }
        if (ab) return ab;
      }
      return res(q, 'plane');
    }
    if (best) return best;

    // 3 — sur arête
    const e = this.pickEdge(sx, sy, 8, skip ? (x) => !skip(x) : null);
    // 4 — axes depuis le point de départ
    let ax = null;
    if (from) {
      let abd = 10;
      const dirs = Object.entries(AX).map(([k, d]) => ({ k, d }));
      if (this.hoverEdgeDir) { dirs.push({ k: 'par', d: this.hoverEdgeDir }); }
      for (const { k, d } of dirs) {
        const c = lineClosest(from, d);
        if (c.distanceTo(from) < 1e-6) continue;
        const s = this.project(c); if (s.z > 1) continue;
        const dd = Math.hypot(s.x - sx, s.y - sy);
        if (dd < abd) { abd = dd; ax = res(c, k === 'par' ? 'par' : 'axis', { axis: k, from, dir: d }); }
      }
    }
    if (e) this.hoverEdgeDir = new Vector3().subVectors(e.b, e.a).normalize();
    // intersection axe + arête
    if (ax && e) {
      const p1 = new Vector3(), p2 = new Vector3();
      const r2 = new THREE.Ray(ax.from, ax.dir || AX[ax.axis]);
      const d2 = r2.distanceSqToSegment(e.a, e.b, p1, p2);
      if (d2 < 1) return res(p2, 'axis', { axis: ax.axis, from, dir: ax.dir, onEdge: true });
    }
    if (e) return res(e.point, 'edge', { edge: e });
    // suivi depuis un point survolé
    if (this.trackPoint && from && this.trackPoint.distanceTo(from) > 1) {
      const tp = this.trackPoint; let tb = null, tbd = 9;
      for (const [k, d] of Object.entries(AX)) {
        const c = lineClosest(tp, d); const s = this.project(c); const dd = Math.hypot(s.x - sx, s.y - sy);
        if (dd < tbd) { tbd = dd; tb = { k, d, c }; }
      }
      if (tb && ax) {
        // intersection des deux lignes
        const a1 = from, d1 = ax.dir || AX[ax.axis], a2 = tp, d2 = tb.d;
        const w = new Vector3().subVectors(a1, a2); const b = d1.dot(d2); const dd = d1.dot(w), ee = d2.dot(w);
        const den = 1 - b * b;
        if (Math.abs(den) > 1e-6) {
          const s1 = (b * ee - dd) / den; const q1 = a1.clone().addScaledVector(d1, s1); const q2 = a2.clone().addScaledVector(d2, (ee - b * dd) / den);
          if (q1.distanceTo(q2) < 1) return res(q1, 'axis', { axis: ax.axis, from, dir: d1, track: tp });
        }
      }
      if (tb && !ax) return res(tb.c, 'track', { axis: tb.k, from: tp, track: tp });
    }
    if (ax) return ax;
    // guides
    for (const g of this.model.guides) {
      if (g.type !== 'line') continue;
      const c = lineClosest(g.p, g.d); const s = this.project(c);
      if (s.z <= 1 && Math.hypot(s.x - sx, s.y - sy) < 7) return res(c, 'guide', { guide: g });
    }
    // 5 — sur face
    const f = this.pickFace(sx, sy, true);
    if (f) return res(f.point, 'face', { face: f });
    // 6 — plan du sol (ou plan horizontal du point de départ)
    const z = from ? from.z : 0;
    const pl = new THREE.Plane(new Vector3(0, 0, 1), -z); const q = new Vector3();
    if (ray.intersectPlane(pl, q) && q.distanceTo(this.camera.position) < 2e6) return res(q, from ? 'free' : 'ground');
    const q2 = ray.at(this.camera.position.distanceTo(this.target), new Vector3());
    return res(q2, 'free');
  }
}

function distSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)), t };
}
let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(0, 0, 8, 8); x.fillStyle = '#fff'; x.fillRect(0, 0, 3, 3); x.fillRect(4, 4, 3, 3);
  _dot = new THREE.CanvasTexture(c); _dot.wrapS = _dot.wrapT = THREE.RepeatWrapping; _dot.repeat.set(1, 1);
  return _dot;
}
export { THREE, G };
