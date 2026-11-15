import { fetchProxiedImage } from '../src/services/reportImageProxy.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Sadece GET' });
  }
  try {
    const rawUrl = req.query?.url || new URL(req.url, 'http://localhost').searchParams.get('url') || '';
    const result = await fetchProxiedImage(rawUrl);
    if (result?.status !== 200 || !Buffer.isBuffer(result.body)) {
      return res.status(Number.isInteger(result?.status) ? result.status : 502).json({ error: 'Görsel alınamadı' });
    }
    res.setHeader('Content-Type', result.content_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(result.body);
  } catch (err) {
    console.error('API /api/image-proxy hatası:', err);
    return res.status(500).json({ error: 'Görsel aktarılamadı' });
  }
}
