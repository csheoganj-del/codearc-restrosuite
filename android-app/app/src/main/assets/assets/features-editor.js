/* ============================================================
   RestroSuite — Menu Editor: real add / edit / delete + recipe linking
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s);
    const CATS = ['Starters','Mains','Breads','Beverages','Desserts'];
    const GST = ['5%','12%','18%'];
    let editingId = null;

    // seed a few recipes for realism
    const SEED = {
      'Paneer Tikka':[['Paneer',0.1,'kg'],['Onion',0.03,'kg'],['Garam Masala',0.005,'kg']],
      'Butter Chicken':[['Chicken',0.18,'kg'],['Butter',0.03,'kg'],['Tomato',0.08,'kg'],['Fresh Cream',0.04,'L']],
      'Veg Biryani':[['Basmati Rice',0.15,'kg'],['Onion',0.05,'kg'],['Cooking Oil',0.02,'L']],
      'Garlic Naan':[['Wheat Flour',0.12,'kg'],['Butter',0.01,'kg']]
    };
    function recipeOf(m){ if(!m.ingredients){ m.ingredients = (SEED[m.name]||[]).map(x=>({name:x[0],qty:x[1],unit:x[2]})); } return m.ingredients; }
    function invCost(name){ const i=(RS.INVENTORY||[]).find(x=>x.name===name); return i?i.cost:0; }
    function plateCost(m){ return recipeOf(m).reduce((a,g)=>a+g.qty*invCost(g.name),0); }

    /* ---------------- left form ---------------- */
    function buildForm(){
      const sec = $('#editor-tab'); if(!sec) return;
      const panel = sec.querySelector('.panel'); if(!panel || panel.dataset.built) return;
      panel.dataset.built = '1';
      panel.innerHTML = `
        <div class="panel-head"><h3 id="ed-form-title">Add new item</h3><button class="btn btn-ghost btn-sm" id="ed-reset" style="display:none"><i class="fa-solid fa-xmark"></i> Cancel edit</button></div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div><label class="fl">Item name</label><input class="form-input" id="ed-name" placeholder="e.g. Paneer Tikka"></div>
          <div class="form-grid-2">
            <div><label class="fl">Price (₹)</label><input class="form-input" id="ed-price" type="number" min="0" placeholder="199"></div>
            <div><label class="fl">Category</label><select class="form-input" id="ed-cat">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
          </div>
          <div class="form-grid-2">
            <div><label class="fl">Type</label><select class="form-input" id="ed-type"><option value="veg">Veg</option><option value="nonveg">Non-veg</option></select></div>
            <div><label class="fl">GST slab</label><select class="form-input" id="ed-gst">${GST.map(g=>`<option>${g}</option>`).join('')}</select></div>
          </div>
          <div><label class="fl">Linked ingredients (recipe)</label><div class="ing-chips" id="ed-ings"></div></div>
          <div id="ed-costline" style="font-size:12.5px;color:var(--text-mute)"></div>
          <button class="btn btn-primary btn-block" id="ed-save"><i class="fa-solid fa-circle-check"></i> Save item</button>
        </div>`;
      let draftIngs = [];
      const ingsEl = $('#ed-ings'), costEl = $('#ed-costline');
      function renderIngs(){
        ingsEl.innerHTML = draftIngs.map((g,i)=>`<span class="ing-chip">${g.name} ${g.qty}${g.unit} <button data-i="${i}"><i class="fa-solid fa-xmark"></i></button></span>`).join('')
          + `<span class="ing-chip add" id="ed-add-ing"><i class="fa-solid fa-plus" style="font-size:10px"></i> Add</span>`;
        ingsEl.querySelectorAll('[data-i]').forEach(b=> b.onclick=()=>{ draftIngs.splice(+b.dataset.i,1); renderIngs(); });
        $('#ed-add-ing').onclick = openIngPicker;
        const cost = draftIngs.reduce((a,g)=>a+g.qty*invCost(g.name),0);
        const price = +$('#ed-price').value||0;
        costEl.innerHTML = cost? `Plate cost <b style="color:var(--text)">${rs(cost)}</b>${price?` · margin <b style="color:var(--green)">${Math.round((1-cost/price)*100)}%</b>`:''}` : '';
      }
      $('#ed-price').addEventListener('input', renderIngs);
      function openIngPicker(){
        const list = RS.INVENTORY||[];
        RSModal.open({ title:'Add ingredient', sub:'Link a raw material to this recipe', icon:'fa-flask', size:'sm',
          body:`<input class="form-input" id="ing-q" placeholder="Search ingredient…" style="margin-bottom:12px">
                <div id="ing-pick" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto"></div>`,
          onMount(modal, close){
            const q = modal.querySelector('#ing-q'), box = modal.querySelector('#ing-pick');
            function draw(){ const t=(q.value||'').toLowerCase();
              box.innerHTML = list.filter(i=>i.name.toLowerCase().includes(t)).map(i=>`<div class="sr-item" data-n="${i.name}" data-u="${i.unit}"><span class="si-ic"><i class="fa-solid fa-cube"></i></span><div><div class="si-t">${i.name}</div><div class="si-s">${i.cat} · ${rs(i.cost)}/${i.unit}</div></div><span class="si-meta">+ add</span></div>`).join('') || '<div class="sr-empty">No match</div>';
              box.querySelectorAll('[data-n]').forEach(el=> el.onclick=()=>{ draftIngs.push({name:el.dataset.n, qty:0.1, unit:el.dataset.u}); close(); renderIngs(); });
            }
            q.addEventListener('input',draw); draw(); q.focus();
          }});
      }
      $('#ed-reset').onclick = resetForm;
      $('#ed-save').onclick = async ()=>{
        const name = $('#ed-name').value.trim();
        const price = +$('#ed-price').value;
        if(!name) return RS.toast('Enter an item name','fa-circle-exclamation');
        if(!price||price<=0) return RS.toast('Enter a valid price','fa-circle-exclamation');
        const data = { name, price, cat:$('#ed-cat').value, veg:$('#ed-type').value==='veg', gst:$('#ed-gst').value, ingredients:draftIngs.slice() };
        if(editingId){
          const m=RS.MENU.find(x=>String(x.id)===String(editingId));
          Object.assign(m,data);
          if (RS.saveOne) {
            const saved = await RS.saveOne('menu', m);
            if (saved) Object.assign(m, saved);
          }
          RS.toast('“'+name+'” updated','fa-circle-check');
        }
        else {
          const id=Math.max(0,...RS.MENU.map(x=>Number.isFinite(Number(x.id))?Number(x.id):0))+1;
          const rec={id, stock:'ok', ...data};
          RS.MENU.push(rec);
          if (RS.saveOne) {
            const saved = await RS.saveOne('menu', rec);
            if (saved) Object.assign(rec, saved);
          }
          RS.toast('“'+name+'” added to menu','fa-circle-plus');
        }
        resetForm(); renderList(); try{ RS.renderPOS(); }catch(e){}
      };
      // expose for edit
      buildForm._load = (m)=>{ editingId=m.id; $('#ed-form-title').textContent='Edit item'; $('#ed-reset').style.display='inline-flex';
        $('#ed-name').value=m.name; $('#ed-price').value=m.price; $('#ed-cat').value=m.cat; $('#ed-type').value=m.veg?'veg':'nonveg'; $('#ed-gst').value=m.gst||'5%';
        draftIngs = recipeOf(m).map(g=>({...g})); renderIngs(); $('#ed-name').focus(); };
      function resetForm(){ editingId=null; $('#ed-form-title').textContent='Add new item'; $('#ed-reset').style.display='none';
        $('#ed-name').value=''; $('#ed-price').value=''; $('#ed-cat').selectedIndex=0; $('#ed-type').selectedIndex=0; $('#ed-gst').selectedIndex=0; draftIngs=[]; renderIngs(); }
      renderIngs();
    }

    /* ---------------- right list ---------------- */
    function renderList(){
      const body = $('#editor-list'); if(!body) return;
      body.innerHTML = RS.MENU.map(m=>`
        <tr data-id="${m.id}">
          <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><div><b>${m.name}</b><div style="font-size:11px;color:var(--text-mute)">${m.veg?'Veg':'Non-veg'} · ${m.cat}</div></div></div></td>
          <td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td>
          <td><span class="stock-dot ${RS.stockCls[m.stock]}">${RS.stockLabel[m.stock]}</span></td>
          <td><label class="switch-mini"><input type="checkbox" data-av="${m.id}" ${m.stock!=='out'?'checked':''}><span></span></label></td>
          <td><div class="row-actions"><button class="icon-act go" data-edit="${m.id}" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="icon-act" data-recipe="${m.id}" title="Recipe & cost"><i class="fa-solid fa-flask"></i></button><button class="icon-act danger" data-del="${m.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>
        </tr>`).join('');
      const count = RS.MENU.length, cats=[...new Set(RS.MENU.map(m=>m.cat))].length;
      const sub = $('#editor-tab .ph-sub'); if(sub) sub.textContent = `${count} items · ${cats} categories`;
      body.querySelectorAll('[data-edit]').forEach(b=> b.onclick=()=>{ buildForm(); buildForm._load(RS.MENU.find(x=>String(x.id)===String(b.dataset.edit))); $('#editor-tab').scrollIntoView({block:'start'}); });
      body.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=> confirmDelete(b.dataset.del));
      body.querySelectorAll('[data-recipe]').forEach(b=> b.onclick=()=> recipeModal(b.dataset.recipe));
      body.querySelectorAll('[data-av]').forEach(c=> c.onchange=()=>{ const m=RS.MENU.find(x=>String(x.id)===String(c.dataset.av)); m.stock = c.checked?'ok':'out'; RS.saveOne&&RS.saveOne('menu',m); renderList(); try{RS.renderPOS();}catch(e){} RS.toast(m.name+(c.checked?' available':' marked sold out'), c.checked?'fa-circle-check':'fa-ban'); });
      
      const btnAll = $('#btn-enable-all-menu');
      if (btnAll) {
        if (RS.MENU.length === 0) {
          btnAll.disabled = true;
          btnAll.innerHTML = '<i class="fa-solid fa-circle-check"></i> Enable All';
          btnAll.onclick = null;
        } else {
          btnAll.disabled = false;
          const hasDisabled = RS.MENU.some(m => m.stock === 'out');
          if (hasDisabled) {
            btnAll.innerHTML = '<i class="fa-solid fa-circle-check"></i> Enable All';
            btnAll.title = 'Enable all items at once';
          } else {
            btnAll.innerHTML = '<i class="fa-solid fa-ban"></i> Disable All';
            btnAll.title = 'Disable all items at once';
          }
          btnAll.onclick = async () => {
            const actionEnable = RS.MENU.some(m => m.stock === 'out');
            const changed = [];
            for (const m of RS.MENU) {
              if (actionEnable) {
                if (m.stock === 'out') {
                  m.stock = 'ok';
                  changed.push(m);
                }
              } else {
                if (m.stock !== 'out') {
                  m.stock = 'out';
                  changed.push(m);
                }
              }
            }
            if (changed.length > 0) {
              const btnOrig = btnAll.innerHTML;
              btnAll.disabled = true;
              btnAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
              try {
                if (window.RS_DB) {
                  await RS_DB.bulkPut('menu', changed);
                } else if (RS.saveOne) {
                  for (const m of changed) {
                    await RS.saveOne('menu', m);
                  }
                }
                renderList();
                try { RS.renderPOS(); } catch (e) {}
                RS.toast(
                  actionEnable 
                    ? `${changed.length} items marked available` 
                    : `${changed.length} items marked sold out`, 
                  actionEnable ? 'fa-circle-check' : 'fa-ban'
                );
              } catch (err) {
                console.error(err);
                RS.toast('Update failed: ' + err.message, 'fa-circle-exclamation');
                btnAll.innerHTML = btnOrig;
              } finally {
                btnAll.disabled = false;
              }
            }
          };
        }
      }
    }

    function confirmDelete(id){
      const m = RS.MENU.find(x=>String(x.id)===String(id));
      RSModal.open({ title:'Delete item?', icon:'fa-trash', size:'sm',
        body:`<p style="color:var(--text-soft);font-size:14.5px">Remove <b style="color:var(--text)">${m.name}</b> from the menu? This can’t be undone.</p>`,
        foot:`<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1;background:var(--red);box-shadow:none" data-ok><i class="fa-solid fa-trash"></i> Delete</button>`,
        onMount(modal, close){ modal.querySelector('[data-x]').onclick=close; modal.querySelector('[data-ok]').onclick=()=>{ const i=RS.MENU.findIndex(x=>String(x.id)===String(id)); RS.MENU.splice(i,1); RS.removeOne&&RS.removeOne('menu',id); close(); renderList(); try{RS.renderPOS();}catch(e){} RS.toast('Item removed','fa-trash'); }; }});
    }

    function recipeModal(id){
      const m = RS.MENU.find(x=>String(x.id)===String(id)); const ings = recipeOf(m);
      const cost = plateCost(m); const margin = m.price? Math.round((1-cost/m.price)*100):0;
      RSModal.open({ title:m.name+' · recipe', sub:'Plate cost & margin', icon:'fa-flask', size:'md',
        body:`<div class="report-grid" style="--cols:1fr;gap:16px">
            <table class="data-table"><thead><tr><th>Ingredient</th><th>Qty</th><th style="text-align:right">Cost</th></tr></thead><tbody>
            ${ings.length?ings.map(g=>`<tr><td>${g.name}</td><td>${g.qty} ${g.unit}</td><td class="td-strong" style="text-align:right">${rs(g.qty*invCost(g.name))}</td></tr>`).join(''):'<tr><td colspan="3" style="color:var(--text-mute)">No ingredients linked yet. Use the Menu Editor form to add them.</td></tr>'}
            </tbody></table>
            <div style="display:flex;gap:12px">
              <div class="crm-stats" style="flex:1"><div class="cs"><div class="csv">${rs(cost)}</div><div class="csl">Plate cost</div></div><div class="cs"><div class="csv">${rs(m.price)}</div><div class="csl">Sells at</div></div><div class="cs"><div class="csv" style="color:var(--green)">${margin}%</div><div class="csl">Margin</div></div></div>
            </div></div>`,
        foot:`<button class="btn btn-ghost" style="flex:1" data-edit-r><i class="fa-solid fa-pen"></i> Edit recipe</button><button class="btn btn-primary" style="flex:1" data-x>Done</button>`,
        onMount(modal,close){ modal.querySelector('[data-x]').onclick=close; modal.querySelector('[data-edit-r]').onclick=()=>{ close(); buildForm(); buildForm._load(m); $('#editor-tab').scrollIntoView({block:'start'}); }; }});
    }

    RS.addRenderer('editor-tab', ()=>{ buildForm(); renderList(); });
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
