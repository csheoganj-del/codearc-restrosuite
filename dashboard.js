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
    passcodeLockEnabled: false
  };

  let cart = [];
  let selectedPaymentMethod = 'UPI';
  let activeOrderType = 'Takeaway';

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
        document.getElementById('supabase-sync-text').innerHTML = 'Supabase Live';
        syncWithSupabase();
        setupSupabaseRealtime();
      } catch (err) {
        console.error("Supabase failed:", err);
      }
    } else {
      document.getElementById('supabase-sync-text').innerHTML = 'Offline Mode';
    }
  }

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
      
      SoundEffects.playClick();
      
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      tabTitle.textContent = link.textContent.trim();
      
      if (tabId === 'pos-tab') tabSubtitle.textContent = 'Default Tab: Selection Grid';
      else if (tabId === 'bills-tab') {
        tabSubtitle.textContent = 'Print, Refund, or Duplicate Receipts';
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

  function renderCart() {
    if (!cartList) return;
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
    const phoneInput = document.getElementById('cust-phone');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';
    const nameInput = document.getElementById('cust-name');
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
      renderCart();
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
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (cart.length === 0) {
        alert('Cart is empty! Add items before checking out.');
        return;
      }

      const custNameInput = document.getElementById('cust-name');
      const custName = (custNameInput && custNameInput.value.trim()) || 'Walk-in Guest';
      const orderNum = document.getElementById('order-num').value;

      // 1. Stock Deduction Verification
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

      // Deduct stock levels
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

      // Compile new bill invoice
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
      localStorage.setItem('doppio_bills', JSON.stringify(bills));
      
      // CRM dynamic ledger upgrades
      if (phoneVal || (custName && custName !== 'Walk-in Guest')) {
        updateCRMMember(custName, phoneVal, total);
      }
      
      SoundEffects.playSuccess();

      // Cloud syncing
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

      // Print thermal invoice triggers
      triggerThermalReceiptPrint(newBill);

      // Clean Cart Drawer
      cart = [];
      if (custNameInput) custNameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (loyaltyStatusBox) loyaltyStatusBox.style.display = 'none';
      
      generateOrderNumber();
      renderCart();
      updateHeaderSummaryStats();
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
          <button class="table-action-btn duplicate" data-id="${bill.orderId}" title="Duplicate Order"><i class="fa-solid fa-clone"></i></button>
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
      } else if (btn.classList.contains('duplicate')) {
        // Load items back into active POS cart for cashier speed!
        SoundEffects.playPop();
        cart = [...bills[idx].items];
        document.getElementById('cust-name').value = bills[idx].customerName;
        document.getElementById('cust-phone').value = bills[idx].customerPhone || '';
        renderCart();
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

    let itemsRows = '';
    bill.items.forEach(item => {
      let configLabel = '';
      if (item.size && item.size !== 'Small') configLabel += `[${item.size.charAt(0)}] `;
      if (item.notes) configLabel += `(${item.notes})`;

      itemsRows += `
        <tr>
          <td style="padding:3px 0;">${item.name}<br><span style="font-size:8px; color:#555;">${configLabel}</span></td>
          <td style="text-align:center;">${item.qty}</td>
          <td style="text-align:right;">₹${item.price * item.qty}</td>
        </tr>
      `;
    });

    el.innerHTML = `
      <div style="text-align:center; text-transform:uppercase; font-weight:700; font-size:12px;">${businessProfile.name}</div>
      <div style="text-align:center; font-size:9px;">${businessProfile.address}</div>
      <div style="text-align:center; font-size:9px; margin-bottom:8px;">Phone: ${businessProfile.phone}</div>
      <div style="border-bottom:1px dashed #000; margin-bottom:6px;"></div>
      
      <div style="font-size:9px; margin-bottom:6px; display:flex; justify-content:space-between;">
        <span>Bill: ${bill.orderId}</span>
        <span>Mode: ${bill.paymentMethod}</span>
      </div>
      <div style="font-size:9px; margin-bottom:6px;">Date: ${bill.dateTime}</div>
      <div style="font-size:9px; margin-bottom:6px; margin-bottom:8px;">Guest: ${bill.customerName}</div>
      <div style="border-bottom:1px dashed #000; margin-bottom:6px;"></div>
      
      <table style="width:100%; font-size:9px; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px dashed #000;">
            <th style="text-align:left; padding-bottom:4px;">Item</th>
            <th style="text-align:center; padding-bottom:4px;">Qty</th>
            <th style="text-align:right; padding-bottom:4px;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      
      <div style="border-bottom:1px dashed #000; margin-top:6px; margin-bottom:6px;"></div>
      
      <div style="font-size:9px; text-align:right; line-height:1.4;">
        Subtotal: ₹${bill.subtotal}<br>
        Taxes & GST: ₹${bill.gst}<br>
        <span style="font-weight:700; font-size:11px;">Grand Total: ₹${bill.total}</span>
      </div>
      
      <div style="border-bottom:1px dashed #000; margin-top:6px; margin-bottom:6px;"></div>
      <div style="text-align:center; font-size:8px; margin-top:8px;">
        Thank you for choosing Doppio Cafe!<br>
        Visit us again. Nagpur branch.
      </div>
    `;

    window.print();
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
              <p class="meta">Generated: \${new Date().toLocaleString('en-IN')}</p>
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
              \${rowsHTML}
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
        const itemsList = b.items.map(i => `\${i.name} (x\${i.qty})`).join('; ').replace(/,/g, '');
        csvContent += `\${b.orderId},\${guestName},\${phone},\${dateStr},\${b.orderType},\${b.paymentMethod},₹\${b.subtotal},₹\${b.discount},₹\${b.gst},₹\${b.total},\${itemsList}\n`;
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `doppio_sales_report_\${new Date().toISOString().slice(0,10)}.csv`);
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
      
      let rowsHTML = '';
      filteredBills.forEach(b => {
        const itemsList = b.items.map(i => `\${i.name} (x\${i.qty})`).join(', ');
        rowsHTML += `
          <tr>
            <td>\${b.orderId}</td>
            <td><strong>\${b.customerName}</strong><br><span style="font-size:10px; color:#666;">\${b.customerPhone || 'Walk-in'}</span></td>
            <td>\${b.dateTime}</td>
            <td>\${b.orderType}</td>
            <td>\${b.paymentMethod}</td>
            <td align="right">₹\${b.subtotal}</td>
            <td align="right">₹\${b.discount}</td>
            <td align="right">₹\${b.total}</td>
          </tr>
          <tr>
            <td colspan="8" style="background-color:#fff; padding: 4px 10px; font-size:11px; color:#555; border-top:none;">
              <strong>Items:</strong> \${itemsList}
            </td>
          </tr>
        `;
      });

      const rangeStr = fromVal || toVal 
        ? `Period: \${fromVal ? fromVal : 'Beginning'} to \${toVal ? toVal : 'Present'}`
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
              <p class="meta" style="font-weight:bold; color: #C98A4A;">\${rangeStr}</p>
              <p class="meta">Generated: \${new Date().toLocaleString('en-IN')}</p>
            </div>
          </div>
          <div class="kpis">
            <div class="kpi-card">
              <h3>Total Orders</h3>
              <p>\${filteredBills.length}</p>
            </div>
            <div class="kpi-card">
              <h3>Gross Subtotal</h3>
              <p>₹\${totalSubtotal}</p>
            </div>
            <div class="kpi-card">
              <h3>GST Tax Collected</h3>
              <p>₹\${totalGST}</p>
            </div>
            <div class="kpi-card" style="background:#f7f0e8; border-color:#C98A4A;">
              <h3>Net Sales Revenue</h3>
              <p style="color:#C98A4A; font-size: 20px;">₹\${totalRevenue}</p>
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
              \${filteredBills.length === 0 ? '<tr><td colspan="8" align="center">No transactions recorded for this period.</td></tr>' : rowsHTML}
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
    
    if (!name && !phone) {
      loyaltyStatusBox.style.display = 'none';
      renderCart();
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
    renderCart();
  }

  if (custNameInput) custNameInput.addEventListener('input', checkLoyaltyMember);
  if (custPhoneInput) custPhoneInput.addEventListener('input', checkLoyaltyMember);

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
    document.getElementById('profile-lock-enabled').checked = businessProfile.passcodeLockEnabled || false;
    
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

  if (profileNameInput) profileNameInput.addEventListener('input', updateReceiptSimulator);
  if (profileAddrInput) profileAddrInput.addEventListener('input', updateReceiptSimulator);
  if (profilePhoneInput) profilePhoneInput.addEventListener('input', updateReceiptSimulator);
  if (profileGstCheck) profileGstCheck.addEventListener('change', updateReceiptSimulator);
  if (profileGstRate) profileGstRate.addEventListener('input', updateReceiptSimulator);

  function updateReceiptSimulator() {
    const simName = document.getElementById('receipt-preview-store-name');
    const simAddr = document.getElementById('receipt-preview-address');
    const simPhone = document.getElementById('receipt-preview-phone');
    const simTaxLine = document.getElementById('receipt-preview-tax-line');

    if (simName) simName.textContent = (profileNameInput ? profileNameInput.value : '') || 'DOPPIO CAFE';
    if (simAddr) simAddr.textContent = (profileAddrInput ? profileAddrInput.value : '') || 'London Street, Nagpur';
    if (simPhone) simPhone.textContent = `Ph: ${(profilePhoneInput ? profilePhoneInput.value : '') || '+91 91300 03177'}`;

    const taxEnabled = profileGstCheck ? profileGstCheck.checked : true;
    const taxRate = parseFloat(profileGstRate ? profileGstRate.value : 18) || 0;
    
    if (simTaxLine) {
      simTaxLine.textContent = taxEnabled ? `GST (${taxRate}%): ₹46.62` : 'GST (0%): ₹0.00';
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
      const passcodeLockEnabled = document.getElementById('profile-lock-enabled').checked;

      businessProfile = { name, address, phone, gstEnabled, gstRate, loyaltyEnabled, loyaltyRate, passcodeLockEnabled };
      localStorage.setItem('doppio_business_profile', JSON.stringify(businessProfile));

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
          passcode_lock_enabled: passcodeLockEnabled
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
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    
    playPop() {
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

  // ==========================================
  // 17. GLOBAL TERMINAL LOCK SCREEN CONTROLLER (1006)
  // ==========================================
  const pageLockOverlay = document.getElementById('page-lock-overlay');
  const lockPasscodeInput = document.getElementById('lock-passcode-input');
  const lockPasscodeError = document.getElementById('lock-passcode-error');
  const lockKeypadButtons = document.querySelectorAll('.lock-pin-btn');

  let enteredLockPin = '';

  // Check if user just logged in from index.html Staff Portal to bypass reload lock
  const passcodeEnabled = businessProfile.passcodeLockEnabled === true;
  const justLoggedIn = sessionStorage.getItem('just_logged_in') === 'true';

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
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      SoundEffects.playClick();
      
      const tabId = link.getAttribute('data-tab');
      
      mobileNavLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      const desktopSidebarLinks = document.querySelectorAll('.sidebar-link');
      desktopSidebarLinks.forEach(l => {
        l.classList.remove('active');
        if (l.getAttribute('data-tab') === tabId) {
          l.classList.add('active');
        }
      });

      const tabs = document.querySelectorAll('.tab-content');
      tabs.forEach(t => t.classList.remove('active'));
      
      const targetTab = document.getElementById(tabId);
      if (targetTab) targetTab.classList.add('active');
    });
  });

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

});
