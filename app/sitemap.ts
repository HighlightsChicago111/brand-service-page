import type {MetadataRoute} from 'next'
import {getFreshPublishedPageList} from '@/lib/data'
import {buildBrands, slugify} from '@/lib/brands.mjs'
import {siteUrl} from '@/sanity/env'

// Read fresh from Sanity on each request, so a page appears here as soon as it is published.
export const dynamic = 'force-dynamic'

// /brands/sitemap.xml: the brands page, every brand page and every published brand service page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await getFreshPublishedPageList()
  const brands = buildBrands(pages)
  return [
    {url: `${siteUrl}/brands`},
    ...brands.filter((b: {liveCount: number}) => b.liveCount > 0).map((b: {slug: string}) => ({url: `${siteUrl}/brands/${b.slug}`})),
    ...pages.map((p) => ({url: `${siteUrl}/brands/${slugify(p.brand)}/${p.slug}`, lastModified: p._updatedAt})),
  ]
}
