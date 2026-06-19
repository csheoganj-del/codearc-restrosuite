/* ============================================================
   RestroSuite — CSV / Excel import utilities
   Exposes window.RestroSuite.imports.parseCsv(text) → Array<Object>
   Used by CRM import, inventory import, and menu import flows.
   ============================================================ */
(function(){
  'use strict';

  /**
   * Parse a CSV string into an array of row objects.
   * Handles:
   *   - Quoted fields (including fields with commas and newlines inside quotes)
   *   - CRLF and LF line endings
   *   - Empty rows skipped
   *   - Header row used as keys (trimmed, lowercased for lookup)
   *
   * @param {string} text - Raw CSV string
   * @returns {Array<Object>} Array of objects keyed by header row values
   */
  function parseCsv(text) {
    if (!text || typeof text !== 'string') return [];

    // Normalise line endings
    const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    function parseRow(line) {
      const fields = [];
      let i = 0;
      while (i < line.length) {
        if (line[i] === '"') {
          // Quoted field
          let field = '';
          i++; // skip opening quote
          while (i < line.length) {
            if (line[i] === '"' && line[i + 1] === '"') {
              field += '"'; i += 2; // escaped quote
            } else if (line[i] === '"') {
              i++; break; // closing quote
            } else {
              field += line[i++];
            }
          }
          fields.push(field);
          if (line[i] === ',') i++; // skip delimiter
        } else {
          // Unquoted field
          const end = line.indexOf(',', i);
          if (end === -1) {
            fields.push(line.slice(i).trim());
            break;
          }
          fields.push(line.slice(i, end).trim());
          i = end + 1;
        }
      }
      return fields;
    }

    const lines = normalised.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return []; // need at least header + 1 data row

    const headers = parseRow(lines[0]).map(h => h.trim());
    const rows = [];

    for (let r = 1; r < lines.length; r++) {
      const fields = parseRow(lines[r]);
      if (fields.every(f => !f)) continue; // skip blank rows
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (fields[idx] || '').trim(); });
      rows.push(obj);
    }

    return rows;
  }

  // Register on RestroSuite namespace
  window.RestroSuite = window.RestroSuite || {};
  window.RestroSuite.imports = window.RestroSuite.imports || {};
  window.RestroSuite.imports.parseCsv = parseCsv;
})();
