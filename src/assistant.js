// G&L Sketch — panneau « Assistant Claude »
// Les demandes sont envoyées sous forme de tickets GitHub ; le robot (workflow assistant.yml) fait la
// modification, lance les tests et publie automatiquement. Les réponses s'affichent ici.
export const REPO = 'vincentguiraud-hub/gl-sketch';
const API = 'https://api.github.com/repos/' + REPO;
const KEY = 'glsketch-gh-token';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s) => esc(String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<details>[\s\S]*?<\/details>/g, '').trim())
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g, '<img src="$1" alt="capture">')
  .replace(/(^|\s)(https:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">lien</a>')
  .replace(/\n/g, '<br>');
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

export class Assistant {
  constructor(ui, version) {
    this.ui = ui; this.version = version; this.view = 'list'; this.issue = null; this.issues = []; this.versions = null;
    this.timer = null; this.known = new Map();
    try { this.token = localStorage.getItem(KEY) || ''; } catch (e) { this.token = ''; }
    setInterval(() => this.backgroundPoll(), 60000);
    setTimeout(() => this.backgroundPoll(), 8000);
  }
  get el() { return document.querySelector('#pb-assistant'); }
  async gh(path, opt = {}) {
    const r = await fetch(path.startsWith('http') ? path : API + path, {
      method: opt.method || 'GET',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + this.token, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store',
    });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || ('Erreur GitHub ' + r.status)); e.status = r.status; throw e; }
    return j;
  }

  // ------------------------------------------------------------ affichage
  render() {
    const el = this.el; if (!el) return;
    if (!this.token) return this.renderSetup();
    if (this.view === 'thread' && this.issue) return this.renderThread();
    if (this.view === 'versions') return this.renderVersions();
    return this.renderList();
  }
  renderSetup() {
    this.el.innerHTML = `
      <div class="as-hero"><div class="as-ico">${SPARK}</div><div><b>Demande directement à Claude</b><div class="muted">Décris un problème ou une amélioration : Claude modifie le logiciel, vérifie tout avec les tests et publie la mise à jour tout seul.</div></div></div>
      <div class="sub">Réglage unique : clé d'accès GitHub</div>
      <ol class="as-steps">
        <li>Clique sur <b>Créer ma clé</b> (connecte-toi à GitHub si besoin).</li>
        <li><b>Token name</b> : <code>G&amp;L Sketch</code> · <b>Expiration</b> : <i>No expiration</i> (ou 1 an).</li>
        <li><b>Repository access</b> : <i>Only select repositories</i> → <code>gl-sketch</code>.</li>
        <li><b>Permissions</b> → <i>Repository permissions</i> : <b>Contents</b>, <b>Issues</b> et <b>Actions</b> en <i>Read and write</i>.</li>
        <li><b>Generate token</b>, copie la clé (elle commence par <code>github_pat_</code>) et colle-la ci-dessous.</li>
      </ol>
      <div class="btnrow"><a class="as-btn ghost" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Créer ma clé</a></div>
      <label class="col" style="margin-top:12px">Clé GitHub<input id="as-tok" type="password" placeholder="github_pat_…" autocomplete="off"></label>
      <div class="btnrow"><button class="as-btn" id="as-save">Enregistrer et vérifier</button></div>
      <p class="muted">La clé reste uniquement sur cet appareil et ne donne accès qu'au dépôt <code>gl-sketch</code>.</p>`;
    this.el.querySelector('#as-save').onclick = async () => {
      const t = this.el.querySelector('#as-tok').value.trim(); if (!t) return;
      this.token = t;
      try {
        const repo = await this.gh('');
        if (!repo.permissions?.push) throw new Error("la clé n'a pas les droits d'écriture sur gl-sketch");
        try { localStorage.setItem(KEY, t); } catch (e) { /* */ }
        this.ui.toast('Clé enregistrée : l\'assistant est prêt'); this.render();
      } catch (e) { this.token = ''; this.ui.toast('Clé refusée : ' + e.message); }
    };
  }
  async renderList() {
    const el = this.el;
    el.innerHTML = `
      <div class="as-new">
        <textarea id="as-msg" rows="4" placeholder="Ex. : « Quand je pousse une face ronde, les arêtes du bas disparaissent » ou « Ajoute un générateur de clôture en panneaux rigides »"></textarea>
        <label class="row"><input type="checkbox" id="as-cap" checked> Joindre une capture de la vue 3D</label>
        <label class="row"><input type="checkbox" id="as-mod" ${this.modelSize() > 0 ? 'checked' : ''}> Joindre le modèle en cours (pour reproduire le problème)</label>
        <div class="btnrow"><button class="as-btn" id="as-send">${SEND} Envoyer à Claude</button></div>
      </div>
      <div class="as-bar"><div class="sub" style="margin:0">Mes demandes</div><button class="mini" id="as-ver" title="Versions et retour arrière">Versions</button><button class="mini" id="as-ref" title="Actualiser">↻</button></div>
      <div id="as-list"><div class="muted">Chargement…</div></div>
      <div class="as-foot"><button class="mini" id="as-out">Changer de clé GitHub</button></div>`;
    el.querySelector('#as-send').onclick = () => this.send();
    el.querySelector('#as-ref').onclick = () => this.renderList();
    el.querySelector('#as-ver').onclick = () => { this.view = 'versions'; this.render(); };
    el.querySelector('#as-out').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) { /* */ } this.token = ''; this.render(); };
    el.querySelector('#as-msg').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.send(); });
    try {
      await this.loadIssues();
      const L = el.querySelector('#as-list'); if (!L) return;
      if (!this.issues.length) { L.innerHTML = '<div class="muted">Aucune demande pour l\'instant.</div>'; return; }
      L.innerHTML = this.issues.map((i) => `<button class="as-item" data-n="${i.number}"><span class="as-chip ${i.st.cls}">${i.st.label}</span><span class="as-t">${esc(i.title.replace(/^\[Assistant\]\s*/, ''))}</span><span class="muted">${new Date(i.created_at).toLocaleDateString('fr-FR')}</span></button>`).join('');
      L.querySelectorAll('.as-item').forEach((b) => (b.onclick = () => this.openThread(+b.dataset.n)));
    } catch (e) { const L = el.querySelector('#as-list'); if (L) L.innerHTML = `<div class="muted">Impossible de joindre GitHub (${esc(e.message)}).</div>`; if (e.status === 401) { this.token = ''; } }
  }
  async renderThread() {
    const el = this.el; const n = this.issue;
    el.innerHTML = `<div class="as-bar"><button class="mini" id="as-back">← Retour</button><div class="sub" style="margin:0;flex:1">Demande n°${n}</div><button class="mini" id="as-ref">↻</button></div>
      <div id="as-thread" class="as-thread"><div class="muted">Chargement…</div></div>
      <div class="as-reply"><textarea id="as-rep" rows="2" placeholder="Répondre ou préciser…"></textarea><button class="as-btn" id="as-sendrep">${SEND}</button></div>`;
    el.querySelector('#as-back').onclick = () => { this.view = 'list'; this.issue = null; this.stopPoll(); this.render(); };
    el.querySelector('#as-ref').onclick = () => this.refreshThread();
    el.querySelector('#as-rep').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.reply(); });
    el.querySelector('#as-sendrep').onclick = () => this.reply();
    await this.refreshThread();
  }
  async refreshThread() {
    const n = this.issue; const box = this.el?.querySelector('#as-thread'); if (!box) return;
    try {
      const [iss, comments] = await Promise.all([this.gh('/issues/' + n), this.gh('/issues/' + n + '/comments?per_page=100')]);
      const msgs = [{ me: true, body: iss.body, at: iss.created_at }, ...comments.map((c) => ({ me: c.user?.login !== 'github-actions[bot]', body: c.body, at: c.created_at }))];
      const st = this.status(comments);
      box.innerHTML = msgs.map((m) => `<div class="as-msg ${m.me ? 'me' : 'bot'}">${m.me ? '' : `<div class="as-who">${SPARK} Claude</div>`}<div class="as-body">${md(m.body)}</div><div class="as-at">${new Date(m.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>`).join('')
        + (st.busy ? `<div class="as-msg bot"><div class="as-who">${SPARK} Claude</div><div class="as-body as-typing"><i></i><i></i><i></i> ${st.key === 'encours' ? 'travaille sur ta demande…' : 'va prendre ta demande…'}</div></div>` : '')
        + (st.ver && cmpVer(st.ver, this.version) > 0 ? `<div class="as-upd"><b>Version ${esc(st.ver)} prête.</b><button class="as-btn" id="as-upd">Mettre à jour maintenant</button></div>` : '');
      box.scrollTop = box.scrollHeight;
      const ub = box.querySelector('#as-upd'); if (ub) ub.onclick = () => this.updateNow(st.ver);
      this.known.set(n, comments.length);
      if (st.busy) this.startPoll(); else this.stopPoll();
    } catch (e) { box.innerHTML = `<div class="muted">Erreur : ${esc(e.message)}</div>`; }
  }
  async renderVersions() {
    const el = this.el;
    el.innerHTML = `<div class="as-bar"><button class="mini" id="as-back">← Retour</button><div class="sub" style="margin:0;flex:1">Versions</div></div>
      <p class="muted">Version utilisée : <b>${esc(this.version)}</b>. Chaque modification est sauvegardée : tu peux revenir en arrière à tout moment.</p>
      <div class="btnrow"><button class="as-btn" id="as-prev">↩ Revenir à la version précédente</button></div>
      <div id="as-vlist" style="margin-top:10px"><div class="muted">Chargement…</div></div>`;
    el.querySelector('#as-back').onclick = () => { this.view = 'list'; this.render(); };
    el.querySelector('#as-prev').onclick = () => this.rollback('', 'la version précédente');
    try {
      const list = await this.loadVersions(); const L = el.querySelector('#as-vlist');
      L.innerHTML = list.map((v, i) => `<div class="as-ver ${v.version === this.version ? 'cur' : ''}"><div><b>${esc(v.version)}</b> <span class="muted">${new Date(v.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span><div class="as-vt">${esc(v.titre || '')}</div></div>${v.version === this.version ? '<span class="as-chip ok">utilisée</span>' : i === 0 ? '<span class="as-chip">dernière</span>' : `<button class="mini" data-tag="${esc(v.tag || '')}" data-v="${esc(v.version)}">Remettre</button>`}</div>`).join('') || '<div class="muted">Aucune version.</div>';
      L.querySelectorAll('button[data-tag]').forEach((b) => (b.onclick = () => this.rollback(b.dataset.tag, 'la version ' + b.dataset.v)));
    } catch (e) { el.querySelector('#as-vlist').innerHTML = `<div class="muted">Liste indisponible (${esc(e.message)}).</div>`; }
  }

  // ------------------------------------------------------------ actions
  modelSize() { const D = this.ui.app.model.root; return D.faces.size + D.edges.size + D.insts.size; }
  async send() {
    const ta = this.el.querySelector('#as-msg'); const msg = ta.value.trim();
    if (msg.length < 3) { this.ui.toast('Décris ta demande'); return; }
    const btn = this.el.querySelector('#as-send'); btn.disabled = true; btn.innerHTML = 'Envoi…';
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const files = [];
      if (this.el.querySelector('#as-cap').checked) files.push(['capture.jpg', await this.capture()]);
      if (this.el.querySelector('#as-mod').checked && this.modelSize()) files.push(['modele.glsketch', b64utf8(JSON.stringify(this.ui.app.model.toJSON()))]);
      const paths = [];
      if (files.length) { await this.ensureBranch(); for (const [name, b64] of files) { const p = `demandes/${stamp}/${name}`; await this.gh('/contents/' + p, { method: 'PUT', body: { message: 'Pièce jointe ' + name, content: b64, branch: 'demandes' } }); paths.push(p); } }
      const img = paths.find((p) => p.endsWith('.jpg'));
      const body = msg + (img ? `\n\n![capture](https://raw.githubusercontent.com/${REPO}/demandes/${img})` : '') +
        `\n\n<details><summary>Infos techniques</summary>\n\n- Version : ${this.version}\n- Appareil : ${this.ui.native ? 'logiciel Windows' : navigator.userAgent.slice(0, 120)}\n${paths.map((p) => '- Pièce jointe : `' + p + '`').join('\n')}\n</details>`;
      const title = '[Assistant] ' + msg.replace(/\s+/g, ' ').slice(0, 80) + (msg.length > 80 ? '…' : '');
      const iss = await this.gh('/issues', { method: 'POST', body: { title, body } });
      ta.value = ''; this.ui.toast('Demande envoyée à Claude');
      this.openThread(iss.number);
    } catch (e) { this.ui.toast('Envoi impossible : ' + e.message); btn.disabled = false; btn.innerHTML = SEND + ' Envoyer à Claude'; }
  }
  async reply() {
    const ta = this.el.querySelector('#as-rep'); const msg = ta.value.trim(); if (!msg) return;
    try { await this.gh('/issues/' + this.issue + '/comments', { method: 'POST', body: { body: msg } }); ta.value = ''; await this.gh('/issues/' + this.issue, { method: 'PATCH', body: { state: 'open' } }).catch(() => {}); this.refreshThread(); }
    catch (e) { this.ui.toast('Envoi impossible : ' + e.message); }
  }
  async rollback(tag, label) {
    if (!(await this.ui.confirm(`Remettre ${label} en ligne ? La version actuelle reste sauvegardée (tu pourras y revenir).`))) return;
    try {
      await this.gh('/actions/workflows/rollback.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs: { tag, issue: '' } } });
      this.ui.toast('Retour en cours : disponible dans 1 à 2 minutes'); this.watchUpdate();
    } catch (e) { this.ui.toast('Impossible : ' + e.message); }
  }
  openThread(n) { this.issue = n; this.view = 'thread'; this.ui.openPanel('assistant'); this.render(); }
  async updateNow(ver) {
    try { const j = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()); if (cmpVer(j.version, this.version) <= 0) { this.ui.toast('Mise en ligne en cours… réessaie dans une minute'); this.watchUpdate(); return; } this.ui.newBuild = j; } catch (e) { /* */ }
    this.ui.applyUpdate();
    void ver;
  }
  watchUpdate() { let n = 0; clearInterval(this._wu); this._wu = setInterval(async () => { if (++n > 20) clearInterval(this._wu); await this.ui.checkNow?.(); if (this.ui.newBuild) clearInterval(this._wu); }, 20000); }

  // ------------------------------------------------------------ données
  status(comments) {
    const bot = comments.filter((c) => c.user?.login === 'github-actions[bot]');
    const lastBot = bot[bot.length - 1]; const last = comments[comments.length - 1];
    if (last && last.user?.login !== 'github-actions[bot]') return { key: 'attente', label: 'Envoyée', cls: 'wait', busy: true };
    if (!lastBot) return { key: 'attente', label: 'Envoyée', cls: 'wait', busy: true };
    const b = lastBot.body || ''; const pv = b.match(/<!-- publie:([\d.]+) -->/);
    if (pv) return { key: 'publie', label: 'Publiée ' + pv[1], cls: 'ok', ver: pv[1] };
    if (/statut:echec/.test(b)) return { key: 'echec', label: 'Non publiée', cls: 'err' };
    if (/statut:encours/.test(b)) return { key: 'encours', label: 'En cours', cls: 'wait', busy: true };
    if (/Compris : je remets/.test(b)) return { key: 'encours', label: 'Retour en cours', cls: 'wait', busy: true };
    return { key: 'repondu', label: 'Répondu', cls: '' };
  }
  async loadIssues() {
    const list = await this.gh('/issues?state=all&per_page=30&sort=created&direction=desc');
    const mine = list.filter((i) => !i.pull_request && i.title.startsWith('[Assistant]')).slice(0, 15);
    await Promise.all(mine.map(async (i) => { const c = i.comments ? await this.gh('/issues/' + i.number + '/comments?per_page=100') : []; i.st = this.status(c); i._n = c.length; }));
    this.issues = mine; return mine;
  }
  async loadVersions() {
    let list = null;
    try { if (/^https?:$/.test(location.protocol)) list = await fetch('versions.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch (e) { /* */ }
    if (!list) { const f = await this.gh('/contents/versions.json?ref=main'); list = JSON.parse(decodeURIComponent(escape(atob(f.content.replace(/\n/g, ''))))); }
    return list;
  }
  async ensureBranch() {
    try { await this.gh('/git/ref/heads/demandes'); } catch (e) {
      if (e.status !== 404) throw e;
      const main = await this.gh('/git/ref/heads/main');
      await this.gh('/git/refs', { method: 'POST', body: { ref: 'refs/heads/demandes', sha: main.object.sha } });
    }
  }
  async capture() {
    const app = this.ui.app; app.render(); app.tick(); const src = app.renderer.domElement;
    const k = Math.min(1, 1600 / src.width); const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext('2d'); const bg = getComputedStyle(document.querySelector('.workspace'));
    x.fillStyle = bg.backgroundColor && bg.backgroundColor !== 'rgba(0, 0, 0, 0)' ? bg.backgroundColor : '#e9eef3'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  }
  // suivi en arrière-plan : prévient quand une réponse arrive, même panneau fermé
  async backgroundPoll() {
    if (!this.token || document.hidden) return;
    try {
      const busy = this.issues.filter((i) => i.st?.busy); if (!this.issues.length) await this.loadIssues();
      for (const i of (busy.length ? busy : this.issues.filter((x) => x.st?.busy))) {
        const c = await this.gh('/issues/' + i.number + '/comments?per_page=100'); const st = this.status(c);
        if (c.length !== i._n) {
          i._n = c.length; i.st = st;
          if (!st.busy) { this.ui.toast(st.key === 'publie' ? `Claude a publié la version ${st.ver} — ouvre l'Assistant` : 'Claude a répondu à ta demande'); if (!(this.ui.activePanel === 'assistant' && this.ui.root.classList.contains('tray-open'))) document.querySelector('.tab[data-panel=assistant]')?.classList.add('badge'); if (st.key === 'publie') this.watchUpdate(); }
          if (this.view === 'thread' && this.issue === i.number) this.refreshThread();
        }
      }
    } catch (e) { /* hors ligne */ }
  }
  startPoll() { if (this.timer) return; this.timer = setInterval(() => { if (this.view === 'thread') this.refreshThread(); }, 15000); }
  stopPoll() { clearInterval(this.timer); this.timer = null; }
}
function b64utf8(s) { const b = new TextEncoder().encode(s); let out = ''; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(out); }
export const SPARK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="currentColor" fill-opacity=".15"/><path class="a" d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>';
