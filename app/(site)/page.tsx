import type {Metadata} from 'next'
import {getBrands} from '@/lib/data'
import {HUB_H1, hubBody} from '@/lib/collections.mjs'
import {brandsIndexJsonLd} from '@/lib/structured-data.mjs'
import {JsonLd} from '@/components/json-ld'

const DESCRIPTION = 'Generators, EV chargers, batteries, panels, fans and smart devices by brand, wired by Highlights Chicago, a City of Chicago licensed electrical contractor.'

export const metadata: Metadata = {
  title: {absolute: 'Electrical brands in Chicago | Highlights Chicago'},
  description: DESCRIPTION,
  alternates: {canonical: '/brands'},
}

// /brands: every brand, the ones with written pages first.
export default async function BrandsPage() {
  const brands = await getBrands()
  return (
    <>
      <JsonLd data={brandsIndexJsonLd({name: HUB_H1, description: DESCRIPTION, brands})} />
      <div dangerouslySetInnerHTML={{__html: hubBody(brands)}} />
    </>
  )
}
