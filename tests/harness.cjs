// Banc de test G&L Sketch
const { chromium } = require('playwright');
const APP_URL = require('url').pathToFileURL(require('path').join(__dirname, '..', 'dist', 'index.html')).href;
exports.APP_URL = APP_URL;
exports.start = async (opts = {}) => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: opts.vp || { width: 1400, height: 860 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1])); p.on('console', (m) => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(APP_URL); await p.waitForTimeout(900);
  const vp = await p.$('#viewport'); let bb = await vp.boundingBox();
  const H = {
    p, b, errs,
    async refreshBB() { bb = await vp.boundingBox(); },
    W: (x, y, z) => p.evaluate(([x, y, z]) => { const a = glsketch.app; const m = a.activeMatrix; const v = a.target.clone().set(x, y, z).applyMatrix4(m); const s = a.project(v); return [s.x, s.y]; }, [x, y, z]),
    async clickS(sx, sy, mods = []) { for (const m of mods) await p.keyboard.down(m); await p.mouse.move(bb.x + sx + 2, bb.y + sy + 2, { steps: 2 }); await p.mouse.move(bb.x + sx, bb.y + sy, { steps: 2 }); await p.mouse.down(); await p.mouse.up(); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(50); },
    async click(x, y, z, mods) { const [sx, sy] = await H.W(x, y, z); await H.clickS(sx, sy, mods); },
    async dbl(x, y, z) { const [sx, sy] = await H.W(x, y, z); await p.mouse.move(bb.x + sx, bb.y + sy, { steps: 2 }); await p.mouse.dblclick(bb.x + sx, bb.y + sy); await p.waitForTimeout(80); },
    async hover(x, y, z) { const [sx, sy] = await H.W(x, y, z); await p.mouse.move(bb.x + sx, bb.y + sy, { steps: 4 }); },
    async drag(a, c, mods = []) { const [x0, y0] = await H.W(...a), [x1, y1] = await H.W(...c); for (const m of mods) await p.keyboard.down(m); await p.mouse.move(bb.x + x0, bb.y + y0); await p.mouse.down(); await p.mouse.move(bb.x + x1, bb.y + y1, { steps: 10 }); await p.mouse.up(); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(60); },
    async dragS(x0, y0, x1, y1) { await p.mouse.move(bb.x + x0, bb.y + y0); await p.mouse.down(); await p.mouse.move(bb.x + x1, bb.y + y1, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(60); },
    async type(s) { await p.keyboard.type(s); await p.keyboard.press('Enter'); await p.waitForTimeout(100); },
    async key(k) { await p.keyboard.press(k); await p.waitForTimeout(40); },
    async tool(t) { await p.evaluate((t) => glsketch.setTool(t), t); },
    async zx() { await p.evaluate(() => { glsketch.app.anim = null; glsketch.app.zoomExtents(); }); await p.waitForTimeout(650); },
    st: () => p.evaluate(() => { const D = glsketch.app.activeDef; return { f: D.faces.size, e: D.edges.size, i: D.insts.size, sel: glsketch.app.sel.size }; }),
    ev: (fn, a) => p.evaluate(fn, a),
    async reset() { await p.evaluate(() => { glsketch.app.newModel(); glsketch.setTool('select'); }); await p.waitForTimeout(150); },
    async shot(n) { await p.screenshot({ path: '/tmp/' + n + '.png' }); },
    async box(w = 2000, d = 1000, h = 800) { await H.tool('rect'); await H.click(0, 0, 0); await H.hover(w / 2, d / 2, 0); await H.type(w + ';' + d); await H.zx(); await H.tool('pushpull'); await H.click(w / 2, d / 2, 0); await H.hover(w / 2, d / 2, 100); await H.type(String(h)); await H.zx(); await H.tool('select'); },
  };
  return H;
};
