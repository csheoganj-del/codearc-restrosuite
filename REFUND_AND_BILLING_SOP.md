# RestoSuite Refund and Billing SOP

This SOP covers SaaS subscription refunds and future paid billing. Restaurant-to-customer food refunds are managed by each restaurant.

## Current Zero-Cost Phase

- Keep paid subscriptions disabled until revenue starts.
- Use Growth Hub upgrade requests to track interested clients.
- Manually discuss pricing before enabling paid checkout.
- Keep SaaS invoice records as draft or manual references.

## SaaS Refund Review

Collect:

- tenant name
- invoice number
- payment reference
- amount
- payment date
- reason
- screenshots or correspondence

Approve refund only when:

- the charge was duplicate
- the first paid purchase is within the published refund review period
- the service was materially unavailable
- a law or payment provider requires it

Reject or defer when:

- the billing period was already substantially used
- the issue is restaurant-side configuration
- the tenant violated terms
- the request lacks payment evidence

## Future Razorpay or Stripe Integration

When paid billing starts:

- Create hosted checkout from a backend function only.
- Verify webhooks with provider signatures.
- Store provider customer ID and subscription ID.
- Never trust client-side payment success alone.
- Update `saas_tenants.subscription_status` from verified webhooks.
- Keep invoice records in `doppio_saas_invoices`.
- Add tests for webhook signature validation and replay protection.

## Past-Due Handling

1. Mark tenant as `past_due`.
2. Keep access active during grace period.
3. Show admin-only billing warning.
4. Restrict non-critical growth modules after grace period.
5. Never delete tenant data for non-payment without written notice.

