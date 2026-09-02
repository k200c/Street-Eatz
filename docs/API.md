# Edge function and serverless API contracts

Every function's auth posture is stated from **reading the source**, not from `config.toml`. `verify_jwt = false` means the gateway does not check; it says nothing about whether the function checks for itself. Several do.

Legend — **Secret**: `Authorization: Bearer <N8N_WEBHOOK_SECRET>`, machine callers only · **JWT**: a user session, verified in-function · **Role**: JWT plus `has_role(admin|staff)` · **Token**: a single-use credential in the body · **None**: open.

## Supabase edge functions (`supabase/functions/`)

| Function | Auth | Called by | Contract |
|---|---|---|---|
| `feedback` | **Token** — token in POST body only; origin allow-list; 10/IP/min | `/rate/:token` page | `POST /feedback/context {token}` → `{valid, display_id, items, already_rated}`; `POST /feedback/submit {token, rating 1-5, comment?}` → `{ok, feedback_id, rating, show_review_link, needs_callback}`. Bad and expired tokens both return `{valid:false}` at 200 — no oracle. Service role, RPC-only: `get_feedback_context`, `submit_feedback_by_token`. **Deployed.** |
| `enquiry` | **None by design** — origin allow-list; 5/IP/min; honeypot; per-contact 3/hour inside the RPC | `/catering` form | `POST /enquiry {name, message, email?\|phone?, event_date?, guest_count?, event_location?, enquiry_type?, source_page?}` → `{ok, …}`. Service role, RPC-only: `submit_enquiry`. No anon INSERT policy exists. **Not deployed.** |
| `confirm-payment` | **Secret** | n8n Payment Processor | `POST {order_id? \| viva_order_code, payment_status, viva_transaction_id?, status?}`. Normalises `paid`→`completed`; sets order `cooking` on payment. Authoritative payment write. |
| `get-order` | **Secret** | n8n | `POST {order_id \| viva_order_code \| display_id}` → order with items. |
| `check-payment-ingestion-lock` | **Secret** | n8n | Idempotency lock on `(provider, transaction_id)` → `{duplicate}`. |
| `get-pending-review-orders` · `mark-review-sms-sent` · `complete-message-context` · `find-active-review-context-by-phone` · `store-google-review-rating` | **Secret** | n8n review flow | Review-request lifecycle. `store-google-review-rating` validates 1–5 and an active context. |
| `get-order-status` | **Secret** (since 25 Aug) | Vapi `order_status` via n8n | `POST {phone_number, customer_name?}` — phone **required**; name is an exact case-insensitive narrowing filter with LIKE wildcards escaped. Previously an unauthenticated name-fragment lookup. |
| `send-broadcast` | **Role** | Marketing composer | `POST {title ≤160, message ≤1600, image_url?}` → `{success, recipients_count}`. SMS only; appends STOP footer; enforces Ireland contact window. |
| `update-order-status` | **Role** | KDS "Mark ready" | `POST {type:'status_update', status, order_id, customer:{name,phone}}` → forwards to n8n status webhook. Returns 200 with `warning` on webhook failure — treat body as truth, not status. |
| `get-customers` | **Role** or `X-Admin-Key`; rate-limited; origin allow-list | none in `src/`; n8n unverified | Paginated customer/staff contact list. Probes a `staff_contacts` table that does not exist (handled). |
| `send-to-kitchen` | **JWT, no role** | both checkouts | `POST {order_id, items[], …}` → forwards payload to n8n kitchen webhook. Only checks the order exists; payload is not validated against it. 200 on failure. |
| `post-now` | **JWT, no role** | **nobody** (frontend bypasses it) | Publishes a social post via n8n. Dead code. |
| `create-voice-order` | **None in code**; absent from `config.toml` | n8n VoiceBot (unverified) | `POST {customer_name, customer_phone, items[{product_name, quantity, addons?, removed_ingredients?, notes?}], special_notes?, call_id?}`. Prices resolved from the DB, never trusted from the payload. The best write path in the system. |
| `get-menu` · `get-wait-time` | **None** | n8n VoiceBot | Public-safe reads. |
| `update-social-post` | **None** — service-role write | n8n generate workflow | `POST {post_id, status?, generated_caption?, media_urls?}`. **Open write; P1.** |
| `create-order` | **None** — service-role write | **nobody** | Validates base price only. Dead code and open. |
| `viva-wallet` | **None on any action** | **nobody** | Hardcodes an n8n URL; has a demo mode. Dead code and open. Delete candidate. |

## Netlify function (`netlify/functions/`)

| Function | Auth | Called by | Contract |
|---|---|---|---|
| `management-assistant` | **Role** — JWT verified, `has_role(admin)` | `ManagementAssistant.tsx` via `src/lib/assistantClient.ts` | `POST /.netlify/functions/management-assistant {action:'chat', messages[]}` → `{message, proposals[]}`; `{action:'confirm', proposalId, proposalType}` → `{result}`. Calls the function's own path — the `/api/…` alias depends on a `netlify.toml` redirect that is not deployed. Tools: `get_management_insight(topic, days)` (24 topics; `topic='topics'` self-describes at `data.topics`), `get_operating_status`, `search_menu_products`, `get_menu_snapshot`, `get_business_snapshot`, `get_preorder_operations`, `get_loyalty_summary`, `propose_product_update`, `propose_operating_setting_update`. Provider: OpenAI (`OPENAI_API_KEY` or `NETLIFY_AI_GATEWAY_KEY`), model `MANAGEMENT_ASSISTANT_MODEL` default `gpt-5.4-mini`. Key presence: **UNKNOWN** from the repo. |

## Database RPCs called from the browser

| RPC | Grant | Used by |
|---|---|---|
| `get_store_status()` | `anon` | `useStoreStatus` — the only source of open/closed/wait time |
| `has_role(uid, role)` | `authenticated` | `AuthContext`, edge functions |
| `get_management_insight(topic, days)` | `authenticated` | assistant tool |
| `get_management_business_snapshot(days, meal_period)` | admin (raises `42501` otherwise) | `useAnalyticsData` |
| `set_foodos_module_enabled(key, enabled)` | admin | `ModuleSettingsPanel` |
| `seo_restaurant_jsonld()` · `seo_menu_jsonld()` · `seo_opening_hours_jsonld()` | `anon` | `scripts/prerender.mjs`, `scripts/generate-seo.mjs` at build |
| `apply_assistant_*_proposal(id)` | admin | assistant confirm path — **do not change** |

## Response conventions

- Machine-facing functions return `{ok:false, error}` or `{success:false, error}` — the codebase has both; new functions use `ok`.
- `send-to-kitchen` and `update-order-status` return HTTP 200 with a `warning` on downstream failure. Read the body.
- Nothing customer-facing distinguishes "not found" from "expired" or "unauthorised" from "no such row" where that difference would be an oracle.
