/* ============================================================
   RestroSuite — Tax rate resolution + tenant tax profile (Wave 12)
   Loaded before dashboard / pos-ui so RS_resolveRate is global.
   ============================================================ */
(function (global) {
  'use strict';

  const TAX_RATES = [];
  global.RS_TAX_RATES = TAX_RATES;

  function resolveRate(country, rateCode, dateStr) {
    const list = global.RS_TAX_RATES || [];
    const date = dateStr ? new Date(dateStr) : new Date();
    const matches = list.filter(
      (r) =>
        String(r.country).toUpperCase() === String(country || 'IN').toUpperCase() &&
        String(r.rateCode || r.rate_code).toUpperCase() === String(rateCode).toUpperCase()
    );
    const active = matches.find((r) => {
      const from = new Date(r.validFrom || r.valid_from);
      const to = r.validTo || r.valid_to ? new Date(r.validTo || r.valid_to) : null;
      return date >= from && (!to || date <= to);
    });
    if (active) {
      return {
        percent: Number(active.percent),
        itc_allowed: !!(active.itcAllowed || active.itc_allowed),
        label: active.label,
      };
    }
    if (String(country).toUpperCase() === 'IE') {
      if (rateCode === 'IE_FOOD_9' || rateCode === 'IE_FOOD_135') {
        const cutover = new Date('2026-07-01');
        return { percent: date >= cutover ? 9.0 : 13.5, itc_allowed: true, label: 'VAT Hot Food' };
      }
      if (rateCode === 'IE_DRINK_23') return { percent: 23.0, itc_allowed: true, label: 'VAT Drinks' };
      if (rateCode === 'IE_COLD_0') return { percent: 0.0, itc_allowed: true, label: 'VAT Cold Takeaway' };
      if (rateCode === 'IE_DELIVERY_23') return { percent: 23.0, itc_allowed: true, label: 'VAT Delivery' };
      if (rateCode === 'IE_ACCOM_135') return { percent: 13.5, itc_allowed: true, label: 'VAT Accommodation' };
    }
    if (String(country).toUpperCase() === 'IN') {
      if (rateCode === 'IN_REST_5') return { percent: 5.0, itc_allowed: false, label: 'GST Standalone' };
      if (rateCode === 'IN_REST_18') return { percent: 18.0, itc_allowed: true, label: 'GST Specified' };
      if (rateCode === 'IN_CATER_18') return { percent: 18.0, itc_allowed: true, label: 'GST Catering' };
      if (rateCode === 'IN_COMP_5') return { percent: 5.0, itc_allowed: false, label: 'GST Composition' };
      if (rateCode === 'IN_GOODS_5') return { percent: 5.0, itc_allowed: false, label: 'GST Goods' };
      if (rateCode === 'IN_GOODS_18') return { percent: 18.0, itc_allowed: true, label: 'GST Goods' };
      if (rateCode === 'IN_NIL_0') return { percent: 0.0, itc_allowed: false, label: 'GST Nil Rated' };
    }
    const m = String(rateCode).match(/_(\d+)(?:5)?$/);
    const pct = m ? Number(m[1]) : 5;
    return { percent: pct, itc_allowed: false, label: rateCode };
  }

  function getTenantTaxProfile() {
    const settings = global.RS_SETTINGS || {};

    let country = 'IN';
    if (settings.set_country) {
      const entry =
        (global.RS_getCountryByName && global.RS_getCountryByName(settings.set_country)) || null;
      if (entry) {
        country = entry.code;
      } else {
        const fallbackMap = {
          india: 'IN',
          ireland: 'IE',
          'united kingdom': 'GB',
          uk: 'GB',
          'great britain': 'GB',
          'united states': 'US',
          usa: 'US',
          australia: 'AU',
          canada: 'CA',
          'new zealand': 'NZ',
          singapore: 'SG',
          'united arab emirates': 'AE',
          uae: 'AE',
          'saudi arabia': 'SA',
          'south africa': 'ZA',
          germany: 'DE',
          france: 'FR',
          netherlands: 'NL',
          spain: 'ES',
          italy: 'IT',
          portugal: 'PT',
          belgium: 'BE',
          austria: 'AT',
          sweden: 'SE',
          denmark: 'DK',
          norway: 'NO',
          finland: 'FI',
          greece: 'GR',
          malaysia: 'MY',
          thailand: 'TH',
          vietnam: 'VN',
          indonesia: 'ID',
          philippines: 'PH',
          kenya: 'KE',
          nigeria: 'NG',
          ghana: 'GH',
          pakistan: 'PK',
          bangladesh: 'BD',
          'sri lanka': 'LK',
          nepal: 'NP',
        };
        country = fallbackMap[String(settings.set_country || '').toLowerCase()] || 'IN';
      }
    }

    const vatCountries = [
      'IE',
      'GB',
      'DE',
      'FR',
      'NL',
      'ES',
      'IT',
      'PT',
      'BE',
      'AT',
      'FI',
      'GR',
      'DK',
      'SE',
      'NO',
      'SA',
      'AE',
      'ZA',
      'KE',
      'NG',
      'GH',
      'PH',
      'TH',
      'ID',
    ];
    const salesTaxCodes = ['US'];
    let taxSystem;
    if (vatCountries.includes(country)) taxSystem = 'VAT';
    else if (salesTaxCodes.includes(country)) taxSystem = 'Sales Tax';
    else taxSystem = 'GST';

    if (settings.set_tax_label) taxSystem = settings.set_tax_label;

    let profile = {};
    try {
      if (settings.set_tax_profile) {
        profile =
          typeof settings.set_tax_profile === 'string'
            ? JSON.parse(settings.set_tax_profile)
            : settings.set_tax_profile;
      }
    } catch (e) {}
    return {
      country: country,
      tax_system: taxSystem,
      inclusive_pricing: !!settings.set_inclusive_pricing,
      tax_registration_no: settings.set_gstin || profile.tax_registration_no || '',
      gst_scheme: profile.gst_scheme || settings.set_gst_scheme || 'regular',
      state_code: settings.set_gst_state || profile.state_code || (country === 'IN' ? '07' : ''),
      specified_premises: !!(profile.specified_premises || settings.set_specified_premises),
      vat_filing_frequency: profile.vat_filing_frequency || 'bi_monthly',
      accounting_year_end: profile.accounting_year_end || null,
      apply_gst_on_service_charge: !!(
        profile.apply_gst_on_service_charge || settings.set_apply_gst_on_service_charge
      ),
      liquor_vat_rate: Number(settings.set_liquor_vat_rate || profile.liquor_vat_rate || 20),
    };
  }

  global.RS_resolveRate = resolveRate;
  global.RS_getTenantTaxProfile = getTenantTaxProfile;
  global.RSTax = {
    TAX_RATES,
    resolveRate,
    getTenantTaxProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
