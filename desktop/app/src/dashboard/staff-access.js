(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.staffAccess = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ROLE_LABELS = {
    admin: "Administrator",
    cashier: "Cashier",
    kitchen: "Kitchen",
    waiter: "Waiter",
    customer_display: "Customer display"
  };

  const ROLE_TABS = {
    admin: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "reports-tab", "editor-tab", "crm-tab", "tax-tab", "online-tab", "kds-tab", "tokens-tab", "employees-tab"],
    cashier: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab"],
    kitchen: ["kds-tab"],
    waiter: ["qr-orders-tab"],
    customer_display: ["tokens-tab"]
  };

  const TAB_LABELS = {
    "pos-tab": "POS",
    "qr-orders-tab": "Orders",
    "bills-tab": "Bills",
    "inventory-tab": "Inventory",
    "reports-tab": "Reports",
    "editor-tab": "Menu",
    "crm-tab": "CRM",
    "tax-tab": "Tax",
    "online-tab": "Online",
    "kds-tab": "KDS",
    "tokens-tab": "Tokens",
    "employees-tab": "Employees"
  };

  function formatDate(value) {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Unknown"
      : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function initialize(options) {
    const config = options || {};
    const callStaff = config.callStaff;
    const notify = config.notify || function () {};
    const role = config.role || "";
    const panel = document.getElementById("staff-access-panel");
    if (!panel) return null;
    if (role !== "admin") {
      panel.hidden = true;
      return null;
    }

    const form = document.getElementById("staff-account-form");
    const list = document.getElementById("staff-account-list");
    const count = document.getElementById("staff-account-count");
    const planName = document.getElementById("staff-plan-name");
    const planUsage = document.getElementById("staff-plan-usage");
    const activityList = document.getElementById("staff-activity-list");
    let users = [];
    let usage = null;
    let plan = null;

    function setBusy(button, busy) {
      if (!button) return;
      button.disabled = busy;
      button.classList.toggle("is-busy", busy);
    }

    function emptyState(icon, title, detail) {
      const empty = createElement("div", "staff-empty-state");
      const iconEl = createElement("i", `fa-solid ${icon}`);
      const titleEl = createElement("strong", "", title);
      const detailEl = createElement("span", "", detail);
      empty.append(iconEl, titleEl, detailEl);
      return empty;
    }

    function roleOptions(selectedRole) {
      const select = createElement("select", "staff-row-select");
      Object.entries(ROLE_LABELS).forEach(([value, label]) => {
        const option = createElement("option", "", label);
        option.value = value;
        option.selected = value === selectedRole;
        select.appendChild(option);
      });
      return select;
    }

    function moduleChecks(user, roleSelect) {
      const wrap = createElement("div", "staff-module-grid");
      function render() {
        wrap.replaceChildren();
        const roleTabs = ROLE_TABS[roleSelect.value] || [];
        roleTabs.forEach((tab) => {
          const label = createElement("label", "staff-module-check");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = tab;
          input.checked = (user.allowed_tabs || []).includes(tab) || user.role !== roleSelect.value;
          label.append(input, createElement("span", "", TAB_LABELS[tab] || tab));
          wrap.appendChild(label);
        });
      }
      roleSelect.addEventListener("change", render);
      render();
      return wrap;
    }

    function renderUsers() {
      list.replaceChildren();
      const activeCount = users.filter((user) => user.status === "active").length;
      count.textContent = `${users.length} accounts, ${activeCount} active`;
      if (planName && planUsage) {
        planName.textContent = plan && plan.name ? `${plan.name} plan` : "Current plan";
        planUsage.textContent = usage ? `${usage.active_staff}/${usage.max_staff} active staff` : `${activeCount} active staff`;
      }
      if (!users.length) {
        list.appendChild(emptyState("fa-user-lock", "No staff accounts", "Create the first individual sign-in for this workspace."));
        return;
      }

      users.forEach((user) => {
        const card = createElement("article", "staff-account-card");
        card.dataset.userId = user.id;
        const top = createElement("div", "staff-account-card-top");
        const identity = createElement("div", "staff-account-identity");
        const avatar = createElement("div", "staff-account-avatar", String(user.display_name || user.username || "?").slice(0, 1).toUpperCase());
        const identityText = createElement("div");
        identityText.append(
          createElement("strong", "", user.display_name || user.username),
          createElement("span", "", `@${user.username}`)
        );
        identity.append(avatar, identityText);
        const status = createElement("span", `staff-status ${user.status === "active" ? "active" : "suspended"}`, user.status);
        top.append(identity, status);

        const controls = createElement("div", "staff-account-controls");
        const displayLabel = createElement("label");
        displayLabel.append(createElement("span", "", "Display name"));
        const displayInput = document.createElement("input");
        displayInput.value = user.display_name || "";
        displayInput.maxLength = 100;
        displayLabel.appendChild(displayInput);

        const roleLabel = createElement("label");
        roleLabel.append(createElement("span", "", "Role"));
        const roleSelect = roleOptions(user.role);
        roleLabel.appendChild(roleSelect);

        const statusLabel = createElement("label");
        statusLabel.append(createElement("span", "", "Status"));
        const statusSelect = createElement("select", "staff-row-select");
        ["active", "suspended"].forEach((value) => {
          const option = createElement("option", "", value === "active" ? "Active" : "Suspended");
          option.value = value;
          option.selected = user.status === value;
          statusSelect.appendChild(option);
        });
        statusLabel.appendChild(statusSelect);
        controls.append(displayLabel, roleLabel, statusLabel);

        const modules = moduleChecks(user, roleSelect);
        const meta = createElement("div", "staff-account-meta");
        meta.append(
          createElement("span", "", `Last login: ${formatDate(user.last_login_at)}`),
          createElement("span", "", `Sessions: v${user.session_version}`)
        );

        const actions = createElement("div", "staff-account-actions");
        const save = createElement("button", "staff-primary-btn", "Save changes");
        save.type = "button";
        const reset = createElement("button", "staff-secondary-btn", "Reset password");
        reset.type = "button";
        const revoke = createElement("button", "staff-danger-btn", "Revoke sessions");
        revoke.type = "button";

        save.addEventListener("click", async () => {
          setBusy(save, true);
          try {
            const allowedTabs = Array.from(modules.querySelectorAll("input:checked")).map((input) => input.value);
            await callStaff("update_user", {
              user_id: user.id,
              display_name: displayInput.value.trim(),
              role: roleSelect.value,
              status: statusSelect.value,
              allowed_tabs: allowedTabs
            });
            notify("Staff access updated.");
            await loadUsers();
          } catch (error) {
            notify(error.message || "Could not update staff access.");
          } finally {
            setBusy(save, false);
          }
        });

        reset.addEventListener("click", async () => {
          const password = window.prompt(`Set a new temporary password for ${user.display_name || user.username}. Minimum 10 characters.`);
          if (password === null) return;
          if (password.length < 10) {
            notify("Password must be at least 10 characters.");
            return;
          }
          setBusy(reset, true);
          try {
            await callStaff("reset_password", { user_id: user.id, password });
            notify("Password reset and existing sessions revoked.");
            await loadUsers();
          } catch (error) {
            notify(error.message || "Could not reset password.");
          } finally {
            setBusy(reset, false);
          }
        });

        revoke.addEventListener("click", async () => {
          if (!window.confirm(`Sign ${user.display_name || user.username} out from all devices?`)) return;
          setBusy(revoke, true);
          try {
            await callStaff("revoke_user_sessions", { user_id: user.id });
            notify("All sessions for this account were revoked.");
            await loadUsers();
          } catch (error) {
            notify(error.message || "Could not revoke sessions.");
          } finally {
            setBusy(revoke, false);
          }
        });

        actions.append(save, reset, revoke);
        card.append(top, controls, modules, meta, actions);
        list.appendChild(card);
      });
    }

    async function loadUsers() {
      list.replaceChildren(emptyState("fa-spinner fa-spin", "Loading accounts", "Checking current workspace access."));
      try {
        const result = await callStaff("list_users");
        users = Array.isArray(result.users) ? result.users : [];
        usage = result.usage || null;
        plan = result.plan || null;
        renderUsers();
      } catch (error) {
        list.replaceChildren(emptyState("fa-triangle-exclamation", "Accounts unavailable", error.message || "Try refreshing this panel."));
      }
    }

    async function loadActivity() {
      activityList.replaceChildren(emptyState("fa-spinner fa-spin", "Loading activity", "Retrieving the latest security events."));
      try {
        const result = await callStaff("audit_logs", { limit: 100 });
        const logs = Array.isArray(result.logs) ? result.logs : [];
        activityList.replaceChildren();
        if (!logs.length) {
          activityList.appendChild(emptyState("fa-clock", "No activity yet", "Account and data changes will appear here."));
          return;
        }
        logs.forEach((log) => {
          const row = createElement("div", "staff-activity-row");
          const icon = createElement("div", "staff-activity-icon");
          icon.appendChild(createElement("i", `fa-solid ${String(log.action).startsWith("auth.") ? "fa-right-to-bracket" : "fa-shield-halved"}`));
          const detail = createElement("div", "staff-activity-detail");
          detail.append(
            createElement("strong", "", String(log.action || "activity").replaceAll(".", " ")),
            createElement("span", "", `${log.actor_username || "System"} · ${log.target_type || "workspace"}`)
          );
          row.append(icon, detail, createElement("time", "", formatDate(log.created_at)));
          activityList.appendChild(row);
        });
      } catch (error) {
        activityList.replaceChildren(emptyState("fa-triangle-exclamation", "Activity unavailable", error.message || "Try refreshing this panel."));
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = document.getElementById("create-staff-account-btn");
      setBusy(button, true);
      try {
        await callStaff("create_user", {
          display_name: document.getElementById("staff-display-name").value.trim(),
          username: document.getElementById("staff-username").value.trim(),
          password: document.getElementById("staff-password").value,
          role: document.getElementById("staff-role").value
        });
        form.reset();
        notify("Staff account created.");
        await loadUsers();
      } catch (error) {
        notify(error.message || "Could not create staff account.");
      } finally {
        setBusy(button, false);
      }
    });

    document.getElementById("refresh-staff-accounts-btn").addEventListener("click", loadUsers);
    document.getElementById("refresh-staff-activity-btn").addEventListener("click", loadActivity);
    panel.querySelectorAll("[data-staff-view]").forEach((button) => {
      button.addEventListener("click", () => {
        panel.querySelectorAll("[data-staff-view]").forEach((item) => item.classList.toggle("active", item === button));
        const activity = button.dataset.staffView === "activity";
        document.getElementById("staff-accounts-view").classList.toggle("active", !activity);
        document.getElementById("staff-activity-view").classList.toggle("active", activity);
        if (activity) loadActivity();
      });
    });

    loadUsers();
    return { loadUsers, loadActivity };
  }

  return { initialize, ROLE_TABS };
});
