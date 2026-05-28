# Project Memory: CityStays

> Read this file in full before touching any code, schema, edge function, or automation.
> This is the single source of truth for AI coding agents working on CityStays.

---

## 1. Business Context

**CityStays** provides workforce / contractor accommodation and serviced accommodation operations in Ireland.

The platform is a **full-stack workforce accommodation operating system** — not a website. It manages:
- Property onboarding and master records
- Corporate client leads and bookings
- Guest stays, check-in/check-out, and guest portal
- Cleaning, maintenance, tickets, tasks, inspections
- Staff portals, task assignment, and daily briefings
- WhatsApp, SMS, voice, and email communications
- AI operations assistant (staff) and AI concierge (guests)
- Analytics, KPIs, and business intelligence (in progress)

**Users of the system:**
| Role | Access |
|---|---|
| `admin` | Full system access |
| `staff` / `operations` | Operations portal — properties, bookings, tickets, tasks, inspections |
| `cleaner` | Cleaning tasks, inspection checklists |
| `maintenance` | Maintenance tickets and tasks |
| `guest` | Guest portal only — own booking, own property, AI concierge |
| `corporate` | Corporate portal — own bookings/properties |

**Live URL:** https://citystays.ie/
**GitHub:** https://github.com/k200c/citystays
**Supabase project:** https://iylgkiwalhqlgwzhwlnd.supabase.co
**n8n:** https://kyle2000.app.n8n.cloud
**WhatsApp number:** +353 51 813 144

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Radix UI |
| Routing | React Router v6 |
| Data fetching | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Automation | n8n cloud (kyle2000.app.n8n.cloud) |
| AI | OpenAI models inside n8n workflows (gpt-4o-mini, gpt-4.1-mini) |
| Voice | Vapi + ElevenLabs (eleven_flash_v2_5) + Deepgram (nova-3) + Twilio |
| Comms | WhatsApp Cloud API (Meta), Twilio SMS/Voice, Gmail |
| Invoicing | Xero (skeleton — not production) |
| Hosting | citystays.ie domain — confirm DNS/hosting provider |

---

## 3. Three Portals

| Portal | Route prefix | Primary users |
|---|---|---|
| Operations | `/operations/*` | admin, staff, operations, cleaner, maintenance |
| Corporate | `/corporate/*` | corporate clients |
| Guest | `/guest/*` | guests with active bookings |

Each portal has its own layout and route guards. Role is resolved from `user_roles` table via `auth.uid()` — never from JWT claims directly.

---

## 4. Database Architecture

**Supabase project:** https://iylgkiwalhqlgwzhwlnd.supabase.co
**65 tables** across 9 domains.

### Domain Map

#### Properties
`properties`, `property_access`, `property_assets`, `property_bedrooms`, `property_documents`, `property_house_details`, `property_maintenance_profile`, `property_media`, `property_media_bundles`, `property_media_items`, `property_parties`, `property_portal_accounts`, `property_pricing`, `seasonal_plans`, `tenancies`, `utility_accounts`

#### Bookings & Guests
`bookings`, `booking_guests`, `booking_guest_contacts`, `booking_lifecycle_prompts`, `booking_notes`, `booking_portal_access`, `guest_portal_accounts`, `provisioning_runs`

#### Clients & Leads
`clients`, `client_contacts`, `leads`, `lead_notes`, `outreach_leads`, `website_leads`, `letting_agents`, `landlords`

#### Tasks & Tickets
`tasks`, `assigned_tasks`, `task_media`, `tickets`, `ticket_timeline`, `ticket_followups`, `ticket_photos`, `vendors`

#### Inspections
`monthly_inspections`, `inspection_items`, `inspection_photos`, `inspection_cycles`, `routine_schedule_area_defaults`, `routine_schedule_assignments`, `routine_schedule_review_queue`

#### AI / Memory
`ai_conversations`, `ai_messages`, `kb_articles`

#### WhatsApp / Comms
`whatsapp_groups`, `whatsapp_group_messages`, `whatsapp_group_participants`, `whatsapp_media_registry`, `whatsapp_send_log`

#### Staff / Auth / Audit
`profiles`, `user_roles`, `staff_contacts`, `notifications`, `audit_log`

#### Finance / Voice / Social
`invoices`, `phone_handoff_sessions`, `social_assets`, `social_posts`, `social_post_assets`

### Key Query Rules
- **Never use `select('*')`** — always specify explicit columns
- **Always paginate** — limit 50 rows unless explicitly aggregating
- **Role resolution** — always query `public.user_roles` with `auth.uid()`, never trust JWT role claims
- **RLS** — every table must have RLS enabled; review policies before any schema change

---

## 5. n8n Workflows — Complete Map

| Workflow | Status | Trigger | Purpose |
|---|---|---|---|
| Inbound Lead Engine | ✅ ACTIVE | Webhook (form submit) | Receive website lead → SMS/email to CS → auto-reply to lead → mark bot-replied in Supabase |
| WhatsApp Bot | ✅ ACTIVE | Webhook (Meta webhook) | Receive WA message → normalise → route by role → AI Concierge (guest) or AI Assistant (staff) → send reply + log |
| AI Assistant | ✅ ACTIVE | Webhook + sub-workflow | Ops staff assistant with 18 tools: search properties, bookings, tasks, tickets, access pack, appliances, check-ins/outs, inspections, media bundles, knowledge base |
| AI Concierge | ✅ ACTIVE | Webhook + sub-workflow | Guest-facing AI with booking/property validation gate + 8 tools: access pack, property details, appliances, booking, tickets, create ticket |
| Guest Onboarding / Provisioning | ✅ ACTIVE | 3 triggers: new booking, property added, scheduled checkout | Provision guest portal account → check WhatsApp capability → send WA onboarding template or SMS fallback → rotate property portal password on checkout |
| Voicebot | ✅ ACTIVE | Webhook (Vapi tool call) | Receive CS_ReceptionistHandoff from Vapi → validate → respond to Vapi → redirect caller to hold (Twilio) → format phone → SMS to Lisa → outbound staff screening call |
| Daily Staff Briefing | ⚠️ ACTIVE (schedule disabled) | Schedule 07:30 daily | Pull staff_contacts → AI agent generates briefing → Twilio SMS to staff (Build summary node is placeholder — needs completion) |
| Outbound Outreach Engine | ✅ ACTIVE | Manual | Pull prospects from `leads` table → OpenAI personalise message → Gmail send → update row in Supabase |
| Invoicing | ❌ INACTIVE | Manual | Xero create invoice — skeleton only, not production |

### AI Assistant Tools (18)
Search Properties, Get Property Details, Get Property Access Pack, List Property Appliances, Get Property Media, Get Property Bundle, Get Advertisement Package, Search Bookings, Get Booking Details, Update Booking, List Tasks, Create/Update Task, List Tickets, List Property Tickets, Create Property Ticket, Update Ticket, List Inspections, SOP/Knowledge Query

### AI Concierge Tools (8)
Get Property Access Pack, Get Property Details, List Property Appliances, Get Booking Details, List Tickets, Create Ticket, (direct WhatsApp bot trigger), (web app trigger)

---

## 6. Voice Architecture (Vapi + Twilio)

**Vapi assistant:** City Stays / persona name: Jane
**LLM:** gpt-4o-mini
**Voice:** ElevenLabs eleven_flash_v2_5
**Transcriber:** Deepgram nova-3 with denoising

**Jane's flow (narrow and intentional):**
1. Greet caller
2. Collect full name
3. Collect callback number
4. Collect short reason
5. Confirm details
6. Call `CS_ReceptionistHandoff` tool
7. Say: "Perfect. Please hold while I try one of our team now."
8. Stop speaking — n8n takes over

**Handoff tool:** `CS_ReceptionistHandoff` → fires webhook to n8n Voicebot workflow
**Required fields:** `caller_name`, `callback_number`, `reason`
**n8n then:** Respond to Vapi → redirect caller to Twilio hold → SMS to +353873997295 (Lisa) → outbound staff screening call

**Architecture principle:** Twilio owns live call control. Vapi only handles AI intake. n8n handles orchestration and logging. Never let Vapi own hold, conference, or bridging.

**Phone handoff sessions table:** `phone_handoff_sessions` — tracks every handoff with idempotency_key, attempt_count, status, staff call SID.

---

## 7. WhatsApp Architecture

**Number:** +353 51 813 144 (Meta WhatsApp Cloud API)
**Routing logic in WhatsApp Bot workflow:**
1. Receive webhook from Meta
2. Normalise payload → extract sender phone, message type, group/DM flag
3. Resolve identity from `staff_contacts` or `booking_guests` by phone_e164
4. Route by role:
   - Guest → call AI Concierge sub-workflow
   - Staff/admin → call AI Assistant sub-workflow
   - Unknown → create `website_leads` record + send generic reply
5. For groups: resolve group context from `whatsapp_groups` → compute if should respond → build group concierge payload
6. Send reply via Meta Graph API + log to `whatsapp_send_log`

**Key tables:** `whatsapp_groups`, `whatsapp_group_messages`, `whatsapp_group_participants`, `whatsapp_media_registry`, `whatsapp_send_log`

**⚠️ Important:** Zero frontend visibility for WhatsApp/voice despite full backing tables. Building a comms inbox is a Phase 2 priority.

---

## 8. Critical Security Issues — Fix Before Production Hardening

These are known audit findings. Do NOT deploy around these — fix them.

| # | Issue | Risk | Fix |
|---|---|---|---|
| 1 | `public.current_role()` shadows Postgres built-in | Can break unrelated queries | Rename function |
| 2 | `auth.admin.listUsers({ perPage: 1000 })` — O(N) scan | Breaks past 1000 users | Filter by email server-side |
| 3 | Dead `.rpc('', {})` stub in `provision-guest-portal-account` ~line 68 | Throws if reached | Remove stub |
| 4 | `website_leads` anon REST INSERT policy | Attackers bypass honeypot | Remove anon INSERT, enforce edge function only |
| 5 | `property-media` bucket may be public | Access codes/videos enumerable | Set private + signed URLs |
| 6 | `ai-chat` edge function doesn't gate by role | Any auth'd user incl. guest hits ops endpoint | Add role check |
| 7 | Hardcoded n8n URL in `src/data/services.ts:5169` | n8n URL exposed in browser bundle | Move to edge function |
| 8 | `send-guest-credentials` returns cleartext password in HTTP response | Password exposed in logs | Remove from response body |
| 9 | `app_role` enum may be missing `operations` and `cleaner` | RLS helpers break | Confirm enum values in live DB |
| 10 | `admin-create-staff-user` deletes then inserts `user_roles` non-atomically | Race window: user has no role | Wrap in transaction or use upsert |
| 11 | No DB triggers for notifications | External state changes never notify | Add Postgres triggers or edge function hooks |
| 12 | Voice/WhatsApp have no frontend visibility | Operations blind to comms | Build comms inbox module |

---

## 9. Known Dead Code / Drift Risk

- `src/stores/authStore.ts` + `leadsStore.ts` — mock-backed, orphaned, not connected to Supabase
- `Clients.tsx` + `Landlords.tsx` — orphan files; merged view is the live one
- Duplicate edge functions: `admin-create-staff-user` vs `admin-upsert-staff-member`
- `Daily Staff Briefing` — schedule trigger disabled; "Build summary" node has placeholder logic
- `Outbound Outreach Engine` — active but Gmail send target is hardcoded to `kcodee20@gmail.com` (test)
- `Invoicing` — inactive, Xero not connected to production

---

## 10. What Works Well (Do Not Break)

- Properties, Bookings, Tickets, Assigned Tasks, Inspections, Operations Diary — live and working
- Auth + RBAC via `user_roles` with `ProtectedRoute` — role-gated portals working
- Guest portal provisioning + portal account management
- Notifications inbox with Supabase realtime
- WhatsApp routing architecture (staff/guest/unknown/group)
- AI Assistant with 18 tools — ops staff assistant
- AI Concierge with booking/property validation gate
- Vapi voice receptionist (Jane) — narrow, intentional scope

---

## 11. What Is Partial / Placeholder

- `MobileKey` in Guest portal — fully simulated
- `ProximityMap` in Corporate portal — mock data
- Public `/locations` page — mock data
- `Social Media → Content Ideas` — hardcoded templates
- `TaskDetailPage` — missing `task_photos` / `task_timeline` tables
- `Compliance` page — read-only, no logic
- i18n — EN + UK translation files only; 6 languages declared but not translated
- `Daily Staff Briefing` — AI agent present, summary node is placeholder
- `Invoicing` — Xero skeleton, inactive

---

## 12. Non-Negotiable Rules

1. **Never use `select('*')`** — always list explicit columns
2. **Always paginate** — max 50 rows per query unless aggregating
3. **Role from `user_roles` only** — query `public.user_roles` with `auth.uid()`, never JWT claims
4. **Preserve working functionality** — no destructive rewrites without explicit approval
5. **Small, testable, reversible changes only** — never rewrite a module in one PR
6. **Plan before implementing** — produce a file-level plan, get approval, then implement
7. **Never expose secrets** — no API keys, tokens, or credentials in code or git
8. **Supabase RLS required** — review policies before any schema change; always provide rollback migration
9. **Payment flows untouched** — Xero not connected; do not change invoice logic without approval
10. **Never alter production data** — use migration files with down migrations; test on staging first
11. **Use `DataStateGuard`** — for loading/error/empty states across all data-fetching components
12. **Storage uploads must clean up orphans** — on DB failure, clean up uploaded file
13. **Use role constant `operations` not `staff`** for operations context in RLS helpers
14. **All n8n webhook URLs must live in edge functions or environment variables** — never in frontend bundle
15. **Every AI agent action must be logged** — to `audit_log` or relevant domain table

---

## 13. Coding Standards

- TypeScript strict mode — no `any` types without explicit justification
- Component pattern: feature folder with `index.tsx`, `hooks/`, `components/`
- Supabase queries via service functions in `src/lib/services/` — not inline in components
- Error handling: always surface errors via `DataStateGuard` — no silent failures
- Naming: `camelCase` for variables/functions, `PascalCase` for components, `snake_case` for DB columns

---

## 14. QA Checklist — Must Pass Before Every Deployment

- [ ] Auth: login works for admin, staff, cleaner, maintenance, guest roles
- [ ] Properties: list loads, property detail opens, access pack visible to correct roles
- [ ] Bookings: create, view, status update works
- [ ] Tickets: create, assign, close, timeline visible
- [ ] Tasks: assign, complete, notify works
- [ ] Inspections: start, complete, photos upload works
- [ ] Guest portal: login, booking visible, AI concierge responds
- [ ] WhatsApp: test message routes correctly by role
- [ ] Voice: test call reaches Jane, handoff triggers SMS to Lisa
- [ ] Lead intake: website form submits → lead appears in Supabase → SMS/email fired
- [ ] Guest provisioning: new booking → portal account created → WA/SMS sent
- [ ] n8n: all active workflows have 0 failed executions in last 24hrs
- [ ] No hardcoded secrets in browser bundle (check build output)
- [ ] RLS: guest cannot read another guest's booking; staff cannot read property_access without correct role

---

## 15. Deployment Notes

- Frontend: deployed via Lovable / confirm production hosting provider
- Database: Supabase hosted — migrations via Supabase CLI (`supabase db push`)
- Edge Functions: deployed via Supabase CLI (`supabase functions deploy [name]`)
- n8n: cloud-hosted at kyle2000.app.n8n.cloud — export all workflows as JSON to `/workflows/` in repo before any change
- Rollback: every migration must have a corresponding down migration; every n8n change must have the previous JSON backed up

---

## 16. Current Top Priorities

1. **Security hardening** — Fix the 12 critical issues in Section 8 before any new features
2. **Remove hardcoded secrets** — Rotate any credentials that appear in exported workflow JSONs; move all n8n URLs to environment variables
3. **Daily Staff Briefing completion** — Complete the "Build summary" node with real property/task/booking data
4. **Comms inbox** — Build frontend visibility for WhatsApp and voice (6 tables exist with no UI)
5. **Guest portal polish** — Replace mock MobileKey and ProximityMap with real implementations

---

## 17. Environment Variables Required

```
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # edge functions only, never frontend

# n8n webhook URLs (edge functions only)
N8N_WEBHOOK_LEAD_INTAKE=
N8N_WEBHOOK_WHATSAPP=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Vapi
VAPI_API_KEY=

# OpenAI
OPENAI_API_KEY=

# Meta WhatsApp
META_WA_ACCESS_TOKEN=
META_WA_PHONE_NUMBER_ID=
META_WA_VERIFY_TOKEN=

# ElevenLabs
ELEVENLABS_API_KEY=

# Xero (future)
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
```

---

## 18. Files of Note

```
src/
  data/services.ts          ← LARGE: main Supabase service layer; contains hardcoded n8n URL at ~line 5169
  contexts/AuthContext.tsx  ← auth + role resolution
  stores/authStore.ts       ← DEAD: mock-backed, orphaned
  stores/leadsStore.ts      ← DEAD: mock-backed, orphaned
  pages/operations/         ← Operations portal pages
  pages/guest/              ← Guest portal pages
  pages/corporate/          ← Corporate portal pages

supabase/
  functions/                ← 11 edge functions
  migrations/               ← DB migration history

workflows/                  ← n8n JSON exports (add to repo — does not exist yet)
docs/
  ARCHITECTURE.md
  DATABASE.md
  QA_CHECKLIST.md
  DEPLOYMENT.md
```

---

*Last updated: 27 May 2026 — Generated from full schema export (65 tables), 9 n8n workflow JSONs, Vapi config, and architecture audit.*
