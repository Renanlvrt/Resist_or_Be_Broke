export interface Alt { title: string; brand: string; price: number; url: string; retailer: string; sameModel: boolean }

// Live mode: Firecrawl search + Claude picks cheapest exact-same-model. 6s total budget.
export async function liveSearch(title: string, brand: string, price: number): Promise<Alt | null> {
  const fc = process.env.FIRECRAWL_API_KEY, ak = process.env.ANTHROPIC_API_KEY;
  if (!fc || !ak) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${fc}` },
      body: JSON.stringify({ query: `${brand} ${title} buy UK`, limit: 5, scrapeOptions: { formats: ['markdown'] } }),
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const docs = (data.data ?? []).filter((d: any) => d.url && !/amazon\./.test(d.url))
      .map((d: any) => `URL: ${d.url}\n${String(d.markdown ?? d.description ?? '').slice(0, 1500)}`).join('\n\n---\n\n');
    if (!docs) return null;
    const m = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': ak, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 300, messages: [{ role: 'user', content:
        `Product on Amazon UK: "${brand} ${title}" at £${price}. From the pages below pick the cheapest UK GBP listing of the EXACT same model, strictly cheaper than £${price}, price visible in the text. ` +
        `Reply ONLY JSON {"title":"","brand":"","price":0,"url":"","retailer":"","sameModel":true} or {"none":true}.

${docs}` }] }),
    });
    if (!m.ok) return null;
    const msg: any = await m.json();
    const text = msg.content.map((c: any) => c.text ?? '').join('');
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (j.none || !j.url || !(j.price > 0) || j.price >= price) return null;
    return j as Alt;
  } catch { return null; } finally { clearTimeout(timer); }
}
