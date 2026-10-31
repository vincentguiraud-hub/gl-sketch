// G&L Sketch — outils
import { THREE, G, AX, COLORS, fmtLen, parseLen, splitList, defToJSON, defFromJSON } from './app.js';
const { Vector3, Matrix4 } = THREE;

const AXCOL = { x: COLORS.x, y: COLORS.y, z: COLORS.z, par: COLORS.par };
const AXNAME = { x: "Sur l'axe rouge", y: "Sur l'axe vert", z: "Sur l'axe bleu", par: "Parallèle à l'arête" };

export class Tool {
  constructor(app, ui) { this.app = app; this.ui = ui; this.pv = new THREE.Group(); this.lock = null; this.shiftDir = null; }
  get D() { return this.app.activeDef; }
  activate() { this.app.overlay.add(this.pv); this.reset(); this.status(); }
  deactivate() { this.cancel(); this.app.overlay.remove(this.pv); this.ui.hideInf(); this.app.clearHover(); }
  reset() { }
  cancel() { this.clearPv(); this.reset(); this.status(); this.ui.hideInf(); }
  status() { this.ui.status(this.hint || ''); this.ui.vcb(this.vcbLabel || 'Mesures', ''); }
  clearPv() { this.pv.clear(); this.app.render(); }
  pvMat(color, dashed, width = 2) {
    const k = color + '|' + (dashed ? 1 : 0) + '|' + width; const cache = (this.app._pvMats ||= new Map());
    let m = cache.get(k); if (!m) { m = this.app.lineMat({ color: new THREE.Color(color).getHex(), width, dashed, dash: 8, gap: 6, depthTest: false, transparent: true }); m.worldUnits = false; cache.set(k, m); }
    return m;
  }
  line(a, b, color = '#000', dashed = false) {
    const m = this.pvMat(color, dashed, dashed ? 1.6 : 2.2);
    if (dashed) { const d = this.dashSize(a); m.dashSize = d; m.gapSize = d * 0.8; }
    const l = this.app.fatLine([a, b], m); l.renderOrder = 20; this.pv.add(l); return l;
  }
  poly(pts, color = '#000', closed = true) { const l = this.app.fatLine(closed ? [...pts, pts[0]] : pts, this.pvMat(color, false, 2)); l.renderOrder = 20; this.pv.add(l); return l; }
  dashSize(p) { return Math.max(p.distanceTo(this.app.camera.position) / 90, 2); }
  // inférence avec verrous (flèches, Maj)
  inf(e, o = {}) {
    const opts = { ...o };
    if (o.from && !o.plane) {
      if (this.lock) { opts.lockDir = this.lock === 'par' ? (this.app.hoverEdgeDir || AX.x) : AX[this.lock]; opts.lockColor = AXCOL[this.lock]; opts.lockLabel = AXNAME[this.lock]; }
      else if (this.shiftDir) { opts.lockDir = this.shiftDir.d; opts.lockColor = this.shiftDir.c; opts.lockLabel = 'Inférence verrouillée'; }
    }
    const r = this.app.infer(e.x, e.y, opts);
    this.lastInf = r;
    if (r) this.ui.showInf(r, e.x, e.y);
    if (r && r.from && (r.type === 'axis' || r.type === 'par' || r.type === 'lock' || r.type === 'track')) {
      const col = r.type === 'lock' ? r.color : AXCOL[r.axis] || COLORS.par;
      this.line(r.track || r.from, r.p, col, true);
    }
    return r;
  }
  key(e) {
    const k = e.key;
    if (k === 'ArrowRight') { this.lock = this.lock === 'x' ? null : 'x'; this.onLock(); return true; }
    if (k === 'ArrowLeft') { this.lock = this.lock === 'y' ? null : 'y'; this.onLock(); return true; }
    if (k === 'ArrowUp') { this.lock = this.lock === 'z' ? null : 'z'; this.onLock(); return true; }
    if (k === 'ArrowDown') { this.lock = this.lock === 'par' ? null : 'par'; this.onLock(); return true; }
    if (k === 'Shift' && !e.repeat && this.lastInf) {
      const r = this.lastInf;
      if (r.type === 'axis' || r.type === 'par') this.shiftDir = { d: (r.dir || AX[r.axis]).clone(), c: AXCOL[r.axis] || COLORS.par };
      else if (r.type === 'edge' && r.edge) this.shiftDir = { d: new Vector3().subVectors(r.edge.b, r.edge.a).normalize(), c: COLORS.par };
      return false;
    }
    return false;
  }
  keyup(e) { if (e.key === 'Shift') this.shiftDir = null; }
  onLock() { this.ui.toast(this.lock ? AXNAME[this.lock] + ' (verrouillé)' : 'Verrou désactivé'); if (this._lastE) this.move(this._lastE); }
  move() { }
  click() { }
  dbl() { }
  vcbInput() { }
  // aperçu "réel" : rejoue l'opération sur une copie de la définition active
  beginLive() { this.liveDef = this.D; this.liveSnap = defToJSON(this.D); this.liveDefs = new Set(this.app.model.defs.keys()); }
  liveApply(fn) {
    defFromJSON(this.liveSnap, this.liveDef);
    for (const k of [...this.app.model.defs.keys()]) if (!this.liveDefs.has(k)) this.app.model.defs.delete(k);
    try { fn(this.liveDef); } catch (err) { console.warn(err); }
    this.liveDef.touch(); this.app.refresh();
  }
  endLive() {
    if (!this.liveSnap) return;
    defFromJSON(this.liveSnap, this.liveDef);
    for (const k of [...this.app.model.defs.keys()]) if (!this.liveDefs.has(k)) this.app.model.defs.delete(k);
    this.liveSnap = null; this.liveDef.touch();
  }
  cancelLive() { if (this.liveSnap) { this.endLive(); this.app.refresh(); } }
  toLocal(p) { return this.app.toLocal(p); }
  camPosLocal() { return this.toLocal(this.app.camera.position); }
  vcbLen(s) { return parseLen(this.app.model, s); }
  fmt(v) { return fmtLen(this.app.model, v); }
}

// ------------------------------------------------------------------ Sélection
export class SelectTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'select'; this.hint = 'Cliquez pour sélectionner. Ctrl = ajouter, Maj = basculer. Double-clic : ouvrir un groupe. Glisser : fenêtre (→) ou capture (←).'; }
  reset() { this.down0 = null; this.ui.rubber(null); this.lastClick = { t: 0, key: null, n: 0 }; }
  pointerDown(e) { this.down0 = e; }
  pointerMove(e) {
    if (!this.down0) {
      const ent = this.app.pickEntity(e.x, e.y);
      this.app.clearHover();
      if (ent && ent.kind === 'f' && !this.app.sel.has(ent.key)) this.app.setHoverFace(this.D, ent.id, this.app.activeMatrix, 0x6aa0ff);
      return;
    }
    if (Math.hypot(e.x - this.down0.x, e.y - this.down0.y) > 4) this.ui.rubber({ x0: this.down0.x, y0: this.down0.y, x1: e.x, y1: e.y });
  }
  pointerUp(e) {
    const d0 = this.down0; this.down0 = null; this.ui.rubber(null);
    if (!d0) return;
    const app = this.app; const sel = app.sel;
    const mode = e.ctrl && e.shift ? 'sub' : e.ctrl ? 'add' : e.shift ? 'toggle' : 'set';
    if (Math.hypot(e.x - d0.x, e.y - d0.y) > 4) {
      const keys = this.rectSelect(Math.min(d0.x, e.x), Math.min(d0.y, e.y), Math.max(d0.x, e.x), Math.max(d0.y, e.y), e.x < d0.x);
      this.apply(keys, mode); return;
    }
    const ent = app.pickEntity(e.x, e.y);
    const now = performance.now();
    const same = ent && !ent.outside && this.lastClick.key === ent.key && now - this.lastClick.t < 400;
    this.lastClick = { t: now, key: ent?.key, n: same ? this.lastClick.n + 1 : 1 };
    if (!ent || ent.outside) {
      if (mode === 'set') { if (sel.size) sel.clear(); else if (ent?.outside || !ent) app.exitContext(); }
      app.refreshSelection(); return;
    }
    const n = this.lastClick.n;
    if (n === 2) {
      if (ent.kind === 'i') { app.enterInstance(ent.id); return; }
      const D = this.D; const keys = [ent.key];
      if (ent.kind === 'f') for (const eid of G.edgesOfFace(D, D.faces.get(ent.id))) keys.push('e:' + eid);
      if (ent.kind === 'e') { const ed = D.edges.get(ent.id); for (const fid of G.facesOfEdge(D, ed)) keys.push('f:' + fid); }
      this.apply(keys, mode === 'set' ? 'set' : 'add'); return;
    }
    if (n >= 3) { this.apply(this.connected(ent), mode === 'set' ? 'set' : 'add'); return; }
    let keys = [ent.key];
    if (ent.kind === 'e') { const ed = this.D.edges.get(ent.id); if (ed?.curve) keys = [...this.D.edges.values()].filter((x) => x.curve === ed.curve).map((x) => 'e:' + x.id); }
    this.apply(keys, mode);
  }
  apply(keys, mode) {
    const sel = this.app.sel;
    if (mode === 'set') { sel.clear(); keys.forEach((k) => sel.add(k)); }
    else if (mode === 'add') keys.forEach((k) => sel.add(k));
    else if (mode === 'sub') keys.forEach((k) => sel.delete(k));
    else { const allIn = keys.every((k) => sel.has(k)); keys.forEach((k) => (allIn ? sel.delete(k) : sel.add(k))); }
    this.app.refreshSelection();
  }
  connected(ent) {
    const D = this.D; if (ent.kind === 'i') return [ent.key];
    const vs = new Set();
    if (ent.kind === 'f') G.vertsOfFace(D.faces.get(ent.id)).forEach((v) => vs.add(v)); else { const e = D.edges.get(ent.id); vs.add(e.a); vs.add(e.b); }
    let grow = true;
    while (grow) { grow = false; for (const e of D.edges.values()) { const ia = vs.has(e.a), ib = vs.has(e.b); if (ia !== ib) { vs.add(e.a); vs.add(e.b); grow = true; } } }
    const keys = [];
    for (const e of D.edges.values()) if (vs.has(e.a)) keys.push('e:' + e.id);
    for (const f of D.faces.values()) if (vs.has(f.loops[0][0])) keys.push('f:' + f.id);
    return keys;
  }
  rectSelect(x0, y0, x1, y1, crossing) {
    const app = this.app, D = this.D, m = app.activeMatrix; const out = [];
    const inR = (s) => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && s.z < 1;
    const sp = new Map(); const S = (vid) => { let s = sp.get(vid); if (!s) { s = app.project(D.verts.get(vid).p.clone().applyMatrix4(m)); sp.set(vid, s); } return s; };
    const segHits = (a, b) => inR(a) || inR(b) || segRect(a, b, x0, y0, x1, y1);
    for (const e of D.edges.values()) {
      if (e.hidden && !app.model.style.hiddenGeom) continue;
      const a = S(e.a), b = S(e.b);
      if (crossing ? segHits(a, b) : inR(a) && inR(b)) out.push('e:' + e.id);
    }
    for (const f of D.faces.values()) {
      const vs = [...G.vertsOfFace(f)];
      if (crossing) {
        let hit = vs.some((v) => inR(S(v)));
        if (!hit) for (const l of f.loops) for (let i = 0; i < l.length && !hit; i++) hit = segRect(S(l[i]), S(l[(i + 1) % l.length]), x0, y0, x1, y1);
        if (hit) out.push('f:' + f.id);
      } else if (vs.every((v) => inR(S(v)))) out.push('f:' + f.id);
    }
    for (const it of D.insts.values()) {
      if (it.hidden) continue;
      const { box, m: mm } = app.instBox([...app.activePath, it.id]);
      const cs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => app.project(new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(mm)));
      if (crossing) { const bx0 = Math.min(...cs.map((c) => c.x)), bx1 = Math.max(...cs.map((c) => c.x)), by0 = Math.min(...cs.map((c) => c.y)), by1 = Math.max(...cs.map((c) => c.y)); if (bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1) out.push('i:' + it.id); }
      else if (cs.every(inR)) out.push('i:' + it.id);
    }
    return out;
  }
}
function segRect(a, b, x0, y0, x1, y1) {
  const L = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
  for (const [cx, cy, dx, dy] of L) if (segSeg2(a.x, a.y, b.x, b.y, cx, cy, dx, dy)) return true;
  return false;
}
function segSeg2(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (!d) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// ------------------------------------------------------------------ Ligne
export class LineTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'line'; this.vcbLabel = 'Longueur'; }
  get hint() { return this.start ? "Cliquez le point suivant ou tapez une longueur. Flèches = verrouiller un axe, Maj = verrouiller l'inférence, Échap = terminer." : 'Cliquez le point de départ de la ligne.'; }
  reset() { this.start = null; this.cur = null; this.lock = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    const r = this.inf(e, { from: this.start });
    if (!r) return;
    this.cur = r.p;
    if (this.start) {
      const col = r.type === 'axis' || r.type === 'par' ? AXCOL[r.axis] : r.type === 'lock' ? r.color : '#000';
      this.line(this.start, r.p, col, false, false);
      this.ui.vcb('Longueur', this.fmt(this.start.distanceTo(r.p)));
    }
  }
  click(e) {
    const r = this.inf(e, { from: this.start }); if (!r) return;
    this.addPoint(r.p);
  }
  addPoint(p) {
    if (!this.start) { this.start = p.clone(); this.status(); return; }
    if (p.distanceTo(this.start) < G.TOL) return;
    const a = this.toLocal(this.start), b = this.toLocal(p); const cam = this.camPosLocal();
    const res = this.app.commit('Ligne', () => { const ed = G.addSegment(this.D, a, b); return G.autoFace(this.D, ed, { camPos: cam, defaultMat: null }); });
    this.start = p.clone(); this.lock = null;
    if (res && res.length) { this.start = null; }
    this.clearPv(); this.status();
  }
  vcbInput(s) {
    if (!this.start) return;
    const abs = s.match(/^\[(.*)\]$/), rel = s.match(/^<(.*)>$/);
    if (abs || rel) {
      const v = splitList((abs || rel)[1].replace(/;/g, ';')).map((t) => this.vcbLen(t)); if (v.length !== 3 || v.some((x) => x == null)) return;
      const p = new Vector3(...v); this.addPoint(abs ? p : this.start.clone().add(p)); return;
    }
    const L = this.vcbLen(s); if (L == null || !this.cur) return;
    const d = new Vector3().subVectors(this.cur, this.start); if (d.lengthSq() < 1e-9) return;
    this.addPoint(this.start.clone().addScaledVector(d.normalize(), L));
  }
  key(e) { if (e.key === 'Escape') { this.cancel(); return true; } return super.key(e); }
}

// ----------------------------------------------- Outils de forme (plan de dessin)
function planeAxes(n) {
  n = n.clone().normalize();
  if (Math.abs(n.z) > 0.999) return { u: new Vector3(1, 0, 0), v: new Vector3(0, n.z > 0 ? 1 : -1, 0).multiplyScalar(n.z > 0 ? 1 : 1).set(0, 1, 0) };
  if (Math.abs(n.z) < 1e-6) { const u = new Vector3().crossVectors(AX.z, n).normalize(); return { u, v: AX.z.clone() }; }
  const u = new Vector3().crossVectors(AX.z, n).normalize(); const v = new Vector3().crossVectors(n, u).normalize(); return { u, v };
}
class ShapeTool extends Tool {
  reset() { this.start = null; this.plane = null; this.lockPlane = null; }
  key(e) {
    if (e.key === 'Escape') { this.cancel(); return true; }
    const map = { ArrowUp: AX.z, ArrowRight: AX.x, ArrowLeft: AX.y };
    if (map[e.key]) { this.lockPlane = this.lockPlane === map[e.key] ? null : map[e.key]; this.ui.toast(this.lockPlane ? 'Plan verrouillé : ' + (e.key === 'ArrowUp' ? 'horizontal (bleu)' : e.key === 'ArrowRight' ? 'rouge' : 'vert') : 'Plan libre'); if (this._lastE) this.move(this._lastE); return true; }
    return false;
  }
  pickPlane(r) {
    if (this.lockPlane) return this.lockPlane.clone();
    if (r.type === 'face' && r.face) return r.face.normal.clone();
    if ((r.type === 'end' || r.type === 'mid' || r.type === 'edge')) { const f = this.app.pickFace(this._lastE.x, this._lastE.y, true); if (f && Math.abs(f.normal.dot(new Vector3().subVectors(r.p, f.point))) < 1) return f.normal.clone(); }
    return AX.z.clone();
  }
}

export class RectTool extends ShapeTool {
  constructor(a, u) { super(a, u); this.name = 'rect'; this.vcbLabel = 'Dimensions'; }
  get hint() { return this.start ? 'Cliquez le coin opposé ou tapez largeur;longueur (ex : 3000;2000).' : 'Cliquez le premier coin. Flèches : verrouiller le plan (↑ horizontal, → rouge, ← vert).'; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.start) {
      const r = this.inf(e, {}); if (!r) return;
      const n = this.pickPlane(r); const { u, v } = planeAxes(n); const s = this.dashSize(r.p) * 6;
      this.poly([r.p, r.p.clone().addScaledVector(u, s), r.p.clone().addScaledVector(u, s).addScaledVector(v, s), r.p.clone().addScaledVector(v, s)], '#2453e0');
      return;
    }
    const r = this.inf(e, { from: this.start, plane: { n: this.plane, p: this.start } }); if (!r) return;
    this.cur = r.p; this.drawRect(this.dims(r.p));
  }
  dims(p) { const d = new Vector3().subVectors(p, this.start); let w = d.dot(this.u), h = d.dot(this.v); if (Math.abs(Math.abs(w) - Math.abs(h)) < Math.max(Math.abs(w), Math.abs(h)) * 0.012 && Math.abs(w) > 1) { h = Math.sign(h || 1) * Math.abs(w); this.square = true; } else this.square = false; return [w, h]; }
  corners([w, h]) { const s = this.start; return [s.clone(), s.clone().addScaledVector(this.u, w), s.clone().addScaledVector(this.u, w).addScaledVector(this.v, h), s.clone().addScaledVector(this.v, h)]; }
  drawRect(wh) {
    const c = this.corners(wh); this.poly(c, '#111');
    if (this.square) { this.line(c[0], c[2], COLORS.par, true); this.ui.tip('Carré', null); }
    this.ui.vcb('Dimensions', this.fmt(Math.abs(wh[0])).replace(/ \w+$/, '') + '; ' + this.fmt(Math.abs(wh[1])));
  }
  click(e) {
    if (!this.start) {
      const r = this.inf(e, {}); if (!r) return;
      this.start = r.p.clone(); this.plane = this.pickPlane(r); ({ u: this.u, v: this.v } = planeAxes(this.plane)); this.status(); return;
    }
    const r = this.inf(e, { from: this.start, plane: { n: this.plane, p: this.start } }); if (!r) return;
    this.make(this.dims(r.p));
  }
  make(wh) {
    if (Math.abs(wh[0]) < G.TOL || Math.abs(wh[1]) < G.TOL) return;
    const pts = this.corners(wh).map((p) => this.toLocal(p)); const cam = this.camPosLocal();
    this.app.commit('Rectangle', () => G.drawPolyline(this.D, pts, true, { camPos: cam, defaultMat: null }));
    this.cancel();
  }
  vcbInput(s) {
    if (!this.start) return;
    const v = s.split(/[;]/).map((t) => this.vcbLen(t)); if (v.length !== 2 || v.some((x) => x == null)) return;
    const cur = this.cur ? this.dims(this.cur) : [1, 1];
    this.make([v[0] * (Math.sign(cur[0]) || 1), v[1] * (Math.sign(cur[1]) || 1)]);
  }
}

export class CircleTool extends ShapeTool {
  constructor(a, u, sides = 0) { super(a, u); this.polygon = !!sides; this.name = sides ? 'polygon' : 'circle'; this.segs = sides || 24; this.vcbLabel = 'Rayon'; }
  get hint() { return this.start ? `Cliquez pour fixer le rayon ou tapez-le. « ${this.segs}c » pour changer le nombre de ${this.polygon ? 'côtés' : 'segments'}.` : `Cliquez le centre du ${this.polygon ? 'polygone' : 'cercle'}. Tapez « 36c » pour les ${this.polygon ? 'côtés' : 'segments'}.`; }
  status() { this.ui.status(this.hint); this.ui.vcb(this.start ? 'Rayon' : this.polygon ? 'Côtés' : 'Côtés', this.start ? '' : String(this.segs)); }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.start) { const r = this.inf(e, {}); if (!r) return; const n = this.pickPlane(r); this.drawCircle(r.p, n, null, this.dashSize(r.p) * 4, '#2453e0'); return; }
    const r = this.inf(e, { from: this.start, plane: { n: this.plane, p: this.start } }); if (!r) return;
    this.cur = r.p; const rad = this.start.distanceTo(r.p);
    this.drawCircle(this.start, this.plane, r.p, rad, '#111'); this.line(this.start, r.p, '#555', true);
    this.ui.vcb('Rayon', this.fmt(rad));
  }
  pts(c, n, through, rad) {
    const { u, v } = planeAxes(n); let d0 = u;
    if (through && through.distanceTo(c) > 1e-6) d0 = new Vector3().subVectors(through, c).normalize();
    const d1 = new Vector3().crossVectors(n.clone().normalize(), d0).normalize(); void v;
    const out = []; const N = this.segs;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; out.push(c.clone().addScaledVector(d0, Math.cos(a) * rad).addScaledVector(d1, Math.sin(a) * rad)); }
    return out;
  }
  drawCircle(c, n, thr, rad, col) { this.poly(this.pts(c, n, thr, rad), col); }
  click(e) {
    if (!this.start) { const r = this.inf(e, {}); if (!r) return; this.start = r.p.clone(); this.plane = this.pickPlane(r); this.status(); return; }
    const r = this.inf(e, { from: this.start, plane: { n: this.plane, p: this.start } }); if (!r) return;
    this.make(this.start.distanceTo(r.p), r.p);
  }
  make(rad, thr) {
    if (rad < G.TOL) return;
    const pts = this.pts(this.start, this.plane, thr, rad).map((p) => this.toLocal(p)); const cam = this.camPosLocal();
    const curve = this.polygon ? 0 : G.nid();
    this.app.commit(this.polygon ? 'Polygone' : 'Cercle', () => {
      const D = this.D; const edges = [];
      for (let i = 0; i < pts.length; i++) edges.push(...G.addSegment(D, pts[i], pts[(i + 1) % pts.length], curve ? { curve } : null));
      return G.autoFace(D, edges, { camPos: cam });
    });
    this.cancel();
  }
  vcbInput(s) {
    const m = s.trim().match(/^(\d+)\s*[cs]$/i);
    if (m) { this.segs = Math.max(3, Math.min(720, +m[1])); this.ui.toast((this.polygon ? 'Côtés : ' : 'Segments : ') + this.segs); this.status(); return; }
    if (!this.start) { const n = parseInt(s); if (n >= 3) { this.segs = n; this.status(); } return; }
    const r = this.vcbLen(s); if (r != null) this.make(r, this.cur);
  }
}

export class ArcTool extends ShapeTool {
  constructor(a, u) { super(a, u); this.name = 'arc'; this.segs = 12; this.vcbLabel = 'Longueur'; }
  get hint() { return !this.start ? "Cliquez le point de départ de l'arc." : !this.end ? "Cliquez le point d'arrivée ou tapez la longueur de corde." : 'Déplacez pour définir la flèche (renflement), cliquez ou tapez-la. « 24c » = segments.'; }
  reset() { super.reset(); this.end = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.start) { this.inf(e, {}); return; }
    if (!this.end) { const r = this.inf(e, { from: this.start }); if (!r) return; this.cur = r.p; this.line(this.start, r.p, '#111'); this.ui.vcb('Longueur', this.fmt(this.start.distanceTo(r.p))); return; }
    const r = this.inf(e, { plane: { n: this.plane, p: this.start } }); if (!r) return;
    const b = this.bulge(r.p); this.cur = b; this.poly(this.arcPts(b), '#111', false); this.ui.vcb('Flèche', this.fmt(Math.abs(b)));
  }
  bulge(p) {
    const mid = this.start.clone().lerp(this.end, 0.5); const perp = this.perp();
    let b = new Vector3().subVectors(p, mid).dot(perp); const half = this.start.distanceTo(this.end) / 2;
    if (Math.abs(Math.abs(b) - half) < half * 0.04) { b = Math.sign(b) * half; this.ui.tip('Demi-cercle', null); }
    return b;
  }
  perp() { const c = new Vector3().subVectors(this.end, this.start).normalize(); return new Vector3().crossVectors(this.plane, c).normalize(); }
  arcPts(b) {
    const c2 = this.start.distanceTo(this.end) / 2; if (Math.abs(b) < 1e-6) return [this.start, this.end];
    const R = (c2 * c2 + b * b) / (2 * Math.abs(b)); const mid = this.start.clone().lerp(this.end, 0.5); const perp = this.perp().multiplyScalar(Math.sign(b));
    const center = mid.clone().addScaledVector(perp, Math.abs(b) - R);
    const a0 = new Vector3().subVectors(this.start, center), a1 = new Vector3().subVectors(this.end, center);
    const n = new Vector3().crossVectors(a0, a1); const big = Math.abs(b) > c2;
    let ang = a0.angleTo(a1); if (big) ang = Math.PI * 2 - ang;
    let axis = n.lengthSq() > 1e-12 ? n.normalize() : this.plane.clone();
    // la flèche doit passer par le point de renflement
    const testDir = a0.clone().applyAxisAngle(axis, ang / 2); const apex = center.clone().add(testDir);
    if (apex.distanceTo(mid.clone().addScaledVector(perp, Math.abs(b))) > R * 0.01 + 1) axis = axis.negate();
    const N = Math.max(2, Math.round(this.segs * ang / Math.PI)); const out = [];
    for (let i = 0; i <= N; i++) out.push(center.clone().add(a0.clone().applyAxisAngle(axis, (ang * i) / N)));
    out[out.length - 1] = this.end.clone();
    return out;
  }
  setEnd(p) {
    this.end = p.clone();
    const c = new Vector3().subVectors(this.end, this.start).normalize();
    if (Math.abs(c.dot(this.plane)) > 0.99) this.plane = Math.abs(c.z) > 0.9 ? new Vector3().crossVectors(c, this.app.camera.position.clone().sub(this.start)).cross(c).normalize() : AX.z.clone();
    else this.plane = this.plane.clone().addScaledVector(c, -c.dot(this.plane)).normalize();
    this.status();
  }
  click(e) {
    if (!this.start) { const r = this.inf(e, {}); if (!r) return; this.start = r.p.clone(); this.plane = this.pickPlane(r); this.status(); return; }
    if (!this.end) { const r = this.inf(e, { from: this.start }); if (!r || r.p.distanceTo(this.start) < G.TOL) return; this.setEnd(r.p); return; }
    const r = this.inf(e, { plane: { n: this.plane, p: this.start } }); if (!r) return;
    this.make(this.bulge(r.p));
  }
  make(b) {
    const pts = this.arcPts(b).map((p) => this.toLocal(p)); const curve = G.nid(); const cam = this.camPosLocal();
    this.app.commit('Arc', () => { const D = this.D; const ed = []; for (let i = 0; i + 1 < pts.length; i++) ed.push(...G.addSegment(D, pts[i], pts[i + 1], { curve })); return G.autoFace(D, ed, { camPos: cam }); });
    this.cancel();
  }
  vcbInput(s) {
    const m = s.trim().match(/^(\d+)\s*[cs]$/i); if (m) { this.segs = Math.max(2, +m[1]); this.status(); return; }
    const v = this.vcbLen(s); if (v == null) return;
    if (this.start && !this.end && this.cur) { const d = new Vector3().subVectors(this.cur, this.start).normalize(); this.setEnd(this.start.clone().addScaledVector(d, v)); return; }
    if (this.end) this.make(v * (Math.sign(this.cur) || 1));
  }
}

// ------------------------------------------------------------- Pousser / tirer
export class PushPullTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'pushpull'; this.vcbLabel = 'Distance'; this.last = null; }
  get hint() { return this.face ? 'Déplacez puis cliquez, ou tapez une distance. Ctrl = créer une nouvelle face de départ.' : 'Cliquez sur une face à pousser ou tirer. Double-clic = répéter la dernière distance.'; }
  reset() { this.face = null; this.app.clearHover(); }
  hoverFace(e) {
    const f = this.app.pickFace(e.x, e.y);
    if (f && f.path.length === this.app.activePath.length && f.path.every((x, i) => x === this.app.activePath[i])) return f;
    return null;
  }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.face) {
      const f = this.hoverFace(e);
      if (f) this.app.setHoverFace(this.D, f.fid, this.app.activeMatrix); else this.app.clearHover();
      this.ui.showInf(f ? { type: 'face', p: f.point } : null, e.x, e.y);
      return;
    }
    const r = this.inf(e, { from: this.startP, lockDir: this.nW, lockLabel: '', skip: (x) => x.inCtx && this.faceVerts.has(x.vid) });
    if (!r) return;
    let d = new Vector3().subVectors(r.p, this.startP).dot(this.nW);
    this.dist = d;
    this.liveApply((D) => G.pushPull(D, this.face, d / this.scale, { copy: e.ctrl || this.copy }));
    this.ui.vcb('Distance', this.fmt(Math.abs(d)));
  }
  click(e) {
    if (!this.face) {
      const f = this.hoverFace(e); if (!f) return;
      this.face = f.fid; this.startP = f.point.clone();
      const D = this.D; this.faceVerts = G.vertsOfFace(D.faces.get(f.fid));
      this.nW = f.normal.clone().normalize(); if (f.back) { /* face vue de dos : on garde la normale de face */ }
      const m = this.app.activeMatrix; this.scale = new Vector3().setFromMatrixScale(m).x || 1;
      this.copy = e.ctrl; this.dist = 0; this.app.clearHover(); this.beginLive(); this.status(); return;
    }
    if (Math.abs(this.dist) < G.TOL) return;
    this.finish(this.dist, e.ctrl || this.copy);
  }
  finish(d, copy) {
    const fid = this.face; this.endLive();
    this.app.commit('Pousser/tirer', () => G.pushPull(this.D, fid, d / this.scale, { copy }));
    this.last = { d, fid, copy, at: Date.now() }; this.face = null; this.clearPv(); this.status(); this.ui.hideInf();
  }
  dbl(e) {
    if (!this.last) return;
    // le 1er clic du double-clic a démarré une opération : on l'annule puis on répète
    if (this.face) { if (Math.abs(this.dist || 0) > G.TOL) return; this.cancelLive(); this.face = null; this.clearPv(); }
    const f = this.hoverFace(e); if (!f) return;
    const m = this.app.activeMatrix; this.scale = new Vector3().setFromMatrixScale(m).x || 1;
    this.app.commit('Pousser/tirer', () => G.pushPull(this.D, f.fid, this.last.d / this.scale, { copy: e.ctrl }));
  }
  vcbInput(s) {
    const v = this.vcbLen(s); if (v == null) return;
    if (this.face) { this.finish(v * (Math.sign(this.dist) || 1), this.copy); return; }
    if (this.last && this.app.undoStack.length) {
      const d = v * Math.sign(this.last.d || 1); const fid = this.last.fid; const cp = this.last.copy;
      this.app.undo();
      if (this.D.faces.has(fid)) { this.app.commit('Pousser/tirer', () => G.pushPull(this.D, fid, d / (this.scale || 1), { copy: cp })); this.last.d = d; }
    }
  }
  key(e) { if (e.key === 'Escape') { this.cancelLive(); this.cancel(); return true; } if (e.key === 'Control' && this.face) { this.copy = !this.copy; this.ui.toast(this.copy ? 'Mode « nouvelle face » activé' : 'Mode « nouvelle face » désactivé'); return true; } return super.key(e); }
  deactivate() { this.cancelLive(); super.deactivate(); }
}

// ------------------------------------------------- Transformations (Déplacer etc.)
function selectionParts(app) {
  const D = app.activeDef; const verts = new Set(); const insts = [];
  for (const k of app.sel) {
    const t = k[0], id = +k.slice(2);
    if (t === 'f') { const f = D.faces.get(id); if (f) G.vertsOfFace(f).forEach((v) => verts.add(v)); }
    else if (t === 'e') { const e = D.edges.get(id); if (e) { verts.add(e.a); verts.add(e.b); } }
    else if (t === 'i' && D.insts.has(id)) insts.push(id);
  }
  return { verts, insts };
}
function applyTransform(app, D, parts, m) {
  if (parts.verts.size) G.transformVerts(D, [...parts.verts], m);
  for (const iid of parts.insts) { const it = D.insts.get(iid); if (it) it.m.premultiply(m); }
  D.touch();
}
// copie de la sélection dans la même définition, transformée par m
function copySelection(app, D, m, keys) {
  const fids = [], eids = [], newKeys = [];
  for (const k of keys) { const t = k[0], id = +k.slice(2); if (t === 'f') fids.push(id); else if (t === 'e') eids.push(id); }
  const res = G.copyGeometry(D, D, fids, eids, m);
  res.faces.forEach((id) => newKeys.push('f:' + id)); res.edges.forEach((id) => newKeys.push('e:' + id));
  for (const k of keys) {
    if (k[0] !== 'i') continue; const it = D.insts.get(+k.slice(2)); if (!it) continue;
    let defId = it.def; const def = app.model.defs.get(defId);
    if (def.kind === 'group') { defId = app.cloneDefDeep(defId); }
    const id = G.nid(); D.insts.set(id, { ...it, id, def: defId, m: it.m.clone().premultiply(m) }); newKeys.push('i:' + id);
  }
  // les copies de géométrie forment des faces avec les arêtes existantes
  D.touch();
  return newKeys;
}

export class MoveTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'move'; this.vcbLabel = 'Distance'; }
  get hint() { return this.base ? "Cliquez la destination ou tapez une distance. Ctrl = copier. Après une copie : « x5 » (réseau) ou « /5 » (répartir)." : 'Cliquez un point de base. Ctrl = copier.'; }
  reset() { this.base = null; this.lastOp = null; this.autoSel = null; this.lock = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.base) {
      if (!this.app.sel.size || this.autoSel) {
        const ent = this.app.pickEntity(e.x, e.y);
        const k = ent && !ent.outside ? ent.key : null;
        if (k !== this.autoSel) { this.app.sel.clear(); if (k) this.app.sel.add(k); this.autoSel = k; this.app.refreshSelection(); }
      }
      this.inf(e, {}); return;
    }
    const r = this.inf(e, { from: this.base, skip: (x) => x.inCtx && this.parts.verts.has(x.vid) });
    if (!r) return;
    this.cur = r.p; this.line(this.base, r.p, '#333', true);
    this.ui.vcb('Distance', this.fmt(this.base.distanceTo(r.p)));
    this.preview(r.p);
  }
  localDelta(p) { return new Vector3().subVectors(this.toLocal(p), this.toLocal(this.base)); }
  preview(p) {
    const m = new Matrix4().makeTranslation(this.localDelta(p));
    this.liveApply((D) => { if (this.copy) copySelection(this.app, D, m, this.keys); else applyTransform(this.app, D, this.parts, m); });
  }
  click(e) {
    if (!this.base) {
      if (!this.app.sel.size) return;
      const r = this.inf(e, {}); if (!r) return;
      this.base = r.p.clone(); this.autoSel = null; this.parts = selectionParts(this.app); this.keys = [...this.app.sel]; this.copy = e.ctrl || !!this.copyPending; this.copyPending = false;
      this.beginLive(); this.status(); return;
    }
    const r = this.inf(e, { from: this.base, skip: (x) => x.inCtx && this.parts.verts.has(x.vid) }); if (!r) return;
    this.finish(r.p);
  }
  finish(p) {
    const delta = this.localDelta(p); this.endLive();
    const keys = this.keys, parts = this.parts, copy = this.copy;
    const nk = this.app.commit(copy ? 'Copier' : 'Déplacer', () => {
      const m = new Matrix4().makeTranslation(delta);
      if (copy) return copySelection(this.app, this.D, m, keys);
      applyTransform(this.app, this.D, parts, m); return null;
    });
    if (copy && nk) { this.app.sel.clear(); nk.forEach((k) => this.app.sel.add(k)); this.app.refreshSelection(); }
    this.lastOp = { delta, keys, copy, newKeys: nk }; this.base = null; this.clearPv(); this.status();
  }
  vcbInput(s) {
    s = s.trim();
    const arr = s.match(/^(?:[x*×](\d+)|(\d+)[x*×])$/i), div = s.match(/^\/(\d+)$/);
    if ((arr || div) && this.lastOp?.copy) {
      const n = +(arr ? arr[1] || arr[2] : div[1]); const lo = this.lastOp; this.app.undo();
      this.app.commit('Réseau', () => { const out = []; for (let i = 1; i <= n; i++) { const d = lo.delta.clone().multiplyScalar(div ? i / n : i); out.push(...copySelection(this.app, this.D, new Matrix4().makeTranslation(d), lo.keys)); } return out; });
      return;
    }
    const rel = s.match(/^<(.*)>$/);
    if (rel && this.base) { const v = rel[1].split(';').map((t) => this.vcbLen(t)); if (v.length === 3 && v.every((x) => x != null)) this.finish(this.base.clone().add(new Vector3(...v))); return; }
    const L = this.vcbLen(s); if (L == null) return;
    if (this.base && this.cur) { const d = new Vector3().subVectors(this.cur, this.base); if (d.lengthSq() < 1e-9) return; this.finish(this.base.clone().addScaledVector(d.normalize(), L)); return; }
    if (this.lastOp && !this.base) {
      const lo = this.lastOp; const dir = lo.delta.clone().normalize(); this.app.undo();
      const delta = dir.multiplyScalar(L);
      this.app.commit(lo.copy ? 'Copier' : 'Déplacer', () => { const m = new Matrix4().makeTranslation(delta); if (lo.copy) return copySelection(this.app, this.D, m, lo.keys); applyTransform(this.app, this.D, selectionPartsFromKeys(this.D, lo.keys), m); });
      lo.delta = delta;
    }
  }
  key(e) { if (e.key === 'Escape') { this.cancelLive(); this.cancel(); return true; } if (e.key === 'Control' && !e.repeat) { if (this.base) { this.copy = !this.copy; if (this.cur) this.preview(this.cur); } else this.copyPending = !this.copyPending; this.ui.toast((this.base ? this.copy : this.copyPending) ? 'Copie activée (+)' : 'Copie désactivée'); return true; } return super.key(e); }
  deactivate() { this.cancelLive(); super.deactivate(); }
}
function selectionPartsFromKeys(D, keys) {
  const verts = new Set(), insts = [];
  for (const k of keys) { const t = k[0], id = +k.slice(2); if (t === 'f') { const f = D.faces.get(id); if (f) G.vertsOfFace(f).forEach((v) => verts.add(v)); } else if (t === 'e') { const e = D.edges.get(id); if (e) { verts.add(e.a); verts.add(e.b); } } else if (t === 'i') insts.push(id); }
  return { verts, insts };
}

export class RotateTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'rotate'; this.vcbLabel = 'Angle'; }
  get hint() { return !this.center ? 'Cliquez le centre de rotation (le rapporteur suit les faces ; flèches = verrouiller l\'axe). Ctrl = copier.' : !this.ref ? 'Cliquez le point de départ de l\'angle.' : 'Cliquez ou tapez l\'angle (degrés). Après copie : « x5 ».'; }
  reset() { this.center = null; this.ref = null; this.normal = null; this.lockN = null; }
  key(e) {
    const map = { ArrowUp: AX.z, ArrowRight: AX.x, ArrowLeft: AX.y };
    if (map[e.key] && !this.center) { this.lockN = this.lockN === map[e.key] ? null : map[e.key]; this.ui.toast(this.lockN ? 'Axe de rotation verrouillé' : 'Axe libre'); return true; }
    if (e.key === 'Escape') { this.cancelLive(); this.cancel(); return true; }
    if (e.key === 'Control' && !e.repeat) { if (this.ref) this.copy = !this.copy; else this.copyPending = !this.copyPending; this.ui.toast((this.ref ? this.copy : this.copyPending) ? 'Copie activée (+)' : 'Copie désactivée'); return true; }
    return super.key(e);
  }
  protractor(c, n, col) {
    const { u, v } = planeAxes(n); const R = this.dashSize(c) * 9; const pts = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R)); }
    this.poly(pts, col, false);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const d = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)); this.line(c.clone().addScaledVector(d, R * (i % 6 ? 0.9 : 0.8)), c.clone().addScaledVector(d, R), col); }
    return R;
  }
  axisCol(n) { return Math.abs(n.z) > 0.99 ? COLORS.z : Math.abs(n.x) > 0.99 ? COLORS.x : Math.abs(n.y) > 0.99 ? COLORS.y : '#222'; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.center) {
      if (!this.app.sel.size) { const ent = this.app.pickEntity(e.x, e.y); if (ent && !ent.outside && ent.key !== this.autoSel) { this.app.sel.clear(); this.app.sel.add(ent.key); this.autoSel = ent.key; this.app.refreshSelection(); } }
      const r = this.inf(e, {}); if (!r) return;
      const n = this.lockN || (r.type === 'face' ? r.face.normal : AX.z); this.protractor(r.p, n, this.axisCol(n)); return;
    }
    this.protractor(this.center, this.normal, this.axisCol(this.normal));
    if (!this.ref) { const r = this.inf(e, { from: this.center, plane: { n: this.normal, p: this.center } }); if (r) this.line(this.center, r.p, '#333', true); return; }
    const r = this.inf(e, { plane: { n: this.normal, p: this.center } }); if (!r) return;
    const a = this.angleTo(r.p); this.ang = a;
    this.line(this.center, this.ref, '#333', true); this.line(this.center, r.p, '#333', true);
    this.ui.vcb('Angle', (a * 180 / Math.PI).toFixed(1).replace('.', ',') + '°');
    this.preview(a);
  }
  angleTo(p) {
    const r0 = new Vector3().subVectors(this.ref, this.center).normalize(); const r1 = new Vector3().subVectors(p, this.center); r1.addScaledVector(this.normal, -r1.dot(this.normal)).normalize();
    let a = Math.atan2(new Vector3().crossVectors(r0, r1).dot(this.normal), r0.dot(r1));
    const deg = a * 180 / Math.PI; const snap = Math.round(deg / 15) * 15; if (Math.abs(deg - snap) < 2) a = snap * Math.PI / 180;
    return a;
  }
  matrix(a) {
    const c = this.toLocal(this.center); const n = this.app.dirToLocal(this.normal);
    return new Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new Matrix4().makeRotationAxis(n, a)).multiply(new Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  }
  preview(a) { const m = this.matrix(a); this.liveApply((D) => { if (this.copy) copySelection(this.app, D, m, this.keys); else applyTransform(this.app, D, this.parts, m); }); }
  click(e) {
    if (!this.center) {
      if (!this.app.sel.size) return;
      const r = this.inf(e, {}); if (!r) return;
      this.center = r.p.clone(); this.normal = (this.lockN || (r.type === 'face' ? r.face.normal : AX.z)).clone().normalize(); this.autoSel = null; this.status(); return;
    }
    if (!this.ref) {
      const r = this.inf(e, { from: this.center, plane: { n: this.normal, p: this.center } }); if (!r || r.p.distanceTo(this.center) < G.TOL) return;
      this.ref = r.p.clone(); this.parts = selectionParts(this.app); this.keys = [...this.app.sel]; this.copy = e.ctrl || !!this.copyPending; this.copyPending = false; this.beginLive(); this.status(); return;
    }
    this.finish(this.ang || 0);
  }
  finish(a) {
    const m = this.matrix(a); this.endLive(); const keys = this.keys, parts = this.parts, copy = this.copy;
    const nk = this.app.commit(copy ? 'Copier (rotation)' : 'Rotation', () => { if (copy) return copySelection(this.app, this.D, m, keys); applyTransform(this.app, this.D, parts, m); });
    if (copy && nk) { this.app.sel.clear(); nk.forEach((k) => this.app.sel.add(k)); this.app.refreshSelection(); }
    this.lastOp = { a, keys, copy, center: this.center.clone(), normal: this.normal.clone() };
    this.reset(); this.clearPv(); this.status();
  }
  vcbInput(s) {
    s = s.trim(); const arr = s.match(/^(?:[x*×](\d+)|(\d+)[x*×])$/i), div = s.match(/^\/(\d+)$/);
    if ((arr || div) && this.lastOp?.copy) {
      const n = +(arr ? arr[1] || arr[2] : div[1]); const lo = this.lastOp; this.app.undo();
      this.center = lo.center; this.normal = lo.normal;
      this.app.commit('Réseau polaire', () => { for (let i = 1; i <= n; i++) copySelection(this.app, this.D, this.matrix(lo.a * (div ? i / n : i)), lo.keys); });
      this.reset(); return;
    }
    const v = parseFloat(s.replace(',', '.')); if (isNaN(v)) return;
    if (this.ref) this.finish(v * Math.PI / 180);
  }
  deactivate() { this.cancelLive(); super.deactivate(); }
}

export class ScaleTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'scale'; this.vcbLabel = 'Échelle'; }
  get hint() { return this.grip ? 'Déplacez puis cliquez, ou tapez un facteur (ex : 2 ou 1;1;0,5). Ctrl = autour du centre.' : 'Sélectionnez puis cliquez une poignée (coin = uniforme, centre de face = un axe).'; }
  reset() { this.grip = null; this.grips = null; }
  activate() { super.activate(); this.buildGrips(); }
  buildGrips() {
    this.clearPv(); const app = this.app; if (!app.sel.size) { this.grips = null; return; }
    const parts = selectionParts(app); const D = this.D; const box = new THREE.Box3();
    for (const v of parts.verts) box.expandByPoint(D.verts.get(v).p);
    for (const iid of parts.insts) { const it = D.insts.get(iid); const b = new THREE.Box3(); G.bboxOfDef(app.model.defs, app.model.defs.get(it.def), it.m, b); box.union(b); }
    if (box.isEmpty()) return;
    this.box = box; const m = app.activeMatrix; const g = [];
    for (let i = 0; i < 27; i++) {
      const ix = i % 3, iy = ((i / 3) | 0) % 3, iz = (i / 9) | 0; const nMid = (ix === 1) + (iy === 1) + (iz === 1);
      if (nMid === 3) continue;
      const pick = (k, lo, hi) => (k === 0 ? lo : k === 2 ? hi : (lo + hi) / 2);
      const p = new Vector3(pick(ix, box.min.x, box.max.x), pick(iy, box.min.y, box.max.y), pick(iz, box.min.z, box.max.z));
      const op = new Vector3(pick(2 - ix, box.min.x, box.max.x), pick(2 - iy, box.min.y, box.max.y), pick(2 - iz, box.min.z, box.max.z));
      g.push({ p, op, axes: [ix !== 1, iy !== 1, iz !== 1], w: p.clone().applyMatrix4(m), corner: nMid === 0 });
    }
    this.grips = g; this.drawGrips();
  }
  drawGrips() {
    const app = this.app; this.pv.add(app.boxLines(this.box, app.activeMatrix, 0xd9a400));
    const pts = this.grips.map((g) => g.w); const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const pm = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x18a018, size: 9, sizeAttenuation: false, depthTest: false })); pm.renderOrder = 30; this.pv.add(pm); app.render();
  }
  near(e) { if (!this.grips) return null; let b = null, bd = 14; for (const g of this.grips) { const s = this.app.project(g.w); const d = Math.hypot(s.x - e.x, s.y - e.y); if (d < bd) { bd = d; b = g; } } return b; }
  move(e) {
    this._lastE = e;
    if (!this.grip) { if (!this.grips) this.buildGrips(); const g = this.near(e); this.ui.showInf(g ? { type: 'end', p: g.w } : null, e.x, e.y); if (g) this.ui.tip(g.corner ? 'Uniforme (coins opposés)' : 'Échelle selon un axe', null); return; }
    const r = this.app.infer(e.x, e.y, { from: this.grip.w, lockDir: this.dirW }); if (!r) return;
    const f = this.factorFor(r.p); this.f = f; this.preview(f);
    this.ui.vcb('Échelle', f.map((x) => x.toFixed(2).replace('.', ',')).filter((x, i) => this.grip.axes[i] || this.grip.corner).join('; '));
  }
  pivot(ctrl) { return ctrl ? this.box.getCenter(new Vector3()) : this.grip.op.clone(); }
  factorFor(pw) {
    const pl = this.toLocal(pw); const pv = this.pivot(this.ctrl); const g = this.grip.p;
    if (this.grip.corner) { const d0 = g.distanceTo(pv), d1 = pl.clone().sub(pv).dot(g.clone().sub(pv).normalize()); const k = d0 > 1e-9 ? d1 / d0 : 1; return [k, k, k]; }
    return [0, 1, 2].map((i) => { if (!this.grip.axes[i]) return 1; const a = ['x', 'y', 'z'][i]; const d0 = g[a] - pv[a]; return Math.abs(d0) > 1e-9 ? (pl[a] - pv[a]) / d0 : 1; });
  }
  matrix(f) { const p = this.pivot(this.ctrl); return new Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new Matrix4().makeScale(...f.map((x) => (Math.abs(x) < 1e-4 ? 1e-4 : x)))).multiply(new Matrix4().makeTranslation(-p.x, -p.y, -p.z)); }
  preview(f) { const m = this.matrix(f); this.liveApply((D) => applyTransform(this.app, D, this.parts, m)); this.drawGrips(); }
  click(e) {
    if (!this.grip) { const g = this.near(e); if (!g) return; this.grip = g; this.ctrl = e.ctrl; this.parts = selectionParts(this.app); this.dirW = new Vector3().subVectors(g.w, g.op.clone().applyMatrix4(this.app.activeMatrix)).normalize(); this.beginLive(); this.status(); return; }
    this.finish(this.f || [1, 1, 1]);
  }
  finish(f) { const m = this.matrix(f); this.endLive(); const parts = this.parts; this.app.commit('Échelle', () => applyTransform(this.app, this.D, parts, m)); this.grip = null; this.buildGrips(); this.status(); }
  vcbInput(s) {
    if (!this.grip) return; const v = s.split(';').map((t) => parseFloat(t.replace(',', '.')));
    if (v.some(isNaN)) return;
    let f; if (v.length === 1) f = this.grip.corner ? [v[0], v[0], v[0]] : this.grip.axes.map((a) => (a ? v[0] : 1)); else if (v.length === 3) f = v; else return;
    this.finish(f);
  }
  key(e) { if (e.key === 'Escape') { this.cancelLive(); this.grip = null; this.buildGrips(); return true; } return super.key(e); }
  deactivate() { this.cancelLive(); super.deactivate(); }
  onSelection() { if (!this.grip) this.buildGrips(); }
}

// ---------------------------------------------------------------- Décalage
export class OffsetTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'offset'; this.vcbLabel = 'Distance'; }
  get hint() { return this.face ? 'Déplacez vers l\'intérieur ou l\'extérieur et cliquez, ou tapez la distance.' : 'Cliquez sur une face pour décaler son contour. Double-clic = répéter.'; }
  reset() { this.face = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.face) { const f = this.app.pickFace(e.x, e.y); const ok = f && f.path.join() === this.app.activePath.join(); if (ok) this.app.setHoverFace(this.D, f.fid, this.app.activeMatrix); else this.app.clearHover(); return; }
    const r = this.app.infer(e.x, e.y, { plane: { n: this.nW, p: this.p0 } }); if (!r) return;
    const d = this.signedDist(r.p); this.d = d;
    this.liveApply((D) => G.offsetFace(D, this.face, d, {}));
    this.ui.vcb('Distance', this.fmt(Math.abs(d)));
  }
  signedDist(pw) {
    const D = this.liveDef || this.D; defFromJSON(this.liveSnap, D);
    const f = D.faces.get(this.face); const p = this.toLocal(pw); const n = G.faceNormal(D, f); const { u, v } = G.planeBasis(n);
    const poly = f.loops[0].map((x) => D.verts.get(x).p); let best = Infinity;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const l = new THREE.Line3(a, b); const q = new Vector3(); l.closestPointToPoint(p, true, q); best = Math.min(best, q.distanceTo(p)); }
    const p2 = poly.map((q) => ({ x: q.dot(u), y: q.dot(v) })); const pt = { x: p.dot(u), y: p.dot(v) };
    let inside = false; for (let i = 0, j = p2.length - 1; i < p2.length; j = i++) { if ((p2[i].y > pt.y) !== (p2[j].y > pt.y) && pt.x < ((p2[j].x - p2[i].x) * (pt.y - p2[i].y)) / (p2[j].y - p2[i].y) + p2[i].x) inside = !inside; }
    return inside ? best : -best;
  }
  click(e) {
    if (!this.face) { const f = this.app.pickFace(e.x, e.y); if (!f || f.path.join() !== this.app.activePath.join()) return; this.face = f.fid; this.nW = f.normal; this.p0 = f.point; this.app.clearHover(); this.beginLive(); this.status(); return; }
    this.finish(this.d || 0);
  }
  finish(d) { if (Math.abs(d) < G.TOL) return; const fid = this.face; this.endLive(); this.app.commit('Décalage', () => G.offsetFace(this.D, fid, d, {})); this.last = d; this.face = null; this.clearPv(); this.status(); }
  dbl(e) { if (this.last == null) return; if (this.face) { if (Math.abs(this.d || 0) > 1) return; this.cancelLive(); this.face = null; this.clearPv(); } const f = this.app.pickFace(e.x, e.y); if (!f) return; this.app.commit('Décalage', () => G.offsetFace(this.D, f.fid, this.last, {})); this.status(); }
  vcbInput(s) { const v = this.vcbLen(s); if (v == null) return; if (this.face) this.finish(v * (Math.sign(this.d) || 1)); }
  key(e) { if (e.key === 'Escape') { this.cancelLive(); this.cancel(); return true; } return super.key(e); }
  deactivate() { this.cancelLive(); super.deactivate(); }
}

// ---------------------------------------------------------------- Suivez-moi
export class FollowMeTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'followme'; this.hint = "Sélectionnez d'abord le chemin (arêtes ou une face), puis cliquez sur la face du profil."; }
  move(e) { const f = this.app.pickFace(e.x, e.y); const ok = f && f.path.join() === this.app.activePath.join(); if (ok) this.app.setHoverFace(this.D, f.fid, this.app.activeMatrix); else this.app.clearHover(); }
  click(e) {
    const f = this.app.pickFace(e.x, e.y); if (!f || f.path.join() !== this.app.activePath.join()) return;
    const D = this.D; const path = this.pathFromSelection(D, f.fid);
    if (!path) { this.ui.toast('Sélectionnez d\'abord un chemin (arêtes connectées ou une face).'); return; }
    this.app.commit('Suivez-moi', () => G.followMe(D, f.fid, path.pts, path.closed));
    this.app.sel.clear(); this.app.refreshSelection();
  }
  pathFromSelection(D, profileFid) {
    const edges = [], faces = [];
    for (const k of this.app.sel) { if (k[0] === 'e') edges.push(D.edges.get(+k.slice(2))); if (k[0] === 'f' && +k.slice(2) !== profileFid) faces.push(D.faces.get(+k.slice(2))); }
    const prof = D.faces.get(profileFid); const pv = G.vertsOfFace(prof);
    let ids = null, closed = false;
    if (faces.length && !edges.filter((e) => e && !(pv.has(e.a) && pv.has(e.b))).length) { ids = faces[0].loops[0].slice(); closed = true; }
    else {
      const es = edges.filter((e) => e && !(pv.has(e.a) && pv.has(e.b))); if (!es.length) return null;
      const adj = new Map(); for (const e of es) { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e.b); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e.a); }
      let start = [...adj.keys()].find((v) => adj.get(v).length === 1); closed = !start; if (!start) start = es[0].a;
      ids = [start]; const used = new Set(); let cur = start;
      while (true) { const nx = adj.get(cur).find((x) => !used.has(G.edgeKey(cur, x))); if (nx == null) break; used.add(G.edgeKey(cur, nx)); if (nx === start) break; ids.push(nx); cur = nx; }
    }
    let pts = ids.map((v) => D.verts.get(v).p.clone());
    const c = G.faceCenter(D, prof); const plane = G.facePlane(D, prof);
    if (closed) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = Math.abs(plane.n.dot(p) - plane.w) * 10 + p.distanceTo(c); if (d < bd) { bd = d; bi = i; } }); pts = pts.slice(bi).concat(pts.slice(0, bi)); }
    else if (pts[pts.length - 1].distanceTo(c) < pts[0].distanceTo(c)) pts.reverse();
    return { pts, closed };
  }
}

// ---------------------------------------------------------------- Mètre
export class TapeTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'tape'; this.vcbLabel = 'Longueur'; }
  get hint() { return this.start ? 'Cliquez pour placer le guide (ou tapez la distance). Ctrl = ne pas créer de guide.' : 'Cliquez une arête pour un guide parallèle, ou un point pour mesurer.'; }
  reset() { this.start = null; this.edge = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    const r = this.inf(e, { from: this.edge ? null : this.start }); if (!r) return; this.cur = r.p;
    if (!this.start) return;
    if (this.edge) {
      const off = this.offsetVec(r.p); const L = 3e5;
      this.line(this.start, this.start.clone().add(off), '#444', true);
      this.line(r.p.clone().addScaledVector(this.edge, -L), r.p.clone().addScaledVector(this.edge, L), '#333', true);
      this.ui.vcb('Longueur', this.fmt(off.length()));
    } else { this.line(this.start, r.p, '#333', true); this.ui.vcb('Longueur', this.fmt(this.start.distanceTo(r.p))); }
  }
  offsetVec(p) { const d = new Vector3().subVectors(p, this.start); return d.addScaledVector(this.edge, -d.dot(this.edge)); }
  click(e) {
    const r = this.inf(e, { from: this.edge ? null : this.start }); if (!r) return;
    if (!this.start) {
      this.start = r.p.clone();
      if ((r.type === 'edge' || r.type === 'mid') && r.edge) this.edge = new Vector3().subVectors(r.edge.b, r.edge.a).normalize();
      else if (r.type === 'guide') this.edge = r.guide.d.clone();
      this.status(); return;
    }
    this.place(r.p, e.ctrl);
  }
  place(p, noGuide) {
    if (!noGuide) {
      this.app.commit('Guide', () => {
        if (this.edge) this.app.model.guides.push({ id: G.nid(), type: 'line', p: p.clone(), d: this.edge.clone() });
        else { this.app.model.guides.push({ id: G.nid(), type: 'point', p: p.clone() }); const d = new Vector3().subVectors(p, this.start).normalize(); if (d.lengthSq() > 0) this.app.model.guides.push({ id: G.nid(), type: 'line', p: this.start.clone(), d }); }
      });
    }
    this.ui.toast('Distance : ' + this.fmt(this.edge ? this.offsetVec(p).length() : this.start.distanceTo(p)));
    this.cancel();
  }
  vcbInput(s) {
    const v = this.vcbLen(s); if (v == null || !this.start || !this.cur) return;
    if (this.edge) { const off = this.offsetVec(this.cur); if (off.lengthSq() < 1e-9) return; this.place(this.start.clone().addScaledVector(off.normalize(), v)); }
    else { const d = new Vector3().subVectors(this.cur, this.start); if (d.lengthSq() < 1e-9) return; this.place(this.start.clone().addScaledVector(d.normalize(), v)); }
  }
  key(e) { if (e.key === 'Escape') { this.cancel(); return true; } return super.key(e); }
}

// ---------------------------------------------------------------- Cotation
export class DimensionTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'dimension'; }
  get hint() { return !this.a ? 'Cliquez une arête ou un premier point.' : !this.b ? 'Cliquez le second point.' : 'Déplacez pour placer la cote, puis cliquez.'; }
  reset() { this.a = this.b = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    const r = this.inf(e, { from: this.b ? null : this.a }); if (!r) return;
    if (this.a && !this.b) this.line(this.a, r.p, '#333', true);
    if (this.b) {
      const o = this.offset(r.p); this.o = o; const a2 = this.a.clone().add(o), b2 = this.b.clone().add(o);
      this.line(this.a, a2, '#111'); this.line(this.b, b2, '#111'); this.line(a2, b2, '#111');
      this.ui.tip(this.fmt(this.a.distanceTo(this.b)), null);
    }
  }
  offset(p) {
    const d = new Vector3().subVectors(this.b, this.a).normalize(); const v = new Vector3().subVectors(p, this.a);
    return v.addScaledVector(d, -v.dot(d));
  }
  click(e) {
    const r = this.inf(e, { from: this.b ? null : this.a }); if (!r) return;
    if (!this.a) { if (r.type === 'edge' && r.edge) { this.a = r.edge.a.clone(); this.b = r.edge.b.clone(); } else this.a = r.p.clone(); this.status(); return; }
    if (!this.b) { if (r.p.distanceTo(this.a) < G.TOL) return; this.b = r.p.clone(); this.status(); return; }
    const d = { id: G.nid(), a: this.a.clone(), b: this.b.clone(), o: this.o.clone() };
    this.app.commit('Cotation', () => this.app.model.dims.push(d)); this.cancel();
  }
  key(e) { if (e.key === 'Escape') { this.cancel(); return true; } return super.key(e); }
}

// ---------------------------------------------------------------- Texte
export class TextTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'text'; }
  get hint() { return this.at ? 'Cliquez pour placer le texte.' : "Cliquez une entité (face = surface, arête = longueur) ou un emplacement vide pour un texte d'écran."; }
  reset() { this.at = null; this.def = ''; }
  move(e) { this._lastE = e; this.clearPv(); const r = this.inf(e, {}); if (r && this.at) this.line(this.at, r.p, '#111'); }
  async click(e) {
    const r = this.inf(e, {}); if (!r) return;
    if (!this.at) {
      this.at = r.p.clone();
      const f = this.app.pickFace(e.x, e.y, true);
      if (r.type === 'edge' && r.edge) this.def = this.fmt(r.edge.a.distanceTo(r.edge.b));
      else if (f) { const D = this.app.model.defs.get(f.def); this.def = (await import('./app.js')).fmtArea(this.app.model, G.faceArea(D, D.faces.get(f.fid))); }
      else this.def = `${this.fmt(r.p.x)}; ${this.fmt(r.p.y)}; ${this.fmt(r.p.z)}`;
      return;
    }
    const p = r.p.clone(), at = this.at, def = this.def; this.cancel();
    const txt = await this.ui.prompt('Texte', def); if (!txt) return;
    this.app.commit('Texte', () => this.app.model.texts.push({ id: G.nid(), p, at, text: txt }));
  }
  key(e) { if (e.key === 'Escape') { this.cancel(); return true; } return super.key(e); }
}

// ---------------------------------------------------------------- Peinture
export class PaintTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'paint'; this.hint = 'Cliquez pour peindre. Alt = pipette, Ctrl = faces connectées, Maj = toutes les faces de même matière.'; }
  move(e) { const ent = this.app.pickEntity(e.x, e.y); if (ent?.kind === 'f') this.app.setHoverFace(this.D, ent.id, this.app.activeMatrix, 0xffffff); else this.app.clearHover(); }
  click(e) {
    const app = this.app; const ent = app.pickEntity(e.x, e.y); if (!ent || ent.outside) return;
    const D = this.D; const mat = app.currentMat;
    if (e.alt) {
      if (ent.kind === 'f') { const f = D.faces.get(ent.id); app.currentMat = (ent.hit?.back ? f.back : f.mat) || null; }
      else if (ent.kind === 'i') app.currentMat = D.insts.get(ent.id).mat || null;
      app.emit('material'); return;
    }
    app.commit('Peindre', () => {
      if (app.sel.has(ent.key) && app.sel.size > 1) {
        for (const k of app.sel) { const id = +k.slice(2); if (k[0] === 'f') D.faces.get(id).mat = mat; if (k[0] === 'i') D.insts.get(id).mat = mat; }
      } else if (ent.kind === 'i') D.insts.get(ent.id).mat = mat;
      else if (ent.kind === 'f') {
        const f = D.faces.get(ent.id); const back = ent.hit?.back; const old = back ? f.back : f.mat;
        let targets = [f];
        if (e.shift) targets = [...D.faces.values()].filter((g) => (back ? g.back : g.mat) === old);
        else if (e.ctrl) { const conn = new Set([f.id]); let grow = true; while (grow) { grow = false; for (const g of D.faces.values()) { if (conn.has(g.id) || (back ? g.back : g.mat) !== old) continue; const vs = G.vertsOfFace(g); for (const c of conn) { const cf = D.faces.get(c); if ([...G.vertsOfFace(cf)].some((v) => vs.has(v))) { conn.add(g.id); grow = true; break; } } } } targets = [...conn].map((id) => D.faces.get(id)); }
        for (const t of targets) { if (back) t.back = mat; else t.mat = mat; }
      }
      D.touch();
    });
  }
}

// ---------------------------------------------------------------- Gomme
export class EraserTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'eraser'; this.hint = 'Cliquez ou glissez sur les arêtes à effacer. Maj = masquer, Ctrl = adoucir/lisser, Ctrl+Maj = durcir.'; }
  reset() { this.down = false; this.marked = new Set(); this.markedI = new Set(); }
  pointerDown(e) { this.down = true; this.mark(e); }
  pointerMove(e) {
    if (this.down) this.mark(e);
    else { this.clearPv(); const ed = this.app.pickEdge(e.x, e.y, 7, (x) => x.inCtx); if (ed) this.line(ed.a, ed.b, '#1f5fff', false, false); }
  }
  mark(e) {
    const app = this.app;
    const ed = app.pickEdge(e.x, e.y, 7, (x) => x.inCtx);
    if (ed) { if (!this.marked.has(ed.id)) { this.marked.add(ed.id); this.line(ed.a, ed.b, '#1f5fff', false, false); } return; }
    const ent = app.pickEntity(e.x, e.y);
    if (ent?.kind === 'i' && !this.markedI.has(ent.id)) { this.markedI.add(ent.id); const { box, m } = app.instBox([...app.activePath, ent.id]); this.pv.add(app.boxLines(box, m, 0x1f5fff)); app.render(); return; }
    // guides
    for (const g of app.model.guides) {
      let near = false;
      if (g.type === 'point') { const s = app.project(g.p); near = Math.hypot(s.x - e.x, s.y - e.y) < 8; }
      else { const r = app.ray(e.x, e.y).ray; const p = new Vector3(); r.distanceSqToSegment(g.p.clone().addScaledVector(g.d, -3e5), g.p.clone().addScaledVector(g.d, 3e5), null, p); const s = app.project(p); near = s.z < 1 && Math.hypot(s.x - e.x, s.y - e.y) < 6; }
      if (near) { this._guide = g; return; }
    }
    for (const d of app.model.dims) { const a = app.project(d.a.clone().add(d.o)), b = app.project(d.b.clone().add(d.o)); if (distPt(e, a, b) < 7) { this._dim = d; return; } }
  }
  pointerUp(e) {
    const app = this.app; this.down = false;
    const eids = [...this.marked], iids = [...this.markedI]; const g = this._guide, dm = this._dim; this._guide = this._dim = null;
    this.marked.clear(); this.markedI.clear(); this.clearPv();
    if (!eids.length && !iids.length && !g && !dm) return;
    const D = this.D;
    if (e.shift && !e.ctrl) app.commit('Masquer', () => { eids.forEach((id) => (D.edges.get(id).hidden = true)); iids.forEach((id) => (D.insts.get(id).hidden = true)); D.touch(); });
    else if (e.ctrl) app.commit(e.shift ? 'Durcir' : 'Adoucir', () => { eids.forEach((id) => (D.edges.get(id).soft = !e.shift)); D.touch(); });
    else app.commit('Effacer', () => {
      if (eids.length) G.eraseEdges(D, eids);
      iids.forEach((id) => D.insts.delete(id)); D.touch();
      if (g) app.model.guides = app.model.guides.filter((x) => x !== g);
      if (dm) app.model.dims = app.model.dims.filter((x) => x !== dm);
    });
  }
}
function distPt(e, a, b) { const dx = b.x - a.x, dy = b.y - a.y; const l = dx * dx + dy * dy; let t = l ? ((e.x - a.x) * dx + (e.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(e.x - a.x - t * dx, e.y - a.y - t * dy); }

// ------------------------------------------------------------- Plan de section
export class SectionTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'section'; this.vcbLabel = 'Décalage'; }
  get hint() { return this.sec ? 'Déplacez pour décaler la coupe, cliquez pour valider (ou tapez une distance).' : 'Cliquez une face pour y placer un plan de section (la coupe montre l\'intérieur).'; }
  reset() { this.sec = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.sec) { const f = this.app.pickFace(e.x, e.y, true); if (f) { const { u, v } = G.planeBasis(f.normal); const R = this.dashSize(f.point) * 12; this.poly([u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), v.clone().sub(u)].map((x) => f.point.clone().addScaledVector(x, R)), '#ff7a00'); } return; }
    const r = this.app.infer(e.x, e.y, { from: this.p0, lockDir: this.sec.n }); if (!r) return;
    this.off = new Vector3().subVectors(r.p, this.p0).dot(this.sec.n);
    this.sec.p = this.p0.clone().addScaledVector(this.sec.n, this.off); this.app.refreshAnnotations();
    this.ui.vcb('Décalage', this.fmt(this.off));
  }
  click(e) {
    if (!this.sec) {
      const f = this.app.pickFace(e.x, e.y, true); if (!f) return;
      const box = this.app.modelBox(); const size = Math.max(box.getSize(new Vector3()).length() * 0.38, 600);
      this.p0 = f.point.clone();
      this.sec = { id: G.nid(), p: f.point.clone(), n: f.normal.clone().normalize(), active: true, size, name: 'Section ' + (this.app.model.sections.length + 1) };
      this.app.model.sections.forEach((s) => (s.active = false)); this.app.model.sections.push(this.sec); this.app.refreshAnnotations(); this.status(); return;
    }
    this.finish();
  }
  finish() {
    const s = this.sec; this.app.model.sections = this.app.model.sections.filter((x) => x !== s); this.sec = null;
    this.app.commit('Plan de section', () => this.app.model.sections.push(s)); this.status(); this.app.emit('sections');
  }
  vcbInput(s) { const v = this.vcbLen(s); if (v == null || !this.sec) return; this.sec.p = this.p0.clone().addScaledVector(this.sec.n, v * (this.off > 0 ? 1 : -1)); this.finish(); }
  key(e) { if (e.key === 'Escape' && this.sec) { this.app.model.sections = this.app.model.sections.filter((x) => x !== this.sec); this.sec = null; this.app.refreshAnnotations(); this.status(); return true; } return super.key(e); }
}

// ------------------------------------------------------------- Placer un composant
export class PlaceTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'place'; this.hint = 'Cliquez pour placer le composant. Échap pour annuler.'; }
  setDef(defId) { this.defId = defId; }
  move(e) {
    this._lastE = e; this.clearPv(); const r = this.inf(e, {}); if (!r) return; this.cur = r.p;
    const def = this.app.model.defs.get(this.defId); if (!def) return;
    const box = new THREE.Box3(); G.bboxOfDef(this.app.model.defs, def, new Matrix4().makeTranslation(r.p.x, r.p.y, r.p.z), box);
    if (!box.isEmpty()) this.pv.add(this.app.boxLines(box, new Matrix4(), 0x1f6fff)); this.app.render();
  }
  click(e) {
    const r = this.inf(e, {}); if (!r) return; const lp = this.toLocal(r.p); const defId = this.defId;
    const id = this.app.commit('Placer composant', () => { const id = G.nid(); this.D.insts.set(id, { id, def: defId, m: new Matrix4().makeTranslation(lp.x, lp.y, lp.z), name: '', hidden: false, tag: this.app.activeTag !== 'untagged' ? this.app.activeTag : null, mat: null }); this.D.touch(); return id; });
    if (id) { this.app.sel.clear(); this.app.sel.add('i:' + id); this.app.refreshSelection(); }
    this.ui.setTool('select');
  }
  key(e) { if (e.key === 'Escape') { this.ui.setTool('select'); return true; } return false; }
}

// ---------------------------------------------------------------- Navigation
export class OrbitTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'orbit'; this.hint = 'Glissez pour orbiter. Maj = panoramique. Double-clic = recentrer.'; }
  pointerDown(e) { this.last = e; }
  pointerMove(e) { if (!this.last) return; const dx = e.x - this.last.x, dy = e.y - this.last.y; if (e.shift) this.app.pan(dx, dy); else this.app.orbit(dx, dy); this.last = e; }
  pointerUp() { this.last = null; }
  dbl(e) { const p = this.app.pointUnder(e.x, e.y); if (p) { const off = new Vector3().subVectors(this.app.camera.position, this.app.target); this.app.animateCamera(p.clone().add(off), p); } }
}
export class PanTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'pan'; this.hint = 'Glissez pour déplacer la vue.'; }
  pointerDown(e) { this.last = e; }
  pointerMove(e) { if (!this.last) return; this.app.pan(e.x - this.last.x, e.y - this.last.y); this.last = e; }
  pointerUp() { this.last = null; }
}
export class ZoomTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'zoom'; this.hint = 'Glissez vers le haut pour zoomer, vers le bas pour dézoomer. Tapez un angle de champ (ex : 35deg).'; this.vcbLabel = 'Champ'; }
  status() { super.status(); this.ui.vcb('Champ', this.app.persp.fov.toFixed(1).replace('.', ',') + '°'); }
  pointerDown(e) { this.last = e; this.c = e; }
  pointerMove(e) { if (!this.last) return; this.app.zoomAt(this.c.x, this.c.y, Math.pow(1.01, e.y - this.last.y)); this.last = e; }
  pointerUp() { this.last = null; }
  vcbInput(s) { const v = parseFloat(s.replace(',', '.')); if (v > 1 && v < 120) { this.app.persp.fov = v; this.app.persp.updateProjectionMatrix(); this.app.render(); this.status(); } }
}


// ---------------------------------------------------------------- Rapporteur
export class ProtractorTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'protractor'; this.vcbLabel = 'Angle'; }
  get hint() { return !this.center ? "Cliquez le sommet de l'angle (le rapporteur suit les faces ; flèches = verrouiller le plan)." : !this.ref ? 'Cliquez le premier côté (référence 0°).' : "Cliquez pour placer un guide à cet angle ou tapez l'angle. Ctrl = mesurer seulement."; }
  reset() { this.center = null; this.ref = null; this.lockN = null; }
  key(e) {
    const map = { ArrowUp: AX.z, ArrowRight: AX.x, ArrowLeft: AX.y };
    if (map[e.key] && !this.center) { this.lockN = this.lockN === map[e.key] ? null : map[e.key]; return true; }
    if (e.key === 'Escape') { this.cancel(); return true; } return super.key(e);
  }
  move(e) {
    this._lastE = e; this.clearPv(); const rt = this.app.tools?.rotate || null; void rt;
    const R = RotateTool.prototype;
    if (!this.center) { const r = this.inf(e, {}); if (!r) return; const n = this.lockN || (r.type === 'face' ? r.face.normal : AX.z); R.protractor.call(this, r.p, n, R.axisCol(n)); return; }
    R.protractor.call(this, this.center, this.normal, R.axisCol(this.normal));
    if (!this.ref) { const r = this.inf(e, { from: this.center, plane: { n: this.normal, p: this.center } }); if (r) this.line(this.center, r.p, '#333', true); return; }
    const r = this.inf(e, { plane: { n: this.normal, p: this.center } }); if (!r) return;
    this.ang = R.angleTo.call(this, r.p); this.cur = r.p;
    const d = this.dirAt(this.ang); const L = 3e5;
    this.line(this.center, this.ref, '#333', true); this.line(this.center.clone().addScaledVector(d, -L), this.center.clone().addScaledVector(d, L), '#555', true);
    this.ui.vcb('Angle', (this.ang * 180 / Math.PI).toFixed(1).replace('.', ',') + '°');
  }
  dirAt(a) { const r0 = new Vector3().subVectors(this.ref, this.center).normalize(); return r0.applyAxisAngle(this.normal, a); }
  click(e) {
    if (!this.center) { const r = this.inf(e, {}); if (!r) return; this.center = r.p.clone(); this.normal = (this.lockN || (r.type === 'face' ? r.face.normal : AX.z)).clone().normalize(); this.status(); return; }
    if (!this.ref) { const r = this.inf(e, { from: this.center, plane: { n: this.normal, p: this.center } }); if (!r || r.p.distanceTo(this.center) < G.TOL) return; this.ref = r.p.clone(); this.status(); return; }
    this.place(this.ang || 0, e.ctrl);
  }
  place(a, noGuide) {
    const deg = (a * 180 / Math.PI).toFixed(1).replace('.', ',');
    if (!noGuide) { const d = this.dirAt(a); const c = this.center.clone(); this.app.commit('Guide angulaire', () => this.app.model.guides.push({ id: G.nid(), type: 'line', p: c, d })); }
    this.ui.toast('Angle : ' + deg + '°'); this.cancel();
  }
  vcbInput(s) { const v = parseFloat(s.replace(',', '.')); if (isNaN(v) || !this.ref) return; this.place(v * Math.PI / 180); }
}

// ---------------------------------------------------------------- Zoom fenêtre
export class ZoomWindowTool extends Tool {
  constructor(a, u) { super(a, u); this.name = 'zoomwin'; this.hint = 'Tracez un rectangle autour de la zone à agrandir.'; }
  pointerDown(e) { this.d0 = e; }
  pointerMove(e) { if (this.d0) this.ui.rubber({ x0: this.d0.x, y0: this.d0.y, x1: e.x, y1: e.y }); }
  pointerUp(e) {
    const d0 = this.d0; this.d0 = null; this.ui.rubber(null); if (!d0) return;
    const w = Math.abs(e.x - d0.x), h = Math.abs(e.y - d0.y); if (w < 8 || h < 8) return;
    const cx = (e.x + d0.x) / 2, cy = (e.y + d0.y) / 2; const app = this.app;
    const p = app.pointUnder(cx, cy) || app.target.clone();
    const k = Math.max(w / app.w, h / app.h);
    const dir = new Vector3().subVectors(app.camera.position, app.target).normalize(); const dist = app.camera.position.distanceTo(p) * k;
    app.animateCamera(p.clone().addScaledVector(dir, Math.max(dist, 50)), p);
    this.ui.setTool(this.ui.prevTool || 'select');
  }
}

// ---------------------------------------------------------------- Visite (marcher / regarder)
export class WalkTool extends Tool {
  constructor(a, u, look = false) { super(a, u); this.look = look; this.name = look ? 'look' : 'walk'; this.vcbLabel = 'Hauteur des yeux'; this.eye = 1650; }
  get hint() { return this.look ? 'Glissez pour regarder autour de vous (la caméra reste en place).' : 'Glissez vers le haut/bas pour avancer/reculer, gauche/droite pour tourner. Maj = monter/descendre, Ctrl = courir. Flèches du clavier aussi.'; }
  activate() {
    super.activate(); const app = this.app;
    if (app.isOrtho) app.setOrtho(false);
    if (!this.look) {
      const c = app.camera.position; if (c.z > this.eye * 3) {
        const f = new Vector3().subVectors(app.target, c); f.z = 0; if (f.lengthSq() < 1) f.set(0, 1, 0); f.normalize();
        const box = app.modelBox(); const ctr = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
        const size = box.isEmpty() ? 5000 : box.getSize(new Vector3()).length();
        const pos = ctr.clone().addScaledVector(f, -size * 0.9); pos.z = this.eye;
        app.animateCamera(pos, pos.clone().addScaledVector(f, 3000).setZ(this.eye));
      }
    }
    this.ui.vcb('Hauteur des yeux', fmtLen(app.model, this.app.camera.position.z));
  }
  pointerDown(e) { this.last = e; this.d0 = e; this.timer = setInterval(() => this.step(), 30); }
  pointerMove(e) { if (this.last) this.cur = e; }
  pointerUp() { this.last = null; this.cur = null; clearInterval(this.timer); }
  deactivate() { clearInterval(this.timer); super.deactivate(); }
  step() {
    const app = this.app; const e = this.cur; if (!e || !this.d0) return;
    const dx = e.x - this.d0.x, dy = e.y - this.d0.y; const cam = app.camera.position;
    const fwd = new Vector3().subVectors(app.target, cam); const dist = fwd.length(); fwd.normalize();
    if (this.look) {
      this.lookBy(dx * 0.04, dy * 0.04); this.d0 = e; return;
    }
    const speed = (e.ctrl ? 4 : 1) * 0.6;
    if (e.shift) { cam.z -= dy * speed; app.target.z -= dy * speed; }
    else {
      const flat = fwd.clone(); flat.z = 0; flat.normalize();
      cam.addScaledVector(flat, -dy * speed); app.target.addScaledVector(flat, -dy * speed);
      this.lookBy(dx * 0.006, 0);
    }
    void dist; app.render();
  }
  lookBy(yaw, pitch) {
    const app = this.app; const cam = app.camera.position; const f = new Vector3().subVectors(app.target, cam); const d = Math.max(f.length(), 1000);
    f.normalize().applyAxisAngle(AX.z, -yaw * Math.PI / 180 * 10);
    const right = new Vector3().crossVectors(f, AX.z).normalize();
    const f2 = f.clone().applyAxisAngle(right, -pitch * Math.PI / 180 * 10); if (Math.abs(f2.z) < 0.97) f.copy(f2);
    app.target.copy(cam).addScaledVector(f, d); app.render();
  }
  key(e) {
    const app = this.app; const cam = app.camera.position; const f = new Vector3().subVectors(app.target, cam); f.z = 0; f.normalize(); const s = e.ctrlKey ? 400 : 150;
    const mv = (v) => { cam.add(v); app.target.add(v); app.render(); };
    if (e.key === 'ArrowUp') { mv(f.multiplyScalar(s)); return true; }
    if (e.key === 'ArrowDown') { mv(f.multiplyScalar(-s)); return true; }
    if (e.key === 'ArrowLeft') { this.lookBy(-1.5, 0); return true; }
    if (e.key === 'ArrowRight') { this.lookBy(1.5, 0); return true; }
    return false;
  }
  vcbInput(s) { const v = this.vcbLen(s); if (v == null) return; const app = this.app; const dz = v - app.camera.position.z; app.camera.position.z += dz; app.target.z += dz; this.eye = v; app.render(); }
}

// ---------------------------------------------------------------- Rectangle pivoté
export class RotRectTool extends ShapeTool {
  constructor(a, u) { super(a, u); this.name = 'rotrect'; this.vcbLabel = 'Longueur'; }
  get hint() { return !this.start ? 'Cliquez le premier coin.' : !this.p2 ? 'Cliquez la fin du premier côté (direction libre) ou tapez sa longueur.' : 'Déplacez pour la largeur et cliquez, ou tapez-la.'; }
  reset() { super.reset(); this.p2 = null; }
  move(e) {
    this._lastE = e; this.clearPv();
    if (!this.start) { this.inf(e, {}); return; }
    if (!this.p2) { const r = this.inf(e, { from: this.start }); if (!r) return; this.cur = r.p; this.line(this.start, r.p, '#111'); this.ui.vcb('Longueur', this.fmt(this.start.distanceTo(r.p))); return; }
    const r = this.inf(e, { plane: { n: this.plane, p: this.start } }); if (!r) return;
    const w = this.width(r.p); this.w = w; this.poly(this.corners(w), '#111'); this.ui.vcb('Largeur', this.fmt(Math.abs(w)));
  }
  width(p) { return new Vector3().subVectors(p, this.start).dot(this.perp); }
  corners(w) { return [this.start, this.p2, this.p2.clone().addScaledVector(this.perp, w), this.start.clone().addScaledVector(this.perp, w)]; }
  setP2(p) {
    this.p2 = p.clone(); const d = new Vector3().subVectors(this.p2, this.start).normalize();
    let n = this.pickPlane(this.lastInf || { type: 'free' }); if (Math.abs(n.dot(d)) > 0.99) n = Math.abs(d.z) > 0.9 ? AX.x.clone() : AX.z.clone();
    n = n.clone().addScaledVector(d, -n.dot(d)).normalize(); this.plane = n; this.perp = new Vector3().crossVectors(n, d).normalize(); this.status();
  }
  click(e) {
    if (!this.start) { const r = this.inf(e, {}); if (!r) return; this.start = r.p.clone(); this.firstInf = r; this.status(); return; }
    if (!this.p2) { const r = this.inf(e, { from: this.start }); if (!r || r.p.distanceTo(this.start) < G.TOL) return; this.lastInf = this.firstInf; this.setP2(r.p); return; }
    const r = this.inf(e, { plane: { n: this.plane, p: this.start } }); if (!r) return; this.make(this.width(r.p));
  }
  make(w) {
    if (Math.abs(w) < G.TOL) return; const pts = this.corners(w).map((p) => this.toLocal(p)); const cam = this.camPosLocal();
    this.app.commit('Rectangle pivoté', () => G.drawPolyline(this.D, pts, true, { camPos: cam })); this.cancel();
  }
  vcbInput(s) {
    const v = this.vcbLen(s); if (v == null) return;
    if (this.start && !this.p2 && this.cur) { const d = new Vector3().subVectors(this.cur, this.start).normalize(); this.lastInf = this.firstInf; this.setP2(this.start.clone().addScaledVector(d, v)); return; }
    if (this.p2) this.make(v * (Math.sign(this.w) || 1));
  }
}

export const TOOL_CLASSES = { select: SelectTool, line: LineTool, rect: RectTool, circle: CircleTool, arc: ArcTool, pushpull: PushPullTool, move: MoveTool, rotate: RotateTool, scale: ScaleTool, offset: OffsetTool, followme: FollowMeTool, tape: TapeTool, dimension: DimensionTool, text: TextTool, paint: PaintTool, eraser: EraserTool, section: SectionTool, place: PlaceTool, protractor: ProtractorTool, zoomwin: ZoomWindowTool, walk: WalkTool, rotrect: RotRectTool, orbit: OrbitTool, pan: PanTool, zoom: ZoomTool };
export function makePolygonTool(app, ui) { return new CircleTool(app, ui, 6); }
export function makeLookTool(app, ui) { return new WalkTool(app, ui, true); }
