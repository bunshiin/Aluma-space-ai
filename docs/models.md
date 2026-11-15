# AETHER-GRAPH 3D Model Envanteri ve Yerleşim Planı

Bu doküman `public/models/` altındaki `.glb` modellerinin node ağacını, `THREE.PropertyBinding.sanitizeNodeName` karşılıklarını, hem yerel mesh (`POSITION` accessor) hem de sahne matrisi uygulanmış dünya (`THREE.Box3`) boyutlarını ve Güneş Sistemi yerleşim planını içerir.

> **Önemli Not (İsim Tuzağı):** `GLTFLoader` node isimlerindeki noktaları (`.`) siler (`Mars_Material.002_0` → `Mars_Material002_0`, `Cube.008` → `Cube008`). Kodda node ararken **asla ham isim kullanılmaz**, her zaman `getSanitizedNode` (`THREE.PropertyBinding.sanitizeNodeName`) kullanılır.

---

## 1. Gezegenler, Cüce Gezegenler ve Uydular (Node Ağacı ve `Box3` Röntgeni)

| Dosya | MB | Sıkıştırma | Ham Mesh `POSITION` (X×Y×Z) | Dünya `Box3` (Matris Sonrası) | Node Hiyerarşisi (`ham_isim` → `sanitizeNodeName`) ve Dönüşümler |
|---|---|---|---|---|---|
| `sun.glb` | 2.02 | RAW | Core: 20×20×20, Ref: 20×20×20 | 20.20 × 20.20 × 20.20 | `Sketchfab_model` → `3a2aaa22fb3d4b329318a980ad1bf6d1.fbx` (`...fbx`) → `Object_2` → `RootNode` → `UnstableStarCore` (`UnstableStarCore_1_0`) + `UnstableStarref` (`scale 1.01` → `UnstableStarref_2_0`), Animasyon: `Take 001` |
| `mercury.glb` | 5.64 | RAW | 200.00 × 200.00 × 200.00 | 2.00 × 2.00 × 2.00 | `Sketchfab_model` → `7e72dc39c84447749ff4441fabe13866.fbx` (`...fbx`, scale `0.01`) → `RootNode` → `Mercury` → `Mercury_Mercury_0` |
| `venus.glb` | 0.28 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere:Mesh` |
| `earth.glb` | 0.50 | RAW | 9.79 × 9.79 × 9.80 | 9.79 × 9.80 × 9.79 | `Sketchfab_model` → `fe0e8ec71ef54fc7937eb42b373cf637.obj.cleaner.materialmerger.gles` (`...objcleanermaterialmergergles`) → `Object_2` |
| `moon.glb` | 13.16 | RAW | 2.54 × 2.54 × 2.54 | 2.54 × 2.54 × 2.54 | `Cube` (mesh), `Looks` (boş node) |
| `mars.glb` | 0.45 | RAW | 2.00 × 2.00 × 2.00 | 13.56 × 13.56 × 13.56 (Merkez ofseti: `[0.75, -6.29, 0.30]`) | `Sketchfab_model` → `76dcf8d9806548e381eab10bfddf98e1.fbx` (`...fbx`, scale `0.01`) → `RootNode` → `Mars` (scale `677.9`, trans `[75.09, 30.07, 629.37]`) → `Mars_Material.002_0` (`Mars_Material002_0`) |
| `ceres.glb` | 9.09 | RAW | 946.00 × 873.47 × 946.00 | 946.00 × 873.47 × 946.00 | `cylindrically_mapped_sphere` |
| `jupiter.glb` | 3.13 | RAW | 257.12 × 257.12 × 257.12 | 259.69 × 259.69 × 259.69 | `Sketchfab_model` → `96dc25eb7287486f81b9eb17710dd305.fbx` (`...fbx`, scale `0.01`) → `RootNode` → `Sphere` (scale `101.0`) → `Sphere_Material_0` |
| `io.glb` | 16.67 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `europa.glb` | 11.72 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `ganymede.glb` | 3.89 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `callisto.glb` | 4.25 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `saturn.glb` | 2.55 | RAW | Gövde: 1.98×2.00×1.98, Halka: 5.40×0×5.40 | 5.40 × 1.80 × 5.40 | `Light` (trans `[4.08, 5.90, -1.01]`), `Camera` (trans `[7.36, 4.96, 6.93]`), `Sphere` (scale `[1, 0.9, 1]`), `Circle` (halka) |
| `titan.glb` | 0.65 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `uranus.glb` | 0.16 | RAW | 1000.00 × 1000.00 × 977.07 | 1000.00 × 977.07 × 1000.00 | `Uranus` (rotX `90°`) |
| `neptune.glb` | 0.56 | RAW | 1000.00 × 1000.00 × 982.92 | 1000.00 × 982.92 × 1000.00 | `Neptune` (rotX `90°`) |
| `triton.glb` | 6.55 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `pluto.glb` | 6.68 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |
| `haumea.glb` | 10.81 | RAW | 2322.00 × 1704.00 × 1138.00 | 2322.00 × 1704.00 × 1138.00 | `Haumea` |
| `makemake.glb` | 4.24 | RAW | 1000.00 × 990.24 × 1000.00 | 1000.00 × 990.24 × 1000.00 | `Cube.008` (`Cube008`) |
| `eris.glb` | 4.20 | RAW | 1000.00 × 1000.00 × 1000.00 | 1000.00 × 1000.00 × 1000.00 | `cylindrically_mapped_sphere` |

### Kritik Model Bulguları
1. **`mars.glb` Merkez Ofseti:** İçindeki `Mars` düğümünde `[75.09, 30.07, 629.37]` translation bulunduğu için, model ölçeklendikten sonra `updateMatrixWorld(true)` çağrılıp `Box3` merkezi `(0, 0, 0)` noktasına çekilmezse kendi ekseni etrafında dönerken yalpalar. `handleModelNormalization` bu ofseti otomatik sıfırlar.
2. **`saturn.glb` Gömülü Işık ve Kamera:** İçinde `Light` (`[4.08, 5.90, -1.01]`) ve `Camera` (`[7.36, 4.96, 6.93]`) düğümleri vardır. Sahne ışığını bozmaması için gömülü ışıklar yükleme sırasında devre dışı bırakılır (`visible = false`, `intensity = 0`).

### Mars koordinat çerçevesi (`src/three/marsCoordinates.js`)
`mars.glb` normalize edildikten sonra (Mars `tiltPivot` uzayında): **kuzey kutbu +Y, boylam 0° +X, doğu (+90°) −Z**. Doku dikeyde ters gömülüdür (resmin üstü güney): `u = (boylam + 180) / 360`, `v = 0.5 + enlem / 180`.
- Yön: `(cos φ cos λ, sin φ, −cos φ sin λ)`; yüzey noktası `yön × MARS.target_radius_units`, normal = yön.
- Ölçüm: 559 vertex'in UV'si ile yönü 1° içinde eşleşir (`tests/marsCoordinates.test.js` modeli doğrudan okur). Görsel kontrol: Olympus Mons (18.65°, −133.8°) kalderası, Hellas (−42.4°, 70.5°) havzası ve Jezero (18.38°, 77.58°, Syrtis Major'un doğu kenarı / Isidis sınırı) işaretlerin tam altında.
- İniş noktaları `MARS_SITES`: JEZERO (Perseverance — `18.38° N, 77.58° E`, Jezero Crater), GALE (Curiosity — `-4.5895° S, 137.4417° E`, Gale Crater), ARES_VALLIS (Pathfinder — `19.13° N, -33.22° E`, Ares Vallis), MERIDIANI (Opportunity), GUSEV (Spirit), UTOPIA (Zhurong). Gezegen merkezli enlem, doğu boylamı; 0–360 yazımı da kabul edilir.
- Yüzey sahnesinde 1 birim = 1 m. İniş noktasına göre ofset `calculateSiteOffset` (teğet düzlem, `MARS_RADIUS_KM` `spacePhysics.js`'te).

---

## 2. Uzay Araçları ve Görev Modelleri (Özet)

| Dosya | MB | Sıkıştırma | Node Sayısı | Ham `Box3` (X × Y × Z) | Önemli Kök / Eklem Düğümleri |
|---|---|---|---|---|---|
| `advanced_crew_escape_suit.glb` | 0.82 | DRACO | 1 | 0.89 × 0.55 × 2.00 | `Advanced Crew Escape Suit` |
| `apollo_lunar_module.glb` | 0.68 | DRACO | 135 | 6.43 × 5.01 × 6.43 | İniş ve yükseliş kademesi alt parçaları |
| `curiosity.glb` | 11.31 | RAW | 1 | 2.78 × 2.22 × 3.94 | `MSL` (Gale Crater: `-4.5895°, 137.4417°`) |
| `pathfinder.glb` | 11.36 | RAW | 1 | 2.28 × 1.59 × 1.65 | `panels_right_front` (Ares Vallis: `19.13°, -33.22°`) |
| `ingenuity.glb` | 1.93 | DRACO | 11 | 1.01 × 0.58 × 1.18 | `bus` → `rotors_01` (üst rotor, y≈0.45 m), `rotors_02` (alt rotor, y≈0.35 m), `solar_panel`, `leg_01..04`, `cams` (yalnızca `INGENUITY` çağrıldığında Jezero'da yüklenir) |
| `moonAstrounot.glb` | 16.93 | DRACO + WebP doku | 1 | 0.79 × 1.04 × 1.93 (yerel X × Y × Z) | `Z2` (tek mesh, iskelet/animasyon yok). Kök dönüşü +90° X: ayak y≈0, baş y≈1.93 m. Yüz −Z, sırt çantası +Z (yerel Y −0.42…+0.63; çanta tarafı daha uzun). Ay yüzeyinde iki kopya: `NEIL_ARMSTRONG` (6.2, 0, 2.6) ve `BUZZ_ALDRIN` (3.0, 0, 6.4) m, boy 1.9 m (`lunarAstronauts.js`) |
| `marsphotosat.glb` | 1.83 | RAW | 8 | 10.52 × 4.62 × 5.34 | `shiny_panel`, `black`, `krinkle`, `foil_silver`, `AO`, `dark grey`, `foil_gold`, `tex` (Mars yörüngesi) |
| `hubble_space_telescope.glb` | 1.62 | DRACO | 2 | 458.25 × 501.31 × 525.49 | `<3DSRoot>` → `hst` |
| `iss.glb` | 42.43 | RAW | 132 | 31.07 × 24.20 × 75.11 | `ISS`, `11 Canadarm2`, `29 DEXTRE`, güneş panelleri (`panel_01_p.001` vb.) |
| `james_webb_space_telescope.glb` | 0.96 | DRACO | 2 | 12.87 × 11.26 × 21.00 | Ana gövde ve ayna dizisi |
| `new_horizons.glb` | 3.14 | RAW | 6 | 46.68 × 25.86 × 45.58 | `AO_1`, `tex_01`, `tex_02` |
| `parker_solar_probe.glb` | 14.55 | RAW | 21 | 0.37 × 0.87 × 0.40 | `Sketchfab_model` → `Armature_14` → `root_12` → `body_11`, `solar_battery.*`, `antenna.*` |
| `perseverance.glb` | 11.15 | RAW | 66 | 81.94 × 175.63 × 152.07 | `Body`, `Wheels_objs`, `suspension`, `arm_01_joint`, `arm_01_pivot`, `arm_02_joint`, `arm_02_pivot`, `head` |
| `saturn_v.glb` | 0.88 | RAW | 23 | 2.01 × 12.99 × 2.01 | Kademe ve motor gövdeleri |
| `voyager.glb` | 2.98 | RAW | 4 | 7.75 × 11.04 × 16.91 | `tex_01`, `tex_02_AO`, `tex_02_AO_dark` |

---

## 3. Güneş Sistemi Boyutsal Yerleşim ve Ölçek Planı

Fiziksel mesafeler (`distance_km`) tek bir `calculateSceneUnitsFromKm(distance_km)` fonksiyonuyla sahne birimine dönüştürülür. Görsel sahnede gezegenlerin ve uyduların birbirine çarpmaması ve kadraja temiz oturması için aşağıdaki yarıçap (`target_radius_units`) ve yörünge yarıçapı (`orbit_radius_units`) değerleri kullanılır:

| Gövde (`camera_target`) | Tür | Hedef Yarıçap (`target_radius_units`) | Yörünge Merkezi | Yörünge Yarıçapı (`orbit_radius_units`) | Kamera Mesafesi (`camera_distance_units`) |
|---|---|---|---|---|---|
| `SUN` | Yıldız | 6.50 | Merkez `(0,0,0)` | 0 | 18.0 |
| `MERCURY` | Gezegen | 0.65 | `SUN` | 12.0 | 3.2 |
| `VENUS` | Gezegen | 1.05 | `SUN` | 18.0 | 4.5 |
| `EARTH` | Gezegen | 1.15 | `SUN` | 26.0 | 5.0 |
| `MOON` | Uydu | 0.32 | `EARTH` | 2.6 | 1.8 |
| `MARS` | Gezegen | 0.85 | `SUN` | 35.0 | 4.0 |
| `CERES` | Cüce Gezegen | 0.35 | `SUN` | 43.0 | 2.2 |
| `JUPITER` | Gezegen | 3.10 | `SUN` | 54.0 | 11.5 |
| `IO` | Uydu | 0.28 | `JUPITER` | 4.6 | 1.6 |
| `EUROPA` | Uydu | 0.26 | `JUPITER` | 5.6 | 1.6 |
| `GANYMEDE` | Uydu | 0.38 | `JUPITER` | 6.8 | 2.0 |
| `CALLISTO` | Uydu | 0.35 | `JUPITER` | 8.1 | 2.0 |
| `SATURN` | Gezegen | 5.40 (halka dahil) | `SUN` | 74.0 | 12.5 |
| `TITAN` | Uydu | 0.38 | `SATURN` | 7.2 | 2.0 |
| `URANUS` | Gezegen | 1.75 | `SUN` | 94.0 | 7.0 |
| `NEPTUNE` | Gezegen | 1.70 | `SUN` | 110.0 | 7.0 |
| `TRITON` | Uydu | 0.30 | `NEPTUNE` | 3.2 | 1.8 |
| `PLUTO` | Cüce Gezegen | 0.35 | `SUN` | 124.0 | 2.2 |
| `HAUMEA` | Cüce Gezegen | 0.34 | `SUN` | 134.0 | 2.2 |
| `MAKEMAKE` | Cüce Gezegen | 0.33 | `SUN` | 144.0 | 2.2 |
| `ERIS` | Cüce Gezegen | 0.35 | `SUN` | 154.0 | 2.2 |
| `ISS` | Uzay aracı | 0.05 | `EARTH` (eğim 51.6°) | 1.226 | 0.25 |
| `HUBBLE` | Uzay aracı | 0.035 | `EARTH` (eğim 28.5°) | 1.247 | 0.18 |
| `JWST` | Uzay aracı | 0.12 | `EARTH` (L2, Güneş'in tersinde sabit) | 10.15 | 0.6 |
| `MARS_PHOTO_SAT` | Uzay aracı | 0.06 | `MARS` (eğim 86.0°) | 1.18 | 0.25 |
| `PARKER` | Uzay aracı | 0.15 | `SUN` (eğim 3.4°) | 7.1 | 0.75 |
| `NEW_HORIZONS` | Uzay aracı | 0.32 | `SUN` (sabit yön, boylam 291.5°, enlem +2°) | 153.3 | 1.6 |
| `VOYAGER_1` | Uzay aracı | 0.35 | `SUN` (sabit yön, boylam 256°, enlem +35°) | 276.7 | 1.8 |
| `VOYAGER_2` | Uzay aracı | 0.35 | `SUN` (sabit yön, boylam 290°, enlem −37°) | 244.0 | 1.8 |

### Perseverance rig (`perseverance.glb`, `src/three/roverRig.js`)
Model metre ölçeğinde, normalize edilmez; ileri yön +Z, yukarı +Y. Teker merkezleri y ≈ 0.26 m, orta tekerler orijine kaydırılır.

| Rol | Ham node | `sanitizeNodeName` | Eksen (model uzayı) | Not |
|---|---|---|---|---|
| Tekerler | `Wheels_objs` | `Wheels_objs` | steer Y, spin X | 6 teker tek mesh; üçgenler XZ'de k-means ile 6 kümeye ayrılır, index'ler bölünür, vertex kopyalanmaz. Orijinal mesh geometrisi sahneden çıkar, `destroy`'da ayrıca dispose edilir. Ön/arka döner, orta sabit. |
| Kol taban azimut | `arm.003` | `arm003` | Y | Kol zinciri: `arm.003` → `arm.002` → `arm` → `arm.004` → `turret_obj` |
| Omuz | `arm.002` | `arm002` | X | |
| Dirsek | `arm` | `arm` | X | |
| Bilek | `arm.004` | `arm004` | X | |
| Taret | `turret_obj` | `turret_obj` | bilek → taret yönü | Eksen yüklemede ölçülür |
| Matkap | `corring_drill` | `corring_drill` | Y | Sadece `ARM_CORE_DRILL` fazında döner |
| Mast başı | `head` | `head` | pan Y, tilt X | Mastcam-Z / NavCam |
| Yüksek kazançlı anten | `antenna_hg` | `antenna_hg` | pan Y, tilt X | |

Kol pozları (radyan, `[azimut, omuz, dirsek, bilek, taret]`) gövdeyle çarpışma ve zemine girme kontrolüyle ölçülmüş değerlerdir: park `0,0,0,0,0`, açık `0,−0.45,1.3,0.2,0`, hedef üstü `0,−0.45,2.55,0.6,0`, temas `0,−0.3,2.7,0.3,0`, WATSON `0,−0.2,2.6,−0.6,−1.6`.

### Uzay Araçları Notları
- Tablo `src/three/spacecraftTracker.js` içindeki `SPACECRAFT_BODIES` ile birebir aynıdır. Araçlarda sadece sabit piksel boyutlu camgöbeği (`0x38bdf8`) işaret noktası vardır; dönen araçların (ISS, Hubble, Parker) yörünge çizgisi de camgöbeğidir.
- **Mesafe kuralı:** sahne ölçeği her yerde aynı olmadığından her araç en yakın gerçek referansa göre konur:
  - ISS (420 km) ve Hubble (535 km): gerçek irtifa / Dünya yarıçapı (6371 km = 1.15 birim).
  - JWST: L2 (1.5 milyon km) = Ay mesafesinin 3.9 katı (Ay 2.6 birim). Hızı 0, fazı 0: Dünya pivotunun +X yönü her zaman Güneş'in tersidir.
  - Parker: günberi 0.046 AU, Güneş yüzeyi (6.5 birim) ile Merkür (12 birim, 0.387 AU) arasında doğrusal.
  - Kaçış yörüngeleri (Kasım 2026): New Horizons ~66 AU, Voyager 2 ~145 AU, Voyager 1 ~173 AU (1 ışık günü). Makemake–Eris arasında doğrusal, Eris ötesinde Neptün→Eris eğimiyle (1.166 birim/AU) uzatılır. Bu araçlar Güneş etrafında dönmez, yörünge çizgileri çizilmez.
- Araç boyutları gerçek değildir (ISS 109 m); görünsünler diye büyütülmüş ama yörüngeye sığacak kadar küçük tutulmuştur. Bu yüzden OrbitControls `minDistance` 0.1'dir.
- Yeni alanlar: `orbit_inclination_deg` (yörünge düzlemi eğimi, `rotation.order = 'ZYX'`), `orbit_phase_deg` (sabit başlangıç boylamı), `ecliptic_latitude_deg` (sabit enlem).
- Ebeveyni `EARTH` olan araçlarda kamera `parent_body_id` ile Dünya etrafında araçla birlikte döner (`cameraFollow.js`); sabit dünya ofsetiyle yarım tur sonra Dünya'nın içine düşerdi.
- `VOYAGER_1` ve `VOYAGER_2` aynı `voyager.glb` dosyasını kullanır. Apollo modeli Güneş Sistemi'ne dahil değildir; Perseverance yalnızca Mars yüzey sahnesinde (`PERSEVERANCE`/`JEZERO` hedefi) yüklenir. `iss.glb` 42 MB RAW, DRACO ile sıkıştırılması önerilir.
- Alias: `JAMES_WEBB` → `JWST`, `HUBBLE_SPACE_TELESCOPE` → `HUBBLE`, `PARKER_SOLAR_PROBE` → `PARKER`, `VOYAGER` → `VOYAGER_1`, `SPACE_STATION` → `ISS`.
- `position_vectors` ekliptik (J2000) km kabul edilir: açı `atan2(y_km, x_km)`; `z_km` yok sayılır. `EARTH` ebeveynli araçlar için vektör yer merkezli olmalıdır.

### Asteroit Modelleri (Aluma'dan, `src/three/asteroidSwarmConfig.js`)

| Dosya | Kullanım | Not |
|---|---|---|
| `bennu.glb` | `101955 Bennu` adlı asteroit kümesi | İsimde `bennu` veya `101955` geçerse seçilir |
| `itokawa.glb` | Diğer bütün NEO kümeleri (genel şablon) | Ölçek `SOLAR_EARTH_RADIUS_UNITS` oranına sıkıştırılır |

Asteroit sürüsü (`NEO_SWARM`) ayrı sahne açmaz; `SOLAR_SYSTEM` içinde Dünya düğümüne bağlanır (`src/three/solarSystemAsteroids.js`).
