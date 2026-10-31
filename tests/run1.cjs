const { start } = require('./harness.cjs');
const R = []; const ok = (name, cond, info) => { if (!cond) process.exitCode = 1; R.push((cond ? '✅ ' : '❌ ') + name + (info ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const H = await start();
  // 1 Ligne : triangle fermé -> face
  await H.tool('line'); await H.click(0,0,0); await H.hover(500,0,0); await H.type('1000'); await H.click(500,800,0); await H.click(0,0,0);
  let s = await H.st(); ok('Ligne triangle -> face', s.f === 1 && s.e === 3, s);
  // ligne suit : après face, outil ligne arrêté ?
  ok('Ligne arrêtée après fermeture', await H.ev(() => !glsketch.tool.start));
  await H.reset();
  // 2 Boîte
  await H.box(); s = await H.st(); ok('Rectangle + pousser/tirer = boîte', s.f === 6 && s.e === 12, s);
  const top = await H.ev(() => { const D = glsketch.app.activeDef; return Math.max(...[...D.verts.values()].map(v => v.p.z)); }); ok('Hauteur 800', Math.abs(top - 800) < 0.01, top);
  // 3 Pousser face latérale (étirement)
  await H.tool('pushpull'); await H.click(0, 500, 400); await H.hover(-300, 500, 400); await H.type('500');
  s = await H.st(); const maxX = await H.ev(() => Math.min(...[...glsketch.app.activeDef.verts.values()].map(v => v.p.x)));
  ok('Pousser face latérale étire', s.f === 6 && Math.abs(maxX + 500) < 0.01, { s, maxX });
  // 4 Double-clic repeat
  await H.zx(); await H.tool('pushpull'); await H.dbl(1250, 500, 800);
  const maxZ = await H.ev(() => Math.max(...[...glsketch.app.activeDef.verts.values()].map(v => v.p.z)));
  ok('Double-clic répète 500 (dessus -> 1300)', Math.abs(maxZ - 1300) < 0.01, maxZ);
  await H.key('Escape');
  // 5 Rectangle sur face verticale
  await H.zx(); await H.tool('rect'); await H.click(500, 0, 200); await H.hover(800, 0, 500); await H.type('600;400');
  s = await H.st(); ok('Rectangle sur face avant découpe la face', s.f === 7, s);
  // pousser vers l'intérieur (niche)
  await H.tool('pushpull'); await H.click(800, 0, 400); await H.hover(800, 200, 400); await H.type('300');
  s = await H.st(); ok('Niche poussée dans face avant', s.f === 11, s);
  // 6 Cercle sur dessus + trou traversant
  await H.zx(); await H.tool('circle'); await H.click(1300, 500, 1300); await H.hover(1400, 500, 1300); await H.type('200');
  s = await H.st(); ok('Cercle sur dessus', s.f === 12, s);
  await H.tool('pushpull'); await H.click(1300, 500, 1300); await H.hover(1300, 500, 1200); await H.type('1300');
  s = await H.st(); const holeOk = await H.ev(() => [...glsketch.app.activeDef.faces.values()].filter(f => f.loops.length > 1).length);
  ok('Trou traversant (dessus et dessous percés)', holeOk === 2, { s, holeOk });
  // 7 Sélection : clic, double, triple
  await H.tool('select'); await H.zx();
  await H.click(1000, 500, 1300); ok('Clic sélectionne 1 face', (await H.st()).sel === 1);
  await H.dbl(1000, 500, 1300); ok('Double-clic = face + arêtes', (await H.st()).sel > 4, await H.st());
  // triple
  { const [sx, sy] = await H.W(1000, 500, 1300); const b = await (await H.p.$('#viewport')).boundingBox(); await H.p.mouse.click(b.x+sx, b.y+sy, { clickCount: 1 }); await H.p.mouse.click(b.x+sx, b.y+sy, { clickCount: 2 }); await H.p.mouse.click(b.x+sx, b.y+sy, { clickCount: 3 }); await H.p.waitForTimeout(100); }
  ok('Triple-clic = tout connecté', (await H.st()).sel > 30, await H.st());
  await H.key('Escape');
  // fenêtre
  await H.dragS(5, 5, 1300, 780); s = await H.st(); ok('Sélection fenêtre (tout)', s.sel > 20, s);
  // 8 Gomme : effacer arête du rectangle niche
  await H.key('Escape'); await H.key('Escape');
  // 9 Groupe et édition
  await H.key('Control+a'); await H.key('Control+g'); s = await H.st(); ok('Créer groupe', s.i === 1 && s.f === 0, s);
  await H.tool('select'); await H.dbl(1000, 500, 1300); ok('Double-clic entre dans le groupe', await H.ev(() => glsketch.app.activePath.length === 1));
  await H.key('Escape'); await H.key('Escape'); ok('Échap sort du groupe', await H.ev(() => glsketch.app.activePath.length === 0));
  // 10 Déplacer groupe + copie tableau
  await H.click(1000, 500, 1300);
  await H.tool('move'); await H.click(0, 0, 0); await H.key('Control'); await H.hover(1000, 0, 0); await H.key('ArrowRight'); await H.hover(2000, 0, 0); await H.type('3000'); await H.type('x2');
  s = await H.st(); ok('Copie Ctrl + x2 = 3 groupes', s.i === 3, s);
  // division
  await H.key('Escape'); await H.tool('select'); await H.zx();
  // 11 Composant : modifier une instance modifie l'autre
  await H.reset(); await H.box(1000, 1000, 1000); await H.key('Control+a');
  await H.ev(() => { const O = glsketch; }); await H.key('g'); await H.p.waitForTimeout(150); await H.p.click('.mbtns .primary'); await H.p.waitForTimeout(150);
  await H.tool('move'); await H.click(0, 0, 0); await H.key('Control'); await H.hover(1500, 0, 0); await H.type('2000');
  s = await H.st(); const shared = await H.ev(() => { const ii = [...glsketch.app.model.root.insts.values()]; return ii.length === 2 && ii[0].def === ii[1].def; });
  ok('Copie de composant partage la définition', shared, s);
  // 12 Rotation
  await H.reset(); await H.box(1000, 500, 300); await H.key('Control+a'); await H.key('Control+g');
  await H.tool('rotate'); await H.click(0, 0, 0); await H.click(1000, 0, 0); await H.hover(0, 1000, 0); await H.type('90');
  const ang = await H.ev(() => { const it = [...glsketch.app.model.root.insts.values()][0]; return Math.round(Math.atan2(it.m.elements[1], it.m.elements[0]) * 180 / Math.PI); });
  ok('Rotation 90°', ang === 90, ang);
  // 13 Échelle uniforme
  await H.tool('select'); await H.zx(); await H.key('Control+a');
  await H.tool('scale'); const g = await H.ev(() => { const t = glsketch.tool; const gr = t.grips && t.grips.find(g => g.corner); return gr ? [gr.w.x, gr.w.y, gr.w.z] : null; });
  if (g) { await H.click(...g); await H.hover(g[0] + 300, g[1], g[2]); await H.type('2'); }
  const sc = await H.ev(() => { const it = [...glsketch.app.model.root.insts.values()][0]; return +new glsketch.app.target.constructor().setFromMatrixScale(it.m).x.toFixed(3); });
  ok('Échelle x2', Math.abs(sc - 2) < 0.01, { g, sc });
  // 14 Undo/redo
  const u1 = await H.ev(() => glsketch.app.undoStack.length); await H.key('Control+z'); const sc2 = await H.ev(() => +new glsketch.app.target.constructor().setFromMatrixScale([...glsketch.app.model.root.insts.values()][0].m).x.toFixed(3));
  ok('Annuler échelle', Math.abs(sc2 - 1) < 0.01, sc2); await H.key('Control+y');
  // 15 Copier / coller
  await H.tool('select'); await H.key('Control+a'); await H.key('Control+c'); await H.zx(); await H.key('Control+v'); await H.hover(500, -400, 0); await H.click(500, -400, 0);
  s = await H.st(); ok('Copier/coller', s.i === 2, s);
  // 16 Décalage + suivez-moi
  await H.reset(); await H.tool('rect'); await H.click(0,0,0); await H.hover(500,500,0); await H.type('2000;2000'); await H.zx();
  await H.tool('offset'); await H.click(1000, 1000, 0); await H.hover(1000, 800, 0); await H.type('250');
  s = await H.st(); ok('Décalage crée face intérieure', s.f === 2 && s.e === 8, s);
  await H.tool('offset'); await H.dbl(1000, 1000, 0); s = await H.st(); ok('Décalage double-clic répète', s.f === 3, s);
  // 17 Arc + polygone
  await H.reset(); await H.tool('arc'); await H.click(0,0,0); await H.click(1000,0,0); await H.hover(500,300,0); await H.type('500');
  s = await H.st(); ok('Arc demi-cercle', s.e >= 12, s);
  await H.tool('line'); await H.click(0,0,0); await H.click(1000,0,0); await H.key('Escape');
  s = await H.st(); ok('Arc + ligne = face', s.f === 1, s);
  await H.tool('polygon'); await H.click(3000,0,0); await H.hover(3500,0,0); await H.type('400'); s = await H.st(); ok('Polygone 6 côtés', s.f === 2, s);
  // 18 Mètre, rapporteur, cote, texte
  await H.zx(); await H.tool('tape'); await H.click(500,0,0); await H.hover(500,-300,0); await H.type('200');
  ok('Mètre : guide', await H.ev(() => glsketch.app.model.guides.length) >= 1);
  await H.tool('dimension'); await H.click(0,0,0); await H.click(1000,0,0); await H.click(500,-500,0);
  ok('Cotation', await H.ev(() => glsketch.app.model.dims.length) === 1);
  // 19 Peinture
  await H.tool('select'); await H.ev(() => { glsketch.app.currentMat = [...glsketch.app.model.materials.keys()][4]; }); await H.tool('paint'); await H.click(3000, 0, 0);
  ok('Peinture face (avant ou dos)', await H.ev(() => [...glsketch.app.activeDef.faces.values()].some(f => f.mat || f.back)));
  // 20 Gomme
  const e0 = (await H.st()).e; await H.tool('eraser'); await H.click(3400, 0, 0); ok('Gomme efface', (await H.st()).e < e0, { e0, e: (await H.st()).e });
  // 21 Masquer / afficher
  await H.tool('select'); await H.key('Control+a'); await H.ev(() => glsketch.cmd('hide')); await H.ev(() => glsketch.cmd('unhideAll'));
  ok('Masquer/Afficher', await H.ev(() => [...glsketch.app.activeDef.faces.values()].every(f => !f.hidden)));
  // 22 Export / import STL roundtrip
  await H.reset(); await H.box(1000, 1000, 1000); await H.key('Control+a'); await H.key('Control+g');
  const imp = await H.ev(async () => { let data; glsketch.saveFile = async (n, d) => { data = d; }; await glsketch.cmd('expSTL'); return data.byteLength; });
  ok('Export STL non vide', imp > 500, imp);
  console.log(R.join('\n')); if (H.errs.length) { process.exitCode = 1; console.log('ERREURS JS :\n' + H.errs.slice(0, 10).join('\n')); }
  await H.shot('r1'); await H.b.close();
})();
