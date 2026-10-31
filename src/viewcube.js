// Cube de vue (coin supérieur droit) : orientation de la caméra, clic = vue standard
import * as THREE from 'three';

const FACES = [ // ordre des matériaux de BoxGeometry : +x, -x, +y, -y, +z, -z
  ['DROITE', new THREE.Vector3(1, 0, 0)], ['GAUCHE', new THREE.Vector3(-1, 0, 0)], ['ARRIÈRE', new THREE.Vector3(0, 1, 0)],
  ['FACE', new THREE.Vector3(0, -1, 0)], ['DESSUS', new THREE.Vector3(0, 0, 1)], ['DESSOUS', new THREE.Vector3(0, 0, -1)],
];
export class ViewCube {
  constructor(el, app) {
    this.el = el; this.app = app; const S = this.size = 104;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); this.r.setSize(S, S);
    el.appendChild(this.r.domElement);
    this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0.1, 20); this.cam.up.set(0, 0, 1);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-1, -2, 3); this.scene.add(dl);
    this.build(); this.hover = -1;
    const rc = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    const pick = (e) => { const b = this.r.domElement.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); rc.setFromCamera(ndc, this.cam); const h = rc.intersectObject(this.cube)[0]; return h || null; };
    this.r.domElement.addEventListener('pointermove', (e) => { const h = pick(e); const f = h ? h.face.materialIndex : -1; if (f !== this.hover) { this.hover = f; this.paint(); } this.r.domElement.style.cursor = h ? 'pointer' : 'default'; });
    this.r.domElement.addEventListener('pointerleave', () => { this.hover = -1; this.paint(); });
    this.r.domElement.addEventListener('click', (e) => {
      const h = pick(e); if (!h) return;
      const p = h.point; const d = new THREE.Vector3(Math.abs(p.x) > 0.62 ? Math.sign(p.x) : 0, Math.abs(p.y) > 0.62 ? Math.sign(p.y) : 0, Math.abs(p.z) > 0.62 ? Math.sign(p.z) : 0);
      if (d.lengthSq() === 0) d.copy(FACES[h.face.materialIndex][1]);
      app.setViewDir(d);
    });
    app.on('frame', () => this.sync());
    this.sync();
  }
  build() {
    if (this.cube) this.scene.remove(this.cube, this.edges, this.ring);
    const dark = document.documentElement.dataset.theme === 'dark';
    this.mats = FACES.map(([label]) => new THREE.MeshLambertMaterial({ map: this.tex(label, false, dark) }));
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), this.mats); this.scene.add(this.cube);
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.cube.geometry), new THREE.LineBasicMaterial({ color: dark ? 0x9aa4b2 : 0x6b7280 })); this.scene.add(this.edges);
    // anneau boussole
    const ring = new THREE.Group(); const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 1.35, -0.8)); }
    ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: dark ? 0x6b7280 : 0x9ca3af })));
    const nc = document.createElement('canvas'); nc.width = nc.height = 64; const x = nc.getContext('2d'); x.fillStyle = '#e8762c'; x.font = 'bold 44px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('N', 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), depthTest: false })); sp.scale.set(0.42, 0.42, 1); sp.position.set(0, 1.35, -0.8); ring.add(sp);
    this.ring = ring; this.scene.add(ring); this.dark = dark;
  }
  tex(label, hot, dark) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = hot ? '#ffb27a' : dark ? '#3a404a' : '#f3f4f6'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = dark ? '#5b6472' : '#d1d5db'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
    x.fillStyle = hot ? '#7c2d12' : dark ? '#e5e7eb' : '#374151'; x.font = `600 ${label.length > 6 ? 19 : 23}px system-ui,"Segoe UI",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 64, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  paint() {
    const dark = document.documentElement.dataset.theme === 'dark';
    if (dark !== this.dark) this.build();
    this.mats.forEach((m, i) => { m.map.dispose(); m.map = this.tex(FACES[i][0], i === this.hover, dark); m.needsUpdate = true; });
    this.render();
  }
  sync() {
    const a = this.app; const d = new THREE.Vector3().subVectors(a.camera.position, a.target).normalize();
    this.cam.position.copy(d.multiplyScalar(6)); this.cam.lookAt(0, 0, 0);
    const dark = document.documentElement.dataset.theme === 'dark'; if (dark !== this.dark) this.paint();
    this.render();
  }
  render() { this.r.render(this.scene, this.cam); }
}
