/**
 * Transport for the management assistant.
 *
 * The reported failure was:
 *   Unexpected token '<', "<!doctype "... is not valid JSON
 *
 * That was never an AI fault. The request never reached an AI. The app called
 * /api/management-assistant, which only exists as a redirect in netlify.toml;
 * on production that redirect is not deployed, so the SPA catch-all answered
 * with index.html and JSON.parse died on the first character.
 *
 * Two fixes live here:
 *   1. Call the function's canonical path directly. It needs no redirect and
 *      works whether or not netlify.toml has shipped.
 *   2. Never hand HTML to JSON.parse. Check the content type first and turn a
 *      non-JSON response into a typed error the UI can state plainly.
 */

/**
 * The function's own path. Do not use /api/... — that depends on a netlify.toml
 * redirect and fails silently into the SPA fallback when it is missing.
 */
export const ASSISTANT_ENDPOINT = '/.netlify/functions/management-assistant';

export type AssistantFailureKind =
  | 'not_reachable'
  | 'unauthorized'
  | 'forbidden'
  | 'server_error'
  | 'bad_request';

export interface AssistantSuccess<T> {
  ok: true;
  payload: T;
}

export interface AssistantFailure {
  ok: false;
  kind: AssistantFailureKind;
  /** Safe to show a user as-is. */
  message: string;
  status: number;
  /** First 200 chars of a non-JSON body, for the console only. Never rendered. */
  bodySample?: string;
}

export type AssistantResult<T> = AssistantSuccess<T> | AssistantFailure;

/**
 * Explicit guards. This project compiles with `strict: false`, and without
 * strictNullChecks TypeScript will not narrow the union on `result.ok` alone.
 */
export function isAssistantFailure<T>(result: AssistantResult<T>): result is AssistantFailure {
  return result.ok === false;
}

export function isAssistantSuccess<T>(result: AssistantResult<T>): result is AssistantSuccess<T> {
  return result.ok === true;
}

const NOT_REACHABLE = 'The assistant service is not reachable.';

export function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * Pure so it can be tested without a network. Decides the outcome from the
 * three things that matter: status, content type, and body text.
 */
export function interpretAssistantResponse<T>(
  status: number,
  contentType: string | null,
  bodyText: string,
): AssistantResult<T> {
  // An HTML or empty body means the endpoint was not there. That is a
  // deployment or routing fault, and it must never surface as a parse error.
  if (!isJsonContentType(contentType)) {
    return {
      ok: false,
      kind: 'not_reachable',
      message: NOT_REACHABLE,
      status,
      bodySample: bodyText.slice(0, 200),
    };
  }

  let parsed: (T & { error?: string }) | null = null;
  try {
    parsed = JSON.parse(bodyText) as T & { error?: string };
  } catch {
    return {
      ok: false,
      kind: 'not_reachable',
      message: NOT_REACHABLE,
      status,
      bodySample: bodyText.slice(0, 200),
    };
  }

  if (status >= 200 && status < 300) return { ok: true, payload: parsed as T };

  // The function reports its own errors as JSON, so prefer its wording.
  const serverMessage = typeof parsed?.error === 'string' ? parsed.error : null;

  if (status === 401) {
    return {
      ok: false,
      kind: 'unauthorized',
      message: serverMessage || 'Please sign in as an administrator.',
      status,
    };
  }
  if (status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message: serverMessage || 'Administrator access is required.',
      status,
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      kind: 'server_error',
      message: serverMessage || 'The assistant had a problem. Please try again.',
      status,
    };
  }
  return {
    ok: false,
    kind: 'bad_request',
    message: serverMessage || 'The assistant could not handle that request.',
    status,
  };
}

/** Calls the assistant and returns a result that is never a parse crash. */
export async function callAssistant<T>(
  body: Record<string, unknown>,
  accessToken: string,
): Promise<AssistantResult<T>> {
  let response: Response;
  try {
    response = await fetch(ASSISTANT_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: 'not_reachable', message: NOT_REACHABLE, status: 0 };
  }

  const contentType = response.headers.get('content-type');
  const bodyText = await response.text();
  const result = interpretAssistantResponse<T>(response.status, contentType, bodyText);

  if (isAssistantFailure(result) && result.kind === 'not_reachable' && result.bodySample) {
    // Logged, never rendered: this is the diagnostic that identifies a missing
    // route rather than a broken model.
    console.error(
      `[assistant] non-JSON response from ${ASSISTANT_ENDPOINT} (status ${result.status}):`,
      result.bodySample,
    );
  }

  return result;
}
