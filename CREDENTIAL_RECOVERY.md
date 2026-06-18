# Credential Recovery

## Outlet owner or administrator

1. Open `login.html`.
2. Select **Forgot outlet ID, username, or password?**
3. Enter the registered owner email. The outlet ID is optional if it was forgotten.
4. Open the email and use the single-use link within 30 minutes.
5. Set a password of at least 10 characters.

The email also reminds the owner of the outlet ID and username. A successful reset revokes existing owner sessions.

Email recovery requires these Supabase Edge Function secrets:

- `PUBLIC_APP_URL`
- `EMAIL_RELAY_URL`
- `EMAIL_RELAY_TOKEN` when required by the relay
- `ZERO_COST_EMAILS_DISABLED=false`

## Staff member

Staff passwords are reset by an outlet administrator:

1. Open **Employees**.
2. Open **Staff Access**.
3. Select the staff account.
4. Choose **Reset password** and issue a temporary password.

The reset increments the account session version, so existing sessions stop working.

## Superadmin

Superadmin recovery is intentionally not exposed on the public login page. The platform owner must rotate the deployment secret.

1. Generate a PBKDF2 password hash:
   `npm run hash:superadmin -- "your-new-long-password"`
2. Update `SUPERADMIN_PASSWORD_HASH` in Supabase Edge Function secrets.
3. Verify `SUPERADMIN_USERNAME` and `SUPERADMIN_SESSION_SECRET`.
4. Redeploy the `tenant-access` function.
5. Sign in with outlet ID `superadmin`.

Do not email or store the plaintext superadmin password in the repository.
