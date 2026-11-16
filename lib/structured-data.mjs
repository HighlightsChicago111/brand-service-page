// JSON-LD structured data for the brand pages. Every value comes from the same data the page renders;
// a field the page does not have is left out, never filled in.
// The @id strings below are shared with the rest of www.highlightschicago.com: keep them exactly as they are.
import { SITE } from './site.mjs';
import { BRANDS_PATH, brandPath } from './brands.mjs';

export const BUSINESS_ID = 'https://www.highlightschicago.com/#business';
export const WEBSITE_ID = 'https://www.highlightschicago.com/#website';

/** Absolute URL on the live site for a path such as /brands/tesla. */
export const absUrl = (path) => `${SITE.live}${path.startsWith('/') ? path : `/${path}`}`;

const text = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** The JSON for a <script type="application/ld+json">, with "<" escaped so the data can never close the tag. */
export const jsonLdHtml = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function breadcrumbList(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, url }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      ...(url ? { item: url } : {}),
    })),
  };
}

function service({ name, serviceType, url, description, brand, image }) {
  return {
    '@type': 'Service',
    name,
    ...(serviceType && (!Array.isArray(serviceType) || serviceType.length) ? { serviceType } : {}),
    url,
    ...(description ? { description } : {}),
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    provider: { '@id': BUSINESS_ID },
    areaServed: { '@type': 'City', name: 'Chicago, IL' },
    ...(image ? { image } : {}),
  };
}

/**
 * /brands: the collection page and the list of brand pages it shows.
 * @param {{name: string, description?: string, brands: {name: string, slug: string, liveCount: number}[]}} p
 *   `brands` from buildBrands(); only brands with a published page are listed, in the order the page shows them.
 */
export function brandsIndexJsonLd({ name, description, brands }) {
  const url = absUrl(BRANDS_PATH);
  const listed = brands.filter((b) => b.liveCount > 0);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        url,
        name,
        ...(description ? { description } : {}),
        about: { '@id': BUSINESS_ID },
        isPartOf: { '@id': WEBSITE_ID },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: listed.length,
          itemListElement: listed.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, url: absUrl(brandPath(b.slug)) })),
        },
      },
      breadcrumbList([{ name: 'Home', url: SITE.live }, { name: 'Brands', url }]),
    ],
  };
}

/**
 * /brands/<brand>: one brand's services.
 * @param {{name: string, description?: string, image?: string|null, brand: {name: string, slug: string, services: {live: boolean, short: string}[]}}} p
 *   `name` is the page H1, `description` the meta description, `image` the hero photo path.
 */
export function brandHubJsonLd({ name, description, image, brand }) {
  const url = absUrl(brandPath(brand.slug));
  const types = [...new Set(brand.services.filter((s) => s.live).map((s) => text(s.short)).filter(Boolean))];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      service({
        name, url, description, brand: brand.name,
        serviceType: types.length === 1 ? types[0] : types,
        image: image ? absUrl(image) : null,
      }),
      breadcrumbList([{ name: 'Home', url: SITE.live }, { name: 'Brands', url: absUrl(BRANDS_PATH) }, { name: brand.name, url }]),
    ],
  };
}

/** The page H1 exactly as the hero renders it: the headline, a space, then the highlighted words. */
export function brandServiceH1(doc) {
  const h = doc.hero || {};
  return text(`${h.headline || ''} ${h.headlineHighlight || ''}`);
}

/**
 * /brands/<brand>/<page>: one brand service page from Sanity.
 * @param {{doc: Record<string, any>, path: string, brandHref: string, heroImage?: string|null}} p
 *   `doc` is the scrubbed document the page renders, `path` its canonical path, `brandHref` the brand page
 *   path, `heroImage` the hero photo URL from Sanity (null when the page falls back to a stock photo).
 */
export function brandServiceJsonLd({ doc, path, brandHref, heroImage }) {
  const url = absUrl(path);
  // The same crumbs and links the hero breadcrumb shows; the last crumb is this page.
  const crumbs = doc.breadcrumb?.length ? doc.breadcrumb : ['Home', 'Brands', doc.brand, doc.title];
  const hrefs = [SITE.live, absUrl(BRANDS_PATH), absUrl(brandHref)];
  const graph = [
    service({
      name: brandServiceH1(doc) || text(doc.title),
      serviceType: text(doc.service),
      url,
      description: text(doc.seo?.metaDescription),
      brand: text(doc.brand),
      image: heroImage || null,
    }),
    breadcrumbList(crumbs.map((c, i) => ({ name: text(c), url: i === crumbs.length - 1 ? url : hrefs[i] }))),
  ];
  // Only when the page shows its FAQ section, with the questions and answers as shown.
  const faqs = (doc.faq?.items || [])
    .map((q) => ({ question: text(q?.question), answer: text(q?.answer) }))
    .filter((q) => q.question && q.answer);
  if (faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      url,
      mainEntity: faqs.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
