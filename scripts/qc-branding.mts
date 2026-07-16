// QC — White label v1 (WO-0064) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/branding/service.ts (นอก modules — tenant-level เหมือน payment/):
//   setBranding(ctx {tenantId}, { displayName?, logoUrl?, brandColor? }) → {ok:true}
//     · brandColor ต้อง #RRGGBB (regex) ไม่งั้น throw ไทย · logoUrl ต้อง http(s) ไม่งั้น throw ไทย · find→update/create (ห้าม upsert ผ่าน tenantDb)
//   getBranding(ctx) → { displayName, logoUrl, brandColor } | null (ยังไม่ตั้ง = null)
//   getPublicBranding(tenantId) → { displayName, logoUrl, brandColor } — ไม่ตั้ง → default { displayName: ชื่อ tenant, logoUrl: null, brandColor: null }
//   ใช้จริงบน storefront: หน้า /s/[tenantSlug]/[unitSlug]/shop + /f/[token] แสดง displayName/logo/สี accent จาก branding
//   UI: /app/settings/branding (ฟอร์มชื่อ/โลโก้ URL/สี + preview) + assertCan branding.setting.update
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { readFileSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = "";
try {
  const br = (await import("@/lib/branding/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!br) { chk("BR-0", "มี branding/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "ร้านเดิม QC", slug: `qc-br-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    chk("BR-1.1", "ยังไม่ตั้ง: getBranding null + public ใช้ชื่อ tenant", (await br.getBranding(ctx)) === null && (await br.getPublicBranding(tid)).displayName === "ร้านเดิม QC", "null+ชื่อเดิม", "?");
    let th1 = false; try { await br.setBranding(ctx, { brandColor: "แดง" }); } catch { th1 = true; }
    let th2 = false; try { await br.setBranding(ctx, { logoUrl: "javascript:alert(1)" }); } catch { th2 = true; }
    chk("BR-1.2", "สีไม่ใช่ hex / logo ไม่ใช่ http(s) → throw ทั้งคู่", th1 && th2, "throw", `${th1}/${th2}`);
    await br.setBranding(ctx, { displayName: "แบรนด์ใหม่", logoUrl: "https://x.com/logo.png", brandColor: "#1A2B3C" });
    await br.setBranding(ctx, { brandColor: "#FF0000" });
    const g = await br.getPublicBranding(tid);
    chk("BR-1.3", "ตั้งแล้วแก้สีซ้ำ (find→update) → ค่าล่าสุด + แถวเดียว", g.displayName === "แบรนด์ใหม่" && g.brandColor === "#FF0000" && (await prisma.tenantBranding.count({ where: { tenantId: tid } })) === 1, "ล่าสุด/1แถว", JSON.stringify(g));
    const shopPage = readFileSync("src/app/(store)/s/[tenantSlug]/[unitSlug]/shop/page.tsx", "utf8");
    const formPage = readFileSync("src/app/(store)/f/[token]/page.tsx", "utf8");
    chk("BR-2.1", "storefront shop + ฟอร์มสาธารณะ ใช้ getPublicBranding", shopPage.includes("getPublicBranding") && formPage.includes("getPublicBranding"), "ใช้ทั้งคู่", "?", "MAJOR");
    const actions = readFileSync("src/app/app/settings/branding/actions.ts", "utf8");
    chk("BR-2.2", "หน้า settings/branding + assertCan", actions.includes("assertCan"), "มี", "?", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} }; if (tid) { await d(() => prisma.tenantBranding.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); } await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
