import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { useProducts } from '@/hooks/useProducts';
import { useAllProductAllergens, ALLERGEN_KEY } from '@/hooks/useProductAllergens';
import { useBusinessProfile } from '@/hooks/useBusinessProfile';
import { CateringEnquiryForm } from '@/components/customer/CateringEnquiryForm';
import seoPages from '@/content/seo-pages.json';
import type { Product, ProductCategory } from '@/types/database';

/**
 * Renders the prerendered marketing routes (/menu, /burgers, /flatbreads,
 * /loaded-fries, /allergens, /catering) inside the app.
 *
 * Copy comes from src/content/seo-pages.json — the same file scripts/prerender.mjs
 * reads to emit the crawlable HTML — so what a crawler sees and what a person
 * sees cannot drift. Prices and dish text come from the live menu, never from
 * the JSON.
 */

interface SeoSection {
  h2: string;
  body: string;
}

interface SeoFaq {
  q: string;
  a: string;
}

interface SeoPage {
  route: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  categories?: string[];
  sections?: SeoSection[];
  faq?: SeoFaq[];
  renderAllergenTable?: boolean;
  showEnquiryForm?: boolean;
}

const PAGES = (seoPages as { pages: SeoPage[] }).pages;

const formatEuro = (value: number) => `€${Number(value ?? 0).toFixed(2)}`;

function useDocumentHead(page: SeoPage | undefined) {
  useEffect(() => {
    if (!page) return;

    const previousTitle = document.title;
    document.title = page.title;

    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content') ?? null;
    description?.setAttribute('content', page.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute('href') ?? null;
    canonical?.setAttribute('href', `${window.location.origin}${page.route}`);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null) description?.setAttribute('content', previousDescription);
      if (previousCanonical !== null) canonical?.setAttribute('href', previousCanonical);
    };
  }, [page]);
}

function MenuSectionBlock({ category, products }: { category: string; products: Product[] }) {
  const items = products.filter((product) => product.category === category);
  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">
        {category}
      </h2>
      <ul className="mt-3 space-y-0">
        {items.map((item) => (
          <li key={item.id} className="border-b border-border py-3 last:border-0">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-heading text-base text-foreground">{item.name}</h3>
              <span className="whitespace-nowrap font-heading text-base text-primary tabular-nums">
                {formatEuro(item.price)}
              </span>
            </div>
            {item.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AllergenTable({ products }: { products: Product[] }) {
  const { data: allergenMap, isLoading, error } = useAllProductAllergens();

  if (isLoading) {
    return <div className="mt-8 h-64 animate-pulse rounded-lg bg-secondary/30" />;
  }

  if (error) {
    return (
      <p className="mt-8 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        Allergen information could not be loaded. Please ask us directly before ordering.
      </p>
    );
  }

  if (products.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        The menu is being updated. Please ask us directly about allergens.
      </p>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">
        Allergens by menu item
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-3 font-heading font-bold uppercase">Item</th>
              <th className="py-2 pr-3 font-heading font-bold uppercase">Category</th>
              <th className="py-2 font-heading font-bold uppercase">Allergens</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const numbers = allergenMap?.get(product.id);
              const confirmed = Array.isArray(numbers) && numbers.length > 0;
              return (
                <tr key={product.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 text-foreground">{product.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{product.category}</td>
                  <td className="py-2 text-muted-foreground">
                    {confirmed
                      ? [...numbers].sort((a, b) => a - b).map((n) => `${n} ${ALLERGEN_KEY[n] ?? 'Unknown'}`).join(', ')
                      : 'Not yet confirmed — please ask before ordering'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Key:</strong>{' '}
        {Object.entries(ALLERGEN_KEY).map(([number, name]) => `${number} ${name}`).join(' · ')}
      </p>
    </section>
  );
}

function CateringContact() {
  const { data: profile } = useBusinessProfile();
  const email = profile?.email ?? null;
  const telephone = profile?.telephone ?? null;

  return (
    <section className="street-card mt-8 p-5">
      <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">
        Enquire about food truck hire
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Send the date, the location, roughly how many people, and the time you would like food
        served. We will come back with a price and what is realistic for that headcount.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {email && (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent('Food truck hire enquiry')}`}
            className="btn-glow flex h-12 items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold uppercase tracking-wider text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Email your enquiry
          </a>
        )}
        {telephone && (
          <a
            href={`tel:${telephone.replace(/\s+/g, '')}`}
            className="flex h-12 items-center justify-center rounded-lg border border-border font-heading text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
          >
            Call {telephone}
          </a>
        )}
        {!email && !telephone && (
          <Link
            to="/details"
            className="flex h-12 items-center justify-center rounded-lg border border-border font-heading text-sm font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-secondary"
          >
            Get our contact details
          </Link>
        )}
      </div>
    </section>
  );
}

export default function MarketingPage() {
  const { pathname } = useLocation();
  const page = useMemo(
    () => PAGES.find((candidate) => candidate.route === pathname.replace(/\/+$/, '') || candidate.route === pathname),
    [pathname],
  );

  useDocumentHead(page);

  const { data: products = [], isLoading: productsLoading } = useProducts('All');

  // /allergens lists every visible item, sorted for scanning rather than by menu order.
  const allProducts = useMemo(
    () => [...products].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [products],
  );

  if (!page) {
    return (
      <div className="flex flex-col" style={{ minHeight: '100dvh' }}>
        <Navbar />
        <main className="mx-auto w-full max-w-2xl px-5 pt-[var(--header-offset)]">
          <h1 className="mt-10 font-heading text-2xl font-bold uppercase">Page not found</h1>
          <Link to="/menu" className="mt-4 inline-block text-primary underline">
            View the menu
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh' }}>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-[calc(var(--header-offset)+1.5rem)]">
        <h1 className="font-heading text-2xl font-bold uppercase leading-tight tracking-wide text-foreground sm:text-3xl">
          {page.h1}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{page.intro}</p>

        {productsLoading && (page.categories?.length || page.renderAllergenTable) ? (
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-secondary/30" />
            ))}
          </div>
        ) : (
          <>
            {page.categories?.map((category) => (
              <MenuSectionBlock
                key={category}
                category={category as ProductCategory}
                products={products}
              />
            ))}
            {page.renderAllergenTable && <AllergenTable products={allProducts} />}
          </>
        )}

        {page.sections?.map((section) => (
          <section key={section.h2} className="mt-8">
            <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">
              {section.h2}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}

        {page.showEnquiryForm && (<><CateringContact /><CateringEnquiryForm /></>)}

        {(page.categories?.length ?? 0) > 0 && (
          <Link
            to="/"
            className="btn-glow mt-8 flex h-14 items-center justify-center rounded-lg bg-primary font-heading text-base font-bold uppercase tracking-wider text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Order online for collection
          </Link>
        )}

        {page.faq && page.faq.length > 0 && (
          <section className="mt-10">
            <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-primary">
              Common questions
            </h2>
            <dl className="mt-3 space-y-4">
              {page.faq.map((entry) => (
                <div key={entry.q}>
                  <dt className="font-heading text-base text-foreground">{entry.q}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{entry.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
