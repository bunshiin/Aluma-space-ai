import { getRouteFromGemini } from '../src/services/geminiRouter.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Sadece POST' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = typeof body?.text === 'string' ? body.text.slice(0, 500) : '';
    const input = { text };
    if (typeof body?.is_student_mode === 'boolean') input.is_student_mode = body.is_student_mode;
    const result = await getRouteFromGemini(input);
    return res.status(200).json(result);
  } catch (err) {
    console.error('API /api/route hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
