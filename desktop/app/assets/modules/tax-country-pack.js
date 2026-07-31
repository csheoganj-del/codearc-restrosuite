/* ============================================================
   RestroSuite — Country tax pack (names, rates, export helpers)
   Extends RS_TAX_RATES + resolveRate for India, GCC, EU, UK, etc.
   ============================================================ */
(function (global) {
  'use strict';

  /** Canonical rate rows: country, rateCode, label, percent, validFrom, itcAllowed */
  const PACK = [
    // ── India GST ──
    { country: 'IN', rateCode: 'IN_NIL_0', label: 'GST Nil Rated', percent: 0, validFrom: '2017-07-01', itcAllowed: false },
    { country: 'IN', rateCode: 'IN_REST_5', label: 'GST Restaurant (standalone 5%)', percent: 5, validFrom: '2017-07-01', itcAllowed: false },
    { country: 'IN', rateCode: 'IN_COMP_5', label: 'GST Composition 5%', percent: 5, validFrom: '2017-07-01', itcAllowed: false },
    { country: 'IN', rateCode: 'IN_GOODS_5', label: 'GST Goods 5%', percent: 5, validFrom: '2017-07-01', itcAllowed: true },
    { country: 'IN', rateCode: 'IN_GOODS_12', label: 'GST Goods 12%', percent: 12, validFrom: '2017-07-01', itcAllowed: true },
    { country: 'IN', rateCode: 'IN_REST_18', label: 'GST Specified premises 18%', percent: 18, validFrom: '2017-07-01', itcAllowed: true },
    { country: 'IN', rateCode: 'IN_GOODS_18', label: 'GST Goods 18%', percent: 18, validFrom: '2017-07-01', itcAllowed: true },
    { country: 'IN', rateCode: 'IN_CATER_18', label: 'GST Outdoor catering 18%', percent: 18, validFrom: '2017-07-01', itcAllowed: true },
    { country: 'IN', rateCode: 'IN_GOODS_28', label: 'GST Goods 28%', percent: 28, validFrom: '2017-07-01', itcAllowed: true },
    // ── Ireland VAT ──
    { country: 'IE', rateCode: 'IE_COLD_0', label: 'VAT Zero (cold takeaway)', percent: 0, validFrom: '2019-01-01', itcAllowed: true },
    { country: 'IE', rateCode: 'IE_FOOD_9', label: 'VAT Hot food 9%', percent: 9, validFrom: '2026-07-01', itcAllowed: true },
    { country: 'IE', rateCode: 'IE_FOOD_135', label: 'VAT Hot food 13.5%', percent: 13.5, validFrom: '2019-01-01', validTo: '2026-06-30', itcAllowed: true },
    { country: 'IE', rateCode: 'IE_ACCOM_135', label: 'VAT Accommodation 13.5%', percent: 13.5, validFrom: '2019-01-01', itcAllowed: true },
    { country: 'IE', rateCode: 'IE_DRINK_23', label: 'VAT Standard drinks 23%', percent: 23, validFrom: '2019-01-01', itcAllowed: true },
    { country: 'IE', rateCode: 'IE_DELIVERY_23', label: 'VAT Delivery 23%', percent: 23, validFrom: '2019-01-01', itcAllowed: true },
    // ── United Kingdom ──
    { country: 'GB', rateCode: 'GB_ZERO_0', label: 'VAT Zero-rated', percent: 0, validFrom: '2021-01-01', itcAllowed: true },
    { country: 'GB', rateCode: 'GB_RED_5', label: 'VAT Reduced 5%', percent: 5, validFrom: '2021-01-01', itcAllowed: true },
    { country: 'GB', rateCode: 'GB_STD_20', label: 'VAT Standard 20%', percent: 20, validFrom: '2021-01-01', itcAllowed: true },
    // ── UAE ──
    { country: 'AE', rateCode: 'AE_ZERO_0', label: 'VAT Zero', percent: 0, validFrom: '2018-01-01', itcAllowed: true },
    { country: 'AE', rateCode: 'AE_STD_5', label: 'VAT Standard 5%', percent: 5, validFrom: '2018-01-01', itcAllowed: true },
    // ── Saudi Arabia ──
    { country: 'SA', rateCode: 'SA_ZERO_0', label: 'VAT Zero', percent: 0, validFrom: '2018-01-01', itcAllowed: true },
    { country: 'SA', rateCode: 'SA_STD_15', label: 'VAT Standard 15%', percent: 15, validFrom: '2020-07-01', itcAllowed: true },
    // ── Singapore ──
    { country: 'SG', rateCode: 'SG_ZERO_0', label: 'GST Zero', percent: 0, validFrom: '2023-01-01', itcAllowed: true },
    { country: 'SG', rateCode: 'SG_STD_9', label: 'GST Standard 9%', percent: 9, validFrom: '2024-01-01', itcAllowed: true },
    // ── Australia ──
    { country: 'AU', rateCode: 'AU_GST_0', label: 'GST Free', percent: 0, validFrom: '2000-07-01', itcAllowed: true },
    { country: 'AU', rateCode: 'AU_GST_10', label: 'GST 10%', percent: 10, validFrom: '2000-07-01', itcAllowed: true },
    // ── New Zealand ──
    { country: 'NZ', rateCode: 'NZ_ZERO_0', label: 'GST Zero', percent: 0, validFrom: '2010-10-01', itcAllowed: true },
    { country: 'NZ', rateCode: 'NZ_STD_15', label: 'GST 15%', percent: 15, validFrom: '2010-10-01', itcAllowed: true },
    // ── Canada ──
    { country: 'CA', rateCode: 'CA_GST_5', label: 'GST 5%', percent: 5, validFrom: '2008-01-01', itcAllowed: true },
    { country: 'CA', rateCode: 'CA_HST_13', label: 'HST 13%', percent: 13, validFrom: '2010-07-01', itcAllowed: true },
    { country: 'CA', rateCode: 'CA_HST_15', label: 'HST 15%', percent: 15, validFrom: '2010-07-01', itcAllowed: true },
    // ── USA (simplified sales tax templates — outlet sets local rate) ──
    { country: 'US', rateCode: 'US_SALES_0', label: 'Sales tax exempt', percent: 0, validFrom: '2020-01-01', itcAllowed: false },
    { country: 'US', rateCode: 'US_SALES_6', label: 'Sales tax 6%', percent: 6, validFrom: '2020-01-01', itcAllowed: false },
    { country: 'US', rateCode: 'US_SALES_8', label: 'Sales tax 8%', percent: 8, validFrom: '2020-01-01', itcAllowed: false },
    { country: 'US', rateCode: 'US_SALES_10', label: 'Sales tax 10%', percent: 10, validFrom: '2020-01-01', itcAllowed: false },
    // ── EU standard examples ──
    { country: 'DE', rateCode: 'DE_RED_7', label: 'MwSt ermäßigt 7%', percent: 7, validFrom: '2021-01-01', itcAllowed: true },
    { country: 'DE', rateCode: 'DE_STD_19', label: 'MwSt 19%', percent: 19, validFrom: '2021-01-01', itcAllowed: true },
    { country: 'FR', rateCode: 'FR_RED_10', label: 'TVA 10% (restauration)', percent: 10, validFrom: '2014-01-01', itcAllowed: true },
    { country: 'FR', rateCode: 'FR_STD_20', label: 'TVA 20%', percent: 20, validFrom: '2014-01-01', itcAllowed: true },
    { country: 'ES', rateCode: 'ES_RED_10', label: 'IVA 10% hostelería', percent: 10, validFrom: '2012-09-01', itcAllowed: true },
    { country: 'ES', rateCode: 'ES_STD_21', label: 'IVA 21%', percent: 21, validFrom: '2012-09-01', itcAllowed: true },
    { country: 'IT', rateCode: 'IT_RED_10', label: 'IVA 10%', percent: 10, validFrom: '2013-10-01', itcAllowed: true },
    { country: 'IT', rateCode: 'IT_STD_22', label: 'IVA 22%', percent: 22, validFrom: '2013-10-01', itcAllowed: true },
    { country: 'NL', rateCode: 'NL_RED_9', label: 'BTW 9%', percent: 9, validFrom: '2019-01-01', itcAllowed: true },
    { country: 'NL', rateCode: 'NL_STD_21', label: 'BTW 21%', percent: 21, validFrom: '2019-01-01', itcAllowed: true },
    // ── South Asia / others ──
    { country: 'PK', rateCode: 'PK_SALES_0', label: 'Sales tax exempt', percent: 0, validFrom: '2020-01-01', itcAllowed: false },
    { country: 'PK', rateCode: 'PK_SALES_17', label: 'Sales tax 17%', percent: 17, validFrom: '2020-01-01', itcAllowed: false },
    { country: 'BD', rateCode: 'BD_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'BD', rateCode: 'BD_VAT_15', label: 'VAT 15%', percent: 15, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'LK', rateCode: 'LK_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'LK', rateCode: 'LK_VAT_18', label: 'VAT 18%', percent: 18, validFrom: '2024-01-01', itcAllowed: true },
    { country: 'NP', rateCode: 'NP_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'NP', rateCode: 'NP_VAT_13', label: 'VAT 13%', percent: 13, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'MY', rateCode: 'MY_SST_0', label: 'SST exempt', percent: 0, validFrom: '2018-09-01', itcAllowed: false },
    { country: 'MY', rateCode: 'MY_SST_6', label: 'SST 6%', percent: 6, validFrom: '2018-09-01', itcAllowed: false },
    { country: 'TH', rateCode: 'TH_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'TH', rateCode: 'TH_VAT_7', label: 'VAT 7%', percent: 7, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'ID', rateCode: 'ID_PPN_0', label: 'PPN Zero', percent: 0, validFrom: '2022-04-01', itcAllowed: true },
    { country: 'ID', rateCode: 'ID_PPN_11', label: 'PPN 11%', percent: 11, validFrom: '2022-04-01', itcAllowed: true },
    { country: 'PH', rateCode: 'PH_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'PH', rateCode: 'PH_VAT_12', label: 'VAT 12%', percent: 12, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'ZA', rateCode: 'ZA_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2018-04-01', itcAllowed: true },
    { country: 'ZA', rateCode: 'ZA_VAT_15', label: 'VAT 15%', percent: 15, validFrom: '2018-04-01', itcAllowed: true },
    { country: 'KE', rateCode: 'KE_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'KE', rateCode: 'KE_VAT_16', label: 'VAT 16%', percent: 16, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'NG', rateCode: 'NG_VAT_0', label: 'VAT Zero', percent: 0, validFrom: '2020-01-01', itcAllowed: true },
    { country: 'NG', rateCode: 'NG_VAT_7_5', label: 'VAT 7.5%', percent: 7.5, validFrom: '2020-01-01', itcAllowed: true },
  ];

  /** Official tax system display names by country */
  const TAX_SYSTEM_NAMES = {
    IN: { system: 'GST', short: 'GST', regLabel: 'GSTIN', split: ['CGST', 'SGST', 'IGST'], export: 'GSTR' },
    IE: { system: 'VAT', short: 'VAT', regLabel: 'VAT number', split: ['VAT'], export: 'VAT3' },
    GB: { system: 'VAT', short: 'VAT', regLabel: 'VAT number', split: ['VAT'], export: 'VAT' },
    AE: { system: 'VAT', short: 'VAT', regLabel: 'TRN', split: ['VAT'], export: 'VAT' },
    SA: { system: 'VAT', short: 'VAT', regLabel: 'VAT number', split: ['VAT'], export: 'VAT' },
    SG: { system: 'GST', short: 'GST', regLabel: 'GST Reg. No.', split: ['GST'], export: 'GST' },
    AU: { system: 'GST', short: 'GST', regLabel: 'ABN', split: ['GST'], export: 'BAS' },
    NZ: { system: 'GST', short: 'GST', regLabel: 'IRD', split: ['GST'], export: 'GST' },
    CA: { system: 'GST/HST', short: 'Tax', regLabel: 'BN', split: ['GST', 'HST', 'PST'], export: 'GST' },
    US: { system: 'Sales Tax', short: 'Tax', regLabel: 'Tax ID', split: ['Sales Tax'], export: 'SalesTax' },
    DE: { system: 'MwSt', short: 'MwSt', regLabel: 'USt-IdNr.', split: ['MwSt'], export: 'USt' },
    FR: { system: 'TVA', short: 'TVA', regLabel: 'N° TVA', split: ['TVA'], export: 'TVA' },
    ES: { system: 'IVA', short: 'IVA', regLabel: 'NIF-IVA', split: ['IVA'], export: 'IVA' },
    IT: { system: 'IVA', short: 'IVA', regLabel: 'P.IVA', split: ['IVA'], export: 'IVA' },
    NL: { system: 'BTW', short: 'BTW', regLabel: 'BTW-id', split: ['BTW'], export: 'BTW' },
    MY: { system: 'SST', short: 'SST', regLabel: 'SST ID', split: ['SST'], export: 'SST' },
    TH: { system: 'VAT', short: 'VAT', regLabel: 'Tax ID', split: ['VAT'], export: 'VAT' },
    ID: { system: 'PPN', short: 'PPN', regLabel: 'NPWP', split: ['PPN'], export: 'PPN' },
    PH: { system: 'VAT', short: 'VAT', regLabel: 'TIN', split: ['VAT'], export: 'VAT' },
    ZA: { system: 'VAT', short: 'VAT', regLabel: 'VAT number', split: ['VAT'], export: 'VAT' },
    PK: { system: 'Sales Tax', short: 'Tax', regLabel: 'NTN', split: ['Sales Tax'], export: 'SalesTax' },
    BD: { system: 'VAT', short: 'VAT', regLabel: 'BIN', split: ['VAT'], export: 'VAT' },
    LK: { system: 'VAT', short: 'VAT', regLabel: 'TIN', split: ['VAT'], export: 'VAT' },
    NP: { system: 'VAT', short: 'VAT', regLabel: 'PAN', split: ['VAT'], export: 'VAT' },
    KE: { system: 'VAT', short: 'VAT', regLabel: 'PIN', split: ['VAT'], export: 'VAT' },
    NG: { system: 'VAT', short: 'VAT', regLabel: 'TIN', split: ['VAT'], export: 'VAT' },
  };

  function seedTaxRates() {
    if (!global.RS_TAX_RATES) {global.RS_TAX_RATES = [];}
    const existing = new Set(
      (global.RS_TAX_RATES || []).map((r) => String(r.country) + ':' + String(r.rateCode || r.rate_code))
    );
    PACK.forEach((r) => {
      const key = r.country + ':' + r.rateCode;
      if (existing.has(key)) {return;}
      global.RS_TAX_RATES.push({
        id: r.rateCode + '_pack',
        country: r.country,
        rateCode: r.rateCode,
        label: r.label,
        percent: r.percent,
        validFrom: r.validFrom,
        validTo: r.validTo || null,
        itcAllowed: !!r.itcAllowed,
      });
      existing.add(key);
    });
  }

  function getTaxSystemMeta(countryCode) {
    const c = String(countryCode || 'IN').toUpperCase();
    return (
      TAX_SYSTEM_NAMES[c] || {
        system: 'Tax',
        short: 'Tax',
        regLabel: 'Tax ID',
        split: ['Tax'],
        export: 'TAX',
      }
    );
  }

  function listRatesForCountry(countryCode, dateStr) {
    const c = String(countryCode || 'IN').toUpperCase();
    const date = dateStr ? new Date(dateStr) : new Date();
    seedTaxRates();
    return (global.RS_TAX_RATES || []).filter((r) => {
      if (String(r.country).toUpperCase() !== c) {return false;}
      const from = new Date(r.validFrom || r.valid_from || '2000-01-01');
      const to = r.validTo || r.valid_to ? new Date(r.validTo || r.valid_to) : null;
      return date >= from && (!to || date <= to);
    });
  }

  function defaultRateCode(countryCode) {
    const c = String(countryCode || 'IN').toUpperCase();
    const map = {
      IN: 'IN_REST_5',
      IE: 'IE_FOOD_9',
      GB: 'GB_STD_20',
      AE: 'AE_STD_5',
      SA: 'SA_STD_15',
      SG: 'SG_STD_9',
      AU: 'AU_GST_10',
      NZ: 'NZ_STD_15',
      US: 'US_SALES_8',
      CA: 'CA_GST_5',
      DE: 'DE_RED_7',
      FR: 'FR_RED_10',
      ES: 'ES_RED_10',
      IT: 'IT_RED_10',
      NL: 'NL_RED_9',
      MY: 'MY_SST_6',
      TH: 'TH_VAT_7',
      ID: 'ID_PPN_11',
      PH: 'PH_VAT_12',
      ZA: 'ZA_VAT_15',
      PK: 'PK_SALES_17',
      BD: 'BD_VAT_15',
      LK: 'LK_VAT_18',
      NP: 'NP_VAT_13',
      KE: 'KE_VAT_16',
      NG: 'NG_VAT_7_5',
    };
    return map[c] || 'IN_REST_5';
  }

  /** Split India GST into CGST/SGST (intra) or IGST (inter) */
  function splitIndiaGst(taxAmount, profile) {
    const amt = Number(taxAmount) || 0;
    const p = profile || (global.RS_getTenantTaxProfile && RS_getTenantTaxProfile()) || {};
    const inter = !!(p.inter_state || p.igst_only);
    if (inter) {return { cgst: 0, sgst: 0, igst: amt };}
    const half = Math.round((amt / 2) * 100) / 100;
    return { cgst: half, sgst: Math.round((amt - half) * 100) / 100, igst: 0 };
  }

  function exportRatesCsv(countryCode) {
    const rows = listRatesForCountry(countryCode);
    const lines = [['country', 'rateCode', 'label', 'percent', 'validFrom', 'validTo', 'itcAllowed'].join(',')];
    rows.forEach((r) => {
      lines.push(
        [
          r.country,
          r.rateCode || r.rate_code,
          '"' + String(r.label || '').replace(/"/g, '""') + '"',
          r.percent,
          r.validFrom || r.valid_from || '',
          r.validTo || r.valid_to || '',
          r.itcAllowed || r.itc_allowed ? 'true' : 'false',
        ].join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tax_rates_' + (countryCode || 'ALL') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    return rows.length;
  }

  function importRatesCsv(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {return 0;}
    seedTaxRates();
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].match(/("([^"]|"")*"|[^,]+)/g) || [];
      if (parts.length < 4) {continue;}
      const clean = (s) => String(s || '').replace(/^"|"$/g, '').replace(/""/g, '"');
      const row = {
        id: clean(parts[1]) + '_import_' + Date.now() + '_' + i,
        country: clean(parts[0]).toUpperCase(),
        rateCode: clean(parts[1]),
        label: clean(parts[2]),
        percent: Number(clean(parts[3])) || 0,
        validFrom: clean(parts[4]) || '2020-01-01',
        validTo: clean(parts[5]) || null,
        itcAllowed: /true|1|yes/i.test(clean(parts[6] || '')),
      };
      if (!row.country || !row.rateCode) {continue;}
      // Replace same code
      global.RS_TAX_RATES = (global.RS_TAX_RATES || []).filter(
        (r) => !(String(r.country).toUpperCase() === row.country && String(r.rateCode || r.rate_code) === row.rateCode)
      );
      global.RS_TAX_RATES.push(row);
      n++;
    }
    return n;
  }

  // Patch getTenantTaxProfile to use local system names
  const prevGet = global.RS_getTenantTaxProfile;
  if (typeof prevGet === 'function') {
    global.RS_getTenantTaxProfile = function () {
      const p = prevGet() || {};
      const meta = getTaxSystemMeta(p.country);
      if (!p.tax_system || p.tax_system === 'GST' || p.tax_system === 'VAT' || p.tax_system === 'Sales Tax') {
        // Prefer country-native name when outlet has not forced a custom label
        const settings = global.RS_SETTINGS || {};
        if (!settings.set_tax_label) {p.tax_system = meta.system;}
      }
      p.tax_meta = meta;
      p.default_rate_code = defaultRateCode(p.country);
      return p;
    };
  }

  seedTaxRates();

  global.RSTaxCountry = {
    PACK,
    TAX_SYSTEM_NAMES,
    seedTaxRates,
    getTaxSystemMeta,
    listRatesForCountry,
    defaultRateCode,
    splitIndiaGst,
    exportRatesCsv,
    importRatesCsv,
  };
})(typeof window !== 'undefined' ? window : globalThis);
