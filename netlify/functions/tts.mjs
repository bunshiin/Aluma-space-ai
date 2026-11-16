import { createElevenLabsAudio, getElevenLabsFailure } from '../../src/services/elevenLabsTts.js';

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Sadece POST' }, { status: 405, headers: { Allow: 'POST' } });
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.slice(0, 1200) : '';
    const audio = text ? await createElevenLabsAudio(text) : null;
    if (!audio) {
      const headers = { 'Cache-Control': 'no-store' };
      const reason = getElevenLabsFailure?.();
      if (reason) headers['X-Tts-Reason'] = reason;
      return new Response(null, { status: 204, headers });
    }
    return new Response(audio, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('API /api/tts hatası:', err);
    return Response.json({ error: 'Sunucu hatası' }, { status: 500 });
  }
};

export const config = { path: '/api/tts' };
