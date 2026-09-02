// enquiry — catering / event enquiry capture from the public /catering page
// ─────────────────────────────────────────────────────────────────────
// Same posture as `feedback`: called by an UNAUTHENTICATED visitor, so
// `verify_jwt = false`, and there is deliberately NO anon INSERT policy on the
// underlying table. All writes go through public.submit_enquiry(...), which is
// service-role only, validates every field before writing, and caps a contact
// at 3 enquiries per hour. This function adds an origin allow-list and a
// per-IP limit on top, then passes the call through.
//
// Route (POST only):
//   POST /enquiry  { name, message, email?, phone?, enquiry_type?, event_date?,
//                    guest_count?, event_location?, source_page? }
//
// Never returns another person's data. Never distinguishes "rate limited by
// contact" from "invalid" beyond what submit_enquiry itself reports.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS") || "";
const allowedOriginsList = ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);

const MAX = { name: 120, message: 2000, email: 200, phone: 40, location: 200, type: 40, source: 200 };

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = !!origin && allowedOriginsList.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : (allowedOriginsList[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Best-effort per-IP limit, same pattern as feedback. submit_enquiry enforces
// the per-contact limit that actually matters; this just makes abuse cheap to stop.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  if (rateLimitMap.size > 5000) {
    for (const [key, entry] of rateLimitMap) if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  const entry = rateLimitMap.get(identifier);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

const str = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, cors);

  try {
    if (origin && !allowedOriginsList.includes(origin)) {
      console.warn("[enquiry] Blocked origin:", origin);
      return jsonResponse({ error: "Forbidden" }, 403, cors);
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(clientIp)) return jsonResponse({ ok: false, error: "Too many requests" }, 429, cors);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400, cors);

    // Honeypot: bots fill every field. A human never sees this one.
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonResponse({ ok: true }, 200, cors);
    }

    const name = str(body.name, MAX.name);
    const message = str(body.message, MAX.message);
    if (!name || !message) return jsonResponse({ ok: false, error: "Name and message are required" }, 400, cors);

    const email = str(body.email, MAX.email);
    const phone = str(body.phone, MAX.phone);
    if (!email && !phone) return jsonResponse({ ok: false, error: "An email address or phone number is required" }, 400, cors);

    const guestRaw = Number(body.guest_count);
    const guestCount = Number.isInteger(guestRaw) && guestRaw > 0 && guestRaw < 100000 ? guestRaw : null;

    const eventDateRaw = str(body.event_date, 10);
    const eventDate = eventDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw) ? eventDateRaw : null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The RPC validates again and enforces the per-contact hourly cap.
    const { data, error } = await supabase.rpc("submit_enquiry", {
      p_name: name,
      p_message: message,
      p_email: email,
      p_phone: phone,
      p_enquiry_type: str(body.enquiry_type, MAX.type) ?? "catering",
      p_event_date: eventDate,
      p_guest_count: guestCount,
      p_event_location: str(body.event_location, MAX.location),
      p_source_page: str(body.source_page, MAX.source) ?? "/catering",
    });

    if (error) {
      // Never log the message body or contact details.
      console.error("[enquiry] submit_enquiry error:", error.code ?? error.message);
      return jsonResponse({ ok: false, error: "We could not save your enquiry. Please try again." }, 200, cors);
    }

    return jsonResponse((data ?? { ok: true }) as Record<string, unknown>, 200, cors);
  } catch (err) {
    console.error("[enquiry] Unexpected error:", err instanceof Error ? err.message : err);
    return jsonResponse({ ok: false, error: "Internal server error" }, 500, cors);
  }
});
