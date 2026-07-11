/* ============================================================
   RestroSuite — Growth Hub shell tiles (Wave 12)
   Full screens live in features-growth.js (RS.openGrowthHubScreen).
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  const HUB = [
    { ic: 'fa-calendar-check', bg: 'bg-o', t: 'Reservations', d: 'Manage table bookings & waitlist', m: '8 today' },
    { ic: 'fa-headset', bg: 'bg-v', t: 'Support Tickets', d: 'Customer queries & complaints', m: '2 open' },
    { ic: 'fa-truck-ramp-box', bg: 'bg-t', t: 'Purchase Orders', d: 'Raise & track supplier POs', m: '3 pending' },
    { ic: 'fa-flask-vial', bg: 'bg-g', t: 'Recipe Costing', d: 'Plate cost & margin calculator', m: '68% margin' },
    { ic: 'fa-tags', bg: 'bg-a', t: 'Offers & Coupons', d: 'Build promos & festival deals', m: '4 live' },
    { ic: 'fa-bullhorn', bg: 'bg-o', t: 'WhatsApp Campaigns', d: 'Broadcast to your customer list', m: '3.1k reach' },
    { ic: 'fa-star', bg: 'bg-v', t: 'Feedback & Reviews', d: 'Collect & respond to ratings', m: '4.8 ★' },
    { ic: 'fa-gift', bg: 'bg-g', t: 'Loyalty Program', d: 'Points, tiers & rewards', m: '412 members' },
  ];

  function renderHub() {
    const grid = $('#hub-grid');
    if (!grid) return;
    grid.innerHTML = HUB.map(
      (h) => `
      <div class="hub-card">
        <div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div>
        <h4>${_e(h.t)}</h4><p>${_e(h.d)}</p>
        <span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${_e(h.m)}</span>
      </div>`
    ).join('');
    $$('#hub-grid .hub-card').forEach((c) =>
      c.addEventListener('click', () => {
        const screen = c.querySelector('h4')?.textContent || '';
        if (global.RS && typeof RS.openGrowthHubScreen === 'function') {
          RS.openGrowthHubScreen(screen);
          return;
        }
        toast('Growth Hub module is still loading. Try again in a moment.', 'fa-arrow-up-right-from-square');
      })
    );
  }

  function renderGrowthHub() {
    return renderHub();
  }

  global.RSGrowthHubShell = { renderHub, renderGrowthHub, HUB };

  function attach() {
    if (!global.RS) return;
    global.RS.renderGrowthHub = renderGrowthHub;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
