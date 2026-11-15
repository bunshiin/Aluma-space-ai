import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanSpeechTextForTts, formatDisplaySpeechText, formatTtsSpeechText, removeLinksAndFiles } from "../src/services/speechTextCleaner.js";

describe("speechTextCleaner", () => {
  it("link, alan adı, resim/model dosyası, arşiv kimliği ve link etiketi kesinlikle kalmaz", () => {
    const raw = "Jüpiter görseli hazır [Doğrudan NASA Görsel Linki: https://images-assets.nasa.gov/image/PIA12345/PIA12345~orig.jpg] " +
      "ayrıca www.nasa.gov ve science.nasa.gov/jupiter adreslerine bak, dosya jupiter.glb ve foto_1.PNG hazır, kimlik PIA22946.";
    const clean = removeLinksAndFiles(raw);
    assert.equal(/https?:|www\.|\.gov|\.glb|\.png|\.jpg|PIA\d|\[|\]/i.test(clean), false, clean);
    assert.ok(clean.startsWith("Jüpiter görseli hazır"));
  });

  it("TTS metni Türkçe okunuşa çevrilir ve yine link içermez", () => {
    const text = cleanSpeechTextForTts("2021-02-18 tarihinde 1.28 km/s hızla https://x.org/a.jpg Perseverance indi.");
    assert.equal(text, "18 Şubat 2021 tarihinde 1 virgül 28 kilometre bölü saniye hızla Pörsiviyrıns indi.");
  });

  it("kullanıcı ekran metni (formatDisplaySpeechText) rakamlarla, ses API metni (formatTtsSpeechText) okunuşuyla üretilir", () => {
    const spokenInput =
      "On beş Kasım iki bin yirmi altı tarihinde, saat sıfır dokuz yirmi dörtte Endonezya'nın Ruteng bölgesinde dört nokta dört büyüklüğünde ve on kilometre derinliğinde bir deprem meydana gelmiştir.";
    const displayText = formatDisplaySpeechText(spokenInput);
    assert.equal(
      displayText,
      "15 Kasım 2026 tarihinde, saat 09:24'te Endonezya'nın Ruteng bölgesinde 4.4 büyüklüğünde ve 10 kilometre derinliğinde bir deprem meydana gelmiştir."
    );

    const ttsText = formatTtsSpeechText("", displayText);
    assert.equal(
      ttsText,
      "On beş Kasım iki bin yirmi altı tarihinde, saat sıfır dokuz yirmi dörtte Endonezya'nın Ruteng bölgesinde dört nokta dört büyüklüğünde ve on kilometre derinliğinde bir deprem meydana gelmiştir."
    );
  });

  it("bozuk girdide boş metin döner, hata fırlatmaz", () => {
    assert.equal(removeLinksAndFiles(null), "");
    assert.equal(cleanSpeechTextForTts(42), "");
    assert.equal(formatDisplaySpeechText(null), "");
    assert.equal(formatTtsSpeechText(null, null), "");
  });
});
