# FOGO Admin Dashboard

This is a static web page where administrators invite doctors and manage their access. The invitation is the verification:

1. An admin invites a doctor with their email, full name and medical council (NMC) registration number, on the **Invites** page.
2. The doctor signs up in the app with that email.
3. They are **Active** immediately (`Approved by invitation`). No document is uploaded or reviewed.
4. An admin can **Suspend** an active doctor at any time (a reason is required) and **Reinstate** them later.

Doctors who signed up without an invitation (legacy sign-ups) show as **Pending Approval**. An admin can approve them or reject them (a reason is required). Old certificate uploads are kept in storage as evidence but are no longer shown here.

A doctor sees no patient data unless they are Active. The database enforces this with `doctors.verified`, not just the UI. Every decision is written to `audit_log` with the admin's account. An invitation-approved sign-up appears there as **Approved by Invitation**.

The page is `index.html` plus `app.js`. It loads supabase-js (pinned version, integrity-checked) from jsDelivr and calls the `admin_*` RPCs from `supabase/migrations/`.

This repository is the deployable copy of the `admin/` folder in the main FOGO repository, which also holds the app, the Supabase migrations and the backend contracts. Make dashboard changes there first, then copy them here.

## Security
- Nothing secret lives in this folder. The browser only ever gets the project URL and the **publishable** key, which are public by design. All protection is server-side: every `admin_*` RPC checks `is_admin()`, the admin tables have RLS with no client policies, and sign-in is an emailed code for existing users only.
- `build.js` refuses to deploy a secret or service-role key, and publishes only `index.html`, `app.js` and `config.js` — this README, `vercel.json` and the build script are never served.
- `vercel.json` sends a strict Content-Security-Policy (no inline or third-party scripts beyond the pinned supabase-js), HSTS, no framing, no referrer, no caching and no indexing.
- Never commit `config.js`, `.env` files or `public/` (all gitignored).

## Setup

1. Apply migrations **009 through 013** (013 makes an invitation the verification) (main FOGO repository, `supabase/migrations/`) to the Supabase project, using the SQL editor or the Supabase MCP.
2. Make yourself an admin. The account must already exist as an auth user, so sign in to the app once or create it under Authentication → Users.
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.org';
   ```
3. Copy `config.example.js` to `config.js` (it is gitignored). Fill in the project URL and the **publishable** key, the same values as `fog_assist/env.json`. Never put the service-role key here: access is controlled by `is_admin()` inside each RPC.
4. Serve the folder:
   ```bash
   python -m http.server 8790
   ```
   Then open http://localhost:8790. Sign-in uses an email code (`shouldCreateUser: false`). On the free Supabase plan, emails only reach project team members.

To see the UI with sample data and no backend, open http://localhost:8790/?demo. Nothing leaves the browser in demo mode.

## Hosting on Vercel

1. In Vercel, choose New Project and import this repository. Leave **Root Directory** at the repository root and **Framework Preset** at Other.
2. Under Settings → Environment Variables, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, the same values as `fog_assist/env.json`.
3. Deploy. `build.js` writes `config.js` from those variables at build time and publishes only the page files; `vercel.json` adds the security headers.

Any other static host works too: deploy only `index.html`, `app.js` and a `config.js`, with the same headers. Under Supabase → Authentication → URL configuration, add the site URL to the allowed redirect URLs. The page uses 6-digit codes, not magic links, so this is only a precaution.

## Accounts and kits

The **Patients**, **Doctors** and **Kits** pages need migration 011. Patients removing a damaged kit from the app (migration 012) show in the audit log as **Kit Released by Patient**. Because this is a CDSCO trial, nothing clinical is ever hard-deleted: removing an account means deactivating it.

- **Deactivate** (a reason is required, and the action is audited) blocks sign-in and ends all pending and active doctor links. A doctor is also marked unverified. A patient's claimed kits are released. All sessions, episodes, notes and consent records are kept. You can't deactivate your own account.
- **Reactivate** lifts the sign-in block. It does not restore links or kits. A doctor regains access only if their status is still Active.
- **Unredeem** (kits, a reason is required, and the action is audited) clears the claim so another patient can claim the kit. Past sessions stay with the original patient.

A deactivated doctor can't be approved until the account is reactivated.

## Removing an admin

```sql
delete from public.admins where email = 'someone@example.org';
```
This change is itself audited.
