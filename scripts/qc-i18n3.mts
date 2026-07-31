// QC — i18n public v3 (แปล EN หน้าลูกค้า 8 storefront) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (Vercel build typecheck scripts/ ด้วย)
//
// ทำไมต้องมีข้อสอบใบนี้: i18n v1/v2 ปิดแค่ จองคิว/ใบเสร็จ/เมนูร้านอาหาร/จอคิว TV
// หน้าลูกค้าที่เหลือ (ซื้อของ/โรงแรม/ตั๋ว/คอร์ส/คลินิก/เช่า/คิว/สมาชิก) ยังเป็นไทยล้วน
// นักท่องเที่ยว/ลูกค้าต่างชาติของร้านเปิดแล้วอ่านไม่ออก
//
// สัญญา:
//   1. dict: กลุ่มคีย์ใหม่ครบทั้ง th/en (parity 100% · en ห้ามมีอักษรไทย)
//        shop.* ≥12 · hotel.* ≥12 · ticket.* ≥10 · school.* ≥10
//        clinic.* ≥10 · rental.* ≥10 · queue.* ≥8 · member.* ≥8
//   2. ทุกหน้า public ในรายการ (enumerate ไว้ตายตัวข้างล่าง — ห้ามลดจำนวน):
//        · import @/lib/i18n และเรียก t()
//        · ไม่มีข้อความไทยฝังในโค้ดที่ผู้ใช้เห็น (ตรวจหลังตัดคอมเมนต์ออก — คอมเมนต์ไทยเก็บไว้ได้)
//   3. หน้าแรกของแต่ละ storefront มี <LanguageSwitcher /> ให้ลูกค้าสลับภาษาเองได้
//   4. ทุกหน้าอ่านภาษาจาก cookie "lang" ผ่าน getLocaleFromCookie (ไม่ hardcode locale)
//
// นอกขอบเขตใบนี้ (จงใจ ไม่ใช่ลืม): /f/[token] ฟอร์ม · /vendor/[token] พอร์ทัลผู้ขาย ·
// /chat/[connectionId] วิดเจ็ตแชท — 3 อันนี้ไม่ใช่หน้าซื้อของของลูกค้าร้าน
import { readFileSync, existsSync } from "node:fs";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const S = "src/app/(store)/s/[tenantSlug]/[unitSlug]";
// [ไฟล์, ต้องมีปุ่มสลับภาษาไหม] — หน้า token (ลิงก์ที่ร้านส่งให้ลูกค้ารายคน) ไม่บังคับปุ่ม
const PAGES: { file: string; switcher: boolean }[] = [
  { file: `${S}/shop/page.tsx`, switcher: true },
  { file: `${S}/shop/order/[code]/page.tsx`, switcher: false },
  { file: `${S}/hotel/page.tsx`, switcher: true },
  { file: `${S}/hotel/r/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/ticket/page.tsx`, switcher: true },
  { file: `${S}/ticket/o/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/school/page.tsx`, switcher: true },
  { file: `${S}/school/e/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/clinic/page.tsx`, switcher: true },
  { file: `${S}/clinic/a/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/rental/page.tsx`, switcher: true },
  { file: `${S}/rental/r/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/queue/page.tsx`, switcher: true },
  { file: `${S}/queue/t/[publicToken]/page.tsx`, switcher: false },
  { file: `${S}/member/page.tsx`, switcher: true },
];
// component ฝั่งลูกค้าที่หน้าเหล่านี้ใช้ (ข้อความอยู่ในนี้ ไม่ใช่ในหน้า)
const COMPONENTS = ["src/components/shop-storefront.tsx", "src/components/queue-public-form.tsx"];

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// อักษรไทย "ที่ต้องแปล" — จงใจไม่นับ ฿ (U+0E3F) เพราะสัญลักษณ์เงินบาทคงเดิมทั้ง th/en
// (ถ้าใช้ช่วง 0E00-0E7F ทั้งบล็อก ข้อสอบจะฟ้องบรรทัดราคาที่ถูกต้องแล้ว)
const THAI = /[ก-฾เ-๛]/;

/** ตัดคอมเมนต์ทิ้ง — คอมเมนต์ไทยไม่ใช่ข้อความที่ผู้ใช้เห็น (และเป็นกติกาของ repo นี้ด้วย) */
function stripComments(src: string): string {
  return (
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      // คอมเมนต์ // ทั้งบรรทัดและท้ายบรรทัด — เว้น "://" ไว้ (กันตัด URL ในสตริงทิ้ง)
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
  );
}

/** บรรทัดที่ยังมีอักษรไทยหลังตัดคอมเมนต์ = ข้อความที่ผู้ใช้เห็นแต่ยังไม่เข้า dict */
function thaiLines(src: string): string[] {
  return stripComments(src)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => THAI.test(l));
}

try {
  const dictMod = (await import("@/lib/i18n/dict" as string).catch(() => null)) as {
    DICT: Record<string, Record<string, string>>;
  } | null;
  const i18n = (await import("@/lib/i18n" as string).catch(() => null)) as {
    makeT: (l: string) => (k: string, v?: Record<string, string | number>) => string;
  } | null;

  if (!dictMod || !i18n) {
    chk("I3-0", "โหลด @/lib/i18n ได้", false, "ได้", "ไม่ได้");
  } else {
    const th = dictMod.DICT.th ?? {};
    const en = dictMod.DICT.en ?? {};
    const thKeys = Object.keys(th);

    // ── 1. dict ──
    const missing = thKeys.filter((k) => !(k in en));
    const extra = Object.keys(en).filter((k) => !(k in th));
    chk("I3-1.1", `parity th/en 100% (${thKeys.length} คีย์)`, missing.length === 0 && extra.length === 0, "parity", `ขาด en:${missing.slice(0, 3).join(",")} เกิน:${extra.slice(0, 3).join(",")}`);

    const GROUPS: [string, number][] = [
      ["shop.", 12], ["hotel.", 12], ["ticket.", 10], ["school.", 10],
      ["clinic.", 10], ["rental.", 10], ["queue.", 8], ["member.", 8],
    ];
    for (const [i, [prefix, min]] of GROUPS.entries()) {
      const n = thKeys.filter((k) => k.startsWith(prefix)).length;
      chk(`I3-2.${i + 1}`, `คีย์ ${prefix}* ≥ ${min}`, n >= min, `≥${min}`, String(n));
    }

    const enThai = thKeys.filter((k) => THAI.test(en[k] ?? ""));
    chk("I3-1.2", "ค่า en ไม่มีอักษรไทยหลงเหลือ (ไม่ใช่ก๊อปไทยมาวาง)", enThai.length === 0, "0 คีย์", `${enThai.length} คีย์: ${enThai.slice(0, 3).join(",")}`);
    const enEmpty = thKeys.filter((k) => !(en[k] ?? "").trim());
    chk("I3-1.3", "ค่า en ไม่มีคีย์ว่าง", enEmpty.length === 0, "0", `${enEmpty.length}`);

    // ── 2-4. หน้า public ──
    let noI18n = 0, hardThai = 0, noSwitch = 0, noCookie = 0;
    const badThai: string[] = [];
    const badI18n: string[] = [];
    for (const { file, switcher } of PAGES) {
      const src = read(file);
      if (!src) { badI18n.push(`${file}=ไม่มีไฟล์`); noI18n++; continue; }
      if (!/@\/lib\/i18n/.test(src) || !/\bt\(/.test(src)) { noI18n++; badI18n.push(file.split("/").slice(-2).join("/")); }
      const leftovers = thaiLines(src);
      if (leftovers.length > 0) { hardThai++; badThai.push(`${file.split("/").slice(-2).join("/")}:${leftovers.length}`); }
      if (switcher && !/LanguageSwitcher/.test(src)) noSwitch++;
      if (!/getLocaleFromCookie|resolveLocale/.test(src)) noCookie++;
    }
    chk("I3-3.1", `หน้า public ${PAGES.length} หน้าใช้ t() ครบ`, noI18n === 0, "0 หน้าที่ยังไม่ใช้", `${noI18n} หน้า: ${badI18n.slice(0, 4).join(" ")}`);
    chk("I3-3.2", "ไม่มีข้อความไทยฝังในหน้า (หลังตัดคอมเมนต์)", hardThai === 0, "0 หน้า", `${hardThai} หน้า: ${badThai.slice(0, 5).join(" ")}`);
    chk("I3-3.3", "หน้าแรกของทุก storefront มีปุ่มสลับภาษา", noSwitch === 0, "0", String(noSwitch));
    chk("I3-3.4", "ทุกหน้าอ่านภาษาจาก cookie lang (ไม่ hardcode)", noCookie === 0, "0", String(noCookie));

    let cNoI18n = 0, cThai = 0;
    const cBad: string[] = [];
    for (const f of COMPONENTS) {
      const src = read(f);
      if (!src || !/@\/lib\/i18n|useT|\bt\(/.test(src)) cNoI18n++;
      const leftovers = thaiLines(src);
      if (leftovers.length > 0) { cThai++; cBad.push(`${f.split("/").pop()}:${leftovers.length}`); }
    }
    chk("I3-4.1", `component ฝั่งลูกค้า ${COMPONENTS.length} ตัวใช้ t()`, cNoI18n === 0, "0", String(cNoI18n));
    chk("I3-4.2", "component ไม่มีข้อความไทยฝัง", cThai === 0, "0", cBad.join(" "));

    // ── 5. ใช้งานจริงผ่าน t() ──
    const tEn = i18n.makeT("en");
    const tTh = i18n.makeT("th");
    const sample = thKeys.filter((k) => /^(shop|hotel|ticket|school|clinic|rental|queue|member)\./.test(k));
    chk("I3-5.1", "t('en') คืนอังกฤษจริงทุกคีย์กลุ่มใหม่", sample.length > 0 && sample.every((k) => !THAI.test(tEn(k))), "ไม่มีไทย", `${sample.filter((k) => THAI.test(tEn(k))).length} คีย์เพี้ยน`);
    chk("I3-5.2", "t('th') ยังคืนไทยเหมือนเดิม (ไม่ทำของเก่าพัง)", sample.every((k) => tTh(k) === th[k]), "ตรง dict", "เพี้ยน");
  }
} catch (e) {
  chk("CRASH", "จบไม่ error", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e));
}

const fail = cks.filter((c) => !c.ok);
console.log(`\n===== QC i18n public v3 =====\nผ่าน ${cks.length - fail.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${fail.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${fail.filter((c) => c.sev === "MAJOR").length} · MINOR ${fail.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fail.length, findings: fail.map((c) => c.id) })}`);
process.exit(fail.some((c) => c.sev === "CRITICAL") ? 1 : 0);
