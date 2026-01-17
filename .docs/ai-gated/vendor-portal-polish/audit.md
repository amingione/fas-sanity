# Phase 1 Audit — Vendor Portal Polish

Scope: `fas-sanity` + `fas-cms-fresh` (auth, email origination, vendor application flow). No implementation changes applied.

## Auth (FASauth + Vendor Access)

### fas-cms-fresh
- FASauth client shim:
  - `public/fas-auth.js` exposes `window.fasAuth` and calls `/api/auth/session`.
  - Loaded in `src/layouts/BaseLayout.astro`.
- Login endpoints:
  - `src/pages/api/auth/login.ts` (admin/customer/vendor login). Vendor login only succeeds when `vendor.status === 'Approved'` and password hash matches.
  - `src/pages/api/vendor/login.ts` (vendor-only login). Requires `portalAccess.enabled === true` and blocks `suspended`, `inactive`, `on_hold` statuses.
  - `src/pages/api/vendor/auth/setup.ts` accepts a setup token + password and writes `portalAccess.passwordHash`, `portalAccess.setupCompletedAt`, `portalAccess.enabled`.
  - `src/pages/api/vendor/password-reset/request.ts` issues vendor password reset tokens and sends email via Resend.
- Role/status checks:
  - `src/server/vendor-portal/auth.ts` requires session, fetches vendor by session `user.id`, checks `portalAccess.enabled`, enforces `portalAccess.permissions`.
  - `src/pages/api/auth/login.ts` uses `vendor.status === 'Approved'` (capitalized), while schema values are lowercase; `inactive` is checked elsewhere but not in schema.
  - `src/server/vendor-portal/service.ts` sets `vendor.status = 'Approved'` when completing invitations.
  - `src/server/vendor-portal/service.ts` includes `requireAdmin` role checks (`admin`, `staff`, `manager`) for admin-only vendor actions.
- Session payload:
  - `src/server/auth/session.ts` issues JWT cookie (`fas_session` by default) with `sub`, `email`, `roles` and normalizes roles to lowercase on read.
  - `src/pages/api/auth/session.ts` returns `{ user, exp }` or `{ user: null }`.
- Route protection:
  - `src/middleware.ts` guards `/vendor-portal/*` except login/reset routes via `readSession`.

### fas-sanity
- No explicit vendor login or session issuance endpoints.
- `netlify/lib/wholesale.ts` uses `resolveVendor` with `vendorId`/`vendorEmail` or `Authorization` header (JWT payload is base64-decoded without signature verification).
- `resolveVendor` checks `portalAccess.enabled`/`portalEnabled` only; no vendor status checks.
- `netlify/functions/wholesale-orders.ts` uses `resolveVendor` for access control.
- `src/pages/vendor-portal/messages.astro` reads `vendorId` from query string; no auth/session enforcement.

## Email Origination (Vendor-Related)

### fas-sanity (current senders)
- `netlify/functions/vendor-application.ts` sends applicant confirmation + internal notification via Resend and logs email idempotency.
- `netlify/functions/send-vendor-invite.ts` sends invite email via Resend and triggers onboarding campaign.
- `netlify/lib/vendorOnboardingCampaign.ts` sends campaign emails (Resend) and writes `vendorEmailLog`.
- `netlify/functions/sendVendorEmail.ts` sends vendor templates (`welcome`, `rejection`, `quote`, `order`) via Resend with `vendorEmails` templates.
- `netlify/lib/emailTemplates/vendorEmails.ts` defines HTML templates.
- `scripts/seed-vendor-onboarding-campaign.ts` seeds onboarding email copy used by campaigns.

### fas-cms-fresh (current senders)
- `src/server/vendor-portal/email.ts` renders + sends vendor emails via Resend using Sanity `emailCampaign` content.
- `src/server/vendor-portal/service.ts` uses `sendVendorEmail` for invite + password reset flows.
- `src/pages/api/vendor/password-reset/request.ts` sends Resend password reset emails directly.
- `src/lib/emailService.ts` sends onboarding email #1 via Resend and logs `vendorEmailLog`.
- `src/lib/vendorPostNotifications.ts` sends vendor blog notifications via Resend.

## Vendor Application Flow

### fas-sanity
- UI:
  - `src/pages/become-a-vendor.astro` posts `FormData` to `/.netlify/functions/vendor-application`.
  - `public/vendor-application.html` posts JSON payload to `/.netlify/functions/submitVendorApplication`.
- API handlers:
  - `netlify/functions/vendor-application.ts` validates required fields, creates `vendorApplication`, and sends confirmation + internal notification emails.
  - `netlify/functions/submitVendorApplication.ts` sanitizes JSON payload and creates `vendorApplication` (no email send).

### fas-cms-fresh
- UI:
  - `src/pages/become-a-vendor.astro` posts JSON to `/api/vendor-application`, then falls back to `/.netlify/functions/vendor-application`.
- API handler:
  - `src/pages/api/vendor-application.ts` → `src/server/vendor-application-handler.ts` creates `vendorApplication` and includes fields like `businessAddress.full`, `resaleCertificateId`, and `additionalInfo` that are not in schema (data dropped in Sanity).

## Noted Duplications / Divergences
- Dual vendor login endpoints with mismatched status checks (`Approved` vs lowercase statuses).
- Vendor portal permissions include supplier-style permissions (inventory/products/analytics) in `src/server/vendor-portal/auth.ts`.
- Vendor setup + password reset flows exist only in fas-cms-fresh, but fas-sanity does not issue or validate vendor sessions.
- Vendor applications have multiple intake paths across both repos (Astro, static HTML, `/api/vendor-application`, and Netlify functions).
- Vendor emails originate from both repos, violating the single-origin requirement (fas-sanity only).
  - Password reset is duplicated (`src/server/vendor-portal/service.ts` token flow vs `src/pages/api/vendor/password-reset/request.ts` direct Resend).

## Canonical Artifacts Consulted
- `.docs/reports/field-to-api-map.md`
- `.docs/CONTRACTS/schema-field-mapping.md`
- `docs/reports/vendor-portal-usability-reform-audit.md`
- `docs/reports/fasauth-cross-repo-audit.md`

## Phase 1 Status
- Audit complete. No implementation changes applied.
