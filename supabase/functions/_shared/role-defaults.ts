/**
 * Canonical staff roles + module tabs for RestroSuite.
 * Used by tenant-access, tenant-users, tenant-data.
 * Keep in sync with assets/role-defaults.js (browser).
 */

/** Real dashboard tab ids only (no phantom crm-tab / online-tab). */
export const ALL_MODULE_TABS: string[] = [
  "pos-tab",
  "floor-tab",
  "qr-orders-tab",
  "kds-tab",
  "bills-tab",
  "inventory-tab",
  "editor-tab",
  "customers-tab",
  "tax-tab",
  "aggregator-tab",
  "tokens-tab",
  "employees-tab",
  "growth-hub-tab",
  "analytics-tab",
  "reports-tab",
];

/** Map legacy / alternate ids → canonical UI tab ids. */
export const LEGACY_TAB_ALIASES: Record<string, string> = {
  "crm-tab": "customers-tab",
  "online-tab": "aggregator-tab",
  "online-orders-tab": "aggregator-tab",
  "settings-tab": "settings-tab",
};

export const ROLE_DEFAULT_TABS: Record<string, string[]> = {
  admin: [...ALL_MODULE_TABS],
  manager: [
    "pos-tab",
    "floor-tab",
    "qr-orders-tab",
    "kds-tab",
    "bills-tab",
    "inventory-tab",
    "editor-tab",
    "customers-tab",
    "reports-tab",
    "analytics-tab",
    "employees-tab",
    "growth-hub-tab",
    "aggregator-tab",
    "tax-tab",
  ],
  cashier: ["pos-tab", "floor-tab", "bills-tab", "customers-tab"],
  waiter: ["pos-tab", "floor-tab", "kds-tab"],
  captain: ["pos-tab", "floor-tab", "kds-tab", "qr-orders-tab"],
  kitchen: ["kds-tab"],
  inventory: ["inventory-tab", "editor-tab", "reports-tab"],
  customer_display: ["tokens-tab"],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter",
  captain: "Captain",
  kitchen: "Kitchen Staff",
  inventory: "Inventory Manager",
  customer_display: "Customer Display",
  owner: "Outlet Owner",
};

export const ROLE_HOME_TAB: Record<string, string> = {
  cashier: "pos-tab",
  waiter: "floor-tab",
  captain: "floor-tab",
  kitchen: "kds-tab",
  inventory: "inventory-tab",
  manager: "pos-tab",
  customer_display: "tokens-tab",
  admin: "pos-tab",
};

export type PlanEntitlement = {
  name: string;
  maxStaff: number;
  monthlyOrderLimit: number;
  allowedTabs: string[];
};

export const PLAN_ENTITLEMENTS: Record<string, PlanEntitlement> = {
  free: {
    name: "Free / Demo",
    maxStaff: 2,
    monthlyOrderLimit: 50,
    allowedTabs: [
      "pos-tab",
      "floor-tab",
      "qr-orders-tab",
      "bills-tab",
      "inventory-tab",
      "editor-tab",
      "kds-tab",
      "tokens-tab",
      "customers-tab",
    ],
  },
  starter: {
    name: "Starter",
    maxStaff: 5,
    monthlyOrderLimit: 300,
    allowedTabs: [
      "pos-tab",
      "floor-tab",
      "qr-orders-tab",
      "bills-tab",
      "inventory-tab",
      "editor-tab",
      "kds-tab",
      "tokens-tab",
      "employees-tab",
      "growth-hub-tab",
      "customers-tab",
    ],
  },
  growth: {
    name: "Growth",
    maxStaff: 15,
    monthlyOrderLimit: 8000,
    allowedTabs: [...ALL_MODULE_TABS],
  },
  enterprise: {
    name: "Enterprise",
    maxStaff: 75,
    monthlyOrderLimit: 100000,
    allowedTabs: [...ALL_MODULE_TABS],
  },
};

export function planFor(code: unknown): PlanEntitlement {
  return PLAN_ENTITLEMENTS[String(code || "starter")] || PLAN_ENTITLEMENTS.starter;
}

export function normalizeTabId(tab: string): string {
  const t = String(tab || "").trim();
  if (!t) return t;
  return LEGACY_TAB_ALIASES[t] || t;
}

export function normalizeTabs(tabs: unknown): string[] {
  if (!Array.isArray(tabs)) return [];
  return [...new Set(tabs.map((t) => normalizeTabId(String(t))).filter(Boolean))];
}

export function tabsForRole(role: string): string[] {
  const key = String(role || "").trim().toLowerCase();
  return (ROLE_DEFAULT_TABS[key] || ROLE_DEFAULT_TABS.waiter || ["pos-tab"]).slice();
}

/**
 * Tenant plan ceiling. Short/stale tenant.allowed_tabs lists are treated as
 * incomplete and replaced by full plan tabs (fixes silent Floor/KDS stripping).
 */
export function effectiveTenantTabs(tenantTabs: unknown, planCode: unknown): string[] {
  const planTabs = planFor(planCode).allowedTabs.map(String);
  if (!Array.isArray(tenantTabs) || tenantTabs.length === 0) return planTabs;
  const custom = normalizeTabs(tenantTabs);
  if (custom.length >= Math.max(4, Math.floor(planTabs.length / 2))) {
    return planTabs.filter((t) => custom.includes(t));
  }
  return planTabs;
}

/**
 * Staff module access for login / validate / data ACL.
 * Role defaults apply when user tabs empty; explicit tabs may expand or shrink
 * within the tenant plan ceiling (not clipped to role template).
 */
export function effectiveTabs(role: string, userTabs: unknown, tenantTabs: unknown): string[] {
  const roleTabs = tabsForRole(role);
  const requested = Array.isArray(userTabs) && userTabs.length > 0
    ? normalizeTabs(userTabs)
    : roleTabs;
  const enabled = Array.isArray(tenantTabs) ? normalizeTabs(tenantTabs) : [];
  const ceiling = enabled.length ? enabled : requested;
  return [...new Set(requested.filter((tab) => ceiling.includes(tab)))];
}

/** Staff roles that may be assigned in Team → Logins (not owner/superadmin). */
export const ASSIGNABLE_STAFF_ROLES = [
  "manager",
  "cashier",
  "waiter",
  "captain",
  "kitchen",
  "inventory",
  "customer_display",
] as const;
