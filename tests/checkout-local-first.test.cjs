'use strict';
/**
 * Static + behavioral checks for checkout hang / sticky-cart fixes.
 * Does not need cloud credentials.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('checkout local-first fixes', () => {
  it('db.js exposes putLocal and times out bill cloud puts', () => {
    const db = read('assets/db.js');
    assert.match(db, /putLocal\s*:\s*\(c,\s*id,\s*obj\)\s*=>\s*LS\.put/);
    assert.match(db, /Hard timeout on cloud writes/);
    assert.match(db, /c === 'bills' \|\| c === 'pending_orders'\) \? 2000/);
  });

  it('features-pos seals local then clears cart before long cloud wait', () => {
    const pos = read('assets/features-pos.js');
    assert.match(pos, /putLocal/);
    assert.match(pos, /wipeCartAfterPay/);
    // Order: local seal → wipeCartAfterPay → cloud budget race
    const iLocal = pos.indexOf("RS_DB.putLocal('bills'");
    const iWipe = pos.indexOf('wipeCartAfterPay();');
    const iBudget = pos.indexOf('setTimeout(r, 350)');
    assert.ok(iLocal > 0, 'local seal present');
    assert.ok(iWipe > iLocal, 'cart wipe after local seal');
    assert.ok(iBudget > iWipe, 'cloud budget after cart wipe');
  });

  it('pos-ui clearCart wipes persistence keys', () => {
    const ui = read('assets/modules/pos-ui.js');
    assert.match(ui, /function wipeCartPersistence/);
    assert.match(ui, /function clearCart\(\)[\s\S]*wipeCartPersistence/);
    assert.match(ui, /rs_active_cart',\s*'\[\]'/);
    assert.match(ui, /rs_tab_cart_/);
  });

  it('bill identity server allocate timeout is short', () => {
    const id = read('assets/modules/bill-identity.js');
    assert.match(id, /next_bill_no timeout'\)\),\s*1500/);
  });

  it('desktop and android mirrors include the fix', () => {
    for (const rel of [
      'desktop/app/assets/features-pos.js',
      'desktop/app/assets/db.js',
      'android-app/app/src/main/assets/assets/features-pos.js',
      'android-app/app/src/main/assets/assets/db.js',
    ]) {
      const src = read(rel);
      if (rel.endsWith('db.js')) {
        assert.match(src, /putLocal/, rel);
      } else {
        assert.match(src, /wipeCartAfterPay/, rel);
      }
    }
  });

  it('withTimeout rejects after ms (behavioral)', async () => {
    // Mirror db.js helper
    function withTimeout(promise, ms, label) {
      let timer;
      return Promise.race([
        Promise.resolve(promise).finally(() => {
          if (timer) clearTimeout(timer);
        }),
        new Promise((_, rej) => {
          timer = setTimeout(
            () => rej(new Error((label || 'sync') + ' timed out after ' + ms + 'ms')),
            ms
          );
        }),
      ]);
    }
    const slow = new Promise((r) => setTimeout(() => r('late'), 500));
    const t0 = Date.now();
    await assert.rejects(() => withTimeout(slow, 80, 'bill'), /timed out after 80ms/);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 250, 'timeout should fire quickly, got ' + elapsed + 'ms');
  });
});
