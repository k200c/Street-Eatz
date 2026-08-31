/**
 * Invariants for the prerendered marketing pages.
 *
 * These are the properties that make the pages worth having at all: a unique
 * indexable title per route, geographic disambiguation (Waterford exists in
 * Wisconsin and Connecticut too), and enough real prose that an answer engine
 * has something to quote. Thin pages do not rank, so "is there enough content"
 * is a test, not a matter of taste.
 */

export interface SeoPageSection {
  h2: string;
  body: string;
}

export interface SeoPageFaq {
  q: string;
  a: string;
}

export interface SeoPageDefinition {
  route: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  categories?: string[];
  sections?: SeoPageSection[];
  faq?: SeoPageFaq[];
  renderAllergenTable?: boolean;
  showEnquiryForm?: boolean;
}

/** Minimum prose per page, excluding live menu data injected at build time. */
export const MIN_WORDS_PER_PAGE = 300;

/** Search results truncate well past this; treat it as the practical ceiling. */
export const MAX_DESCRIPTION_LENGTH = 200;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Every word of prose on the page that does not come from the live menu. */
export function proseWordCount(page: SeoPageDefinition): number {
  const parts = [
    page.h1,
    page.intro,
    ...(page.sections ?? []).flatMap((section) => [section.h2, section.body]),
    ...(page.faq ?? []).flatMap((entry) => [entry.q, entry.a]),
  ];
  return parts.reduce((total, part) => total + countWords(part ?? ''), 0);
}

/**
 * Returns a list of human-readable problems. Empty array means the content set
 * is publishable.
 */
export function validateSeoPages(pages: SeoPageDefinition[]): string[] {
  const problems: string[] = [];

  if (pages.length === 0) problems.push('no pages defined');

  const seenRoutes = new Set<string>();
  const seenTitles = new Set<string>();

  for (const page of pages) {
    const id = page.route || '(missing route)';

    if (!page.route?.startsWith('/')) problems.push(`${id}: route must start with "/"`);
    if (seenRoutes.has(page.route)) problems.push(`${id}: duplicate route`);
    seenRoutes.add(page.route);

    if (!page.title?.trim()) problems.push(`${id}: missing title`);
    else {
      if (seenTitles.has(page.title)) problems.push(`${id}: duplicate title "${page.title}"`);
      seenTitles.add(page.title);
      if (!/waterford/i.test(page.title)) {
        problems.push(`${id}: title must contain "Waterford" for geographic disambiguation`);
      }
    }

    if (!page.description?.trim()) problems.push(`${id}: missing description`);
    else if (page.description.length > MAX_DESCRIPTION_LENGTH) {
      problems.push(
        `${id}: description is ${page.description.length} chars, over the ${MAX_DESCRIPTION_LENGTH} limit`,
      );
    }

    if (!page.h1?.trim()) problems.push(`${id}: missing h1`);
    if (!page.intro?.trim()) problems.push(`${id}: missing intro`);

    const words = proseWordCount(page);
    if (words < MIN_WORDS_PER_PAGE) {
      problems.push(`${id}: ${words} words of prose, under the ${MIN_WORDS_PER_PAGE} minimum`);
    }

    for (const entry of page.faq ?? []) {
      if (!entry.q?.trim() || !entry.a?.trim()) {
        problems.push(`${id}: FAQ entry with an empty question or answer`);
      }
    }
  }

  return problems;
}
