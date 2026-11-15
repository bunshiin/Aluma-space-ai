import { fetchGeneralTopicImage } from '../src/services/generalImageFetcher.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Sadece POST' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 120) : '';
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const image = query ? await fetchGeneralTopicImage(query, title) : null;
    return res.status(200).json(image && typeof image.image_url === 'string' ? image : {});
  } catch (err) {
    console.error('API /api/topic-image hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
