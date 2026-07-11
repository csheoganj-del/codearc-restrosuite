/* ============================================================
   RestroSuite — Reports UI (Wave 8 code-split)
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $$(sel, r) {
    return Array.from((r || document).querySelectorAll(sel));
  }

  async function renderReports(period) {
    const BILLS = (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
    const MENU = (global.RS && RS.MENU) || [];

  period = period || 'Last 30 days';
  const days = period==='Today'?1:period==='This week'?7:period==='This month'?30:period==='Last 90 days'?90:30;
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const todayStart = (function(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

  // Wave 2: prefer server aggregate (full history, not capped client list)
  let serverSummary = null;
  try {
    if (window.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
      const res = await Promise.race([
        RS_API.data({ operation: 'sales_summary', days }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
      const payload = res && res.ok != null ? res : (res && res.data) || res;
      if (payload && payload.ok) serverSummary = payload;
    }
  } catch (e) {
    console.warn('[Reports] sales_summary unavailable, using local bills', e && e.message);
  }

  const paidBills = BILLS.filter(b => {
    if (b.status !== 'paid') return false;
    const t = b.dateTime ? new Date(b.dateTime).getTime() : (b.time ? new Date(b.time).getTime() : 0);
    return t >= cutoff;
  });

  let totalRevenue = paidBills.reduce((sum,b)=>sum+(b.amount||b.total||0),0);
  let totalOrders = paidBills.length;
  let aov = totalOrders>0 ? Math.round(totalRevenue/totalOrders) : 0;
  if (serverSummary) {
    totalRevenue = Number(serverSummary.revenue) || 0;
    totalOrders = Number(serverSummary.orders) || 0;
    aov = Number(serverSummary.aov) || (totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0);
  }

  // Tax: use stored fields when available, else estimate by tax category
  let gst5=0, gst12=0, gst18=0, gst28=0;
  paidBills.forEach(b => {
    if (b.taxSummary && typeof b.taxSummary === 'object') {
      Object.entries(b.taxSummary).forEach(([rate, obj]) => {
        const tax = (obj && obj.tax) ? obj.tax : 0;
        if (rate==='5') gst5+=tax;
        else if (rate==='12') gst12+=tax;
        else if (rate==='18') gst18+=tax;
        else if (rate==='28') gst28+=tax;
        else gst5+=tax;
      });
    } else {
      // Fallback estimate
      gst5 += Math.round((b.cgst||0) + (b.sgst||0));
      if (!b.cgst && !b.sgst) gst5 += Math.round((b.amount||0)/1.05*0.05);
    }
  });
  let totalGST = gst5+gst12+gst18+gst28;
  let netSales = totalRevenue - totalGST;
  if (serverSummary) {
    totalGST = Number(serverSummary.gst) || totalGST;
    netSales = serverSummary.net_sales != null ? Number(serverSummary.net_sales) : (totalRevenue - totalGST);
  }

  // Daily revenue (days slots, oldest->newest)
  const dailySlots = Array(days).fill(0);
  const dailyLabels = [];
  for (let i=days-1;i>=0;i--) {
    const d = new Date(now - i*86400000);
    dailyLabels.push(days<=7 ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : (d.getDate()+'/'+((d.getMonth()+1))));
  }
  if (serverSummary && Array.isArray(serverSummary.daily) && serverSummary.daily.length) {
    serverSummary.daily.forEach(row => {
      const t = row.day ? new Date(row.day).getTime() : 0;
      const age = Math.floor((now - t) / 86400000);
      if (age >= 0 && age < days) dailySlots[days - 1 - age] += Number(row.revenue || 0);
    });
  } else {
    paidBills.forEach(b => {
      const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
      const age = Math.floor((now-t)/86400000);
      if (age>=0 && age<days) dailySlots[days-1-age] += (b.amount||b.total||0);
    });
  }
  const maxSlot = Math.max(...dailySlots,1);
  const hasDailyData = dailySlots.some(v=>v>0);

  // Payment mix
  const payMap = {};
  if (serverSummary && serverSummary.payment_mix && typeof serverSummary.payment_mix === 'object') {
    Object.entries(serverSummary.payment_mix).forEach(([m, val]) => {
      payMap[m] = Number(val) || 0;
    });
  } else {
    paidBills.forEach(b => {
      if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach(t => { const m=t.method||'Cash'; payMap[m]=(payMap[m]||0)+Number(t.amount||0); });
      } else {
        const m=b.pay||b.paymentMethod||'Cash'; payMap[m]=(payMap[m]||0)+(b.amount||0);
      }
    });
  }
  const payTotal = Object.values(payMap).reduce((a,v)=>a+v,0)||1;
  const payColors = {Cash:'var(--green)',UPI:'var(--violet)',Card:'var(--orange)',Due:'var(--red)',Stripe:'var(--blue-soft)',Online:'var(--violet-soft)'};
  const payEntries = Object.entries(payMap).sort((a,b)=>b[1]-a[1]);
  let acc=0;
  const payMix = payEntries.map(([name,val])=>{
    const pct=Math.round(val/payTotal*100);
    return [name,pct,payColors[name]||'var(--amber)'];
  }).filter(p=>p[1]>0);
  let conicAcc=0;
  const seg = payMix.map(p=>{const s=`${p[2]} ${conicAcc}% ${conicAcc+p[1]}%`;conicAcc+=p[1];return s;}).join(',');

  // Category breakdown from _items
  const catSales = {};
  paidBills.forEach(b => {
    (b._items||[]).forEach(it => {
      if (!it||!it.name) return;
      // Older bills didn't store the category on each line item -- fall back
      // to looking the item up in the current menu by name so it isn't
      // lumped under "Uncategorized" in the category breakdown.
      let cat = it.category||it.cat;
      if (!cat) { const mm = MENU.find(x=>x.name===it.name); cat = (mm && mm.cat) || 'Uncategorized'; }
      catSales[cat] = (catSales[cat]||0) + (it.price||0)*(it.qty||1);
    });
    // fallback: parse old string-format items
    if (!b._items || !b._items.length) {
      const items = typeof b.items==='string' ? b.items.split(',') : [];
      items.forEach(str => {
        const m = MENU.find(x=>str.trim().startsWith(x.name));
        if (m) { const cat=m.cat||'Uncategorized'; catSales[cat]=(catSales[cat]||0)+(m.price||0); }
      });
    }
  });
  const catTotal = Object.values(catSales).reduce((a,v)=>a+v,0)||1;
  const sortedCats = Object.entries(catSales).sort((a,b)=>b[1]-a[1]).map(([name,val])=>[name,Math.round(val/catTotal*100)]);

  // Top items table
  const itemMap = {};
  paidBills.forEach(b => {
    (b._items||[]).forEach(it => {
      if (!it||!it.name) return;
      if (!itemMap[it.name]) itemMap[it.name]={qty:0,rev:0};
      itemMap[it.name].qty += (it.qty||1);
      itemMap[it.name].rev += (it.price||0)*(it.qty||1);
    });
  });
  const topItems = Object.entries(itemMap).sort((a,b)=>b[1].rev-a[1].rev).slice(0,6);

  const tab = document.getElementById('reports-tab');
  if (!tab) return;

  tab.innerHTML = `
    <div class="toolbar-row" style="margin-bottom:4px">
      <span class="eyebrow">${period}${serverSummary ? ' · <span style="color:var(--green);font-weight:700">server totals</span>' : ' · local bills'}</span>
      <div class="grow"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['Today','This week','This month','Last 30 days','Last 90 days'].map(p=>
          `<button class="btn btn-sm ${p===period?'btn-primary':'btn-ghost'}" onclick="window._renderReports('${p}')">${p}</button>`
        ).join('')}
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(totalRevenue)}</div><div class="sl">Revenue</div><div class="sd">${period}</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-receipt"></i></div><div><div class="sv">${totalOrders}</div><div class="sl">Orders</div><div class="sd">bills generated</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-money-bill-trend-up"></i></div><div><div class="sv">${rs(aov)}</div><div class="sl">Avg order value</div></div></div>
      <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(totalGST)}</div><div class="sl">GST collected</div></div></div>
    </div>

    <div class="report-grid">
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Daily revenue</h3><span class="ph-sub">${period} · hover for value</span></div>
        <div class="chart-bars" id="chart-revenue">
          ${hasDailyData
            ? dailySlots.map((v,i)=>`<div class="cbar"><div class="bar" style="height:0" data-h="${Math.round(v/maxSlot*100)}"><span class="bv">${rs(v)}</span></div><span class="bl">${dailyLabels[i]}</span></div>`).join('')
            : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-mute);font-size:12px;width:100%">No sales data for this period</div>`
          }
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Payment mix</h3></div>
        <div class="donut-wrap">
          <div class="donut" id="donut-pay" style="${seg?`background:conic-gradient(${seg})`:'background:var(--glass-2)'}">
            <div class="donut-center"><div class="dc-v">${rs(totalRevenue)}</div><div class="dc-l">collected</div></div>
          </div>
          <div class="legend" id="legend-pay">
            ${payMix.length>0
              ? payMix.map(p=>`<div class="lg-item"><span class="lg-sw" style="background:${p[2]}"></span>${_e(p[0])}<span class="lg-val">${p[1]}%</span></div>`).join('')
              : '<div style="color:var(--text-mute);font-size:12px;margin-top:10px;text-align:center">No payments recorded</div>'
            }
          </div>
        </div>
      </div>
    </div>

    <div class="report-grid" style="margin-top:16px">
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Top categories by revenue</h3></div>
        <div id="cat-bars">
          ${sortedCats.length>0
            ? sortedCats.map(c=>`<div style="margin-bottom:13px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span>${_e(c[0])}</span><b style="color:var(--text)">${c[1]}%</b></div>
                <div style="height:8px;background:var(--glass-2);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:0;background:linear-gradient(90deg,var(--orange-soft),var(--orange-deep));transition:width 1s var(--ease)" data-w="${c[1]}"></span></div>
              </div>`).join('')
            : '<div style="color:var(--text-mute);font-size:12px;text-align:center;padding:20px">No category data yet</div>'
          }
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-head"><h3>Tax summary</h3></div>
        <table class="data-table"><tbody>
          <tr><td>GST @ 5% (food)</td><td class="td-strong" style="text-align:right">${rs(gst5)}</td></tr>
          ${gst12>0?`<tr><td>GST @ 12%</td><td class="td-strong" style="text-align:right">${rs(gst12)}</td></tr>`:''}
          ${gst18>0?`<tr><td>GST @ 18% (packaged)</td><td class="td-strong" style="text-align:right">${rs(gst18)}</td></tr>`:''}
          ${gst28>0?`<tr><td>GST @ 28% (luxury)</td><td class="td-strong" style="text-align:right">${rs(gst28)}</td></tr>`:''}
          <tr><td>Net taxable sales</td><td class="td-strong" style="text-align:right">${rs(netSales)}</td></tr>
          <tr><td><b style="color:var(--text)">Total tax payable</b></td><td style="text-align:right"><b style="color:var(--orange);font-size:15px">${rs(totalGST)}</b></td></tr>
        </tbody></table>
        <button class="btn btn-ghost btn-block" id="btn-download-gstr" style="margin-top:14px"><i class="fa-solid fa-file-arrow-down"></i> Download GSTR-ready CSV</button>
      </div>
    </div>

    ${topItems.length>0?`
    <div class="panel panel-pad" style="margin-top:16px">
      <div class="panel-head"><h3>Top items by revenue</h3><span class="pill">${period}</span></div>
      <table class="data-table"><thead><tr><th>#</th><th>Item</th><th>Qty sold</th><th style="text-align:right">Revenue</th></tr></thead><tbody>
        ${topItems.map(([name,d],i)=>`<tr><td style="color:var(--text-mute);width:24px">${i+1}</td><td><b>${_e(name)}</b></td><td>${d.qty}</td><td style="text-align:right;color:var(--green)">${rs(d.rev)}</td></tr>`).join('')}
      </tbody></table>
    </div>`:''}
  `;

  // Animate bars
  setTimeout(()=>$$('#chart-revenue .bar').forEach(b=>b.style.height=b.dataset.h+'%'),60);
  setTimeout(()=>$$('#cat-bars [data-w]').forEach(s=>s.style.width=s.dataset.w+'%'),80);

  // GSTR CSV download
  const gstrBtn = document.getElementById('btn-download-gstr');
  if (gstrBtn) gstrBtn.onclick = () => {
    const rows = [['Bill No','Date','Customer','Amount','GST 5%','GST 12%','GST 18%','GST 28%','Payment Method']];
    paidBills.forEach(b => {
      const ts = b.taxSummary||{};
      rows.push([
        b.no||b.id||'',
        b.dateTime ? new Date(b.dateTime).toLocaleDateString('en-IN') : '',
        b.customerName||'Walk-in Guest',
        b.amount||b.total||0,
        ts['5']?ts['5'].tax||0:0,
        ts['12']?ts['12'].tax||0:0,
        ts['18']?ts['18'].tax||0:0,
        ts['28']?ts['28'].tax||0:0,
        b.pay||b.paymentMethod||''
      ]);
    });
    const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv);
    a.download = 'GSTR_report_'+new Date().toISOString().slice(0,10)+'.csv';
    a.click();
    toast('GSTR CSV downloaded','fa-file-arrow-down');
  };
  }

  global.RSReportsUI = { renderReports };
  global._renderReports = (p) => renderReports(p);

  function attach() {
    if (!global.RS) return;
    global.RS.renderReports = renderReports;
  }
  if (global.RS) attach();
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
