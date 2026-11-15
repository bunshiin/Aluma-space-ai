import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouteServer, getSafeStaticPath } from '../server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('getSafeStaticPath: izinli yollar kök içinde çözülür', () => {
  assert.equal(getSafeStaticPath(ROOT, '/'), path.join(ROOT, 'index.html'));
  assert.equal(getSafeStaticPath(ROOT, '/index.html'), path.join(ROOT, 'index.html'));
  assert.equal(getSafeStaticPath(ROOT, '/src/three/threeSceneFactory.js?v=3'), path.join(ROOT, 'src', 'three', 'threeSceneFactory.js'));
  assert.equal(getSafeStaticPath(ROOT, '/public/models/sun.glb'), path.join(ROOT, 'public', 'models', 'sun.glb'));
});

test('getSafeStaticPath: .env, geçmiş, testler, araçlar ve dışarı çıkma denemeleri reddedilir', () => {
  const attacks = [
    '/.env', '/.env.example', '/.gemini_history.json', '/src/../.env', '/src/%2e%2e/.env', '/%2e%2e/%2e%2e/etc/passwd',
    '/../server.js', '/src/..%2f..%2f.env', '/node_modules/x/index.js', '/tests/server.test.js', '/scripts/buildHandoff.js',
    '/handoff/.delivered.json', '/package.json', '/server.js', '/src//..//.env', '/src\\..\\.env', '/src/a%00.js',
    '/src/.hidden.js', '/src/', '/%E0%A4%A', '/src/x.exe', '/src/three',
  ];
  for (const attack of attacks) {
    assert.equal(getSafeStaticPath(ROOT, attack), null, `${attack} reddedilmeli`);
  }
  for (const bad of [undefined, null, 5, {}]) assert.equal(getSafeStaticPath(ROOT, bad), null);
});

async function withServer(getRoute, run, rootDir) {
  const server = createRouteServer({ getRoute, rootDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}/api/route`, { method: 'POST', headers, body });

test('POST /api/route: metni yönlendiriciye iletir, JSON yanıt döner', async () => {
  const calls = [];
  await withServer(async (input) => { calls.push(input); return { action_type: 'RESET_VIEW', template_id: 'NONE' }; }, async (base) => {
    const res = await post(base, JSON.stringify({ text: 'En son 3 astroid göster', is_student_mode: true, gizli: 'x' }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { action_type: 'RESET_VIEW', template_id: 'NONE' });
    // Bilinmeyen alanlar yönlendiriciye geçmez
    assert.deepEqual(calls, [{ text: 'En son 3 astroid göster', is_student_mode: true }]);
  });
});

test('POST /api/route: uzun metin kesilir, metin yoksa boş metin gider, bozuk alan tipleri yok sayılır', async () => {
  const calls = [];
  await withServer(async (input) => { calls.push(input); return {}; }, async (base) => {
    await post(base, JSON.stringify({ text: 'a'.repeat(5000) }));
    await post(base, JSON.stringify({}));
    await post(base, JSON.stringify({ text: 42, is_student_mode: 'evet' }));
    assert.equal(calls[0].text.length, 500);
    assert.deepEqual(calls[1], { text: '' });
    assert.deepEqual(calls[2], { text: '' });
  });
});

test('POST /api/route: bozuk JSON 400, büyük gövde 413, yönlendirici hatası 500; hata ayrıntısı sızmaz', async () => {
  await withServer(async () => { throw new Error('GEMINI_API_KEYS=gizli-anahtar'); }, async (base) => {
    assert.equal((await post(base, '{bozuk')).status, 400);
    assert.equal((await post(base, JSON.stringify({ text: 'x'.repeat(40000) }))).status, 413);
    const res = await post(base, JSON.stringify({ text: 'selam' }));
    assert.equal(res.status, 500);
    assert.ok(!(await res.text()).includes('gizli-anahtar'));
  });
});

test('/api/route sadece POST kabul eder', async () => {
  await withServer(async () => ({}), async (base) => {
    const get = await fetch(`${base}/api/route`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
  });
});

test('.env ve geçmiş dosyası diskte DURSA bile HTTP ile asla sunulmaz; izinli dosyalar sunulur', async () => {
  // Paket boş klasörde de çalışsın diye proje dosyalarına değil geçici bir köke bakar
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-test-'));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('index.html', '<h1>ana sayfa</h1>');
  write('src/uygulama.js', 'export const x = 1;');
  write('.env', 'GEMINI_API_KEYS=GIZLI-ANAHTAR');
  write('.gemini_history.json', '["GIZLI-SOHBET"]');
  write('package.json', '{}');
  write('server.js', '// sunucu kaynagi');

  await withServer(async () => ({}), async (base) => {
    for (const attack of ['/.env', '/.gemini_history.json', '/src/../.env', '/%2e%2e/.env', '/package.json', '/server.js']) {
      const res = await fetch(`${base}${attack}`);
      assert.equal(res.status, 404, `${attack} sunulmamalı`);
      assert.ok(!(await res.text()).includes('GIZLI'));
    }
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /ana sayfa/);
    assert.equal((await fetch(`${base}/src/uygulama.js`)).status, 200);
    assert.equal((await fetch(`${base}/src/yok.js`)).status, 404);
  }, root);
});

test('POST /api/tts: ses varsa audio/mpeg döner, yoksa 204; GET reddedilir', async () => {
  const seen = [];
  const server = createRouteServer({
    getRoute: async () => ({}),
    getTtsAudio: async (text) => {
      seen.push(text);
      return text.includes('sessiz') ? null : Buffer.from([7, 8, 9]);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await fetch(`${base}/api/tts`, { method: 'POST', body: JSON.stringify({ text: 'Merhaba Mars' }) });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [7, 8, 9]);

    const silent = await fetch(`${base}/api/tts`, { method: 'POST', body: JSON.stringify({ text: 'sessiz' }) });
    assert.equal(silent.status, 204);
    assert.equal((await fetch(`${base}/api/tts`)).status, 405);
    assert.equal((await fetch(`${base}/api/tts`, { method: 'POST', body: '{bozuk' })).status, 400);
    assert.deepEqual(seen, ['Merhaba Mars', 'sessiz']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/tts: ses yoksa nedeni X-Tts-Reason başlığıyla bildirir', async () => {
  const server = createRouteServer({ getRoute: async () => ({}), getTtsAudio: async () => null, getTtsFailure: () => 'quota_exceeded' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/tts`, { method: 'POST', body: JSON.stringify({ text: 'Merhaba' }) });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('x-tts-reason'), 'quota_exceeded');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
