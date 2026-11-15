// "… ödevime ekle" komutunu sahne açmadan bir ödev kartına çevirir: konuyu çözer, hesabı spacePhysics.js ile yapar.

import { calculateLightDelay, calculatePlanetComparison } from "../physics/spacePhysics.js";
import { calculateSingleBodyGravity, createSingleBodyFacts } from "./bodyFacts.js";
import {
  GRAVITY_WORD_RE,
  LIGHT_DELAY_HINT_RE,
  SOLAR_TARGET_RULES,
  extractBodiesFromText,
  stripHomeworkIntent
} from "./routeFallbackParser.js";

// Gezegen adıyla karışabilen araçlar: "Satürn 5" roket, "Satürn" gezegen. Gezegen kurallarından önce denenir.
const VEHICLE_TOPIC_RULES = [
  [/sat[üu]rn\s*(?:v|5)\b|saturn\s*roket|ay\s*roketi/, "SATURN_V"],
  [/uzay\s*k[ıi]yafet|astronot\s*k[ıi]yafet|crew\s*escape|\bsuit\b/, "CREW_SUIT"]
];

export const HOMEWORK_TOPIC_KINDS = Object.freeze(["LIGHT_DELAY", "GRAVITY", "COMPARISON", "BODY", "SCENE", "GENERAL"]);

function normalizeForRules(text) {
  return String(text || "").toLocaleLowerCase("tr-TR").replace(/̇/g, "").replace(/ı/g, "i");
}

/**
 * Metinde gezegenle karışabilen bir araç (SATURN_V, CREW_SUIT) geçiyorsa kimliğini, yoksa null döner.
 */
export function getVehicleKey(text) {
  const value = String(text || "").toLocaleLowerCase("tr-TR").replace(/̇/g, "");
  const rule = VEHICLE_TOPIC_RULES.find(([pattern]) => pattern.test(value));
  return rule ? rule[1] : null;
}

function findSolarTarget(text) {
  const value = normalizeForRules(text);
  const rule = SOLAR_TARGET_RULES.find(([pattern]) => pattern.test(value));
  return rule ? rule[1] : null;
}

/**
 * Komut metninden ödev konusunu çözer. context: { target, scene_item } (kullanıcının o an baktığı yer).
 * Konu yoksa ve bağlam da yoksa null döner.
 */
export function resolveHomeworkTopic(text, context = {}) {
  const topicText = stripHomeworkIntent(text);
  const vehicle = getVehicleKey(topicText);
  if (vehicle) return { kind: "BODY", body: vehicle, text: topicText };
  const bodies = extractBodiesFromText(topicText);
  if (topicText && LIGHT_DELAY_HINT_RE.test(topicText)) {
    const [source, target] = bodies.length >= 2 ? bodies : ["EARTH", bodies[0] && bodies[0] !== "EARTH" ? bodies[0] : "MARS"];
    if (source !== target) return { kind: "LIGHT_DELAY", source, target, text: topicText };
  }
  if (topicText && GRAVITY_WORD_RE.test(topicText)) {
    const unique = [...new Set(bodies)];
    // İki farklı cisim varsa kıyas; tek cisim (veya aynı cisim iki kez) ise sadece o cismin bilgisi
    if (unique.length >= 2) return { kind: "COMPARISON", primary: unique[0], secondary: unique[1], text: topicText };
    const body = unique[0] || context.target;
    if (body) return { kind: "GRAVITY", body, text: topicText };
  }
  const spacecraft = topicText ? findSolarTarget(topicText) : null;
  if (spacecraft) return { kind: "BODY", body: spacecraft, text: topicText };
  if (bodies.length > 0) return { kind: "BODY", body: bodies[0], text: topicText };
  if (topicText) return { kind: "GENERAL", text: topicText };
  if (context.scene_item) return { kind: "SCENE", item: context.scene_item };
  if (context.target) return { kind: "BODY", body: context.target, text: "" };
  return null;
}

function createGravityItem(body, machine) {
  const stats = calculateSingleBodyGravity(body);
  if (!stats) return createBodyItem(body, machine);
  const vars = { body: machine.getBodyName(body), gravity: stats.gravity_ms2, fall_s: stats.fall_10m_s };
  return {
    id: `GRAVITY|${body}`,
    title: machine.getUiText("topic_gravity_title", vars),
    description: machine.getUiText("topic_gravity_description", vars),
    student_description: machine.getUiText("topic_gravity_student_description", vars),
    facts: createSingleBodyFacts(stats, (key) => machine.getUiText(key)),
    image_query: machine.getImageQuery(body, body)
  };
}

function createBodyItem(body, machine) {
  const stats = calculateSingleBodyGravity(body);
  const name = machine.getBodyName(body);
  const vehicle = machine.getVehicleText(body);
  if (vehicle) {
    return { id: `BODY|${body}`, title: name, ...vehicle, image_query: machine.getImageQuery(body, name) };
  }
  const vars = stats ? { body: name, gravity: stats.gravity_ms2, radius_km: stats.radius_km ?? "-" } : null;
  return {
    id: `BODY|${body}`,
    title: name,
    description: vars ? machine.getUiText("topic_body_description", vars) : "",
    student_description: vars ? machine.getUiText("topic_body_student_description", vars) : "",
    facts: createSingleBodyFacts(stats, (key) => machine.getUiText(key)),
    image_query: machine.getImageQuery(body, body.replace(/_/g, " "))
  };
}

function createLightDelayItem(source, target, machine) {
  const delay = calculateLightDelay(source, target, "one-way");
  // Sahneden yakalanan ışık gecikmesiyle aynı id: aynı konu iki yoldan gelse de sepete bir kez girer
  const item = machine.createHomeworkItem("LIGHT_DELAY", { source, target, mode: "one-way", ...delay });
  const vars = { source: machine.getBodyName(source), target: machine.getBodyName(target), ...delay };
  return {
    ...item,
    title: machine.getUiText("topic_light_delay_title", vars),
    description: machine.getUiText("topic_light_delay_description", vars),
    student_description: machine.getUiText("topic_light_delay_student_description", vars),
    image_query: machine.getImageQuery(target, target)
  };
}

/**
 * Çözülen konudan ödev öğesi kurar; hesaplar sahne açılmadan arka planda yapılır. Kurulamazsa null.
 */
export function createTopicHomeworkItem(topic, machine) {
  if (!topic || !machine) return null;
  switch (topic.kind) {
    case "LIGHT_DELAY":
      return createLightDelayItem(topic.source, topic.target, machine);
    case "GRAVITY":
      return createGravityItem(topic.body, machine);
    case "COMPARISON": {
      const item = machine.createHomeworkItem("PLANET_COMPARISON", calculatePlanetComparison(topic.primary, topic.secondary));
      return item ? { ...item, image_query: machine.getImageQuery(topic.secondary, topic.secondary) } : null;
    }
    case "BODY":
      return createBodyItem(topic.body, machine);
    case "SCENE":
      return topic.item ? { ...topic.item } : null;
    case "GENERAL":
      return machine.createHomeworkItemFromParameters({ id: `TOPIC|${normalizeForRules(topic.text)}`, title: topic.text, image_query: topic.text });
    default:
      return null;
  }
}
