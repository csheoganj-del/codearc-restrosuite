/* ============================================================
   Minimal browser XLSX (Office Open XML) writer — no deps.
   Uses ZIP "store" (uncompressed) so Excel/Google Sheets open it.
   ============================================================ */
(function (global) {
  'use strict';

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;}
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);}
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  }
  function u32(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  }
  function concat(parts) {
    let len = 0;
    for (const p of parts) {len += p.length;}
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
  function strBytes(s) {
    return new TextEncoder().encode(s);
  }

  /** Build uncompressed ZIP from {name, data:Uint8Array}[] */
  function zipStore(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = strBytes(f.name);
      const data = f.data instanceof Uint8Array ? f.data : strBytes(String(f.data || ''));
      const crc = crc32(data);
      const local = concat([
        u32(0x04034b50),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        name,
        data,
      ]);
      const central = concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const centralDir = concat(centrals);
    const end = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDir.length),
      u32(offset),
      u16(0),
    ]);
    return concat([...locals, centralDir, end]);
  }

  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colName(i) {
    let n = i;
    let s = '';
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  /**
   * @param {Array<{name:string, rows:any[][], cols?:number[]}>} sheets
   * rows: array of cells — string | number | boolean | null | {v,t}
   * @returns {Uint8Array}
   */
  function buildXlsx(sheets) {
    const list = (sheets || []).filter((s) => s && s.name);
    if (!list.length) {throw new Error('xlsx: no sheets');}

    const sheetFiles = [];
    const sheetRels = [];
    list.forEach((sheet, idx) => {
      const sid = idx + 1;
      const rows = sheet.rows || [];
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      xml +=
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      if (sheet.cols && sheet.cols.length) {
        xml += '<cols>';
        sheet.cols.forEach((w, i) => {
          const width = Number(w) || 12;
          xml += `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
        });
        xml += '</cols>';
      }
      xml += '<sheetData>';
      rows.forEach((row, rIdx) => {
        const r = rIdx + 1;
        xml += `<row r="${r}">`;
        (row || []).forEach((cell, cIdx) => {
          const ref = colName(cIdx) + r;
          if (cell == null || cell === '') {
            xml += `<c r="${ref}"/>`;
            return;
          }
          let v = cell;
          if (cell && typeof cell === 'object' && 'v' in cell) {
            v = cell.v;
          }
          if (typeof v === 'number' && Number.isFinite(v)) {
            xml += `<c r="${ref}"><v>${v}</v></c>`;
          } else if (typeof v === 'boolean') {
            xml += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
          } else {
            const text = xmlEsc(String(v));
            xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
          }
        });
        xml += '</row>';
      });
      xml += '</sheetData></worksheet>';
      sheetFiles.push({ name: `xl/worksheets/sheet${sid}.xml`, data: strBytes(xml) });
      sheetRels.push(
        `<Relationship Id="rId${sid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sid}.xml"/>`
      );
    });

    let workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>';
    list.forEach((sheet, idx) => {
      const name = String(sheet.name || 'Sheet' + (idx + 1))
        .replace(/[\\/*?:[\]]/g, ' ')
        .slice(0, 31);
      workbook += `<sheet name="${xmlEsc(name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`;
    });
    workbook += '</sheets></workbook>';

    const contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      list
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '</Types>';

    const rootRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const wbRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheetRels.join('') +
      '</Relationships>';

    const files = [
      { name: '[Content_Types].xml', data: strBytes(contentTypes) },
      { name: '_rels/.rels', data: strBytes(rootRels) },
      { name: 'xl/workbook.xml', data: strBytes(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: strBytes(wbRels) },
      ...sheetFiles,
    ];
    return zipStore(files);
  }

  function downloadXlsx(bytes, filename) {
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(blob, blob.type, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.RSXlsxLite = { buildXlsx, downloadXlsx, zipStore };
})(typeof window !== 'undefined' ? window : globalThis);
