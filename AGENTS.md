# AETHER-GRAPH: Agent Kuralları

Kod yazan her agent bu dosyaya uyar. Hedef: kodu hangi agent yazarsa yazsın tek elden çıkmış gibi dursun. Emin olmadığın şeyi tahmin etme, kullanıcıya sor. Çakışma sırası: kullanıcı > bu dosya > agent'ın alışkanlığı.

---

## 0. Başlangıç: hangi kurallar aktif

Dosya iki parçadan oluşur: **Genel kurallar** (Bölüm 1-9, herkes için) ve **Rol bölümleri** (Bölüm A-F, her biri sadece kendi sahibi için).

- Oturumun başında kullanıcı kendini tanıtır ("ben Ege", "3D'ye bakıyorum"). Tanıtmadıysa tek soru sor: "Hangi alandasın: Mustafa (Gemini), Ertuğrul (3D), Furkan (sahne/içerik), Taha (veri), Ege (UI), Mami (fizik/canvas/birleştirme)?" Cevap gelmeden kod yazma.
- **Aktif olanlar:** Genel kurallar + sadece kullanıcının rol bölümü. Birden fazla alan söylerse hepsi aktif.
- **Diğer rol bölümlerini uygulama.** Örneğin Ege'nin agent'ı 3D kurallarını (Bölüm B) yüklemez, `destroy()` içini yazmaz, sadece çağırır.
- Başka alana ihtiyacın olursa sadece o alanın **sözleşmesini** (Bölüm 4) kullan. Onun dosyasını değiştirme, içini tahmin etme.
- **Sözleşme değişikliği** sadece Mami'nin kararıyla olur. Kullanıcı Mami değilse sözleşmeye dokunma, değişikliğin Mami'ye iletilmesini iste.

---

# GENEL KURALLAR (herkes için)

## 1. Proje

Güneş Sistemi'ni sesle/yazıyla kullanılan görsel bir uzay platformu. Kullanıcı bir şey söyler, Gemini bunu JSON'a çevirir, UI JSON'a göre bir sahne açar (3D model, 2D canvas, veri paneli, bilgi kartı). Ana ekran Güneş Sistemi, her sahneden `RESET_VIEW` ile oraya dönülür. Hangi sahnenin yapılacağını kullanıcı prompt'ta söyler.

## 2. Akış (kısayol yok)

```
Kullanıcı → getRouteFromGemini() → JSON → handleActionRouter()
     ├─ 3D sahne  → create3DMissionScene() / destroy()
     ├─ 2D canvas → renderProceduralPlanet(), calculateLightDelay()
     ├─ Veri      → getSpaceData()
     └─ Metin     → states.json
```

Bir parça başka parçayı atlayıp doğrudan çağırmaz.

## 3. Dosya yapısı ve sahipliği

Yeni dosyayı aşağıdaki yerlere aç, kendi klasörünü icat etme. Kendi rolünün dışındaki dosyaya dokunma.

```
aether-graph/
├── AGENTS.md, CLAUDE.md   # bu kurallar (aynı içerik)
├── .env / .env.example    # API anahtarları, koda girmez
├── index.html             # tek giriş sayfası
├── src/
│   ├── app.js             # başlangıç, olay bağlama
│   ├── ui/                # router, HUD, sorgu kutusu (eonetQueryBox), yanıt paneli (answerPanelController), pop-up penceresi (popupWindow), ElevenLabs oynatıcı (voicePlayer), STT, PDF
│   ├── services/geminiRouter.js   # + intentDetector, earthEventFocus, nasaPhoto*, geminiTelemetry, richContent, generalQuestion, generalImageFetcher, elevenLabsTts, speechTextCleaner, keywordMatch, sceneIntentGuard, nasaImageFilter
│   ├── three/threeSceneFactory.js # sözleşme kapısı → solarSystemScene (+ lightDelaySimulation) / planetComparisonScene / earthEventScene
│   ├── canvas/proceduralCanvas.js
│   ├── physics/spacePhysics.js, solarPosition.js
│   ├── api/dataLayer.js, historical_missions.json   # + eonetClient, marsOrbitalClient, neoClient, solarClient, horizonsClient, liveSpaceClient
│   ├── config/states.json, eonet_texts.json          # eonet_texts: sorgu kutusu ve yanıt paneli metinleri
│   └── logic/stateMachine.js
├── public/models/         # DRACO .glb dosyaları
├── tests/                 # <modül>.test.js, node --test ile
└── docs/models.md         # modellerin node ağacı, eklem eksenleri, açı aralıkları
```

Modeller `public/models/` altında durur, `src/` içine model koyulmaz. Sayfa `file://` ile değil yerel sunucudan açılır.

| Rol | Dosyalar |
|---|---|
| A. Mustafa, Gemini yönlendirici | `/src/services/geminiRouter.js` |
| B. Ertuğrul, 3D | `/src/three/`, `/public/models/`, `/docs/models.md` |
| C. Furkan, sahne akışı/metin | `/src/config/states.json`, `/src/logic/stateMachine.js` |
| D. Taha, veri | `/src/api/dataLayer.js`, `/src/api/historical_missions.json` |
| E. Ege, UI/router | `/src/ui/`, `/src/app.js`, `/index.html` |
| F. Mami, fizik/canvas | `/src/physics/spacePhysics.js`, `/src/canvas/proceduralCanvas.js` |
| Herkes | kendi modülünün testi `/tests/` altında |

## 4. Sözleşmeler

Bu imzaları ve şemayı kendi başına değiştirme, genişletme, yeniden adlandırma. Değişiklik gerekiyorsa dur ve kullanıcıya sor.

```js
getRouteFromGemini(userInput)                          // → JSON (async)
create3DMissionScene(container, modelUrl, onProgress)  // → { destroy() } (async)
getSpaceData(queryType, identifier)                    // → dizi/obje, ASLA null/undefined (async)
calculateLightDelay(source, target, mode)              // mode: "one-way"|"round-trip"
                                                       // → { delay_s, round_trip_s }
renderProceduralPlanet(canvasId, planetName)
handleActionRouter(json)
```

`create3DMissionScene` için özel `model_url` değerleri: `SOLAR_SYSTEM` (ana ekran), `SOLAR_FLARE`, `MARS_SURFACE`, `PLANET_COMPARISON` (istek container'ın `data-comparison-request` niteliğinde), `EARTH_EVENTS` (EONET Dünya küresi), `LIGHT_DELAY` (Güneş Sistemi + Dünya→Mars ışık ışını). `template_id: LIGHT_DELAY` gelen rotada UI Güneş Sistemi'ni açık tutar ve `ag:light-delay` `{ source, target, mode, speed_kms? }` gönderir. Diğer değerler `/public/models/<ad>.glb` yoludur.

EONET afetleri: `parameters.events` (normalize olay listesi: `id, title, category, category_title, timestamp_utc, status, coordinates{latitude_deg, longitude_deg}, magnitude_value, magnitude_unit, source_id, eonet_url`) ve `parameters.focus_event_id`. Bu alanlar varsa UI `template_id: NONE` + `model_url: EARTH_EVENTS` ile küreyi açar. Soruya uyan olay yoksa (Gemini `focus_event_id: "NONE"` döner ya da sorulan yer hiçbir olayda yoksa) olay listesi rotaya eklenmez; küre rastgele bir yeri işaretlemez.

Niyet kuralları: anahtar kelimeler metin içinde parça olarak değil kelime başında aranır (`services/keywordMatch.js`; "kıyafet" ≠ "afet"). Sahne şablonu (`SOLAR_FLARE`, `NEO_SWARM`, `LIGHT_DELAY`) ancak kullanıcı o olayı söylediyse açılır (`services/sceneIntentGuard.js`). Gemini odak hedefini `parameters.target_object` ile verir; kullanıcı tekil bir modeli açıkça adlandırdıysa o model açılır. NASA görsel sonuçlarından harita/rota çizilmiş, etiketli, illüstrasyon ve animasyon kayıtları elenir (`services/nasaImageFilter.js`).

JSON: `{ action_type, template_id, parameters, speech_text, is_student_mode }`
- `speech_text` kodda yazılmaz, Gemini üretir. JSON dışı ham metin UI'ya sızmaz. İçinde link, alan adı, resim/model dosyası adı veya arşiv kimliği bulunmaz (`speechTextCleaner.js`); görseller sadece `parameters` içinde durur.
- Seslendirme ElevenLabs ile yapılır: tarayıcı `POST /api/tts` çağırır, anahtar sadece sunucudaki `.env` içindedir. Tarayıcının sentez sesi kullanılmaz.
- Zengin içerik alanları (pop-up ve bilgi kartı): `description`, `facts: [{label, value}]`, `sections: [{heading, body}]`, `image_query`, `is_general_question`. Genel soruda (`is_general_question: true`) rota `OPEN_POPUP` + `NONE` olur, sahnede odak yapılmaz, görsel Wikipedia/NASA arşivinden gelir. Belirli bir cisim/araç/yerle ilgili sorularda (Aya ilk ayak basan insan kim) `FOCUS_OBJECT` + `target_object` kalır; sunucu `image_query` ile fotoğrafı bulup `supporting_photo: true` ekler ve UI sahnede odağı korurken fotoğrafı pop-up penceresinde de açar.
- Konuşma metni sağ panelde değil, şeffaf altyazı olarak (`subtitleController.js`, `#subtitle-bar`) gösterilir. Sağ panel yalnızca EONET afet kartı içindir.
- `template_id`: `LIGHT_DELAY`, `GRAVITY_SIM`, `NEO_SWARM`, `SOLAR_FLARE`, `APOLLO_11`, `NONE`
- `action_type`: `OPEN_POPUP`, `SPLIT_SCREEN`, `OPEN_SIDE_PANEL`, `CLOSE_PANEL`, `EXPAND_HUD`, `MINIMIZE_HUD`, `FOCUS_OBJECT`, `PAN_TO`, `RESET_VIEW`, `HIGHLIGHT_OBJECT`, `SHOW_COMPARISON`, `SHOW_TIMELINE`, `SHOW_FACT_CARD`, `PLAY_ANIMATION`, `PAUSE_ANIMATION`, `SIMPLIFY_TEXT`, `ADD_TO_HOMEWORK`, `SHOW_HOMEWORK_BASKET`, `EXPORT_PDF`
- Listede olmayan değer üretme. Eksik bir değer varsa kullanıcıya sor.

## 5. Kod kuralları

- Vanilla JS, ES modülleri. Yeni kütüphane, framework, build aracı ekleme. Onaylı olanlar: Three.js (GLTFLoader, DRACOLoader, OrbitControls), Google Gen AI SDK, html2pdf.js. Başkası için sor.
- İsimler İngilizce `camelCase`, sınıflar `PascalCase`, sabitler `UPPER_SNAKE`. Yorumlar kısa Türkçe, ne yaptığını değil neden öyle yaptığını yazar. Ayrıntı Bölüm 6'da.
- Bir fonksiyon tek iş yapar. Dosya 300 satırı geçerse böl.
- Önce mevcut kodu oku, var olan yardımcıyı kullan, aynısını yeniden yazma.
- Metin kodda yazılmaz, `states.json`'dan gelir. Fizik sabitleri (ışık hızı, g değerleri) `spacePhysics.js`'te tek yerde tanımlanır, başka yerde tekrar yazılmaz.
- API anahtarı `.env`'den okunur. Koda, loga, hata mesajına yazılmaz.
- Kullanılmayan kod, yorum satırına alınmış eski kod, istenmeyen refactor ve "bu da dursun" eklemeleri bırakma.

## 6. İsimlendirme ve uyum kuralları

Amaç: başka agent'ın yazdığı kod senin kodunla karşılaştığında çökmesin. Aşağıdakiler tartışmaya açık değil, hepsi aynı olacak.

**Dosya ve klasör isimleri**
- JS dosyaları `camelCase.js` (`geminiRouter.js`, `spacePhysics.js`). Klasörler küçük harf, tek kelime.
- JSON dosyaları `snake_case.json` (`states.json`, `historical_missions.json`).
- Model dosyaları küçük harf `snake_case.glb` (`perseverance.glb`, `saturn_v.glb`).
- Test dosyaları `<modül>.test.js`, modülün adıyla birebir aynı.

**Kod isimleri**
- Değişken ve fonksiyon `camelCase`, sınıf `PascalCase`, sabit `UPPER_SNAKE`.
- Fonksiyon önekleri, anlamı sabit:
  - `get...` bir veriyi okur/getirir
  - `calculate...` saf hesap yapar, dışarıyı değiştirmez
  - `render...` canvas/DOM'a çizer
  - `create...` yeni bir nesne kurar ve döner
  - `destroy...` temizler
  - `handle...` bir olayı veya aksiyonu işler
  - `is...` / `has...` sadece boolean döner
- Birimler isme yazılır: `delay_s`, `distance_km`, `velocity_kmh`, `angle_deg`. Birimsiz `distance`, `time` yazma.

**Veri isimleri**
- JSON alan isimleri `snake_case` ve JS içinde de **aynen** kullanılır. `speech_text` alanını `speechText`'e çevirip ikinci bir kopya üretme.
- Sabit değerler (`action_type`, `template_id`, state id'leri, `camera_target`) `UPPER_SNAKE` ya da sözleşmedeki yazımıyla aynen kullanılır. Küçük harfe çevirip karşılaştırma yapma.
- Açılar JSON/UI'da derece (`_deg`), Three.js'e verirken radyan. Dönüşüm sadece sınırda yapılır, aradaki kodda birim karışmaz.
- Fizik hesapları kilometre ve saniye cinsindendir. Sahne birimine (Three.js birimi) çevirme tek bir fonksiyonda yapılır, başka yerde ölçek çarpanı yazılmaz.

**Modül kuralları**
- Sadece named export kullan, `export default` yok. Import yolları göreli ve `.js` uzantılıdır.
- Import anında kod çalışmaz (yan etki yok). Başlatma bir fonksiyon çağrısıyla yapılır.
- Global değişken ve `window.X` yok. Durum kendi modülünün içinde kalır.
- Döngüsel import yok. Bağımlılık sadece akıştaki yönde gider (Bölüm 2).
- Async olan sözleşme fonksiyonları: `getRouteFromGemini`, `getSpaceData`, `create3DMissionScene` (Promise döner, `await` ile çağrılır). Diğerleri senkrondur. Bunu kendi başına değiştirme.

**Dışarıdan gelen veriye güvenme**
- Başka modülden, JSON'dan, API'den veya Gemini'den gelen her veriyi kullanmadan önce doğrula. Bilinmeyen alanı yok say, eksik alana varsayılan koy.
- Bilinmeyen `action_type` hiçbir şey yapmaz ve `console.warn` yazar. Bilinmeyen `template_id` `NONE` gibi davranır. Bilinmeyen `camera_target` varsayılan görünüme döner. Hiçbiri hata fırlatmaz.
- Sözleşme fonksiyonları `throw` etmez, her zaman geçerli bir değer döner.

**DOM ve CSS**
- Element `id` ve CSS sınıfları `kebab-case`. Sahneye özel olanlar sahne adıyla başlar: `mars-info-card`, `light-delay-panel`.
- Her parça sadece kendi container'ının içinde çalışır. Container dışındaki elemente `document.querySelector` ile uzanma, sana verilen elementi kullan.
- Stil sadece kendi sınıflarına yazılır, `body`, `html` veya etiket seçicisiyle (`div {}`) global stil yazma.

**Modüller arası haberleşme**
- Normal çağrı sözleşmedeki fonksiyonlarla yapılır. Geri bildirim için callback ver (`onProgress` gibi).
- Olay gerekiyorsa `CustomEvent` kullan, ismi `ag:<eylem>` kalıbında (`ag:scene-ready`, `ag:homework-added`). Başka kalıp icat etme.
- Kullanılan sahne olayları: `ag:focus-target`, `ag:neo-data`, `ag:solar-flare`, `ag:set-time-scale`, `ag:planet-comparison`, `ag:earth-events`, `ag:earth-view-shift`, `ag:earth-reset`, `ag:earth-event-picked`, `ag:light-delay`, `ag:light-delay-clear`, `ag:light-delay-status` (sahne → UI: faz ve süreler), `ag:mars-photo-ready` (uydu sorgusu → UI `getSpaceData("mars_orbital_photos", "<krater>|<kamera>")`).

## 7. Hata yönetimi

- `getSpaceData()` hata alırsa yedek veri döner, `null` dönmez. NASA ham verisi filtrelenmeden UI'ya gitmez (sadece gereken alanlar).
- Gemini yanıtı `JSON.parse` öncesi temizlenir (boşluk, kod bloğu işaretleri). Parse hatasında güvenli bir fallback JSON döner, ekran donmaz.
- İnternet yoksa uygulama yine açılır, statik veriyle çalışır.
- `try/catch` hatayı yutmaz: yedek davranışa geç ve `console.warn` ile bir kez yaz.

## 8. Stub'lar

Gerçek işi yazmadan önce sözleşmeye uyan bir stub yaz, böylece başkaları seni beklemeden çalışabilir.

- Her stub işaretlenir: `// STUB(ISIM): neyle değişecek`
- Stub, gerçeğiyle **aynı biçimde** veri döner (alan isimleri, tipler, dizi/obje). Rastgele veya eksik alan yok.
- Stub hata da simüle edebilmeli: `getSpaceData` stub'ı bilinmeyen `identifier` için boş dizi döner, `null` değil.
- Gerçeğiyle değiştirirken sözleşmeyi bozma. Değiştirdikten sonra `STUB` işaretini sil.
- Yeni yazdığın her stub'ı ve gerçek fonksiyonu aynı testten geçir (Bölüm 9).

## 9. Testler (genel)

Ek bağımlılık yok: Node'un yerleşik test koşucusu (`node --test`). Testler `/tests/` altında, dosya adı `<modül>.test.js`. Rolüne özel testler kendi rol bölümünde yazıyor.

- **Her sözleşme fonksiyonu için bir sözleşme testi yaz:** dönen değerin biçimini kontrol et (alanlar var mı, tipler doğru mu, `null` yok mu). Stub ve gerçek sürüm bu testi aynı şekilde geçmeli.
- **Saf mantığı mutlaka test et.** Hata yollarını da: bozuk girdi, eksik alan, bilinmeyen değer, internet yok.
- Ağ ve Gemini çağrıları testte sahte (mock) ile değiştirilir, gerçek ağa çıkılmaz.
- **Görsel işler** (3D animasyon, canvas) headless tarayıcıda ekran görüntüsü alıp bakılarak doğrulanır. Çalıştırmadan "çalışıyor" deme.
- Kodu değiştirdikten sonra ilgili testleri çalıştır. Geçmeyen testi silerek veya gevşeterek geçirme, kodu düzelt. Çalıştıramadıysan bunu açıkça söyle.

---

# ROL BÖLÜMLERİ (sadece kendi rolünü uygula)

## A. Mustafa: Gemini yönlendirici

Dosya: `/src/services/geminiRouter.js`. Sözleşme: `getRouteFromGemini(userInput)`.

- Kullanıcı girdisini Gemini'ye (Google Gen AI SDK, Structured Output) gönder, sadece Bölüm 4'teki JSON şemasına uyan çıktı döndür.
- Gemini'ye prompt'ta `template_id` ve `action_type` listelerini ver. Listede olmayan değer gelirse fallback'e düş, uydurma değeri UI'ya yollama.
- `JSON.parse` öncesi temizle (boşluk, ```json kod bloğu, regex). Parse hatasında `try/catch` ile şemaya uyan güvenli fallback JSON dön (`template_id: "NONE"`, zararsız bir `action_type`).
- `speech_text` 1-2 cümle, Gemini üretir. `is_student_mode` doğruysa sade dil iste.
- **Scope guard:** uzay, astronomi, gök mekaniği, roket, fizik dışındaki sorularda `template_id: "NONE"` ve konunun uzay olduğunu espriyle hatırlatan bir `speech_text` (Gemini üretir).
- API anahtarı tarayıcıda açıkta kalmamalı. Anahtarın nereden geleceği (ara katman ya da elle girilen ayar) kararlaştırılmadıysa kullanıcıya sor, anahtarı koda gömme.
- Stub: sabit, şemaya uyan bir JSON döner (`// STUB(MUSTAFA)`).
- **Testler:** temiz JSON, ```json içine sarılı JSON, bozuk JSON → fallback, bilinmeyen `template_id`/`action_type` → fallback, `speech_text` boş değil. Gemini çağrısı mock'lanır.

## B. Ertuğrul: 3D motor

Dosyalar: `/src/three/`, `/public/models/`, `/docs/models.md`. Sözleşme: `create3DMissionScene(container, modelUrl, onProgress)` → `{ destroy() }`.

- Furkan'ın animasyon planını (hangi nesne nereye gider, kamera nereye bakar) Three.js koduna sen çevirirsin. Planı değiştirme, eksik veya mümkün olmayan yer varsa kullanıcıya söyle.
- `camera_target` isimleri `CAMERA_TARGETS` tablosunda tek yerde tutulur. Bilinmeyen isim varsayılan görünüme döner.
- Sahne değişmeden önce eski sahnenin `destroy()` çağrılır: animasyon döngüsü iptal, mixer durdur, `scene.traverse` ile geometry/material/texture dispose, renderer dispose. Unutulursa tarayıcı kilitlenir.
- Yükleme ekranı zorunlu, yüzde `onProgress` ile UI'ya gelir.
- **Modelin mesh, geometry ve materyaline dokunma.** Hareket sadece node'ların `position/rotation/scale` değeriyle yapılır, değerler yumuşak değişir. Ani `position` atama (ışınlanma) yok.
- NASA .glb dosyalarında genelde animasyon ve iskelet yok. Hareketi Three.js'te node'lar üzerinden yaz.
- **Node ismi tuzağı:** `GLTFLoader` isimdeki noktayı siler (`arm.001` → `arm001`). Node ararken `THREE.PropertyBinding.sanitizeNodeName(isim)` kullan, ham isimle arama.
- Parent döndüğünde child'lar otomatik gelir. Zincirdeki her parçayı ayrıca döndürme.
- Eklem dönüşü: parçanın kendi orijini etrafında, dünya ekseninde döndür (eksenin kendi uzayından değil). Çalışan örnek: sohbette yapılan Perseverance rover sayfası (`Joint` sınıfı).
- Tek mesh içinde birden fazla parça varsa (Perseverance tekerleri tek mesh) parçaları üçgen kümeleriyle ayır, her birine kendi pivotunu ver. Vertex verisini kopyalama, index'leri ayır.
- Yeni model: önce node ağacını (isim, çocuklar, dünya konumu, sınır kutusu) çıkar, `docs/models.md` içine yaz, sonra animasyona geç. Animasyon açılarını tahmin etme, çarpışma ve zemine girme için ölç.
- Modelleri küçük tut (DRACO sıkıştırma). Gereksiz büyük dosya yükleme süresini öldürür.
- Tarayıcıda `file://` ile model yüklenmez, yerel sunucudan aç.
- Stub: küp çizen sahne, ama `destroy()` gerçekten temizler (`// STUB(ERTUGRUL)`).
- **Testler:** `destroy()` 10 kez aç-kapa testi (her seferinde `renderer.dispose` ve `cancelAnimationFrame` çağrıldığı kontrol edilir), bilinmeyen `camera_target` hata vermez. Bu test geçmeden sahne bitmiş sayılmaz. Animasyonlar headless ekran görüntüsüyle doğrulanır.

## C. Furkan: sahne akışı ve içerik

Dosyalar: `/src/config/states.json`, `/src/logic/stateMachine.js`. Sınıf: `MissionStateMachine`.

- Sahnelerin adım adım akışı ve **ekranda görünecek bütün metinler** `states.json`'dadır. Metin başka yere yazılmaz.
- Her adım: `title`, `description`, `camera_target`, `next_actions`. `next_actions` elemanı ya `target_state` ile başka adıma gider ya da `action` ile işlem yapar (`ADD_TO_NOTEBOOK`). State id'leri `UPPER_SNAKE` (`LEO`, `TLI`).
- Geçerli `template_id` ve görev listesini bu dosyada tek yerde kilitle. Gemini bu listeden başkasını üretemez.
- `MissionStateMachine`: onaylanan ("Ödeve ekle") adımları benzersiz bir ödev sepeti dizisine aktarır, aynı adım iki kez eklenmez.
- Animasyon planı yazarken kod yazma: düz metin veya basit JSON ile hangi nesne nereye gider, kamera nereye bakar, kaç saniye sürer tarif et. Kodu Ertuğrul yazar.
- Stub: tek state'li küçük bir `states.json` (`// STUB(FURKAN)` yorumu JSON'a yazılamaz, `_stub: true` alanı kullan).
- **Testler:** şema doğrulama (zorunlu alanlar var), her `target_state` var olan bir adıma gidiyor, her `template_id` geçerli listede, ödev sepeti tekrar eklemiyor, başlangıç state'inden her state'e ulaşılabiliyor.

## D. Taha: veri katmanı

Dosyalar: `/src/api/dataLayer.js`, `/src/api/historical_missions.json`. Sözleşme: `getSpaceData(queryType, identifier)`.

- Sorgu sırası: önce yerel statik JSON, yoksa cache, yoksa canlı API.
- Cache: LocalStorage, 15 dakika TTL. Süre dolunca yeniler.
- Canlı kaynaklar: NASA NeoWs (asteroit), NOAA (Güneş). Statik: Venera iniş koordinatları, Apollo görevleri.
- NeoWs yanıtı sadece `name`, `distance_km`, `velocity_kmh`, `is_hazardous` alanlarına filtrelenir. Ham NASA verisi UI'ya gitmez.
- Her ağ çağrısında timeout var. Hata, timeout veya internet yoksa yedek veri döner. **Hiçbir durumda `null` veya `undefined` dönmez**, her zaman dizi veya obje.
- Bilinmeyen `queryType` veya `identifier` için boş dizi döner.
- Stub: sabit, gerçeğiyle aynı alanlara sahip veri döner (`// STUB(TAHA)`).
- **Testler:** önce statik, sonra cache, sonra API sırası; cache TTL dolunca yenileme; internet yok → yedek veri; bilinmeyen kimlik → boş dizi; NeoWs filtresi sadece 4 alan bırakıyor. `fetch` ve `localStorage` mock'lanır.

## E. Ege: UI ve router

Dosyalar: `/src/ui/`, `/src/app.js`, `/index.html`. Sözleşme: `handleActionRouter(json)`.

- `handleActionRouter` Switch-Case ile Bölüm 4'teki **bütün** `action_type` değerlerini karşılar. Bilinmeyen değer `console.warn` yazar, hata fırlatmaz.
- **Yeni 3D sahne açmadan önce eskisinin `destroy()` çağrılır.** Sahne geçişinde yükleme animasyonu ("Sinyal işleniyor…") aynı anda gösterilir, ilerleme `onProgress`'ten gelir.
- Sahneleri, canvas'ları ve veriyi sadece sözleşme fonksiyonlarıyla çağırırsın. Onların iç koduna girme.
- Ses: Web Speech API ile STT (`webkitSpeechRecognition`) ve TTS (`SpeechSynthesis`, `tr-TR`). Ses tanıma sadece Chrome'da güvenilir, desteklenmiyorsa yazıyla girişe düş, uygulama ses olmadan da tam çalışmalı.
- PDF: `html2pdf.js` ile Küçük Kaşif ödev sepetinden PDF üretilir.
- Her UI parçası kendi container'ında çalışır, global stil yazma (Bölüm 6).
- Stub: her `action_type` için ekrana adını yazan basit bir davranış (`// STUB(EGE)`).
- **Testler:** router tablosu `action_type` listesindeki her değeri karşılıyor, bilinmeyen değer çökmüyor, sahne değişirken `destroy()` önce çağrılıyor (mock sahneyle), ses desteği yokken yazıyla giriş çalışıyor.

## F. Mami: fizik, canvas ve birleştirme

Dosyalar: `/src/physics/spacePhysics.js`, `/src/canvas/proceduralCanvas.js`. Sözleşmeler: `calculateLightDelay`, `renderProceduralPlanet`.

- **Fizik:** ışık gecikmesi d/c (`mode: "one-way"` tek yön, `"round-trip"` gidiş-dönüş), zaman hızlandırma çarpanı, düşme süresi `T=√(2H/g)`. Sabitler (c, g değerleri) bu dosyada tek yerde. Birimler km ve saniye.
- `calculateLightDelay` saf fonksiyon: `{ delay_s, round_trip_s }` döner.
- **Canvas:** `renderProceduralPlanet(canvasId, planetName)` dış resim kullanmadan (zero-asset) çizer. Gezegen tohumludur (seed): aynı isim her seferinde aynı görünür. Radyal gölgelendirme (limb darkening) kullan. Jezero krateri `cos(lon) > 0` koşuluyla, dönerken doğru konumda görünür ve gizlenir.
- **Birleştirme:** sözleşme değişikliği ve parçaların birleştirilmesi kararı sendedir. Bölüm 4'teki imzalar ancak senin onayınla değişir.
- Stub: sabit değer döndüren hesap ve düz renkli daire (`// STUB(MAMI)`).
- **Testler:** Ay-Dünya tek yön ≈ 1.28 sn, Dünya-Güneş tek yön ≈ 499 sn, round-trip = tek yön × 2, sıfır veya negatif mesafe hata fırlatmaz, düşme süresi bilinen bir değerle eşleşiyor, aynı seed aynı çıktıyı veriyor. Canvas görseli headless ekran görüntüsüyle doğrulanır.
