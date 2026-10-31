// G&L Sketch — moteur géométrique (arêtes / faces collantes, façon "modeleur de surfaces")
// Unité interne : millimètre. Axe Z = vertical (bleu).
import { Vector3, Vector2, Matrix4, ShapeUtils } from 'three';

export const TOL = 0.01;          // tolérance de coïncidence (mm)
const ANG = 1e-6;

let NEXT = 1;
export const nid = () => NEXT++;
export const setNextId = (n) => { NEXT = Math.max(NEXT, n); };
export const getNextId = () => NEXT;

// ---------------------------------------------------------------- Définitions
export class Def {
  constructor(name = 'Groupe', kind = 'group') {
    this.id = nid();
    this.name = name;
    this.kind = kind;            // 'root' | 'group' | 'component'
    this.verts = new Map();      // id -> {id, p:Vector3}
    this.edges = new Map();      // id -> {id, a, b, soft, hidden, tag}
    this.faces = new Map();      // id -> {id, loops:[[vid]], mat, back, tag, hidden}
    this.insts = new Map();      // id -> {id, def, m:Matrix4, name, hidden, tag}
    this.ekey = new Map();       // "a|b" -> edgeId
    this.version = 0;
    this._adj = null;
  }
  touch() { this.version++; this._adj = null; }
}

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export const edgeKey = key;

export function P(D, vid) { return D.verts.get(vid).p; }

// --------------------------------------------------------- Adjacence arête/face
export function adjacency(D) {
  if (D._adj) return D._adj;
  const m = new Map();
  for (const f of D.faces.values()) {
    for (const loop of f.loops) {
      for (let i = 0; i < loop.length; i++) {
        const k = key(loop[i], loop[(i + 1) % loop.length]);
        let arr = m.get(k); if (!arr) m.set(k, (arr = []));
        if (!arr.includes(f.id)) arr.push(f.id);
      }
    }
  }
  D._adj = m;
  return m;
}
export function facesOfEdge(D, e) { return adjacency(D).get(key(e.a, e.b)) || []; }
export function edgesOfFace(D, f) {
  const out = [];
  for (const loop of f.loops) for (let i = 0; i < loop.length; i++) {
    const id = D.ekey.get(key(loop[i], loop[(i + 1) % loop.length]));
    if (id) out.push(id);
  }
  return out;
}
export function vertsOfFace(f) { const s = new Set(); for (const l of f.loops) for (const v of l) s.add(v); return s; }

// --------------------------------------------------------------------- Normales
export function loopNormal(D, loop) {
  const n = new Vector3();
  for (let i = 0; i < loop.length; i++) {
    const a = P(D, loop[i]), b = P(D, loop[(i + 1) % loop.length]);
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.lengthSq() > 0 ? n.normalize() : n.set(0, 0, 1);
}
export function faceNormal(D, f) { return loopNormal(D, f.loops[0]); }
export function facePlane(D, f) {
  const n = faceNormal(D, f);
  return { n, w: n.dot(P(D, f.loops[0][0])) };
}
export function faceCenter(D, f) {
  const c = new Vector3(); const l = f.loops[0];
  for (const v of l) c.add(P(D, v));
  return c.divideScalar(l.length);
}
export function planeBasis(n) {
  const ref = Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(ref, n).normalize();
  if (Math.abs(n.z) >= 0.9) { u.set(1, 0, 0).addScaledVector(n, -n.x).normalize(); }
  const v = new Vector3().crossVectors(n, u).normalize();
  return { u, v };
}
export function faceArea(D, f) {
  const n = faceNormal(D, f); let a = 0;
  f.loops.forEach((loop, li) => {
    const s = new Vector3();
    for (let i = 0; i < loop.length; i++) s.add(new Vector3().crossVectors(P(D, loop[i]), P(D, loop[(i + 1) % loop.length])));
    a += Math.abs(s.dot(n)) / 2 * (li === 0 ? 1 : -1);
  });
  return Math.abs(a);
}

// ----------------------------------------------------------------- Sommets
export function findVertex(D, p, tol = TOL) {
  for (const v of D.verts.values()) if (v.p.distanceToSquared(p) < tol * tol) return v.id;
  return 0;
}
export function getVertex(D, p) {
  const f = findVertex(D, p); if (f) return f;
  const id = nid(); D.verts.set(id, { id, p: p.clone() }); return id;
}
function newEdge(D, a, b, props) {
  const k = key(a, b); const ex = D.ekey.get(k); if (ex) return ex;
  const id = nid();
  D.edges.set(id, { id, a, b, soft: false, hidden: false, tag: null, ...(props || {}) });
  D.ekey.set(k, id); D._adj = null; return id;
}
export function ensureEdge(D, a, b, props) { return newEdge(D, a, b, props); }
export function removeEdgeRaw(D, eid) {
  const e = D.edges.get(eid); if (!e) return;
  D.edges.delete(eid); D.ekey.delete(key(e.a, e.b)); D._adj = null;
}

// coupe une arête par un sommet (met à jour les boucles des faces)
export function splitEdge(D, eid, vid) {
  const e = D.edges.get(eid); if (!e || e.a === vid || e.b === vid) return;
  const { a, b } = e; const props = { soft: e.soft, hidden: e.hidden, tag: e.tag, curve: e.curve || 0 };
  removeEdgeRaw(D, eid);
  newEdge(D, a, vid, props); newEdge(D, vid, b, props);
  for (const f of D.faces.values()) {
    for (const loop of f.loops) {
      for (let i = 0; i < loop.length; i++) {
        const x = loop[i], y = loop[(i + 1) % loop.length];
        if ((x === a && y === b) || (x === b && y === a)) { loop.splice(i + 1, 0, vid); i++; }
      }
    }
  }
  D._adj = null;
}

function closestOnSeg(p, a, b) {
  const ab = new Vector3().subVectors(b, a); const l2 = ab.lengthSq();
  let t = l2 ? new Vector3().subVectors(p, a).dot(ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, q: a.clone().addScaledVector(ab, t) };
}
// intersection de deux segments 3D (s'ils se croisent)
function segSegIntersect(p1, p2, p3, p4) {
  const d1 = new Vector3().subVectors(p2, p1), d2 = new Vector3().subVectors(p4, p3);
  const r = new Vector3().subVectors(p1, p3);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2);
  const den = a * e - b * b; if (Math.abs(den) < 1e-9 * a * e) return null; // parallèles
  const s = (b * f - c * e) / den, t = (a * f - b * c) / den;
  if (s < -1e-9 || s > 1 + 1e-9 || t < -1e-9 || t > 1 + 1e-9) return null;
  const q1 = p1.clone().addScaledVector(d1, s), q2 = p3.clone().addScaledVector(d2, t);
  if (q1.distanceTo(q2) > TOL) return null;
  return { s, t, q: q1 };
}

// Ajoute un segment : soude les sommets, coupe les arêtes croisées. Renvoie les ids d'arêtes.
export function addSegment(D, p1, p2, props) {
  if (p1.distanceTo(p2) < TOL) return [];
  const pts = [{ t: 0, p: p1.clone() }, { t: 1, p: p2.clone() }];
  const len2 = p1.distanceToSquared(p2);
  const dir = new Vector3().subVectors(p2, p1);
  // sommets existants sur le segment
  for (const v of D.verts.values()) {
    const { t, q } = closestOnSeg(v.p, p1, p2);
    if (t > 1e-9 && t < 1 - 1e-9 && q.distanceTo(v.p) < TOL) pts.push({ t, p: v.p.clone(), vid: v.id });
  }
  // arêtes croisées / extrémités sur arêtes
  for (const e of [...D.edges.values()]) {
    const a = P(D, e.a), b = P(D, e.b);
    const hit = segSegIntersect(p1, p2, a, b);
    if (hit && hit.t > 1e-9 && hit.t < 1 - 1e-9) {
      const q = hit.q; const ex = findVertex(D, q);
      if (!ex) { const vid = getVertex(D, q); splitEdge(D, e.id, vid); pts.push({ t: hit.s, p: q, vid }); }
    }
  }
  // extrémités tombant au milieu d'arêtes existantes
  for (const pp of pts) {
    if (pp.vid) continue;
    let vid = findVertex(D, pp.p);
    if (!vid) {
      for (const e of [...D.edges.values()]) {
        const { t, q } = closestOnSeg(pp.p, P(D, e.a), P(D, e.b));
        if (t > 1e-9 && t < 1 - 1e-9 && q.distanceTo(pp.p) < TOL) { vid = getVertex(D, pp.p); splitEdge(D, e.id, vid); break; }
      }
    }
    pp.vid = vid || getVertex(D, pp.p);
  }
  pts.sort((x, y) => x.t - y.t);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i].vid, b = pts[i + 1].vid; if (a === b) continue;
    out.push(newEdge(D, a, b, props));
  }
  void len2; void dir;
  D.touch();
  return out;
}

// ------------------------------------------------------------------- Plans
export function samePlane(p, q) {
  const d = p.n.dot(q.n);
  if (d > 1 - ANG) return Math.abs(p.w - q.w) < TOL;
  if (d < -1 + ANG) return Math.abs(p.w + q.w) < TOL;
  return false;
}
function canonical(pl) {
  const n = pl.n.clone(); let w = pl.w;
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const m = az >= ax && az >= ay ? n.z : ay >= ax ? n.y : n.x;
  if (m < 0) { n.negate(); w = -w; }
  return { n, w };
}
export function onPlane(p, pl) { return Math.abs(pl.n.dot(p) - pl.w) < TOL; }
function faceInPlane(D, f, pl) {
  const fp = facePlane(D, f); if (!samePlane(fp, pl)) return false;
  return f.loops[0].every((v) => onPlane(P(D, v), pl));
}

function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function area2(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function interiorPoint(outer, holes) {
  try {
    const tris = ShapeUtils.triangulateShape(outer.map((p) => p.clone()), holes.map((h) => h.map((p) => p.clone())));
    const all = outer.concat(...holes); let best = null, ba = -1;
    for (const t of tris) {
      const a = all[t[0]], b = all[t[1]], c = all[t[2]];
      const ar = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
      if (ar > ba) { ba = ar; best = new Vector2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3); }
    }
    if (best) return best;
  } catch (e) { /* */ }
  const c = new Vector2(); outer.forEach((p) => c.add(p)); return c.divideScalar(outer.length);
}
function inRegion(pt, outer, holes) {
  if (!pointInPoly(pt, outer)) return false;
  for (const h of holes) if (pointInPoly(pt, h)) return false;
  return true;
}

// Reconstruit toutes les faces d'un plan à partir des arêtes (cœur du comportement "collant").
// opts: { newEdges:Set, exclude:[Vector3], camPos:Vector3, defaultMat }
export function rebuildPlane(D, plane, opts = {}) {
  const pl = canonical(plane); const n = pl.n;
  const { u, v } = planeBasis(n);
  const to2 = (p) => new Vector2(p.dot(u), p.dot(v));
  const newEdges = opts.newEdges || new Set();

  const oldFaces = [...D.faces.values()].filter((f) => faceInPlane(D, f, pl));
  const oldInfo = oldFaces.map((f) => {
    const fn = faceNormal(D, f);
    return { f, sign: fn.dot(n) >= 0 ? 1 : -1, outer: f.loops[0].map((x) => to2(P(D, x))), holes: f.loops.slice(1).map((l) => l.map((x) => to2(P(D, x)))) };
  });

  // arêtes du plan
  const nb = new Map(); const pe = [];
  for (const e of D.edges.values()) {
    if (onPlane(P(D, e.a), pl) && onPlane(P(D, e.b), pl)) {
      pe.push(e);
      if (!nb.has(e.a)) nb.set(e.a, new Set()); if (!nb.has(e.b)) nb.set(e.b, new Set());
      nb.get(e.a).add(e.b); nb.get(e.b).add(e.a);
    }
  }
  // élagage des arêtes pendantes
  let changed = true;
  while (changed) {
    changed = false;
    for (const [vid, s] of nb) if (s.size <= 1) { for (const o of s) nb.get(o)?.delete(vid); nb.delete(vid); changed = true; }
  }
  const p2 = new Map(); for (const vid of nb.keys()) p2.set(vid, to2(P(D, vid)));
  const sorted = new Map();
  for (const [vid, s] of nb) {
    const c = p2.get(vid);
    sorted.set(vid, [...s].sort((a, b) => {
      const pa = p2.get(a), pb = p2.get(b);
      return Math.atan2(pa.y - c.y, pa.x - c.x) - Math.atan2(pb.y - c.y, pb.x - c.x);
    }));
  }
  // composantes connexes
  const comp = new Map(); let cc = 0;
  for (const vid of nb.keys()) {
    if (comp.has(vid)) continue; cc++; const st = [vid]; comp.set(vid, cc);
    while (st.length) { const x = st.pop(); for (const y of nb.get(x)) if (!comp.has(y)) { comp.set(y, cc); st.push(y); } }
  }
  // parcours des faces planaires
  const used = new Set(); const cycles = [];
  for (const [a, s] of nb) for (const b of s) {
    const k0 = a + '>' + b; if (used.has(k0)) continue;
    const cyc = []; let x = a, y = b, guard = 0;
    while (guard++ < 100000) {
      const k = x + '>' + y; if (used.has(k)) break; used.add(k); cyc.push(x);
      const lst = sorted.get(y); const i = lst.indexOf(x);
      const z = lst[(i - 1 + lst.length) % lst.length];
      x = y; y = z;
    }
    if (cyc.length >= 3) cycles.push({ loop: cyc, poly: cyc.map((id) => p2.get(id)), comp: comp.get(cyc[0]) });
  }
  cycles.forEach((c) => { c.area = area2(c.poly); });
  const pos = cycles.filter((c) => c.area > 1e-6); const neg = cycles.filter((c) => c.area < -1e-6);
  pos.forEach((c) => { c.holes = []; });
  for (const ng of neg) {
    let best = null;
    for (const p of pos) {
      if (p.comp === ng.comp) continue;
      if (p.area <= -ng.area) continue;
      if (!pointInPoly(ng.poly[0], p.poly) || !ng.poly.every((q) => pointInPoly(q, p.poly) || onPolyBoundary(q, p.poly))) continue;
      if (!best || p.area < best.area) best = p;
    }
    if (best) best.holes.push(ng);
  }
  // un trou qui contient un autre trou (îlots imbriqués) : ne garder que les trous de premier niveau
  for (const p of pos) {
    p.holes = p.holes.filter((h) => !p.holes.some((o) => o !== h && -o.area > -h.area && pointInPoly(h.poly[0], o.poly)));
  }

  const excl2 = (opts.exclude || []).map(to2);
  const adj = adjacency(D);
  const created = [];
  const newFaces = [];
  for (const c of pos) {
    const holes2 = c.holes.map((h) => h.poly);
    const ip = interiorPoint(c.poly, holes2);
    if (excl2.some((q) => inRegion(q, c.poly, holes2))) continue;
    let inherit = null;
    for (const o of oldInfo) if (inRegion(ip, o.outer, o.holes)) { inherit = o; break; }
    let isNew = false;
    for (let i = 0; i < c.loop.length && !isNew; i++) {
      const eid = D.ekey.get(key(c.loop[i], c.loop[(i + 1) % c.loop.length]));
      if (newEdges.has(eid)) isNew = true;
    }
    if (!inherit && !isNew) continue;
    let sign;
    if (inherit) sign = inherit.sign;
    else {
      sign = 0;
      // cohérence avec une face voisine hors du plan
      for (let i = 0; i < c.loop.length && !sign; i++) {
        const a = c.loop[i], b = c.loop[(i + 1) % c.loop.length];
        const fl = adj.get(key(a, b)) || [];
        for (const fid of fl) {
          const f2 = D.faces.get(fid); if (!f2 || oldFaces.includes(f2)) continue;
          for (const l of f2.loops) for (let j = 0; j < l.length; j++) {
            const x = l[j], y = l[(j + 1) % l.length];
            if (x === a && y === b) sign = -1; else if (x === b && y === a) sign = 1;
          }
          if (sign) break;
        }
      }
      if (!sign) {
        if (Math.abs(n.z) > 0.999) {
          sign = (opts.horizontalUp ? 1 : -1) * Math.sign(n.z);
        } else if (opts.camPos) {
          const p0 = P(D, c.loop[0]);
          sign = n.dot(new Vector3().subVectors(opts.camPos, p0)) >= 0 ? 1 : -1;
        } else sign = 1;
      }
    }
    let loops = [c.loop.slice(), ...c.holes.map((h) => h.loop.slice())];
    if (sign < 0) loops = loops.map((l) => l.reverse());
    newFaces.push({
      id: nid(), loops,
      mat: inherit ? inherit.f.mat : (opts.defaultMat ?? null),
      back: inherit ? inherit.f.back : null,
      tag: inherit ? inherit.f.tag : null,
      hidden: inherit ? inherit.f.hidden : false,
      _from: inherit ? inherit.f.id : 0,
    });
  }
  // conserver les identifiants lorsque possible
  const reused = new Set();
  for (const nf of newFaces) {
    if (nf._from && !reused.has(nf._from)) { nf.id = nf._from; reused.add(nf._from); }
    delete nf._from;
  }
  for (const f of oldFaces) D.faces.delete(f.id);
  for (const nf of newFaces) { D.faces.set(nf.id, nf); created.push(nf.id); }
  D.touch();
  return created;
}
function onPolyBoundary(q, poly) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ab = new Vector2().subVectors(b, a); const l2 = ab.lengthSq(); if (!l2) continue;
    let t = new Vector2().subVectors(q, a).dot(ab) / l2; t = Math.max(0, Math.min(1, t));
    if (a.clone().addScaledVector(ab, t).distanceTo(q) < TOL) return true;
  }
  return false;
}

// Plans candidats passant par une arête
export function candidatePlanes(D, eid) {
  const e = D.edges.get(eid); if (!e) return [];
  const a = P(D, e.a), b = P(D, e.b); const d = new Vector3().subVectors(b, a).normalize();
  const out = [];
  const push = (n) => {
    if (n.lengthSq() < 1e-12) return; n.normalize();
    const pl = { n, w: n.dot(a) };
    if (!out.some((q) => samePlane(q, pl))) out.push(pl);
  };
  for (const o of D.edges.values()) {
    if (o.id === eid) continue;
    let c = null, base = null;
    if (o.a === e.a || o.a === e.b) { c = P(D, o.b); base = P(D, o.a); }
    else if (o.b === e.a || o.b === e.b) { c = P(D, o.a); base = P(D, o.b); }
    if (!c) continue;
    const w = new Vector3().subVectors(c, base).normalize();
    if (Math.abs(w.dot(d)) > 1 - 1e-6) continue;
    push(new Vector3().crossVectors(d, w));
  }
  for (const f of D.faces.values()) {
    const fp = facePlane(D, f);
    if (onPlane(a, fp) && onPlane(b, fp)) push(fp.n.clone());
  }
  return out;
}

// Après ajout d'arêtes : création / découpe automatique des faces
export function autoFace(D, edgeIds, opts = {}) {
  const set = new Set(edgeIds);
  const planes = [];
  for (const eid of edgeIds) for (const pl of candidatePlanes(D, eid)) if (!planes.some((q) => samePlane(q, pl))) planes.push(pl);
  const created = [];
  for (const pl of planes) created.push(...rebuildPlane(D, pl, { ...opts, newEdges: set }));
  return created;
}

export function drawPolyline(D, pts, closed, opts = {}) {
  const edges = [];
  for (let i = 0; i + 1 < pts.length; i++) edges.push(...addSegment(D, pts[i], pts[i + 1]));
  if (closed && pts.length > 2) edges.push(...addSegment(D, pts[pts.length - 1], pts[0]));
  const faces = autoFace(D, edges, opts);
  return { edges, faces };
}

// ---------------------------------------------------------------- Suppression
export function removeOrphans(D) {
  const used = new Set();
  for (const e of D.edges.values()) { used.add(e.a); used.add(e.b); }
  for (const f of D.faces.values()) for (const l of f.loops) for (const v of l) used.add(v);
  for (const id of [...D.verts.keys()]) if (!used.has(id)) D.verts.delete(id);
}
// fusionne les arêtes colinéaires autour d'un sommet de degré 2
export function healVertex(D, vid) {
  const es = [...D.edges.values()].filter((e) => e.a === vid || e.b === vid);
  if (es.length !== 2) return;
  const o1 = es[0].a === vid ? es[0].b : es[0].a, o2 = es[1].a === vid ? es[1].b : es[1].a;
  const p = P(D, vid), d1 = new Vector3().subVectors(P(D, o1), p).normalize(), d2 = new Vector3().subVectors(P(D, o2), p).normalize();
  if (d1.dot(d2) > -1 + 1e-6) return;
  if (D.ekey.get(key(o1, o2))) return;
  const props = { soft: es[0].soft, hidden: es[0].hidden, tag: es[0].tag, curve: es[0].curve === es[1].curve ? es[0].curve || 0 : 0 };
  removeEdgeRaw(D, es[0].id); removeEdgeRaw(D, es[1].id);
  newEdge(D, o1, o2, props);
  for (const f of D.faces.values()) f.loops = f.loops.map((l) => l.filter((x) => x !== vid));
  D.verts.delete(vid); D.touch();
}

export function eraseEdges(D, eids) {
  const planes = []; const ends = new Set();
  for (const eid of eids) {
    const e = D.edges.get(eid); if (!e) continue;
    for (const fid of facesOfEdge(D, e)) {
      const f = D.faces.get(fid); if (!f) continue;
      const pl = facePlane(D, f); if (!planes.some((q) => samePlane(q, pl))) planes.push(pl);
    }
    ends.add(e.a); ends.add(e.b);
    removeEdgeRaw(D, eid);
  }
  D._adj = null;
  // reconstruire (fusion des faces coplanaires)
  for (const pl of planes) rebuildPlane(D, pl, {});
  // supprimer les faces qui ne sont plus fermées
  for (const f of [...D.faces.values()]) {
    let ok = true;
    for (const l of f.loops) for (let i = 0; i < l.length && ok; i++) if (!D.ekey.get(key(l[i], l[(i + 1) % l.length]))) ok = false;
    if (!ok) D.faces.delete(f.id);
  }
  D._adj = null;
  removeOrphans(D);
  for (const v of ends) if (D.verts.has(v)) healVertex(D, v);
  D.touch();
}
export function eraseFaces(D, fids) { for (const id of fids) D.faces.delete(id); D.touch(); }

// ------------------------------------------------------------- Pousser / tirer
// face entourée uniquement de faces coplanaires n'appartenant pas à un volume (surface plate)
export function isFlatSheet(D, f) {
  const pl = facePlane(D, f); const adj = adjacency(D); const seen = new Set([f.id]); const st = [f.id];
  while (st.length) {
    const g = D.faces.get(st.pop());
    for (const l of g.loops) for (let i = 0; i < l.length; i++) {
      for (const o of adj.get(key(l[i], l[(i + 1) % l.length])) || []) {
        if (seen.has(o)) continue; const h = D.faces.get(o); if (!h) continue;
        if (!samePlane(facePlane(D, h), pl)) return false;
        seen.add(o); st.push(o);
      }
    }
  }
  return true;
}
export function isFreeFace(D, f) {
  const adj = adjacency(D);
  for (const l of f.loops) for (let i = 0; i < l.length; i++) {
    const fl = adj.get(key(l[i], l[(i + 1) % l.length])) || [];
    if (fl.some((x) => x !== f.id)) return false;
  }
  return true;
}
function canStretch(D, f, n) {
  const vs = vertsOfFace(f); let touching = 0;
  for (const g of D.faces.values()) {
    if (g.id === f.id) continue;
    let shares = false; for (const l of g.loops) for (const x of l) if (vs.has(x)) { shares = true; break; }
    if (!shares) continue;
    touching++;
    if (Math.abs(faceNormal(D, g).dot(n)) > 1e-4) return false;
  }
  // toutes les arêtes de la face doivent être bordées par une autre face
  const adj = adjacency(D);
  for (const l of f.loops) for (let i = 0; i < l.length; i++) {
    const fl = adj.get(key(l[i], l[(i + 1) % l.length])) || [];
    if (!fl.some((x) => x !== f.id)) return false;
  }
  return touching > 0;
}

export function pushPull(D, fid, dist, { copy = false } = {}) {
  const f = D.faces.get(fid); if (!f || Math.abs(dist) < TOL) return null;
  const n = faceNormal(D, f); const off = n.clone().multiplyScalar(dist);
  if (!copy && canStretch(D, f, n)) {
    for (const vid of vertsOfFace(f)) P(D, vid).add(off);
    D.touch(); return { face: fid, stretched: true };
  }
  const free = isFreeFace(D, f) || isFlatSheet(D, f);
  const map = new Map();
  for (const vid of vertsOfFace(f)) { map.set(vid, getVertex(D, P(D, vid).clone().add(off))); }
  const boundaryEdges = edgesOfFace(D, f);
  const rev = (free || copy) && dist < 0;
  const sides = []; const curveMap = new Map();
  const ecurve = (x, y) => { const id = D.ekey.get(key(x, y)); return id ? D.edges.get(id).curve || 0 : 0; };
  for (const l of f.loops) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length], z = l[(i - 1 + l.length) % l.length];
      const c1 = ecurve(z, a), c2 = ecurve(a, b);
      const vex = D.ekey.get(key(a, map.get(a)));
      newEdge(D, a, map.get(a), { soft: !vex && c1 && c1 === c2 });
      let nc = 0; if (c2) { nc = curveMap.get(c2); if (!nc) { nc = nid(); curveMap.set(c2, nc); } }
      newEdge(D, map.get(a), map.get(b), { curve: nc });
      let q = [a, b, map.get(b), map.get(a)];
      if (rev) q = q.reverse();
      const sid = nid(); D.faces.set(sid, { id: sid, loops: [q], mat: f.mat, back: null, tag: f.tag, hidden: false });
      sides.push(sid);
    }
  }
  let top = f.loops.map((l) => l.map((x) => map.get(x)));
  if (rev) top = top.map((l) => l.slice().reverse());
  const tid = nid();
  D.faces.set(tid, { id: tid, loops: top, mat: f.mat, back: f.back, tag: f.tag, hidden: false });
  if (copy) { /* garder l'original tel quel */ }
  else if (free) { if (dist > 0) f.loops = f.loops.map((l) => l.slice().reverse()); }
  else D.faces.delete(fid);
  D._adj = null;

  // perçage : la nouvelle face coïncide avec une face opposée
  const tf = D.faces.get(tid); const tp = facePlane(D, tf);
  const tn = tp.n;
  for (const g of [...D.faces.values()]) {
    if (g.id === tid) continue;
    const gp = facePlane(D, g);
    if (gp.n.dot(tn) < -1 + 1e-6 && Math.abs(gp.w + tp.w) < TOL) {
      const c = faceCenter(D, tf);
      D.faces.delete(tid);
      for (const l of top) for (let i = 0; i < l.length; i++) newEdge(D, l[i], l[(i + 1) % l.length]);
      rebuildPlane(D, gp, { exclude: [c] });
      break;
    }
  }
  // fusion des faces coplanaires (ex : côté prolongé)
  for (const eid of boundaryEdges) mergeCoplanarAt(D, eid);
  removeOrphans(D);
  D.touch();
  return { face: D.faces.has(tid) ? tid : 0, sides };
}

export function mergeCoplanarAt(D, eid) {
  const e = D.edges.get(eid); if (!e) return false;
  const fl = facesOfEdge(D, e); if (fl.length !== 2) return false;
  const A = D.faces.get(fl[0]), B = D.faces.get(fl[1]); if (!A || !B) return false;
  const na = faceNormal(D, A), nb = faceNormal(D, B);
  if (na.dot(nb) < 1 - 1e-6) return false;
  if ((A.mat || null) !== (B.mat || null)) return false;
  const pl = facePlane(D, A);
  const ends = [e.a, e.b];
  removeEdgeRaw(D, eid);
  for (const fid of fl) D.faces.delete(fid);
  // remettre provisoirement les faces pour l'héritage
  D.faces.set(A.id, A); D.faces.set(B.id, B);
  D._adj = null;
  rebuildPlane(D, pl, {});
  removeOrphans(D);
  for (const v of ends) if (D.verts.has(v)) healVertex(D, v);
  return true;
}

// --------------------------------------------------------------- Transformations
export function transformVerts(D, vids, m) {
  for (const id of vids) { const v = D.verts.get(id); if (v) v.p.applyMatrix4(m); }
  weld(D, vids);
  D.touch();
}
// soude les sommets confondus après déplacement
export function weld(D, vids) {
  for (const id of vids) {
    const v = D.verts.get(id); if (!v) continue;
    let other = 0;
    for (const o of D.verts.values()) if (o.id !== id && o.p.distanceToSquared(v.p) < TOL * TOL) { other = o.id; break; }
    if (!other) continue;
    replaceVertex(D, id, other);
  }
}
export function replaceVertex(D, from, to) {
  for (const e of [...D.edges.values()]) {
    if (e.a !== from && e.b !== from) continue;
    removeEdgeRaw(D, e.id);
    const a = e.a === from ? to : e.a, b = e.b === from ? to : e.b;
    if (a !== b) newEdge(D, a, b, { soft: e.soft, hidden: e.hidden, tag: e.tag, curve: e.curve || 0 });
  }
  for (const f of [...D.faces.values()]) {
    f.loops = f.loops.map((l) => {
      const r = l.map((x) => (x === from ? to : x));
      return r.filter((x, i) => x !== r[(i + 1) % r.length]);
    }).filter((l) => l.length >= 3);
    if (!f.loops.length) D.faces.delete(f.id);
  }
  D.verts.delete(from); D._adj = null;
}

// ------------------------------------------------------------------ Décalage
export function offsetFace(D, fid, d, opts = {}) {
  const f = D.faces.get(fid); if (!f) return null;
  const n = faceNormal(D, f); const pts = f.loops[0].map((x) => P(D, x));
  const m = pts.length; const out = [];
  // supprimer les sommets colinéaires pour le calcul
  const idx = []; for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m], b = pts[i], c = pts[(i + 1) % m];
    const d1 = new Vector3().subVectors(b, a).normalize(), d2 = new Vector3().subVectors(c, b).normalize();
    if (d1.dot(d2) < 1 - 1e-7) idx.push(i);
  }
  const q = idx.map((i) => pts[i]); const k = q.length;
  for (let i = 0; i < k; i++) {
    const a = q[(i - 1 + k) % k], b = q[i], c = q[(i + 1) % k];
    const d1 = new Vector3().subVectors(b, a).normalize(), d2 = new Vector3().subVectors(c, b).normalize();
    const in1 = new Vector3().crossVectors(n, d1), in2 = new Vector3().crossVectors(n, d2); // vers l'intérieur
    const bis = in1.clone().add(in2); const cos = in1.dot(bis.clone().normalize());
    bis.normalize().multiplyScalar(d / Math.max(cos, 0.05));
    out.push(b.clone().add(bis));
  }
  return drawPolyline(D, out, true, opts);
}

// ---------------------------------------------------------------- Suivez-moi
export function followMe(D, fid, path, closedPath) {
  const f = D.faces.get(fid); if (!f || path.length < 2) return null;
  const prof = f.loops[0].map((x) => P(D, x).clone());
  const N = path.length; const segs = [];
  for (let i = 0; i + 1 < N; i++) segs.push(new Vector3().subVectors(path[i + 1], path[i]).normalize());
  if (closedPath) segs.push(new Vector3().subVectors(path[0], path[N - 1]).normalize());
  const rings = [];
  // anneau initial : profil projeté sur le plan perpendiculaire au départ
  const n0 = closedPath ? segs[segs.length - 1].clone().add(segs[0]).normalize() : segs[0].clone();
  const projectAlong = (pt, dir, origin, nrm) => { const t = nrm.dot(new Vector3().subVectors(origin, pt)) / nrm.dot(dir); return pt.clone().addScaledVector(dir, t); };
  rings.push(prof.map((p) => projectAlong(p, segs[0], path[0], n0)));
  const count = closedPath ? N : N - 1;
  for (let i = 1; i <= count; i++) {
    const dPrev = segs[i - 1]; const origin = path[i % N];
    let nrm;
    if (!closedPath && i === N - 1) nrm = dPrev.clone();
    else nrm = dPrev.clone().add(segs[i % segs.length]).normalize();
    rings.push(rings[i - 1].map((p) => projectAlong(p, dPrev, origin, nrm)));
  }
  D.faces.delete(fid);
  const ring = rings.map((r) => r.map((p) => getVertex(D, p)));
  const mk = (loop) => { for (let i = 0; i < loop.length; i++) newEdge(D, loop[i], loop[(i + 1) % loop.length]); const id = nid(); D.faces.set(id, { id, loops: [loop], mat: f.mat, back: null, tag: f.tag, hidden: false }); return id; };
  const M = prof.length; const created = [];
  for (let r = 0; r + 1 < ring.length; r++) {
    for (let i = 0; i < M; i++) {
      const a = ring[r][i], b = ring[r][(i + 1) % M], c = ring[r + 1][(i + 1) % M], d = ring[r + 1][i];
      if (new Set([a, b, c, d]).size < 3) continue;
      created.push(mk([a, d, c, b]));
    }
  }
  if (!closedPath) { created.push(mk(ring[0].slice())); created.push(mk(ring[ring.length - 1].slice().reverse())); }
  // orientation : vérifier que les normales pointent vers l'extérieur
  orientOutward(D, created);
  for (const r of ring) for (const v of r) healVertex(D, v);
  D.touch();
  return created;
}

// oriente un ensemble de faces fermé vers l'extérieur (test du volume signé)
export function orientOutward(D, fids) {
  let vol = 0;
  for (const id of fids) {
    const f = D.faces.get(id); if (!f) continue;
    const l = f.loops[0]; const p0 = P(D, l[0]);
    for (let i = 1; i + 1 < l.length; i++) vol += p0.dot(new Vector3().crossVectors(P(D, l[i]), P(D, l[i + 1])));
  }
  if (vol < 0) for (const id of fids) { const f = D.faces.get(id); if (f) f.loops = f.loops.map((l) => l.slice().reverse()); }
}

export function reverseFace(D, fid) {
  const f = D.faces.get(fid); if (!f) return;
  f.loops = f.loops.map((l) => l.slice().reverse()); const m = f.mat; f.mat = f.back; f.back = m; D.touch();
}

// --------------------------------------------- Maillage triangulé -> faces (import / booléens)
export function meshToDef(D, positions, matrix) {
  const vmap = new Map(); const tris = [];
  const q = (x) => Math.round(x * 1000) / 1000;
  const vid = (x, y, z) => {
    const k = q(x) + ',' + q(y) + ',' + q(z);
    let id = vmap.get(k); if (id) return id;
    id = nid(); D.verts.set(id, { id, p: new Vector3(x, y, z) }); vmap.set(k, id); return id;
  };
  const v3 = new Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    const ids = [];
    for (let j = 0; j < 3; j++) {
      v3.set(positions[i + j * 3], positions[i + j * 3 + 1], positions[i + j * 3 + 2]); if (matrix) v3.applyMatrix4(matrix);
      ids.push(vid(v3.x, v3.y, v3.z));
    }
    if (new Set(ids).size === 3) tris.push(ids);
  }
  // normales et regroupement coplanaire connexe
  const tn = tris.map((t) => { const a = P(D, t[0]), b = P(D, t[1]), c = P(D, t[2]); const n = new Vector3().crossVectors(new Vector3().subVectors(b, a), new Vector3().subVectors(c, a)); const l = n.length(); return l > 1e-12 ? n.divideScalar(l) : null; });
  const eTri = new Map();
  tris.forEach((t, i) => { if (!tn[i]) return; for (let j = 0; j < 3; j++) { const k = key(t[j], t[(j + 1) % 3]); let a = eTri.get(k); if (!a) eTri.set(k, (a = [])); a.push(i); } });
  const group = new Int32Array(tris.length).fill(-1); let g = 0;
  for (let i = 0; i < tris.length; i++) {
    if (group[i] >= 0 || !tn[i]) continue;
    const st = [i]; group[i] = g; const n0 = tn[i]; const w0 = n0.dot(P(D, tris[i][0]));
    while (st.length) {
      const x = st.pop(); const t = tris[x];
      for (let j = 0; j < 3; j++) for (const y of eTri.get(key(t[j], t[(j + 1) % 3])) || []) {
        if (group[y] >= 0 || !tn[y]) continue;
        if (tn[y].dot(n0) > 1 - 1e-5 && Math.abs(n0.dot(P(D, tris[y][0])) - w0) < 0.05) { group[y] = g; st.push(y); }
      }
    }
    g++;
  }
  const fids = [];
  for (let gi = 0; gi < g; gi++) {
    const members = []; for (let i = 0; i < tris.length; i++) if (group[i] === gi) members.push(i);
    // arêtes de bord orientées
    const cnt = new Map();
    for (const i of members) { const t = tris[i]; for (let j = 0; j < 3; j++) { const a = t[j], b = t[(j + 1) % 3]; const k = key(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); } }
    const next = new Map();
    for (const i of members) { const t = tris[i]; for (let j = 0; j < 3; j++) { const a = t[j], b = t[(j + 1) % 3]; if (cnt.get(key(a, b)) === 1) { if (!next.has(a)) next.set(a, []); next.get(a).push(b); } } }
    const loops = []; const usedE = new Set();
    for (const [a] of next) {
      for (const b0 of next.get(a)) {
        if (usedE.has(a + '>' + b0)) continue;
        const loop = [a]; let x = a, y = b0, guard = 0;
        while (guard++ < 100000) {
          usedE.add(x + '>' + y); if (y === a) break; loop.push(y);
          const cand = (next.get(y) || []).filter((z) => !usedE.has(y + '>' + z));
          if (!cand.length) break; x = y; y = cand[0];
        }
        if (loop.length >= 3) loops.push(loop);
      }
    }
    if (!loops.length) continue;
    const n0 = tn[members[0]];
    loops.sort((l1, l2) => Math.abs(loopArea(D, l2, n0)) - Math.abs(loopArea(D, l1, n0)));
    const id = nid(); D.faces.set(id, { id, loops, mat: null, back: null, tag: null, hidden: false }); fids.push(id);
    for (const l of loops) for (let i = 0; i < l.length; i++) newEdge(D, l[i], l[(i + 1) % l.length]);
  }
  // adoucir les arêtes entre faces quasi-coplanaires (surfaces courbes)
  D._adj = null;
  for (const e of D.edges.values()) {
    const fl = facesOfEdge(D, e); if (fl.length !== 2) continue;
    const a = faceNormal(D, D.faces.get(fl[0])), b = faceNormal(D, D.faces.get(fl[1]));
    if (a.dot(b) > Math.cos(25 * Math.PI / 180)) e.soft = true;
  }
  // nettoyer les sommets colinéaires
  for (const v of [...D.verts.keys()]) healVertex(D, v);
  removeOrphans(D);
  D.touch();
  return fids;
}
function loopArea(D, l, n) { const s = new Vector3(); for (let i = 0; i < l.length; i++) s.add(new Vector3().crossVectors(P(D, l[i]), P(D, l[(i + 1) % l.length]))); return s.dot(n) / 2; }

// --------------------------------------------------------------- Triangulation
export function triangulateFace(D, f) {
  const n = faceNormal(D, f); const { u, v } = planeBasis(n);
  const ids = []; const loops2 = f.loops.map((l) => l.map((x) => { ids.push(x); const p = P(D, x); return new Vector2(p.dot(u), p.dot(v)); }));
  let tris = [];
  try { tris = ShapeUtils.triangulateShape(loops2[0], loops2.slice(1)); } catch (e) { tris = []; }
  const out = [];
  for (const t of tris) {
    let a = ids[t[0]], b = ids[t[1]], c = ids[t[2]];
    const pa = P(D, a), pb = P(D, b), pc = P(D, c);
    const tn = new Vector3().crossVectors(new Vector3().subVectors(pb, pa), new Vector3().subVectors(pc, pa));
    if (tn.dot(n) < 0) { const s = b; b = c; c = s; }
    out.push([a, b, c]);
  }
  return { n, u, v, tris: out };
}

// ----------------------------------------------------------- Copie de géométrie
export function copyGeometry(src, dst, faceIds, edgeIds, m) {
  const vm = new Map();
  const V = (id) => { if (vm.has(id)) return vm.get(id); const p = src.verts.get(id).p.clone(); if (m) p.applyMatrix4(m); const n = getVertex(dst, p); vm.set(id, n); return n; };
  const newF = [], newE = [];
  const eset = new Set(edgeIds);
  for (const fid of faceIds) { const f = src.faces.get(fid); if (!f) continue; for (const e of edgesOfFace(src, f)) eset.add(e); }
  for (const eid of eset) { const e = src.edges.get(eid); if (!e) continue; const a = V(e.a), b = V(e.b); if (a !== b) newE.push(newEdge(dst, a, b, { soft: e.soft, hidden: e.hidden, tag: e.tag, curve: e.curve || 0 })); }
  const flip = m && m.determinant() < 0;
  for (const fid of faceIds) {
    const f = src.faces.get(fid); if (!f) continue;
    let loops = f.loops.map((l) => l.map(V)); if (flip) loops = loops.map((l) => l.reverse());
    const id = nid(); dst.faces.set(id, { id, loops, mat: f.mat, back: f.back, tag: f.tag, hidden: f.hidden }); newF.push(id);
  }
  dst.touch();
  return { faces: newF, edges: newE, vmap: vm };
}

export function bboxOfDef(defs, D, m, box) {
  for (const v of D.verts.values()) box.expandByPoint(v.p.clone().applyMatrix4(m));
  for (const it of D.insts.values()) { const d = defs.get(it.def); if (d) bboxOfDef(defs, d, m.clone().multiply(it.m), box); }
  return box;
}

export { Vector3, Vector2, Matrix4 };
