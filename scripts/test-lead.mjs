// Tests the quote form endpoint (app/api/lead/route.ts) and the Worker rule that lets it through on www.
// No network: Zapier and the Vercel origin are replaced with fakes, so no real lead is ever sent.
// Run: node scripts/test-lead.mjs
import assert from 'node:assert/strict'

const HOOK = 'https://hooks.zapier.example/catch/test'
const THANK_YOU = 'https://www.highlightschicago.com/services/thank-you'
const PAGE = 'https://www.highlightschicago.com/brands/kohler/kohler-generator-installation-repair'

// Fake network: records every request; Zapier answers with `zapier` (a status, or 'down').
let zapier = 200
const sent = []
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url
  sent.push({url, init, request: typeof input === 'string' ? null : input})
  if (url === HOOK) {
    if (zapier === 'down') throw new TypeError('fetch failed')
    return new Response('{"status":"success"}', {status: zapier})
  }
  return new Response('origin', {status: 200})
}
console.error = () => {} // the route logs failures; keep the test output clean

const {POST} = await import('../app/api/lead/route.ts')

const json = (body, headers = {}) =>
  new Request('https://brand-service-page.vercel.app/brands/api/lead', {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)})
const form = (body) =>
  new Request('https://brand-service-page.vercel.app/brands/api/lead', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(body)})
const hookCalls = () => sent.filter((s) => s.url === HOOK)
const reset = (status = 200) => { sent.length = 0; zapier = status }

const lead = {name: 'Test Lead', phone: '(773) 555-0100', address: '1 Test St', issue: 'Install a new generator', existingSystem: 'Home standby', brand: 'Kohler', service: 'Generator Installation & Repair', formName: 'Brand page quote form', pageUrl: PAGE}

async function run() {
  process.env.LEAD_WEBHOOK_URL = HOOK

  // 1. A good lead reaches Zapier with every field, the source and the page.
  reset()
  let res = await POST(json(lead))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {ok: true})
  assert.equal(hookCalls().length, 1, 'one request to Zapier')
  const payload = JSON.parse(hookCalls()[0].init.body)
  for (const key of ['name', 'phone', 'address', 'issue', 'existingSystem', 'brand', 'service', 'formName']) assert.equal(payload[key], lead[key], `${key} is sent`)
  assert.equal(payload.email, '', 'a field the form does not ask is sent empty, so the Zap mapping stays the same')
  assert.equal(payload.firstName, 'Test', 'first name for Jobber')
  assert.equal(payload.lastName, 'Lead', 'last name for Jobber')
  assert.equal(payload.source, 'brand-page')
  assert.equal(payload.sourceUrl, PAGE)
  assert.ok(!Number.isNaN(Date.parse(payload.submittedAt)), 'submittedAt is a time')
  assert.equal(payload.pageUrl, undefined, 'pageUrl is sent as sourceUrl only')

  // 2. Without pageUrl, the Referer header gives the page; a non-web address is dropped.
  reset()
  await POST(json({...lead, pageUrl: undefined}, {referer: PAGE}))
  assert.equal(JSON.parse(hookCalls()[0].init.body).sourceUrl, PAGE)
  reset()
  await POST(json({...lead, pageUrl: 'javascript:alert(1)'}))
  assert.equal(JSON.parse(hookCalls()[0].init.body).sourceUrl, '')

  // 3. Text is tidied: control characters and long runs of spaces go, and fields are capped at 1000 characters.
  reset()
  await POST(json({...lead, name: '  Test\n\n  Lead\u0000 ', issue: 'x'.repeat(5000)}))
  const tidy = JSON.parse(hookCalls()[0].init.body)
  assert.equal(tidy.name, 'Test Lead')
  reset()
  await POST(json({...lead, name: 'Cher'}))
  const single = JSON.parse(hookCalls()[0].init.body)
  assert.equal(single.firstName, 'Cher')
  assert.equal(single.lastName, '', 'a one-word name has an empty last name')
  reset()
  await POST(json({...lead, name: 'Mary Ann van Dyke'}))
  assert.equal(JSON.parse(hookCalls()[0].init.body).lastName, 'Ann van Dyke')
  assert.equal(tidy.issue.length, 1000)

  // 4. Missing name or a too-short phone: 400, nothing sent.
  for (const bad of [{...lead, name: ''}, {...lead, phone: '12345'}, {...lead, phone: ''}]) {
    reset()
    res = await POST(json(bad))
    assert.equal(res.status, 400)
    assert.equal(hookCalls().length, 0)
  }

  // 5. The spam trap: answers as if it worked, sends nothing.
  reset()
  res = await POST(json({...lead, website: 'http://spam.example'}))
  assert.equal(res.status, 200)
  assert.equal(hookCalls().length, 0)

  // 6. Unreadable body: 400.
  reset()
  res = await POST(new Request('https://x/brands/api/lead', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{not json'}))
  assert.equal(res.status, 400)
  res = await POST(new Request('https://x/brands/api/lead', {method: 'POST', headers: {'content-type': 'text/plain'}, body: 'hello'}))
  assert.equal(res.status, 400)

  // 7. Zapier refuses or is unreachable: 502, so the visitor is asked to call (never a false "sent").
  for (const status of [500, 410, 'down']) {
    reset(status)
    res = await POST(json(lead))
    assert.equal(res.status, 502, `Zapier ${status} -> 502`)
  }

  // 8. No hook set: 503 and nothing sent.
  delete process.env.LEAD_WEBHOOK_URL
  reset()
  res = await POST(json(lead))
  assert.equal(res.status, 503)
  assert.equal(hookCalls().length, 0)
  process.env.LEAD_WEBHOOK_URL = 'paste-your-zapier-hook-here'
  res = await POST(json(lead))
  assert.equal(res.status, 503, 'a placeholder value counts as not set')
  process.env.LEAD_WEBHOOK_URL = HOOK

  // 9. A plain form post (before the page script loads): redirect to the thank-you page, or a readable message.
  reset()
  res = await POST(form({...lead, pageUrl: ''}))
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), THANK_YOU)
  assert.equal(hookCalls().length, 1)
  reset(500)
  res = await POST(form(lead))
  assert.equal(res.status, 502)
  assert.match(await res.text(), /call Highlights Chicago at \(773\) 262-3333/)
  reset()
  res = await POST(form({...lead, website: 'bot'}))
  assert.equal(res.status, 303)
  assert.equal(hookCalls().length, 0)

  // 10. The Worker on www lets the lead endpoint through and keeps every other API route closed.
  const {default: worker} = await import('../cloudflare/worker.js')
  reset()
  res = await worker.fetch(new Request('https://www.highlightschicago.com/brands/api/lead', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(lead)}))
  assert.equal(res.status, 200)
  assert.equal(sent[0].url, 'https://brand-service-page.vercel.app/brands/api/lead', 'forwarded to the Vercel app')
  for (const path of ['/brands/api/revalidate', '/brands/api/draft-mode/enable', '/brands/api/lead/x', '/brands/api/leads']) {
    reset()
    res = await worker.fetch(new Request(`https://www.highlightschicago.com${path}`, {method: 'POST'}))
    assert.equal(res.status, 404, `${path} stays closed on www`)
    assert.equal(sent.length, 0)
  }

  console.log('Lead test passed: leads reach Zapier with every field; bad, spam and failed sends are handled; the Worker opens only /brands/api/lead.')
}

await run()
