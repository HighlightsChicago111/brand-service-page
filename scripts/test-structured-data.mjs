// Tests the JSON-LD builders in lib/structured-data.mjs. No network, no Sanity.
// Run: node scripts/test-structured-data.mjs
import assert from 'node:assert/strict'
import {brandsIndexJsonLd, brandHubJsonLd, brandServiceJsonLd, brandServiceH1, jsonLdHtml, BUSINESS_ID, WEBSITE_ID} from '../lib/structured-data.mjs'
import {buildBrands} from '../lib/brands.mjs'
import {HUB_H1, brandH1, brandHeroImage, hubBody} from '../lib/collections.mjs'

const W = 'https://www.highlightschicago.com'
const byType = (ld) => Object.fromEntries(ld['@graph'].map((n) => [n['@type'], n]))
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`) }

const published = [
  {brand: 'Tesla', slug: 'tesla-ev-charger-installation-repair'},
  {brand: 'Tesla', slug: 'tesla-home-battery-installation-repair'},
  {brand: 'Generac', slug: 'generac-generator-installation-repair'},
]
const brands = buildBrands(published)

test('/brands: CollectionPage lists exactly the brand cards the page shows, in order', () => {
  const ld = brandsIndexJsonLd({name: HUB_H1, brands})
  const g = byType(ld)
  assert.deepEqual(Object.keys(g).sort(), ['BreadcrumbList', 'CollectionPage'])
  const cp = g.CollectionPage
  assert.equal(cp.url, `${W}/brands`)
  assert.equal(cp.name, 'The brands we wire across Chicago')
  assert.deepEqual(cp.about, {'@id': BUSINESS_ID})
  assert.deepEqual(cp.isPartOf, {'@id': WEBSITE_ID})
  const items = cp.mainEntity.itemListElement
  assert.equal(cp.mainEntity.numberOfItems, items.length)
  // The same brand links the rendered hub has, in the same order.
  const hrefs = [...hubBody(brands).matchAll(/<a data-cats="[^"]*" class="collection-card" href="([^"]+)"/g)].map((m) => `${W}${m[1]}`)
  assert.deepEqual(items.map((i) => i.url), hrefs)
  assert.deepEqual(items.map((i) => i.name), ['Generac', 'Tesla'])
  assert.deepEqual(items.map((i) => i.position), [1, 2])
  assert.deepEqual(g.BreadcrumbList.itemListElement.map((i) => [i.name, i.item]), [['Home', W], ['Brands', `${W}/brands`]])
})

test('/brands/<brand>: Service with the live services, brand and hero photo; breadcrumb to the brand', () => {
  const tesla = brands.find((b) => b.slug === 'tesla')
  const g = byType(brandHubJsonLd({name: brandH1(tesla), description: 'Intro.', image: brandHeroImage(tesla), brand: tesla}))
  assert.deepEqual(Object.keys(g).sort(), ['BreadcrumbList', 'Service'])
  const s = g.Service
  assert.equal(s.name, 'Tesla services in Chicago')
  assert.equal(s.url, `${W}/brands/tesla`)
  assert.deepEqual(s.serviceType, ['EV Charger Installation & Repair', 'Home Battery Installation & Repair'])
  assert.deepEqual(s.brand, {'@type': 'Brand', name: 'Tesla'})
  assert.deepEqual(s.provider, {'@id': BUSINESS_ID})
  assert.deepEqual(s.areaServed, {'@type': 'City', name: 'Chicago, IL'})
  assert.match(s.image, /^https:\/\/www\.highlightschicago\.com\/brands\/images\//)
  assert.deepEqual(g.BreadcrumbList.itemListElement.map((i) => i.name), ['Home', 'Brands', 'Tesla'])
  const generac = brands.find((b) => b.slug === 'generac')
  // One live service: a plain serviceType; no description or photo given: none in the output.
  const one = byType(brandHubJsonLd({name: brandH1(generac), brand: generac})).Service
  assert.equal(one.serviceType, 'Generator Installation & Repair')
  assert.equal('description' in one || 'image' in one, false)
})

const doc = {
  title: 'Tesla EV Charger Installation & Repair', brand: 'Tesla', service: 'EV Charger Installation & Repair',
  slug: {current: 'tesla-ev-charger-installation-repair'},
  hero: {headline: 'Tesla charger installation', headlineHighlight: 'in Chicago'},
  seo: {metaDescription: 'Meta text.'},
  faq: {items: [{question: 'Is a permit needed?', answer: 'Yes. </script><b>x</b>'}, {question: 'Only a question', answer: ''}]},
}
const path = '/brands/tesla/tesla-ev-charger-installation-repair'

test('/brands/<brand>/<page>: Service, BreadcrumbList and FAQPage from the page data', () => {
  const ld = brandServiceJsonLd({doc, path, brandHref: '/brands/tesla', heroImage: 'https://cdn.sanity.io/images/x/y.jpg'})
  const g = byType(ld)
  assert.deepEqual(Object.keys(g).sort(), ['BreadcrumbList', 'FAQPage', 'Service'])
  const s = g.Service
  assert.equal(s.name, 'Tesla charger installation in Chicago')
  assert.equal(s.name, brandServiceH1(doc))
  assert.equal(s.serviceType, 'EV Charger Installation & Repair')
  assert.equal(s.url, `${W}${path}`)
  assert.equal(s.description, 'Meta text.')
  assert.equal(s.image, 'https://cdn.sanity.io/images/x/y.jpg')
  assert.deepEqual(g.BreadcrumbList.itemListElement.map((i) => [i.name, i.item]), [
    ['Home', W], ['Brands', `${W}/brands`], ['Tesla', `${W}/brands/tesla`], ['Tesla EV Charger Installation & Repair', `${W}${path}`],
  ])
  // Questions without an answer are left out; the rest are word for word.
  assert.equal(g.FAQPage.mainEntity.length, 1)
  assert.equal(g.FAQPage.mainEntity[0].name, 'Is a permit needed?')
  assert.equal(g.FAQPage.mainEntity[0].acceptedAnswer.text, 'Yes. </script><b>x</b>')
})

test('missing data is left out: no FAQ, no Sanity hero photo, no service, no meta description', () => {
  const bare = {...doc, service: undefined, seo: {}, faq: {items: []}}
  const g = byType(brandServiceJsonLd({doc: bare, path, brandHref: '/brands/tesla', heroImage: null}))
  assert.deepEqual(Object.keys(g).sort(), ['BreadcrumbList', 'Service'])
  for (const k of ['image', 'serviceType', 'description']) assert.equal(k in g.Service, false, k)
})

test('no Product, Review or AggregateRating anywhere', () => {
  const all = JSON.stringify([brandsIndexJsonLd({name: HUB_H1, brands}), brandServiceJsonLd({doc, path, brandHref: '/brands/tesla'})])
  assert.doesNotMatch(all, /"(Product|Review|AggregateRating)"/)
})

test('"<" is escaped so page text cannot close the script tag', () => {
  const html = jsonLdHtml(brandServiceJsonLd({doc, path, brandHref: '/brands/tesla'}))
  assert.doesNotMatch(html, /</)
  assert.match(html, /\\u003c\/script>/)
  assert.equal(JSON.parse(html)['@graph'][2].mainEntity[0].acceptedAnswer.text, 'Yes. </script><b>x</b>')
})

console.log(`\n${passed} passed`)
