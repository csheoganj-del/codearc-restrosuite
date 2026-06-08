# RestoSuite Backup and Restore SOP

Backups protect restaurant operations from mistakes, imports, and accidental data loss.

## Backup Types

- Manual JSON export from dashboard.
- Supabase database backups when the project plan supports it.
- WhatsApp gateway session backup when the optional gateway is enabled.
- Growth Hub backup snapshot records for readiness tracking.

## Manual Backup Schedule

- Before each production deployment.
- Before importing bills or menu data.
- Before tenant reset.
- Weekly for active pilot tenants.
- Immediately after the first paid client completes setup.

## Restore Safety

Do not restore blindly.

Before restore:

1. Export the current data.
2. Confirm tenant name and tenant ID.
3. Preview the incoming backup contents.
4. Confirm expected bill count, menu count, inventory count, staff count, and settings.
5. Run restore in a test tenant first when possible.

After restore:

- Validate POS opens.
- Validate bill history opens.
- Validate inventory counts.
- Validate staff access.
- Validate Growth Hub records.
- Record restore date and reason.

## Tenant Reset Safety

Tenant reset should only be used for:

- demo cleanup
- failed onboarding restart
- client-approved fresh setup
- test tenant cleanup

Never reset a real tenant without written confirmation.

