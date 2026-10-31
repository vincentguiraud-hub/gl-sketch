// G&L Sketch — fonctions métier : générateurs, liste de débit, métré, adoucissement
import { THREE, G, fmtLen } from './app.js';
import { prism, ensureLibMaterials, collectTriangles } from './ops.js';
const { Vector3, Matrix4 } = THREE;

const rect = (w, h, x = 0, y = 0) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const r1 = (v) => Math.round(v);

// ------------------------------------------------------- Pièces (définitions en cache)
function cachedDef(app, key, make) {
  for (const d of app.model.defs.values()) if (d.libName === key) return d.id;
  const D = make(); D.libName = key; app.model.defs.set(D.id, D); return D.id;
}
// tube rectangulaire w (largeur, Y) × h (hauteur, Z) × ép. t, longueur L selon X
export function tubeDef(app, w, h, t, L, mat) {
  const tt = String(t).replace('.', ','); const nm = (w === h ? `Tube carré ${w}×${h}×${tt}` : `Tube rect. ${h}×${w}×${tt}`) + ` L=${r1(L)}`;
  return cachedDef(app, 'gen|tube|' + [w, h, t, r1(L), mat].join('|'), () => prism(nm, rect(w, h), L, t > 0 ? [rect(w - 2 * t, h - 2 * t, t, t)] : [], 'x', mat));
}
export function barDef(app, w, h, L, mat, label) {
  const nm = `${label || 'Plat'} ${r1(w)}×${r1(h)} L=${r1(L)}`;
  return cachedDef(app, 'gen|bar|' + [r1(w), r1(h), r1(L), mat, label].join('|'), () => prism(nm, rect(w, h), L, [], 'x', mat));
}
export function plateDef(app, lx, ly, t, mat, label) {
  const nm = `${label || 'Tôle'} ${r1(lx)}×${r1(ly)}×${t}`;
  return cachedDef(app, 'gen|plate|' + [r1(lx), r1(ly), t, mat, label].join('|'), () => prism(nm, rect(lx, ly), t, [], 'z', mat));
}
// polygone 2D (u = X, v = Z) extrudé selon Y d'une épaisseur t
export function profileXZDef(app, name, pts, t, mat) {
  return cachedDef(app, 'gen|xz|' + name + '|' + JSON.stringify(pts.map((p) => p.map(r1))) + t + mat, () => {
    const D = new G.Def(name, 'component');
    const r = G.drawPolyline(D, pts.map(([x, z]) => new Vector3(x, 0, z)), true, { camPos: new Vector3(0, -1e6, 0) });
    const f = D.faces.get(r.faces[0]); const n = G.faceNormal(D, f);
    G.pushPull(D, f.id, t * (n.y > 0 ? 1 : -1));
    for (const x of D.faces.values()) x.mat = mat;
    D.touch(); return D;
  });
}
// orientation d'une barre (définie selon +X) : de p0 vers p1, "haut" ≈ Z
function barMatrix(p0, p1, up = new Vector3(0, 0, 1)) {
  const x = new Vector3().subVectors(p1, p0).normalize();
  let y = new Vector3().crossVectors(up, x); if (y.lengthSq() < 1e-9) y = new Vector3(0, 1, 0); y.normalize();
  const z = new Vector3().crossVectors(x, y).normalize();
  return new Matrix4().makeBasis(x, y, z).setPosition(p0);
}
function addInst(D, defId, m, name = '') { const id = G.nid(); D.insts.set(id, { id, def: defId, m, name, hidden: false, tag: null, mat: null }); return id; }
const T = (x, y, z) => new Matrix4().makeTranslation(x, y, z);

// ---------------------------------------------------------------- Garde-corps
export function genGardeCorps(app, o) {
  ensureLibMaterials(app);
  const L = o.L, H = o.H, mat = o.mat;
  const [pw, pt] = [o.post, o.postT]; const [mw, mt] = [o.rail, o.railT];
  const D = new G.Def(`Garde-corps L=${r1(L)} H=${r1(H)}`, 'group');
  const nSpans = Math.max(1, Math.ceil((L - pw) / o.entraxe)); const span = (L - pw) / nSpans;
  const postH = H - mw; const yOff = (Math.max(pw, mw) - pw) / 2;
  // poteaux (verticaux) : tube selon X tourné vers Z
  const postDef = tubeDef(app, pw, pw, pt, postH, mat);
  const vert = (x, y) => new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(x + pw, y, 0);
  for (let i = 0; i <= nSpans; i++) addInst(D, postDef, vert(i * span, yOff), 'Poteau');
  if (o.platine) { const pl = plateDef(app, pw + 80, pw + 80, 8, mat, 'Platine'); for (let i = 0; i <= nSpans; i++) addInst(D, pl, T(i * span - 40, yOff - 40, -8), 'Platine'); }
  // main courante
  const mcDef = tubeDef(app, mw, mw, mt, L, mat); addInst(D, mcDef, T(0, (Math.max(pw, mw) - mw) / 2, postH), 'Main courante');
  // lisse basse et remplissage par travée
  const clear = span - pw; const zLow = o.lowGap; const lh = o.lowRail; const top = postH;
  for (let i = 0; i < nSpans; i++) {
    const x0 = i * span + pw;
    if (lh > 0) addInst(D, tubeDef(app, lh, lh, 2, clear, mat), T(x0, yOff + (pw - lh) / 2, zLow), 'Lisse basse');
    const z0 = lh > 0 ? zLow + lh : zLow; const fh = top - z0;
    if (o.fill === 'barreaux') {
      const b = o.bar; const gap = o.maxGap;
      const nb = Math.max(1, Math.ceil((clear - gap) / (gap + b))); const g = (clear - nb * b) / (nb + 1);
      const bd = tubeDef(app, b, b, o.barT, fh, mat);
      for (let k = 0; k < nb; k++) addInst(D, bd, new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(x0 + g + k * (g + b) + b, yOff + (pw - b) / 2, z0), 'Barreau');
    } else if (o.fill === 'lisses') {
      const b = o.bar; const n = Math.max(1, Math.ceil((fh - o.maxGap) / (o.maxGap + b))); const g = (fh - n * b) / (n + 1);
      for (let k = 0; k < n; k++) addInst(D, tubeDef(app, b, b, o.barT, clear, mat), T(x0, yOff + (pw - b) / 2, z0 + g + k * (g + b)), 'Lisse');
    } else if (o.fill === 'tole' || o.fill === 'verre') {
      const t = o.fill === 'verre' ? 10 : 2; const m = o.fill === 'verre' ? 'mVerre' : 'mCorten';
      const pd = plateDef(app, clear - 10, fh - 10, t, m, o.fill === 'verre' ? 'Verre feuilleté' : 'Tôle Corten');
      addInst(D, pd, new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)).setPosition(x0 + 5, yOff + pw / 2 - t / 2, z0 + 5).multiply(T(0, 0, -t)), o.fill === 'verre' ? 'Verre' : 'Tôle');
    }
  }
  D.touch(); app.model.defs.set(D.id, D); return D.id;
}

// ---------------------------------------------------------------- Escalier droit
export function stairCalc(H, R, n) {
  n = n || Math.max(2, Math.round(H / 175)); const h = H / n; const g = R / (n - 1); return { n, h, g, blondel: 2 * h + g, angle: Math.atan(h / g) * 180 / Math.PI };
}
export function genEscalier(app, o) {
  ensureLibMaterials(app);
  const { n, h, g } = stairCalc(o.H, o.R, o.n);
  const W = o.W, t = o.limonT, LH = o.limonH, tm = o.stepT, nose = o.nose;
  const D = new G.Def(`Escalier ${n} marches H=${r1(o.H)}`, 'group');
  const tan = o.H / o.R; const cos = Math.cos(Math.atan(tan));
  // limons (tôle découpée) : lignes parallèles à la pente
  const up = (x) => x * tan + h; const low = (x) => x * tan + h - LH / cos;
  const xl0 = Math.max(0, (LH / cos - h) / tan); const xuH = (o.H - h) / tan;
  const pts = [[0, 0], [xl0, 0], [o.R, Math.min(low(o.R), o.H - 10)], [o.R, o.H], [Math.min(xuH, o.R), o.H], [0, h]];
  if (low(o.R) > o.H - 10) pts.splice(2, 1);
  const limon = profileXZDef(app, `Limon ${LH}×${t} (${n} marches)`, pts, t, o.mat);
  addInst(D, limon, T(0, 0, 0), 'Limon gauche'); addInst(D, limon, T(0, W - t, 0), 'Limon droit');
  // marches
  const stepW = W - 2 * t; const stepD = g + nose;
  const sd = barDef(app, stepD, tm, stepW, o.stepMat, o.stepMat === 'mChene' || o.stepMat === 'mPin' ? 'Marche bois' : 'Marche tôle');
  for (let i = 1; i < n; i++) {
    const x = (i - 1) * g - nose, z = i * h - tm;
    addInst(D, sd, new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1)).setPosition(x, t, z).multiply(T(0, 0, -tm)), 'Marche ' + i);
  }
  D.touch(); app.model.defs.set(D.id, D); return D.id;
}

// ---------------------------------------------------------------- Pergola
export function genPergola(app, o) {
  ensureLibMaterials(app);
  const { L, P, H, mat } = o; const pw = o.post, pt = o.postT; const bh = o.beamH, bw = o.beamW, bt = o.beamT;
  const D = new G.Def(`Pergola ${r1(L)}×${r1(P)}`, 'group');
  const postH = H - bh;
  const nx = Math.max(1, Math.ceil((L - pw) / o.maxSpan));
  const vert = (x, y) => new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(x + pw, y, 0);
  const pd = tubeDef(app, pw, pw, pt, postH, mat);
  for (let i = 0; i <= nx; i++) { const x = i * (L - pw) / nx; addInst(D, pd, vert(x, 0), 'Poteau'); addInst(D, pd, vert(x, P - pw), 'Poteau'); }
  if (o.platine) { const pl = plateDef(app, pw + 100, pw + 100, 10, mat, 'Platine'); for (let i = 0; i <= nx; i++) { const x = i * (L - pw) / nx; addInst(D, pl, T(x - 50, -50, -10), 'Platine'); addInst(D, pl, T(x - 50, P - pw - 50, -10), 'Platine'); } }
  // poutres : longues (X) et traverses (Y)
  const bx = tubeDef(app, bw, bh, bt, L, mat); addInst(D, bx, T(0, (pw - bw) / 2, postH), 'Poutre'); addInst(D, bx, T(0, P - pw + (pw - bw) / 2, postH), 'Poutre');
  const innerY = P - 2 * ((pw - bw) / 2 + bw);
  const by = tubeDef(app, bw, bh, bt, innerY, mat);
  const alongY = (x) => new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1)).setPosition(x + bw, (pw - bw) / 2 + bw, postH);
  for (let i = 0; i <= nx; i++) { const x = i * (L - pw) / nx + (pw - bw) / 2; addInst(D, by, alongY(x), 'Traverse'); }
  // couverture
  if (o.roof === 'ventelles' || o.roof === 'chevrons') {
    const lw = o.roof === 'ventelles' ? o.slatW : o.slatW; const lh = o.slatH;
    const usable = L - 2 * bw; const n = Math.max(1, Math.floor(usable / o.slatPitch)); const pitch = usable / n;
    const sd = tubeDef(app, lw, lh, 2, P, o.roofMat || mat);
    for (let i = 0; i <= n; i++) { const x = bw + i * pitch - lw / 2; addInst(D, sd, new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1)).setPosition(Math.min(Math.max(x, 0), L - lw) + lw, 0, H), o.roof === 'ventelles' ? 'Ventelle' : 'Chevron'); }
  } else if (o.roof === 'toile' || o.roof === 'polycarbonate') {
    const pd2 = plateDef(app, L, P, o.roof === 'toile' ? 2 : 16, o.roof === 'toile' ? 'mBlanc' : 'mVerre', o.roof === 'toile' ? 'Toile' : 'Polycarbonate');
    addInst(D, pd2, T(0, 0, H), 'Couverture');
  }
  D.touch(); app.model.defs.set(D.id, D); return D.id;
}

// ---------------------------------------------------------------- Portail
export function genPortail(app, o) {
  ensureLibMaterials(app);
  const { L, H, mat } = o; const f = o.frame, ft = o.frameT;
  const D = new G.Def(`Portail ${o.leaves === 2 ? '2 vantaux' : '1 vantail'} ${r1(L)}×${r1(H)}`, 'group');
  const leafW = o.leaves === 2 ? (L - o.gap) / 2 : L;
  const leaf = new G.Def(`Vantail ${r1(leafW)}×${r1(H)}`, 'group');
  const vert = (x) => new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(x + f, 0, 0);
  const sd = tubeDef(app, f, f, ft, H, mat); addInst(leaf, sd, vert(0), 'Montant'); addInst(leaf, sd, vert(leafW - f), 'Montant');
  const td = tubeDef(app, f, f, ft, leafW - 2 * f, mat); addInst(leaf, td, T(f, 0, 0), 'Traverse basse'); addInst(leaf, td, T(f, 0, H - f), 'Traverse haute');
  const innerH = H - 2 * f, innerW = leafW - 2 * f;
  if (o.fill === 'barreaux') {
    const b = o.bar; const nb = Math.max(1, Math.ceil((innerW - o.maxGap) / (o.maxGap + b))); const g = (innerW - nb * b) / (nb + 1);
    const bd = tubeDef(app, b, b, 1.5, innerH, mat);
    for (let k = 0; k < nb; k++) addInst(leaf, bd, new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(f + g + k * (g + b) + b, (f - b) / 2, f), 'Barreau');
  } else if (o.fill === 'lames') {
    const lh = o.bar; const n = Math.max(1, Math.floor(innerH / (lh + o.maxGap))); const g = (innerH - n * lh) / (n + 1);
    const ld = tubeDef(app, 20, lh, 1.5, innerW, mat);
    for (let k = 0; k < n; k++) addInst(leaf, ld, T(f, (f - 20) / 2, f + g + k * (g + lh)), 'Lame');
  } else {
    const pd = plateDef(app, innerW, innerH, 2, o.fill === 'corten' ? 'mCorten' : mat, 'Tôle');
    addInst(leaf, pd, new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)).setPosition(f, f / 2 + 1, f).multiply(T(0, 0, -2)), 'Remplissage');
  }
  leaf.touch(); app.model.defs.set(leaf.id, leaf);
  addInst(D, leaf.id, T(0, 0, o.ground), 'Vantail gauche');
  if (o.leaves === 2) addInst(D, leaf.id, T(leafW + o.gap, 0, o.ground), 'Vantail droit');
  if (o.pillars) { const pd = tubeDef(app, o.pillarW, o.pillarW, 4, H + o.ground + 100, mat); const v2 = (x) => new Matrix4().makeBasis(new Vector3(0, 0, 1), new Vector3(0, 1, 0), new Vector3(-1, 0, 0)).setPosition(x + o.pillarW, (f - o.pillarW) / 2, 0); addInst(D, pd, v2(-o.pillarW - 15), 'Pilier'); addInst(D, pd, v2(L + 15), 'Pilier'); }
  D.touch(); app.model.defs.set(D.id, D); return D.id;
}

// ---------------------------------------------------------------- Rapports
const DENSITY = [[/inox/i, 7900], [/alu/i, 2700], [/acier|corten|galva|fer|ipe|hea|upn|tube|cornière|plat|platine|tôle/i, 7850], [/chêne/i, 700], [/pin|bois|chevron|bastaing|lame/i, 480], [/béton|parpaing/i, 2300], [/brique/i, 1900], [/verre|vitrage/i, 2500], [/placo|plâtre/i, 800], [/polycarbonate/i, 1200]];
export function densityFor(name) { for (const [re, d] of DENSITY) if (re.test(name || '')) return d; return 0; }
function defVolume(app, D) {
  const tri = collectTriangles(app, D, new Matrix4(), null, new Map(), { hidden: true }); let v = 0;
  for (const arr of tri.values()) for (let i = 0; i < arr.length; i += 9) {
    const a = new Vector3(arr[i], arr[i + 1], arr[i + 2]), b = new Vector3(arr[i + 3], arr[i + 4], arr[i + 5]), c = new Vector3(arr[i + 6], arr[i + 7], arr[i + 8]);
    v += a.dot(new Vector3().crossVectors(b, c)) / 6;
  }
  return Math.abs(v);
}
function defMainMat(app, D) {
  const cnt = new Map(); for (const f of D.faces.values()) if (f.mat) cnt.set(f.mat, (cnt.get(f.mat) || 0) + 1);
  let best = null, n = 0; for (const [k, c] of cnt) if (c > n) { n = c; best = k; } return best;
}
export function cutList(app, rootDef = app.model.root, rootM = new Matrix4()) {
  const rows = new Map();
  const walk = (D, m, inhMat) => {
    for (const it of D.insts.values()) {
      if (it.hidden || !app.tagVisible(it.tag)) continue;
      const cd = app.model.defs.get(it.def); if (!cd) continue;
      const wm = m.clone().multiply(it.m); const mat = it.mat || inhMat;
      if (cd.faces.size) {
        const box = new THREE.Box3(); for (const v of cd.verts.values()) box.expandByPoint(v.p);
        const sx = new Vector3().setFromMatrixColumn(wm, 0).length(), sy = new Vector3().setFromMatrixColumn(wm, 1).length(), sz = new Vector3().setFromMatrixColumn(wm, 2).length();
        const sz3 = box.getSize(new Vector3()); const dims = [sz3.x * sx, sz3.y * sy, sz3.z * sz].sort((a, b) => b - a);
        const matId = defMainMat(app, cd) || mat; const md = matId ? app.model.materials.get(matId) : null;
        const vol = defVolume(app, cd) * sx * sy * sz;
        const key = cd.name.replace(/ L=\d+$/, '') + '|' + dims.map(r1).join('x') + '|' + (md?.name || '');
        let r = rows.get(key);
        if (!r) rows.set(key, (r = { name: cd.name.replace(/ L=\d+$/, ''), L: dims[0], dims, mat: md?.name || '—', qty: 0, vol, density: densityFor((md?.name || '') + ' ' + cd.name) }));
        r.qty++;
      }
      if (cd.insts.size) walk(cd, wm, mat);
    }
  };
  walk(rootDef, rootM, null);
  const out = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || b.L - a.L);
  for (const r of out) { r.unitKg = (r.vol / 1e9) * r.density; r.totKg = r.unitKg * r.qty; }
  return out;
}
export function areaReport(app) {
  const res = new Map();
  const walk = (D, m, inh) => {
    for (const f of D.faces.values()) {
      if (f.hidden) continue; const { tris } = G.triangulateFace(D, f); let a = 0;
      for (const t of tris) { const p = t.map((v) => D.verts.get(v).p.clone().applyMatrix4(m)); a += new Vector3().crossVectors(new Vector3().subVectors(p[1], p[0]), new Vector3().subVectors(p[2], p[0])).length() / 2; }
      const id = f.mat || inh; const name = id ? app.model.materials.get(id)?.name || id : 'Par défaut';
      res.set(name, (res.get(name) || 0) + a);
    }
    for (const it of D.insts.values()) { if (it.hidden || !app.tagVisible(it.tag)) continue; walk(app.model.defs.get(it.def), m.clone().multiply(it.m), it.mat || inh); }
  };
  walk(app.model.root, new Matrix4(), null);
  return [...res.entries()].map(([name, a]) => ({ name, m2: a / 1e6 })).sort((a, b) => b.m2 - a.m2);
}
export function cutListCSV(app, rows, areas) {
  const f = (x) => String(x).replace('.', ',');
  let s = 'Désignation;Longueur (mm);Section / dimensions (mm);Matière;Quantité;Longueur totale (m);Poids unitaire (kg);Poids total (kg)\n';
  for (const r of rows) s += `${r.name};${r1(r.L)};${r1(r.dims[1])}×${r1(r.dims[2])};${r.mat};${r.qty};${f((r.L * r.qty / 1000).toFixed(2))};${f(r.unitKg.toFixed(2))};${f(r.totKg.toFixed(2))}\n`;
  s += `;;;;;;Total;${f(rows.reduce((a, r) => a + r.totKg, 0).toFixed(2))}\n\nMatière;Surface (m²)\n`;
  for (const a of areas) s += `${a.name};${f(a.m2.toFixed(2))}\n`;
  return '﻿' + s;
}

// ------------------------------------------------------------- Adoucir par angle
export function softenByAngle(app, deg, onlySel) {
  const D = app.activeDef; const lim = Math.cos(deg * Math.PI / 180);
  let es = [...D.edges.values()];
  if (onlySel && app.sel.size) { const set = new Set(); for (const k of app.sel) { if (k[0] === 'e') set.add(+k.slice(2)); if (k[0] === 'f') G.edgesOfFace(D, D.faces.get(+k.slice(2))).forEach((e) => set.add(e)); } es = es.filter((e) => set.has(e.id)); }
  let n = 0;
  for (const e of es) {
    const fl = G.facesOfEdge(D, e); if (fl.length !== 2) continue;
    const a = G.faceNormal(D, D.faces.get(fl[0])), b = G.faceNormal(D, D.faces.get(fl[1]));
    const soft = a.dot(b) >= lim - 1e-9 && a.dot(b) < 1 - 1e-9; if (e.soft !== soft) { e.soft = soft; n++; }
  }
  D.touch(); return n;
}
export { fmtLen };
