// Quote requests from the brand pages: the hero form and the footer form both post here.
// Each accepted request is sent to the Zapier "Catch Hook" in LEAD_WEBHOOK_URL, and Zapier passes it on
// (GHL, email, a sheet). Zapier is the only delivery, so the visitor is told when it fails and asked to call.
//
// Works with and without JavaScript in the browser:
//   - JSON (site.js fetch): answers {ok: true} or an error status; the page then opens the thank-you page.
//   - A plain form post (JavaScript not loaded yet): answers with a redirect to the thank-you page.

const THANK_YOU_URL = 'https://www.highlightschicago.com/services/thank-you'
const PHONE = '(773) 262-3333'

// The fields Zapier receives. Every key is always sent (empty when not asked), so the Zap's field
// mapping never changes from one form to the other.
const LEAD_FIELDS = ['name', 'phone', 'email', 'address', 'issue', 'existingSystem', 'brand', 'service', 'formName'] as const
type Lead = Record<(typeof LEAD_FIELDS)[number], string>

function configured(value: string | undefined) {
  return value && !/^(paste|PASTE_|your_)/i.test(value) ? value.trim() : ''
}

function clean(value: unknown) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000)
}

/** The page the lead came from: an http(s) address, or empty. */
function pageAddress(value: unknown) {
  const text = clean(value)
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

async function readBody(request: Request): Promise<{fields: Record<string, unknown> | null; isForm: boolean}> {
  const type = request.headers.get('content-type') || ''
  if (type.includes('application/json')) return {fields: await request.json().catch(() => null), isForm: false}
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    return {fields: form ? Object.fromEntries(form.entries()) : null, isForm: true}
  }
  return {fields: null, isForm: false}
}

async function sendToZapier(webhookUrl: string, lead: Lead, sourceUrl: string): Promise<boolean> {
  // Jobber keeps first and last name apart: the first word is the first name, the rest the last name.
  const [firstName = '', ...rest] = lead.name.split(' ')
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...lead, firstName, lastName: rest.join(' '), source: 'brand-page', sourceUrl, submittedAt: new Date().toISOString()}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) console.error('Brand lead: Zapier did not accept the lead', {status: response.status})
    return response.ok
  } catch (error: unknown) {
    console.error('Brand lead: Zapier request failed', {error: error instanceof Error ? error.name : 'UnknownError'})
    return false
  }
}

function failure(isForm: boolean, status: number, message: string) {
  if (!isForm) return Response.json({message}, {status})
  // Without JavaScript there is no page script to show the message, so say it here.
  return new Response(`${message} Please call Highlights Chicago at ${PHONE}.`, {status, headers: {'content-type': 'text/plain; charset=utf-8'}})
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const {fields, isForm} = await readBody(request)
  if (!fields) return failure(isForm, 400, 'The request could not be read.')

  // A hidden field people never see: bots fill it in. Answer as if it worked and send nothing.
  if (clean(fields.website)) return isForm ? Response.redirect(THANK_YOU_URL, 303) : Response.json({ok: true})

  const lead = Object.fromEntries(LEAD_FIELDS.map((key) => [key, clean(fields[key])])) as Lead
  if (!lead.name || lead.phone.replace(/\D/g, '').length < 7) return failure(isForm, 400, 'A name and a phone number are required.')

  const webhookUrl = configured(process.env.LEAD_WEBHOOK_URL)
  if (!webhookUrl) {
    console.error('Brand lead: LEAD_WEBHOOK_URL is not set, so the lead was not sent')
    return failure(isForm, 503, 'Your request did not send.')
  }

  const sourceUrl = pageAddress(fields.pageUrl) || pageAddress(request.headers.get('referer'))
  if (!(await sendToZapier(webhookUrl, lead, sourceUrl))) return failure(isForm, 502, 'Your request did not send.')

  return isForm ? Response.redirect(THANK_YOU_URL, 303) : Response.json({ok: true})
}
