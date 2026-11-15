import { createElevenLabsAudio, getElevenLabsFailure } from '../src/services/elevenLabsTts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Sadece POST' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = typeof body?.text === 'string' ? body.text.slice(0, 1200) : '';
    const audio = text ? await createElevenLabsAudio(text) : null;
    if (!audio) {
      const reason = getElevenLabsFailure?.();
      if (reason) res.setHeader('X-Tts-Reason', reason);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (err) {
    console.error('API /api/tts hatası:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
