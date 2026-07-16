// QC — Backoffice Phase 0 (WO-0019) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/platform/ ที่ Builder ต้องทำตาม:
// auth.ts:
//   requestPlatformOtp(email: string): Promise<{ preview?: { otp: string } }>
//     — มี PlatformUser: สร้าง PlatformAuthToken (tokenHash=sha256(`${email}:${otp}`), TTL 10 นาที) + sendEmail
//     — ไม่มี PlatformUser: คืน {} เฉย ๆ (generic — กัน enumeration) ไม่สร้าง token ไม่ส่งเมล
//     — preview.otp คืนเมื่อ env AUTH_PREVIEW_OTP=1 (pattern เดียวกับ auth ร้าน) เพื่อให้ทดสอบได้
//   verifyPlatformOtp(email, code): Promise<string | null>
//     — ถูก + ยังไม่หมดอายุ + ยังไม่ใช้ → ตั้ง usedAt + สร้าง PlatformSession (TTL 7 วัน) + คืน token ดิบ
//     — ผิด/หมดอายุ/ใช้ซ้ำ → null
//   getPlatformUserByToken(token: string): Promise<PlatformUser | null>   // หมดอายุ → null
//   requirePlatformRole(user: PlatformUser | null, roles: PlatformRole[]): PlatformUser  // ไม่ผ่าน → throw
// service.ts:
//   listTenantsOverview(): Promise<{ id; name; createdAt; systemsCount: number }[]>  // เรียงใหม่→เก่า
//   platformMetrics(): Promise<{ totalTenants: number; totalSystems: number; systemsByType: Record<string, number> }>
try { process.loadEnvFile(".env"); } catch {}
process.env.AUTH_PREVIEW_OTP = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

const EMAIL = `qc-bo-${Date.now()}@example.com`;
let tid = ""; let puId = "";
try {
  const auth = await import("@/lib/platform/auth" as string).catch(() => null);
  const svc = await import("@/lib/platform/service" as string).catch(() => null);
  if (!auth || !svc) { chk("BO-0", "มี src/lib/platform/{auth,service}.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const pu = await prisma.platformUser.create({ data: { email: EMAIL, name: "QC Admin", role: "SUPPORT" } });
    puId = pu.id;

    // 1) enumeration guard
    const ghost = await auth.requestPlatformOtp("ghost-no-user@example.com");
    chk("BO-1.1", "email ไม่รู้จัก → generic ไม่สร้าง token", !ghost.preview && (await prisma.platformAuthToken.count({ where: { email: "ghost-no-user@example.com" } })) === 0, "0 token", "?");

    // 2) OTP flow
    const req = await auth.requestPlatformOtp(EMAIL);
    chk("BO-2.1", "ขอ OTP → ได้ preview (โหมดเทส) + token ใน DB", !!req.preview?.otp && (await prisma.platformAuthToken.count({ where: { email: EMAIL } })) === 1, "1 token", "?");
    chk("BO-2.2", "verify ผิด → null", (await auth.verifyPlatformOtp(EMAIL, "000000")) === null, "null", "?");
    const token = await auth.verifyPlatformOtp(EMAIL, req.preview!.otp);
    chk("BO-2.3", "verify ถูก → ได้ session token", typeof token === "string" && token.length > 20, "token", String(token).slice(0, 12));
    chk("BO-2.4", "OTP ใช้ซ้ำ → null (usedAt)", (await auth.verifyPlatformOtp(EMAIL, req.preview!.otp)) === null, "null", "?");

    // 3) session
    const me = await auth.getPlatformUserByToken(token!);
    chk("BO-3.1", "token → PlatformUser ถูกคน", me?.id === pu.id, pu.id.slice(0, 8), String(me?.id).slice(0, 8));
    chk("BO-3.2", "token มั่ว → null", (await auth.getPlatformUserByToken("no-such-token")) === null, "null", "?");
    await prisma.platformSession.updateMany({ where: { platformUserId: pu.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    chk("BO-3.3", "session หมดอายุ → null", (await auth.getPlatformUserByToken(token!)) === null, "null", "?");

    // 4) role guard
    let threw = false;
    try { auth.requirePlatformRole(me, ["SUPER_ADMIN"]); } catch { threw = true; }
    chk("BO-4.1", "SUPPORT ขอสิทธิ์ SUPER_ADMIN → throw", threw, "throw", String(threw));
    chk("BO-4.2", "SUPPORT ขอ [SUPPORT] → ผ่าน", auth.requirePlatformRole(me, ["SUPPORT"])?.id === pu.id, "ผ่าน", "?");
    let threwNull = false;
    try { auth.requirePlatformRole(null, ["SUPPORT"]); } catch { threwNull = true; }
    chk("BO-4.3", "user null → throw", threwNull, "throw", String(threwNull));

    // 5) service ข้อมูลจริง
    const t = await prisma.tenant.create({ data: { name: "QC BO ร้านทดสอบ", slug: `qc-bo-${Date.now()}` } }); tid = t.id;
    await sys.createSystem(tid, "MEMBER", "สมาชิก");
    await sys.createSystem(tid, "POS", "ขายหน้าร้าน");
    const list = await svc.listTenantsOverview();
    const row = list.find((x: { id: string }) => x.id === tid);
    chk("BO-5.1", "listTenantsOverview เห็นร้าน + systemsCount 2", !!row && row.systemsCount === 2, "2", String(row?.systemsCount));
    chk("BO-5.2", "เรียงใหม่→เก่า (ร้านเทสอยู่หัว)", list[0]?.id === tid, "หัวแถว", String(list[0]?.id).slice(0, 8));
    const m = await svc.platformMetrics();
    chk("BO-5.3", "metrics: totalTenants ≥1 + systemsByType มี POS", m.totalTenants >= 1 && (m.systemsByType?.POS ?? 0) >= 1, "≥1/มี POS", JSON.stringify({ t: m.totalTenants, pos: m.systemsByType?.POS }));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.platformAuthToken.deleteMany({ where: { email: { in: [EMAIL, "ghost-no-user@example.com"] } } }));
  if (puId) { await d(() => prisma.platformSession.deleteMany({ where: { platformUserId: puId } })); await d(() => prisma.platformUser.delete({ where: { id: puId } })); }
  if (tid) {
    for (const m of ["appSystemUnit", "appSystem", "businessUnit"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Backoffice (Phase 0) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
