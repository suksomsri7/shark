// QC — Host-routing โดเมนลูกค้า (WO-0065 · ADR A6 ทาง ก: resolve ที่ชั้น app) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/domain/service.ts เพิ่ม:
//   hostEntryPath(host: string) → string | null
//     · resolveTenantByHost (ACTIVE เท่านั้น — ของเดิม) → ไม่เจอ → null
//     · เจอ → หา BusinessUnit ACTIVE ตัวแรกของ tenant (เรียง createdAt) → "/s/<tenantSlug>/<unitSlug>"
//     · เจอ tenant แต่ไม่มี unit → "/s/<tenantSlug>" ก็ได้หรือ null — สัญญา: คืน null (ยังไม่มีอะไรให้โชว์)
//   src/app/page.tsx (root): อ่าน header "x-shark-host" (proxy ตั้งให้เมื่อ custom domain) →
//     มีค่า → hostEntryPath → redirect ไป path นั้น · ไม่เจอ/ไม่มี header → landing เดิม (ห้ามพัง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = "";
try {
  const dom = (await import("@/lib/domain/service")) as unknown as { hostEntryPath?: (h: string) => Promise<string | null> };
  if (typeof dom.hostEntryPath !== "function") { chk("HR-0", "มี hostEntryPath", false, "มี", "ยังไม่สร้าง"); }
  else {
    const slug = `qc-host-${Date.now()}`;
    const t = await prisma.tenant.create({ data: { name: "QC HOST", slug, customDomain: `${slug}.example.com`, domainStatus: "ACTIVE" } }); tid = t.id;
    const u = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "หน้าร้าน", slug: `u-${Date.now()}` } });
    chk("HR-1.1", "โดเมน ACTIVE + มี unit → /s/<tenant>/<unit>", (await dom.hostEntryPath(`${slug}.example.com`)) === `/s/${slug}/${u.slug}`, `/s/${slug}/${u.slug}`, String(await dom.hostEntryPath(`${slug}.example.com`)));
    chk("HR-1.2", "host ไม่รู้จัก → null", (await dom.hostEntryPath("unknown.example.com")) === null, "null", "?");
    await prisma.tenant.update({ where: { id: tid }, data: { domainStatus: "VERIFYING" } });
    chk("HR-1.3", "โดเมนยังไม่ ACTIVE → null (ห้ามเสิร์ฟ)", (await dom.hostEntryPath(`${slug}.example.com`)) === null, "null", "?");
    await prisma.tenant.update({ where: { id: tid }, data: { domainStatus: "ACTIVE" } });
    await prisma.businessUnit.deleteMany({ where: { tenantId: tid } });
    chk("HR-1.4", "ไม่มี unit → null", (await dom.hostEntryPath(`${slug}.example.com`)) === null, "null", "?");
    const rootSrc = (await import("node:fs")).readFileSync("src/app/page.tsx", "utf8");
    chk("HR-2.1", "root page อ่าน x-shark-host + hostEntryPath + redirect", /x-shark-host/.test(rootSrc) && /hostEntryPath/.test(rootSrc) && /redirect/.test(rootSrc), "ครบ", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} }; if (tid) { await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); } await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Host Routing =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
