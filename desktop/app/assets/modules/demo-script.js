/* ============================================================
   RestroSuite — In-app demo checklist (Wave product pack)
   Opens from Help or window.openDemoScript()
   ============================================================ */
(function (global) {
  'use strict';

  const STEPS = [
    { id: 'login', label: 'Sign in to the demo outlet', tab: null },
    { id: 'shift', label: 'Open a shift (set cash float)', tab: 'pos-tab' },
    { id: 'station', label: 'Confirm station name on the POS bar', tab: 'pos-tab' },
    { id: 'sell', label: 'Add items and complete one bill (UPI or Cash)', tab: 'pos-tab' },
    { id: 'receipt', label: 'Review bill-settled receipt preview', tab: 'pos-tab' },
    { id: 'whatsapp', label: 'Send WhatsApp PDF (if gateway linked)', tab: 'pos-tab' },
    { id: 'bills', label: 'Find the bill under Bills history', tab: 'bills-tab' },
    { id: 'reports', label: 'Open Reports → download GSTR CSV', tab: 'reports-tab' },
    { id: 'zclose', label: 'Preview Z then Close shift (print/CSV)', tab: 'pos-tab' },
  ];

  const KEY = 'rs_demo_checklist_v1';

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (_) {
      return {};
    }
  }
  function saveState(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st || {}));
    } catch (_) {}
  }

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function canOpenDemoScript() {
    try {
      if (global.RS_API && RS_API.enableDemoTools) return true;
      const sess = global.RS_API && RS_API.session && RS_API.session();
      if (sess && String(sess.role || '').toLowerCase() === 'superadmin') return true;
      // Owner/manager learn-by-doing (customer training checklist)
      const role = String((sess && sess.role) || sessionStorage.getItem('logged_in_role') || '').toLowerCase();
      if (role === 'owner' || role === 'admin' || role === 'manager') return true;
      if (sessionStorage.getItem('rs_learn_mode') === '1') return true;
      const h = String(location.hostname || '');
      if (h === 'localhost' || h === '127.0.0.1') return true;
    } catch (_) {}
    return false;
  }

  function openDemoScript() {
    // Owners get learn-by-doing; internal demo tools still available on localhost/SA
    if (!canOpenDemoScript()) return;
    document.getElementById('rs-demo-overlay')?.remove();
    const state = loadState();
    const overlay = document.createElement('div');
    overlay.id = 'rs-demo-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10050;background:rgba(17,24,39,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px';
    const done = STEPS.filter((s) => state[s.id]).length;
    overlay.innerHTML = `
      <div style="background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:16px;width:min(420px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.2);padding:20px 18px 16px;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,79,0,.12);display:grid;place-items:center;color:#FF4F00"><i class="fa-solid fa-clapperboard"></i></div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:16px;color:var(--text,#111)">Learn by doing</div>
            <div style="font-size:12px;color:var(--text-soft,#6b7280)">${done}/${STEPS.length} complete · sell → bills → reports</div>
          </div>
          <button type="button" id="rs-demo-x" style="border:0;background:transparent;font-size:18px;cursor:pointer;color:var(--text-soft)">×</button>
        </div>
        <ol id="rs-demo-list" style="list-style:none;padding:0;margin:14px 0;display:flex;flex-direction:column;gap:8px"></ol>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="button" class="btn btn-ghost" id="rs-demo-reset" style="flex:1">Reset</button>
          <button type="button" class="btn btn-primary" id="rs-demo-go" style="flex:2"><i class="fa-solid fa-play"></i> Next step</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const list = overlay.querySelector('#rs-demo-list');
    function paint() {
      const st = loadState();
      list.innerHTML = STEPS.map((s, i) => {
        const checked = !!st[s.id];
        return `<li data-id="${s.id}" data-tab="${s.tab || ''}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--stroke-2);background:var(--glass,#f9fafb);cursor:pointer">
          <span style="width:22px;height:22px;border-radius:6px;border:2px solid ${checked ? '#22c55e' : 'var(--stroke-2)'};background:${checked ? '#22c55e' : 'transparent'};color:#fff;display:grid;place-items:center;font-size:11px;flex-shrink:0">${checked ? '✓' : i + 1}</span>
          <span style="font-size:13px;color:var(--text);line-height:1.4;${checked ? 'text-decoration:line-through;opacity:.65' : ''}">${s.label}</span>
        </li>`;
      }).join('');
      list.querySelectorAll('li').forEach((li) => {
        li.onclick = () => {
          const st2 = loadState();
          const id = li.dataset.id;
          st2[id] = !st2[id];
          saveState(st2);
          paint();
          const tab = li.dataset.tab;
          if (tab && global.RS && typeof RS.activateTab === 'function') {RS.activateTab(tab);}
        };
      });
    }
    paint();

    overlay.querySelector('#rs-demo-x').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {overlay.remove();}
    });
    overlay.querySelector('#rs-demo-reset').onclick = () => {
      saveState({});
      paint();
      toast('Demo checklist reset', 'fa-rotate-left');
    };
    overlay.querySelector('#rs-demo-go').onclick = () => {
      const st = loadState();
      const next = STEPS.find((s) => !st[s.id]);
      if (!next) {
        toast('Demo complete — great show!', 'fa-circle-check');
        return;
      }
      if (next.tab && global.RS && typeof RS.activateTab === 'function') {RS.activateTab(next.tab);}
      toast('Next: ' + next.label, 'fa-arrow-right');
      overlay.remove();
    };
  }

  global.openDemoScript = openDemoScript;
  global.RSDemoScript = { open: openDemoScript, STEPS };

  // Hook Help button: long-press or second entry
  function wireHelp() {
    const btn = document.getElementById('open-product-guide-btn');
    if (!btn || btn.dataset.demoWired) {return;}
    btn.dataset.demoWired = '1';
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openDemoScript();
    });
    // Also expose a data attribute for programmatic open
    btn.setAttribute('title', (btn.getAttribute('title') || 'Help & Setup') + ' · Right-click for demo checklist');
  }

  if (document.readyState === 'loading') {document.addEventListener('DOMContentLoaded', () => setTimeout(wireHelp, 800));}
  else {setTimeout(wireHelp, 800);}
  document.addEventListener('rs:ready', () => setTimeout(wireHelp, 200));
})(typeof window !== 'undefined' ? window : globalThis);
