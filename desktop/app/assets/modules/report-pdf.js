/* ============================================================
   RestroSuite — Generic report PDF builder (jsPDF)
   Owner sales / stock / P&L · payslips · commission statements
   ============================================================ */
(function (global) {
  'use strict';

  function loadJsPdf() {
    return new Promise(function (resolve, reject) {
      if (global.jspdf && global.jspdf.jsPDF) { resolve(global.jspdf.jsPDF); return; }
      if (global.jsPDF) { resolve(global.jsPDF); return; }
      const existing = document.querySelector('script[data-rs-jspdf="1"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve((global.jspdf && global.jspdf.jsPDF) || global.jsPDF);
        });
        existing.addEventListener('error', reject);
        return;
      }
      const s = document.createElement('script');
      s.src = 'assets/lib/jspdf.umd.min.js';
      s.dataset.rsJspdf = '1';
      s.onload = function () {
        resolve((global.jspdf && global.jspdf.jsPDF) || global.jsPDF);
      };
      s.onerror = function () {
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = function () {
          resolve((global.jspdf && global.jspdf.jsPDF) || global.jsPDF);
        };
        s.onerror = reject;
      };
      document.head.appendChild(s);
    });
  }

  function money(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return 'Rs ' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  /**
   * buildReportPdf({ title, subtitle, lines: string[], sections: [{heading, rows: [[c1,c2]]}], footer })
   * returns dataUri string
   */
  async function buildReportPdf(opts) {
    opts = opts || {};
    const JsPDF = await loadJsPdf();
    if (!JsPDF) {throw new Error('jsPDF unavailable');}
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    let y = 18;
    const margin = 16;
    const pageW = doc.internal.pageSize.getWidth();
    const maxY = doc.internal.pageSize.getHeight() - 16;

    function ensureSpace(need) {
      if (y + need > maxY) {
        doc.addPage();
        y = 18;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 79, 0);
    doc.text(String(opts.brand || 'RestroSuite'), margin, y);
    y += 8;
    doc.setTextColor(22, 21, 28);
    doc.setFontSize(14);
    doc.text(String(opts.title || 'Report'), margin, y);
    y += 6;
    if (opts.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 110);
      doc.text(String(opts.subtitle), margin, y);
      y += 7;
    }
    doc.setDrawColor(255, 79, 0);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
    doc.setTextColor(22, 21, 28);

    (opts.lines || []).forEach(function (line) {
      ensureSpace(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const parts = doc.splitTextToSize(String(line), pageW - margin * 2);
      parts.forEach(function (p) {
        ensureSpace(5.5);
        doc.text(p, margin, y);
        y += 5.5;
      });
    });

    (opts.sections || []).forEach(function (sec) {
      ensureSpace(12);
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 79, 0);
      doc.text(String(sec.heading || ''), margin, y);
      y += 6;
      doc.setTextColor(22, 21, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      (sec.rows || []).forEach(function (row) {
        ensureSpace(5.5);
        const left = String(row[0] != null ? row[0] : '');
        const right = String(row[1] != null ? row[1] : '');
        doc.text(left, margin, y);
        if (right) {doc.text(right, pageW - margin, y, { align: 'right' });}
        y += 5.5;
      });
    });

    if (opts.footer) {
      ensureSpace(12);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 130);
      doc.text(String(opts.footer), margin, y);
    }

    const dataUri = doc.output('datauristring');
    return dataUri;
  }

  async function sendReportWhatsApp(phone, caption, dataUri, filename) {
    phone = String(phone || '').replace(/\D/g, '');
    if (phone.length < 10) {throw new Error('Invalid phone');}
    const base64 = String(dataUri || '').includes(',')
      ? String(dataUri).split(',')[1]
      : String(dataUri || '');
    if (!base64 || base64.length < 50) {throw new Error('Empty PDF');}

    if (global.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode) {
      await RS_API.data({
        operation: 'gateway_send',
        phone: phone,
        message: caption || 'RestroSuite report',
        caption: caption || 'RestroSuite report',
        pdfData: base64,
        filename: filename || 'restrosuite-report.pdf',
      });
      return { mode: 'pdf' };
    }
    // Fallback: open caption in wa.me (PDF cannot attach without gateway)
    const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(caption || 'Report ready');
    window.open(url, '_blank', 'noopener,noreferrer');
    return { mode: 'wa.me', warning: 'Gateway offline — opened chat without PDF' };
  }

  global.RSReportPdf = {
    buildReportPdf: buildReportPdf,
    sendReportWhatsApp: sendReportWhatsApp,
    money: money,
    loadJsPdf: loadJsPdf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
