/**
 * Generate sample trial + paid tax invoice PDFs (local demo).
 * Usage: node scripts/gen-sample-invoices.mjs
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'samples');

const seller = {
  legalName: 'CodeArc Technologies',
  brand: 'RestroSuite',
  address: 'Sheoganj, Rajasthan, India',
  cityLine: 'Rajasthan, India',
  gstin: 'GSTIN-ON-REQUEST',
  state: 'Rajasthan',
  stateCode: '08',
  email: 'hello@codearc.co.in',
  phone: '+91 99837 21179',
  website: 'https://restrosuite.codearc.co.in',
  sacCode: '998314',
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  // WinAnsi-safe (no â‚¹ symbol)
  return 'Rs ' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }
  function three(n) {
    if (n < 100) return two(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '');
  }
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const parts = [];
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(three(lakh) + ' Lakh');
  if (thousand) parts.push(three(thousand) + ' Thousand');
  if (n) parts.push(three(n));
  let out = parts.join(' ') + ' Rupees';
  if (paise) out += ' and ' + two(paise) + ' Paise';
  return out + ' Only';
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

async function buildInvoicePdf(input) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(1, 0.31, 0);
  const dark = rgb(0.1, 0.09, 0.08);
  const muted = rgb(0.4, 0.38, 0.36);
  const line = rgb(0.88, 0.86, 0.84);
  const lightBg = rgb(0.99, 0.97, 0.95);

  const margin = 40;
  const pageW = page.getWidth();
  const pageH = page.getHeight();
  let y = pageH - margin;

  const isTrial = input.kind === 'trial' || input.amountTotal <= 0;
  const total = Math.max(0, Number(input.amountTotal) || 0);
  const taxRate = 18;
  const taxable = isTrial ? 0 : Math.round((total / (1 + taxRate / 100)) * 100) / 100;
  const taxAmt = isTrial ? 0 : Math.round((total - taxable) * 100) / 100;
  const cgst = Math.round((taxAmt / 2) * 100) / 100;
  const sgst = Math.round((taxAmt - cgst) * 100) / 100;
  const title = isTrial ? 'TRIAL CONFIRMATION' : 'TAX INVOICE';
  const invDate = input.invoiceDate || new Date();

  page.drawRectangle({ x: 0, y: pageH - 72, width: pageW, height: 72, color: rgb(0.08, 0.07, 0.06) });
  page.drawRectangle({ x: 0, y: pageH - 76, width: pageW, height: 4, color: orange });
  page.drawText(seller.brand, { x: margin, y: pageH - 38, size: 20, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText(seller.legalName, { x: margin, y: pageH - 54, size: 9, font, color: rgb(0.75, 0.72, 0.7) });
  page.drawText(title, { x: pageW - margin - 140, y: pageH - 36, size: 14, font: fontBold, color: orange });
  page.drawText(isTrial ? 'No payment due' : 'Paid / Subscription', {
    x: pageW - margin - 140, y: pageH - 52, size: 9, font, color: rgb(0.8, 0.78, 0.76),
  });

  y = pageH - 100;
  const drawLabel = (label, value, x, yy) => {
    page.drawText(label, { x, y: yy, size: 8, font, color: muted });
    page.drawText(value, { x, y: yy - 12, size: 10, font: fontBold, color: dark });
  };
  drawLabel('Invoice no.', input.invoiceNumber, margin, y);
  drawLabel('Date', fmtDate(invDate), margin + 170, y);
  drawLabel('Place of supply', `${seller.state} (${seller.stateCode})`, margin + 300, y);
  y -= 40;

  const boxH = 92;
  const boxW = (pageW - margin * 2 - 12) / 2;
  page.drawRectangle({ x: margin, y: y - boxH, width: boxW, height: boxH, borderColor: line, borderWidth: 1, color: lightBg });
  page.drawRectangle({ x: margin + boxW + 12, y: y - boxH, width: boxW, height: boxH, borderColor: line, borderWidth: 1, color: lightBg });

  page.drawText('FROM (Seller)', { x: margin + 10, y: y - 14, size: 8, font: fontBold, color: orange });
  let sy = y - 28;
  for (const t of [seller.legalName, seller.address, seller.cityLine, `GSTIN: ${seller.gstin}`, `${seller.email} Â| ${seller.phone}`]) {
    page.drawText(t.slice(0, 48), { x: margin + 10, y: sy, size: 8.5, font: t === seller.legalName ? fontBold : font, color: dark });
    sy -= 12;
  }

  page.drawText('BILL TO (Buyer)', { x: margin + boxW + 22, y: y - 14, size: 8, font: fontBold, color: orange });
  let by = y - 28;
  const buyerLines = [
    input.buyerName || 'Customer',
    `Outlet ID: ${input.buyerSlug || 'â€”'}`,
    input.buyerAddress || 'Address on file',
    input.buyerEmail || 'â€”',
    input.buyerPhone ? `WhatsApp: +${String(input.buyerPhone).replace(/\D/g, '')}` : 'â€”',
  ];
  for (const t of buyerLines) {
    page.drawText(String(t).slice(0, 48), { x: margin + boxW + 22, y: by, size: 8.5, font: t === buyerLines[0] ? fontBold : font, color: dark });
    by -= 12;
  }

  y -= boxH + 22;
  page.drawRectangle({ x: margin, y: y - 18, width: pageW - margin * 2, height: 22, color: rgb(0.1, 0.09, 0.08) });
  const cols = { sn: margin + 8, desc: margin + 30, hsn: margin + 280, qty: margin + 340, rate: margin + 390, amt: pageW - margin - 70 };
  page.drawText('#', { x: cols.sn, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Description', { x: cols.desc, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('SAC', { x: cols.hsn, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Qty', { x: cols.qty, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Rate', { x: cols.rate, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Amount', { x: cols.amt, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  y -= 28;

  const intervalLabel = input.billingInterval === 'yearly' ? 'Yearly' : input.billingInterval === 'trial' ? '30-day trial' : 'Monthly';
  const desc = `${input.planName} - RestroSuite SaaS (${intervalLabel}) | Service period: ${fmtDate(input.periodStart || invDate)} to ${fmtDate(input.periodEnd || null)}`;
  const descLines = wrapText(desc, 42);
  page.drawText('1', { x: cols.sn, y, size: 9, font, color: dark });
  let dy = y;
  for (const dl of descLines) {
    page.drawText(dl, { x: cols.desc, y: dy, size: 9, font, color: dark });
    dy -= 11;
  }
  page.drawText(seller.sacCode, { x: cols.hsn, y, size: 9, font, color: dark });
  page.drawText('1', { x: cols.qty, y, size: 9, font, color: dark });
  page.drawText(fmtMoney(taxable), { x: cols.rate, y, size: 9, font, color: dark });
  page.drawText(fmtMoney(taxable), { x: cols.amt, y, size: 9, font: fontBold, color: dark });
  y = Math.min(dy, y) - 16;

  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.6, color: line });
  y -= 20;

  const rightX = pageW - margin - 160;
  const row = (label, val, bold = false) => {
    page.drawText(label, { x: rightX, y, size: 9, font: bold ? fontBold : font, color: muted });
    page.drawText(val, { x: pageW - margin - 8 - font.widthOfTextAtSize(val, 9), y, size: 9, font: bold ? fontBold : font, color: dark });
    y -= 14;
  };
  row('Taxable value', fmtMoney(taxable));
  if (!isTrial) {
    row(`CGST @ ${taxRate / 2}%`, fmtMoney(cgst));
    row(`SGST @ ${taxRate / 2}%`, fmtMoney(sgst));
  } else row('GST', fmtMoney(0));
  y -= 4;
  page.drawRectangle({
    x: rightX - 8, y: y - 6, width: pageW - margin - rightX + 8, height: 22,
    color: rgb(1, 0.96, 0.93), borderColor: orange, borderWidth: 0.8,
  });
  page.drawText(isTrial ? 'Amount payable' : 'Grand total (incl. GST)', { x: rightX, y: y + 2, size: 9, font: fontBold, color: dark });
  const grand = fmtMoney(total);
  page.drawText(grand, { x: pageW - margin - 8 - fontBold.widthOfTextAtSize(grand, 11), y: y + 1, size: 11, font: fontBold, color: orange });
  y -= 28;

  page.drawText('Amount in words:', { x: margin, y, size: 8, font, color: muted });
  y -= 12;
  page.drawText(amountInWords(total), { x: margin, y, size: 9, font: fontBold, color: dark });
  y -= 22;

  page.drawText('Payment details', { x: margin, y, size: 9, font: fontBold, color: orange });
  y -= 14;
  for (const p of [
    `Status: ${isTrial ? 'TRIAL - Rs 0.00 (no charge)' : 'PAID'}`,
    input.paymentMethod ? `Method: ${input.paymentMethod}` : null,
    input.paymentId ? `Payment ID: ${input.paymentId}` : null,
    input.periodEnd ? `Valid until: ${fmtDate(input.periodEnd)}` : null,
    'Currency: INR',
  ].filter(Boolean)) {
    page.drawText(p, { x: margin, y, size: 8.5, font, color: dark });
    y -= 12;
  }

  if (input.notes) {
    y -= 6;
    page.drawText('Notes:', { x: margin, y, size: 8, font: fontBold, color: muted });
    y -= 12;
    for (const nl of wrapText(input.notes, 90)) {
      page.drawText(nl, { x: margin, y, size: 8, font, color: dark });
      y -= 11;
    }
  }

  y = Math.min(y, 120);
  page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: pageW - margin, y: y + 8 }, thickness: 0.5, color: line });
  const terms = isTrial
    ? [
      'This is a trial confirmation, not a tax invoice for a taxable supply.',
      '30-day Serve trial Â| no card charged Â| one trial per WhatsApp number.',
      'After trial ends there is no grace period. Renew Express / Serve / Command to continue.',
      'Period renewals extend from expiry date (not payment day). Auto-renew available via Razorpay.',
    ]
    : [
      'This is a computer-generated tax invoice for SaaS subscription services.',
      'Prices shown are GST-inclusive (18%). Reverse charge not applicable.',
      'Subscription period extends from prior expiry when paid early.',
      `Support: ${seller.email} Â| ${seller.phone}`,
    ];
  y -= 4;
  page.drawText('Terms', { x: margin, y, size: 8, font: fontBold, color: muted });
  y -= 12;
  for (const t of terms) {
    page.drawText('â€¢ ' + t, { x: margin, y, size: 7.5, font, color: muted });
    y -= 10;
  }

  page.drawText(`${seller.brand} by ${seller.legalName} Â| ${seller.website}`, { x: margin, y: 36, size: 8, font, color: muted });
  page.drawText('Thank you for choosing RestroSuite.', { x: margin, y: 24, size: 8, font: fontBold, color: orange });

  return Buffer.from(await doc.save());
}

const trialStart = new Date();
const trialEnd = new Date(trialStart.getTime() + 30 * 86400000);
const paidStart = new Date();
const paidEnd = new Date(paidStart.getTime() + 30 * 86400000);

const trialPdf = await buildInvoicePdf({
  kind: 'trial',
  invoiceNumber: 'TRS-RS-20260801-1001',
  invoiceDate: trialStart,
  buyerName: 'Royal Dhaba Sample',
  buyerSlug: 'royal-dhaba',
  buyerEmail: 'owner@royaldhaba.example',
  buyerPhone: '919983721179',
  buyerAddress: 'Main Market, Sheoganj, Rajasthan',
  planName: 'Serve (Trial)',
  billingInterval: 'trial',
  periodStart: trialStart,
  periodEnd: trialEnd,
  amountTotal: 0,
  paymentMethod: 'Trial â€” no charge',
  notes: '30-day Serve trial. Sign in immediately. No approval wait. This PDF is your official confirmation.',
});

const paidPdf = await buildInvoicePdf({
  kind: 'subscription',
  invoiceNumber: 'INV-RS-20260801-2002',
  invoiceDate: paidStart,
  buyerName: 'Royal Dhaba Sample',
  buyerSlug: 'royal-dhaba',
  buyerEmail: 'owner@royaldhaba.example',
  buyerPhone: '919983721179',
  buyerAddress: 'Main Market, Sheoganj, Rajasthan',
  planName: 'Serve',
  billingInterval: 'monthly',
  periodStart: paidStart,
  periodEnd: paidEnd,
  amountTotal: 999,
  paymentId: 'pay_SAMPLE_RAZORPAY_001',
  paymentMethod: 'Razorpay',
  notes: 'Subscription period extended from expiry date (not payment day). Thank you for your business.',
});

fs.mkdirSync(outDir, { recursive: true });
const trialPath = path.join(outDir, 'sample-trial-confirmation.pdf');
const paidPath = path.join(outDir, 'sample-tax-invoice-serve.pdf');
fs.writeFileSync(trialPath, trialPdf);
fs.writeFileSync(paidPath, paidPdf);
console.log('Wrote:\n ', trialPath, `(${trialPdf.length} bytes)\n `, paidPath, `(${paidPdf.length} bytes)`);
