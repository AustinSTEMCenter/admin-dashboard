# ASC Admin Dashboard

An internal Austin STEM Center dashboard that brings together a team member's Google Calendar, recent Google Drive files, and assigned ClickUp tasks.

This project is currently in a small internal pilot. It is intended for a few ASC staff members to test on a Vercel deployment before the product and integrations are finalized.

## Current pilot scope

- Google-only sign-in through Clerk
- This week's events from the signed-in user's primary Google Calendar
- The eight most recently modified files visible to the user in Google Drive
- ClickUp tasks assigned to the signed-in user, when ClickUp OAuth is configured
- A private Grand Opening guest dashboard sourced from the restricted Luma export in Google Sheets
- Responsive desktop and mobile layouts

The dashboard is read-only. It does not edit Google Calendar events, modify Drive files, or change ClickUp tasks.

## Local development

Requirements:

- Node.js 20 or newer
- pnpm 11
- A Clerk application with Google enabled

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

Create `.env.local` with the Clerk keys:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

ClickUp is optional during the pilot. If its variables are omitted, the dashboard displays the ClickUp section as coming soon.

```bash
CLICKUP_CLIENT_ID=...
CLICKUP_CLIENT_SECRET=...
```

## Google and Clerk setup

Google sign-in and Google Workspace access are managed through Clerk. The application does not use a separate `NEXT_PUBLIC_GOOGLE_CLIENT_ID` variable.

1. In Google Cloud Console, create or select the ASC Google Cloud project.
2. Enable the Google Calendar API and Google Drive API.
3. Configure the OAuth consent screen as **Internal** so only ASC Google Workspace accounts can authorize the app.
4. Create a Web application OAuth client.
5. In Clerk, add a Google social connection, enable sign-up and sign-in, turn on **Use custom credentials**, and copy Clerk's authorized redirect URI.
6. Add that exact Clerk redirect URI to the Google OAuth client, then enter the Google client ID and secret in Clerk.
7. Configure the following scopes in both Clerk's Google connection and the Google OAuth consent screen:

   ```text
   openid
   email
   profile
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/drive.metadata.readonly
   ```

The scopes above match the current pilot implementation. The dashboard only displays Calendar events and Drive metadata; it does not read or download Drive file contents.

The Grand Opening dashboard uses a dedicated Google service account instead of each staff member's OAuth token. This keeps the source guest sheet restricted while the application renders only operational metrics, guest names and organizations for internal review, and headcount follow-up flags. Email addresses, phone numbers, and check-in URLs are never rendered by the dashboard.

After changing Google scopes, existing users must open `/account` and reconnect Google so their access token includes the updated permissions.

### Grand Opening guest dashboard

The `/events/grand-opening` route reads the work-owned Luma CSV import from Google Sheets on the server. It does not modify the source workbook.

1. Enable the **Google Sheets API** in the ASC Google Cloud project.
2. Create a dedicated service account for the event dashboard and generate a JSON key.
3. Share the source Google Sheet with the service-account email as a **Viewer**. Editor access is not required.
4. Add these variables to `.env.local` and to the Vercel project:

   ```text
   LUMA_GUESTS_SPREADSHEET_ID
   GOOGLE_SERVICE_ACCOUNT_EMAIL
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   ```

5. If the workbook contains multiple tabs, also set `LUMA_GUESTS_SHEET_NAME` to the exact Luma export tab name. With a single-tab workbook, the route uses the first grid tab.
6. Redeploy after adding the environment variables. Future CSV refreshes in the same workbook appear on the next page load without another deployment.

For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, Vercel accepts the key as a multiline value. Local `.env.local` files can use escaped `\n` line breaks as shown in `.env.example`; the application accepts either format.

## Deploying the pilot to Vercel

1. Import this repository into Vercel.
2. Add these required environment variables to the Vercel project:

   ```text
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   LUMA_GUESTS_SPREADSHEET_ID
   GOOGLE_SERVICE_ACCOUNT_EMAIL
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   ```

3. If ClickUp should be included in the pilot, also add:

   ```text
   CLICKUP_CLIENT_ID
   CLICKUP_CLIENT_SECRET
   ```

4. Deploy the project.
5. Add the Vercel deployment URL as an allowed origin in Google Cloud and an allowed URL in Clerk, following the redirect URL shown by Clerk.
6. Confirm that the Google OAuth consent screen remains restricted to the ASC Workspace domain.

Clerk development keys are acceptable for a brief, low-traffic preview, subject to Clerk's development-instance limits. Use a Clerk production instance and production keys before treating the dashboard as a permanent internal service.

### ClickUp OAuth

If ClickUp is enabled, create a ClickUp OAuth app and register this callback URL:

```text
https://YOUR-VERCEL-DOMAIN/api/clickup/callback
```

The callback must exactly match the deployed Vercel domain. ClickUp is optional for the first pilot; leaving its environment variables unset is the simplest way to test only Google Calendar and Drive.

## Assistant pilot checklist

Ask the first tester to check the following:

- Sign in using an ASC Google Workspace account.
- Confirm that a non-ASC account cannot gain access.
- Confirm that `/dashboard` loads after sign-in.
- Confirm that this week's Calendar events appear and open in Google Calendar.
- Confirm that recent Drive files appear and open in Google Drive.
- If prompted to reconnect Google, use `/account`, reconnect, and reload the dashboard.
- If ClickUp is enabled, connect it and confirm that assigned tasks appear and open correctly.
- Check the dashboard on both a phone and a desktop browser.
- Sign out and confirm that `/dashboard` is no longer accessible.
- Record any permission errors, blank states, incorrect data, layout problems, or confusing instructions.

## Validation

Before deploying a new pilot build, run:

```bash
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm build
```

There is not yet an automated test suite. Authentication and third-party integrations should be manually smoke-tested on the deployed Vercel URL.

## Known pre-production follow-ups

- Narrow Google OAuth scopes to the final least-privilege set and keep the code, Clerk, and Google Cloud configuration synchronized.
- Add and validate OAuth `state` for the ClickUp connection flow before a broader rollout.
- Replace Clerk development credentials with production credentials.
- Add automated coverage for authentication, integration error states, and core dashboard rendering.
- Finalize which shared calendars, Drive folders, and ClickUp workspaces the team should see.
