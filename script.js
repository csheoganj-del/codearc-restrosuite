/**
 * Doppio Cafe - Premium Interactive Web Platform
 * Contains the custom 2D Canvas Physics Engine and the Complete Rupee-Priced Interactive Menu Database
 */

window.addEventListener('DOMContentLoaded', () => {
  
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
            <button class="menu-item-order-btn" title="Add to Order">
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

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value.trim();

      if (username === 'bonie' && password === 'diva123') {
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
        ? 'https://api.counterapi.dev/v1/doppiocafe/global/up' 
        : 'https://api.counterapi.dev/v1/doppiocafe/global';

      fetch(endpoint)
        .then(response => response.json())
        .then(data => {
          if (data && data.value) {
            const cloudValue = data.value;
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
});
