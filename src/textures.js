// Textures procédurales (dessinées sur canvas, sans fichiers externes)
import * as THREE from 'three';

function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shade(hex, k) {
  const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 }; c.getHSL(h);
  c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + k))); return '#' + c.getHexString();
}
export function drawTexture(kind, color, S = 512) {
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const R = rnd(kind.length * 977 + S);
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const noise = (n, a, sz = 2) => { for (let i = 0; i < n; i++) { x.fillStyle = shade(color, (R() - 0.5) * a); x.fillRect(R() * S, R() * S, sz + R() * sz, sz + R() * sz); } };
  if (kind === 'brick') {
    const rows = 16, bw = S / 4, bh = S / rows; x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let i = -1; i < 5; i++) {
      const ox = (r % 2) * bw / 2; x.fillStyle = shade(color, (R() - 0.5) * 0.12);
      x.fillRect(i * bw + ox + 3, r * bh + 3, bw - 6, bh - 6);
    }
    noise(4000, 0.15, 1.5);
  } else if (kind === 'wood' || kind === 'parquet') {
    if (kind === 'parquet') {
      const pw = S / 4, ph = S; for (let i = 0; i < 4; i++) { const off = R() * S; x.save(); x.beginPath(); x.rect(i * pw, 0, pw, ph); x.clip(); woodGrain(x, i * pw, pw, S, color, R, off); x.restore(); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * pw, 0, 2, S); x.fillRect(i * pw, (R() * S) | 0, pw, 2); }
    } else woodGrain(x, 0, S, S, color, R, 0);
  } else if (kind === 'corten') {
    noise(9000, 0.25, 3);
    for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(${R() > 0.5 ? '60,25,10' : '190,110,50'},${0.08 + R() * 0.15})`; x.beginPath(); x.ellipse(R() * S, R() * S, 8 + R() * 40, 5 + R() * 25, R() * 3, 0, 7); x.fill(); }
    noise(6000, 0.2, 1);
  } else if (kind === 'metal') {
    for (let y = 0; y < S; y++) { x.fillStyle = shade(color, (R() - 0.5) * 0.06); x.fillRect(0, y, S, 1); }
    x.globalAlpha = 0.25; for (let i = 0; i < 400; i++) { x.fillStyle = shade(color, (R() - 0.5) * 0.2); x.fillRect(R() * S, R() * S, 40 + R() * 160, 1); } x.globalAlpha = 1;
  } else if (kind === 'concrete') {
    noise(16000, 0.12, 2); for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.arc(R() * S, R() * S, R() * 2.5, 0, 7); x.fill(); }
  } else if (kind === 'tiles') {
    const n = 4, t = S / n; noise(3000, 0.05); x.strokeStyle = '#b9b3a8'; x.lineWidth = 4;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * t, 0); x.lineTo(i * t, S); x.stroke(); x.beginPath(); x.moveTo(0, i * t); x.lineTo(S, i * t); x.stroke(); }
  } else if (kind === 'stone') {
    x.fillStyle = '#8c826f'; x.fillRect(0, 0, S, S);
    let y = 0; while (y < S) { const h = 50 + R() * 70; let xx = -R() * 80; while (xx < S) { const w = 70 + R() * 120; x.fillStyle = shade(color, (R() - 0.5) * 0.18); x.fillRect(xx + 3, y + 3, w - 6, h - 6); xx += w; } y += h; }
    noise(6000, 0.15, 1.5);
  } else if (kind === 'grass') {
    noise(20000, 0.22, 2); for (let i = 0; i < 3000; i++) { x.strokeStyle = shade(color, (R() - 0.3) * 0.3); x.beginPath(); const px = R() * S, py = R() * S; x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 6, py - 4 - R() * 8); x.stroke(); }
  } else if (kind === 'gravel') {
    for (let i = 0; i < 2500; i++) { x.fillStyle = shade(color, (R() - 0.5) * 0.4); x.beginPath(); x.ellipse(R() * S, R() * S, 2 + R() * 6, 2 + R() * 5, R() * 3, 0, 7); x.fill(); }
  } else if (kind === 'roof') {
    const rows = 8, h = S / rows, w = S / 6;
    for (let r = 0; r < rows; r++) for (let i = -1; i < 7; i++) {
      const ox = (r % 2) * w / 2; const g = x.createLinearGradient(0, r * h, 0, r * h + h); g.addColorStop(0, shade(color, 0.08)); g.addColorStop(1, shade(color, -0.12));
      x.fillStyle = g; x.beginPath(); x.moveTo(i * w + ox + 2, r * h); x.lineTo(i * w + ox + w - 2, r * h); x.lineTo(i * w + ox + w - 2, r * h + h - 6); x.quadraticCurveTo(i * w + ox + w / 2, r * h + h + 4, i * w + ox + 2, r * h + h - 6); x.fill();
    }
  }
  return c;
}
function woodGrain(x, x0, w, S, color, R, off) {
  x.fillStyle = color; x.fillRect(x0, 0, w, S);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = shade(color, (R() - 0.6) * 0.18); x.lineWidth = 1 + R() * 3; x.beginPath();
    const bx = x0 + R() * w; x.moveTo(bx, 0);
    for (let y = 0; y <= S; y += 16) x.lineTo(bx + Math.sin((y + off) / (40 + i)) * 6 + Math.sin(y / 9) * 1.2, y);
    x.stroke();
  }
}
export function makeTexture(md, onLoad) {
  let tex;
  if (md.tex?.kind === 'image' && md.tex.data) {
    const img = new Image(); tex = new THREE.Texture(img); img.onload = () => { tex.needsUpdate = true; onLoad && onLoad(); }; img.src = md.tex.data;
  } else tex = new THREE.CanvasTexture(drawTexture(md.tex.kind, md.color));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
export function swatchURL(md, size = 64) {
  if (!md.tex) return null;
  if (md.tex.kind === 'image') return md.tex.data;
  const c = drawTexture(md.tex.kind, md.color, 256); const s = document.createElement('canvas'); s.width = s.height = size;
  s.getContext('2d').drawImage(c, 0, 0, size, size); return s.toDataURL();
}
