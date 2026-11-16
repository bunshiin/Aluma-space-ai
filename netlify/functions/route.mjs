import { getRouteFromGemini } from '../../src/services/geminiRouter.js';

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Sadece POST' }, { status: 405, headers: { Allow: 'POST' } });
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.slice(0, 500) : '';
    const input = { text };
    if (typeof body?.is_student_mode === 'boolean') input.is_student_mode = body.is_student_mode;
    return Response.json(await getRouteFromGemini(input));
  } catch (err) {
    console.error('API /api/route hatası:', err);
    return Response.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
};

export const config = { path: '/api/route' };
