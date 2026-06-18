# RestroSuite Support SOP

This process keeps support fast, calm, and measurable while the SaaS is still operating lean.

## Ticket Sources

- Growth Hub support tickets.
- WhatsApp or phone messages.
- Email messages.
- Superadmin application incidents.
- Client onboarding calls.

## Priority Levels

- Urgent: checkout, login, QR ordering, data access, or billing is blocked.
- High: important workflow broken, but restaurant can continue operating.
- Normal: setup help, product question, cosmetic issue, or training request.
- Low: feedback, enhancement request, or non-urgent change.

## Response Targets

- Urgent: acknowledge within 30 minutes during business hours.
- High: acknowledge within 4 business hours.
- Normal: acknowledge within 1 business day.
- Low: review during weekly planning.

## First Response Template

Hello, we received your request and are checking it now.

Please share:

- outlet name
- affected screen
- order or bill ID if any
- screenshot or short video
- whether this is web, mobile browser, or Android app

## Triage Steps

1. Check superadmin tenant status.
2. Check plan and subscription state.
3. Check recent application incidents.
4. Reproduce with a test user where possible.
5. Confirm whether the issue is tenant-specific or platform-wide.
6. Record the final cause and resolution in the ticket.

## Escalation

Escalate immediately when:

- more than one tenant is affected
- POS billing is blocked
- QR orders cannot be placed
- login is unavailable
- Supabase quota or Vercel deployment is failing
- data appears missing or cross-tenant isolation is suspected

## Closure

A ticket can be closed when:

- the client confirms resolution, or
- the issue is fixed and evidence is attached, or
- the request is converted into a roadmap item.

Always include what changed, what the client should test, and any prevention step.

