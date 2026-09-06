// QC — ธีมกิจการ WO B4: หน้าร้าน/ใบเสนอราคา/พิมพ์เอกสาร/อีเมล อ่านธีมจากที่เดียว (getBrandingTokens/getPublicBranding · เคารพ applyStorefront)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/BRANDING-RUN.md §B4
// ⚠️ standalone-typesafe · static + service (สร้าง tenant QC เอง + ล้างเอง)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/branding/public.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/branding/public.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
let tid = "";
try {
  const shop = read("src/app/(store)/s/[tenantSlug]/[unitSlug]/shop/page.tsx");
  const form = read("src/app/(store)/f/[token]/page.tsx");
  const print = read("src/app/app/sys/[id]/account/print/[docId]/page.tsx");
  const pub = read("src/lib/branding/public.ts");
  // ═══ S1 แหล่งเดียว ═══
  chk("B4-S1.1", "public.ts: publicThemeStyle(branding) → CSSProperties {--color-accent, --color-accent-fg, --color-accent-soft} (ตัวช่วยเดียว) · หน้าร้าน + ฟอร์มสาธารณะใช้ตัวนี้ (ไม่ประกอบ style เอง)", /export function publicThemeStyle/.test(pub) && /--color-accent-fg/.test(pub) && /publicThemeStyle/.test(shop) && /publicThemeStyle/.test(form) && !/\["--color-accent"\]: branding\.brandColor/.test(shop + form), "ตัวช่วยเดียว", "ยังประกอบเอง");
  chk("B4-S1.2", "หน้าร้าน/ฟอร์ม: หัวหน้าใช้ displayName + โลโก้ (ถ้ามี) และปุ่มหลักใช้ --color-accent/--color-accent-fg (ไม่ hard-code น้ำเงิน)", /displayName/.test(shop) && /logoUrl/.test(shop) && !/bg-blue-600|#2563eb|#1d4ed8/.test(shop + form), "ใช้ token", "hard-code");
  chk("B4-S1.3", "พิมพ์เอกสารบัญชี: โลโก้ = ของระบบบัญชี (settings.logoUrl) ถ้าไม่มี → โลโก้กิจการ (T3) · ชื่อ = displayName ถ้าตั้ง", /getPublicBranding|getBrandingTokens|tenantLogo|brandLogo/.test(print) && /\?\?/.test(print) && /logoUrl/.test(print), "fallback โลโก้กิจการ", "ไม่มี fallback");
  // ═══ S2 พฤติกรรม ═══
  const svc = (await import("@/lib/branding/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const pubMod = (await import("@/lib/branding/public" as string)) as { publicThemeStyle: (b: Any) => Record<string, string> };
  const t = await prisma.tenant.create({ data: { name: "QC B4", slug: `qc-b4-${Date.now()}` } }); tid = t.id;
  await svc.setBranding({ tenantId: tid }, { brandColor: "#FDE047", displayName: "ร้าน B4", navTone: "BRAND" });
  const b1 = await svc.getPublicBranding(tid);
  const st = pubMod.publicThemeStyle(b1);
  chk("B4-S2.1", "getPublicBranding คืน brandFg ด้วย · publicThemeStyle ตั้ง --color-accent #FDE047 และ --color-accent-fg #0a0a0a (เหลืองอ่อน → ตัวอักษรเข้ม)", b1.brandFg === "#0a0a0a" && st["--color-accent"] === "#FDE047" && st["--color-accent-fg"] === "#0a0a0a", "เหลือง/เข้ม", JSON.stringify({ b1, st }).slice(0, 200));
  await svc.setBranding({ tenantId: tid }, { applyStorefront: false });
  const b2 = await svc.getPublicBranding(tid);
  const st2 = pubMod.publicThemeStyle(b2);
  chk("B4-S2.2", "applyStorefront=false → publicThemeStyle ว่าง (ใช้ค่าปริยายของ CSS) · displayName ยังเป็น 'ร้าน B4'", Object.keys(st2).length === 0 && b2.displayName === "ร้าน B4", "ว่าง", JSON.stringify({ b2, st2 }).slice(0, 160));
  const st0 = pubMod.publicThemeStyle({ displayName: "x", logoUrl: null, brandColor: null, brandFg: null });
  chk("B4-S2.3", "ไม่มีสี → style ว่าง (ไม่ตั้ง var เป็น null/undefined)", Object.keys(st0).length === 0, "ว่าง", JSON.stringify(st0), "MAJOR");
  // ═══ S3 อีเมล ═══
  const notify = read("src/lib/modules/kanban/notify.ts") + read("src/lib/core/email.ts");
  chk("B4-S3.1", "อีเมลแจ้งเตือน (kanban notify/email) ใส่ชื่อที่แสดงของกิจการในหัวเรื่องหรือท้ายข้อความ (getBrandingTokens(...).displayName) — ไม่ใช่ 'SHARK' ล้วน", /displayName/.test(notify) && /getBrandingTokens|getPublicBranding/.test(notify), "มีชื่อกิจการ", "ไม่มี", "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  if (tid) { try { await (prisma as Any).tenantBranding.deleteMany({ where: { tenantId: tid } }); await prisma.outboxEvent.deleteMany({ where: { tenantId: tid } }); await prisma.auditLog.deleteMany({ where: { tenantId: tid } }); await prisma.tenant.delete({ where: { id: tid } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding B4 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
