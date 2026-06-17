/* ============================================================
   RestroSuite — Token Display, Tax & GST, Advanced Analytics
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ===================== TOKEN DISPLAY ===================== */
    const PREPARING = [];
    const READY = [];
    function renderTokens(){
      const sec = $('#tokens-tab');
      sec.innerHTML = `
        <div class="token-board-head glass-row">
          <div class="row" style="gap:11px"><span class="tb-ic"><i class="fa-solid fa-bullhorn"></i></span><div><div style="font-weight:700;font-size:15px">Customer Token Monitor</div><div style="font-size:12px;color:var(--text-mute)">Mount this screen at your pickup counter</div></div></div>
          <span class="pill pill-green"><span class="dot dot-live"></span> Live · auto-refresh</span>
        </div>
        <div class="token-board">
          <div class="token-col">
            <div class="token-col-h preparing"><i class="fa-solid fa-fire"></i> Preparing · ${PREPARING.length}</div>
            <div class="token-list">${PREPARING.map(t=>`<div class="token-chip prep"><div class="tk">${t.tok}</div><div class="tmeta">${t.type} · ${t.items} items</div><div class="tmin"><i class="fa-solid fa-clock"></i> ${t.min}m</div></div>`).join('')}</div>
          </div>
          <div class="token-col">
            <div class="token-col-h ready"><i class="fa-solid fa-circle-check"></i> Ready for pickup · ${READY.length}</div>
            <div class="token-list">${READY.map(t=>`<div class="token-chip rdy" data-tok="${t.tok}"><div class="tk">${t.tok}</div><div class="tmeta">${t.type} · ${t.items} items</div><div class="tcall"><i class="fa-solid fa-bell"></i> Now serving</div></div>`).join('')}</div>
          </div>
        </div>`;
      $$('.token-chip.rdy',sec).forEach(c=> c.onclick=()=> RS.toast('Announced '+c.dataset.tok+' at counter','fa-bullhorn'));
    }
    RS.titles['tokens-tab']=['Token Display','Customer-facing pickup token board'];
    RS.addRenderer('tokens-tab', renderTokens);

    /* ===================== TAX & GST ===================== */
    function renderTax(){
      const sec = $('#tax-tab');
      const TAX_LEDGER = (RS.BILLS || []).filter(b => b.status === 'paid').map(b => {
        const total = b.amount || 0;
        const taxable = Math.round(total / 1.05 * 100) / 100;
        return {
          no: b.no,
          cust: b.customerName || 'Walk-in Guest',
          time: b.time,
          taxable: taxable,
          pay: b.pay || 'UPI'
        };
      });
      const taxable = TAX_LEDGER.reduce((a,r)=>a+r.taxable,0);
      const cgst = Math.round(taxable*0.025), sgst = cgst, total = cgst+sgst;
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(taxable)}</div><div class="sl">Net taxable supplies</div><div class="sd">Excl. tax &amp; discounts</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(cgst)}</div><div class="sl">CGST collected (2.5%)</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-t"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(sgst)}</div><div class="sl">SGST collected (2.5%)</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-sack-dollar"></i></div><div><div class="sv">${rs(total)}</div><div class="sl">Total tax collected</div><div class="sd up">Avg rate 5%</div></div></div>
        </div>

        <div class="report-grid" style="--cols:1fr 1fr;margin-top:4px">
          <div class="panel panel-pad">
            <div class="panel-head"><h3><i class="fa-solid fa-file-invoice" style="color:var(--orange);margin-right:8px"></i>GSTR-1 · Outward supplies</h3></div>
            <div class="kv-list">
              <div class="kv"><span>B2C (consumer) supplies</span><b>${rs(taxable)}</b></div>
              <div class="kv"><span>Total invoices logged</span><b>${TAX_LEDGER.length} invoices</b></div>
              <div class="kv"><span>IGST share</span><b>${rs(0)} · local</b></div>
            </div>
            <button class="btn btn-ghost btn-block" id="tax-gstr1" style="margin-top:14px"><i class="fa-solid fa-file-csv"></i> Download accountant GSTR CSV</button>
          </div>
          <div class="panel panel-pad">
            <div class="panel-head"><h3><i class="fa-solid fa-receipt" style="color:var(--green);margin-right:8px"></i>GSTR-3B · Tax liability</h3></div>
            <div class="kv-list">
              <div class="kv"><span>Outward taxable value</span><b>${rs(taxable)}</b></div>
              <div class="kv"><span>Total tax liability</span><b style="color:var(--red)">${rs(total)}</b></div>
              <div class="kv"><span>ITC claims available</span><b>${rs(0)} · N/A</b></div>
              <div class="kv"><span>Filing status</span><b><span class="pill pill-amber" style="padding:2px 9px">Due 20 Jul</span></b></div>
            </div>
            <button class="btn btn-primary btn-block" id="tax-file" style="margin-top:14px"><i class="fa-solid fa-paper-plane"></i> Prepare filing</button>
          </div>
        </div>

        <div class="panel panel-pad" style="margin-top:16px">
          <div class="panel-head"><h3>Tax invoice ledger</h3><div class="row" style="gap:8px"><button class="btn btn-ghost btn-sm" id="tax-json"><i class="fa-solid fa-file-code"></i> JSON</button><button class="btn btn-ghost btn-sm" id="tax-csv"><i class="fa-solid fa-file-csv"></i> CSV</button></div></div>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice #</th><th>Customer</th><th>Date &amp; time</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total tax</th><th>Bill</th><th>Pay</th></tr></thead><tbody>
          ${TAX_LEDGER.length > 0 ? TAX_LEDGER.map(r=>{const c=Math.round(r.taxable*0.025);const tot=c*2;return `<tr><td><b>${r.no}</b></td><td>${r.cust}</td><td>${r.time}</td><td class="td-strong">${rs(r.taxable)}</td><td>${rs(c)}</td><td>${rs(c)}</td><td>${rs(tot)}</td><td class="td-strong">${rs(r.taxable+tot)}</td><td><span class="pill" style="padding:3px 9px">${r.pay}</span></td></tr>`;}).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-mute)">No compliance invoices logged</td></tr>'}
          </tbody></table></div>
        </div>

        <div class="report-grid" style="--cols:1fr 1fr;margin-top:16px">
          <div class="panel panel-pad">
            <div class="panel-head"><h3><i class="fa-solid fa-sliders" style="color:var(--orange);margin-right:8px"></i>GST rate configurator</h3></div>
            <div class="kv-list">
              <div class="kv"><span>Food &amp; beverages (dine-in)</span><b>5% GST</b></div>
              <div class="kv"><span>Packaged goods</span><b>12% GST</b></div>
              <div class="kv"><span>Branded / AC service</span><b>18% GST</b></div>
            </div>
            <button class="btn btn-ghost btn-block" id="tax-rates" style="margin-top:14px"><i class="fa-solid fa-pen"></i> Edit slabs</button>
          </div>
          <div class="panel panel-pad">
            <div class="panel-head"><h3><i class="fa-solid fa-database" style="color:var(--teal);margin-right:8px"></i>Compliance backups</h3></div>
            <div class="kv-list">
              <div class="kv"><span>Last cloud backup</span><b>Today · 2:00 AM</b></div>
              <div class="kv"><span>Retention</span><b>7 years (statutory)</b></div>
            </div>
            <div class="row" style="gap:8px;margin-top:14px"><button class="btn btn-ghost grow" id="tax-sql"><i class="fa-solid fa-database"></i> Export SQL</button><button class="btn btn-ghost grow" id="tax-import"><i class="fa-solid fa-file-import"></i> Import</button></div>
          </div>
        </div>`;
      const note = (msg)=> RS.toast(msg,'fa-file-invoice');
      ['tax-gstr1','tax-json','tax-csv','tax-sql'].forEach(id=>{
        const b=$('#'+id);
        if(b) {
          b.onclick=()=>{
            if(!TAX_LEDGER.length) return RS.toast('No invoices to export', 'fa-circle-exclamation');
            if(id === 'tax-json') {
              const json = JSON.stringify(TAX_LEDGER, null, 2);
              RS.downloadFile(json, 'application/json', `tax-ledger-${Date.now()}.json`);
              RS.toast('Ledger exported as JSON', 'fa-circle-check');
            } else if(id === 'tax-csv' || id === 'tax-gstr1') {
              const headers = ['Invoice Number', 'Customer', 'Date & Time', 'Taxable Amount', 'CGST (2.5%)', 'SGST (2.5%)', 'Total GST', 'Total Amount', 'Payment Method'];
              const csv = [
                headers.join(','),
                ...TAX_LEDGER.map(r => {
                  const cgst = Math.round(r.taxable * 0.025 * 100) / 100;
                  const sgst = cgst;
                  const gst = cgst + sgst;
                  const tot = r.taxable + gst;
                  return `"${r.no}","${r.cust}","${r.time}",${r.taxable},${cgst},${sgst},${gst},${tot},"${r.pay}"`;
                })
              ].join('\n');
              RS.downloadFile(csv, 'text/csv;charset=utf-8;', `${id === 'tax-gstr1' ? 'gstr1-report' : 'tax-ledger'}-${Date.now()}.csv`);
              RS.toast('Ledger exported as CSV', 'fa-circle-check');
            } else if(id === 'tax-sql') {
              const sql = TAX_LEDGER.map(r => {
                const cgst = Math.round(r.taxable * 0.025 * 100) / 100;
                const sgst = cgst;
                const gst = cgst + sgst;
                const tot = r.taxable + gst;
                return `INSERT INTO public.doppio_bills (orderId, customerName, dateTime, subtotal, gst, cgst, sgst, total, paymentMethod) VALUES ('${r.no}', '${r.cust.replace(/'/g, "''")}', '${r.time}', ${r.taxable}, ${gst}, ${cgst}, ${sgst}, ${tot}, '${r.pay}');`;
              }).join('\n');
              RS.downloadFile(sql, 'text/plain', `tax-ledger-${Date.now()}.sql`);
              RS.toast('Ledger exported as SQL', 'fa-circle-check');
            }
          };
        }
      });
      const fileBtn=$('#tax-file'); if(fileBtn) fileBtn.onclick=()=>note('GSTR-3B draft prepared for filing');
      const rateBtn = $('#tax-rates'); if(rateBtn) rateBtn.onclick=()=>RS.toast('Opening editor…','fa-pen');
      const importBtn = $('#tax-import');
      if(importBtn) {
        importBtn.onclick = () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = e => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async evt => {
              try {
                const data = JSON.parse(evt.target.result);
                const list = Array.isArray(data) ? data : [data];
                let count = 0;
                for(const item of list) {
                  if(item.no && item.taxable) {
                    const bill = {
                      id: 'bill_' + item.no,
                      no: item.no,
                      customerName: item.cust || 'Walk-in Guest',
                      time: item.time || new Date().toISOString(),
                      amount: item.taxable * 1.05,
                      pay: item.pay || 'UPI',
                      status: 'paid'
                    };
                    await RS.saveOne('bills', bill);
                    count++;
                  } else if (item.no && item.amount) {
                    await RS.saveOne('bills', item);
                    count++;
                  }
                }
                RS.toast(`${count} invoices imported successfully`, 'fa-circle-check');
                setTimeout(() => window.location.reload(), 1200);
              } catch(err) {
                console.error(err);
                RS.toast('Import failed: ' + err.message, 'fa-circle-exclamation');
              }
            };
            reader.readAsText(file);
          };
          input.click();
        };
      }
    }
    RS.titles['tax-tab']=['Tax & GST','GST returns, ledger & compliance'];
    RS.addRenderer('tax-tab', renderTax);

    /* ===================== ADVANCED ANALYTICS ===================== */
    const DAILY = [];
    const HOURS = [];
    const ITEMS = [];
    const PAY = [];
    const STAFF = [];

    function spark(data, color, h=120){
      if (!data || data.length === 0) {
        return `<div style="height:${h}px; display:flex; align-items:center; justify-content:center; color:var(--text-mute); font-size:12px; border:1px dashed var(--stroke); border-radius:8px;">No transaction data available yet</div>`;
      }
      const max=Math.max(...data) || 1, w=100, step=w/(data.length-1 || 1);
      const pts=data.map((v,i)=>`${(i*step).toFixed(1)},${(h-(v/max)*(h-12)-6).toFixed(1)}`).join(' ');
      const area=`0,${h} `+pts+` ${w},${h}`;
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#sg)"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
    }
    function donut(data){
      if (!data || data.length === 0) {
        return `<svg viewBox="0 0 120 120" style="width:150px;height:150px"><circle r="42" cx="60" cy="60" fill="none" stroke="var(--stroke)" stroke-dasharray="0 263.89" stroke-width="16" /><text x="60" y="56" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="800" font-family="Plus Jakarta Sans">0%</text><text x="60" y="72" text-anchor="middle" fill="var(--text-mute)" font-size="9">payments</text></svg>`;
      }
      let acc=0, segs='';
      const C=2*Math.PI*42;
      data.forEach(d=>{ const frac=d[1]/100; const len=frac*C; segs+=`<circle r="42" cx="60" cy="60" fill="none" stroke="${d[2]}" stroke-width="16" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-acc*C}" transform="rotate(-90 60 60)"/>`; acc+=frac; });
      return `<svg viewBox="0 0 120 120" style="width:150px;height:150px">${segs}<text x="60" y="56" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="800" font-family="Plus Jakarta Sans">100%</text><text x="60" y="72" text-anchor="middle" fill="var(--text-mute)" font-size="9">payments</text></svg>`;
    }
    function renderAnalytics(){
      const sec = $('#analytics-tab');
      const total = DAILY.reduce((a,b)=>a+b,0)*1000;
      const orders = 0, aov = 0, today=0, peakHour='N/A';
      sec.innerHTML = `
        <div class="toolbar-row"><span class="eyebrow">Last 30 days</span><div class="grow"></div>
          <select class="form-input" id="an-period" style="width:auto;padding:9px 32px 9px 14px"><option>Last 7 days</option><option selected>Last 30 days</option><option>Last 90 days</option></select>
          <button class="btn btn-ghost btn-sm" id="an-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button></div>
        <div class="stat-row" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
          <div class="stat-card"><div><div class="sl">Total revenue</div><div class="sv">${rs(total)}</div><div class="sd" style="display:none"></div></div></div>
          <div class="stat-card"><div><div class="sl">Total orders</div><div class="sv" style="color:var(--violet-soft)">${orders}</div><div class="sd">bills generated</div></div></div>
          <div class="stat-card"><div><div class="sl">Avg order value</div><div class="sv" style="color:var(--green)">${rs(aov)}</div><div class="sd">per transaction</div></div></div>
          <div class="stat-card"><div><div class="sl">Today's revenue</div><div class="sv" style="color:var(--amber)">${rs(today)}</div><div class="sd">0 orders today</div></div></div>
          <div class="stat-card"><div><div class="sl">Peak hour</div><div class="sv" style="color:var(--orange)">${peakHour}</div><div class="sd">Busiest: -</div></div></div>
        </div>

        <div class="report-grid" style="--cols:2fr 1fr;margin-top:4px">
          <div class="panel panel-pad">
            <div class="panel-head"><h3>Daily revenue trend</h3><span class="pill pill-green">0%</span></div>
            ${spark(DAILY,'var(--orange)',150)}
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-mute);margin-top:6px"><span>30 days ago</span><span>Today</span></div>
          </div>
          <div class="panel panel-pad">
            <div class="panel-head"><h3>Payment mix</h3></div>
            <div style="display:flex;align-items:center;gap:16px"><div>${donut(PAY)}</div><div style="flex:1">${PAY.length > 0 ? PAY.map(p=>`<div class="kv" style="padding:5px 0"><span><span class="lg-dot" style="background:${p[2]}"></span> ${p[0]}</span><b>${p[1]}%</b></div>`).join('') : '<div style="color:var(--text-mute);font-size:12px;text-align:center;">No payment data</div>'}</div></div>
          </div>
        </div>

        <div class="report-grid" style="--cols:1fr 1fr;margin-top:16px">
          <div class="panel panel-pad">
            <div class="panel-head"><h3>Hourly footfall</h3><span class="pill">Avg/day</span></div>
            <div class="bars" style="height:130px;display:flex;align-items:flex-end;gap:3px;justify-content:center;">
              ${HOURS.length > 0 ? HOURS.map((v,i)=>`<div style="flex:1;border-radius:3px 3px 0 0;background:${i>=19&&i<=21?'var(--orange)':'color-mix(in srgb,var(--orange) 35%,transparent)'};height:${Math.max(4,v/Math.max(...HOURS)*100)}%" title="${i}:00 · ${v} orders"></div>`).join('') : '<div style="color:var(--text-mute);font-size:12px;">No footfall data</div>'}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-mute);margin-top:6px"><span>12 AM</span><span>12 PM</span><span>11 PM</span></div>
          </div>
          <div class="panel panel-pad">
            <div class="panel-head"><h3>Top selling items</h3></div>
            <table class="data-table"><tbody>
              ${ITEMS.length > 0 ? ITEMS.map((it,i)=>`<tr><td style="width:24px;color:var(--text-mute)">${i+1}</td><td><b>${it[0]}</b></td><td>${it[1]} sold</td><td style="text-align:right;color:${it[2][0]==='-'?'var(--red)':'var(--green)'}">${it[2]}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-mute)">No sales items yet</td></tr>'}
            </tbody></table>
          </div>
        </div>

        <div class="panel panel-pad" style="margin-top:16px">
          <div class="panel-head"><h3>Staff performance</h3><span class="pill">This month</span></div>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Orders handled</th><th>Sales attributed</th><th>Share</th></tr></thead><tbody>
          ${STAFF.length > 0 ? STAFF.map(s=>{const pct=Math.round(s[2]/STAFF.reduce((a,x)=>a+x[2],0)*100);return `<tr><td><b>${s[0]}</b></td><td>${s[1]}</td><td>${s[2]}</td><td class="td-strong">${s[3]}</td><td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;border-radius:99px;background:var(--glass-3);max-width:90px"><div style="height:100%;border-radius:99px;background:var(--orange);width:${pct}%"></div></div><span style="font-size:12px;color:var(--text-mute)">${pct}%</span></div></td></tr>`;}).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-mute)">No staff performance records logged</td></tr>'}
          </tbody></table></div>
        </div>`;
      const r=$('#an-refresh'); if(r) r.onclick=()=>{ renderAnalytics(); RS.toast('Analytics refreshed','fa-rotate'); };
      const p=$('#an-period'); if(p) p.onchange=()=>RS.toast('Period: '+p.value,'fa-calendar');
    }
    RS.titles['analytics-tab']=['Advanced Analytics','Revenue, items, staff & payment insights'];
    RS.addRenderer('analytics-tab', renderAnalytics);
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
