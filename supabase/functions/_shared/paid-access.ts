/**
 * Single source of truth for "may this tenant use RestroSuite?"
 * Missing / empty subscription_status is NEVER treated as active.
 * Access requires a paid-like status AND a period end that is still in the future.
 */

export function normalizeSubStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

/** Statuses that can mean "paid or trial" — still need a live period end. */
export function isPaidLikeStatus(status: unknown): boolean {
  const s = normalizeSubStatus(status);
  return s === "active" || s === "trialing" || s === "past_due";
}

export function periodStillOpen(endIso: string | null | undefined): boolean {
  if (!endIso) return false;
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(endMs)) return false;
  return Date.now() <= endMs;
}

export type AccessResult =
  | { ok: true }
  | { ok: false; code: string; error: string };

export function subscriptionAllowsAccess(tenant: {
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  status?: string | null;
}): AccessResult {
  const workspace = String(tenant.status || "").trim().toLowerCase();
  const sub = normalizeSubStatus(tenant.subscription_status);
  const open = periodStillOpen(tenant.subscription_current_period_end);

  if (workspace === "pending") {
    return {
      ok: false,
      code: "pending",
      error: "Access Denied: Your registration request is pending CodeArc approval.",
    };
  }

  // Admin suspend / payment_failed with no remaining paid days.
  if ((workspace === "suspended" || workspace === "payment_failed") && !open) {
    return {
      ok: false,
      code: "subscription_inactive",
      error:
        "Access Denied: Account suspended. Open Plan & billing to renew, or contact RestroSuite support.",
    };
  }

  if (sub === "canceled" || sub === "cancelled" || sub === "expired") {
    if (open) return { ok: true };
    return {
      ok: false,
      code: "subscription_expired",
      error: "Access Denied: Your plan period has ended. Renew now to reopen POS.",
    };
  }

  if (!isPaidLikeStatus(sub)) {
    return {
      ok: false,
      code: "subscription_inactive",
      error: "Access Denied: Subscription is not active. Please renew your plan to continue.",
    };
  }

  if (!open) {
    return {
      ok: false,
      code: "subscription_expired",
      error: "Access Denied: Your plan period has ended. Renew now to reopen POS.",
    };
  }

  return { ok: true };
}

export function extendPeriodEnd(
  currentEndIso: string | null | undefined,
  interval: "monthly" | "yearly",
): string {
  const now = Date.now();
  const currentMs = currentEndIso ? new Date(currentEndIso).getTime() : 0;
  const from = Number.isFinite(currentMs) && currentMs > now ? currentMs : now;
  const d = new Date(from);
  if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export function normalizePlanCode(code: string): string {
  const c = String(code || "").trim().toLowerCase();
  if (c === "starter") return "express";
  if (c === "growth") return "serve";
  if (c === "enterprise") return "command";
  return c;
}

export const ALLOWED_PLAN_CODES = new Set([
  "express",
  "serve",
  "command",
  "starter",
  "growth",
  "enterprise",
]);
