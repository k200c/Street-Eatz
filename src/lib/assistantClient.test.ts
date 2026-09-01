import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_ENDPOINT,
  interpretAssistantResponse,
  isJsonContentType,
} from './assistantClient.ts';

/** The exact body production returned for POST /api/management-assistant. */
const SPA_FALLBACK_HTML = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />';

test('the endpoint does not depend on a netlify.toml redirect', () => {
  // /api/... only exists as a redirect. When netlify.toml has not shipped, the
  // SPA catch-all answers with index.html, which is how this broke.
  assert.equal(ASSISTANT_ENDPOINT, '/.netlify/functions/management-assistant');
  assert.ok(!ASSISTANT_ENDPOINT.startsWith('/api/'));
});

test('an HTML response is a typed error, not a parse crash', () => {
  const result = interpretAssistantResponse(404, 'text/html; charset=utf-8', SPA_FALLBACK_HTML);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, 'not_reachable');
  assert.equal(result.message, 'The assistant service is not reachable.');
  assert.ok(!result.message.includes('Unexpected token'));
  assert.ok(!result.message.includes('<!doctype'));
});

test('the non-JSON body is captured for the log, capped at 200 chars', () => {
  const long = '<!doctype html>' + 'x'.repeat(500);
  const result = interpretAssistantResponse(404, 'text/html', long);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.bodySample?.length, 200);
});

test('an empty body is also not reachable rather than a crash', () => {
  // Vite dev returns a bare 404 with no body for a POST to an unknown path,
  // which would otherwise throw "Unexpected end of JSON input".
  const result = interpretAssistantResponse(404, null, '');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, 'not_reachable');
});

test('valid JSON with a 200 is a success', () => {
  const result = interpretAssistantResponse<{ message: string }>(
    200,
    'application/json; charset=utf-8',
    '{"message":"Sales are up."}',
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.message, 'Sales are up.');
});

test('the live 401 from the deployed function keeps the server wording', () => {
  // This is what production returns today for the function's own path.
  const result = interpretAssistantResponse(
    401,
    'application/json; charset=utf-8',
    '{"error":"Please sign in as an administrator.","requestId":"ad64f524"}',
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, 'unauthorized');
  assert.equal(result.message, 'Please sign in as an administrator.');
});

test('a 500 with valid JSON is a server error, not unreachable', () => {
  const result = interpretAssistantResponse(500, 'application/json', '{"error":"boom"}');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, 'server_error');
});

test('malformed JSON claiming to be JSON is still handled', () => {
  const result = interpretAssistantResponse(200, 'application/json', '{"message":');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.kind, 'not_reachable');
});

test('content type is matched on the media type, ignoring parameters', () => {
  assert.equal(isJsonContentType('application/json'), true);
  assert.equal(isJsonContentType('application/json; charset=utf-8'), true);
  assert.equal(isJsonContentType('APPLICATION/JSON'), true);
  assert.equal(isJsonContentType('text/html; charset=utf-8'), false);
  assert.equal(isJsonContentType(null), false);
});
