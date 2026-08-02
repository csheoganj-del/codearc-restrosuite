/**
 * RestroSuite / CodeArc - professional tax invoice PDF + delivery
 * (email attachment when relay supports it + WhatsApp PDF via gateway)
 */

import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

export type InvoiceKind = "trial" | "subscription" | "renewal" | "upgrade";

export type InvoiceInput = {
  kind: InvoiceKind;
  invoiceNumber: string;
  invoiceDate?: Date;
  buyerName: string;
  buyerSlug: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyerAddress?: string | null;
  buyerGstin?: string | null;
  planCode: string;
  planName: string;
  billingInterval: "monthly" | "yearly" | "trial";
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Total charged to customer in INR (GST-inclusive for paid; 0 for trial) */
  amountTotal: number;
  currency?: string;
  paymentId?: string | null;
  orderId?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
};

export type SellerProfile = {
  legalName: string;
  brand: string;
  address: string;
  cityLine: string;
  gstin: string;
  state: string;
  stateCode: string;
  email: string;
  phone: string;
  website: string;
  sacCode: string;
};

export function sellerFromEnv(): SellerProfile {
  return {
    legalName: Deno.env.get("INVOICE_SELLER_NAME") || "CodeArc Technologies",
    brand: Deno.env.get("INVOICE_BRAND") || "RestroSuite",
    address: Deno.env.get("INVOICE_SELLER_ADDRESS") ||
      "Sheoganj, Rajasthan, India",
    cityLine: Deno.env.get("INVOICE_SELLER_CITY") || "Rajasthan, India",
    gstin: Deno.env.get("INVOICE_SELLER_GSTIN") || "Unregistered",
    state: Deno.env.get("INVOICE_SELLER_STATE") || "Rajasthan",
    stateCode: Deno.env.get("INVOICE_SELLER_STATE_CODE") || "08",
    email: Deno.env.get("INVOICE_SELLER_EMAIL") || "hello@codearc.co.in",
    phone: Deno.env.get("INVOICE_SELLER_PHONE") || "+91 99837 21179",
    website: Deno.env.get("INVOICE_SELLER_WEB") ||
      "https://restrosuite.codearc.co.in",
    sacCode: Deno.env.get("INVOICE_SAC") || "998314",
  };
}

export function planDisplayName(code: string): string {
  const c = String(code || "").toLowerCase();
  if (c === "express" || c === "starter") return "Express";
  if (c === "serve" || c === "growth") return "Serve";
  if (c === "command" || c === "enterprise") return "Command";
  return code || "Plan";
}

export function planListPrice(
  code: string,
  interval: "monthly" | "yearly" | "trial",
): number {
  if (interval === "trial") return 0;
  const c = String(code || "").toLowerCase();
  const monthly: Record<string, number> = {
    express: 499,
    starter: 499,
    serve: 999,
    growth: 999,
    command: 2499,
    enterprise: 2499,
  };
  const yearly: Record<string, number> = {
    express: 4999,
    starter: 4999,
    serve: 9999,
    growth: 9999,
    command: 24999,
    enterprise: 24999,
  };
  if (interval === "yearly") return yearly[c] ?? 0;
  return monthly[c] ?? 0;
}

export function makeInvoiceNumber(kind: InvoiceKind): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  const prefix = kind === "trial" ? "TRS" : "INV";
  return `${prefix}-RS-${y}${m}${day}-${rand}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return String(d);
  }
}

function fmtMoney(n: number, _currency = "INR"): string {
  const v = Number(n) || 0;
  // Helvetica/WinAnsi cannot encode   - use ASCII "Rs"
  return "Rs " + v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Indian number to words (rupees) - concise */
export function amountInWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty",
    "Ninety",
  ];
  function two(n: number): string {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }
  function three(n: number): string {
    if (n < 100) return two(n);
    return ones[Math.floor(n / 100)] + " Hundred" +
      (n % 100 ? " " + two(n % 100) : "");
  }
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;
  const parts: string[] = [];
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(three(lakh) + " Lakh");
  if (thousand) parts.push(three(thousand) + " Thousand");
  if (rest) parts.push(three(rest));
  let out = parts.join(" ") + " Rupees";
  if (paise) out += " and " + two(paise) + " Paise";
  return out + " Only";
}

function wrapText(
  text: string,
  maxChars: number,
): string[] {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [""];
  // Hard-break very long tokens (URLs, unbroken addresses) so they never overflow
  const words: string[] = [];
  for (const w of raw.split(" ")) {
    if (w.length <= maxChars) {
      words.push(w);
      continue;
    }
    for (let i = 0; i < w.length; i += maxChars) {
      words.push(w.slice(i, i + maxChars));
    }
  }
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Max characters that fit in a box of width (pt) at font size. */
function charsForWidth(boxInnerW: number, fontSize: number): number {
  // Helvetica average glyph ≈ 0.5 * size
  const avg = Math.max(3.5, fontSize * 0.48);
  return Math.max(12, Math.floor(boxInnerW / avg));
}

/**
 * Build a professional A4 tax invoice / trial confirmation PDF.
 * Paid amounts are treated as GST-inclusive (18% reverse-calculated).
 */
export async function buildInvoicePdf(
  input: InvoiceInput,
  seller: SellerProfile = sellerFromEnv(),
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
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

  const isTrial = input.kind === "trial" || input.amountTotal <= 0;
  const total = Math.max(0, Number(input.amountTotal) || 0);
  const taxRate = 18;
  // GST-inclusive reverse for paid; trial zeros
  const taxable = isTrial ? 0 : Math.round((total / (1 + taxRate / 100)) * 100) / 100;
  const taxAmt = isTrial ? 0 : Math.round((total - taxable) * 100) / 100;
  const cgst = Math.round((taxAmt / 2) * 100) / 100;
  const sgst = Math.round((taxAmt - cgst) * 100) / 100;

  const title = isTrial ? "TRIAL CONFIRMATION" : "TAX INVOICE";
  const invDate = input.invoiceDate || new Date();

  // Header bar
  page.drawRectangle({
    x: 0,
    y: pageH - 72,
    width: pageW,
    height: 72,
    color: rgb(0.08, 0.07, 0.06),
  });
  page.drawRectangle({
    x: 0,
    y: pageH - 76,
    width: pageW,
    height: 4,
    color: orange,
  });
  page.drawText(seller.brand, {
    x: margin,
    y: pageH - 38,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(seller.legalName, {
    x: margin,
    y: pageH - 54,
    size: 9,
    font,
    color: rgb(0.75, 0.72, 0.7),
  });
  page.drawText(title, {
    x: pageW - margin - 140,
    y: pageH - 36,
    size: 14,
    font: fontBold,
    color: orange,
  });
  page.drawText(isTrial ? "No payment due" : "Paid / Subscription", {
    x: pageW - margin - 140,
    y: pageH - 52,
    size: 9,
    font,
    color: rgb(0.8, 0.78, 0.76),
  });

  y = pageH - 100;

  // Meta block
  const drawLabel = (label: string, value: string, x: number, yy: number) => {
    page.drawText(label, { x, y: yy, size: 8, font, color: muted });
    page.drawText(value, { x, y: yy - 12, size: 10, font: fontBold, color: dark });
  };
  drawLabel("Invoice no.", input.invoiceNumber, margin, y);
  drawLabel("Date", fmtDate(invDate), margin + 170, y);
  drawLabel("Place of supply", `${seller.state} (${seller.stateCode})`, margin + 300, y);
  y -= 40;

  // Seller / Buyer boxes — wrap long addresses so they never clip the frame
  const boxW = (pageW - margin * 2 - 12) / 2;
  const boxPadX = 10;
  const boxInnerW = boxW - boxPadX * 2;
  const bodySize = 8.5;
  const lineH = 11;
  const maxChars = charsForWidth(boxInnerW, bodySize);

  type BoxLine = { text: string; bold?: boolean };
  function expandLines(parts: BoxLine[], maxLines = 8): BoxLine[] {
    const out: BoxLine[] = [];
    for (const p of parts) {
      const wrapped = wrapText(p.text, maxChars);
      for (const w of wrapped) {
        if (out.length >= maxLines) break;
        out.push({ text: w, bold: p.bold && out.length === 0 ? true : !!p.bold && wrapped[0] === w && p === parts[0] });
      }
      if (out.length >= maxLines) break;
    }
    // First line of first part stays bold
    if (out.length && parts[0]) out[0] = { text: out[0].text, bold: true };
    return out.length ? out : [{ text: "-", bold: false }];
  }

  const sellerParts: BoxLine[] = [
    { text: seller.legalName, bold: true },
    { text: seller.address },
    { text: seller.cityLine },
    { text: `GSTIN: ${seller.gstin}` },
    { text: `${seller.email}  | ${seller.phone}` },
  ];
  const buyerParts: BoxLine[] = [
    { text: input.buyerName || "Customer", bold: true },
    { text: `Outlet ID: ${input.buyerSlug || "-"}` },
    { text: input.buyerAddress || "Address on file" },
    { text: input.buyerEmail || "-" },
    {
      text: input.buyerPhone
        ? `WhatsApp: +${String(input.buyerPhone).replace(/\D/g, "")}`
        : "-",
    },
  ];
  if (input.buyerGstin) buyerParts.push({ text: `GSTIN: ${input.buyerGstin}` });

  const sellerLines = expandLines(sellerParts, 9);
  const buyerLines = expandLines(buyerParts, 9);
  const contentLines = Math.max(sellerLines.length, buyerLines.length);
  // Header label (~16) + lines + bottom pad
  const boxH = Math.max(92, 20 + contentLines * lineH + 14);

  page.drawRectangle({
    x: margin,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: line,
    borderWidth: 1,
    color: lightBg,
  });
  page.drawRectangle({
    x: margin + boxW + 12,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: line,
    borderWidth: 1,
    color: lightBg,
  });

  page.drawText("FROM (Seller)", {
    x: margin + boxPadX,
    y: y - 14,
    size: 8,
    font: fontBold,
    color: orange,
  });
  let sy = y - 28;
  for (const row of sellerLines) {
    const t = row.text;
    // Use width-safe slice as final guard (pdf-lib has no clip)
    const safe = t.length > maxChars + 2 ? t.slice(0, maxChars - 1) + "..." : t;
    page.drawText(safe, {
      x: margin + boxPadX,
      y: sy,
      size: bodySize,
      font: row.bold ? fontBold : font,
      color: dark,
    });
    sy -= lineH;
  }

  page.drawText("BILL TO (Buyer)", {
    x: margin + boxW + 12 + boxPadX,
    y: y - 14,
    size: 8,
    font: fontBold,
    color: orange,
  });
  let by = y - 28;
  for (const row of buyerLines) {
    const t = row.text;
    const safe = t.length > maxChars + 2 ? t.slice(0, maxChars - 1) + "..." : t;
    page.drawText(safe, {
      x: margin + boxW + 12 + boxPadX,
      y: by,
      size: bodySize,
      font: row.bold ? fontBold : font,
      color: dark,
    });
    by -= lineH;
  }

  y -= boxH + 22;

  // Line items header
  page.drawRectangle({
    x: margin,
    y: y - 18,
    width: pageW - margin * 2,
    height: 22,
    color: rgb(0.1, 0.09, 0.08),
  });
  const cols = {
    sn: margin + 8,
    desc: margin + 30,
    hsn: margin + 280,
    qty: margin + 340,
    rate: margin + 390,
    amt: pageW - margin - 70,
  };
  page.drawText("#", { x: cols.sn, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Description", { x: cols.desc, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("SAC", { x: cols.hsn, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Qty", { x: cols.qty, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Rate", { x: cols.rate, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Amount", { x: cols.amt, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  y -= 28;

  const intervalLabel =
    input.billingInterval === "yearly"
      ? "Yearly"
      : input.billingInterval === "trial"
      ? "30-day trial"
      : "Monthly";
  const desc =
    `${input.planName || planDisplayName(input.planCode)} - RestroSuite SaaS (${intervalLabel})` +
    (input.periodStart || input.periodEnd
      ? ` | Service period: ${fmtDate(input.periodStart || invDate)} to ${fmtDate(input.periodEnd || null)}`
      : "");
  const descLines = wrapText(desc.replace(/\n/g, "  | "), 42);

  page.drawText("1", { x: cols.sn, y: y, size: 9, font, color: dark });
  let dy = y;
  for (const dl of descLines) {
    page.drawText(dl, { x: cols.desc, y: dy, size: 9, font, color: dark });
    dy -= 11;
  }
  page.drawText(seller.sacCode, { x: cols.hsn, y: y, size: 9, font, color: dark });
  page.drawText("1", { x: cols.qty, y: y, size: 9, font, color: dark });
  page.drawText(fmtMoney(taxable), { x: cols.rate, y: y, size: 9, font, color: dark });
  page.drawText(fmtMoney(taxable), { x: cols.amt, y: y, size: 9, font: fontBold, color: dark });
  y = Math.min(dy, y) - 16;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageW - margin, y },
    thickness: 0.6,
    color: line,
  });
  y -= 20;

  // Totals
  const rightX = pageW - margin - 160;
  const row = (label: string, val: string, bold = false) => {
    page.drawText(label, {
      x: rightX,
      y,
      size: 9,
      font: bold ? fontBold : font,
      color: muted,
    });
    page.drawText(val, {
      x: pageW - margin - 8 - font.widthOfTextAtSize(val, 9),
      y,
      size: 9,
      font: bold ? fontBold : font,
      color: dark,
    });
    y -= 14;
  };
  row("Taxable value", fmtMoney(taxable));
  if (!isTrial) {
    row(`CGST @ ${taxRate / 2}%`, fmtMoney(cgst));
    row(`SGST @ ${taxRate / 2}%`, fmtMoney(sgst));
  } else {
    row("GST", fmtMoney(0));
  }
  y -= 4;
  page.drawRectangle({
    x: rightX - 8,
    y: y - 6,
    width: pageW - margin - rightX + 8,
    height: 22,
    color: rgb(1, 0.96, 0.93),
    borderColor: orange,
    borderWidth: 0.8,
  });
  page.drawText(isTrial ? "Amount payable" : "Grand total (incl. GST)", {
    x: rightX,
    y: y + 2,
    size: 9,
    font: fontBold,
    color: dark,
  });
  const grand = fmtMoney(total);
  page.drawText(grand, {
    x: pageW - margin - 8 - fontBold.widthOfTextAtSize(grand, 11),
    y: y + 1,
    size: 11,
    font: fontBold,
    color: orange,
  });
  y -= 28;

  page.drawText("Amount in words:", {
    x: margin,
    y,
    size: 8,
    font,
    color: muted,
  });
  y -= 12;
  page.drawText(amountInWords(total), {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: dark,
  });
  y -= 22;

  // Payment block
  page.drawText("Payment details", {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: orange,
  });
  y -= 14;
  const payLines = [
    `Status: ${isTrial ? "TRIAL - Rs 0.00 (no charge)" : "PAID"}`,
    input.paymentMethod ? `Method: ${input.paymentMethod}` : null,
    input.paymentId ? `Payment ID: ${input.paymentId}` : null,
    input.orderId ? `Order ID: ${input.orderId}` : null,
    input.periodEnd ? `Valid until: ${fmtDate(input.periodEnd)}` : null,
    `Currency: ${input.currency || "INR"}`,
  ].filter(Boolean) as string[];
  for (const p of payLines) {
    page.drawText(p, { x: margin, y, size: 8.5, font, color: dark });
    y -= 12;
  }

  if (input.notes) {
    y -= 6;
    page.drawText("Notes:", { x: margin, y, size: 8, font: fontBold, color: muted });
    y -= 12;
    for (const nl of wrapText(input.notes, 90)) {
      page.drawText(nl, { x: margin, y, size: 8, font, color: dark });
      y -= 11;
    }
  }

  // Terms
  y = Math.min(y, 120);
  page.drawLine({
    start: { x: margin, y: y + 8 },
    end: { x: pageW - margin, y: y + 8 },
    thickness: 0.5,
    color: line,
  });
  const terms = isTrial
    ? [
      "This is a trial confirmation, not a tax invoice for a taxable supply.",
      "30-day Serve trial  | no card charged  | one trial per WhatsApp number.",
      "After trial ends there is no grace period. Renew Express / Serve / Command to continue.",
      "Period renewals extend from expiry date (not payment day). Auto-renew available via Razorpay.",
    ]
    : [
      "This is a computer-generated tax invoice for SaaS subscription services.",
      "Prices shown are GST-inclusive (18%). Reverse charge not applicable.",
      "Subscription period extends from prior expiry when paid early.",
      "Support: " + seller.email + "  | " + seller.phone,
    ];
  y -= 4;
  page.drawText("Terms", { x: margin, y, size: 8, font: fontBold, color: muted });
  y -= 12;
  for (const t of terms) {
    page.drawText("* " + t, { x: margin, y, size: 7.5, font, color: muted });
    y -= 10;
  }

  // Footer
  page.drawText(
    `${seller.brand} by ${seller.legalName}  | ${seller.website}`,
    {
      x: margin,
      y: 36,
      size: 8,
      font,
      color: muted,
    },
  );
  page.drawText("Thank you for choosing RestroSuite.", {
    x: margin,
    y: 24,
    size: 8,
    font: fontBold,
    color: orange,
  });

  return await doc.save();
}

export function invoiceEmailHtml(
  input: InvoiceInput,
  seller: SellerProfile = sellerFromEnv(),
): string {
  const isTrial = input.kind === "trial" || input.amountTotal <= 0;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
  <table width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
    <tr><td style="background:#141210;padding:22px 28px">
      <div style="color:#fff;font-size:20px;font-weight:700">${seller.brand}</div>
      <div style="color:#FF4F00;font-size:13px;font-weight:700;margin-top:6px">${isTrial ? "Trial confirmation" : "Tax invoice"}  | ${input.invoiceNumber}</div>
    </td></tr>
    <tr><td style="padding:24px 28px;color:#374151;font-size:14px;line-height:1.6">
      <p>Hello <strong>${input.buyerName || "there"}</strong>,</p>
      <p>${
    isTrial
      ? `Your <strong>30-day Serve trial</strong> is active for outlet <strong>${input.buyerSlug}</strong>. No payment was charged. A PDF confirmation is attached / also sent on WhatsApp.`
      : `Thank you for your payment. Your <strong>${input.planName}</strong> (${input.billingInterval}) subscription is active for <strong>${input.buyerSlug}</strong>. Professional tax invoice PDF is attached and also sent on WhatsApp.`
  }</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
        <tr><td style="padding:8px;border:1px solid #eee;color:#6b7280">Invoice</td><td style="padding:8px;border:1px solid #eee;font-weight:700">${input.invoiceNumber}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;color:#6b7280">Amount</td><td style="padding:8px;border:1px solid #eee;font-weight:700;color:#FF4F00">${fmtMoney(input.amountTotal)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #eee;color:#6b7280">Valid until</td><td style="padding:8px;border:1px solid #eee">${fmtDate(input.periodEnd || null)}</td></tr>
        ${input.paymentId ? `<tr><td style="padding:8px;border:1px solid #eee;color:#6b7280">Payment ID</td><td style="padding:8px;border:1px solid #eee;font-family:monospace;font-size:12px">${input.paymentId}</td></tr>` : ""}
      </table>
      <p style="text-align:center;margin:22px 0">
        <a href="${seller.website}/login" style="background:#FF4F00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Open RestroSuite</a>
      </p>
      <p style="font-size:12px;color:#6b7280">Support: ${seller.email} | ${seller.phone}</p>
    </td></tr>
  </table>
  </td></tr></table></body></html>`;
}

function b64(bytes: Uint8Array): string {
  // Deno-safe base64 without stack overflow on large buffers
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice) as number[]);
  }
  return btoa(binary);
}

async function postEmailRelay(body: Record<string, unknown>): Promise<boolean> {
  if ((Deno.env.get("ZERO_COST_EMAILS_DISABLED") || "false") === "true") {
    return false;
  }
  const relay = Deno.env.get("EMAIL_RELAY_URL") || "";
  const token = Deno.env.get("EMAIL_RELAY_TOKEN") || "";
  const gatewayUrl = (
    Deno.env.get("WHATSAPP_GATEWAY_URL") ||
    Deno.env.get("NGROK_GATEWAY_URL") ||
    ""
  ).replace(/\/+$/, "");
  const gatewayToken =
    Deno.env.get("WHATSAPP_GATEWAY_TOKEN") ||
    Deno.env.get("GATEWAY_TOKEN") ||
    "";

  async function tryPost(url: string, headers: Record<string, string>): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text().catch(() => "");
      let j: Record<string, unknown> = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
      const ok = res.ok && (
        j.status === "success" ||
        j.status === "ok" ||
        j.ok === true ||
        !text ||
        /success|ok|sent/i.test(text)
      );
      if (!ok) console.error("[invoice-email] fail", url.slice(0, 48), res.status, text.slice(0, 160));
      return ok;
    } finally {
      clearTimeout(timer);
    }
  }

  // 1) Prefer home-network gateway proxy (Apps Script often 404s from cloud IPs)
  if (gatewayUrl && gatewayToken) {
    try {
      const ok = await tryPost(`${gatewayUrl}/email`, {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      });
      if (ok) return true;
    } catch (e) {
      console.error("[invoice-email] gateway proxy error", e);
    }
  }

  // 2) Direct Apps Script relay
  if (relay) {
    try {
      return await tryPost(relay, {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "RestroSuite-Billing/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      });
    } catch (e) {
      console.error("[invoice-email] direct relay error", e);
    }
  }
  return false;
}

export async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBytes: Uint8Array;
  filename: string;
}): Promise<boolean> {
  if (!opts.to) return false;
  const pdfB64 = b64(opts.pdfBytes);
  // 1) Prefer PDF attachment (Apps Script may ignore unknown fields)
  try {
    const withPdf = await postEmailRelay({
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: [{
        filename: opts.filename,
        content: pdfB64,
        encoding: "base64",
        mimeType: "application/pdf",
        type: "application/pdf",
      }],
      pdfBase64: pdfB64,
      pdfFilename: opts.filename,
      filename: opts.filename,
    });
    if (withPdf) return true;
  } catch (e) {
    console.error("[invoice-email] with PDF failed", e);
  }
  // 2) Fallback: HTML-only (reliable) - PDF still goes via WhatsApp
  try {
    const htmlOnly = await postEmailRelay({
      to: opts.to,
      subject: opts.subject,
      html: opts.html +
        `<p style="font-size:12px;color:#6b7280;margin-top:16px">Invoice PDF was also sent to your WhatsApp (if linked). File: <strong>${opts.filename}</strong></p>`,
    });
    return htmlOnly;
  } catch (e) {
    console.error("[invoice-email] html-only failed", e);
    return false;
  }
}

export async function sendInvoiceWhatsApp(opts: {
  phone: string;
  caption: string;
  pdfBytes: Uint8Array;
  filename: string;
}): Promise<boolean> {
  const gatewayUrl = (
    Deno.env.get("WHATSAPP_GATEWAY_URL") ||
    Deno.env.get("NGROK_GATEWAY_URL") ||
    ""
  ).replace(/\/+$/, "");
  const gatewayToken =
    Deno.env.get("WHATSAPP_GATEWAY_TOKEN") ||
    Deno.env.get("GATEWAY_TOKEN") ||
    "";
  if (!opts.phone || !gatewayUrl || !gatewayToken) return false;
  let digits = String(opts.phone).replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${gatewayUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: JSON.stringify({
        phone: digits,
        message: opts.caption,
        caption: opts.caption,
        pdfData: b64(opts.pdfBytes),
        filename: opts.filename,
        outletName: "RestroSuite",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("[invoice-whatsapp] HTTP", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[invoice-whatsapp]", e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Build PDF, deliver on email + WhatsApp, return delivery flags + invoice meta. */
export async function issueAndDeliverInvoice(
  input: InvoiceInput,
): Promise<{
  invoiceNumber: string;
  pdfBytes: Uint8Array;
  email: boolean;
  whatsapp: boolean;
  filename: string;
  amountSubtotal: number;
  amountTax: number;
  amountTotal: number;
}> {
  const seller = sellerFromEnv();
  const pdfBytes = await buildInvoicePdf(input, seller);
  const filename = `${input.invoiceNumber}.pdf`;
  const isTrial = input.kind === "trial" || input.amountTotal <= 0;
  const subject = isTrial
    ? `RestroSuite trial confirmation  | ${input.invoiceNumber}  | ${input.buyerSlug}`
    : `RestroSuite tax invoice  | ${input.invoiceNumber}  | ${fmtMoney(input.amountTotal)}`;
  const caption = isTrial
    ? `RestroSuite - Trial active for ${input.buyerName} (${input.buyerSlug}). PDF attached. Sign in: ${seller.website}/login`
    : `RestroSuite tax invoice ${input.invoiceNumber}  | ${input.planName}  | ${fmtMoney(input.amountTotal)}. Thank you!`;

  const email = await sendInvoiceEmail({
    to: String(input.buyerEmail || ""),
    subject,
    html: invoiceEmailHtml(input, seller),
    pdfBytes,
    filename,
  });
  const whatsapp = await sendInvoiceWhatsApp({
    phone: String(input.buyerPhone || ""),
    caption,
    pdfBytes,
    filename,
  });

  const total = Math.max(0, Number(input.amountTotal) || 0);
  const taxRate = 18;
  const amountSubtotal = isTrial
    ? 0
    : Math.round((total / (1 + taxRate / 100)) * 100) / 100;
  const amountTax = isTrial ? 0 : Math.round((total - amountSubtotal) * 100) / 100;

  return {
    invoiceNumber: input.invoiceNumber,
    pdfBytes,
    email,
    whatsapp,
    filename,
    amountSubtotal,
    amountTax,
    amountTotal: total,
  };
}
