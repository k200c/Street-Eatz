# FoodOS release record — 31 August 2026

## Shipped to production

- Netlify production deploy: `6a94c6559a910402f8c383d0`
- FoodOS analytics now uses a single-open-section layout for executive, operations, sales/channel, demand, menu and insight-library views.
- The FoodOS insight library records the live metrics, next data modules and external intelligence integrations.
- The management assistant now uses the official OpenAI SDK and modern Netlify runtime environment access.
- The assistant keeps administrator authentication, database quotas, private tool output and confirmation-required mutations.
- A direct private OpenAI key is supported when Netlify AI Gateway is not available.
- Capacitor iOS foundation and the initial Xcode project are generated without replacing the live PWA.
- The install page is ready to show the App Store listing when `VITE_APP_STORE_URL` is configured.
- FoodOS Settings now controls per-client module visibility.
- Operations now includes canonical inventory, roster and append-only food-safety foundations.
- Marketing now has Weekly Broadcast, Community Vote, seventh-order Free Chips loyalty, and honest connection-ready Email/Ads workspaces.
- Analytics now includes evidence-backed competitor intelligence.
- Supabase security hardening cleared all ERROR-level advisor findings.
- Legacy role mirrors and CRM paid-order totals were reconciled; the visible test product was removed from ordering.

## Automated QA completed

- 24/24 application unit tests passed.
- 12/12 management-assistant function contract checks passed.
- 18/18 assistant database security and analytics checks passed.
- 13/13 voice-order contract checks passed.
- 8/8 kitchen dispatch and printing contract checks passed.
- Architecture audit: no critical or high findings.
- PWA audit passed.
- ESLint passed.
- Production Vite build passed.
- TypeScript `--noEmit` passed.
- Netlify secret scanning passed with zero matches on the current deploy.

## Live manual QA completed

- `/`, `/install`, and the admin analytics deep link returned HTTP 200 on the release candidate.
- The assistant rejected an unauthenticated request with HTTP 401.
- The production administrator session loaded the assistant correctly.
- A live read-only assistant question reached the function and confirmed the remaining service-plan blocker.
- Analytics loaded verified production figures.
- Opening the FoodOS insight library collapsed the executive section, confirming one-section-at-a-time navigation.

## Open release blockers and follow-ups

- The Netlify team is on a legacy Starter plan. Its dashboard states that AI Gateway is not included even though AI Features are enabled. To activate assistant responses, either move the team to a current AI-Gateway-supported credit plan/contact Netlify support, or set a private `OPENAI_API_KEY` in the Netlify project environment and redeploy.
- Production dependency audit reports two moderate React Router advisories. The available automated remediation moves the application from React Router 6 to 7 and is therefore reserved for a controlled compatibility upgrade rather than a forced release change.
- App Store signing, physical-device checks and TestFlight require a Mac with Xcode and the existing Apple Developer team.
- Eleven visible products still require Danny-confirmed allergen records; they must not be inferred from menu descriptions.
- Order #908 and nine legacy processing payments require real payment-provider/till reconciliation.
- Fourteen historical test orders remain as audit data; they were not deleted.

## Engineering continuation

The complete Claude Code implementation handoff, module status and release gates are recorded in `docs/CLAUDE-CODE-HANDOFF-2026-08-31.md`.
