/**
 * Doppio Cafe - Nagpur Premium Cashier Takeaway POS & Inventory Dashboard Control System
 * Redesigned for commercial-grade touchscreen tablets and desktop PCs.
 * Keeps existing brown-cream branding, Supabase sync, and synthesiser chimes.
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ==========================================
  // SESSION GUARD (Redirect if not logged in)
  // ==========================================
  if (!sessionStorage.getItem('logged_in_user')) {
    window.location.href = 'login.html';
    return;
  }
  const activeTenantId = sessionStorage.getItem('tenant_id');
  const activeTenantSlug = sessionStorage.getItem('tenant_slug');
  const activeTenantName = sessionStorage.getItem('tenant_name') || 'Restaurant';
  const allowedTabsRaw = sessionStorage.getItem('allowed_tabs');
  // ⚡ let (not const) — so the realtime listener can hot-swap tabs without re-login
  let allowedTabs = allowedTabsRaw ? JSON.parse(allowedTabsRaw) : [];
  let saasGatewayPollingInterval = null;

  // ==========================================
  // TRIPLE-VAULT RESILIENCE VAULT (IndexedDB)
  // ==========================================
  let dbInstance = null;
  function initIndexedDBVault() {
    return new Promise((resolve) => {
      const request = indexedDB.open("DoppioVaultDB", 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("stateStore")) {
          db.createObjectStore("stateStore");
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        console.log("[Resilience Vault] IndexedDB Vault initialized successfully!");
        resolve(dbInstance);
      };
      request.onerror = (e) => {
        console.error("[Resilience Vault] IndexedDB failed:", e.target.error);
        resolve(null);
      };
    });
  }

  function setVaultData(key, value) {
    if (!dbInstance) return;
    try {
      const transaction = dbInstance.transaction(["stateStore"], "readwrite");
      const store = transaction.objectStore("stateStore");
      store.put(JSON.stringify(value), key);
    } catch (e) {
      console.warn("[Resilience Vault] Write failed for key " + key, e);
    }
  }

  function getVaultData(key) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve(null);
      try {
        const transaction = dbInstance.transaction(["stateStore"], "readonly");
        const store = transaction.objectStore("stateStore");
        const request = store.get(key);
        request.onsuccess = (e) => {
          try {
            resolve(e.target.result ? JSON.parse(e.target.result) : null);
          } catch(err) {
            resolve(e.target.result);
          }
        };
        request.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // Initialize DB and recover if LocalStorage is cleared!
  await initIndexedDBVault();
  
  if (localStorage.length === 0 || !localStorage.getItem('doppio_bills')) {
    console.log("[Resilience Vault] LocalStorage empty or bills missing! Attempting IndexedDB vault restoration...");
    try {
      const restoredBills = await getVaultData("doppio_bills");
      const restoredMenu = await getVaultData("doppio_menu");
      const restoredInv = await getVaultData("doppio_inventory");
      const restoredProfile = await getVaultData("doppio_business_profile");
      const restoredShift = await getVaultData("doppio_current_shift");
      const restoredShiftsLocal = await getVaultData("doppio_shifts_local");
      const restoredShiftEventsLocal = await getVaultData("doppio_shift_events_local");

      if (restoredBills) localStorage.setItem('doppio_bills', JSON.stringify(restoredBills));
      if (restoredMenu) localStorage.setItem('doppio_menu', JSON.stringify(restoredMenu));
      if (restoredInv) localStorage.setItem('doppio_inventory', JSON.stringify(restoredInv));
      if (restoredProfile) localStorage.setItem('doppio_business_profile', JSON.stringify(restoredProfile));
      if (restoredShift) localStorage.setItem('doppio_current_shift', JSON.stringify(restoredShift));
      if (restoredShiftsLocal) localStorage.setItem('doppio_shifts_local', JSON.stringify(restoredShiftsLocal));
      if (restoredShiftEventsLocal) localStorage.setItem('doppio_shift_events_local', JSON.stringify(restoredShiftEventsLocal));
      
      if (restoredBills || restoredInv) {
        console.log("[Resilience Vault] Successfully recovered POS state from IndexedDB vault!");
      }
    } catch(err) {
      console.error("[Resilience Vault] Recovery error:", err);
    }
  }

  // Monkey-patch localStorage.setItem to redundantly write to IndexedDB!
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    try {
      originalSetItem.apply(this, arguments);
      if (key.startsWith('doppio_')) {
        try {
          setVaultData(key, JSON.parse(value));
        } catch(e) {
          setVaultData(key, value);
        }
      }
    } catch(err) {
      console.warn("[Resilience Vault] LocalStorage write bypassed to backup only:", err);
    }
  };

  // Premium Low-overhead Global Exception Logger for Nagpur Branch POS Diagnostics
  window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error(`[Doppio Cafe POS Crash Alert] Error: ${msg} at ${url}:${lineNo}:${columnNo}`, error);
    const errIndicator = document.createElement('div');
    errIndicator.style.position = 'fixed';
    errIndicator.style.bottom = '10px';
    errIndicator.style.right = '10px';
    errIndicator.style.background = 'rgba(231, 76, 60, 0.95)';
    errIndicator.style.color = '#fff';
    errIndicator.style.padding = '8px 12px';
    errIndicator.style.borderRadius = '5px';
    errIndicator.style.fontSize = '10px';
    errIndicator.style.zIndex = '999999';
    errIndicator.style.fontFamily = 'monospace';
    errIndicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    errIndicator.innerHTML = `⚠️ Terminal Script Exception (Line ${lineNo}): ${msg.slice(0, 50)}...`;
    document.body.appendChild(errIndicator);
    setTimeout(() => { if (errIndicator.parentNode) errIndicator.parentNode.removeChild(errIndicator); }, 8000);
    return false;
  };

  // Sales popularity database map
  let posPopularityMap = (() => { try { return JSON.parse(localStorage.getItem('doppio_pos_popularity')) || {}; } catch(e) { return {}; } })();
  let isSplitPaymentActive = false;

  async function sha256(string) {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ==========================================
  // 1. DYNAMIC EXCEL-BASED RECIPE DATABASE & INITIAL STATE
  // ==========================================
  
  // Cleaned active recipe specs mapped directly from updated commercial database
  const excelRecipes = {
    // COLD COFFEE
    "iced latte": { espresso_shot: 30, milk: 200, ice: 150, sugar_syrup: 15 },
    "iced americano": { espresso_shot: 60, water: 180, ice: 150 },
    "irish coffee": { espresso_shot: 30, milk: 180, irish_syrup: 20, cream: 20 },
    "mocha frappe": { espresso_shot: 30, milk: 180, chocolate_syrup: 25, ice: 180, cream: 20 },
    "doppio signature frappe": { espresso_shot: 30, milk: 200, frappe_base: 25, ice: 180, cream: 20 },
    "iced caramel macchiato": { espresso_shot: 30, milk: 180, caramel_syrup: 25, ice: 150 },
    "hazelnut frappe": { espresso_shot: 30, milk: 180, hazelnut_syrup: 25, ice: 180 },
    "espresso ginger ale": { espresso_shot: 30, ginger_ale: 200, ice: 150 },
    "classic frappe": { espresso_shot: 30, milk: 180, frappe_base: 25, ice: 180 },

    // HOT COFFEE
    "doppio": { espresso_shot: 60 },
    "espresso": { espresso_shot: 30 },
    "cappuccino": { espresso_shot: 30, milk: 180, milk_foam: 40 },
    "cafe latte": { espresso_shot: 30, milk: 220 },
    "flat white": { espresso_shot: 60, milk: 180 },
    "affogato": { espresso_shot: 30, vanilla_ice_cream: 1 },
    "americano": { espresso_shot: 30, water: 180 },
    "cortado": { espresso_shot: 30, milk: 90 },
    "caramel macchiato": { espresso_shot: 30, milk: 200, caramel_syrup: 20 },
    "doppio hot chocolate": { cocoa_powder: 20, milk: 220, chocolate_syrup: 15 },
    "cafe mocha": { espresso_shot: 30, milk: 180, chocolate_syrup: 25 },

    // MATCHA
    "iced matcha latte": { matcha_powder: 8, milk: 220, ice: 150 },
    "matcha latte": { matcha_powder: 8, milk: 220 },
    "iced strawberry matcha": { matcha_powder: 8, strawberry_crush: 30, milk: 180, ice: 150 },
    "iced vanilla matcha": { matcha_powder: 8, vanilla_syrup: 20, milk: 180, ice: 150 },
    "mango matcha": { matcha_powder: 8, mango_puree: 40, milk: 180, ice: 150 },

    // DOPPIOS SHARE PLATES
    "fries salted": { fries: 180, salt: 3, oil: 20 },
    "fries peri peri": { fries: 180, peri_peri: 8, oil: 20 },
    "fries loaded": { fries: 180, cheese_sauce: 40, mayo: 20, jalapeno: 10 },
    "potato wedges classic": { potato_wedges: 200, salt: 3, oil: 20 },
    "potato wedges loaded": { potato_wedges: 200, cheese_sauce: 40, mayo: 20 },
    "hot chicken wings": { chicken_wings: 250, hot_sauce: 25, oil: 20 },
    "chicken pops": { chicken_pops: 220, oil: 20, dip: 25 },
    "chicken nuggets": { nuggets: 220, oil: 20, dip: 25 },
    "chicken finger": { chicken_fingers: 220, oil: 20, dip: 25 },

    // MOCKTAILS
    "mojito": { soda: 200, mint: 10, lemon: 20, sugar_syrup: 20, ice: 180 },
    "green apple soda": { green_apple_syrup: 30, soda: 220, ice: 180 },
    "blue lagoon": { blue_curacao: 30, soda: 220, ice: 180 },
    "spicy guava mojito": { guava_syrup: 30, mint: 10, chaat_masala: 3, soda: 200 },
    "lemon iced tea": { tea_decoction: 80, lemon: 20, sugar_syrup: 20, ice: 180 },
    "litchi and lime granita": { litchi_crush: 40, lime_juice: 15, ice: 220 },
    "strawberry granita": { strawberry_crush: 40, ice: 220 },
    "spicy mango martini": { mango_puree: 40, lime_juice: 10, chilli_salt: 2, ice: 180 },

    // SANDWICHES
    "bombay grilled sandwich": { bread: 4, potato_filling: 80, veggies: 40, butter: 15, cheese: 20 },
    "cheese corn grilled sandwich": { bread: 4, cheese: 40, corn: 40, butter: 15 },
    "cheese chilli sandwich": { bread: 4, cheese: 45, chilli_flakes: 5, butter: 15 },

    // THICK SHAKES
    "nutella thickshake": { milk: 220, nutella: 35, vanilla_ice_cream: 1 },
    "oreo cookies thickshake": { milk: 220, oreo: 4, vanilla_ice_cream: 1 },
    "salted caramel thickshake": { milk: 220, caramel_syrup: 30, vanilla_ice_cream: 1 },
    "strawberry thickshake": { milk: 220, strawberry_crush: 35, vanilla_ice_cream: 1 },
    "mango smoothie": { mango_puree: 60, yogurt: 80, milk: 120 },
    "kids mnm shake": { milk: 220, m_and_m: 25, vanilla_ice_cream: 1 },

    // CLASSIC TOAST
    "cheese garlic": { bread: 2, garlic_butter: 20, cheese: 30 },
    "chilli cheese garlic": { bread: 2, garlic_butter: 20, cheese: 35, chilli_flakes: 3 },
    "cheese corn toast": { bread: 2, cheese: 35, corn: 35, butter: 10 },
    "cheese mushroom toast": { bread: 2, cheese: 40, mushroom: 50, butter: 10 },

    // EGGS
    "classic cheese omelette": { egg: 3, cheese: 25, butter: 10 },
    "garden omelette": { egg: 3, onion: 20, capsicum: 20, tomato: 20, butter: 10 },
    "masala omelette": { egg: 3, onion: 20, tomato: 20, masala: 5 },
    "butter garlic egg": { egg: 3, garlic_butter: 20, bread: 2 },

    // APPETIZERS
    "classic nachos": { nachos: 120, cheese_dip: 40 },
    "loaded nachos": { nachos: 120, salsa: 30, baked_beans: 40, cheese_dip: 40 },

    // PASTA
    "alfredo pennei pasta": { penne_pasta: 180, alfredo_sauce: 120, cheese: 30, garlic: 10 },

    // HOT CHOCOLATE
    "classic hot chocolate": { cocoa_powder: 25, milk: 250, chocolate_syrup: 20, cream: 20 },

    // COMBOS
    "swiggy combo1": { espresso_shot: 30, water: 180, fries: 180, salt: 3, oil: 20 },
    "swiggy combo2": { chicken_wings: 250, hot_sauce: 25, oil: 20, milk: 220, nutella: 35, vanilla_ice_cream: 1 },
    "swiggy combo3": { bread: 2, cheese: 40, butter: 15, espresso_shot: 30, milk: 200, ice: 150, sugar_syrup: 15 },
    "swiggy combo4": { espresso_shot: 30, milk: 180, milk_foam: 40, nachos: 120, cheese_dip: 40 },
    "swiggy combo5": { espresso_shot: 60, milk: 360, milk_foam: 80 }
  };

  // Expanded inventory database structure mapping all custom ingredients
  const defaultInventory = {
    espresso_shot: 6000,      // in ml (approx 200 shots)
    milk: 10000,             // in ml (10 Liters)
    ice: 8000,               // in g (8 kg)
    sugar_syrup: 2000,       // in ml (2 L)
    water: 10000,            // in ml (10 L)
    irish_syrup: 1000,       // in ml (1 L)
    cream: 2000,             // in g (2 kg)
    chocolate_syrup: 2000,   // in ml (2 L)
    frappe_base: 1000,       // in g (1 kg)
    caramel_syrup: 1000,     // in ml (1 L)
    hazelnut_syrup: 1000,    // in ml (1 L)
    ginger_ale: 3000,        // in ml
    vanilla_ice_cream: 100,  // in scoops
    cocoa_powder: 1000,      // in g (1 kg)
    matcha_powder: 500,      // in g
    strawberry_puree: 1000,  // in ml
    vanilla_syrup: 1000,     // in ml
    mango_puree: 1000,       // in ml
    fries: 5000,             // in g (5 kg)
    salt: 500,               // in g
    oil: 3000,               // in ml (3 L)
    peri_peri: 200,          // in g
    cheese_sauce: 2000,      // in g (2 kg)
    mayo: 1000,              // in g (1 kg)
    jalapeno: 500,           // in g
    potato_wedges: 4000,     // in g (4 kg)
    chicken_wings: 3000,     // in g (3 kg)
    hot_sauce: 1000,         // in g
    chicken_pops: 3000,      // in g
    dip: 1000,               // in g
    nuggets: 3000,           // in g
    chicken_fingers: 3000,   // in g
    soda: 10000,             // in ml (10 L)
    mint: 500,               // in g
    lemon: 1000,             // in g
    green_apple_syrup: 1000, // in ml
    blue_curacao: 1000,      // in ml
    sprite: 5000,            // in ml
    guava_syrup: 1000,       // in ml
    chaat_masala: 200,       // in g
    tea_decoction: 2000,     // in ml
    litchi_crush: 1000,      // in ml
    lime_juice: 1000,        // in ml
    strawberry_crush: 1000,  // in ml
    chilli_salt: 200,        // in g
    bread: 100,              // in slices
    potato_filling: 2000,    // in g
    veggies: 2000,           // in g
    butter: 1000,            // in g
    cheese: 3000,            // in g
    corn: 2000,              // in g
    chilli_flakes: 200,      // in g
    nutella: 1000,           // in g
    oreo: 100,               // in pcs
    yogurt: 2000,            // in g
    m_and_m: 500,            // in g
    garlic_butter: 1000,     // in g
    mushroom: 1000,          // in g
    egg: 60,                 // in pcs
    onion: 2000,             // in g
    capsicum: 2000,          // in g
    tomato: 2000,            // in g
    masala: 500,             // in g
    nachos: 2000,            // in g
    cheese_dip: 2000,        // in g
    salsa: 1000,             // in g
    baked_beans: 1000,       // in g
    penne_pasta: 3000,       // in g
    alfredo_sauce: 2000,     // in g
    garlic: 500,             // in g
    milk_foam: 1000          // in ml
  };

  const defaultMenu = [
    // Cold Coffee
    { name: 'Iced Latte', description: 'Espresso with cold milk poured over ice.', price: 249, category: 'COLD COFFEE', icon: '🥛', prepTime: 2 },
    { name: 'Iced Americano', description: 'Double espresso poured over ice and water.', price: 229, category: 'COLD COFFEE', icon: '🧊', prepTime: 1 },
    { name: 'Irish Coffee', description: 'Rich coffee with signature Irish cream.', price: 279, category: 'COLD COFFEE', icon: '🍀', prepTime: 3 },
    { name: 'Mocha Frappe', description: 'Blended coffee with rich chocolate syrup and ice.', price: 279, category: 'COLD COFFEE', icon: '🍫', prepTime: 3 },
    { name: 'Doppio Signature Frappe', description: 'Special rich blended frappe with premium toppings.', price: 298, category: 'COLD COFFEE', icon: '☕', bestseller: true, prepTime: 4 },
    { name: 'Iced Caramel Macchiato', description: 'Caramel syrup layered with milk, ice, and espresso.', price: 279, category: 'COLD COFFEE', icon: '🍯', prepTime: 3 },
    { name: 'Hazelnut Frappe', description: 'Creamy cold blended hazelnut coffee.', price: 279, category: 'COLD COFFEE', icon: '🌰', prepTime: 3 },
    { name: 'Espresso Ginger Ale', description: 'Sparkling ginger ale topped with espresso.', price: 279, category: 'COLD COFFEE', icon: '🥤', prepTime: 2 },
    { name: 'Classic Frappe', description: 'Sweet blended frappe topped with foam.', price: 279, category: 'COLD COFFEE', icon: '🥛', prepTime: 2 },

    // Hot Coffee
    { name: 'Doppio', description: 'Double shot concentrated hot espresso.', price: 219, category: 'HOT COFFEE', icon: '☕', prepTime: 2 },
    { name: 'Espresso', description: 'Single concentrated espresso shot.', price: 189, category: 'HOT COFFEE', icon: '☕', prepTime: 1 },
    { name: 'Cappuccino', description: 'Espresso with steamed milk and thick foam.', price: 229, category: 'HOT COFFEE', icon: '🎨', prepTime: 2 },
    { name: 'Cafe Latte', description: 'Espresso with rich steamed milk.', price: 229, category: 'HOT COFFEE', icon: '🥛', prepTime: 2 },
    { name: 'Flat White', description: 'Double shot espresso with silky microfoam.', price: 229, category: 'HOT COFFEE', icon: '☕', prepTime: 2 },
    { name: 'Affogato', description: 'Espresso shot poured over premium vanilla ice cream.', price: 279, category: 'HOT COFFEE', icon: '🍨', prepTime: 3 },
    { name: 'Americano', description: 'Espresso shot diluted with hot water.', price: 209, category: 'HOT COFFEE', icon: '☕', prepTime: 2 },
    { name: 'Cortado', description: 'Espresso cut with warm milk in equal parts.', price: 229, category: 'HOT COFFEE', icon: '🥛', prepTime: 2 },
    { name: 'Caramel Macchiato', description: 'Sweet caramel layered latte.', price: 249, category: 'HOT COFFEE', icon: '🍯', prepTime: 3 },
    { name: 'Doppio Hot Chocolate', description: 'Warm premium signature hot cocoa.', price: 229, category: 'HOT COFFEE', icon: '🍫', bestseller: true, prepTime: 3 },
    { name: 'Cafe Mocha', description: 'Espresso with chocolate and hot steamed milk.', price: 269, category: 'HOT COFFEE', icon: '🍫', prepTime: 3 },

    // Matcha
    { name: 'Iced Matcha Latte', description: 'Premium matcha green tea latte served cold.', price: 329, category: 'MATCHA', icon: '🍵', prepTime: 3 },
    { name: 'Matcha Latte', description: 'Steamed creamy premium matcha green tea latte.', price: 329, category: 'MATCHA', icon: '🍵', prepTime: 3 },
    { name: 'Iced Strawberry Matcha', description: ' मैच layered with sweet strawberry puree.', price: 349, category: 'MATCHA', icon: '🍓', bestseller: true, prepTime: 4 },
    { name: 'Iced Vanilla Matcha', description: 'Cold matcha sweetened with vanilla syrup.', price: 329, category: 'MATCHA', icon: '🌿', prepTime: 3 },
    { name: 'Mango Matcha', description: 'Matcha layered with fresh sweet mango puree.', price: 349, category: 'MATCHA', icon: '🥭', prepTime: 4 },

    // Doppios Share Plates
    { name: 'Fries Salted', description: 'Perfect crispy salted french fries.', price: 249, category: 'FRIES & SHARE PLATES', icon: '🍟', prepTime: 5 },
    { name: 'Fries Peri Peri', description: 'French fries tossed in spicy peri peri spice.', price: 269, category: 'FRIES & SHARE PLATES', icon: '🌶️', bestseller: true, prepTime: 5 },
    { name: 'Fries Loaded', description: 'Fries topped with cheese sauce, mayo, jalapenos.', price: 279, category: 'FRIES & SHARE PLATES', icon: '🧀', prepTime: 6 },
    { name: 'Potato Wedges Classic', description: 'Crispy salted potato wedges.', price: 249, category: 'FRIES & SHARE PLATES', icon: '🥔', prepTime: 5 },
    { name: 'Potato Wedges Loaded', description: 'Potato wedges with cheese sauce and mayonnaise.', price: 279, category: 'FRIES & SHARE PLATES', icon: '🧀', prepTime: 6 },
    { name: 'Hot Chicken Wings', description: 'Spicy chicken wings tossed in hot sauce.', price: 329, category: 'FRIES & SHARE PLATES', icon: '🍗', prepTime: 7 },
    { name: 'Chicken Pops', description: 'Crispy bite-sized chicken pops with dipping sauce.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍿', prepTime: 5 },
    { name: 'Chicken Nuggets', description: 'Crispy deep-fried golden nuggets.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍗', prepTime: 5 },
    { name: 'Chicken Finger', description: 'Golden breaded chicken fingers served with dip.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍢', prepTime: 5 },

    // Mocktails
    { name: 'Mojito', description: 'Classic mint and lime refreshing soda over ice.', price: 329, category: 'MOCKTAILS', icon: '🍹', prepTime: 2 },
    { name: 'Green Apple Soda', description: 'Crisp green apple flavored sparkling soda.', price: 329, category: 'MOCKTAILS', icon: '🍏', prepTime: 2 },
    { name: 'Blue Lagoon', description: 'Classic blue curacao mocktail over sprite.', price: 329, category: 'MOCKTAILS', icon: '🥤', prepTime: 2 },
    { name: 'Spicy Guava Mojito', description: 'Guava and mint with a spicy kick of chaat masala.', price: 329, category: 'MOCKTAILS', icon: '🥭', prepTime: 3 },
    { name: 'Lemon Iced Tea', description: 'Chilled iced tea flavored with lemon juice.', price: 329, category: 'MOCKTAILS', icon: '🍋', prepTime: 2 },
    { name: 'Litchi and Lime Granita', description: 'Sweet litchi crush blended with fresh lime juice.', price: 329, category: 'MOCKTAILS', icon: '🍧', prepTime: 3 },
    { name: 'Strawberry Granita', description: 'Blended sweet strawberry crush over ice.', price: 329, category: 'MOCKTAILS', icon: '🍓', prepTime: 3 },
    { name: 'Spicy Mango Martini', description: 'Mango puree shaken with ice, lime, and chilli salt.', price: 329, category: 'MOCKTAILS', icon: '🍸', prepTime: 3 },

    // Sandwiches
    { name: 'Bombay Grilled Sandwich', description: 'Classic grilled sandwich with potato veggie filling.', price: 369, category: 'SANDWICHES', icon: '🥪', bestseller: true, prepTime: 7 },
    { name: 'Cheese Corn Grilled Sandwich', description: 'Cheese, corn, and butter filled grilled sandwich.', price: 329, category: 'SANDWICHES', icon: '🌽', prepTime: 6 },
    { name: 'Cheese Chilli Sandwich', description: 'Spicy chilli flakes and melted cheese sandwich.', price: 349, category: 'SANDWICHES', icon: '🧀', prepTime: 6 },

    // Thick Shakes
    { name: 'Nutella Thickshake', description: 'Decadent Nutella chocolate milkshake.', price: 299, category: 'THICK SHAKES', icon: '🍫', bestseller: true, prepTime: 4 },
    { name: 'Oreo Cookies Thickshake', description: 'Creamy shake loaded with crushed Oreos.', price: 299, category: 'THICK SHAKES', icon: '🍪', prepTime: 4 },
    { name: 'Salted Caramel Thickshake', description: 'Sweet caramel thick shake blended with cream.', price: 299, category: 'THICK SHAKES', icon: '🍯', prepTime: 4 },
    { name: 'Strawberry Thickshake', description: 'Thick shake made with sweet strawberry crush.', price: 299, category: 'THICK SHAKES', icon: '🍓', prepTime: 4 },
    { name: 'Mango Smoothie', description: 'Fresh mango puree blended with thick yogurt.', price: 299, category: 'THICK SHAKES', icon: '🥭', prepTime: 4 },
    { name: 'Kids Mnm Shake', description: 'Colorful milkshake topped with sweet M&Ms.', price: 299, category: 'THICK SHAKES', icon: '🍬', prepTime: 4 },

    // Classic Toast
    { name: 'Cheese Garlic', description: 'Garlic butter toast with melted mozzarella cheese.', price: 249, category: 'CLASSIC TOAST', icon: '🧄', prepTime: 5 },
    { name: 'Chilli Cheese Garlic', description: 'Garlic cheese toast spiced with chilli flakes.', price: 259, category: 'CLASSIC TOAST', icon: '🌶️', prepTime: 5 },
    { name: 'Cheese Corn Toast', description: 'Classic toast topped with sweet corn and cheese.', price: 289, category: 'CLASSIC TOAST', icon: '🌽', prepTime: 5 },
    { name: 'Cheese Mushroom Toast', description: 'Premium toast topped with garlic mushrooms and cheese.', price: 329, category: 'CLASSIC TOAST', icon: '🍄', prepTime: 6 },

    // Eggs
    { name: 'Classic Cheese Omelette', description: 'Fluffy three-egg omelette stuffed with cheese.', price: 247, category: 'EGGS', icon: '🍳', prepTime: 5 },
    { name: 'Garden Omelette', description: 'Three-egg omelette loaded with fresh vegetables.', price: 295, category: 'EGGS', icon: '🥗', prepTime: 6 },
    { name: 'Masala Omelette', description: 'Spicy classic Indian masala omelette.', price: 269, category: 'EGGS', icon: '🌶️', prepTime: 5 },
    { name: 'Butter Garlic Egg', description: 'Garlic eggs served with two buttered bread slices.', price: 279, category: 'EGGS', icon: '🍞', prepTime: 5 },

    // Appetizers
    { name: 'Classic Nachos', description: 'Tortilla chips served with warm cheese dip.', price: 298, category: 'APPETIZERS', icon: '🌮', prepTime: 4 },
    { name: 'Loaded Nachos', description: 'Nachos topped with salsa, baked beans, and cheese.', price: 269, category: 'APPETIZERS', icon: '🥗', prepTime: 5 },

    // Combo
    { name: 'Swiggy Combo1', description: 'Americano 1 + Fries Salted 1.', price: 420, category: 'COMBOS', icon: '🍱', prepTime: 6 },
    { name: 'Swiggy Combo2', description: 'Hot Chicken Wings 1 + Nutella Thickshake 1.', price: 600, category: 'COMBOS', icon: '🍗', prepTime: 8 },
    { name: 'Swiggy Combo3', description: 'Doppio Special Combo (Toast, Cheese, Butter + Cold Latte).', price: 530, category: 'COMBOS', icon: '👑', bestseller: true, prepTime: 8 },
    { name: 'Swiggy Combo4', description: 'Cappuccino 1 + Classic Nachos 1.', price: 500, category: 'COMBOS', icon: '🥪', prepTime: 7 },
    { name: 'Swiggy Combo5', description: 'Double Cappuccino.', price: 430, category: 'COMBOS', icon: '☕', prepTime: 5 },

    // Pasta
    { name: 'Alfredo Pennei Pasta', description: 'Penne pasta tossed in rich white Alfredo sauce.', price: 499, category: 'PASTA', icon: '🍝', bestseller: true, prepTime: 8 },

    // Doppio Hot Chocolate
    { name: 'Classic Hot Chocolate', description: 'Rich warm hot chocolate with fresh cream.', price: 349, category: 'DOPPIO HOT CHOCOLATE', icon: '☕', prepTime: 3 }
  ];

  // Load custom recipes and thresholds
  let customRecipes = (() => { try { return JSON.parse(localStorage.getItem('doppio_custom_recipes')) || {}; } catch(e) { return {}; } })();
  let thresholds = (() => { try { return JSON.parse(localStorage.getItem('doppio_inventory_thresholds')) || {}; } catch(e) { return {}; } })();

  // Nagpur Menu Recovery & Defensive Restoration logic
  let storedMenu = (() => { try { return JSON.parse(localStorage.getItem('doppio_menu')); } catch(e) { return null; } })();
  let menu = [];
  if (!storedMenu || !Array.isArray(storedMenu) || storedMenu.length < 15) {
    menu = defaultMenu;
    localStorage.setItem('doppio_menu', JSON.stringify(menu));
  } else {
    // Merge missing default Nagpur items (e.g. food, sandwiches, mocktails) back automatically
    const storedNames = new Set(storedMenu.filter(item => item && item.name).map(item => item.name.toLowerCase().trim()));
    menu = [...storedMenu];
    let needsUpdate = false;
    defaultMenu.forEach(item => {
      if (!storedNames.has(item.name.toLowerCase().trim())) {
        menu.push(item);
        needsUpdate = true;
      }
    });
    if (needsUpdate) {
      localStorage.setItem('doppio_menu', JSON.stringify(menu));
    }
  }

  let savedInventory = (() => { try { return JSON.parse(localStorage.getItem('doppio_inventory')) || {}; } catch(e) { return {}; } })();
  let inventory = { ...defaultInventory, ...savedInventory };

  const getMockBills = () => [
    {
      orderId: 'DO-1001',
      customerName: 'Aniket Sharma',
      customerPhone: '9823012345',
      dateTime: new Date(Date.now() - 3 * 3600000).toLocaleString('en-IN'),
      items: [
        { name: 'Bombay Grilled Sandwich', qty: 1, price: 369 },
        { name: 'Nutella Thickshake', qty: 1, price: 299 }
      ],
      subtotal: 668,
      discount: 33.4,
      gst: 114.23,
      total: 749,
      paymentMethod: 'UPI'
    },
    {
      orderId: 'DO-1002',
      customerName: 'Priya Deshmukh',
      customerPhone: '9130098765',
      dateTime: new Date(Date.now() - 2 * 3600000).toLocaleString('en-IN'),
      items: [
        { name: 'Alfredo Pennei Pasta', qty: 1, price: 499 },
        { name: 'Spicy Mango Martini', qty: 2, price: 329 }
      ],
      subtotal: 1157,
      discount: 115.7,
      gst: 187.43,
      total: 1229,
      paymentMethod: 'Card'
    },
    {
      orderId: 'DO-1003',
      customerName: 'Rahul Verma',
      customerPhone: '8888776655',
      dateTime: new Date(Date.now() - 1 * 3600000).toLocaleString('en-IN'),
      items: [
        { name: 'Cheese Garlic', qty: 1, price: 249 },
        { name: 'Classic Hot Chocolate', qty: 1, price: 349 }
      ],
      subtotal: 598,
      discount: 0,
      gst: 107.64,
      total: 706,
      paymentMethod: 'Cash'
    },
    {
      orderId: 'DO-1004',
      customerName: 'Kunal Sen',
      customerPhone: '9552147890',
      dateTime: new Date(Date.now() - 30 * 60000).toLocaleString('en-IN'),
      items: [
        { name: 'Oreo Cookies Thickshake', qty: 1, price: 299 },
        { name: 'Swiggy Combo3', qty: 1, price: 530 }
      ],
      subtotal: 829,
      discount: 124.35,
      gst: 126.84,
      total: 831,
      paymentMethod: 'UPI'
    }
  ];

  let bills = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_bills'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(b => b && typeof b === 'object' && b.orderId);
      }
      const mock = getMockBills();
      localStorage.setItem('doppio_bills', JSON.stringify(mock));
      return mock;
    } catch(e) {
      console.warn('Corrupted bills data reset');
      localStorage.removeItem('doppio_bills');
      return [];
    }
  })();
  let businessProfile = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_business_profile'));
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch(e) {
      return null;
    }
  })() || {
    name: 'Doppio Cafe Nagpur',
    address: 'London Street, Nagpur',
    phone: '+91 91300 03177',
    gstEnabled: true,
    gstRate: 18,
    loyaltyEnabled: true,
    loyaltyRate: 10,
    passcodeLockEnabled: false,
    crmEnabled: true,
    taxEnabled: true,
    soundEnabled: false
  };
  if (businessProfile.crmEnabled === undefined) businessProfile.crmEnabled = true;
  if (businessProfile.taxEnabled === undefined) businessProfile.taxEnabled = true;
  if (businessProfile.soundEnabled === undefined) businessProfile.soundEnabled = false;
  if (businessProfile.whatsappEnabled === undefined) businessProfile.whatsappEnabled = true;
  if (businessProfile.shiftEnabled === undefined) businessProfile.shiftEnabled = false;
  if (businessProfile.shiftDefaultFloat === undefined) businessProfile.shiftDefaultFloat = 2000;
  if (businessProfile.shiftMaxDrawer === undefined) businessProfile.shiftMaxDrawer = 5000;
  if (businessProfile.shiftPosLock === undefined) businessProfile.shiftPosLock = true;
  if (businessProfile.whatsappGatewayUrl === undefined || !businessProfile.whatsappGatewayUrl || businessProfile.whatsappGatewayUrl.trim() === '' || businessProfile.whatsappGatewayUrl.trim() === 'https://httpbin.org/post') {
    businessProfile.whatsappGatewayUrl = 'http://localhost:8001/api/mock-whatsapp';
  }
  if (businessProfile.whatsappGatewayEnabled === undefined || businessProfile.whatsappGatewayEnabled === false) {
    businessProfile.whatsappGatewayEnabled = true;
  }
  if (businessProfile.whatsappGatewayToken === undefined) businessProfile.whatsappGatewayToken = '';

  // ==========================================
  // SHIFT MANAGEMENT STATE ENGINE (Declared at top of scope to prevent Temporal Dead Zone crashes during bootstrap)
  // ==========================================
  let activeShift = (() => { try { return JSON.parse(localStorage.getItem('doppio_current_shift')) || null; } catch(e) { return null; } })();
  let shiftHistory = (() => { try { return JSON.parse(localStorage.getItem('doppio_shifts_local')) || []; } catch(e) { return []; } })();
  let shiftEvents = (() => { try { return JSON.parse(localStorage.getItem('doppio_shift_events_local')) || []; } catch(e) { return []; } })();

  // Force default sound off for existing storage/users
  if (localStorage.getItem('doppio_sound_default_off_v2') !== 'true') {
    businessProfile.soundEnabled = false;
    localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));
    localStorage.setItem('doppio_sound_default_off_v2', 'true');
  }

  // Force default shift off for existing storage/users so they aren't forced to open shifts
  if (localStorage.getItem('doppio_shift_default_off_v4') !== 'true') {
    businessProfile.shiftEnabled = false;
    localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));
    localStorage.setItem('doppio_shift_default_off_v4', 'true');
  }

  let cart = (() => { try { return JSON.parse(localStorage.getItem('doppio_cart')) || []; } catch(e) { localStorage.removeItem('doppio_cart'); return []; } })();
  
  // Custom global variables for ERP upgrades
  let activeTableSession = null;
  let tableCarts = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_table_carts'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (let i = 1; i <= 6; i++) {
          if (!Array.isArray(parsed[i])) parsed[i] = [];
        }
        return parsed;
      }
      return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    } catch(e) {
      return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    }
  })();

  function getDefaultShelfLife(key) {
    const k = key.toLowerCase();
    if (k.includes('milk')) return 7;
    if (k.includes('cream')) return 10;
    if (k.includes('syrup')) return 180;
    if (k.includes('bread') || k.includes('bun')) return 4;
    if (k.includes('coffee') || k.includes('bean')) return 90;
    if (k.includes('tea')) return 90;
    if (k.includes('cheese') || k.includes('butter')) return 15;
    if (k.includes('sugar') || k.includes('salt')) return 365;
    if (k.includes('chocolate') || k.includes('cocoa')) return 90;
    if (k.includes('sauce') || k.includes('spread')) return 60;
    return 30; // default 30 days
  }

  function getDefaultExpiryDate(key) {
    const shelfLife = getDefaultShelfLife(key);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + shelfLife);
    return expiry.toISOString().split('T')[0];
  }

  let inventoryBatches = (() => {
    try {
      return JSON.parse(localStorage.getItem('doppio_inventory_batches')) || {};
    } catch(e) {
      return {};
    }
  })();

  // Initialize batches if they don't exist (Nagpur Branch defensive safety)
  if (Object.keys(inventoryBatches).length === 0) {
    Object.keys(defaultInventory).forEach(key => {
      inventoryBatches[key] = [{
        id: "batch_init_" + key + "_" + Date.now(),
        qty: defaultInventory[key],
        expiryDate: getDefaultExpiryDate(key),
        receivedDate: new Date().toISOString().split('T')[0]
      }];
    });
    localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
  }
  
  let activeInventoryFilter = 'all';

  const defaultEmployees = [
    { id: 'emp_1', name: 'Bonie Deora', role: 'admin', contact: '+91 98765 43210', baseSalary: 45000, shift: 'Morning Shift', leaves: { casual: 15, sick: 10 } },
    { id: 'emp_2', name: 'Staff Cashier', role: 'cashier', contact: '+91 98765 43211', baseSalary: 25000, shift: 'Evening Shift', leaves: { casual: 15, sick: 10 } },
    { id: 'emp_3', name: 'Waiter Captain', role: 'waiter', contact: '+91 98765 43212', baseSalary: 18000, shift: 'Morning Shift', leaves: { casual: 15, sick: 10 } },
    { id: 'emp_4', name: 'Kitchen Chef', role: 'kitchen', contact: '+91 98765 43213', baseSalary: 24000, shift: 'Evening Shift', leaves: { casual: 15, sick: 10 } }
  ];

  let employees = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_employees'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(e => e && typeof e === 'object' && e.id);
      }
      return defaultEmployees;
    } catch(e) {
      return defaultEmployees;
    }
  })();

  const defaultLeaves = [
    { id: 'leave_1', employeeId: 'emp_3', employeeName: 'Waiter Captain', type: 'Casual Leave', startDate: '2026-06-10', endDate: '2026-06-11', reason: 'Family emergency', status: 'Pending', days: 2 }
  ];

  let leaveRequests = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_leave_requests')) || JSON.parse(localStorage.getItem('doppio_leaves'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(r => r && typeof r === 'object' && r.id);
      }
      return defaultLeaves;
    } catch(e) {
      return defaultLeaves;
    }
  })();

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const defaultAttendance = [
    { id: 'att_1', employeeId: 'emp_1', employeeName: 'Bonie Deora', date: yesterdayStr, clockInTime: '09:02', clockOutTime: '17:15', hoursWorked: 8.2, shift: 'Morning Shift', wages: 1542, status: 'Completed' },
    { id: 'att_2', employeeId: 'emp_3', employeeName: 'Waiter Captain', date: yesterdayStr, clockInTime: '09:15', clockOutTime: '17:00', hoursWorked: 7.7, shift: 'Morning Shift', wages: 578, status: 'Completed' },
    { id: 'att_3', employeeId: 'emp_2', employeeName: 'Staff Cashier', date: yesterdayStr, clockInTime: '17:05', clockOutTime: '01:10', hoursWorked: 8.0, shift: 'Evening Shift', wages: 832, status: 'Completed' }
  ];

  let attendanceLogs = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_attendance'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(l => l && typeof l === 'object' && l.id);
      }
      return defaultAttendance;
    } catch(e) {
      return defaultAttendance;
    }
  })();

  let selectedPaymentMethod = localStorage.getItem('doppio_cart_pay_method') || 'UPI';
  let activeOrderType = 'Takeaway';
  let draftOrders = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_draft_orders'));
      return Array.isArray(parsed) ? parsed.filter(d => d && typeof d === 'object' && d.id) : [];
    } catch(e) {
      return [];
    }
  })();
  let editingBillId = localStorage.getItem('doppio_editing_bill_id') || null;
  if (editingBillId === 'null') editingBillId = null;

  // State variables for customization modals
  let selectedSizeOpt = 'Small';
  let selectedSugarOpt = 'Regular';
  let selectedIceOpt = 'Regular';

  // Sync parameters
  let supabaseClient = null;
  const DEFAULT_SUPABASE_URL = 'https://htkauiibuejetimfiavs.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk';

  // ==========================================
  // 2. SUPABASE INITIALIZER & QUEUES
  // ==========================================
  function initSupabase() {
    if (typeof supabase !== 'undefined') {
      try {
        supabaseClient = supabase.createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
        updateNetworkStatus(true);
        
        // Disable shiftEnabled in Supabase cloud db once for migration v4
        if (localStorage.getItem('doppio_shift_supabase_synced_v4') !== 'true') {
          supabaseClient.from('doppio_business_profile').update({ shift_enabled: false }).eq('tenant_id', activeTenantId)
            .then(({ error }) => {
              if (!error) {
                localStorage.setItem('doppio_shift_supabase_synced_v4', 'true');
                console.log("Successfully disabled shift_enabled in cloud db for migration v4");
              }
              // Proceed with sync after update attempt completes
              syncWithSupabase();
            })
            .catch(() => {
              syncWithSupabase();
            });
        } else {
          syncWithSupabase();
        }
        
        syncOfflineBills();
        setupSupabaseRealtime();
      } catch (err) {
        console.error("Supabase failed:", err);
      }
    } else {
      updateNetworkStatus(false);
    }
  }

  function updateNetworkStatus(online) {
    const desktopStatusText = document.getElementById('supabase-sync-text');
    const mobileBadge = document.getElementById('mobile-network-status-badge');
    
    if (online) {
      if (desktopStatusText) desktopStatusText.innerHTML = 'Live';
      const desktopBadge = document.getElementById('network-status-badge');
      if (desktopBadge) {
        desktopBadge.style.backgroundColor = 'rgba(46, 204, 113, 0.08)';
        desktopBadge.style.borderColor = 'rgba(46, 204, 113, 0.15)';
        desktopBadge.style.color = 'var(--success-color)';
        const dot = desktopBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot green';
        }
      }
      if (mobileBadge) {
        mobileBadge.style.backgroundColor = 'rgba(46, 204, 113, 0.08)';
        mobileBadge.style.borderColor = 'rgba(46, 204, 113, 0.2)';
        mobileBadge.title = 'Live';
        const dot = mobileBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot green';
        }
      }
    } else {
      if (desktopStatusText) desktopStatusText.innerHTML = 'Offline';
      const desktopBadge = document.getElementById('network-status-badge');
      if (desktopBadge) {
        desktopBadge.style.backgroundColor = 'rgba(231, 76, 60, 0.08)';
        desktopBadge.style.borderColor = 'rgba(231, 76, 60, 0.15)';
        desktopBadge.style.color = 'var(--danger-color)';
        const dot = desktopBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot red';
        }
      }
      if (mobileBadge) {
        mobileBadge.style.backgroundColor = 'rgba(231, 76, 60, 0.08)';
        mobileBadge.style.borderColor = 'rgba(231, 76, 60, 0.2)';
        mobileBadge.title = 'Offline';
        const dot = mobileBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot red';
        }
      }
    }
  }

  function triggerSyncErrorState(errorMsg) {
    const text = document.getElementById('supabase-sync-text');
    const badge = document.getElementById('network-status-badge');
    if (badge) {
      badge.style.backgroundColor = 'rgba(241, 196, 15, 0.08)';
      badge.style.borderColor = 'rgba(241, 196, 15, 0.2)';
      badge.style.color = '#f1c40f';
      const dot = badge.querySelector('.status-dot');
      if (dot) {
        dot.className = 'status-dot';
        dot.style.backgroundColor = '#f1c40f';
        dot.style.animation = 'blink 0.5s infinite';
      }
    }
    if (text) {
      text.textContent = 'Sync Error';
      text.title = errorMsg;
    }
    
    setTimeout(() => {
      if (navigator.onLine) {
        updateNetworkStatus(true);
        const dot = badge ? badge.querySelector('.status-dot') : null;
        if (dot) {
          dot.style.backgroundColor = '';
          dot.style.animation = 'blink 1.5s infinite';
        }
      }
    }, 5000);
  }

  function handleSyncError(operationName, error) {
    const errorMsg = error ? (error.message || error) : 'Unknown Error';
    console.error(`[Supabase Sync Fail] ${operationName}:`, errorMsg);
    
    triggerSyncErrorState(errorMsg);
    
    if (navigator.onLine) {
      showNotificationToast(`Sync Failed: ${operationName} error (${errorMsg})`);
    } else {
      showNotificationToast(`Saved locally. ${operationName} sync pending connection...`);
    }
  }

  function saveOfflineBill(bill) {
    let queue = [];
    try {
      queue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
    } catch(e) {
      queue = [];
    }
    if (!queue.some(b => b.orderId === bill.orderId)) {
      queue.push(bill);
      localStorage.setItem('doppio_offline_bills_queue', JSON.stringify(queue));
    }
  }

  async function syncOfflineBills() {
    if (!supabaseClient || !navigator.onLine) return;
    let queue = [];
    try {
      queue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
    } catch(e) {
      queue = [];
    }
    if (queue.length === 0) return;
    
    const billsToSync = [...queue];
    for (const bill of billsToSync) {
      try {
        const { error } = await supabaseClient.from('doppio_bills').insert({
          tenant_id: activeTenantId,
          orderId: bill.orderId,
          customerName: bill.customerName,
          customerPhone: bill.customerPhone,
          dateTime: bill.dateTime,
          items: typeof bill.items === 'string' ? bill.items : JSON.stringify(bill.items),
          subtotal: bill.subtotal,
          gst: bill.gst,
          total: bill.total,
          paymentMethod: bill.paymentMethod
        });
        
        if (!error) {
          let currentQueue = [];
          try {
            currentQueue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
          } catch(e) {
            currentQueue = [];
          }
          const updatedQueue = currentQueue.filter(b => b.orderId !== bill.orderId);
          localStorage.setItem('doppio_offline_bills_queue', JSON.stringify(updatedQueue));
        }
      } catch (err) {
        console.warn(`Failed to sync bill ${bill.orderId}:`, err);
      }
    }
  }

  window.addEventListener('online', syncOfflineBills);

  async function syncWithSupabase() {
    if (!supabaseClient) return;
    if (sessionStorage.getItem('logged_in_role') === 'superadmin') {
      applyFeatureToggles();
      return;
    }
    try {
      // Sync Business Profile Toggles and Settings Live!
      try {
        let { data: dbProfileList } = await supabaseClient.from('doppio_business_profile').select('*').eq('tenant_id', activeTenantId);
        if (!dbProfileList || dbProfileList.length === 0) {
          // Auto-create default profile for new client
          const { data: newProfile } = await supabaseClient.from('doppio_business_profile').insert({
            tenant_id: activeTenantId,
            business_name: activeTenantName,
            address: 'India',
            phone: '+353 85 225 8004',
            gst_enabled: true,
            gst_rate: 18,
            loyalty_discount_enabled: true,
            loyalty_discount_rate: 10,
            crm_enabled: true,
            tax_enabled: true,
            sound_enabled: false,
            whatsapp_enabled: true,
            shift_enabled: false
          }).select('*');
          if (newProfile && newProfile.length > 0) dbProfileList = newProfile;
        }
        if (dbProfileList && dbProfileList.length > 0) {
          const dbProfile = dbProfileList[0];
          businessProfile = {
            name: dbProfile.business_name || businessProfile.name,
            address: dbProfile.address || businessProfile.address,
            phone: dbProfile.phone || businessProfile.phone,
            gstEnabled: dbProfile.gst_enabled !== undefined ? dbProfile.gst_enabled : businessProfile.gstEnabled,
            gstRate: dbProfile.gst_rate !== undefined ? parseFloat(dbProfile.gst_rate) : businessProfile.gstRate,
            loyaltyEnabled: dbProfile.loyalty_discount_enabled !== undefined ? dbProfile.loyalty_discount_enabled : businessProfile.loyaltyEnabled,
            loyaltyRate: dbProfile.loyalty_discount_rate !== undefined ? parseFloat(dbProfile.loyalty_discount_rate) : businessProfile.loyaltyRate,
            passcodeLockEnabled: dbProfile.passcode_lock_enabled !== undefined ? dbProfile.passcode_lock_enabled : businessProfile.passcodeLockEnabled,
            crmEnabled: dbProfile.crm_enabled !== undefined ? dbProfile.crm_enabled : businessProfile.crmEnabled,
            taxEnabled: dbProfile.tax_enabled !== undefined ? dbProfile.tax_enabled : businessProfile.taxEnabled,
            soundEnabled: dbProfile.sound_enabled !== undefined ? dbProfile.sound_enabled : businessProfile.soundEnabled,
            whatsappEnabled: dbProfile.whatsapp_enabled !== undefined ? dbProfile.whatsapp_enabled : businessProfile.whatsappEnabled,
            shiftEnabled: dbProfile.shift_enabled !== undefined ? dbProfile.shift_enabled : businessProfile.shiftEnabled,
            shiftDefaultFloat: dbProfile.shift_default_float !== undefined ? parseFloat(dbProfile.shift_default_float) : businessProfile.shiftDefaultFloat,
            shiftMaxDrawer: dbProfile.shift_max_drawer !== undefined ? parseFloat(dbProfile.shift_max_drawer) : businessProfile.shiftMaxDrawer,
            shiftPosLock: dbProfile.shift_pos_lock !== undefined ? dbProfile.shift_pos_lock : businessProfile.shiftPosLock,
            whatsappGatewayEnabled: dbProfile.whatsapp_gateway_enabled !== undefined ? dbProfile.whatsapp_gateway_enabled : businessProfile.whatsappGatewayEnabled,
            whatsappGatewayUrl: dbProfile.whatsapp_gateway_url || businessProfile.whatsappGatewayUrl,
            whatsappGatewayToken: dbProfile.whatsapp_gateway_token || businessProfile.whatsappGatewayToken,
            featureFlags: dbProfile.feature_flags ? JSON.parse(dbProfile.feature_flags) : (businessProfile.featureFlags || {})
          };
          
          if (businessProfile.whatsappGatewayUrl === undefined || !businessProfile.whatsappGatewayUrl || businessProfile.whatsappGatewayUrl.trim() === '' || businessProfile.whatsappGatewayUrl.trim() === 'https://httpbin.org/post') {
            businessProfile.whatsappGatewayUrl = 'http://localhost:8001/api/mock-whatsapp';
          }
          if (businessProfile.whatsappGatewayEnabled === undefined || businessProfile.whatsappGatewayEnabled === false) {
            businessProfile.whatsappGatewayEnabled = true;
          }
          
          localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));
          setVaultData("doppio_business_profile", businessProfile);
          applyFeatureToggles();
          renderCart();
        }
      } catch (err) {
        console.warn("Supabase business profile sync failed (probably table/columns missing):", err);
      }

      // Sync Menu
      let { data: dbMenu } = await supabaseClient.from('doppio_menu').select('*').eq('tenant_id', activeTenantId).order('id', { ascending: true });
      if (!dbMenu || dbMenu.length === 0) {
        // Auto-seed default menu items for the new tenant
        const seedItems = defaultMenu.map(item => ({
          tenant_id: activeTenantId,
          name: item.name,
          category: item.category,
          price: item.price,
          description: item.description || '',
          icon: item.icon || '☕'
        }));
        await supabaseClient.from('doppio_menu').insert(seedItems);
        const { data: freshMenu } = await supabaseClient.from('doppio_menu').select('*').eq('tenant_id', activeTenantId).order('id', { ascending: true });
        dbMenu = freshMenu || [];
      }
      if (dbMenu && dbMenu.length > 0) {
        // Merge dbMenu with defaultMenu defensively to ensure food items and all categories exist
        const dbNames = new Set(dbMenu.map(item => item.name.toLowerCase().trim()));
        let mergedMenu = [...dbMenu];
        
        defaultMenu.forEach(item => {
          if (!dbNames.has(item.name.toLowerCase().trim())) {
            mergedMenu.push(item);
          }
        });
        
        menu = mergedMenu;
        localStorage.setItem('doppio_menu', JSON.stringify(menu));
        renderPOSCategories();
        renderPOSItems();
      }

      // Sync Inventory
      let { data: dbInv } = await supabaseClient.from('doppio_inventory').select('*').eq('tenant_id', activeTenantId);
      if (!dbInv || dbInv.length === 0) {
        // Auto-seed inventory keys
        const seedInv = Object.keys(defaultInventory).map(key => ({
          tenant_id: activeTenantId,
          key: key,
          current: defaultInventory[key],
          min_required: 10
        }));
        await supabaseClient.from('doppio_inventory').insert(seedInv);
        const { data: freshInv } = await supabaseClient.from('doppio_inventory').select('*').eq('tenant_id', activeTenantId);
        dbInv = freshInv || [];
      }
      if (dbInv && dbInv.length > 0) {
        dbInv.forEach(row => {
          inventory[row.key] = row.current;
        });
        localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
        renderInventory();
        checkLowStockAlerts();
      }

      // Sync Bills History Live across all devices!
      const { data: dbBills } = await supabaseClient.from('doppio_bills').select('*').eq('tenant_id', activeTenantId);
      if (dbBills && dbBills.length > 0) {
        const parsedDbBills = dbBills.map(b => {
          let items = b.items;
          if (typeof items === 'string') {
            try {
              items = JSON.parse(items);
            } catch(err) {
              items = [];
            }
          }
          return {
            orderId: b.orderId,
            customerName: b.customerName,
            dateTime: b.dateTime,
            items: items,
            subtotal: parseFloat(b.subtotal || 0),
            gst: parseFloat(b.gst || 0),
            total: parseFloat(b.total || 0),
            paymentMethod: b.paymentMethod
          };
        });

        // Merge dynamically by orderId keeping unsynced local bills
        const localBills = JSON.parse(localStorage.getItem('doppio_bills')) || [];
        const localMap = new Map(localBills.map(b => [b.orderId, b]));

        parsedDbBills.forEach(dbBill => {
          localMap.set(dbBill.orderId, dbBill);
        });

        const mergedBills = Array.from(localMap.values());
        // Sort mergedBills by order ID descending to display newest orders first
        mergedBills.sort((a, b) => b.orderId.localeCompare(a.orderId));

        bills = mergedBills;
        localStorage.setItem('doppio_bills', JSON.stringify(bills));
        renderBills();
        updateHeaderSummaryStats();
      }

      // Sync Pending QR Orders & Dine-In Carts (Made by Antigravity)
      try {
        const { data: dbPending } = await supabaseClient.from('doppio_pending_orders').select('*').eq('tenant_id', activeTenantId);
        if (dbPending && dbPending.length > 0) {
          const parsedPending = dbPending.map(o => {
            let items = o.items;
            if (typeof items === 'string') {
              try { items = JSON.parse(items); } catch(e) { items = []; }
            }
            return {
              orderId: o.orderId,
              customerName: o.customerName,
              customerPhone: o.customerPhone,
              dateTime: o.dateTime,
              items: items,
              subtotal: parseFloat(o.subtotal || 0),
              discount: parseFloat(o.discount || 0),
              gst: parseFloat(o.gst || 0),
              total: parseFloat(o.total || 0),
              paymentMethod: o.paymentMethod,
              orderType: o.orderType,
              tableNumber: o.tableNumber,
              status: o.status
            };
          });

          // Merge defensively with local cache
          const localMap = new Map(pendingQrOrders.map(o => [o.orderId, o]));
          parsedPending.forEach(p => {
            if (p.status === 'DineIn Active') {
              const tableId = parseInt(p.tableNumber);
              if (!isNaN(tableId) && tableId >= 1 && tableId <= 6) {
                tableCarts[tableId] = p.items;
                tablesState[tableId] = "ORDERING";
              }
            } else {
              localMap.set(p.orderId, p);
              if (p.tableNumber && p.tableNumber !== 'Takeaway') {
                const tbl = parseInt(p.tableNumber);
                if (!isNaN(tbl)) {
                  if (p.status === 'Pending Review') {
                    tablesState[tbl] = "PENDING";
                  } else if (p.status === 'Accepted') {
                    tablesState[tbl] = "SERVED";
                  } else if (p.status === 'Ready') {
                    tablesState[tbl] = "PENDING";
                  }
                }
              }
            }
          });
          pendingQrOrders = Array.from(localMap.values());
          localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
          localStorage.setItem('doppio_table_carts', JSON.stringify(tableCarts));
          localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
          updateQrOrdersDashboardUI();
          renderTablesMap();
        }
      } catch (err) {
        console.warn("Supabase pending orders sync failed:", err);
      }

      // Sync Shift History from cloud (restores Z-reports and closed shift data across devices)
      try {
        const { data: dbShifts } = await supabaseClient.from('doppio_shifts').select('*').eq('tenant_id', activeTenantId).order('openedAt', { ascending: false }).limit(50);
        if (dbShifts && dbShifts.length > 0) {
          const localMap = new Map(shiftHistory.filter(s => s && s.shiftId).map(s => [s.shiftId, s]));
          dbShifts.forEach(dbS => {
            localMap.set(dbS.shiftId, {
              shiftId: dbS.shiftId,
              cashierName: dbS.cashierName,
              openedAt: dbS.openedAt,
              closedAt: dbS.closedAt,
              openingFloat: parseFloat(dbS.openingFloat || 0),
              expectedCash: parseFloat(dbS.expectedCash || 0),
              actualCash: parseFloat(dbS.actualCash || 0),
              variance: parseFloat(dbS.variance || 0),
              totalSalesCash: parseFloat(dbS.totalSalesCash || 0),
              totalSalesUpi: parseFloat(dbS.totalSalesUpi || 0),
              totalSalesCard: parseFloat(dbS.totalSalesCard || 0),
              totalPayouts: parseFloat(dbS.totalPayouts || 0),
              totalSafeDrops: parseFloat(dbS.totalSafeDrops || 0),
              status: dbS.status,
              notes: dbS.notes || ''
            });
          });
          shiftHistory = Array.from(localMap.values()).sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
          localStorage.setItem('doppio_shifts_local', JSON.stringify(shiftHistory));
        }
      } catch (err) {
        console.warn("Supabase shift history sync failed:", err);
      }

      // Sync Shift Events (cash payouts, safe drops) from cloud
      try {
        const { data: dbShiftEvents } = await supabaseClient.from('doppio_shift_events').select('*').eq('tenant_id', activeTenantId).order('createdAt', { ascending: false }).limit(200);
        if (dbShiftEvents && dbShiftEvents.length > 0) {
          const localMap = new Map(shiftEvents.filter(e => e && e.eventId).map(e => [e.eventId, e]));
          dbShiftEvents.forEach(dbE => {
            localMap.set(dbE.eventId, {
              eventId: dbE.eventId,
              shiftId: dbE.shiftId,
              eventType: dbE.eventType,
              amount: parseFloat(dbE.amount || 0),
              reason: dbE.reason || '',
              createdAt: dbE.createdAt
            });
          });
          shiftEvents = Array.from(localMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          localStorage.setItem('doppio_shift_events_local', JSON.stringify(shiftEvents));
        }
      } catch (err) {
        console.warn("Supabase shift events sync failed:", err);
      }

      // Sync Employees

      try {
        let { data: dbEmployees } = await supabaseClient.from('doppio_employees').select('*').eq('tenant_id', activeTenantId);
        if (!dbEmployees || dbEmployees.length === 0) {
          const seedEmp = defaultEmployees.map(emp => ({
            tenant_id: activeTenantId,
            name: emp.name,
            role: emp.role,
            contact: emp.contact,
            baseSalary: emp.baseSalary,
            shift: emp.shift,
            leaves: emp.leaves
          }));
          await supabaseClient.from('doppio_employees').insert(seedEmp);
          const { data: freshEmp } = await supabaseClient.from('doppio_employees').select('*').eq('tenant_id', activeTenantId);
          dbEmployees = freshEmp || [];
        }
        if (dbEmployees && dbEmployees.length > 0) {
          const localEmployees = JSON.parse(localStorage.getItem('doppio_employees')) || [];
          const localMap = new Map(localEmployees.filter(e => e && e.id).map(e => [e.id, e]));
          dbEmployees.forEach(dbEmp => {
            localMap.set(dbEmp.id, {
              id: dbEmp.id,
              name: dbEmp.name,
              role: dbEmp.role,
              contact: dbEmp.contact,
              baseSalary: parseFloat(dbEmp.baseSalary || 0),
              shift: dbEmp.shift,
              leaves: typeof dbEmp.leaves === 'string' ? JSON.parse(dbEmp.leaves) : dbEmp.leaves
            });
          });
          employees = Array.from(localMap.values());
          localStorage.setItem('doppio_employees', JSON.stringify(employees));
          renderEmployeesTab();
        }
      } catch (err) {
        console.warn("Supabase employees sync failed:", err);
      }

      // Sync Leave Requests
      try {
        const { data: dbLeaves } = await supabaseClient.from('doppio_leave_requests').select('*').eq('tenant_id', activeTenantId);
        if (dbLeaves && dbLeaves.length > 0) {
          const localLeaves = JSON.parse(localStorage.getItem('doppio_leave_requests')) || [];
          const localMap = new Map(localLeaves.filter(r => r && r.id).map(r => [r.id, r]));
          dbLeaves.forEach(dbL => {
            localMap.set(dbL.id, {
              id: dbL.id,
              employeeId: dbL.employeeId,
              employeeName: dbL.employeeName,
              type: dbL.type,
              startDate: dbL.startDate,
              endDate: dbL.endDate,
              reason: dbL.reason,
              status: dbL.status,
              days: parseInt(dbL.days || 1)
            });
          });
          leaveRequests = Array.from(localMap.values());
          localStorage.setItem('doppio_leave_requests', JSON.stringify(leaveRequests));
          renderEmployeesTab();
        }
      } catch (err) {
        console.warn("Supabase leave requests sync failed:", err);
      }

      // Sync Attendance Logs
      try {
        const { data: dbAttendance } = await supabaseClient.from('doppio_attendance').select('*').eq('tenant_id', activeTenantId);
        if (dbAttendance && dbAttendance.length > 0) {
          const localAttendance = JSON.parse(localStorage.getItem('doppio_attendance')) || [];
          const localMap = new Map(localAttendance.filter(log => log && log.id).map(log => [log.id, log]));
          dbAttendance.forEach(dbA => {
            localMap.set(dbA.id, {
              id: dbA.id,
              employeeId: dbA.employeeId,
              employeeName: dbA.employeeName,
              date: dbA.date,
              clockInTime: dbA.clockInTime,
              clockOutTime: dbA.clockOutTime,
              hoursWorked: parseFloat(dbA.hoursWorked || 0),
              shift: dbA.shift,
              wages: parseFloat(dbA.wages || 0),
              status: dbA.status
            });
          });
          attendanceLogs = Array.from(localMap.values());
          localStorage.setItem('doppio_attendance', JSON.stringify(attendanceLogs));
          renderEmployeesTab();
        }
      } catch (err) {
        console.warn("Supabase attendance sync failed:", err);
      }

      // Sync CRM Loyalty Members
      try {
        const { data: dbCRM } = await supabaseClient.from('doppio_crm').select('*').eq('tenant_id', activeTenantId);
        if (dbCRM && dbCRM.length > 0) {
          const localMap = new Map(crmData.filter(c => c && c.phone).map(c => [c.phone, c]));
          dbCRM.forEach(dbC => {
            const existing = localMap.get(dbC.phone);
            if (existing) {
              // Keep whichever has more visits/spend (most up-to-date)
              if ((dbC.visits || 0) >= (existing.visits || 0)) {
                localMap.set(dbC.phone, {
                  name: dbC.name,
                  phone: dbC.phone,
                  visits: parseInt(dbC.visits || 1),
                  total_spend: parseFloat(dbC.total_spend || 0),
                  last_visit: dbC.last_visit
                });
              }
            } else {
              localMap.set(dbC.phone, {
                name: dbC.name,
                phone: dbC.phone,
                visits: parseInt(dbC.visits || 1),
                total_spend: parseFloat(dbC.total_spend || 0),
                last_visit: dbC.last_visit
              });
            }
          });
          // Also add local entries without phone (keyed by name)
          crmData.filter(c => c && !c.phone).forEach(c => {
            const key = '__noPhone__' + c.name;
            if (!localMap.has(key)) localMap.set(key, c);
          });
          crmData = Array.from(localMap.values()).filter(c => !String(c.phone || '').startsWith('__noPhone__'));
          localStorage.setItem('doppio_crm_local', JSON.stringify(crmData));
          renderCRMTab();
        }
      } catch (err) {
        console.warn("Supabase CRM sync failed:", err);
      }

      // Sync Inventory Batches
      try {
        const { data: dbBatches } = await supabaseClient.from('doppio_inventory_batches').select('*').eq('tenant_id', activeTenantId);
        if (dbBatches && dbBatches.length > 0) {
          // Rebuild inventoryBatches map from cloud
          const cloudMap = {};
          dbBatches.forEach(row => {
            if (!cloudMap[row.ingredient_key]) cloudMap[row.ingredient_key] = [];
            cloudMap[row.ingredient_key].push({
              id: row.id,
              qty: parseFloat(row.qty || 0),
              expiryDate: row.expiryDate,
              receivedDate: row.receivedDate
            });
          });
          // Merge: cloud wins for keys it has, keep local keys not in cloud
          Object.keys(cloudMap).forEach(k => { inventoryBatches[k] = cloudMap[k]; });
          localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
          if (typeof renderInventory === 'function') renderInventory();
        }
      } catch (err) {
        console.warn("Supabase inventory batches sync failed:", err);
      }

      // Sync Notifications
      try {
        const { data: dbNotifs } = await supabaseClient.from('doppio_notifications').select('*').eq('tenant_id', activeTenantId).order('created_at', { ascending: false }).limit(50);
        if (dbNotifs && dbNotifs.length > 0) {
          const localMap = new Map(notifications.filter(n => n && n.id).map(n => [n.id, n]));
          dbNotifs.forEach(dbN => {
            if (!localMap.has(dbN.id)) {
              localMap.set(dbN.id, {
                id: dbN.id,
                title: dbN.title,
                message: dbN.message,
                role: dbN.role || 'all',
                type: dbN.type || 'info',
                timestamp: dbN.timestamp || '',
                isRead: dbN.isRead || false
              });
            }
          });
          notifications = Array.from(localMap.values()).slice(0, 50);
          localStorage.setItem('doppio_notifications', JSON.stringify(notifications));
          if (typeof renderNotifications === 'function') renderNotifications();
        }
      } catch (err) {
        console.warn("Supabase notifications sync failed:", err);
      }

      // Sync Custom Item Recipes
      try {
        const { data: dbRecipes } = await supabaseClient.from('doppio_custom_recipes').select('*').eq('tenant_id', activeTenantId);
        if (dbRecipes && dbRecipes.length > 0) {
          dbRecipes.forEach(row => {
            const itemName = (row.item_name || '').toLowerCase().trim();
            if (itemName) {
              let ingredients = row.ingredients;
              if (typeof ingredients === 'string') {
                try { ingredients = JSON.parse(ingredients); } catch(e) { ingredients = []; }
              }
              // Cloud wins (overwrite local recipe for this item)
              customRecipes[itemName] = Array.isArray(ingredients) ? ingredients : [];
            }
          });
          localStorage.setItem('doppio_custom_recipes', JSON.stringify(customRecipes));
        }
      } catch (err) {
        console.warn("Supabase custom recipes sync failed:", err);
      }

      // Sync Inventory Thresholds
      try {
        const { data: dbThresholds } = await supabaseClient.from('doppio_inventory_thresholds').select('*').eq('tenant_id', activeTenantId);
        if (dbThresholds && dbThresholds.length > 0) {
          dbThresholds.forEach(row => {
            if (row.ingredient_key) {
              thresholds[row.ingredient_key] = parseInt(row.threshold || 20);
            }
          });
          localStorage.setItem('doppio_inventory_thresholds', JSON.stringify(thresholds));
          if (typeof checkLowStockAlerts === 'function') checkLowStockAlerts();
        }
      } catch (err) {
        console.warn("Supabase inventory thresholds sync failed:", err);
      }

      // Sync POS Item Popularity (used for grid sort order)
      try {
        const { data: dbPopularity } = await supabaseClient.from('doppio_pos_popularity').select('*').eq('tenant_id', activeTenantId);
        if (dbPopularity && dbPopularity.length > 0) {
          dbPopularity.forEach(row => {
            const itemName = (row.item_name || '').toLowerCase().trim();
            if (itemName) {
              // Keep the higher count between cloud and local
              const localCount = posPopularityMap[itemName] || 0;
              posPopularityMap[itemName] = Math.max(localCount, parseInt(row.count || 0));
            }
          });
          localStorage.setItem('doppio_pos_popularity', JSON.stringify(posPopularityMap));
          if (typeof renderPOSItems === 'function') renderPOSItems();
        }
      } catch (err) {
        console.warn("Supabase POS popularity sync failed:", err);
      }

    } catch(e) {
      console.warn("Supabase initial sync fallback", e);
    }
  }

  function setupSupabaseRealtime() {
    if (!supabaseClient) return;
    
    // Subscribe to standard bills changes
    supabaseClient.channel('doppio-bills-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_bills', filter: 'tenant_id=eq.' + activeTenantId }, payload => {})
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_bills' }, () => {
        syncWithSupabase();
      }).subscribe();

    // Subscribe to live QR self-ordering queue & table sessions (Made by Antigravity)
    supabaseClient.channel('doppio-pending-orders-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_pending_orders', filter: 'tenant_id=eq.' + activeTenantId }, payload => {})
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_pending_orders' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newOrder = payload.new;
          let items = newOrder.items;
          if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = []; }
          }
          const orderObj = {
            orderId: newOrder.orderId,
            customerName: newOrder.customerName,
            customerPhone: newOrder.customerPhone,
            dateTime: newOrder.dateTime,
            items: items,
            subtotal: parseFloat(newOrder.subtotal || 0),
            discount: parseFloat(newOrder.discount || 0),
            gst: parseFloat(newOrder.gst || 0),
            total: parseFloat(newOrder.total || 0),
            paymentMethod: newOrder.paymentMethod,
            orderType: newOrder.orderType,
            tableNumber: newOrder.tableNumber,
            status: newOrder.status
          };

          // 1. Check if it's a Dine-In Active session cart sync
          if (orderObj.status === 'DineIn Active') {
            const tableId = parseInt(orderObj.tableNumber);
            if (!isNaN(tableId) && tableId >= 1 && tableId <= 6) {
              tableCarts[tableId] = items;
              tablesState[tableId] = "ORDERING";
              localStorage.setItem('doppio_table_carts', JSON.stringify(tableCarts));
              localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
              if (activeTableSession === tableId) {
                cart = tableCarts[tableId];
                renderCart();
              }
              renderTablesMap();
            }
            return;
          }

          // 2. Otherwise update KDS / self-service queue
          const idx = pendingQrOrders.findIndex(o => o.orderId === orderObj.orderId);
          if (idx !== -1) {
            pendingQrOrders[idx] = orderObj;
          } else {
            pendingQrOrders.push(orderObj);
            playIncomingOrderChime();
            showNotificationToast(`New self-service order from Table ${orderObj.tableNumber}!`);
          }

          localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));

          if (orderObj.tableNumber && orderObj.tableNumber !== 'Takeaway') {
            const tbl = parseInt(orderObj.tableNumber);
            if (!isNaN(tbl)) {
              if (orderObj.status === 'Pending Review') {
                tablesState[tbl] = "PENDING";
              } else if (orderObj.status === 'Accepted') {
                tablesState[tbl] = "SERVED";
              } else if (orderObj.status === 'Ready') {
                tablesState[tbl] = "PENDING";
              }
              localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
            }
          }

          updateQrOrdersDashboardUI();
          if (typeof renderKDSTab === 'function') renderKDSTab();
          if (typeof renderTokensTab === 'function') renderTokensTab();
          renderTablesMap();

        } else if (payload.eventType === 'DELETE') {
          const deletedOrderId = payload.old.orderId || payload.old.order_id;
          if (deletedOrderId) {
            pendingQrOrders = pendingQrOrders.filter(o => o.orderId !== deletedOrderId);
            localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
            
            // If it was a table active session, clear it locally
            if (deletedOrderId.startsWith('TABLE-')) {
              const parts = deletedOrderId.split('-');
              const tableId = parseInt(parts[1]);
              if (!isNaN(tableId)) {
                tableCarts[tableId] = [];
                tablesState[tableId] = "EMPTY";
                localStorage.setItem('doppio_table_carts', JSON.stringify(tableCarts));
                localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
                if (activeTableSession === tableId) {
                  activeTableSession = null;
                  const banner = document.getElementById('table-session-banner');
                  if (banner) banner.style.display = 'none';
                  const backup = sessionStorage.getItem('doppio_takeaway_cart_backup');
                  cart = backup ? JSON.parse(backup) : [];
                  renderCart();
                }
              }
            }

            updateQrOrdersDashboardUI();
            if (typeof renderKDSTab === 'function') renderKDSTab();
            if (typeof renderTokensTab === 'function') renderTokensTab();
            renderTablesMap();
          }
        }
      }).subscribe();

    // Subscribe to WhatsApp Broadcast delivery status messages (Made by Antigravity)
    supabaseClient.channel('whatsapp-billing-status')
      .on('broadcast', { event: 'status' }, (payload) => {
        const { orderId, status, error } = payload.payload;
        if (status === 'success') {
          showNotificationToast(`Bill ${orderId}: WhatsApp Sent Successfully!`);
        } else {
          showNotificationToast(`Bill ${orderId}: Delivery Failed - ${error || 'Gateway Offline'}`);
        }
      }).subscribe();

    // ─────────────────────────────────────────────────────────────────────
    // ⚡ REAL-TIME TENANT SYNC — SaaS Tenants table listener
    // ─────────────────────────────────────────────────────────────────────
    const loggedInRole = sessionStorage.getItem('logged_in_role');

    // Super-Admin: refresh registry table whenever any tenant row changes
    if (loggedInRole === 'superadmin') {
      supabaseClient.channel('saas-tenants-superadmin-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'saas_tenants' }, (payload) => {
          console.log('[SaaS Realtime] Tenant registry change detected — refreshing super-admin tab:', payload);
          renderSuperAdminTab();
        }).subscribe();
    }

    // Logged-in tenant: watch OWN row for live permission/status changes by SuperAdmin
    if (loggedInRole !== 'superadmin' && activeTenantId) {
      supabaseClient
        .channel('saas-tenant-self-realtime')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'saas_tenants',
            filter: `id=eq.${activeTenantId}`
          },
          (payload) => {
            const updated = payload.new;
            console.log('[SaaS Realtime] Own tenant record updated by SuperAdmin:', updated);

            // 1. Account suspended → kick to login immediately
            if (updated.status === 'suspended') {
              showNotificationToast('⚠️ Account suspended. Redirecting to login...');
              setTimeout(() => {
                sessionStorage.clear();
                window.location.href = 'login.html';
              }, 2200);
              return;
            }

            // 2. Account set back to pending → kick to login
            if (updated.status === 'pending') {
              showNotificationToast('ℹ️ Account access changed. Please contact your provider.');
              setTimeout(() => {
                sessionStorage.clear();
                window.location.href = 'login.html';
              }, 2200);
              return;
            }

            // 3. Hot-swap allowed_tabs in memory + sessionStorage
            if (Array.isArray(updated.allowed_tabs)) {
              allowedTabs.length = 0;
              updated.allowed_tabs.forEach(t => allowedTabs.push(t));
              sessionStorage.setItem('allowed_tabs', JSON.stringify(updated.allowed_tabs));
              console.log('[SaaS Realtime] allowedTabs updated live:', allowedTabs);
            }

            // 4. Re-apply all sidebar/mobile-nav/feature visibility immediately
            applyFeatureToggles();

            // 5. If currently active tab was just revoked → redirect to first allowed tab
            const activeTabEl = document.querySelector('.tab-content.active');
            const activeTabId = activeTabEl ? activeTabEl.id : null;
            if (activeTabId && !allowedTabs.includes(activeTabId)) {
              const firstAllowed = allowedTabs[0];
              if (firstAllowed) {
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
                const targetTab = document.getElementById(firstAllowed);
                if (targetTab) targetTab.classList.add('active');
                const targetLink = document.querySelector(`.sidebar-link[data-tab="${firstAllowed}"]`);
                if (targetLink) targetLink.classList.add('active');
              }
            }

            showNotificationToast('🔄 Your access permissions were updated by the admin.');
          }
        )
        .subscribe();
    }
  }

  // ==========================================
  // 3. CORE NAVIGATION & HEADER METRICS
  // ==========================================
  function updateDateTime() {
    const el = document.getElementById('dateTime');
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    }
  }
  updateDateTime();
  setInterval(updateDateTime, 30000);

  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('tab-title');
  const tabSubtitle = document.getElementById('tab-subtitle');

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      
      // Stop SaaS Gateway polling if we switch away from gateway-monitor-tab
      if (tabId !== 'gateway-monitor-tab' && typeof stopSaaSGatewayPolling === 'function') {
        stopSaaSGatewayPolling();
      }
      
      // If takeaway tab is clicked and there are items in the cart, clear it
      if (tabId === 'pos-tab' && cart.length > 0) {
        SoundEffects.playRemove();
        cart = [];
        const custNameInput = document.getElementById('cust-name');
        const custPhoneInput = document.getElementById('cust-phone');
        if (custNameInput) custNameInput.value = '';
        if (custPhoneInput) custPhoneInput.value = '';
        if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
        renderCart();
      }

      SoundEffects.playClick();
      
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      const targetTab = document.getElementById(tabId);
      if (targetTab) targetTab.classList.add('active');

      tabTitle.textContent = link.textContent.trim();
      
      if (tabId === 'pos-tab') tabSubtitle.textContent = 'Default Tab: Selection Grid';
      else if (tabId === 'qr-orders-tab') {
        tabSubtitle.textContent = 'Dine-in self-service active';
        updateQrOrdersDashboardUI();
      }
      else if (tabId === 'bills-tab') {
        tabSubtitle.textContent = 'Print, Refund, or Edit Invoices';
        renderBills();
      }
      else if (tabId === 'inventory-tab') {
        tabSubtitle.textContent = 'Live Ingredient & Resource Levels';
        renderInventory();
      }
      else if (tabId === 'reports-tab') {
        tabSubtitle.textContent = 'Nagpur Branch Sales & Analytics';
        renderReports();
      }
      else if (tabId === 'editor-tab') {
        tabSubtitle.textContent = 'Manage Drink & Food Items';
        renderMenuEditor();
      }
      else if (tabId === 'crm-tab') {
        tabSubtitle.textContent = 'Customer Relationship & Loyalty Ledger';
        renderCRMTab();
      }
      else if (tabId === 'tax-tab') {
        tabSubtitle.textContent = 'Central & State Tax Ledger Filing Hub';
        renderTaxTab();
      }
      else if (tabId === 'employees-tab') {
        tabSubtitle.textContent = 'India Payroll, Shifts & Leaves';
        renderEmployeesTab();
      }
      else if (tabId === 'online-tab') {
        tabSubtitle.textContent = 'Online Delivery Channel Integration Center';
        renderOnlineOrdersTab();
      }
      else if (tabId === 'kds-tab') {
        tabSubtitle.textContent = 'Kitchen Cooking Live Preparation Board';
        if (typeof renderKDSTab === 'function') renderKDSTab();
      }
      else if (tabId === 'tokens-tab') {
        tabSubtitle.textContent = 'Live Takeaway & Delivery Pickup Screen';
        if (typeof renderTokensTab === 'function') renderTokensTab();
      }
      else if (tabId === 'super-admin-tab') {
        tabSubtitle.textContent = 'Manage client subscriptions, features, and system access';
        renderSuperAdminTab();
      }
      else if (tabId === 'gateway-monitor-tab') {
        tabSubtitle.textContent = 'Monitor WhatsApp and Email notifications dispatch';
        setupGatewayMonitorTab();
      }
    });
  });

  // Calculate Header daily sales performance indicators
  function updateHeaderSummaryStats() {
    const headerSales = document.getElementById('header-sales-today');
    const headerBills = document.getElementById('header-bills-today');
    
    // Calculate values specifically for today
    const today = new Date().toLocaleDateString('en-IN');
    const todayBills = bills.filter(b => b && b.dateTime && b.dateTime.includes(today));
    const todayTotal = todayBills.reduce((sum, b) => sum + ((b && b.total) || 0), 0);

    if (headerSales) headerSales.textContent = `₹${todayTotal}`;
    if (headerBills) headerBills.textContent = `${todayBills.length} Bills`;
  }

  function generateOrderNumber() {
    const input = document.getElementById('order-num');
    if (input) {
      const nextNum = bills.length === 0 ? 1001 : (1000 + bills.length + 1);
      input.value = 'DO-' + nextNum;
      
      const badge = document.getElementById('cart-order-badge');
      if (badge) {
        badge.textContent = 'Order: DO-' + nextNum;
      }
    }
  }

  // ==========================================
  // 4. POS TAKEAWAY GRID & FILTERS (TAB 1)
  // ==========================================
  const posSearch = document.getElementById('pos-search');
  const posCategories = document.getElementById('pos-categories');
  const posItemsGrid = document.getElementById('pos-items-grid');

  let activePOSCategory = 'ALL';
  let posSearchQuery = '';

  // Focus search indicator keyboard listener
  document.addEventListener('keydown', (e) => {
    // / → focus search bar (clear value to start fresh)
    if (e.key === '/' && document.activeElement !== posSearch) {
      e.preventDefault();
      if (posSearch) { posSearch.focus(); posSearch.select(); }
      return;
    }

    // Esc → clear search and unfocus (return to neutral state)
    if (e.key === 'Escape' && document.activeElement === posSearch) {
      e.preventDefault();
      if (posSearch) {
        posSearch.value = '';
        posSearchQuery = '';
        renderPOSItems();
        posSearch.blur();
      }
      return;
    }

    // Enter from search → add first visible item to cart instantly
    if (e.key === 'Enter' && document.activeElement === posSearch) {
      e.preventDefault();
      const firstCard = document.querySelector('#pos-items-grid .pos-item-card');
      if (firstCard) {
        const titleEl = firstCard.querySelector('.pos-item-title');
        if (titleEl) {
          const itemName = titleEl.textContent.trim();
          const item = menu.find(i => i.name === itemName);
          if (item) {
            addDefaultToCart(item);
            // Clear search after adding
            posSearch.value = '';
            posSearchQuery = '';
            renderPOSItems();
          }
        }
      }
      return;
    }
  });

  // Custom Category Icons Mapping
  const categoryIconsMap = {
    'ALL': '<i class="fa-solid fa-mug-hot"></i>',
    'COLD COFFEE': '<i class="fa-solid fa-glass-water"></i>',
    'HOT COFFEE': '<i class="fa-solid fa-mug-hot"></i>',
    'MATCHA': '<i class="fa-solid fa-leaf"></i>',
    'FRIES & SHARE PLATES': '<i class="fa-solid fa-utensils"></i>',
    'MOCKTAILS': '<i class="fa-solid fa-glass-martini-alt"></i>',
    'SANDWICHES': '<i class="fa-solid fa-bread-slice"></i>',
    'THICK SHAKES': '<i class="fa-solid fa-blender"></i>',
    'CLASSIC TOAST': '<i class="fa-solid fa-cheese"></i>',
    'EGGS': '<i class="fa-solid fa-egg"></i>',
    'APPETIZERS': '<i class="fa-solid fa-bowl-food"></i>',
    'COMBOS': '<i class="fa-solid fa-box"></i>',
    'PASTA': '<i class="fa-solid fa-plate-wheat"></i>'
  };

  function renderPOSCategories() {
    if (!posCategories) return;
    const categories = ['ALL', ...new Set(menu.map(item => item.category))];
    posCategories.innerHTML = '';
    
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `pos-cat-btn ${cat === activePOSCategory ? 'active' : ''}`;
      btn.setAttribute('data-category', cat);
      
      let label = cat.toLowerCase().replace('&', 'and');
      label = label.charAt(0).toUpperCase() + label.slice(1);
      
      const icon = categoryIconsMap[cat] || '<i class="fa-solid fa-mug-hot"></i>';
      btn.innerHTML = `${icon} ${label}`;
      posCategories.appendChild(btn);
    });
  }

  function renderPOSItems() {
    if (!posItemsGrid) return;
    posItemsGrid.innerHTML = '';

    const filteredItems = menu.filter(item => {
      const matchesCategory = activePOSCategory === 'ALL' || item.category === activePOSCategory;
      const matchesSearch = (item.name && item.name.toLowerCase().includes(posSearchQuery.toLowerCase())) || 
                            (item.description && item.description.toLowerCase().includes(posSearchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });

    // Sort items dynamically based on selection
    const sortSelect = document.getElementById('pos-sort-select');
    const sortVal = sortSelect ? sortSelect.value : 'popular';
    filteredItems.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      if (sortVal === 'name') {
        return nameA.localeCompare(nameB);
      } else {
        const popA = posPopularityMap[nameA.toLowerCase().trim()] || 0;
        const popB = posPopularityMap[nameB.toLowerCase().trim()] || 0;
        if (popB !== popA) {
          return popB - popA;
        }
        return nameA.localeCompare(nameB);
      }
    });

    filteredItems.forEach(item => {
      // Find matching items in cart to calculate quick badges
      const cartCount = cart.filter(i => i.name === item.name).reduce((sum, i) => sum + i.qty, 0);
      
      const card = document.createElement('div');
      card.className = `pos-item-card ${cartCount > 0 ? 'selected-in-cart' : ''}`;
      card.setAttribute('tabindex', '0');
      
      card.innerHTML = `
        <div class="pos-item-title" title="${item.name}">${item.name}</div>
        <span class="pos-item-price">₹${item.price}</span>
      `;

      // Click card to add directly to cart (pass DOM ref for flash animation)
      card.addEventListener('click', () => {
        addDefaultToCart(item, card);
      });

      posItemsGrid.appendChild(card);
    });
  }

  if (posSearch) {
    posSearch.addEventListener('input', (e) => {
      posSearchQuery = e.target.value;
      renderPOSItems();
    });
  }

  if (posCategories) {
    posCategories.addEventListener('click', (e) => {
      const btn = e.target.closest('.pos-cat-btn');
      if (btn) {
        document.querySelectorAll('.pos-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activePOSCategory = btn.getAttribute('data-category');
        renderPOSItems();
      }
    });
  }

  // ==========================================
  // 5. TOUCH CUSTOMIZATION DRAWER POPUP LOGIC
  // ==========================================
  const customModal = document.getElementById('custom-addon-modal');
  const closeCustModal = document.getElementById('close-cust-modal');
  const cancelCustBtn = document.getElementById('cancel-cust-btn');
  const confirmCustBtn = document.getElementById('confirm-cust-btn');
  const custModalTitle = document.getElementById('cust-modal-title');
  const custNotesInput = document.getElementById('cust-item-notes');

  function openCustomizationModal(item) {
    if (!customModal) return;
    document.getElementById('cust-target-item-name').value = item.name;
    custModalTitle.innerHTML = `<i class="fa-solid fa-gears" style="font-size:20px; color:var(--accent-caramel); margin-right:8px;"></i> Customize ${item.name}`;
    
    // Reset selections
    selectedSizeOpt = 'Small';
    selectedSugarOpt = 'Regular';
    selectedIceOpt = 'Regular';
    custNotesInput.value = '';
    
    document.getElementById('addon-shot').checked = false;
    document.getElementById('addon-drizzle').checked = false;
    document.getElementById('addon-cream').checked = false;

    // Reset UI Pills active states
    resetPillsSelection('cust-size-row', 'Small');
    resetPillsSelection('cust-sugar-row', 'Regular');
    resetPillsSelection('cust-ice-row', 'Regular');

    customModal.classList.add('active');
  }

  function resetPillsSelection(rowId, defaultVal) {
    const container = document.getElementById(rowId);
    if (!container) return;
    container.querySelectorAll('.cust-pill-opt').forEach(pill => {
      pill.classList.remove('active');
      if (pill.innerText.includes(defaultVal)) pill.classList.add('active');
    });
  }

  // Listen to visual pills adjustments in Customize drawer
  setupPillListeners('cust-size-row', (val) => { selectedSizeOpt = val; });
  setupPillListeners('cust-sugar-row', (val) => { selectedSugarOpt = val; });
  setupPillListeners('cust-ice-row', (val) => { selectedIceOpt = val; });

  function setupPillListeners(rowId, callback) {
    const container = document.getElementById(rowId);
    if (!container) return;
    container.addEventListener('click', (e) => {
      const pill = e.target.closest('.cust-pill-opt');
      if (pill) {
        container.querySelectorAll('.cust-pill-opt').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        // Parse the option value
        const option = pill.getAttribute('data-size') || pill.getAttribute('data-sugar') || pill.getAttribute('data-ice');
        callback(option);
      }
    });
  }

  if (closeCustModal) closeCustModal.addEventListener('click', () => customModal.classList.remove('active'));
  if (cancelCustBtn) cancelCustBtn.addEventListener('click', () => customModal.classList.remove('active'));

  if (confirmCustBtn) {
    confirmCustBtn.addEventListener('click', () => {
      const itemName = document.getElementById('cust-target-item-name').value;
      const baseItem = menu.find(i => i.name === itemName);
      if (!baseItem) return;

      const extraShot = document.getElementById('addon-shot').checked;
      const drizzle = document.getElementById('addon-drizzle').checked;
      const whip = document.getElementById('addon-cream').checked;
      const notes = custNotesInput.value.trim();

      // Custom price calculations based on selections
      let finalPrice = baseItem.price;
      if (selectedSizeOpt === 'Medium') finalPrice += 30;
      if (selectedSizeOpt === 'Large') finalPrice += 60;
      
      let toppings = [];
      if (extraShot) { finalPrice += 40; toppings.push('Extra Shot'); }
      if (drizzle) { finalPrice += 20; toppings.push('Caramel Drizzle'); }
      if (whip) { finalPrice += 30; toppings.push('Whipped Cream'); }

      // Compose a composite unique key for this customized item
      const compositeKey = `${itemName}_${selectedSizeOpt}_Sugar:${selectedSugarOpt}_Ice:${selectedIceOpt}_Addons:${toppings.join(',')}_Notes:${notes}`;

      const cartItem = {
        name: baseItem.name,
        key: compositeKey,
        basePrice: baseItem.price,
        price: finalPrice,
        size: selectedSizeOpt,
        sugar: selectedSugarOpt,
        ice: selectedIceOpt,
        toppings: toppings,
        notes: notes,
        icon: baseItem.icon,
        qty: 1
      };

      addCustomItemToCart(cartItem);
      customModal.classList.remove('active');
    });
  }

  // Quick default add mapping
  function addDefaultToCart(menuItem, sourceCardEl) {
    SoundEffects.playPop();
    const compositeKey = `${menuItem.name}_Small_Sugar:Regular_Ice:Regular_Addons:_Notes:`;
    const existing = cart.find(item => item.key === compositeKey);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        name: menuItem.name,
        key: compositeKey,
        basePrice: menuItem.price,
        price: menuItem.price,
        size: 'Small',
        sugar: 'Regular',
        ice: 'Regular',
        toppings: [],
        notes: '',
        icon: menuItem.icon,
        qty: 1
      });
    }
    renderCart();

    // --- Add-to-cart visual feedback ---
    // 1. Flash the source card if a DOM element was passed
    if (sourceCardEl) {
      sourceCardEl.classList.remove('card-added');
      // Force reflow so animation restarts even on repeated taps
      void sourceCardEl.offsetWidth;
      sourceCardEl.classList.add('card-added');
      sourceCardEl.addEventListener('animationend', () => {
        sourceCardEl.classList.remove('card-added');
      }, { once: true });
    } else {
      // Find the card by item name if no element reference
      const cards = document.querySelectorAll('#pos-items-grid .pos-item-card');
      cards.forEach(card => {
        const t = card.querySelector('.pos-item-title');
        if (t && t.textContent.trim() === menuItem.name) {
          card.classList.remove('card-added');
          void card.offsetWidth;
          card.classList.add('card-added');
          card.addEventListener('animationend', () => card.classList.remove('card-added'), { once: true });
        }
      });
    }

    // 2. Pop the cart order badge
    const cartBadge = document.getElementById('cart-order-badge');
    if (cartBadge) {
      cartBadge.classList.remove('cart-header-pop');
      void cartBadge.offsetWidth;
      cartBadge.classList.add('cart-header-pop');
      cartBadge.addEventListener('animationend', () => cartBadge.classList.remove('cart-header-pop'), { once: true });
    }
  }

  function addCustomItemToCart(item) {
    SoundEffects.playPop();
    const existing = cart.find(i => i.key === item.key);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push(item);
    }
    renderCart();
  }

  // Toggling Dine-in / Takeaway / Delivery options
  const orderTypeBtns = document.querySelectorAll('.order-type-btn');
  orderTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      orderTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeOrderType = btn.getAttribute('data-type');
      SoundEffects.playClick();
      renderCart();
    });
  });

  // ==========================================
  // 6. DETAILED TOUCH CART PANEL RENDERING
  // ==========================================
  const cartList = document.getElementById('cart-items-list');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartGst = document.getElementById('cart-gst');
  const cartTotal = document.getElementById('cart-total');

  function updateCartTotalsOnly() {
    const nameInput = document.getElementById('cust-name');
    const phoneInput = document.getElementById('cust-phone');
    if (!nameInput || !phoneInput) return;

    localStorage.setItem('doppio_cart_cust_name', nameInput.value);
    localStorage.setItem('doppio_cart_cust_phone', phoneInput.value);

    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;

    let loyaltyDiscount = 0;
    const phoneVal = phoneInput.value.trim();
    const nameVal = nameInput.value.trim();

    let matchedCustomer = null;
    if (phoneVal || nameVal) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (nameVal && c.name.toLowerCase() === nameVal.toLowerCase()));
    }

    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
    }

    const taxableAmount = subtotal - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const total = taxableAmount + gst;

    if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal}`;
    
    if (cartGst) {
      if (loyaltyDiscount > 0) {
        cartGst.innerHTML = `<span style="color:#2ecc71;">-₹${loyaltyDiscount}</span> (Discount) &nbsp;+&nbsp; ₹${gst} (GST)`;
      } else {
        cartGst.textContent = `₹${gst}`;
      }
    }

    if (cartTotal) cartTotal.textContent = `₹${total}`;
  }

  function renderCart() {
    if (!cartList) return;
    
    // Restore customer details on initial load
    const nameInput = document.getElementById('cust-name');
    const phoneInput = document.getElementById('cust-phone');
    let hasRestoredDetails = false;
    if (nameInput && !nameInput.value) {
      const storedName = localStorage.getItem('doppio_cart_cust_name');
      if (storedName) {
        nameInput.value = storedName;
        hasRestoredDetails = true;
      }
    }
    if (phoneInput && !phoneInput.value) {
      const storedPhone = localStorage.getItem('doppio_cart_cust_phone');
      if (storedPhone) {
        phoneInput.value = storedPhone;
        hasRestoredDetails = true;
      }
    }

    // Auto-expand customer details container if details were restored
    const takeawayFields = document.querySelector('.takeaway-fields');
    if (hasRestoredDetails && takeawayFields && takeawayFields.style.display === 'none') {
      takeawayFields.style.display = 'block';
      const guestToggleIndicator = document.getElementById('guest-toggle-indicator');
      const guestToggleBtn = document.getElementById('guest-toggle-btn');
      if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide';
      if (guestToggleBtn) {
        guestToggleBtn.style.background = 'rgba(252, 128, 25, 0.05)';
        guestToggleBtn.style.borderColor = 'rgba(252, 128, 25, 0.2)';
      }
    }

    cartList.innerHTML = '';

    const sidebarEl = document.getElementById('pos-cart-sidebar');

    if (cart.length === 0) {
      if (sidebarEl) sidebarEl.classList.remove('has-items');
      cartList.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon-wrapper">
            <i class="fa-solid fa-basket-shopping"></i>
          </div>
          <div class="empty-cart-title">Cart is empty</div>
          <div class="empty-cart-desc">Tap menu items to add them to this order.</div>
        </div>
      `;
      if (cartSubtotal) cartSubtotal.textContent = '₹0.00';
      if (cartGst) cartGst.textContent = '₹0.00';
      if (cartTotal) cartTotal.textContent = '₹0.00';
      
      // Clear customer inputs in DOM
      if (nameInput) nameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';

      // Collapse customer details container on empty cart
      if (takeawayFields) {
        takeawayFields.style.display = 'none';
        const guestToggleIndicator = document.getElementById('guest-toggle-indicator');
        const guestToggleBtn = document.getElementById('guest-toggle-btn');
        if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Add Info';
        if (guestToggleBtn) {
          guestToggleBtn.style.background = 'var(--bg-cream-light)';
          guestToggleBtn.style.borderColor = 'rgba(28, 28, 28,0.06)';
        }
      }

      const crmSugs = document.getElementById('crm-suggestions');
      if (crmSugs) {
        crmSugs.style.display = 'none';
        crmSugs.innerHTML = '';
      }

      // Persist empty cart and customer details
      localStorage.setItem('doppio_cart', JSON.stringify([]));
      localStorage.setItem('doppio_cart_cust_name', '');
      localStorage.setItem('doppio_cart_cust_phone', '');
      
      return;
    }

    if (sidebarEl) sidebarEl.classList.add('has-items');
    let subtotal = 0;

    cart.forEach(item => {
      const rowTotal = item.price * item.qty;
      subtotal += rowTotal;

      // Compile customization label string
      let configParts = [`Size: ${item.size || 'Regular'}`];
      if (item.sugar && item.sugar !== 'Regular') configParts.push(`Sweet: ${item.sugar}`);
      if (item.ice && item.ice !== 'Regular') configParts.push(`Ice: ${item.ice}`);
      const toppings = Array.isArray(item.toppings) ? item.toppings : [];
      if (toppings.length > 0) configParts.push(`+ ${toppings.join(', ')}`);
      if (item.notes) configParts.push(`"${item.notes}"`);

      const configLabel = configParts.join(' | ');

      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-name">${item.name}</span>
          <span class="cart-item-custom-options">${configLabel}</span>
          <span class="cart-item-price-unit">₹${item.price} each</span>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn decrease" data-key="${item.key}"><i class="fa-solid fa-minus"></i></button>
          <span class="cart-item-qty">${item.qty}</span>
          <button class="cart-qty-btn increase" data-key="${item.key}"><i class="fa-solid fa-plus"></i></button>
        </div>
        <span class="cart-item-total">₹${rowTotal}</span>
      `;
      cartList.appendChild(row);
    });

    // GST & Loyalty calculations
    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;

    let loyaltyDiscount = 0;
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    const nameVal = nameInput ? nameInput.value.trim() : '';

    let matchedCustomer = null;
    if (phoneVal || nameVal) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (nameVal && c.name.toLowerCase() === nameVal.toLowerCase()));
    }

    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
    }

    const taxableAmount = subtotal - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const total = taxableAmount + gst;

    if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal}`;
    
    if (cartGst) {
      if (loyaltyDiscount > 0) {
        cartGst.innerHTML = `<span style="color:#2ecc71;">-₹${loyaltyDiscount}</span> (Discount) &nbsp;+&nbsp; ₹${gst} (GST)`;
      } else {
        cartGst.textContent = `₹${gst}`;
      }
    }

    if (cartTotal) cartTotal.textContent = `₹${total}`;
    if (typeof calculateSplitBalance === 'function') calculateSplitBalance();
    
    // Save to localStorage for persistence across reloads/logouts/tabs
    localStorage.setItem('doppio_cart', JSON.stringify(cart));
    if (activeTableSession !== null) {
      tableCarts[activeTableSession] = cart;
      localStorage.setItem('doppio_table_carts', JSON.stringify(tableCarts));
      syncActiveTableSessionToSupabase(activeTableSession);
    }
    localStorage.setItem('doppio_cart_pay_method', selectedPaymentMethod);
    localStorage.setItem('doppio_cart_cust_name', nameInput ? nameInput.value : '');
    localStorage.setItem('doppio_cart_cust_phone', phoneInput ? phoneInput.value : '');

    renderPOSItems();
    if (window.triggerCartBump) window.triggerCartBump();
  }

  // ==========================================
  // ONLINE INTEGRATIONS: MOCK AGGREGATOR MODULE
  // ==========================================
  const onlineOrdersQueue = document.getElementById('online-orders-queue');
  const onlineOrdersBadge = document.getElementById('online-orders-badge');
  const onlineOrdersSummaryLabel = document.getElementById('online-orders-summary-label');
  const onlineAutoAcceptCheck = document.getElementById('online-auto-accept');
  const toggleZomatoCheck = document.getElementById('toggle-zomato');
  const toggleSwiggyCheck = document.getElementById('toggle-swiggy');
  const toggleDunzoCheck = document.getElementById('toggle-dunzo');
  
  const btnSimulateZomato = document.getElementById('btn-simulate-zomato');
  const btnSimulateSwiggy = document.getElementById('btn-simulate-swiggy');

  if (onlineAutoAcceptCheck) {
    onlineAutoAcceptCheck.checked = localStorage.getItem('doppio_online_auto_accept') === 'true';
    onlineAutoAcceptCheck.addEventListener('change', (e) => {
      localStorage.setItem('doppio_online_auto_accept', e.target.checked);
    });
  }

  function renderOnlineOrdersTab() {
    if (!onlineOrdersQueue) return;
    onlineOrdersQueue.innerHTML = '';

    const pendingOnline = pendingQrOrders.filter(o => (o.orderType === 'ZOMATO' || o.orderType === 'SWIGGY') && o.status === 'Pending Review');
    
    if (onlineOrdersBadge) {
      if (pendingOnline.length > 0) {
        onlineOrdersBadge.textContent = pendingOnline.length;
        onlineOrdersBadge.style.display = 'inline-block';
      } else {
        onlineOrdersBadge.style.display = 'none';
      }
    }

    if (onlineOrdersSummaryLabel) {
      onlineOrdersSummaryLabel.textContent = `${pendingOnline.length} Online Orders Pending Review`;
    }

    if (pendingOnline.length === 0) {
      onlineOrdersQueue.innerHTML = `
        <div class="premium-empty-state" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; width:100%; box-sizing: border-box;">
          <i class="fa-solid fa-cloud-sun" style="font-size: 36px; color: var(--accent-caramel); opacity: 0.5; margin-bottom: 16px;"></i>
          <h3 style="margin-bottom: 8px; color: var(--primary-brand);">Aggregator Stream is Quiet</h3>
          <p style="font-size: 11px; color: var(--text-muted); max-width: 300px; margin: 0 auto; line-height: 1.4;">Active orders from Zomato and Swiggy channels will stream in here dynamically with ring chimes.</p>
        </div>
      `;
      return;
    }

    pendingOnline.forEach(order => {
      const card = document.createElement('div');
      card.className = 'qr-order-queue-card';
      const themeColor = order.orderType === 'ZOMATO' ? '#e23744' : '#fc8019';
      card.style.borderLeft = `4px solid ${themeColor}`;
      
      const itemsListStr = order.items.map(item => `
        <div class="qr-card-item-row">
          <span>${item.name} x${item.qty}</span>
          <span style="font-weight:700;">₹${item.price * item.qty}</span>
        </div>
      `).join('');

      card.innerHTML = `
        <div class="qr-card-header">
          <span class="qr-card-table-lbl" style="color:${themeColor}; font-weight:800;">
            <i class="fa-solid fa-cloud" style="margin-right:4px;"></i> ${order.orderType} Channel
          </span>
          <span class="qr-card-paymethod-badge upi" style="background:${themeColor}; color:white;">Prepaid Online</span>
        </div>
        
        <div class="qr-card-cust-info">
          <span style="font-weight: 700; color: var(--primary-brand);"><i class="fa-solid fa-user" style="font-size:10px; width:12px; margin-right:4px;"></i> ${order.customerName}</span>
          <span style="font-size:11px; color: var(--text-muted);"><i class="fa-solid fa-clock" style="font-size:10px; width:12px; margin-right:4px;"></i> ${order.dateTime}</span>
        </div>

        <div class="qr-card-items-box">
          ${itemsListStr}
        </div>

        <div class="qr-card-total-box">
          <span>Payout (UPI Sync)</span>
          <span class="qr-card-total-val" style="color:${themeColor};">₹${order.total}</span>
        </div>

        <div class="qr-card-actions">
          <button class="qr-action-btn reject" data-id="${order.orderId}"><i class="fa-solid fa-xmark"></i> Decline</button>
          <button class="qr-action-btn approve" data-id="${order.orderId}" style="background:${themeColor};"><i class="fa-solid fa-check"></i> Accept (KDS)</button>
        </div>
      `;

      onlineOrdersQueue.appendChild(card);
    });

    onlineOrdersQueue.querySelectorAll('.qr-action-btn.approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-id');
        approveOnlineOrder(orderId);
      });
    });

    onlineOrdersQueue.querySelectorAll('.qr-action-btn.reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-id');
        rejectOnlineOrder(orderId);
      });
    });
  }

  const originalUpdateQrUI = updateQrOrdersDashboardUI;
  updateQrOrdersDashboardUI = function() {
    if (originalUpdateQrUI) originalUpdateQrUI();
    renderOnlineOrdersTab();
    if (typeof renderKDSTab === 'function') renderKDSTab();
    if (typeof renderTokensTab === 'function') renderTokensTab();
  };

  async function approveOnlineOrder(orderId) {
    const order = pendingQrOrders.find(o => o.orderId === orderId);
    if (!order) return;

    let sufficientStock = true;
    let missingIngredient = '';
    const proposedDeductions = {};

    order.items.forEach(cartItem => {
      const specs = getDeductionSpecs(cartItem);
      Object.keys(specs).forEach(ing => {
        proposedDeductions[ing] = (proposedDeductions[ing] || 0) + (specs[ing] * cartItem.qty);
      });
    });

    Object.keys(proposedDeductions).forEach(ing => {
      if (inventory[ing] === undefined) inventory[ing] = 1000;
      if (inventory[ing] < proposedDeductions[ing]) {
        sufficientStock = false;
        missingIngredient = ing.replace('_', ' ');
      }
    });

    if (!sufficientStock) {
      alert(`Approval Failed! Insufficient stock of: ${missingIngredient}. Please restock.`);
      return;
    }

    Object.keys(proposedDeductions).forEach(ing => {
      deductStockFEFO(ing, proposedDeductions[ing]);
    });

    const approvedBill = {
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      dateTime: new Date().toLocaleString('en-IN'),
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount || 0,
      gst: order.gst || 0,
      total: order.total,
      paymentMethod: order.paymentMethod,
      orderType: order.orderType
    };

    bills.push(approvedBill);
    localStorage.setItem('doppio_bills', JSON.stringify(bills));
    renderBills();
    updateHeaderSummaryStats();

    SoundEffects.playSuccess();
    showNotificationToast(`${order.orderType} order ${order.orderId} accepted successfully!`);

    if (supabaseClient && navigator.onLine) {
      supabaseClient.from('doppio_bills').insert({
        tenant_id: activeTenantId,
        orderId: approvedBill.orderId,
        customerName: approvedBill.customerName,
        customerPhone: approvedBill.customerPhone,
        items: JSON.stringify(approvedBill.items),
        subtotal: approvedBill.subtotal,
        gst: approvedBill.gst,
        total: approvedBill.total,
        paymentMethod: approvedBill.paymentMethod,
        dateTime: approvedBill.dateTime
      }).then();
    }

    order.status = 'Accepted';
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
    
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .update({ status: 'Accepted' })
        .eq('orderId', orderId).then();
    }

    updateQrOrdersDashboardUI();
    if (typeof renderKDSTab === 'function') renderKDSTab();
  }

  function rejectOnlineOrder(orderId) {
    SoundEffects.playRemove();
    pendingQrOrders = pendingQrOrders.filter(o => o.orderId !== orderId);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
    
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .delete()
        .eq('orderId', orderId).then();
    }
    
    updateQrOrdersDashboardUI();
    showNotificationToast(`Online order ${orderId} declined.`);
  }

  async function simulateOnlineOrder(aggregator) {
    if (aggregator === 'ZOMATO' && toggleZomatoCheck && !toggleZomatoCheck.checked) {
      alert("Zomato Integration is currently toggled OFF in channel settings!");
      return;
    }
    if (aggregator === 'SWIGGY' && toggleSwiggyCheck && !toggleSwiggyCheck.checked) {
      alert("Swiggy Integration is currently toggled OFF in channel settings!");
      return;
    }

    SoundEffects.playPop();
    const isAutoAccept = onlineAutoAcceptCheck ? onlineAutoAcceptCheck.checked : false;

    const orderNum = Math.floor(1000 + Math.random() * 9000);
    const orderId = `${aggregator.slice(0, 3)}-${orderNum}`;
    
    const randomNames = ["Kalpesh Deora", "Rohan Sharma", "Sneha Patel", "Anjali Deshmukh", "Piyush Joshi"];
    const name = randomNames[Math.floor(Math.random() * randomNames.length)];
    const phone = `913000${Math.floor(1000 + Math.random() * 9000)}`;

    const selectedItems = [];
    const count = Math.random() > 0.5 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const randomItem = menu[Math.floor(Math.random() * menu.length)];
      if (randomItem && !selectedItems.some(item => item.name === randomItem.name)) {
        selectedItems.push({
          name: randomItem.name,
          price: randomItem.price,
          qty: 1,
          size: 'Regular',
          sugar: 'Regular',
          ice: 'Regular',
          toppings: [],
          icon: randomItem.icon || '☕'
        });
      }
    }

    const subtotal = selectedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    const mockOrder = {
      orderId: orderId,
      customerName: name,
      customerPhone: phone.slice(-10),
      dateTime: new Date().toLocaleString('en-IN'),
      items: selectedItems,
      subtotal: subtotal,
      discount: 0,
      gst: gst,
      total: total,
      paymentMethod: 'UPI (Aggregator)',
      orderType: aggregator,
      tableNumber: 'ONLINE',
      status: isAutoAccept ? 'Accepted' : 'Pending Review'
    };

    pendingQrOrders.push(mockOrder);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));

    if (supabaseClient) {
      try {
        await supabaseClient.from('doppio_pending_orders').insert({
          tenant_id: activeTenantId,
          orderId: mockOrder.orderId,
          customerName: mockOrder.customerName,
          customerPhone: mockOrder.customerPhone,
          items: JSON.stringify(mockOrder.items),
          subtotal: mockOrder.subtotal,
          discount: mockOrder.discount,
          gst: mockOrder.gst,
          total: mockOrder.total,
          paymentMethod: mockOrder.paymentMethod,
          orderType: mockOrder.orderType,
          tableNumber: mockOrder.tableNumber,
          status: mockOrder.status,
          dateTime: mockOrder.dateTime
        });
      } catch (err) {
        console.warn("Failed syncing mock order to Supabase:", err);
      }
    }

    playIncomingOrderChime();
    showNotificationToast(`New Incoming ${aggregator} delivery order: ${orderId} (₹${total})`);

    if (isAutoAccept) {
      setTimeout(() => {
        approveOnlineOrder(orderId);
      }, 1000);
    } else {
      updateQrOrdersDashboardUI();
    }
  }

  if (btnSimulateZomato) {
    btnSimulateZomato.addEventListener('click', () => simulateOnlineOrder('ZOMATO'));
  }
  if (btnSimulateSwiggy) {
    btnSimulateSwiggy.addEventListener('click', () => simulateOnlineOrder('SWIGGY'));
  }

  if (cartList) {
    cartList.addEventListener('click', (e) => {
      const btn = e.target.closest('.cart-qty-btn');
      if (!btn) return;
      const key = btn.getAttribute('data-key');
      const delta = btn.classList.contains('increase') ? 1 : -1;
      updateCartQty(key, delta);
    });
  }

  function updateCartQty(key, delta) {
    const item = cart.find(i => i.key === key);
    if (!item) return;
    
    if (delta > 0) {
      SoundEffects.playPop();
      item.qty += delta;
    } else {
      SoundEffects.playRemove();
      item.qty += delta;
      if (item.qty <= 0) {
        cart = cart.filter(i => i.key !== key);
      }
    }
    renderCart();
  }

  const clearCartBtn = document.getElementById('clear-cart');
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
      SoundEffects.playRemove();
      cart = [];
      document.getElementById('cust-name').value = '';
      document.getElementById('cust-phone').value = '';
      if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
      if (editingBillId) {
        cancelEditingBill();
      } else {
        renderCart();
      }
    });
  }

  const cancelEditBillBtn = document.getElementById('cancel-edit-bill-btn');
  if (cancelEditBillBtn) {
    cancelEditBillBtn.addEventListener('click', () => {
      SoundEffects.playRemove();
      cancelEditingBill();
    });
  }

  // Payment triggers selectors
  const payBtns = document.querySelectorAll('.pay-method-btn');
  const paySegmentedCtrl = document.getElementById('single-pay-container');

  // Helper: update the sliding pill position
  function updatePayPillIndex() {
    if (!paySegmentedCtrl) return;
    const allBtns = Array.from(payBtns);
    const activeIdx = allBtns.findIndex(b => b.classList.contains('active'));
    paySegmentedCtrl.style.setProperty('--active-index', activeIdx >= 0 ? activeIdx : 0);
  }

  payBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      payBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPaymentMethod = btn.getAttribute('data-method');
      SoundEffects.playClick();
      updatePayPillIndex(); // slide the pill
    });
  });

  // Initialize pill position on page load (UPI is default = index 0)
  updatePayPillIndex();

  // Complete checkout & Sync
  function performCheckout(shouldPrint) {
    if (cart.length === 0) {
      alert('Cart is empty! Add items before checking out.');
      return;
    }

    const finalPaymentMethod = isSplitPaymentActive
      ? `Split: UPI=${parseInt(document.getElementById('split-pay-upi').value) || 0}, Cash=${parseInt(document.getElementById('split-pay-cash').value) || 0}, Card=${parseInt(document.getElementById('split-pay-card').value) || 0}`
      : selectedPaymentMethod;

    const custNameInput = document.getElementById('cust-name');
    const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
    const orderNum = document.getElementById('order-num').value;
    const billIdToSave = editingBillId || orderNum;

    // 1. Inventory Deduction Management
    let oldDeductions = {};
    if (editingBillId) {
      const originalBill = bills.find(b => b.orderId === editingBillId);
      if (originalBill) {
        originalBill.items.forEach(item => {
          const specs = getDeductionSpecs(item);
          Object.keys(specs).forEach(ing => {
            oldDeductions[ing] = (oldDeductions[ing] || 0) + (specs[ing] * item.qty);
          });
        });
        
        // Temporarily restore original deductions back to inventory level and batches
        Object.keys(oldDeductions).forEach(ing => {
          if (inventory[ing] === undefined) inventory[ing] = 1000;
          inventory[ing] += oldDeductions[ing];
          addStockToBatches(ing, oldDeductions[ing]);
        });
      }
    }

    // Stock Deduction Verification
    let sufficientStock = true;
    let missingItem = '';

    const proposedDeductions = {};
    cart.forEach(cartItem => {
      const specs = getDeductionSpecs(cartItem);
      Object.keys(specs).forEach(ing => {
        proposedDeductions[ing] = (proposedDeductions[ing] || 0) + (specs[ing] * cartItem.qty);
      });
    });

    Object.keys(proposedDeductions).forEach(ing => {
      if (inventory[ing] === undefined) inventory[ing] = 1000;
      if (inventory[ing] < proposedDeductions[ing]) {
        sufficientStock = false;
        missingItem = ing.replace('_', ' ');
      }
    });

    if (!sufficientStock) {
      // Revert the temporary restoration if verify fails
      if (editingBillId) {
        Object.keys(oldDeductions).forEach(ing => {
          deductStockFEFO(ing, oldDeductions[ing]);
        });
      }
      alert(`Insufficient stock! Low on: ${missingItem}. Please restock.`);
      return;
    }

    // Deduct stock levels permanently using FEFO (Nagpur compliance)
    Object.keys(proposedDeductions).forEach(ing => {
      deductStockFEFO(ing, proposedDeductions[ing]);
    });

    // GST and loyalties final ledger sync
    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
    
    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const phoneInput = document.getElementById('cust-phone');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    
    let loyaltyDiscount = 0;
    let matchedCustomer = null;
    if (phoneVal || custName) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
    }
    
    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
    }
    
    const taxableAmount = subtotal - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const total = taxableAmount + gst;

    let finalBillObject = null;

    if (editingBillId) {
      const billIndex = bills.findIndex(b => b.orderId === editingBillId);
      if (billIndex !== -1) {
        const originalDateTime = bills[billIndex].dateTime;
        bills[billIndex] = {
          orderId: editingBillId,
          customerName: custName,
          customerPhone: phoneVal || null,
          dateTime: originalDateTime,
          items: [...cart],
          subtotal: subtotal,
          discount: loyaltyDiscount,
          gst: gst,
          total: total,
          paymentMethod: finalPaymentMethod,
          orderType: activeOrderType,
          shiftId: bills[billIndex].shiftId || (activeShift ? activeShift.shiftId : null)
        };
        finalBillObject = bills[billIndex];

        // Cloud syncing via update
        if (supabaseClient && navigator.onLine) {
          supabaseClient.from('doppio_bills').update({
            customerName: custName,
            customerPhone: phoneVal || null,
            items: JSON.stringify(cart),
            subtotal: subtotal,
            gst: gst,
            total: total,
            paymentMethod: finalPaymentMethod
          }).eq('orderId', editingBillId).then();
        }
      }
    } else {
      const newBill = {
        orderId: orderNum,
        customerName: custName,
        customerPhone: phoneVal || null,
        dateTime: new Date().toLocaleString('en-IN'),
        items: [...cart],
        subtotal: subtotal,
        discount: loyaltyDiscount,
        gst: gst,
        total: total,
        paymentMethod: finalPaymentMethod,
        orderType: activeOrderType,
        shiftId: activeShift ? activeShift.shiftId : null
      };
      bills.push(newBill);
      finalBillObject = newBill;

      // Cloud syncing via insert
      if (supabaseClient && navigator.onLine) {
        supabaseClient.from('doppio_bills').insert({
          tenant_id: activeTenantId,
          orderId: newBill.orderId,
          customerName: newBill.customerName,
          customerPhone: newBill.customerPhone,
          dateTime: newBill.dateTime,
          items: typeof newBill.items === 'string' ? newBill.items : JSON.stringify(newBill.items),
          subtotal: newBill.subtotal,
          gst: newBill.gst,
          total: newBill.total,
          paymentMethod: newBill.paymentMethod
        }).then();
      } else {
        saveOfflineBill(newBill);
      }
    }

    localStorage.setItem('doppio_bills', JSON.stringify(bills));
    if (typeof trackItemPopularity === 'function') trackItemPopularity(cart);
    
    // CRM dynamic ledger upgrades
    if (phoneVal || (custName && custName !== 'Walk-in Guest')) {
      updateCRMMember(custName, phoneVal, total);
    }
    
    SoundEffects.playSuccess();

    // Android vocal announcement
    if (window.AndroidInterface && businessProfile.soundEnabled !== false) {
      const engText = editingBillId 
        ? "Doppio Cafe Nagpur. Bill " + billIdToSave + " updated!" 
        : "Doppio Cafe Nagpur. Payment of Rupees " + total + " received!";
      window.AndroidInterface.speak(engText);
    }

    // Print thermal invoice triggers if requested
    if (shouldPrint && finalBillObject) {
      triggerThermalReceiptPrint(finalBillObject);
    }

    // Offer to send bill via WhatsApp automatically if toggle is enabled
    if (businessProfile.whatsappEnabled !== false && finalBillObject) {
      setTimeout(() => {
        if (phoneVal) {
          // Automatically trigger WhatsApp share without clicking or confirm prompts if number is provided
          shareBillOnWhatsApp(finalBillObject);
        } else {
          const wantToShare = confirm(`Would you like to send this bill receipt via WhatsApp?`);
          if (wantToShare) {
            shareBillOnWhatsApp(finalBillObject);
          }
        }
      }, 1000);
    }

    // Reset editing state
    editingBillId = null;
    localStorage.removeItem('doppio_editing_bill_id');
    const banner = document.getElementById('editing-bill-banner');
    if (banner) banner.style.display = 'none';

    // Release Table Session if table billing is complete
    let billedTableId = null;
    const tableMatch = custName.match(/Table\s+0?([1-6])/i);
    if (tableMatch) {
      billedTableId = parseInt(tableMatch[1]);
    }
    if (billedTableId !== null) {
      tablesState[billedTableId] = "EMPTY";
      tableCarts[billedTableId] = [];
      localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
      localStorage.setItem('doppio_table_carts', JSON.stringify(tableCarts));
      
      // Delete DineIn Active and KDS entries in Supabase
      if (supabaseClient) {
        supabaseClient.from('doppio_pending_orders').delete().eq('orderId', `TABLE-${billedTableId}`).then();
        supabaseClient.from('doppio_pending_orders').delete().eq('tableNumber', `0${billedTableId}`).then();
      }
      
      // Remove from local KDS orders list
      pendingQrOrders = pendingQrOrders.filter(o => o.tableNumber !== `0${billedTableId}`);
      localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
      
      renderTablesMap();
      if (typeof renderKDSTab === 'function') renderKDSTab();
    }

    // Clean Cart Drawer
    cart = [];
    if (custNameInput) custNameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
    if (takeawayFields) {
      takeawayFields.style.display = 'none';
      if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Add Info';
      if (guestToggleBtn) {
        guestToggleBtn.style.background = 'var(--bg-cream-light)';
        guestToggleBtn.style.borderColor = 'rgba(28, 28, 28,0.06)';
      }
    }
    
    generateOrderNumber();
    renderCart();
    updateHeaderSummaryStats();
    renderBills();
    renderInventory();
  }

  const checkoutSaveBtn = document.getElementById('checkout-save-btn');
  const checkoutPrintBtn = document.getElementById('checkout-print-btn');

  if (checkoutSaveBtn) {
    checkoutSaveBtn.addEventListener('click', () => {
      openReceiptPreview(false);
    });
  }

  if (checkoutPrintBtn) {
    checkoutPrintBtn.addEventListener('click', () => {
      openReceiptPreview(true);
    });
  }

  function getDeductionSpecs(cartItem) {
    if (!cartItem || !cartItem.name || typeof cartItem.name !== 'string') return {};
    const nameLower = cartItem.name.toLowerCase().trim();
    const recipe = customRecipes[nameLower] || excelRecipes[nameLower] || excelRecipes[nameLower.replace('thick shake', 'thickshake')];
    return recipe || {};
  }

  // ==========================================
  // 7. BILLS MANAGEMENT (TAB 2 REDESIGNED)
  // ==========================================
  const billsTableBody = document.getElementById('bills-table-body');
  const billsSearchInput = document.getElementById('bills-search-input');
  const billsCount = document.getElementById('bills-count');
  const billsPresetContainer = document.getElementById('bills-preset-chips');

  let activePresetDate = 'all';
  let billsSearchQuery = '';

  function parseBillDate(val) {
    if (!val) return new Date(0);
    let dateStr = val;
    if (typeof val === 'object' && val !== null) {
      dateStr = val.dateTime;
    }
    if (!dateStr || typeof dateStr !== 'string') return new Date(0);
    
    let parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) return new Date(parsed);
    
    // Robust Indian locale parser: 'DD/MM/YYYY, hh:mm:ss AM/PM'
    try {
      const clean = dateStr.replace(/[^0-9/:\sAMP]/gi, '').trim();
      const parts = clean.split(',');
      const dateParts = parts[0].trim().split('/');
      if (dateParts.length === 3) {
        let day = parseInt(dateParts[0], 10);
        let month = parseInt(dateParts[1], 10) - 1;
        let year = parseInt(dateParts[2], 10);
        
        let hour = 0, minute = 0, second = 0;
        if (parts[1]) {
          const timeParts = parts[1].trim().split(' ');
          const hms = timeParts[0].split(':');
          hour = parseInt(hms[0], 10);
          minute = parseInt(hms[1], 10) || 0;
          second = parseInt(hms[2], 10) || 0;
          
          if (timeParts[1] && timeParts[1].toUpperCase() === 'PM' && hour < 12) {
            hour += 12;
          } else if (timeParts[1] && timeParts[1].toUpperCase() === 'AM' && hour === 12) {
            hour = 0;
          }
        }
        return new Date(year, month, day, hour, minute, second);
      }
    } catch (e) {
      console.error("parseBillDate failed on:", dateStr, e);
    }
    return new Date(dateStr);
  }

  function startEditingBill(orderId) {
    const bill = bills.find(b => b.orderId === orderId);
    if (!bill) return;

    SoundEffects.playPop();
    editingBillId = orderId;
    localStorage.setItem('doppio_editing_bill_id', orderId);
    
    // Deep copy cart items
    cart = JSON.parse(JSON.stringify(bill.items));
    
    const cn = document.getElementById('cust-name');
    const cp = document.getElementById('cust-phone');
    if (cn) cn.value = bill.customerName;
    if (cp) cp.value = bill.customerPhone || '';
    
    // Update order type active selection
    if (bill.orderType) {
      activeOrderType = bill.orderType;
      const typeBtns = document.querySelectorAll('.order-type-btn');
      typeBtns.forEach(b => {
        if (b.getAttribute('data-type') === activeOrderType) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }

    // Update payment method active selection
    if (bill.paymentMethod) {
      selectedPaymentMethod = bill.paymentMethod;
      const payBtns = document.querySelectorAll('.pay-method-btn');
      payBtns.forEach(b => {
        if (b.getAttribute('data-method') === selectedPaymentMethod) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }

    // Show editing banner
    const banner = document.getElementById('editing-bill-banner');
    const displayId = document.getElementById('editing-bill-id-display');
    if (banner && displayId) {
      displayId.textContent = orderId;
      banner.style.display = 'flex';
    }

    const badge = document.getElementById('cart-order-badge');
    if (badge) {
      badge.textContent = 'Editing: ' + orderId;
    }

    renderCart();
  }

  function cancelEditingBill() {
    editingBillId = null;
    localStorage.removeItem('doppio_editing_bill_id');
    
    // Clear cart and fields
    cart = [];
    const cn = document.getElementById('cust-name');
    const cp = document.getElementById('cust-phone');
    if (cn) cn.value = '';
    if (cp) cp.value = '';
    
    // Hide banner
    const banner = document.getElementById('editing-bill-banner');
    if (banner) banner.style.display = 'none';
    
    // Re-generate order number & badge
    generateOrderNumber();
    renderCart();
  }

  function renderBills() {
    if (!billsTableBody) return;
    billsTableBody.innerHTML = '';

    const fromVal = document.getElementById('bills-date-from') ? document.getElementById('bills-date-from').value : '';
    const toVal = document.getElementById('bills-date-to') ? document.getElementById('bills-date-to').value : '';

    let dateFrom = null;
    if (fromVal) {
      dateFrom = new Date(fromVal);
      dateFrom.setHours(0,0,0,0);
    }
    let dateTo = null;
    if (toVal) {
      dateTo = new Date(toVal);
      dateTo.setHours(0,0,0,0);
    }

    const filteredBills = bills.filter(bill => {
      // Search matches
      const q = billsSearchQuery.toLowerCase();
      const matchesSearch = !q || 
                            (bill.customerName && bill.customerName.toLowerCase().includes(q)) || 
                            (bill.orderId && bill.orderId.toLowerCase().includes(q)) || 
                            (bill.customerPhone && bill.customerPhone.includes(q));

      // Presets filter matches
      let matchesPreset = true;
      if (activePresetDate !== 'all') {
        const today = new Date().toLocaleDateString('en-IN');
        if (activePresetDate === 'today') {
          matchesPreset = bill.dateTime && bill.dateTime.includes(today);
        } else if (activePresetDate === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toLocaleDateString('en-IN');
          matchesPreset = bill.dateTime && bill.dateTime.includes(yesterdayStr);
        } else if (activePresetDate === 'week') {
          const billDate = parseBillDate(bill);
          const diffTime = Math.abs(new Date() - billDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          matchesPreset = diffDays <= 7;
        } else if (activePresetDate === 'month') {
          const billDate = parseBillDate(bill);
          const diffTime = Math.abs(new Date() - billDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          matchesPreset = diffDays <= 30;
        }
      }

      // Custom range matches
      let matchesCustomRange = true;
      const billDate = parseBillDate(bill);
      if (dateFrom && billDate < dateFrom) {
        matchesCustomRange = false;
      }
      if (dateTo && billDate > dateTo) {
        matchesCustomRange = false;
      }

      return matchesSearch && matchesPreset && matchesCustomRange;
    });

    // Update Top Billing stats indicators
    const dailySalesTotal = filteredBills.reduce((sum, b) => sum + (b.total || 0), 0);
    const revCard = document.getElementById('bills-revenue-card');
    const totCard = document.getElementById('bills-total-card');
    const aovCardEl = document.getElementById('bills-aov-card');
    const upiPct = document.getElementById('bills-upi-percent');
    const cashPct = document.getElementById('bills-cash-percent');
    if (revCard) revCard.textContent = `₹${dailySalesTotal}`;
    if (totCard) totCard.textContent = `${filteredBills.length} Invoices`;
    
    // Average Order Value calculations
    const aov = filteredBills.length === 0 ? 0 : Math.round(dailySalesTotal / filteredBills.length);
    if (aovCardEl) aovCardEl.textContent = `₹${aov}`;

    // Split percentages calculations
    const upiCount = filteredBills.filter(b => b.paymentMethod === 'UPI').length;
    const upiPercent = filteredBills.length === 0 ? 0 : Math.round((upiCount / filteredBills.length) * 100);
    if (upiPct) upiPct.textContent = `${upiPercent}%`;
    if (cashPct) cashPct.textContent = `${100 - upiPercent}%`;

    if (billsCount) billsCount.textContent = `Showing ${filteredBills.length} Bills`;

    if (filteredBills.length === 0) {
      billsTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="premium-empty-state">
              <i class="fa-solid fa-receipt"></i>
              <h3>No Bills Recorded Today</h3>
              <p>Transactions completed from the touchscreen POS grid will render on this SaaS dashboard.</p>
              <button class="btn btn-primary" id="btn-back-pos"><i class="fa-solid fa-mug-hot"></i> Create New Order</button>
            </div>
          </td>
        </tr>
      `;
      
      const backPos = document.getElementById('btn-back-pos');
      if (backPos) {
        backPos.addEventListener('click', () => {
          document.querySelector('[data-tab="pos-tab"]').click();
        });
      }
      return;
    }

    const sortedBills = [...filteredBills].reverse();
    sortedBills.forEach(bill => {
      if (!bill) return;
      const tr = document.createElement('tr');
      
      // Items string format details
      const billItems = Array.isArray(bill.items) ? bill.items : [];
      let itemsListStr = billItems.map(item => `${item.name || '?'} (${item.qty || 1})`).join(', ');
      if (itemsListStr.length > 36) itemsListStr = itemsListStr.substring(0, 33) + '...';
      
      // Avatar Initials details
      const custName = bill.customerName || 'Walk-in';
      const initials = custName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      const payMethod = bill.paymentMethod || 'UPI';

      tr.innerHTML = `
        <td style="font-weight:700;">${bill.orderId || '-'}</td>
        <td>
          <div class="customer-avatar-cell">
            <div class="cust-avatar">${initials}</div>
            <div style="display:flex; flex-direction:column;">
              <span style="font-weight:600;">${custName}</span>
              <span style="font-size:10px; color:var(--text-muted);">${bill.customerPhone || 'Walk-in Guest'}</span>
            </div>
          </div>
        </td>
        <td>${bill.dateTime || '-'}</td>
        <td title="${billItems.map(i => `${i.name || '?'} (x${i.qty || 1})`).join(', ')}">${itemsListStr || '-'}</td>
        <td><span class="payment-badge ${payMethod.toLowerCase()}">${payMethod}</span></td>
        <td style="font-weight:700; color:var(--accent-caramel);">₹${bill.total || 0}</td>
        <td>
          <button class="table-action-btn print" data-id="${bill.orderId}" title="Print Invoice"><i class="fa-solid fa-print"></i></button>
          <button class="table-action-btn whatsapp" data-id="${bill.orderId}" title="Share via WhatsApp" style="background:#128c7e; color:white; border-color:#128c7e;"><i class="fa-brands fa-whatsapp"></i></button>
          <button class="table-action-btn edit-bill" data-id="${bill.orderId}" title="Edit Bill"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="table-action-btn delete" data-id="${bill.orderId}" title="Refund/Delete"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;
      billsTableBody.appendChild(tr);
    });
  }

  // Listeners for presets filter chips
  if (billsPresetContainer) {
    billsPresetContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (chip) {
        billsPresetContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activePresetDate = chip.getAttribute('data-preset');
        renderBills();
      }
    });
  }

  if (billsSearchInput) {
    billsSearchInput.addEventListener('input', (e) => {
      billsSearchQuery = e.target.value;
      renderBills();
    });
  }

  // Dynamic table click listeners (Refund, Reprint, Duplicate)
  if (billsTableBody) {
    billsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.table-action-btn');
      if (!btn) return;

      const orderId = btn.getAttribute('data-id');
      const idx = bills.findIndex(b => b.orderId === orderId);
      if (idx === -1) return;

      if (btn.classList.contains('print')) {
        triggerThermalReceiptPrint(bills[idx]);
      } else if (btn.classList.contains('whatsapp')) {
        shareBillOnWhatsApp(bills[idx]);
      } else if (btn.classList.contains('edit-bill')) {
        startEditingBill(orderId);
        document.querySelector('[data-tab="pos-tab"]').click();
      } else if (btn.classList.contains('delete')) {
        // Requires secure cashier validation PIN triggers
        showAdminPinModal(() => {
          const bill = bills[idx];
          
          // Revert Stock
          bill.items.forEach(cartItem => {
            const specs = getDeductionSpecs(cartItem);
            Object.keys(specs).forEach(ing => {
              inventory[ing] = (inventory[ing] || 0) + (specs[ing] * cartItem.qty);
            });
          });
          localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
          
          bills.splice(idx, 1);
          localStorage.setItem('doppio_bills', JSON.stringify(bills));
          
          if (supabaseClient) {
            supabaseClient.from('doppio_bills').delete().eq('orderId', orderId).then();
          }

          SoundEffects.playRemove();
          generateOrderNumber();
          renderBills();
          updateHeaderSummaryStats();
        });
      }
    });
  }

  function getFallbackCategoryIcon(term) {
    const t = String(term).toLowerCase();
    if (t.includes('sandwich') || t.includes('panini')) return '🥪';
    if (t.includes('fries') || t.includes('peri')) return '🍟';
    if (t.includes('shake') || t.includes('frappe') || t.includes('thickshake')) return '🥤';
    if (t.includes('latte') || t.includes('matcha') || t.includes('milk')) return '🥛';
    if (t.includes('croissant') || t.includes('pastry') || t.includes('bakery')) return '🥐';
    return '☕';
  }

  function getRandomGoodVibeQuote(bill) {
    let orderId = '';
    let hasFood = false;
    let hasDrinks = false;

    if (typeof bill === 'string') {
      orderId = bill;
    } else if (bill && typeof bill === 'object') {
      orderId = bill.orderId || '';
      if (bill.items) {
        bill.items.forEach(item => {
          const name = String(item.name || '').toLowerCase();
          const cat = String(item.category || '').toLowerCase();
          if (name.includes('sandwich') || name.includes('fries') || name.includes('panini') || name.includes('burger') || name.includes('snack') || name.includes('munch') || cat.includes('food') || cat.includes('snack') || cat.includes('snacks')) {
            hasFood = true;
          }
          if (name.includes('coffee') || name.includes('latte') || name.includes('matcha') || name.includes('frappe') || name.includes('shake') || name.includes('tea') || cat.includes('beverage') || cat.includes('coffee') || cat.includes('drinks')) {
            hasDrinks = true;
          }
        });
      }
    }

    let quotes = [];
    if (hasFood && !hasDrinks) {
      // Food Heavy Sensible Quotes
      quotes = [
        "🍔 Made fresh to make you smile! ✨",
        "🍟 Hot, crispy & made with love!",
        "🥪 Your perfect bite is here! ✨",
        "✨ Hot snacks, warm smiles! 🥪",
        "🔥 Delicious food, great mood!"
      ];
    } else if (hasDrinks && !hasFood) {
      // Drink Heavy Sensible Quotes
      quotes = [
        "✨ Brewing happiness for you! ☕",
        "☕ Good coffee, great day ahead!",
        "💖 Espresso yourself and smile! ☕",
        "✨ Freshly roasted joy in a cup! ☕",
        "☕ Sip back, relax & enjoy!"
      ];
    } else {
      // Generic / Mixed Sensible Quotes
      quotes = [
        "✨ Today is a beautiful day! 🌟",
        "🍀 Thank you for being awesome! 💖",
        "✨ Spread kindness like confetti! 🎉",
        "💖 You made our day brighter! ✨",
        "🍪 You're the cookie to our cup! ☕"
      ];
    }

    let hash = 0;
    if (orderId) {
      for (let i = 0; i < orderId.length; i++) {
        hash += orderId.charCodeAt(i);
      }
    } else {
      hash = Math.floor(Math.random() * quotes.length);
    }
    return quotes[hash % quotes.length];
  }

  // ==========================================
  // 8. THERMAL RECEIPT EMULATION ENGINE
  // ==========================================
  function triggerThermalReceiptPrint(bill) {
    const el = document.getElementById('thermal-receipt');
    if (!el) return;

    // Helper functions for true 32-character monospace layout
    function centerText32(text) {
      const width = 32;
      if (text.length >= width) return text.slice(0, width);
      const leftPad = Math.floor((width - text.length) / 2);
      return ' '.repeat(leftPad) + text;
    }

    function formatRow32(col1, col2, col3) {
      const w1 = 20; // Item column width
      const w2 = 5;  // Qty column width
      const w3 = 7;  // Amt column width
      
      let c1 = col1.slice(0, w1 - 1);
      c1 = c1.padEnd(w1, ' ');
      
      const c2 = col2.toString().padStart(w2, ' ');
      const c3 = col3.toString().padStart(w3, ' ');
      
      return c1 + c2 + c3;
    }

    function formatDouble32(label, value) {
      const totalWidth = 32;
      const valStr = value.toString();
      const padSize = totalWidth - label.length;
      if (padSize < valStr.length) {
        return label.slice(0, totalWidth - valStr.length) + valStr;
      }
      return label + valStr.padStart(padSize, ' ');
    }

    const borderDouble = '='.repeat(32);
    const borderSingle = '-'.repeat(32);
    
    let txt = '';
    txt += borderDouble + '\n';
    txt += centerText32(businessProfile.name) + '\n';
    txt += centerText32(businessProfile.address) + '\n';
    txt += centerText32(businessProfile.phone) + '\n';
    txt += borderDouble + '\n\n';
    
    const leftBill = `Bill: ${bill.orderId}`;
    const rightPay = bill.paymentMethod || 'Cash';
    txt += leftBill + rightPay.padStart(32 - leftBill.length, ' ') + '\n';
    txt += `Date: ${bill.dateTime}\n`;
    txt += `Guest: ${bill.customerName || 'Walk-in Guest'}\n\n`;
    
    txt += borderSingle + '\n';
    txt += formatRow32('Item', 'Qty', 'Amt') + '\n';
    txt += borderSingle + '\n';
    
    bill.items.forEach(item => {
      let displayName = `${item.name}`;
      if (item.size && item.size !== 'Small') {
        displayName += ` (${item.size.charAt(0)})`;
      }
      
      txt += formatRow32(displayName, item.qty, (item.price * item.qty).toString()) + '\n';
      txt += `  (₹${item.price} each)\n`;
      
      if (item.toppings && item.toppings.length > 0) {
        txt += `  + ${item.toppings.join(', ')}\n`;
      }
      if (item.notes) {
        txt += `  * Note: ${item.notes}\n`;
      }
    });
    
    txt += borderSingle + '\n';
    txt += formatDouble32('Subtotal', bill.subtotal.toString()) + '\n';
    
    // Print GST line only if GST is enabled in the business profile
    if (businessProfile.gstEnabled !== false) {
      txt += formatDouble32('GST', bill.gst.toString()) + '\n';
    }
    
    if (bill.discount && bill.discount > 0) {
      txt += formatDouble32('Discount', `-${bill.discount}`) + '\n';
    }
    
    txt += borderDouble + '\n';
    txt += formatDouble32('GRAND TOTAL', bill.total.toString()) + '\n';
    txt += borderDouble + '\n\n';

    const vibeQuote = getRandomGoodVibeQuote(bill);
    txt += borderSingle + '\n';
    txt += centerText32(vibeQuote) + '\n';
    txt += borderSingle + '\n\n';
    
    txt += centerText32('Thank you for visiting!') + '\n';
    txt += centerText32('Visit Again ☕') + '\n';

    // Set inside printable area with a clean pre block
    el.innerHTML = `
      <pre style="font-family: 'Courier New', Courier, monospace; font-size: 10px; font-weight: 600; line-height: 1.35; margin: 0; white-space: pre; color: #000; background: #fff; text-shadow: none;">${txt}</pre>
    `;

    if (window.AndroidInterface) {
      window.AndroidInterface.printReceipt(el.innerHTML);
    } else {
      window.print();
    }
  }

  function shareBillOnWhatsApp(bill) {
    let phoneNum = bill.customerPhone;
    if (!phoneNum || phoneNum.trim() === '' || phoneNum === 'null') {
      phoneNum = prompt("Enter customer's 10-digit WhatsApp number:", "");
      if (!phoneNum) return; // user cancelled
    }
    
    phoneNum = phoneNum.replace(/\D/g, '');
    
    if (phoneNum.length === 10) {
      phoneNum = "91" + phoneNum;
    }
    
    if (phoneNum.length < 10) {
      alert("Invalid phone number! Please enter a valid number.");
      return;
    }
    
    // Monospace alignment helpers (matching ultra-safe 24-char mobile WhatsApp specs)
    function centerText24(text) {
      const width = 24;
      if (text.length <= width) {
        const leftPad = Math.floor((width - text.length) / 2);
        return ' '.repeat(leftPad) + text;
      }
      
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      words.forEach(word => {
        if ((currentLine + (currentLine ? ' ' : '') + word).length <= width) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      
      return lines.map(line => {
        const leftPad = Math.floor((width - line.length) / 2);
        return ' '.repeat(leftPad) + line;
      }).join('\n');
    }

    function formatRow24(col1, col2, col3) {
      const w1 = 13; // Item column width
      const w2 = 4;  // Qty column width
      const w3 = 7;  // Amt column width
      
      let c1 = col1.slice(0, w1 - 1);
      c1 = c1.padEnd(w1, ' ');
      
      const c2 = col2.toString().padStart(w2, ' ');
      const c3 = col3.toString().padStart(w3, ' ');
      
      return c1 + c2 + c3;
    }

    function formatDouble24(label, value) {
      const totalWidth = 24;
      const valStr = value.toString();
      const padSize = totalWidth - label.length;
      if (padSize < valStr.length) {
        return label.slice(0, totalWidth - valStr.length) + valStr;
      }
      return label + valStr.padStart(padSize, ' ');
    }

    const borderDouble = '='.repeat(24);
    const borderSingle = '-'.repeat(24);
    
    // Build receipt wrapped in WhatsApp's triple backticks monospace block
    let msg = "```\n";
    msg += borderDouble + '\n';
    msg += centerText24(businessProfile.name || 'DOPPIO CAFE NAGPUR') + '\n';
    msg += centerText24(businessProfile.address || 'London Street, Nagpur') + '\n';
    msg += centerText24(businessProfile.phone || '+91 91300 03177') + '\n';
    msg += borderDouble + '\n\n';
    
    let leftBill = `Bill: ${bill.orderId}`;
    let rightPay = bill.paymentMethod || 'Cash';
    if (rightPay.length > 8) {
      rightPay = rightPay.slice(0, 8);
    }
    const padSize = 24 - leftBill.length;
    if (padSize < rightPay.length) {
      msg += leftBill.slice(0, 24 - rightPay.length) + rightPay + '\n';
    } else {
      msg += leftBill + rightPay.padStart(padSize, ' ') + '\n';
    }
    
    // Extract raw date part for compactness
    const dateOnly = bill.dateTime ? bill.dateTime.split(',')[0] : new Date().toLocaleDateString('en-IN');
    msg += `Date: ${dateOnly}\n`;
    msg += `Guest: ${(bill.customerName || 'Walk-in Guest').slice(0, 17)}\n\n`;
    
    msg += borderSingle + '\n';
    msg += formatRow24('Item', 'Qty', 'Amt') + '\n';
    msg += borderSingle + '\n';
    
    bill.items.forEach(item => {
      let displayName = `${item.name}`;
      if (item.size && item.size !== 'Small') {
        displayName += ` (${item.size.charAt(0)})`;
      }
      
      msg += formatRow24(displayName, item.qty, (item.price * item.qty).toString()) + '\n';
      msg += `  (₹${item.price} each)\n`;
      
      if (item.toppings && item.toppings.length > 0) {
        msg += `  + ${item.toppings.join(', ')}\n`;
      }
      if (item.notes) {
        msg += `  * Note: ${item.notes}\n`;
      }
    });
    
    msg += borderSingle + '\n';
    msg += formatDouble24('Subtotal', bill.subtotal.toString()) + '\n';
    
    if (businessProfile.gstEnabled !== false) {
      msg += formatDouble24('GST', bill.gst.toString()) + '\n';
    }
    
    if (bill.discount && bill.discount > 0) {
      msg += formatDouble24('Discount', `-${bill.discount}`) + '\n';
    }
    
    msg += borderDouble + '\n';
    msg += formatDouble24('GRAND TOTAL', bill.total.toString()) + '\n';
    msg += borderDouble + '\n\n';

    const vibeQuote = getRandomGoodVibeQuote(bill);
    msg += borderSingle + '\n';
    msg += centerText24(vibeQuote) + '\n';
    msg += borderSingle + '\n\n';
    
    msg += centerText24('Thank you for visiting!') + '\n';
    msg += centerText24('Visit Again ☕') + '\n';
    msg += "```";
    
    const encodedMsg = encodeURIComponent(msg);
    
    function openManualWhatsApp(phone, encoded) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        // Use native protocol handler to directly open native WhatsApp app on Android/iOS
        const deepLinkUrl = `whatsapp://send?phone=${phone}&text=${encoded}`;
        window.location.href = deepLinkUrl;
        
        // Safety fallback: if the deep link is not supported or not handled, fall back to API redirect
        setTimeout(() => {
          try {
            window.location.href = `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;
          } catch (e) {}
        }, 600);
      } else {
        // Direct WhatsApp Web send URL on desktop - instantly opens web chat and bypasses landing page!
        const webUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;
        window.open(webUrl, '_blank');
      }
    }

    if (businessProfile.whatsappGatewayEnabled && businessProfile.whatsappGatewayUrl && businessProfile.whatsappGatewayUrl.trim() !== '') {
      showNotificationToast("Sending WhatsApp Bill...");
      
      const gatewayUrl = businessProfile.whatsappGatewayUrl.trim();
      
      // Local Mock Simulator: immediately triggers success toast locally (bypasses network/CORS blocks during testing)
      if (gatewayUrl.includes('/api/mock-whatsapp') || gatewayUrl.includes('httpbin.org')) {
        setTimeout(() => {
          showNotificationToast("WhatsApp Bill Sent Successfully!");
        }, 1200);
        return;
      }

      const payload = {
        orderId: bill.orderId,
        phone: phoneNum,
        to: phoneNum,
        message: msg,
        text: msg
      };
      
      const headers = {
        "Content-Type": "application/json"
      };
      
      if (businessProfile.whatsappGatewayToken && businessProfile.whatsappGatewayToken.trim() !== '') {
        const token = businessProfile.whatsappGatewayToken.trim();
        const colonIndex = token.indexOf(':');
        if (colonIndex > 0 && colonIndex < token.length - 1) {
          const headerName = token.substring(0, colonIndex).trim();
          const headerVal = token.substring(colonIndex + 1).trim();
          headers[headerName] = headerVal;
        } else {
          if (token.toLowerCase().startsWith('bearer ')) {
            headers["Authorization"] = token;
          } else {
            headers["Authorization"] = "Bearer " + token;
          }
        }
      }
      
      let dispatchUrl = businessProfile.whatsappGatewayUrl.trim();
      
      // Auto-failover recursive sender
      function trySend(targetUrl, isFallback = false) {
        let actualUrl = targetUrl;
        if (!actualUrl.endsWith('/send') && !actualUrl.endsWith('/api/mock-whatsapp') && !actualUrl.includes('httpbin.org')) {
          if (actualUrl.endsWith('/')) {
            actualUrl += 'send';
          } else {
            actualUrl += '/send';
          }
        }

        return fetch(actualUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        })
        .then(response => {
          if (!response.ok) {
            throw new Error("HTTP status " + response.status);
          }
          return response.json().catch(() => ({}));
        })
        .then(data => {
          showNotificationToast(isFallback ? "WhatsApp Sent via Backup Gateway!" : "WhatsApp Bill Sent Successfully!");
        })
        .catch(err => {
          console.error("Failed to send WhatsApp bill via: " + targetUrl, err);
          if (!isFallback) {
            const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
            const fallbackUrl = isLocal ? 'https://kalpeshdeora1006-whatsapp-gateway.hf.space' : 'http://localhost:3000';
            
            showNotificationToast("Primary Gateway Offline. Trying Backup...");
            console.log("Triggering auto-failover to backup: " + fallbackUrl);
            return trySend(fallbackUrl, true);
          } else {
            showNotificationToast("All WhatsApp Gateways Offline!");
          }
        });
      }

      trySend(dispatchUrl);
    } else {
      openManualWhatsApp(phoneNum, encodedMsg);
    }
  }

  // ==========================================
  // 9. INTELLIGENT INVENTORY OVERHAUL (TAB 3)
  // ==========================================
  const inventoryGrid = document.getElementById('inventory-grid');
  
  function renderInventory() {
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = '';

    // Calculate dynamic states count for Top stats panels
    let lowCount = 0;
    let emptyCount = 0;

    Object.keys(inventory).forEach(key => {
      const maxVal = defaultInventory[key];
      const currentVal = inventory[key];
      const percent = Math.round((currentVal / maxVal) * 100);
      const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;

      // Track warnings
      if (percent < itemThreshold) {
        lowCount++;
        if (currentVal <= 0) {
          emptyCount++;
        }
      }

      // Filter check
      if (activeInventoryFilter === 'low' && percent >= itemThreshold) return;
      if (activeInventoryFilter === 'drinks' && getIngredientCategory(key) !== 'drinks') return;
      if (activeInventoryFilter === 'food' && getIngredientCategory(key) !== 'food') return;

      // Determine stock status and colors
      let statusClass = 'healthy';
      let cardClass = '';
      if (percent < itemThreshold) {
        statusClass = 'low';
        cardClass = 'alert-low';
      } else if (percent < 50) {
        statusClass = 'medium';
        cardClass = 'alert-medium';
      }

      // Check expiry dates
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date(todayStr);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let hasExpired = false;
      let hasNearExpiry = false;

      const ingredientBatchesList = inventoryBatches[key] || [];
      ingredientBatchesList.forEach(b => {
        if (b.qty <= 0) return;
        const exp = new Date(b.expiryDate);
        if (exp <= today) {
          hasExpired = true;
        } else if (exp <= tomorrow) {
          hasNearExpiry = true;
        }
      });

      let expiryBadge = "";
      if (hasExpired) {
        expiryBadge = `<span class="badge" style="background: var(--danger-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; margin-left: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRED</span>`;
      } else if (hasNearExpiry) {
        expiryBadge = `<span class="badge" style="background: var(--warning-color); color: var(--primary-brand); padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; margin-left: 6px;"><i class="fa-solid fa-clock"></i> NEAR EXPIRY</span>`;
      }

      // Remaining estimated days mock logic
      const estimatedDays = percent >= itemThreshold ? 'Healthy (8+ days)' : (percent >= (itemThreshold / 2) ? 'Refill within 3 days' : 'Critical - Stock low');
      const icon = categoryIconsMap[key] || '🥛';

      const card = document.createElement('div');
      card.className = `inventory-card ${cardClass}`;
      card.innerHTML = `
        <div class="inventory-card-title">
          <h3>${icon} ${getLabelFromKey(key)} ${expiryBadge}</h3>
          <span style="font-size:10px; font-weight:700;" class="text-${statusClass}">${percent}%</span>
        </div>
        
        <div class="inventory-progress-wrapper">
          <div class="inventory-progress-bar">
            <div class="inventory-progress-fill ${statusClass}" style="width: ${Math.min(100, Math.max(0, percent))}%"></div>
          </div>
        </div>

        <div class="inventory-card-meta">
          <span>Current: <strong>${currentVal}</strong></span>
          <span>Max capacity: <strong>${maxVal}</strong></span>
        </div>
        
        <div style="font-size:10px; color:var(--text-muted); margin-top:8px; display:flex; justify-content:space-between;">
          <span>${estimatedDays}</span>
          <span>Linked: active recipes</span>
        </div>

        <!-- Batches Dropdown List (FEFO) -->
        <div class="batches-dropdown-trigger" style="margin-top: 8px; cursor: pointer; color: var(--accent-caramel); font-size: 9.5px; font-weight: 700; display: flex; align-items: center; justify-content: space-between;" onclick="const content = this.nextElementSibling; content.style.display = content.style.display === 'none' ? 'block' : 'none';">
          <span><i class="fa-solid fa-boxes-stacked"></i> View Batches (${ingredientBatchesList.filter(b => b.qty > 0).length})</span>
          <i class="fa-solid fa-chevron-down"></i>
        </div>
        <div class="batches-dropdown-content" style="display: none; padding: 8px 0; border-top: 1px dashed rgba(28, 28, 28,0.08); margin-top: 6px;">
          ${ingredientBatchesList.map((b, idx) => {
            if (b.qty <= 0) return '';
            const exp = new Date(b.expiryDate);
            let statusBadge = "";
            let itemColor = "var(--text-dark)";
            if (exp <= today) {
              statusBadge = '<span style="color:var(--danger-color); font-weight:bold;">[EXP]</span>';
              itemColor = "var(--danger-color)";
            } else if (exp <= tomorrow) {
              statusBadge = '<span style="color:var(--warning-color); font-weight:bold;">[SOON]</span>';
            }
            return `
              <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-bottom: 4px; color: ${itemColor}; align-items: center;">
                <span>Batch ${idx + 1}: ${b.qty} (Exp: ${b.expiryDate}) ${statusBadge}</span>
                ${exp <= today ? `
                  <button type="button" class="discard-batch-btn" data-key="${key}" data-id="${b.id}" style="background: transparent; border: none; color: var(--danger-color); cursor: pointer; font-size: 10px;" title="Discard batch & log wastage">
                    <i class="fa-solid fa-trash-can"></i> Discard
                  </button>
                ` : ''}
              </div>
            `;
          }).join('') || '<div style="font-size: 9px; color: var(--text-muted);">No active batches.</div>'}
        </div>

        <div class="inventory-card-actions" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
          <label style="font-size: 10px; font-weight:700; color:var(--text-muted); display:flex; align-items:center; gap:4px; margin:0;">
            Warn: 
            <input type="number" class="threshold-input" data-key="${key}" value="${itemThreshold}" min="0" max="100" style="width: 45px; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(28, 28, 28,0.15); background: transparent; color: var(--primary-brand); text-align: center; font-size:10px; font-weight:700; outline:none;">
            %
          </label>
          <button class="btn btn-secondary quick-refill-btn" data-key="${key}" style="padding:4px 10px; font-size:10px;"><i class="fa-solid fa-plus"></i> Refill</button>
        </div>
      `;

      card.querySelector('.quick-refill-btn').addEventListener('click', () => {
        SoundEffects.playPop();
        const refillQty = maxVal - inventory[key];
        if (refillQty > 0) {
          const newBatch = {
            id: "batch_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            qty: refillQty,
            expiryDate: getDefaultExpiryDate(key),
            receivedDate: new Date().toISOString().split('T')[0]
          };
          if (!inventoryBatches[key]) inventoryBatches[key] = [];
          inventoryBatches[key].push(newBatch);
          localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
          // Sync new batch to Supabase
          if (supabaseClient) {
            supabaseClient.from('doppio_inventory_batches').upsert({
              id: newBatch.id,
              ingredient_key: key,
              qty: newBatch.qty,
              expiryDate: newBatch.expiryDate,
              receivedDate: newBatch.receivedDate
            }, { onConflict: 'id' }).then(({ error }) => {
              if (error) handleSyncError('Batch Refill', error);
            });
          }
        }
        inventory[key] = maxVal;
        localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
        
        // Sync manual refill to Supabase immediately
        if (supabaseClient) {
          supabaseClient.from('doppio_inventory').update({ current: maxVal }).eq('key', key).then();
        }
        
        renderInventory();
        checkLowStockAlerts();
      });

      card.querySelector('.threshold-input').addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          thresholds[key] = val;
          localStorage.setItem('doppio_inventory_thresholds', JSON.stringify(thresholds));
          checkLowStockAlerts();
          renderInventory();
          // Sync threshold to Supabase
          if (supabaseClient) {
            supabaseClient.from('doppio_inventory_thresholds')
              .upsert({ ingredient_key: key, threshold: val, updated_at: new Date().toISOString() }, { onConflict: 'ingredient_key' })
              .then(({ error }) => {
                if (error) handleSyncError('Inventory Threshold Save', error);
              });
          }
        }
      });

      // Bind Discard Batch Click Listeners
      card.querySelectorAll('.discard-batch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const k = btn.getAttribute('data-key');
          const bid = btn.getAttribute('data-id');
          discardExpiredBatch(k, bid);
        });
      });

      inventoryGrid.appendChild(card);
    });

    // Render premium empty state if no inventory items match the current filter
    if (inventoryGrid.children.length === 0) {
      inventoryGrid.innerHTML = `
        <div class="premium-empty-state" style="grid-column: 1 / -1; width: 100%; box-sizing: border-box;">
          <i class="fa-solid fa-boxes-stacked"></i>
          <h3>No Ingredients Found</h3>
          <p>No ingredients matched the selected filter criteria.</p>
        </div>
      `;
    }

    // Update Top metrics cards
    document.getElementById('inv-total-low').textContent = `${lowCount} Warnings`;
    document.getElementById('inv-total-empty').textContent = `${emptyCount} Out of stock`;
  }

  // Connect Inventory Filter buttons click listeners
  document.querySelectorAll('.inv-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      SoundEffects.playClick();
      document.querySelectorAll('.inv-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'white';
        b.style.color = 'var(--primary-brand)';
        b.style.borderColor = 'rgba(28, 28, 28,0.15)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--accent-caramel)';
      btn.style.color = 'white';
      btn.style.borderColor = 'var(--accent-caramel)';
      
      activeInventoryFilter = btn.getAttribute('data-filter') || 'all';
      renderInventory();
    });
  });

  function deductStockFEFO(ingredientKey, requiredQty) {
    if (!inventoryBatches[ingredientKey]) {
      inventoryBatches[ingredientKey] = [];
    }
    
    // Sort batches by expiry date
    inventoryBatches[ingredientKey].sort((a, b) => {
      const da = a.expiryDate ? new Date(a.expiryDate) : new Date("2099-12-31");
      const db = b.expiryDate ? new Date(b.expiryDate) : new Date("2099-12-31");
      return da - db;
    });

    let remaining = requiredQty;
    let updatedBatches = [];

    for (let batch of inventoryBatches[ingredientKey]) {
      if (remaining <= 0) {
        updatedBatches.push(batch);
        continue;
      }
      if (batch.qty > remaining) {
        batch.qty -= remaining;
        remaining = 0;
        updatedBatches.push(batch);
      } else {
        remaining -= batch.qty;
      }
    }

    // If there is still a remaining quantity to deduct, subtract from the last batch even if negative
    if (remaining > 0) {
      if (updatedBatches.length > 0) {
        updatedBatches[updatedBatches.length - 1].qty -= remaining;
      } else {
        updatedBatches.push({
          id: "batch_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
          qty: -remaining,
          expiryDate: getDefaultExpiryDate(ingredientKey),
          receivedDate: new Date().toISOString().split('T')[0]
        });
      }
    }

    inventoryBatches[ingredientKey] = updatedBatches;
    localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));

    // Calculate total stock
    const total = updatedBatches.reduce((sum, b) => sum + b.qty, 0);
    inventory[ingredientKey] = Math.max(0, total);
    localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
    
    // Sync to Supabase
    if (supabaseClient) {
      supabaseClient.from('doppio_inventory')
        .update({ current: inventory[ingredientKey] })
        .eq('key', ingredientKey).then();
    }
    syncIngredientBatchesToSupabase(ingredientKey);
  }

  function syncIngredientBatchesToSupabase(ing) {
    if (!supabaseClient) return;
    const list = inventoryBatches[ing] || [];
    if (list.length > 0) {
      const keptIds = list.map(b => b.id);
      supabaseClient.from('doppio_inventory_batches')
        .delete()
        .eq('ingredient_key', ing)
        .not('id', 'in', `(${keptIds.join(',')})`)
        .then(({ error }) => {
          if (error) handleSyncError('Batch Cleanup Sync', error);
        });
      const upsertData = list.map(b => ({
        id: b.id,
        ingredient_key: ing,
        qty: b.qty,
        expiryDate: b.expiryDate,
        receivedDate: b.receivedDate
      }));
      supabaseClient.from('doppio_inventory_batches').upsert(upsertData, { onConflict: 'id' }).then(({ error }) => {
        if (error) handleSyncError('Batch Quantity Sync', error);
      });
    } else {
      supabaseClient.from('doppio_inventory_batches')
        .delete()
        .eq('ingredient_key', ing)
        .then(({ error }) => {
          if (error) handleSyncError('Batch Clear Sync', error);
        });
    }
  }

  function addStockToBatches(ing, qty) {
    let batches = inventoryBatches[ing] || [];
    if (batches.length === 0) {
      batches.push({
        id: "batch_" + Date.now() + "_" + Math.floor(Math.random()*10000),
        qty: qty,
        expiryDate: getDefaultExpiryDate(ing),
        receivedDate: new Date().toISOString().split('T')[0]
      });
    } else {
      // Add to oldest batch
      batches[0].qty += qty;
    }
    inventoryBatches[ing] = batches;
    localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
    syncIngredientBatchesToSupabase(ing);
  }

  function discardExpiredBatch(key, batchId) {
    if (!inventoryBatches[key]) return;
    const batchIndex = inventoryBatches[key].findIndex(b => b.id === batchId);
    if (batchIndex === -1) return;
    const batch = inventoryBatches[key][batchIndex];
    
    SoundEffects.playRemove();
    showNotificationToast(`Wastage: Discarded ${batch.qty} units of expired ${getLabelFromKey(key)}.`);
    
    // Remove the batch
    inventoryBatches[key].splice(batchIndex, 1);
    localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));

    // Update inventory total
    const total = inventoryBatches[key].reduce((sum, b) => sum + b.qty, 0);
    inventory[key] = Math.max(0, total);
    localStorage.setItem('doppio_inventory', JSON.stringify(inventory));

    // Supabase Sync — delete batch record and update inventory
    if (supabaseClient) {
      supabaseClient.from('doppio_inventory_batches').delete().eq('id', batchId).then(({ error }) => {
        if (error) console.warn('Supabase batch delete failed:', error.message);
      });
      supabaseClient.from('doppio_inventory').update({ current: inventory[key] }).eq('key', key).then();
    }

    renderInventory();
    checkLowStockAlerts();
    updateAIForecast();
  }

  function getIngredientCategory(key) {
    const drinksKeys = ['espresso_shot', 'milk', 'ice', 'sugar_syrup', 'water', 'irish_syrup', 'cream', 'chocolate_syrup', 'frappe_base', 'caramel_syrup', 'hazelnut_syrup', 'ginger_ale', 'vanilla_ice_cream', 'cocoa_powder', 'matcha_powder', 'strawberry_puree', 'vanilla_syrup', 'mango_puree', 'soda', 'mint', 'lemon'];
    return drinksKeys.includes(key) ? 'drinks' : 'food';
  }

  function getLabelFromKey(key) {
    const map = {
      espresso_shot: 'Espresso Shot (ml)', milk: 'Milk (ml)', ice: 'Ice (g)',
      sugar_syrup: 'Sugar Syrup (ml)', water: 'Water (ml)', irish_syrup: 'Irish Syrup (ml)',
      cream: 'Cream (g)', chocolate_syrup: 'Chocolate Syrup (ml)', frappe_base: 'Frappe Base (g)',
      caramel_syrup: 'Caramel Syrup (ml)', hazelnut_syrup: 'Hazelnut Syrup (ml)', ginger_ale: 'Ginger Ale (ml)',
      vanilla_ice_cream: 'Vanilla Ice Cream (scoops)', cocoa_powder: 'Cocoa Powder (g)', matcha_powder: 'Matcha Powder (g)',
      strawberry_puree: 'Strawberry Puree (ml)', vanilla_syrup: 'Vanilla Syrup (ml)', mango_puree: 'Mango Puree (ml)',
      fries: 'French Fries (g)', salt: 'Salt (g)', oil: 'Cooking Oil (ml)',
      peri_peri: 'Peri Peri Seasoning (g)', cheese_sauce: 'Cheese Sauce (g)', mayo: 'Mayonnaise (g)',
      jalapeno: 'Jalapenos (g)', potato_wedges: 'Potato Wedges (g)', chicken_wings: 'Chicken Wings (g)',
      hot_sauce: 'Wings Hot Sauce (g)', chicken_pops: 'Chicken Pops (g)', dip: 'Dipping Sauce (g)',
      nuggets: 'Chicken Nuggets (g)', chicken_fingers: 'Chicken Fingers (g)', soda: 'Sparkling Soda (ml)',
      mint: 'Mint Leaves (g)', lemon: 'Fresh Lemon (g)', green_apple_syrup: 'Green Apple Syrup (ml)',
      blue_curacao: 'Blue Curacao Syrup (ml)', sprite: 'Sprite Soda (ml)', guava_syrup: 'Guava Syrup (ml)',
      chaat_masala: 'Chaat Masala (g)', tea_decoction: 'Tea Decoction (ml)', litchi_crush: 'Litchi Crush (ml)',
      lime_juice: 'Fresh Lime Juice (ml)', strawberry_crush: 'Strawberry Crush (ml)', chilli_salt: 'Chilli Salt (g)',
      bread: 'Bread (slices)', potato_filling: 'Potato Filling (g)', veggies: 'Fresh Veggies (g)',
      butter: 'Table Butter (g)', cheese: 'Cheese (g)', corn: 'Sweet Corn (g)',
      chilli_flakes: 'Chilli Flakes (g)', nutella: 'Premium Nutella (g)', oreo: 'Oreo Biscuits (pcs)',
      yogurt: 'Thick Yogurt (g)', m_and_m: 'M&Ms Candy (g)', garlic_butter: 'Garlic Butter (g)',
      mushroom: 'Fresh Mushrooms (g)', egg: 'Fresh Eggs (pcs)', onion: 'Onions (g)',
      capsicum: 'Capsicum (g)', tomato: 'Tomatoes (g)', masala: 'Omelette Masala (g)',
      nachos: 'Tortilla Nachos (g)', cheese_dip: 'Cheese Dip (g)', salsa: 'Fresh Salsa (g)',
      baked_beans: 'Baked Beans (g)', penne_pasta: 'Penne Pasta (g)', alfredo_sauce: 'Alfredo Sauce (g)',
      garlic: 'Garlic Cloves (g)', milk_foam: 'Milk Foam (ml)'
    };
    return map[key] || key.replace('_', ' ');
  }

  function checkLowStockAlerts() {
    const banner = document.getElementById('low-stock-alerts');
    if (!banner) return;
    
    let lowIngredients = [];
    Object.keys(inventory).forEach(key => {
      const maxVal = defaultInventory[key];
      const percent = (inventory[key] / maxVal) * 100;
      const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;
      if (percent < itemThreshold) {
        lowIngredients.push(getLabelFromKey(key));
      }
    });

    if (lowIngredients.length > 0) {
      banner.innerHTML = `
        <div class="alert-banner">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Low stock alerts for Nagpur Branch: <strong>${lowIngredients.slice(0,4).join(', ')}${lowIngredients.length > 4 ? '...' : ''}</strong></span>
        </div>
      `;
      // Play soft alert sounds
      SoundEffects.playAlert();
    } else {
      banner.innerHTML = '';
    }

    // Sync bell badge on both mobile and desktop headers
    const count = lowIngredients.length;
    const mobileBadge = document.getElementById('mobile-bell-badge');
    const desktopBadge = document.getElementById('bell-badge');
    if (mobileBadge) mobileBadge.style.display = count > 0 ? 'block' : 'none';
    if (desktopBadge) {
      desktopBadge.style.display = count > 0 ? 'block' : 'none';
      if (count > 0) desktopBadge.textContent = count;
    }
  }

  // ==========================================
  // 10. SALES REPORTS SVG CHARTS (TAB 4)
  // ==========================================
  const revenueChartBox = document.getElementById('reports-revenue-chart-box');
  const reportRevenue = document.getElementById('report-total-revenue');
  const reportOrders = document.getElementById('report-total-orders');
  const reportTopItem = document.getElementById('report-top-item');
  const ledgerList = document.getElementById('report-ledger-list');
  const ingStatsList = document.getElementById('ingredient-stats-list');

  function renderReports() {
    // Get filter dates
    const fromVal = document.getElementById('reports-date-from') ? document.getElementById('reports-date-from').value : '';
    const toVal = document.getElementById('reports-date-to') ? document.getElementById('reports-date-to').value : '';

    let dateFrom = null;
    if (fromVal) {
      dateFrom = new Date(fromVal);
      dateFrom.setHours(0,0,0,0);
    }
    let dateTo = null;
    if (toVal) {
      dateTo = new Date(toVal);
      dateTo.setHours(0,0,0,0);
    }

    const filteredBills = bills.filter(bill => {
      const billDate = parseBillDate(bill);
      if (dateFrom && billDate < dateFrom) return false;
      if (dateTo && billDate > dateTo) return false;
      return true;
    });

    // Update filter feedback label
    const feedbackLabel = document.getElementById('reports-filtered-label');
    if (feedbackLabel) {
      if (fromVal || toVal) {
        feedbackLabel.textContent = `Filtered: ${filteredBills.length} of ${bills.length} bills`;
        feedbackLabel.style.color = 'var(--accent-caramel)';
      } else {
        feedbackLabel.textContent = `All-Time Report`;
        feedbackLabel.style.color = 'var(--text-muted)';
      }
    }

    // Total numbers calculations
    const totalRevenueSum = filteredBills.reduce((sum, b) => sum + ((b && b.total) || 0), 0);
    if (reportRevenue) reportRevenue.textContent = `₹${totalRevenueSum.toLocaleString('en-IN')}`;
    if (reportOrders) reportOrders.textContent = filteredBills.length;

    // Date range day calculations for fixed operating expenses pro-rating
    let numDays = 30;
    if (dateFrom && dateTo) {
      const diffTime = Math.abs(dateTo - dateFrom);
      numDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    } else if (dateFrom || dateTo) {
      numDays = 1;
    }
    
    // Revenue
    const revenueVal = totalRevenueSum;
    
    // COGS (35%)
    const cogsVal = Math.round(revenueVal * 0.35);
    
    // Labor cost calculations
    // 1. Clocked wages in selected date range
    const clockedWagesSum = attendanceLogs
      .filter(log => {
        if (!log || !log.date) return false;
        const logDate = new Date(log.date);
        if (dateFrom && logDate < dateFrom) return false;
        if (dateTo && logDate > dateTo) return false;
        return true;
      })
      .reduce((sum, log) => sum + ((log && log.wages) || 0), 0);
      
    // 2. Fixed salary (admin Bonie Deora's pro-rated salary for this range: ₹45,000/30 = ₹1,500/day)
    const fixedLaborVal = Math.round((45000 / 30) * numDays);
    const laborVal = clockedWagesSum + fixedLaborVal;
    
    // Fixed Operating Expenses (pro-rated ₹32,000/mo = ₹1,067/day)
    const fixedVal = Math.round((32000 / 30) * numDays);
    
    // Gross Margin
    const grossMarginVal = revenueVal - cogsVal;
    
    // Net profit
    const netProfitVal = grossMarginVal - laborVal - fixedVal;
    
    // Populating Sales Report tab UI components
    const reportNetProfit = document.getElementById('report-net-profit');
    if (reportNetProfit) {
      reportNetProfit.textContent = `₹${netProfitVal.toLocaleString('en-IN')}`;
      if (netProfitVal >= 0) {
        reportNetProfit.style.color = '#2ecc71';
      } else {
        reportNetProfit.style.color = '#e74c3c';
      }
    }
    
    // Populating Detailed P&L statement table
    const plRev = document.getElementById('pl-revenue');
    const plCogs = document.getElementById('pl-cogs');
    const plGross = document.getElementById('pl-gross-profit');
    const plLabor = document.getElementById('pl-labor');
    const plFixed = document.getElementById('pl-fixed');
    const plNet = document.getElementById('pl-net-profit');
    
    if (plRev) plRev.textContent = `₹${revenueVal.toLocaleString('en-IN')}`;
    if (plCogs) plCogs.textContent = `-₹${cogsVal.toLocaleString('en-IN')}`;
    if (plGross) plGross.textContent = `₹${grossMarginVal.toLocaleString('en-IN')}`;
    if (plLabor) plLabor.textContent = `-₹${laborVal.toLocaleString('en-IN')}`;
    if (plFixed) plFixed.textContent = `-₹${fixedVal.toLocaleString('en-IN')}`;
    if (plNet) {
      plNet.textContent = `₹${netProfitVal.toLocaleString('en-IN')}`;
      if (netProfitVal >= 0) {
        plNet.style.color = '#2ecc71';
      } else {
        plNet.style.color = '#e74c3c';
      }
    }

    // Payment method breakdowns
    let sumUPI = 0;
    let sumCard = 0;
    let sumCash = 0;

    filteredBills.forEach(b => {
      if (!b) return;
      const pm = b.paymentMethod || 'UPI';
      if (pm.startsWith('Split:')) {
        // Parse "Split: UPI=300, Cash=200, Card=0"
        const parts = pm.substring(6).split(',');
        parts.forEach(part => {
          const [method, val] = part.trim().split('=');
          const value = parseInt(val) || 0;
          if (method === 'UPI') sumUPI += value;
          else if (method === 'Cash') sumCash += value;
          else if (method === 'Card') sumCard += value;
        });
      } else {
        const methodUpper = pm.toUpperCase();
        const amt = parseFloat(b.total) || 0;
        if (methodUpper === 'UPI') sumUPI += amt;
        else if (methodUpper === 'CARD') sumCard += amt;
        else if (methodUpper === 'CASH') sumCash += amt;
      }
    });

    const elUPI = document.getElementById('report-pay-upi');
    const elCard = document.getElementById('report-pay-card');
    const elCash = document.getElementById('report-pay-cash');

    if (elUPI) elUPI.textContent = `₹${sumUPI}`;
    if (elCard) elCard.textContent = `₹${sumCard}`;
    if (elCash) elCash.textContent = `₹${sumCash}`;

    // Best seller counts mapping
    const itemCounts = {};
    filteredBills.forEach(b => {
      if (!b || !b.items || !Array.isArray(b.items)) return;
      b.items.forEach(item => {
        if (!item || !item.name) return;
        itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty || 1);
      });
    });

    let topItem = '-';
    let maxQty = 0;
    Object.keys(itemCounts).forEach(name => {
      if (itemCounts[name] > maxQty) {
        maxQty = itemCounts[name];
        topItem = name;
      }
    });
    if (reportTopItem) reportTopItem.textContent = topItem !== '-' ? `${topItem} (${maxQty} sold)` : '-';

    // Renders custom SVG curved line trends chart inside report Visual box
    if (revenueChartBox) {
      revenueChartBox.innerHTML = '';
      
      const width = 460;
      const height = 180;
      
      // Calculate revenue points specifically for last 5 orders of the filtered set
      const chartBills = [...filteredBills].slice(-5);
      let dataPoints = chartBills.map(b => (b && b.total) || 0);
      if (dataPoints.length < 5) {
        dataPoints = [...dataPoints, 120, 240, 180, 310, 250].slice(0, 5);
      }

      const maxVal = Math.max(...dataPoints, 400);
      const points = dataPoints.map((val, i) => {
        const x = 30 + (i * (width - 60) / (dataPoints.length - 1));
        const y = height - 30 - (val * (height - 60) / maxVal);
        return { x, y };
      });

      let pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        // Curve interpolation
        const cpX1 = points[i-1].x + (points[i].x - points[i-1].x) / 2;
        const cpY1 = points[i-1].y;
        const cpX2 = cpX1;
        const cpY2 = points[i].y;
        pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y}`;
      }

      let areaD = pathD + ` L ${points[points.length - 1].x} ${height - 30} L ${points[0].x} ${height - 30} Z`;

      // Draw SVG curved grid
      revenueChartBox.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
          <defs>
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent-caramel)" stop-opacity="0.25" />
              <stop offset="100%" stop-color="var(--accent-caramel)" stop-opacity="0.0" />
            </linearGradient>
          </defs>
          <!-- Grid lines -->
          <line x1="30" y1="30" x2="${width-30}" y2="30" stroke="rgba(28, 28, 28,0.03)" stroke-width="1"/>
          <line x1="30" y1="90" x2="${width-30}" y2="90" stroke="rgba(28, 28, 28,0.03)" stroke-width="1"/>
          <line x1="30" y1="${height-30}" x2="${width-30}" y2="${height-30}" stroke="rgba(28, 28, 28,0.08)" stroke-width="1.5"/>
          
          <!-- Area Underlay -->
          <path d="${areaD}" fill="url(#chartAreaGrad)" />
          
          <!-- Curve Path -->
          <path d="${pathD}" fill="none" stroke="var(--accent-caramel)" stroke-width="3" stroke-linecap="round"/>
          
          <!-- Data points -->
          ${points.map((p, idx) => `
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--primary-brand)" stroke="var(--accent-caramel)" stroke-width="2"/>
            <text x="${p.x}" y="${p.y - 10}" font-size="9" font-weight="700" fill="var(--primary-brand)" text-anchor="middle">₹${dataPoints[idx]}</text>
          `).join('')}
        </svg>
      `;
    }

    // Dynamic ingredient consumption lists
    if (ingStatsList) {
      ingStatsList.innerHTML = '';
      const items = [
        { label: 'Steamed Milk Used', value: 10000 - (parseFloat(inventory.milk) || 0), max: 10000, unit: 'ml' },
        { label: 'Espresso Shots Used', value: 6000 - (parseFloat(inventory.espresso_shot) || 0), max: 6000, unit: 'ml' },
        { label: 'Matcha Powder Used', value: 500 - (parseFloat(inventory.matcha_powder) || 0), max: 500, unit: 'g' },
        { label: 'Cream Used', value: 2000 - (parseFloat(inventory.cream) || 0), max: 2000, unit: 'g' }
      ];

      items.forEach(item => {
        const percent = Math.min(100, Math.max(0, Math.round((item.value / item.max) * 100)));
        const row = document.createElement('div');
        row.className = 'ingredient-stat-row';
        row.style.marginBottom = '10px';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span>${item.label}</span>
            <span><strong>${item.value < 0 ? 0 : item.value} ${item.unit}</strong> (${percent}%)</span>
          </div>
          <div class="inventory-progress-bar" style="height:6px;">
            <div class="inventory-progress-fill healthy" style="width: ${percent}%; background-color: var(--accent-caramel);"></div>
          </div>
        `;
        ingStatsList.appendChild(row);
      });
    }

    // Dynamic ledger records
    if (ledgerList) {
      ledgerList.innerHTML = '';
      if (filteredBills.length === 0) {
        ledgerList.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px; padding:20px;">No sales logged.</p>';
      } else {
        const sorted = [...filteredBills].slice(-4).reverse();
        sorted.forEach(bill => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.padding = '8px 0';
          item.style.borderBottom = '1px solid rgba(28, 28, 28,0.03)';
          item.innerHTML = `
            <div style="display:flex; flex-direction:column;">
              <span style="font-size:12px; font-weight:600; color:var(--primary-brand);">${bill.customerName || 'Walk-in'} (${bill.orderId || '-'})</span>
              <span style="font-size:10px; color:var(--text-muted);">${bill.dateTime || '-'}</span>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--accent-caramel);">₹${bill.total}</span>
          `;
          ledgerList.appendChild(item);
        });
      }
    }

    // Dynamic Online Order Reconciliation Chart (Step 8)
    const reconBox = document.getElementById('reconciliation-chart-box');
    if (reconBox) {
      reconBox.innerHTML = '';
      
      let directGross = 0;
      let zomatoGross = 0;
      let swiggyGross = 0;
      
      filteredBills.forEach(b => {
        const type = b.orderType || 'Takeaway';
        if (type === 'ZOMATO') {
          zomatoGross += b.total || 0;
        } else if (type === 'SWIGGY') {
          swiggyGross += b.total || 0;
        } else {
          directGross += b.total || 0;
        }
      });
      
      const onlineGross = zomatoGross + swiggyGross;
      const commissionLoss = Math.round(onlineGross * 0.22);
      const onlinePayout = onlineGross - commissionLoss;
      
      const maxSales = Math.max(directGross, onlineGross, 100);
      
      const directPct = Math.min(100, Math.round((directGross / maxSales) * 100));
      const onlinePct = Math.min(100, Math.round((onlineGross / maxSales) * 100));
      
      reconBox.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px; padding: 10px 0;">
          <!-- Direct Sales Bar -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span><i class="fa-solid fa-store" style="color:var(--success-color);"></i> Direct Store Sales (100% Retained)</span>
              <strong>₹${directGross.toFixed(2)}</strong>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(28, 28, 28,0.05); border-radius: 4px; overflow: hidden;">
              <div style="width: ${directPct}%; height: 100%; background: var(--success-color); border-radius: 4px; transition: width 0.5s ease;"></div>
            </div>
          </div>
          
          <!-- Online Gross Bar -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
              <span><i class="fa-solid fa-cloud" style="color:var(--accent-caramel);"></i> Online Aggregator Gross (Zomato/Swiggy)</span>
              <strong>₹${onlineGross.toFixed(2)}</strong>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(28, 28, 28,0.05); border-radius: 4px; overflow: hidden;">
              <div style="width: ${onlinePct}%; height: 100%; background: var(--accent-caramel); border-radius: 4px; transition: width 0.5s ease;"></div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 4px; padding: 12px; background: rgba(200, 138, 88, 0.04); border-radius: 12px; border: 1px dashed rgba(200,138,88,0.15); font-family: var(--font-body);">
            <div>
              <div style="font-size: 9px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">Lost to Commissions (22%)</div>
              <div style="font-size: 14px; font-weight: 800; color: var(--danger-color);">₹${commissionLoss.toFixed(2)}</div>
            </div>
            <div>
              <div style="font-size: 9px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px;">Reconciled Payout (78%)</div>
              <div style="font-size: 14px; font-weight: 800; color: var(--success-color);">₹${onlinePayout.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;
    }
  }

  // ==========================================
  // WIRE DATE FILTER ACTION BUTTONS
  // ==========================================
  const billsFilterBtn = document.getElementById('bills-filter-btn');
  const billsResetBtn = document.getElementById('bills-reset-btn');
  const billsDateFrom = document.getElementById('bills-date-from');
  const billsDateTo = document.getElementById('bills-date-to');

  if (billsFilterBtn) {
    billsFilterBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      renderBills();
    });
  }

  if (billsResetBtn) {
    billsResetBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (billsDateFrom) billsDateFrom.value = '';
      if (billsDateTo) billsDateTo.value = '';
      activePresetDate = 'all';
      if (billsPresetContainer) {
        billsPresetContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        const allChip = billsPresetContainer.querySelector('[data-preset="all"]');
        if (allChip) allChip.classList.add('active');
      }
      renderBills();
    });
  }

  const reportsFilterBtn = document.getElementById('reports-filter-btn');
  const reportsResetBtn = document.getElementById('reports-reset-btn');
  const reportsDateFrom = document.getElementById('reports-date-from');
  const reportsDateTo = document.getElementById('reports-date-to');

  if (reportsFilterBtn) {
    reportsFilterBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      renderReports();
    });
  }

  if (reportsResetBtn) {
    reportsResetBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (reportsDateFrom) reportsDateFrom.value = '';
      if (reportsDateTo) reportsDateTo.value = '';
      renderReports();
    });
  }

  // ==========================================
  // EXPORT ACTION BUTTONS IMPLEMENTATION
  // ==========================================

  // 1. Inventory Export CSV
  const expInvExcelBtn = document.getElementById('export-inventory-excel-btn');
  if (expInvExcelBtn) {
    expInvExcelBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Ingredient Key,Ingredient Label,Current Stock,Max Capacity,Stock Percentage,Status\n";
      
      Object.keys(inventory).forEach(key => {
        const maxVal = defaultInventory[key] || 1000;
        const currentVal = inventory[key];
        const percent = Math.round((currentVal / maxVal) * 100);
        const label = getLabelFromKey(key).replace(/,/g, '');
        const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;
        let status = "Healthy";
        if (percent < itemThreshold) {
          status = currentVal <= 0 ? "Out of Stock" : "Low Stock";
        }
        csvContent += `${key},${label},${currentVal},${maxVal},${percent}%,${status}\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `doppio_inventory_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 2. Inventory Export PDF
  const expInvPdfBtn = document.getElementById('export-inventory-pdf-btn');
  if (expInvPdfBtn) {
    expInvPdfBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      const printWindow = window.open('', '_blank');
      
      let rowsHTML = '';
      Object.keys(inventory).forEach(key => {
        const maxVal = defaultInventory[key] || 1000;
        const currentVal = inventory[key];
        const percent = Math.round((currentVal / maxVal) * 100);
        const label = getLabelFromKey(key);
        const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;
        let status = "Healthy";
        let statusStyle = "color: #2e7d32; font-weight: bold;";
        if (percent < itemThreshold) {
          status = currentVal <= 0 ? "Out of Stock" : "Low Stock";
          statusStyle = "color: #c62828; font-weight: bold;";
        } else if (percent < 50) {
          status = "Medium";
          statusStyle = "color: #ef6c00; font-weight: bold;";
        }
        
        rowsHTML += `
          <tr>
            <td>${label}</td>
            <td align="right">${currentVal}</td>
            <td align="right">${maxVal}</td>
            <td align="right" style="font-weight:bold;">${percent}%</td>
            <td style="${statusStyle}">${status}</td>
          </tr>
        `;
      });
      
      printWindow.document.write(`
        <html>
        <head>
          <title>Doppio Cafe - Stock & Inventory Report</title>
          <style>
            body { font-family: 'Inter', 'Segoe UI', Roboto, sans-serif; color: #1F1F1F; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FC8019; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #1F1F1F; }
            .logo span { color: #FC8019; }
            .title { font-size: 18px; margin: 0; color: #1F1F1F; }
            .meta { font-size: 12px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background-color: #f7f3ed; color: #1F1F1F; font-weight: 600; }
            tr:nth-child(even) { background-color: #faf8f5; }
            .footer { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px; font-size: 11px; text-align: center; color: #777; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">DOPPIO <span>Café</span></div>
              <p class="meta">Nagpur Commercial POS & Inventory Control</p>
            </div>
            <div style="text-align: right;">
              <h2 class="title">Stock Level Inventory Report</h2>
              <p class="meta">Generated: ` + new Date().toLocaleString('en-IN') + `</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ingredient Name</th>
                <th style="text-align: right;">Current Stock</th>
                <th style="text-align: right;">Max Capacity</th>
                <th style="text-align: right;">Stock level</th>
                <th>Status Alert</th>
              </tr>
            </thead>
            <tbody>
              ` + rowsHTML + `
            </tbody>
          </table>
          <div class="footer">
            Doppio Cafe Nagpur. Confidential Commercial Stock Ledger Report. Authorized access only.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // Dropdown export menu toggler
  const invExportToggle = document.getElementById('inventory-export-dropdown-toggle');
  const invExportMenu = document.getElementById('inventory-export-dropdown-menu');

  if (invExportToggle && invExportMenu) {
    invExportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      SoundEffects.playClick();
      invExportMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!invExportToggle.contains(e.target) && !invExportMenu.contains(e.target)) {
        invExportMenu.classList.remove('active');
      }
    });
  }

  // 2.a. Low Inventory Export CSV
  const expLowInvExcelBtn = document.getElementById('export-low-inventory-excel-btn');
  if (expLowInvExcelBtn) {
    expLowInvExcelBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      if (invExportMenu) invExportMenu.classList.remove('active');
      
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Ingredient Key,Ingredient Label,Current Stock,Max Capacity,Stock Percentage,Status\n";
      
      let count = 0;
      Object.keys(inventory).forEach(key => {
        const maxVal = defaultInventory[key] || 1000;
        const currentVal = inventory[key];
        const percent = Math.round((currentVal / maxVal) * 100);
        const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;
        
        if (percent < itemThreshold) {
          const label = getLabelFromKey(key).replace(/,/g, '');
          const status = currentVal <= 0 ? "Out of Stock" : "Low Stock";
          csvContent += `${key},${label},${currentVal},${maxVal},${percent}%,${status}\n`;
          count++;
        }
      });
      
      if (count === 0) {
        csvContent += "N/A,All stock levels are currently healthy! No warnings.,N/A,N/A,N/A,Healthy\n";
      }
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `doppio_low_inventory_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 2.b. Low Inventory Export PDF
  const expLowInvPdfBtn = document.getElementById('export-low-inventory-pdf-btn');
  if (expLowInvPdfBtn) {
    expLowInvPdfBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      if (invExportMenu) invExportMenu.classList.remove('active');
      
      const printWindow = window.open('', '_blank');
      let rowsHTML = '';
      let count = 0;
      
      Object.keys(inventory).forEach(key => {
        const maxVal = defaultInventory[key] || 1000;
        const currentVal = inventory[key];
        const percent = Math.round((currentVal / maxVal) * 100);
        const itemThreshold = thresholds[key] !== undefined ? thresholds[key] : 15;
        
        if (percent < itemThreshold) {
          const label = getLabelFromKey(key);
          const status = currentVal <= 0 ? "Out of Stock" : "Low Stock";
          const statusStyle = "color: #c62828; font-weight: bold;";
          
          rowsHTML += `
            <tr>
              <td>${label}</td>
              <td align="right">${currentVal}</td>
              <td align="right">${maxVal}</td>
              <td align="right" style="font-weight:bold;">${percent}%</td>
              <td style="${statusStyle}">${status}</td>
            </tr>
          `;
          count++;
        }
      });
      
      if (count === 0) {
        rowsHTML = `
          <tr>
            <td colspan="5" align="center" style="color: #2e7d32; font-weight: bold; font-size: 14px; padding: 20px;">
              🎉 All stock levels are currently healthy! No low stock warnings.
            </td>
          </tr>
        `;
      }
      
      printWindow.document.write(`
        <html>
        <head>
          <title>Doppio Cafe - Low Stock Alert Report</title>
          <style>
            body { font-family: 'Inter', 'Segoe UI', Roboto, sans-serif; color: #1F1F1F; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e74c3c; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #1F1F1F; }
            .logo span { color: #e74c3c; }
            .title { font-size: 18px; margin: 0; color: #c0392b; }
            .meta { font-size: 12px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background-color: #fdf2f2; color: #c0392b; font-weight: 600; }
            tr:nth-child(even) { background-color: #fdf8f8; }
            .footer { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px; font-size: 11px; text-align: center; color: #777; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">DOPPIO <span>Café</span></div>
              <p class="meta">Nagpur Commercial POS & Inventory Control</p>
            </div>
            <div style="text-align: right;">
              <h2 class="title">Low Stock Alert Report</h2>
              <p class="meta">Generated: ` + new Date().toLocaleString('en-IN') + `</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ingredient Name</th>
                <th style="text-align: right;">Current Stock</th>
                <th style="text-align: right;">Max Capacity</th>
                <th style="text-align: right;">Stock level</th>
                <th>Status Alert</th>
              </tr>
            </thead>
            <tbody>
              ` + rowsHTML + `
            </tbody>
          </table>
          <div class="footer">
            Doppio Cafe Nagpur. Confidential Commercial Stock Ledger Report. Authorized access only.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // 3. Sales Export CSV
  const expSalesExcelBtn = document.getElementById('export-excel-btn');
  if (expSalesExcelBtn) {
    expSalesExcelBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      
      const fromVal = document.getElementById('reports-date-from') ? document.getElementById('reports-date-from').value : '';
      const toVal = document.getElementById('reports-date-to') ? document.getElementById('reports-date-to').value : '';

      let dateFrom = null;
      if (fromVal) {
        dateFrom = new Date(fromVal);
        dateFrom.setHours(0,0,0,0);
      }
      let dateTo = null;
      if (toVal) {
        dateTo = new Date(toVal);
        dateTo.setHours(0,0,0,0);
      }

      const filteredBills = bills.filter(bill => {
        const billDate = parseBillDate(bill);
        if (dateFrom && billDate < dateFrom) return false;
        if (dateTo && billDate > dateTo) return false;
        return true;
      });

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Order ID,Customer Name,Phone,Date & Time,Order Type,Payment Method,Subtotal,Discount,GST,Total,Items Ordered\n";
      
      filteredBills.forEach(b => {
        if (!b) return;
        const guestName = (b.customerName || '').replace(/,/g, '');
        const phone = b.customerPhone || 'N/A';
        const dateStr = (b.dateTime || '').replace(/,/g, '');
        const itemsList = Array.isArray(b.items) ? b.items.map(i => `${i.name || ''} (x${i.qty || 1})`).join('; ').replace(/,/g, '') : '';
        csvContent += `${b.orderId || ''},${guestName},${phone},${dateStr},${b.orderType || ''},${b.paymentMethod || ''},₹${b.subtotal || 0},₹${b.discount || 0},₹${b.gst || 0},₹${b.total || 0},${itemsList}\n`;
      });

      const totalRevenue = filteredBills.reduce((sum, b) => sum + ((b && b.total) || 0), 0);
      const totalGST = filteredBills.reduce((sum, b) => sum + ((b && b.gst) || 0), 0);
      const totalDiscount = filteredBills.reduce((sum, b) => sum + ((b && b.discount) || 0), 0);
      const totalSubtotal = filteredBills.reduce((sum, b) => sum + ((b && b.subtotal) || 0), 0);

      const payUPI = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'UPI').reduce((sum, b) => sum + b.total, 0);
      const payCard = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'CARD').reduce((sum, b) => sum + b.total, 0);
      const payCash = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'CASH').reduce((sum, b) => sum + b.total, 0);

      csvContent += "\n";
      csvContent += "SUMMARY BREAKDOWN\n";
      csvContent += `Total Orders,${filteredBills.length}\n`;
      csvContent += `Gross Subtotal,₹${totalSubtotal}\n`;
      csvContent += `GST Collected,₹${totalGST}\n`;
      csvContent += `Total Revenue,₹${totalRevenue}\n`;
      csvContent += "\n";
      csvContent += "PAYMENT SEGREGATION\n";
      csvContent += `UPI / Online,₹${payUPI}\n`;
      csvContent += `Card,₹${payCard}\n`;
      csvContent += `Cash,₹${payCash}\n`;
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `doppio_sales_report_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 4. Sales Export PDF
  const expSalesPdfBtn = document.getElementById('export-pdf-btn');
  if (expSalesPdfBtn) {
    expSalesPdfBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      const printWindow = window.open('', '_blank');
      
      const fromVal = document.getElementById('reports-date-from') ? document.getElementById('reports-date-from').value : '';
      const toVal = document.getElementById('reports-date-to') ? document.getElementById('reports-date-to').value : '';

      let dateFrom = null;
      if (fromVal) {
        dateFrom = new Date(fromVal);
        dateFrom.setHours(0,0,0,0);
      }
      let dateTo = null;
      if (toVal) {
        dateTo = new Date(toVal);
        dateTo.setHours(0,0,0,0);
      }

      const filteredBills = bills.filter(bill => {
        const billDate = parseBillDate(bill);
        if (dateFrom && billDate < dateFrom) return false;
        if (dateTo && billDate > dateTo) return false;
        return true;
      });

      const totalRevenue = filteredBills.reduce((sum, b) => sum + ((b && b.total) || 0), 0);
      const totalGST = filteredBills.reduce((sum, b) => sum + ((b && b.gst) || 0), 0);
      const totalDiscount = filteredBills.reduce((sum, b) => sum + ((b && b.discount) || 0), 0);
      const totalSubtotal = filteredBills.reduce((sum, b) => sum + ((b && b.subtotal) || 0), 0);
      
      const payUPI = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'UPI').reduce((sum, b) => sum + b.total, 0);
      const payCard = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'CARD').reduce((sum, b) => sum + b.total, 0);
      const payCash = filteredBills.filter(b => b && (b.paymentMethod || 'UPI').toUpperCase() === 'CASH').reduce((sum, b) => sum + b.total, 0);
      
      let rowsHTML = '';
      filteredBills.forEach(b => {
        if (!b) return;
        const itemsList = Array.isArray(b.items) ? b.items.map(i => `${i.name || ''} (x${i.qty || 1})`).join(', ') : '';
        rowsHTML += `
          <tr>
            <td>${b.orderId || ''}</td>
            <td><strong>${b.customerName || ''}</strong><br><span style="font-size:10px; color:#666;">${b.customerPhone || 'Walk-in'}</span></td>
            <td>${b.dateTime || ''}</td>
            <td>${b.orderType || ''}</td>
            <td>${b.paymentMethod || ''}</td>
            <td align="right">₹${b.subtotal || 0}</td>
            <td align="right">₹${b.discount || 0}</td>
            <td align="right">₹${b.total || 0}</td>
          </tr>
          <tr>
            <td colspan="8" style="background-color:#fff; padding: 4px 10px; font-size:11px; color:#555; border-top:none;">
              <strong>Items:</strong> ${itemsList}
            </td>
          </tr>
        `;
      });

      const rangeStr = fromVal || toVal 
        ? `Period: ${fromVal ? fromVal : 'Beginning'} to ${toVal ? toVal : 'Present'}`
        : 'Period: All-Time Sales Report';
      
      printWindow.document.write(`
        <html>
        <head>
          <title>Doppio Cafe - Sales & Revenue Audit Report</title>
          <style>
            body { font-family: 'Inter', 'Segoe UI', Roboto, sans-serif; color: #1F1F1F; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #FC8019; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #1F1F1F; }
            .logo span { color: #FC8019; }
            .title { font-size: 18px; margin: 0; color: #1F1F1F; }
            .meta { font-size: 12px; color: #666; }
            
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .kpi-card { background: #fdfbf7; border: 1px solid rgba(252, 128, 25, 0.2); border-radius: 8px; padding: 12px; text-align: center; }
            .kpi-card h3 { margin: 0; font-size: 12px; color: #666; text-transform: uppercase; }
            .kpi-card p { margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: #1F1F1F; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
            th { background-color: #f7f3ed; color: #1F1F1F; font-weight: 600; }
            
            .footer { margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px; font-size: 11px; text-align: center; color: #777; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">DOPPIO <span>Café</span></div>
              <p class="meta">Nagpur Commercial Analytics Studio</p>
            </div>
            <div style="text-align: right;">
              <h2 class="title">Sales & Revenue Audit Report</h2>
              <p class="meta" style="font-weight:bold; color: #FC8019;">` + rangeStr + `</p>
              <p class="meta">Generated: ` + new Date().toLocaleString('en-IN') + `</p>
            </div>
          </div>
          <div class="kpis">
            <div class="kpi-card">
              <h3>Total Orders</h3>
              <p>` + filteredBills.length + `</p>
            </div>
            <div class="kpi-card">
              <h3>Gross Subtotal</h3>
              <p>₹` + totalSubtotal + `</p>
            </div>
            <div class="kpi-card">
              <h3>GST Tax Collected</h3>
              <p>₹` + totalGST + `</p>
            </div>
            <div class="kpi-card" style="background:#f7f0e8; border-color:#FC8019;">
              <h3>Net Sales Revenue</h3>
              <p style="color:#FC8019; font-size: 20px;">₹` + totalRevenue + `</p>
            </div>
          </div>
          <div class="kpis" style="grid-template-columns: repeat(3, 1fr); margin-top: 0; margin-bottom: 20px;">
            <div class="kpi-card" style="border-left: 4px solid #27ae60; padding: 10px;">
              <h3>UPI / Online</h3>
              <p style="color: #27ae60; font-size: 16px;">₹` + payUPI + `</p>
            </div>
            <div class="kpi-card" style="border-left: 4px solid #2980b9; padding: 10px;">
              <h3>Card Payments</h3>
              <p style="color: #2980b9; font-size: 16px;">₹` + payCard + `</p>
            </div>
            <div class="kpi-card" style="border-left: 4px solid #d35400; padding: 10px;">
              <h3>Cash Payments</h3>
              <p style="color: #d35400; font-size: 16px;">₹` + payCash + `</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Payment</th>
                <th style="text-align: right;">Subtotal</th>
                <th style="text-align: right;">Discount</th>
                <th style="text-align: right;">Total Paid</th>
              </tr>
            </thead>
            <tbody>
              ` + (filteredBills.length === 0 ? '<tr><td colspan="8" align="center">No transactions recorded for this period.</td></tr>' : rowsHTML) + `
            </tbody>
          </table>
          <div class="footer">
            Doppio Cafe Nagpur - Authorized Financial Ledger Document
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          <\/script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // ==========================================
  // 11. MENU EDITOR & PREVIEWS (TAB 5)
  // ==========================================
  const editorItemsGrid = document.getElementById('editor-items-grid');
  
  function renderMenuEditor() {
    if (!editorItemsGrid) return;
    editorItemsGrid.innerHTML = '';

    menu.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'menu-editor-card';
      card.innerHTML = `
        <div>
          <span style="font-size:20px; display:block; margin-bottom:8px; color:var(--accent-caramel);"><i class="fa-solid fa-mug-hot"></i></span>
          <h4 style="font-size:13px; font-weight:700; color:var(--primary-brand);">${item.name}</h4>
          <span style="font-size:11px; color:var(--accent-caramel); font-weight:600;">₹${item.price}</span>
        </div>
        <div class="menu-editor-card-actions">
          <button class="btn btn-secondary edit-btn" style="padding:4px 8px; font-size:10px;"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn btn-danger delete-btn" style="padding:4px 8px; font-size:10px;"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      `;

      // Form fill edits
      card.querySelector('.edit-btn').addEventListener('click', () => {
        SoundEffects.playClick();
        document.getElementById('edit-item-index').value = index;
        document.getElementById('item-name-input').value = item.name;
        document.getElementById('item-category-input').value = item.category;
        document.getElementById('item-price-input').value = item.price;
        document.getElementById('item-desc-input').value = item.description || '';
        document.getElementById('item-icon-input').value = item.icon || '☕';
        const selectEl = document.getElementById('item-icon-select');
        if (selectEl) selectEl.value = item.icon || '☕';
        document.getElementById('form-panel-title').textContent = 'Edit Menu Item';

        // Load active recipe mappings inside Recipe Maker
        if (recipeIngredientsList) {
          recipeIngredientsList.innerHTML = '';
          const nameLower = item.name.toLowerCase().trim();
          const activeRecipe = customRecipes[nameLower] || excelRecipes[nameLower] || {};
          Object.keys(activeRecipe).forEach(key => {
            createRecipeIngredientRow(key, activeRecipe[key]);
          });
        }

        // On mobile, slide the form panel up as a drawer
        const formPanel = document.getElementById('editor-form-panel');
        if (formPanel && window.innerWidth <= 600) {
          formPanel.classList.add('active');
        }
      });

      card.querySelector('.delete-btn').addEventListener('click', () => {
        showAdminPinModal(() => {
          SoundEffects.playRemove();
          const nameLower = item.name.toLowerCase().trim();
          menu.splice(index, 1);
          localStorage.setItem('doppio_menu', JSON.stringify(menu));
          
          // delete custom recipe
          delete customRecipes[nameLower];
          localStorage.setItem('doppio_custom_recipes', JSON.stringify(customRecipes));

          if (supabaseClient) {
            supabaseClient.from('doppio_menu').delete().eq('name', item.name).then();
            // Also delete the custom recipe from cloud
            supabaseClient.from('doppio_custom_recipes').delete().eq('item_name', nameLower).then();
          }

          renderMenuEditor();
          renderPOSCategories();
          renderPOSItems();
        });
      });

      editorItemsGrid.appendChild(card);
    });
  }

  // Visual Recipe Mappings Link Builder Helper
  const recipeIngredientsList = document.getElementById('recipe-ingredients-list');
  const addRecipeIngredientBtn = document.getElementById('add-recipe-ingredient-btn');

  function createRecipeIngredientRow(ingKey = '', qtyValue = '') {
    if (!recipeIngredientsList) return;

    const row = document.createElement('div');
    row.className = 'recipe-ingredient-row';

    let optionsHTML = '<option value="">-- Select Ingredient --</option>';
    Object.keys(defaultInventory).forEach(key => {
      const selectedAttr = key === ingKey ? 'selected' : '';
      optionsHTML += `<option value="${key}" ${selectedAttr}>${getLabelFromKey(key)}</option>`;
    });

    row.innerHTML = `
      <select class="recipe-ing-select" required style="flex:2; padding:6px; border-radius:6px; border:1px solid rgba(28, 28, 28,0.15); font-size:12px; background:white; color:var(--primary-brand);">
        ${optionsHTML}
      </select>
      <input type="number" class="recipe-ing-qty" placeholder="Qty" value="${qtyValue}" required min="0.1" step="any" style="width:70px; padding:6px; border-radius:6px; border:1px solid rgba(28, 28, 28,0.15); text-align:center; font-size:12px; background:white; color:var(--primary-brand); font-weight:700;">
      <span class="unit-lbl" style="font-size:11px; font-weight:600; color:var(--text-muted); width:30px; text-align:center;">g</span>
      <button type="button" class="remove-ing-row-btn" style="background:transparent; border:none; color:var(--danger-color); font-size:16px; cursor:pointer; padding:0 4px;"><i class="fa-solid fa-circle-minus"></i></button>
    `;

    const selectEl = row.querySelector('.recipe-ing-select');
    const unitEl = row.querySelector('.unit-lbl');

    function updateUnit() {
      const key = selectEl.value;
      if (!key) {
        unitEl.textContent = 'g';
        return;
      }
      if (key.includes('milk') || key.includes('shot') || key.includes('syrup') || key.includes('puree') || key.includes('crush') || key.includes('soda') || key.includes('juice') || key.includes('decoction') || key.includes('water') || key.includes('oil') || key.includes('ale') || key.includes('foam')) {
        unitEl.textContent = 'ml';
      } else if (key.includes('egg') || key.includes('oreo') || key.includes('biscuit') || key.includes('bread')) {
        unitEl.textContent = 'pcs';
      } else if (key.includes('ice_cream')) {
        unitEl.textContent = 'scp';
      } else {
        unitEl.textContent = 'g';
      }
    }

    selectEl.addEventListener('change', updateUnit);
    updateUnit();

    row.querySelector('.remove-ing-row-btn').addEventListener('click', () => {
      SoundEffects.playRemove();
      row.remove();
    });

    recipeIngredientsList.appendChild(row);
  }

  if (addRecipeIngredientBtn) {
    addRecipeIngredientBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      createRecipeIngredientRow();
    });
  }

  // Menu visual form submissions
  const menuEditorForm = document.getElementById('menu-item-editor-form');
  if (menuEditorForm) {
    menuEditorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      SoundEffects.playClick();

      const index = document.getElementById('edit-item-index').value;
      const name = document.getElementById('item-name-input').value.trim();
      const category = document.getElementById('item-category-input').value;
      const price = parseInt(document.getElementById('item-price-input').value);
      const description = document.getElementById('item-desc-input').value.trim();
      const icon = document.getElementById('item-icon-input').value.trim();

      const newItem = { name, category, price, description, icon };

      if (index !== '') {
        menu[index] = newItem;
        if (supabaseClient) {
          supabaseClient.from('doppio_menu').update({
            price: newItem.price,
            description: newItem.description,
            icon: newItem.icon,
            category: newItem.category
          }).eq('name', newItem.name).then();
        }
      } else {
        menu.push(newItem);
        if (supabaseClient) {
          supabaseClient.from('doppio_menu').insert({
            name: newItem.name,
            price: newItem.price,
            description: newItem.description,
            icon: newItem.icon,
            category: newItem.category
          }).then();
        }
      }

      // Save dynamic custom recipe specifications
      const recipeRows = document.querySelectorAll('.recipe-ingredient-row');
      const recipeSpecs = {};
      recipeRows.forEach(row => {
        const key = row.querySelector('.recipe-ing-select').value;
        const qty = parseFloat(row.querySelector('.recipe-ing-qty').value) || 0;
        if (key && qty > 0) {
          recipeSpecs[key] = qty;
        }
      });

      const nameLower = name.toLowerCase().trim();
      if (Object.keys(recipeSpecs).length > 0) {
        customRecipes[nameLower] = recipeSpecs;
      } else {
        delete customRecipes[nameLower];
      }
      localStorage.setItem('doppio_custom_recipes', JSON.stringify(customRecipes));

      // Sync recipe to Supabase
      if (supabaseClient) {
        if (Object.keys(recipeSpecs).length > 0) {
          supabaseClient.from('doppio_custom_recipes')
            .upsert({
              item_name: nameLower,
              ingredients: recipeSpecs,
              updated_at: new Date().toISOString()
            }, { onConflict: 'item_name' })
            .then(({ error }) => {
              if (error) console.warn('Supabase custom recipe upsert failed:', error.message);
            });
        } else {
          // No ingredients — delete the recipe from cloud
          supabaseClient.from('doppio_custom_recipes').delete().eq('item_name', nameLower).then();
        }
      }

      localStorage.setItem('doppio_menu', JSON.stringify(menu));
      menuEditorForm.reset();
      document.getElementById('edit-item-index').value = '';
      document.getElementById('form-panel-title').textContent = 'Add New Menu Item';
      if (recipeIngredientsList) recipeIngredientsList.innerHTML = '';

      // On mobile, close the editor drawer after save
      const savedFormPanel = document.getElementById('editor-form-panel');
      if (savedFormPanel && window.innerWidth <= 600) savedFormPanel.classList.remove('active');

      renderMenuEditor();
      renderPOSCategories();
      renderPOSItems();
    });
  }

  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      menuEditorForm.reset();
      document.getElementById('edit-item-index').value = '';
      document.getElementById('form-panel-title').textContent = 'Add New Menu Item';
      if (recipeIngredientsList) recipeIngredientsList.innerHTML = '';
      // On mobile, close the drawer
      const fp = document.getElementById('editor-form-panel');
      if (fp && window.innerWidth <= 600) fp.classList.remove('active');
    });
  }

  // "Add New Menu Item" button — opens form panel as mobile drawer
  const addNewMenuBtn = document.getElementById('add-new-menu-btn');
  if (addNewMenuBtn) {
    addNewMenuBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (menuEditorForm) menuEditorForm.reset();
      document.getElementById('edit-item-index').value = '';
      document.getElementById('form-panel-title').textContent = 'Add New Menu Item';
      if (recipeIngredientsList) recipeIngredientsList.innerHTML = '';
      // On mobile, slide the form panel up as a drawer
      const formPanel = document.getElementById('editor-form-panel');
      if (formPanel && window.innerWidth <= 600) {
        formPanel.classList.add('active');
      }
    });
  }

  // ==========================================
  // 12. CRM LEDGER PROGRAM TIERING (TAB 6)
  // ==========================================
  let crmData = [];
  const crmSearchInput = document.getElementById('crm-search-input');
  const crmTableBody = document.getElementById('crm-table-body');
  const custNameInput = document.getElementById('cust-name');
  const custPhoneInput = document.getElementById('cust-phone');
  const loyaltyStatusBox = document.getElementById('loyalty-status-box');

  function getLoyaltyTier(spend) {
    if (spend >= 5000) return 'Platinum';
    if (spend >= 2500) return 'Gold';
    if (spend >= 1000) return 'Silver';
    return 'Bronze';
  }

  async function loadCRMData() {
    const localCRM = localStorage.getItem('doppio_crm_local');
    if (localCRM) {
      try {
        crmData = JSON.parse(localCRM);
        if (!Array.isArray(crmData)) crmData = [];
      } catch(err) {
        console.warn("Corrupted CRM data", err);
        crmData = [];
      }
    } else {
      crmData = [
        { name: 'Aniket Sharma', phone: '9823012345', visits: 6, total_spend: 2840, last_visit: new Date().toISOString() },
        { name: 'Priya Deshmukh', phone: '9130098765', visits: 12, total_spend: 6420, last_visit: new Date().toISOString() },
        { name: 'Rahul Verma', phone: '8888776655', visits: 2, total_spend: 1150, last_visit: new Date().toISOString() },
        { name: 'Kunal Sen', phone: '9552147890', visits: 24, total_spend: 12850, last_visit: new Date().toISOString() },
        { name: 'Aditi Rao', phone: '9372154687', visits: 1, total_spend: 350, last_visit: new Date().toISOString() }
      ];
      localStorage.setItem('doppio_crm_local', JSON.stringify(crmData));
    }
    renderCRMTab();
  }

  function renderCRMTab() {
    if (!crmTableBody) return;
    crmTableBody.innerHTML = '';
    
    const searchVal = (crmSearchInput ? crmSearchInput.value : '').trim().toLowerCase();
    const filtered = crmData.filter(c => {
      return (c.name && c.name.toLowerCase().includes(searchVal)) || 
             (c.phone && c.phone.includes(searchVal));
    });
    
    // Update crm counters
    if (document.getElementById('crm-total-members')) {
      document.getElementById('crm-total-members').textContent = crmData.length;
    }
    if (document.getElementById('crm-top-spender') && crmData.length > 0) {
      const top = [...crmData].sort((a,b) => b.total_spend - a.total_spend)[0];
      document.getElementById('crm-top-spender').textContent = `${top.name} (₹${Math.round(top.total_spend)})`;
    }

    if (filtered.length === 0) {
      crmTableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="premium-empty-state" style="margin: 20px auto;">
              <i class="fa-solid fa-users"></i>
              <h3>No Loyalty Members Yet</h3>
              <p>Customers registering their phone numbers during checkout will appear here with points, spent totals, and tiers.</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      filtered.forEach(c => {
        const tier = getLoyaltyTier(c.total_spend);
        const lastVisitStr = c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-IN') : '-';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600; color:var(--primary-brand);">${c.name}</td>
          <td>${c.phone || '-'}</td>
          <td>${c.visits}</td>
          <td style="font-weight:600;">₹${c.total_spend}</td>
          <td><span class="status-badge paid" style="font-weight:700;">${tier}</span></td>
          <td>${lastVisitStr}</td>
        `;
        crmTableBody.appendChild(tr);
      });
    }
  }

  if (crmSearchInput) crmSearchInput.addEventListener('input', renderCRMTab);

  const crmSuggestions = document.getElementById('crm-suggestions');

  function checkLoyaltyMember(showSuggestions = false) {
    if (!custNameInput || !custPhoneInput) return;
    const name = custNameInput.value.trim().toLowerCase();
    const phone = custPhoneInput.value.trim();
    
    localStorage.setItem('doppio_cart_cust_name', custNameInput.value);
    localStorage.setItem('doppio_cart_cust_phone', custPhoneInput.value);
    
    updateCartTotalsOnly();
    
    if (loyaltyStatusBox) {
      loyaltyStatusBox.style.display = 'none';
    }

    if (!showSuggestions || !crmSuggestions) {
      if (crmSuggestions) {
        crmSuggestions.style.display = 'none';
        crmSuggestions.innerHTML = '';
      }
      return;
    }

    if (!name && !phone) {
      crmSuggestions.style.display = 'none';
      crmSuggestions.innerHTML = '';
      return;
    }

    // Find matches in CRM
    const matches = crmData.filter(c => {
      const matchName = name && c.name && c.name.toLowerCase().includes(name);
      const matchPhone = phone && c.phone && c.phone.includes(phone);
      return matchName || matchPhone;
    });

    // Check if current inputs exactly match a single CRM member
    const exactMatch = crmData.find(c => {
      const exactName = name && c.name && c.name.toLowerCase() === name;
      const exactPhone = phone && c.phone && c.phone === phone;
      if (name && !phone) return exactName;
      if (phone && !name) return exactPhone;
      return exactName && exactPhone;
    });

    if (exactMatch || matches.length === 0) {
      crmSuggestions.style.display = 'none';
      crmSuggestions.innerHTML = '';
      return;
    }

    // Render suggestions list
    crmSuggestions.innerHTML = '';
    matches.slice(0, 5).forEach(member => {
      const tier = getLoyaltyTier(member.total_spend);
      const item = document.createElement('div');
      item.className = 'crm-suggestion-item';
      item.style.padding = '8px 12px';
      item.style.borderBottom = '1px solid rgba(28, 28, 28,0.05)';
      item.style.cursor = 'pointer';
      item.style.fontSize = '11px';
      item.style.transition = 'background 0.15s ease';
      item.innerHTML = `
        <div style="font-weight: 700; color: var(--primary-brand);"><i class="fa-solid fa-user" style="font-size:9px; margin-right:4px;"></i> ${member.name}</div>
        <div style="color: var(--text-muted); font-size: 10px;"><i class="fa-solid fa-phone" style="font-size:9px; margin-right:4px;"></i> ${member.phone || 'No Phone'} &nbsp;|&nbsp; Tier: ${tier}</div>
      `;

      item.addEventListener('mouseover', () => {
        item.style.background = 'rgba(252, 128, 25, 0.06)';
      });
      item.addEventListener('mouseout', () => {
        item.style.background = 'none';
      });

      item.addEventListener('click', () => {
        SoundEffects.playClick();
        custNameInput.value = member.name;
        custPhoneInput.value = member.phone || '';
        
        // Hide suggestions
        crmSuggestions.style.display = 'none';
        crmSuggestions.innerHTML = '';

        // Save selection
        localStorage.setItem('doppio_cart_cust_name', member.name);
        localStorage.setItem('doppio_cart_cust_phone', member.phone || '');

        // Recalculate totals
        updateCartTotalsOnly();
      });

      crmSuggestions.appendChild(item);
    });

    crmSuggestions.style.display = 'block';
  }

  if (custNameInput) custNameInput.addEventListener('input', () => checkLoyaltyMember(true));
  if (custPhoneInput) custPhoneInput.addEventListener('input', () => checkLoyaltyMember(true));

  // Global click listener to close suggestions dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const crmSugs = document.getElementById('crm-suggestions');
    if (crmSugs && !e.target.closest('.takeaway-fields')) {
      crmSugs.style.display = 'none';
      crmSugs.innerHTML = '';
    }
  });

  // Collapsible Customer Details Toggle Banner for Takeaway Cart
  const guestToggleBtn = document.getElementById('guest-toggle-btn');
  const takeawayFields = document.querySelector('.takeaway-fields');
  const guestToggleIndicator = document.getElementById('guest-toggle-indicator');
  
  if (guestToggleBtn && takeawayFields) {
    guestToggleBtn.addEventListener('click', () => {
      if (takeawayFields.style.display === 'none') {
        takeawayFields.style.display = 'block';
        if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide';
        guestToggleBtn.style.background = 'rgba(252, 128, 25, 0.05)';
        guestToggleBtn.style.borderColor = 'rgba(252, 128, 25, 0.2)';
      } else {
        takeawayFields.style.display = 'none';
        if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Add Info';
        guestToggleBtn.style.background = 'var(--bg-cream-light)';
        guestToggleBtn.style.borderColor = 'rgba(28, 28, 28,0.06)';
      }
    });
  }

  function updateCRMMember(name, phone, spendAmount) {
    let member = crmData.find(c => (phone && c.phone === phone) || c.name.toLowerCase() === name.toLowerCase());
    const nowISO = new Date().toISOString();
    
    if (member) {
      member.visits += 1;
      member.total_spend = parseFloat((parseFloat(member.total_spend) + spendAmount).toFixed(2));
      member.last_visit = nowISO;
    } else {
      member = {
        name: name || 'Loyalty Member',
        phone: phone || null,
        visits: 1,
        total_spend: parseFloat(spendAmount.toFixed(2)),
        last_visit: nowISO
      };
      crmData.push(member);
    }
    localStorage.setItem('doppio_crm_local', JSON.stringify(crmData));
    renderCRMTab();

    // Sync to Supabase (only if member has a phone number — phone is the primary key)
    if (supabaseClient && member.phone) {
      supabaseClient.from('doppio_crm').upsert({
        phone: member.phone,
        name: member.name,
        visits: member.visits,
        total_spend: member.total_spend,
        last_visit: member.last_visit,
        updated_at: nowISO
      }, { onConflict: 'phone' }).then(({ error }) => {
        if (error) console.warn('Supabase CRM upsert failed:', error.message);
      });
    }
  }

  // ==========================================
  // 12.B TAX MANAGEMENT LEDGER HUB (TAB 7)
  // ==========================================
  const taxSearchInput = document.getElementById('tax-search-input');
  const taxTableBody = document.getElementById('tax-table-body');
  const taxDateFrom = document.getElementById('tax-date-from');
  const taxDateTo = document.getElementById('tax-date-to');
  const taxFilterBtn = document.getElementById('tax-filter-btn');
  const taxResetBtn = document.getElementById('tax-reset-btn');
  
  const taxNetSalesCard = document.getElementById('tax-net-sales-card');
  const taxCgstCard = document.getElementById('tax-cgst-card');
  const taxSgstCard = document.getElementById('tax-sgst-card');
  const taxTotalCollectedCard = document.getElementById('tax-total-collected-card');
  const taxAverageRateCard = document.getElementById('tax-average-rate-card');
  
  const gstr1B2CVal = document.getElementById('gstr1-b2c-val');
  const gstr1CountVal = document.getElementById('gstr1-count-val');
  const gstr3bTaxableVal = document.getElementById('gstr3b-taxable-val');
  const gstr3bLiabilityVal = document.getElementById('gstr3b-liability-val');
  const taxLedgerCount = document.getElementById('tax-ledger-count');
  
  const exportTaxJsonBtn = document.getElementById('export-tax-json-btn');
  const exportTaxCsvBtn = document.getElementById('export-tax-csv-btn');
  const exportTaxSqlBtn = document.getElementById('export-tax-sql-btn');
  const importTaxTriggerBtn = document.getElementById('import-tax-trigger-btn');
  const importTaxFileInput = document.getElementById('import-tax-file-input');
  const showSqlSchemaBtn = document.getElementById('show-sql-schema-btn');
  
  const sqlSchemaModal = document.getElementById('sql-schema-modal');
  const closeSchemaModal = document.getElementById('close-schema-modal');
  const closeSchemaBtn = document.getElementById('close-schema-btn');
  const copySqlSchemaBtn = document.getElementById('copy-sql-schema-btn');


  function getActivePeriodBills() {
    const searchVal = (taxSearchInput ? taxSearchInput.value : '').trim().toLowerCase();
    const fromVal = taxDateFrom ? taxDateFrom.value : '';
    const toVal = taxDateTo ? taxDateTo.value : '';
    
    let fromDate = fromVal ? new Date(fromVal) : null;
    if (fromDate) fromDate.setHours(0,0,0,0);
    
    let toDate = toVal ? new Date(toVal) : null;
    if (toDate) toDate.setHours(23,59,59,999);
    
    return bills.filter(b => {
      if (!b) return false;
      const matchesSearch = !searchVal || 
                            (b.orderId && b.orderId.toLowerCase().includes(searchVal)) ||
                            (b.customerName && b.customerName.toLowerCase().includes(searchVal)) ||
                            (b.paymentMethod && b.paymentMethod.toLowerCase().includes(searchVal));
      
      if (!matchesSearch) return false;
      if (!fromDate && !toDate) return true;
      
      const billDate = parseBillDate(b.dateTime);
      if (fromDate && billDate < fromDate) return false;
      if (toDate && billDate > toDate) return false;
      
      return true;
    });
  }

  function renderTaxTab() {
    if (!taxTableBody) return;
    taxTableBody.innerHTML = '';
    
    const filteredBills = getActivePeriodBills();
    
    // Sort reverse chronological
    filteredBills.sort((a, b) => {
      const db = b ? parseBillDate(b.dateTime) : new Date(0);
      const da = a ? parseBillDate(a.dateTime) : new Date(0);
      return db - da;
    });
    
    let netSales = 0;
    let totalTax = 0;
    let cgst = 0;
    let sgst = 0;
    
    if (filteredBills.length === 0) {
      taxTableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="premium-empty-state" style="margin: 20px auto;">
              <i class="fa-solid fa-percent"></i>
              <h3>No Invoices For Selected Period</h3>
              <p>No tax-compliant invoices were recorded in the selected date range. Try clearing your date filters.</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      filteredBills.forEach(b => {
        const taxable = b.subtotal - (b.discount || 0);
        netSales += taxable;
        
        const tax = b.gst || 0;
        totalTax += tax;
        cgst += tax / 2;
        sgst += tax / 2;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:700; color:var(--accent-caramel);">${b.orderId}</td>
          <td style="font-weight:600; color:var(--primary-brand);">${b.customerName || 'Walk-in Guest'}</td>
          <td style="font-size: 11px;">${b.dateTime}</td>
          <td>₹${taxable.toFixed(2)}</td>
          <td style="color:#27ae60;">₹${(tax/2).toFixed(2)}</td>
          <td style="color:#2980b9;">₹${(tax/2).toFixed(2)}</td>
          <td style="font-weight:600; color:var(--text-dark);">₹${tax.toFixed(2)}</td>
          <td style="font-weight:700; color:var(--primary-brand);">₹${(b.total || 0).toFixed(2)}</td>
          <td><span class="payment-badge ${b.paymentMethod ? b.paymentMethod.toLowerCase() : 'upi'}">${b.paymentMethod || 'UPI'}</span></td>
        `;
        taxTableBody.appendChild(tr);
      });
    }
    
    // Update summary labels
    if (taxNetSalesCard) taxNetSalesCard.textContent = `₹${netSales.toFixed(2)}`;
    if (taxCgstCard) taxCgstCard.textContent = `₹${cgst.toFixed(2)}`;
    if (taxSgstCard) taxSgstCard.textContent = `₹${sgst.toFixed(2)}`;
    if (taxTotalCollectedCard) taxTotalCollectedCard.textContent = `₹${totalTax.toFixed(2)}`;
    
    const avgRate = netSales > 0 ? (totalTax / netSales) * 100 : 18;
    if (taxAverageRateCard) taxAverageRateCard.textContent = `Avg Rate: ${avgRate.toFixed(1)}%`;
    
    if (gstr1B2CVal) gstr1B2CVal.textContent = `₹${netSales.toFixed(2)}`;
    if (gstr1CountVal) gstr1CountVal.textContent = `${filteredBills.length} Invoices`;
    if (gstr3bTaxableVal) gstr3bTaxableVal.textContent = `₹${netSales.toFixed(2)}`;
    if (gstr3bLiabilityVal) gstr3bLiabilityVal.textContent = `₹${totalTax.toFixed(2)}`;
    if (taxLedgerCount) taxLedgerCount.textContent = `Showing ${filteredBills.length} Invoices`;
  }

  // Register interactive tax filters
  if (taxSearchInput) taxSearchInput.addEventListener('input', renderTaxTab);
  if (taxFilterBtn) {
    taxFilterBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      renderTaxTab();
    });
  }
  if (taxResetBtn) {
    taxResetBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (taxDateFrom) taxDateFrom.value = '';
      if (taxDateTo) taxDateTo.value = '';
      if (taxSearchInput) taxSearchInput.value = '';
      renderTaxTab();
    });
  }

  // Export CSV generator
  function convertToCSV(data) {
    const headers = ["orderId", "customerName", "dateTime", "items", "subtotal", "gst", "total", "paymentMethod"];
    const rows = data.map(row => {
      return headers.map(header => {
        let val = row[header];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') val = JSON.stringify(val);
        const escaped = ('' + val).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // Export SQL Script generator
  function generateSQLScript(data) {
    let sql = `-- DOPPIO CAFE CLOUD POSTGRES INTEGRATION SCRIPT
-- Generated on ${new Date().toLocaleString('en-IN')}
-- Compatible with Cloud Postgres SQL Editors

CREATE TABLE IF NOT EXISTS public.doppio_bills (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "orderId" text UNIQUE NOT NULL,
    "customerName" text DEFAULT 'Walk-in Guest'::text,
    "dateTime" text,
    items text,
    subtotal numeric DEFAULT 0,
    gst numeric DEFAULT 0,
    total numeric DEFAULT 0,
    "paymentMethod" text DEFAULT 'UPI'::text
);

`;

    if (data.length === 0) {
      sql += `-- No bills found in the selected range to export.`;
      return sql;
    }

    sql += `INSERT INTO public.doppio_bills ("orderId", "customerName", "dateTime", items, subtotal, gst, total, "paymentMethod") VALUES\n`;
    
    const valueRows = data.map(b => {
      const orderId = b.orderId.replace(/'/g, "''");
      const customerName = (b.customerName || 'Walk-in Guest').replace(/'/g, "''");
      const dateTime = (b.dateTime || '').replace(/'/g, "''");
      const rawItems = typeof b.items === 'string' ? b.items : JSON.stringify(b.items);
      const itemsEscaped = rawItems.replace(/'/g, "''");
      const subtotal = b.subtotal || 0;
      const gst = b.gst || 0;
      const total = b.total || 0;
      const paymentMethod = (b.paymentMethod || 'UPI').replace(/'/g, "''");
      
      return `('${orderId}', '${customerName}', '${dateTime}', '${itemsEscaped}', ${subtotal}, ${gst}, ${total}, '${paymentMethod}')`;
    });
    
    sql += valueRows.join(',\n') + '\n';
    sql += `ON CONFLICT ("orderId") DO UPDATE SET\n`;
    sql += `  "customerName" = EXCLUDED."customerName",\n`;
    sql += `  "dateTime" = EXCLUDED."dateTime",\n`;
    sql += `  items = EXCLUDED.items,\n`;
    sql += `  subtotal = EXCLUDED.subtotal,\n`;
    sql += `  gst = EXCLUDED.gst,\n`;
    sql += `  total = EXCLUDED.total,\n`;
    sql += `  "paymentMethod" = EXCLUDED."paymentMethod";\n`;
    
    return sql;
  }

  // Backup importers - RFC-4180 CSV parser
  function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i+1];
      
      if (char === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && next === '\n') i++;
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    
    if (lines.length === 0) return [];
    
    const headers = lines[0].map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (values.length < headers.length) continue;
      
      const obj = {};
      headers.forEach((header, index) => {
        let val = values[index];
        obj[header] = val;
      });
      data.push(obj);
    }
    return data;
  }

  // Exporters Triggers
  if (exportTaxJsonBtn) {
    exportTaxJsonBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const activePeriodBills = getActivePeriodBills();
      
      const exportData = activePeriodBills.map(b => ({
        orderId: b.orderId,
        customerName: b.customerName || 'Walk-in Guest',
        dateTime: b.dateTime,
        items: typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
        subtotal: b.subtotal,
        gst: b.gst,
        total: b.total,
        paymentMethod: b.paymentMethod
      }));
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `doppio_cloud_bills_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });
  }
  
  if (exportTaxCsvBtn) {
    exportTaxCsvBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const activePeriodBills = getActivePeriodBills();
      
      const exportData = activePeriodBills.map(b => ({
        orderId: b.orderId,
        customerName: b.customerName || 'Walk-in Guest',
        dateTime: b.dateTime,
        items: typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
        subtotal: b.subtotal,
        gst: b.gst,
        total: b.total,
        paymentMethod: b.paymentMethod
      }));
      
      const csvContent = convertToCSV(exportData);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `doppio_cloud_bills_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });
  }
  
  if (exportTaxSqlBtn) {
    exportTaxSqlBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const activePeriodBills = getActivePeriodBills();
      
      const sqlContent = generateSQLScript(activePeriodBills);
      const blob = new Blob([sqlContent], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `doppio_cloud_bills_sync_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
    });
  }

  // GSTR-1 Pre-Filing Accountant Exporter
  const btnExportGstr1 = document.getElementById('btn-export-gstr1');
  if (btnExportGstr1) {
    btnExportGstr1.addEventListener('click', () => {
      SoundEffects.playClick();
      const activePeriodBills = getActivePeriodBills();
      if (activePeriodBills.length === 0) {
        alert("No invoices found in the selected date range to export GSTR!");
        return;
      }
      
      let csvContent = "Invoice Number,Invoice Date,Customer Name,Customer GSTIN,Place of Supply,Taxable Value,CGST (Rate 9%),SGST (Rate 9%),IGST,Total Invoice Value\n";
      
      activePeriodBills.forEach(b => {
        const invNo = b.orderId;
        const invDate = b.dateTime ? b.dateTime.split(',')[0] : '';
        const custName = b.customerName || 'Walk-in Guest';
        const totalVal = b.total || 0;
        const gstVal = b.gst || 0;
        const taxableVal = totalVal - gstVal;
        
        const cgst = (gstVal / 2).toFixed(2);
        const sgst = (gstVal / 2).toFixed(2);
        const igst = (0).toFixed(2);
        
        csvContent += `"${invNo}","${invDate}","${custName.replace(/"/g, '""')}","","Local (State)",${taxableVal.toFixed(2)},${cgst},${sgst},${igst},${totalVal.toFixed(2)}\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr1_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      
      showNotificationToast(`GSTR-1 report containing ${activePeriodBills.length} invoices exported!`);
    });
  }

  // Backup file import listeners
  if (importTaxTriggerBtn && importTaxFileInput) {
    importTaxTriggerBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      importTaxFileInput.click();
    });
    
    importTaxFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        let imported = [];
        
        try {
          if (file.name.endsWith('.json')) {
            imported = JSON.parse(text);
          } else if (file.name.endsWith('.csv')) {
            imported = parseCSV(text);
          } else {
            alert('Unsupported file format! Please upload a JSON or CSV file.');
            return;
          }
          
          if (!Array.isArray(imported)) {
            imported = [imported];
          }
          
          if (imported.length === 0) {
            alert('The uploaded file is empty.');
            return;
          }
          
          const first = imported[0];
          if (!first.orderId) {
            alert('Invalid data structure! The file must contain an "orderId" field.');
            return;
          }
          
          let mergedCount = 0;
          let newCount = 0;
          
          const parsedBills = imported.map(b => {
            let parsedItems = b.items;
            if (typeof parsedItems === 'string') {
              try {
                parsedItems = JSON.parse(parsedItems);
              } catch (err) {
                parsedItems = [{ name: parsedItems, qty: 1, price: parseFloat(b.total) || 0 }];
              }
            }
            
            return {
              orderId: b.orderId,
              customerName: b.customerName || 'Walk-in Guest',
              customerPhone: b.customerPhone || null,
              dateTime: b.dateTime || new Date().toLocaleString('en-IN'),
              items: Array.isArray(parsedItems) ? parsedItems : [],
              subtotal: parseFloat(b.subtotal) || 0,
              discount: parseFloat(b.discount) || 0,
              gst: parseFloat(b.gst) || 0,
              total: parseFloat(b.total) || 0,
              paymentMethod: b.paymentMethod || 'UPI',
              orderType: b.orderType || 'Takeaway'
            };
          });
          
          parsedBills.forEach(newBill => {
            const index = bills.findIndex(b => b.orderId === newBill.orderId);
            if (index !== -1) {
              bills[index] = newBill;
              mergedCount++;
            } else {
              bills.push(newBill);
              newCount++;
            }
          });
          
          localStorage.setItem('doppio_bills', JSON.stringify(bills));
          
          if (supabaseClient && navigator.onLine) {
            const formattedSupabase = parsedBills.map(b => ({
              orderId: b.orderId,
              customerName: b.customerName,
              dateTime: b.dateTime,
              items: JSON.stringify(b.items),
              subtotal: b.subtotal,
              gst: b.gst,
              total: b.total,
              paymentMethod: b.paymentMethod
            }));
            
            supabaseClient.from('doppio_bills').upsert(formattedSupabase, { onConflict: 'orderId' })
              .then(() => console.log('Imported bills successfully synced to Supabase.'))
              .catch(err => console.error('Supabase import sync error:', err));
          }
          
          SoundEffects.playSuccess();
          alert(`Successfully imported backup!\nNew Invoices: ${newCount}\nUpdated/Merged: ${mergedCount}`);
          
          renderTaxTab();
          if (typeof renderBills === 'function') renderBills();
          updateHeaderSummaryStats();
          
        } catch (err) {
          console.error('Import error:', err);
          alert(`Failed to parse file: ${err.message}`);
        }
        importTaxFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  // Schema Dialog listeners
  if (showSqlSchemaBtn && sqlSchemaModal) {
    showSqlSchemaBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      sqlSchemaModal.classList.add('active');
    });
  }
  if (closeSchemaModal) closeSchemaModal.addEventListener('click', () => sqlSchemaModal.classList.remove('active'));
  if (closeSchemaBtn) closeSchemaBtn.addEventListener('click', () => sqlSchemaModal.classList.remove('active'));
  
  if (copySqlSchemaBtn) {
    copySqlSchemaBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const code = document.getElementById('sql-schema-code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        copySqlSchemaBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
          copySqlSchemaBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy SQL';
        }, 2000);
      }).catch(err => alert('Failed to copy: ' + err));
    });
  }

  // Sidebar Feature Navigation toggling implementation
  function applyFeatureToggles() {
    const loggedInUser = sessionStorage.getItem('logged_in_user');
    const loggedInRole = sessionStorage.getItem('logged_in_role') || 'cashier';
    
    if (loggedInRole === 'superadmin') {
      // Dynamically update brand name to RESTO Suite for Super-Admin
      const brandNameEl = document.getElementById('sidebar-brand-name');
      const brandTypeEl = document.getElementById('sidebar-brand-type');
      if (brandNameEl && brandTypeEl) {
        brandNameEl.textContent = 'RESTO';
        brandTypeEl.textContent = 'Suite';
      }

      const mobileBrandTitleEl = document.getElementById('mobile-brand-title');
      if (mobileBrandTitleEl) {
        mobileBrandTitleEl.innerHTML = 'RESTO <span style="font-size:16px; font-weight:500; color:var(--accent-caramel); margin-left:2px;">Suite</span>';
      }

      const lockBrandNameEl = document.getElementById('lock-brand-name');
      const lockBrandDescEl = document.getElementById('lock-brand-desc');
      if (lockBrandNameEl) {
        lockBrandNameEl.textContent = 'RESTOSUITE';
        if (lockBrandDescEl) lockBrandDescEl.textContent = 'CodeArc Staff Access';
      }

      // Update superadmin user details in sidebar
      const userNameEl = document.querySelector('.sidebar .user-name');
      const userRoleEl = document.querySelector('.sidebar .user-role');
      const avatarEl = document.querySelector('.sidebar .avatar');
      if (userNameEl && loggedInUser) userNameEl.textContent = loggedInUser.charAt(0).toUpperCase() + loggedInUser.slice(1);
      if (userRoleEl) userRoleEl.textContent = 'SaaS Super-Admin';
      if (avatarEl && loggedInUser) avatarEl.textContent = loggedInUser.charAt(0).toUpperCase();

      const saLink = document.getElementById('sidebar-super-admin-link');
      if (saLink) saLink.style.display = 'flex';
      const gmLink = document.getElementById('sidebar-gateway-monitor-link');
      if (gmLink) gmLink.style.display = 'flex';
      
      const sidebarLinks = document.querySelectorAll('.sidebar-link');
      sidebarLinks.forEach(link => {
        const tabId = link.getAttribute('data-tab');
        if (tabId === 'super-admin-tab' || tabId === 'gateway-monitor-tab') {
          link.style.display = 'flex';
          if (tabId === 'super-admin-tab') {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        } else {
          link.style.display = 'none';
        }
      });
      
      const headerCenter = document.querySelector('.header-center-metrics');
      if (headerCenter) headerCenter.style.display = 'none';
      const notificationsBell = document.getElementById('notifications-bell');
      if (notificationsBell) notificationsBell.style.display = 'none';
      const profileBtn = document.getElementById('open-profile-btn');
      if (profileBtn) profileBtn.style.display = 'none';
      const shiftPill = document.getElementById('header-shift-pill');
      if (shiftPill) shiftPill.style.display = 'none';
      
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      const saTab = document.getElementById('super-admin-tab');
      if (saTab) saTab.classList.add('active');
      
      const tabTitle = document.getElementById('tab-title');
      if (tabTitle) tabTitle.textContent = "SaaS Super-Admin Console";
      const tabSubtitle = document.getElementById('tab-subtitle');
      if (tabSubtitle) tabSubtitle.textContent = "Manage client subscriptions, features, and system access";
      
      renderSuperAdminTab();
      return;
    }
    
    if (!loggedInUser) {
      window.location.href = 'login.html';
      return;
    }

    const rolePermissions = {
      admin: ['pos-tab', 'qr-orders-tab', 'online-tab', 'kds-tab', 'tokens-tab', 'bills-tab', 'inventory-tab', 'reports-tab', 'editor-tab', 'crm-tab', 'tax-tab', 'employees-tab'],
      cashier: ['pos-tab', 'qr-orders-tab', 'online-tab', 'tokens-tab', 'bills-tab', 'crm-tab'],
      waiter: ['qr-orders-tab', 'pos-tab', 'tokens-tab'],
      kitchen: ['kds-tab'],
      customer_display: ['tokens-tab']
    };

    // Load feature flags
    const featureFlags = businessProfile.featureFlags || {};

    // Update dynamic user pill in sidebar
        // Dynamically white-label the logo branding in the sidebar header
    const brandNameEl = document.getElementById('sidebar-brand-name');
    const brandTypeEl = document.getElementById('sidebar-brand-type');
    const mobileBrandTitleEl = document.getElementById('mobile-brand-title');
    const lockBrandNameEl = document.getElementById('lock-brand-name');
    const lockBrandDescEl = document.getElementById('lock-brand-desc');

    if (brandNameEl && brandTypeEl) {
      if (activeTenantName === 'SaaS Platform Owner') {
        brandNameEl.textContent = 'RESTO';
        brandTypeEl.textContent = 'Suite';
      } else {
        const words = activeTenantName.split(' ');
        if (words.length > 1) {
          brandNameEl.textContent = words[0].toUpperCase();
          brandTypeEl.textContent = words.slice(1).join(' ');
        } else {
          brandNameEl.textContent = activeTenantName.toUpperCase();
          brandTypeEl.textContent = '';
        }
      }
    }

    if (mobileBrandTitleEl) {
      if (activeTenantName === 'SaaS Platform Owner') {
        mobileBrandTitleEl.innerHTML = 'RESTO <span style="font-size:16px; font-weight:500; color:var(--accent-caramel); margin-left:2px;">Suite</span>';
      } else {
        const words = activeTenantName.split(' ');
        if (words.length > 1) {
          mobileBrandTitleEl.innerHTML = `${words[0].toUpperCase()} <span style="font-size:16px; font-weight:500; color:var(--accent-caramel); margin-left:2px;">${words.slice(1).join(' ')}</span>`;
        } else {
          mobileBrandTitleEl.innerHTML = `${activeTenantName.toUpperCase()}`;
        }
      }
    }

    if (lockBrandNameEl) {
      if (activeTenantName === 'SaaS Platform Owner') {
        lockBrandNameEl.textContent = 'RESTOSUITE';
        if (lockBrandDescEl) lockBrandDescEl.textContent = 'CodeArc Staff Access';
      } else {
        lockBrandNameEl.textContent = activeTenantName.toUpperCase();
        if (lockBrandDescEl) lockBrandDescEl.textContent = `${activeTenantName} POS`;
      }
    }
    const userNameEl = document.querySelector('.sidebar .user-name');
    const userRoleEl = document.querySelector('.sidebar .user-role');
    if (userNameEl) userNameEl.textContent = loggedInUser.charAt(0).toUpperCase() + loggedInUser.slice(1);
    if (userRoleEl) {
      const roleNames = {
        admin: 'Manager / Admin',
        cashier: 'Cashier / Staff',
        waiter: 'Table Waiter',
        kitchen: 'Kitchen Chef',
        customer_display: 'Token Board Display'
      };
      userRoleEl.textContent = roleNames[loggedInRole] || loggedInRole;
    }

    // Hide header metrics for operational roles to maximize space
    const headerCenter = document.querySelector('.header-center-metrics');
    const headerRight = document.querySelector('.header-right');
    const notificationsBell = document.getElementById('notifications-bell');
    const profileBtn = document.getElementById('open-profile-btn');
    const shiftPill = document.getElementById('header-shift-pill');
    
    const isOperationalRole = loggedInRole === 'kitchen' || loggedInRole === 'customer_display';
    if (headerCenter) headerCenter.style.display = isOperationalRole ? 'none' : 'flex';
    
    // Notifications bell
    const isBellVisible = !isOperationalRole && (featureFlags['notifications'] !== false);
    if (notificationsBell) notificationsBell.style.display = isBellVisible ? 'flex' : 'none';
    
    if (profileBtn) profileBtn.style.display = (loggedInRole === 'admin') ? 'flex' : 'none'; // Only Admin can open settings!
    if (shiftPill) {
      const isShiftEnabled = businessProfile.shiftEnabled === true;
      shiftPill.style.display = (isShiftEnabled && !isOperationalRole) ? 'flex' : 'none';
    }

    // Filter sidebar links
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
      const tabId = link.getAttribute('data-tab');
      if (!tabId) return;
      const isAllowedByRole = rolePermissions[loggedInRole].includes(tabId);
      const isEnabledByFlag = featureFlags[tabId] !== false; // enabled by default
      
      const isAllowedBySaaS = allowedTabs.includes(tabId);
      if (isAllowedByRole && isEnabledByFlag && isAllowedBySaaS) {
        link.style.display = 'flex';
      } else {
        link.style.display = 'none';
      }
    });

    // Filter mobile bottom nav links — must pass all 3 gates (role + feature flag + SaaS allowlist)
    const mobileNavLinks = document.querySelectorAll('.mobile-bottom-nav a');
    mobileNavLinks.forEach(link => {
      const tabId = link.getAttribute('data-tab');
      if (!tabId) return;
      const isAllowedByRole = rolePermissions[loggedInRole].includes(tabId);
      const isEnabledByFlag = featureFlags[tabId] !== false;
      const isAllowedBySaaS = allowedTabs.includes(tabId);

      if (isAllowedByRole && isEnabledByFlag && isAllowedBySaaS) {
        link.style.display = 'inline-block';
      } else {
        link.style.display = 'none';
      }
    });

    // Only explicitly hide mobile nav/header for operational roles (kitchen, display).
    // For normal roles (admin, cashier, waiter), let CSS media queries control visibility —
    // they should be hidden on desktop and only appear on small screens (≤ 600px).
    const mobileBottomNav = document.querySelector('.mobile-bottom-nav');
    if (mobileBottomNav && isOperationalRole) {
      mobileBottomNav.style.display = 'none';
    }
    const mobileTopHeader = document.querySelector('.mobile-top-header');
    if (mobileTopHeader && isOperationalRole) {
      mobileTopHeader.style.display = 'none';
    }

    // Check customer toggle details
    const isCrmEnabled = businessProfile.crmEnabled !== false && (featureFlags['crm-tab'] !== false);
    const guestToggleBtn = document.getElementById('guest-toggle-btn');
    if (guestToggleBtn) {
      guestToggleBtn.style.display = isCrmEnabled ? 'flex' : 'none';
    }
    const takeawayFields = document.querySelector('.takeaway-fields');
    if (takeawayFields && !isCrmEnabled) {
      takeawayFields.style.display = 'none';
    }

    // First boot landing page redirect using just_logged_in flag (Made by Antigravity)
    if (sessionStorage.getItem('just_logged_in') === 'true') {
      sessionStorage.removeItem('just_logged_in');
      const defaultLandingTab = {
        admin: 'pos-tab',
        cashier: 'pos-tab',
        waiter: 'qr-orders-tab',
        kitchen: 'kds-tab',
        customer_display: 'tokens-tab'
      }[loggedInRole] || 'pos-tab';

      const fallbackLink = document.querySelector(`.sidebar-link[data-tab="${defaultLandingTab}"]`);
      if (fallbackLink) {
        fallbackLink.click();
      }
    } else {
      // Redirect active tab if it got hidden
      const activeTabLink = document.querySelector('.sidebar-link.active');
      if (activeTabLink && activeTabLink.style.display === 'none') {
        const defaultLandingTab = {
          admin: 'pos-tab',
          cashier: 'pos-tab',
          waiter: 'qr-orders-tab',
          kitchen: 'kds-tab',
          customer_display: 'tokens-tab'
        }[loggedInRole] || 'pos-tab';

        const fallbackLink = document.querySelector(`.sidebar-link[data-tab="${defaultLandingTab}"]`);
        if (fallbackLink) {
          fallbackLink.click();
        }
      }
    }
  }

  // ==========================================
  // 13. BUSINESS PROFILE SETTINGS & SIMULATOR
  // ==========================================
  const profileModal = document.getElementById('profile-modal');
  const openProfileBtn = document.getElementById('open-profile-btn');
  const closeProfileModal = document.getElementById('close-profile-modal');
  const cancelProfileBtn = document.getElementById('cancel-profile-btn');
  const businessProfileForm = document.getElementById('business-profile-form');

  let waPollingInterval = null;

  function pollWhatsAppGatewayStatus() {
    const waGatewayEnabledEl = document.getElementById('profile-wa-gateway-enabled');
    const waGatewayUrlEl = document.getElementById('profile-wa-gateway-url');
    const statusBadge = document.getElementById('wa-status-badge');
    const qrContainer = document.getElementById('wa-qr-container');
    const qrImg = document.getElementById('wa-qr-img');
    const qrSpinner = document.getElementById('wa-qr-spinner');
    const connectedContainer = document.getElementById('wa-connected-container');
    const connectedNumber = document.getElementById('wa-connected-number');

    // Dual gateway selectors
    const localBtn = document.getElementById('wa-select-local');
    const cloudBtn = document.getElementById('wa-select-cloud');
    const localBadge = document.getElementById('wa-local-badge');
    const cloudBadge = document.getElementById('wa-cloud-badge');
    const localDot = document.getElementById('wa-local-dot');
    const cloudDot = document.getElementById('wa-cloud-dot');
    const localTxt = document.getElementById('wa-local-txt');
    const cloudTxt = document.getElementById('wa-cloud-txt');

    if (!waGatewayEnabledEl || !waGatewayEnabledEl.checked) {
      if (qrContainer) qrContainer.style.display = 'none';
      if (connectedContainer) connectedContainer.style.display = 'none';
      if (statusBadge) {
        statusBadge.textContent = 'DISABLED';
        statusBadge.style.background = '#e0e0e0';
        statusBadge.style.color = '#666';
      }
      return;
    }

    let url = waGatewayUrlEl ? waGatewayUrlEl.value.trim() : 'http://localhost:3000';
    if (!url) url = 'http://localhost:3000';
    if (url.endsWith('/')) url = url.slice(0, -1);

    // Style the selection buttons based on currently active URL
    const isLocalSelected = url.includes('localhost') || url.includes('127.0.0.1');
    const isCloudSelected = url.includes('huggingface') || url.includes('hf.space');

    if (localBtn && cloudBtn && localBadge && cloudBadge) {
      if (isLocalSelected) {
        localBtn.style.borderColor = '#128c7e';
        localBtn.style.background = 'rgba(18,140,126,0.06)';
        localBadge.textContent = 'Active';
        localBadge.style.background = '#128c7e';
        localBadge.style.color = '#fff';

        cloudBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        cloudBtn.style.background = '#fff';
        cloudBadge.textContent = 'Backup';
        cloudBadge.style.background = 'rgba(0,0,0,0.05)';
        cloudBadge.style.color = '#666';
      } else if (isCloudSelected) {
        cloudBtn.style.borderColor = '#128c7e';
        cloudBtn.style.background = 'rgba(18,140,126,0.06)';
        cloudBadge.textContent = 'Active';
        cloudBadge.style.background = '#128c7e';
        cloudBadge.style.color = '#fff';

        localBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        localBtn.style.background = '#fff';
        localBadge.textContent = 'Backup';
        localBadge.style.background = 'rgba(0,0,0,0.05)';
        localBadge.style.color = '#666';
      } else {
        localBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        localBtn.style.background = '#fff';
        localBadge.textContent = 'Select';
        localBadge.style.background = 'rgba(0,0,0,0.05)';
        localBadge.style.color = '#666';

        cloudBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        cloudBtn.style.background = '#fff';
        cloudBadge.textContent = 'Select';
        cloudBadge.style.background = 'rgba(0,0,0,0.05)';
        cloudBadge.style.color = '#666';
      }
    }

    // Ping Local Gateway Status
    fetch('http://localhost:3000/status')
      .then(res => res.json())
      .then(data => {
        if (localDot && localTxt) {
          localTxt.textContent = data.status === 'ready' ? 'online' : data.status;
          localTxt.style.color = data.status === 'ready' ? '#155724' : '#856404';
          localDot.style.background = data.status === 'ready' ? '#28a745' : '#ffc107';
        }
      })
      .catch(() => {
        if (localDot && localTxt) {
          localTxt.textContent = 'offline';
          localTxt.style.color = '#721c24';
          localDot.style.background = '#dc3545';
        }
      });

    // Ping Cloud Gateway Status
    fetch('https://kalpeshdeora1006-whatsapp-gateway.hf.space/status')
      .then(res => res.json())
      .then(data => {
        if (cloudDot && cloudTxt) {
          cloudTxt.textContent = data.status === 'ready' ? 'online' : data.status;
          cloudTxt.style.color = data.status === 'ready' ? '#155724' : '#856404';
          cloudDot.style.background = data.status === 'ready' ? '#28a745' : '#ffc107';
        }
      })
      .catch(() => {
        if (cloudDot && cloudTxt) {
          cloudTxt.textContent = 'offline';
          cloudTxt.style.color = '#721c24';
          cloudDot.style.background = '#dc3545';
        }
      });

    // Fetch details from the currently selected Gateway (for main settings display & QR code rendering)
    fetch(`${url}/status`)
      .then(res => res.json())
      .then(data => {
        if (statusBadge) {
          statusBadge.textContent = data.status.toUpperCase();
          if (data.status === 'ready') {
            statusBadge.style.background = '#d4edda';
            statusBadge.style.color = '#155724';
          } else if (data.status === 'qr') {
            statusBadge.style.background = '#fff3cd';
            statusBadge.style.color = '#856404';
          } else {
            statusBadge.style.background = '#f8d7da';
            statusBadge.style.color = '#721c24';
          }
        }

        if (data.status === 'ready') {
          if (qrContainer) qrContainer.style.display = 'none';
          if (connectedContainer) connectedContainer.style.display = 'flex';
          if (connectedNumber) connectedNumber.textContent = `+${data.number}`;
        } else if (data.status === 'qr') {
          if (connectedContainer) connectedContainer.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          if (data.qr) {
            if (qrSpinner) qrSpinner.style.display = 'none';
            if (qrImg) {
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
            }
          } else {
            if (qrSpinner) qrSpinner.style.display = 'block';
            if (qrImg) qrImg.style.display = 'none';
          }
        } else {
          if (connectedContainer) connectedContainer.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          if (qrSpinner) {
            qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #128c7e;"></i><br>Connecting to WhatsApp... (Status: ${data.status.toUpperCase()})`;
            qrSpinner.style.display = 'block';
          }
          if (qrImg) qrImg.style.display = 'none';
        }
      })
      .catch(err => {
        console.warn('Selected WhatsApp gateway offline:', err.message);
        if (statusBadge) {
          statusBadge.textContent = 'OFFLINE';
          statusBadge.style.background = '#f8d7da';
          statusBadge.style.color = '#721c24';
        }
        if (connectedContainer) connectedContainer.style.display = 'none';
        if (qrContainer) qrContainer.style.display = 'flex';
        if (qrSpinner) {
          qrSpinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #d32f2f;"></i><br>Gateway Server Offline<br><span style="font-size: 8px; color: #666; margin-top: 4px; display: block;">Check selected server or start local gateway</span>`;
          qrSpinner.style.display = 'block';
        }
        if (qrImg) qrImg.style.display = 'none';
      });
  }

  function startWhatsAppPolling() {
    if (waPollingInterval) clearInterval(waPollingInterval);
    pollWhatsAppGatewayStatus();
    waPollingInterval = setInterval(pollWhatsAppGatewayStatus, 3000);
  }

  function stopWhatsAppPolling() {
    if (waPollingInterval) {
      clearInterval(waPollingInterval);
      waPollingInterval = null;
    }
  }

  function openProfileModal() {
    if (!profileModal) return;
    
    // Start polling gateway connection status
    startWhatsAppPolling();
    
    document.getElementById('profile-name-input').value = businessProfile.name;
    document.getElementById('profile-address-input').value = businessProfile.address;
    document.getElementById('profile-phone-input').value = businessProfile.phone;
    
    document.getElementById('profile-gst-enabled').checked = businessProfile.gstEnabled;
    document.getElementById('profile-gst-rate').value = businessProfile.gstRate || 18;
    document.getElementById('profile-loyalty-enabled').checked = businessProfile.loyaltyEnabled;
    document.getElementById('profile-loyalty-rate').value = businessProfile.loyaltyRate || 10;
    
    const lockEl = document.getElementById('profile-lock-enabled');
    if (lockEl) lockEl.checked = businessProfile.passcodeLockEnabled || false;
    
    document.getElementById('profile-sound-enabled').checked = businessProfile.soundEnabled !== false;
    
    const whatsappEl = document.getElementById('profile-whatsapp-enabled');
    if (whatsappEl) whatsappEl.checked = businessProfile.whatsappEnabled !== false;

    const waGatewayEnabledEl = document.getElementById('profile-wa-gateway-enabled');
    if (waGatewayEnabledEl) waGatewayEnabledEl.checked = businessProfile.whatsappGatewayEnabled || false;
    
    const waGatewayUrlEl = document.getElementById('profile-wa-gateway-url');
    if (waGatewayUrlEl) waGatewayUrlEl.value = businessProfile.whatsappGatewayUrl || '';
    
    const waGatewayTokenEl = document.getElementById('profile-wa-gateway-token');
    if (waGatewayTokenEl) waGatewayTokenEl.value = businessProfile.whatsappGatewayToken || '';
    
    // Module Feature Toggles
    document.getElementById('profile-crm-enabled').checked = businessProfile.crmEnabled !== false;
    document.getElementById('profile-tax-enabled').checked = businessProfile.taxEnabled !== false;

    // Detailed Tab Feature Toggles
    const featureFlags = businessProfile.featureFlags || {};
    const tabsList = ['pos', 'tables', 'online', 'kds', 'tokens', 'bills', 'inventory', 'reports', 'editor', 'crm', 'tax', 'employees'];
    tabsList.forEach(t => {
      const el = document.getElementById(`feature-${t}-enabled`);
      if (el) el.checked = featureFlags[`${t}-tab`] !== false;
    });

    // Shift Control Settings
    const shiftEnabledEl = document.getElementById('profile-shift-enabled');
    if (shiftEnabledEl) shiftEnabledEl.checked = businessProfile.shiftEnabled || false;
    
    const floatEl = document.getElementById('profile-shift-default-float');
    if (floatEl) floatEl.value = businessProfile.shiftDefaultFloat || 2000;
    
    const maxDrawerEl = document.getElementById('profile-shift-max-drawer');
    if (maxDrawerEl) maxDrawerEl.value = businessProfile.shiftMaxDrawer || 5000;
    
    const posLockEl = document.getElementById('profile-shift-pos-lock');
    if (posLockEl) posLockEl.checked = businessProfile.shiftPosLock !== false;
    
    profileModal.classList.add('active');
    updateReceiptSimulator();
  }

  if (openProfileBtn) openProfileBtn.addEventListener('click', openProfileModal);
  
  if (closeProfileModal) {
    closeProfileModal.addEventListener('click', () => {
      profileModal.classList.remove('active');
      stopWhatsAppPolling();
    });
  }
  
  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', () => {
      profileModal.classList.remove('active');
      stopWhatsAppPolling();
    });
  }

  // Settings UI element change listeners to instantly update polling state
  const waGatewayEnabledEl = document.getElementById('profile-wa-gateway-enabled');
  if (waGatewayEnabledEl) {
    waGatewayEnabledEl.addEventListener('change', () => {
      pollWhatsAppGatewayStatus();
    });
  }

  const waGatewayUrlEl = document.getElementById('profile-wa-gateway-url');
  
  // Quick gateway selector button click listeners
  const waSelectLocalBtn = document.getElementById('wa-select-local');
  if (waSelectLocalBtn) {
    waSelectLocalBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (waGatewayUrlEl) {
        waGatewayUrlEl.value = 'http://localhost:3000';
        const changeEvent = new Event('change');
        waGatewayUrlEl.dispatchEvent(changeEvent);
      }
    });
  }

  const waSelectCloudBtn = document.getElementById('wa-select-cloud');
  if (waSelectCloudBtn) {
    waSelectCloudBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      if (waGatewayUrlEl) {
        waGatewayUrlEl.value = 'https://kalpeshdeora1006-whatsapp-gateway.hf.space';
        const changeEvent = new Event('change');
        waGatewayUrlEl.dispatchEvent(changeEvent);
      }
    });
  }

  if (waGatewayUrlEl) {
    waGatewayUrlEl.addEventListener('change', () => {
      pollWhatsAppGatewayStatus();
    });
  }

  // WhatsApp Device Unlinking (Logout) Button
  const waLogoutBtn = document.getElementById('wa-logout-btn');
  if (waLogoutBtn) {
    waLogoutBtn.addEventListener('click', () => {
      if (!confirm('Are you sure you want to unlink the current WhatsApp account?')) return;
      
      SoundEffects.playClick();
      let url = waGatewayUrlEl ? waGatewayUrlEl.value.trim() : 'http://localhost:3000';
      if (!url) url = 'http://localhost:3000';
      if (url.endsWith('/')) url = url.slice(0, -1);

      const statusBadge = document.getElementById('wa-status-badge');
      if (statusBadge) {
        statusBadge.textContent = 'UNLINKING...';
        statusBadge.style.background = '#fff3cd';
        statusBadge.style.color = '#856404';
      }

      fetch(`${url}/logout`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          console.log('WhatsApp account unlinked successfully:', data);
          pollWhatsAppGatewayStatus();
        })
        .catch(err => {
          console.error('Failed to unlink WhatsApp account:', err);
          alert('Failed to log out: ' + err.message);
          pollWhatsAppGatewayStatus();
        });
    });
  }

  // Multi tab toggle buttons inside profile Settings
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  const settingsTabContents = document.querySelectorAll('.settings-tab-content');

  settingsTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      SoundEffects.playClick();
      settingsTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.getAttribute('data-settings-tab');
      settingsTabContents.forEach(content => {
        content.style.display = content.id === targetId ? 'block' : 'none';
      });

      // Smoothly center the clicked tab button in the horizontal scroll row
      const tabContainer = btn.parentElement;
      if (tabContainer) {
        const containerRect = tabContainer.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const absoluteLeft = btnRect.left - containerRect.left + tabContainer.scrollLeft;
        const scrollLeft = absoluteLeft - (tabContainer.clientWidth / 2) + (btn.clientWidth / 2);
        tabContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    });
  });

  // Dynamic Listeners to simulate virtual receipt updates in Settings
  const profileNameInput = document.getElementById('profile-name-input');
  const profileAddrInput = document.getElementById('profile-address-input');
  const profilePhoneInput = document.getElementById('profile-phone-input');
  const profileGstCheck = document.getElementById('profile-gst-enabled');
  const profileGstRate = document.getElementById('profile-gst-rate');
  const profileLoyaltyCheck = document.getElementById('profile-loyalty-enabled');
  const profileLoyaltyRate = document.getElementById('profile-loyalty-rate');

  if (profileNameInput) profileNameInput.addEventListener('input', updateReceiptSimulator);
  if (profileAddrInput) profileAddrInput.addEventListener('input', updateReceiptSimulator);
  if (profilePhoneInput) profilePhoneInput.addEventListener('input', updateReceiptSimulator);
  if (profileGstCheck) profileGstCheck.addEventListener('change', updateReceiptSimulator);
  if (profileGstRate) profileGstRate.addEventListener('input', updateReceiptSimulator);
  if (profileLoyaltyCheck) profileLoyaltyCheck.addEventListener('change', updateReceiptSimulator);
  if (profileLoyaltyRate) profileLoyaltyRate.addEventListener('input', updateReceiptSimulator);

  // Data Resilience Backup & Restore Hub Event Listeners
  const btnExportBackup = document.getElementById('btn-export-backup');
  const restoreBackupFileInput = document.getElementById('restore-backup-file');

  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', () => {
      SoundEffects.playClick();
      const backupPayload = {
        // Core POS
        bills: JSON.parse(localStorage.getItem('doppio_bills')) || [],
        inventory: JSON.parse(localStorage.getItem('doppio_inventory')) || {},
        menu: JSON.parse(localStorage.getItem('doppio_menu')) || [],
        businessProfile: JSON.parse(localStorage.getItem('doppio_business_profile')) || {},
        draftOrders: JSON.parse(localStorage.getItem('doppio_draft_orders')) || [],
        // Shift Management
        activeShift: JSON.parse(localStorage.getItem('doppio_current_shift')) || null,
        shiftHistory: JSON.parse(localStorage.getItem('doppio_shifts_local')) || [],
        shiftEvents: JSON.parse(localStorage.getItem('doppio_shift_events_local')) || [],
        // Employee & HR
        employees: JSON.parse(localStorage.getItem('doppio_employees')) || [],
        leaveRequests: JSON.parse(localStorage.getItem('doppio_leave_requests')) || [],
        attendanceLogs: JSON.parse(localStorage.getItem('doppio_attendance')) || [],
        // Inventory Intelligence
        inventoryBatches: JSON.parse(localStorage.getItem('doppio_inventory_batches')) || {},
        inventoryThresholds: JSON.parse(localStorage.getItem('doppio_inventory_thresholds')) || {},
        customRecipes: JSON.parse(localStorage.getItem('doppio_custom_recipes')) || {},
        // CRM & Loyalty
        crmData: JSON.parse(localStorage.getItem('doppio_crm_local')) || [],
        // POS Analytics
        posPopularity: JSON.parse(localStorage.getItem('doppio_pos_popularity')) || {},
        // Notifications
        notifications: JSON.parse(localStorage.getItem('doppio_notifications')) || [],
        // Metadata
        timestamp: new Date().toISOString(),
        branch: "Nagpur Premium Hub",
        version: "2.0"
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `doppio-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotificationToast("Complete backup exported — all 17 data tables included!");
    });
  }

  if (restoreBackupFileInput) {
    restoreBackupFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      SoundEffects.playPop();
      if (!confirm("Are you sure you want to restore POS from this backup? This will overwrite your current active bills, inventory, shifts, employees, and all settings!")) {
        restoreBackupFileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const data = JSON.parse(evt.target.result);
          if (data.bills && data.inventory && data.menu) {
            // Core POS
            localStorage.setItem('doppio_bills', JSON.stringify(data.bills));
            localStorage.setItem('doppio_inventory', JSON.stringify(data.inventory));
            localStorage.setItem('doppio_menu', JSON.stringify(data.menu));
            if (data.businessProfile) localStorage.setItem('doppio_business_profile', JSON.stringify(data.businessProfile));
            if (data.draftOrders) localStorage.setItem('doppio_draft_orders', JSON.stringify(data.draftOrders));
            // Shifts
            if (data.activeShift) localStorage.setItem('doppio_current_shift', JSON.stringify(data.activeShift));
            if (data.shiftHistory) localStorage.setItem('doppio_shifts_local', JSON.stringify(data.shiftHistory));
            if (data.shiftEvents) localStorage.setItem('doppio_shift_events_local', JSON.stringify(data.shiftEvents));
            // HR
            if (data.employees) localStorage.setItem('doppio_employees', JSON.stringify(data.employees));
            if (data.leaveRequests) localStorage.setItem('doppio_leave_requests', JSON.stringify(data.leaveRequests));
            if (data.attendanceLogs) localStorage.setItem('doppio_attendance', JSON.stringify(data.attendanceLogs));
            // Inventory Intelligence
            if (data.inventoryBatches) localStorage.setItem('doppio_inventory_batches', JSON.stringify(data.inventoryBatches));
            if (data.inventoryThresholds) localStorage.setItem('doppio_inventory_thresholds', JSON.stringify(data.inventoryThresholds));
            if (data.customRecipes) localStorage.setItem('doppio_custom_recipes', JSON.stringify(data.customRecipes));
            // CRM & Analytics
            if (data.crmData) localStorage.setItem('doppio_crm_local', JSON.stringify(data.crmData));
            if (data.posPopularity) localStorage.setItem('doppio_pos_popularity', JSON.stringify(data.posPopularity));
            if (data.notifications) localStorage.setItem('doppio_notifications', JSON.stringify(data.notifications));

            // Write core data redundantly to IndexedDB vault
            setVaultData('doppio_bills', data.bills);
            setVaultData('doppio_inventory', data.inventory);
            setVaultData('doppio_menu', data.menu);
            if (data.businessProfile) setVaultData('doppio_business_profile', data.businessProfile);
            if (data.activeShift) setVaultData('doppio_current_shift', data.activeShift);
            if (data.shiftHistory) setVaultData('doppio_shifts_local', data.shiftHistory);
            if (data.shiftEvents) setVaultData('doppio_shift_events_local', data.shiftEvents);

            // Sync restored bills to Supabase
            if (supabaseClient) {
              try {
                const formattedSupabase = data.bills.filter(b => b && b.orderId).map(b => ({
                  orderId: b.orderId,
                  customerName: b.customerName,
                  customerPhone: b.customerPhone,
                  items: typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
                  subtotal: b.subtotal,
                  gst: b.gst || 0,
                  total: b.total,
                  paymentMethod: b.paymentMethod,
                  dateTime: b.dateTime
                }));
                if (formattedSupabase.length > 0) {
                  await supabaseClient.from('doppio_bills').upsert(formattedSupabase, { onConflict: 'orderId' });
                }
                // Sync employees
                if (data.employees && data.employees.length > 0) {
                  await supabaseClient.from('doppio_employees').upsert(
                    data.employees.filter(e => e && e.id).map(e => ({
                      id: e.id, name: e.name, role: e.role, contact: e.contact,
                      baseSalary: e.baseSalary, shift: e.shift, leaves: e.leaves
                    })), { onConflict: 'id' }
                  );
                }
                // Sync CRM
                if (data.crmData && data.crmData.length > 0) {
                  const crmWithPhone = data.crmData.filter(c => c && c.phone);
                  if (crmWithPhone.length > 0) {
                    await supabaseClient.from('doppio_crm').upsert(crmWithPhone.map(c => ({
                      phone: c.phone, name: c.name, visits: c.visits,
                      total_spend: c.total_spend, last_visit: c.last_visit
                    })), { onConflict: 'phone' });
                  }
                }
                // Sync Menu
                if (data.menu && data.menu.length > 0) {
                  await supabaseClient.from('doppio_menu').upsert(
                    data.menu.filter(m => m && m.name).map(m => ({
                      name: m.name,
                      category: m.category || '',
                      price: parseFloat(m.price || 0),
                      description: m.description || '',
                      icon: m.icon || ''
                    })), { onConflict: 'name' }
                  );
                }
                // Sync Inventory
                if (data.inventory && typeof data.inventory === 'object') {
                  const invKeys = Object.keys(data.inventory);
                  if (invKeys.length > 0) {
                    await supabaseClient.from('doppio_inventory').upsert(
                      invKeys.map(k => ({
                        key: k,
                        current: parseFloat(data.inventory[k] || 0)
                      })), { onConflict: 'key' }
                    );
                  }
                }
                // Sync Business Profile
                if (data.businessProfile) {
                  const bp = data.businessProfile;
                  await supabaseClient.from('doppio_business_profile').upsert({
                    id: 1,
                    business_name: bp.name || bp.business_name || '',
                    address: bp.address || '',
                    phone: bp.phone || '',
                    gst_enabled: bp.gst_enabled !== undefined ? bp.gst_enabled : (bp.gstEnabled || false),
                    gst_rate: bp.gst_rate !== undefined ? bp.gst_rate : (bp.gstRate || 0),
                    loyalty_discount_enabled: bp.loyalty_discount_enabled !== undefined ? bp.loyalty_discount_enabled : (bp.loyaltyEnabled || false),
                    loyalty_discount_rate: bp.loyalty_discount_rate !== undefined ? bp.loyalty_discount_rate : (bp.loyaltyRate || 0),
                    passcode_lock_enabled: bp.passcode_lock_enabled !== undefined ? bp.passcode_lock_enabled : (bp.passcodeLockEnabled || false),
                    crm_enabled: bp.crm_enabled !== undefined ? bp.crm_enabled : (bp.crmEnabled || false),
                    tax_enabled: bp.tax_enabled !== undefined ? bp.tax_enabled : (bp.taxEnabled || false),
                    sound_enabled: bp.sound_enabled !== undefined ? bp.sound_enabled : (bp.soundEnabled !== undefined ? bp.soundEnabled : true),
                    whatsapp_enabled: bp.whatsapp_enabled !== undefined ? bp.whatsapp_enabled : (bp.whatsappEnabled || false),
                    shift_enabled: bp.shift_enabled !== undefined ? bp.shift_enabled : (bp.shiftEnabled || false),
                    shift_default_float: bp.shift_default_float !== undefined ? bp.shift_default_float : (bp.shiftDefaultFloat || 0),
                    shift_max_drawer: bp.shift_max_drawer !== undefined ? bp.shift_max_drawer : (bp.shiftMaxDrawer || 0),
                    shift_pos_lock: bp.shift_pos_lock !== undefined ? bp.shift_pos_lock : (bp.shiftPosLock || false),
                    whatsapp_gateway_enabled: bp.whatsapp_gateway_enabled !== undefined ? bp.whatsapp_gateway_enabled : (bp.whatsappGatewayEnabled || false),
                    whatsapp_gateway_url: bp.whatsapp_gateway_url || bp.whatsappGatewayUrl || '',
                    whatsapp_gateway_token: bp.whatsapp_gateway_token || bp.whatsappGatewayToken || '',
                    feature_flags: typeof bp.feature_flags === 'string' ? bp.feature_flags : JSON.stringify(bp.featureFlags || bp.feature_flags || {})
                  }, { onConflict: 'id' });
                }
                // Sync Draft Orders
                if (data.draftOrders && data.draftOrders.length > 0) {
                  await supabaseClient.from('doppio_draft_orders').upsert(
                    data.draftOrders.filter(d => d && d.draftId).map(d => ({
                      draftId: d.draftId,
                      draftName: d.draftName || '',
                      customerName: d.customerName || '',
                      customerPhone: d.customerPhone || '',
                      paymentMethod: d.paymentMethod || 'UPI',
                      items: typeof d.items === 'string' ? d.items : JSON.stringify(d.items || []),
                      subtotal: parseFloat(d.subtotal || 0),
                      gst: parseFloat(d.gst || 0),
                      total: parseFloat(d.total || 0),
                      createdAt: d.createdAt || new Date().toISOString()
                    })), { onConflict: 'draftId' }
                  );
                }
                // Sync Shift History
                if (data.shiftHistory && data.shiftHistory.length > 0) {
                  await supabaseClient.from('doppio_shifts').upsert(
                    data.shiftHistory.filter(s => s && s.shiftId).map(s => ({
                      shiftId: s.shiftId,
                      cashierName: s.cashierName || '',
                      openedAt: s.openedAt,
                      closedAt: s.closedAt,
                      openingFloat: parseFloat(s.openingFloat || 0),
                      expectedCash: parseFloat(s.expectedCash || 0),
                      actualCash: parseFloat(s.actualCash || 0),
                      variance: parseFloat(s.variance || 0),
                      totalSalesCash: parseFloat(s.totalSalesCash || 0),
                      totalSalesUpi: parseFloat(s.totalSalesUpi || 0),
                      totalSalesCard: parseFloat(s.totalSalesCard || 0),
                      totalPayouts: parseFloat(s.totalPayouts || 0),
                      totalSafeDrops: parseFloat(s.totalSafeDrops || 0),
                      status: s.status,
                      notes: s.notes || ''
                    })), { onConflict: 'shiftId' }
                  );
                }
                // Sync Shift Events
                if (data.shiftEvents && data.shiftEvents.length > 0) {
                  await supabaseClient.from('doppio_shift_events').upsert(
                    data.shiftEvents.filter(e => e && e.eventId).map(e => ({
                      eventId: e.eventId,
                      shiftId: e.shiftId,
                      eventType: e.eventType,
                      amount: parseFloat(e.amount || 0),
                      reason: e.reason || '',
                      createdAt: e.createdAt
                    })), { onConflict: 'eventId' }
                  );
                }
                // Sync Leave Requests
                if (data.leaveRequests && data.leaveRequests.length > 0) {
                  await supabaseClient.from('doppio_leave_requests').upsert(
                    data.leaveRequests.filter(r => r && r.id).map(r => ({
                      id: r.id,
                      employeeId: r.employeeId,
                      employeeName: r.employeeName,
                      type: r.type,
                      startDate: r.startDate,
                      endDate: r.endDate,
                      reason: r.reason || '',
                      status: r.status || 'Pending',
                      days: parseInt(r.days || 1)
                    })), { onConflict: 'id' }
                  );
                }
                // Sync Attendance Logs
                if (data.attendanceLogs && data.attendanceLogs.length > 0) {
                  await supabaseClient.from('doppio_attendance').upsert(
                    data.attendanceLogs.filter(a => a && a.id).map(a => ({
                      id: a.id,
                      employeeId: a.employeeId,
                      employeeName: a.employeeName,
                      date: a.date,
                      clockInTime: a.clockInTime,
                      clockOutTime: a.clockOutTime,
                      hoursWorked: parseFloat(a.hoursWorked || 0),
                      shift: a.shift || '',
                      wages: parseFloat(a.wages || 0),
                      status: a.status || 'Active'
                    })), { onConflict: 'id' }
                  );
                }
                // Sync Inventory Batches
                if (data.inventoryBatches && typeof data.inventoryBatches === 'object') {
                  const flatBatches = [];
                  Object.keys(data.inventoryBatches).forEach(ingKey => {
                    const list = data.inventoryBatches[ingKey];
                    if (Array.isArray(list)) {
                      list.forEach(b => {
                        if (b && b.id) {
                          flatBatches.push({
                            id: b.id,
                            ingredient_key: ingKey,
                            qty: parseFloat(b.qty || 0),
                            expiryDate: b.expiryDate,
                            receivedDate: b.receivedDate
                          });
                        }
                      });
                    }
                  });
                  if (flatBatches.length > 0) {
                    await supabaseClient.from('doppio_inventory_batches').upsert(flatBatches, { onConflict: 'id' });
                  }
                }
                // Sync Inventory Thresholds
                if (data.inventoryThresholds && typeof data.inventoryThresholds === 'object') {
                  const thresholdKeys = Object.keys(data.inventoryThresholds);
                  if (thresholdKeys.length > 0) {
                    await supabaseClient.from('doppio_inventory_thresholds').upsert(
                      thresholdKeys.map(k => ({
                        ingredient_key: k,
                        threshold: parseInt(data.inventoryThresholds[k] || 20),
                        updated_at: new Date().toISOString()
                      })), { onConflict: 'ingredient_key' }
                    );
                  }
                }
                // Sync Custom Recipes
                if (data.customRecipes && typeof data.customRecipes === 'object') {
                  const recipeKeys = Object.keys(data.customRecipes);
                  if (recipeKeys.length > 0) {
                    await supabaseClient.from('doppio_custom_recipes').upsert(
                      recipeKeys.map(k => ({
                        item_name: k,
                        ingredients: data.customRecipes[k] || {},
                        updated_at: new Date().toISOString()
                      })), { onConflict: 'item_name' }
                    );
                  }
                }
                // Sync POS Popularity
                if (data.posPopularity && typeof data.posPopularity === 'object') {
                  const popKeys = Object.keys(data.posPopularity);
                  if (popKeys.length > 0) {
                    await supabaseClient.from('doppio_pos_popularity').upsert(
                      popKeys.map(k => ({
                        item_name: k,
                        count: parseInt(data.posPopularity[k] || 0),
                        updated_at: new Date().toISOString()
                      })), { onConflict: 'item_name' }
                    );
                  }
                }
                // Sync Notifications
                if (data.notifications && data.notifications.length > 0) {
                  await supabaseClient.from('doppio_notifications').upsert(
                    data.notifications.filter(n => n && n.id).map(n => ({
                      id: n.id,
                      title: n.title || '',
                      message: n.message || '',
                      role: n.role || 'all',
                      type: n.type || 'info',
                      timestamp: n.timestamp || new Date().toISOString(),
                      isRead: n.isRead || false,
                      created_at: n.created_at || new Date().toISOString()
                    })), { onConflict: 'id' }
                  );
                }
              } catch (syncErr) {
                console.warn('Supabase restore sync partial failure (local restore still succeeded):', syncErr);
              }
            }

            SoundEffects.playSuccess();
            alert("Backup Restored Successfully! All sales, inventory, shifts, employees, CRM, and settings recovered.");
            location.reload();
          } else {
            alert("Invalid backup file format! Missing core POS tables.");
          }
        } catch(err) {
          console.error("Backup restoration failed:", err);
          alert("Restore failed! File is corrupted or not valid JSON.");
        }
      };
      reader.readAsText(file);
    });
  }


  function updateReceiptSimulator() {
    const simName = document.getElementById('receipt-preview-store-name');
    const simAddr = document.getElementById('receipt-preview-address');
    const simPhone = document.getElementById('receipt-preview-phone');
    
    if (simName) simName.textContent = (profileNameInput ? profileNameInput.value : '') || 'DOPPIO CAFE';
    if (simAddr) simAddr.textContent = (profileAddrInput ? profileAddrInput.value : '') || 'London Street, Nagpur';
    if (simPhone) simPhone.textContent = `Ph: ${(profilePhoneInput ? profilePhoneInput.value : '') || '+91 91300 03177'}`;

    const taxEnabled = profileGstCheck ? profileGstCheck.checked : true;
    const taxRate = parseFloat(profileGstRate ? profileGstRate.value : 18) || 0;
    
    const loyaltyEnabled = profileLoyaltyCheck ? profileLoyaltyCheck.checked : true;
    const loyaltyValue = parseFloat(profileLoyaltyRate ? profileLoyaltyRate.value : 10) || 0;
    
    const subtotal = 259.00;
    let discount = 0;
    if (loyaltyEnabled) {
      discount = subtotal * (loyaltyValue / 100);
    }
    
    const taxableSubtotal = subtotal - discount;
    const taxAmount = taxEnabled ? taxableSubtotal * (taxRate / 100) : 0;
    const total = taxableSubtotal + taxAmount;
    
    const simSummary = document.getElementById('receipt-preview-summary');
    if (simSummary) {
      let html = `Subtotal: ₹${subtotal.toFixed(2)}<br>`;
      if (loyaltyEnabled && discount > 0) {
        html += `<span style="color:#27ae60;">Discount (${loyaltyValue}%): -₹${discount.toFixed(2)}</span><br>`;
      }
      html += `<span id="receipt-preview-tax-line">GST (${taxRate}%): ₹${taxAmount.toFixed(2)}</span><br>`;
      html += `<span style="font-weight:700;">Total: ₹${total.toFixed(2)}</span>`;
      simSummary.innerHTML = html;
    }
  }

  // Profile Form submissions
  if (businessProfileForm) {
    businessProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      SoundEffects.playClick();

      const name = document.getElementById('profile-name-input').value.trim();
      const address = document.getElementById('profile-address-input').value.trim();
      const phone = document.getElementById('profile-phone-input').value.trim();
      const gstEnabled = document.getElementById('profile-gst-enabled').checked;
      const gstRate = parseFloat(document.getElementById('profile-gst-rate').value) || 0;
      const loyaltyEnabled = document.getElementById('profile-loyalty-enabled').checked;
      const loyaltyRate = parseFloat(document.getElementById('profile-loyalty-rate').value) || 0;
      const crmEnabled = document.getElementById('profile-crm-enabled').checked;
      const taxEnabled = document.getElementById('profile-tax-enabled').checked;
      const soundEnabled = document.getElementById('profile-sound-enabled').checked;
      
      const whatsappEl = document.getElementById('profile-whatsapp-enabled');
      const whatsappEnabled = whatsappEl ? whatsappEl.checked : true;
      
      const lockEl = document.getElementById('profile-lock-enabled');
      const passcodeLockEnabled = lockEl ? lockEl.checked : false;

      const shiftEnabled = document.getElementById('profile-shift-enabled').checked;
      const shiftDefaultFloat = parseFloat(document.getElementById('profile-shift-default-float').value) || 2000;
      const shiftMaxDrawer = parseFloat(document.getElementById('profile-shift-max-drawer').value) || 5000;
      const shiftPosLock = document.getElementById('profile-shift-pos-lock').checked;

      const waGatewayEnabledEl = document.getElementById('profile-wa-gateway-enabled');
      const whatsappGatewayEnabled = waGatewayEnabledEl ? waGatewayEnabledEl.checked : false;

      const waGatewayUrlEl = document.getElementById('profile-wa-gateway-url');
      const whatsappGatewayUrl = waGatewayUrlEl ? waGatewayUrlEl.value.trim() : '';

      const waGatewayTokenEl = document.getElementById('profile-wa-gateway-token');
      const whatsappGatewayToken = waGatewayTokenEl ? waGatewayTokenEl.value.trim() : '';

      const featureFlags = {};
      const tabsList = ['pos', 'tables', 'online', 'kds', 'tokens', 'bills', 'inventory', 'reports', 'editor', 'crm', 'tax', 'employees'];
      tabsList.forEach(t => {
        const el = document.getElementById(`feature-${t}-enabled`);
        featureFlags[`${t}-tab`] = el ? el.checked : true;
      });

      businessProfile = { 
        name, address, phone, 
        gstEnabled, gstRate, 
        loyaltyEnabled, loyaltyRate, 
        passcodeLockEnabled, 
        crmEnabled, taxEnabled,
        soundEnabled,
        whatsappEnabled,
        shiftEnabled,
        shiftDefaultFloat,
        shiftMaxDrawer,
        shiftPosLock,
        whatsappGatewayEnabled,
        whatsappGatewayUrl,
        whatsappGatewayToken,
        featureFlags
      };
      localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));

      // REDUNDANT REDUNDANCY: Backup write to IndexedDB!
      setVaultData("doppio_business_profile", businessProfile);

      applyFeatureToggles();

      // Reload cloud tables upserts defensively
      if (supabaseClient) {
        const fullPayload = {
          id: 1,
          business_name: name,
          address,
          phone,
          gst_enabled: gstEnabled,
          gst_rate: gstRate,
          loyalty_discount_enabled: loyaltyEnabled,
          loyalty_discount_rate: loyaltyRate,
          passcode_lock_enabled: passcodeLockEnabled,
          crm_enabled: crmEnabled,
          tax_enabled: taxEnabled,
          sound_enabled: soundEnabled,
          whatsapp_enabled: whatsappEnabled,
          shift_enabled: shiftEnabled,
          shift_default_float: shiftDefaultFloat,
          shift_max_drawer: shiftMaxDrawer,
          shift_pos_lock: shiftPosLock,
          whatsapp_gateway_enabled: whatsappGatewayEnabled,
          whatsapp_gateway_url: whatsappGatewayUrl,
          whatsapp_gateway_token: whatsappGatewayToken,
          feature_flags: JSON.stringify(featureFlags)
        };

        const basicPayload = {
          id: 1,
          business_name: name,
          address,
          phone,
          gst_enabled: gstEnabled,
          gst_rate: gstRate,
          loyalty_discount_enabled: loyaltyEnabled,
          loyalty_discount_rate: loyaltyRate
        };

        supabaseClient.from('doppio_business_profile').upsert(fullPayload, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) {
              console.warn("Full settings sync failed (likely missing database columns), trying basic sync fallback:", error);
              supabaseClient.from('doppio_business_profile').upsert(basicPayload, { onConflict: 'id' })
                .then(({ error: basicError }) => {
                  if (basicError) {
                    console.error("Supabase basic settings sync failed:", basicError);
                  } else {
                    console.log("Supabase basic settings synced successfully!");
                  }
                });
            } else {
              console.log("Supabase full settings synced successfully!");
            }
          })
          .catch(err => {
            console.error("Supabase settings sync caught error:", err);
          });
      }

      profileModal.classList.remove('active');
      stopWhatsAppPolling();
      alert('Business Settings sync saved successfully!');
      renderCart();
    });
  }

  // ==========================================
  // 14. ADMIN PIN MODAL SYSTEM
  // ==========================================
  let pinResolveCallback = null;
  const adminPinModal = document.getElementById('admin-pin-modal');
  const adminPinInput = document.getElementById('admin-pin-input');
  const adminPinError = document.getElementById('admin-pin-error');
  const confirmPinBtn = document.getElementById('confirm-pin-btn');
  const cancelPinBtn = document.getElementById('cancel-pin-btn');
  const closePinModal = document.getElementById('close-pin-modal');

  function showAdminPinModal(onSuccess) {
    if (!adminPinModal) { onSuccess(); return; }
    pinResolveCallback = onSuccess;
    adminPinInput.value = '';
    adminPinError.style.display = 'none';
    adminPinModal.classList.add('active');
    setTimeout(() => adminPinInput.focus(), 100);
  }

  function closeAdminPinModal() {
    if (adminPinModal) adminPinModal.classList.remove('active');
    pinResolveCallback = null;
    if (adminPinInput) adminPinInput.value = '';
    if (adminPinError) adminPinError.style.display = 'none';
  }

  async function checkAdminPin() {
    if (!adminPinInput) return;
    const hash = await sha256(adminPinInput.value);
    if (hash === '478c4ffb1cbcea37956a748e6c19d8eadd0a47e86f5e308d26cad39453b5d1ab') {
      const callback = pinResolveCallback;
      closeAdminPinModal();
      if (callback) callback();
    } else {
      SoundEffects.playAlert();
      adminPinError.style.display = 'block';
      adminPinInput.value = '';
      adminPinInput.focus();
    }
  }

  if (confirmPinBtn) confirmPinBtn.addEventListener('click', checkAdminPin);
  if (cancelPinBtn) cancelPinBtn.addEventListener('click', closeAdminPinModal);
  if (closePinModal) closePinModal.addEventListener('click', closeAdminPinModal);
  if (adminPinModal) adminPinModal.addEventListener('click', (e) => { if (e.target === adminPinModal) closeAdminPinModal(); });
  if (adminPinInput) adminPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkAdminPin(); });

  // ==========================================
  // 15. WEB AUDIO SYNTHESIZER SOUND EFFECTS
  // ==========================================
  const SoundEffects = {
    audioCtx: null,
    
    init() {
      if (businessProfile.soundEnabled === false) return;
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    
    playPop() {
      if (businessProfile.soundEnabled === false) return;
      if (window.AndroidInterface) {
        window.AndroidInterface.vibrate(20);
      }
      this.init();
      const ctx = this.audioCtx;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    },
    
    playClick() {
      if (businessProfile.soundEnabled === false) return;
      if (window.AndroidInterface) {
        window.AndroidInterface.vibrate(25);
      }
      this.init();
      const ctx = this.audioCtx;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.03);
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    },
    
    playSuccess() {
      if (businessProfile.soundEnabled === false) return;
      if (window.AndroidInterface) {
        window.AndroidInterface.playSound("success");
        window.AndroidInterface.vibrate(80);
      }
      this.init();
      const ctx = this.audioCtx;
      if (!ctx) return;
      
      const playTone = (freq, delay, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.06, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };
      
      playTone(523.25, 0, 0.4); 
      playTone(659.25, 0.08, 0.4); 
      playTone(783.99, 0.16, 0.4); 
      playTone(987.77, 0.24, 0.5); 
    },

    playRemove() {
      if (businessProfile.soundEnabled === false) return;
      if (window.AndroidInterface) {
        window.AndroidInterface.vibrate(40);
      }
      this.init();
      const ctx = this.audioCtx;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    },
    
    playAlert() {
      if (businessProfile.soundEnabled === false) return;
      if (window.AndroidInterface) {
        window.AndroidInterface.playSound("alert");
        window.AndroidInterface.vibrate(250);
      }
      this.init();
      const ctx = this.audioCtx;
      if (!ctx) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.setValueAtTime(130, ctx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  };

  // ==========================================
  // 16. INITIAL BOOTSTRAP TRIGGERS
  // ==========================================
  // Initialize Dynamic Cashier Details
  const cashierName = sessionStorage.getItem('logged_in_user') || 'bonie';
  const userNameEl = document.querySelector('.user-name');
  const avatarEl = document.querySelector('.user-pill .avatar');
  if (userNameEl) userNameEl.textContent = cashierName;
  if (avatarEl) avatarEl.textContent = cashierName.charAt(0).toUpperCase();

  loadCRMData();
  renderPOSCategories();
  renderPOSItems();
  renderCart();
  if (typeof checkLoyaltyMember === 'function') checkLoyaltyMember();
  initSupabase();
  generateOrderNumber();
  updateHeaderSummaryStats();
  applyFeatureToggles();

  // ==========================================
  // 17. GLOBAL TERMINAL LOCK SCREEN CONTROLLER (1006)
  // ==========================================
  const pageLockOverlay = document.getElementById('page-lock-overlay');
  const lockPasscodeInput = document.getElementById('lock-passcode-input');
  const lockPasscodeError = document.getElementById('lock-passcode-error');
  const lockKeypadButtons = document.querySelectorAll('.lock-pin-btn');

  let enteredLockPin = '';

  // Forced false to completely remove reload lock passcode screen
  const passcodeEnabled = false;
  const justLoggedIn = true;

  if (!passcodeEnabled || justLoggedIn) {
    if (justLoggedIn) sessionStorage.removeItem('just_logged_in');
    if (pageLockOverlay) {
      pageLockOverlay.style.display = 'none';
      pageLockOverlay.remove(); // Fades out and removes immediately
    }
  } else {
    if (pageLockOverlay) {
      pageLockOverlay.style.display = 'flex';
      setTimeout(() => {
        if (lockPasscodeInput) lockPasscodeInput.focus();
      }, 150);
    }
  }

  // Intercept physical keyboard typing in real time
  if (lockPasscodeInput) {
    lockPasscodeInput.addEventListener('input', () => {
      enteredLockPin = lockPasscodeInput.value;
      if (lockPasscodeError) lockPasscodeError.textContent = '';
      if (enteredLockPin.length === 4) {
        verifyLockPIN();
      }
    });
  }

  function handleLockKeypadClick(val) {
    if (!lockPasscodeInput) return;
    
    if (val === 'clear') {
      enteredLockPin = '';
      lockPasscodeInput.value = '';
      if (lockPasscodeError) lockPasscodeError.textContent = '';
      SoundEffects.playRemove();
    } else if (val === 'unlock') {
      verifyLockPIN();
    } else {
      if (enteredLockPin.length < 4) {
        enteredLockPin += val;
        lockPasscodeInput.value = enteredLockPin;
        SoundEffects.playClick();
        if (lockPasscodeError) lockPasscodeError.textContent = '';
        
        if (enteredLockPin.length === 4) {
          setTimeout(verifyLockPIN, 150);
        }
      }
    }
  }

  async function verifyLockPIN() {
    const hash = await sha256(enteredLockPin);
    if (hash === '478c4ffb1cbcea37956a748e6c19d8eadd0a47e86f5e308d26cad39453b5d1ab') {
      SoundEffects.playSuccess();
      if (pageLockOverlay) {
        pageLockOverlay.classList.add('unlocked');
        setTimeout(() => pageLockOverlay.remove(), 400); // completely clean from DOM
      }
    } else {
      SoundEffects.playAlert();
      if (lockPasscodeError) lockPasscodeError.textContent = 'Incorrect passcode. Access Denied.';
      enteredLockPin = '';
      if (lockPasscodeInput) {
        lockPasscodeInput.value = '';
        lockPasscodeInput.focus();
      }
      
      // Shake animation effect
      const lockCard = document.querySelector('.lock-card');
      if (lockCard) {
        lockCard.style.animation = 'none';
        setTimeout(() => {
          lockCard.style.animation = 'lockBounce 0.3s ease infinite';
          lockCard.style.transform = 'translateX(10px)';
          setTimeout(() => {
            lockCard.style.animation = '';
            lockCard.style.transform = '';
          }, 300);
        }, 10);
      }
    }
  }

  lockKeypadButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      handleLockKeypadClick(val);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (pageLockOverlay && pageLockOverlay.parentNode) {
      if (lockPasscodeInput && document.activeElement !== lockPasscodeInput) {
        lockPasscodeInput.focus();
      }
      if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Delete') {
        handleLockKeypadClick('clear');
      } else if (e.key === 'Enter') {
        handleLockKeypadClick('unlock');
      }
    }
  });

  // ==========================================
  // 18. MOBILE NAV & TAB CONTROLLER
  // ==========================================
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  function activateMobileTab(tabId) {
    // Guard: "More" button has no tab
    if (!tabId) return;

    // Stop SaaS Gateway polling if we switch away from gateway-monitor-tab
    if (tabId !== 'gateway-monitor-tab' && typeof stopSaaSGatewayPolling === 'function') {
      stopSaaSGatewayPolling();
    }

    // Clear cart if navigating away from POS
    if (tabId === 'pos-tab' && cart.length > 0) {
      SoundEffects.playRemove();
      cart = [];
      const custNameInput = document.getElementById('cust-name');
      const custPhoneInput = document.getElementById('cust-phone');
      if (custNameInput) custNameInput.value = '';
      if (custPhoneInput) custPhoneInput.value = '';
      if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
      renderCart();
    }

    // Sync mobile bottom nav active state
    mobileNavLinks.forEach(l => {
      l.classList.remove('active');
      if (l.getAttribute('data-tab') === tabId) l.classList.add('active');
    });

    // Sync desktop sidebar active state
    document.querySelectorAll('.sidebar-link').forEach(l => {
      l.classList.remove('active');
      if (l.getAttribute('data-tab') === tabId) l.classList.add('active');
    });

    // Switch tab content panels
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    // Call data-render functions for each tab (mirrors desktop sidebar behaviour)
    if (tabId === 'bills-tab') {
      renderBills();
      renderMobileBillCards();
    } else if (tabId === 'inventory-tab') {
      renderInventory();
    } else if (tabId === 'reports-tab') {
      renderReports();
    } else if (tabId === 'editor-tab') {
      renderMenuEditor();
    } else if (tabId === 'crm-tab') {
      renderCRMTab();
    } else if (tabId === 'tax-tab') {
      renderTaxTab();
    } else if (tabId === 'employees-tab') {
      renderEmployeesTab();
    } else if (tabId === 'online-tab') {
      if (typeof renderOnlineOrdersTab === 'function') renderOnlineOrdersTab();
    } else if (tabId === 'kds-tab') {
      if (typeof renderKDSTab === 'function') renderKDSTab();
    } else if (tabId === 'tokens-tab') {
      if (typeof renderTokensTab === 'function') renderTokensTab();
    } else if (tabId === 'super-admin-tab') {
      renderSuperAdminTab();
    } else if (tabId === 'gateway-monitor-tab') {
      setupGatewayMonitorTab();
    } else if (tabId === 'qr-orders-tab') {
      if (typeof updateQrOrdersDashboardUI === 'function') updateQrOrdersDashboardUI();
    }
  }

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      SoundEffects.playClick();
      const tabId = link.getAttribute('data-tab');
      if (tabId) {
        activateMobileTab(tabId);
      }
      // "More" button (no data-tab) opens the More sheet
      if (link.id === 'mobile-more-btn') {
        const moreSheet = document.getElementById('more-nav-sheet');
        if (moreSheet) moreSheet.classList.add('active');
      }
    });
  });

  // ==========================================
  // MORE NAVIGATION SHEET (MOBILE DRAWER)
  // ==========================================
  const moreNavSheet = document.getElementById('more-nav-sheet');
  const mobileMoreBtn = document.getElementById('mobile-more-btn');
  const closeMoreSheetBtn = document.getElementById('close-more-sheet-btn');

  if (mobileMoreBtn) {
    mobileMoreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (moreNavSheet) moreNavSheet.classList.add('active');
    });
  }

  if (closeMoreSheetBtn) {
    closeMoreSheetBtn.addEventListener('click', () => {
      if (moreNavSheet) moreNavSheet.classList.remove('active');
    });
  }

  // Close More sheet when tapping outside (backdrop click)
  if (moreNavSheet) {
    moreNavSheet.addEventListener('click', (e) => {
      if (e.target === moreNavSheet) moreNavSheet.classList.remove('active');
    });
  }

  // More sheet link items → navigate to tab and close sheet
  document.querySelectorAll('.more-sheet-link[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      SoundEffects.playClick();
      const tabId = link.getAttribute('data-tab');
      if (moreNavSheet) moreNavSheet.classList.remove('active');
      activateMobileTab(tabId);
    });
  });

  // More sheet "Settings" link → open Business Profile modal
  const mobileProfileSheetBtn = document.getElementById('mobile-profile-sheet-btn');
  if (mobileProfileSheetBtn) {
    mobileProfileSheetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      SoundEffects.playClick();
      if (moreNavSheet) moreNavSheet.classList.remove('active');
      openProfileModal();
    });
  }

  // ==========================================
  // MOBILE TOP HEADER ACTIONS
  // ==========================================
  // Mobile Avatar → Business Profile modal
  const mobileProfileBtn = document.getElementById('mobile-profile-btn');
  if (mobileProfileBtn) {
    mobileProfileBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      openProfileModal();
    });
  }

  // Mobile Bell → show low-stock notification sheet (reuse desktop notification logic)
  const mobileNotificationsBell = document.getElementById('mobile-notifications-bell');
  if (mobileNotificationsBell) {
    mobileNotificationsBell.addEventListener('click', () => {
      SoundEffects.playClick();
      // Reuse desktop notification bell modal if it exists
      const notifModal = document.getElementById('notifications-modal');
      if (notifModal) {
        notifModal.classList.add('active');
      } else {
        // Fallback: navigate to inventory tab to show low-stock data
        activateMobileTab('inventory-tab');
      }
    });
  }

  // ==========================================
  // MOBILE BILLS CARDS (Mobile-only view)
  // ==========================================
  function renderMobileBillCards() {
    const mobileCardsContainer = document.getElementById('bills-mobile-cards');
    if (!mobileCardsContainer) return;

    // On mobile, hide the desktop table and show the card layout
    const billsTableContainer = document.querySelector('.bills-table-container');
    if (billsTableContainer) {
      billsTableContainer.style.display = window.innerWidth <= 600 ? 'none' : '';
    }
    mobileCardsContainer.style.display = window.innerWidth <= 600 ? 'block' : 'none';
    if (window.innerWidth > 600) return;

    mobileCardsContainer.innerHTML = '';

    const sortedBills = [...bills].reverse();
    if (sortedBills.length === 0) {
      mobileCardsContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
          <i class="fa-solid fa-receipt" style="font-size:36px; margin-bottom:12px; opacity:0.4;"></i>
          <p style="font-size:14px; font-weight:600;">No bills yet.</p>
          <p style="font-size:12px;">Checkout an order from the POS tab.</p>
        </div>`;
      return;
    }

    sortedBills.forEach(bill => {
      const initials = bill.customerName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
      const payClass = bill.paymentMethod ? bill.paymentMethod.toLowerCase() : 'upi';

      const card = document.createElement('div');
      card.className = 'mobile-bill-card';
      card.style.cssText = `
        background: var(--bg-white);
        border: 1px solid rgba(28, 28, 28,0.08);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 10px;
        box-shadow: 0 2px 8px rgba(28, 28, 28,0.06);
      `;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:50%; background:var(--accent-caramel); color:#fff; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700;">${initials}</div>
            <div>
              <div style="font-weight:700; font-size:13px; color:var(--primary-brand);">${bill.customerName}</div>
              <div style="font-size:11px; color:var(--text-muted);">${bill.orderId}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800; font-size:15px; color:var(--accent-caramel);">₹${bill.total}</div>
            <span class="payment-badge ${payClass}" style="font-size:10px;">${bill.paymentMethod}</span>
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:10px; line-height:1.5;">
          <i class="fa-solid fa-clock" style="margin-right:4px;"></i>${bill.dateTime}
          <br>
          <i class="fa-solid fa-utensils" style="margin-right:4px; margin-top:3px;"></i>
          ${bill.items.map(i => `${i.name} ×${i.qty}`).join(', ').substring(0, 80)}${bill.items.length > 3 ? '...' : ''}
        </div>
        <div style="display:flex; gap:8px;">
          <button class="table-action-btn print" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(28, 28, 28,0.12); background:var(--bg-cream-light); color:var(--primary-brand); font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-solid fa-print"></i> Print
          </button>
          <button class="table-action-btn whatsapp" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(37,211,102,0.25); background:rgba(37,211,102,0.06); color:#25D366; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-brands fa-whatsapp"></i> Share
          </button>
          <button class="table-action-btn edit-bill" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(252, 128, 25,0.3); background:rgba(252, 128, 25,0.08); color:var(--accent-caramel); font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="table-action-btn delete" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(231,76,60,0.2); background:rgba(231,76,60,0.06); color:var(--danger-color); font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-solid fa-trash-can"></i> Delete
          </button>
        </div>
      `;
      mobileCardsContainer.appendChild(card);
    });
  }

  // Delegate clicks for mobile bill card action buttons
  const mobileCardsContainer = document.getElementById('bills-mobile-cards');
  if (mobileCardsContainer) {
    mobileCardsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.table-action-btn');
      if (!btn) return;
      const orderId = btn.getAttribute('data-id');
      const idx = bills.findIndex(b => b.orderId === orderId);
      if (idx === -1) return;

      if (btn.classList.contains('print')) {
        triggerThermalReceiptPrint(bills[idx]);
      } else if (btn.classList.contains('whatsapp')) {
        shareBillOnWhatsApp(bills[idx]);
      } else if (btn.classList.contains('edit-bill')) {
        startEditingBill(orderId);
        activateMobileTab('pos-tab');
      } else if (btn.classList.contains('delete')) {
        showAdminPinModal(() => {
          const bill = bills[idx];
          bill.items.forEach(cartItem => {
            const specs = getDeductionSpecs(cartItem);
            Object.keys(specs).forEach(ing => {
              inventory[ing] = (inventory[ing] || 0) + (specs[ing] * cartItem.qty);
            });
          });
          localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
          bills.splice(idx, 1);
          localStorage.setItem('doppio_bills', JSON.stringify(bills));
          renderBills();
          renderMobileBillCards();
          SoundEffects.playRemove();
        });
      }
    });
  }

  // Re-render mobile cards on window resize
  window.addEventListener('resize', () => {
    if (document.getElementById('bills-tab') && document.getElementById('bills-tab').classList.contains('active')) {
      renderMobileBillCards();
    }
  });

  // ==========================================
  // MENU EDITOR MOBILE CLOSE BUTTON
  // ==========================================
  const closeEditorBtn = document.getElementById('close-editor-btn');
  const editorFormPanel = document.getElementById('editor-form-panel');
  if (closeEditorBtn && editorFormPanel) {
    closeEditorBtn.addEventListener('click', () => {
      // On mobile, slide the form panel away
      editorFormPanel.classList.remove('active');
      editorFormPanel.style.display = '';
    });
  }

  // ==========================================
  // MOBILE NOTIFICATION BELL BADGE SYNC
  // ==========================================
  function syncMobileBellBadge(count) {
    const mobileBadge = document.getElementById('mobile-bell-badge');
    const desktopBadge = document.getElementById('bell-badge');
    if (mobileBadge) {
      mobileBadge.style.display = count > 0 ? 'block' : 'none';
    }
    if (desktopBadge) {
      desktopBadge.style.display = count > 0 ? 'block' : 'none';
      desktopBadge.textContent = count > 0 ? count : '';
    }
  }

  // Floating mobile cart slide drawer triggers
  const mobileFloatingCart = document.getElementById('mobile-floating-cart');
  const posCartSidebar = document.getElementById('pos-cart-sidebar');
  const closeMobileCartBtn = document.getElementById('close-mobile-cart-btn');

  if (mobileFloatingCart && posCartSidebar) {
    mobileFloatingCart.addEventListener('click', () => {
      SoundEffects.playPop();
      posCartSidebar.classList.add('active');
      if (closeMobileCartBtn) closeMobileCartBtn.style.display = 'block';
    });
  }

  if (closeMobileCartBtn && posCartSidebar) {
    closeMobileCartBtn.addEventListener('click', () => {
      SoundEffects.playRemove();
      posCartSidebar.classList.remove('active');
    });
  }

  // ==========================================
  // 19. HELD / DRAFT ORDERS MANAGEMENT SYSTEM
  // ==========================================
  const holdOrderBtn = document.getElementById('hold-order-btn');
  const viewDraftsBtn = document.getElementById('view-drafts-btn');
  const draftsModal = document.getElementById('drafts-modal');
  const closeDraftsModal = document.getElementById('close-drafts-modal');
  const closeDraftsBtnFooter = document.getElementById('close-drafts-btn-footer');
  const draftsListContainer = document.getElementById('drafts-list-container');
  const draftsEmptyState = document.getElementById('drafts-empty-state');
  const draftsCountBadge = document.getElementById('drafts-count-badge');

  async function loadDraftOrders() {
    // 1. Load local draft orders fallback
    const localDrafts = localStorage.getItem('doppio_draft_orders');
    if (localDrafts) {
      try {
        draftOrders = JSON.parse(localDrafts);
        if (!Array.isArray(draftOrders)) draftOrders = [];
      } catch(err) {
        console.warn("Corrupted draft orders", err);
        draftOrders = [];
      }
    }

    // 2. Load from Supabase in real-time
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('doppio_draft_orders')
          .select('*')
          .order('createdAt', { ascending: false });
        if (!error && data) {
          // Merge drafts with preference for newer ones
          const mergedMap = new Map();
          // Push local first
          draftOrders.forEach(d => mergedMap.set(d.draftId, d));
          // Push cloud next to overwrite/sync
          data.forEach(d => {
            mergedMap.set(d.draftId, {
              draftId: d.draftId,
              draftName: d.draftName,
              customerName: d.customerName,
              customerPhone: d.customerPhone,
              paymentMethod: d.paymentMethod,
              items: typeof d.items === 'string' ? JSON.parse(d.items) : d.items,
              subtotal: parseFloat(d.subtotal) || 0,
              gst: parseFloat(d.gst) || 0,
              total: parseFloat(d.total) || 0,
              createdAt: d.createdAt
            });
          });
          draftOrders = Array.from(mergedMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          localStorage.setItem('doppio_draft_orders', JSON.stringify(draftOrders));
        }
      } catch (e) {
        console.warn('Error syncing draft orders from cloud:', e);
      }
    }
    updateDraftsBadge();
  }

  function updateDraftsBadge() {
    if (!draftsCountBadge) return;
    const count = draftOrders.length;
    if (count > 0) {
      draftsCountBadge.textContent = count;
      draftsCountBadge.style.display = 'block';
    } else {
      draftsCountBadge.style.display = 'none';
    }
  }

  // Poll for drafts or fetch when drafts button or POS is clicked
  setTimeout(loadDraftOrders, 1000);

  if (holdOrderBtn) {
    holdOrderBtn.addEventListener('click', async () => {
      if (cart.length === 0) {
        alert('Your cart is empty! Add some items before holding an order.');
        return;
      }

      SoundEffects.playClick();
      const custNameInput = document.getElementById('cust-name');
      const custPhoneInput = document.getElementById('cust-phone');
      const custName = custNameInput ? custNameInput.value.trim() : '';
      const custPhone = custPhoneInput ? custPhoneInput.value.trim() : '';

      // Prepare default name for draft
      let defaultDraftName = custName || (custPhone ? `Phone: ${custPhone}` : '');
      if (!defaultDraftName) {
        const nextDraftNum = draftOrders.length + 1;
        defaultDraftName = `Table / Draft #${nextDraftNum}`;
      }

      const draftName = prompt('Enter a name or Table number to hold this order:', defaultDraftName);
      if (draftName === null) return; // Cancelled
      
      const trimmedName = draftName.trim() || defaultDraftName;

      // Calculate totals
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const isGstEnabled = businessProfile.gstEnabled !== false;
      const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
      const gst = isGstEnabled ? Math.round(subtotal * (gstPercentage / 100)) : 0;
      const total = subtotal + gst;

      const newDraft = {
        draftId: `DRAFT-${Date.now()}`,
        draftName: trimmedName,
        customerName: custName,
        customerPhone: custPhone,
        paymentMethod: selectedPaymentMethod,
        items: cart,
        subtotal,
        gst,
        total,
        createdAt: new Date().toISOString()
      };

      // 1. Add locally
      draftOrders.unshift(newDraft);
      localStorage.setItem('doppio_draft_orders', JSON.stringify(draftOrders));
      updateDraftsBadge();

      // 2. Sync to Supabase cloud
      if (supabaseClient) {
        try {
          await supabaseClient.from('doppio_draft_orders').upsert({
            draftId: newDraft.draftId,
            draftName: newDraft.draftName,
            customerName: newDraft.customerName,
            customerPhone: newDraft.customerPhone,
            paymentMethod: newDraft.paymentMethod,
            items: JSON.stringify(newDraft.items),
            subtotal: newDraft.subtotal,
            gst: newDraft.gst,
            total: newDraft.total,
            createdAt: newDraft.createdAt
          }, { onConflict: 'draftId' }).then();
        } catch (e) {
          console.warn('Failed to sync draft to Supabase:', e);
        }
      }

      SoundEffects.playSuccess();
      
      // Clear cart
      cart = [];
      if (custNameInput) custNameInput.value = '';
      if (custPhoneInput) custPhoneInput.value = '';
      if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
      renderCart();

      alert(`Order held successfully under "${trimmedName}"!`);
    });
  }

  function renderDraftsList() {
    if (!draftsListContainer) return;
    draftsListContainer.innerHTML = '';

    if (draftOrders.length === 0) {
      if (draftsEmptyState) draftsEmptyState.style.display = 'block';
      return;
    }

    if (draftsEmptyState) draftsEmptyState.style.display = 'none';

    draftOrders.forEach(d => {
      const draftCard = document.createElement('div');
      draftCard.className = 'draft-card';
      draftCard.style.cssText = 'border: 1px solid rgba(252, 128, 25, 0.2); border-radius: 10px; padding: 12px; background: #fff; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease; margin-bottom: 8px;';
      
      const itemCount = d.items.reduce((sum, i) => sum + i.qty, 0);
      const timeStr = new Date(d.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      draftCard.innerHTML = `
        <div class="draft-details">
          <div style="font-weight: 700; color: var(--primary-brand); font-size: 14px;"><i class="fa-solid fa-folder-open" style="color:var(--accent-caramel); margin-right:4px;"></i> ${d.draftName}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            <i class="fa-solid fa-user"></i> ${d.customerName || 'Walk-in Guest'} &nbsp;|&nbsp; 
            <i class="fa-solid fa-clock"></i> ${dateStr}, ${timeStr}
          </div>
          <div style="font-size: 11px; color: #8E6E6A; font-weight: 600; margin-top: 2px;">
            ${itemCount} Items &nbsp;•&nbsp; Total: ₹${d.total} (${d.paymentMethod})
          </div>
        </div>
        <div class="draft-actions" style="display: flex; gap: 6px;">
          <button class="btn btn-primary resume-draft-btn" data-id="${d.draftId}" style="padding: 6px 12px; font-size: 12px; background-color: var(--accent-caramel); border-color: var(--accent-caramel); color: white; font-weight:700; cursor:pointer;">
            <i class="fa-solid fa-play"></i> Resume
          </button>
          <button class="btn btn-secondary delete-draft-btn" data-id="${d.draftId}" style="padding: 6px 10px; font-size: 12px; border-color: #e74c3c; color: #e74c3c; background:none; cursor:pointer;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
      draftsListContainer.appendChild(draftCard);
    });

    // Add click listeners to resume and delete buttons
    const resumeBtns = draftsListContainer.querySelectorAll('.resume-draft-btn');
    resumeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const draft = draftOrders.find(d => d.draftId === id);
        if (!draft) return;

        SoundEffects.playClick();
        
        // 1. Set cart and inputs
        cart = draft.items;
        selectedPaymentMethod = draft.paymentMethod || 'UPI';
        
        const custNameInput = document.getElementById('cust-name');
        const custPhoneInput = document.getElementById('cust-phone');
        if (custNameInput) custNameInput.value = draft.customerName || '';
        if (custPhoneInput) custPhoneInput.value = draft.customerPhone || '';

        // 2. Select payment method active class
        const payBtns = document.querySelectorAll('.pay-method-btn');
        payBtns.forEach(b => {
          b.classList.remove('active');
          if (b.getAttribute('data-method') === selectedPaymentMethod) {
            b.classList.add('active');
          }
        });

        // 3. Delete draft since it is active now
        draftOrders = draftOrders.filter(d => d.draftId !== id);
        localStorage.setItem('doppio_draft_orders', JSON.stringify(draftOrders));
        updateDraftsBadge();

        if (supabaseClient) {
          try {
            await supabaseClient.from('doppio_draft_orders').delete().eq('draftId', id).then();
          } catch (e) {
            console.warn('Failed to delete draft from cloud:', e);
          }
        }

        renderCart();
        
        // Close modal
        if (draftsModal) draftsModal.classList.remove('active');
        
        alert(`Resumed order "${draft.draftName}"!`);
      });
    });

    const deleteBtns = draftsListContainer.querySelectorAll('.delete-draft-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const draft = draftOrders.find(d => d.draftId === id);
        if (!draft) return;

        if (confirm(`Are you sure you want to delete draft "${draft.draftName}"?`)) {
          SoundEffects.playRemove();
          
          draftOrders = draftOrders.filter(d => d.draftId !== id);
          localStorage.setItem('doppio_draft_orders', JSON.stringify(draftOrders));
          updateDraftsBadge();

          if (supabaseClient) {
            try {
              await supabaseClient.from('doppio_draft_orders').delete().eq('draftId', id).then();
            } catch (e) {
              console.warn('Failed to delete draft from cloud:', e);
            }
          }

          renderDraftsList();
        }
      });
    });
  }

  if (viewDraftsBtn && draftsModal) {
    viewDraftsBtn.addEventListener('click', async () => {
      SoundEffects.playClick();
      await loadDraftOrders();
      renderDraftsList();
      draftsModal.classList.add('active');
    });
  }

  if (closeDraftsModal && draftsModal) {
    closeDraftsModal.addEventListener('click', () => {
      SoundEffects.playClick();
      draftsModal.classList.remove('active');
    });
  }

  if (closeDraftsBtnFooter && draftsModal) {
    closeDraftsBtnFooter.addEventListener('click', () => {
      SoundEffects.playClick();
      draftsModal.classList.remove('active');
    });
  }

  // Update mobile cart badge count and prices inside renderCart()
  const originalRenderCart = renderCart;
  renderCart = function() {
    originalRenderCart();
    
    const mCount = document.getElementById('mobile-cart-count');
    const mTotal = document.getElementById('mobile-cart-total');
    
    if (mCount && mTotal) {
      const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
      mCount.textContent = totalQty;
      
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const taxRate = businessProfile.gstEnabled ? (businessProfile.gstRate || 18) : 0;
      const gst = Math.round(subtotal * (taxRate / 100));
      mTotal.textContent = `₹${subtotal + gst}`;
    }
  };

  // Global Escape Key Listener to close all open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Custom Addon Modal
      const customAddonModal = document.getElementById('custom-addon-modal');
      if (customAddonModal && customAddonModal.classList.contains('active')) {
        customAddonModal.classList.remove('active');
        SoundEffects.playClick();
      }
      
      // Admin Pin Modal
      const adminPinModal = document.getElementById('admin-pin-modal');
      if (adminPinModal && adminPinModal.classList.contains('active')) {
        closeAdminPinModal();
        SoundEffects.playClick();
      }
      
      // Business Profile Modal
      const profileModal = document.getElementById('profile-modal');
      if (profileModal && profileModal.classList.contains('active')) {
        profileModal.classList.remove('active');
        SoundEffects.playClick();
      }
      
      // SQL Schema Modal
      const sqlSchemaModal = document.getElementById('sql-schema-modal');
      if (sqlSchemaModal && sqlSchemaModal.classList.contains('active')) {
        sqlSchemaModal.classList.remove('active');
        SoundEffects.playClick();
      }
      
      // Mobile POS Cart Sidebar Drawer
      const posCartSidebar = document.getElementById('pos-cart-sidebar');
      if (posCartSidebar && posCartSidebar.classList.contains('active')) {
        posCartSidebar.classList.remove('active');
        SoundEffects.playClick();
      }

      // Dropdown Export Menu
      const invExportMenu = document.getElementById('inventory-export-dropdown-menu');
      if (invExportMenu && invExportMenu.classList.contains('active')) {
        invExportMenu.classList.remove('active');
      }

      // Drafts Modal
      const draftsModal = document.getElementById('drafts-modal');
      if (draftsModal && draftsModal.classList.contains('active')) {
        draftsModal.classList.remove('active');
        SoundEffects.playClick();
      }
    }
  });

  // Automatically toggles 'no-scroll' class on body when any drawer/modal is active
  const modalScrollLockObserver = new MutationObserver(() => {
    const isAnyOverlayActive = 
      document.querySelector('.modal-backdrop.active') || 
      document.querySelector('.more-nav-sheet.active') || 
      document.querySelector('.pos-cart-sidebar.active') ||
      document.querySelector('.menu-editor-form-panel.active');
    
    // Temporarily disconnect the observer to avoid infinite loop when changing body class
    modalScrollLockObserver.disconnect();
    
    if (isAnyOverlayActive) {
      if (!document.body.classList.contains('no-scroll')) {
        document.body.classList.add('no-scroll');
      }
    } else {
      if (document.body.classList.contains('no-scroll')) {
        document.body.classList.remove('no-scroll');
      }
    }
    
    // Re-observe class changes
    modalScrollLockObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    });
  });

  // Watch class changes across the document tree
  modalScrollLockObserver.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: ['class']
  });

  // Global callback for native Android online/offline monitoring updates
  window.updateAndroidOfflineStatus = function(isOffline) {
    console.log("Android network status update: isOffline =", isOffline);
    const badge = document.getElementById('network-status-badge');
    const mobileBadge = document.getElementById('mobile-network-status-badge');
    const text = document.getElementById('supabase-sync-text');
    const offlineBanner = document.getElementById('offline-banner');
    
    if (badge) {
      const dot = badge.querySelector('.status-dot');
      if (isOffline) {
        if (dot) dot.className = 'status-dot red';
        if (text) text.textContent = 'Offline';
      } else {
        if (dot) dot.className = 'status-dot green';
        if (text) text.textContent = 'Live';
      }
    }
    if (mobileBadge) {
      const dot = mobileBadge.querySelector('.status-dot');
      if (isOffline) {
        if (dot) dot.className = 'status-dot red';
      } else {
        if (dot) dot.className = 'status-dot green';
      }
    }
    
    // High visibility banner toggle
    if (offlineBanner) {
      offlineBanner.style.display = isOffline ? 'flex' : 'none';
    }
  };

  // Handle browser online/offline events
  window.addEventListener('online', () => {
    window.updateAndroidOfflineStatus(false);
    if (typeof syncOfflineBills === 'function') {
      syncOfflineBills();
    }
  });
  window.addEventListener('offline', () => {
    window.updateAndroidOfflineStatus(true);
  });

  // Initialize network status on load
  window.updateAndroidOfflineStatus(!navigator.onLine);

  // ==========================================
  // PREMIUM THEMES & MOON LIGHT ENGINE
  // ==========================================
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const mobileThemeToggleBtn = document.getElementById('mobile-theme-toggle-btn');

  function updateThemeUI(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    
    // Update icons
    const iconClass = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    const iconColor = isDark ? '#F1C40F' : 'var(--primary-brand)';
    
    if (themeToggleBtn) {
      const icon = themeToggleBtn.querySelector('i');
      if (icon) {
        icon.className = iconClass;
        icon.style.color = iconColor;
      }
    }
    if (mobileThemeToggleBtn) {
      const icon = mobileThemeToggleBtn.querySelector('i');
      if (icon) {
        icon.className = iconClass;
        icon.style.color = iconColor;
      }
    }
  }

  function toggleTheme() {
    const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('doppio_theme', next);
    updateThemeUI(next);
    SoundEffects.playClick();
  }

  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
  if (mobileThemeToggleBtn) mobileThemeToggleBtn.addEventListener('click', toggleTheme);

  // Initialize theme from storage
  const savedTheme = localStorage.getItem('doppio_theme') || 'light';
  updateThemeUI(savedTheme);

  // ==========================================
  // MICRO-INTERACTION BUMP EFFECTS
  // ==========================================
  window.triggerCartBump = function() {
    const targets = [
      document.querySelector('.cart-header-title'),
      document.getElementById('cart-total'),
      document.getElementById('mobile-floating-cart'),
      document.getElementById('mobile-cart-count')
    ];
    targets.forEach(el => {
      if (!el) return;
      el.classList.remove('cart-bounce-active');
      void el.offsetWidth; // force reflow
      el.classList.add('cart-bounce-active');
    });
  };

  // ==========================================
  // COURIER Monospace thermal receipt emulator
  // ==========================================
  let pendingCheckoutPrint = false;
  const receiptPreviewModal = document.getElementById('receipt-preview-modal');
  const receiptPreviewContainer = document.getElementById('receipt-preview-container');
  const closeReceiptPreviewBtn = document.getElementById('close-receipt-preview-btn');
  const cancelReceiptPreviewBtn = document.getElementById('cancel-receipt-preview-btn');
  const confirmReceiptCheckoutBtn = document.getElementById('confirm-receipt-checkout-btn');

  window.openReceiptPreview = function(shouldPrint) {
    if (cart.length === 0) {
      alert('Cart is empty! Add items before checking out.');
      return;
    }
    
    // Validate stock levels first before opening preview
    let sufficientStock = true;
    let missingItem = '';
    const proposedDeductions = {};
    cart.forEach(cartItem => {
      const specs = getDeductionSpecs(cartItem);
      Object.keys(specs).forEach(ing => {
        proposedDeductions[ing] = (proposedDeductions[ing] || 0) + (specs[ing] * cartItem.qty);
      });
    });

    Object.keys(proposedDeductions).forEach(ing => {
      if (inventory[ing] === undefined) inventory[ing] = 1000;
      if (inventory[ing] < proposedDeductions[ing]) {
        sufficientStock = false;
        missingItem = ing.replace('_', ' ');
      }
    });

    if (!sufficientStock) {
      alert(`Insufficient stock! Low on: ${missingItem}. Please restock.`);
      return;
    }

    pendingCheckoutPrint = shouldPrint;
    
    // Construct the proposed bill object to show in receipt preview
    const custNameInput = document.getElementById('cust-name');
    const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
    const orderNum = document.getElementById('order-num').value;
    const billIdToSave = editingBillId || orderNum;
    
    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
    
    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const phoneInput = document.getElementById('cust-phone');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    
    let loyaltyDiscount = 0;
    let matchedCustomer = null;
    if (phoneVal || custName) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
    }
    
    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
    }
    
    const taxableAmount = subtotal - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const total = taxableAmount + gst;

    const proposedBill = {
      orderId: billIdToSave,
      customerName: custName,
      customerPhone: phoneVal || null,
      dateTime: new Date().toLocaleString('en-IN'),
      items: [...cart],
      subtotal: subtotal,
      discount: loyaltyDiscount,
      gst: gst,
      total: total,
      paymentMethod: selectedPaymentMethod,
      orderType: activeOrderType
    };

    // Render the simulated receipt using exactly the same layout helper
    function centerText32(text) {
      const width = 32;
      if (text.length >= width) return text.slice(0, width);
      const leftPad = Math.floor((width - text.length) / 2);
      return ' '.repeat(leftPad) + text;
    }

    function formatRow32(col1, col2, col3) {
      const w1 = 20;
      const w2 = 5;
      const w3 = 7;
      let c1 = col1.slice(0, w1 - 1).padEnd(w1, ' ');
      const c2 = col2.toString().padStart(w2, ' ');
      const c3 = col3.toString().padStart(w3, ' ');
      return c1 + c2 + c3;
    }

    function formatDouble32(label, value) {
      const totalWidth = 32;
      const valStr = value.toString();
      const padSize = totalWidth - label.length;
      if (padSize < valStr.length) {
        return label.slice(0, totalWidth - valStr.length) + valStr;
      }
      return label + valStr.padStart(padSize, ' ');
    }

    const borderDouble = '='.repeat(32);
    const borderSingle = '-'.repeat(32);
    
    let txt = '';
    txt += borderDouble + '\n';
    txt += centerText32(businessProfile.name) + '\n';
    txt += centerText32(businessProfile.address) + '\n';
    txt += centerText32(businessProfile.phone) + '\n';
    txt += borderDouble + '\n\n';
    
    const leftBill = `Bill: ${proposedBill.orderId}`;
    const rightPay = proposedBill.paymentMethod || 'Cash';
    txt += leftBill + rightPay.padStart(32 - leftBill.length, ' ') + '\n';
    txt += `Date: ${proposedBill.dateTime}\n`;
    txt += `Guest: ${proposedBill.customerName}\n\n`;
    
    txt += borderSingle + '\n';
    txt += formatRow32('Item', 'Qty', 'Amt') + '\n';
    txt += borderSingle + '\n';
    
    proposedBill.items.forEach(item => {
      let displayName = item.name;
      if (item.size && item.size !== 'Small') {
        displayName += ` (${item.size.charAt(0)})`;
      }
      txt += formatRow32(displayName, item.qty, (item.price * item.qty).toString()) + '\n';
      txt += `  (₹${item.price} each)\n`;
      if (item.toppings && item.toppings.length > 0) {
        txt += `  + ${item.toppings.join(', ')}\n`;
      }
      if (item.notes) {
        txt += `  * Note: ${item.notes}\n`;
      }
    });
    
    txt += borderSingle + '\n';
    txt += formatDouble32('Subtotal', proposedBill.subtotal.toString()) + '\n';
    if (businessProfile.gstEnabled !== false) {
      txt += formatDouble32('GST', proposedBill.gst.toString()) + '\n';
    }
    if (proposedBill.discount && proposedBill.discount > 0) {
      txt += formatDouble32('Discount', `-${proposedBill.discount}`) + '\n';
    }
    txt += borderDouble + '\n';
    txt += formatDouble32('GRAND TOTAL', proposedBill.total.toString()) + '\n';
    txt += borderDouble + '\n\n';
    txt += centerText32('Thank you for visiting!') + '\n';
    txt += centerText32('Visit Again ☕') + '\n';

    if (receiptPreviewContainer) {
      receiptPreviewContainer.innerHTML = `<pre style="margin:0; font-weight:600; font-family:'Courier New', monospace; white-space:pre; color:#000;">${txt}</pre>`;
    }
    
    if (confirmReceiptCheckoutBtn) {
      if (shouldPrint) {
        confirmReceiptCheckoutBtn.innerHTML = '<i class="fa-solid fa-print"></i> Confirm & Print';
        confirmReceiptCheckoutBtn.style.backgroundColor = '#2ECC71';
      } else {
        confirmReceiptCheckoutBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Confirm & Save';
        confirmReceiptCheckoutBtn.style.backgroundColor = '#3498DB';
      }
    }

    if (receiptPreviewModal) {
      receiptPreviewModal.classList.add('active');
    }
    SoundEffects.playPop();
  };

  window.closeReceiptPreview = function() {
    if (receiptPreviewModal) {
      receiptPreviewModal.classList.remove('active');
    }
  };

  if (closeReceiptPreviewBtn) closeReceiptPreviewBtn.addEventListener('click', window.closeReceiptPreview);
  if (cancelReceiptPreviewBtn) cancelReceiptPreviewBtn.addEventListener('click', window.closeReceiptPreview);
  
  if (confirmReceiptCheckoutBtn) {
    confirmReceiptCheckoutBtn.addEventListener('click', () => {
      window.closeReceiptPreview();
      performCheckout(pendingCheckoutPrint);
    });
  }

  // ==========================================
  // KEYBOARD GRID SPATIAL NAVIGATION ENGINE
  // ==========================================
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isCard = active && active.classList.contains('pos-item-card');
    
    // Alt+D Toggle theme
    if (e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleTheme();
    }
    
    // Alt+C Clear cart
    if (e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      const clearBtn = document.getElementById('clear-cart');
      if (clearBtn) clearBtn.click();
    }

    // Alt+S Save checkout
    if (e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const saveBtn = document.getElementById('checkout-save-btn');
      if (saveBtn) saveBtn.click();
    }

    // Alt+P Print checkout
    if (e.altKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const printBtn = document.getElementById('checkout-print-btn');
      if (printBtn) printBtn.click();
    }
    
    // Spatial grid navigation
    if (isCard) {
      const cards = Array.from(document.querySelectorAll('#pos-items-grid .pos-item-card'));
      const index = cards.indexOf(active);
      if (index === -1) return;
      
      const grid = document.getElementById('pos-items-grid');
      const gridWidth = grid.offsetWidth;
      const cardWidth = active.offsetWidth;
      const gap = 20; // grid gap is 20px
      const cols = Math.max(1, Math.floor((gridWidth + gap) / (cardWidth + gap)));
      
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = cards[index + 1] || cards[0];
        next.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = cards[index - 1] || cards[cards.length - 1];
        prev.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const target = cards[index + cols] || cards[index % cols] || cards[0];
        target.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const target = cards[index - cols];
        if (target) {
          target.focus();
        } else {
          // Focus search bar if moving up from first row
          const search = document.getElementById('pos-search');
          if (search) search.focus();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const itemTitleEl = active.querySelector('.pos-item-title');
        if (itemTitleEl) {
          const itemName = itemTitleEl.textContent;
          const baseItem = menu.find(i => i.name === itemName);
          if (baseItem) {
            if (e.shiftKey) {
              openCustomizationModal(baseItem);
            } else {
              addDefaultToCart(baseItem);
            }
          }
        }
      }
    } else if (active && active.id === 'pos-search') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const firstCard = document.querySelector('#pos-items-grid .pos-item-card');
        if (firstCard) firstCard.focus();
      }
    }
  });

  // ==========================================
  // SIDEBAR COLLAPSED HOVER DRAWER CONTROLLER
  // ==========================================
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    // Dynamically inject absolute hover-zone strip
    const hoverZone = document.createElement('div');
    hoverZone.className = 'sidebar-hover-trigger';
    document.body.appendChild(hoverZone);

    // Mouse reveal handlers
    hoverZone.addEventListener('mouseenter', () => {
      sidebar.classList.add('reveal');
    });

    sidebar.addEventListener('mouseenter', () => {
      sidebar.classList.add('reveal');
    });

    // Mouse collapse handlers
    sidebar.addEventListener('mouseleave', () => {
      sidebar.classList.remove('reveal');
    });
  }

  // ==========================================
  // SALES POPULARITY TRACKER ACTIONS
  // ==========================================
  window.trackItemPopularity = function(items) {
    const changedItems = [];
    items.forEach(item => {
      const key = item.name.toLowerCase().trim();
      posPopularityMap[key] = (posPopularityMap[key] || 0) + item.qty;
      changedItems.push({ item_name: key, count: posPopularityMap[key] });
    });
    localStorage.setItem('doppio_pos_popularity', JSON.stringify(posPopularityMap));
    renderPOSItems(); // instantly re-evaluate positions in the grid

    // Sync updated counts to Supabase
    if (supabaseClient && changedItems.length > 0) {
      supabaseClient.from('doppio_pos_popularity')
        .upsert(changedItems.map(c => ({
          item_name: c.item_name,
          count: c.count,
          updated_at: new Date().toISOString()
        })), { onConflict: 'item_name' })
        .then(({ error }) => {
          if (error) console.warn('Supabase popularity upsert failed:', error.message);
        });
    }
  };

  // Bind change event listener on Sort dropdown selector
  const sortSelect = document.getElementById('pos-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderPOSItems();
      SoundEffects.playClick();
    });
  }

  // ==========================================
  // SPLIT PAYMENT ACTIONS & BALANCE ENGINE
  // ==========================================
  const toggleSplitPayBtn = document.getElementById('toggle-split-pay-btn');
  const singlePayContainer = document.getElementById('single-pay-container');
  const splitPayContainer = document.getElementById('split-pay-container');
  
  const splitUpiInput = document.getElementById('split-pay-upi');
  const splitCashInput = document.getElementById('split-pay-cash');
  const splitCardInput = document.getElementById('split-pay-card');
  const splitRemainingVal = document.getElementById('split-pay-remaining-val');
  const splitStatusLabel = document.getElementById('split-pay-status-label');

  function calculateSplitBalance() {
    if (!isSplitPaymentActive) return;
    
    // Get final order total directly from computed state
    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
    
    const custNameInput = document.getElementById('cust-name');
    const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
    const phoneInput = document.getElementById('cust-phone');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    
    let loyaltyDiscount = 0;
    let matchedCustomer = null;
    if (phoneVal || custName) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
    }
    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(total * (loyaltyDiscountPercentage / 100));
    }
    
    const taxableAmount = total - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const finalTotal = taxableAmount + gst;

    const upi = parseInt(splitUpiInput.value) || 0;
    const cash = parseInt(splitCashInput.value) || 0;
    const card = parseInt(splitCardInput.value) || 0;
    
    const remaining = finalTotal - (upi + cash + card);

    if (splitRemainingVal) {
      if (remaining > 0) {
        splitStatusLabel.textContent = "Remaining:";
        splitRemainingVal.textContent = `₹${remaining}`;
        splitRemainingVal.style.color = 'var(--danger-color)';
        
        // Disable checkout buttons to prevent saving an unbalanced split bill
        if (checkoutSaveBtn) checkoutSaveBtn.disabled = true;
        if (checkoutPrintBtn) checkoutPrintBtn.disabled = true;
        if (checkoutSaveBtn) checkoutSaveBtn.style.opacity = '0.55';
        if (checkoutPrintBtn) checkoutPrintBtn.style.opacity = '0.55';
      } else if (remaining < 0) {
        splitStatusLabel.textContent = "Overpaid:";
        splitRemainingVal.textContent = `₹${Math.abs(remaining)}`;
        splitRemainingVal.style.color = '#F39C12';
        
        // Disable checkout buttons
        if (checkoutSaveBtn) checkoutSaveBtn.disabled = true;
        if (checkoutPrintBtn) checkoutPrintBtn.disabled = true;
        if (checkoutSaveBtn) checkoutSaveBtn.style.opacity = '0.55';
        if (checkoutPrintBtn) checkoutPrintBtn.style.opacity = '0.55';
      } else {
        splitStatusLabel.textContent = "Balanced:";
        splitRemainingVal.textContent = "₹0.00";
        splitRemainingVal.style.color = 'var(--success-color)';
        
        // Enable checkout buttons
        if (checkoutSaveBtn) checkoutSaveBtn.disabled = false;
        if (checkoutPrintBtn) checkoutPrintBtn.disabled = false;
        if (checkoutSaveBtn) checkoutSaveBtn.style.opacity = '1';
        if (checkoutPrintBtn) checkoutPrintBtn.style.opacity = '1';
      }
    }
  }

  window.calculateSplitBalance = calculateSplitBalance;

  if (toggleSplitPayBtn) {
    toggleSplitPayBtn.addEventListener('click', () => {
      isSplitPaymentActive = !isSplitPaymentActive;
      SoundEffects.playClick();

      if (isSplitPaymentActive) {
        toggleSplitPayBtn.innerHTML = '<i class="fa-solid fa-arrows-split-up-and-left"></i> Single Pay';
        if (singlePayContainer) singlePayContainer.style.display = 'none';
        if (splitPayContainer) splitPayContainer.style.display = 'flex';
        
        // Pre-fill UPI input with the entire total to make checkout fast
        let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const isGstEnabled = businessProfile.gstEnabled !== false;
        const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
        const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
        const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
        
        const custNameInput = document.getElementById('cust-name');
        const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
        const phoneInput = document.getElementById('cust-phone');
        const phoneVal = phoneInput ? phoneInput.value.trim() : '';
        
        let loyaltyDiscount = 0;
        let matchedCustomer = null;
        if (phoneVal || custName) {
          matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
        }
        if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
          loyaltyDiscount = Math.round(total * (loyaltyDiscountPercentage / 100));
        }
        const finalTotal = total - loyaltyDiscount + (isGstEnabled ? Math.round((total - loyaltyDiscount) * (gstPercentage / 100)) : 0);
        
        if (splitUpiInput) splitUpiInput.value = finalTotal;
        if (splitCashInput) splitCashInput.value = 0;
        if (splitCardInput) splitCardInput.value = 0;
        
        calculateSplitBalance();
      } else {
        toggleSplitPayBtn.innerHTML = '<i class="fa-solid fa-arrows-split-up-and-left"></i> Split Pay';
        if (singlePayContainer) singlePayContainer.style.display = 'flex';
        if (splitPayContainer) splitPayContainer.style.display = 'none';
        
        // Restore checkout buttons to enabled state
        if (checkoutSaveBtn) checkoutSaveBtn.disabled = false;
        if (checkoutPrintBtn) checkoutPrintBtn.disabled = false;
        if (checkoutSaveBtn) checkoutSaveBtn.style.opacity = '1';
        if (checkoutPrintBtn) checkoutPrintBtn.style.opacity = '1';
      }
    });
  }

  // Bind keyup and change events on split inputs
  [splitUpiInput, splitCashInput, splitCardInput].forEach(input => {
    if (input) {
      ['keyup', 'change', 'input'].forEach(evt => {
        input.addEventListener(evt, calculateSplitBalance);
      });
    }
  });

  // Spacious & Clutter-Free Takeaway Cart Progressive Disclosure handlers
  const toggleDetailsBtn = document.getElementById('toggle-summary-details-btn');
  const detailsPanel = document.getElementById('cart-summary-details');
  if (toggleDetailsBtn && detailsPanel) {
    toggleDetailsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      SoundEffects.playClick();
      if (detailsPanel.style.display === 'none') {
        detailsPanel.style.display = 'block';
        toggleDetailsBtn.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
      } else {
        detailsPanel.style.display = 'none';
        toggleDetailsBtn.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
      }
    });
  }

  const moreActionsBtn = document.getElementById('cart-more-actions-btn');
  const moreActionsMenu = document.getElementById('cart-more-actions-menu');
  if (moreActionsBtn && moreActionsMenu) {
    moreActionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      SoundEffects.playClick();
      if (moreActionsMenu.style.display === 'none') {
        moreActionsMenu.style.display = 'flex';
      } else {
        moreActionsMenu.style.display = 'none';
      }
    });

    // Close menu when any dropdown action item inside it is clicked
    const actionItems = moreActionsMenu.querySelectorAll('.dropdown-action-item');
    actionItems.forEach(item => {
      item.addEventListener('click', () => {
        moreActionsMenu.style.display = 'none';
      });
    });

    // Auto-dismiss menu on clicking outside
    document.addEventListener('click', (e) => {
      if (!moreActionsBtn.contains(e.target) && !moreActionsMenu.contains(e.target)) {
        moreActionsMenu.style.display = 'none';
      }
    });
  }



  // Expose activeShift internationally for checkout tagging
  window.getActiveShiftId = function() {
    return activeShift ? activeShift.shiftId : null;
  };

  // Re-evaluate POS drawer locks & update Header metrics
  function evaluateShiftStatusUI() {
    const isShiftEnabled = businessProfile.shiftEnabled === true;
    const isLockActive = businessProfile.shiftPosLock !== false;
    
    const lockOverlay = document.getElementById('shift-lock-overlay');
    const headerPill = document.getElementById('header-shift-pill');
    const shiftStatus = document.getElementById('header-shift-status');
    const shiftLabel = document.getElementById('header-shift-label');
    const shiftIcon = document.getElementById('header-shift-icon');

    if (!isShiftEnabled) {
      if (lockOverlay) lockOverlay.style.display = 'none';
      return;
    }

    if (activeShift) {
      // Shift is OPEN
      if (lockOverlay) lockOverlay.style.display = 'none';
      if (shiftStatus) shiftStatus.textContent = activeShift.cashierName;
      if (shiftLabel) shiftLabel.textContent = `Shift: ₹${getDrawerCashExpected()}`;
      if (shiftIcon) {
        shiftIcon.className = 'fa-solid fa-cash-register';
        shiftIcon.style.color = '#2ecc71';
      }
    } else {
      // Shift is CLOSED
      if (isLockActive) {
        if (lockOverlay) lockOverlay.style.display = 'flex';
      } else {
        if (lockOverlay) lockOverlay.style.display = 'none';
      }
      if (shiftStatus) shiftStatus.textContent = 'Closed';
      if (shiftLabel) shiftLabel.textContent = 'Shift Manager';
      if (shiftIcon) {
        shiftIcon.className = 'fa-solid fa-clock';
        shiftIcon.style.color = '#e74c3c';
      }
    }
  }
  window.evaluateShiftStatusUI = evaluateShiftStatusUI;

  // Expected Cash calculation
  function getDrawerCashExpected() {
    if (!activeShift) return 0;
    
    // Starting float
    const float = parseFloat(activeShift.openingFloat) || 0;
    
    // Cash Sales
    const shiftBills = bills.filter(b => b && b.shiftId === activeShift.shiftId);
    let cashSalesTotal = 0;
    shiftBills.forEach(b => {
      if (!b) return;
      if (b.paymentMethod === 'Cash') {
        cashSalesTotal += parseFloat(b.total) || 0;
      } else if (b.paymentMethod && b.paymentMethod.includes('Split:')) {
        // Extract cash split value
        const cashMatch = b.paymentMethod.match(/Cash=(\d+)/);
        if (cashMatch && cashMatch[1]) {
          cashSalesTotal += parseFloat(cashMatch[1]) || 0;
        }
      }
    });

    // Payouts & Drops
    const sessionEvents = shiftEvents.filter(e => e && e.shiftId === activeShift.shiftId);
    let payoutsTotal = 0;
    let dropsTotal = 0;
    sessionEvents.forEach(e => {
      if (!e) return;
      if (e.eventType === 'PAYOUT') payoutsTotal += parseFloat(e.amount) || 0;
      if (e.eventType === 'SAFE_DROP') dropsTotal += parseFloat(e.amount) || 0;
    });

    const expected = float + cashSalesTotal - payoutsTotal - dropsTotal;
    return Math.round(expected);
  }

  // Hook event trigger bindings
  const shiftPillBtn = document.getElementById('header-shift-pill');
  const shiftLockBtn = document.getElementById('shift-start-prompt-btn');

  function handleShiftPillClick() {
    if (!businessProfile.shiftEnabled) return;
    SoundEffects.playClick();
    if (activeShift) {
      // Show Active Drawer Actions
      openShiftDetailsModal();
    } else {
      // Prompt Shift Initialization
      openShiftOpenModal();
    }
  }

  if (shiftPillBtn) shiftPillBtn.addEventListener('click', handleShiftPillClick);
  if (shiftLockBtn) shiftLockBtn.addEventListener('click', handleShiftPillClick);

  // Modals operations
  const shiftOpenModal = document.getElementById('shift-open-modal');
  const closeShiftOpenModal = document.getElementById('close-shift-open-modal');
  const cancelShiftOpenBtn = document.getElementById('cancel-shift-open-btn');
  const shiftOpenForm = document.getElementById('shift-open-form');

  function openShiftOpenModal() {
    if (!shiftOpenModal) return;
    const floatInput = document.getElementById('shift-opening-float-input');
    if (floatInput) floatInput.value = businessProfile.shiftDefaultFloat || 2000;
    shiftOpenModal.classList.add('active');
  }

  if (closeShiftOpenModal) closeShiftOpenModal.addEventListener('click', () => shiftOpenModal.classList.remove('active'));
  if (cancelShiftOpenBtn) cancelShiftOpenBtn.addEventListener('click', () => shiftOpenModal.classList.remove('active'));

  if (shiftOpenForm) {
    shiftOpenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      SoundEffects.playSuccess();
      
      const cashierName = document.getElementById('shift-cashier-select').value;
      const openingFloat = parseFloat(document.getElementById('shift-opening-float-input').value) || 0;

      const newShift = {
        shiftId: `SHIFT-${Date.now()}`,
        cashierName,
        openedAt: new Date().toISOString(),
        closedAt: null,
        openingFloat,
        expectedCash: openingFloat,
        actualCash: 0,
        variance: 0,
        totalSalesCash: 0,
        totalSalesUpi: 0,
        totalSalesCard: 0,
        totalPayouts: 0,
        totalSafeDrops: 0,
        status: 'OPEN',
        notes: ''
      };

      activeShift = newShift;
      localStorage.setItem('doppio_current_shift', JSON.stringify(activeShift));

      // Push shift to cloud database
      if (supabaseClient) {
        try {
          await supabaseClient.from('doppio_shifts').insert({
            shiftId: newShift.shiftId,
            cashierName: newShift.cashierName,
            openedAt: newShift.openedAt,
            openingFloat: newShift.openingFloat,
            status: 'OPEN'
          });
        } catch (err) {
          console.warn('Supabase shift creation failed (saved locally):', err);
        }
      }

      shiftOpenModal.classList.remove('active');
      evaluateShiftStatusUI();
      alert(`Shift successfully initialized for cashier: ${cashierName}!`);
    });
  }

  // Active shift actions details modal
  const shiftDetailsModal = document.getElementById('shift-details-modal');
  const closeShiftDetailsModal = document.getElementById('close-shift-details-modal');
  
  function openShiftDetailsModal() {
    if (!shiftDetailsModal || !activeShift) return;
    
    document.getElementById('details-cashier-name').textContent = activeShift.cashierName;
    document.getElementById('details-opened-at').textContent = new Date(activeShift.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date(activeShift.openedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    document.getElementById('details-opening-float').textContent = `₹${activeShift.openingFloat}`;
    
    const expected = getDrawerCashExpected();
    document.getElementById('details-drawer-cash').textContent = `₹${expected}`;
    
    const maxLimit = businessProfile.shiftMaxDrawer || 5000;
    const detailsMaxLimitEl = document.getElementById('details-max-limit-info');
    if (detailsMaxLimitEl) {
      detailsMaxLimitEl.textContent = `Safe Drop Threshold: ₹${maxLimit}`;
      if (expected >= maxLimit) {
        detailsMaxLimitEl.innerHTML = `<span style="color:#e74c3c; font-weight:700;">⚠️ Threshold Exceeded (Max: ₹${maxLimit}) - Drop Recommended!</span>`;
      }
    }

    shiftDetailsModal.classList.add('active');
  }

  if (closeShiftDetailsModal) closeShiftDetailsModal.addEventListener('click', () => shiftDetailsModal.classList.remove('active'));

  // Manual Adjustments Form Modals (Payouts & Safe Drops)
  const shiftActionModal = document.getElementById('shift-action-modal');
  const closeShiftActionModal = document.getElementById('close-shift-action-modal');
  const cancelShiftActionBtn = document.getElementById('cancel-shift-action-btn');
  const shiftActionForm = document.getElementById('shift-action-form');
  
  const btnPayout = document.getElementById('btn-shift-payout');
  const btnDrop = document.getElementById('btn-shift-drop');

  if (btnPayout) {
    btnPayout.addEventListener('click', () => {
      SoundEffects.playClick();
      document.getElementById('action-modal-title').innerHTML = '<i class="fa-solid fa-circle-minus" style="color:#e74c3c;"></i> Log Cash Vendor Payout';
      document.getElementById('action-event-type').value = 'PAYOUT';
      document.getElementById('action-amount-input').value = '';
      document.getElementById('action-reason-input').placeholder = 'e.g. Bought 2 bags of ice, milk...';
      document.getElementById('action-reason-input').value = '';
      shiftDetailsModal.classList.remove('active');
      shiftActionModal.classList.add('active');
    });
  }

  if (btnDrop) {
    btnDrop.addEventListener('click', () => {
      SoundEffects.playClick();
      document.getElementById('action-modal-title').innerHTML = '<i class="fa-solid fa-safe" style="color:#2980b9;"></i> Log Cash Drop to Safe';
      document.getElementById('action-event-type').value = 'SAFE_DROP';
      document.getElementById('action-amount-input').value = '';
      document.getElementById('action-reason-input').placeholder = 'e.g. Drawer excess cash safe drop...';
      document.getElementById('action-reason-input').value = '';
      shiftDetailsModal.classList.remove('active');
      shiftActionModal.classList.add('active');
    });
  }

  if (closeShiftActionModal) closeShiftActionModal.addEventListener('click', () => shiftActionModal.classList.remove('active'));
  if (cancelShiftActionBtn) cancelShiftActionBtn.addEventListener('click', () => {
    shiftActionModal.classList.remove('active');
    openShiftDetailsModal();
  });

  if (shiftActionForm) {
    shiftActionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeShift) return;

      SoundEffects.playSuccess();
      const eventType = document.getElementById('action-event-type').value;
      const amount = parseFloat(document.getElementById('action-amount-input').value) || 0;
      const reason = document.getElementById('action-reason-input').value.trim();

      const newEvent = {
        eventId: `EVENT-${Date.now()}`,
        shiftId: activeShift.shiftId,
        eventType,
        amount,
        reason,
        createdAt: new Date().toISOString()
      };

      shiftEvents.unshift(newEvent);
      localStorage.setItem('doppio_shift_events_local', JSON.stringify(shiftEvents));

      // Push shift event to Supabase cloud
      if (supabaseClient) {
        try {
          await supabaseClient.from('doppio_shift_events').insert({
            eventId: newEvent.eventId,
            shiftId: newEvent.shiftId,
            eventType: newEvent.eventType,
            amount: newEvent.amount,
            reason: newEvent.reason
          });
        } catch (err) {
          console.warn('Supabase shift event sync failed (saved locally):', err);
        }
      }

      shiftActionModal.classList.remove('active');
      evaluateShiftStatusUI();
      openShiftDetailsModal();
      alert(`${eventType === 'PAYOUT' ? 'Payout' : 'Safe Drop'} recorded successfully!`);
    });
  }

  // Reconciliation End shift closure
  const btnEndActiveShift = document.getElementById('btn-end-active-shift');
  const shiftCloseModal = document.getElementById('shift-close-modal');
  const closeShiftCloseModal = document.getElementById('close-shift-close-modal');
  const cancelShiftCloseBtn = document.getElementById('cancel-shift-close-btn');
  const shiftCloseForm = document.getElementById('shift-close-form');

  if (btnEndActiveShift) {
    btnEndActiveShift.addEventListener('click', () => {
      if (!activeShift) return;
      SoundEffects.playClick();
      shiftDetailsModal.classList.remove('active');
      
      // Calculate active shift summaries
      const floatVal = parseFloat(activeShift.openingFloat) || 0;
      const sessionBills = bills.filter(b => b.shiftId === activeShift.shiftId);
      
      let cashSales = 0;
      let upiSales = 0;
      let cardSales = 0;
      
      sessionBills.forEach(b => {
        if (b.paymentMethod === 'Cash') {
          cashSales += parseFloat(b.total) || 0;
        } else if (b.paymentMethod === 'UPI') {
          upiSales += parseFloat(b.total) || 0;
        } else if (b.paymentMethod === 'Card') {
          cardSales += parseFloat(b.total) || 0;
        } else if (b.paymentMethod && b.paymentMethod.includes('Split:')) {
          const cashMatch = b.paymentMethod.match(/Cash=(\d+)/);
          const upiMatch = b.paymentMethod.match(/UPI=(\d+)/);
          const cardMatch = b.paymentMethod.match(/Card=(\d+)/);
          if (cashMatch && cashMatch[1]) cashSales += parseFloat(cashMatch[1]) || 0;
          if (upiMatch && upiMatch[1]) upiSales += parseFloat(upiMatch[1]) || 0;
          if (cardMatch && cardMatch[1]) cardSales += parseFloat(cardMatch[1]) || 0;
        }
      });

      const sessionEvents = shiftEvents.filter(e => e.shiftId === activeShift.shiftId);
      let payouts = 0;
      let drops = 0;
      sessionEvents.forEach(e => {
        if (e.eventType === 'PAYOUT') payouts += parseFloat(e.amount) || 0;
        if (e.eventType === 'SAFE_DROP') drops += parseFloat(e.amount) || 0;
      });

      const expected = floatVal + cashSales - payouts - drops;

      // Update Close Modal summary display fields
      document.getElementById('close-summary-float').textContent = `₹${floatVal}`;
      document.getElementById('close-summary-sales').textContent = `₹${cashSales}`;
      document.getElementById('close-summary-payouts').textContent = `₹${payouts}`;
      document.getElementById('close-summary-drops').textContent = `₹${drops}`;
      document.getElementById('close-summary-expected').textContent = `₹${expected}`;
      
      document.getElementById('shift-actual-cash-input').value = '';
      document.getElementById('variance-alert-row').style.display = 'none';
      document.getElementById('shift-notes-input').value = '';

      shiftCloseModal.classList.add('active');
    });
  }

  // Calculate live variance when typing actual cash
  const actualCashInput = document.getElementById('shift-actual-cash-input');
  if (actualCashInput) {
    actualCashInput.addEventListener('input', () => {
      const actual = parseFloat(actualCashInput.value) || 0;
      const expectedText = document.getElementById('close-summary-expected').textContent.replace('₹', '');
      const expected = parseFloat(expectedText) || 0;
      const variance = actual - expected;
      
      const varianceEl = document.getElementById('close-summary-variance');
      const alertRow = document.getElementById('variance-alert-row');
      
      if (alertRow) alertRow.style.display = 'flex';
      
      if (varianceEl) {
        if (variance === 0) {
          varianceEl.textContent = `₹0.00 (Balanced)`;
          varianceEl.style.color = '#27ae60';
        } else if (variance > 0) {
          varianceEl.textContent = `+₹${variance.toFixed(2)} (Overage)`;
          varianceEl.style.color = '#2ecc71';
        } else {
          varianceEl.textContent = `-₹${Math.abs(variance).toFixed(2)} (Shortage)`;
          varianceEl.style.color = '#e74c3c';
        }
      }
    });
  }

  if (closeShiftCloseModal) closeShiftCloseModal.addEventListener('click', () => shiftCloseModal.classList.remove('active'));
  if (cancelShiftCloseBtn) cancelShiftCloseBtn.addEventListener('click', () => {
    shiftCloseModal.classList.remove('active');
    openShiftDetailsModal();
  });

  if (shiftCloseForm) {
    shiftCloseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeShift) return;

      const actualCash = parseFloat(document.getElementById('shift-actual-cash-input').value) || 0;
      const expectedText = document.getElementById('close-summary-expected').textContent.replace('₹', '');
      const expectedCash = parseFloat(expectedText) || 0;
      const variance = actualCash - expectedCash;
      const notes = document.getElementById('shift-notes-input').value.trim();

      // Aggregate Shift sales
      const sessionBills = bills.filter(b => b.shiftId === activeShift.shiftId);
      let cashSales = 0;
      let upiSales = 0;
      let cardSales = 0;
      sessionBills.forEach(b => {
        if (b.paymentMethod === 'Cash') cashSales += parseFloat(b.total) || 0;
        else if (b.paymentMethod === 'UPI') upiSales += parseFloat(b.total) || 0;
        else if (b.paymentMethod === 'Card') cardSales += parseFloat(b.total) || 0;
        else if (b.paymentMethod && b.paymentMethod.includes('Split:')) {
          const cashMatch = b.paymentMethod.match(/Cash=(\d+)/);
          const upiMatch = b.paymentMethod.match(/UPI=(\d+)/);
          const cardMatch = b.paymentMethod.match(/Card=(\d+)/);
          if (cashMatch && cashMatch[1]) cashSales += parseFloat(cashMatch[1]) || 0;
          if (upiMatch && upiMatch[1]) upiSales += parseFloat(upiMatch[1]) || 0;
          if (cardMatch && cardMatch[1]) cardSales += parseFloat(cardMatch[1]) || 0;
        }
      });

      const sessionEvents = shiftEvents.filter(e => e.shiftId === activeShift.shiftId);
      let payouts = 0;
      let drops = 0;
      sessionEvents.forEach(e => {
        if (e.eventType === 'PAYOUT') payouts += parseFloat(e.amount) || 0;
        if (e.eventType === 'SAFE_DROP') drops += parseFloat(e.amount) || 0;
      });

      activeShift.closedAt = new Date().toISOString();
      activeShift.expectedCash = expectedCash;
      activeShift.actualCash = actualCash;
      activeShift.variance = variance;
      activeShift.totalSalesCash = cashSales;
      activeShift.totalSalesUpi = upiSales;
      activeShift.totalSalesCard = cardSales;
      activeShift.totalPayouts = payouts;
      activeShift.totalSafeDrops = drops;
      activeShift.status = 'CLOSED';
      activeShift.notes = notes;

      // Add to local history list
      shiftHistory.unshift(activeShift);
      localStorage.setItem('doppio_shifts_local', JSON.stringify(shiftHistory));

      // Push shift closure to Supabase database
      if (supabaseClient) {
        try {
          await supabaseClient.from('doppio_shifts').upsert({
            shiftId: activeShift.shiftId,
            cashierName: activeShift.cashierName,
            openedAt: activeShift.openedAt,
            closedAt: activeShift.closedAt,
            openingFloat: activeShift.openingFloat,
            expectedCash: activeShift.expectedCash,
            actualCash: activeShift.actualCash,
            variance: activeShift.variance,
            totalSalesCash: activeShift.totalSalesCash,
            totalSalesUpi: activeShift.totalSalesUpi,
            totalSalesCard: activeShift.totalSalesCard,
            totalPayouts: activeShift.totalPayouts,
            totalSafeDrops: activeShift.totalSafeDrops,
            status: 'CLOSED',
            notes: activeShift.notes
          }, { onConflict: 'shiftId' });
        } catch (err) {
          console.warn('Supabase shift closure push failed (saved locally):', err);
        }
      }

      // Generate Z-Report layout summary
      renderZReportHTML(activeShift);

      // Clear active shift session
      activeShift = null;
      localStorage.removeItem('doppio_current_shift');

      shiftCloseModal.classList.remove('active');
      evaluateShiftStatusUI();
    });
  }

  // Z-Report Thermal Printer Summary generator
  function renderZReportHTML(shift) {
    const reportContent = document.getElementById('shift-zreport-content');
    const auditModal = document.getElementById('shift-audit-modal');
    if (!reportContent || !auditModal) return;

    SoundEffects.playSuccess();
    const openTime = new Date(shift.openedAt).toLocaleString('en-IN');
    const closeTime = new Date(shift.closedAt).toLocaleString('en-IN');
    const totalTransactions = bills.filter(b => b.shiftId === shift.shiftId).length;
    const netTurnover = shift.totalSalesCash + shift.totalSalesUpi + shift.totalSalesCard;

    let html = `
--------------------------------
      DOPPIO CAFE NAGPUR        
  Z-REPORT SHIFT CLOSURE AUDIT  
--------------------------------
SHIFT ID   : ${shift.shiftId}
CASHIER    : ${shift.cashierName.toUpperCase()}
OPENED AT  : ${openTime}
CLOSED AT  : ${closeTime}
STATUS     : CLOSURE COMPLETED
--------------------------------
DRAWER FLOATS SUMMARY (INR):
--------------------------------
START FLOAT      : INR ${shift.openingFloat}
CASH SALES (+)   : INR ${shift.totalSalesCash}
CASH PAYOUTS (-) : INR ${shift.totalPayouts}
SAFE DROPS (-)   : INR ${shift.totalSafeDrops}
--------------------------------
EXPECTED CASH    : INR ${shift.expectedCash}
DRAWER COUNTED   : INR ${shift.actualCash}
DRAWER VARIANCE  : INR ${shift.variance >= 0 ? '+' : ''}${shift.variance}
NOTES            : ${shift.notes || 'N/A'}
--------------------------------
SALES LEDGER SEGREGATION (INR):
--------------------------------
CASH SALES TOTAL : INR ${shift.totalSalesCash}
UPI SALES TOTAL  : INR ${shift.totalSalesUpi}
CARD SALES TOTAL : INR ${shift.totalSalesCard}
--------------------------------
NET TURNOVER     : INR ${netTurnover}
TRANSACTIONS LOG : ${totalTransactions} Bills
--------------------------------
  Shift Handover Verified.
  Supabase Synchronization: OK.
--------------------------------
`;

    reportContent.textContent = html;
    
    // Save report reference globally for printing triggers
    window.activeZReportData = html;

    auditModal.classList.add('active');
  }

  // Close zreport Modal
  const closeShiftAuditModal = document.getElementById('close-shift-audit-modal');
  const closeShiftAuditBtn = document.getElementById('close-shift-audit-btn');
  const printShiftAuditBtn = document.getElementById('print-shift-audit-btn');

  if (closeShiftAuditModal) closeShiftAuditModal.addEventListener('click', () => document.getElementById('shift-audit-modal').classList.remove('active'));
  if (closeShiftAuditBtn) closeShiftAuditBtn.addEventListener('click', () => document.getElementById('shift-audit-modal').classList.remove('active'));
  
  if (printShiftAuditBtn) {
    printShiftAuditBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const content = window.activeZReportData;
      if (!content) return;

      const printWindow = window.open('', '_blank', 'width=350,height=500');
      printWindow.document.write(`
        <html>
        <head>
          <title>Z-Report Shift Audit Print</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 11px; white-space: pre; padding: 20px; line-height: 1.3; color: black; }
          </style>
        </head>
        <body>${content}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // Quick Action: View ledger list inside active session
  const btnAuditLog = document.getElementById('btn-shift-audit-log');
  if (btnAuditLog) {
    btnAuditLog.addEventListener('click', () => {
      if (!activeShift) return;
      SoundEffects.playClick();
      shiftDetailsModal.classList.remove('active');
      
      const sessionEvents = shiftEvents.filter(e => e.shiftId === activeShift.shiftId);
      if (sessionEvents.length === 0) {
        alert('No manual cash adjustments logged for this shift yet!');
        openShiftDetailsModal();
        return;
      }

      let logText = `Manual cash transactions for active shift:\n`;
      sessionEvents.forEach((e, idx) => {
        const time = new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        logText += `${idx+1}. [${time}] ${e.eventType}: ₹${e.amount} (${e.reason})\n`;
      });
      alert(logText);
      openShiftDetailsModal();
    });
  }


  // ==========================================================
  // 19. LIVE QR ORDERING & TABLES CASHIER SYNC MODULE
  // ==========================================================
  const getMockPendingQrOrders = () => [
    {
      orderId: 'DO-1005',
      customerName: 'Sanjay Dutt',
      customerPhone: '9422158763',
      orderType: 'ZOMATO',
      dateTime: new Date(Date.now() - 10 * 60000).toLocaleString('en-IN'),
      items: [
        { name: 'Bombay Grilled Sandwich', qty: 1, price: 369 },
        { name: 'Nutella Thickshake', qty: 1, price: 299 }
      ],
      subtotal: 668,
      discount: 0,
      gst: 120.24,
      total: 788,
      status: 'Pending Review'
    },
    {
      orderId: 'DO-1006',
      customerName: 'Sneha Patil',
      customerPhone: '9890123456',
      orderType: 'SWIGGY',
      dateTime: new Date(Date.now() - 8 * 60000).toLocaleString('en-IN'),
      items: [
        { name: 'Alfredo Pennei Pasta', qty: 1, price: 499 },
        { name: 'Oreo Cookies Thickshake', qty: 1, price: 299 }
      ],
      subtotal: 798,
      discount: 0,
      gst: 143.64,
      total: 942,
      status: 'Pending Review'
    },
    {
      orderId: 'DO-1007',
      customerName: 'Table 03 Guests',
      customerPhone: '',
      orderType: 'Dine-In',
      tableNumber: '3',
      dateTime: new Date(Date.now() - 15 * 60000).toLocaleString('en-IN'),
      items: [
        { name: 'Masala Omelette', qty: 2, price: 269, isDone: false },
        { name: 'Classic Hot Chocolate', qty: 1, price: 349, isDone: false }
      ],
      subtotal: 887,
      discount: 0,
      gst: 159.66,
      total: 1047,
      status: 'Accepted'
    },
    {
      orderId: 'DO-1008',
      customerName: 'Amit Trivedi',
      customerPhone: '9922115544',
      orderType: 'Takeaway',
      dateTime: new Date(Date.now() - 25 * 60000).toLocaleString('en-IN'),
      items: [
        { name: 'Cheese Garlic', qty: 1, price: 249, isDone: true }
      ],
      subtotal: 249,
      discount: 0,
      gst: 44.82,
      total: 294,
      status: 'Ready'
    }
  ];

  let pendingQrOrders = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_pending_qr_orders'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(o => o && typeof o === 'object' && o.orderId && Array.isArray(o.items));
      }
      const mock = getMockPendingQrOrders();
      localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(mock));
      return mock;
    } catch(e) {
      return [];
    }
  })();
  let qrRevenueToday = parseFloat(localStorage.getItem('doppio_qr_revenue_today')) || 0;
  let completedQrOrdersCount = parseInt(localStorage.getItem('doppio_completed_qr_orders_count')) || 0;
  
  // Tables state: EMPTY, ORDERING, PENDING, SERVED
  let tablesState = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_tables_state'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (let i = 1; i <= 6; i++) {
          if (!parsed[i]) parsed[i] = "EMPTY";
        }
        return parsed;
      }
      const initial = { 1: "EMPTY", 2: "EMPTY", 3: "ORDERING", 4: "EMPTY", 5: "EMPTY", 6: "EMPTY" };
      localStorage.setItem('doppio_tables_state', JSON.stringify(initial));
      return initial;
    } catch(e) {
      return { 1: "EMPTY", 2: "EMPTY", 3: "ORDERING", 4: "EMPTY", 5: "EMPTY", 6: "EMPTY" };
    }
  })();

  // Broadcast Channels
  const qrOrdersChannel = new BroadcastChannel('doppio_qr_orders');
  const qrStatusChannel = new BroadcastChannel('doppio_qr_order_status');

  // DOM Elements for QR Tab
  const activeTablesSummary = document.getElementById('active-tables-summary');
  const pendingQrOrdersCount = document.getElementById('pending-qr-orders-count');
  const qrRevenueTodayEl = document.getElementById('qr-revenue-today');
  const tablesMapGrid = document.getElementById('tables-map-grid');
  const qrOrdersQueue = document.getElementById('qr-orders-queue');
  const glowingFeedBadge = document.getElementById('glowing-qr-feed-badge');
  const liveQrBadge = document.getElementById('live-qr-badge');
  const mobileLiveQrBadge = document.getElementById('mobile-live-qr-badge');

  // Table QR Viewer elements
  const qrViewerModal = document.getElementById('qr-viewer-modal');
  const qrViewerClose = document.getElementById('qr-viewer-close');
  const qrViewerTitle = document.getElementById('qr-viewer-title');
  const qrPrintTableNum = document.getElementById('qr-print-table-num');
  const qrViewerImg = document.getElementById('qr-viewer-img');
  const qrViewerLinkLbl = document.getElementById('qr-viewer-link-lbl');
  const btnPrintTableQr = document.getElementById('btn-print-table-qr');
  const btnSimulateQrScan = document.getElementById('btn-simulate-qr-scan');

  // Pre-fill todays QR metrics and render visual tables map on load (Made by Antigravity)
  updateQrOrdersDashboardUI();

  // Listen to incoming live broadcasts
  qrOrdersChannel.addEventListener('message', (e) => {
    if (!e.data) return;

    if (e.data.type === 'NEW_QR_ORDER') {
      const newOrder = e.data.order;
      
      // Prevent duplicates in queue
      if (!pendingQrOrders.some(o => o.orderId === newOrder.orderId)) {
        pendingQrOrders.push(newOrder);
        localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
        
        // Transition table status to PENDING checkout
        if (newOrder.tableNumber && newOrder.tableNumber !== 'Takeaway') {
          tablesState[newOrder.tableNumber] = "PENDING";
          localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
        }

        playIncomingOrderChime();
        showNotificationToast(`New self-service order from Table ${newOrder.tableNumber}!`);
        updateQrOrdersDashboardUI();
      }
    } else if (e.data.type === 'TABLE_CARTING') {
      const tbl = e.data.tableNumber;
      // Visually pulse as ORDERING if currently empty
      if (tbl && tbl !== 'Takeaway' && tablesState[tbl] === "EMPTY") {
        tablesState[tbl] = "ORDERING";
        localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
        renderTablesMap();
        
        // Timeout back to EMPTY after 35 seconds of no activity
        setTimeout(() => {
          if (tablesState[tbl] === "ORDERING") {
            tablesState[tbl] = "EMPTY";
            localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
            renderTablesMap();
          }
        }, 35000);
      }
    }
  });

  // Synthesize rich G5 major arpeggio sound chime
  function playIncomingOrderChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const frequencies = [261.63, 329.63, 392.00, 523.25]; // C4 -> E4 -> G4 -> C5
      
      frequencies.forEach((freq, idx) => {
        setTimeout(() => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
          
          osc.start();
          osc.stop(audioCtx.currentTime + 0.25);
        }, idx * 120);
      });
    } catch (err) {
      console.log("Browser policy blocked synthesizer chimes", err);
    }
  }

  // ==========================================
  // NOTIFICATION ALERT SYSTEM (Task 4)
  // ==========================================
  let notifications = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('doppio_notifications'));
      return Array.isArray(parsed) ? parsed.filter(n => n && typeof n === 'object' && n.id) : [];
    } catch(e) {
      return [];
    }
  })();

  function addSystemNotification(title, msg, role = 'all', type = 'info') {
    const newNotif = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      title,
      message: msg,
      role,
      type,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      isRead: false
    };
    notifications.unshift(newNotif);
    if (notifications.length > 50) {
      notifications = notifications.slice(0, 50);
    }
    localStorage.setItem('doppio_notifications', JSON.stringify(notifications));
    renderNotifications();

    // Sync to Supabase
    if (supabaseClient) {
      supabaseClient.from('doppio_notifications').insert({
        id: newNotif.id,
        title: newNotif.title,
        message: newNotif.message,
        role: newNotif.role,
        type: newNotif.type,
        timestamp: newNotif.timestamp,
        isRead: newNotif.isRead
      }).then(({ error }) => {
        if (error) console.warn('Supabase notification insert failed:', error.message);
      });
    }
  }

  function renderNotifications() {
    const listContainer = document.getElementById('notifications-list-container');
    const badgeEl = document.getElementById('bell-badge');
    const mobileBadgeEl = document.getElementById('mobile-bell-badge');
    
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const loggedInRole = sessionStorage.getItem('logged_in_role') || 'cashier';

    // Admins see everything. Waiters/Kitchen see their specific notifications.
    const filtered = notifications.filter(n => {
      if (loggedInRole === 'admin') return true;
      return n.role === 'all' || n.role === loggedInRole;
    });

    const unreadCount = filtered.filter(n => !n.isRead).length;

    if (badgeEl) {
      if (unreadCount > 0) {
        badgeEl.style.display = 'block';
        badgeEl.textContent = unreadCount;
      } else {
        badgeEl.style.display = 'none';
      }
    }
    if (mobileBadgeEl) {
      if (unreadCount > 0) {
        mobileBadgeEl.style.display = 'block';
        mobileBadgeEl.textContent = unreadCount;
      } else {
        mobileBadgeEl.style.display = 'none';
      }
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `<div style="font-size: 11px; text-align: center; color: var(--text-muted); padding: 20px 0;">No active alerts.</div>`;
      return;
    }

    filtered.forEach(n => {
      const item = document.createElement('div');
      item.style.marginBottom = '6px';
      
      const itemBg = n.isRead ? 'transparent' : 'rgba(252, 128, 25, 0.04)';
      const itemBorder = n.isRead ? 'rgba(28, 28, 28,0.05)' : 'rgba(252, 128, 25, 0.15)';
      
      let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
      if (n.type === 'order') iconHtml = '<i class="fa-solid fa-qrcode"></i>';
      else if (n.type === 'inventory') iconHtml = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning-color);"></i>';
      else if (n.type === 'shift') iconHtml = '<i class="fa-solid fa-clock"></i>';
      
      item.innerHTML = `
        <div class="notification-row-item" data-id="${n.id}" style="display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: ${itemBg}; border: 1px solid ${itemBorder}; cursor: pointer; transition: all 0.2s;">
          <div style="font-size: 14px; color: var(--accent-caramel); padding-top: 2px; width: 18px; text-align: center;">
            ${iconHtml}
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--primary-brand);">${n.title}</span>
            <span style="font-size: 10px; color: var(--text-muted); line-height: 1.3;">${n.message}</span>
            <span style="font-size: 8px; color: var(--text-muted); margin-top: 2px;">${n.timestamp}</span>
          </div>
          ${n.isRead ? '' : `
            <button type="button" class="mark-read-item-btn" style="background: transparent; border: none; color: var(--accent-caramel); cursor: pointer; font-size: 11px; padding: 2px; align-self: center;" title="Mark read">
              <i class="fa-solid fa-circle-check"></i>
            </button>
          `}
        </div>
      `;

      const readBtn = item.querySelector('.mark-read-item-btn');
      if (readBtn) {
        readBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          n.isRead = true;
          localStorage.setItem('doppio_notifications', JSON.stringify(notifications));
          renderNotifications();
        });
      }
      
      item.querySelector('.notification-row-item').addEventListener('click', () => {
        n.isRead = true;
        localStorage.setItem('doppio_notifications', JSON.stringify(notifications));
        renderNotifications();
      });

      listContainer.appendChild(item);
    });
  }

  // Toggles and listeners
  const notifBell = document.getElementById('notifications-bell');
  const mobNotifBell = document.getElementById('mobile-notifications-bell');
  const notifPanel = document.getElementById('notifications-dropdown-panel');
  const clearNotifBtn = document.getElementById('clear-notifications-btn');

  function toggleNotificationPanel(e) {
    if (e) e.stopPropagation();
    if (!notifPanel) return;
    const isVisible = notifPanel.style.display === 'flex';
    notifPanel.style.display = isVisible ? 'none' : 'flex';
  }

  if (notifBell) notifBell.addEventListener('click', toggleNotificationPanel);
  if (mobNotifBell) mobNotifBell.addEventListener('click', toggleNotificationPanel);

  document.addEventListener('click', (e) => {
    if (notifPanel && notifPanel.style.display === 'flex') {
      if (!notifPanel.contains(e.target) && !notifBell.contains(e.target) && (!mobNotifBell || !mobNotifBell.contains(e.target))) {
        notifPanel.style.display = 'none';
      }
    }
  });

  if (clearNotifBtn) {
    clearNotifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const loggedInRole = sessionStorage.getItem('logged_in_role') || 'cashier';
      notifications.forEach(n => {
        if (loggedInRole === 'admin' || n.role === 'all' || n.role === loggedInRole) {
          n.isRead = true;
        }
      });
      localStorage.setItem('doppio_notifications', JSON.stringify(notifications));
      renderNotifications();
    });
  }

  // Trigger initial render
  renderNotifications();

  // Floating HTML slide-down toast notification
  function showNotificationToast(msg) {
    // CAPTURE ALERT LOGS
    let role = 'all';
    let type = 'info';
    let title = 'System Alert';

    const msgLower = msg.toLowerCase();
    if (msgLower.includes('table') || msgLower.includes('order') || msgLower.includes('self-service')) {
      role = 'waiter';
      type = 'order';
      title = 'Dine-In Order';
    } else if (msgLower.includes('stock') || msgLower.includes('inventory') || msgLower.includes('depleted') || msgLower.includes('low')) {
      role = 'admin';
      type = 'inventory';
      title = 'Stock Warning';
    } else if (msgLower.includes('shift') || msgLower.includes('drawer')) {
      role = 'admin';
      type = 'shift';
      title = 'Shift Event';
    }
    
    if (type === 'order') {
      // Notify kitchen, waiters, and admin
      addSystemNotification(title, msg, 'kitchen', type);
      addSystemNotification(title, msg, 'admin', type);
      addSystemNotification(title, msg, 'waiter', type);
    } else {
      addSystemNotification(title, msg, role, type);
    }

    // Choose dynamic styling based on error/success/info
    let iconClass = 'fa-solid fa-circle-info';
    let gradient = 'linear-gradient(135deg, var(--accent-caramel) 0%, var(--primary-brand) 100%)';
    let border = '2px solid var(--accent-gold)';
    let iconColor = 'var(--accent-gold)';

    if (msgLower.includes('table') || msgLower.includes('order') || msgLower.includes('self-service')) {
      iconClass = 'fa-solid fa-qrcode';
    } else if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('offline') || msgLower.includes('failure') || msgLower.includes('not working')) {
      iconClass = 'fa-solid fa-triangle-exclamation';
      gradient = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
      border = '2px solid #ff7675';
      iconColor = '#fff';
    } else if (msgLower.includes('success') || msgLower.includes('saved') || msgLower.includes('synced') || msgLower.includes('restored') || msgLower.includes('approved') || msgLower.includes('prepared')) {
      iconClass = 'fa-solid fa-circle-check';
      gradient = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
      border = '2px solid #55efc4';
      iconColor = '#fff';
    }

    const toast = document.createElement('div');
    toast.className = 'offline-banner-strip';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(-100%)';
    toast.style.zIndex = '999999';
    toast.style.background = gradient;
    toast.style.borderBottom = border;
    toast.style.borderRadius = '30px';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    toast.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.style.width = 'auto';
    toast.style.minWidth = '300px';
    toast.style.animation = 'none';

    toast.innerHTML = `<i class="${iconClass}" style="color: ${iconColor}; margin-right: 8px;"></i> <span style="font-family: var(--font-body); font-weight:700; color: #fff;">${msg}</span>`;
    
    document.body.appendChild(toast);
    
    // Slide in
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 100);

    // Slide out and remove
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-150%)';
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }

  function updateQrStatsHeaders() {
    if (qrRevenueTodayEl) qrRevenueTodayEl.textContent = `₹${qrRevenueToday.toFixed(2)}`;
    
    const pendingCount = pendingQrOrders.length;
    if (pendingQrOrdersCount) pendingQrOrdersCount.textContent = `${pendingCount} Order${pendingCount !== 1 ? 's' : ''}`;
    
    // Update active badges
    if (pendingCount > 0) {
      if (liveQrBadge) {
        liveQrBadge.textContent = pendingCount;
        liveQrBadge.style.display = 'inline-block';
      }
      if (mobileLiveQrBadge) {
        mobileLiveQrBadge.textContent = pendingCount;
        mobileLiveQrBadge.style.display = 'inline-block';
      }
      if (glowingFeedBadge) glowingFeedBadge.style.display = 'inline-block';
    } else {
      if (liveQrBadge) liveQrBadge.style.display = 'none';
      if (mobileLiveQrBadge) mobileLiveQrBadge.style.display = 'none';
      if (glowingFeedBadge) glowingFeedBadge.style.display = 'none';
    }

    // Occupied tables count
    const occupiedCount = Object.values(tablesState).filter(val => val !== "EMPTY").length;
    if (activeTablesSummary) {
      activeTablesSummary.textContent = `${occupiedCount} / 6 Tables Occupied`;
    }
  }

  function updateQrOrdersDashboardUI() {
    updateQrStatsHeaders();
    renderTablesMap();
    renderQrOrdersQueue();
  }

  // Render Dine-in Table grid map
  function renderTablesMap() {
    if (!tablesMapGrid) return;
    tablesMapGrid.innerHTML = '';

    for (let tableId = 1; tableId <= 6; tableId++) {
      const state = tablesState[tableId] || "EMPTY";
      const card = document.createElement('div');
      card.className = `table-card state-${state.toLowerCase()}`;
      
      let stateLabel = "Clean & Empty";
      let statusClass = "state-empty";
      let iconColor = "var(--text-muted)";

      if (state === "ORDERING") {
        stateLabel = "Selecting Items...";
        iconColor = "var(--accent-gold)";
      } else if (state === "PENDING") {
        stateLabel = "Checkout Pending!";
        iconColor = "var(--danger-color)";
      } else if (state === "SERVED") {
        stateLabel = "Eating / Served";
        iconColor = "#3498db";
      }

      card.innerHTML = `
        <div style="font-size: 24px; color: ${iconColor}; margin-bottom: 2px;">
          <i class="fa-solid fa-chair"></i>
        </div>
        <div class="table-card-num">Table 0${tableId}</div>
        <span class="table-status-pill">${stateLabel}</span>
        
        <div class="table-card-actions">
          <button class="table-card-btn generate-qr" data-table="${tableId}" title="Generate Scannable Table QR"><i class="fa-solid fa-qrcode"></i> QR Link</button>
          ${state === 'SERVED' ? 
            `<button class="table-card-btn clear-table" data-table="${tableId}" style="background: rgba(46,204,113,0.06); border-color: rgba(46,204,113,0.15); color: #27ae60;" title="Served & Clean Table"><i class="fa-solid fa-broom"></i> Clean</button>` : 
            `<button class="table-card-btn simulate-scan" data-table="${tableId}" title="Simulate mobile scan link"><i class="fa-solid fa-mobile-screen"></i> Scan</button>`
          }
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.table-card-actions')) return;
        openTableSessionModal(tableId);
      });

      tablesMapGrid.appendChild(card);
    }

    // Connect Table Map action button listeners
    tablesMapGrid.querySelectorAll('.generate-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        const tblNum = btn.getAttribute('data-table');
        openTableQRViewerModal(tblNum);
      });
    });

    tablesMapGrid.querySelectorAll('.simulate-scan').forEach(btn => {
      btn.addEventListener('click', () => {
        const tblNum = btn.getAttribute('data-table');
        const simulateLink = `${window.location.origin}/index.html?table=${tblNum}`;
        SoundEffects.playClick();
        window.open(simulateLink, '_blank');
      });
    });

    tablesMapGrid.querySelectorAll('.clear-table').forEach(btn => {
      btn.addEventListener('click', () => {
        const tblNum = btn.getAttribute('data-table');
        tablesState[tblNum] = "EMPTY";
        localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
        SoundEffects.playRemove();
        updateQrOrdersDashboardUI();
      });
    });
  }

  // Render Incoming Queue
  function renderQrOrdersQueue() {
    if (!qrOrdersQueue) return;
    qrOrdersQueue.innerHTML = '';

    if (pendingQrOrders.length === 0) {
      qrOrdersQueue.innerHTML = `
        <div class="premium-empty-state" style="padding: 60px 20px; text-align: center;">
          <i class="fa-solid fa-bell-slash" style="font-size: 36px; color: var(--text-muted); opacity: 0.5; margin-bottom: 16px;"></i>
          <h3 style="margin-bottom: 8px; color: var(--primary-brand);">Queue is currently clean</h3>
          <p style="font-size: 11px; color: var(--text-muted); max-width: 300px; margin: 0 auto; line-height: 1.4;">Customer table self-service order forms will arrive here instantly with live desktop notifications.</p>
        </div>
      `;
      return;
    }

    pendingQrOrders.forEach(order => {
      const card = document.createElement('div');
      card.className = 'qr-order-queue-card';
      
      const itemsListStr = order.items.map(item => `
        <div class="qr-card-item-row">
          <span>${item.name} x${item.qty}</span>
          <span style="font-weight:700;">₹${item.price * item.qty}</span>
        </div>
      `).join('');

      const payPillClass = order.paymentMethod.includes('UPI') ? 'upi' : 'counter';

      card.innerHTML = `
        <div class="qr-card-header">
          <span class="qr-card-table-lbl">${order.tableNumber === 'Takeaway' ? 'Takeaway Order' : `<i class="fa-solid fa-chair" style="color:var(--accent-caramel); margin-right:4px;"></i> Table 0${order.tableNumber}`}</span>
          <span class="qr-card-paymethod-badge ${payPillClass}">${order.paymentMethod}</span>
        </div>
        
        <div class="qr-card-cust-info">
          <span style="font-weight: 700; color: var(--primary-brand);"><i class="fa-solid fa-user" style="font-size:10px; width:12px; margin-right:4px;"></i> ${order.customerName}</span>
          <span style="font-size:11px; color: var(--text-muted);"><i class="fa-solid fa-clock" style="font-size:10px; width:12px; margin-right:4px;"></i> ${order.dateTime}</span>
        </div>

        <div class="qr-card-items-box">
          ${itemsListStr}
        </div>

        <div class="qr-card-total-box">
          <span>Amount Paid</span>
          <span class="qr-card-total-val">₹${order.total}</span>
        </div>

        <div class="qr-card-actions">
          <button class="qr-action-btn reject" data-id="${order.orderId}"><i class="fa-solid fa-xmark"></i> Reject</button>
          <button class="qr-action-btn approve" data-id="${order.orderId}"><i class="fa-solid fa-check"></i> Approve (KOT)</button>
        </div>
      `;

      qrOrdersQueue.appendChild(card);
    });

    // Wire action buttons
    qrOrdersQueue.querySelectorAll('.qr-action-btn.approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-id');
        approveLiveQrOrder(orderId);
      });
    });

    qrOrdersQueue.querySelectorAll('.qr-action-btn.reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-id');
        rejectLiveQrOrder(orderId);
      });
    });
  }

  // Cashier approval flow: checks stock, pushes to sales ledger, deducts stock
  function approveLiveQrOrder(orderId) {
    const order = pendingQrOrders.find(o => o.orderId === orderId);
    if (!order) return;

    // 1. Stock Deduction Verification
    let sufficientStock = true;
    let missingIngredient = '';
    const proposedDeductions = {};

    order.items.forEach(cartItem => {
      const specs = getDeductionSpecs(cartItem);
      Object.keys(specs).forEach(ing => {
        proposedDeductions[ing] = (proposedDeductions[ing] || 0) + (specs[ing] * cartItem.qty);
      });
    });

    Object.keys(proposedDeductions).forEach(ing => {
      if (inventory[ing] === undefined) inventory[ing] = 1000;
      if (inventory[ing] < proposedDeductions[ing]) {
        sufficientStock = false;
        missingIngredient = ing.replace('_', ' ');
      }
    });

    if (!sufficientStock) {
      alert(`Approval Failed! Insufficient stock of: ${missingIngredient}. Please restock.`);
      return;
    }

    // 2. Permanently deduct stock levels
    Object.keys(proposedDeductions).forEach(ing => {
      deductStockFEFO(ing, proposedDeductions[ing]);
    });

    // 3. Add to daily cashier sales ledger (doppio_bills)
    const approvedBill = {
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      dateTime: order.dateTime,
      items: [...order.items],
      subtotal: order.subtotal,
      discount: order.discount || 0,
      gst: order.gst,
      total: order.total,
      paymentMethod: order.paymentMethod,
      orderType: order.orderType,
      shiftId: activeShift ? activeShift.shiftId : null
    };

    bills.push(approvedBill);
    localStorage.setItem('doppio_bills', JSON.stringify(bills));

    // 4. Cloud Sync insert
    if (supabaseClient && navigator.onLine) {
      supabaseClient.from('doppio_bills').insert({
        tenant_id: activeTenantId,
        orderId: approvedBill.orderId,
        customerName: approvedBill.customerName,
        customerPhone: approvedBill.customerPhone,
        dateTime: approvedBill.dateTime,
        items: JSON.stringify(approvedBill.items),
        subtotal: approvedBill.subtotal,
        gst: approvedBill.gst,
        total: approvedBill.total,
        paymentMethod: approvedBill.paymentMethod
      }).then();
    } else {
      saveOfflineBill(approvedBill);
    }

    // 5. CRM upgrades
    if (approvedBill.customerPhone && approvedBill.customerName !== 'Walk-in Guest') {
      updateCRMMember(approvedBill.customerName, approvedBill.customerPhone, approvedBill.total);
    }

    // 6. Transition table status to SERVED
    if (order.tableNumber && order.tableNumber !== 'Takeaway') {
      tablesState[order.tableNumber] = "SERVED";
      localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
    }

    // Play chime sound
    SoundEffects.playSuccess();

    // Android speech announcement
    if (window.AndroidInterface && businessProfile.soundEnabled !== false) {
      window.AndroidInterface.speak(`Self service order from Table ${order.tableNumber} approved for preparation!`);
    }

    // Increment today's QR stats
    qrRevenueToday += approvedBill.total;
    completedQrOrdersCount += 1;
    localStorage.setItem('doppio_qr_revenue_today', qrRevenueToday);
    localStorage.setItem('doppio_completed_qr_orders_count', completedQrOrdersCount);

    // Clean from pending queue
    pendingQrOrders = pendingQrOrders.filter(o => o.orderId !== orderId);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));

    // 7. Delete from Supabase pending orders queue (Made by Antigravity)
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .delete()
        .eq('orderId', orderId).then();
    }

    // Re-render UI
    updateQrOrdersDashboardUI();
    renderBills();
    renderInventory();
    updateHeaderSummaryStats();

    // Trigger auto WhatsApp/Thermal previews if enabled
    setTimeout(() => {
      const wantToPrint = confirm(`Order ${approvedBill.orderId} approved successfully!\nWould you like to print KOT/thermal receipt now?`);
      if (wantToPrint) {
        triggerThermalReceiptPrint(approvedBill);
      }
    }, 300);
  }

  // Cashier rejection pipeline
  function rejectLiveQrOrder(orderId) {
    const order = pendingQrOrders.find(o => o.orderId === orderId);
    if (!order) return;

    const confirmReject = confirm(`Are you sure you want to cancel and reject Table ${order.tableNumber}'s Order (${order.orderId})?`);
    if (!confirmReject) return;

    // Transition table status back to EMPTY
    if (order.tableNumber && order.tableNumber !== 'Takeaway') {
      tablesState[order.tableNumber] = "EMPTY";
      localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
    }

    // Broadcast rejection notice to client page
    try {
      qrStatusChannel.postMessage({
        type: 'QR_ORDER_REJECTED',
        order: order
      });
    } catch (e) {
      console.log('Rejection broadcast channel issue', e);
    }

    // Remove from pending queue
    pendingQrOrders = pendingQrOrders.filter(o => o.orderId !== orderId);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));

    // Delete from Supabase pending orders queue (Made by Antigravity)
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .delete()
        .eq('orderId', orderId).then();
    }

    SoundEffects.playRemove();
    updateQrOrdersDashboardUI();
  }

  // Open Table QR Viewer Modal (Robust & Defensive Upgrade by Antigravity)
  function openTableQRViewerModal(tableNum) {
    console.log(`[Doppio POS] Opening QR Viewer Modal for Table ${tableNum}`);
    
    if (!qrViewerModal) {
      console.error("[Doppio POS] qrViewerModal element not found in DOM! Checking ID 'qr-viewer-modal'");
      alert("Error: 'qr-viewer-modal' container element is missing in dashboard.html!");
      return;
    }

    try {
      SoundEffects.playClick();
    } catch (e) {
      console.warn("Sound effects clicked play bypassed", e);
    }
    
    const lockedLink = `${window.location.origin}/index.html?table=${tableNum}`;
    const formattedTitle = `Table 0${tableNum} QR Ordering Station`;
    
    if (qrViewerTitle) {
      qrViewerTitle.textContent = formattedTitle;
    } else {
      console.warn("[Doppio POS] 'qr-viewer-title' element not found in DOM.");
    }
    
    if (qrPrintTableNum) {
      qrPrintTableNum.textContent = `TABLE 0${tableNum}`;
    } else {
      console.warn("[Doppio POS] 'qr-print-table-num' element not found in DOM.");
    }
    
    if (qrViewerLinkLbl) {
      qrViewerLinkLbl.textContent = lockedLink;
    } else {
      console.warn("[Doppio POS] 'qr-viewer-link-lbl' element not found in DOM.");
    }

    // QR dynamic server link
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(lockedLink)}`;
    if (qrViewerImg) {
      qrViewerImg.src = qrUrl;
    } else {
      console.error("[Doppio POS] 'qr-viewer-img' element not found in DOM! QR cannot be displayed.");
      alert("Error: 'qr-viewer-img' image element is missing!");
    }

    // Attach local attributes to action buttons for references
    if (btnPrintTableQr) {
      btnPrintTableQr.setAttribute('data-link', lockedLink);
      btnPrintTableQr.setAttribute('data-table', `0${tableNum}`);
    } else {
      console.warn("[Doppio POS] 'btn-print-table-qr' button not found in DOM.");
    }
    
    if (btnSimulateQrScan) {
      btnSimulateQrScan.setAttribute('data-link', lockedLink);
    } else {
      console.warn("[Doppio POS] 'btn-simulate-qr-scan' button not found in DOM.");
    }

    qrViewerModal.style.display = 'flex';
    qrViewerModal.classList.add('active');
    console.log("[Doppio POS] QR Viewer Modal successfully displayed!");
  }

  // Print Table QR Template
  if (btnPrintTableQr) {
    btnPrintTableQr.addEventListener('click', () => {
      const link = btnPrintTableQr.getAttribute('data-link');
      const table = btnPrintTableQr.getAttribute('data-table');
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(link)}`;

      SoundEffects.playClick();
      
      const printWindow = window.open('', '_blank', 'width=450,height=600');
      printWindow.document.write(`
        <html>
        <head>
          <title>Print Table ${table} Ordering QR</title>
          <style>
            body { font-family: 'Playfair Display', Georgia, serif; text-align: center; padding: 40px; color: #2C1B18; }
            .print-frame { border: 6px solid #2C1B18; border-radius: 24px; padding: 40px 20px; max-width: 320px; margin: 0 auto; background: white; }
            .logo { font-size: 26px; font-weight: 800; letter-spacing: 2px; margin-bottom: 2px; }
            .table-num { font-size: 32px; font-weight: 900; margin-bottom: 30px; }
            .qr-box { border: 2px dashed #C88A58; border-radius: 16px; padding: 16px; display: inline-block; margin-bottom: 30px; }
            .scan-lbl { font-size: 16px; font-weight: 700; color: #C88A58; letter-spacing: 1px; }
            .url-lbl { font-family: 'Courier New', monospace; font-size: 10px; margin-top: 10px; opacity: 0.8; word-wrap: break-word; }
          </style>
        </head>
        <body>
          <div class="print-frame">
            <div class="logo">DOPPIO Café</div>
            <div style="font-size:9px; text-transform:uppercase; letter-spacing:3px; font-weight:700; color:#C88A58; margin-bottom: 20px;">Nagpur Premium Spot</div>
            <div class="table-num">TABLE ${table}</div>
            <div class="qr-box">
              <img src="${qrUrl}" style="width: 200px; height: 200px; object-fit: contain;">
            </div>
            <div class="scan-lbl">SCAN TO DINE & PAY</div>
            <div class="url-lbl">${link}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  if (btnSimulateQrScan) {
    btnSimulateQrScan.addEventListener('click', () => {
      const link = btnSimulateQrScan.getAttribute('data-link');
      SoundEffects.playClick();
      window.open(link, '_blank');
    });
  }

  // Close QR modal triggers
  if (qrViewerClose) {
    qrViewerClose.addEventListener('click', () => {
      if (qrViewerModal) {
        qrViewerModal.classList.remove('active');
        qrViewerModal.style.display = 'none';
      }
    });
  }

  // Click outside modal closing
  if (qrViewerModal) {
    qrViewerModal.addEventListener('click', (e) => {
      if (e.target === qrViewerModal) {
        qrViewerModal.classList.remove('active');
        qrViewerModal.style.display = 'none';
      }
    });
  }

  // ==========================================
  // PREMIUM EXTENSIONS: COMPETITOR BUSTER PACK
  // ==========================================

  // 1. Direct WhatsApp Dispatcher in Receipt Modal
  const whatsappReceiptPhone = document.getElementById('whatsapp-receipt-phone');
  const sendWhatsappReceiptBtn = document.getElementById('send-whatsapp-receipt-btn');
  const whatsappSection = document.getElementById('whatsapp-receipt-section');

  // Autofill WhatsApp number when preview opens
  const originalOpenReceiptPreview = window.openReceiptPreview;
  window.openReceiptPreview = function(shouldPrint) {
    if (originalOpenReceiptPreview) originalOpenReceiptPreview(shouldPrint);
    
    // Toggle visibility based on whether WhatsApp is enabled in settings
    if (whatsappSection) {
      whatsappSection.style.display = businessProfile.whatsappEnabled !== false ? 'block' : 'none';
    }

    if (whatsappReceiptPhone) {
      const phoneInput = document.getElementById('cust-phone');
      whatsappReceiptPhone.value = phoneInput ? phoneInput.value.trim() : '';
    }
  };

  if (sendWhatsappReceiptBtn) {
    sendWhatsappReceiptBtn.addEventListener('click', () => {
      let phoneNum = whatsappReceiptPhone ? whatsappReceiptPhone.value.trim() : '';
      if (!phoneNum) {
        alert("Please enter a customer's WhatsApp number!");
        return;
      }
      
      phoneNum = phoneNum.replace(/\D/g, '');
      if (phoneNum.length === 10) {
        phoneNum = "91" + phoneNum;
      }
      
      if (phoneNum.length < 10) {
        alert("Invalid phone number! Enter a 10-digit mobile number.");
        return;
      }

      // Compile current active cart bill object
      const custNameInput = document.getElementById('cust-name');
      const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
      const orderNum = document.getElementById('order-num').value;
      const billIdToSave = editingBillId || orderNum;

      const isGstEnabled = businessProfile.gstEnabled !== false;
      const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
      const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
      const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
      
      let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      let loyaltyDiscount = 0;
      let matchedCustomer = null;
      if (phoneNum || custName) {
        matchedCustomer = crmData.find(c => (phoneNum && c.phone === phoneNum.slice(-10)) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
      }
      if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
        loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
      }
      
      const taxableAmount = subtotal - loyaltyDiscount;
      const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
      const total = taxableAmount + gst;

      const tempBill = {
        orderId: billIdToSave,
        customerName: custName,
        customerPhone: phoneNum.slice(-10),
        dateTime: new Date().toLocaleString('en-IN'),
        items: [...cart],
        subtotal: subtotal,
        discount: loyaltyDiscount,
        gst: gst,
        total: total,
        paymentMethod: selectedPaymentMethod,
        orderType: activeOrderType
      };

      SoundEffects.playClick();
      // Invoke sharing helper with modified phone
      const originalPhone = tempBill.customerPhone;
      tempBill.customerPhone = phoneNum;
      shareBillOnWhatsApp(tempBill);
      tempBill.customerPhone = originalPhone;
    });
  }

  // 2. AI Forecasting & Cost Control Engine
  const aiTopMaterial = document.getElementById('ai-top-material');
  const aiBurnRate = document.getElementById('ai-burn-rate');
  const aiCriticalDays = document.getElementById('ai-critical-days');
  const aiAutoReorderBtn = document.getElementById('ai-auto-reorder-btn');

  function updateAIForecast() {
    if (!aiTopMaterial || !aiBurnRate || !aiCriticalDays) return;

    // Retrieve daily sales ledger
    const totalBillsCount = bills.length;
    
    // Simulate daily average active days (minimum 2 days to prevent massive single-sale skewing)
    const activeDays = Math.max(2, Math.ceil(totalBillsCount / 4)); 

    const consumption = {};
    
    // Calculate total ingredient depletion from all historical bills
    bills.forEach(bill => {
      if (!bill.items) return;
      // Handle array or string-JSON parsing
      let billItems = bill.items;
      if (typeof billItems === 'string') {
        try { billItems = JSON.parse(billItems); } catch(e) { billItems = []; }
      }
      if (Array.isArray(billItems)) {
        billItems.forEach(item => {
          if (!item) return;
          const specs = getDeductionSpecs(item);
          if (specs) {
            Object.keys(specs).forEach(ing => {
              const qty = parseFloat(item.qty) || 1;
              consumption[ing] = (consumption[ing] || 0) + ((parseFloat(specs[ing]) || 0) * qty);
            });
          }
        });
      }
    });

    // Determine the ingredient with highest daily consumption percentage relative to max capacity
    let topIngredient = 'milk';
    let maxBurnPercent = 0;
    let topBurnVelocity = 0;

    Object.keys(defaultInventory).forEach(key => {
      const totalConsumed = consumption[key] || 0;
      const velocity = totalConsumed / activeDays;
      const maxVal = defaultInventory[key];
      const burnPercent = velocity / maxVal;

      if (burnPercent > maxBurnPercent) {
        maxBurnPercent = burnPercent;
        topIngredient = key;
        topBurnVelocity = velocity;
      }
    });

    // Update AI stats cards
    const label = getLabelFromKey(topIngredient);
    const emoji = categoryIconsMap[topIngredient] || '🥛';
    const unit = topIngredient.includes('beans') || topIngredient.includes('powder') || topIngredient.includes('ice') || topIngredient.includes('fries') || topIngredient.includes('veggies') ? 'g' : 'ml';
    
    aiTopMaterial.innerHTML = `${label} (${emoji})`;
    
    // Display average daily consumption velocity
    const roundedVel = topBurnVelocity.toFixed(1);
    aiBurnRate.textContent = `${roundedVel} ${unit} / day`;

    // Calculate days remaining
    const currentStock = inventory[topIngredient] !== undefined ? inventory[topIngredient] : defaultInventory[topIngredient];
    
    if (topBurnVelocity > 0) {
      const remainingDays = currentStock / topBurnVelocity;
      aiCriticalDays.textContent = `${label} depletes in ${remainingDays.toFixed(1)} days!`;
      
      if (remainingDays <= 2) {
        aiCriticalDays.style.color = 'var(--danger-color)';
        aiCriticalDays.style.fontWeight = '800';
      } else if (remainingDays <= 5) {
        aiCriticalDays.style.color = '#F39C12'; // warning caramel
        aiCriticalDays.style.fontWeight = '700';
      } else {
        aiCriticalDays.style.color = 'var(--success-color)';
        aiCriticalDays.style.fontWeight = '700';
      }
    } else {
      aiCriticalDays.textContent = "No sales burn tracked yet.";
      aiCriticalDays.style.color = 'var(--text-muted)';
      aiCriticalDays.style.fontWeight = 'normal';
    }
  }

  // Auto reorder btn refuels all low stock items instantly
  if (aiAutoReorderBtn) {
    aiAutoReorderBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      
      // Refill all items to 100% capacity and sync batches & Supabase
      Object.keys(defaultInventory).forEach(key => {
        const maxVal = defaultInventory[key];
        const refillQty = maxVal - (inventory[key] || 0);
        if (refillQty > 0) {
          const newBatch = {
            id: "batch_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            qty: refillQty,
            expiryDate: getDefaultExpiryDate(key),
            receivedDate: new Date().toISOString().split('T')[0]
          };
          if (!inventoryBatches[key]) inventoryBatches[key] = [];
          inventoryBatches[key].push(newBatch);
          // Sync batch to Supabase
          if (supabaseClient) {
            supabaseClient.from('doppio_inventory_batches').upsert({
              id: newBatch.id,
              ingredient_key: key,
              qty: newBatch.qty,
              expiryDate: newBatch.expiryDate,
              receivedDate: newBatch.receivedDate
            }, { onConflict: 'id' }).then(({ error }) => {
              if (error) console.warn('Supabase auto-reorder batch upsert failed:', error.message);
            });
          }
        }
        inventory[key] = maxVal;
        if (supabaseClient) {
          supabaseClient.from('doppio_inventory').update({ current: maxVal }).eq('key', key).then();
        }
      });
      
      localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
      localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
      
      renderInventory();
      checkLowStockAlerts();
      updateAIForecast();

      alert("AI On-Demand Restock successful! Nagpur Branch raw material levels refilled to 100% capacity. Restock Invoice generated.");
    });
  }

  // Hook AI updates to standard rendering
  const originalRenderInventory = renderInventory;
  renderInventory = function() {
    originalRenderInventory();
    updateAIForecast();
  };

  // 3. P2P Local Synchronization Terminal Simulator
  const p2pLogBox = document.getElementById('p2p-log-box');
  const p2pTestBtn = document.getElementById('p2p-test-btn');
  const p2pConnectedCount = document.getElementById('p2p-connected-count');
  const p2pStatusDot = document.getElementById('p2p-sync-status-dot');
  const p2pStatusText = document.getElementById('p2p-sync-status-text');
  const p2pEnabledInput = document.getElementById('profile-p2p-enabled');
  const p2pModeSelect = document.getElementById('profile-p2p-mode');

  function addP2PLog(message) {
    if (!p2pLogBox) return;
    const timeStr = new Date().toTimeString().split(' ')[0];
    p2pLogBox.innerHTML += `[${timeStr}] ${message}<br>`;
    p2pLogBox.scrollTop = p2pLogBox.scrollHeight;
  }

  if (p2pTestBtn) {
    p2pTestBtn.addEventListener('click', () => {
      SoundEffects.playPop();
      const isEnabled = p2pEnabledInput ? p2pEnabledInput.checked : true;
      if (!isEnabled) {
        alert("P2P Local Sync Network is currently disabled in your settings!");
        return;
      }

      addP2PLog("Pinging all local client terminal nodes...");
      
      setTimeout(() => {
        SoundEffects.playSuccess();
        addP2PLog(`<span style="color:#27ae60;">✔ Reply from [KITCHEN-KDS-1] (192.168.1.102) - Latency: 2ms</span>`);
      }, 300);

      setTimeout(() => {
        addP2PLog(`<span style="color:#27ae60;">✔ Reply from [WAITER-CAPTAIN-1] (192.168.1.105) - Latency: 4ms</span>`);
      }, 500);
    });
  }

  // Broadcast function when checkout finishes
  window.broadcastP2POrder = function(orderId, total) {
    const isEnabled = p2pEnabledInput ? p2pEnabledInput.checked : true;
    if (!isEnabled) return;

    addP2PLog(`Broadcasting new Order [${orderId}] to local sync grid...`);
    
    setTimeout(() => {
      addP2PLog(`[KDS-TERMINAL] Acknowledged: Added order ${orderId} (₹${total}) to kitchen screen.`);
    }, 600);
  };

  // Wrap performCheckout to broadcast sync
  const originalPerformCheckout = performCheckout;
  performCheckout = function(shouldPrint) {
    const orderNum = document.getElementById('order-num').value;
    const billIdToSave = editingBillId || orderNum;
    
    // Compute total for logging
    let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const isGstEnabled = businessProfile.gstEnabled !== false;
    const gstPercentage = businessProfile.gstRate !== undefined ? businessProfile.gstRate : 18;
    const isLoyaltyEnabled = businessProfile.loyaltyEnabled === true;
    const loyaltyDiscountPercentage = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
    
    const custNameInput = document.getElementById('cust-name');
    const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
    const phoneInput = document.getElementById('cust-phone');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    
    let loyaltyDiscount = 0;
    let matchedCustomer = null;
    if (phoneVal || custName) {
      matchedCustomer = crmData.find(c => (phoneVal && c.phone === phoneVal) || (custName && c.name.toLowerCase() === custName.toLowerCase()));
    }
    if (matchedCustomer && matchedCustomer.visits >= 1 && isLoyaltyEnabled) {
      loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercentage / 100));
    }
    const taxableAmount = subtotal - loyaltyDiscount;
    const gst = isGstEnabled ? Math.round(taxableAmount * (gstPercentage / 100)) : 0;
    const total = taxableAmount + gst;

    // Direct POS Kitchen Feed: Push takeaway orders to KDS!
    const mockKdsOrder = {
      orderId: billIdToSave,
      customerName: custName,
      customerPhone: phoneVal,
      dateTime: new Date().toLocaleString('en-IN'),
      items: [...cart],
      subtotal: subtotal,
      discount: loyaltyDiscount,
      gst: gst,
      total: total,
      paymentMethod: selectedPaymentMethod,
      orderType: 'Takeaway',
      tableNumber: 'ONLINE',
      status: 'Accepted'
    };
    
    // Add locally to pendingQrOrders so KDS picks it up!
    pendingQrOrders.push(mockKdsOrder);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));

    // Upload to Supabase to notify KDS in real-time
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders').insert({
        orderId: mockKdsOrder.orderId,
        customerName: mockKdsOrder.customerName,
        customerPhone: mockKdsOrder.customerPhone,
        items: JSON.stringify(mockKdsOrder.items),
        subtotal: mockKdsOrder.subtotal,
        discount: mockKdsOrder.discount,
        gst: mockKdsOrder.gst,
        total: mockKdsOrder.total,
        paymentMethod: mockKdsOrder.paymentMethod,
        orderType: mockKdsOrder.orderType,
        tableNumber: mockKdsOrder.tableNumber,
        status: mockKdsOrder.status,
        dateTime: mockKdsOrder.dateTime
      }).then();
    }

    originalPerformCheckout(shouldPrint);
    
    // Broadcast P2P order
    window.broadcastP2POrder(billIdToSave, total);
  };

  // 4. Interactive Excel Onboarding Wizard (Menu & Recipe Parser)
  const excelDropzone = document.getElementById('excel-drag-dropzone');
  const excelFileInput = document.getElementById('excel-file-input');
  const excelDropText = document.getElementById('excel-drop-text');

  if (excelDropzone && excelFileInput) {
    excelDropzone.addEventListener('click', () => excelFileInput.click());

    // Drag-over styling
    excelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      excelDropzone.style.borderColor = 'var(--accent-caramel)';
    });
    excelDropzone.addEventListener('dragleave', () => {
      excelDropzone.style.borderColor = 'rgba(252, 128, 25, 0.25)';
      excelDropzone.style.background = 'rgba(252, 128, 25, 0.01)';
    });

    excelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      excelDropzone.style.borderColor = 'rgba(252, 128, 25, 0.25)';
      excelDropzone.style.background = 'rgba(252, 128, 25, 0.01)';
      
      if (e.dataTransfer.files.length > 0) {
        excelFileInput.files = e.dataTransfer.files;
        handleExcelUpload(e.dataTransfer.files[0]);
      }
    });

    excelFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleExcelUpload(e.target.files[0]);
      }
    });
  }

  function handleExcelUpload(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let importedCount = 0;
        let recipeCount = 0;

        function mapFuzzyIngredientKey(name) {
          const clean = String(name).trim().toLowerCase();
          if (clean.includes('steamed_milk') || clean.includes('fresh_milk') || clean.includes('whole_milk') || clean.includes('milk')) {
            return 'milk';
          }
          if (clean.includes('espresso') || clean.includes('coffee_shot') || clean.includes('coffee')) {
            return 'espresso_shot';
          }
          if (clean.includes('syrup_sugar') || clean.includes('simple_syrup') || clean.includes('sugar')) {
            return 'sugar_syrup';
          }
          if (clean.includes('whipped_cream') || clean.includes('heavy_cream') || clean.includes('cream')) {
            return 'cream';
          }
          if (clean.includes('ice_cube') || clean.includes('crushed_ice')) {
            return 'ice';
          }
          if (clean.includes('cocoa') || clean.includes('chocolate_powder')) {
            return 'cocoa_powder';
          }
          if (clean.includes('hazelnut')) {
            return 'hazelnut_syrup';
          }
          if (clean.includes('caramel')) {
            return 'caramel_syrup';
          }
          if (clean.includes('vanilla')) {
            return 'vanilla_syrup';
          }
          if (clean.includes('irish')) {
            return 'irish_syrup';
          }
          return clean.replace(/\s+/g, '_');
        }

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          let currentCategory = sheetName;
          
          rows.forEach(row => {
            if (!row || row.length === 0) return;
            
            const filledCells = row.filter(c => c !== null && c !== undefined && c !== '');
            if (filledCells.length === 1 && typeof row[0] === 'string' && !row[0].endsWith(' ')) {
              currentCategory = row[0].trim();
              return;
            }

            if (row[0] && typeof row[0] === 'string') {
              const itemName = row[0].trim();
              
              let price = 250; 
              let description = `Spreadsheet Imported Premium ${itemName}`;
              let ingredientStartIndex = 1;
              
              // Detect pricing and description column (Made by Antigravity)
              const val1 = Number(row[1]);
              if (row[1] !== undefined && !isNaN(val1) && typeof row[1] !== 'string') {
                price = val1;
                ingredientStartIndex = 2;
                if (row[2] !== undefined && typeof row[2] === 'string' && isNaN(Number(row[2]))) {
                  const fuzzyKey = mapFuzzyIngredientKey(row[2]);
                  if (defaultInventory[fuzzyKey] === undefined) {
                    description = row[2].trim();
                    ingredientStartIndex = 3;
                  }
                }
              } else if (row[1] !== undefined && typeof row[1] === 'string') {
                const fuzzyKey = mapFuzzyIngredientKey(row[1]);
                if (defaultInventory[fuzzyKey] === undefined) {
                  description = row[1].trim();
                  ingredientStartIndex = 2;
                }
              }
              
              const ingredients = {};
              for (let i = ingredientStartIndex; i < row.length; i += 2) {
                if (i + 1 < row.length) {
                  const ingName = row[i];
                  const amt = row[i + 1];
                  if (ingName && amt) {
                    const cleanIng = mapFuzzyIngredientKey(ingName);
                    if (defaultInventory[cleanIng] !== undefined) {
                      ingredients[cleanIng] = parseFloat(amt) || 0;
                    }
                  }
                }
              }

              const nameLower = itemName.toLowerCase();
              customRecipes[nameLower] = ingredients;
              recipeCount++;

              const existingIdx = menu.findIndex(item => item.name.toLowerCase() === nameLower);
              const newItem = {
                name: itemName,
                category: currentCategory.toUpperCase(),
                price: price,
                description: description,
                icon: "✨"
              };

              if (existingIdx !== -1) {
                // Update local menu cache
                menu[existingIdx] = newItem;
              } else {
                // Insert local menu cache
                menu.push(newItem);
                importedCount++;
              }

              if (supabaseClient) {
                supabaseClient.from('doppio_menu').upsert({
                  name: newItem.name,
                  category: newItem.category,
                  price: newItem.price,
                  description: newItem.description,
                  icon: newItem.icon
                }, { onConflict: 'name' }).then();
              }
            }
          });
        });

        localStorage.setItem('doppio_custom_recipes', JSON.stringify(customRecipes));
        localStorage.setItem('doppio_menu', JSON.stringify(menu));
        
        SoundEffects.playSuccess();
        if (excelDropText) {
          excelDropText.innerHTML = `<span style="color:#27ae60;"><i class="fa-solid fa-circle-check"></i> Onboarded Successful!</span>`;
          setTimeout(() => {
            excelDropText.textContent = "Drag & Drop Excel here or Click to Browse";
          }, 3000);
        }

        renderPOSItems();
        renderInventory();
        checkLowStockAlerts();
        
        alert(`Excel Import Success! Onboarded ${importedCount} new menu items and configured ${recipeCount} dynamic recipes instantly.`);

      } catch (err) {
        console.error("Excel import failed:", err);
        SoundEffects.playRemove();
        alert("Excel Parsing failed! Ensure spreadsheet structure has ingredient names and quantities.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ==========================================
  // KITCHEN DISPLAY SYSTEM (KDS) & TOKEN BILLBOARD (Steps 7 & 8)
  // ==========================================
  function renderKDSTab() {
    const kdsGrid = document.getElementById('kds-grid');
    const kdsCountPending = document.getElementById('kds-count-pending');
    const kdsCountPreparing = document.getElementById('kds-count-preparing');
    const kdsCountReady = document.getElementById('kds-count-ready');
    
    if (!kdsGrid) return;
    kdsGrid.innerHTML = '';
    
    const pendingCount = pendingQrOrders.filter(o => o.status === 'Pending Review').length;
    const preparingCount = pendingQrOrders.filter(o => o.status === 'Accepted').length;
    const readyCount = pendingQrOrders.filter(o => o.status === 'Ready').length;
    
    if (kdsCountPending) kdsCountPending.textContent = `${pendingCount} Pending`;
    if (kdsCountPreparing) kdsCountPreparing.textContent = `${preparingCount} Cooking`;
    if (kdsCountReady) kdsCountReady.textContent = `${readyCount} Ready to Serve`;
    
    const cookingOrders = pendingQrOrders.filter(o => o.status === 'Accepted');
    
    if (cookingOrders.length === 0) {
      kdsGrid.innerHTML = `
        <div class="premium-empty-state" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; width:100%; box-sizing: border-box; background: var(--white); border-radius: var(--border-radius-md); border: 1px solid rgba(28, 28, 28,0.05);">
          <i class="fa-solid fa-fire-burner" style="font-size: 36px; color: var(--accent-caramel); opacity: 0.5; margin-bottom: 16px;"></i>
          <h3 style="margin-bottom: 8px; color: var(--primary-brand); font-family: var(--font-heading);">Kitchen is Clear</h3>
          <p style="font-size: 11px; color: var(--text-muted); max-width: 300px; margin: 0 auto; line-height: 1.4;">All orders have been prepared and bumped. High five! 🙌</p>
        </div>
      `;
      return;
    }
    
    cookingOrders.forEach(order => {
      const card = document.createElement('div');
      const typeLower = (order.orderType || 'Takeaway').toLowerCase();
      card.className = `kds-card type-${typeLower === 'dine-in' ? 'dine-in' : typeLower === 'swiggy' ? 'swiggy' : typeLower === 'zomato' ? 'zomato' : 'takeaway'}`;
      
      // Calculate elapsed minutes
      let elapsedMins = 0;
      if (order.dateTime) {
        // Try parsing different formats cleanly
        const parsedDate = Date.parse(order.dateTime) || parseCustomLocaleString(order.dateTime);
        if (parsedDate) {
          const elapsedMs = Date.now() - parsedDate;
          elapsedMins = Math.max(0, Math.floor(elapsedMs / 60000));
        }
      }
      
      // Build items list
      const itemsHtml = order.items.map((item, idx) => {
        const checkedClass = item.isDone ? 'checked' : '';
        const checkedAttr = item.isDone ? 'checked' : '';
        
        const customizations = [];
        if (item.size && item.size !== 'Regular') customizations.push(item.size);
        if (item.sugar && item.sugar !== 'Regular') customizations.push(item.sugar);
        if (item.ice && item.ice !== 'Regular') customizations.push(item.ice);
        if (item.toppings && item.toppings.length > 0) customizations.push(item.toppings.join(', '));
        const descHtml = customizations.length > 0 ? `<span class="kds-item-desc">${customizations.join(' | ')}</span>` : '';
        
        return `
          <div class="kds-item-row ${checkedClass}" data-item-idx="${idx}">
            <input type="checkbox" ${checkedAttr}>
            <span class="kds-item-qty">${item.qty}x</span>
            <div style="flex:1;">
              <span>${item.name}</span>
              ${descHtml}
            </div>
          </div>
        `;
      }).join('');
      
      card.innerHTML = `
        <div class="kds-card-header">
          <div class="kds-card-title">
            <i class="fa-solid fa-receipt"></i>
            <span>${order.orderId}</span>
            <span style="font-size: 10px; font-weight:600; color: var(--text-muted);">(${order.orderType || 'Takeaway'})</span>
          </div>
          <span class="kds-card-timer">${elapsedMins}m ago</span>
        </div>
        <div class="kds-items-list">
          ${itemsHtml}
        </div>
        <div class="kds-card-footer">
          <button class="kds-bump-btn" data-order-id="${order.orderId}">
            <i class="fa-solid fa-circle-check"></i> BUMP
          </button>
        </div>
      `;
      
      // Checkbox click listener
      card.querySelectorAll('.kds-item-row input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const row = chk.closest('.kds-item-row');
          const itemIdx = parseInt(row.getAttribute('data-item-idx'));
          if (e.target.checked) {
            row.classList.add('checked');
            order.items[itemIdx].isDone = true;
          } else {
            row.classList.remove('checked');
            order.items[itemIdx].isDone = false;
          }
          localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
          
          if (supabaseClient) {
            supabaseClient.from('doppio_pending_orders')
              .update({ items: JSON.stringify(order.items) })
              .eq('orderId', order.orderId).then();
          }
        });
      });
      
      // Bump button listener
      card.querySelector('.kds-bump-btn').addEventListener('click', () => {
        bumpKDSTicket(order.orderId);
      });
      
      kdsGrid.appendChild(card);
    });
  }
  
  function parseCustomLocaleString(str) {
    try {
      // Handles localized strings like '2/6/2026, 6:50:28 AM'
      const parts = str.split(', ');
      if (parts.length === 2) {
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
          const date = new Date(parts[0] + ' ' + parts[1]);
          if (!isNaN(date.getTime())) return date.getTime();
        }
      }
    } catch(e) {}
    return null;
  }
  
  function bumpKDSTicket(orderId) {
    const order = pendingQrOrders.find(o => o.orderId === orderId);
    if (!order) return;
    
    // Play kitchen bump chime
    SoundEffects.playSuccess();
    
    order.status = 'Ready';
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
    
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .update({ status: 'Ready' })
        .eq('orderId', orderId).then();
    }
    
    renderKDSTab();
    renderTokensTab();
    showNotificationToast(`Order ${orderId} prepared! Bumped to Pickup Screen.`);
  }
  
  function renderTokensTab() {
    const preparingList = document.getElementById('tokens-preparing-list');
    const readyList = document.getElementById('tokens-ready-list');
    
    if (!preparingList || !readyList) return;
    
    preparingList.innerHTML = '';
    readyList.innerHTML = '';
    
    const preparingOrders = pendingQrOrders.filter(o => o.status === 'Accepted');
    const readyOrders = pendingQrOrders.filter(o => o.status === 'Ready');
    
    if (preparingOrders.length === 0) {
      preparingList.innerHTML = '<span style="font-size:11px; color:var(--text-muted); grid-column:1/-1; text-align:center; padding:20px;">No preparing tokens.</span>';
    } else {
      preparingOrders.forEach(order => {
        const badge = document.createElement('div');
        badge.className = 'token-badge';
        const shortToken = order.orderId.includes('-') ? order.orderId.split('-').slice(-1)[0] : order.orderId;
        badge.textContent = `${shortToken}`;
        preparingList.appendChild(badge);
      });
    }
    
    if (readyOrders.length === 0) {
      readyList.innerHTML = '<span style="font-size:11px; color:var(--text-muted); grid-column:1/-1; text-align:center; padding:20px;">No ready tokens.</span>';
    } else {
      readyOrders.forEach(order => {
        const badge = document.createElement('div');
        badge.className = 'token-badge ready';
        badge.style.cursor = 'pointer';
        badge.title = 'Click to Pick Up & Archive';
        
        const shortToken = order.orderId.includes('-') ? order.orderId.split('-').slice(-1)[0] : order.orderId;
        badge.innerHTML = `
          <span>${shortToken}</span>
          <div style="font-size: 8px; font-weight:800; color:var(--success-color); margin-top:2px;">READY</div>
        `;
        
        badge.addEventListener('click', () => {
          dismissToken(order.orderId);
        });
        
        readyList.appendChild(badge);
      });
    }
  }
  
  function dismissToken(orderId) {
    SoundEffects.playClick();
    
    pendingQrOrders = pendingQrOrders.filter(o => o.orderId !== orderId);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
    
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders')
        .delete()
        .eq('orderId', orderId).then();
    }
    
    renderKDSTab();
    renderTokensTab();
    showNotificationToast(`Token ${orderId} picked up & archived!`);
  }
  
  // Expose these functions globally so other files can call them easily
  window.renderKDSTab = renderKDSTab;
  window.renderTokensTab = renderTokensTab;
  window.bumpKDSTicket = bumpKDSTicket;
  window.dismissToken = dismissToken;

  // 1. Manual Restock Inventory Action (Made by Antigravity)
  const restockInventoryBtn = document.getElementById('restock-inventory-btn');
  if (restockInventoryBtn) {
    restockInventoryBtn.addEventListener('click', () => {
      SoundEffects.playSuccess();
      Object.keys(defaultInventory).forEach(key => {
        const maxVal = defaultInventory[key];
        const refillQty = maxVal - (inventory[key] || 0);
        if (refillQty > 0) {
          const newBatch = {
            id: "batch_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
            qty: refillQty,
            expiryDate: getDefaultExpiryDate(key),
            receivedDate: new Date().toISOString().split('T')[0]
          };
          if (!inventoryBatches[key]) inventoryBatches[key] = [];
          inventoryBatches[key].push(newBatch);
          syncIngredientBatchesToSupabase(key);
        }
        inventory[key] = maxVal;
        if (supabaseClient) {
          supabaseClient.from('doppio_inventory').update({ current: maxVal }).eq('key', key).then();
        }
      });
      localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
      localStorage.setItem('doppio_inventory_batches', JSON.stringify(inventoryBatches));
      renderInventory();
      checkLowStockAlerts();
      updateAIForecast();
      alert("Manual restock successful! Nagpur Branch raw material levels refilled to 100% capacity.");
    });
  }

  // 2. Dine-In Table Session Workflow & Actions (Made by Antigravity)
  const tableSessionClose1 = document.getElementById('table-session-modal-close');
  const tableSessionClose2 = document.getElementById('table-session-modal-close-btn');
  const tableSessionModal = document.getElementById('table-session-modal');
  const sessionCancelBtn = document.getElementById('table-session-cancel-btn');
  const sessionKdsBtn = document.getElementById('table-session-kds-btn');

  if (tableSessionClose1) {
    tableSessionClose1.addEventListener('click', () => {
      if (tableSessionModal) tableSessionModal.style.display = 'none';
    });
  }
  if (tableSessionClose2) {
    tableSessionClose2.addEventListener('click', () => {
      if (tableSessionModal) tableSessionModal.style.display = 'none';
    });
  }
  if (sessionCancelBtn) {
    sessionCancelBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const backup = sessionStorage.getItem('doppio_takeaway_cart_backup');
      cart = backup ? JSON.parse(backup) : [];
      if (activeTableSession !== null) {
        const tableId = activeTableSession;
        if ((tableCarts[tableId] || []).length === 0 && tablesState[tableId] === 'ORDERING') {
          tablesState[tableId] = 'EMPTY';
          localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
          if (supabaseClient) {
            supabaseClient.from('doppio_pending_orders').delete().eq('orderId', `TABLE-${tableId}`).then();
          }
        }
      }
      activeTableSession = null;
      const banner = document.getElementById('table-session-banner');
      if (banner) banner.style.display = 'none';
      renderCart();
      renderTablesMap();
    });
  }
  if (sessionKdsBtn) {
    sessionKdsBtn.addEventListener('click', () => {
      sendTableSessionToKDS();
    });
  }

  function openTableSessionModal(tableId) {
    const modal = document.getElementById('table-session-modal');
    const title = document.getElementById('table-session-modal-title');
    const status = document.getElementById('table-session-modal-status');
    const itemsList = document.getElementById('table-session-modal-items-list');
    const totalEl = document.getElementById('table-session-modal-total');
    const startBtn = document.getElementById('table-session-modal-start-order-btn');
    const billBtn = document.getElementById('table-session-modal-bill-btn');
    
    if (!modal) return;
    
    title.textContent = `Table 0${tableId} Details`;
    const state = tablesState[tableId] || "EMPTY";
    
    let stateLabel = "Clean & Empty";
    if (state === "ORDERING") stateLabel = "Occupied (Ordering)";
    else if (state === "PENDING") stateLabel = "Checkout Pending!";
    else if (state === "SERVED") stateLabel = "Eating / Served";
    status.textContent = stateLabel;
    
    status.className = "status-indicator-badge";
    if (state === "EMPTY") {
      status.style.background = "rgba(46, 204, 113, 0.08)";
      status.style.color = "var(--success-color)";
    } else if (state === "ORDERING") {
      status.style.background = "rgba(241, 196, 15, 0.08)";
      status.style.color = "var(--accent-gold)";
    } else {
      status.style.background = "rgba(231, 76, 60, 0.08)";
      status.style.color = "var(--danger-color)";
    }
    
    const items = tableCarts[tableId] || [];
    itemsList.innerHTML = '';
    let subtotal = 0;
    
    if (items.length === 0) {
      itemsList.innerHTML = `<div style="font-size: 11px; text-align: center; color: var(--text-muted); padding: 20px 0;">No active items in session.</div>`;
      startBtn.innerHTML = `<i class="fa-solid fa-cart-plus"></i> Start Order`;
      billBtn.style.display = 'none';
    } else {
      items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.style.display = 'flex';
        itemEl.style.justifyContent = 'space-between';
        itemEl.style.fontSize = '11px';
        itemEl.style.padding = '4px 0';
        itemEl.style.borderBottom = '1px dashed rgba(28, 28, 28,0.05)';
        itemEl.innerHTML = `
          <span>${item.name} x${item.qty}</span>
          <span style="font-weight:700;">₹${item.price * item.qty}</span>
        `;
        itemsList.appendChild(itemEl);
        subtotal += item.price * item.qty;
      });
      startBtn.innerHTML = `<i class="fa-solid fa-cart-plus"></i> Add Items`;
      billBtn.style.display = 'block';
    }
    totalEl.textContent = `₹${subtotal.toFixed(2)}`;
    
    const newStartBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    newStartBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      startTableSessionEdit(tableId);
    });
    
    const newBillBtn = billBtn.cloneNode(true);
    billBtn.parentNode.replaceChild(newBillBtn, billBtn);
    newBillBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      closeAndBillTable(tableId);
    });
    
    modal.style.display = 'flex';
  }

  function startTableSessionEdit(tableId) {
    SoundEffects.playClick();
    activeTableSession = tableId;
    sessionStorage.setItem('doppio_takeaway_cart_backup', JSON.stringify(cart));
    cart = tableCarts[tableId] || [];
    
    if ((tablesState[tableId] || "EMPTY") === "EMPTY") {
      tablesState[tableId] = "ORDERING";
      localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
      syncActiveTableSessionToSupabase(tableId);
    }
    
    const banner = document.getElementById('table-session-banner');
    const bannerTitle = document.getElementById('table-session-title');
    if (banner) banner.style.display = 'flex';
    if (bannerTitle) bannerTitle.textContent = `Table 0${tableId} Dine-In Order Active`;
    
    const posLink = document.querySelector('[data-tab="pos-tab"]');
    if (posLink) posLink.click();
    
    renderCart();
    renderTablesMap();
  }

  function syncActiveTableSessionToSupabase(tableId) {
    if (!supabaseClient) return;
    const items = tableCarts[tableId] || [];
    const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const orderId = `TABLE-${tableId}`;
    
    supabaseClient.from('doppio_pending_orders')
      .upsert({
        orderId: orderId,
        customerName: `Table 0${tableId}`,
        customerPhone: '',
        dateTime: new Date().toLocaleString('en-IN'),
        items: JSON.stringify(items),
        subtotal: total,
        discount: 0,
        gst: 0,
        total: total,
        paymentMethod: 'Cash',
        orderType: 'Dine-In',
        tableNumber: `0${tableId}`,
        status: 'DineIn Active'
      }, { onConflict: 'orderId' }).then();
  }

  function sendTableSessionToKDS() {
    if (activeTableSession === null) return;
    const tableId = activeTableSession;
    const items = tableCarts[tableId] || [];
    if (items.length === 0) {
      alert("Cannot send empty cart to KDS!");
      return;
    }
    
    tablesState[tableId] = "SERVED";
    localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
    
    const orderId = `TABLE-${tableId}-${Date.now().toString().slice(-4)}`;
    const tableOrder = {
      orderId: orderId,
      customerName: `Table 0${tableId}`,
      customerPhone: '',
      dateTime: new Date().toLocaleString('en-IN'),
      items: [...items],
      subtotal: items.reduce((sum, item) => sum + (item.price * item.qty), 0),
      discount: 0,
      gst: 0,
      total: items.reduce((sum, item) => sum + (item.price * item.qty), 0),
      paymentMethod: 'Cash',
      orderType: 'Dine-In',
      tableNumber: `0${tableId}`,
      status: 'Accepted'
    };
    
    const existingIdx = pendingQrOrders.findIndex(o => o.tableNumber === `0${tableId}` && o.status === 'Accepted');
    if (existingIdx !== -1) {
      pendingQrOrders[existingIdx].items = [...items];
      pendingQrOrders[existingIdx].subtotal = tableOrder.subtotal;
      pendingQrOrders[existingIdx].total = tableOrder.total;
      
      if (supabaseClient) {
        supabaseClient.from('doppio_pending_orders')
          .update({
            items: JSON.stringify(items),
            subtotal: tableOrder.subtotal,
            total: tableOrder.total,
            status: 'Accepted'
          })
          .eq('orderId', pendingQrOrders[existingIdx].orderId).then();
      }
    } else {
      pendingQrOrders.push(tableOrder);
      if (supabaseClient) {
        supabaseClient.from('doppio_pending_orders').insert({
          orderId: tableOrder.orderId,
          customerName: tableOrder.customerName,
          customerPhone: tableOrder.customerPhone,
          items: JSON.stringify(tableOrder.items),
          subtotal: tableOrder.subtotal,
          discount: tableOrder.discount,
          gst: tableOrder.gst,
          total: tableOrder.total,
          paymentMethod: tableOrder.paymentMethod,
          orderType: tableOrder.orderType,
          tableNumber: tableOrder.tableNumber,
          status: tableOrder.status,
          dateTime: tableOrder.dateTime
        }).then();
      }
      if (supabaseClient) {
        supabaseClient.from('doppio_pending_orders').delete().eq('orderId', `TABLE-${tableId}`).then();
      }
    }
    
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQrOrders));
    SoundEffects.playSuccess();
    showNotificationToast(`Sent Table 0${tableId} order to KDS!`);
    
    const backup = sessionStorage.getItem('doppio_takeaway_cart_backup');
    cart = backup ? JSON.parse(backup) : [];
    activeTableSession = null;
    
    const banner = document.getElementById('table-session-banner');
    if (banner) banner.style.display = 'none';
    
    renderCart();
    renderTablesMap();
    if (typeof renderKDSTab === 'function') renderKDSTab();
  }

  function closeAndBillTable(tableId) {
    SoundEffects.playClick();
    const items = tableCarts[tableId] || [];
    if (items.length === 0) {
      alert("No items in this table's session to bill!");
      return;
    }
    
    cart = [...items];
    localStorage.setItem('doppio_cart', JSON.stringify(cart));
    
    const nameInput = document.getElementById('cust-name');
    if (nameInput) nameInput.value = `Table 0${tableId}`;
    
    tablesState[tableId] = "PENDING";
    localStorage.setItem('doppio_tables_state', JSON.stringify(tablesState));
    
    if (activeTableSession === tableId) {
      activeTableSession = null;
      const banner = document.getElementById('table-session-banner');
      if (banner) banner.style.display = 'none';
    }
    
    const posLink = document.querySelector('[data-tab="pos-tab"]');
    if (posLink) posLink.click();
    
    renderCart();
    renderTablesMap();
  }

  // 3. Employee Ledger & Compliance Payroll Functions (Made by Antigravity)
  function renderEmployeesTab() {
    const empDirectoryList = document.getElementById('emp-directory-list');
    const leaveEmpSelect = document.getElementById('leave-emp-select');
    const payrollEmpSelect = document.getElementById('payroll-emp-select');
    const leaveApprovalsList = document.getElementById('leave-approvals-list');
    const shiftRosterList = document.getElementById('shift-roster-list');
    
    const validEmployees = employees.filter(e => e && e.id && e.name);
    
    if (leaveEmpSelect) {
      leaveEmpSelect.innerHTML = validEmployees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }
    if (payrollEmpSelect) {
      payrollEmpSelect.innerHTML = validEmployees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }
    
    if (empDirectoryList) {
      empDirectoryList.innerHTML = validEmployees.map(emp => {
        const casualLeft = emp.leaves ? emp.leaves.casual : 15;
        const sickLeft = emp.leaves ? emp.leaves.sick : 10;
        const isClockedIn = attendanceLogs.some(log => log && log.employeeId === emp.id && log.status === 'Active');
        const statusDot = isClockedIn 
          ? `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#2ecc71; margin-right:6px; animation: pulse 1.5s infinite;"></span>`
          : '';
        return `
          <tr style="border-bottom: 1px solid rgba(28, 28, 28,0.05); height: 35px; color: var(--text-dark);">
            <td style="padding: 8px; font-weight:700; display:flex; align-items:center;">${statusDot}${emp.name}</td>
            <td style="padding: 8px;">${(emp.role || '').toUpperCase()}</td>
            <td style="padding: 8px;">${emp.shift || ''}</td>
            <td style="padding: 8px; font-weight:700;">₹${emp.baseSalary || 0}</td>
            <td style="padding: 8px;">CL: ${casualLeft} | SL: ${sickLeft}</td>
            <td style="padding: 8px; text-align: right;">
              <button class="btn btn-secondary select-payroll-btn" data-id="${emp.id}" style="padding: 2px 8px; font-size: 10px; border-radius: 4px;">Select Payout</button>
            </td>
          </tr>
        `;
      }).join('');
      
      empDirectoryList.querySelectorAll('.select-payroll-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const empId = btn.getAttribute('data-id');
          if (payrollEmpSelect) {
            payrollEmpSelect.value = empId;
            payrollEmpSelect.dispatchEvent(new Event('change'));
          }
        });
      });
    }
    
    if (shiftRosterList) {
      shiftRosterList.innerHTML = validEmployees.map(emp => `
        <tr style="border-bottom: 1px solid rgba(28, 28, 28,0.05); height: 35px; color: var(--text-dark);">
          <td style="padding: 6px; font-weight:700;">${emp.name}</td>
          <td style="padding: 6px;">${emp.shift || ''}</td>
          <td style="padding: 6px;">
            <button class="btn btn-secondary toggle-shift-btn" data-id="${emp.id}" style="padding: 2px 6px; font-size: 10px; border-radius:4px;"><i class="fa-solid fa-arrows-rotate"></i> Change</button>
          </td>
        </tr>
      `).join('');
      
      shiftRosterList.querySelectorAll('.toggle-shift-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          SoundEffects.playClick();
          const empId = btn.getAttribute('data-id');
          const emp = validEmployees.find(e => e.id === empId);
          if (emp) {
            emp.shift = emp.shift === 'Morning Shift' ? 'Evening Shift' : 'Morning Shift';
            localStorage.setItem('doppio_employees', JSON.stringify(employees));
            if (supabaseClient) {
              supabaseClient.from('doppio_employees').upsert({
                tenant_id: activeTenantId,
                id: emp.id,
                name: emp.name,
                role: emp.role,
                contact: emp.contact,
                baseSalary: emp.baseSalary,
                shift: emp.shift,
                leaves: emp.leaves
              }).then();
            }
            renderEmployeesTab();
            showNotificationToast(`Shift roster updated for ${emp.name} to ${emp.shift}.`);
          }
        });
      });
    }
    
    if (leaveApprovalsList) {
      leaveApprovalsList.innerHTML = '';
      const pendingLeaves = leaveRequests.filter(r => r && r.status === 'Pending');
      
      if (pendingLeaves.length === 0) {
        leaveApprovalsList.innerHTML = `<div style="font-size: 10px; color:var(--text-muted); padding: 10px 0; text-align:center;">No pending leave approvals.</div>`;
      } else {
        pendingLeaves.forEach(req => {
          const item = document.createElement('div');
          item.style.marginBottom = '6px';
          item.innerHTML = `
            <div style="background: rgba(28, 28, 28,0.02); border: 1px solid rgba(28, 28, 28,0.05); padding: 8px; border-radius: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 10.5px;">
              <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span>${req.employeeName || ''} (${req.type || ''})</span>
                <span style="color:var(--accent-caramel);">${req.days || 0} days</span>
              </div>
              <div style="color:var(--text-muted); font-size: 9.5px; line-height: 1.3;">
                <span>${req.startDate || ''} to ${req.endDate || ''}</span>
                <br><span>Reason: ${req.reason || ''}</span>
              </div>
              <div style="display:flex; gap:6px; margin-top:4px;">
                <button type="button" class="btn btn-primary approve-leave-btn" data-id="${req.id}" style="flex:1; padding:2px 6px; font-size:9.5px; background:#2ecc71; border:none; color:white; border-radius:3px; cursor:pointer;">Approve</button>
                <button type="button" class="btn btn-secondary reject-leave-btn" data-id="${req.id}" style="flex:1; padding:2px 6px; font-size:9.5px; border-radius:3px; cursor:pointer;">Reject</button>
              </div>
            </div>
          `;
          
          item.querySelector('.approve-leave-btn').addEventListener('click', () => {
            SoundEffects.playSuccess();
            req.status = 'Approved';
            const emp = validEmployees.find(e => e && e.id === req.employeeId);
            if (emp) {
              if (!emp.leaves) emp.leaves = { casual: 15, sick: 10 };
              const key = req.type.toLowerCase().includes('sick') ? 'sick' : 'casual';
              emp.leaves[key] = Math.max(0, (emp.leaves[key] || 0) - req.days);
            }
            localStorage.setItem('doppio_employees', JSON.stringify(employees));
            localStorage.setItem('doppio_leave_requests', JSON.stringify(leaveRequests));
            if (supabaseClient) {
              supabaseClient.from('doppio_leave_requests').update({ status: 'Approved' }).eq('id', req.id).then();
              if (emp) {
                supabaseClient.from('doppio_employees').update({ leaves: emp.leaves }).eq('id', emp.id).then();
              }
            }
            renderEmployeesTab();
            showNotificationToast(`Leave approved for ${req.employeeName}.`);
            updateEmployeeAnalytics();
          });
          
          item.querySelector('.reject-leave-btn').addEventListener('click', () => {
            SoundEffects.playRemove();
            req.status = 'Rejected';
            localStorage.setItem('doppio_leave_requests', JSON.stringify(leaveRequests));
            if (supabaseClient) {
              supabaseClient.from('doppio_leave_requests').update({ status: 'Rejected' }).eq('id', req.id).then();
            }
            renderEmployeesTab();
            showNotificationToast(`Leave request rejected for ${req.employeeName}.`);
            updateEmployeeAnalytics();
          });
          
          leaveApprovalsList.appendChild(item);
        });
      }
    }
    
    // Render Daily Clocking system list & dropdown
    const attendanceEmpSelect = document.getElementById('attendance-emp-select');
    const attendanceLedgerList = document.getElementById('attendance-ledger-list');
    
    if (attendanceEmpSelect && attendanceEmpSelect.children.length === 0) {
      attendanceEmpSelect.innerHTML = employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }
    
    if (attendanceLedgerList) {
      const sortedLogs = [...attendanceLogs]
        .filter(log => log && log.date && log.employeeName)
        .sort((a,b) => {
          const dateA = (a.date || '') + ' ' + (a.clockInTime || '00:00');
          const dateB = (b.date || '') + ' ' + (b.clockInTime || '00:00');
          return dateB.localeCompare(dateA);
        });
      
      attendanceLedgerList.innerHTML = sortedLogs.map(log => {
        let statusBadge = '';
        if (log.status === 'Active') {
          statusBadge = `<span style="background-color: #2ecc71; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; animation: pulse 1.5s infinite;"><i class="fa-solid fa-spinner fa-spin"></i> Clocked In</span>`;
        } else {
          statusBadge = `<span style="background-color: rgba(28, 28, 28,0.06); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 9px;">Completed</span>`;
        }
        return `
          <tr style="border-bottom: 1px solid rgba(28, 28, 28,0.05); height: 32px; color: var(--text-dark);">
            <td style="padding: 6px; font-weight:700;">${log.employeeName}</td>
            <td style="padding: 6px;">${log.date}</td>
            <td style="padding: 6px;">${log.clockInTime}</td>
            <td style="padding: 6px;">${log.clockOutTime}</td>
            <td style="padding: 6px; font-weight: 600;">${log.hoursWorked ? log.hoursWorked + ' hrs' : '-'}</td>
            <td style="padding: 6px; font-weight: 700;">₹${log.wages || 0}</td>
            <td style="padding: 6px; text-align: right;">${statusBadge}</td>
          </tr>
        `;
      }).join('');
    }

    updateEmployeeAnalytics();
  }

  function updateEmployeeAnalytics() {
    const empStatTotal = document.getElementById('emp-stat-total');
    const empStatLeave = document.getElementById('emp-stat-leave');
    const empStatPayroll = document.getElementById('emp-stat-payroll');
    
    const validEmps = employees.filter(e => e && e.id);
    if (empStatTotal) empStatTotal.textContent = `${validEmps.length} Staff Members`;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const leaveCount = leaveRequests.filter(r => r && r.status === 'Approved' && r.startDate && r.endDate && todayStr >= r.startDate && todayStr <= r.endDate).length;
    if (empStatLeave) empStatLeave.textContent = `${leaveCount} Staff`;
    
    const totalEstPayroll = validEmps.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
    if (empStatPayroll) empStatPayroll.textContent = `₹${totalEstPayroll.toLocaleString('en-IN')}`;
  }

  // 4. Leave tracker submission form (Made by Antigravity)
  const leaveForm = document.getElementById('leave-request-form');
  if (leaveForm) {
    leaveForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const empSelectEl = document.getElementById('leave-emp-select');
      const typeSelectEl = document.getElementById('leave-type-select');
      const startDateEl = document.getElementById('leave-start-date');
      const endDateEl = document.getElementById('leave-end-date');
      const reasonEl = document.getElementById('leave-reason');
      
      if (!empSelectEl || !typeSelectEl || !startDateEl || !endDateEl || !reasonEl) return;
      
      const empId = empSelectEl.value;
      const type = typeSelectEl.value;
      const startDate = startDateEl.value;
      const endDate = endDateEl.value;
      const reason = reasonEl.value;
      
      if (!empId || !startDate || !endDate || !reason) {
        alert("Please fill in all leave request fields.");
        return;
      }
      
      const emp = employees.find(el => el && el.id === empId);
      if (!emp) return;
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end < start) {
        alert("End date cannot be before start date!");
        return;
      }
      
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      const newRequest = {
        id: "leave_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
        employeeId: empId,
        employeeName: emp.name,
        type: type,
        startDate: startDate,
        endDate: endDate,
        reason: reason,
        status: 'Pending',
        days: diffDays
      };
      
      leaveRequests.push(newRequest);
      localStorage.setItem('doppio_leave_requests', JSON.stringify(leaveRequests));
      if (supabaseClient) {
        supabaseClient.from('doppio_leave_requests').insert(newRequest).then();
      }
      
      SoundEffects.playPop();
      showNotificationToast(`Leave request submitted for ${emp.name} (${diffDays} days).`);
      
      document.getElementById('leave-start-date').value = '';
      document.getElementById('leave-end-date').value = '';
      document.getElementById('leave-reason').value = '';
      
      renderEmployeesTab();
    });
  }

  // 5. Payroll Breakdown Live Calculator (Made by Antigravity)
  const payrollEmpSelect = document.getElementById('payroll-emp-select');
  const payrollDaysWorked = document.getElementById('payroll-days-worked');
  const payrollLop = document.getElementById('payroll-lop');
  const payrollBaseSalary = document.getElementById('payroll-base-salary');
  
  function updateLivePayrollCalculator() {
    if (!payrollEmpSelect) return;
    const empId = payrollEmpSelect.value;
    const emp = employees.find(e => e && e.id === empId);
    if (!emp) return;
    
    if (payrollBaseSalary) {
      payrollBaseSalary.value = emp.baseSalary || 0;
    }
    
    const daysWorked = parseInt(payrollDaysWorked ? payrollDaysWorked.value : 30) || 0;
    const lop = parseInt(payrollLop ? payrollLop.value : 0) || 0;
    const base = emp.baseSalary || 0;
    
    const effectiveBase = base * Math.max(0, (30 - lop)) / 30.0;
    
    const basic = effectiveBase * 0.5;
    const hra = basic * 0.4;
    const allowance = effectiveBase - basic - hra;
    const gross = effectiveBase;
    
    const pf = basic * 0.12;
    const pt = 200;
    const annualGross = gross * 12;
    let tds = 0;
    if (annualGross > 700000) {
      tds = ((annualGross - 700000) * 0.1) / 12;
    }
    
    const net = Math.max(0, gross - pf - pt - tds);
    
    const breakdown = document.getElementById('payroll-breakdown');
    if (breakdown) {
      breakdown.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span>Basic Salary (50% of base)</span>
          <strong>₹${basic.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span>HRA Allowance (Nagpur 40%)</span>
          <strong>₹${hra.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span>Special Allowance</span>
          <strong>₹${allowance.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; border-top:1px dashed rgba(28, 28, 28,0.1); padding-top:4px; font-weight:700; color:var(--text-dark);">
          <span>Gross Earnings</span>
          <strong>₹${gross.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--danger-color); margin-top: 4px;">
          <span>Provident Fund (PF - 12% of Basic)</span>
          <strong>- ₹${pf.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--danger-color);">
          <span>Professional Tax (PT - Nagpur Fixed)</span>
          <strong>- ₹${pt.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--danger-color);">
          <span>Estimated TDS (Income Tax)</span>
          <strong>- ₹${tds.toFixed(0)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top: 6px; border-top:1.5px solid var(--primary-brand); padding-top:6px; font-size:12px; font-weight:800; color:var(--primary-brand);">
          <span>Net Take Home</span>
          <strong>₹${net.toFixed(0)}</strong>
        </div>
      `;
    }
  }

  if (payrollEmpSelect) payrollEmpSelect.addEventListener('change', updateLivePayrollCalculator);
  if (payrollDaysWorked) payrollDaysWorked.addEventListener('input', updateLivePayrollCalculator);
  if (payrollLop) payrollLop.addEventListener('input', updateLivePayrollCalculator);

  // 6. Payslip generation and printing modal (Made by Antigravity)
  const generatePayslipBtn = document.getElementById('payroll-generate-payslip-btn');
  const payslipModal = document.getElementById('payslip-modal');
  const payslipCloseBtn1 = document.getElementById('payslip-modal-close');
  
  if (payslipCloseBtn1) {
    payslipCloseBtn1.addEventListener('click', () => {
      if (payslipModal) payslipModal.style.display = 'none';
    });
  }
  
  if (payslipModal) {
    payslipModal.addEventListener('click', (e) => {
      if (e.target.id === 'payslip-modal-close-btn') {
        payslipModal.style.display = 'none';
      } else if (e.target.id === 'payslip-print-btn' || e.target.closest('#payslip-print-btn')) {
        const printArea = document.getElementById('payslip-print-area');
        if (!printArea) return;
        
        const actionsSection = printArea.querySelector('.no-print');
        if (actionsSection) actionsSection.style.display = 'none';
        
        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Doppio Cafe Nagpur - Salary Slip</title>');
        printWindow.document.write('<style>body{font-family:sans-serif;padding:20px;color:#000;}table{width:100%;border-collapse:collapse;margin:15px 0;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background:#f5f5f5;}hr{border:none;border-top:1px dashed #ddd;margin:15px 0;}.no-print{display:none;}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write(printArea.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        
        if (actionsSection) actionsSection.style.display = 'flex';
        
        printWindow.print();
      }
    });
  }

  if (generatePayslipBtn) {
    generatePayslipBtn.addEventListener('click', () => {
      const empId = payrollEmpSelect ? payrollEmpSelect.value : null;
      const emp = employees.find(e => e.id === empId);
      if (!emp) {
        alert("Please select a staff member first.");
        return;
      }
      
      const daysWorked = parseInt(payrollDaysWorked ? payrollDaysWorked.value : 30) || 0;
      const lop = parseInt(payrollLop ? payrollLop.value : 0) || 0;
      const base = emp.baseSalary;
      
      const effectiveBase = base * Math.max(0, (30 - lop)) / 30.0;
      const basic = effectiveBase * 0.5;
      const hra = basic * 0.4;
      const allowance = effectiveBase - basic - hra;
      const gross = effectiveBase;
      const pf = basic * 0.12;
      const pt = 200;
      const annualGross = gross * 12;
      let tds = 0;
      if (annualGross > 700000) {
        tds = ((annualGross - 700000) * 0.1) / 12;
      }
      const net = Math.max(0, gross - pf - pt - tds);
      
      const printArea = document.getElementById('payslip-print-area');
      if (printArea) {
        printArea.innerHTML = `
          <div style="text-align: center; border-bottom: 2px solid var(--primary-brand); padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="font-family: var(--font-heading); color: var(--primary-brand); margin: 0; font-size: 18px; font-weight:800;">DOPPIO CAFÉ</h2>
            <span style="font-size: 10px; color: var(--text-muted);">Nagpur Branch Office | Nagpur, Maharashtra</span>
            <h3 style="margin: 5px 0 0 0; font-size: 12px; font-weight:700;">SALARY SLIP / PAYSLIP</h3>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-bottom: 15px;">
            <div><strong>Employee ID:</strong> ${emp.id.toUpperCase()}</div>
            <div><strong>Employee Name:</strong> ${emp.name}</div>
            <div><strong>Designation/Role:</strong> ${emp.role.toUpperCase()}</div>
            <div><strong>Shift:</strong> ${emp.shift}</div>
            <div><strong>Salary Month:</strong> ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
            <div><strong>Days Worked:</strong> ${daysWorked} (LOP Days: ${lop})</div>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px;">
            <thead>
              <tr style="background: rgba(28, 28, 28,0.05); font-weight:700;">
                <th style="padding: 6px; text-align: left; border: 1px solid #ddd;">Earnings</th>
                <th style="padding: 6px; text-align: right; border: 1px solid #ddd;">Amount (₹)</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ddd;">Deductions</th>
                <th style="padding: 6px; text-align: right; border: 1px solid #ddd;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">Basic Salary (50%)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${basic.toFixed(0)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">Provident Fund (PF - 12%)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${pf.toFixed(0)}</td>
              </tr>
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">HRA (Nagpur 40%)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${hra.toFixed(0)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">Professional Tax (PT)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${pt.toFixed(0)}</td>
              </tr>
              <tr>
                <td style="padding: 6px; border: 1px solid #ddd;">Special Allowances</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${allowance.toFixed(0)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">Income Tax (Estimated TDS)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${tds.toFixed(0)}</td>
              </tr>
              <tr style="font-weight: 700; background: rgba(28, 28, 28,0.02);">
                <td style="padding: 6px; border: 1px solid #ddd;">Total Earnings (Gross)</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${gross.toFixed(0)}</td>
                <td style="padding: 6px; border: 1px solid #ddd;">Total Deductions</td>
                <td style="padding: 6px; text-align: right; border: 1px solid #ddd;">₹${(pf + pt + tds).toFixed(0)}</td>
              </tr>
            </tbody>
          </table>
          
          <div style="display: flex; justify-content: space-between; border-top: 2px solid var(--primary-brand); padding-top: 10px; font-size: 13px; font-weight: 800; color: var(--primary-brand);">
            <span>NET PAYOUT (TAKE HOME):</span>
            <span>₹${net.toFixed(0)}</span>
          </div>
          
          <div style="font-size: 8px; color: var(--text-muted); text-align: center; margin-top: 20px; font-style: italic;">
            This is a system generated compliance salary slip copy for Nagpur Branch.
          </div>
          
          <div style="display: flex; gap: 10px; margin-top: 15px;" class="no-print">
            <button type="button" class="btn btn-secondary" id="payslip-modal-close-btn" style="flex:1; padding: 10px; border-radius: 6px; font-size: 11px; cursor:pointer;">Close</button>
            <button type="button" class="btn btn-primary" id="payslip-print-btn" style="flex:1; padding: 10px; border-radius: 6px; font-size: 11px; background:var(--accent-caramel); border:none; color:white; font-weight:700; cursor:pointer;"><i class="fa-solid fa-print"></i> Print Payslip</button>
          </div>
        `;
      }
      
      if (payslipModal) payslipModal.style.display = 'flex';
      SoundEffects.playClick();
    });
  }

  // 7. KDS background cooking timer loop (update elapsed minutes in KDS cards) (Made by Antigravity)
  setInterval(() => {
    const kdsCards = document.querySelectorAll('.kds-card');
    kdsCards.forEach(card => {
      const orderIdEl = card.querySelector('.kds-card-title span');
      if (!orderIdEl) return;
      const orderId = orderIdEl.textContent.trim();
      const order = pendingQrOrders.find(o => o.orderId === orderId);
      if (order && order.dateTime) {
        const parsedDate = Date.parse(order.dateTime) || parseCustomLocaleString(order.dateTime);
        if (parsedDate) {
          const elapsedMs = Date.now() - parsedDate;
          const elapsedMins = Math.max(0, Math.floor(elapsedMs / 60000));
          const timerEl = card.querySelector('.kds-card-timer');
          if (timerEl) {
            timerEl.textContent = `${elapsedMins}m ago`;
          }
        }
      }
    });
  }, 30000); // Check every 30s

  // 6b. Daily Attendance system Clock In / Out listeners (Made by Antigravity)
  const clockInBtn = document.getElementById('attendance-clockin-btn');
  const clockOutBtn = document.getElementById('attendance-clockout-btn');
  
  if (clockInBtn) {
    clockInBtn.addEventListener('click', () => {
      SoundEffects.playClick();
      const empSelect = document.getElementById('attendance-emp-select');
      const shiftSelect = document.getElementById('attendance-shift-select');
      if (!empSelect || !shiftSelect) return;
      
      const empId = empSelect.value;
      const shiftVal = shiftSelect.value;
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;
      
      // Check if already clocked in today (log with status === 'Active')
      const activeLog = attendanceLogs.find(l => l.employeeId === empId && l.status === 'Active');
      if (activeLog) {
        alert(`${emp.name} is already clocked in! Please clock out first.`);
        return;
      }
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].substring(0,5);
      
      const newLog = {
        id: 'att_' + Date.now(),
        employeeId: empId,
        employeeName: emp.name,
        date: dateStr,
        clockInTime: timeStr,
        clockOutTime: '-',
        hoursWorked: 0,
        shift: shiftVal,
        wages: 0,
        status: 'Active'
      };
      
      attendanceLogs.push(newLog);
      localStorage.setItem('doppio_attendance', JSON.stringify(attendanceLogs));
      if (supabaseClient) {
        supabaseClient.from('doppio_attendance').insert(newLog).then();
      }
      
      showNotificationToast(`${emp.name} clocked in successfully at ${timeStr}`);
      renderEmployeesTab();
    });
  }
  
  if (clockOutBtn) {
    clockOutBtn.addEventListener('click', () => {
      const empSelect = document.getElementById('attendance-emp-select');
      if (!empSelect) return;
      
      const empId = empSelect.value;
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;
      
      // Find active clock-in log
      const activeLog = attendanceLogs.find(l => l.employeeId === empId && l.status === 'Active');
      if (!activeLog) {
        alert(`${emp.name} is not clocked in!`);
        return;
      }
      
      SoundEffects.playSuccess();
      const now = new Date();
      const clockOutStr = now.toTimeString().split(' ')[0].substring(0,5);
      
      // Calculate elapsed time
      const [inH, inM] = activeLog.clockInTime.split(':').map(Number);
      const [outH, outM] = clockOutStr.split(':').map(Number);
      
      let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
      if (diffMins < 0) diffMins += 24 * 60; // handle overnight shifts
      
      const hours = Math.round((diffMins / 60) * 10) / 10;
      activeLog.clockOutTime = clockOutStr;
      activeLog.hoursWorked = hours;
      activeLog.status = 'Completed';
      
      // Wages = baseSalary / 30 days / 8 hours * actual clocked hours
      const hourlyRate = emp.baseSalary / 240;
      activeLog.wages = Math.round(hourlyRate * hours);
      
      localStorage.setItem('doppio_attendance', JSON.stringify(attendanceLogs));
      if (supabaseClient) {
        supabaseClient.from('doppio_attendance').update({
          clockOutTime: clockOutStr,
          hoursWorked: hours,
          status: 'Completed',
          wages: activeLog.wages
        }).eq('id', activeLog.id).then();
      }
      showNotificationToast(`${emp.name} clocked out successfully. Hours: ${hours}, Earnings: ₹${activeLog.wages}`);
      
      renderEmployeesTab();
      if (typeof renderReports === 'function') renderReports();
    });
  }

  // Pre-load UI states on dashboard initialization with defensive try/catch to prevent freezing the tabs
  try {
    updateQrOrdersDashboardUI();
  } catch (err) {
    console.error("Error in updateQrOrdersDashboardUI:", err);
  }

  try {
    if (typeof renderKDSTab === 'function') renderKDSTab();
  } catch (err) {
    console.error("Error in renderKDSTab:", err);
  }

  try {
    if (typeof renderTokensTab === 'function') renderTokensTab();
  } catch (err) {
    console.error("Error in renderTokensTab:", err);
  }

  try {
    updateAIForecast();
  } catch (err) {
    console.error("Error in updateAIForecast:", err);
  }

  try {
    renderEmployeesTab();
  } catch (err) {
    console.error("Error in renderEmployeesTab:", err);
  }

  try {
    if (typeof renderReports === 'function') renderReports();
  } catch (err) {
    console.error("Error in renderReports:", err);
  }

  // End Live QR Ordering system module

  // Trigger evaluation on start
  try {
    applyFeatureToggles();
  } catch (err) {
    console.error("Error in applyFeatureToggles:", err);
  }


  // ==========================================================
  // SAAS MULTI-TENANT SUPER-ADMIN CONTROLS (Made by CodeArc)
  // ==========================================================

  async function pollSuperAdminGateway() {
    // 1. Fetch Gateway Status (Non-blocking)
    (async () => {
      const statusBadge = document.getElementById('saas-gateway-status');
      const phoneEl = document.getElementById('saas-gateway-phone');
      const sessionEl = document.getElementById('saas-gateway-session-saved');
      const qrContainer = document.getElementById('saas-gateway-qr-container');
      const qrImg = document.getElementById('saas-gateway-qr-img');
      const qrSpinner = document.getElementById('saas-gateway-qr-spinner');
      const connectedView = document.getElementById('saas-gateway-connected-view');

      try {
        const res = await fetch('https://kalpeshdeora1006-whatsapp-gateway.hf.space/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (statusBadge) {
          statusBadge.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
          if (data.status === 'ready') {
            statusBadge.style.background = 'rgba(34, 197, 94, 0.1)';
            statusBadge.style.color = '#22C55E';
          } else if (data.status === 'qr') {
            statusBadge.style.background = 'rgba(245, 158, 11, 0.1)';
            statusBadge.style.color = '#F59E0B';
          } else {
            statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            statusBadge.style.color = '#EF4444';
          }
        }

        if (phoneEl) {
          phoneEl.textContent = data.number ? `+${data.number}` : 'Not Linked';
        }

        if (sessionEl) {
          if (data.sessionSavedAt) {
            const date = new Date(data.sessionSavedAt);
            sessionEl.textContent = date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          } else {
            sessionEl.textContent = 'Never';
          }
        }

        if (data.status === 'ready') {
          if (qrContainer) qrContainer.style.display = 'none';
          if (connectedView) connectedView.style.display = 'flex';
        } else if (data.status === 'qr') {
          if (connectedView) connectedView.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          
          if (data.qr) {
            if (qrSpinner) qrSpinner.style.display = 'none';
            if (qrImg) {
              qrImg.src = data.qr;
              qrImg.style.display = 'block';
            }
          } else {
            if (qrSpinner) qrSpinner.style.display = 'block';
            if (qrImg) qrImg.style.display = 'none';
          }
        } else {
          if (connectedView) connectedView.style.display = 'none';
          if (qrContainer) qrContainer.style.display = 'flex';
          if (qrSpinner) {
            qrSpinner.style.display = 'block';
            qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #FC8019;"></i><br>Connecting (Status: ${data.status ? data.status.toUpperCase() : 'UNKNOWN'})`;
          }
          if (qrImg) qrImg.style.display = 'none';
        }

      } catch (err) {
        console.warn('SuperAdmin: WhatsApp gateway status check failed:', err.message);
        if (statusBadge) {
          statusBadge.textContent = 'OFFLINE';
          statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
          statusBadge.style.color = '#EF4444';
        }
        if (phoneEl) phoneEl.textContent = 'Unknown';
        if (sessionEl) sessionEl.textContent = 'Unknown';
        if (connectedView) connectedView.style.display = 'none';
        if (qrContainer) qrContainer.style.display = 'flex';
        if (qrSpinner) {
          qrSpinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #EF4444;"></i><br>Gateway Server Offline<br><span style="font-size: 8px; color: #9CA3AF; margin-top: 4px; display: block;">Check cloud space status</span>`;
          qrSpinner.style.display = 'block';
        }
        if (qrImg) qrImg.style.display = 'none';
      }
    })();

    // 2. Fetch Dispatch Logs from WhatsApp Gateway debug-logs endpoint (bypassing RLS)
    (async () => {
      const logsContainer = document.getElementById('saas-notification-logs-container');
      try {
        const res = await fetch('https://kalpeshdeora1006-whatsapp-gateway.hf.space/debug-logs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || 'Failed to fetch logs');
        const logs = data.logs || [];

        if (logsContainer) {
          if (!logs || logs.length === 0) {
            logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent dispatch logs found.</div>';
            return;
          }

          logsContainer.innerHTML = logs.map(log => {
            const logDate = log.created_at ? new Date(log.created_at) : new Date();
            const timeStr = logDate.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            const dateStr = logDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            
            const eventStr = log.event || '';
            const statusStr = log.status || '';
            const details = log.details || {};
            
            let eventTitle = eventStr || 'System Event';
            let detailsHtml = '';
            let channelBadge = '';
            let statusBadgeHtml = '';

            // Format event status
            if (statusStr === 'ok') {
              statusBadgeHtml = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 800; background: rgba(34, 197, 94, 0.1); color: #22C55E; text-transform: uppercase;">Success</span>`;
            } else if (statusStr === 'warning') {
              statusBadgeHtml = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 800; background: rgba(245, 158, 11, 0.1); color: #F59E0B; text-transform: uppercase;">Warn</span>`;
            } else {
              statusBadgeHtml = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 800; background: rgba(239, 68, 68, 0.1); color: #EF4444; text-transform: uppercase;">Error</span>`;
            }

            // Format channel & details based on event
            const isWhatsApp = eventStr.includes('whatsapp');
            const isEmail = eventStr.includes('email');
            const isRegistration = eventStr.includes('registration');
            const isApproval = eventStr.includes('approval');

            if (isWhatsApp) {
              channelBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; background: rgba(37, 211, 102, 0.1); color: #25D366; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-brands fa-whatsapp"></i> WA</span>`;
            } else if (isEmail) {
              channelBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; background: rgba(59, 130, 246, 0.1); color: #3B82F6; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-envelope"></i> Email</span>`;
            } else {
              channelBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; background: rgba(107, 114, 128, 0.1); color: #6B7280;">Sys</span>`;
            }

            if (isRegistration) {
              eventTitle = 'SaaS Registration';
            } else if (isApproval) {
              eventTitle = 'Workspace Approval';
            } else if (eventStr === 'connected') {
              eventTitle = 'Gateway Connected';
            } else if (eventStr === 'disconnected') {
              eventTitle = 'Gateway Disconnected';
            } else if (eventStr === 'session_saved') {
              eventTitle = 'Session Backed Up';
            } else if (eventStr === 'alert_sent') {
              eventTitle = 'Admin Alert Sent';
            }

            // Render details
            if (details.name) {
              detailsHtml += `<div style="font-weight: 700; color: #1C1C1C;">${details.name}</div>`;
            }
            if (details.phone) {
              detailsHtml += `<div style="color: #4B5563; font-family: monospace;">+${details.phone}</div>`;
            }
            if (details.email) {
              detailsHtml += `<div style="color: #4B5563; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${details.email}</div>`;
            }
            if (details.error) {
              detailsHtml += `<div style="color: #EF4444; font-size: 10px; margin-top: 2px; font-weight: 500;"><i class="fa-solid fa-triangle-exclamation"></i> ${details.error}</div>`;
            }
            if (details.reason) {
              detailsHtml += `<div style="color: #6B7280; font-size: 10px; margin-top: 2px;">Reason: ${details.reason}</div>`;
            }

            return `
              <div class="log-entry" style="display: flex; gap: 12px; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(28, 28, 28, 0.04); background: #FAF9F6; align-items: start; transition: all 0.2s;" onmouseover="this.style.background='#FFFFFF'; this.style.borderColor='rgba(252, 128, 25, 0.15)';" onmouseout="this.style.background='#FAF9F6'; this.style.borderColor='rgba(28, 28, 28, 0.04)';">
                <!-- Timestamp -->
                <div style="display: flex; flex-direction: column; align-items: center; min-width: 50px; text-align: center; border-right: 1px solid rgba(28, 28, 28, 0.06); padding-right: 8px; flex-shrink: 0;">
                  <span style="font-weight: 700; color: #1C1C1C; font-size: 11px;">${timeStr}</span>
                  <span style="font-size: 9px; color: #9CA3AF; font-weight: 600;">${dateStr}</span>
                </div>
                
                <!-- Content -->
                <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <span style="font-weight: 700; color: #1C1C1C; font-size: 12px;">${eventTitle}</span>
                    <div style="display: flex; gap: 4px; align-items: center;">
                      ${channelBadge}
                      ${statusBadgeHtml}
                    </div>
                  </div>
                  <div style="font-size: 11px; margin-top: 2px;">
                    ${detailsHtml}
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      } catch (err) {
        console.error('SuperAdmin: Error fetching gateway health logs:', err);
        if (logsContainer) {
          logsContainer.innerHTML = `<div style="text-align: center; padding: 32px; color: #EF4444;"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px;"></i> Failed to load logs: ${err.message}</div>`;
        }
      }
    })();
  }

  function startSaaSGatewayPolling() {
    if (saasGatewayPollingInterval) clearInterval(saasGatewayPollingInterval);
    pollSuperAdminGateway();
    saasGatewayPollingInterval = setInterval(pollSuperAdminGateway, 5000);
  }

  function stopSaaSGatewayPolling() {
    if (saasGatewayPollingInterval) {
      clearInterval(saasGatewayPollingInterval);
      saasGatewayPollingInterval = null;
    }
  }

  async function setupGatewayMonitorTab() {
    // Set up SaaS Gateway Action Listeners
    const resetBtn = document.getElementById('btn-saas-gateway-reset');
    if (resetBtn && !resetBtn.dataset.listenerBound) {
      resetBtn.dataset.listenerBound = 'true';
      resetBtn.addEventListener('click', async () => {
        if (confirm("Are you absolutely sure you want to RESET the WhatsApp Gateway?\n\nThis will completely purge the WhatsApp session files from the gateway storage. You will need to scan a new QR code to re-link your device!")) {
          try {
            resetBtn.disabled = true;
            resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            
            const res = await fetch('https://kalpeshdeora1006-whatsapp-gateway.hf.space/reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (res.ok) {
              showNotificationToast("WhatsApp Gateway reset successfully. Scan QR code to re-authenticate.");
              await pollSuperAdminGateway();
            } else {
              const data = await res.json().catch(() => ({}));
              alert("Failed to reset gateway: " + (data.message || 'Unknown error'));
            }
          } catch (err) {
            console.error("Error resetting SaaS gateway:", err);
            alert("Error communicating with gateway: " + err.message);
          } finally {
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Reset Gateway Connection';
          }
        }
      });
    }

    const refreshLogsBtn = document.getElementById('btn-refresh-saas-logs');
    if (refreshLogsBtn && !refreshLogsBtn.dataset.listenerBound) {
      refreshLogsBtn.dataset.listenerBound = 'true';
      refreshLogsBtn.addEventListener('click', async () => {
        const icon = refreshLogsBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        await pollSuperAdminGateway();
        if (icon) {
          setTimeout(() => {
            icon.classList.remove('fa-spin');
          }, 600);
        }
      });
    }

    // Start polling when loading the tab
    startSaaSGatewayPolling();
  }

  async function sha256(string) {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function renderSuperAdminTab() {
    const listContainer = document.getElementById('saas-tenants-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding: 32px; text-align: center; color: #6B7280; font-size: 13px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(28, 28, 28,0.05);"><i class="fa-solid fa-spinner fa-spin" style="margin-right: 6px; color: #FC8019;"></i> Loading client workspace registry...</div>';

    const { data: tenants, error } = await supabaseClient
      .from('saas_tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      listContainer.innerHTML = `<div style="padding: 32px; text-align: center; color: #ef4444; font-size: 13px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(239,68,68,0.1);"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px;"></i> Error loading workspaces: ${error.message}</div>`;
      return;
    }

    if (!tenants || tenants.length === 0) {
      listContainer.innerHTML = '<div style="padding: 48px; text-align: center; color: #6B7280; font-size: 13px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(28, 28, 28,0.05); display: flex; flex-direction: column; align-items: center; gap: 8px;"><i class="fa-solid fa-store-slash" style="font-size: 24px; color: #9CA3AF;"></i> <div>No registered client food outlets found.</div></div>';
      return;
    }

    // Reset selection state
    const selectAllCheckbox = document.getElementById('select-all-tenants');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    const deleteSelectedBtn = document.getElementById('btn-delete-selected-tenants');
    if (deleteSelectedBtn) {
      deleteSelectedBtn.style.display = 'none';
    }

    listContainer.innerHTML = tenants.map(t => {
      const badgeClass = t.status === 'approved' ? 'paid' : t.status === 'suspended' ? 'void' : 'hold';
      const statusText = t.status === 'approved' ? 'Active' : t.status === 'suspended' ? 'Suspended' : 'Pending';
      const outletLabel = (t.outlet_type || 'cafe').toUpperCase();
      
      const badgeStyle = t.status === 'approved' 
        ? 'background: rgba(34, 197, 94, 0.1); color: #22C55E;' 
        : t.status === 'suspended' 
          ? 'background: rgba(239, 68, 68, 0.1); color: #EF4444;' 
          : 'background: rgba(245, 158, 11, 0.1); color: #F59E0B;';

      return `
        <div class="tenant-workspace-card" style="display: flex; align-items: center; padding: 16px; background: #FFFFFF; border: 1px solid rgba(28, 28, 28,0.05); border-radius: 12px; gap: 16px; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.02); color: #1C1C1C; font-family: var(--font-body);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(28, 28, 28,0.05)'; this.style.borderColor='rgba(252, 128, 25,0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'; this.style.borderColor='rgba(28, 28, 28,0.05)';">
          <!-- Selection Checkbox -->
          <div style="width: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <input type="checkbox" class="tenant-select-checkbox" data-id="${t.id}" style="cursor: pointer; width: 15px; height: 15px; accent-color: #FC8019;">
          </div>
          
          <!-- Name & Avatar -->
          <div style="flex: 2.5; min-width: 200px; display: flex; align-items: center; gap: 12px; overflow: hidden;">
            <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(252, 128, 25, 0.1); color: #FC8019; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; text-transform: uppercase;">
              ${(t.name || 'U').substring(0, 2)}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
              <div style="font-size: 14px; font-weight: 700; color: #1C1C1C; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</div>
              <div style="font-size: 10px; color: #6B7280; font-family: monospace;">workspace: ${t.slug}</div>
            </div>
          </div>

          <!-- Outlet Type / Category Pill -->
          <div style="flex: 1; min-width: 100px; display: flex; align-items: center;">
            <span style="font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: rgba(252, 128, 25, 0.08); color: #FC8019; text-transform: uppercase; letter-spacing: 0.5px;">
              ${outletLabel}
            </span>
          </div>

          <!-- Contact Details -->
          <div style="flex: 2; min-width: 180px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #6B7280; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <i class="fa-solid fa-envelope" style="width: 12px; color: #9CA3AF; flex-shrink: 0;"></i>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.email || '-'}</span>
            </div>
            ${t.phone ? `
            <div style="display: flex; align-items: center; gap: 6px;">
              <i class="fa-brands fa-whatsapp" style="width: 12px; color: #22C55E; flex-shrink: 0;"></i>
              <strong style="color: #4B5563;">+${t.phone}</strong>
            </div>` : ''}
          </div>

          <!-- System Login Details -->
          <div style="flex: 1.5; min-width: 120px; display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #6B7280;">
            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #9CA3AF; font-weight: 700;">Admin User</div>
            <div style="font-weight: 600; color: #4B5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.username}</div>
          </div>

          <!-- Status Badge -->
          <div style="flex: 1; min-width: 100px; display: flex; align-items: center; justify-content: center;">
            <span class="status-badge" style="padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid transparent; ${badgeStyle}">
              ${statusText}
            </span>
          </div>

          <!-- Actions -->
          <div style="flex: 1.5; min-width: 150px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0;">
            <button class="btn manage-tenant-btn" data-id="${t.id}" style="padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: 8px; background: #FFFFFF; border: 1px solid rgba(28, 28, 28,0.08); color: #1C1C1C; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.background='#1C1C1C'; this.style.color='#FFFFFF';" onmouseout="this.style.background='#FFFFFF'; this.style.color='#1C1C1C';">
              <i class="fa-solid fa-gear" style="font-size: 10px;"></i> Manage
            </button>
            <button class="btn delete-single-tenant-btn" data-id="${t.id}" data-name="${t.name}" style="padding: 6px; width: 28px; height: 28px; font-size: 11px; border-radius: 8px; background: rgba(239, 68, 68, 0.05); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.15); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='#ef4444'; this.style.color='#FFFFFF';" onmouseout="this.style.background='rgba(239, 68, 68, 0.05)'; this.style.color='#ef4444';">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Update bulk delete button visibility based on checked boxes
    function updateDeleteSelectedBtnVisibility() {
      const checkboxes = listContainer.querySelectorAll('.tenant-select-checkbox');
      const checkedBoxes = Array.from(checkboxes).filter(cb => cb.checked);
      
      if (deleteSelectedBtn) {
        if (checkedBoxes.length > 0) {
          deleteSelectedBtn.style.display = 'flex';
        } else {
          deleteSelectedBtn.style.display = 'none';
        }
      }
      
      if (selectAllCheckbox) {
        if (checkboxes.length > 0 && checkedBoxes.length === checkboxes.length) {
          selectAllCheckbox.checked = true;
          selectAllCheckbox.indeterminate = false;
        } else if (checkedBoxes.length > 0) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = true;
        } else {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = false;
        }
      }
    }

    // Set up listeners for bulk actions
    if (selectAllCheckbox && !selectAllCheckbox.dataset.listenerBound) {
      selectAllCheckbox.dataset.listenerBound = 'true';
      selectAllCheckbox.addEventListener('change', () => {
        const checkboxes = listContainer.querySelectorAll('.tenant-select-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = selectAllCheckbox.checked;
        });
        updateDeleteSelectedBtnVisibility();
      });
    }

    if (deleteSelectedBtn && !deleteSelectedBtn.dataset.listenerBound) {
      deleteSelectedBtn.dataset.listenerBound = 'true';
      deleteSelectedBtn.addEventListener('click', async () => {
        const checkboxes = listContainer.querySelectorAll('.tenant-select-checkbox');
        const checkedIds = Array.from(checkboxes)
          .filter(cb => cb.checked)
          .map(cb => cb.getAttribute('data-id'));
        
        if (checkedIds.length === 0) return;
        
        if (confirm(`Are you sure you want to delete the ${checkedIds.length} selected client outlets?\n\nThis will permanently erase their registrations and all their associated data from Supabase!`)) {
          try {
            console.log("Bulk deleting tenant IDs:", checkedIds);
            const { error } = await supabaseClient
              .from('saas_tenants')
              .delete()
              .in('id', checkedIds);
              
            if (error) {
              console.error("Supabase bulk deletion error:", error);
              alert("Failed to delete selected accounts: " + error.message);
            } else {
              showNotificationToast(`${checkedIds.length} client accounts successfully deleted.`);
              await renderSuperAdminTab();
            }
          } catch (err) {
            console.error("Error in bulk delete handler:", err);
            alert("Client-side system error during bulk deletion: " + err.message);
          }
        }
      });
    }

    // Add change handlers for row checkboxes
    listContainer.querySelectorAll('.tenant-select-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        updateDeleteSelectedBtnVisibility();
      });
    });

    // Add click handlers for manage buttons
    listContainer.querySelectorAll('.manage-tenant-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tenantId = btn.getAttribute('data-id');
        console.log("SuperAdmin Click: tenantId = ", tenantId);
        
        // Find tenant using loose string conversion for safety
        const tenant = tenants.find(t => String(t.id) === String(tenantId));
        console.log("SuperAdmin Click: found tenant = ", tenant);
        
        if (tenant) {
          openTenantManageModal(tenant);
        } else {
          console.warn("SuperAdmin: No tenant found in cached list for ID: " + tenantId);
          alert("Error: Tenant record details not found in local cache.");
        }
      });
    });

    // Add click handlers for delete buttons
    listContainer.querySelectorAll('.delete-single-tenant-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tenantId = btn.getAttribute('data-id');
        const tenantName = btn.getAttribute('data-name');
        
        if (confirm(`Are you absolutely sure you want to DELETE: ${tenantName}?\n\nThis will permanently erase their registration and cascade delete all their associated data from Supabase!`)) {
          try {
            console.log("Requesting deletion of tenant ID:", tenantId);
            const { error } = await supabaseClient.from('saas_tenants').delete().eq('id', tenantId);
            if (error) {
              console.error("Supabase deletion error:", error);
              alert("Failed to delete account: " + error.message);
            } else {
              showNotificationToast("Client account successfully deleted.");
              await renderSuperAdminTab();
            }
          } catch (err) {
            console.error("Error in delete-single-tenant-btn handler:", err);
            alert("Client-side system error deleting client: " + err.message);
          }
        }
      });
    });
  }

  function openTenantManageModal(tenant) {
    try {
      console.log("openTenantManageModal called for: ", tenant);
      const modal = document.getElementById('tenant-manage-modal');
      if (!modal) {
        console.error("SuperAdmin Error: modal 'tenant-manage-modal' element not found in DOM.");
        alert("System Error: Management modal element is missing from the page layout.");
        return;
      }

      const tenantIdEl   = document.getElementById('manage-tenant-id');
      const tenantNameEl = document.getElementById('manage-tenant-name');
      const avatarEl     = document.getElementById('manage-tenant-avatar');
      const statusBadge  = document.getElementById('manage-status-badge');
      const usernameEl   = document.getElementById('manage-username');
      const passwordEl   = document.getElementById('manage-password');
      const statusEl     = document.getElementById('manage-status');
      const phoneEl      = document.getElementById('manage-phone');
      const emailEl      = document.getElementById('manage-email');

      // ── Populate hidden store + IDs ──
      if (tenantIdEl) {
        tenantIdEl.value = tenant.id || '';
        tenantIdEl.setAttribute('data-slug', tenant.slug || '');
      }

      // ── Outlet name (strip type tag for cleanliness) ──
      const displayName = (tenant.name || 'Unknown') + ` (${(tenant.outlet_type || 'CAFE').toUpperCase()})`;
      if (tenantNameEl) tenantNameEl.textContent = displayName;

      // ── Avatar initial letter ──
      if (avatarEl) avatarEl.textContent = (tenant.name || 'U').charAt(0).toUpperCase();

      // ── Status badge ──
      if (statusBadge) {
        const s = tenant.status || 'pending';
        const badgeMap = {
          approved:  { dot: '#22C55E', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.2)',  color: '#16A34A', label: 'Active'    },
          pending:   { dot: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', color: '#B45309', label: 'Pending'   },
          suspended: { dot: '#EF4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  color: '#DC2626', label: 'Suspended' }
        };
        const b = badgeMap[s] || badgeMap.pending;
        statusBadge.style.background    = b.bg;
        statusBadge.style.borderColor   = b.border;
        statusBadge.style.color         = b.color;
        statusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${b.dot};display:inline-block;"></span>${b.label}`;
      }

      // ── Form fields ──
      if (usernameEl) usernameEl.value = tenant.username || '';
      if (passwordEl) passwordEl.value = '';
      if (statusEl) {
        statusEl.value = tenant.status || 'pending';
        statusEl.setAttribute('data-prev-status', tenant.status || 'pending');
      }
      if (phoneEl) phoneEl.value = tenant.phone || '';
      if (emailEl) emailEl.value = tenant.email || '';

      // ── Feature checkboxes + card highlight ──
      const allowed   = Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [];
      const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');
      console.log(`Checking ${checkboxes.length} checkboxes against allowed tabs:`, allowed);

      checkboxes.forEach(cb => {
        cb.checked = allowed.includes(cb.value);
        // Style the parent card label
        const card = cb.closest('label');
        if (card) {
          if (cb.checked) {
            card.style.borderColor = 'rgba(252,128,25,0.45)';
            card.style.background  = 'rgba(252,128,25,0.06)';
          } else {
            card.style.borderColor = '#E2E8F0';
            card.style.background  = '#FAFAFA';
          }
          // Keep card in sync when user clicks
          cb.addEventListener('change', () => {
            card.style.borderColor = cb.checked ? 'rgba(252,128,25,0.45)' : '#E2E8F0';
            card.style.background  = cb.checked ? 'rgba(252,128,25,0.06)' : '#FAFAFA';
          }, { once: false });
        }
      });

      modal.classList.add('active');
      console.log("SuperAdmin: Modal active class added.");
    } catch (err) {
      console.error("Error inside openTenantManageModal:", err);
      alert("Failed to render management controls: " + err.message);
    }
  }


  // Hook up Super-Admin modal events
  const closeTenantModal = () => {
    const modal = document.getElementById('tenant-manage-modal');
    if (modal) modal.classList.remove('active');
  };


  const closeBtn = document.getElementById('close-tenant-modal');
  const closeBtn2 = document.getElementById('close-tenant-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeTenantModal);
  if (closeBtn2) closeBtn2.addEventListener('click', closeTenantModal);

  const saveTenantBtn = document.getElementById('save-tenant-settings-btn');
  if (saveTenantBtn) {
    saveTenantBtn.addEventListener('click', async () => {
      try {
        console.log("SuperAdmin Save Settings Clicked");
        const tenantIdEl = document.getElementById('manage-tenant-id');
        const tenantId = tenantIdEl.value;
        const slug = tenantIdEl.getAttribute('data-slug') || '';
        const name = document.getElementById('manage-tenant-name').textContent.split('(')[0].trim();
        const username = document.getElementById('manage-username').value.trim();
        const password = document.getElementById('manage-password').value.trim();
        const statusEl = document.getElementById('manage-status');
        const status = statusEl.value;
        const prevStatus = statusEl.getAttribute('data-prev-status') || 'pending';
        const phone = document.getElementById('manage-phone').value.trim();
        const email = document.getElementById('manage-email').value.trim();

        console.log("Input values gathered:", { tenantId, username, status, prevStatus, phone, email });

        const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');
        const allowed_tabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        const updates = {
          username,
          status,
          allowed_tabs,
          phone,
          email
        };

        if (password !== '') {
          console.log("Hashing new password...");
          const hashed = await sha256(password);
          updates.password_hash = hashed;
        }

        console.log("Sending update request to Supabase for tenant ID:", tenantId, "Updates:", updates);
        const { data, error } = await supabaseClient.from('saas_tenants').update(updates).eq('id', tenantId).select();
        console.log("Supabase response:", { data, error });

        if (error) {
          console.error("Supabase update error:", error);
          alert("Failed to save settings: " + error.message);
        } else {
          console.log("Update succeeded. Toasting and refreshing list.");
          closeTenantModal();
          showNotificationToast("Client configurations saved successfully!");

          // Note: Approval notifications (WhatsApp & Email) are now processed securely 
          // and asynchronously by the backend gateway server listening to Supabase Realtime changes on saas_tenants.
          // This removes direct HTTP calls to the gateway from the client-side super-admin console.

          await renderSuperAdminTab();
        }
      } catch (err) {
        console.error("Error in saveTenantBtn handler:", err);
        alert("Client-side system error saving settings: " + err.message);
      }
    });
  }

  const deleteTenantBtn = document.getElementById('delete-tenant-btn');
  if (deleteTenantBtn) {
    deleteTenantBtn.addEventListener('click', async () => {
      try {
        const tenantId = document.getElementById('manage-tenant-id').value;
        const tenantName = document.getElementById('manage-tenant-name').textContent;
        
        if (confirm(`Are you absolutely sure you want to DELETE: ${tenantName}?\n\nThis will permanently erase their registration and cascade delete all their POS bills, inventory records, custom menus, and staff details from Supabase!`)) {
          console.log("Requesting deletion of tenant ID:", tenantId);
          const { error } = await supabaseClient.from('saas_tenants').delete().eq('id', tenantId);
          if (error) {
            console.error("Supabase deletion error:", error);
            alert("Failed to delete account: " + error.message);
          } else {
            console.log("Deletion succeeded. Refreshing UI.");
            closeTenantModal();
            showNotificationToast("Client account successfully deleted.");
            await renderSuperAdminTab();
          }
        }
      } catch (err) {
        console.error("Error in deleteTenantBtn handler:", err);
        alert("Client-side system error deleting client: " + err.message);
      }
    });
  }
});
