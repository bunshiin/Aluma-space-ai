// Sunucu konsoluna yönlendirme kararının okunur özetini yazar (geliştirici telemetrisi)

export function logRouteTelemetry({ promptText, detectedCategory, keyIndex, routeResult, modelName, silent }) {
  if (silent) return;
  console.log("┌──────────────────────────────────────────────────────────────────────────┐");
  console.log("│                     ALUMA YÖNLENDİRİCİ TELEMETRİ LOGU                    │");
  console.log("├──────────────────────────────────────────────────────────────────────────┤");
  console.log("│ [1] DEĞİŞKENLER (VARIABLES):                                             │");
  console.log(`│   • Kullanıcı Sorusu  : ${promptText}`);
  console.log(`│   • Algılanan Niyet   : ${detectedCategory ? "CANLI_API_SORGUSU (" + detectedCategory.categoryName + ")" : "GENEL_BILIMSEL_SORGU (API Çağrılmadı)"}`);
  console.log(`│   • Taha API Fonksiyon: ${detectedCategory ? `getSpaceData('${detectedCategory.queryType}', '${detectedCategory.identifier}')` : "YOK (Doğrudan Gemini)"}`);
  console.log(`│   • Öğrenci Modu      : ${routeResult.is_student_mode} (Hafıza Limiti: ${routeResult.is_student_mode ? 10 : 5} mesaj)`);
  console.log(`│   • Aktif Model & Key : ${modelName} (Anahtar #${keyIndex >= 0 ? keyIndex + 1 : "MOCK"})`);
  console.log("├──────────────────────────────────────────────────────────────────────────┤");
  console.log("│ [2] SAHNE VE AKSİYON (SCENE & ACTION):                                   │");
  console.log(`│   • Sahne Şablonu     : ${routeResult.template_id}`);
  console.log(`│   • Aksiyon Tipi      : ${routeResult.action_type}`);
  console.log("├──────────────────────────────────────────────────────────────────────────┤");
  console.log("│ [3] PARAMETRELER (PARAMETERS):                                           │");
  for (const [k, v] of Object.entries(routeResult.parameters || {})) {
    const formattedVal = typeof v === "object" ? JSON.stringify(v) : v;
    console.log(`│   • ${k.padEnd(18)}: ${formattedVal}`);
  }
  console.log("├──────────────────────────────────────────────────────────────────────────┤");
  console.log("│ [4A] KULLANICI METNİ (SPEECH_TEXT - EKRAN):                              │");
  console.log(`│   "${routeResult.speech_text}"`);
  if (routeResult.tts_text) {
    console.log("├──────────────────────────────────────────────────────────────────────────┤");
    console.log("│ [4B] SES API METNİ (TTS_TEXT - SESLENDİRME):                             │");
    console.log(`│   "${routeResult.tts_text}"`);
  }
  console.log("├──────────────────────────────────────────────────────────────────────────┤");
  console.log("│ [5] ÇIKTI ŞABLONU (OUTPUT JSON):                                         │");
  const { speech_text: _omittedSpeech, tts_text: _omittedTts, ...templateWithoutSpeech } = routeResult;
  const jsonLines = JSON.stringify(templateWithoutSpeech, null, 2).split("\n");
  for (const line of jsonLines) {
    console.log(`│   ${line}`);
  }
  console.log("└──────────────────────────────────────────────────────────────────────────┘");
}
