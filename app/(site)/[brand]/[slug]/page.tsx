import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {BrandServicePage, scrub} from '@/components/landing/BrandServicePage'
import {JsonLd} from '@/components/json-ld'
import {getBrands, getPublishedPageList} from '@/lib/data'
import {slugify} from '@/lib/brands.mjs'
import {brandServiceJsonLd} from '@/lib/structured-data.mjs'
import {sanityFetch} from '@/sanity/client'
import {imageUrl} from '@/sanity/image'
import {PAGE_QUERY} from '@/sanity/queries'

type Props = {params: Promise<{brand: string; slug: string}>}
/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>

// The page's brand segment comes from its Brand field, e.g. "Briggs & Stratton" -> briggs-and-stratton.
const brandSlugOf = (doc: Doc) => slugify(String(doc.brand || ''))
const pathOf = (doc: Doc) => `/brands/${brandSlugOf(doc)}/${doc.slug?.current}`

export async function generateStaticParams() {
  return (await getPublishedPageList()).map((p) => ({brand: slugify(p.brand), slug: p.slug}))
}

async function loadPage(params: Props['params']) {
  const {brand, slug} = await params
  const doc = await sanityFetch<Doc | null>(PAGE_QUERY, {slug})
  if (!doc || brandSlugOf(doc) !== brand) return null
  return doc
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const doc = await loadPage(params)
  if (!doc) return {}
  const path = pathOf(doc)
  const ogImage = imageUrl(doc.hero?.backgroundImage, 1200)
  return {
    title: {absolute: doc.seo?.metaTitle || doc.title},
    description: doc.seo?.metaDescription,
    alternates: {canonical: path},
    openGraph: {title: doc.seo?.metaTitle || doc.title, description: doc.seo?.metaDescription, url: path, images: ogImage ? [ogImage] : undefined},
  }
}

// /brands/<brand>/<page>: the brand service page written in Sanity.
export default async function BrandServiceRoute({params}: Props) {
  const doc = await loadPage(params)
  if (!doc) notFound()
  const brands = await getBrands()
  const brandLinks = brands.map((b: {name: string; slug: string}) => ({name: b.name, href: `/brands/${b.slug}`}))
  const brandHref = `/brands/${brandSlugOf(doc)}`
  // Built from the same cleaned document the page renders. The hero photo counts only when it comes from
  // Sanity; the stock photo the hero falls back to is left out.
  const jsonLd = brandServiceJsonLd({doc: scrub(doc), path: pathOf(doc), brandHref, heroImage: imageUrl(doc.hero?.backgroundImage, 2000)})
  return (
    <>
      <JsonLd data={jsonLd} />
      <BrandServicePage doc={doc} brandHref={brandHref} brandLinks={brandLinks} />
    </>
  )
}
