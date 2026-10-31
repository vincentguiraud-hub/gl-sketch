// Lanceur Windows de G&L Sketch
// L'application est chargée depuis GitHub Pages : chaque mise à jour publiée sur GitHub
// est disponible au prochain démarrage, sans réinstaller. Hors connexion, la copie
// embarquée (dossier app/) est utilisée. Le lanceur lui-même se met à jour via les Releases.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net } = require('electron');
const path = require('path'); const fs = require('fs'); const { pathToFileURL } = require('url');

const ONLINE_URL = 'https://vincentguiraud-hub.github.io/gl-sketch/';
protocol.registerSchemesAsPrivileged([{ scheme: 'glsketch', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let win = null; let dirty = false; let forceClose = false;
const allowed = new Set(); // chemins que l'utilisateur a choisis ou ouverts (seuls autorisés en écriture)
const recentFile = () => path.join(app.getPath('userData'), 'recents.json');
const readRecent = () => { try { return JSON.parse(fs.readFileSync(recentFile(), 'utf8')).filter((p) => fs.existsSync(p)); } catch (e) { return []; } };
const addRecent = (p) => { if (typeof p !== 'string' || !allowed.has(p)) return; const l = [p, ...readRecent().filter((x) => x !== p)].slice(0, 12); try { fs.writeFileSync(recentFile(), JSON.stringify(l)); } catch (e) {} app.addRecentDocument(p); };
const fileFromArgs = (argv) => argv.slice(1).find((a) => /\.(glsketch|json|stl|obj)$/i.test(a) && fs.existsSync(a));
const readFileMsg = (p) => { allowed.add(p); return { path: p, name: path.basename(p), data: new Uint8Array(fs.readFileSync(p)).buffer }; };
const trusted = (e) => { const u = (e.senderFrame && e.senderFrame.url) || ''; return u.startsWith(ONLINE_URL) || u.startsWith('glsketch://'); };
const guard = (fn) => (e, ...a) => { if (!trusted(e)) throw new Error('origine non autorisée'); return fn(e, ...a); };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => { if (!win) return; if (win.isMinimized()) win.restore(); win.focus(); const f = fileFromArgs(argv); if (f) win.webContents.send('open-file', readFileMsg(f)); });

function create() {
  win = new BrowserWindow({ width: 1500, height: 940, minWidth: 900, minHeight: 600, title: 'G&L Sketch', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#eef0f3', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: false } });
  Menu.setApplicationMenu(null);
  let offline = false;
  const goOffline = () => { if (offline) return; offline = true; win.loadURL('glsketch://app/index.html'); };
  win.webContents.on('did-navigate', (_e, url, code) => { if (url.startsWith('http') && code >= 400) goOffline(); });
  win.webContents.on('did-fail-load', (_e, _c, _d, url, isMain) => { if (isMain && url.startsWith('http')) goOffline(); });
  win.loadURL(ONLINE_URL, { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' }).catch(goOffline);
  win.once('ready-to-show', () => { win.maximize(); win.show(); const f = fileFromArgs(process.argv); if (f) setTimeout(() => win.webContents.send('open-file', readFileMsg(f)), 1200); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ONLINE_URL) && !url.startsWith('glsketch://')) { e.preventDefault(); shell.openExternal(url); } });
  win.on('close', (e) => {
    if (!dirty || forceClose) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'], defaultId: 0, cancelId: 2, title: 'G&L Sketch', message: 'Enregistrer les modifications avant de quitter ?' });
    if (r === 0) win.webContents.send('save-before-close');
    else if (r === 1) { forceClose = true; win.close(); }
  });
}
const FILTERS = { glsketch: [{ name: 'Projet G&L Sketch', extensions: ['glsketch'] }], stl: [{ name: 'STL (impression 3D)', extensions: ['stl'] }], obj: [{ name: 'OBJ', extensions: ['obj'] }], glb: [{ name: 'glTF binaire', extensions: ['glb'] }], dxf: [{ name: 'DXF', extensions: ['dxf'] }], png: [{ name: 'Image PNG', extensions: ['png'] }], csv: [{ name: 'CSV (Excel)', extensions: ['csv'] }], json: [{ name: 'JSON', extensions: ['json'] }] };
ipcMain.handle('saveAs', guard(async (e, name, data, isProject) => {
  const ext = isProject ? 'glsketch' : (String(name).split('.').pop() || '').toLowerCase();
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), path.basename(String(name))), filters: [...(FILTERS[ext] || []), { name: 'Tous les fichiers', extensions: ['*'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data)); allowed.add(r.filePath); return r.filePath;
}));
ipcMain.handle('write', guard(async (e, p, data) => { if (!allowed.has(p)) throw new Error('chemin non autorisé'); fs.writeFileSync(p, Buffer.from(data)); return p; }));
ipcMain.handle('open', guard(async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Projets et modèles 3D', extensions: ['glsketch', 'json', 'stl', 'obj'] }, { name: 'Tous les fichiers', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return null; return readFileMsg(r.filePaths[0]);
}));
ipcMain.handle('openPath', guard(async (e, p) => (readRecent().includes(p) && fs.existsSync(p) ? readFileMsg(p) : null)));
ipcMain.handle('getRecent', guard(async () => readRecent()));
ipcMain.handle('appInfo', guard(async () => ({ launcher: app.getVersion() })));
ipcMain.on('addRecent', (e, p) => { if (trusted(e)) addRecent(p); });
ipcMain.on('setDirty', (e, d) => { if (trusted(e)) dirty = !!d; });
ipcMain.on('setTitle', (e, t) => { if (trusted(e) && win) win.setTitle(String(t).slice(0, 200)); });
ipcMain.on('closeNow', (e) => { if (!trusted(e)) return; forceClose = true; if (win) win.close(); });

app.whenReady().then(() => {
  protocol.handle('glsketch', (req) => { const u = new URL(req.url); const file = path.join(__dirname, 'app', path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '')); return net.fetch(pathToFileURL(file).toString()); });
  create();
  // mise à jour automatique du lanceur (Releases GitHub)
  try { const { autoUpdater } = require('electron-updater'); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); } catch (e) {}
});
app.on('window-all-closed', () => app.quit());
