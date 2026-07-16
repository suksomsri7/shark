// QC — Custom Domain (WO-0025) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/domain/service.ts:
//   export type VercelDomainClient = {
//     addDomain(domain: string): Promise<void>;
//     getDomainStatus(domain: string): Promise<"pending" | "active" | "error">;
//     removeDomain(domain: string): Promise<void>;
//   };
//   domainEnabled(): boolean   // env SHARK_VERCEL_TOKEN + SHARK_VERCEL_PROJECT ครบ
//   requestDomain(ctx: {tenantId}, domain: string, deps?: { client?: VercelDomainClient })
//     : Promise<{ ok: true; dns: { type: "CNAME"; value: string } } | { ok: false; error: string }>
//     — validate hostname (a-z0-9.-, มีจุด, ไม่ใช่ *.shark.in.th) → ผิด ok:false ไทย
//     — ซ้ำกับร้านอื่น → ok:false ไทย · ไม่มี client จริง+ไม่ได้ฉีด → ok:false "ยังไม่เปิดใช้"
//     — สำเร็จ → client.addDomain + Tenant{customDomain, domainStatus: PENDING_DNS}
//   checkDomain(ctx, deps?): Promise<{ status: string }>  // map active→ACTIVE, pending→VERIFYING, error→FAILED + อัปเดต Tenant
//   removeDomain(ctx, deps?): Promise<boolean>            // client.removeDomain + เคลียร์ field → NONE
//   resolveTenantByHost(host: string): Promise<{ slug: string } | null>   // เฉพาะ ACTIVE (proxy ใช้)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const dm = await import("@/lib/domain/service" as string).catch(() => null);
  if (!dm) { chk("DM-0", "มี src/lib/domain/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC โดเมน", slug: `qc-dm-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC DM2", slug: `qc-dm2-${Date.now()}` } }); tid2 = t2.id;
    const calls: string[] = [];
    let statusToReturn: "pending" | "active" | "error" = "pending";
    const client = {
      addDomain: async (d: string) => { calls.push(`add:${d}`); },
      getDomainStatus: async () => statusToReturn,
      removeDomain: async (d: string) => { calls.push(`rm:${d}`); },
    };

    const bad = await dm.requestDomain({ tenantId: tid }, "ไม่ใช่โดเมน!!", { client });
    chk("DM-1.1", "hostname เพี้ยน → ok:false ไทย", bad.ok === false && bad.error.length > 0, "false", JSON.stringify(bad).slice(0, 60));
    const r1 = await dm.requestDomain({ tenantId: tid }, "shop.example.com", { client });
    const trow = await prisma.tenant.findUnique({ where: { id: tid } });
    chk("DM-1.2", "สำเร็จ → addDomain + PENDING_DNS + dns CNAME", r1.ok === true && r1.dns.type === "CNAME" && calls.includes("add:shop.example.com") && trow?.customDomain === "shop.example.com" && trow?.domainStatus === "PENDING_DNS", "ครบ", JSON.stringify({ r: r1.ok, s: trow?.domainStatus }));
    const dup = await dm.requestDomain({ tenantId: tid2 }, "shop.example.com", { client });
    chk("DM-1.3", "โดเมนซ้ำร้านอื่น → ok:false", dup.ok === false, "false", "?");

    statusToReturn = "pending";
    chk("DM-2.1", "check: pending → VERIFYING", (await dm.checkDomain({ tenantId: tid }, { client })).status === "VERIFYING" && (await prisma.tenant.findUnique({ where: { id: tid } }))?.domainStatus === "VERIFYING", "VERIFYING", "?");
    statusToReturn = "active";
    chk("DM-2.2", "check: active → ACTIVE", (await dm.checkDomain({ tenantId: tid }, { client })).status === "ACTIVE", "ACTIVE", "?");

    const hit = await dm.resolveTenantByHost("shop.example.com");
    chk("DM-3.1", "resolveTenantByHost (ACTIVE) → slug ถูกร้าน", hit?.slug === (await prisma.tenant.findUnique({ where: { id: tid } }))?.slug, "slug ตรง", String(hit?.slug));
    chk("DM-3.2", "host ไม่รู้จัก → null", (await dm.resolveTenantByHost("nobody.example.com")) === null, "null", "?");
    statusToReturn = "error";
    await dm.checkDomain({ tenantId: tid }, { client });
    chk("DM-3.3", "FAILED แล้ว resolve → null (เสิร์ฟเฉพาะ ACTIVE)", (await dm.resolveTenantByHost("shop.example.com")) === null, "null", "?");

    chk("DM-4.1", "removeDomain → เคลียร์ + NONE", (await dm.removeDomain({ tenantId: tid }, { client })) === true && (await prisma.tenant.findUnique({ where: { id: tid } }))?.domainStatus === "NONE" && calls.includes("rm:shop.example.com"), "NONE", "?");
    const off = await dm.requestDomain({ tenantId: tid }, "x.example.com");
    chk("DM-4.2", "ไม่มี env+ไม่ฉีด client → ok:false สุภาพ", off.ok === false, "false", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) await d(() => prisma.tenant.delete({ where: { id } }));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Custom Domain =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
