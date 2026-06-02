/**
 * Doppio Cafe - Premium Interactive Web Platform
 * Contains the custom 2D Canvas Physics Engine and the Complete Rupee-Priced Interactive Menu Database
 */

window.addEventListener('DOMContentLoaded', () => {

  // Initialize Supabase Client (Made by Antigravity)
  let supabaseClient = null;
  const DEFAULT_SUPABASE_URL = 'https://htkauiibuejetimfiavs.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk';

  if (typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
      console.log("Supabase initialized successfully on Customer side");
    } catch (err) {
      console.error("Supabase fail to initialize on Customer side:", err);
    }
  }
  
  // ==========================================
  // 1. DYNAMIC INTERACTIVE MENU DATABASE
  // ==========================================
  const menuData = [
    // COLD COFFEE
    { name: 'Iced Latte', description: 'Creamy chilled latte served over ice.', price: '₹249', category: 'COLD COFFEE', icon: '🥛' },
    { name: 'Iced Americano', description: 'Strong refreshing black iced coffee.', price: '₹229', category: 'COLD COFFEE', icon: '🧊' },
    { name: 'Irish Coffee', description: 'Rich creamy coffee topped with whipped cream.', price: '₹279', category: 'COLD COFFEE', icon: '🥃' },
    { name: 'Mocha Frappe', description: 'Chocolate blended cold coffee with whipped cream.', price: '₹279', category: 'COLD COFFEE', icon: '🍫' },
    { name: 'Doppio Signature Frappe', description: 'Signature creamy frappe with chocolate toppings.', price: '₹298', category: 'COLD COFFEE', icon: '☕' },
    { name: 'Iced Caramel Macchiato', description: 'Sweet caramel layered iced coffee.', price: '₹279', category: 'COLD COFFEE', icon: '🍯' },
    { name: 'Hazelnut Frappe', description: 'Nutty creamy blended coffee.', price: '₹279', category: 'COLD COFFEE', icon: '🌰' },
    { name: 'Espresso Ginger Ale', description: 'Espresso mixed with sparkling ginger ale.', price: '₹279', category: 'COLD COFFEE', icon: '🥤' },
    { name: 'Classic Frappe', description: 'Smooth creamy cold coffee frappe.', price: '₹279', category: 'COLD COFFEE', icon: '🍦' },

    // HOT COFFEE
    { name: 'Doppio', description: 'Double shot hot espresso with rich crema.', price: '₹219', category: 'HOT COFFEE', icon: '☕' },
    { name: 'Espresso', description: 'Strong concentrated black coffee shot.', price: '₹189', category: 'HOT COFFEE', icon: '☕' },
    { name: 'Cappuccino', description: 'Frothy coffee with latte art.', price: '₹229', category: 'HOT COFFEE', icon: '🎨' },
    { name: 'Cafe Latte', description: 'Smooth creamy latte with milk foam art.', price: '₹229', category: 'HOT COFFEE', icon: '🥛' },
    { name: 'Flat White', description: 'Velvety smooth milk coffee.', price: '₹229', category: 'HOT COFFEE', icon: '☕' },
    { name: 'Affogato', description: 'Espresso poured over vanilla ice cream.', price: '₹279', category: 'HOT COFFEE', icon: '🍨' },
    { name: 'Americano', description: 'Smooth black coffee.', price: '₹209', category: 'HOT COFFEE', icon: '☕' },
    { name: 'Cortado', description: 'Espresso balanced with warm milk.', price: '₹229', category: 'HOT COFFEE', icon: '🥃' },
    { name: 'Caramel Macchiato', description: 'Creamy caramel flavored coffee.', price: '₹249', category: 'HOT COFFEE', icon: '🍯' },
    { name: 'Doppio Hot Chocolate', description: 'Warm signature hot chocolate.', price: '₹229', category: 'HOT COFFEE', icon: '🍫' },
    { name: 'Cafe Mocha', description: 'Perfect mix of espresso, chocolate, and milk.', price: '₹269', category: 'HOT COFFEE', icon: '☕' },
    { name: 'Classic Hot Chocolate', description: 'Traditional creamy rich hot chocolate.', price: '₹349', category: 'HOT COFFEE', icon: '🍫' },

    // MATCHA
    { name: 'Iced Matcha Latte', description: 'Refreshing creamy green tea latte over ice.', price: '₹329', category: 'MATCHA', icon: '🍵' },
    { name: 'Matcha Latte', description: 'Warm creamy matcha drink.', price: '₹329', category: 'MATCHA', icon: '🍵' },
    { name: 'Iced Strawberry Matcha', description: 'Strawberry and matcha layered drink.', price: '₹349', category: 'MATCHA', icon: '🍓' },
    { name: 'Iced Vanilla Matcha', description: 'Sweet vanilla infused matcha drink.', price: '₹329', category: 'MATCHA', icon: '🌿' },
    { name: 'Mango Matcha', description: 'Tropical mango and matcha fusion.', price: '₹349', category: 'MATCHA', icon: '🥭' },

    // FRIES & SHARE PLATES
    { name: 'Fries Salted', description: 'Crispy salted french fries.', price: '₹249', category: 'FRIES & SHARE PLATES', icon: '🍟' },
    { name: 'Fries Peri Peri', description: 'Spicy peri peri seasoned fries.', price: '₹269', category: 'FRIES & SHARE PLATES', icon: '🌶️' },
    { name: 'Fries Loaded', description: 'Cheese loaded fries.', price: '₹279', category: 'FRIES & SHARE PLATES', icon: '🧀' },
    { name: 'Potato Wedges Classic', description: 'Crispy potato wedges with dip.', price: '₹249', category: 'FRIES & SHARE PLATES', icon: '🥔' },
    { name: 'Potato Wedges Loaded', description: 'Cheese and sauce loaded wedges.', price: '₹279', category: 'FRIES & SHARE PLATES', icon: '🍟' },
    { name: 'Hot Chicken Wings', description: 'Crispy spicy hot chicken wings.', price: '₹329', category: 'FRIES & SHARE PLATES', icon: '🍗' },
    { name: 'Chicken Pops', description: 'Bite-sized crispy chicken pops.', price: '₹299', category: 'FRIES & SHARE PLATES', icon: '🍿' },
    { name: 'Chicken Nuggets', description: 'Classic delicious golden chicken nuggets.', price: '₹299', category: 'FRIES & SHARE PLATES', icon: '🍗' },
    { name: 'Chicken Finger', description: 'Crispy golden fried chicken fingers.', price: '₹299', category: 'FRIES & SHARE PLATES', icon: '🍗' },

    // MOCKTAILS
    { name: 'Mojito', description: 'Chilled mint and lime mocktail.', price: '₹329', category: 'MOCKTAILS', icon: '🍹' },
    { name: 'Green Apple Soda', description: 'Refreshing sparkling green apple infusion.', price: '₹329', category: 'MOCKTAILS', icon: '🍏' },
    { name: 'Blue Lagoon', description: 'Tropical sweet and sour blue mocktail.', price: '₹329', category: 'MOCKTAILS', icon: '🥤' },
    { name: 'Spicy Guava Mojito', description: 'Spiced guava mixed with mint and lime.', price: '₹329', category: 'MOCKTAILS', icon: '🌶️' },
    { name: 'Lemon Iced Tea', description: 'Classic refreshing sweetened lemon iced tea.', price: '₹329', category: 'MOCKTAILS', icon: '🍋' },
    { name: 'Litchi and Lime Granita', description: 'Shaved ice dessert with litchi and lime.', price: '₹329', category: 'MOCKTAILS', icon: '🍧' },
    { name: 'Strawberry Granita', description: 'Iced strawberry blend.', price: '₹329', category: 'MOCKTAILS', icon: '🍓' },
    { name: 'Spicy Mango Martini', description: 'Zesty mango mocktail with a hint of chili spice.', price: '₹329', category: 'MOCKTAILS', icon: '🍸' },

    // SANDWICHES
    { name: 'Bombay Grilled Sandwich', description: 'Indian style grilled vegetable sandwich.', price: '₹369', category: 'SANDWICHES', icon: '🥪' },
    { name: 'Cheese Corn Grilled Sandwich', description: 'Grilled sandwich stuffed with cheese and corn.', price: '₹329', category: 'SANDWICHES', icon: '🌽' },
    { name: 'Cheese Chilli Sandwich', description: 'Spicy cheese sandwich toasted perfectly.', price: '₹349', category: 'SANDWICHES', icon: '🌶️' },

    // THICK SHAKES
    { name: 'Nutella Thickshake', description: 'Thick chocolate hazelnut milkshake.', price: '₹299', category: 'THICK SHAKES', icon: '🍫' },
    { name: 'Oreo Cookies Thickshake', description: 'Oreo loaded creamy shake.', price: '₹299', category: 'THICK SHAKES', icon: '🍪' },
    { name: 'Salted Caramel Thickshake', description: 'Sweet caramel creamy shake.', price: '₹299', category: 'THICK SHAKES', icon: '🍯' },
    { name: 'Strawberry Thickshake', description: 'Fresh strawberry creamy shake.', price: '₹299', category: 'THICK SHAKES', icon: '🍓' },
    { name: 'Mango Smoothie', description: 'Tropical mango smoothie.', price: '₹299', category: 'THICK SHAKES', icon: '🥭' },
    { name: 'Kids Mnm Shake', description: 'Fun colorful M&M candy milkshake.', price: '₹299', category: 'THICK SHAKES', icon: '🍬' },

    // CLASSIC TOAST
    { name: 'Cheese Garlic', description: 'Garlic bread with melted cheese.', price: '₹249', category: 'CLASSIC TOAST', icon: '🧄' },
    { name: 'Chilli Cheese Garlic', description: 'Spicy garlic cheese toast.', price: '₹259', category: 'CLASSIC TOAST', icon: '🌶️' },
    { name: 'Cheese Corn Toast', description: 'Toast topped with cheese and corn.', price: '₹289', category: 'CLASSIC TOAST', icon: '🌽' },
    { name: 'Cheese Mushroom Toast', description: 'Toast topped with mushroom and cheese.', price: '₹329', category: 'CLASSIC TOAST', icon: '🍄' },

    // EGGS
    { name: 'Classic Cheese Omelette', description: 'Soft fluffy cheese omelette.', price: '₹247', category: 'EGGS', icon: '🍳' },
    { name: 'Garden Omelette', description: 'Veggie stuffed omelette with toast.', price: '₹295', category: 'EGGS', icon: '🥗' },
    { name: 'Masala Omelette', description: 'Indian spiced omelette.', price: '₹269', category: 'EGGS', icon: '🌶️' },
    { name: 'Butter Garlic Egg', description: 'Garlic butter tossed egg dish.', price: '₹279', category: 'EGGS', icon: '🧄' },

    // APPETIZERS
    { name: 'Classic Nachos', description: 'Nachos served with cheese dip.', price: '₹298', category: 'APPETIZERS', icon: '🧀' },
    { name: 'Loaded Nachos', description: 'Nachos loaded with salsa and cheese.', price: '₹269', category: 'APPETIZERS', icon: '🌶️' },

    // COMBOS
    { name: 'Swiggy Combo1', description: 'Premium combo tailored for Swiggy users.', price: '₹420', category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo2', description: 'Luxury platter meal combination.', price: '₹600', category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo3', description: 'Signature double-pack combo.', price: '₹530', category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo4', description: 'Family snack and sip sharing combo.', price: '₹500', category: 'COMBOS', icon: '🍱' },
    { name: 'Swiggy Combo5', description: 'Perfect light breakfast pairing combo.', price: '₹430', category: 'COMBOS', icon: '🍱' },

    // PASTA
    { name: 'Alfredo Pennei Pasta', description: 'Creamy rich Alfredo white sauce penne pasta.', price: '₹499', category: 'PASTA', icon: '🍝' }
  ];

  // Fetch menuData dynamically from Supabase if available (Made by Antigravity)
  if (supabaseClient) {
    supabaseClient.from('doppio_menu').select('*')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          console.log("Dynamically loaded menu from Supabase:", data);
          const dbMenuMapped = data.map(item => ({
            name: item.name,
            description: item.description || '',
            price: `₹${item.price}`,
            category: item.category,
            icon: item.icon || '☕',
            bestseller: item.bestseller || false
          }));
          
          // Replace static array contents with cloud values
          menuData.length = 0;
          dbMenuMapped.forEach(i => menuData.push(i));
          
          // Re-render menu
          renderMenu();
        } else {
          console.log("Supabase menu fetch empty or error. Using local fallback.");
        }
      });
  }

  // Render Menu Function
  const menuGrid = document.getElementById('menu-grid');
  const searchInput = document.getElementById('menu-search');
  const filterContainer = document.getElementById('menu-filters');

  let activeCategory = 'ALL';
  let searchQuery = '';

  function renderMenu() {
    if (!menuGrid) return;
    menuGrid.innerHTML = '';

    const filteredItems = menuData.filter(item => {
      const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    if (filteredItems.length === 0) {
      menuGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-mug-hot" style="font-size: 40px; margin-bottom: 15px; display: block; color: var(--accent-caramel);"></i>
          <p>No delicious items found matching your filter.</p>
        </div>
      `;
      return;
    }

    filteredItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'menu-item-card';

      const imageHTML = item.image 
        ? `<img src="${item.image}" alt="${item.name}">`
        : `<div class="menu-item-placeholder">
             ${item.icon}
             <span>Doppio Cafe</span>
           </div>`;

      card.innerHTML = `
        <div class="menu-item-image">
          ${imageHTML}
        </div>
        <div class="menu-item-details">
          <div class="menu-item-header">
            <h3 class="menu-item-title">${item.name}</h3>
            <span class="menu-item-price">${item.price}</span>
          </div>
          <p class="menu-item-desc">${item.description}</p>
          <div class="menu-item-footer">
            <span class="menu-item-category">${item.category}</span>
            <button class="menu-item-order-btn" data-name="${item.name}" title="Add to Order">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>
      `;
      menuGrid.appendChild(card);
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderMenu();
    });
  }

  if (filterContainer) {
    filterContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        activeCategory = e.target.getAttribute('data-category');
        renderMenu();
      }
    });
  }

  renderMenu();

  // ==========================================
  // 2. HIGH FIDELITY PHYSICS CANVAS LOOP
  // ==========================================
  const canvas = document.getElementById('physics-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const mouse = {
    x: null,
    y: null,
    radius: 120,
    active: false,
    vx: 0,
    vy: 0,
    lastX: null,
    lastY: null
  };

  canvas.parentElement.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;
    
    if (mouse.lastX !== null && mouse.lastY !== null) {
      mouse.vx = newX - mouse.lastX;
      mouse.vy = newY - mouse.lastY;
    }
    
    mouse.x = newX;
    mouse.y = newY;
    mouse.lastX = newX;
    mouse.lastY = newY;
    mouse.active = true;
  });

  canvas.parentElement.addEventListener('mouseleave', () => {
    mouse.active = false;
    mouse.x = null;
    mouse.y = null;
    mouse.lastX = null;
    mouse.lastY = null;
    mouse.vx = 0;
    mouse.vy = 0;
  });

  class CoffeeBean {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.radius = Math.random() * 8 + 10;
      this.aspectRatio = 1.4;
      this.mass = this.radius * 1.5;
      this.vx = (Math.random() - 0.5) * 1.5;
      this.vy = (Math.random() - 0.5) * 1.5;
      this.angle = Math.random() * Math.PI * 2;
      this.angularVelocity = (Math.random() - 0.5) * 0.02;
      this.color = Math.random() > 0.4 ? '#4E3629' : '#3E2723';
      this.creaseColor = '#271206';
    }

    update() {
      this.angle += this.angularVelocity;

      if (mouse.active && mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * force * 4;
          const pushY = Math.sin(angle) * force * 4;
          
          this.vx += pushX;
          this.vy += pushY;
          this.vx += mouse.vx * 0.05 * force;
          this.vy += mouse.vy * 0.05 * force;
          this.angularVelocity += (Math.random() - 0.5) * 0.03 * force;
        }
      }

      this.vy += 0.005;
      
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 8) {
        this.vx = (this.vx / speed) * 8;
        this.vy = (this.vy / speed) * 8;
      }

      this.vx *= 0.99;
      this.vy *= 0.99;
      this.angularVelocity *= 0.98;

      this.x += this.vx;
      this.y += this.vy;

      const buffer = this.radius * this.aspectRatio;
      
      if (this.x < buffer) {
        this.x = buffer;
        this.vx = Math.abs(this.vx) * 0.8;
      } else if (this.x > canvas.width - buffer) {
        this.x = canvas.width - buffer;
        this.vx = -Math.abs(this.vx) * 0.8;
      }

      if (this.y < buffer) {
        this.y = buffer;
        this.vy = Math.abs(this.vy) * 0.8;
      } else if (this.y > canvas.height - buffer) {
        this.y = canvas.height - buffer;
        this.vy = -Math.abs(this.vy) * 0.8;
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;

      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius * this.aspectRatio, this.radius, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'transparent';

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.ellipse(0, -this.radius * 0.2, this.radius * 0.8 * this.aspectRatio, this.radius * 0.5, 0, 0, Math.PI, true);
      ctx.fill();

      ctx.strokeStyle = this.creaseColor;
      ctx.lineWidth = this.radius * 0.15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.radius * this.aspectRatio * 0.85, 0);
      ctx.bezierCurveTo(
        -this.radius * 0.3, -this.radius * 0.2, 
        this.radius * 0.3, this.radius * 0.2, 
        this.radius * this.aspectRatio * 0.85, 0
      );
      ctx.stroke();

      ctx.restore();
    }
  }

  class SteamParticle {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.size = Math.random() * 15 + 10;
      this.speedY = -(Math.random() * 0.6 + 0.4);
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.opacity = 1;
      this.fadeRate = Math.random() * 0.003 + 0.002;
      this.angle = Math.random() * Math.PI * 2;
      this.wobbleSpeed = Math.random() * 0.02 + 0.01;
      this.wobbleRange = Math.random() * 0.3 + 0.1;
    }

    update() {
      this.y += this.speedY;
      this.angle += this.wobbleSpeed;
      this.x += Math.sin(this.angle) * this.wobbleRange;

      if (mouse.active && mouse.x !== null && mouse.y !== null) {
        const dx = this.x - mouse.x;
        const dy = this.y - mouse.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < mouse.radius * 0.8) {
          const force = (mouse.radius * 0.8 - distance) / (mouse.radius * 0.8);
          this.x += mouse.vx * 0.15 * force;
          this.y += mouse.vy * 0.15 * force;
        }
      }

      this.opacity -= this.fadeRate;
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.opacity * 0.15;
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      grad.addColorStop(0, 'rgba(245, 235, 224, 0.8)');
      grad.addColorStop(1, 'rgba(245, 235, 224, 0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const beans = [];
  const steamParticles = [];

  const initialBeansCount = 20;
  for (let i = 0; i < initialBeansCount; i++) {
    beans.push(new CoffeeBean(
      Math.random() * canvas.width,
      Math.random() * canvas.height
    ));
  }

  function getSteamSource() {
    return {
      x: canvas.width * 0.52,
      y: canvas.height * 0.58
    };
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const source = getSteamSource();
    if (steamParticles.length < 80 && Math.random() < 0.25) {
      steamParticles.push(new SteamParticle(
        source.x + (Math.random() - 0.5) * 40,
        source.y + (Math.random() - 0.5) * 10
      ));
    }

    for (let i = steamParticles.length - 1; i >= 0; i--) {
      const p = steamParticles[i];
      p.update();
      if (p.opacity <= 0 || p.y < 0) {
        steamParticles.splice(i, 1);
      } else {
        p.draw();
      }
    }

    beans.forEach(bean => {
      bean.update();
      bean.draw();
    });

    requestAnimationFrame(loop);
  }

  loop();

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    for (let i = 0; i < 3; i++) {
      const b = new CoffeeBean(x, y);
      b.vx = (Math.random() - 0.5) * 6;
      b.vy = (Math.random() - 0.5) * 6;
      beans.push(b);
    }
  });

  // ==========================================
  // 3. STAFF LOGIN PORTAL LOGIC
  // ==========================================
  const loginBtn = document.getElementById('cta-reserve');
  const loginModal = document.getElementById('login-modal');
  const loginClose = document.getElementById('login-close');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  if (loginBtn && loginModal) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loginModal.classList.add('active');
    });
  }

  if (loginClose && loginModal) {
    loginClose.addEventListener('click', () => {
      loginModal.classList.remove('active');
      if (loginError) loginError.style.display = 'none';
    });
  }

  async function sha256(string) {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value.trim();

      const userVal = username.toLowerCase();
      const hashPwd = await sha256(password);

      if ((userVal === 'bonie' && hashPwd === '94fc8a8d6e4987e5698d49128da76928b31e8059839cad4b933f53f4b2635eda') || 
          (userVal === 'staff' && hashPwd === '10176e7b7b24d317acfcf8d2064cfd2f24e154f7b5a96603077d5ef813d6a6b6')) {
        sessionStorage.setItem('just_logged_in', 'true');
        sessionStorage.setItem('logged_in_user', username);
        window.location.href = 'dashboard.html';
      } else {
        if (loginError) loginError.style.display = 'block';
      }
    });
  }

  // Password Visibility Eye Toggle
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('login-password');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        togglePasswordBtn.classList.remove('fa-eye');
        togglePasswordBtn.classList.add('fa-eye-slash');
        togglePasswordBtn.style.color = 'var(--accent-caramel)';
      } else {
        passwordInput.type = 'password';
        togglePasswordBtn.classList.remove('fa-eye-slash');
        togglePasswordBtn.classList.add('fa-eye');
        togglePasswordBtn.style.color = 'var(--text-muted)';
      }
    });
  }

  // ==========================================
  // 4. REAL VISITOR COUNTER LOGIC (MADE BY CODEARC)
  // ==========================================
  const visitCountEl = document.getElementById('visit-count');
  if (visitCountEl) {
    // A. Fetch or initialize local base visitor count
    let baseCount = localStorage.getItem('doppio_visitor_count');
    if (!baseCount) {
      baseCount = 10482; // Start with a realistic, premium traffic base
      localStorage.setItem('doppio_visitor_count', baseCount);
    } else {
      baseCount = parseInt(baseCount, 10);
    }

    // B. Session validation to increment once per session
    let hasCounted = sessionStorage.getItem('doppio_counted_session');
    if (!hasCounted) {
      baseCount += 1;
      localStorage.setItem('doppio_visitor_count', baseCount);
    }

    // C. Format count with commas (e.g., 10,483)
    function formatCount(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    visitCountEl.textContent = formatCount(baseCount);

    // D. Multi-device sync counter API integration
    try {
      // If we haven't counted this session yet, hit the "up" counter endpoint (increments by 1)
      // Otherwise, query the static counter value so we don't spam fake counts on refreshes
      const endpoint = !hasCounted 
        ? 'https://api.counterapi.dev/v1/doppiocafe/global/up/' 
        : 'https://api.counterapi.dev/v1/doppiocafe/global/';

      fetch(endpoint)
        .then(response => response.json())
        .then(data => {
          const countVal = data.count || data.value;
          if (typeof countVal !== 'undefined') {
            const cloudValue = parseInt(countVal, 10);
            const finalCount = 10480 + cloudValue;
            visitCountEl.textContent = formatCount(finalCount);
            localStorage.setItem('doppio_visitor_count', finalCount);
            
            // Mark session as counted after successful cloud sync
            sessionStorage.setItem('doppio_counted_session', 'true');
          }
        })
        .catch(err => {
          console.log("Cloud Counter API offline, using local visitor simulation.", err);
          if (!hasCounted) {
            sessionStorage.setItem('doppio_counted_session', 'true');
          }
        });
    } catch (e) {
      console.log("Counter API call error", e);
    }
  }

  // ==========================================================
  // 5. CUSTOMER QR SELF-ORDER ENGINE & BROADCAST SYNC
  // ==========================================================
  let custCart = [];
  const broadcastChannel = new BroadcastChannel('doppio_qr_orders');

  // DOM Elements for Customer Cart Drawer
  const floatCartBtn = document.getElementById('customer-floating-cart');
  const cartBadgeCount = document.getElementById('cart-badge-count');
  const cartBtnTotal = document.getElementById('cart-btn-total');
  const cartDrawer = document.getElementById('customer-cart-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const customerCartItems = document.getElementById('customer-cart-items');
  const custSubtotal = document.getElementById('cust-subtotal');
  const custGstEl = document.getElementById('cust-gst');
  const custTotal = document.getElementById('cust-total');
  const checkoutSubmitBtn = document.getElementById('checkout-submit-btn');

  // Inputs
  const custOrderName = document.getElementById('cust-order-name');
  const custOrderPhone = document.getElementById('cust-order-phone');
  const custOrderTable = document.getElementById('cust-order-table');
  const drawerTableBadge = document.getElementById('drawer-table-badge');
  const tableSelectGroup = document.getElementById('table-select-group');

  // Payment Simulation Modal Elements
  const upiModal = document.getElementById('upi-payment-modal');
  const closeUpiModal = document.getElementById('upi-modal-close');
  const upiAmountVal = document.getElementById('upi-amount-val');
  const upiQrImage = document.getElementById('upi-qr-image');
  const simPaySuccessBtn = document.getElementById('sim-pay-success');
  const simPayCounterBtn = document.getElementById('sim-pay-counter');

  // Success Screen Elements
  const successScreen = document.getElementById('order-success-screen');
  const receiptTable = document.getElementById('receipt-table');
  const receiptId = document.getElementById('receipt-id');
  const receiptItemsList = document.getElementById('receipt-items-list');
  const receiptTotalPaid = document.getElementById('receipt-total-paid');
  const successDoneBtn = document.getElementById('success-done-btn');
  const successSubtitleText = document.getElementById('success-subtitle-text');

  // Load locked table number from URL search parameters (e.g. ?table=3)
  const urlParams = new URLSearchParams(window.location.search);
  const tableParam = urlParams.get('table');
  let lockedTableNum = null;

  const isCaptainMode = urlParams.get('captain') === 'true' || urlParams.get('waiter') === 'true';

  if (isCaptainMode) {
    // Inject floating captain bar programmatically
    const bar = document.createElement('div');
    bar.id = 'captain-header-bar';
    bar.style.position = 'fixed';
    bar.style.top = '0';
    bar.style.left = '0';
    bar.style.right = '0';
    bar.style.height = '60px';
    bar.style.background = 'rgba(43, 24, 19, 0.95)';
    bar.style.backdropFilter = 'blur(10px)';
    bar.style.borderBottom = '2px solid var(--accent-caramel)';
    bar.style.zIndex = '9999';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.style.padding = '0 16px';
    bar.style.boxShadow = '0 2px 10px rgba(43,24,19,0.25)';
    bar.style.fontFamily = 'Outfit, sans-serif';
    bar.style.color = '#fff';
    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <i class="fa-solid fa-user-tie" style="color:var(--accent-caramel); font-size:18px;"></i>
        <div style="display:flex; flex-direction:column;">
          <span style="font-weight:800; color:var(--accent-caramel); font-size:13px; line-height:1.2;">CAPTAIN STATION</span>
          <span style="font-size:9px; color:rgba(255,255,255,0.7);">Take table orders directly</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.8);">Active Table:</span>
        <select id="captain-table-select" style="background:#fff; border:1.5px solid var(--accent-caramel); padding:5px 8px; border-radius:8px; font-size:12px; font-weight:800; color:var(--primary-brand); outline:none;">
          <option value="Takeaway">Takeaway</option>
          <option value="1">Table 01</option>
          <option value="2">Table 02</option>
          <option value="3">Table 03</option>
          <option value="4">Table 04</option>
          <option value="5">Table 05</option>
          <option value="6">Table 06</option>
          <option value="7">Table 07</option>
          <option value="8">Table 08</option>
          <option value="9">Table 09</option>
          <option value="10">Table 10</option>
        </select>
      </div>
    `;
    document.body.appendChild(bar);
    document.body.style.paddingTop = '60px';

    // Hide normal table selector
    if (tableSelectGroup) {
      tableSelectGroup.style.display = 'none';
    }

    // Bind captain selector to order fields
    setTimeout(() => {
      const capSelect = document.getElementById('captain-table-select');
      if (capSelect) {
        capSelect.addEventListener('change', (e) => {
          if (custOrderTable) {
            custOrderTable.value = e.target.value;
          }
          if (drawerTableBadge) {
            if (e.target.value === 'Takeaway') {
              drawerTableBadge.textContent = 'Takeaway';
            } else {
              drawerTableBadge.textContent = 'Table ' + (parseInt(e.target.value) < 10 ? '0' + e.target.value : e.target.value);
            }
            drawerTableBadge.style.display = 'inline-block';
          }
        });
        // If there's a table in url, select it
        if (tableParam) {
          capSelect.value = tableParam.trim();
        }
        capSelect.dispatchEvent(new Event('change'));
      }
    }, 100);

    // Lock cashier inputs
    if (custOrderName) {
      custOrderName.value = "Waiter Captain";
      custOrderName.readOnly = true;
    }
    if (custOrderPhone) {
      custOrderPhone.value = "9999999999";
      custOrderPhone.readOnly = true;
    }
  } else {
    if (tableParam) {
      lockedTableNum = tableParam.trim();
      if (custOrderTable) {
        custOrderTable.value = lockedTableNum;
      }
      if (drawerTableBadge) {
        drawerTableBadge.textContent = 'Table ' + (parseInt(lockedTableNum) < 10 ? '0' + lockedTableNum : lockedTableNum);
        drawerTableBadge.style.display = 'inline-block';
      }
      if (tableSelectGroup) {
        tableSelectGroup.style.display = 'none';
      }
    }
    // Pre-populate customer name and phone from localStorage
    if (custOrderName) custOrderName.value = localStorage.getItem('cust_self_name') || '';
    if (custOrderPhone) custOrderPhone.value = localStorage.getItem('cust_self_phone') || '';
  }

  // Event Listeners for Cart Drawer Toggle
  if (floatCartBtn) {
    floatCartBtn.addEventListener('click', () => toggleCartDrawer(true));
  }
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => toggleCartDrawer(false));
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', () => toggleCartDrawer(false));
  }

  function toggleCartDrawer(open) {
    playSynthesizerBeep(open ? 440 : 330, 0.1); // A4 for open, E4 for close
    if (open) {
      cartDrawer.classList.add('open');
      renderCustomerCart();
    } else {
      cartDrawer.classList.remove('open');
    }
  }

  // Add Item delegation on dynamic Menu Cards
  if (menuGrid) {
    menuGrid.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.menu-item-order-btn');
      if (!addBtn) return;
      
      const itemName = addBtn.getAttribute('data-name');
      const itemData = menuData.find(item => item.name === itemName);
      if (itemData) {
        addToCustomerCart(itemData);
      }
    });
  }

  function addToCustomerCart(item) {
    const numericPrice = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
    const existing = custCart.find(i => i.name === item.name);
    
    if (existing) {
      existing.qty += 1;
    } else {
      custCart.push({
        name: item.name,
        price: numericPrice,
        qty: 1,
        icon: item.icon || '☕',
        category: item.category,
        size: 'Regular',
        sugar: 'Regular',
        ice: 'Regular',
        toppings: [],
        notes: ''
      });
    }

    playSynthesizerBeep(659.25, 0.12); // E5 for adding items
    
    // Update badge count and trigger float bar slide-in
    updateCustomerFloatingBadge();
    
    // Animate the float button briefly
    if (floatCartBtn) {
      floatCartBtn.style.transform = 'scale(1.15)';
      setTimeout(() => {
        floatCartBtn.style.transform = 'none';
      }, 200);
    }
  }

  function updateCustomerFloatingBadge() {
    const totalQty = custCart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = custCart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    if (totalQty > 0) {
      if (cartBadgeCount) cartBadgeCount.textContent = totalQty;
      if (cartBtnTotal) cartBtnTotal.textContent = `₹${subtotal}`;
      if (floatCartBtn) floatCartBtn.classList.add('active');
    } else {
      if (floatCartBtn) floatCartBtn.classList.remove('active');
    }
  }

  function updateCustomerCartQty(name, delta) {
    const item = custCart.find(i => i.name === name);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
      custCart = custCart.filter(i => i.name !== name);
      playSynthesizerBeep(261.63, 0.15); // C4 for removal
    } else {
      playSynthesizerBeep(delta > 0 ? 523.25 : 392.00, 0.08); // C5 or G4
    }

    renderCustomerCart();
    updateCustomerFloatingBadge();
  }

  function renderCustomerCart() {
    if (!customerCartItems) return;
    customerCartItems.innerHTML = '';

    if (custCart.length === 0) {
      customerCartItems.innerHTML = `
        <div class="empty-cust-cart">
          <i class="fa-solid fa-basket-shopping"></i>
          <p>Your basket is empty.<br>Select premium items to begin ordering!</p>
        </div>
      `;
      if (custSubtotal) custSubtotal.textContent = '₹0';
      if (custGstEl) custGstEl.textContent = '₹0';
      if (custTotal) custTotal.textContent = '₹0';
      return;
    }

    custCart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cust-cart-row';
      row.innerHTML = `
        <div class="cust-cart-item-info">
          <span class="cust-cart-item-name">${item.icon} ${item.name}</span>
          <span class="cust-cart-item-price">₹${item.price} each</span>
        </div>
        <div class="cust-cart-controls">
          <button class="cust-qty-btn decrease" data-name="${item.name}"><i class="fa-solid fa-minus"></i></button>
          <span class="cust-cart-qty">${item.qty}</span>
          <button class="cust-qty-btn increase" data-name="${item.name}"><i class="fa-solid fa-plus"></i></button>
        </div>
        <span class="cust-cart-total-item">₹${item.price * item.qty}</span>
      `;
      customerCartItems.appendChild(row);
    });

    // Subtotal & GST inclusive calculations
    const subtotal = custCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const gstIncluded = Math.round(subtotal * 0.1525); // ~18% included GST
    const total = subtotal;

    if (custSubtotal) custSubtotal.textContent = `₹${subtotal - gstIncluded}`;
    if (custGstEl) custGstEl.textContent = `₹${gstIncluded}`;
    if (custTotal) custTotal.textContent = `₹${total}`;

    // Add event listeners to quantity buttons
    customerCartItems.querySelectorAll('.cust-qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = btn.getAttribute('data-name');
        const isIncrease = btn.classList.contains('increase');
        updateCustomerCartQty(name, isIncrease ? 1 : -1);
      });
    });
  }

  // Audio Synthesizer Chime
  function playSynthesizerBeep(frequency, duration) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.log("Audio synthesized block pending user page interaction.", e);
    }
  }

  // Checkout submission to UPI QR simulation
  if (checkoutSubmitBtn) {
    checkoutSubmitBtn.addEventListener('click', () => {
      if (custCart.length === 0) {
        alert('Your cart is empty!');
        return;
      }

      const nameVal = custOrderName.value.trim();
      const phoneVal = custOrderPhone.value.trim();
      const tableVal = custOrderTable.value;

      if (!nameVal) {
        alert('Please fill out your name to place the order.');
        custOrderName.focus();
        return;
      }

      if (!tableVal) {
        alert('Please select your Table Number or Takeaway.');
        custOrderTable.focus();
        return;
      }

      // Store in localStorage
      localStorage.setItem('cust_self_name', nameVal);
      localStorage.setItem('cust_self_phone', phoneVal);

      // Lock totals
      const totalAmount = custCart.reduce((sum, item) => sum + (item.price * item.qty), 0);

      // UPI deep link generation
      // pay.doppiocafe@oksbi is the merchant VPA
      const upiUrl = `upi://pay?pa=pay.doppiocafe@oksbi&pn=Doppio%20Cafe%20Nagpur&am=${totalAmount}&cu=INR&tn=Table_${tableVal}_Order`;
      
      // Dynamic High-Fidelity QR Code Generator URL via open QRServer API
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
      
      if (upiAmountVal) upiAmountVal.textContent = `₹${totalAmount}`;
      if (upiQrImage) upiQrImage.src = qrApiUrl;

      // Close Cart Drawer and Open UPI Modal
      toggleCartDrawer(false);
      
      if (isCaptainMode) {
        dispatchCustomerOrder('Captain App');
        return;
      }
      
      if (upiModal) {
        playSynthesizerBeep(523.25, 0.1); // C5
        upiModal.classList.add('open');
      }
    });
  }

  if (closeUpiModal) {
    closeUpiModal.addEventListener('click', () => {
      if (upiModal) upiModal.classList.remove('open');
    });
  }

  // Simulation actions: Instant UPI Success
  if (simPaySuccessBtn) {
    simPaySuccessBtn.addEventListener('click', () => {
      dispatchCustomerOrder('UPI');
    });
  }

  // Simulation actions: Pay Cash at Counter
  if (simPayCounterBtn) {
    simPayCounterBtn.addEventListener('click', () => {
      dispatchCustomerOrder('Cash (Counter)');
    });
  }

  function dispatchCustomerOrder(payMethod) {
    const nameVal = custOrderName.value.trim();
    const phoneVal = custOrderPhone.value.trim();
    const tableVal = custOrderTable.value;
    const subtotal = custCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const gst = Math.round(subtotal * 0.1525);

    const randomIdSuffix = Math.floor(1000 + Math.random() * 9000);
    const generatedOrderId = `DO-QR-${randomIdSuffix}`;
    const timestamp = new Date().toLocaleString('en-IN');

    // Create the finalized Order Object matching standard sales records
    const orderObject = {
      orderId: generatedOrderId,
      customerName: nameVal,
      customerPhone: phoneVal || 'Dine-in Customer',
      dateTime: timestamp,
      items: JSON.parse(JSON.stringify(custCart)),
      subtotal: subtotal,
      discount: 0,
      gst: gst,
      total: subtotal,
      paymentMethod: payMethod,
      orderType: tableVal === 'Takeaway' ? 'Takeaway' : 'Dine-in',
      tableNumber: tableVal,
      status: payMethod === 'Captain App' ? 'Accepted' : 'Pending Review'
    };

    // 1. Sync via Supabase Database (Real-time Cloud Sync) (Made by Antigravity)
    if (supabaseClient) {
      supabaseClient.from('doppio_pending_orders').insert({
        orderId: generatedOrderId,
        customerName: nameVal,
        customerPhone: phoneVal || 'Dine-in Customer',
        dateTime: timestamp,
        items: JSON.stringify(custCart),
        subtotal: subtotal,
        discount: 0,
        gst: gst,
        total: subtotal,
        paymentMethod: payMethod,
        orderType: tableVal === 'Takeaway' ? 'Takeaway' : 'Dine-in',
        tableNumber: tableVal,
        status: payMethod === 'Captain App' ? 'Accepted' : 'Pending Review'
      }).then(({ error }) => {
        if (error) console.error("Error inserting pending QR order to Supabase:", error);
        else console.log("Pending QR order successfully uploaded to Supabase!");
      });
    }

    // 2. Sync via BroadcastChannel for instant local tab sync
    try {
      broadcastChannel.postMessage({
        type: 'NEW_QR_ORDER',
        order: orderObject
      });
      console.log('Order successfully broadcasted:', orderObject);
    } catch (e) {
      console.error('BroadcastChannel failed, using storage fallback', e);
    }

    // 3. Storage backup fallback
    const pendingQueue = JSON.parse(localStorage.getItem('doppio_pending_qr_orders')) || [];
    pendingQueue.push(orderObject);
    localStorage.setItem('doppio_pending_qr_orders', JSON.stringify(pendingQueue));

    // Close UPI gateway
    if (upiModal) upiModal.classList.remove('open');

    if (isCaptainMode) {
      // Synthesize Success chimes: major arpeggio
      setTimeout(() => playSynthesizerBeep(523.25, 0.15), 0);   // C5
      setTimeout(() => playSynthesizerBeep(659.25, 0.15), 100); // E5
      setTimeout(() => playSynthesizerBeep(783.99, 0.15), 200); // G5
      setTimeout(() => playSynthesizerBeep(1046.50, 0.3), 300); // C6
      
      // Confetti physics particle explosion!
      setTimeout(launchSuccessConfetti, 250);
      
      alert(`Success! Captain Order ${generatedOrderId} sent directly to Kitchen.`);
      
      // Clear Cart
      custCart = [];
      localStorage.removeItem('cust_cart');
      renderCustomerCart();
      updateCustomerFloatingBadge();
      
      // Close Cart Drawer
      toggleCartDrawer(false);
      return;
    }

    // Open Success Receipt Screen
    if (successScreen) {
      successScreen.classList.add('open');
      
      // Prefill receipt elements
      if (receiptTable) {
        receiptTable.textContent = tableVal === 'Takeaway' ? 'Takeaway Order' : `Table ${parseInt(tableVal) < 10 ? '0' + tableVal : tableVal}`;
      }
      if (receiptId) receiptId.textContent = `Order ID: ${generatedOrderId}`;
      if (receiptTotalPaid) receiptTotalPaid.textContent = `₹${subtotal}`;
      
      if (successSubtitleText) {
        successSubtitleText.textContent = payMethod === 'UPI' 
          ? 'UPI Payment Verified & Received!' 
          : 'Pending payment logged. Pay cash at counter!';
      }

      if (receiptItemsList) {
        receiptItemsList.innerHTML = '';
        custCart.forEach(item => {
          const row = document.createElement('div');
          row.className = 'receipt-item-row';
          row.innerHTML = `
            <span>${item.name} x${item.qty}</span>
            <span>₹${item.price * item.qty}</span>
          `;
          receiptItemsList.appendChild(row);
        });
      }

      // Synthesize Success chimes: major arpeggio
      setTimeout(() => playSynthesizerBeep(523.25, 0.15), 0);   // C5
      setTimeout(() => playSynthesizerBeep(659.25, 0.15), 100); // E5
      setTimeout(() => playSynthesizerBeep(783.99, 0.15), 200); // G5
      setTimeout(() => playSynthesizerBeep(1046.50, 0.3), 300); // C6

      // Confetti physics particle explosion!
      setTimeout(launchSuccessConfetti, 250);
    }
  }

  // Confetti Physics loop
  function launchSuccessConfetti() {
    const canvas = document.getElementById('success-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const colors = ['#C88A58', '#E5BA73', '#2C1B18', '#FAF4EE', '#2ecc71', '#3498db', '#e74c3c'];
    const particles = [];

    // Create 130 random velocity particles bursting upwards from center
    for (let i = 0; i < 130; i++) {
      particles.push({
        x: width / 2,
        y: height / 2 - 40,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.85) * 16 - 6,
        r: Math.random() * 6 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1
      });
    }

    function runLoop() {
      ctx.clearRect(0, 0, width, height);
      let isAlive = false;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28; // gravity force
        p.vx *= 0.98; // wind resistance
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.007;

        if (p.opacity > 0) {
          isAlive = true;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation * Math.PI / 180);
          ctx.fillStyle = p.color;

          // Draw squares/circles
          if (p.r % 2 === 0) {
            ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 1.5);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });

      if (isAlive) {
        requestAnimationFrame(runLoop);
      }
    }

    runLoop();
  }

  // Done button on success screen restarts menu
  if (successDoneBtn) {
    successDoneBtn.addEventListener('click', () => {
      if (successScreen) successScreen.classList.remove('open');
      
      // Clear Cart completely
      custCart = [];
      updateCustomerFloatingBadge();
      
      // Scroll smoothly to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Listen for Live Table Reject status changes from the cashier dashboard
  const tableRejectChannel = new BroadcastChannel('doppio_qr_order_status');
  tableRejectChannel.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'QR_ORDER_REJECTED') {
      const order = e.data.order;
      // Alert the customer if they are viewing the page
      if (localStorage.getItem('cust_self_name') === order.customerName) {
        alert(`Attention: Your order (${order.orderId}) has been rejected or cancelled by the cashier. Please verify details at the counter.`);
      }
    }
  });

  // End self-ordering code block

});
