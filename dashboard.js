/**
 * Doppio Cafe - Nagpur Premium Cashier Takeaway POS & Inventory Dashboard Control System
 * Powered by Excel Recipe Database Specifications for Nagpur branch.
 * Manages active states, exact ingredient reductions, thermal printing, analytics, and CRUD configurations.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. DYNAMIC EXCEL-BASED RECIPE DATABASE & INITIAL STATE
  // ==========================================
  
  // Cleaned active recipe specs mapped directly from "@new item recipe copy.xlsx"
  const excelRecipes = {
    // HOT COFFEE
    "doppio": { coffee_beans: 20, hot_cups: 1 }, // 60ml double shot
    "espresso": { coffee_beans: 10, hot_cups: 1 }, // 30ml single shot
    "cappuccino": { coffee_beans: 10, steamed_milk: 200, hot_cups: 1 }, // 30ml shot + milk
    "cafe latte": { coffee_beans: 10, steamed_milk: 200, hot_cups: 1 },
    "flat white": { coffee_beans: 10, steamed_milk: 200, hot_cups: 1 },
    "affogato": { coffee_beans: 20, vanilla_ice_cream: 110, hot_cups: 1 }, // 60ml shot + ice cream
    "americano": { coffee_beans: 10, hot_cups: 1 }, // shot + hot water
    "cortado": { coffee_beans: 20, steamed_milk: 120, hot_cups: 1 }, // 60ml shot + milk
    "caramel macchiato": { coffee_beans: 10, steamed_milk: 200, caramel_syrup: 30, hot_cups: 1 },
    "cafe mocha": { coffee_beans: 10, steamed_milk: 200, chocolate_sauce: 40, hot_cups: 1 },
    "doppio hot chocolate": { cocoa_powder: 30, steamed_milk: 150, chocolate_sauce: 20, hot_cups: 1 },
    "classic hot chocolate": { cocoa_powder: 30, steamed_milk: 150, hot_cups: 1 },

    // COLD COFFEE
    "iced latte": { coffee_beans: 20, steamed_milk: 150, cold_cups: 1 }, // 60ml shot + milk + ice
    "iced americano": { coffee_beans: 10, cold_cups: 1 },
    "irish coffee": { coffee_beans: 20, whipped_cream: 30, cold_cups: 1 },
    "mocha frappe": { coffee_beans: 20, vanilla_ice_cream: 110, chocolate_sauce: 40, steamed_milk: 90, cold_cups: 1 },
    "doppio signature frappe": { coffee_beans: 20, vanilla_ice_cream: 110, chocolate_sauce: 60, steamed_milk: 90, whipped_cream: 20, cold_cups: 1 },
    "iced caramel macchiato": { coffee_beans: 20, steamed_milk: 150, caramel_syrup: 30, cold_cups: 1 },
    "hazelnut frappe": { coffee_beans: 20, vanilla_ice_cream: 110, hazelnut_syrup: 30, steamed_milk: 90, cold_cups: 1 },
    "espresso ginger ale": { coffee_beans: 10, ginger_ale: 150, cold_cups: 1 },
    "classic frappe": { coffee_beans: 20, vanilla_ice_cream: 110, steamed_milk: 90, cold_cups: 1 },

    // MATCHA
    "iced matcha latte": { matcha_powder: 3, steamed_milk: 150, cold_cups: 1 },
    "matcha latte": { matcha_powder: 3, steamed_milk: 150, hot_cups: 1 },
    "iced strawberry matcha": { matcha_powder: 3, steamed_milk: 120, strawberry_crush: 60, cold_cups: 1 },
    "iced vanilla matcha": { matcha_powder: 3, steamed_milk: 120, vanilla_syrup: 30, cold_cups: 1 },
    "mango matcha": { matcha_powder: 3, steamed_milk: 120, mango_crush: 60, cold_cups: 1 },

    // FRIES & SHARE PLATES
    "fries salted": { snack_packs: 1 },
    "fries peri peri": { snack_packs: 1, peri_peri_seasoning: 5 },
    "fries loaded": { snack_packs: 1, cheese_sauce: 40 },
    "potato wedges classic": { snack_packs: 1 },
    "potato wedges loaded": { snack_packs: 1, cheese_sauce: 40 },
    "hot chicken wings": { snack_packs: 1 },
    "chicken pops": { snack_packs: 1 },
    "chicken nuggets": { snack_packs: 1 },
    "chicken finger": { snack_packs: 1 },

    // MOCKTAILS
    "mojito": { mint_syrup: 30, soda: 200, lemon_juice: 15, cold_cups: 1 },
    "green apple soda": { green_apple_syrup: 30, soda: 200, lemon_juice: 15, cold_cups: 1 },
    "blue lagoon": { blue_curacao: 30, soda: 200, lemon_juice: 15, cold_cups: 1 },
    "spicy guava mojito": { guava_juice: 60, mint_syrup: 20, soda: 200, lemon_juice: 15, cold_cups: 1 },
    "lemon iced tea": { tea_bags: 1, sugar_syrup: 30, lemon_juice: 15, cold_cups: 1 },
    "litchi and lime granita": { litchi_crush: 60, soda: 100, lemon_juice: 15, cold_cups: 1 },
    "strawberry granita": { strawberry_crush: 60, soda: 100, lemon_juice: 15, cold_cups: 1 },
    "spicy mango martini": { mango_crush: 60, soda: 200, lemon_juice: 15, cold_cups: 1 },

    // SANDWICHES
    "bombay grilled sandwich": { snack_packs: 1 },
    "cheese corn grilled sandwich": { snack_packs: 1, cheese_sauce: 20 },
    "cheese chilli sandwich": { snack_packs: 1, cheese_sauce: 20 },

    // THICK SHAKES
    "nutella thickshake": { vanilla_ice_cream: 135, nutella: 60, whipped_cream: 20, steamed_milk: 120, cold_cups: 1 },
    "oreo cookies thickshake": { vanilla_ice_cream: 135, whipped_cream: 20, steamed_milk: 120, chocolate_sauce: 20, cold_cups: 1 },
    "salted caramel thickshake": { vanilla_ice_cream: 135, caramel_syrup: 30, whipped_cream: 20, steamed_milk: 120, cold_cups: 1 },
    "strawberry thickshake": { vanilla_ice_cream: 135, strawberry_crush: 60, whipped_cream: 20, steamed_milk: 120, cold_cups: 1 },
    "mango smoothie": { vanilla_ice_cream: 135, mango_crush: 60, whipped_cream: 20, steamed_milk: 120, cold_cups: 1 },
    "kids mnm shake": { vanilla_ice_cream: 135, whipped_cream: 20, steamed_milk: 120, chocolate_sauce: 20, cold_cups: 1 },

    // CLASSIC TOAST
    "cheese garlic": { snack_packs: 1, cheese_sauce: 20 },
    "chilli cheese garlic": { snack_packs: 1, cheese_sauce: 20 },
    "cheese corn toast": { snack_packs: 1, cheese_sauce: 20 },
    "cheese mushroom toast": { snack_packs: 1, cheese_sauce: 20 },

    // EGGS
    "classic cheese omelette": { snack_packs: 1, cheese_sauce: 15 },
    "garden omelette": { snack_packs: 1 },
    "masala omelette": { snack_packs: 1 },
    "butter garlic egg": { snack_packs: 1 },

    // APPETIZERS
    "classic nachos": { snack_packs: 1, cheese_sauce: 30 },
    "loaded nachos": { snack_packs: 1, cheese_sauce: 30 },

    // COMBOS
    "swiggy combo1": { coffee_beans: 20, steamed_milk: 200, snack_packs: 1, hot_cups: 1 },
    "swiggy combo2": { coffee_beans: 20, steamed_milk: 200, snack_packs: 2, hot_cups: 2 },
    "swiggy combo3": { coffee_beans: 40, steamed_milk: 400, snack_packs: 1, hot_cups: 2 },
    "swiggy combo4": { coffee_beans: 20, soda: 200, snack_packs: 2, cold_cups: 1 },
    "swiggy combo5": { coffee_beans: 20, hot_cups: 1, snack_packs: 1 },

    // PASTA
    "alfredo pennei pasta": { snack_packs: 1, cheese_sauce: 50 }
  };

  // Expanded inventory database structure (3.0 kg of raw ingredients / 300 units standard)
  const defaultInventory = {
    coffee_beans: 3000,       // grams (3 kg)
    steamed_milk: 3000,       // ml (3 L)
    matcha_powder: 500,       // grams
    cocoa_powder: 1000,       // grams
    vanilla_ice_cream: 3000,  // grams
    whipped_cream: 1000,      // ml
    caramel_syrup: 1000,      // ml
    chocolate_sauce: 1000,    // ml
    hazelnut_syrup: 1000,     // ml
    strawberry_crush: 1000,   // ml
    mango_crush: 1000,        // ml
    guava_juice: 2000,        // ml
    soda: 3000,               // ml
    lemon_juice: 1000,        // ml
    nutella: 1000,            // grams
    hot_cups: 300,            // units
    cold_cups: 300,           // units
    snack_packs: 300          // units
  };

  // Get or Set Menu
  const defaultMenu = [
    { name: 'Iced Latte', description: 'Creamy chilled latte served over ice.', price: 249, category: 'COLD COFFEE', icon: '🥛' },
    { name: 'Iced Americano', description: 'Strong refreshing black iced coffee.', price: 229, category: 'COLD COFFEE', icon: '🧊' },
    { name: 'Irish Coffee', description: 'Rich creamy coffee topped with whipped cream.', price: 279, category: 'COLD COFFEE', icon: '🥃' },
    { name: 'Mocha Frappe', description: 'Chocolate blended cold coffee with whipped cream.', price: 279, category: 'COLD COFFEE', icon: '🍫' },
    { name: 'Doppio Signature Frappe', description: 'Signature creamy frappe with chocolate toppings.', price: 298, category: 'COLD COFFEE', icon: '☕' },
    { name: 'Iced Caramel Macchiato', description: 'Sweet caramel layered iced coffee.', price: 279, category: 'COLD COFFEE', icon: '🍯' },
    { name: 'Hazelnut Frappe', description: 'Nutty creamy blended coffee.', price: 279, category: 'COLD COFFEE', icon: '🌰' },
    { name: 'Espresso Ginger Ale', description: 'Espresso mixed with sparkling ginger ale.', price: 279, category: 'COLD COFFEE', icon: '🥤' },
    { name: 'Classic Frappe', description: 'Smooth creamy cold coffee frappe.', price: 279, category: 'COLD COFFEE', icon: '🍦' },

    { name: 'Doppio', description: 'Double shot hot espresso with rich crema.', price: 219, category: 'HOT COFFEE', icon: '☕' },
    { name: 'Espresso', description: 'Strong concentrated black coffee shot.', price: 189, category: 'HOT COFFEE', icon: '☕' },
    { name: 'Cappuccino', description: 'Frothy coffee with latte art.', price: 229, category: 'HOT COFFEE', icon: '🎨' },
    { name: 'Cafe Latte', description: 'Smooth creamy latte with milk foam art.', price: 229, category: 'HOT COFFEE', icon: '🥛' },
    { name: 'Flat White', description: 'Velvety smooth milk coffee.', price: 229, category: 'HOT COFFEE', icon: '☕' },
    { name: 'Affogato', description: 'Espresso poured over vanilla ice cream.', price: 279, category: 'HOT COFFEE', icon: '🍨' },
    { name: 'Americano', description: 'Smooth black coffee.', price: 209, category: 'HOT COFFEE', icon: '☕' },
    { name: 'Cortado', description: 'Espresso balanced with warm milk.', price: 229, category: 'HOT COFFEE', icon: '🥃' },
    { name: 'Caramel Macchiato', description: 'Creamy caramel flavored coffee.', price: 249, category: 'HOT COFFEE', icon: '🍯' },
    { name: 'Doppio Hot Chocolate', description: 'Warm signature hot chocolate.', price: 229, category: 'HOT COFFEE', icon: '🍫' },
    { name: 'Cafe Mocha', description: 'Perfect mix of espresso, chocolate, and milk.', price: 269, category: 'HOT COFFEE', icon: '☕' },
    { name: 'Classic Hot Chocolate', description: 'Traditional creamy rich hot chocolate.', price: 349, category: 'HOT COFFEE', icon: '🍫' },

    { name: 'Iced Matcha Latte', description: 'Refreshing creamy green tea latte over ice.', price: 329, category: 'MATCHA', icon: '🍵' },
    { name: 'Matcha Latte', description: 'Warm creamy matcha drink.', price: 329, category: 'MATCHA', icon: '🍵' },
    { name: 'Iced Strawberry Matcha', description: 'Strawberry and matcha layered drink.', price: 349, category: 'MATCHA', icon: '🍓' },
    { name: 'Iced Vanilla Matcha', description: 'Sweet vanilla infused matcha drink.', price: 329, category: 'MATCHA', icon: '🌿' },
    { name: 'Mango Matcha', description: 'Tropical mango and matcha fusion.', price: 349, category: 'MATCHA', icon: '🥭' },

    { name: 'Fries Salted', description: 'Crispy salted french fries.', price: 249, category: 'FRIES & SHARE PLATES', icon: '🍟' },
    { name: 'Fries Peri Peri', description: 'Spicy peri peri seasoned fries.', price: 269, category: 'FRIES & SHARE PLATES', icon: '🌶️' },
    { name: 'Fries Loaded', description: 'Cheese loaded fries.', price: 279, category: 'FRIES & SHARE PLATES', icon: '🧀' },
    { name: 'Potato Wedges Classic', description: 'Crispy potato wedges with dip.', price: 249, category: 'FRIES & SHARE PLATES', icon: '🥔' },
    { name: 'Potato Wedges Loaded', description: 'Cheese and sauce loaded wedges.', price: 279, category: 'FRIES & SHARE PLATES', icon: '🍟' },
    { name: 'Hot Chicken Wings', description: 'Crispy spicy hot chicken wings.', price: 329, category: 'FRIES & SHARE PLATES', icon: '🍗' },
    { name: 'Chicken Pops', description: 'Bite-sized crispy chicken pops.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍿' },
    { name: 'Chicken Nuggets', description: 'Classic delicious golden chicken nuggets.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍗' },
    { name: 'Chicken Finger', description: 'Crispy golden fried chicken fingers.', price: 299, category: 'FRIES & SHARE PLATES', icon: '🍗' },

    { name: 'Mojito', description: 'Chilled mint and lime mocktail.', price: 329, category: 'MOCKTAILS', icon: '🍹' },
    { name: 'Green Apple Soda', description: 'Refreshing sparkling green apple infusion.', price: 329, category: 'MOCKTAILS', icon: '🍏' },
    { name: 'Blue Lagoon', description: 'Tropical sweet and sour blue mocktail.', price: 329, category: 'MOCKTAILS', icon: '🥤' },
    { name: 'Spicy Guava Mojito', description: 'Spiced guava mixed with mint and lime.', price: 329, category: 'MOCKTAILS', icon: '🌶️' },
    { name: 'Lemon Iced Tea', description: 'Classic refreshing sweetened lemon iced tea.', price: 329, category: 'MOCKTAILS', icon: '🍋' },
    { name: 'Litchi and Lime Granita', description: 'Shaved ice dessert with litchi and lime.', price: 329, category: 'MOCKTAILS', icon: '🍧' },
    { name: 'Strawberry Granita', description: 'Iced strawberry blend.', price: 329, category: 'MOCKTAILS', icon: '🍓' },
    { name: 'Spicy Mango Martini', description: 'Zesty mango mocktail with a hint of chili spice.', price: 329, category: 'MOCKTAILS', icon: '🍸' },

    { name: 'Bombay Grilled Sandwich', description: 'Indian style grilled vegetable sandwich.', price: 369, category: 'SANDWICHES', icon: '🥪' },
    { name: 'Cheese Corn Grilled Sandwich', description: 'Grilled sandwich stuffed with cheese and corn.', price: 329, category: 'SANDWICHES', icon: '🌽' },
    { name: 'Cheese Chilli Sandwich', description: 'Spicy cheese sandwich toasted perfectly.', price: 349, category: 'SANDWICHES', icon: '🌶️' },

    { name: 'Nutella Thickshake', description: 'Thick chocolate hazelnut milkshake.', price: 299, category: 'THICK SHAKES', icon: '🍫' },
    { name: 'Oreo Cookies Thickshake', description: 'Oreo loaded creamy shake.', price: 299, category: 'THICK SHAKES', icon: '🍪' },
    { name: 'Salted Caramel Thickshake', description: 'Sweet caramel creamy shake.', price: 299, category: 'THICK SHAKES', icon: '🍯' },
    { name: 'Strawberry Thickshake', description: 'Fresh strawberry creamy shake.', price: 299, category: 'THICK SHAKES', icon: '🍓' },
    { name: 'Mango Smoothie', description: 'Tropical mango smoothie.', price: 299, category: 'THICK SHAKES', icon: '🥭' },
    { name: 'Kids Mnm Shake', description: 'Fun colorful M&M candy milkshake.', price: 299, category: 'THICK SHAKES', icon: '🍬' },

    { name: 'Cheese Garlic', description: 'Garlic bread with melted cheese.', price: 249, category: 'CLASSIC TOAST', icon: '🧄' },
    { name: 'Chilli Cheese Garlic', description: 'Spicy garlic cheese toast.', price: 259, category: 'CLASSIC TOAST', icon: '🌶️' },
    { name: 'Cheese Corn Toast', description: 'Toast topped with cheese and corn.', price: 289, category: 'CLASSIC TOAST', icon: '🌽' },
    { name: 'Cheese Mushroom Toast', description: 'Toast topped with mushroom and cheese.', price: 329, category: 'CLASSIC TOAST', icon: '🍄' },

    { name: 'Classic Cheese Omelette', description: 'Soft fluffy cheese omelette.', price: 247, category: 'EGGS', icon: '🍳' },
    { name: 'Garden Omelette', description: 'Veggie stuffed omelette with toast.', price: 295, category: 'EGGS', icon: '🥗' },
    { name: 'Masala Omelette', description: 'Indian spiced omelette.', price: 269, category: 'EGGS', icon: '🌶️' },
    { name: 'Butter Garlic Egg', description: 'Garlic butter tossed egg dish.', price: 279, category: 'EGGS', icon: '🧄' },

    { name: 'Classic Nachos', description: 'Nachos served with cheese dip.', price: 298, category: 'APPETIZERS', icon: '🧀' },
    { name: 'Loaded Nachos', description: 'Nachos loaded with salsa and cheese.', price: 269, category: 'APPETIZERS', icon: '🌶️' },

    { name: 'Swiggy Combo1', description: 'Premium combo tailored for Swiggy users.', price: 420, category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo2', description: 'Luxury platter meal combination.', price: 600, category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo3', description: 'Signature double-pack combo.', price: 530, category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo4', description: 'Family snack and sip sharing combo.', price: 500, category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo5', description: 'Perfect light breakfast pairing combo.', price: 430, category: 'COMBOS', icon: '🍱' },

    { name: 'Alfredo Pennei Pasta', description: 'Creamy rich Alfredo white sauce penne pasta.', price: 499, category: 'PASTA', icon: '🍝' }
  ];

  let menu = JSON.parse(localStorage.getItem('doppio_menu')) || defaultMenu;
  let inventory = JSON.parse(localStorage.getItem('doppio_inventory')) || defaultInventory;
  let bills = JSON.parse(localStorage.getItem('doppio_bills')) || [];
  
  if (!localStorage.getItem('doppio_menu')) localStorage.setItem('doppio_menu', JSON.stringify(menu));
  if (!localStorage.getItem('doppio_inventory')) localStorage.setItem('doppio_inventory', JSON.stringify(inventory));

  let cart = [];
  let selectedPaymentMethod = 'UPI';

  // ==========================================
  // 2. CORE LAYOUT & NAVIGATION
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
      
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      tabTitle.textContent = link.textContent.trim();
      if (tabId === 'pos-tab') tabSubtitle.textContent = 'Default Tab: Selection Grid';
      else if (tabId === 'bills-tab') tabSubtitle.textContent = 'Print, Edit, or Delete Receipts';
      else if (tabId === 'inventory-tab') tabSubtitle.textContent = 'Live Ingredient & Resource Levels';
      else if (tabId === 'reports-tab') tabSubtitle.textContent = 'Nagpur Branch Sales & Analytics';
      else if (tabId === 'editor-tab') tabSubtitle.textContent = 'Manage Drink & Food Items';
      
      if (tabId === 'inventory-tab') renderInventory();
      if (tabId === 'reports-tab') renderReports();
      if (tabId === 'bills-tab') renderBills();
      if (tabId === 'editor-tab') renderMenuEditor();
    });
  });

  function generateOrderNumber() {
    const input = document.getElementById('order-num');
    if (input) {
      const num = 'DO-' + (1000 + bills.length + 1);
      input.value = num;
    }
  }
  generateOrderNumber();

  // ==========================================
  // 3. TAKEAWAY POS (TAB 1)
  // ==========================================
  const posSearch = document.getElementById('pos-search');
  const posCategories = document.getElementById('pos-categories');
  const posItemsGrid = document.getElementById('pos-items-grid');

  let activePOSCategory = 'ALL';
  let posSearchQuery = '';

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
      btn.textContent = label;
      posCategories.appendChild(btn);
    });
  }

  function renderPOSItems() {
    if (!posItemsGrid) return;
    posItemsGrid.innerHTML = '';

    const filteredItems = menu.filter(item => {
      const matchesCategory = activePOSCategory === 'ALL' || item.category === activePOSCategory;
      const matchesSearch = item.name.toLowerCase().includes(posSearchQuery.toLowerCase()) || 
                            item.description.toLowerCase().includes(posSearchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    filteredItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'pos-item-card';
      card.addEventListener('click', () => addToCart(item));

      card.innerHTML = `
        <div>
          <div class="pos-item-icon">${item.icon}</div>
          <div class="pos-item-title">${item.name}</div>
        </div>
        <div class="pos-item-price">₹${item.price}</div>
      `;
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
      if (e.target.classList.contains('pos-cat-btn')) {
        document.querySelectorAll('.pos-cat-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        activePOSCategory = e.target.getAttribute('data-category');
        renderPOSItems();
      }
    });
  }

  function addToCart(menuItem) {
    const existing = cart.find(item => item.name === menuItem.name);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ ...menuItem, qty: 1 });
    }
    renderCart();
  }

  function updateCartQty(name, delta) {
    const item = cart.find(i => i.name === name);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.name !== name);
    }
    renderCart();
  }

  const cartList = document.getElementById('cart-items-list');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartGst = document.getElementById('cart-gst');
  const cartTotal = document.getElementById('cart-total');

  function renderCart() {
    if (!cartList) return;
    cartList.innerHTML = '';

    if (cart.length === 0) {
      cartList.innerHTML = `
        <div class="empty-cart-state">
          <i class="fa-solid fa-basket-shopping"></i>
          <p>Cart is currently empty.<br>Tap items to add.</p>
        </div>
      `;
      cartSubtotal.textContent = '₹0.00';
      cartGst.textContent = '₹0.00';
      cartTotal.textContent = '₹0.00';
      return;
    }

    let subtotal = 0;

    cart.forEach(item => {
      const rowTotal = item.price * item.qty;
      subtotal += rowTotal;

      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-name">${item.name}</span>
          <span class="cart-item-price-unit">₹${item.price} each</span>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn decrease" data-name="${item.name}"><i class="fa-solid fa-minus"></i></button>
          <span class="cart-item-qty">${item.qty}</span>
          <button class="cart-qty-btn increase" data-name="${item.name}"><i class="fa-solid fa-plus"></i></button>
        </div>
        <span class="cart-item-total">₹${rowTotal}</span>
      `;
      cartList.appendChild(row);
    });

    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    cartSubtotal.textContent = `₹${subtotal}`;
    cartGst.textContent = `₹${gst}`;
    cartTotal.textContent = `₹${total}`;
  }

  if (cartList) {
    cartList.addEventListener('click', (e) => {
      const btn = e.target.closest('.cart-qty-btn');
      if (!btn) return;
      const name = btn.getAttribute('data-name');
      const delta = btn.classList.contains('increase') ? 1 : -1;
      updateCartQty(name, delta);
    });
  }

  const clearCartBtn = document.getElementById('clear-cart');
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
      cart = [];
      const nameInput = document.getElementById('cust-name');
      if (nameInput) nameInput.value = '';
      renderCart();
    });
  }

  const payBtns = document.querySelectorAll('.pay-method-btn');
  payBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      payBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPaymentMethod = btn.getAttribute('data-method');
    });
  });

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (cart.length === 0) {
        alert('Cart is empty! Add items before checking out.');
        return;
      }

      const custNameInput = document.getElementById('cust-name');
      const custName = (custNameInput && custNameInput.value.trim()) || 'Takeaway Customer';
      const orderNum = document.getElementById('order-num').value;

      // 1. DEDUCTION CALCULATOR
      let sufficientStock = true;
      let missingItem = '';

      const proposedDeductions = {};
      cart.forEach(cartItem => {
        const specs = getDeductionSpecs(cartItem);
        Object.keys(specs).forEach(ing => {
          proposedDeductions[ing] = (proposedDeductions[ing] || 0) + (specs[ing] * cartItem.qty);
        });
      });

      // Stock check
      Object.keys(proposedDeductions).forEach(ing => {
        if (inventory[ing] === undefined) inventory[ing] = 1000; // auto-recovery fallback
        if (inventory[ing] < proposedDeductions[ing]) {
          sufficientStock = false;
          missingItem = ing.replace('_', ' ');
        }
      });

      if (!sufficientStock) {
        alert(`Insufficient stock! Nagpur inventory is low on: ${missingItem}. Please restock.`);
        return;
      }

      // Perform deduction
      Object.keys(proposedDeductions).forEach(ing => {
        inventory[ing] -= proposedDeductions[ing];
      });
      localStorage.setItem('doppio_inventory', JSON.stringify(inventory));

      // Calculate totals
      let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const gst = Math.round(subtotal * 0.18);
      const total = subtotal + gst;

      // Create bill
      const newBill = {
        orderId: orderNum,
        customerName: custName,
        dateTime: new Date().toLocaleString('en-IN'),
        items: [...cart],
        subtotal: subtotal,
        gst: gst,
        total: total,
        paymentMethod: selectedPaymentMethod
      };

      bills.push(newBill);
      localStorage.setItem('doppio_bills', JSON.stringify(bills));

      // Print
      triggerThermalReceiptPrint(newBill);

      // Reset
      cart = [];
      if (custNameInput) custNameInput.value = '';
      generateOrderNumber();
      renderCart();
      checkLowStockAlerts();
    });
  }

  // Live Excel Recipe deduction parser
  function getDeductionSpecs(cartItem) {
    const nameLower = cartItem.name.toLowerCase();
    const recipe = excelRecipes[nameLower] || excelRecipes[nameLower.replace('thick shake', 'thickshake')];
    
    if (recipe) {
      return recipe;
    }
    
    // Default safe fallback if item is added via Menu Editor but doesn't exist in recipes.json
    return { snack_packs: 1 };
  }

  // ==========================================
  // 4. THERMAL RECEIPT COMPILER
  // ==========================================
  function triggerThermalReceiptPrint(bill) {
    const el = document.getElementById('thermal-receipt');
    if (!el) return;

    let itemsRows = '';
    bill.items.forEach(item => {
      itemsRows += `
        <tr>
          <td class="receipt-item-col">${item.name}</td>
          <td class="receipt-qty-col">${item.qty}</td>
          <td class="receipt-price-col">₹${item.price * item.qty}</td>
        </tr>
      `;
    });

    el.innerHTML = `
      <div class="receipt-header">
        <div class="receipt-title">DOPPIO CAFE</div>
        <div class="receipt-subtitle">London Street, Nagpur</div>
        <div class="receipt-subtitle">Ph: +91 91300 03177</div>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-meta-row">
        <span>Bill ID: ${bill.orderId}</span>
        <span>Type: Takeaway</span>
      </div>
      <div class="receipt-meta-row">
        <span>Date: ${bill.dateTime}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Cust: ${bill.customerName}</span>
      </div>
      <div class="receipt-divider"></div>
      
      <table class="receipt-table">
        <thead>
          <tr>
            <th class="receipt-item-col">Item</th>
            <th class="receipt-qty-col">Qty</th>
            <th class="receipt-price-col">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      
      <div class="receipt-divider"></div>
      
      <div class="receipt-summary-block">
        <div class="receipt-summary-row">
          <span>Subtotal</span>
          <span>₹${bill.subtotal}</span>
        </div>
        <div class="receipt-summary-row">
          <span>GST (18%)</span>
          <span>₹${bill.gst}</span>
        </div>
        <div class="receipt-summary-row bold">
          <span>Grand Total</span>
          <span>₹${bill.total}</span>
        </div>
      </div>
      
      <div class="receipt-divider"></div>
      <div class="receipt-meta-row" style="margin-top: 4px; justify-content: center; font-size: 8px;">
        <span>Payment Method: ${bill.paymentMethod}</span>
      </div>
      
      <div class="receipt-footer">
        <p>Thank you for choosing Doppio Cafe!</p>
        <p>Served with passion by bonie</p>
      </div>
    `;

    window.print();
  }

  // ==========================================
  // 5. BILLS MANAGEMENT (TAB 2)
  // ==========================================
  const billsTableBody = document.getElementById('bills-table-body');
  const billsSearchInput = document.getElementById('bills-search-input');
  const billsCount = document.getElementById('bills-count');

  let billsSearchQuery = '';

  function renderBills() {
    if (!billsTableBody) return;
    billsTableBody.innerHTML = '';

    const filteredBills = bills.filter(bill => {
      return bill.customerName.toLowerCase().includes(billsSearchQuery.toLowerCase()) || 
             bill.orderId.toLowerCase().includes(billsSearchQuery.toLowerCase());
    });

    if (billsCount) billsCount.textContent = `Showing ${filteredBills.length} Bills`;

    if (filteredBills.length === 0) {
      billsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
            <i class="fa-solid fa-receipt" style="font-size: 30px; color: var(--accent-caramel); margin-bottom: 10px; display: block;"></i>
            No matching Nagpur cashier bills found.
          </td>
        </tr>
      `;
      return;
    }

    const sortedBills = [...filteredBills].reverse();

    sortedBills.forEach(bill => {
      const tr = document.createElement('tr');
      let itemsListStr = bill.items.map(item => `${item.name} (${item.qty})`).join(', ');
      if (itemsListStr.length > 30) itemsListStr = itemsListStr.substring(0, 27) + '...';

      const methodClass = bill.paymentMethod.toLowerCase();

      tr.innerHTML = `
        <td style="font-weight: 700;">${bill.orderId}</td>
        <td>${bill.customerName}</td>
        <td>${bill.dateTime}</td>
        <td title="${bill.items.map(i => `${i.name} (x${i.qty})`).join(', ')}">${itemsListStr}</td>
        <td><span class="payment-badge ${methodClass}">${bill.paymentMethod}</span></td>
        <td style="font-weight: 700; color: var(--accent-caramel);">₹${bill.total}</td>
        <td>
          <button class="table-action-btn print" data-id="${bill.orderId}" title="Print Receipt"><i class="fa-solid fa-print"></i></button>
          <button class="table-action-btn edit" data-id="${bill.orderId}" title="Edit Customer"><i class="fa-solid fa-user-pen"></i></button>
          <button class="table-action-btn delete" data-id="${bill.orderId}" title="Delete Bill"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;
      billsTableBody.appendChild(tr);
    });
  }

  if (billsTableBody) {
    billsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.table-action-btn');
      if (!btn) return;

      const orderId = btn.getAttribute('data-id');
      const targetBillIndex = bills.findIndex(b => b.orderId === orderId);
      if (targetBillIndex === -1) return;

      if (btn.classList.contains('print')) {
        triggerThermalReceiptPrint(bills[targetBillIndex]);
      } else if (btn.classList.contains('edit')) {
        const newName = prompt('Edit Takeaway Customer Name:', bills[targetBillIndex].customerName);
        if (newName !== null && newName.trim() !== '') {
          bills[targetBillIndex].customerName = newName.trim();
          localStorage.setItem('doppio_bills', JSON.stringify(bills));
          renderBills();
        }
      } else if (btn.classList.contains('delete')) {
        if (confirm(`Are you sure you want to delete bill ${orderId}? This will restore ingredients.`)) {
          const bill = bills[targetBillIndex];
          bill.items.forEach(cartItem => {
            const specs = getDeductionSpecs(cartItem);
            Object.keys(specs).forEach(ing => {
              inventory[ing] += (specs[ing] * cartItem.qty);
            });
          });
          localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
          
          bills.splice(targetBillIndex, 1);
          localStorage.setItem('doppio_bills', JSON.stringify(bills));
          renderBills();
          checkLowStockAlerts();
        }
      }
    });
  }

  if (billsSearchInput) {
    billsSearchInput.addEventListener('input', (e) => {
      billsSearchQuery = e.target.value;
      renderBills();
    });
  }

  // ==========================================
  // 6. INVENTORY TAB (TAB 3)
  // ==========================================
  const inventoryGrid = document.getElementById('inventory-grid');
  const restockBtn = document.getElementById('restock-inventory-btn');

  function renderInventory() {
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = '';

    const items = [
      { key: 'coffee_beans', label: 'Coffee Beans', max: 3000, unit: 'g' },
      { key: 'steamed_milk', label: 'Steamed Milk', max: 3000, unit: 'ml' },
      { key: 'matcha_powder', label: 'Matcha Powder', max: 500, unit: 'g' },
      { key: 'cocoa_powder', label: 'Cocoa Powder', max: 1000, unit: 'g' },
      { key: 'vanilla_ice_cream', label: 'Vanilla Ice Cream', max: 3000, unit: 'g' },
      { key: 'whipped_cream', label: 'Whipped Cream', max: 1000, unit: 'ml' },
      { key: 'caramel_syrup', label: 'Caramel Syrup', max: 1000, unit: 'ml' },
      { key: 'chocolate_sauce', label: 'Chocolate Sauce', max: 1000, unit: 'ml' },
      { key: 'soda', label: 'Mocktail Soda Base', max: 3000, unit: 'ml' },
      { key: 'lemon_juice', label: 'Lemon juice juice', max: 1000, unit: 'ml' },
      { key: 'nutella', label: 'Premium Nutella', max: 1000, unit: 'g' },
      { key: 'hot_cups', label: 'Hot Takeaway Cups', max: 300, unit: 'pcs' },
      { key: 'cold_cups', label: 'Cold Takeaway Cups', max: 300, unit: 'pcs' },
      { key: 'snack_packs', label: 'Takeaway Food Boxes', max: 300, unit: 'pcs' }
    ];

    items.forEach(item => {
      const current = inventory[item.key] || 0;
      const percent = Math.min(100, Math.round((current / item.max) * 100));
      const isLow = current < (item.key.includes('cup') || item.key.includes('box') || item.key.includes('pack') ? 25 : 300);

      const card = document.createElement('div');
      card.className = 'inventory-card';
      card.innerHTML = `
        <div class="inventory-card-title">
          <h3>${item.label}</h3>
          <span class="inventory-amount">${formatStockValue(current, item.key)}</span>
        </div>
        <div class="inventory-progress-wrapper">
          <div class="inventory-progress-bar ${isLow ? 'low' : ''}" style="width: ${percent}%;"></div>
        </div>
        <div class="inventory-card-footer">
          <span>Capacity: ${item.max} ${item.unit}</span>
          <span>${percent}% Remaining</span>
        </div>
      `;
      inventoryGrid.appendChild(card);
    });
  }

  function formatStockValue(val, key) {
    if (key.includes('cups') || key.includes('packs')) return `${val} units`;
    if (val >= 1000) return `${(val/1000).toFixed(2)} kg`;
    return `${val} ${key.includes('milk') || key.includes('syrup') || key.includes('sauce') || key.includes('cream') || key.includes('juice') || key.includes('soda') ? 'ml' : 'g'}`;
  }

  if (restockBtn) {
    restockBtn.addEventListener('click', () => {
      inventory = { ...defaultInventory };
      localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
      renderInventory();
      checkLowStockAlerts();
      alert('Inventory successfully restocked to full Excel standard capacity (3.0 kg / 300 units)!');
    });
  }

  const alertsContainer = document.getElementById('low-stock-alerts');
  function checkLowStockAlerts() {
    if (!alertsContainer) return;
    alertsContainer.innerHTML = '';

    const warnings = [];
    if (inventory.coffee_beans < 400) warnings.push(`Warning: Coffee Beans are very low (${(inventory.coffee_beans/1000).toFixed(2)} kg remaining). Please restock.`);
    if (inventory.steamed_milk < 600) warnings.push(`Warning: Steamed Milk is very low (${(inventory.steamed_milk/1000).toFixed(2)} L remaining). Please restock.`);
    if (inventory.matcha_powder < 50) warnings.push(`Warning: Matcha Powder is very low (${inventory.matcha_powder}g remaining).`);
    if (inventory.hot_cups < 25) warnings.push(`Warning: Takeaway Hot Cups are critically low (${inventory.hot_cups} left).`);
    if (inventory.cold_cups < 25) warnings.push(`Warning: Takeaway Cold Cups are critically low (${inventory.cold_cups} left).`);

    warnings.forEach(warn => {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert-banner';
      alertDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${warn}</span>`;
      alertsContainer.appendChild(alertDiv);
    });
  }
  checkLowStockAlerts();

  // ==========================================
  // 7. SALES REPORTS & EXPORTERS (TAB 4)
  // ==========================================
  const reportRevenue = document.getElementById('report-total-revenue');
  const reportOrders = document.getElementById('report-total-orders');
  const reportTopItem = document.getElementById('report-top-item');
  const ledgerList = document.getElementById('report-ledger-list');
  const ingStatsList = document.getElementById('ingredient-stats-list');

  function renderReports() {
    const totalRev = bills.reduce((sum, b) => sum + b.total, 0);
    if (reportRevenue) reportRevenue.textContent = `₹${totalRev}`;
    if (reportOrders) reportOrders.textContent = bills.length;

    const itemCounts = {};
    bills.forEach(b => {
      b.items.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty;
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

    if (ledgerList) {
      ledgerList.innerHTML = '';
      if (bills.length === 0) {
        ledgerList.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No sales logged.</p>';
      } else {
        const sorted = [...bills].reverse();
        sorted.forEach(bill => {
          const item = document.createElement('div');
          item.className = 'ledger-item';
          item.innerHTML = `
            <div class="ledger-details">
              <span class="ledger-title">${bill.customerName} (${bill.orderId})</span>
              <span class="ledger-meta">${bill.dateTime} • ${bill.paymentMethod}</span>
            </div>
            <span class="ledger-price">₹${bill.total}</span>
          `;
          ledgerList.appendChild(item);
        });
      }
    }

    if (ingStatsList) {
      ingStatsList.innerHTML = '';
      const items = [
        { label: 'Coffee Beans Consumed', value: 3000 - inventory.coffee_beans, max: 3000, unit: 'g' },
        { label: 'Steamed Milk Consumed', value: 3000 - inventory.steamed_milk, max: 3000, unit: 'ml' },
        { label: 'Matcha Powder Consumed', value: 500 - inventory.matcha_powder, max: 500, unit: 'g' },
        { label: 'Cocoa Powder Consumed', value: 1000 - inventory.cocoa_powder, max: 1000, unit: 'g' },
        { label: 'Vanilla Ice Cream Consumed', value: 3000 - inventory.vanilla_ice_cream, max: 3000, unit: 'g' },
        { label: 'Nutella Consumed', value: 1000 - inventory.nutella, max: 1000, unit: 'g' },
        { label: 'Mocktail Soda Utilized', value: 3000 - inventory.soda, max: 3000, unit: 'ml' },
        { label: 'Paper Hot Cups Utilized', value: 300 - inventory.hot_cups, max: 300, unit: 'pcs' },
        { label: 'Paper Cold Cups Utilized', value: 300 - inventory.cold_cups, max: 300, unit: 'pcs' }
      ];

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'ingredient-stat-row';
        row.innerHTML = `
          <span class="ing-stat-name">${item.label}</span>
          <span class="ing-stat-amount">${item.value < 0 ? 0 : item.value} ${item.unit} (${Math.round(Math.max(0, item.value / item.max) * 100)}% capacity used)</span>
        `;
        ingStatsList.appendChild(row);
      });
    }
  }

  const excelBtn = document.getElementById('export-excel-btn');
  if (excelBtn) {
    excelBtn.addEventListener('click', () => {
      if (bills.length === 0) {
        alert('No bills logged to export!');
        return;
      }

      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += 'Order ID,Customer Name,Date and Time,Items Ordered,Payment Method,Subtotal (INR),GST (INR),Total Bill (INR)\n';

      bills.forEach(bill => {
        const itemsStr = bill.items.map(i => `${i.name} (x${i.qty})`).join('; ');
        const row = `"${bill.orderId}","${bill.customerName}","${bill.dateTime}","${itemsStr}","${bill.paymentMethod}",${bill.subtotal},${bill.gst},${bill.total}`;
        csvContent += row + '\n';
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `doppio_nagpur_sales_report_${new Date().toLocaleDateString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  const pdfBtn = document.getElementById('export-pdf-btn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      const printWindow = window.open('', '_blank');
      const totalRev = bills.reduce((sum, b) => sum + b.total, 0);
      let billsRows = '';
      bills.forEach(b => {
        billsRows += `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #ddd;">${b.orderId}</td>
            <td style="padding:8px; border-bottom:1px solid #ddd;">${b.customerName}</td>
            <td style="padding:8px; border-bottom:1px solid #ddd;">${b.dateTime}</td>
            <td style="padding:8px; border-bottom:1px solid #ddd;">${b.items.map(i => `${i.name} (x${i.qty})`).join(', ')}</td>
            <td style="padding:8px; border-bottom:1px solid #ddd;">${b.paymentMethod}</td>
            <td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">₹${b.total}</td>
          </tr>
        `;
      });

      printWindow.document.write(`
        <html>
        <head>
          <title>Doppio Cafe Nagpur | Sales Analytics Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #2C1B18; }
            h1 { font-family: Georgia, serif; text-align: center; border-bottom: 2px solid #2C1B18; padding-bottom: 10px; }
            .meta-panel { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
            .metrics-panel { display: flex; gap: 20px; margin-bottom: 30px; }
            .metric-box { flex: 1; border: 1px solid #ddd; padding: 20px; border-radius: 8px; text-align: center; }
            .metric-box h2 { font-size: 24px; color: #C88A58; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #F5EBE0; padding: 10px; border-bottom: 2px solid #2C1B18; text-align: left; }
          </style>
        </head>
        <body>
          <h1>DOPPIO CAFE NAGPUR</h1>
          <h3 style="text-align: center; margin-top: -10px; color: #7E6E6A;">Takeaway POS Sales & Ledger Audit Report</h3>
          
          <div class="meta-panel">
            <span>Report Date: ${new Date().toLocaleDateString('en-IN')}</span>
            <span>Generated By: cashier (bonie)</span>
          </div>

          <div class="metrics-panel">
            <div class="metric-box">
              <h3>Total Sales Revenue</h3>
              <h2>₹${totalRev}</h2>
            </div>
            <div class="metric-box">
              <h3>Total Orders Logged</h3>
              <h2>${bills.length}</h2>
            </div>
          </div>

          <h3>Ledger Transactions Log</h3>
          <table>
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Customer</th>
                <th>Date & Time</th>
                <th>Items Ordered</th>
                <th>Payment</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${billsRows || '<tr><td colspan="6" style="text-align:center; padding:20px;">No sales logged in Nagpur branch database.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // ==========================================
  // 8. MENU CRUD EDITOR (TAB 5)
  // ==========================================
  const editorGrid = document.getElementById('editor-items-grid');
  const addBtn = document.getElementById('add-new-menu-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const editorForm = document.getElementById('menu-item-editor-form');
  const formPanelTitle = document.getElementById('form-panel-title');

  function renderMenuEditor() {
    if (!editorGrid) return;
    editorGrid.innerHTML = '';

    menu.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'editor-item-card';
      card.innerHTML = `
        <div class="editor-card-header">
          <span class="editor-card-icon">${item.icon}</span>
          <span class="editor-card-price">₹${item.price}</span>
        </div>
        <div>
          <div class="editor-card-title">${item.name}</div>
          <div class="editor-card-category">${item.category}</div>
        </div>
        <div class="editor-card-actions">
          <button class="editor-action-btn edit" data-index="${index}"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="editor-action-btn delete" data-index="${index}"><i class="fa-solid fa-trash-can"></i> Delete</button>
        </div>
      `;
      editorGrid.appendChild(card);
    });
  }

  if (editorGrid) {
    editorGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.editor-action-btn');
      if (!btn) return;

      const index = parseInt(btn.getAttribute('data-index'), 10);
      
      if (btn.classList.contains('edit')) {
        const item = menu[index];
        document.getElementById('edit-item-index').value = index;
        document.getElementById('item-name-input').value = item.name;
        document.getElementById('item-category-input').value = item.category;
        document.getElementById('item-price-input').value = item.price;
        document.getElementById('item-desc-input').value = item.description || '';
        document.getElementById('item-icon-input').value = item.icon;

        if (formPanelTitle) formPanelTitle.textContent = 'Edit Menu Item';
        document.getElementById('save-item-btn').textContent = 'Update Item';
      } else if (btn.classList.contains('delete')) {
        if (confirm(`Are you sure you want to delete ${menu[index].name} from the menu?`)) {
          menu.splice(index, 1);
          localStorage.setItem('doppio_menu', JSON.stringify(menu));
          renderMenuEditor();
          renderPOSCategories();
          renderPOSItems();
        }
      }
    });
  }

  function resetEditorForm() {
    if (editorForm) editorForm.reset();
    document.getElementById('edit-item-index').value = '';
    if (formPanelTitle) formPanelTitle.textContent = 'Add New Menu Item';
    document.getElementById('save-item-btn').textContent = 'Save Menu Item';
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', resetEditorForm);
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      resetEditorForm();
      document.getElementById('item-name-input').focus();
    });
  }

  if (editorForm) {
    editorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const indexStr = document.getElementById('edit-item-index').value;
      const name = document.getElementById('item-name-input').value.trim();
      const category = document.getElementById('item-category-input').value;
      const price = parseInt(document.getElementById('item-price-input').value, 10);
      const description = document.getElementById('item-desc-input').value.trim();
      const icon = document.getElementById('item-icon-input').value.trim();

      const newItem = { name, category, price, description, icon };

      if (indexStr === '') {
        menu.push(newItem);
      } else {
        const index = parseInt(indexStr, 10);
        menu[index] = newItem;
      }

      localStorage.setItem('doppio_menu', JSON.stringify(menu));
      resetEditorForm();
      renderMenuEditor();
      renderPOSCategories();
      renderPOSItems();
    });
  }

  // ==========================================
  // 9. INITIAL BOOTSTRAP TRIGGERS
  // ==========================================
  renderPOSCategories();
  renderPOSItems();
  renderCart();
});
