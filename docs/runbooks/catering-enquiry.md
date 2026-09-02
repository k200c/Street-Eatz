# Runbook — Catering enquiry form

**Path.** `/catering` → `CateringEnquiryForm` → `publicSupabase.functions.invoke('enquiry')` → edge function `supabase/functions/enquiry` → `public.submit_enquiry(...)` (service role) → admin reads `v_enquiry_queue`.

**Why an edge function.** There is no anon INSERT policy on the enquiry table and there must not be one. `submit_enquiry` validates and caps a contact at 3/hour; the function adds an origin allow-list (`ALLOWED_ORIGINS` secret), a per-IP limit and a honeypot field.

**Deploy.** `supabase functions deploy enquiry --project-ref svbilfaanpiyieyxbsss` — `config.toml` still needs the explicit ref habit even though it now names the right project. Until deployed the form returns "That did not send"; the contact block above it still works.

**Test.** `curl -X POST https://svbilfaanpiyieyxbsss.supabase.co/functions/v1/enquiry -H 'Origin: https://streeteatzwaterford.ie' -H 'Content-Type: application/json' -d '{"name":"Test","message":"Testing the form","email":"test@example.com"}'` → `{ok:true,...}`. Then `select * from v_enquiry_queue;` and delete the test row by hand.

**Reversible.** Yes — remove the route element and the function; no schema change.
