/* ============================================================
   Kitchen Link Coach — plain-language Menu ↔ Recipe ↔ Stock
   For any staff, no technical words required.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
    else if (typeof global.__toast === 'function') global.__toast(msg, icon);
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pretty(n) {
    const s = String(n || '');
    if (!/[_-]/.test(s)) return s;
    return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function menu() {
    return (global.RS && RS.MENU) || [];
  }
  function inventory() {
    return (global.RS && RS.INVENTORY) || [];
  }
  function unlinkedDishes() {
    return menu().filter((m) => !Array.isArray(m.ingredients) || !m.ingredients.length);
  }
  function linkedCount() {
    return menu().filter((m) => Array.isArray(m.ingredients) && m.ingredients.length).length;
  }
  function coverage() {
    const t = menu().length;
    if (!t) return { linked: 0, total: 0, pct: 0, missing: 0 };
    const linked = linkedCount();
    return { linked, total: t, pct: Math.round((linked / t) * 100), missing: t - linked };
  }

  function goInventoryTab(sub) {
    if (global.RS && typeof RS.activateTab === 'function') {
      RS.activateTab('inventory-tab');
    }
    setTimeout(() => {
      const sec = document.getElementById('inventory-tab');
      if (!sec) return;
      const map = {
        stock: 0,
        recipes: 1,
        suppliers: 2,
        pos: 3,
        waste: 4,
      };
      const idx = map[sub] != null ? map[sub] : 1;
      const btns = sec.querySelectorAll('.seg button');
      if (btns[idx]) btns[idx].click();
    }, 120);
  }

  /**
   * Big simple explanation modal (no data entry).
   */
  function openHowItWorks() {
    if (!global.RSModal) {
      toast('Open Inventory → Recipes to link dishes to stock', 'fa-circle-info');
      return;
    }
    const c = coverage();
    const invN = inventory().length;
    global.RSModal.open({
      title: 'How your kitchen is connected',
      sub: 'Three simple boxes — anyone can understand this',
      icon: 'fa-link',
      size: 'md',
      body: `
        <div class="klc-how">
          <div class="klc-flow">
            <div class="klc-box">
              <div class="klc-num">1</div>
              <div class="klc-ico"><i class="fa-solid fa-utensils"></i></div>
              <div class="klc-title">MENU</div>
              <div class="klc-desc">What the customer orders<br><b>${c.total}</b> dishes</div>
            </div>
            <div class="klc-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="klc-box klc-box-mid">
              <div class="klc-num">2</div>
              <div class="klc-ico"><i class="fa-solid fa-clipboard-list"></i></div>
              <div class="klc-title">RECIPE</div>
              <div class="klc-desc">“This dish uses how much stock?”<br><b>${c.linked}</b> linked · <b>${c.missing}</b> still open</div>
            </div>
            <div class="klc-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="klc-box">
              <div class="klc-num">3</div>
              <div class="klc-ico"><i class="fa-solid fa-boxes-stacked"></i></div>
              <div class="klc-title">STOCK</div>
              <div class="klc-desc">What you keep in the kitchen<br><b>${invN}</b> ingredients</div>
            </div>
          </div>
          <div class="klc-example">
            <div class="klc-ex-title">Example</div>
            <p>Customer buys <b>1× Basmati Rice</b> → Recipe says “uses 150 g rice” → Stock of rice goes down by 150 g automatically.</p>
            <p class="klc-warn"><i class="fa-solid fa-triangle-exclamation"></i> If a dish has <b>no recipe</b>, selling it does <b>not</b> change stock. That is why the list showed “No ingredients linked”.</p>
          </div>
          <ol class="klc-steps">
            <li><b>Stock</b> — add kitchen items (rice, chicken, rolls…)</li>
            <li><b>Recipe</b> — for each dish, say which stock items it uses</li>
            <li><b>Sell</b> — POS bill payment then reduces stock for you</li>
          </ol>
        </div>`,
      foot: `
        <button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>
        <button type="button" class="btn btn-primary" style="flex:1.4" data-go><i class="fa-solid fa-wand-magic-sparkles"></i> Help me link a dish</button>`,
      onMount(m, close) {
        m.querySelector('[data-x]').onclick = close;
        m.querySelector('[data-go]').onclick = () => {
          close();
          openLinkWizard();
        };
      },
    });
  }

  /**
   * Step-by-step wizard: pick dish → pick stock items + qty → save.
   */
  function openLinkWizard(startDishId) {
    if (!global.RSModal) {
      toast('Please open Inventory → Recipes', 'fa-circle-info');
      return;
    }
    if (!inventory().length) {
      global.RSModal.open({
        title: 'Add stock first',
        sub: 'You need kitchen ingredients before linking recipes',
        icon: 'fa-boxes-stacked',
        size: 'sm',
        body: `<p style="font-size:14px;line-height:1.55;color:var(--text-soft);margin:0">
          Think of <b>Stock</b> as your store room list (rice, oil, chicken…).<br><br>
          Add at least one ingredient, then come back — we will attach it to a dish.
        </p>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Later</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-stock><i class="fa-solid fa-plus"></i> Go to Stock</button>`,
        onMount(m, close) {
          m.querySelector('[data-x]').onclick = close;
          m.querySelector('[data-stock]').onclick = () => {
            close();
            goInventoryTab('stock');
            setTimeout(() => {
              const btn = document.getElementById('btn-add-ingredient');
              if (btn) btn.click();
            }, 200);
          };
        },
      });
      return;
    }
    if (!menu().length) {
      global.RSModal.open({
        title: 'Add menu dishes first',
        sub: 'You need something to sell before a recipe',
        icon: 'fa-utensils',
        size: 'sm',
        body: `<p style="font-size:14px;line-height:1.55;color:var(--text-soft);margin:0">
          <b>Menu</b> is the list of dishes customers order.<br><br>
          Add items in <b>Menu Editor</b>, then return here to say what each dish uses from stock.
        </p>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Later</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-menu>Open Menu Editor</button>`,
        onMount(m, close) {
          m.querySelector('[data-x]').onclick = close;
          m.querySelector('[data-menu]').onclick = () => {
            close();
            if (global.RS && RS.activateTab) RS.activateTab('editor-tab');
          };
        },
      });
      return;
    }

    const missing = unlinkedDishes();
    let step = 1;
    let chosen = null;
    let draft = [];

    if (startDishId) {
      chosen = menu().find((m) => String(m.id) === String(startDishId)) || null;
      if (chosen) {
        step = 2;
        draft = (chosen.ingredients || []).map((g) => ({ ...g }));
      }
    }

    function dishListHtml(filter) {
      const q = String(filter || '').toLowerCase();
      const list = (missing.length ? missing : menu()).filter((m) =>
        String(m.name || '')
          .toLowerCase()
          .includes(q)
      );
      if (!list.length) return '<div class="sr-empty" style="padding:20px">No dishes match</div>';
      return list
        .slice(0, 40)
        .map((m) => {
          const has = Array.isArray(m.ingredients) && m.ingredients.length;
          return `<button type="button" class="klc-pick" data-dish="${esc(m.id)}">
            <span class="veg ${m.veg ? '' : 'nonveg'}"></span>
            <span class="klc-pick-t">${esc(m.name)}</span>
            <span class="klc-pick-s">${has ? 'Has recipe' : 'Needs recipe'}</span>
          </button>`;
        })
        .join('');
    }

    function draftHtml() {
      if (!draft.length) {
        return `<div class="sr-empty" style="padding:16px;font-size:13.5px">No stock items yet.<br>Tap <b>Add from store room</b> below.</div>`;
      }
      return draft
        .map((g, i) => {
          return `<div class="klc-draft-row">
            <span class="klc-draft-name">${esc(pretty(g.name))}</span>
            <label class="klc-qty-lab">How much for <b>1 plate</b>?</label>
            <input type="number" class="form-input" data-qi="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:88px">
            <span class="klc-unit">${esc(g.unit || '')}</span>
            <button type="button" class="icon-act danger" data-di="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
          </div>`;
        })
        .join('');
    }

    function bodyForStep() {
      if (step === 1) {
        return `
          <div class="klc-wiz">
            <div class="klc-wiz-step">Step 1 of 3 · Pick a dish</div>
            <p class="klc-p">Which dish should reduce kitchen stock when sold?</p>
            <input class="form-input" id="klc-dish-q" placeholder="Search dish name…" style="margin-bottom:10px">
            <div id="klc-dish-list" class="klc-pick-list">${dishListHtml('')}</div>
          </div>`;
      }
      if (step === 2) {
        return `
          <div class="klc-wiz">
            <div class="klc-wiz-step">Step 2 of 3 · What goes into <b>${esc(chosen.name)}</b></div>
            <p class="klc-p">Add items from your <b>store room (stock)</b>. Example: rice 0.15 kg, oil 10 ml.</p>
            <div id="klc-draft">${draftHtml()}</div>
            <button type="button" class="btn btn-ghost btn-block" id="klc-add-ing" style="border-style:dashed;margin-top:10px">
              <i class="fa-solid fa-plus"></i> Add from store room
            </button>
          </div>`;
      }
      // step 3 confirm
      const lines = draft
        .filter((g) => Number(g.qty) > 0)
        .map((g) => `• ${pretty(g.name)} — ${g.qty} ${g.unit || ''}`)
        .join('<br>');
      return `
        <div class="klc-wiz">
          <div class="klc-wiz-step">Step 3 of 3 · Confirm</div>
          <p class="klc-p">When someone buys <b>1× ${esc(chosen.name)}</b>, stock will go down by:</p>
          <div class="klc-confirm">${lines || '<i>No quantities set</i>'}</div>
          <p class="klc-p" style="margin-top:12px">You can change this anytime under <b>Inventory → Recipes</b>.</p>
        </div>`;
    }

    function footForStep() {
      if (step === 1) {
        return `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-ghost" style="flex:1" data-how>Explain again</button>`;
      }
      if (step === 2) {
        return `<button type="button" class="btn btn-ghost" style="flex:1" data-back>Back</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-next>Next <i class="fa-solid fa-arrow-right"></i></button>`;
      }
      return `<button type="button" class="btn btn-ghost" style="flex:1" data-back>Back</button>
        <button type="button" class="btn btn-primary" style="flex:1.2" data-save><i class="fa-solid fa-circle-check"></i> Save &amp; finish</button>`;
    }

    function openPicker(onPick) {
      const list = inventory();
      global.RSModal.open({
        title: 'Pick from store room',
        sub: 'These are your Stock level items',
        icon: 'fa-boxes-stacked',
        size: 'sm',
        body: `<input class="form-input" id="klc-ing-q" placeholder="Search stock…" style="margin-bottom:10px">
          <div id="klc-ing-box" class="klc-pick-list"></div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>`,
        onMount(sm, sc) {
          sm.querySelector('[data-x]').onclick = sc;
          const q = sm.querySelector('#klc-ing-q');
          const box = sm.querySelector('#klc-ing-box');
          function draw() {
            const t = (q.value || '').toLowerCase();
            const f = list.filter(
              (i) =>
                pretty(i.name).toLowerCase().includes(t) ||
                String(i.name || '')
                  .toLowerCase()
                  .includes(t)
            );
            box.innerHTML =
              f
                .map(
                  (i) =>
                    `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'unit')}">
                  <span class="klc-pick-t">${esc(pretty(i.name))}</span>
                  <span class="klc-pick-s">stock ${Number(i.stock) || 0} ${esc(i.unit || '')}</span>
                </button>`
                )
                .join('') || '<div class="sr-empty" style="padding:16px">No stock items — add under Stock levels</div>';
            box.querySelectorAll('[data-n]').forEach((el) => {
              el.onclick = () => {
                onPick({ name: el.getAttribute('data-n'), unit: el.getAttribute('data-u') || 'unit', qty: 1 });
                sc();
              };
            });
          }
          q.addEventListener('input', draw);
          draw();
          q.focus();
        },
      });
    }

    function remount() {
      // RSModal doesn't remount easily — use one modal with live inner update via reopen
      global.RSModal.open({
        title: step === 1 ? 'Link a dish to stock' : step === 2 ? 'What does this dish use?' : 'Save recipe',
        sub: 'Simple setup · no technical words',
        icon: 'fa-wand-magic-sparkles',
        size: 'md',
        body: bodyForStep(),
        foot: footForStep(),
        onMount(modal, close) {
          const bind = (sel, fn) => {
            const el = modal.querySelector(sel);
            if (el) el.onclick = fn;
          };
          bind('[data-x]', close);
          bind('[data-how]', () => {
            close();
            openHowItWorks();
          });
          bind('[data-back]', () => {
            step = Math.max(1, step - 1);
            if (step === 1) chosen = null;
            close();
            remount();
          });
          bind('[data-next]', () => {
            if (!draft.filter((g) => Number(g.qty) > 0).length) {
              toast('Add at least one stock item with a quantity', 'fa-circle-exclamation');
              return;
            }
            step = 3;
            close();
            remount();
          });
          bind('[data-save]', async () => {
            const clean = draft.filter((g) => g.name && Number(g.qty) > 0);
            if (!clean.length || !chosen) {
              toast('Nothing to save', 'fa-circle-exclamation');
              return;
            }
            chosen.ingredients = clean.map((g) => ({
              name: g.name,
              qty: Number(g.qty) || 0,
              unit: g.unit || 'unit',
            }));
            try {
              if (global.RS && RS.saveOne) await RS.saveOne('menu', chosen);
              else if (global.RS && RS.save) await RS.save('menu');
              toast('Saved! “' + chosen.name + '” will now reduce stock when sold', 'fa-circle-check');
              close();
              document.dispatchEvent(new CustomEvent('rs:render-inventory'));
              if (global.RS && RS.render) RS.render('inventory-tab');
              goInventoryTab('recipes');
              // Offer next
              setTimeout(() => {
                const still = unlinkedDishes();
                if (still.length && global.RSModal) {
                  global.RSModal.open({
                    title: 'Great job!',
                    sub: still.length + ' dish' + (still.length === 1 ? '' : 'es') + ' still need a recipe',
                    icon: 'fa-circle-check',
                    size: 'sm',
                    body: `<p style="margin:0;font-size:14px;line-height:1.5;color:var(--text-soft)">Link another dish now, or stop and continue later from <b>Recipes → Needs recipe</b>.</p>`,
                    foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Done for now</button>
                      <button type="button" class="btn btn-primary" style="flex:1.2" data-more>Link another</button>`,
                    onMount(mm, cc) {
                      mm.querySelector('[data-x]').onclick = cc;
                      mm.querySelector('[data-more]').onclick = () => {
                        cc();
                        openLinkWizard();
                      };
                    },
                  });
                }
              }, 400);
            } catch (e) {
              console.warn(e);
              toast('Could not save — try again', 'fa-circle-exclamation');
            }
          });

          if (step === 1) {
            const list = modal.querySelector('#klc-dish-list');
            const q = modal.querySelector('#klc-dish-q');
            const wirePicks = () => {
              list.querySelectorAll('[data-dish]').forEach((btn) => {
                btn.onclick = () => {
                  chosen = menu().find((m) => String(m.id) === String(btn.getAttribute('data-dish')));
                  if (!chosen) return;
                  draft = (chosen.ingredients || []).map((g) => ({ ...g }));
                  step = 2;
                  close();
                  remount();
                };
              });
            };
            if (q) {
              q.oninput = () => {
                list.innerHTML = dishListHtml(q.value);
                wirePicks();
              };
            }
            wirePicks();
          }
          if (step === 2) {
            const draftEl = modal.querySelector('#klc-draft');
            const refreshDraft = () => {
              draftEl.innerHTML = draftHtml();
              draftEl.querySelectorAll('[data-qi]').forEach((inp) => {
                inp.oninput = () => {
                  const i = +inp.getAttribute('data-qi');
                  draft[i].qty = Number(inp.value) || 0;
                };
              });
              draftEl.querySelectorAll('[data-di]').forEach((btn) => {
                btn.onclick = () => {
                  draft.splice(+btn.getAttribute('data-di'), 1);
                  refreshDraft();
                };
              });
            };
            refreshDraft();
            const addBtn = modal.querySelector('#klc-add-ing');
            if (addBtn)
              addBtn.onclick = () => {
                openPicker((item) => {
                  if (!draft.find((g) => g.name === item.name)) draft.push(item);
                  // reopen step 2 to refresh — close parent was not closed
                  // parent modal still open; need to refresh draft in place
                  // openPicker closes only sub - parent still there but draftEl may be stale if nested
                  // remount parent
                  close();
                  remount();
                });
              };
          }
        },
      });
    }

    remount();
  }

  /**
   * Sticky coach card HTML for Recipes header area.
   */
  function coachCardHtml() {
    const c = coverage();
    const invN = inventory().length;
    const done = c.total > 0 && c.missing === 0 && invN > 0;
    if (done) {
      return `<div class="klc-card klc-card-ok" id="klc-coach-card">
        <div class="klc-card-top">
          <i class="fa-solid fa-circle-check"></i>
          <div>
            <div class="klc-card-title">Kitchen link is ready</div>
            <div class="klc-card-sub">All ${c.total} dishes have recipes · stock will move when you sell</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="klc-how">How it works</button>
        </div>
      </div>`;
    }
    return `<div class="klc-card" id="klc-coach-card">
      <div class="klc-card-top">
        <i class="fa-solid fa-link"></i>
        <div style="flex:1;min-width:0">
          <div class="klc-card-title">Connect Menu + Stock (for everyone)</div>
          <div class="klc-card-sub">
            <b>${c.linked}</b> of <b>${c.total}</b> dishes linked
            ${invN ? '' : ' · <span style="color:var(--amber)">add stock first</span>'}
            ${c.missing ? ' · <b>' + c.missing + '</b> still need a recipe' : ''}
          </div>
        </div>
      </div>
      <div class="klc-mini-flow">
        <span><i class="fa-solid fa-utensils"></i> Menu = sell</span>
        <i class="fa-solid fa-arrow-right"></i>
        <span><i class="fa-solid fa-clipboard-list"></i> Recipe = link</span>
        <i class="fa-solid fa-arrow-right"></i>
        <span><i class="fa-solid fa-boxes-stacked"></i> Stock = store room</span>
      </div>
      <div class="klc-card-actions">
        <button type="button" class="btn btn-primary btn-sm" id="klc-start"><i class="fa-solid fa-wand-magic-sparkles"></i> Help me link a dish</button>
        <button type="button" class="btn btn-ghost btn-sm" id="klc-how">Show me simply</button>
        ${!invN ? '<button type="button" class="btn btn-ghost btn-sm" id="klc-stock"><i class="fa-solid fa-plus"></i> Add stock first</button>' : ''}
      </div>
    </div>`;
  }

  function wireCoachCard(root) {
    const host = root || document;
    const start = host.querySelector('#klc-start');
    const how = host.querySelector('#klc-how');
    const stock = host.querySelector('#klc-stock');
    if (start) start.onclick = () => openLinkWizard();
    if (how) how.onclick = () => openHowItWorks();
    if (stock)
      stock.onclick = () => {
        goInventoryTab('stock');
        setTimeout(() => {
          const b = document.getElementById('btn-add-ingredient');
          if (b) b.click();
        }, 200);
      };
  }

  global.RSKitchenLinkCoach = {
    openHowItWorks,
    openLinkWizard,
    coachCardHtml,
    wireCoachCard,
    coverage,
    goInventoryTab,
  };
})(typeof window !== 'undefined' ? window : globalThis);
