const { start } = require('./harness.cjs');
const { devices } = require('playwright');
const R = []; const ok = (name, cond, info) => { if (!cond) process.exitCode = 1; R.push((cond ? '✅ ' : '❌ ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
(async () => {
  const H = await start(); const p = H.p;
  await H.box(1000, 1000, 1000); await H.key('Control+a'); await H.key('Control+g');
  // panneaux
  for (const id of ['info','mat','comp','tags','scenes','styles','shadow','outliner']) { await p.evaluate((id)=>glsketch.openPanel(id), id); }
  await H.click(500, 500, 1000); // sélection groupe
  ok('Infos entité groupe', await p.evaluate(()=>document.querySelector('#pb-info').innerText.includes('Groupe')));
  await p.evaluate(()=>glsketch.openPanel('info')); await p.fill('#pb-info .kv3 input >> nth=0', '500'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  ok('Position X éditable', await p.evaluate(()=>Math.round([...glsketch.app.model.root.insts.values()][0].m.elements[12])) === 500);
  // matières : clic sur pastille + peinture du groupe
  await p.evaluate(()=>glsketch.openPanel('mat')); await p.click('#pb-mat .mat >> nth=15'); ok('Choisir matière -> outil Colorier', await p.evaluate(()=>glsketch.toolName) === 'paint');
  await H.click(1000, 500, 1000); ok('Peindre le groupe', await p.evaluate(()=>!![...glsketch.app.model.root.insts.values()][0].mat));
  // éditeur matière
  await p.evaluate(()=>{ const i=document.querySelector('#pb-mat input[type=color]'); i.value='#ff0000'; i.dispatchEvent(new Event('input')); });
  // balises
  await p.evaluate(()=>glsketch.openPanel('tags')); await p.click('#pb-tags .btnrow button'); await p.waitForTimeout(150); await p.click('.mbtns .primary'); await p.waitForTimeout(100);
  ok('Ajouter balise', await p.evaluate(()=>glsketch.app.model.tags.length) === 2);
  await p.click('#pb-tags .eye >> nth=1');
  // scènes
  await p.evaluate(()=>glsketch.openPanel('scenes')); await p.click('#pb-scenes .btnrow button'); ok('Ajouter scène', await p.evaluate(()=>glsketch.app.model.scenes.length) === 1);
  // styles
  for (const k of ['wire','hidden','shaded','textured','mono']) await p.evaluate((k)=>glsketch.cmd('fs:'+k), k);
  for (const k of ['edges','backEdges','xray','axes','guides','hiddenGeom']) { await p.evaluate((k)=>glsketch.cmd('tg:'+k), k); await p.evaluate((k)=>glsketch.cmd('tg:'+k), k); }
  await p.evaluate(()=>glsketch.cmd('shadows')); await p.waitForTimeout(200); await p.evaluate(()=>glsketch.cmd('shadows'));
  await p.evaluate(()=>glsketch.cmd('toggleOrtho')); await p.evaluate(()=>glsketch.cmd('toggleOrtho'));
  // outliner
  ok('Outliner liste le groupe', await p.evaluate(()=>document.querySelectorAll('#pb-outliner .outrow').length) === 1);
  // composants bibliothèque
  await p.evaluate(()=>glsketch.openPanel('comp')); await p.click('#pb-comp details >> nth=0'); await p.click('#pb-comp details >> nth=0 >> .listbtn >> nth=0'); ok('Bibliothèque -> placer', await p.evaluate(()=>glsketch.toolName) === 'place'); await H.key('Escape');
  // panneau Assistant (sans clé : écran de réglage)
  await p.evaluate(()=>glsketch.openPanel('assistant')); await p.waitForTimeout(150);
  ok('Panneau Assistant (réglage de la clé)', await p.evaluate(()=>!!document.querySelector('#as-tok') && document.querySelector('#pb-assistant').innerText.includes('Clé GitHub')));
  await p.evaluate(()=>glsketch.openPanel('info'));
  // menu clic droit
  const [sx, sy] = await H.W(500, 500, 1000); const bb = await (await p.$('#viewport')).boundingBox();
  await p.mouse.click(bb.x + sx, bb.y + sy, { button: 'right' }); await p.waitForTimeout(100);
  const items = await p.evaluate(()=>[...document.querySelectorAll('#ctxmenu button')].map(b=>b.textContent));
  ok('Menu contextuel', items.length > 5, items.slice(0,6));
  await p.keyboard.press('Escape'); await p.evaluate(()=>glsketch.hideCtx());
  // toutes les commandes de menu (sauf fichiers / modales bloquantes)
  const cmds = await p.evaluate(()=>[...document.querySelectorAll('.mdrop button')].map(b=>b.dataset.cmd));
  const skip = new Set(['new','open','import','save','saveAs','recent','expPNG','expSTL','expOBJ','expGLB','expDXF']);
  for (const c of cmds) { if (skip.has(c)) continue; await p.evaluate((c)=>{ try { glsketch.cmd(c); } catch(e) { window.__e = (window.__e||[]).concat(c+':'+e.message); } }, c); await p.waitForTimeout(30); if (await p.evaluate(()=>document.querySelector('#modal').classList.contains('on'))) await p.evaluate(()=>{ const b=document.querySelector('.mbtns button'); b && b.click(); }); await p.evaluate(()=>glsketch.setTool('select')); }
  ok('Toutes les commandes de menu sans erreur', !(await p.evaluate(()=>window.__e)) && H.errs.length === 0, [await p.evaluate(()=>window.__e), H.errs.slice(0,3)]);
  console.log(R.join('\n')); await H.b.close();
  // ---- iPhone
  const { chromium } = require('playwright');
  const b2 = await chromium.launch({ args: ['--use-gl=swiftshader'] }); const ctx = await b2.newContext({ ...devices['iPhone 13'] }); const m = await ctx.newPage();
  const me = []; m.on('pageerror', e => me.push(e.message));
  await m.goto(require('./harness.cjs').APP_URL); await m.waitForTimeout(1200);
  // tap rectangle tool and draw by two taps
  await m.tap('.tool[data-tool=rect]'); const vb = await (await m.$('#viewport')).boundingBox();
  await m.touchscreen.tap(vb.x + 120, vb.y + 300); await m.waitForTimeout(100); await m.touchscreen.tap(vb.x + 260, vb.y + 380); await m.waitForTimeout(200);
  const f = await m.evaluate(()=>glsketch.app.activeDef.faces.size);
  console.log((f === 1 ? '✅' : '❌') + ' iPhone : rectangle en 2 tapes', f, me.join(';')); if (f !== 1 || me.length) process.exitCode = 1;
  await m.screenshot({ path: '/tmp/m2.png' });
  await b2.close();
})();
