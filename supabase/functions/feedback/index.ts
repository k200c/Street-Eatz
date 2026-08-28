// feedback — customer rating capture for the post-order feedback link
// ─────────────────────────────────────────────────────────────────────
// Called by an UNAUTHENTICATED customer following a tokenised link from an
// order SMS. Two-way SMS does not exist in Ireland (alphanumeric Sender ID is
// one-way by design), so ratings come back over HTTPS instead of by reply.
//
// Auth posture: `verify_jwt = false`. The TOKEN is the credential. This
// function never accepts an order_id, phone number or display_id for lookup —
// that is the enumeration defect already fixed in get-order-status and it must
// not be reintroduced here.
//
// The token is read from the JSON body, never from the URL or a query string,
// so it stays out of access logs, browser history and Referer headers.
//
// All data access goes through three SECURITY DEFINER RPCs granted to
// service_role. This function performs NO direct table queries.
//
// Routes (both POST):
//   POST /feedback/context  { token }                     -> get_feedback_context
//   POST /feedback/submit   { token, rating, comment? }   -> submit_feedback_by_token

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Site origin allow-list. Never "*" — this endpoint is unauthenticated, so the
// browser-side origin check is one of the few free controls available.
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS") || "https://streeteatzwaterford.ie";
const allowedOriginsList = ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);

const MAX_TOKEN_LENGTH = 200;
const MAX_COMMENT_LENGTH = 2000;

// ── CORS ──────────────────────────────────────────────────────────────

function getCorsHeaders(origin: string | null): Record<string, string> {
  // Echo the origin only when it is on the allow-list. Anything else gets the
  // canonical origin, which the browser will refuse — no wildcard, ever.
  const isAllowed = !!origin && allowedOriginsList.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : (allowedOriginsList[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Rate limiting ─────────────────────────────────────────────────────
// Best-effort, in-memory, resets on cold start — same pattern as get-customers.
// A token is 16 random bytes so brute force is already impractical; this just
// makes it free to stop someone trying.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();

  // Opportunistic prune so the map cannot grow without bound.
  if (rateLimitMap.size > 5000) {
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
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

// ── Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Both routes are POST so the token travels in the body, never the URL.
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  try {
    if (origin && !allowedOriginsList.includes(origin)) {
      console.warn("[feedback] Blocked origin:", origin);
      return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(clientIp)) {
      return jsonResponse({ error: "Too many requests" }, 429, corsHeaders);
    }

    // Route from the trailing path segment: /feedback/context | /feedback/submit
    const route = new URL(req.url).pathname.split("/").filter(Boolean).pop();
    if (route !== "context" && route !== "submit") {
      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    // ── The token is the only accepted identifier ───────────────────────
    // No order_id, no phone, no display_id. Do not add one.
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      // A malformed token is indistinguishable from an expired one by design.
      return jsonResponse(
        route === "context" ? { valid: false } : { ok: false, valid: false },
        200,
        corsHeaders,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Route: context ─────────────────────────────────────────────────
    if (route === "context") {
      const { data, error } = await supabase.rpc("get_feedback_context", { p_token: token });

      if (error) {
        // Never leak why. "Not found" and "expired" must look identical.
        console.error("[feedback] get_feedback_context error:", error.message);
        return jsonResponse({ valid: false }, 200, corsHeaders);
      }

      // The RPC is the authority on validity and on what the customer may see.
      return jsonResponse((data ?? { valid: false }) as Record<string, unknown>, 200, corsHeaders);
    }

    // ── Route: submit ──────────────────────────────────────────────────
    const ratingRaw = body.rating;
    const rating = typeof ratingRaw === "number" ? ratingRaw : Number(ratingRaw);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ ok: false, error: "Rating must be an integer 1-5" }, 400, corsHeaders);
    }

    let comment: string | null = null;
    if (typeof body.comment === "string") {
      const trimmed = body.comment.trim();
      if (trimmed.length > MAX_COMMENT_LENGTH) {
        return jsonResponse({ ok: false, error: "Comment is too long" }, 400, corsHeaders);
      }
      comment = trimmed.length > 0 ? trimmed : null;
    }

    const { data, error } = await supabase.rpc("submit_feedback_by_token", {
      p_token: token,
      p_rating: rating,
      p_comment: comment,
    });

    if (error) {
      console.error("[feedback] submit_feedback_by_token error:", error.message);
      return jsonResponse({ ok: false, valid: false }, 200, corsHeaders);
    }

    // Pass the RPC result through verbatim. `show_review_link` is decided by the
    // database on every rating — do not filter it here. Withholding the review
    // link from low raters is review gating: it breaches Google Business Profile
    // policy and is a misleading commercial practice under the Irish regulations
    // implementing the Omnibus Directive.
    return jsonResponse((data ?? { ok: false, valid: false }) as Record<string, unknown>, 200, corsHeaders);
  } catch (err) {
    // Never log the token.
    console.error("[feedback] Unexpected error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
  }
});
