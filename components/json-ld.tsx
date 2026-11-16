import {jsonLdHtml} from '@/lib/structured-data.mjs'

/** A JSON-LD block. "<" in the data is escaped, so page text can never end the script tag early. */
export function JsonLd({data}: {data: unknown}) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdHtml(data)}} />
}
