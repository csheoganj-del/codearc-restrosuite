/* ============================================================
   RestroSuite -- Token Display, Tax & GST, Advanced Analytics
   ============================================================ */
(function(){
  'use strict';
  // HTML escaping -- prevents XSS when inserting DB-sourced strings into innerHTML
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ===================== TOKEN DISPLAY ===================== */
    const PREPARING = [];
    const READY = [];
    const ANNOUNCED_TOKEN_KEY = 'rs_last_announced_token';
    async function loadTokenOrders(){
      if(!window.RS_DB) return;
      const rows = await RS_DB.list('pending_orders').catch(() => []);
      PREPARING.length = 0;
      READY.length = 0;
      (rows || []).forEach(row => {
        const status = String(row.status || '').toLowerCase();
        const itemCount = (row.items || []).reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
        const mapped = {
          tok: row.orderId || row.id,
          type: row.tableNumber || row.orderType || 'Order',
          items: itemCount,
          min: Math.max(0, Math.round((Date.now() - new Date(row.dateTime || Date.now()).getTime()) / 60000))
        };
        if(status.includes('ready')) READY.push(mapped);
        else if(status.includes('accept') || status.includes('prepar') || status.includes('pending')) PREPARING.push(mapped);
      });
    }
    async function renderTokens(){
      const sec = $('#tokens-tab');
      if(!sec) return;
      sec.innerHTML = '<div class="sr-empty">Loading token board...</div>';
      await loadTokenOrders();
      const announced = localStorage.getItem(ANNOUNCED_TOKEN_KEY) || '';
      sec.innerHTML = `
        <div class="token-board-head glass-row">
          <div class="row" style="gap:11px"><span class="tb-ic"><i class="fa-solid fa-bullhorn"></i></span><div><div style="font-weight:700;font-size:15px">Customer Token Monitor</div><div style="font-size:12px;color:var(--text-mute)">Mount this screen at your pickup counter</div></div></div>
          <span class="pill pill-green"><span class="dot dot-live"></span> Live · auto-refresh</span>
        </div>
        ${announced ? `<div class="panel panel-pad" style="margin-bottom:14px;text-align:center;border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.06)"><div style="font-size:12px;font-weight:800;color:var(--green);text-transform:uppercase;letter-spacing:.06em">Now serving</div><div style="font-size:38px;font-weight:900;color:var(--text);line-height:1.1;margin-top:4px">${esc(announced)}</div></div>` : ''}
        <div class="token-board">
          <div class="token-col">
            <div class="token-col-h preparing"><i class="fa-solid fa-fire"></i> Preparing · ${PREPARING.length}</div>
            <div class="token-list">${PREPARING.map(t=>`<div class="token-chip prep"><div class="tk">${esc(t.tok)}</div><div class="tmeta">${esc(t.type)} · ${esc(t.items)} items</div><div class="tmin"><i class="fa-solid fa-clock"></i> ${esc(t.min)}m</div></div>`).join('')}</div>
          </div>
          <div class="token-col">
            <div class="token-col-h ready"><i class="fa-solid fa-circle-check"></i> Ready for pickup · ${READY.length}</div>
            <div class="token-list">${READY.map(t=>`<div class="token-chip rdy" data-tok="${esc(t.tok)}"><div class="tk">${esc(t.tok)}</div><div class="tmeta">${esc(t.type)} · ${esc(t.items)} items</div><div class="tcall"><i class="fa-solid fa-bell"></i> Now serving</div></div>`).join('')}</div>
          </div>
        </div>`;
      $$('.token-chip.rdy',sec).forEach(c=> c.onclick=()=> {
        localStorage.setItem(ANNOUNCED_TOKEN_KEY, c.dataset.tok || '');
        RS.toast('Announced '+c.dataset.tok+' at counter','fa-bullhorn');
        renderTokens();
      });
    }
    RS.titles['tokens-tab']=['Token Display','Customer-facing pickup token board'];
    RS.addRenderer('tokens-tab', renderTokens);

    /* ===================== TAX & GST ===================== */
    function renderTax(){
      const sec = $('#tax-tab');
      if (!sec) return;
      
      const profile = window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : { country: 'IN', tax_system: 'GST', gst_scheme: 'regular' };
      const country = profile.country || 'IN';
      const taxSystem = profile.tax_system || 'GST';
      const isIreland = (country === 'IE');
      
      const currentYear = new Date().getFullYear();
      
      // Dynamic period select container
      let periodSelectorHTML = '';
      if (isIreland) {
        periodSelectorHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <label class="fl" style="margin:0;font-weight:600;">Filing Period:</label>
            <select class="form-input" id="tax-period-select" style="max-width:180px;height:34px;padding:4px 8px;">
              <option value="1">Jan - Feb ${currentYear}</option>
              <option value="2">Mar - Apr ${currentYear}</option>
              <option value="3" selected>May - Jun ${currentYear}</option>
              <option value="4">Jul - Aug ${currentYear}</option>
              <option value="5">Sep - Oct ${currentYear}</option>
              <option value="6">Nov - Dec ${currentYear}</option>
            </select>
            <select class="form-input" id="tax-year-select" style="max-width:100px;height:34px;padding:4px 8px;">
              <option value="${currentYear}" selected>${currentYear}</option>
              <option value="${currentYear-1}">${currentYear-1}</option>
            </select>
          </div>
        `;
      } else {
        periodSelectorHTML = `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <label class="fl" style="margin:0;font-weight:600;">GST Return Month:</label>
            <select class="form-input" id="tax-period-select" style="max-width:180px;height:34px;padding:4px 8px;">
              <option value="0">January</option>
              <option value="1">February</option>
              <option value="2">March</option>
              <option value="3">April</option>
              <option value="4">May</option>
              <option value="5" selected>June</option>
              <option value="6">July</option>
              <option value="7">August</option>
              <option value="8">September</option>
              <option value="9">October</option>
              <option value="10">November</option>
              <option value="11">December</option>
            </select>
            <select class="form-input" id="tax-year-select" style="max-width:100px;height:34px;padding:4px 8px;">
              <option value="${currentYear}" selected>${currentYear}</option>
              <option value="${currentYear-1}">${currentYear-1}</option>
            </select>
          </div>
        `;
      }

      function loadJsPDF() {
        return new Promise((resolve, reject) => {
          if (window.jspdf) return resolve(window.jspdf);
          function tryLoad(src, fallbackSrc) {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
              const mod = window.jspdf || window.umd?.jspdf;
              if (mod) { resolve(mod); return; }
              if (fallbackSrc) tryLoad(fallbackSrc, null);
              else reject(new Error('jsPDF loaded but not found on window'));
            };
            script.onerror = () => {
              if (fallbackSrc) { console.warn('[jsPDF] Local failed, trying CDN...'); tryLoad(fallbackSrc, null); }
              else reject(new Error('Failed to load jsPDF (local and CDN both failed)'));
            };
            document.head.appendChild(script);
          }
          tryLoad('assets/lib/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        });
      }

      async function openTaxRatesEditor() {
        const allRates = window.RS_DB
          ? await RS_DB.list('tax_rates').catch(() => window.RS_TAX_RATES || [])
          : (window.RS_TAX_RATES || []);
        const rates = (allRates || []).filter(r => String(r.country || '').toUpperCase() === String(country).toUpperCase());
        const rowHtml = (r = {}) => `
          <div class="tax-rate-row" data-id="${esc(r.id || '')}" style="display:grid;grid-template-columns:1fr 1.4fr 90px 120px 70px 36px;gap:8px;align-items:center;margin-bottom:8px">
            <input class="form-input tr-code" value="${esc(r.rateCode || r.rate_code || '')}" placeholder="Rate code">
            <input class="form-input tr-label" value="${esc(r.label || '')}" placeholder="Label">
            <input class="form-input tr-percent" type="number" step="0.01" value="${esc(r.percent || 0)}" placeholder="%">
            <input class="form-input tr-from" type="date" value="${esc(r.validFrom || r.valid_from || new Date().toISOString().slice(0,10))}">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-soft)"><input class="tr-itc" type="checkbox" ${r.itcAllowed || r.itc_allowed ? 'checked' : ''}> ITC</label>
            <button class="icon-act danger tr-del" title="Remove tax slab" type="button"><i class="fa-solid fa-trash-can"></i></button>
          </div>`;

        RSModal.open({
          title: 'Tax Slabs',
          sub: `${country} date-effective rates`,
          icon: 'fa-percent',
          size: 'lg',
          body: `
            <div id="tax-rate-editor">
              <div style="display:grid;grid-template-columns:1fr 1.4fr 90px 120px 70px 36px;gap:8px;margin-bottom:6px;font-size:11px;font-weight:800;color:var(--text-soft);text-transform:uppercase">
                <span>Code</span><span>Label</span><span>Rate</span><span>Valid from</span><span>Input</span><span></span>
              </div>
              <div id="tax-rate-rows">${(rates.length ? rates : [{ country, rateCode: `${country}_TAX_5`, label: 'Default rate', percent: isIreland ? 13.5 : 5 }]).map(rowHtml).join('')}</div>
            </div>
          `,
          foot: `<button class="btn btn-ghost" id="tax-rate-add"><i class="fa-solid fa-plus"></i> Add slab</button><div class="grow"></div><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" id="tax-rate-save"><i class="fa-solid fa-check"></i> Save slabs</button>`,
          onMount(modal, close) {
            const rowsEl = modal.querySelector('#tax-rate-rows');
            modal.querySelector('[data-cancel]').onclick = close;
            modal.querySelector('#tax-rate-add').onclick = () => rowsEl.insertAdjacentHTML('beforeend', rowHtml({
              country,
              rateCode: `${country}_TAX_${Date.now().toString().slice(-4)}`,
              label: '',
              percent: 0
            }));
            rowsEl.addEventListener('click', async e => {
              const btn = e.target.closest('.tr-del');
              if (!btn) return;
              const row = btn.closest('.tax-rate-row');
              const id = row?.dataset.id;
              row?.remove();
              if (id && window.RS_DB) await RS_DB.del('tax_rates', id).catch(() => {});
            });
            modal.querySelector('#tax-rate-save').onclick = async () => {
              const saved = [];
              for (const row of rowsEl.querySelectorAll('.tax-rate-row')) {
                const code = row.querySelector('.tr-code').value.trim();
                const label = row.querySelector('.tr-label').value.trim();
                const percent = Number(row.querySelector('.tr-percent').value || 0);
                if (!code || !label || !Number.isFinite(percent)) continue;
                const record = {
                  id: row.dataset.id || `${country}_${code}_${Date.now()}`,
                  country,
                  rateCode: code,
                  label,
                  percent,
                  validFrom: row.querySelector('.tr-from').value || new Date().toISOString().slice(0,10),
                  validTo: null,
                  itcAllowed: row.querySelector('.tr-itc').checked,
                  notes: ''
                };
                if (window.RS_DB) await RS_DB.put('tax_rates', record.id, record);
                saved.push(record);
              }
              const otherRates = (window.RS_TAX_RATES || []).filter(r => String(r.country || '').toUpperCase() !== String(country).toUpperCase());
              window.RS_TAX_RATES = [...otherRates, ...saved];
              RS.toast('Tax slabs updated', 'fa-circle-check');
              close();
              updateTaxView();
            };
          }
        });
      }

      function updateTaxView() {
        const periodVal = Number(document.getElementById('tax-period-select')?.value ?? (isIreland ? 3 : 5));
        const yearVal = Number(document.getElementById('tax-year-select')?.value ?? currentYear);
        
        const allBills = (RS.BILLS || []).filter(b => b.status === 'paid');
        
        // Filter period bills
        const periodBills = allBills.filter(b => {
          const bDate = new Date(b.dateTime);
          if (bDate.getFullYear() !== yearVal) return false;
          const month = bDate.getMonth();
          if (isIreland) {
            const p = Math.floor(month / 2) + 1;
            return p === periodVal;
          } else {
            return month === periodVal;
          }
        });

        // Filter yearly bills for RTD
        const yearlyBills = allBills.filter(b => {
          const bDate = new Date(b.dateTime);
          return bDate.getFullYear() === yearVal;
        });

        // Compute Output Tax values
        let netTaxable = 0;
        let mainTaxCollected = 0;
        let liquorTaxCollected = 0;
        let serviceChargeCollected = 0;

        periodBills.forEach(b => {
          netTaxable += (b.subtotal || b.sub || 0);
          mainTaxCollected += (b.gst || 0);
          liquorTaxCollected += (b.liquorTaxAmount || 0);
          serviceChargeCollected += (b.serviceChargeAmount || 0);
        });

        const totalTaxCollected = mainTaxCollected + liquorTaxCollected;
        
        // Purchase input tax (T2) from POs
        let inputTaxCollected = 0;
        try {
          const localPOs = JSON.parse(localStorage.getItem('rs:local-demo:rs_v2:purchase_orders') || '[]');
          localPOs.forEach(po => {
            const poDate = new Date(po.date);
            if (po.status === 'completed' && poDate.getFullYear() === yearVal) {
              const month = poDate.getMonth();
              const matchesPeriod = isIreland ? (Math.floor(month / 2) + 1 === periodVal) : (month === periodVal);
              if (matchesPeriod) {
                // assume average 13.5% input VAT or 5% GST on purchases
                inputTaxCollected += Number(po.value || 0) * (isIreland ? 0.135 : 0.05);
              }
            }
          });
        } catch(e) {}
        inputTaxCollected = Math.round(inputTaxCollected * 100) / 100;

        let contentHTML = '';

        if (isIreland) {
          // ROS VAT3 Calculations
          const T1 = Number(totalTaxCollected.toFixed(2));
          const T2 = Number(inputTaxCollected.toFixed(2));
          const T3 = T1 > T2 ? Number((T1 - T2).toFixed(2)) : 0;
          const T4 = T2 > T1 ? Number((T2 - T1).toFixed(2)) : 0;

          // RTD Yearly Calculations
          let net23 = 0, net135 = 0, net9 = 0, net0 = 0;
          yearlyBills.forEach(b => {
            const summary = b.taxSummary || [];
            summary.forEach(band => {
              const pct = Number(band.percent);
              if (pct === 23.0) net23 += band.net;
              else if (pct === 13.5) net135 += band.net;
              else if (pct === 9.0) net9 += band.net;
              else if (pct === 0.0) net0 += band.net;
            });
          });

          // Reconciliation: Sum of 6 periods T1 for the year
          let yearPeriodsT1 = 0;
          allBills.forEach(b => {
            const bDate = new Date(b.dateTime);
            if (bDate.getFullYear() === yearVal) {
              yearPeriodsT1 += (b.gst || 0) + (b.liquorTaxAmount || 0);
            }
          });
          const annualOutputTax = Number(yearPeriodsT1.toFixed(2));
          const sumVat3Outputs = Number((net23 * 0.23 + net135 * 0.135 + net9 * 0.09).toFixed(2));
          const matchesRTD = Math.abs(annualOutputTax - sumVat3Outputs) < 1.0;

          contentHTML = `
            <div class="stat-row">
              <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-euro-sign"></i></div><div><div class="sv">${rs(netTaxable)}</div><div class="sl">Net taxable supplies</div><div class="sd">Excl. VAT &amp; discounts</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(T1)}</div><div class="sl">Output VAT (T1)</div><div class="sd">Sales &amp; drinks</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-t"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(T2)}</div><div class="sl">Input VAT (T2)</div><div class="sd">From purchases</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-sack-dollar"></i></div><div><div class="sv">${rs(T3 || T4)}</div><div class="sl">${T3 ? 'VAT Payable (T3)' : 'VAT Repayable (T4)'}</div></div></div>
            </div>

            <div class="report-grid" style="--cols:1fr 1fr;margin-top:4px">
              <div class="panel panel-pad">
                <div class="panel-head"><h3><i class="fa-solid fa-file-invoice" style="color:var(--orange);margin-right:8px"></i>ROS VAT3 Worksheet</h3></div>
                <div class="kv-list">
                  <div class="kv"><span>T1 (VAT on Sales)</span><b>${rs(T1)}</b></div>
                  <div class="kv"><span>T2 (VAT on Purchases)</span><b>${rs(T2)}</b></div>
                  <div class="kv"><span>T3 (VAT Payable)</span><b style="${T3?'color:var(--red)':''}">${rs(T3)}</b></div>
                  <div class="kv"><span>T4 (VAT Repayable)</span><b style="${T4?'color:var(--green)':''}">${rs(T4)}</b></div>
                </div>
                <button class="btn btn-ghost btn-block" id="tax-vat3-pdf" style="margin-top:14px"><i class="fa-solid fa-file-pdf"></i> Download VAT3 Worksheet (PDF)</button>
              </div>
              <div class="panel panel-pad">
                <div class="panel-head">
                  <h3><i class="fa-solid fa-receipt" style="color:var(--green);margin-right:8px"></i>RTD Annual Worksheet</h3>
                  <span class="pill ${matchesRTD?'pill-green':'pill-amber'}" style="padding:2px 8px;font-size:10.5px">${matchesRTD?'✅ RTD matches':'⚠️ Mismatch'}</span>
                </div>
                <div class="kv-list">
                  <div class="kv"><span>Sales @ 23% (Alcohol/Soft drinks)</span><b>${rs(net23)}</b></div>
                  <div class="kv"><span>Sales @ 9% (Hot meals/Food)</span><b>${rs(net9)}</b></div>
                  <div class="kv"><span>Sales @ 13.5% (Accommodation)</span><b>${rs(net135)}</b></div>
                  <div class="kv"><span>Sales @ 0% (Cold Takeaway)</span><b>${rs(net0)}</b></div>
                </div>
                <button class="btn btn-primary btn-block" id="tax-rtd-pdf" style="margin-top:14px"><i class="fa-solid fa-file-pdf"></i> Download RTD Worksheet (PDF)</button>
              </div>
            </div>

            <div class="panel panel-pad" style="margin-top:16px">
              <div class="panel-head"><h3>VAT Invoice Ledger</h3><div class="row" style="gap:8px"><button class="btn btn-ghost btn-sm" id="tax-csv"><i class="fa-solid fa-file-csv"></i> CSV</button></div></div>
              <div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Taxable (Net)</th><th>VAT Amount</th><th>Gross Amount</th><th>Pay</th></tr></thead><tbody>
              ${periodBills.length > 0 ? periodBills.map(b => `<tr><td><b>${b.no || b.orderId}</b></td><td>${b.customerName || 'Guest'}</td><td>${b.dateTime.split('T')[0]}</td><td class="td-strong">${rs(b.subtotal)}</td><td>${rs(b.gst + b.liquorTaxAmount)}</td><td class="td-strong">${rs(b.amount || b.total)}</td><td><span class="pill" style="padding:3px 9px">${b.paymentMethod || b.pay}</span></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-mute)">No invoices logged in this period</td></tr>'}
              </tbody></table></div>
            </div>
          `;
        } else {
          // India GST Calculations
          const ECO_GST = periodBills.filter(b => b.channel === 'ecommerce_9_5').reduce((a,b)=>a+(b.gst||0), 0);
          const taxableInvoices = periodBills.length;
          const netPayableTax = Math.max(0, totalTaxCollected - ECO_GST);

          contentHTML = `
            <div class="stat-row">
              <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(netTaxable)}</div><div class="sl">Net taxable supplies</div><div class="sd">Excl. GST &amp; discounts</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(mainTaxCollected / 2)}</div><div class="sl">CGST collected (2.5%)</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-t"><i class="fa-solid fa-percent"></i></div><div><div class="sv">${rs(mainTaxCollected - (mainTaxCollected / 2))}</div><div class="sl">SGST collected (2.5%)</div></div></div>
              <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-sack-dollar"></i></div><div><div class="sv">${rs(netPayableTax)}</div><div class="sl">GST Payable</div><div class="sd">Excl. Sec 9(5) ECO</div></div></div>
            </div>

            <div class="report-grid" style="--cols:1fr 1fr;margin-top:4px">
              <div class="panel panel-pad">
                <div class="panel-head"><h3><i class="fa-solid fa-file-invoice" style="color:var(--orange);margin-right:8px"></i>GSTR-1 · Outward supplies</h3></div>
                <div class="kv-list">
                  <div class="kv"><span>Total taxable value</span><b>${rs(netTaxable)}</b></div>
                  <div class="kv"><span>Total invoices logged</span><b>${taxableInvoices} invoices</b></div>
                  <div class="kv"><span>Sec 9(5) ECO supplies</span><b>${rs(ECO_GST)}</b></div>
                </div>
                <div class="row" style="gap:8px;margin-top:14px">
                  <button class="btn btn-ghost grow" id="tax-gstr1-csv"><i class="fa-solid fa-file-csv"></i> Offline CSV</button>
                  <button class="btn btn-ghost grow" id="tax-gstr1-json"><i class="fa-solid fa-file-code"></i> Offline JSON</button>
                </div>
              </div>
              <div class="panel panel-pad">
                <div class="panel-head"><h3><i class="fa-solid fa-receipt" style="color:var(--green);margin-right:8px"></i>GSTR-3B · Tax liability</h3></div>
                <div class="kv-list">
                  <div class="kv"><span>Outward taxable value</span><b>${rs(netTaxable)}</b></div>
                  <div class="kv"><span>ECO taxable value (9(5))</span><b>${rs(ECO_GST * 20)}</b></div>
                  <div class="kv"><span>Net GST payable</span><b style="color:var(--red)">${rs(netPayableTax)}</b></div>
                </div>
                <button class="btn btn-primary btn-block" id="tax-gstr3b-pdf" style="margin-top:14px"><i class="fa-solid fa-file-pdf"></i> Download GSTR-3B Summary (PDF)</button>
              </div>
            </div>

            <div class="panel panel-pad" style="margin-top:16px">
              <div class="panel-head"><h3>GST Invoice Ledger</h3><div class="row" style="gap:8px"><button class="btn btn-ghost btn-sm" id="tax-csv"><i class="fa-solid fa-file-csv"></i> CSV</button></div></div>
              <div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>ECO GST</th><th>Liquor VAT</th><th>Grand Total</th></tr></thead><tbody>
              ${periodBills.length > 0 ? periodBills.map(b => {
                const c = Math.round((b.gst || 0) / 2);
                const isECO = b.channel === 'ecommerce_9_5';
                return `<tr><td><b>${b.no || b.orderId}</b></td><td>${b.customerName || 'Guest'}</td><td>${b.dateTime.split('T')[0]}</td><td class="td-strong">${rs(b.subtotal)}</td><td>${isECO?'--':rs(c)}</td><td>${isECO?'--':rs(b.gst - c)}</td><td>${isECO?rs(b.gst):'--'}</td><td>${b.liquorTaxAmount ? rs(b.liquorTaxAmount) : '--'}</td><td class="td-strong">${rs(b.amount || b.total)}</td></tr>`;
              }).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-mute)">No invoices logged in this month</td></tr>'}
              </tbody></table></div>
            </div>
          `;
        }

        // Inject configuration & backups section
        contentHTML += `
          <div class="report-grid" style="--cols:1fr 1fr;margin-top:16px">
            <div class="panel panel-pad">
              <div class="panel-head"><h3><i class="fa-solid fa-sliders" style="color:var(--orange);margin-right:8px"></i>Date-Effective Tax Config</h3></div>
              <div class="kv-list" id="tax-rates-list">
                <div style="text-align:center;padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading rates...</div>
              </div>
              <button class="btn btn-ghost btn-block" id="tax-rates-btn" style="margin-top:14px"><i class="fa-solid fa-pen"></i> Edit slabs</button>
            </div>
            <div class="panel panel-pad">
              <div class="panel-head"><h3><i class="fa-solid fa-database" style="color:var(--teal);margin-right:8px"></i>Compliance backups</h3></div>
              <div class="kv-list">
                <div class="kv"><span>Last cloud backup</span><b>Today · 2:00 AM</b></div>
                <div class="kv"><span>Retention</span><b>6 years (statutory)</b></div>
              </div>
              <div class="row" style="gap:8px;margin-top:14px"><button class="btn btn-ghost grow" id="tax-sql"><i class="fa-solid fa-database"></i> Export SQL</button><button class="btn btn-ghost grow" id="tax-import"><i class="fa-solid fa-file-import"></i> Import</button></div>
            </div>
          </div>
        `;

        const container = document.getElementById('tax-report-container');
        if (container) {
          container.innerHTML = contentHTML;
        }

        // Render dynamic rates list from memory
        const ratesList = document.getElementById('tax-rates-list');
        if (ratesList && window.RS_TAX_RATES) {
          const relevant = window.RS_TAX_RATES.filter(r => r.country === country);
          if (relevant.length > 0) {
            ratesList.innerHTML = relevant.map(r => `
              <div class="kv"><span>${esc(r.label)} (${esc(r.rateCode || r.rate_code)})</span><b>${r.percent}%</b></div>
            `).join('');
          } else {
            ratesList.innerHTML = `<div style="color:var(--text-mute);font-size:12px;padding:6px 0;">No dynamic rates seeded yet. Defaults in use.</div>`;
          }
        }

        // Wire event handlers
        // Rates configuration button
        const ratesBtn = document.getElementById('tax-rates-btn');
        if (ratesBtn) ratesBtn.onclick = openTaxRatesEditor;

        // CSV Export
        const csvBtn = document.getElementById('tax-csv');
        if (csvBtn) {
          csvBtn.onclick = () => {
            if (!periodBills.length) return RS.toast('No invoices to export', 'fa-circle-exclamation');
            const headers = isIreland 
              ? ['Invoice Number', 'Customer', 'Date', 'Taxable (Net)', 'VAT Amount', 'Gross Amount', 'Payment Method']
              : ['Invoice Number', 'Customer', 'Date', 'Taxable Value', 'CGST', 'SGST', 'ECO GST', 'Liquor VAT', 'Grand Total', 'Payment'];
            const rows = periodBills.map(b => {
              if (isIreland) {
                return `"${b.no}","${b.customerName || 'Guest'}","${b.dateTime.split('T')[0]}",${b.subtotal},${b.gst + b.liquorTaxAmount},${b.amount || b.total},"${b.paymentMethod || b.pay}"`;
              } else {
                const c = Math.round((b.gst || 0) / 2);
                const isECO = b.channel === 'ecommerce_9_5';
                return `"${b.no}","${b.customerName || 'Guest'}","${b.dateTime.split('T')[0]}",${b.subtotal},${isECO?0:c},${isECO?0:(b.gst-c)},${isECO?b.gst:0},${b.liquorTaxAmount || 0},${b.amount || b.total},"${b.paymentMethod || b.pay}"`;
              }
            }).join('\n');
            const csv = [headers.join(','), rows].join('\n');
            RS.downloadFile(csv, 'text/csv;charset=utf-8;', `tax-ledger-${Date.now()}.csv`);
            RS.toast('Ledger CSV exported', 'fa-circle-check');
          };
        }

        // GSTR-1 CSV Download
        const gstr1CsvBtn = document.getElementById('tax-gstr1-csv');
        if (gstr1CsvBtn) {
          gstr1CsvBtn.onclick = () => {
            if (!periodBills.length) return RS.toast('No invoices to export', 'fa-circle-exclamation');
            
            const b2b = periodBills.filter(b => b.customerGst);
            const b2c = periodBills.filter(b => !b.customerGst && b.channel !== 'ecommerce_9_5');
            const eco = periodBills.filter(b => b.channel === 'ecommerce_9_5');
            
            let csv = "B2B Supplies (GSTR-1)\nGSTIN/UIN of Recipient,Receiver Name,Invoice Number,Invoice Date,Invoice Value,Place Of Supply,Reverse Charge,Invoice Type,Rate,Taxable Value\n";
            b2b.forEach(b => {
              csv += `"${b.customerGst}","${b.customerName || 'Guest'}","${b.no}","${b.dateTime.split('T')[0]}",${b.amount || b.total},"Delhi","N","Regular",5,${b.subtotal}\n`;
            });
            
            csv += "\nB2C Small Supplies (GSTR-1)\nPlace Of Supply,Rate,Taxable Value,CGST,SGST\n";
            let totalB2cTaxable = 0, totalB2cGst = 0;
            b2c.forEach(b => { totalB2cTaxable += b.subtotal; totalB2cGst += b.gst; });
            const halfB2c = Math.round(totalB2cGst / 2);
            csv += `"Delhi",5,${totalB2cTaxable.toFixed(2)},${halfB2c},${totalB2cGst - halfB2c}\n`;
            
            csv += "\nHSN/SAC Summary (SAC 9963)\nHSN/SAC,Description,UQC,Total Quantity,Total Value,Taxable Value,CGST,SGST\n";
            let totalVal = 0, totalTaxable = 0, totalGst = 0, totalQty = 0;
            periodBills.forEach(b => {
              totalVal += b.amount || b.total || 0;
              totalTaxable += b.subtotal || 0;
              totalGst += b.gst || 0;
              totalQty += b.items || 1;
            });
            const halfGst = Math.round(totalGst / 2);
            csv += `"9963","Restaurant Services","NOS",${totalQty},${totalVal.toFixed(2)},${totalTaxable.toFixed(2)},${halfGst},${totalGst - halfGst}\n`;
            
            csv += "\nSection 9(5) ECO Supplies\nECO GSTIN,Taxable Value,CGST,SGST\n";
            let totalEcoTaxable = 0, totalEcoGst = 0;
            eco.forEach(b => { totalEcoTaxable += b.subtotal; totalEcoGst += b.gst; });
            const halfEco = Math.round(totalEcoGst / 2);
            csv += `"ECO-GSTIN",${totalEcoTaxable.toFixed(2)},${halfEco},${totalEcoGst - halfEco}\n`;

            RS.downloadFile(csv, 'text/csv;charset=utf-8;', `gstr1-report-${Date.now()}.csv`);
            RS.toast('GSTR-1 CSV exported', 'fa-circle-check');
          };
        }

        // GSTR-1 JSON Download
        const gstr1JsonBtn = document.getElementById('tax-gstr1-json');
        if (gstr1JsonBtn) {
          gstr1JsonBtn.onclick = () => {
            if (!periodBills.length) return RS.toast('No invoices to export', 'fa-circle-exclamation');
            
            const b2b = periodBills.filter(b => b.customerGst);
            const b2c = periodBills.filter(b => !b.customerGst && b.channel !== 'ecommerce_9_5');
            const eco = periodBills.filter(b => b.channel === 'ecommerce_9_5');
            
            let totalVal = 0, totalTaxable = 0, totalGst = 0, totalQty = 0;
            periodBills.forEach(b => {
              totalVal += b.amount || b.total || 0;
              totalTaxable += b.subtotal || 0;
              totalGst += b.gst || 0;
              totalQty += b.items || 1;
            });
            const halfGst = Math.round(totalGst / 2);

            const jsonPayload = {
              gstin: profile.tax_registration_no || "07AAAAA0000A1Z1",
              fp: `${String(periodVal+1).padStart(2,'0')}${yearVal}`,
              b2b: b2b.map(b => ({
                ctin: b.customerGst,
                inv: [{
                  inum: b.no,
                  idt: b.dateTime.split('T')[0],
                  val: b.amount || b.total,
                  pos: profile.state_code || "07",
                  rchg: "N",
                  inv_ty: "R",
                  itms: [{
                    num: 1,
                    itm_det: {
                      rt: 5.0,
                      txval: b.subtotal,
                      camt: Math.round((b.gst||0)/2),
                      samt: (b.gst||0) - Math.round((b.gst||0)/2)
                    }
                  }]
                }]
              })),
              b2cs: b2c.map(b => ({
                sply_ty: "INTRA",
                rt: 5.0,
                txval: b.subtotal,
                camt: Math.round((b.gst||0)/2),
                samt: (b.gst||0) - Math.round((b.gst||0)/2),
                pos: profile.state_code || "07"
              })),
              hsn: {
                data: [{
                  num: 1,
                  hsn_sc: "9963",
                  desc: "Catering Services",
                  uqc: "NOS",
                  qty: totalQty,
                  val: totalVal,
                  txval: totalTaxable,
                  camt: halfGst,
                  samt: totalGst - halfGst
                }]
              }
            };
            
            RS.downloadFile(JSON.stringify(jsonPayload, null, 2), 'application/json', `gstr1-offline-${Date.now()}.json`);
            RS.toast('GSTR-1 JSON Offline tool file exported', 'fa-circle-check');
          };
        }

        // GSTR-3B PDF Download
        const gstr3bPdfBtn = document.getElementById('tax-gstr3b-pdf');
        if (gstr3bPdfBtn) {
          gstr3bPdfBtn.onclick = async () => {
            RS.toast('Generating GSTR-3B PDF...', 'fa-spinner fa-spin');
            try {
              const jspdfModule = await loadJsPDF();
              const { jsPDF } = jspdfModule;
              const doc = new jsPDF();
              
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(16);
              doc.text('GSTR-3B Self-Assessment Summary Return', 14, 20);
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.text(`Filing Period: Month ${periodVal + 1} / Year ${yearVal}`, 14, 26);
              doc.text(`GSTIN: ${profile.tax_registration_no || '07AAAAA0000A1Z1'}`, 14, 32);
              
              doc.setFont('helvetica', 'bold');
              doc.text('3.1 Details of Outward Supplies and inward supplies liable to reverse charge', 14, 45);
              
              doc.setFontSize(9);
              doc.text('Nature of Supplies', 15, 55);
              doc.text('Total Taxable Value', 90, 55);
              doc.text('Integrated Tax', 130, 55);
              doc.text('Central Tax', 160, 55);
              doc.text('State/UT Tax', 185, 55);
              
              doc.line(14, 57, 196, 57);
              
              doc.setFont('helvetica', 'normal');
              doc.text('(a) Outward taxable supplies (other than zero rated, nil rated)', 15, 64);
              doc.text(`${rs(netTaxable)}`, 90, 64);
              doc.text('0.00', 130, 64);
              doc.text(`${rs(mainTaxCollected / 2)}`, 160, 64);
              doc.text(`${rs(mainTaxCollected - (mainTaxCollected / 2))}`, 185, 64);
              
              const ECO_GST = periodBills.filter(b => b.channel === 'ecommerce_9_5').reduce((a,b)=>a+(b.gst||0), 0);
              doc.text('(b) Outward taxable supplies (zero rated / nil / exempt)', 15, 72);
              doc.text('0.00', 90, 72);
              doc.text('0.00', 130, 72);
              doc.text('0.00', 160, 72);
              doc.text('0.00', 185, 72);

              doc.text('(c) Supplies under Section 9(5) (ECO pays tax)', 15, 80);
              doc.text(`${rs(ECO_GST * 20)}`, 90, 80);
              doc.text('0.00', 130, 80);
              doc.text(`${rs(ECO_GST / 2)}`, 160, 80);
              doc.text(`${rs(ECO_GST - (ECO_GST / 2))}`, 185, 80);
              
              doc.line(14, 85, 196, 85);
              
              doc.setFont('helvetica', 'bold');
              doc.text(`Net Self-Assessment Tax Liability: ${rs(netPayableTax)}`, 14, 95);
              
              doc.save(`gstr3b-return-${yearVal}-${periodVal+1}.pdf`);
              RS.toast('GSTR-3B PDF worksheet downloaded', 'fa-circle-check');
            } catch(e) {
              console.error(e);
              RS.toast('PDF generation failed: ' + e.message, 'fa-circle-exclamation');
            }
          };
        }

        // VAT3 PDF Download
        const vat3PdfBtn = document.getElementById('tax-vat3-pdf');
        if (vat3PdfBtn) {
          vat3PdfBtn.onclick = async () => {
            RS.toast('Generating ROS VAT3 PDF...', 'fa-spinner fa-spin');
            try {
              const jspdfModule = await loadJsPDF();
              const { jsPDF } = jspdfModule;
              const doc = new jsPDF();
              
              const T1 = Number(totalTaxCollected.toFixed(2));
              const T2 = Number(inputTaxCollected.toFixed(2));
              const T3 = T1 > T2 ? Number((T1 - T2).toFixed(2)) : 0;
              const T4 = T2 > T1 ? Number((T2 - T1).toFixed(2)) : 0;

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(16);
              doc.text('ROS VAT3 Periodic Filing Worksheet', 14, 20);
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.text(`Filing Period: Bi-Monthly Period ${periodVal} / Year ${yearVal}`, 14, 26);
              doc.text(`VAT Number: ${profile.tax_registration_no || 'IE9999999A'}`, 14, 32);
              
              doc.setFont('helvetica', 'bold');
              doc.text('Irish Revenue online Service (ROS) Box Summary', 14, 45);
              
              doc.setFontSize(9);
              doc.text('Box', 15, 55);
              doc.text('Description', 40, 55);
              doc.text('Amount (€)', 160, 55);
              
              doc.line(14, 57, 196, 57);
              
              doc.setFont('helvetica', 'normal');
              doc.text('T1', 15, 64);
              doc.text('VAT on Sales (Output VAT)', 40, 64);
              doc.text(`${rs(T1)}`, 160, 64);
              
              doc.text('T2', 15, 72);
              doc.text('VAT on Purchases (Input VAT)', 40, 72);
              doc.text(`${rs(T2)}`, 160, 72);

              doc.setFont('helvetica', 'bold');
              doc.text('T3', 15, 80);
              doc.text('VAT Payable (if T1 > T2)', 40, 80);
              doc.text(`${rs(T3)}`, 160, 80);

              doc.text('T4', 15, 88);
              doc.text('VAT Repayable (if T2 > T1)', 40, 88);
              doc.text(`${rs(T4)}`, 160, 88);
              
              doc.line(14, 93, 196, 93);
              
              doc.setFontSize(9.5);
              doc.setFont('helvetica', 'normal');
              doc.text('This worksheet compiles Operational Sales Ledger tax records.', 14, 102);
              doc.text('Use these figures to enter on ROS portal (revenue.ie). Keep records for 6 years.', 14, 107);
              
              doc.save(`ros-vat3-worksheet-${yearVal}-p${periodVal}.pdf`);
              RS.toast('VAT3 PDF worksheet downloaded', 'fa-circle-check');
            } catch(e) {
              console.error(e);
              RS.toast('PDF generation failed: ' + e.message, 'fa-circle-exclamation');
            }
          };
        }

        // RTD PDF Download
        const rtdPdfBtn = document.getElementById('tax-rtd-pdf');
        if (rtdPdfBtn) {
          rtdPdfBtn.onclick = async () => {
            RS.toast('Generating ROS RTD PDF...', 'fa-spinner fa-spin');
            try {
              const jspdfModule = await loadJsPDF();
              const { jsPDF } = jspdfModule;
              const doc = new jsPDF();
              
              let net23 = 0, net135 = 0, net9 = 0, net0 = 0;
              yearlyBills.forEach(b => {
                const summary = b.taxSummary || [];
                summary.forEach(band => {
                  const pct = Number(band.percent);
                  if (pct === 23.0) net23 += band.net;
                  else if (pct === 13.5) net135 += band.net;
                  else if (pct === 9.0) net9 += band.net;
                  else if (pct === 0.0) net0 += band.net;
                });
              });

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(16);
              doc.text('Return of Trading Details (RTD) Annual Worksheet', 14, 20);
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.text(`Year: ${yearVal}`, 14, 26);
              doc.text(`VAT Number: ${profile.tax_registration_no || 'IE9999999A'}`, 14, 32);
              
              doc.setFont('helvetica', 'bold');
              doc.text('Net (VAT-Exclusive) Sales by Rate Band', 14, 45);
              
              doc.setFontSize(9);
              doc.text('VAT Rate Band', 15, 55);
              doc.text('Net Value (€)', 160, 55);
              
              doc.line(14, 57, 196, 57);
              
              doc.setFont('helvetica', 'normal');
              doc.text('Standard Rate (23%)', 15, 64);
              doc.text(`${rs(net23)}`, 160, 64);
              
              doc.text('Reduced Rate (13.5%)', 15, 72);
              doc.text(`${rs(net135)}`, 160, 72);

              doc.text('Second Reduced Rate (9%)', 15, 80);
              doc.text(`${rs(net9)}`, 160, 80);

              doc.text('Zero Rate (0%)', 15, 88);
              doc.text(`${rs(net0)}`, 160, 88);
              
              doc.line(14, 93, 196, 93);
              
              doc.setFont('helvetica', 'bold');
              doc.text('Reconciliation Check', 14, 102);
              
              let yearPeriodsT1 = 0;
              allBills.forEach(b => {
                const bDate = new Date(b.dateTime);
                if (bDate.getFullYear() === yearVal) {
                  yearPeriodsT1 += (b.gst || 0) + (b.liquorTaxAmount || 0);
                }
              });
              const annualOutputTax = Number(yearPeriodsT1.toFixed(2));
              const sumVat3Outputs = Number((net23 * 0.23 + net135 * 0.135 + net9 * 0.09).toFixed(2));
              const matchesRTD = Math.abs(annualOutputTax - sumVat3Outputs) < 1.0;

              doc.setFont('helvetica', 'normal');
              doc.text(`Sum of Period VAT3 Outputs: ${rs(annualOutputTax)}`, 15, 110);
              doc.text(`Sum of RTD Calculated Outputs: ${rs(sumVat3Outputs)}`, 15, 116);
              doc.setFont('helvetica', 'bold');
              doc.text(`Status: ${matchesRTD ? 'MATCHED / RECONCILED' : 'MISMATCH / RECONCILIATION ERROR'}`, 15, 124);
              
              doc.save(`ros-rtd-worksheet-${yearVal}.pdf`);
              RS.toast('RTD PDF worksheet downloaded', 'fa-circle-check');
            } catch(e) {
              console.error(e);
              RS.toast('PDF generation failed: ' + e.message, 'fa-circle-exclamation');
            }
          };
        }

        // Export SQL
        const sqlBtn = document.getElementById('tax-sql');
        if (sqlBtn) {
          sqlBtn.onclick = () => {
            if (!periodBills.length) return RS.toast('No invoices to export', 'fa-circle-exclamation');
            const sql = periodBills.map(b => {
              const cgst = Math.round((b.gst || 0) / 2);
              const sgst = (b.gst || 0) - cgst;
              const summaryJson = b.taxSummary ? JSON.stringify(b.taxSummary).replace(/'/g, "''") : '[]';
              return `INSERT INTO public.doppio_bills (orderId, customerName, customerPhone, dateTime, subtotal, gst, cgst, sgst, total, paymentMethod, channel, tax_summary, liquor_tax_amount, service_charge_amount) VALUES ('${b.no || b.orderId}', '${(b.customerName || 'Guest').replace(/'/g, "''")}', '${b.customerPhone || ''}', '${b.dateTime}', ${b.subtotal}, ${b.gst}, ${cgst}, ${sgst}, ${b.amount || b.total}, '${b.paymentMethod || b.pay}', '${b.channel || 'dine_in'}', '${summaryJson}', ${b.liquorTaxAmount || 0}, ${b.serviceChargeAmount || 0});`;
            }).join('\n');
            RS.downloadFile(sql, 'text/plain', `tax-ledger-${Date.now()}.sql`);
            RS.toast('Ledger exported as SQL', 'fa-circle-check');
          };
        }

        // Import JSON
        const importBtn = document.getElementById('tax-import');
        if (importBtn) {
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
                  if (window.RS && RS.setOperationStatus) {
                    RS.setOperationStatus(`Importing 1/${list.length} invoices...`, 'running', (1 / list.length) * 100);
                  }
                  for(let i = 0; i < list.length; i++) {
                    const item = list[i];
                    const bill = {
                      id: item.id || 'bill_' + (item.no || Date.now() + i),
                      orderId: item.no || item.orderId,
                      customerName: item.cust || item.customerName || 'Walk-in Guest',
                      dateTime: item.dateTime || item.time || new Date().toISOString(),
                      subtotal: item.taxable || item.subtotal || 0,
                      gst: item.gst || 0,
                      total: item.amount || item.total || 0,
                      paymentMethod: item.pay || item.paymentMethod || 'UPI',
                      status: 'paid',
                      taxSummary: item.taxSummary || [],
                      channel: item.channel || 'dine_in'
                    };
                    if (window.RS_DB) {
                      await RS_DB.put('bills', bill.id, bill);
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

      // Add HTML container
      sec.innerHTML = `
        ${periodSelectorHTML}
        <div id="tax-report-container"></div>
      `;

      // Listen for period or year selector changes
      document.getElementById('tax-period-select')?.addEventListener('change', updateTaxView);
      document.getElementById('tax-year-select')?.addEventListener('change', updateTaxView);
      
      // Perform initial render
      updateTaxView();
    }
    
    RS.titles['tax-tab']=['Compliance & Tax Returns','Localised returns, worksheets & ledger compliance'];
    RS.addRenderer('tax-tab', renderTax);
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
    // -- Analytics: build data from real bills --------------------------------
    function anDays(period){ return period==='Last 7 days'?7:period==='Last 90 days'?90:30; }

    function buildAnalytics(bills, days){
      const now = Date.now();
      const cutoff = now - days * 86400000;
      const todayStart = (function(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); })();

      const filtered = bills.filter(function(b){
        if (b.status !== 'paid') return false;
        const t = b.dateTime ? new Date(b.dateTime).getTime() : 0;
        return t >= cutoff;
      });

      const total = filtered.reduce(function(a,b){ return a+(b.amount||b.total||0); },0);
      const orders = filtered.length;
      const aov = orders ? Math.round(total/orders) : 0;
      const todayRev = filtered.filter(function(b){ return new Date(b.dateTime).getTime()>=todayStart; })
                               .reduce(function(a,b){ return a+(b.amount||b.total||0); },0);

      // Daily trend array (days slots, oldest->newest)
      const daily = Array(days).fill(0);
      filtered.forEach(function(b){
        const age = Math.floor((now - new Date(b.dateTime).getTime()) / 86400000);
        if (age >= 0 && age < days) daily[days-1-age] += (b.amount||b.total||0);
      });
      const half = Math.floor(days/2);
      const prev = daily.slice(0,half).reduce(function(a,v){return a+v;},0);
      const curr = daily.slice(half).reduce(function(a,v){return a+v;},0);
      const trend = prev>0 ? Math.round((curr-prev)/prev*100) : 0;

      // Hourly footfall
      const hours = Array(24).fill(0);
      filtered.forEach(function(b){ hours[new Date(b.dateTime).getHours()]++; });
      const peakIdx = hours.indexOf(Math.max.apply(null,hours));
      const peakLabel = hours[peakIdx]>0 ? (peakIdx%12||12)+':00 '+(peakIdx<12?'AM':'PM') : 'N/A';

      // Payment mix
      const payMap = {};
      filtered.forEach(function(b){
        const m = b.pay||b.paymentMethod||b.payMethod||'Unknown';
        payMap[m] = (payMap[m]||0)+(b.amount||b.total||0);
      });
      const payColors = ['var(--orange)','var(--green)','var(--violet-soft)','var(--amber)','var(--blue-soft)'];
      const payEntries = Object.entries(payMap).sort(function(a,b){return b[1]-a[1];});
      const payTotal = payEntries.reduce(function(a,e){return a+e[1];},0)||1;
      const PAY_LIVE = payEntries.map(function(e,i){
        return [e[0], Math.round(e[1]/payTotal*100), payColors[i%payColors.length]];
      });

      // Top items
      const itemMap = {};
      filtered.forEach(function(b){
        (b._items||[]).forEach(function(it){
          if (!it||!it.name) return;
          if (!itemMap[it.name]) itemMap[it.name]={qty:0,rev:0};
          itemMap[it.name].qty += (it.qty||1);
          itemMap[it.name].rev += (it.price||0)*(it.qty||1);
        });
      });
      const ITEMS_LIVE = Object.entries(itemMap)
        .sort(function(a,b){return b[1].qty-a[1].qty;})
        .slice(0,8)
        .map(function(e){return [e[0], e[1].qty, rs(e[1].rev)];});

      // Staff performance
      const staffMap = {};
      filtered.forEach(function(b){
        const who = b.servedBy||b.staff||b.cashier||b.waiter||null;
        if (!who) return;
        if (!staffMap[who]) staffMap[who]={orders:0,rev:0};
        staffMap[who].orders++;
        staffMap[who].rev += (b.amount||b.total||0);
      });
      const STAFF_LIVE = Object.entries(staffMap)
        .sort(function(a,b){return b[1].rev-a[1].rev;})
        .map(function(e){return [e[0], e[1].orders, rs(e[1].rev)];});

      return {total,orders,aov,todayRev,daily,trend,peakLabel,PAY_LIVE,ITEMS_LIVE,STAFF_LIVE,hours};
    }

    function renderAnalytics(period){
      period = period || 'Last 30 days';
      const days = anDays(period);
      const sec = $('#analytics-tab');
      sec.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-mute)"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px"></i><div style="margin-top:12px;font-size:13px">Loading analytics...</div></div>';

      RS_DB.list('doppio_bills').then(function(allBills){
        const d = buildAnalytics(allBills||[], days);
        const trendColor = d.trend>=0?'var(--green)':'var(--red)';
        const trendIcon = d.trend>=0?'fa-arrow-trend-up':'fa-arrow-trend-down';
        const trendLabel = (d.trend>=0?'+':'')+d.trend+'%';
        const maxHour = Math.max.apply(null,d.hours)||1;

        sec.innerHTML =
          '<div class="toolbar-row">' +
            '<span class="eyebrow">'+period+'</span>' +
            '<div class="grow"></div>' +
            '<select class="form-input" id="an-period" style="width:auto;padding:9px 32px 9px 14px">' +
              '<option'+(period==='Last 7 days'?' selected':'')+'>Last 7 days</option>' +
              '<option'+(period==='Last 30 days'?' selected':'')+'>Last 30 days</option>' +
              '<option'+(period==='Last 90 days'?' selected':'')+'>Last 90 days</option>' +
            '</select>' +
            '<button class="btn btn-ghost btn-sm" id="an-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>' +
          '</div>' +

          '<div class="stat-row" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">' +
            '<div class="stat-card"><div><div class="sl">Total revenue</div><div class="sv">'+rs(d.total)+'</div><div class="sd">'+d.orders+' orders</div></div></div>' +
            '<div class="stat-card"><div><div class="sl">Orders</div><div class="sv" style="color:var(--violet-soft)">'+d.orders+'</div><div class="sd">bills generated</div></div></div>' +
            '<div class="stat-card"><div><div class="sl">Avg order value</div><div class="sv" style="color:var(--green)">'+rs(d.aov)+'</div><div class="sd">per transaction</div></div></div>' +
            '<div class="stat-card"><div><div class="sl">Today\'s revenue</div><div class="sv" style="color:var(--amber)">'+rs(d.todayRev)+'</div><div class="sd">live today</div></div></div>' +
            '<div class="stat-card"><div><div class="sl">Peak hour</div><div class="sv" style="color:var(--orange)">'+d.peakLabel+'</div><div class="sd">busiest time</div></div></div>' +
          '</div>' +

          '<div class="report-grid" style="--cols:2fr 1fr;margin-top:4px">' +
            '<div class="panel panel-pad">' +
              '<div class="panel-head"><h3>Daily revenue trend</h3>' +
                '<span class="pill" style="background:color-mix(in srgb,'+trendColor+' 12%,transparent);color:'+trendColor+'"><i class="fa-solid '+trendIcon+'"></i> '+trendLabel+' vs prior half</span>' +
              '</div>' +
              spark(d.daily,'var(--orange)',150) +
              '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-mute);margin-top:6px"><span>'+days+' days ago</span><span>Today</span></div>' +
            '</div>' +
            '<div class="panel panel-pad">' +
              '<div class="panel-head"><h3>Payment mix</h3></div>' +
              '<div style="display:flex;align-items:center;gap:16px">' +
                '<div>'+donut(d.PAY_LIVE)+'</div>' +
                '<div style="flex:1">'+(d.PAY_LIVE.length>0 ? d.PAY_LIVE.map(function(p){return '<div class="kv" style="padding:5px 0"><span><span class="lg-dot" style="background:'+p[2]+'"></span> '+esc(p[0])+'</span><b>'+p[1]+'%</b></div>';}).join('') : '<div style="color:var(--text-mute);font-size:12px;text-align:center">No payment data<br>yet</div>')+'</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="report-grid" style="--cols:1fr 1fr;margin-top:16px">' +
            '<div class="panel panel-pad">' +
              '<div class="panel-head"><h3>Hourly footfall</h3><span class="pill">orders/hour</span></div>' +
              '<div style="height:130px;display:flex;align-items:flex-end;gap:2px">' +
                d.hours.map(function(v,i){
                  var h = Math.max(4, Math.round(v/maxHour*100));
                  var bg = (i===new Date().getHours()) ? 'var(--orange)' : 'color-mix(in srgb,var(--orange) 35%,transparent)';
                  return '<div style="flex:1;border-radius:3px 3px 0 0;min-height:4px;background:'+bg+';height:'+h+'%" title="'+i+':00 \xb7 '+v+' orders"></div>';
                }).join('') +
              '</div>' +
              '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-mute);margin-top:6px"><span>12 AM</span><span>12 PM</span><span>11 PM</span></div>' +
            '</div>' +
            '<div class="panel panel-pad">' +
              '<div class="panel-head"><h3>Top selling items</h3></div>' +
              '<table class="data-table"><tbody>' +
                (d.ITEMS_LIVE.length>0 ? d.ITEMS_LIVE.map(function(it,i){
                  return '<tr><td style="width:22px;color:var(--text-mute);font-size:12px">'+(i+1)+'</td><td><b>'+esc(it[0])+'</b></td><td style="color:var(--text-mute)">'+it[1]+' sold</td><td style="text-align:right;color:var(--green)">'+it[2]+'</td></tr>';
                }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-mute);padding:24px">No item data yet</td></tr>') +
              '</tbody></table>' +
            '</div>' +
          '</div>' +

          '<div class="panel panel-pad" style="margin-top:16px">' +
            '<div class="panel-head"><h3>Staff performance</h3><span class="pill">'+period+'</span></div>' +
            '<div class="table-scroll"><table class="data-table">' +
              '<thead><tr><th>Team member</th><th>Orders</th><th>Sales</th><th>Share</th></tr></thead>' +
              '<tbody>' +
              (d.STAFF_LIVE.length>0 ? (function(){
                var totalRev = d.STAFF_LIVE.reduce(function(a,s){return a+(parseFloat(String(s[2]).replace(/[^\d.]/g,''))||0);},0)||1;
                return d.STAFF_LIVE.map(function(s){
                  var rev = parseFloat(String(s[2]).replace(/[^\d.]/g,''))||0;
                  var pct = Math.round(rev/totalRev*100);
                  return '<tr><td><b>'+esc(s[0])+'</b></td><td>'+s[1]+'</td><td class="td-strong">'+s[2]+'</td>' +
                    '<td><div style="display:flex;align-items:center;gap:8px">' +
                      '<div style="flex:1;height:6px;border-radius:99px;background:var(--glass-3);max-width:90px">' +
                        '<div style="height:100%;border-radius:99px;background:var(--orange);width:'+pct+'%"></div>' +
                      '</div>' +
                      '<span style="font-size:12px;color:var(--text-mute)">'+pct+'%</span>' +
                    '</div></td></tr>';
                }).join('');
              })() : '<tr><td colspan="4" style="text-align:center;color:var(--text-mute);padding:24px">Staff data appears when bills include a <code>servedBy</code> field</td></tr>') +
              '</tbody>' +
            '</table></div>' +
          '</div>';

        var r = $('#an-refresh');
        if (r) r.onclick = function(){ renderAnalytics(period); RS.toast('Analytics refreshed','fa-rotate'); };
        var p = $('#an-period');
        if (p) p.onchange = function(){ renderAnalytics(p.value); };
      }).catch(function(){
        sec.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-mute)"><i class="fa-solid fa-circle-exclamation" style="font-size:24px;color:var(--orange)"></i><div style="margin-top:12px">Could not load bills data</div></div>';
      });
    }
    RS.titles['analytics-tab']=['Advanced Analytics','Revenue, items, staff & payment insights'];
    RS.addRenderer('analytics-tab', function(){ renderAnalytics('Last 30 days'); });
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
