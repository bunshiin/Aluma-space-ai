// Yerel geliştirme sunucusu: index.html'in çağırdığı POST /api/route ucunu getRouteFromGemini'ye bağlar
// ve sayfayı sunar. API anahtarı tarayıcıya hiç gitmez; sadece bu süreç .env'den okur.
//   node server.js        ->  http://127.0.0.1:5173
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 5173;
// Anahtar harcayan uç yalnızca bu makineden erişilebilsin diye dışarı açılmaz
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 500;
const MAX_TTS_TEXT_LENGTH = 1200;

// Sadece uygulamanın ihtiyacı olan yerler sunulur; .env, geçmiş dosyası, testler ve araçlar dışarıda kalır
const STATIC_ALLOWED = ['index.html', 'src', 'public'];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/**
 * İstek yolunu kök klasör içinde güvenli bir dosya yoluna çevirir. İzin verilmeyen, nokta ile başlayan
 * ya da kök dışına çıkan her yol için null döner.
 */
export function getSafeStaticPath(rootDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath ?? '').split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const segments = relative.split('/');
  if (segments.some((s) => s === '' || s === '..' || s.startsWith('.'))) return null;
  if (!STATIC_ALLOWED.includes(segments[0])) return null;
  if (!Object.hasOwn(CONTENT_TYPES, path.extname(relative).toLowerCase())) return null;
  const resolved = path.resolve(rootDir, relative);
  return resolved.startsWith(path.resolve(rootDir) + path.sep) ? resolved : null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let is_rejected = false;
    req.on('data', (chunk) => {
      if (is_rejected) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        // Bağlantı burada kesilmez: önce 413 yanıtı gider, sonra handleRouteRequest bağlantıyı kapatır
        is_rejected = true;
        reject(Object.assign(new Error('gövde çok büyük'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!is_rejected) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function handleBodyError(req, res, err) {
  const status = err?.status ?? (err instanceof SyntaxError ? 400 : 500);
  if (status === 413) {
    // Kalan gövdeyi okumadan, yanıt gittikten sonra bağlantıyı kapat
    res.setHeader('Connection', 'close');
    res.on('finish', () => req.destroy());
  }
  sendJson(res, status, { error: status === 413 ? 'İstek çok büyük' : status === 400 ? 'Geçersiz JSON' : 'Sunucu hatası' });
}

// Seslendirme: metin ElevenLabs'e sunucudan gider; ses yoksa 204 döner ve UI sessiz devam eder
async function handleTtsRequest(req, res, getTtsAudio, getTtsFailure) {
  try {
    const parsed = JSON.parse(await readBody(req));
    const text = typeof parsed?.text === 'string' ? parsed.text.slice(0, MAX_TTS_TEXT_LENGTH) : '';
    const audio = text ? await getTtsAudio(text) : null;
    if (!audio) {
      // Sessizlik nedeni başlıkla bildirilir ki UI "ses kotası doldu" diyebilsin
      const reason = getTtsFailure?.();
      res.writeHead(204, reason ? { 'Cache-Control': 'no-store', 'X-Tts-Reason': reason } : { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    res.end(audio);
  } catch (err) {
    handleBodyError(req, res, err);
  }
}

async function handleRouteRequest(req, res, getRoute) {
  try {
    const parsed = JSON.parse(await readBody(req));
    const text = typeof parsed?.text === 'string' ? parsed.text.slice(0, MAX_TEXT_LENGTH) : '';
    const input = { text };
    if (typeof parsed?.is_student_mode === 'boolean') input.is_student_mode = parsed.is_student_mode;
    sendJson(res, 200, await getRoute(input));
  } catch (err) {
    handleBodyError(req, res, err);
  }
}

/**
 * Sunucuyu kurar ama başlatmaz. getRoute testte sahte verilebilir; varsayılan gerçek yönlendiricidir.
 */
export function createRouteServer({ getRoute, getTtsAudio = async () => null, getTtsFailure = null, rootDir = ROOT } = {}) {
  return http.createServer(async (req, res) => {
    const pathname = String(req.url ?? '/').split('?')[0];
    if (pathname === '/api/route' || pathname === '/api/tts') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        sendJson(res, 405, { error: 'Sadece POST' });
        return;
      }
      if (pathname === '/api/tts') await handleTtsRequest(req, res, getTtsAudio, getTtsFailure);
      else await handleRouteRequest(req, res, getRoute);
      return;
    }
    const filePath = req.method === 'GET' ? getSafeStaticPath(rootDir, req.url) : null;
    if (!filePath) {
      sendJson(res, 404, { error: 'Bulunamadı' });
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'Bulunamadı' });
        return;
      }
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()], 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
}

export async function startServer(port = Number(process.env.PORT) || DEFAULT_PORT) {
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {
    console.warn('.env bulunamadı: Gemini anahtarı yoksa yönlendirici güvenli yedek yanıt döner.');
  }
  // Yönlendirici anahtarı process.env'den okuduğu için .env yüklendikten sonra içe aktarılır
  const { getRouteFromGemini } = await import('./src/services/geminiRouter.js');
  const { createElevenLabsAudio, getElevenLabsFailure, isElevenLabsConfigured } = await import('./src/services/elevenLabsTts.js');
  if (!isElevenLabsConfigured()) console.warn('ELEVENLABS_API_KEY yok: seslendirme kapalı, uygulama sessiz çalışır.');
  const server = createRouteServer({ getRoute: getRouteFromGemini, getTtsAudio: (text) => createElevenLabsAudio(text), getTtsFailure: getElevenLabsFailure });
  await new Promise((resolve) => server.listen(port, HOST, resolve));
  console.log(`AETHER-GRAPH sunucusu: http://${HOST}:${server.address().port}`);
  return server;
}

// Import anında çalışmaz; sadece `node server.js` ile başlatılınca
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer();
}
