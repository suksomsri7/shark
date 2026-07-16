// QC — i18n v1 (WO-0034): dictionary กลาง th/en + หน้า public ฝั่งลูกค้า · Fable oracle, Builder ห้ามแตะ
// ⚠️ กติกา oracle ใหม่: ไฟล์นี้ต้อง typecheck ผ่านแบบ standalone ก่อนโค้ดจริงเกิด — dynamic import + wide cast เท่านั้น
//
// สัญญา:
// src/lib/i18n/dict.ts:
//   export const DICT: Record<"th" | "en", Record<string, string>>   // key ชุดเดียวกันทั้งสองภาษา (parity 100%)
//   คีย์ตั้งชื่อ dot-case เช่น "booking.title", "receipt.total" — ค่า interpolate ได้ด้วย {ชื่อตัวแปร}
// src/lib/i18n/index.ts:
//   export type Locale = "th" | "en"
//   resolveLocale(input?: string | null): Locale        // "en"→en · อื่น ๆ/null/undefined → th (default)
//   makeT(locale): (key: string, vars?: Record<string, string | number>) => string
//     — key ไม่มีใน locale → fallback ไป th → ไม่มีทั้งคู่ → คืน key ตรง ๆ (ห้าม throw)
//     — interpolation: "สวัสดี {name}" + {name:"เอ"} → "สวัสดี เอ" · ตัวแปรที่ไม่ส่ง = คงรูป {var}
//   getLocaleFromCookie(cookieValue?: string | null): Locale        // alias resolveLocale (ให้หน้า server ใช้)
// UI: src/components/LanguageSwitcher.tsx (client — ปุ่ม TH/EN ตั้ง cookie "lang" แล้ว refresh)
//     ใช้ในหน้า public: จองคิว (public-booking) + หน้าร้าน (store)/s + ใบเสร็จ (store)/r — ข้อความ user-facing ผ่าน t() ทั้งหมด
//     หน้าใน /app (หลังบ้านร้าน) ยังไทยล้วน — ห้ามแตะ
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type I18nMod = {
  resolveLocale: (v?: string | null) => string;
  getLocaleFromCookie: (v?: string | null) => string;
  makeT: (l: string) => (k: string, vars?: Record<string, string | number>) => string;
};
type DictMod = { DICT: Record<string, Record<string, string>> };

try {
  const mod = (await import("@/lib/i18n" as string).catch(() => null)) as I18nMod | null;
  const dictMod = (await import("@/lib/i18n/dict" as string).catch(() => null)) as DictMod | null;
  if (!mod || !dictMod) { chk("I18-0", "มี src/lib/i18n (index+dict)", false, "มี", "ยังไม่สร้าง"); }
  else {
    chk("I18-1.1", "resolveLocale: en→en · อื่น→th", mod.resolveLocale("en") === "en" && mod.resolveLocale("th") === "th" && mod.resolveLocale("fr") === "th" && mod.resolveLocale(null) === "th" && mod.resolveLocale(undefined) === "th", "en/th/th/th/th", `${mod.resolveLocale("en")}/${mod.resolveLocale("fr")}`);
    chk("I18-1.2", "getLocaleFromCookie ทำงานเหมือน resolveLocale", mod.getLocaleFromCookie("en") === "en" && mod.getLocaleFromCookie(null) === "th", "en/th", "?");

    const th = dictMod.DICT.th ?? {};
    const en = dictMod.DICT.en ?? {};
    const thKeys = Object.keys(th);
    const missingEn = thKeys.filter((k) => !(k in en));
    const extraEn = Object.keys(en).filter((k) => !(k in th));
    chk("I18-2.1", `dict parity 100% (th ${thKeys.length} คีย์)`, thKeys.length >= 15 && missingEn.length === 0 && extraEn.length === 0, "parity", `missing:${missingEn.slice(0, 3).join(",")} extra:${extraEn.slice(0, 3).join(",")}`);
    chk("I18-2.2", "ค่า en ไม่ใช่ copy ไทย (สุ่มตรวจ: en ต้องมีอักษรละติน ≥ 80% ของคีย์)", thKeys.filter((k) => /[a-zA-Z]/.test(en[k] ?? "")).length >= Math.floor(thKeys.length * 0.8), "≥80%", "?");

    const tTh = mod.makeT("th");
    const tEn = mod.makeT("en");
    const k0 = thKeys[0];
    chk("I18-3.1", "t() คืนค่าตาม locale", tTh(k0) === th[k0] && tEn(k0) === en[k0], "ตรง dict", "?");
    chk("I18-3.2", "key ไม่รู้จัก → คืน key ไม่ throw", tEn("no.such.key.xyz") === "no.such.key.xyz", "echo key", tEn("no.such.key.xyz"));
    // interpolation — หา key ที่มี {..} หรือทดสอบผ่าน key ปลอมไม่ได้ ให้ Builder มีอย่างน้อย 1 key ที่ใช้ตัวแปร
    const varKey = thKeys.find((k) => /\{\w+\}/.test(th[k]));
    chk("I18-3.3", "มีคีย์ที่ใช้ตัวแปร {var} อย่างน้อย 1 + interpolate ได้", !!varKey && !/\{\w+\}/.test(tTh(varKey!, Object.fromEntries([...(th[varKey!].match(/\{(\w+)\}/g) ?? [])].map((m) => [m.slice(1, -1), "X"])))), "แทนค่าได้", String(varKey));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC i18n v1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
