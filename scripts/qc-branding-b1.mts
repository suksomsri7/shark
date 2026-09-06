// QC — ธีมกิจการ WO B1: schema + color contrast + getBrandingTokens (default/BRAND/DARK/cache) + setBranding + IssueReport + /api/mobile/me
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/BRANDING-RUN.md §B1
// ⚠️ standalone-typesafe: dynamic import + wide cast · สร้าง tenant QC เอง + ล้างเอง
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/branding/color.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/branding/color.ts)");
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
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const P = prisma as Any;
let tid = ""; let tid2 = "";
try {
  const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
  // ═══ S1 schema ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='TenantBranding'`)).map((c) => c.column_name);
  chk("B1-S1.1", "TenantBranding มี brandFg · navTone · applyStorefront · applyMobile · updatedById", ["brandFg", "navTone", "applyStorefront", "applyMobile", "updatedById"].every((c) => cols.includes(c)), "ครบ", cols.join(","));
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='NavTone'`)).map((e) => e.enumlabel);
  chk("B1-S1.2", "enum NavTone = LIGHT/BRAND/DARK", ["LIGHT", "BRAND", "DARK"].every((v) => enums.includes(v)), "3 ค่า", enums.join(","));
  const icols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='IssueReport'`)).map((c) => c.column_name);
  chk("B1-S1.3", "ตาราง IssueReport: tenantId userId kind message pageUrl userAgent appVersion screenshotUrl status", ["tenantId", "userId", "kind", "message", "pageUrl", "userAgent", "appVersion", "screenshotUrl", "status"].every((c) => icols.includes(c)), "ครบ", icols.join(","));
  const mig = readFileSync("prisma/migrations/20260930000000_branding_theme/migration.sql", "utf8");
  chk("B1-S1.4", "migration additive (ไม่มี DROP / ALTER TYPE / NOT NULL ไม่มี default บนตารางเดิม)", !/DROP (TABLE|COLUMN)|ALTER COLUMN .* TYPE/i.test(mig) && !/ALTER TABLE "TenantBranding" ADD COLUMN "[a-zA-Z]+" [A-Za-z"]+ NOT NULL(?! DEFAULT)/.test(mig), "additive", "มีคำสั่งอันตราย");

  // ═══ S2 color (pure) ═══
  const color = (await import("@/lib/branding/color" as string)) as Record<string, (...a: Any[]) => Any>;
  chk("B1-S2.1", "contrastRatio(#ffffff,#0E7490) ≈ 5.9 · (#0a0a0a,#FDE047) ≈ 16", Math.abs(color.contrastRatio("#ffffff", "#0E7490") - 5.9) < 0.3 && color.contrastRatio("#0a0a0a", "#FDE047") > 14, "5.9/16", `${color.contrastRatio("#ffffff", "#0E7490").toFixed(2)}/${color.contrastRatio("#0a0a0a", "#FDE047").toFixed(2)}`);
  chk("B1-S2.2", "pickReadableFg: เทียล → ขาว · เหลืองอ่อน → เข้ม · ดำ → ขาว · ขาว → เข้ม", color.pickReadableFg("#0E7490") === "#ffffff" && color.pickReadableFg("#FDE047") === "#0a0a0a" && color.pickReadableFg("#000000") === "#ffffff" && color.pickReadableFg("#ffffff") === "#0a0a0a", "ขาว/เข้ม/ขาว/เข้ม", [color.pickReadableFg("#0E7490"), color.pickReadableFg("#FDE047"), color.pickReadableFg("#000000"), color.pickReadableFg("#ffffff")].join(","));
  chk("B1-S2.3", "isHex: #0E7490 ✓ · #0e7490 ✓ · 0E7490 ✗ · #0E74 ✗ · #GGGGGG ✗", color.isHex("#0E7490") && color.isHex("#0e7490") && !color.isHex("0E7490") && !color.isHex("#0E74") && !color.isHex("#GGGGGG"), "ตรง", "ผิด");

  // ═══ S3 tokens/service ═══
  const svc = (await import("@/lib/branding/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>> & { invalidateBrandingCache?: (t: string) => void };
  const t = await prisma.tenant.create({ data: { name: "QC BRANDING", slug: `qc-branding-${Date.now()}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC BRANDING อื่น", slug: `qc-branding2-${Date.now()}` } }); tid2 = t2.id;
  const d0 = await svc.getBrandingTokens(tid);
  chk("B1-S3.1", "ยังไม่ตั้ง → ค่าปริยาย accent #1d4ed8 · accentFg #ffffff · navTone LIGHT · navBg #fafafa · isDefault true · displayName = ชื่อร้าน", d0.accent === "#1d4ed8" && d0.accentFg === "#ffffff" && d0.navTone === "LIGHT" && d0.navBg === "#fafafa" && d0.isDefault === true && d0.displayName === "QC BRANDING", "ปริยาย", JSON.stringify(d0).slice(0, 160));
  await svc.setBranding({ tenantId: tid }, { brandColor: "#0E7490", navTone: "BRAND", displayName: "สยามไดฟ์" });
  const d1 = await svc.getBrandingTokens(tid);
  chk("B1-S3.2", "ตั้ง #0E7490 + BRAND → accent · accentFg ขาว · navBg = accent · navFg ขาว · displayName สยามไดฟ์ · isDefault false", d1.accent === "#0E7490" && d1.accentFg === "#ffffff" && d1.navBg === "#0E7490" && d1.navFg === "#ffffff" && d1.displayName === "สยามไดฟ์" && d1.isDefault === false, "BRAND", JSON.stringify(d1).slice(0, 200));
  const row1 = await P.tenantBranding.findUnique({ where: { tenantId: tid } });
  chk("B1-S3.3", "DB: brandFg คำนวณเก็บไว้ (#ffffff) · navTone BRAND", row1?.brandFg === "#ffffff" && row1?.navTone === "BRAND", "#ffffff/BRAND", `${row1?.brandFg}/${row1?.navTone}`);
  await svc.setBranding({ tenantId: tid }, { brandColor: "#FDE047", navTone: "DARK" });
  const d2 = await svc.getBrandingTokens(tid);
  chk("B1-S3.4", "เหลืองอ่อน + DARK → accentFg #0a0a0a (สลับให้อ่านออก) · navBg #111827 · navFg #f9fafb · แคชถูก invalidate (เห็นค่าใหม่ทันที)", d2.accentFg === "#0a0a0a" && d2.navBg === "#111827" && d2.navFg === "#f9fafb" && d2.accent === "#FDE047", "DARK", JSON.stringify(d2).slice(0, 200));
  const eHex = await fails(() => svc.setBranding({ tenantId: tid }, { brandColor: "red" }));
  const eUrl = await fails(() => svc.setBranding({ tenantId: tid }, { logoUrl: "javascript:alert(1)" }));
  chk("B1-S3.5", "hex ผิด / URL ไม่ปลอดภัย → throw ข้อความไทย", !!eHex && /[ก-๙]/.test(eHex.message) && !!eUrl && /[ก-๙]/.test(eUrl.message), "throw ไทย", `${eHex?.message?.slice(0, 40)} / ${eUrl?.message?.slice(0, 40)}`);
  const dOther = await svc.getBrandingTokens(tid2);
  chk("B1-S3.6", "ร้านอื่นยังได้ค่าปริยาย (ไม่ปนร้าน)", dOther.isDefault === true && dOther.accent === "#1d4ed8", "ปริยาย", JSON.stringify(dOther).slice(0, 120));
  const audits = await prisma.auditLog.count({ where: { tenantId: tid, action: { contains: "branding" } } });
  const outbox = await prisma.outboxEvent.count({ where: { tenantId: tid, type: "tenant.branding.updated" } });
  chk("B1-S3.7", "AuditLog branding.updated ≥ 2 · outbox tenant.branding.updated ≥ 2 (ต่อการตั้งค่า 1 ครั้ง = 1 event)", audits >= 2 && outbox >= 2, "≥2/≥2", `${audits}/${outbox}`);
  const consumers = readFileSync("src/lib/outbox-consumers.ts", "utf8");
  chk("B1-S3.8", "consumer 'tenant.branding.updated' ลงทะเบียน + label ไทยใน automation/labels.ts", /"tenant\.branding\.updated"/.test(consumers) && /tenant\.branding\.updated/.test(readFileSync("src/lib/automation/labels.ts", "utf8")), "ลงทะเบียน", "ขาด");
  await svc.setBranding({ tenantId: tid }, { applyStorefront: false });
  const pub = await svc.getPublicBranding(tid);
  chk("B1-S3.9", "applyStorefront=false → getPublicBranding คืนค่าปริยาย (brandColor null · logo null) แต่ displayName ยังเป็นชื่อที่ตั้ง", pub.brandColor === null && pub.logoUrl === null && pub.displayName === "สยามไดฟ์", "ปริยาย", JSON.stringify(pub), "MAJOR");

  // ═══ S4 IssueReport ═══
  const issues = (await import("@/lib/branding/issues" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const u = await prisma.user.create({ data: { email: `qc-branding-${Date.now()}@shark.local`, name: "ผู้ทดสอบ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: u.id, role: "OWNER", acceptedAt: new Date() } });
  const r = await issues.createIssueReport({ tenantId: tid }, { userId: u.id, kind: "DISPLAY", message: "หน้าแชทไม่เต็มจอ", pageUrl: "https://shark.in.th/app/sys/x", userAgent: "SharkApp/1", appVersion: "1.0.0 (24)" });
  chk("B1-S4.1", "createIssueReport → row OPEN · เก็บ pageUrl/userAgent/appVersion", r?.status === "OPEN" && r?.pageUrl === "https://shark.in.th/app/sys/x" && r?.appVersion === "1.0.0 (24)", "OPEN", JSON.stringify(r).slice(0, 160));
  const eEmpty = await fails(() => issues.createIssueReport({ tenantId: tid }, { userId: u.id, kind: "BUG", message: "   ", pageUrl: "/app", userAgent: "x" }));
  chk("B1-S4.2", "ข้อความว่าง → throw ไทย", !!eEmpty && /[ก-๙]/.test(eEmpty.message), "throw ไทย", eEmpty?.message?.slice(0, 60) ?? "ไม่ throw");
  await issues.setIssueStatus({ tenantId: tid }, r.id, "ACK");
  const list = await issues.listIssueReports({ tenantId: tid }, {});
  const listOther = await issues.listIssueReports({ tenantId: tid2 }, {});
  chk("B1-S4.3", "setIssueStatus ACK · list ของร้าน = 1 · ร้านอื่น = 0", list.length === 1 && list[0].status === "ACK" && listOther.length === 0, "1/0", `${list.length}/${listOther.length}`);

  // ═══ S5 /api/mobile/me ═══
  const mauth = (await import("@/lib/mobile/auth" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const { token } = await mauth.issueMobileToken(u.id, { userAgent: "qc-branding" });
  const me = (await import("@/app/api/mobile/me/route" as string)) as { GET: (r: Request) => Promise<Response> };
  const res = await me.GET(new Request("http://x/api/mobile/me", { headers: { authorization: `Bearer ${token}` } }));
  const body = await res.json();
  const m = (body.memberships ?? []).find((x: Any) => x.tenantId === tid);
  chk("B1-S5.1", "/api/mobile/me: membership มี branding {displayName, logoUrl, accent, accentFg, navTone} (applyMobile=true)", res.status === 200 && m?.branding?.accent === "#FDE047" && m?.branding?.accentFg === "#0a0a0a" && m?.branding?.navTone === "DARK" && m?.branding?.displayName === "สยามไดฟ์", "มี branding", JSON.stringify(m?.branding ?? body).slice(0, 160));
  await svc.setBranding({ tenantId: tid }, { applyMobile: false });
  const res2 = await me.GET(new Request("http://x/api/mobile/me", { headers: { authorization: `Bearer ${token}` } }));
  const m2 = ((await res2.json()).memberships ?? []).find((x: Any) => x.tenantId === tid);
  chk("B1-S5.2", "applyMobile=false → branding = null", m2?.branding === null, "null", JSON.stringify(m2?.branding), "MAJOR");
  await prisma.session.deleteMany({ where: { userId: u.id } });
  await prisma.membership.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  for (const id of [tid, tid2]) if (id) { try { await P.issueReport.deleteMany({ where: { tenantId: id } }); await P.tenantBranding.deleteMany({ where: { tenantId: id } }); await prisma.outboxEvent.deleteMany({ where: { tenantId: id } }); await prisma.auditLog.deleteMany({ where: { tenantId: id } }); await prisma.tenant.delete({ where: { id } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding B1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
