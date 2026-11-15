// renderProceduralPlanet sözleşmesi (canvas modülü) yüklenemezse bölünmüş ekranda gösterilen sade yedek çizim.

export function renderFallbackProceduralPlanet(canvasEl, planetName, lightDelay) {
  const ctx = canvasEl?.getContext?.("2d");
  if (!ctx) return;
  const w = canvasEl.width || 560;
  const h = canvasEl.height || 560;
  canvasEl.width = w;
  canvasEl.height = h;
  const [cx, cy, r] = [w / 2, h / 2, Math.min(w, h) * 0.28];
  const label = String(planetName || "mars").toUpperCase();
  const isMars = /MARS/i.test(label);
  const drawCircle = (radius, fill) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } else ctx.stroke();
  };
  ctx.fillStyle = "#05080e";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
  ctx.lineWidth = 1;
  drawCircle(r * 1.45, null);

  const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.12, cx, cy, r);
  grad.addColorStop(0, isMars ? "#f97316" : "#38bdf8");
  grad.addColorStop(0.68, isMars ? "#9a3412" : "#0369a1");
  grad.addColorStop(1, "#090d16");
  drawCircle(r, grad);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 14px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`2D TELEMETRİ // ${label}`, cx, h - 42);
  if (lightDelay?.delay_s) {
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`Işık Gecikmesi: ${lightDelay.delay_s} sn`, cx, h - 20);
  }
}
