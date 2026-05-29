/**
 * Doppio Cafe - Nagpur Premium Cashier Takeaway POS & Inventory Dashboard Control System
 * Redesigned for commercial-grade touchscreen tablets and desktop PCs.
 * Keeps existing brown-cream branding, Supabase sync, and synthesiser chimes.
 */

document.addEventListener('DOMContentLoaded', () => {

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
  let customRecipes = JSON.parse(localStorage.getItem('doppio_custom_recipes')) || {};
  let thresholds = JSON.parse(localStorage.getItem('doppio_inventory_thresholds')) || {};

  // Nagpur Menu Recovery & Defensive Restoration logic
  let storedMenu = JSON.parse(localStorage.getItem('doppio_menu'));
  let menu = [];
  if (!storedMenu || storedMenu.length < 15) {
    menu = defaultMenu;
    localStorage.setItem('doppio_menu', JSON.stringify(menu));
  } else {
    // Merge missing default Nagpur items (e.g. food, sandwiches, mocktails) back automatically
    const storedNames = new Set(storedMenu.map(item => item.name.toLowerCase().trim()));
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

  let savedInventory = JSON.parse(localStorage.getItem('doppio_inventory')) || {};
  let inventory = { ...defaultInventory, ...savedInventory };
  let bills = JSON.parse(localStorage.getItem('doppio_bills')) || [];
  let businessProfile = JSON.parse(localStorage.getItem('doppio_business_profile')) || {
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

  // Force default sound off for existing storage/users
  if (localStorage.getItem('doppio_sound_default_off_v2') !== 'true') {
    businessProfile.soundEnabled = false;
    localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));
    localStorage.setItem('doppio_sound_default_off_v2', 'true');
  }

  let cart = JSON.parse(localStorage.getItem('doppio_cart')) || [];
  let selectedPaymentMethod = localStorage.getItem('doppio_cart_pay_method') || 'UPI';
  let activeOrderType = 'Takeaway';
  let draftOrders = JSON.parse(localStorage.getItem('doppio_draft_orders')) || [];
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
        syncWithSupabase();
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
      if (desktopStatusText) desktopStatusText.innerHTML = 'Supabase Live';
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
        mobileBadge.title = 'Supabase Live';
        const dot = mobileBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot green';
        }
      }
    } else {
      if (desktopStatusText) desktopStatusText.innerHTML = 'Offline Mode';
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
        mobileBadge.title = 'Offline Mode';
        const dot = mobileBadge.querySelector('.status-dot');
        if (dot) {
          dot.className = 'status-dot red';
        }
      }
    }
  }

  function saveOfflineBill(bill) {
    const queue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
    if (!queue.some(b => b.orderId === bill.orderId)) {
      queue.push(bill);
      localStorage.setItem('doppio_offline_bills_queue', JSON.stringify(queue));
    }
  }

  async function syncOfflineBills() {
    if (!supabaseClient || !navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
    if (queue.length === 0) return;
    
    const billsToSync = [...queue];
    for (const bill of billsToSync) {
      try {
        const { error } = await supabaseClient.from('doppio_bills').insert({
          orderId: bill.orderId,
          customerName: bill.customerName,
          dateTime: bill.dateTime,
          items: typeof bill.items === 'string' ? bill.items : JSON.stringify(bill.items),
          subtotal: bill.subtotal,
          gst: bill.gst,
          total: bill.total,
          paymentMethod: bill.paymentMethod
        });
        
        if (!error) {
          const currentQueue = JSON.parse(localStorage.getItem('doppio_offline_bills_queue')) || [];
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
    try {
      // Sync Menu
      const { data: dbMenu } = await supabaseClient.from('doppio_menu').select('*').order('id', { ascending: true });
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
      const { data: dbInv } = await supabaseClient.from('doppio_inventory').select('*');
      if (dbInv && dbInv.length > 0) {
        dbInv.forEach(row => {
          inventory[row.key] = row.current;
        });
        localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
        renderInventory();
        checkLowStockAlerts();
      }

      // Sync Bills History Live across all devices!
      const { data: dbBills } = await supabaseClient.from('doppio_bills').select('*');
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
    } catch(e) {
      console.warn("Supabase initial sync fallback", e);
    }
  }

  function setupSupabaseRealtime() {
    if (!supabaseClient) return;
    supabaseClient.channel('doppio-bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_bills' }, () => {
        syncWithSupabase();
      }).subscribe();
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
      document.getElementById(tabId).classList.add('active');

      tabTitle.textContent = link.textContent.trim();
      
      if (tabId === 'pos-tab') tabSubtitle.textContent = 'Default Tab: Selection Grid';
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
    });
  });

  // Calculate Header daily sales performance indicators
  function updateHeaderSummaryStats() {
    const headerSales = document.getElementById('header-sales-today');
    const headerBills = document.getElementById('header-bills-today');
    
    // Calculate values specifically for today
    const today = new Date().toLocaleDateString('en-IN');
    const todayBills = bills.filter(b => b.dateTime.includes(today));
    const todayTotal = todayBills.reduce((sum, b) => sum + b.total, 0);

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
    if (e.key === '/' && document.activeElement !== posSearch) {
      e.preventDefault();
      if (posSearch) { posSearch.focus(); posSearch.value = ''; }
    }
  });

  // Custom Category Icons Mapping
  const categoryIconsMap = {
    'ALL': '☕',
    'COLD COFFEE': '🥤',
    'HOT COFFEE': '☕',
    'MATCHA': '🍵',
    'FRIES & SHARE PLATES': '🍟',
    'MOCKTAILS': '🍹',
    'SANDWICHES': '🥪',
    'THICK SHAKES': '🥤',
    'CLASSIC TOAST': '🍞',
    'EGGS': '🍳',
    'APPETIZERS': '🍢',
    'COMBOS': '🍱',
    'PASTA': '🍝'
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
      
      const icon = categoryIconsMap[cat] || '☕';
      btn.innerHTML = `${icon} ${label}`;
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
      // Find matching items in cart to calculate quick badges
      const cartCount = cart.filter(i => i.name === item.name).reduce((sum, i) => sum + i.qty, 0);
      
      const card = document.createElement('div');
      card.className = `pos-item-card ${cartCount > 0 ? 'selected-in-cart' : ''}`;
      
      // Floating Bestseller label
      const bestsellerBadge = item.bestseller ? '<span class="bestseller-badge">★ Bestseller</span>' : '';
      const prepBadge = item.prepTime ? `<span class="prep-time-tag">⏱ ${item.prepTime} mins</span>` : '';
      
      const qtyBadge = cartCount > 0 ? `<span class="pos-item-qty-badge">${cartCount}</span>` : '';

      card.innerHTML = `
        ${bestsellerBadge}
        ${prepBadge}
        ${qtyBadge}
        <div class="pos-card-body-click">
          <div class="pos-item-icon">${item.icon || '☕'}</div>
          <div class="pos-item-title">${item.name}</div>
        </div>
        <div class="pos-item-price-row">
          <span class="pos-item-price">₹${item.price}</span>
          <button class="quick-add-btn" title="Add default immediately"><i class="fa-solid fa-plus"></i></button>
        </div>
      `;

      // Main card click triggers touchscreen customizer drawer
      card.querySelector('.pos-card-body-click').addEventListener('click', () => {
        openCustomizationModal(item);
      });

      // Plus icon click adds default instantly
      card.querySelector('.quick-add-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        addDefaultToCart(item);
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
    custModalTitle.innerHTML = `<span style="font-size:24px;">${item.icon || '☕'}</span> Customize ${item.name}`;
    
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
  function addDefaultToCart(menuItem) {
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
    if (nameInput && !nameInput.value) {
      nameInput.value = localStorage.getItem('doppio_cart_cust_name') || '';
    }
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = localStorage.getItem('doppio_cart_cust_phone') || '';
    }

    cartList.innerHTML = '';

    if (cart.length === 0) {
      cartList.innerHTML = `
        <div class="empty-cart-state">
          <i class="fa-solid fa-basket-shopping"></i>
          <p>Cart is currently empty.<br>Tap items to add & customize.</p>
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

      // Compile customization label string
      let configParts = [`Size: ${item.size}`];
      if (item.sugar !== 'Regular') configParts.push(`Sweet: ${item.sugar}`);
      if (item.ice !== 'Regular') configParts.push(`Ice: ${item.ice}`);
      if (item.toppings.length > 0) configParts.push(`+ ${item.toppings.join(', ')}`);
      if (item.notes) configParts.push(`"${item.notes}"`);

      const configLabel = configParts.join(' | ');

      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-name">${item.icon || '☕'} ${item.name}</span>
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

    cartSubtotal.textContent = `₹${subtotal}`;
    
    if (loyaltyDiscount > 0) {
      cartGst.innerHTML = `<span style="color:#2ecc71;">-₹${loyaltyDiscount}</span> (Discount) &nbsp;+&nbsp; ₹${gst} (GST)`;
    } else {
      cartGst.textContent = `₹${gst}`;
    }

    cartTotal.textContent = `₹${total}`;
    
    // Save to localStorage for persistence across reloads/logouts/tabs
    localStorage.setItem('doppio_cart', JSON.stringify(cart));
    localStorage.setItem('doppio_cart_pay_method', selectedPaymentMethod);
    localStorage.setItem('doppio_cart_cust_name', nameInput ? nameInput.value : '');
    localStorage.setItem('doppio_cart_cust_phone', phoneInput ? phoneInput.value : '');

    renderPOSItems();
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
  payBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      payBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPaymentMethod = btn.getAttribute('data-method');
      SoundEffects.playClick();
    });
  });

  // Complete checkout & Sync
  function performCheckout(shouldPrint) {
    if (cart.length === 0) {
      alert('Cart is empty! Add items before checking out.');
      return;
    }

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
        
        // Temporarily restore original deductions back to inventory level
        Object.keys(oldDeductions).forEach(ing => {
          if (inventory[ing] === undefined) inventory[ing] = 1000;
          inventory[ing] += oldDeductions[ing];
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
          inventory[ing] -= oldDeductions[ing];
        });
      }
      alert(`Insufficient stock! Low on: ${missingItem}. Please restock.`);
      return;
    }

    // Deduct stock levels permanently
    Object.keys(proposedDeductions).forEach(ing => {
      inventory[ing] -= proposedDeductions[ing];
      if (supabaseClient) {
        supabaseClient.from('doppio_inventory')
          .update({ current: inventory[ing] })
          .eq('key', ing).then();
      }
    });
    localStorage.setItem('doppio_inventory', JSON.stringify(inventory));

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
          paymentMethod: selectedPaymentMethod,
          orderType: activeOrderType
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
            paymentMethod: selectedPaymentMethod
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
        paymentMethod: selectedPaymentMethod,
        orderType: activeOrderType
      };
      bills.push(newBill);
      finalBillObject = newBill;

      // Cloud syncing via insert
      if (supabaseClient && navigator.onLine) {
        supabaseClient.from('doppio_bills').insert({
          orderId: newBill.orderId,
          customerName: newBill.customerName,
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

    // Offer to send bill via WhatsApp automatically if a customer number was entered
    if (phoneVal && finalBillObject) {
      setTimeout(() => {
        if (confirm(`Would you like to send this bill receipt via WhatsApp to ${phoneVal}?`)) {
          shareBillOnWhatsApp(finalBillObject);
        }
      }, 1000);
    }

    // Reset editing state
    editingBillId = null;
    localStorage.removeItem('doppio_editing_bill_id');
    const banner = document.getElementById('editing-bill-banner');
    if (banner) banner.style.display = 'none';

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
        guestToggleBtn.style.borderColor = 'rgba(43,24,19,0.06)';
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
      performCheckout(false);
    });
  }

  if (checkoutPrintBtn) {
    checkoutPrintBtn.addEventListener('click', () => {
      performCheckout(true);
    });
  }

  function getDeductionSpecs(cartItem) {
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

  function parseBillDate(bill) {
    if (!bill.dateTime) return new Date();
    const d = new Date(bill.dateTime);
    if (!isNaN(d.getTime())) {
      d.setHours(0,0,0,0);
      return d;
    }
    const parts = bill.dateTime.split(',')[0].split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        parsedDate.setHours(0,0,0,0);
        return parsedDate;
      }
    }
    const fallback = new Date();
    fallback.setHours(0,0,0,0);
    return fallback;
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
                            bill.customerName.toLowerCase().includes(q) || 
                            bill.orderId.toLowerCase().includes(q) || 
                            (bill.customerPhone && bill.customerPhone.includes(q));

      // Presets filter matches
      let matchesPreset = true;
      if (activePresetDate !== 'all') {
        const today = new Date().toLocaleDateString('en-IN');
        if (activePresetDate === 'today') {
          matchesPreset = bill.dateTime.includes(today);
        } else if (activePresetDate === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toLocaleDateString('en-IN');
          matchesPreset = bill.dateTime.includes(yesterdayStr);
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
    const dailySalesTotal = filteredBills.reduce((sum, b) => sum + b.total, 0);
    document.getElementById('bills-revenue-card').textContent = `₹${dailySalesTotal}`;
    document.getElementById('bills-total-card').textContent = `${filteredBills.length} Invoices`;
    
    // Average Order Value calculations
    const aov = filteredBills.length === 0 ? 0 : Math.round(dailySalesTotal / filteredBills.length);
    document.getElementById('bills-aov-card').textContent = `₹${aov}`;

    // Split percentages calculations
    const upiCount = filteredBills.filter(b => b.paymentMethod === 'UPI').length;
    const upiPercent = filteredBills.length === 0 ? 0 : Math.round((upiCount / filteredBills.length) * 100);
    document.getElementById('bills-upi-percent').textContent = `${upiPercent}%`;
    document.getElementById('bills-cash-percent').textContent = `${100 - upiPercent}%`;

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
      const tr = document.createElement('tr');
      
      // Items string format details
      let itemsListStr = bill.items.map(item => `${item.name} (${item.qty})`).join(', ');
      if (itemsListStr.length > 36) itemsListStr = itemsListStr.substring(0, 33) + '...';
      
      // Avatar Initials details
      const initials = bill.customerName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();

      tr.innerHTML = `
        <td style="font-weight:700;">${bill.orderId}</td>
        <td>
          <div class="customer-avatar-cell">
            <div class="cust-avatar">${initials}</div>
            <div style="display:flex; flex-direction:column;">
              <span style="font-weight:600;">${bill.customerName}</span>
              <span style="font-size:10px; color:var(--text-muted);">${bill.customerPhone || 'Walk-in Guest'}</span>
            </div>
          </div>
        </td>
        <td>${bill.dateTime}</td>
        <td title="${bill.items.map(i => `${i.name} (x${i.qty})`).join(', ')}">${itemsListStr}</td>
        <td><span class="payment-badge ${bill.paymentMethod.toLowerCase()}">${bill.paymentMethod}</span></td>
        <td style="font-weight:700; color:var(--accent-caramel);">₹${bill.total}</td>
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
    
    // Monospace alignment helpers (matching thermal printer 32-char specs)
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
    
    // Build receipt wrapped in WhatsApp's triple backticks monospace block
    let msg = "```\n";
    msg += borderDouble + '\n';
    msg += centerText32(businessProfile.name || 'DOPPIO CAFE NAGPUR') + '\n';
    msg += centerText32(businessProfile.address || 'London Street, Nagpur') + '\n';
    msg += centerText32(businessProfile.phone || '+91 91300 03177') + '\n';
    msg += borderDouble + '\n\n';
    
    const leftBill = `Bill: ${bill.orderId}`;
    const rightPay = bill.paymentMethod || 'Cash';
    msg += leftBill + rightPay.padStart(32 - leftBill.length, ' ') + '\n';
    
    // Extract raw date part for compactness
    const dateOnly = bill.dateTime ? bill.dateTime.split(',')[0] : new Date().toLocaleDateString('en-IN');
    msg += `Date: ${dateOnly}\n`;
    msg += `Guest: ${(bill.customerName || 'Walk-in Guest').slice(0, 25)}\n\n`;
    
    msg += borderSingle + '\n';
    msg += formatRow32('Item', 'Qty', 'Amt') + '\n';
    msg += borderSingle + '\n';
    
    bill.items.forEach(item => {
      let displayName = item.name;
      if (item.size && item.size !== 'Small') {
        displayName += ` (${item.size.charAt(0)})`;
      }
      
      msg += formatRow32(displayName, item.qty, (item.price * item.qty).toString()) + '\n';
      msg += `  (₹${item.price} each)\n`;
      
      if (item.toppings && item.toppings.length > 0) {
        msg += `  + ${item.toppings.join(', ')}\n`;
      }
      if (item.notes) {
        msg += `  * Note: ${item.notes}\n`;
      }
    });
    
    msg += borderSingle + '\n';
    msg += formatDouble32('Subtotal', bill.subtotal.toString()) + '\n';
    
    if (businessProfile.gstEnabled !== false) {
      msg += formatDouble32('GST', bill.gst.toString()) + '\n';
    }
    
    if (bill.discount && bill.discount > 0) {
      msg += formatDouble32('Discount', `-${bill.discount}`) + '\n';
    }
    
    msg += borderDouble + '\n';
    msg += formatDouble32('GRAND TOTAL', bill.total.toString()) + '\n';
    msg += borderDouble + '\n\n';
    
    msg += centerText32('Thank you for visiting!') + '\n';
    msg += centerText32('Visit Again ☕') + '\n';
    msg += "```";
    
    const encodedMsg = encodeURIComponent(msg);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneNum}&text=${encodedMsg}`;
    
    window.open(whatsappUrl, '_blank');
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

      // Determine stock status and colors
      let statusClass = 'healthy';
      let cardClass = '';
      if (percent < itemThreshold) {
        statusClass = 'low';
        cardClass = 'alert-low';
        lowCount++;
        if (currentVal <= 0) {
          emptyCount++;
        }
      } else if (percent < 50) {
        statusClass = 'medium';
        cardClass = 'alert-medium';
      }

      // Remaining estimated days mock logic
      const estimatedDays = percent >= itemThreshold ? 'Healthy (8+ days)' : (percent >= (itemThreshold / 2) ? 'Refill within 3 days' : 'Critical - Stock low');
      const icon = categoryIconsMap[key] || '🥛';

      const card = document.createElement('div');
      card.className = `inventory-card ${cardClass}`;
      card.innerHTML = `
        <div class="inventory-card-title">
          <h3>${icon} ${getLabelFromKey(key)}</h3>
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

        <div class="inventory-card-actions" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px;">
          <label style="font-size: 10px; font-weight:700; color:var(--text-muted); display:flex; align-items:center; gap:4px; margin:0;">
            Warn: 
            <input type="number" class="threshold-input" data-key="${key}" value="${itemThreshold}" min="0" max="100" style="width: 45px; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(43,24,19,0.15); background: transparent; color: var(--primary-brand); text-align: center; font-size:10px; font-weight:700; outline:none;">
            %
          </label>
          <button class="btn btn-secondary quick-refill-btn" data-key="${key}" style="padding:4px 10px; font-size:10px;"><i class="fa-solid fa-plus"></i> Refill</button>
        </div>
      `;

      card.querySelector('.quick-refill-btn').addEventListener('click', () => {
        SoundEffects.playPop();
        inventory[key] = maxVal;
        localStorage.setItem('doppio_inventory', JSON.stringify(inventory));
        renderInventory();
        checkLowStockAlerts();
      });

      card.querySelector('.threshold-input').addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          thresholds[key] = val;
          localStorage.setItem('doppio_inventory_thresholds', JSON.stringify(thresholds));
          checkLowStockAlerts();
          // Visual updates
          renderInventory();
        }
      });

      inventoryGrid.appendChild(card);
    });

    // Update Top metrics cards
    document.getElementById('inv-total-low').textContent = `${lowCount} Warnings`;
    document.getElementById('inv-total-empty').textContent = `${emptyCount} Out of stock`;
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
    const totalRevenueSum = filteredBills.reduce((sum, b) => sum + b.total, 0);
    if (reportRevenue) reportRevenue.textContent = `₹${totalRevenueSum}`;
    if (reportOrders) reportOrders.textContent = filteredBills.length;

    // Payment method breakdowns
    const sumUPI = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'UPI').reduce((sum, b) => sum + b.total, 0);
    const sumCard = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CARD').reduce((sum, b) => sum + b.total, 0);
    const sumCash = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CASH').reduce((sum, b) => sum + b.total, 0);

    const elUPI = document.getElementById('report-pay-upi');
    const elCard = document.getElementById('report-pay-card');
    const elCash = document.getElementById('report-pay-cash');

    if (elUPI) elUPI.textContent = `₹${sumUPI}`;
    if (elCard) elCard.textContent = `₹${sumCard}`;
    if (elCash) elCash.textContent = `₹${sumCash}`;

    // Best seller counts mapping
    const itemCounts = {};
    filteredBills.forEach(b => {
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

    // Renders custom SVG curved line trends chart inside report Visual box
    if (revenueChartBox) {
      revenueChartBox.innerHTML = '';
      
      const width = 460;
      const height = 180;
      
      // Calculate revenue points specifically for last 5 orders of the filtered set
      const chartBills = [...filteredBills].slice(-5);
      let dataPoints = chartBills.map(b => b.total);
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

      // Draw SVG curved grid
      revenueChartBox.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible;">
          <!-- Grid lines -->
          <line x1="30" y1="30" x2="${width-30}" y2="30" stroke="rgba(43,24,19,0.03)" stroke-width="1"/>
          <line x1="30" y1="90" x2="${width-30}" y2="90" stroke="rgba(43,24,19,0.03)" stroke-width="1"/>
          <line x1="30" y1="${height-30}" x2="${width-30}" y2="${height-30}" stroke="rgba(43,24,19,0.08)" stroke-width="1.5"/>
          
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
        { label: 'Steamed Milk Used', value: 3000 - inventory.steamed_milk, max: 3000, unit: 'ml' },
        { label: 'Coffee Beans Used', value: 3000 - inventory.coffee_beans, max: 3000, unit: 'g' },
        { label: 'Matcha Powder Used', value: 500 - inventory.matcha_powder, max: 500, unit: 'g' },
        { label: 'Whipped Cream Used', value: 1000 - inventory.whipped_cream, max: 1000, unit: 'ml' }
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
          item.style.borderBottom = '1px solid rgba(43,24,19,0.03)';
          item.innerHTML = `
            <div style="display:flex; flex-direction:column;">
              <span style="font-size:12px; font-weight:600; color:var(--primary-brand);">${bill.customerName} (${bill.orderId})</span>
              <span style="font-size:10px; color:var(--text-muted);">${bill.dateTime}</span>
            </div>
            <span style="font-size:13px; font-weight:700; color:var(--accent-caramel);">₹${bill.total}</span>
          `;
          ledgerList.appendChild(item);
        });
      }
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
            body { font-family: 'Segoe UI', Roboto, sans-serif; color: #2B1813; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C98A4A; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #2B1813; }
            .logo span { color: #C98A4A; }
            .title { font-size: 18px; margin: 0; color: #2B1813; }
            .meta { font-size: 12px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background-color: #f7f3ed; color: #2B1813; font-weight: 600; }
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
            body { font-family: 'Segoe UI', Roboto, sans-serif; color: #2B1813; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e74c3c; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #2B1813; }
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
        const guestName = b.customerName.replace(/,/g, '');
        const phone = b.customerPhone || 'N/A';
        const dateStr = b.dateTime.replace(/,/g, '');
        const itemsList = b.items.map(i => `${i.name} (x${i.qty})`).join('; ').replace(/,/g, '');
        csvContent += `${b.orderId},${guestName},${phone},${dateStr},${b.orderType},${b.paymentMethod},₹${b.subtotal},₹${b.discount},₹${b.gst},₹${b.total},${itemsList}\n`;
      });

      const totalRevenue = filteredBills.reduce((sum, b) => sum + b.total, 0);
      const totalGST = filteredBills.reduce((sum, b) => sum + b.gst, 0);
      const totalDiscount = filteredBills.reduce((sum, b) => sum + b.discount, 0);
      const totalSubtotal = filteredBills.reduce((sum, b) => sum + b.subtotal, 0);

      const payUPI = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'UPI').reduce((sum, b) => sum + b.total, 0);
      const payCard = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CARD').reduce((sum, b) => sum + b.total, 0);
      const payCash = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CASH').reduce((sum, b) => sum + b.total, 0);

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

      const totalRevenue = filteredBills.reduce((sum, b) => sum + b.total, 0);
      const totalGST = filteredBills.reduce((sum, b) => sum + b.gst, 0);
      const totalDiscount = filteredBills.reduce((sum, b) => sum + b.discount, 0);
      const totalSubtotal = filteredBills.reduce((sum, b) => sum + b.subtotal, 0);
      
      const payUPI = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'UPI').reduce((sum, b) => sum + b.total, 0);
      const payCard = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CARD').reduce((sum, b) => sum + b.total, 0);
      const payCash = filteredBills.filter(b => (b.paymentMethod || 'UPI').toUpperCase() === 'CASH').reduce((sum, b) => sum + b.total, 0);
      
      let rowsHTML = '';
      filteredBills.forEach(b => {
        const itemsList = b.items.map(i => `${i.name} (x${i.qty})`).join(', ');
        rowsHTML += `
          <tr>
            <td>${b.orderId}</td>
            <td><strong>${b.customerName}</strong><br><span style="font-size:10px; color:#666;">${b.customerPhone || 'Walk-in'}</span></td>
            <td>${b.dateTime}</td>
            <td>${b.orderType}</td>
            <td>${b.paymentMethod}</td>
            <td align="right">₹${b.subtotal}</td>
            <td align="right">₹${b.discount}</td>
            <td align="right">₹${b.total}</td>
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
            body { font-family: 'Segoe UI', Roboto, sans-serif; color: #2B1813; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C98A4A; padding-bottom: 15px; margin-bottom: 20px; }
            .logo { font-size: 24px; font-weight: bold; color: #2B1813; }
            .logo span { color: #C98A4A; }
            .title { font-size: 18px; margin: 0; color: #2B1813; }
            .meta { font-size: 12px; color: #666; }
            
            .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .kpi-card { background: #fdfbf7; border: 1px solid rgba(201, 138, 74, 0.2); border-radius: 8px; padding: 12px; text-align: center; }
            .kpi-card h3 { margin: 0; font-size: 12px; color: #666; text-transform: uppercase; }
            .kpi-card p { margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: #2B1813; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 12px; }
            th { background-color: #f7f3ed; color: #2B1813; font-weight: 600; }
            
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
              <p class="meta" style="font-weight:bold; color: #C98A4A;">` + rangeStr + `</p>
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
            <div class="kpi-card" style="background:#f7f0e8; border-color:#C98A4A;">
              <h3>Net Sales Revenue</h3>
              <p style="color:#C98A4A; font-size: 20px;">₹` + totalRevenue + `</p>
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
          <span style="font-size:24px; display:block; margin-bottom:8px;">${item.icon || '☕'}</span>
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
        if (formPanel && window.innerWidth <= 768) {
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
      <select class="recipe-ing-select" required style="flex:2; padding:6px; border-radius:6px; border:1px solid rgba(43,24,19,0.15); font-size:12px; background:white; color:var(--primary-brand);">
        ${optionsHTML}
      </select>
      <input type="number" class="recipe-ing-qty" placeholder="Qty" value="${qtyValue}" required min="0.1" step="any" style="width:70px; padding:6px; border-radius:6px; border:1px solid rgba(43,24,19,0.15); text-align:center; font-size:12px; background:white; color:var(--primary-brand); font-weight:700;">
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

      localStorage.setItem('doppio_menu', JSON.stringify(menu));
      menuEditorForm.reset();
      document.getElementById('edit-item-index').value = '';
      document.getElementById('form-panel-title').textContent = 'Add New Menu Item';
      if (recipeIngredientsList) recipeIngredientsList.innerHTML = '';

      // On mobile, close the editor drawer after save
      const savedFormPanel = document.getElementById('editor-form-panel');
      if (savedFormPanel && window.innerWidth <= 768) savedFormPanel.classList.remove('active');

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
      if (fp && window.innerWidth <= 768) fp.classList.remove('active');
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
      if (formPanel && window.innerWidth <= 768) {
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
      crmData = JSON.parse(localCRM);
      renderCRMTab();
    }
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

  if (crmSearchInput) crmSearchInput.addEventListener('input', renderCRMTab);

  function checkLoyaltyMember() {
    if (!custNameInput || !custPhoneInput || !loyaltyStatusBox) return;
    const name = custNameInput.value.trim().toLowerCase();
    const phone = custPhoneInput.value.trim();
    
    localStorage.setItem('doppio_cart_cust_name', custNameInput.value);
    localStorage.setItem('doppio_cart_cust_phone', custPhoneInput.value);

    if (!name && !phone) {
      loyaltyStatusBox.style.display = 'none';
      updateCartTotalsOnly();
      return;
    }
    
    const match = crmData.find(c => (phone && c.phone === phone) || (name && c.name.toLowerCase() === name));
    
    if (match) {
      const tier = getLoyaltyTier(match.total_spend);
      const rate = businessProfile.loyaltyRate !== undefined ? businessProfile.loyaltyRate : 10;
      
      loyaltyStatusBox.innerHTML = `
        <div style="font-weight: 700; color: var(--accent-caramel); margin-bottom: 2px;">
          <i class="fa-solid fa-crown"></i> Loyalty Member Found!
        </div>
        <strong>${match.name}</strong> (${match.phone || 'No Phone'})<br>
        Visits: <strong>${match.visits}</strong> &nbsp;|&nbsp; Total Spent: <strong>₹${match.total_spend}</strong><br>
        Tier: <span style="font-weight:700; text-transform:uppercase;">${tier}</span>
        ${match.visits >= 1 ? `<br><span style="color:#2ecc71; font-weight:700;">★ Repeat customer: ${rate}% discount applied!</span>` : ''}
      `;
      loyaltyStatusBox.style.display = 'block';
    } else {
      loyaltyStatusBox.style.display = 'none';
    }
    updateCartTotalsOnly();
  }

  if (custNameInput) custNameInput.addEventListener('input', checkLoyaltyMember);
  if (custPhoneInput) custPhoneInput.addEventListener('input', checkLoyaltyMember);

  // Collapsible Customer Details Toggle Banner for Takeaway Cart
  const guestToggleBtn = document.getElementById('guest-toggle-btn');
  const takeawayFields = document.querySelector('.takeaway-fields');
  const guestToggleIndicator = document.getElementById('guest-toggle-indicator');
  
  if (guestToggleBtn && takeawayFields) {
    guestToggleBtn.addEventListener('click', () => {
      if (takeawayFields.style.display === 'none') {
        takeawayFields.style.display = 'block';
        if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide';
        guestToggleBtn.style.background = 'rgba(201, 138, 74, 0.05)';
        guestToggleBtn.style.borderColor = 'rgba(201, 138, 74, 0.2)';
      } else {
        takeawayFields.style.display = 'none';
        if (guestToggleIndicator) guestToggleIndicator.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Add Info';
        guestToggleBtn.style.background = 'var(--bg-cream-light)';
        guestToggleBtn.style.borderColor = 'rgba(43,24,19,0.06)';
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

  function parseBillDate(dateStr) {
    if (!dateStr) return new Date();
    // Defensive check: if dateStr is an object (i.e. a bill), extract the dateTime string
    if (typeof dateStr === 'object') {
      if (dateStr.dateTime) dateStr = dateStr.dateTime;
      else return new Date();
    }
    
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

  function getActivePeriodBills() {
    const searchVal = (taxSearchInput ? taxSearchInput.value : '').trim().toLowerCase();
    const fromVal = taxDateFrom ? taxDateFrom.value : '';
    const toVal = taxDateTo ? taxDateTo.value : '';
    
    let fromDate = fromVal ? new Date(fromVal) : null;
    if (fromDate) fromDate.setHours(0,0,0,0);
    
    let toDate = toVal ? new Date(toVal) : null;
    if (toDate) toDate.setHours(23,59,59,999);
    
    return bills.filter(b => {
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
    filteredBills.sort((a, b) => parseBillDate(b.dateTime) - parseBillDate(a.dateTime));
    
    let netSales = 0;
    let totalTax = 0;
    let cgst = 0;
    let sgst = 0;
    
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
    let sql = `-- DOPPIO CAFE SUPABASE INTEGRATION SCRIPT
-- Generated on ${new Date().toLocaleString('en-IN')}
-- Compatible with Supabase Postgres SQL Editor

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
      a.download = `doppio_supabase_bills_${new Date().toISOString().slice(0, 10)}.json`;
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
      a.download = `doppio_supabase_bills_${new Date().toISOString().slice(0, 10)}.csv`;
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
      a.download = `doppio_supabase_bills_sync_${new Date().toISOString().slice(0, 10)}.sql`;
      a.click();
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
    const crmTabLinks = document.querySelectorAll('[data-tab="crm-tab"]');
    const taxTabLinks = document.querySelectorAll('[data-tab="tax-tab"]');
    const takeawayFields = document.querySelector('.takeaway-fields');
    
    const isCrm = businessProfile.crmEnabled !== false;
    const isTax = businessProfile.taxEnabled !== false;
    
    crmTabLinks.forEach(link => {
      link.style.display = isCrm ? 'flex' : 'none';
    });
    
    taxTabLinks.forEach(link => {
      link.style.display = isTax ? 'flex' : 'none';
    });
    
    if (takeawayFields) {
      takeawayFields.style.display = isCrm ? 'block' : 'none';
    }
    
    const activeTabLink = document.querySelector('.sidebar-link.active');
    if (activeTabLink) {
      const activeTabId = activeTabLink.getAttribute('data-tab');
      if ((activeTabId === 'crm-tab' && !isCrm) || (activeTabId === 'tax-tab' && !isTax)) {
        const posLink = document.querySelector('[data-tab="pos-tab"]');
        if (posLink) posLink.click();
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

  function openProfileModal() {
    if (!profileModal) return;
    
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
    
    // Module Feature Toggles
    document.getElementById('profile-crm-enabled').checked = businessProfile.crmEnabled !== false;
    document.getElementById('profile-tax-enabled').checked = businessProfile.taxEnabled !== false;
    
    profileModal.classList.add('active');
    updateReceiptSimulator();
  }

  if (openProfileBtn) openProfileBtn.addEventListener('click', openProfileModal);
  if (closeProfileModal) closeProfileModal.addEventListener('click', () => profileModal.classList.remove('active'));
  if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', () => profileModal.classList.remove('active'));

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
      
      const lockEl = document.getElementById('profile-lock-enabled');
      const passcodeLockEnabled = lockEl ? lockEl.checked : false;

      businessProfile = { 
        name, address, phone, 
        gstEnabled, gstRate, 
        loyaltyEnabled, loyaltyRate, 
        passcodeLockEnabled, 
        crmEnabled, taxEnabled,
        soundEnabled
      };
      localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));

      applyFeatureToggles();

      // Reload cloud tables upserts
      if (supabaseClient) {
        supabaseClient.from('doppio_business_profile').upsert({
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
          tax_enabled: taxEnabled
        }, { onConflict: 'id' }).then();
      }

      profileModal.classList.remove('active');
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

  function checkAdminPin() {
    if (!adminPinInput) return;
    if (adminPinInput.value === '1006') {
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

  function verifyLockPIN() {
    if (enteredLockPin === '1006') {
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
      billsTableContainer.style.display = window.innerWidth <= 768 ? 'none' : '';
    }
    mobileCardsContainer.style.display = window.innerWidth <= 768 ? 'block' : 'none';
    if (window.innerWidth > 768) return;

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
        border: 1px solid rgba(43,24,19,0.08);
        border-radius: 14px;
        padding: 14px 16px;
        margin-bottom: 10px;
        box-shadow: 0 2px 8px rgba(43,24,19,0.06);
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
          <button class="table-action-btn print" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(43,24,19,0.12); background:var(--bg-cream-light); color:var(--primary-brand); font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-solid fa-print"></i> Print
          </button>
          <button class="table-action-btn whatsapp" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(37,211,102,0.25); background:rgba(37,211,102,0.06); color:#25D366; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
            <i class="fa-brands fa-whatsapp"></i> Share
          </button>
          <button class="table-action-btn edit-bill" data-id="${bill.orderId}" style="flex:1; padding:8px; font-size:12px; border-radius:8px; border:1px solid rgba(201,138,74,0.3); background:rgba(201,138,74,0.08); color:var(--accent-caramel); font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
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
      draftOrders = JSON.parse(localDrafts);
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
      draftCard.style.cssText = 'border: 1px solid rgba(201, 138, 74, 0.2); border-radius: 10px; padding: 12px; background: #fff; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease; margin-bottom: 8px;';
      
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
    
    if (badge) {
      const dot = badge.querySelector('.status-dot');
      if (isOffline) {
        if (dot) dot.className = 'status-dot red';
        if (text) text.textContent = 'Offline Mode (Local)';
      } else {
        if (dot) dot.className = 'status-dot green';
        if (text) text.textContent = 'Supabase Live';
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
  };

});
