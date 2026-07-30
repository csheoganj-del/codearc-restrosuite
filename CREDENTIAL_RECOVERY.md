# Credential Recovery

## Outlet owner or administrator

1. Open `login.html`.
2. Select **Forgot password?**
3. Enter the registered owner **email** and/or **WhatsApp** number. Outlet ID is optional if forgotten.
4. RestroSuite generates **one OTP** and sends that **same code** to every channel it can deliver (email and WhatsApp).
5. Enter the 6-digit code (from either channel — both are valid).
6. Set a password of at least 10 characters.

The recovery email also includes outlet ID, username, the OTP, and an optional one-time link that skips the code step. Codes and links expire in **10 minutes** and can be used once. A successful reset revokes existing owner sessions.

Email + WhatsApp recovery requires these Supabase Edge Function secrets on `tenant-access`:

- `PUBLIC_APP_URL`
- `EMAIL_RELAY_URL`
- `EMAIL_RELAY_TOKEN` when required by the relay
- `ZERO_COST_EMAILS_DISABLED=false`
- `WHATSAPP_GATEWAY_URL` (or `NGROK_GATEWAY_URL`)
- `WHATSAPP_GATEWAY_TOKEN` (or `GATEWAY_TOKEN`)
- `OTP_SECRET` (same secret used for registration OTP hashing)

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
