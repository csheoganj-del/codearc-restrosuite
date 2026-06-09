(function() {
    'use strict';

    const TOUR_KEY = 'restrosuite_tour_done';

    const ALL_STEPS = [
      {
        target: null, // Welcome screen — no spotlight
        label: 'Welcome',
        icon: '✨',
        featureIcon: '🏪',
        title: 'Welcome to RestoSuite!',
        subtitle: 'Your Complete Restaurant OS',
        desc: "Let's walk you through every feature of your new dashboard. This quick tour covers all active modules. Use the arrows or keyboard ← → to navigate."
      },
      {
        target: '.sidebar-link[data-tab="pos-tab"]',
        label: 'Takeaway POS',
        icon: '☕',
        featureIcon: '🛒',
        title: 'Takeaway POS',
        subtitle: 'Fast Checkout at the Counter',
        desc: "Your main billing screen. Browse your menu, tap items to add them to cart, choose Takeaway / Dine-In / Delivery, apply loyalty discounts, and print a thermal receipt — all in seconds."
      },
      {
        target: '.sidebar-link[data-tab="qr-orders-tab"]',
        label: 'Live QR Orders',
        icon: '📱',
        featureIcon: '📲',
        title: 'Live Table Orders',
        subtitle: 'Self-Service QR Dine-In',
        desc: "Customers scan the QR code at their table, browse your menu on their phone, and submit orders directly to you. Orders appear here live — approve them to send to the Kitchen KDS instantly."
      },
      {
        target: '.sidebar-link[data-tab="online-tab"]',
        label: 'Online Integrations',
        icon: '🚚',
        featureIcon: '🌐',
        title: 'Online Integrations',
        subtitle: 'Swiggy / Zomato / WhatsApp',
        desc: "Connect your Swiggy & Zomato storefronts or take WhatsApp delivery orders. Incoming orders flow into a single queue so you never miss an order from any channel."
      },
      {
        target: '.sidebar-link[data-tab="kds-tab"]',
        label: 'Kitchen KDS',
        icon: '🖥️',
        featureIcon: '🍳',
        title: 'Kitchen Display Screen',
        subtitle: 'Real-Time KDS for the Kitchen',
        desc: "Mount a screen in the kitchen. Every new order ticket appears here in real-time with item-level status. Kitchen staff mark items ready — the system auto-clears completed tickets and alerts the counter."
      },
      {
        target: '.sidebar-link[data-tab="tokens-tab"]',
        label: 'Token Board',
        icon: '🎫',
        featureIcon: '🎟️',
        title: 'Live Token Board',
        subtitle: 'Order Readiness Display',
        desc: "A public-facing screen for customers. Shows order numbers divided into 'Preparing' and 'Please Collect' sections to manage crowd flows professionally."
      },
      {
        target: '.sidebar-link[data-tab="bills-tab"]',
        label: 'Bills',
        icon: '🧾',
        featureIcon: '📊',
        title: 'Bills Management',
        subtitle: 'Every Invoice, Every Sale',
        desc: "Browse the full sales history. Search by order ID, customer name, or phone. Edit, reprint, refund, or export bills. Summary cards show daily revenue, order count, and AOV at a glance."
      },
      {
        target: '.sidebar-link[data-tab="inventory-tab"]',
        label: 'Inventory',
        icon: '📦',
        featureIcon: '🏭',
        title: 'Inventory Control',
        subtitle: 'Stock & Batch Management',
        desc: "Track every ingredient, stock level, and expiry batch. Low-stock alerts fire automatically. Add purchase batches, set minimum thresholds, and view a complete ingredient usage log."
      },
      {
        target: '.sidebar-link[data-tab="reports-tab"]',
        label: 'Reports',
        icon: '📈',
        featureIcon: '📉',
        title: 'Sales Reports & Analytics',
        subtitle: 'Business Intelligence Hub',
        desc: "Visual charts of daily, weekly, and monthly revenue. Top-selling items, hourly heatmaps, payment method splits, and GST tax summaries — all exportable to Excel with one click."
      },
      {
        target: '.sidebar-link[data-tab="editor-tab"]',
        label: 'Menu Editor',
        icon: '✏️',
        featureIcon: '📝',
        title: 'Menu Editor',
        subtitle: 'Build Your Full Menu Here',
        desc: "Add, edit, or delete menu items. Set name, category, price, emoji icon, and description. Changes sync to the POS and QR ordering system instantly — no reload needed."
      },
      {
        target: '.sidebar-link[data-tab="crm-tab"]',
        label: 'CRM & Loyalty',
        icon: '💎',
        featureIcon: '👥',
        title: 'CRM & Loyalty Program',
        subtitle: 'Customer Relationships',
        desc: "Every customer who gives their phone number gets a loyalty profile. Track visit count, total spend, and loyalty points. Send WhatsApp thank-you messages and birthday offers automatically."
      },
      {
        target: '.sidebar-link[data-tab="tax-tab"]',
        label: 'Tax Management',
        icon: '🧮',
        featureIcon: '💸',
        title: 'Tax Management',
        subtitle: 'GST & Service Charge Settings',
        desc: "Set up central GST tax slabs (CGST/SGST/IGST), discount policies, service charges, and bill rounding logic to stay compliant with state rules."
      },
      {
        target: '.sidebar-link[data-tab="employees-tab"]',
        label: 'Employees',
        icon: '👔',
        featureIcon: '🏢',
        title: 'Employee Ledger',
        subtitle: 'HR, Payroll & Attendance',
        desc: "Add your staff, set roles and salaries. Track attendance with clock-in/out, manage leave requests, and generate salary slips. Role-based access keeps cashiers from seeing admin data."
      }
    ];

    let steps = [];
    let currentStep = 0;

    function initSteps() {
      steps = ALL_STEPS.filter(step => {
        if (!step.target) return true; // Welcome step is always active
        const el = document.querySelector(step.target);
        if (!el) return false;
        // Check if the sidebar link is visible (i.e. display is not none)
        const style = window.getComputedStyle(el);
        return style.display !== 'none';
      });
    }

    function buildDots() {
      const container = document.getElementById('tour-dots');
      if (!container) return;
      container.innerHTML = '';
      steps.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.style.cssText = `
          width:${i === currentStep ? '20px' : '7px'};
          height:7px; border-radius:10px;
          background:${i === currentStep ? '#FC8019' : i < currentStep ? 'rgba(252,128,25,0.35)' : 'rgba(255,255,255,0.15)'};
          transition:all 0.35s ease; cursor:pointer; flex-shrink:0;
        `;
        dot.onclick = () => goToStep(i);
        container.appendChild(dot);
      });
    }

    function positionSpotlight(targetEl) {
      const spotlight = document.getElementById('onboarding-spotlight');
      if (!spotlight) return;
      if (!targetEl) {
        spotlight.style.cssText = 'display:none;';
        return;
      }
      const rect = targetEl.getBoundingClientRect();
      const pad = 8;
      spotlight.style.cssText = ''; // Clear inline styles
      spotlight.style.display = 'block';
      spotlight.style.left = (rect.left - pad) + 'px';
      spotlight.style.top = (rect.top - pad) + 'px';
      spotlight.style.width = (rect.width + pad * 2) + 'px';
      spotlight.style.height = (rect.height + pad * 2) + 'px';
    }

    function positionCard(targetEl) {
      const card = document.getElementById('onboarding-card');
      if (!card) return;
      const cardW = 350;
      const cardH = card.offsetHeight || 320;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 20;
      const isMobile = vw <= 768;

      if (isMobile) {
        // Mobile layout: position card at top or bottom depending on target location to avoid overlap
        card.style.left = '50%';
        card.style.transform = 'translateX(-50%)';
        card.style.width = 'calc(100vw - 32px)';
        card.style.maxWidth = '380px';
        
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          // If the target is in the lower half of the screen, place card in the upper half
          if (rect.top > vh / 2) {
            card.style.top = '80px';
            card.style.bottom = 'auto';
          } else {
            card.style.bottom = '80px';
            card.style.top = 'auto';
          }
        } else {
          // Centered or bottom for welcome step
          card.style.bottom = '80px';
          card.style.top = 'auto';
        }
        return;
      }

      // Reset mobile styles on desktop
      card.style.width = '350px';
      card.style.maxWidth = '';
      card.style.transform = '';
      card.style.bottom = 'auto';

      if (!targetEl) {
        // Center card for welcome step
        card.style.left = Math.max(pad, (vw - cardW) / 2) + 'px';
        card.style.top = Math.max(pad, (vh - cardH) / 2) + 'px';
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      let left, top;

      // Try to place to the right of the target (sidebar link)
      if (rect.right + pad + cardW < vw) {
        left = rect.right + pad;
        top = Math.max(pad, Math.min(rect.top, vh - cardH - pad));
      }
      // Try to place below
      else if (rect.bottom + pad + cardH < vh) {
        left = Math.max(pad, Math.min(rect.left, vw - cardW - pad));
        top = rect.bottom + pad;
      }
      // Try to place above
      else if (rect.top - pad - cardH > 0) {
        left = Math.max(pad, Math.min(rect.left, vw - cardW - pad));
        top = rect.top - cardH - pad;
      }
      // Fallback: center right
      else {
        left = Math.max(pad, vw - cardW - pad);
        top = Math.max(pad, (vh - cardH) / 2);
      }

      card.style.left = left + 'px';
      card.style.top = top + 'px';
    }

    function goToStep(index) {
      if (steps.length === 0) return;
      currentStep = Math.max(0, Math.min(index, steps.length - 1));
      const step = steps[currentStep];
      const isLast = currentStep === steps.length - 1;

      // Update card content
      document.getElementById('tour-step-icon').textContent = step.icon;
      document.getElementById('tour-step-label').textContent = step.label;
      document.getElementById('tour-feature-icon').textContent = step.featureIcon;
      document.getElementById('tour-title').textContent = step.title;
      document.getElementById('tour-subtitle').textContent = step.subtitle;
      document.getElementById('tour-desc').textContent = step.desc;

      const nextBtn = document.getElementById('tour-next-btn');
      const prevBtn = document.getElementById('tour-prev-btn');
      nextBtn.textContent = isLast ? '🎉 Get Started!' : 'Next →';
      if (isLast) {
        nextBtn.style.background = 'linear-gradient(135deg,#27ae60,#2ecc71)';
        nextBtn.style.boxShadow = '0 4px 14px rgba(46, 204, 113, 0.35)';
      } else {
        nextBtn.style.background = ''; // Use style block gradient
        nextBtn.style.boxShadow = '';
      }
      prevBtn.style.opacity = currentStep === 0 ? '0.3' : '1';
      prevBtn.style.pointerEvents = currentStep === 0 ? 'none' : 'auto';

      buildDots();

      // Find target tab ID
      const tabId = step.target ? step.target.match(/data-tab="([^"]+)"/)?.[1] : null;

      // Programmatically click tab to switch view
      if (tabId) {
        const clickTarget = document.querySelector(`.mobile-bottom-nav [data-tab="${tabId}"]`) || 
                            document.querySelector(`.more-sheet-link[data-tab="${tabId}"]`) || 
                            document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
        if (clickTarget) {
          clickTarget.click();
        }
      }

      // Determine spotlight target element
      let targetEl = null;
      const isMobile = window.innerWidth <= 768;

      if (isMobile && tabId) {
        // On mobile, check if the tab exists in the bottom navigation
        targetEl = document.querySelector(`.mobile-bottom-nav [data-tab="${tabId}"]`);
        // If not in bottom nav, highlight the "More" button instead
        if (!targetEl || window.getComputedStyle(targetEl).display === 'none') {
          targetEl = document.getElementById('mobile-more-btn');
        }
      } else if (step.target) {
        targetEl = document.querySelector(step.target);
      }

      // Highlight sidebar link if on desktop/tablet
      if (!isMobile) {
        document.querySelectorAll('.sidebar-link').forEach(el => {
          el.style.outline = '';
          el.style.outlineOffset = '';
        });
        const desktopSidebarLink = step.target ? document.querySelector(step.target) : null;
        if (desktopSidebarLink && desktopSidebarLink.classList.contains('sidebar-link')) {
          desktopSidebarLink.style.outline = '2px solid rgba(252,128,25,0.8)';
          desktopSidebarLink.style.outlineOffset = '2px';
        }

        // Show/reveal sidebar on mobile/tablet during the step
        if (targetEl && targetEl.classList.contains('sidebar-link')) {
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) sidebar.classList.add('reveal');
        } else {
          const sidebar = document.querySelector('.sidebar');
          if (sidebar) sidebar.classList.remove('reveal');
        }
      }

      // Briefly wait for tab render / transitions before drawing spotlight & card positioning
      setTimeout(() => {
        positionSpotlight(targetEl);
        positionCard(targetEl);
      }, 80);
    }

    window.tourNavigate = function(dir) {
      if (dir > 0 && currentStep === steps.length - 1) {
        window.endOnboardingTour();
        return;
      }
      goToStep(currentStep + dir);
    };

    window.endOnboardingTour = function() {
      try { localStorage.setItem(TOUR_KEY, '1'); } catch(e) {}

      const dashboardApi = window.RestroSuite && window.RestroSuite.dashboard;
      if (dashboardApi && typeof dashboardApi.markTourComplete === 'function') {
        dashboardApi.markTourComplete().catch((error) => {
          console.warn('[Onboarding] Failed to persist tour completion:', error);
        });
      }

      const overlay = document.getElementById('onboarding-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
          overlay.style.display = 'none';
          document.body.classList.remove('onboarding-active');
        }, 400);
      }
      // Collapse sidebar
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.classList.remove('reveal');
      }
    };

    function startTour() {
      const overlay = document.getElementById('onboarding-overlay');
      if (!overlay) return;
      
      initSteps();
      if (steps.length === 0) return;

      document.body.classList.add('onboarding-active');
      overlay.style.display = 'block';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.5s ease';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
      });
      goToStep(0);
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      const overlay = document.getElementById('onboarding-overlay');
      if (!overlay || overlay.style.display === 'none') return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); window.tourNavigate(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); window.tourNavigate(-1); }
      if (e.key === 'Escape') { e.preventDefault(); window.endOnboardingTour(); }
    });

    // Reposition on resize
    window.addEventListener('resize', () => {
      if (document.getElementById('onboarding-overlay')?.style.display !== 'none') {
        const step = steps[currentStep];
        const tabId = step && step.target ? step.target.match(/data-tab="([^"]+)"/)?.[1] : null;
        let targetEl = null;
        const isMobile = window.innerWidth <= 768;

        if (isMobile && tabId) {
          targetEl = document.querySelector(`.mobile-bottom-nav [data-tab="${tabId}"]`) || document.getElementById('mobile-more-btn');
        } else if (step && step.target) {
          targetEl = document.querySelector(step.target);
        }
        positionSpotlight(targetEl);
        positionCard(targetEl);
      }
    });

    // Launch after page fully loads and user is a tenant (not superadmin)
    window.addEventListener('load', function() {
      setTimeout(function() {
        const role = sessionStorage.getItem('logged_in_role');
        if (role === 'superadmin') return;
        
        // 1. Check cloud business profile settings (persistent across devices/sessions)
        try {
          const dashboardApi = window.RestroSuite && window.RestroSuite.dashboard;
          if (dashboardApi && dashboardApi.isTourComplete()) {
            return;
          }
          const storedProf = localStorage.getItem('doppio_business_profile');
          if (storedProf) {
            const parsed = JSON.parse(storedProf);
            if (parsed && parsed.featureFlags && parsed.featureFlags.tourDone) return;
          }
        } catch(e) {}

        // 2. Check local browser cache fallback
        try {
          if (localStorage.getItem(TOUR_KEY)) return; // Already seen tour
        } catch(e) {}
        
        startTour();
      }, 1200); // Wait for Supabase sync to settle first
    });

    // Also expose for manual restart (e.g., from Feature Tour button)
    window.startOnboardingTour = startTour;

  })();
