// ─────────────────────────────────────────────────────────────
// template.ts — ข้อความแม่แบบของค่าตั้งชนิด `template` (pure) · SVC R0.3 · CC §1.1
//   renderTemplate: แทน {ตัวแปร} · ตัวแปรที่ไม่ส่ง = "" · locale ที่ไม่มีข้อความ ⇒ ใช้ th
//   checkTemplate:  ตัวแปรที่ไม่อยู่ใน def.templateVars ⇒ issue (ผู้เรียกแปลงเป็น VALIDATION)
// คำขู่/คำต้องห้าม = ตัวตรวจกฎหมาย TEMPLATE_NO_THREAT (legal/th-rental-2568.ts) ไม่ใช่ที่นี่
// ─────────────────────────────────────────────────────────────
import type { GroupIssue, SettingDef } from "./types";

const VAR_RE = /\{([^{}]+)\}/g;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** ข้อความทุกช่องของค่าแม่แบบ (สตริงเดี่ยว หรือ {th, en, …}) */
export function templateTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (isRec(value)) return Object.values(value).filter((x): x is string => typeof x === "string");
  return [];
}

/** ตัวแปรทั้งหมดที่ข้อความใช้ (ไม่ซ้ำ) */
export function templateVarsUsed(value: unknown): string[] {
  const out = new Set<string>();
  for (const t of templateTexts(value)) for (const m of t.matchAll(VAR_RE)) out.add(m[1].trim());
  return [...out];
}

export function checkTemplate(def: SettingDef, value: unknown): GroupIssue[] {
  if (def.type !== "template") return [];
  const allowed = new Set(def.templateVars ?? []);
  const bad = templateVarsUsed(value).filter((v) => !allowed.has(v));
  if (bad.length === 0) return [];
  const allowedTh = [...allowed].map((v) => `{${v}}`).join(" ") || "ไม่มี";
  return [
    {
      key: def.key,
      code: "TEMPLATE_VAR_NOT_ALLOWED",
      messageTh: `ข้อความ «${def.labelTh}» ใช้ตัวแปรที่ระบบเติมให้ไม่ได้: ${bad.map((v) => `{${v}}`).join(" ")} — ตัวแปรที่ใช้ได้: ${allowedTh}`,
    },
  ];
}

export function renderTemplate(def: SettingDef, value: unknown, vars: Record<string, string>, locale: string): string {
  void def;
  let text = "";
  if (typeof value === "string") text = value;
  else if (isRec(value)) {
    const loc = value[locale];
    const th = value.th;
    text = typeof loc === "string" && loc.length > 0 ? loc : typeof th === "string" ? th : "";
  }
  return text.replace(VAR_RE, (_m, name: string) => {
    const v = vars[name.trim()];
    return typeof v === "string" ? v : "";
  });
}
