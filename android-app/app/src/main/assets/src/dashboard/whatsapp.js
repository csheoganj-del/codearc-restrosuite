(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {module.exports = api;}
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.whatsapp = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeIndianPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 10) {digits = `91${digits}`;}
    if (digits.length < 10 || digits.length > 15) {return null;}
    return digits;
  }

  function resolveGatewaySendUrl(value) {
    const url = String(value || '').trim();
    if (!url) {return '';}
    if (
      url.endsWith('/send')
      || url.endsWith('/api/mock-whatsapp')
      || url.includes('httpbin.org')
    ) {
      return url;
    }
    return `${url.replace(/\/+$/, '')}/send`;
  }

  function renderWhatsappSendBtn(phone) {
    return `<button aria-label="Send WhatsApp message to customer ${phone}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>`;
  }

  function renderWhatsappTemplateBtn() {
    return '<button aria-label="Browse and select approved WhatsApp message templates"><i class="fa-regular fa-message" aria-hidden="true"></i></button>';
  }

  function renderWhatsappHistoryBtn(customerId) {
    return `<button aria-label="View WhatsApp conversation history with customer ${customerId}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></button>`;
  }

  function renderWhatsappGatewayBtn() {
    return '<button aria-label="Configure WhatsApp gateway connection and webhook"><i class="fa-solid fa-tower-broadcast" aria-hidden="true"></i></button>';
  }

  return { normalizeIndianPhone, resolveGatewaySendUrl, renderWhatsappSendBtn, renderWhatsappTemplateBtn, renderWhatsappHistoryBtn, renderWhatsappGatewayBtn };
});
