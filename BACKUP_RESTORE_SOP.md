# RestroSuite Backup and Restore SOP

Backups protect restaurant operations from mistakes, imports, and accidental data loss.

## Backup Types

- Manual JSON export from dashboard.
- Automated database backups via script: `npm run backup` (saves compressed ZIP snapshots of all core tables to `backups/` directory).
- Nightly GitHub Action: `.github/workflows/nightly-backup.yml` (requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` secrets; artifacts retained 90 days). After each backup it runs a **non-destructive restore preview drill** on the fresh archive.
- Supabase database backups when the project plan supports it.
- WhatsApp gateway session backup when the optional gateway is enabled.
- Growth Hub backup snapshot records for readiness tracking.

## Manual Backup Schedule

- Before each production deployment.
- Before importing bills or menu data.
- Before tenant reset.
- Weekly for active pilot tenants.
- Immediately after the first paid client completes setup.

```bash
npm run backup
# writes backups/restrosuite-backup-<timestamp>.zip
```

## Disaster-recovery drill (run monthly, non-destructive)

```bash
# CI / no credentials — verifies backup & restore scripts stay wired
npm run drill:backup:structure

# Preview the latest archive (or create one first) — needs SUPABASE_URL + SERVICE_ROLE_KEY
npm run drill:backup
npm run drill:backup:create

# Explicit archive
node scripts/backup-restore-drill.cjs path/to/restrosuite-backup-....zip
```

`drill:backup:structure` runs in GitHub Actions on every push. The full drill checks
credentials, opens the zip, lists table dumps, and runs `restore-db.js` in
**preview-only** mode (no writes). Treat a failed drill as an ops incident.

## Restore Safety

Do not restore blindly.

Before restore:

1. Export the current data.
2. Confirm tenant name and tenant ID.
3. Preview the incoming backup contents.
4. Confirm expected bill count, menu count, inventory count, staff count, and settings.
5. Run restore in a test tenant first when possible.

```bash
# Preview only (default — no writes)
npm run restore -- backups/restrosuite-backup-....zip

# Actually write (also takes a fresh safety backup first)
node scripts/restore-db.js backups/restrosuite-backup-....zip --confirm

# Subset of tables
node scripts/restore-db.js backups/restrosuite-backup-....zip --confirm --tables=doppio_menu,doppio_inventory
```

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

## Off-site retention

GitHub artifacts are not a long-term vault. When client Drive export ships,
pair nightly backups with per-tenant Drive copies. Until then, periodically
download a backup zip to encrypted offline storage after every major release.
