// QC — i18n v2 (WO-0066): เมนูร้านอาหาร public + จอคิว TV + error สาธารณะ · Fable oracle, Builder ห้ามแตะ
// (หมายเหตุ: "EN หลังบ้าน เลือกภาษาต่อ user" = เลื่อนเป็น 0066b — ใหญ่เกิน 1 WO และหลังบ้านผู้ใช้เป้าหมายเป็นไทยล้วน)
//
// สัญญา:
//   src/lib/i18n/dict.ts: เพิ่มคีย์ครบทั้ง th/en (parity — oracle เช็คทุกคีย์):
//     "menu.*" ≥8 คีย์ (หัวเมนู/หมวด/สั่ง/ตะกร้า/รวม/หมายเหตุ/ยืนยันสั่ง/ว่าง) สำหรับหน้าเมนูร้านอาหาร public
//     "queueTv.*" ≥5 คีย์ (กำลังเรียก/คิวถัดไป/ช่อง/รอ/เลขคิว) สำหรับจอคิว TV
//     "err.*" ≥4 คีย์ (ทั่วไป/เน็ต/ไม่พบ/ลองใหม่) สำหรับ error สาธารณะ
//   หน้า public 3 จุดใช้ t()/DICT + อ่าน cookie lang (pattern getLocaleFromCookie เดิม):
//     (store)/s/[t]/[u]/restaurant/page.tsx · restaurant/t/[qrToken]/page.tsx · queue/display/[displayToken]/page.tsx
//   สวิตช์ภาษา th/en บนหน้า restaurant public (component เดิมถ้ามี — หาก LangSwitch มีอยู่ให้ reuse)
try { process.loadEnvFile(".env"); } catch {}
const { readFileSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
try {
  const { DICT } = (await import("@/lib/i18n/dict")) as unknown as { DICT: Record<string, Record<string, string>> };
  const thKeys = Object.keys(DICT.th); const enKeys = Object.keys(DICT.en);
  chk("I2-1.1", "parity th/en 100% (คีย์ชุดเดียวกัน)", thKeys.length === enKeys.length && thKeys.every((k) => k in DICT.en), "parity", `${thKeys.length}/${enKeys.length}`);
  const count = (p: string) => thKeys.filter((k) => k.startsWith(p)).length;
  chk("I2-1.2", "คีย์ menu.* ≥8 · queueTv.* ≥5 · err.* ≥4", count("menu.") >= 8 && count("queueTv.") >= 5 && count("err.") >= 4, "8/5/4", `${count("menu.")}/${count("queueTv.")}/${count("err.")}`);
  chk("I2-1.3", "en ไม่ใช่ก๊อปไทย (คีย์ใหม่ทุกตัว en ต้องไม่มีอักษรไทย)", thKeys.filter((k) => /^(menu|queueTv|err)\./.test(k)).every((k) => !/[ก-๙]/.test(DICT.en[k])), "en ล้วน", "?");
  const files = ["src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/page.tsx", "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/t/[qrToken]/page.tsx", "src/app/(store)/s/[tenantSlug]/[unitSlug]/queue/display/[displayToken]/page.tsx"];
  for (const [i, f] of files.entries()) {
    const src = readFileSync(f, "utf8");
    chk(`I2-2.${i + 1}`, `${f.split("/").slice(-2).join("/")} ใช้ i18n (t/DICT + lang cookie)`, /@\/lib\/i18n/.test(src) && /lang/.test(src), "ใช้", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC i18n v2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
