/* ── Design system utilities ─────────────────────────────────── */

// Count-up animation for stat numbers
function countUp(el, target, duration) {
  duration = duration || 600;
  var start = performance.now();
  var prefix = el.dataset.prefix || '';
  function tick(now) {
    var t = Math.min((now - start) / duration, 1);
    var ease = t * (2 - t);
    var cur = Math.round(target * ease);
    el.textContent = prefix + cur.toLocaleString('en-IN');
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Toast notification
function showToast(msg, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('toast-out');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// Skeleton rows for table loading state
function _skeletonRows(n, cols) {
  var row = '<tr>' + Array(cols).fill('<td><div class="skeleton" style="height:13px;width:80%">&nbsp;</div></td>').join('') + '</tr>';
  return Array(n).fill(row).join('');
}

// Refresh the review badge in the sidebar nav
async function refreshReviewBadge() {
  try {
    const data = await fetch('/api/review/count').then(r => r.json());
    const el = document.getElementById('review-count');
    if (!el) return;
    const n = data.count || 0;
    el.textContent = n;
    el.style.display = n > 0 ? '' : 'none';
  } catch (_) {}
}

/* ── End utilities ───────────────────────────────────────────── */

// ── Sync progress panel ──────────────────────────────────────────────────────

let _syncPollTimer  = null;
let _lastPhase      = null;
let _renderedCount  = 0;   // how many previews we've already rendered

// Adaptive poll interval: fast while classifying, slow while fetching
const POLL_MS = { fetching: 2000, classifying: 700, default: 1500 };

function _showSyncPanel() {
  document.getElementById('sync-panel')?.classList.add('visible');
}
function _hideSyncPanel(delay) {
  setTimeout(() => document.getElementById('sync-panel')?.classList.remove('visible'), delay);
}
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render ────────────────────────────────────────────────────────────────────

function _renderProgress(p) {
  const pct      = p.total > 0 ? Math.min(100, Math.round(p.current / p.total * 100)) : (p.phase === 'fetching' ? 0 : 100);
  const isDone   = p.phase === 'done';
  const isError  = p.phase === 'error';
  const isFetch  = p.phase === 'fetching';

  // Bar
  document.getElementById('sync-bar-fill').style.width = pct + '%';
  document.getElementById('sync-bar-pct').textContent  = p.total > 0 ? pct + '%' : '';
  document.getElementById('sync-bar-fraction').textContent =
    isFetch ? 'Fetching email list…' :
    p.total > 0 ? `${p.current} / ${p.total} emails` : '';

  // Phase label
  document.getElementById('sync-panel-phase').textContent =
    isFetch                  ? 'Fetching email list from Gmail…' :
    p.phase === 'classifying'? `Classifying email ${p.current} of ${p.total}` :
    isDone                   ? 'Complete' :
    isError                  ? 'Failed' : 'Connecting…';

  // Spinner
  const spinner = document.getElementById('sync-panel-spinner');
  if (isDone)       { spinner.textContent = '✓'; spinner.classList.remove('spinning'); spinner.style.color = '#5db87d'; }
  else if (isError) { spinner.textContent = '✕'; spinner.classList.remove('spinning'); spinner.style.color = '#e07070'; }
  else              { spinner.textContent = '↻'; spinner.classList.add('spinning');    spinner.style.color = '#7c83fd'; }

  // Tally from server-tracked counts (accurate across all emails, not just previews)
  const t = p.tally || {};
  document.getElementById('tally-expense').textContent = t.expense ?? 0;
  document.getElementById('tally-income').textContent  = t.income  ?? 0;
  document.getElementById('tally-ignore').textContent  = t.ignore  ?? 0;

  // Previews — max 6 visible rows, no scroll; show "N more" below
  const MAX_ROWS  = 6;
  const container = document.getElementById('sync-previews');
  const moreEl    = document.getElementById('sync-more');
  const newItems  = p.previews.slice(0, p.previews.length - _renderedCount);
  _renderedCount  = p.previews.length;

  newItems.reverse().forEach(item => {
    const amtStr = item.amount != null
      ? (item.label === 'expense' ? '-' : item.label === 'income' ? '+' : '') + '₹' + Number(item.amount).toLocaleString('en-IN')
      : '—';
    const row = document.createElement('div');
    row.className = 'sp-item';
    row.innerHTML = `
      <div>
        <div class="sp-subject">${_esc(item.subject)}</div>
        <div class="sp-sender">${_esc(item.sender)}</div>
      </div>
      <div class="sp-right">
        <span class="sp-amount ${item.label}">${_esc(amtStr)}</span>
        <span class="sp-badge ${item.label}">${item.label}</span>
      </div>`;
    container.prepend(row);
    // Remove oldest row if over limit
    while (container.children.length > MAX_ROWS) container.removeChild(container.lastChild);
  });

  // "… and N more" counter
  const total_classified = (p.tally?.expense ?? 0) + (p.tally?.income ?? 0) + (p.tally?.ignore ?? 0);
  const overflow = total_classified - MAX_ROWS;
  if (moreEl) {
    if (overflow > 0) { moreEl.style.display = 'block'; moreEl.textContent = `+ ${overflow} more classified`; }
    else { moreEl.style.display = 'none'; }
  }

  // Done / error footer
  const doneEl = document.getElementById('sync-panel-done');
  const navBtn = document.querySelector('nav .btn-primary');
  if (isDone && p.result) {
    doneEl.style.display = 'block';
    doneEl.style.color   = '#5db87d';
    doneEl.textContent   = `Done — ${p.result.processed} new transactions from ${p.result.total_fetched} emails`;
    showToast('Sync complete', 'success');
    if (navBtn) { navBtn.textContent = 'Sync Now'; navBtn.disabled = false; }
    _hideSyncPanel(4000);
    setTimeout(() => window.location.reload(), 4200);
  } else if (isError) {
    doneEl.style.display = 'block';
    doneEl.style.color   = '#e07070';
    doneEl.textContent   = 'Error: ' + (p.error || 'unknown error');
    if (navBtn) { navBtn.textContent = 'Sync Now'; navBtn.disabled = false; }
    _hideSyncPanel(6000);
  }
}

// ── Live dashboard refresh ────────────────────────────────────────────────────

let _dashRefreshTick = 0;

async function _refreshDashboardIfPresent() {
  // Only runs on the dashboard page (stat cards + recent txn table exist)
  const statExpense = document.getElementById('stat-expense');
  if (!statExpense) return;

  try {
    const [stats, txResp, review] = await Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/transactions').then(r => r.json()),
      fetch('/api/review').then(r => r.json()),
    ]);
    const txns = Array.isArray(txResp) ? txResp : (txResp.items || []);

    statExpense.textContent = '₹' + (stats.total_expense || 0).toLocaleString('en-IN', {minimumFractionDigits: 2});
    const inc = document.getElementById('stat-income');
    if (inc) inc.textContent = '₹' + (stats.total_income || 0).toLocaleString('en-IN', {minimumFractionDigits: 2});
    const rev = document.getElementById('stat-review');
    if (rev) rev.textContent = review.length + ' emails';

    const tbody = document.getElementById('txn-body');
    if (tbody && txns.length) {
      tbody.innerHTML = txns.slice(0, 20).map(t => {
        const date     = _esc(t.txn_date || (t.email.received_at ? t.email.received_at.slice(0,10) : '\u2014'));
        const merchant = _esc(t.merchant || t.email.sender || '\u2014');
        const category = _esc(t.category || '\u2014');
        const label    = _esc(t.label);
        const status   = _esc(t.status);
        const amtColor = t.label === 'expense' ? '#e07070' : t.label === 'income' ? '#5db87d' : '#888';
        const amount   = t.amount != null ? _esc((t.label === 'expense' ? '-' : '+') + '\u20B9' + Number(t.amount).toLocaleString('en-IN')) : '\u2014';
        const rawLink  = t.email && t.email.gmail_link;
        const href     = (rawLink && rawLink.startsWith('https://mail.google.com/')) ? rawLink : '#';
        const stColor  = t.status === 'auto' ? '#5db87d' : t.status === 'corrected' ? '#7c83fd' : '#f0a500';
        return `<tr>
          <td>${date}</td>
          <td>${merchant}</td>
          <td>${category}</td>
          <td><span class="badge ${label}">${label}</span></td>
          <td style="color:${amtColor}">${amount}</td>
          <td><a href="${href}" target="_blank" rel="noopener" class="link">Email</a></td>
          <td style="font-size:11px;color:${stColor}">${status}</td>
        </tr>`;
      }).join('');
    }
  } catch (_) {}
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function _poll() {
  let p;
  try {
    p = await fetch('/api/sync/progress').then(r => r.json());
  } catch (_) { return; } // network blip

  _renderProgress(p);

  const finished = !p.running || p.phase === 'done' || p.phase === 'error' || p.phase === 'idle';
  if (finished) {
    clearTimeout(_syncPollTimer); _syncPollTimer = null;
    return;
  }

  // Live dashboard refresh every ~5 polls during classifying
  _dashRefreshTick++;
  if (_dashRefreshTick % 5 === 0) _refreshDashboardIfPresent();

  // Reschedule with adaptive interval
  const interval = POLL_MS[p.phase] ?? POLL_MS.default;
  if (p.phase !== _lastPhase) {
    clearTimeout(_syncPollTimer);
    _syncPollTimer = setTimeout(_poll, interval);
  }
  _lastPhase = p.phase;
}

function _startPolling() {
  if (_syncPollTimer) return;
  _lastPhase = null; _dashRefreshTick = 0;
  _poll();
  _syncPollTimer = setTimeout(_poll, POLL_MS.default);
}

// ── Public: Sync Now button ───────────────────────────────────────────────────

async function triggerSync() {
  const navBtn = document.querySelector('nav .btn-primary');
  if (navBtn) { navBtn.textContent = 'Syncing…'; navBtn.disabled = true; }

  // Reset panel
  _renderedCount = 0;
  document.getElementById('sync-bar-fill').style.width = '0%';
  document.getElementById('sync-bar-pct').textContent = '';
  document.getElementById('sync-bar-fraction').textContent = '';
  document.getElementById('sync-previews').innerHTML = '';
  document.getElementById('tally-expense').textContent = '0';
  document.getElementById('tally-income').textContent  = '0';
  document.getElementById('tally-ignore').textContent  = '0';
  const doneEl = document.getElementById('sync-panel-done');
  doneEl.style.display = 'none'; doneEl.style.color = '#5db87d';
  const spinner = document.getElementById('sync-panel-spinner');
  spinner.textContent = '↻'; spinner.classList.add('spinning'); spinner.style.color = '#7c83fd';
  document.getElementById('sync-panel-phase').textContent = 'Connecting…';

  _showSyncPanel();

  try {
    await fetch('/api/sync/trigger', { method: 'POST' });
  } catch (_) {
    if (navBtn) { navBtn.textContent = 'Sync Now'; navBtn.disabled = false; }
    _hideSyncPanel(0);
    return;
  }

  _startPolling();
}


// ── Resume if sync was already running when page loaded ───────────────────────

(async () => {
  try {
    const p = await fetch('/api/sync/progress').then(r => r.json());
    if (p.running) {
      _renderedCount = 0;
      _showSyncPanel();
      const navBtn = document.querySelector('nav .btn-primary');
      if (navBtn) { navBtn.textContent = 'Syncing…'; navBtn.disabled = true; }
      _renderProgress(p);
      _renderedCount = p.previews.length;
      _startPolling();
    }
  } catch (_) {}
})();

// ── Edit Modal ────────────────────────────────────────────────────────────────

(function _initEditModal() {
  const modalHTML = `
  <div id="edit-modal-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;align-items:center;justify-content:center">
    <div id="edit-modal" style="background:#0e0e1a;border:1px solid #2a2a4a;border-radius:10px;padding:20px;width:340px;max-width:95vw;font-size:13px;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div id="em-merchant" style="font-weight:600;color:#ccc"></div>
          <div id="em-meta" style="font-size:11px;color:#555;margin-top:2px"></div>
        </div>
        <button onclick="closeEditModal()" style="background:none;border:none;color:#444;font-size:18px;cursor:pointer;line-height:1">✕</button>
      </div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Label</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="em-lbl-btn" data-label="expense" onclick="_emSelectLabel('expense')" style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Expense</button>
        <button class="em-lbl-btn" data-label="income"  onclick="_emSelectLabel('income')"  style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Income</button>
        <button class="em-lbl-btn" data-label="ignore"  onclick="_emSelectLabel('ignore')"  style="flex:1;padding:7px 0;border:2px solid #2a2a4a;background:transparent;color:#555;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Ignore</button>
      </div>

      <div id="em-amount-wrap" style="margin-bottom:14px">
        <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Amount (₹)</div>
        <input id="em-amount" type="number" step="0.01" min="0" style="width:100%;background:#111;border:1px solid #2a2a4a;color:#ccc;padding:7px 10px;border-radius:6px;font-size:13px;box-sizing:border-box">
      </div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Category</div>
      <div id="em-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px"></div>

      <div style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Notes</div>
      <textarea id="em-notes" placeholder="Optional note…" style="width:100%;background:#111;border:1px solid #2a2a4a;color:#888;padding:7px 10px;border-radius:6px;font-size:12px;resize:none;height:56px;box-sizing:border-box;margin-bottom:16px"></textarea>

      <div style="display:flex;gap:8px">
        <button onclick="closeEditModal()" style="flex:1;padding:8px;background:transparent;border:1px solid #2a2a4a;color:#555;border-radius:7px;font-size:12px;cursor:pointer">Cancel</button>
        <button id="em-save-btn" onclick="_emSave()" style="flex:2;padding:8px;background:#7c83fd;border:none;color:#fff;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Save Changes</button>
      </div>
      <div id="em-error" style="color:#e07070;font-size:11px;margin-top:8px;display:none"></div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  document.getElementById('edit-modal-backdrop').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeEditModal();
  });
})();

let _emCurrentId = null;
let _emCurrentLabel = null;
let _emCurrentCategory = null;

function openEditModal(btn) {
  const row = btn.closest('tr');
  const { id, label, category, amount, notes } = row.dataset;
  _emCurrentId = id;
  _emCurrentCategory = category;

  document.getElementById('em-merchant').textContent = row.cells[1].textContent.trim();
  const date = row.cells[0].textContent.trim();
  const amtText = row.cells[3].textContent.trim();
  document.getElementById('em-meta').textContent = [date, amtText].filter(Boolean).join(' · ');

  document.getElementById('em-amount').value = amount || '';
  document.getElementById('em-notes').value = notes || '';

  const cats = ['Food','Groceries','Shopping','Travel','Transport','Utilities',
                 'Entertainment','Healthcare','Education','UPI Payment','Bank Transfer','Income','Other'];
  const chipsEl = document.getElementById('em-chips');
  chipsEl.innerHTML = cats.map(c =>
    `<button type="button" data-cat="${_esc(c)}"
      style="padding:3px 9px;border-radius:20px;border:1px solid #2a2a4a;background:transparent;color:#555;font-size:11px;cursor:pointer"
      >${_esc(c)}</button>`
  ).join('') + `<input id="em-custom-cat" placeholder="Custom…"
      style="width:80px;padding:3px 8px;background:#111;border:1px solid #1a1a2a;color:#888;border-radius:20px;font-size:11px">`;
  chipsEl.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => _emSelectCat(btn.dataset.cat));
  });
  const customCat = document.getElementById('em-custom-cat');
  if (customCat) customCat.addEventListener('input', () => _emSelectCat(customCat.value));

  const editLabel = (label === 'needs_review' ? 'expense' : label) || 'expense';
  _emSelectLabel(editLabel);
  if (category) _emSelectCat(category);

  document.getElementById('em-error').style.display = 'none';
  const backdrop = document.getElementById('edit-modal-backdrop');
  backdrop.style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal-backdrop').style.display = 'none';
  _emCurrentId = null;
}

function _emSelectLabel(label) {
  _emCurrentLabel = label;
  const color = { expense: '#e07070', income: '#5db87d', ignore: '#888' };
  const bg    = { expense: '#2a1a1a', income: '#1a2a1a', ignore: '#1a1a1a' };
  document.querySelectorAll('.em-lbl-btn').forEach(btn => {
    const l = btn.dataset.label;
    const active = l === label;
    btn.style.borderColor = active ? (color[l] || '#7c83fd') : '#2a2a4a';
    btn.style.background  = active ? (bg[l]    || '#1a1a2a') : 'transparent';
    btn.style.color       = active ? (color[l] || '#ccc')    : '#555';
  });
  document.getElementById('em-amount-wrap').style.display = label === 'ignore' ? 'none' : 'block';
}

function _emSelectCat(cat) {
  _emCurrentCategory = cat;
  document.querySelectorAll('#em-chips [data-cat]').forEach(btn => {
    const active = btn.dataset.cat === cat;
    btn.style.borderColor = active ? '#7c83fd' : '#2a2a4a';
    btn.style.background  = active ? '#1a1a3a' : 'transparent';
    btn.style.color       = active ? '#7c83fd' : '#555';
  });
}

async function _emSave() {
  if (!_emCurrentId) return;
  const saveBtn = document.getElementById('em-save-btn');
  saveBtn.textContent = 'Saving…'; saveBtn.disabled = true;

  const body = { label: _emCurrentLabel };
  const amtVal = document.getElementById('em-amount').value;
  if (amtVal && _emCurrentLabel !== 'ignore') body.amount = parseFloat(amtVal);
  if (_emCurrentCategory) body.category = _emCurrentCategory;
  const notes = document.getElementById('em-notes').value.trim();
  if (notes) body.user_notes = notes;

  try {
    const resp = await fetch('/api/transactions/' + _emCurrentId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || 'Save failed');

    const row = document.querySelector(`tr[data-id="${_emCurrentId}"]`);
    if (row) {
      const l = _emCurrentLabel;
      const amtColor = { expense:'#e07070', income:'#5db87d', ignore:'#555', needs_review:'#7c83fd' }[l] || '#888';
      const badgeBg  = { expense:'#2a1a1a', income:'#1a2a1a', ignore:'#1a1a1a', needs_review:'#1a1a2a' }[l] || '#1a1a1a';

      row.dataset.label    = l;
      row.dataset.category = _emCurrentCategory || '';
      row.dataset.amount   = amtVal || '';
      row.dataset.notes    = notes;

      row.className = `lbl-${l}`;
      row.cells[4].innerHTML = `<span style="background:${badgeBg};color:${amtColor};padding:2px 8px;border-radius:4px;font-size:10px;letter-spacing:.3px">${l}</span>`;
      row.cells[3].style.color = amtColor;
      if (body.amount != null) {
        row.cells[3].textContent = '₹' + Number(body.amount).toLocaleString('en-IN');
        row.cells[3].style.fontWeight = '600';
      }
      if (_emCurrentCategory) row.cells[2].textContent = _emCurrentCategory;
    }
    closeEditModal();
  } catch (e) {
    const errEl = document.getElementById('em-error');
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    saveBtn.textContent = 'Save Changes'; saveBtn.disabled = false;
  }
}

// ── Hover email preview ───────────────────────────────────────────────────────

let _hoverTimer = null;
let _tooltipDismissTimer = null;
const _HOVER_DELAY = 3000;
const _GRACE_MS    = 200;

function _attachHoverListeners() {
  document.querySelectorAll('#txn-body tr[data-id]').forEach(row => {
    row.addEventListener('mouseenter', _onRowEnter);
    row.addEventListener('mouseleave', _onRowLeave);
  });
}

function _onRowEnter(e) {
  const row = e.currentTarget;
  clearTimeout(_hoverTimer);
  _hoverTimer = setTimeout(() => _showTooltip(row), _HOVER_DELAY);
}

function _onRowLeave() {
  clearTimeout(_hoverTimer);
  _tooltipDismissTimer = setTimeout(_removeTooltip, _GRACE_MS);
}

async function _showTooltip(row) {
  const id = row.dataset.id;
  _removeTooltip();

  let data;
  try {
    const resp = await fetch('/api/transactions/' + id);
    if (!resp.ok) return;
    data = await resp.json();
  } catch (_) { return; }

  const email = data.email || {};
  const bodyRaw = email.body_text || email.body_snippet || '';
  const bodyClean = bodyRaw.replace(/<[^>]*>/g, '').trim();

  const subject   = email.subject   || '(no subject)';
  const sender    = email.sender    || '';
  const dateStr   = (email.received_at || '').slice(0, 10);
  const gmailLink = email.gmail_link || '#';

  const tip = document.createElement('div');
  tip.id = 'email-tooltip';
  tip.innerHTML = `
    <div class="tip-subject">${_escTip(subject)}</div>
    <div class="tip-meta">
      <span>${_escTip(sender)}${dateStr ? ' · ' + dateStr : ''}</span>
      <a href="${/^https?:\/\//.test(gmailLink) ? gmailLink : '#'}" target="_blank" rel="noopener noreferrer" style="color:#7c83fd;font-size:11px;white-space:nowrap;margin-left:10px">Gmail ↗</a>
    </div>
    <div class="tip-body">${_escTip(bodyClean) || '<span style="color:#444">No body text available.</span>'}</div>`;

  tip.addEventListener('mouseenter', () => clearTimeout(_tooltipDismissTimer));
  tip.addEventListener('mouseleave', _removeTooltip);

  // Append hidden first so offsetHeight is measurable
  tip.style.visibility = 'hidden';
  document.body.appendChild(tip);

  const rect = row.getBoundingClientRect();
  const tipW = 420;
  const tipH = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left;
  let top  = rect.bottom + 6;

  if (left + tipW > vw - 10) left = vw - tipW - 10;
  if (left < 10) left = 10;
  if (top + tipH > vh - 10) {
    top = rect.top - tipH - 6;
  }
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
  tip.style.visibility = '';
}

function _removeTooltip() {
  const existing = document.getElementById('email-tooltip');
  if (existing) existing.remove();
}

function _escTip(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') _removeTooltip();
});
