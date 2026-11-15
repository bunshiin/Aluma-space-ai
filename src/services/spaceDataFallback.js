// dataLayer.js bulunamadığında veya yanıt vermediğinde kullanılan yedek uzay verileri

function createFallbackRegistry() {
  const todayIso = new Date().toISOString();
  const todayDate = todayIso.split("T")[0];

  return {
    missions: {
      apollo_11: { id: "apollo_11", name: "Apollo 11", target: "Moon", launch_date: "1969-07-16", landing_date: "1969-07-20T20:17:40Z", landing_site: "Mare Tranquillitatis", coordinates: { latitude_deg: 0.67408, longitude_deg: 23.47297 }, crew: ["Neil Armstrong", "Buzz Aldrin", "Michael Collins"], image_url: "https://images-assets.nasa.gov/image/as11-40-5874/as11-40-5874~orig.jpg", description: "İnsanlığın Ay yüzeyine ilk başarılı inişi." },
      venera_7: { id: "venera_7", name: "Venera 7", target: "Venus", launch_date: "1970-08-17", landing_date: "1970-12-15T05:34:10Z", temperature_c: 475, pressure_atm: 90, description: "Başka bir gezegenin yüzeyinden ilk veri aktaran araç." },
      perseverance: { id: "perseverance", name: "Perseverance Rover", target: "Mars", launch_date: "2020-07-30", landing_date: "2021-02-18T20:55:00Z", landing_site: "Jezero Krateri", coordinates: { latitude_deg: 18.38, longitude_deg: 77.58 }, image_url: "https://images-assets.nasa.gov/image/PIA26242/PIA26242~orig.jpg", nasa_gallery_url: "https://science.nasa.gov/mission/mars-2020-perseverance/mars-images/", description: "Mars'ta antik yaşam izleri arayan rover." },
      jwst: { id: "jwst", name: "James Webb Uzay Teleskobu", target: "Sun-Earth L2", launch_date: "2021-12-25", orbit_altitude_km: 1500000, image_url: "https://images-assets.nasa.gov/image/weic2205a/weic2205a~orig.jpg", nasa_gallery_url: "https://science.nasa.gov/mission/webb/multimedia/images/", description: "Kızılötesi astronominin amiral gemisi uzay teleskobu." },
      hubble: { id: "hubble", name: "Hubble Uzay Teleskobu", target: "Low Earth Orbit", launch_date: "1990-04-24", orbit_altitude_km: 540, image_url: "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001362/GSFC_20171208_Archive_e001362~orig.jpg", nasa_gallery_url: "https://science.nasa.gov/mission/hubble/multimedia/hubble-images/", description: "Derin uzay gözlemleri yapan optik teleskop." },
    },
    planets: {
      mercury: { name: "Mercury", gravity_ms2: 3.7, radius_km: 2439.7, mass_kg: 3.3e23, day_length_hours: 4222.6, mean_temp_c: 167, distance_from_sun_km: 57900000, moons_count: 0 },
      venus: { name: "Venus", gravity_ms2: 8.87, radius_km: 6051.8, mass_kg: 4.87e24, day_length_hours: 2802.0, mean_temp_c: 464, distance_from_sun_km: 108200000, moons_count: 0 },
      earth: { name: "Earth", gravity_ms2: 9.81, radius_km: 6371.0, mass_kg: 5.97e24, day_length_hours: 24.0, mean_temp_c: 15, distance_from_sun_km: 149600000, moons_count: 1 },
      moon: { name: "Moon", gravity_ms2: 1.62, radius_km: 1737.4, mass_kg: 7.3e22, day_length_hours: 708.7, mean_temp_c: -20, distance_from_sun_km: 149600000, moons_count: 0 },
      mars: { name: "Mars", gravity_ms2: 3.71, radius_km: 3389.5, mass_kg: 6.42e23, day_length_hours: 24.7, mean_temp_c: -63, distance_from_sun_km: 227900000, moons_count: 2 },
      jupiter: { name: "Jupiter", gravity_ms2: 24.79, radius_km: 69911.0, mass_kg: 1.9e27, day_length_hours: 9.9, mean_temp_c: -108, distance_from_sun_km: 778500000, moons_count: 95 },
      saturn: { name: "Saturn", gravity_ms2: 10.44, radius_km: 58232.0, mass_kg: 5.68e26, day_length_hours: 10.7, mean_temp_c: -139, distance_from_sun_km: 1433000000, moons_count: 146 },
    },
    neo: [
      { name: "99942 Apophis", close_approach_utc: "2026-11-14T19:40:00Z", distance_km: 31000, velocity_kmh: 107000, is_hazardous: true, hazard_level: "HIGH" },
      { name: "101955 Bennu", close_approach_utc: "2026-11-14T22:10:00Z", distance_km: 2200000, velocity_kmh: 100800, is_hazardous: true, hazard_level: "MEDIUM" },
      { name: "2024 BX1", close_approach_utc: "2026-11-14T09:15:00Z", distance_km: 450000, velocity_kmh: 54000, is_hazardous: false, hazard_level: "LOW" },
    ],
    solar: {
      flare_class: "C4.4",
      radiation_level: "LOW",
      begin_time: "2026-11-14T06:02:00Z",
      peak_time: "2026-11-14T06:06:00Z",
      end_time: "2026-11-14T06:08:00Z",
      source_region: "Region 4569",
      coordinates: { latitude_deg: -6, longitude_deg: -104, heliographic_location: "S06W0*", region_number: 4569 },
    },
    spacecraft: {
      voyager_1: { id: "voyager_1", name: "Voyager 1", timestamp_utc: "2026-11-14T15:00:00Z", distance_km: 24450000000, light_time_s: 81500, round_trip_s: 163000, relative_speed_kms: 17.0 },
      parker: { id: "parker", name: "Parker Solar Probe", timestamp_utc: "2026-11-14T15:00:00Z", distance_km: 6100000, relative_speed_kms: 176.0 },
    },
    iss: {
      name: "Uluslararası Uzay İstasyonu (ISS)",
      source: "NASA JPL Horizons (Target: -125544)",
      timestamp_utc: "2026-11-14T15:30:00Z",
      latitude_deg: 51.64,
      longitude_deg: -0.12,
      altitude_km: 418.5,
      velocity_kmh: 27600,
    },
    apod: {
      title: "Andromeda Gökadası Derin Alan",
      date: todayDate,
      date_taken_utc: todayIso,
      explanation: "2.5 milyon ışık yılı uzaklıktaki komşumuz Andromeda'nın kızılötesi ve optik birleşik yüksek çözünürlüklü görüntüsü.",
      media_type: "image",
      image_url: "https://apod.nasa.gov/apod/image/2411/M31_HubbleSpitzer_3000.jpg",
      hd_image_url: "https://apod.nasa.gov/apod/image/2411/M31_HubbleSpitzer_3000.jpg",
      nasa_gallery_url: "https://apod.nasa.gov/apod/astropix.html",
    },
    mars_weather: {
      sol: 1415,
      terrestrial_date_utc: "2026-11-14T13:20:00Z",
      mission_source: "NASA Perseverance MEDA & InSight Weather Service",
      location: "Jezero Krateri & Elysium Planitia",
      coordinates: { latitude_deg: 18.38, longitude_deg: 77.58 },
      storm_status: "ACTIVE_REGIONAL_DUST_STORM",
      storm_title: "Jezero Güney Havzası Bölgesel Toz Fırtınası",
      wind_speed_ms: 28.4,
      wind_speed_kmh: 102.2,
      wind_direction: "WNW (Batı-Kuzeybatı)",
      dust_opacity_tau: 1.85,
      pressure_pa: 742.6,
      temperature_c: { min_c: -84.2, max_c: -18.5, avg_c: -56.8 },
      season: "Kuzey Yarımküre Geç Sonbahar (Ls 248°)",
    },
    eonet: [
      {
        id: "EONET_7110",
        title: "Türkiye - Ege Denizi ve Akdeniz Sismik Hareketi (Turkey Earthquake)",
        category: "earthquakes",
        category_title: "Earthquakes",
        timestamp_utc: "2026-11-14T14:45:00Z",
        first_seen_utc: "2026-11-14T14:45:00Z",
        status: "OPEN",
        coordinates: { latitude_deg: 36.85, longitude_deg: 27.42 },
        magnitude_value: 5.8,
        magnitude_unit: "Mw",
        depth_km: 12.5,
        description: "Merkez üssü: Muğla - Datça ve Rodos açıkları (Türkiye / Ege Denizi) · Büyüklük: 5.8 Mw · Derinlik: 12.5 km · Fay hattı: Helen Yayı sismik kırılması",
      },
      {
        id: "EONET_7111",
        title: "Doğu Anadolu - Malatya / Kahramanmaraş Depremi (Turkey Earthquake)",
        category: "earthquakes",
        category_title: "Earthquakes",
        timestamp_utc: "2026-11-13T21:18:00Z",
        first_seen_utc: "2026-11-13T21:18:00Z",
        status: "OPEN",
        coordinates: { latitude_deg: 38.22, longitude_deg: 38.15 },
        magnitude_value: 4.9,
        magnitude_unit: "Mw",
        depth_km: 8.4,
        description: "Merkez üssü: Doğu Anadolu Fay Hattı, Malatya - Kahramanmaraş kuşağı (Türkiye) · Büyüklük: 4.9 Mw · Derinlik: 8.4 km",
      },
      {
        id: "EONET_7112",
        title: "Honshu Doğu Açıkları Depremi, Japonya (Japan Earthquake)",
        category: "earthquakes",
        category_title: "Earthquakes",
        timestamp_utc: "2026-11-14T05:30:00Z",
        first_seen_utc: "2026-11-14T05:30:00Z",
        status: "OPEN",
        coordinates: { latitude_deg: 38.1, longitude_deg: 142.6 },
        magnitude_value: 6.4,
        magnitude_unit: "Mw",
        depth_km: 32.0,
        description: "Merkez üssü: Honshu doğu kıyısı açıkları (Japonya) · Büyüklük: 6.4 Mw · Derinlik: 32.0 km · Pasifik dalma-batma zonu",
      },
      { id: "EONET_7104", title: "California Wildfire Complex", category: "wildfires", timestamp_utc: "2026-11-14T08:15:00Z", coordinates: { latitude_deg: 34.2, longitude_deg: -118.5 }, magnitude_value: 12500, magnitude_unit: "acres" },
      { id: "EONET_7102", title: "Mount Etna Eruption", category: "volcanoes", timestamp_utc: "2026-11-14T11:40:00Z", coordinates: { latitude_deg: 37.75, longitude_deg: 14.99 }, magnitude_value: 3, magnitude_unit: "VEI" },
    ],
  };
}

export function getFallbackSpaceData(queryType, identifier) {
  const q = (queryType || "").toLowerCase();
  const id = (identifier || "").toLowerCase();
  const registry = createFallbackRegistry();

  if (["mars_weather", "insight", "mars_storm", "meda"].includes(q)) return registry.mars_weather;
  if (["historical", "mission", "telescope"].includes(q)) return registry.missions[id] || registry.missions.apollo_11;
  if (["comparison", "planet_compare"].includes(q)) return registry.planets;
  if (["neo", "neows", "asteroids"].includes(q)) return registry.neo;
  if (["solar", "solar_flare", "noaa"].includes(q)) return registry.solar;
  if (["spacecraft", "probe", "horizons"].includes(q)) return registry.spacecraft[id] || registry.spacecraft.voyager_1;
  if (["iss", "space_station"].includes(q)) return registry.iss;
  if (["apod", "astronomy_picture"].includes(q)) return registry.apod;
  if (["eonet", "earth_events", "natural_events"].includes(q)) return registry.eonet;
  return null;
}
