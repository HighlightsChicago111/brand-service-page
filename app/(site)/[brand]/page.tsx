import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {getBrands, getPublishedPageList} from '@/lib/data'
import {buildBrands} from '@/lib/brands.mjs'
import {brandBody, brandH1, brandHeroImage, brandIntroText} from '@/lib/collections.mjs'
import {brandHubJsonLd} from '@/lib/structured-data.mjs'
import {JsonLd} from '@/components/json-ld'

type Props = {params: Promise<{brand: string}>}

// Only brands with a published page have a page; the rest return 404 until their first page is published.
export async function generateStaticParams() {
  return buildBrands(await getPublishedPageList()).filter((b: {liveCount: number}) => b.liveCount > 0).map((b: {slug: string}) => ({brand: b.slug}))
}

async function findBrand(slug: string) {
  return (await getBrands()).find((b: {slug: string; liveCount: number}) => b.slug === slug && b.liveCount > 0)
}

// The meta description, also used as the Service description in the structured data.
const describe = (b: Parameters<typeof brandIntroText>[0]) => String(brandIntroText(b)).slice(0, 158)

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const b = await findBrand((await params).brand)
  if (!b) return {}
  return {
    title: {absolute: `${b.name} services in Chicago | Highlights Chicago`},
    description: describe(b),
    alternates: {canonical: `/brands/${b.slug}`},
  }
}

// /brands/<brand>: that brand's services, written pages first.
export default async function BrandPage({params}: Props) {
  const b = await findBrand((await params).brand)
  if (!b) notFound()
  return (
    <>
      <JsonLd data={brandHubJsonLd({name: brandH1(b), description: describe(b), image: brandHeroImage(b), brand: b})} />
      <div dangerouslySetInnerHTML={{__html: brandBody(b)}} />
    </>
  )
}
