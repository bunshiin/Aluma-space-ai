import { fetchGeneralTopicImage } from '../../src/services/generalImageFetcher.js';

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Sadece POST' }, { status: 405, headers: { Allow: 'POST' } });
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 120) : '';
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const image = query ? await fetchGeneralTopicImage(query, title) : null;
    return Response.json(image && typeof image.image_url === 'string' ? image : {});
  } catch (err) {
    console.error('API /api/topic-image hatası:', err);
    return Response.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
};

export const config = { path: '/api/topic-image' };
