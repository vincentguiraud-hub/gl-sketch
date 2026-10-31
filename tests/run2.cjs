const { start } = require('./harness.cjs');
const R = []; const ok = (name, cond, info) => { if (!cond) process.exitCode = 1; R.push((cond ? '✅ ' : '❌ ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const H = await start();
  // Suivez-moi : profil vertical sur bord d'un plateau
  await H.tool('rect'); await H.click(0,0,0); await H.hover(500,500,0); await H.type('2000;1000'); await H.zx();
  await H.tool('rect'); await H.key('ArrowLeft'); await H.click(0,0,0); await H.hover(-50,0,50); await H.type('100;100');
  let s = await H.st(); ok('Profil vertical (plan vert)', s.f === 2, s);
  const ids = await H.ev(() => { const D = glsketch.app.activeDef; const fs = [...D.faces.values()]; const g = fs.find(f => f.loops[0].every(v => Math.abs(D.verts.get(v).p.z) < 0.01)); const pr = fs.find(f => f !== g); glsketch.app.sel.clear(); glsketch.app.sel.add('f:' + g.id); glsketch.app.refreshSelection(); const c = pr.loops[0].map(v => D.verts.get(v).p).reduce((a, p) => [a[0] + p.x / 4, a[1] + p.y / 4, a[2] + p.z / 4], [0, 0, 0]); return c; });
  await H.tool('followme'); await H.click(...ids);
  s = await H.st(); ok('Suivez-moi autour du plateau', s.f >= 16, s);
  const solid = await H.ev(() => { const D = glsketch.app.activeDef; const cnt = new Map(); for (const f of D.faces.values()) for (let l of f.loops) for (let i=0;i<l.length;i++){const k=[l[i],l[(i+1)%l.length]].sort().join(); cnt.set(k,(cnt.get(k)||0)+1);} return [...cnt.values()].filter(c=>c!==2).length; });
  ok('Suivez-moi : arêtes bien fermées', solid <= 8, solid);
  await H.shot('f1');
  // Rectangle pivoté
  await H.reset(); await H.tool('rotrect'); await H.click(0,0,0); await H.click(1000,1000,0); await H.hover(0,1400,0); await H.type('500');
  s = await H.st(); ok('Rectangle pivoté', s.f === 1 && s.e === 4, s);
  // Rapporteur
  await H.zx(); await H.tool('protractor'); await H.click(0,0,0); await H.click(1000,1000,0); await H.hover(-500,1000,0); await H.type('30');
  ok('Rapporteur : guide', await H.ev(() => glsketch.app.model.guides.length) === 1);
  // Texte
  await H.tool('text'); await H.click(500,500,0); await H.click(800,-300,0); await H.p.waitForTimeout(200); const modal = await H.ev(() => document.querySelector('#modal').classList.contains('on'));
  if (modal) { await H.p.click('.mbtns .primary'); } ok('Texte', await H.ev(() => glsketch.app.model.texts.length) === 1, modal);
  // Plan de section
  await H.reset(); await H.box(2000, 1000, 1000); await H.tool('section'); await H.click(1000, 0, 500); await H.hover(1000, 300, 500); await H.type('400');
  const sec = await H.ev(() => { const s = glsketch.app.model.sections[0]; return s ? [s.p.y, s.active] : null; }); ok('Section décalée de 400 vers l\'intérieur', sec && Math.abs(sec[0] - 400) < 1, sec);
  await H.shot('sec');
  // Visite / regarder / zoom fenêtre (pas d'erreur)
  await H.ev(() => { glsketch.app.model.sections = []; glsketch.app.refreshAnnotations(); });
  await H.tool('zoomwin'); await H.dragS(500, 300, 800, 500); ok('Zoom fenêtre revient à l\'outil précédent', await H.ev(() => glsketch.toolName) !== 'zoomwin', await H.ev(() => glsketch.toolName));
  await H.tool('walk'); await H.p.waitForTimeout(600); await H.dragS(600, 400, 600, 300); const z = await H.ev(() => Math.round(glsketch.app.camera.position.z)); ok('Visite à hauteur des yeux', z > 1000 && z < 2500, z);
  await H.tool('select'); await H.zx();
  // Balises
  await H.key('Control+a'); await H.key('Control+g');
  await H.ev(() => { const a = glsketch.app; a.model.tags.push({ id: 'tX', name: 'Métal', visible: true }); const it = [...a.model.root.insts.values()][0]; it.tag = 'tX'; a.model.tags[1].visible = false; a.refresh(); });
  ok('Balise masquée cache le groupe', await H.ev(() => glsketch.app.pickMeshes.length === 0), await H.ev(() => glsketch.app.pickMeshes.length));
  await H.ev(() => { const a = glsketch.app; a.model.tags[1].visible = true; a.refresh(); });
  // Scènes
  await H.ev(() => { glsketch.app.model.scenes.push(glsketch.sceneState('Vue 1')); glsketch.renderScenes(); glsketch.app.setView('top'); });
  await H.p.waitForTimeout(700); await H.p.click('.stab'); await H.p.waitForTimeout(1100);
  ok('Scène restaure la caméra', await H.ev(() => glsketch.app.camera.position.z < 9000 && Math.abs(glsketch.app.camera.position.x) > 100));
  // Solides : soustraire
  await H.reset(); await H.box(1000, 1000, 1000); await H.key('Control+a'); await H.key('Control+g');
  await H.tool('rect'); await H.click(300, 300, 1000); await H.hover(600, 600, 1000); await H.type('300;300');
  await H.tool('pushpull'); await H.click(450, 450, 1000); await H.hover(450, 450, 800); await H.type('500');
  await H.tool('select'); await H.zx(); await H.ev(() => { const a = glsketch.app; const D = a.activeDef; a.sel.clear(); for (const id of D.faces.keys()) a.sel.add('f:' + id); for (const id of D.edges.keys()) a.sel.add('e:' + id); });
  await H.key('Control+g'); s = await H.st(); ok('2 groupes', s.i === 2, s);
  await H.ev(() => { const a = glsketch.app; a.sel.clear(); const ids = [...a.model.root.insts.keys()]; a.sel.add('i:' + ids[1]); a.sel.add('i:' + ids[0]); glsketch.cmd('solid:sub'); });
  s = await H.st(); const subOk = await H.ev(() => { const it = [...glsketch.app.model.root.insts.values()][0]; const d = glsketch.app.model.defs.get(it.def); return [d.faces.size, d.edges.size]; });
  ok('Soustraire : rainure', s.i === 1 && subOk[0] >= 8, { s, subOk });
  await H.shot('sub');
  // Éclater
  await H.ev(() => { const a = glsketch.app; a.sel.clear(); a.sel.add('i:' + [...a.model.root.insts.keys()][0]); glsketch.cmd('explode'); });
  s = await H.st(); ok('Éclater', s.i === 0 && s.f >= 8, s);
  // Déplacer un sommet (étirement)
  await H.reset(); await H.box(1000, 1000, 1000);
  await H.tool('select'); await H.click(500, 0, 1000); // arête avant-haut
  await H.tool('move'); await H.click(500, 0, 1000); await H.hover(500, 0, 1300); await H.key('ArrowUp'); await H.hover(500,0,1200); await H.type('500');
  const mz = await H.ev(() => Math.max(...[...glsketch.app.activeDef.verts.values()].map(v => v.p.z))); ok('Déplacer arête = toit incliné', Math.abs(mz - 1500) < 0.1, mz);
  // Gomme glisser + Maj masquer + Ctrl adoucir
  await H.reset(); await H.box(1000,1000,1000); const e0 = (await H.st()).e;
  await H.tool('eraser'); const [ax, ay] = await H.W(0, 500, 1000); await H.p.keyboard.down('Control'); const b = await (await H.p.$('#viewport')).boundingBox(); await H.p.mouse.move(b.x + ax, b.y + ay); await H.p.mouse.down(); await H.p.mouse.up(); await H.p.keyboard.up('Control');
  ok('Gomme Ctrl = adoucir', await H.ev(() => [...glsketch.app.activeDef.edges.values()].some(e => e.soft)));
  // Import STL roundtrip
  await H.reset(); await H.box(1000,1000,1000); await H.key('Control+a'); await H.key('Control+g');
  const n = await H.ev(async () => { let data; glsketch.saveFile = async (n, d) => { data = d; }; await glsketch.cmd('expSTL'); await glsketch.openData('test.stl', data.buffer.slice(0)); return glsketch.toolName; });
  await H.zx(); await H.click(500, 500, 1000); s = await H.st(); ok('Import STL', s.i === 2, { n, s });
  const impD = await H.ev(() => { const d = [...glsketch.app.model.defs.values()].find(d => d.name === 'test'); return d ? [d.faces.size, d.edges.size] : null; }); ok('STL : faces fusionnées (6 faces)', impD && impD[0] === 6, impD);
  // Générateurs + rapport
  await H.reset();
  for (const g of ['gen:gc', 'gen:esc', 'gen:perg', 'gen:port']) { await H.ev((g) => glsketch.cmd(g), g); await H.p.waitForTimeout(200); await H.p.click('.mbtns .primary'); await H.p.waitForTimeout(250); if (await H.ev(() => document.querySelector('#modal').classList.contains('on'))) { await H.p.click('.mbtns .primary'); await H.p.waitForTimeout(250); } await H.zx(); await H.click(0, 0, 0); await H.key('Escape'); }
  s = await H.st(); ok('4 générateurs placés', s.i === 4, s);
  // Profilé sur mesure vertical
  await H.ev(() => glsketch.cmd('gen:prof')); await H.p.waitForTimeout(200); await H.p.selectOption('select[name=dir]', 'z'); await H.p.click('.mbtns .primary'); await H.p.waitForTimeout(200); await H.zx(); await H.click(0, 0, 0);
  s = await H.st(); ok('Profilé sur mesure', s.i === 5, s);
  // Sauver / recharger
  const rl = await H.ev(() => { const j = JSON.parse(JSON.stringify(glsketch.app.model.toJSON())); const n0 = glsketch.app.model.defs.size; glsketch.app.load(j); return [n0, glsketch.app.model.defs.size, glsketch.app.model.root.insts.size]; });
  ok('Enregistrer / recharger', rl[0] === rl[1] && rl[2] === 5, rl);
  await H.ev(() => glsketch.cmd('fs:textured')); await H.zx(); await H.shot('gen');
  console.log(R.join('\n')); if (H.errs.length) { process.exitCode = 1; console.log('ERREURS JS :\n' + H.errs.slice(0, 10).join('\n')); }
  await H.b.close();
})();
