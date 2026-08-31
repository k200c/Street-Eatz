import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  MIN_WORDS_PER_PAGE,
  proseWordCount,
  validateSeoPages,
  type SeoPageDefinition,
} from './seoPages.ts';

const content = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/content/seo-pages.json'), 'utf8'),
) as { pages: SeoPageDefinition[] };

const pages = content.pages;

test('the shipped content set passes every publishing invariant', () => {
  const problems = validateSeoPages(pages);
  assert.deepEqual(problems, [], `content problems:\n  ${problems.join('\n  ')}`);
});

test('every route the app prerenders is present exactly once', () => {
  const expected = [
    '/menu',
    '/burgers',
    '/flatbreads',
    '/loaded-fries',
    '/allergens',
    '/catering',
  ].sort();
  const actual = pages.map((page) => page.route).sort();
  assert.deepEqual(actual, expected);
});

test('titles are unique — duplicate titles compete with each other in search', () => {
  const titles = pages.map((page) => page.title);
  assert.equal(new Set(titles).size, titles.length);
});

test('every title names Waterford, since Waterford also exists in the US', () => {
  for (const page of pages) {
    assert.match(page.title, /Waterford/i, `${page.route} title omits Waterford`);
  }
});

test('every page carries enough prose to be quotable', () => {
  for (const page of pages) {
    const words = proseWordCount(page);
    assert.ok(
      words >= MIN_WORDS_PER_PAGE,
      `${page.route} has ${words} words, needs ${MIN_WORDS_PER_PAGE}`,
    );
  }
});

test('the allergen page renders from the database rather than fixed copy', () => {
  const allergens = pages.find((page) => page.route === '/allergens');
  assert.ok(allergens, '/allergens page missing');
  assert.equal(allergens.renderAllergenTable, true);
  // No hardcoded dish names — the table is generated, so the copy must not
  // duplicate menu content that would go stale.
  assert.equal(allergens.categories?.length ?? 0, 0);
});

test('validateSeoPages actually catches the problems it claims to', () => {
  const thin: SeoPageDefinition = {
    route: 'burgers',
    title: 'Burgers',
    description: '',
    h1: '',
    intro: 'Short.',
  };
  const problems = validateSeoPages([thin, thin]);

  assert.ok(problems.some((p) => p.includes('must start with')));
  assert.ok(problems.some((p) => p.includes('duplicate route')));
  assert.ok(problems.some((p) => p.includes('Waterford')));
  assert.ok(problems.some((p) => p.includes('missing description')));
  assert.ok(problems.some((p) => p.includes('missing h1')));
  assert.ok(problems.some((p) => p.includes('under the')));
});
