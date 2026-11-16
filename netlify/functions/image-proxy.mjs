import { fetchProxiedImage } from '../../src/services/reportImageProxy.js';

export default async (req) => {
  if (req.method !== 'GET') return Response.json({ error: 'Sadece GET' }, { status: 405, headers: { Allow: 'GET' } });
  try {
    const rawUrl = new URL(req.url).searchParams.get('url') || '';
    const result = await fetchProxiedImage(rawUrl);
    if (result?.status !== 200 || !Buffer.isBuffer(result.body)) {
      return Response.json({ error: 'Görsel alınamadı' }, { status: Number.isInteger(result?.status) ? result.status : 502 });
    }
    return new Response(result.body, { status: 200, headers: {
      'Content-Type': result.content_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (err) {
    console.error('API /api/image-proxy hatası:', err);
    return Response.json({ error: 'Görsel aktarılamadı' }, { status: 500 });
  }
};

export const config = { path: '/api/image-proxy' };
