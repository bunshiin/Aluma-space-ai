import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSpaceData } from '../src/api/dataLayer.js';

describe('DataLayer - getSpaceData Sözleşme ve Fonksiyonel Testleri', () => {

  // Her test öncesi sahte localStorage ve fetch ortamını sıfırla
  let mockStorage = {};

  beforeEach(() => {
    mockStorage = {};

    globalThis.localStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; }
    };

    // Varsayılan fetch mock
    globalThis.fetch = async (url) => {
      throw new Error('fetch mock default: network unreachable');
    };
  });

  // 1. Sözleşme Testi: Asla null/undefined dönmemeli
  it('sözleşme: getSpaceData asla null veya undefined dönmez', async () => {
    const res1 = await getSpaceData('unknown_query', 'unknown_id');
    assert.ok(res1 !== null && res1 !== undefined, 'res1 null veya undefined olamaz');
    assert.deepEqual(res1, [], 'Bilinmeyen sorguda boş dizi dönmeli');

    const res2 = await getSpaceData('', '');
    assert.deepEqual(res2, [], 'Boş sorguda boş dizi dönmeli');

    const res3 = await getSpaceData(null, null);
    assert.deepEqual(res3, [], 'null argümanlarda boş dizi dönmeli');
  });

  // 2. Statik Veri: historical_missions.json
  it('statik veri: Apollo 11 ve Venera görevlerini doğru formatta döner', async () => {
    const apollo = await getSpaceData('historical', 'apollo_11');
    assert.ok(apollo, 'Apollo verisi dönmeli');
    assert.equal(apollo.id, 'apollo_11');
    assert.equal(apollo.name, 'Apollo 11');
    assert.ok(apollo.coordinates.latitude_deg !== undefined);
    assert.ok(apollo.coordinates.longitude_deg !== undefined);

    const venera = await getSpaceData('historical', 'venera_7');
    assert.ok(venera, 'Venera verisi dönmeli');
    assert.equal(venera.id, 'venera_7');
    assert.equal(venera.target, 'Venus');
    assert.equal(venera.pressure_atm, 90);

    const all = await getSpaceData('historical', 'all');
    assert.ok(Array.isArray(all), 'Tüm görevler dizi olarak dönmeli');
    assert.ok(all.length >= 2, 'En az 2 tarihi görev bulunmalı');
  });

  // 3. Bilinmeyen kimlik ve kaldırılan üçüncü parti sorgular boş dizi dönmeli
  it('bilinmeyen kimlik için tüm sorgu tiplerinde boş dizi döner', async () => {
    assert.deepEqual(await getSpaceData('historical', 'non_existent_mission_xyz'), []);
    assert.deepEqual(await getSpaceData('spacecraft', 'enterprise_ncc1701'), []);
    assert.deepEqual(await getSpaceData('comparison', 'earth_vs_pluto_xyz'), []);
    assert.deepEqual(await getSpaceData('light_delay', 'andromeda_xyz'), []);
    assert.deepEqual(await getSpaceData('eonet', 'invalid_category_xyz'), []);
    assert.deepEqual(await getSpaceData('solar', 'invalid_solar_xyz'), []);
    assert.deepEqual(await getSpaceData('apod', 'invalid_apod_xyz'), []);
    assert.deepEqual(await getSpaceData('iss', 'invalid_iss_xyz'), []);
    assert.deepEqual(await getSpaceData('mars_photos', 'invalid_rover_xyz'), []);
    assert.deepEqual(await getSpaceData('astronauts'), []);
  });

  // 4. NeoWs Filtreleme Testi (Ham NASA verisinden sadece 4 alan kalmalı)
  it('NeoWs filtresi: Ham NASA yanıtını sadece name, distance_km, velocity_kmh, is_hazardous alanlarına indirger', async () => {
    const rawNasaResponse = {
      near_earth_objects: {
        '2026-11-14': [
          {
            id: '12345',
            name: 'Asteroid Test-1',
            nasa_jpl_url: 'https://ssd.jpl.nasa.gov/...',
            absolute_magnitude_h: 22.1,
            is_potentially_hazardous_asteroid: true,
            close_approach_data: [
              {
                close_approach_date: '2026-11-14',
                miss_distance: {
                  kilometers: '450000.75'
                },
                relative_velocity: {
                  kilometers_per_hour: '62500.25'
                }
              }
            ]
          }
        ]
      }
    };

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => rawNasaResponse
    });

    const result = await getSpaceData('neo');
    assert.ok(Array.isArray(result), 'NeoWs sonucu dizi olmalı');
    assert.equal(result.length, 1);

    const asteroid = result[0];
    const keys = Object.keys(asteroid).sort();
    assert.deepEqual(keys, ['distance_km', 'is_hazardous', 'name', 'velocity_kmh']);
    assert.equal(asteroid.name, 'Asteroid Test-1');
    assert.equal(asteroid.distance_km, 450000.75);
    assert.equal(asteroid.velocity_kmh, 62500.25);
    assert.equal(asteroid.is_hazardous, true);
  });

  // 5. Sıralama ve Cache Testi: Statik -> Cache -> API
  it('cache ve sıralama: 15 dakika dolmamışsa cache kullanılır, API çağrılmaz', async () => {
    let apiCallCount = 0;
    globalThis.fetch = async () => {
      apiCallCount++;
      return {
        ok: true,
        json: async () => ({
          near_earth_objects: {
            '2026-11-14': [
              {
                name: 'Cached Asteroid',
                is_potentially_hazardous_asteroid: false,
                close_approach_data: [{
                  miss_distance: { kilometers: '1000000' },
                  relative_velocity: { kilometers_per_hour: '50000' }
                }]
              }
            ]
          }
        })
      };
    };

    // İlk çağrı: API'ye gider ve cache'e yazar
    const firstCall = await getSpaceData('neo');
    assert.equal(apiCallCount, 1, 'İlk çağrıda API çağrılmalı');
    assert.equal(firstCall[0].name, 'Cached Asteroid');

    // İkinci çağrı: Cache'ten gelir, API çağrılmaz
    const secondCall = await getSpaceData('neo');
    assert.equal(apiCallCount, 1, 'İkinci çağrıda API çağrılmamalı (cache kullanılmalı)');
    assert.equal(secondCall[0].name, 'Cached Asteroid');
  });

  // 6. TTL Dolunca Yenileme Testi
  it('cache TTL: 15 dakika (900.000 ms) dolunca cache geçersiz kılınır ve API tekrar çağrılır', async () => {
    let apiCallCount = 0;
    globalThis.fetch = async () => {
      apiCallCount++;
      return {
        ok: true,
        json: async () => ({
          near_earth_objects: {
            'today': [{
              name: `Asteroid Call ${apiCallCount}`,
              is_potentially_hazardous_asteroid: false,
              close_approach_data: [{
                miss_distance: { kilometers: '500000' },
                relative_velocity: { kilometers_per_hour: '30000' }
              }]
            }]
          }
        })
      };
    };

    // İlk çağrı
    await getSpaceData('neo');
    assert.equal(apiCallCount, 1);

    // Cache'teki zaman damgasını 16 dakika önceye alalım
    const cacheKey = 'ag_cache_neo_default';
    const cachedItem = JSON.parse(mockStorage[cacheKey]);
    cachedItem.timestamp = Date.now() - (16 * 60 * 1000); // 16 dk önce
    mockStorage[cacheKey] = JSON.stringify(cachedItem);

    // Tekrar çağır: TTL dolduğu için API tekrar çağrılmalı
    const refreshed = await getSpaceData('neo');
    assert.equal(apiCallCount, 2, 'TTL dolunca API tekrar çağrılmalı');
    assert.equal(refreshed[0].name, 'Asteroid Call 2');
  });

  // 7. İnternet Yok / API Hatası -> Yedek Veri (Fallback) Testi
  it('offline / hata: API çökerse veya internet yoksa yedek veri döner ve null dönmez', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network offline');
    };

    const fallbackNeo = await getSpaceData('neo');
    assert.ok(Array.isArray(fallbackNeo), 'Hata durumunda dizi dönmeli');
    assert.ok(fallbackNeo.length > 0, 'Yedek asteroit verisi dönmeli');
    assert.ok(fallbackNeo[0].name, 'Yedek veride asteroid ismi olmalı');
    assert.ok(fallbackNeo[0].distance_km !== undefined);
    assert.ok(fallbackNeo[0].velocity_kmh !== undefined);
    assert.ok(typeof fallbackNeo[0].is_hazardous === 'boolean');

    const fallbackSolar = await getSpaceData('solar');
    assert.ok(fallbackSolar, 'Yedek güneş verisi dönmeli');
    assert.ok(fallbackSolar.flare_class, 'flare_class alanı olmalı');
  });

  // 8. JPL Horizons Uzay Araçları Testi (Voyager 1, JWST vb.)
  it('uzay araçları: NASA JPL Horizons üzerinden Voyager 1 ve filo verilerini döner', async () => {
    const mockHorizonsResponse = {
      result: `
$$SOE
2461358.500000000 = A.D. 2026-Nov-14 00:00:00.0000 TDB
 X =-4.912043586561117E+09 Y =-2.063586373330775E+10 Z = 1.484685974954952E+10
 VX= 2.165756081405079E+01 VY=-3.214190471388485E+01 VZ= 9.833333113551031E+00
 LT= 8.636645576449258E+04 RG= 2.589201206238549E+10 RR= 2.714687444998081E+01
$$EOE`
    };

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => mockHorizonsResponse
    });

    const v1 = await getSpaceData('spacecraft', 'voyager_1');
    assert.ok(v1, 'Voyager 1 verisi dönmeli');
    assert.equal(v1.name, 'Voyager 1');
    assert.equal(v1.distance_km, 25892012062.38549);
    assert.equal(v1.light_time_s, 86366.5);
    assert.equal(v1.round_trip_s, 172733.0);
    assert.equal(v1.relative_speed_kms, 27.15);
    assert.ok(v1.position_vectors.x_km !== undefined);

    const list = await getSpaceData('spacecraft', 'list');
    assert.ok(Array.isArray(list), 'Filo listesi dizi dönmeli');
    assert.ok(list.length >= 5, 'En az 5 uzay aracı desteklenmeli');
  });

  // 9. NASA APOD Testi
  it('APOD: Günün uzay fotoğrafı verisini döner', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        title: 'Andromeda Mock',
        date: '2026-11-14',
        explanation: 'Test galaxy explanation',
        hdurl: 'https://nasa.gov/andromeda.jpg'
      })
    });

    const apod = await getSpaceData('apod');
    assert.ok(apod, 'APOD verisi dönmeli');
    assert.equal(apod.title, 'Andromeda Mock');
    assert.ok(apod.url, 'Görsel URL alanı olmalı');
  });

  // 10. Canlı ISS Konumu Testi (NASA JPL Horizons)
  it('ISS: NASA JPL Horizons vektörlerinden ISS konum, irtifa ve hızını hesaplar', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        result: `
$$SOE
2461358.500000000 = A.D. 2026-Nov-14 00:00:00.0000 TDB
 X = 3.824420090269028E+03 Y = 4.078530952204405E+03 Z = 3.851136339742219E+03
 VX=-2.214208481011902E+00 VY= 6.032913998923958E+00 VZ=-4.175856596027661E+00
 LT= 2.264599410405090E-02 RG= 6.789098236306927E+03 RR= 8.185180023037770E-03
$$EOE`
      })
    });

    const iss = await getSpaceData('iss');
    assert.ok(iss, 'ISS verisi dönmeli');
    assert.equal(iss.source, 'NASA JPL Horizons');
    assert.equal(iss.altitude_km, 418.1);
    assert.ok(typeof iss.latitude_deg === 'number');
    assert.ok(typeof iss.longitude_deg === 'number');
    assert.ok(iss.velocity_kmh > 27000 && iss.velocity_kmh < 28500);
  });

  // 11. NASA Mars 2020 Perseverance Fotoğrafları Testi
  it('Mars Fotoğrafları: Resmi mars.nasa.gov üzerinden Perseverance görsellerini döner', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        images: [
          {
            sol: 2031,
            camera: { instrument: 'SUPERCAM_RMI' },
            image_files: { large: 'https://mars.nasa.gov/mock_photo.jpg' },
            date_taken_utc: '2026-11-06T12:16:25.848'
          }
        ]
      })
    });

    const photos = await getSpaceData('mars_photos');
    assert.ok(Array.isArray(photos), 'Mars fotoğrafları dizi dönmeli');
    assert.equal(photos.length, 1);
    assert.equal(photos[0].sol, 2031);
    assert.equal(photos[0].camera, 'SUPERCAM_RMI');
    assert.equal(photos[0].image_url, 'https://mars.nasa.gov/mock_photo.jpg');
  });

  // 12. Gezegen Karşılaştırma Matrisi (SHOW_COMPARISON) Testi
  it('karşılaştırma: İki gezegenin yerçekimi ve fiziksel özelliklerini karşılaştırır', async () => {
    const comp = await getSpaceData('comparison', 'earth_vs_mars');
    assert.ok(comp.target_1 && comp.target_2, 'İki gezegen verisi dönmeli');
    assert.equal(comp.target_1.name, 'Dünya');
    assert.equal(comp.target_2.name, 'Mars');
    assert.equal(comp.target_1.gravity_ms2, 9.807);
    assert.equal(comp.target_2.gravity_ms2, 3.71);
  });

  // 13. Işık Gecikmesi Simülasyonu (LIGHT_DELAY) Testi
  it('ışık gecikmesi: Hedef gök cismine olan gecikme ve risk seviyesini döner', async () => {
    const moon = await getSpaceData('light_delay', 'moon');
    assert.equal(moon.delay_s, 1.28);
    assert.equal(moon.risk_level, 'LOW');

    const mars = await getSpaceData('light_delay', 'mars');
    assert.equal(mars.delay_s, 750.5);
    assert.equal(mars.round_trip_s, 1501.0);
    assert.equal(mars.risk_level, 'MEDIUM');
  });

  // 14. NASA EONET Doğal Afet ve Olaylar Testi
  it('EONET: Dünya üzerindeki aktif doğal afetleri, şiddetini ve rotasını döner', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        events: [
          {
            id: 'EONET_9999',
            title: 'Mock Typhoon Trajectory',
            categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
            geometry: [
              { type: 'Point', date: '2026-11-12T00:00:00Z', coordinates: [144.2, 19.1], magnitudeValue: 35, magnitudeUnit: 'kts' },
              { type: 'Point', date: '2026-11-14T00:00:00Z', coordinates: [154.1, 30.2], magnitudeValue: 65, magnitudeUnit: 'kts' }
            ],
            sources: [{ id: 'JTWC' }]
          }
        ]
      })
    });

    const events = await getSpaceData('eonet', 'severeStorms');
    assert.ok(Array.isArray(events), 'EONET sonucu dizi olmalı');
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'EONET_9999');
    assert.equal(events[0].title, 'Mock Typhoon Trajectory');
    assert.equal(events[0].category, 'severeStorms');
    assert.equal(events[0].category_title, 'Severe Storms');
    assert.equal(events[0].coordinates.latitude_deg, 30.2);
    assert.equal(events[0].coordinates.longitude_deg, 154.1);
    assert.equal(events[0].magnitude_value, 65);
    assert.equal(events[0].magnitude_unit, 'kts');
    assert.equal(events[0].track_point_count, 2);
    assert.equal(events[0].source_id, 'JTWC');
  });

  // 15. NeoWs latest:1, latest:3 (tarihsel en güncel) ve largest (kayıtlı en büyük) sorguları
  it('NeoWs sorguları: latest:1 ve latest:3 en güncel tarihi seçer, largest en büyük çaplı asteroidi döner', async () => {
    const feedMock = {
      near_earth_objects: {
        '2026-11-12': [{
          name: 'Ast-Old',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: { kilometers: { estimated_diameter_max: 0.2 } },
          close_approach_data: [{ close_approach_date_full: '2026-Nov-12 10:00', epoch_date_close_approach: Date.parse('2026-11-12T10:00:00Z'), miss_distance: { kilometers: '900000' }, relative_velocity: { kilometers_per_hour: '40000' } }]
        }],
        '2026-11-15': [{
          name: 'Ast-Newest-1',
          is_potentially_hazardous_asteroid: true,
          estimated_diameter: { kilometers: { estimated_diameter_max: 0.5 } },
          close_approach_data: [{ close_approach_date_full: '2026-Nov-15 22:00', epoch_date_close_approach: Date.parse('2026-11-15T22:00:00Z'), miss_distance: { kilometers: '350000' }, relative_velocity: { kilometers_per_hour: '75000' } }]
        }],
        '2026-11-14': [
          {
            name: 'Ast-Mid-2',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { kilometers: { estimated_diameter_max: 0.3 } },
            close_approach_data: [{ close_approach_date_full: '2026-Nov-14 18:00', epoch_date_close_approach: Date.parse('2026-11-14T18:00:00Z'), miss_distance: { kilometers: '500000' }, relative_velocity: { kilometers_per_hour: '50000' } }]
          },
          {
            name: 'Ast-Mid-3',
            is_potentially_hazardous_asteroid: false,
            estimated_diameter: { kilometers: { estimated_diameter_max: 0.4 } },
            close_approach_data: [{ close_approach_date_full: '2026-Nov-14 08:00', epoch_date_close_approach: Date.parse('2026-11-14T08:00:00Z'), miss_distance: { kilometers: '700000' }, relative_velocity: { kilometers_per_hour: '60000' } }]
          }
        ]
      }
    };
    const browseMock = {
      near_earth_objects: [
        {
          name: '433 Eros (A898 PA)',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: { kilometers: { estimated_diameter_max: 23.0 } },
          close_approach_data: [{ orbiting_body: 'Earth', epoch_date_close_approach: Date.parse('2026-10-01T00:00:00Z'), miss_distance: { kilometers: '26000000' }, relative_velocity: { kilometers_per_hour: '80000' } }]
        },
        {
          name: '1036 Ganymed (A924 UB)',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: { kilometers: { estimated_diameter_max: 38.5 } },
          close_approach_data: [{ orbiting_body: 'Earth', epoch_date_close_approach: Date.parse('2024-10-13T01:56:00Z'), miss_distance: { kilometers: '55964000' }, relative_velocity: { kilometers_per_hour: '63200' } }]
        }
      ]
    };

    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () => (String(url).includes('/neo/browse') ? browseMock : feedMock)
    });

    const latest1 = await getSpaceData('neo', 'latest:1');
    assert.equal(latest1.length, 1);
    assert.equal(latest1[0].name, 'Ast-Newest-1');

    const latest3 = await getSpaceData('neo', 'latest:3');
    assert.deepEqual(latest3.map(a => a.name), ['Ast-Newest-1', 'Ast-Mid-2', 'Ast-Mid-3']);

    const largest = await getSpaceData('neo', 'largest');
    assert.equal(largest.length, 1);
    assert.equal(largest[0].name, '1036 Ganymed (A924 UB)');
    assert.equal(largest[0].diameter_km, 38.5);
  });

});
