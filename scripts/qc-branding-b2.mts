// QC — ธีมกิจการ WO B2: หน้าตั้งค่า "ตราสินค้าและธีมกิจการ" ตามภาพ 01 + parser ฟอร์ม + ตรวจไฟล์โลโก้ + harness ภาพ
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/BRANDING-RUN.md §B2
// ⚠️ standalone-typesafe: dynamic import + wide cast · ไม่ต่อ DB (ตรวจไฟล์ + ฟังก์ชันบริสุทธิ์) — ยกเว้น S3 ที่นับไฟล์ภาพ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync } from "node:fs";
const COMP = "src/components/branding/BrandingSettings.tsx";
if (!existsSync(COMP)) {
  console.log(`⚠️  SKIPPED — WO ยังไม่สร้าง (${COMP})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const fails = async (fn: () => Promise<unknown> | unknown) => { try { await fn(); return null; } catch (e) { return e as Error; } };
try {
  const comp = read(COMP);
  const page = read("src/app/app/settings/branding/page.tsx");
  const actions = read("src/app/app/settings/branding/actions.ts");
  // ═══ S1 หน้า/คอมโพเนนต์ตามภาพ 01 ═══
  const tids = ["branding-logo-upload", "branding-logo-preview", "branding-display-name", "branding-swatch", "branding-hex", "branding-contrast", "branding-tone-LIGHT", "branding-tone-BRAND", "branding-tone-DARK", "branding-toggle-collapse", "branding-toggle-storefront", "branding-toggle-mobile", "branding-preview", "branding-save", "branding-reset"];
  chk("B2-S1.1", "BrandingSettings.tsx (client) มี testid ครบ 15 ตัว", /^"use client"/m.test(comp) && tids.every((t) => comp.includes(t)), "ครบ", tids.filter((t) => !comp.includes(t)).join(",") || "ครบ");
  const swatches = (comp.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase());
  chk("B2-S1.2", "สีมาตรฐาน 8 สี รวม #0E7490 (เทียล) · #1D4ED8 · #0A0A0A", new Set(swatches).size >= 8 && ["#0E7490", "#1D4ED8", "#0A0A0A"].every((h) => swatches.includes(h)), "≥8 รวม 3 สีหลัก", [...new Set(swatches)].join(","), "MAJOR");
  chk("B2-S1.3", "กล่องความคมชัดใช้ contrastRatio/pickReadableFg จาก @/lib/branding/color (ไม่คำนวณเองซ้ำ) + ข้อความ 'ผ่าน'/'ไม่ผ่าน' + 'WCAG'", /@\/lib\/branding\/color/.test(comp) && /contrastRatio|pickReadableFg/.test(comp) && /WCAG/.test(comp) && /ผ่าน/.test(comp), "ใช้ color.ts", "ไม่พบ");
  chk("B2-S1.4", "ไม่ใช้ alert()/confirm() — error แสดง inline", !/\balert\(|\bconfirm\(/.test(comp) && !/\balert\(/.test(actions), "inline", "มี alert/confirm");
  chk("B2-S1.5", "หน้า page.tsx: หัวข้อ 'ตราสินค้าและธีมกิจการ' · โหลด getBrandingTokens/getBranding · เฉพาะ OWNER/ADMIN (คนอื่นอ่านอย่างเดียวหรือถูกเด้ง)", /ตราสินค้าและธีมกิจการ/.test(page) && /getBranding(Tokens)?/.test(page) && /OWNER|ADMIN|role/.test(page), "ครบ", "ขาด");
  chk("B2-S1.6", "ตัวอย่างสดใช้ CSS variable (--color-accent / --nav-bg) จาก state ปัจจุบัน ไม่ใช่ค่าที่บันทึกแล้ว", /--color-accent|--nav-bg/.test(comp) && /useState|useReducer/.test(comp), "live", "ไม่พบ", "MAJOR");
  chk("B2-S1.7", "ปุ่ม 'บันทึกและใช้กับทั้งร้าน' + 'คืนค่าเริ่มต้น' + 'ดูตัวอย่างเต็มจอ' ตามภาพ 01", /บันทึกและใช้กับทั้งร้าน/.test(comp) && /คืนค่าเริ่มต้น/.test(comp) && /ดูตัวอย่างเต็มจอ/.test(comp), "3 ปุ่ม", "ขาด", "MAJOR");
  const settingsIdx = read("src/app/app/settings/layout.tsx") + read("src/app/app/settings/page.tsx") + read("src/lib/settings/nav.ts") + read("src/app/app/layout.tsx");
  chk("B2-S1.8", "เมนูตั้งค่า/ลิงก์ไปหน้านี้ใช้ชื่อใหม่ 'ตราสินค้าและธีม' (ไม่ใช่ 'แบรนด์ร้าน'/White label)", /ตราสินค้าและธีม/.test(settingsIdx + page) && !/แบรนด์ร้าน/.test(page), "ชื่อใหม่", "ยังชื่อเดิม", "MINOR");

  // ═══ S2 parser ฟอร์ม + ตรวจโลโก้ (pure) ═══
  const form = (await import("@/lib/branding/form" as string)) as { parseBrandingForm: (fd: FormData) => Any };
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const ok = form.parseBrandingForm(fd({ displayName: " สยามไดฟ์ ", brandColor: "#0e7490", navTone: "BRAND", applyStorefront: "on", applyMobile: "off", rememberCollapse: "on" }));
  chk("B2-S2.1", "parseBrandingForm: trim ชื่อ · hex ตัวพิมพ์ใหญ่/เล็กรับ · navTone · toggle on/off → boolean", ok?.ok === true && ok.input.displayName === "สยามไดฟ์" && ok.input.brandColor.toLowerCase() === "#0e7490" && ok.input.navTone === "BRAND" && ok.input.applyStorefront === true && ok.input.applyMobile === false, "ok", JSON.stringify(ok).slice(0, 200));
  const bad = form.parseBrandingForm(fd({ displayName: "x".repeat(81), brandColor: "red", navTone: "NEON" }));
  chk("B2-S2.2", "ค่าผิด → ok:false + errors ต่อฟิลด์เป็นไทย (displayName ยาวเกิน 80 · brandColor · navTone)", bad?.ok === false && ["displayName", "brandColor", "navTone"].every((k) => typeof bad.errors?.[k] === "string" && /[ก-๙]/.test(bad.errors[k])), "3 error ไทย", JSON.stringify(bad).slice(0, 200));
  const empty = form.parseBrandingForm(fd({ displayName: "", brandColor: "", navTone: "LIGHT" }));
  chk("B2-S2.3", "ว่าง = ล้างค่า (displayName null · brandColor null) ไม่ใช่ error", empty?.ok === true && empty.input.displayName === null && empty.input.brandColor === null, "ok/null", JSON.stringify(empty).slice(0, 160));
  const logo = (await import("@/lib/branding/logo" as string)) as { validateLogoFile: (f: { name: string; type: string; bytes: Uint8Array }) => { ok: true; ext: string } | { ok: false; error: string } };
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const SVG = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);
  const SVGX = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const r1 = logo.validateLogoFile({ name: "a.png", type: "image/png", bytes: PNG });
  const r2 = logo.validateLogoFile({ name: "a.jpg", type: "image/jpeg", bytes: JPG });
  const r3 = logo.validateLogoFile({ name: "a.svg", type: "image/svg+xml", bytes: SVG });
  chk("B2-S2.4", "validateLogoFile: png/jpg/svg จริง → ok + ext", r1.ok && r2.ok && r3.ok && (r1 as Any).ext === "png", "ok×3", JSON.stringify([r1, r2, r3]).slice(0, 160));
  const r4 = logo.validateLogoFile({ name: "ไวรัส.png", type: "image/png", bytes: EXE });
  const r5 = logo.validateLogoFile({ name: "big.png", type: "image/png", bytes: new Uint8Array(2 * 1024 * 1024 + 1).fill(0x89) });
  const r6 = logo.validateLogoFile({ name: "x.svg", type: "image/svg+xml", bytes: SVGX });
  chk("B2-S2.5", "ปลอมนามสกุล (EXE เป็น .png) · >2MB · SVG มี <script> → ปฏิเสธด้วยข้อความไทย", !r4.ok && /[ก-๙]/.test((r4 as Any).error) && !r5.ok && /2\s?MB|2 เมกะ/.test((r5 as Any).error) && !r6.ok, "ปฏิเสธ×3", JSON.stringify([r4, r5, r6]).slice(0, 200));
  chk("B2-S2.6", "actions.ts: uploadLogoAction ใช้ validateLogoFile ก่อน uploadFile(kind LOGO) · saveBrandingAction ใช้ parseBrandingForm → setBranding (มี updatedById)", /validateLogoFile/.test(actions + read("src/lib/storage/actions.ts")) && /parseBrandingForm/.test(actions) && /setBranding/.test(actions) && /updatedById/.test(actions), "ครบ", "ขาด");

  // ═══ S3 harness ภาพ ═══
  const vis = read("scripts/visual-branding.mts");
  chk("B2-S3.1", "scripts/visual-branding.mts มี spec b2 (ปริยาย · BRAND+เทียล · DARK) ถ่าย desktop+mobile และคืนค่าธีมของ tenant QC ใน finally", /"b2"/.test(vis) && /BRAND/.test(vis) && /DARK/.test(vis) && /finally/.test(vis) && /setBranding|invalidateBrandingCache/.test(vis), "มี", "ขาด");
  const shots = existsSync(".qc-shots/branding/b2") ? readdirSync(".qc-shots/branding/b2").filter((f) => f.endsWith(".png")) : [];
  chk("B2-S3.2", "มีภาพจริง ≥ 6 ใบใน .qc-shots/branding/b2 (builder รันก่อน Fable ดู)", shots.length >= 6, "≥6", `${shots.length}: ${shots.slice(0, 6).join(",")}`, "MAJOR");
  void fails;
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding B2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
