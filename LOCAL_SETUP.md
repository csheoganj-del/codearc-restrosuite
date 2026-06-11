# Local Setup Guide for RestroSuite

This guide will help you set up RestroSuite for local development and testing.

## Prerequisites

- Node.js 20 or later
- PowerShell 5 or later (Windows)
- A Supabase account (free tier works!)

## Step 1: Set Up Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project
2. Wait for the project to initialize (takes a few minutes)
3. Go to Project Settings → API and copy:
   - `Project URL` (this will be your `SUPABASE_URL`)
   - `anon public` key (this will be your `SUPABASE_ANON_KEY`)
   - `service_role` secret (keep this safe, you'll need it for Edge Functions!)

## Step 2: Apply Database Migrations

1. In your Supabase project, go to SQL Editor
2. Create a new query
3. Copy the contents of `supabase_migration.sql` and run it
4. Now, apply all migrations in `supabase/migrations/` in order (run each .sql file one by one)
   - Start with `20260531000000_saas_tenants.sql`
   - Then `20260601000000_core_pos_tables.sql`
   - Continue in numerical order

## Step 3: Configure Environment Variables

Copy the `.env.example` file to `.env.local` and fill in your values:

```bash
# Copy the example file
cp .env.example .env.local
```

Then edit `.env.local` with your Supabase credentials:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
```

## Step 4: Deploy Supabase Edge Functions

1. Install the Supabase CLI: https://supabase.com/docs/guides/cli/getting-started
2. Log in to Supabase: `supabase login`
3. Link your project: `supabase link --project-ref <your-project-ref>`
4. Set up secrets (replace with your actual values!):
   ```bash
   supabase secrets set SUPABASE_URL=https://<your-project-ref>.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   supabase secrets set SUPERADMIN_SESSION_SECRET=$(openssl rand -hex 64)
   # Optional: set these if you want email notifications
   supabase secrets set EMAIL_RELAY_URL=
   supabase secrets set EMAIL_RELAY_TOKEN=
   supabase secrets set EMAIL_WEBHOOK_SECRET=
   supabase secrets set ADMIN_ALERT_EMAIL=
   supabase secrets set ZERO_COST_EMAILS_DISABLED=true
   supabase secrets set ALLOWED_ORIGIN=http://localhost:8001
   ```
5. Deploy all Edge Functions:
   ```bash
   supabase functions deploy tenant-access
   supabase functions deploy tenant-admin
   supabase functions deploy tenant-data
   supabase functions deploy tenant-public
   supabase functions deploy tenant-users
   supabase functions deploy app-observability
   supabase functions deploy notify-registration
   ```

## Step 5: Run Local Development Server

1. Open a PowerShell terminal in the project root
2. Run the local server:
   ```powershell
   .\scripts\local\run-server.ps1
   ```
3. Open your browser and go to http://localhost:8001

## Step 6: Run Tests and Checks

Make sure everything is working by running the project checks:

```bash
npm run check
npm run check:free-tier
npm test
```

## Next Steps

- Check out the [LAUNCH_RUNBOOK.md](./LAUNCH_RUNBOOK.md) for production deployment steps
- Read the [PRODUCTION_QA_CHECKLIST.md](./PRODUCTION_QA_CHECKLIST.md) for full QA testing
- Review other SOPs in the repository for support, backups, and monitoring
