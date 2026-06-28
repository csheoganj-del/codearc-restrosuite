(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.chain = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  let client = null;

  // Local/Demo mock data stores to preserve state in local mode
  const mockMasterMenu = [
    { sku: "COF-001", name: "Premium Espresso Blend", category: "Beverages", price: 180.00, veg: true, status: "Active" },
    { sku: "COF-002", name: "Iced Caramel Macchiato", category: "Beverages", price: 240.00, veg: true, status: "Active" },
    { sku: "FOD-101", name: "Avocado Toast with Egg", category: "Food", price: 320.00, veg: true, status: "Active" },
    { sku: "FOD-102", name: "Crispy Chicken Slider", category: "Food", price: 290.00, veg: false, status: "Active" },
    { sku: "DES-201", name: "Red Velvet Pastry", category: "Desserts", price: 160.00, veg: true, status: "Active" }
  ];

  const mockTransfers = [
    { id: "TX-1001", from: "Central Warehouse", to: "Nagpur CP", item: "Premium Espresso Blend (COF-001)", qty: 25, status: "Shipped" },
    { id: "TX-1002", from: "Delhi North", to: "Noida Sec 18", item: "Paper Cups 250ml", qty: 500, status: "Requested" }
  ];

  const mockHeatmap = [
    { ingredient: "Espresso Beans (kg)", nagpur: { val: 42, status: "ok" }, delhi: { val: 8, status: "low" }, noida: { val: 25, status: "ok" } },
    { ingredient: "Whole Milk (litres)", nagpur: { val: 120, status: "ok" }, delhi: { val: 95, status: "ok" }, noida: { val: 2, status: "out" } },
    { ingredient: "Caramel Syrup (bottles)", nagpur: { val: 15, status: "ok" }, delhi: { val: 3, status: "low" }, noida: { val: 14, status: "ok" } },
    { ingredient: "Red Velvet Bases", nagpur: { val: 30, status: "ok" }, delhi: { val: 15, status: "ok" }, noida: { val: 28, status: "ok" } }
  ];

  function init(apiClient) {
    client = apiClient;
    bindEvents();
    loadDashboard();
  }

  function bindEvents() {
    const btnAddMaster = document.getElementById("btn-add-master-item");
    if (btnAddMaster) {
      btnAddMaster.addEventListener("click", handleAddMasterItem);
    }

    const btnRequestTransfer = document.getElementById("btn-request-transfer");
    if (btnRequestTransfer) {
      btnRequestTransfer.addEventListener("click", handleRequestTransfer);
    }
  }

  function loadDashboard() {
    renderMetrics();
    renderLeaderboard();
    renderHeatmap();
    renderTransfers();
    renderMasterMenu();
  }

  function renderMetrics() {
    document.getElementById("chain-total-revenue").textContent = "₹6,84,350.00";
    document.getElementById("chain-total-orders").textContent = "2,489";
    document.getElementById("chain-avg-ticket").textContent = "₹274.95";
    document.getElementById("chain-alerting-stores").textContent = "2";
  }

  function renderLeaderboard() {
    const tbody = document.getElementById("chain-leaderboard-tbody");
    if (!tbody) return;

    const data = [
      { name: "Nagpur CP Outlet", revenue: "₹2,84,900.00", growth: "+14.2%", up: true },
      { name: "Delhi North Branch", revenue: "₹2,10,400.00", growth: "+8.6%", up: true },
      { name: "Noida Sector 18", revenue: "₹1,89,050.00", growth: "-2.4%", up: false }
    ];

    tbody.innerHTML = data.map(item => `
      <tr>
        <td style="font-weight: 500;">${item.name}</td>
        <td>${item.revenue}</td>
        <td>
          <span class="pill ${item.up ? 'pill-green' : 'pill-red'}" style="padding: 2px 6px; font-size: 11px;">
            <i class="fa-solid ${item.up ? 'fa-caret-up' : 'fa-caret-down'}"></i> ${item.growth}
          </span>
        </td>
      </tr>
    `).join("");
  }

  function renderHeatmap() {
    const tbody = document.getElementById("chain-inventory-heatmap-tbody");
    if (!tbody) return;

    tbody.innerHTML = mockHeatmap.map(row => {
      const getPill = (loc) => {
        if (loc.status === "out") return `<span class="pill pill-red" style="padding: 3px 8px; font-size: 11px; font-weight: 600;">OUT (${loc.val})</span>`;
        if (loc.status === "low") return `<span class="pill pill-orange" style="padding: 3px 8px; font-size: 11px; font-weight: 600;">LOW (${loc.val})</span>`;
        return `<span class="pill pill-green" style="padding: 3px 8px; font-size: 11px;">${loc.val}</span>`;
      };

      return `
        <tr>
          <td style="font-weight: 500;">${row.ingredient}</td>
          <td>${getPill(row.nagpur)}</td>
          <td>${getPill(row.delhi)}</td>
          <td>${getPill(row.noida)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderTransfers() {
    const tbody = document.getElementById("chain-transfers-tbody");
    if (!tbody) return;

    if (mockTransfers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-mute);padding:20px;">No active stock transfers.</td></tr>`;
      return;
    }

    tbody.innerHTML = mockTransfers.map((tx, idx) => {
      let statusClass = "pill-orange";
      if (tx.status === "Shipped") statusClass = "pill-blue";
      if (tx.status === "Received") statusClass = "pill-green";

      const showActions = tx.status === "Requested";

      return `
        <tr>
          <td style="font-weight:500;">${tx.from}</td>
          <td>${tx.to}</td>
          <td>${tx.item}</td>
          <td>${tx.qty}</td>
          <td><span class="pill ${statusClass}" style="padding: 2px 6px; font-size: 11px;">${tx.status}</span></td>
          <td>
            ${showActions ? `
              <div style="display:flex; gap:6px;">
                <button class="btn btn-primary btn-xs" onclick="RestroSuite.chain.approveTransfer(${idx})" style="padding: 3px 8px; font-size:11px;">Approve</button>
                <button class="btn btn-ghost btn-xs text-danger" onclick="RestroSuite.chain.cancelTransfer(${idx})" style="padding: 3px 8px; font-size:11px;">Decline</button>
              </div>
            ` : `<span style="color:var(--text-mute); font-size:12px;">--</span>`}
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderMasterMenu() {
    const tbody = document.getElementById("chain-master-menu-tbody");
    if (!tbody) return;

    tbody.innerHTML = mockMasterMenu.map(item => `
      <tr>
        <td style="font-family: monospace; color: var(--primary); font-weight:600;">${item.sku}</td>
        <td style="font-weight: 500;">${item.name}</td>
        <td>${item.category}</td>
        <td>₹${item.price.toFixed(2)}</td>
        <td>
          <span class="pill ${item.veg ? 'pill-green' : 'pill-red'}" style="padding: 2px 6px; font-size:11px;">
            ${item.veg ? 'Veg' : 'Non-Veg'}
          </span>
        </td>
        <td><span class="pill pill-green" style="padding: 2px 6px; font-size:11px;">All Outlets</span></td>
      </tr>
    `).join("");
  }

  function handleAddMasterItem() {
    const name = prompt("Enter Master Item Name:");
    if (!name) return;
    const category = prompt("Enter Category (e.g. Beverages, Food, Desserts):", "Beverages");
    if (!category) return;
    const priceVal = prompt("Enter Default Price (₹):", "150");
    const price = parseFloat(priceVal) || 0;
    const isVeg = confirm("Is this item Vegetarian?");
    const sku = "CAT-" + Math.floor(100 + Math.random() * 900);

    mockMasterMenu.push({
      sku: sku,
      name: name,
      category: category,
      price: price,
      veg: isVeg,
      status: "Active"
    });

    renderMasterMenu();
    showToast(`Master item "${name}" created and synced globally.`);
  }

  function handleRequestTransfer() {
    const fromVal = prompt("Enter source outlet / warehouse:", "Central Warehouse");
    if (!fromVal) return;
    const toVal = prompt("Enter target outlet:", "Nagpur CP");
    if (!toVal) return;
    const itemVal = prompt("Enter item name & SKU:", "Premium Espresso Beans (COF-001)");
    if (!itemVal) return;
    const qtyVal = prompt("Enter quantity:", "10");
    const qty = parseInt(qtyVal) || 0;

    const txId = "TX-" + Math.floor(1003 + Math.random() * 900);

    mockTransfers.push({
      id: txId,
      from: fromVal,
      to: toVal,
      item: itemVal,
      qty: qty,
      status: "Requested"
    });

    renderTransfers();
    showToast(`Stock transfer requested: ${qty} units of ${itemVal}.`);
  }

  function approveTransfer(idx) {
    if (mockTransfers[idx]) {
      mockTransfers[idx].status = "Shipped";
      renderTransfers();
      showToast(`Stock transfer ${mockTransfers[idx].id} approved and shipped.`);
    }
  }

  function cancelTransfer(idx) {
    if (mockTransfers[idx]) {
      const name = mockTransfers[idx].id;
      mockTransfers.splice(idx, 1);
      renderTransfers();
      showToast(`Stock transfer ${name} declined.`);
    }
  }

  function showToast(message) {
    // Check if app has standard toast handler, else alert
    if (window.showToast) {
      window.showToast(message);
    } else {
      // Simple fallback Toast div injection
      const t = document.createElement("div");
      t.style.position = "fixed";
      t.style.bottom = "20px";
      t.style.right = "20px";
      t.style.background = "var(--primary)";
      t.style.color = "#fff";
      t.style.padding = "12px 24px";
      t.style.borderRadius = "8px";
      t.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      t.style.zIndex = "9999";
      t.style.fontFamily = "sans-serif";
      t.style.fontSize = "14px";
      t.textContent = message;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }
  }

  return { init, loadDashboard, approveTransfer, cancelTransfer };
});
