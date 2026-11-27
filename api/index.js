import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  // Izinkan akses dari frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, extractText, userAgent } = req.body || {};

  if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

  let target;
  try {
    target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'URL tidak valid' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(target.toString(), {
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'id,en;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    if (!resp.ok) return res.status(502).json({ error: 'HTTP Error: ' + resp.status });

    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('xml')) {
      return res.status(415).json({ error: 'Bukan HTML: ' + ct });
    }

    const html = await resp.text();
    const payload = { url: target.toString(), status: resp.status, size: html.length, html };

    if (extractText) {
      const $ = cheerio.load(html);
      $('script, style, noscript, iframe').remove();
      payload.text = $('body').text().replace(/\s+/g, ' ').trim();
      payload.title = $('title').text().trim();
      payload.metaDescription = $('meta[name="description"]').attr('content') || '';
    }

    return res.status(200).json(payload);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Timeout (>15 detik)' });
    return res.status(500).json({ error: err.message });
  } finally {
    clearTimeout(timer);
  }
}
