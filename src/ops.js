// G&L Sketch — opérations : groupes, composants, solides, bibliothèque, import/export
import { THREE, G, defToJSON, defFromJSON } from './app.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontData from '../assets/font.json';
import { zipSync, strToU8 } from 'fflate';
const { Vector3, Matrix4 } = THREE;

export function cloneDefDeep(app, defId) {
  const src = app.model.defs.get(defId); const j = defToJSON(src);
  j.id = G.nid();
  const D = defFromJSON(j);
  for (const it of D.insts.values()) { const cd = app.model.defs.get(it.def); if (cd && cd.kind === 'group') it.def = cloneDefDeep(app, it.def); }
  app.model.defs.set(D.id, D);
  return D.id;
}

function selParts(app) {
  const D = app.activeDef; const faces = [], edges = new Set(), insts = [];
  for (const k of app.sel) {
    const t = k[0], id = +k.slice(2);
    if (t === 'f' && D.faces.has(id)) { faces.push(id); G.edgesOfFace(D, D.faces.get(id)).forEach((e) => edges.add(e)); }
    if (t === 'e' && D.edges.has(id)) edges.add(id);
    if (t === 'i' && D.insts.has(id)) insts.push(id);
  }
  return { D, faces, edges: [...edges], insts };
}

export function makeGroup(app, kind = 'group', name) {
  const { D, faces, edges, insts } = selParts(app);
  if (!faces.length && !edges.length && !insts.length) { app.emit('toast', 'Rien de sélectionné'); return null; }
  const id = app.commit(kind === 'group' ? 'Créer un groupe' : 'Créer un composant', () => {
    const box = new THREE.Box3();
    for (const eid of edges) { const e = D.edges.get(eid); box.expandByPoint(D.verts.get(e.a).p); box.expandByPoint(D.verts.get(e.b).p); }
    for (const iid of insts) { const it = D.insts.get(iid); G.bboxOfDef(app.model.defs, app.model.defs.get(it.def), it.m, box); }
    const o = kind === 'component' ? new Vector3(box.min.x, box.min.y, box.min.z) : box.min.clone();
    const ND = new G.Def(name || (kind === 'group' ? 'Groupe' : 'Composant#' + (countKind(app, 'component') + 1)), kind);
    const toL = new Matrix4().makeTranslation(-o.x, -o.y, -o.z);
    G.copyGeometry(D, ND, faces, edges, toL);
    for (const iid of insts) { const it = D.insts.get(iid); D.insts.delete(iid); ND.insts.set(iid, { ...it, m: it.m.clone().premultiply(toL) }); }
    // retirer de la définition parente
    for (const fid of faces) D.faces.delete(fid);
    D._adj = null;
    const usedByFaces = new Set(); for (const f of D.faces.values()) for (const e of G.edgesOfFace(D, f)) usedByFaces.add(e);
    for (const eid of edges) if (!usedByFaces.has(eid)) G.removeEdgeRaw(D, eid);
    G.removeOrphans(D);
    app.model.defs.set(ND.id, ND);
    const iid = G.nid(); D.insts.set(iid, { id: iid, def: ND.id, m: new Matrix4().makeTranslation(o.x, o.y, o.z), name: '', hidden: false, tag: null, mat: null });
    D.touch(); ND.touch();
    return iid;
  });
  if (id) { app.sel.clear(); app.sel.add('i:' + id); app.refreshSelection(); app.emit('changed'); }
  return id;
}
function countKind(app, k) { let n = 0; for (const d of app.model.defs.values()) if (d.kind === k) n++; return n; }

export function explode(app) {
  const D = app.activeDef; const ids = [...app.sel].filter((k) => k[0] === 'i').map((k) => +k.slice(2)).filter((id) => D.insts.has(id));
  if (!ids.length) return;
  const nk = app.commit('Éclater', () => {
    const keys = [];
    for (const iid of ids) {
      const it = D.insts.get(iid); const cd = app.model.defs.get(it.def);
      const res = G.copyGeometry(cd, D, [...cd.faces.keys()], [...cd.edges.keys()], it.m);
      for (const fid of res.faces) { const f = D.faces.get(fid); if (!f.mat && it.mat) f.mat = it.mat; keys.push('f:' + fid); }
      res.edges.forEach((e) => keys.push('e:' + e));
      for (const c of cd.insts.values()) { const nid = G.nid(); D.insts.set(nid, { ...c, id: nid, m: it.m.clone().multiply(c.m), mat: c.mat || it.mat }); keys.push('i:' + nid); }
      D.insts.delete(iid);
    }
    purgeDefs(app); D.touch(); return keys;
  });
  if (nk) { app.sel.clear(); nk.forEach((k) => app.sel.add(k)); app.refreshSelection(); }
}
export function makeUnique(app) {
  const D = app.activeDef; const ids = [...app.sel].filter((k) => k[0] === 'i').map((k) => +k.slice(2)).filter((id) => D.insts.has(id));
  app.commit('Rendre unique', () => { for (const iid of ids) { const it = D.insts.get(iid); it.def = cloneDefDeep(app, it.def); const d = app.model.defs.get(it.def); d.name += ' (copie)'; } });
}
export function purgeDefs(app) {
  const used = new Set([app.model.root.id]);
  const walk = (D) => { for (const it of D.insts.values()) if (!used.has(it.def)) { used.add(it.def); const d = app.model.defs.get(it.def); if (d) walk(d); } };
  walk(app.model.root);
  for (const [id, d] of [...app.model.defs]) if (!used.has(id) && d.kind !== 'component') app.model.defs.delete(id);
}
export function purgeAll(app) {
  app.commit('Purger', () => {
    const used = new Set([app.model.root.id]);
    const walk = (D) => { for (const it of D.insts.values()) if (!used.has(it.def)) { used.add(it.def); walk(app.model.defs.get(it.def)); } };
    walk(app.model.root);
    for (const id of [...app.model.defs.keys()]) if (!used.has(id)) app.model.defs.delete(id);
  });
}

// ----------------------------------------------------------------- Triangles
export function collectTriangles(app, D, m, inheritedMat, out, opts = {}) {
  for (const f of D.faces.values()) {
    if (f.hidden && !opts.hidden) continue;
    const { tris } = G.triangulateFace(D, f); const mat = f.mat || inheritedMat || null;
    let b = out.get(mat); if (!b) out.set(mat, (b = []));
    for (const t of tris) for (const v of t) { const p = D.verts.get(v).p.clone().applyMatrix4(m); b.push(p.x, p.y, p.z); }
  }
  for (const it of D.insts.values()) {
    if (it.hidden && !opts.hidden) continue; if (!app.tagVisible(it.tag)) continue;
    collectTriangles(app, app.model.defs.get(it.def), m.clone().multiply(it.m), it.mat || inheritedMat, out, opts);
  }
  return out;
}
function geomFromArr(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; }

// ----------------------------------------------------------------- Solides
export function isSolid(app, defId) {
  const D = app.model.defs.get(defId); const cnt = new Map();
  for (const f of D.faces.values()) for (const e of G.edgesOfFace(D, f)) cnt.set(e, (cnt.get(e) || 0) + 1);
  if (!cnt.size) return false;
  for (const e of D.edges.keys()) if ((cnt.get(e) || 0) !== 2) return false;
  return true;
}
export function solidOp(app, op) {
  const D = app.activeDef; const ids = [...app.sel].filter((k) => k[0] === 'i').map((k) => +k.slice(2));
  if (ids.length !== 2) { app.emit('toast', 'Sélectionnez exactement 2 groupes ou composants solides.'); return; }
  const brush = (iid) => {
    const it = D.insts.get(iid); const tri = collectTriangles(app, app.model.defs.get(it.def), it.m, it.mat, new Map());
    const all = []; for (const a of tri.values()) all.push(...a);
    const g = geomFromArr(all); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((all.length / 3) * 2), 2));
    const b = new Brush(g); b.updateMatrixWorld(); return { b, mat: it.mat || [...tri.keys()][0] || null };
  };
  const nid = app.commit({ union: 'Union', sub: 'Soustraire', inter: 'Intersection', trim: 'Couper' }[op], () => {
    const A = brush(ids[0]), B = brush(ids[1]);
    const ev = new Evaluator(); ev.attributes = ['position', 'normal']; ev.useGroups = false;
    const opc = op === 'union' ? ADDITION : op === 'inter' ? INTERSECTION : SUBTRACTION;
    // Soustraire : le premier sélectionné est retiré du second (comme l'outil d'origine)
    const res = op === 'sub' || op === 'trim' ? ev.evaluate(B.b, A.b, opc) : ev.evaluate(A.b, B.b, opc);
    let g = res.geometry; if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position.array;
    const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
    const ND = new G.Def(op === 'union' ? 'Union' : op === 'inter' ? 'Intersection' : 'Différence', 'group');
    G.meshToDef(ND, pos, new Matrix4().makeTranslation(-box.min.x, -box.min.y, -box.min.z));
    const keepMat = op === 'sub' || op === 'trim' ? B.mat : A.mat;
    for (const f of ND.faces.values()) f.mat = keepMat;
    app.model.defs.set(ND.id, ND);
    if (op !== 'trim') D.insts.delete(ids[0]);
    D.insts.delete(ids[1]);
    const id = G.nid(); D.insts.set(id, { id, def: ND.id, m: new Matrix4().makeTranslation(box.min.x, box.min.y, box.min.z), name: '', hidden: false, tag: null, mat: null });
    purgeDefs(app); D.touch(); return id;
  });
  if (nid) { app.sel.clear(); app.sel.add('i:' + nid); app.refreshSelection(); }
}

// ----------------------------------------------------------------- Export
export function exportScene(app, withMaterials) {
  const tri = collectTriangles(app, app.model.root, new Matrix4(), null, new Map());
  const scene = new THREE.Scene();
  for (const [mat, arr] of tri) {
    if (!arr.length) continue;
    const md = mat ? app.model.materials.get(mat) : null;
    const m = withMaterials ? new THREE.MeshStandardMaterial({ color: md ? md.color : '#f3f1ec', transparent: (md?.opacity ?? 1) < 1, opacity: md?.opacity ?? 1, name: md?.name || 'Défaut', roughness: 0.8 }) : new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geomFromArr(arr), m); mesh.name = md?.name || 'Défaut'; scene.add(mesh);
  }
  return scene;
}
export function exportSTL(app) { return new STLExporter().parse(exportScene(app), { binary: true }); }
export function exportOBJ(app) {
  // OBJ en mètres? non : conservé en millimètres (unité du modèle)
  return new OBJExporter().parse(exportScene(app, true));
}
export function exportGLB(app) {
  return new Promise((res, rej) => {
    const s = exportScene(app, true); s.scale.setScalar(0.001); s.rotation.x = -Math.PI / 2; s.updateMatrixWorld(true);
    new GLTFExporter().parse(s, (r) => res(r), rej, { binary: true });
  });
}
export function exportDXF(app) {
  // Projection de dessus (arêtes visibles) en 2D, en mm
  const lines = [];
  const walk = (D, m) => {
    for (const e of D.edges.values()) { if (e.soft || e.hidden) continue; const a = D.verts.get(e.a).p.clone().applyMatrix4(m), b = D.verts.get(e.b).p.clone().applyMatrix4(m); if (Math.hypot(a.x - b.x, a.y - b.y) > 0.01) lines.push([a, b]); }
    for (const it of D.insts.values()) if (!it.hidden) walk(app.model.defs.get(it.def), m.clone().multiply(it.m));
  };
  walk(app.model.root, new Matrix4());
  let s = '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
  for (const [a, b] of lines) s += `0\nLINE\n8\n0\n10\n${a.x.toFixed(3)}\n20\n${a.y.toFixed(3)}\n30\n0\n11\n${b.x.toFixed(3)}\n21\n${b.y.toFixed(3)}\n31\n0\n`;
  return s + '0\nENDSEC\n0\nEOF\n';
}
export function zipOne(name, data) { return zipSync({ [name]: typeof data === 'string' ? strToU8(data) : new Uint8Array(data.buffer ? data.buffer : data) }); }

// ----------------------------------------------------------------- Import
export function importMesh(app, name, buf) {
  const lower = name.toLowerCase(); let positions = [];
  if (lower.endsWith('.stl')) { let g = new STLLoader().parse(buf); if (g.index) g = g.toNonIndexed(); positions = g.attributes.position.array; }
  else if (lower.endsWith('.obj')) {
    const txt = typeof buf === 'string' ? buf : new TextDecoder().decode(buf); const o = new OBJLoader().parse(txt); o.updateMatrixWorld(true);
    const arr = []; o.traverse((c) => { if (c.isMesh) { let g = c.geometry; if (g.index) g = g.toNonIndexed(); const p = g.attributes.position; const v = new Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(c.matrixWorld); arr.push(v.x, v.y, v.z); } } });
    positions = arr;
  } else throw new Error('Format non pris en charge');
  if (positions.length > 9 * 60000) throw new Error('Maillage trop lourd (plus de 60 000 triangles)');
  const box = new THREE.Box3(); const v = new Vector3(); for (let i = 0; i < positions.length; i += 3) box.expandByPoint(v.set(positions[i], positions[i + 1], positions[i + 2]));
  const ND = new G.Def(name.replace(/\.\w+$/, ''), 'component');
  G.meshToDef(ND, positions, new Matrix4().makeTranslation(-box.min.x, -box.min.y, -box.min.z));
  app.model.defs.set(ND.id, ND);
  return ND.id;
}

// ----------------------------------------------------------------- Texte 3D
let _font = null;
export function make3DText(app, text, size, depth, standing) {
  _font ||= new FontLoader().parse(fontData);
  const g = new TextGeometry(text, { font: _font, size, depth: Math.max(depth, 0.01), curveSegments: 5, bevelEnabled: false });
  let ng = g.index ? g.toNonIndexed() : g; ng.computeBoundingBox();
  const bb = ng.boundingBox; const m = new Matrix4().makeTranslation(-bb.min.x, -bb.min.y, -bb.min.z);
  if (standing) m.premultiply(new Matrix4().makeRotationX(Math.PI / 2));
  const ND = new G.Def('Texte « ' + text.slice(0, 20) + ' »', 'component');
  G.meshToDef(ND, ng.attributes.position.array, m);
  app.model.defs.set(ND.id, ND);
  return ND.id;
}

// ----------------------------------------------------------------- Bibliothèque
export function prism(name, profile2D, length, holes = [], axis = 'z', mat = null) {
  // profil dans le plan XY, extrudé selon Z puis orienté
  const D = new G.Def(name, 'component');
  const V = (p) => new Vector3(p[0], p[1], 0);
  const r = G.drawPolyline(D, profile2D.map(V), true, { horizontalUp: true });
  for (const h of holes) G.drawPolyline(D, h.map(V), true, { horizontalUp: true });
  // supprimer les faces des trous
  const outerArea = (f) => G.faceArea(D, { loops: [f.loops[0]] });
  const faces = [...D.faces.values()].sort((a, b) => outerArea(b) - outerArea(a));
  const main = faces[0]; for (const f of faces.slice(1)) D.faces.delete(f.id);
  void r;
  if (G.faceNormal(D, main).z < 0) G.reverseFace(D, main.id);
  G.pushPull(D, main.id, length);
  for (const f of D.faces.values()) f.mat = mat;
  if (axis !== 'z') {
    const m = axis === 'x' ? new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1) : new Matrix4().makeRotationX(-Math.PI / 2);
    for (const v of D.verts.values()) v.p.applyMatrix4(m);
    const box = new THREE.Box3(); for (const v of D.verts.values()) box.expandByPoint(v.p);
    for (const v of D.verts.values()) v.p.sub(box.min);
  }
  D.touch(); return D;
}
const nm = (n, L) => (L === 1000 ? n : n + ' L=' + Math.round(L));
const rect = (w, h, x = 0, y = 0) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const circ = (r, n = 32, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)]);
function Ishape(h, b, tw, tf) { const x0 = (b - tw) / 2; return [[0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf], [b, h], [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf]]; }
function Ushape(h, b, tw, tf) { return [[0, 0], [b, 0], [b, tf], [tw, tf], [tw, h - tf], [b, h - tf], [b, h], [0, h]]; }
function Lshape(a, b, t) { return [[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]]; }
function Tshape(h, b, t) { return [[0, h - t], [b, h - t], [b, h], [0, h]].length && [[(b - t) / 2, 0], [(b + t) / 2, 0], [(b + t) / 2, h - t], [b, h - t], [b, h], [0, h], [0, h - t], [(b - t) / 2, h - t]]; }

export const LIBRARY = [
  { cat: 'Tubes acier', items: [
    ['Tube carré 30×30×2', (L = 1000) => prism(nm('Tube carré 30×30×2', L), rect(30, 30), L, [rect(26, 26, 2, 2)], 'x', 'mAcier')],
    ['Tube carré 40×40×2', (L = 1000) => prism(nm('Tube carré 40×40×2', L), rect(40, 40), L, [rect(36, 36, 2, 2)], 'x', 'mAcier')],
    ['Tube carré 50×50×3', (L = 1000) => prism(nm('Tube carré 50×50×3', L), rect(50, 50), L, [rect(44, 44, 3, 3)], 'x', 'mAcier')],
    ['Tube carré 60×60×3', (L = 1000) => prism(nm('Tube carré 60×60×3', L), rect(60, 60), L, [rect(54, 54, 3, 3)], 'x', 'mAcier')],
    ['Tube carré 80×80×3', (L = 1000) => prism(nm('Tube carré 80×80×3', L), rect(80, 80), L, [rect(74, 74, 3, 3)], 'x', 'mAcier')],
    ['Tube carré 100×100×4', (L = 1000) => prism(nm('Tube carré 100×100×4', L), rect(100, 100), L, [rect(92, 92, 4, 4)], 'x', 'mAcier')],
    ['Tube rect. 40×20×2', (L = 1000) => prism(nm('Tube rectangulaire 40×20×2', L), rect(20, 40), L, [rect(16, 36, 2, 2)], 'x', 'mAcier')],
    ['Tube rect. 60×40×2', (L = 1000) => prism(nm('Tube rectangulaire 60×40×2', L), rect(40, 60), L, [rect(36, 56, 2, 2)], 'x', 'mAcier')],
    ['Tube rect. 80×40×3', (L = 1000) => prism(nm('Tube rectangulaire 80×40×3', L), rect(40, 80), L, [rect(34, 74, 3, 3)], 'x', 'mAcier')],
    ['Tube rect. 120×60×4', (L = 1000) => prism(nm('Tube rectangulaire 120×60×4', L), rect(60, 120), L, [rect(52, 112, 4, 4)], 'x', 'mAcier')],
    ['Tube rond Ø33,7×2', (L = 1000) => prism(nm('Tube rond Ø33,7', L), circ(16.85, 24, 16.85, 16.85), L, [circ(14.85, 24, 16.85, 16.85)], 'x', 'mAcier')],
    ['Tube rond Ø42,4×2', (L = 1000) => prism(nm('Tube rond Ø42,4', L), circ(21.2, 24, 21.2, 21.2), L, [circ(19.2, 24, 21.2, 21.2)], 'x', 'mAcier')],
    ['Tube rond Ø60,3×3', (L = 1000) => prism(nm('Tube rond Ø60,3', L), circ(30.15, 32, 30.15, 30.15), L, [circ(27.15, 32, 30.15, 30.15)], 'x', 'mAcier')],
  ] },
  { cat: 'Profilés acier', items: [
    ['IPE 100', (L = 1000) => prism(nm('IPE 100', L), Ishape(100, 55, 4.1, 5.7), L, [], 'x', 'mAcier')],
    ['IPE 120', (L = 1000) => prism(nm('IPE 120', L), Ishape(120, 64, 4.4, 6.3), L, [], 'x', 'mAcier')],
    ['IPE 160', (L = 1000) => prism(nm('IPE 160', L), Ishape(160, 82, 5, 7.4), L, [], 'x', 'mAcier')],
    ['IPE 200', (L = 1000) => prism(nm('IPE 200', L), Ishape(200, 100, 5.6, 8.5), L, [], 'x', 'mAcier')],
    ['HEA 100', (L = 1000) => prism(nm('HEA 100', L), Ishape(96, 100, 5, 8), L, [], 'x', 'mAcier')],
    ['HEA 140', (L = 1000) => prism(nm('HEA 140', L), Ishape(133, 140, 5.5, 8.5), L, [], 'x', 'mAcier')],
    ['UPN 80', (L = 1000) => prism(nm('UPN 80', L), Ushape(80, 45, 6, 8), L, [], 'x', 'mAcier')],
    ['UPN 100', (L = 1000) => prism(nm('UPN 100', L), Ushape(100, 50, 6, 8.5), L, [], 'x', 'mAcier')],
    ['Cornière 30×30×3', (L = 1000) => prism(nm('Cornière 30×30×3', L), Lshape(30, 30, 3), L, [], 'x', 'mAcier')],
    ['Cornière 40×40×4', (L = 1000) => prism(nm('Cornière 40×40×4', L), Lshape(40, 40, 4), L, [], 'x', 'mAcier')],
    ['Cornière 50×50×5', (L = 1000) => prism(nm('Cornière 50×50×5', L), Lshape(50, 50, 5), L, [], 'x', 'mAcier')],
    ['Fer en T 40×40×5', (L = 1000) => prism(nm('Fer T 40×40×5', L), Tshape(40, 40, 5), L, [], 'x', 'mAcier')],
    ['Fer plat 30×5', (L = 1000) => prism(nm('Fer plat 30×5', L), rect(5, 30), L, [], 'x', 'mAcier')],
    ['Fer plat 40×8', (L = 1000) => prism(nm('Fer plat 40×8', L), rect(8, 40), L, [], 'x', 'mAcier')],
    ['Fer plat 50×10', (L = 1000) => prism(nm('Fer plat 50×10', L), rect(10, 50), L, [], 'x', 'mAcier')],
    ['Rond plein Ø12', (L = 1000) => prism(nm('Rond plein Ø12', L), circ(6, 16, 6, 6), L, [], 'x', 'mAcier')],
    ['Carré plein 14', (L = 1000) => prism(nm('Carré plein 14', L), rect(14, 14), L, [], 'x', 'mAcier')],
  ] },
  { cat: 'Tôles et platines', items: [
    ['Platine 200×200×10', () => prism('Platine 200×200×10', rect(200, 200), 10, [], 'z', 'mAcier')],
    ['Platine 150×150×8', () => prism('Platine 150×150×8', rect(150, 150), 8, [], 'z', 'mAcier')],
    ['Tôle 1000×500×3', () => prism('Tôle 1000×500×3', rect(1000, 500), 3, [], 'z', 'mAcier')],
    ['Tôle Corten 1000×2000×2', () => prism('Tôle Corten 1000×2000×2', rect(1000, 2000), 2, [], 'z', 'mCorten')],
  ] },
  { cat: 'Bois et maçonnerie', items: [
    ['Poteau bois 100×100', () => prism('Poteau bois 100×100', rect(100, 100), 2400, [], 'z', 'mChene')],
    ['Poteau bois 120×120', () => prism('Poteau bois 120×120', rect(120, 120), 2400, [], 'z', 'mChene')],
    ['Chevron 63×75', () => prism('Chevron 63×75', rect(63, 75), 3000, [], 'x', 'mPin')],
    ['Bastaing 63×175', () => prism('Bastaing 63×175', rect(63, 175), 4000, [], 'x', 'mPin')],
    ['Lame terrasse 145×28', () => prism('Lame terrasse 145×28', rect(145, 28), 2400, [], 'x', 'mPin')],
    ['Plaque de plâtre BA13', () => prism('Plaque BA13 1200×2500', rect(1200, 13), 2500, [], 'z', 'mPlaco')],
    ['Parpaing 500×200×200', () => prism('Parpaing 500×200×200', rect(500, 200), 200, [], 'z', 'mBeton')],
    ['Brique 220×105×65', () => prism('Brique 220×105×65', rect(220, 105), 65, [], 'z', 'mBrique')],
  ] },
  { cat: 'Menuiseries', items: [
    ['Porte 830×2040', () => door()],
    ['Fenêtre 1000×1250', () => windowC()],
    ['Personnage 1,75 m', () => person()],
  ] },
];
function door() {
  const D = prism('Porte 830×2040', rect(830, 40), 2040, [], 'z', 'mChene');
  return D;
}
function windowC() {
  const D = new G.Def('Fenêtre 1000×1250', 'component');
  const outer = rect(1000, 1250), inner = rect(880, 1130, 60, 60);
  const V = (p) => new Vector3(p[0], 0, p[1]);
  G.drawPolyline(D, outer.map(V), true, {}); G.drawPolyline(D, inner.map(V), true, {});
  const fs = [...D.faces.values()].sort((a, b) => G.faceArea(D, b) - G.faceArea(D, a));
  const frame = fs[0], glass = fs[1];
  if (G.faceNormal(D, frame).y > 0) G.reverseFace(D, frame.id);
  G.pushPull(D, frame.id, 70);
  for (const f of D.faces.values()) f.mat = 'mBlanc';
  if (D.faces.has(glass.id)) { const gf = D.faces.get(glass.id); gf.mat = 'mVerre'; gf.back = 'mVerre'; }
  D.touch(); return D;
}
function person() {
  const D = new G.Def('Personnage 1,75 m', 'component');
  const s = [[-180, 0], [-90, 0], [-70, 780], [-20, 780], [0, 0], [90, 0], [110, 0], [60, 820], [70, 900], [180, 1450], [140, 1480], [60, 1150], [75, 1440], [40, 1490], [55, 1540], [60, 1640], [0, 1750], [-60, 1640], [-55, 1540], [-40, 1490], [-75, 1440], [-60, 1150], [-140, 1480], [-180, 1450], [-70, 900], [-60, 820], [-140, 30]].map(([x, z]) => new Vector3(x + 180, 0, z));
  G.drawPolyline(D, s, true, { camPos: new Vector3(0, -1e5, 0) });
  for (const f of D.faces.values()) { f.mat = 'mPersonne'; f.back = 'mPersonne'; }
  D.touch(); return D;
}
export function ensureLibMaterials(app) {
  const add = (id, name, color, tex, size, op) => { if (!app.model.materials.has(id)) app.model.materials.set(id, { id, name, color, opacity: op ?? 1, tex: tex ? { kind: tex, size } : null }); };
  add('mAcier', 'Acier', '#7d8288', 'metal', 600); add('mCorten', 'Acier Corten (bibl.)', '#8a4b26', 'corten', 1000);
  add('mChene', 'Chêne (bibl.)', '#b88a55', 'wood', 1200); add('mPin', 'Pin (bibl.)', '#d8b47c', 'wood', 1200); add('mPlaco', 'Placo (bibl.)', '#f4f4f1');
  add('mBeton', 'Béton (bibl.)', '#9d9d98', 'concrete', 1500); add('mBrique', 'Brique (bibl.)', '#a5523a', 'brick', 1200);
  add('mBlanc', 'Blanc menuiserie', '#f7f7f5'); add('mAlu', 'Aluminium blanc 9016', '#f1f1ee', 'metal', 600); add('mAnthracite', 'Acier anthracite 7016', '#383e42', 'metal', 600); add('mNoir', 'Acier noir 9005', '#1f2124', 'metal', 600); add('mInox', 'Inox brossé', '#c9cdd1', 'metal', 400); add('mVerre', 'Vitrage', '#9fd3e6', null, 0, 0.3); add('mPersonne', 'Silhouette', '#5d7fa8');
}
export function libraryDef(app, name, make, L) {
  const key = L && L !== 1000 ? name + '|' + Math.round(L) : name;
  for (const d of app.model.defs.values()) if (d.libName === key) return d.id;
  ensureLibMaterials(app);
  const D = L ? make(L) : make(); D.libName = key; app.model.defs.set(D.id, D); return D.id;
}
