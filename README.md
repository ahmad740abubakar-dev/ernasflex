# EarnFlex — starter project

A polished, responsive frontend and initial backend/database blueprint for EarnFlex.

## What is included
- Responsive dark-luxury / fintech landing page
- Mobile layout and modal preview
- Terms & Conditions, Privacy Policy, Refund Policy draft pages
- Netlify configuration with basic security headers
- Supabase initial schema proposal
- Backend integration checklist for Paystack, Supabase, and Netlify Functions

## Important current status
This is a **frontend starter and technical blueprint**, not a live earning platform. The sign-up modal is intentionally a preview and does not save user information. Login, task processing, payments, wallet credits, referrals, admin controls, email notifications, and withdrawals are not yet implemented. Do not accept real payments or publish this as a functioning service yet.

## Preview locally
Open `index.html` in a browser, or run a local static server from this directory.

## Deploy to Netlify
1. Extract the ZIP.
2. Create a Git repository and push the project, or upload the folder using a Netlify-supported deploy method.
3. Set the publish directory to `.` and functions directory to `netlify/functions` (configured in `netlify.toml`).
4. Deploy the preview. Confirm the site URL before configuring `SITE_URL`.

## Backend setup order
1. Create a Supabase project.
2. Review `supabase/schema.sql`; apply it only after deciding the required access policies.
3. Add restrictive Row Level Security policies for every table. The schema intentionally has no permissive policies.
4. Create secure Netlify Functions for registration payment initialization, payment verification, Paystack webhooks, task submissions, admin reviews, referral eligibility, ledger credits, withdrawal requests, and admin actions.
5. Store API secrets in Netlify environment variables, not in HTML, frontend JS, or Git.
6. Use Paystack test keys and test transactions first.
7. Implement server-side role checks, webhook signature verification, idempotency, rate limits, audit logging, and atomic ledger updates.
8. Test edge cases and review policies/legal requirements before enabling live payments.

## Suggested environment variables
- `PAYSTACK_SECRET_KEY` (test key during development)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `SITE_URL`
- `PAYSTACK_WEBHOOK_SECRET` (use Paystack's current instructions)

Never share secret keys in chat or screenshots. Never use a service-role key in browser code.

## Financial and policy caution
The proposed values are registration fee ₦2,500, default task reward ₦50, referral reward ₦200, and minimum withdrawal ₦5,000. These are configuration decisions, not a promise that earnings or tasks are guaranteed. Establish a funded task budget, clearly explain the registration fee, finalise refund/withdrawal rules, and review the business model against applicable law and Paystack requirements before accepting payments.
