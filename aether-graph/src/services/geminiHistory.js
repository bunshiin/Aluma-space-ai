// Konuşma geçmişini bellek ve yerel JSON dosyasında yönetir

import fs from "node:fs";
import path from "node:path";

const HISTORY_FILE_NAME = ".gemini_history.json";
let inMemoryHistory = [];

function getHistoryFilePath() {
  return path.resolve(HISTORY_FILE_NAME);
}

function loadHistoryFromStorage() {
  const filePath = getHistoryFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Konuşma geçmişi okunamadı, bellek içi geçmiş kullanılıyor:", err.message);
  }
  return inMemoryHistory;
}

function persistHistory(history) {
  inMemoryHistory = history;
  try {
    fs.writeFileSync(getHistoryFilePath(), JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    console.warn("Konuşma geçmişi diske yazılamadı:", err.message);
  }
}

export function clearConversationHistory() {
  inMemoryHistory = [];
  const filePath = getHistoryFilePath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("Konuşma geçmişi dosyası silinemedi:", err.message);
  }
}

export function getConversationHistory() {
  return loadHistoryFromStorage();
}

export function buildConversationContents(promptText, isStudentMode) {
  const maxTurns = isStudentMode ? 10 : 5;
  const maxItems = maxTurns * 2;
  const history = loadHistoryFromStorage().slice(-maxItems);

  const contents = [];
  for (const item of history) {
    if (item.role === "user") {
      contents.push({ role: "user", parts: [{ text: item.text }] });
    } else if (item.role === "model") {
      contents.push({ role: "model", parts: [{ text: item.text }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: promptText }] });
  return contents;
}

export function recordTurnInHistory(promptText, replyText) {
  const history = loadHistoryFromStorage();
  history.push({ role: "user", text: promptText });
  history.push({ role: "model", text: replyText });
  persistHistory(history);
}
