import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoogleReviewUrl } from './googleReviewUrl.ts';

test('accepts and normalizes a direct Google review URL', () => {
  assert.equal(
    normalizeGoogleReviewUrl(' https://search.google.com/local/writereview?placeid=ChIJ-example '),
    'https://search.google.com/local/writereview?placeid=ChIJ-example',
  );
});

test('accepts Google Business Profile g.page review links', () => {
  assert.equal(
    normalizeGoogleReviewUrl('https://g.page/r/example/review'),
    'https://g.page/r/example/review',
  );
});

test('rejects non-review and non-Google destinations', () => {
  assert.equal(normalizeGoogleReviewUrl('https://example.com/review'), null);
  assert.equal(normalizeGoogleReviewUrl('https://search.google.com/local/writereview'), null);
  assert.equal(normalizeGoogleReviewUrl('javascript:alert(1)'), null);
});

