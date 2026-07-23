// QC — Mobile Phase 0: auth core + routes Builder A (ledger/MOBILE_PLAN.md M-10) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา route (เรียก handler ตรง — ห้ามใช้ next/headers ยกเว้น webview-exchange ซึ่งไม่สอบตรงนี้ ไปสอบ smoke prod):
//   POST /api/mobile/auth/otp {email} → 200 {ok:true} (rate limit เดิมใน requestLogin) — ห้ามมี otp ใน response
//   POST /api/mobile/auth/verify {email,code} → 200 {token,user:{id,email}} | 401 {error}
//   GET  /api/mobile/me (Bearer) → 200 {user:{id,email},memberships:[{tenantId,name,role}]}
//   GET  /api/mobile/tenants (Bearer) → 200 {tenants:[{tenantId,name,role}]}
//   POST /api/mobile/tenants (Bearer) {name} → 200 {tenantId} — reuse logic onboarding (OWNER+acceptedAt+unitAccess ["*"])
//   POST /api/mobile/push/register (Bearer+X-Tenant-Id) {expoToken,platform} → 200 {ok} — upsert by expoToken (เครื่องย้าย user → แถวย้ายตาม)
//   POST /api/mobile/auth/logout (Bearer) {expoToken?} → 200 {ok} — revoke session + ลบ push device
//   POST /api/mobile/webview-session (Bearer+X-Tenant-Id) → 200 {code} — อายุ 60 วิ ใช้ครั้งเดียว
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };

const ts = Date.now();
const em1 = `qc-ma1-${ts}@qc.local`; const em2 = `qc-ma2-${ts}@qc.local`;
const uids: string[] = []; const tids: string[] = [];
try {
  const lib = (await import("@/lib/mobile/auth")) as unknown as { [k: string]: (...a: any[]) => any };
  const u1 = await prisma.user.create({ data: { email: em1 } }); uids.push(u1.id);
  const u2 = await prisma.user.create({ data: { email: em2 } }); uids.push(u2.id);
  const t1 = await prisma.tenant.create({ data: { name: "QC MA ร้านหลัก", slug: `qc-ma1-${ts}` } }); tids.push(t1.id);
  const t2 = await prisma.tenant.create({ data: { name: "QC MA ร้านคนอื่น", slug: `qc-ma2-${ts}` } }); tids.push(t2.id);
  const t3 = await prisma.tenant.create({ data: { name: "QC MA ระงับ", slug: `qc-ma3-${ts}`, status: "SUSPENDED" } }); tids.push(t3.id);
  await prisma.membership.create({ data: { userId: u1.id, tenantId: t1.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { userId: u1.id, tenantId: t3.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });

  // ── ชั้น lib (core ของ Fable — ต้องเขียวตั้งแต่วันแรก) ──
  const { token } = await lib.issueMobileToken(u1.id, { userAgent: "qc" });
  const bearer = { authorization: `Bearer ${token}` };
  const mu = await lib.mobileUser(J("/x", "GET", undefined, bearer));
  chk("MA-1.1", "issueMobileToken → mobileUser อ่านกลับได้", mu?.id === u1.id, u1.id, String(mu?.id));
  chk("MA-1.2", "token ปลอม/ไม่มี header → null", (await lib.mobileUser(J("/x", "GET", undefined, { authorization: "Bearer fake" }))) === null && (await lib.mobileUser(J("/x", "GET"))) === null, "null", "?");
  const g0 = await lib.requireMobile(J("/x", "GET", undefined, bearer));
  chk("MA-2.1", "requireMobile ไม่ส่ง X-Tenant-Id → 403 missing_tenant", g0.ok === false && g0.status === 403 && g0.error === "missing_tenant", "403", JSON.stringify(g0));
  const g1 = await lib.requireMobile(J("/x", "GET", undefined, { ...bearer, "x-tenant-id": t2.id }));
  chk("MA-2.2", "tenant ที่ไม่ใช่สมาชิก → 403 forbidden (กันข้ามกิจการ)", g1.ok === false && g1.error === "forbidden", "forbidden", JSON.stringify(g1));
  const g2 = await lib.requireMobile(J("/x", "GET", undefined, { ...bearer, "x-tenant-id": t1.id }));
  chk("MA-2.3", "สมาชิกจริง → ok + ctx.tenantId ถูก", g2.ok === true && g2.ctx?.tenantId === t1.id && g2.membership?.role === "OWNER", "ok", JSON.stringify({ ok: g2.ok }));
  const g3 = await lib.requireMobile(J("/x", "GET", undefined, { ...bearer, "x-tenant-id": t3.id }));
  chk("MA-2.4", "ร้าน SUSPENDED → 403 suspended", g3.ok === false && g3.error === "suspended", "suspended", JSON.stringify(g3));
  const code1 = await lib.issueWebviewCode(u1.id, t1.id);
  const c1 = await lib.consumeWebviewCode(code1);
  chk("MA-3.1", "webview code แลกได้ครั้งแรก → userId+tenantId ถูก", c1?.userId === u1.id && c1?.tenantId === t1.id, "match", JSON.stringify(c1));
  chk("MA-3.2", "แลกซ้ำ (replay) → null", (await lib.consumeWebviewCode(code1)) === null, "null", "?");
  const codeExp = await lib.issueWebviewCode(u1.id, t1.id);
  await prisma.authToken.updateMany({ where: { email: `${u1.id}|${t1.id}`, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  chk("MA-3.3", "code หมดอายุ (>60วิ) → null", (await lib.consumeWebviewCode(codeExp)) === null, "null", "?");

  // ── ชั้น route (Builder A) ──
  const rOtp = await route("@/app/api/mobile/auth/otp/route");
  if (!rOtp?.POST) chk("MA-4.0", "มี route auth/otp", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rOtp.POST(J("/api/mobile/auth/otp", "POST", { email: em2 }));
    const body = await res.text();
    const rows = await prisma.authToken.count({ where: { email: em2, purpose: "OTP" } });
    chk("MA-4.1", "POST auth/otp → 200 + สร้าง AuthToken OTP", res.status === 200 && rows >= 1, "200/≥1", `${res.status}/${rows}`);
    chk("MA-4.2", "response ไม่หลุดรหัส OTP", !/\d{6}/.test(body), "ไม่มีเลข 6 หลัก", body.slice(0, 80), "CRITICAL");
  }
  const rVer = await route("@/app/api/mobile/auth/verify/route");
  if (!rVer?.POST) chk("MA-5.0", "มี route auth/verify", false, "มี", "ยังไม่สร้าง");
  else {
    const bad = await rVer.POST(J("/api/mobile/auth/verify", "POST", { email: em2, code: "000000" }));
    chk("MA-5.1", "code ผิด → 401", bad.status === 401, "401", String(bad.status));
    const auth = (await import("@/lib/core/auth")) as unknown as { requestLogin: (e: string) => Promise<{ otp: string } | null> };
    const prev = await auth.requestLogin(em2);
    const good = await rVer.POST(J("/api/mobile/auth/verify", "POST", { email: em2, code: prev?.otp ?? "" }));
    const gb = (await good.json().catch(() => ({}))) as { token?: string; user?: { email?: string } };
    chk("MA-5.2", "code ถูก → 200 {token,user}", good.status === 200 && !!gb.token && gb.user?.email === em2, "token+user", JSON.stringify(gb).slice(0, 80));
  }
  const rMe = await route("@/app/api/mobile/me/route");
  if (!rMe?.GET) chk("MA-6.0", "มี route me", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rMe.GET(J("/api/mobile/me", "GET", undefined, bearer));
    const b = (await res.json().catch(() => ({}))) as { user?: { email?: string }; memberships?: { tenantId?: string; name?: string; role?: string }[] };
    const m1 = b.memberships?.find((m) => m.tenantId === t1.id);
    chk("MA-6.1", "GET me → user + memberships (มีชื่อร้าน+role)", res.status === 200 && b.user?.email === em1 && m1?.name === "QC MA ร้านหลัก" && m1?.role === "OWNER", "ครบ", JSON.stringify(b).slice(0, 120));
    chk("MA-6.2", "GET me ไม่มี Bearer → 401", (await rMe.GET(J("/api/mobile/me", "GET"))).status === 401, "401", "?");
  }
  const rTen = await route("@/app/api/mobile/tenants/route");
  if (!rTen?.GET || !rTen?.POST) chk("MA-7.0", "มี route tenants GET+POST", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rTen.GET(J("/api/mobile/tenants", "GET", undefined, bearer));
    const b = (await res.json().catch(() => ({}))) as { tenants?: { tenantId: string }[] };
    chk("MA-7.1", "GET tenants → รายการกิจการของ user", res.status === 200 && !!b.tenants?.some((x) => x.tenantId === t1.id), "มี t1", JSON.stringify(b).slice(0, 100));
    const cr = await rTen.POST(J("/api/mobile/tenants", "POST", { name: "ร้าน QC เพิ่มจากแอป" }, bearer));
    const cb = (await cr.json().catch(() => ({}))) as { tenantId?: string };
    if (cb.tenantId) tids.push(cb.tenantId);
    const mem = cb.tenantId ? await prisma.membership.findFirst({ where: { userId: u1.id, tenantId: cb.tenantId } }) : null;
    chk("MA-7.2", "POST tenants → สร้างกิจการ + OWNER acceptedAt + unitAccess [*]", cr.status === 200 && mem?.role === "OWNER" && !!mem?.acceptedAt && JSON.stringify(mem?.unitAccess) === '["*"]', "OWNER", JSON.stringify(mem?.role));
    const gNew = cb.tenantId ? await lib.requireMobile(J("/x", "GET", undefined, { ...bearer, "x-tenant-id": cb.tenantId })) : { ok: false };
    chk("MA-7.3", "กิจการใหม่ใช้ X-Tenant-Id ได้ทันที", gNew.ok === true, "ok", JSON.stringify(gNew.ok));
    const empty = await rTen.POST(J("/api/mobile/tenants", "POST", { name: " " }, bearer));
    chk("MA-7.4", "ชื่อว่าง → 400", empty.status === 400, "400", String(empty.status), "MAJOR");
  }
  const rPush = await route("@/app/api/mobile/push/register/route");
  const expo = `ExponentPushToken[qc-${ts}]`;
  if (!rPush?.POST) chk("MA-8.0", "มี route push/register", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rPush.POST(J("/api/mobile/push/register", "POST", { expoToken: expo, platform: "ios" }, { ...bearer, "x-tenant-id": t1.id }));
    const row = await prisma.pushDevice.findUnique({ where: { expoToken: expo } });
    chk("MA-8.1", "register → PushDevice ผูก user+tenant", res.status === 200 && row?.userId === u1.id && row?.tenantId === t1.id && row?.platform === "ios", "row u1/t1", JSON.stringify({ u: row?.userId === u1.id, t: row?.tenantId === t1.id }));
    const { token: tk2 } = await lib.issueMobileToken(u2.id);
    await prisma.membership.create({ data: { userId: u2.id, tenantId: t2.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
    await rPush.POST(J("/api/mobile/push/register", "POST", { expoToken: expo, platform: "ios" }, { authorization: `Bearer ${tk2}`, "content-type": "application/json", "x-tenant-id": t2.id }));
    const moved = await prisma.pushDevice.findMany({ where: { expoToken: expo } });
    chk("MA-8.2", "เครื่องเดิมย้าย user → แถวย้ายตาม (unique expoToken)", moved.length === 1 && moved[0]?.userId === u2.id, "1 แถว u2", `${moved.length} แถว`);
  }
  const rOut = await route("@/app/api/mobile/auth/logout/route");
  if (!rOut?.POST) chk("MA-9.0", "มี route auth/logout", false, "มี", "ยังไม่สร้าง");
  else {
    const { token: tk3 } = await lib.issueMobileToken(u1.id);
    const expo3 = `ExponentPushToken[qc3-${ts}]`;
    await prisma.pushDevice.create({ data: { userId: u1.id, expoToken: expo3, platform: "android" } });
    const res = await rOut.POST(J("/api/mobile/auth/logout", "POST", { expoToken: expo3 }, { authorization: `Bearer ${tk3}`, "content-type": "application/json" }));
    const dead = await lib.mobileUser(J("/x", "GET", undefined, { authorization: `Bearer ${tk3}` }));
    chk("MA-9.1", "logout → session ใช้ไม่ได้ + push device หาย", res.status === 200 && dead === null && (await prisma.pushDevice.count({ where: { expoToken: expo3 } })) === 0, "ตายทั้งคู่", JSON.stringify({ dead: dead === null }));
  }
  const rWv = await route("@/app/api/mobile/webview-session/route");
  if (!rWv?.POST) chk("MA-10.0", "มี route webview-session", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rWv.POST(J("/api/mobile/webview-session", "POST", undefined, { ...bearer, "x-tenant-id": t1.id }));
    const b = (await res.json().catch(() => ({}))) as { code?: string };
    const got = b.code ? await lib.consumeWebviewCode(b.code) : null;
    chk("MA-10.1", "webview-session → code แลกเป็น user+tenant ถูก", res.status === 200 && got?.userId === u1.id && got?.tenantId === t1.id, "match", JSON.stringify(got));
    chk("MA-10.2", "ไม่ล็อกอิน → 401", (await rWv.POST(J("/api/mobile/webview-session", "POST"))).status === 401, "401", "?");
  }
  const rApple = await route("@/app/api/mobile/auth/apple/route");
  if (!rApple?.POST) chk("MA-11.0", "มี route auth/apple (Sign in with Apple)", false, "มี", "ยังไม่สร้าง");
  else {
    chk("MA-11.1", "apple: ไม่มี token → 400", (await rApple.POST(J("/api/mobile/auth/apple", "POST", {}))).status === 400, "400", "?");
    const bad = await rApple.POST(J("/api/mobile/auth/apple", "POST", { identityToken: "fake.jwt.token" }));
    chk("MA-11.2", "apple: token ปลอม → 401 (ต้อง verify กับ Apple JWKS เสมอ)", bad.status === 401, "401", String(bad.status));
  }
} finally {
  for (const tid of tids) { await prisma.membership.deleteMany({ where: { tenantId: tid } }); await prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => {}); await prisma.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => {}); await prisma.businessUnit.deleteMany({ where: { tenantId: tid } }).catch(() => {}); await prisma.tenant.deleteMany({ where: { id: tid } }); }
  for (const uid of uids) { await prisma.pushDevice.deleteMany({ where: { userId: uid } }); await prisma.session.deleteMany({ where: { userId: uid } }); await prisma.user.deleteMany({ where: { id: uid } }); }
  await prisma.authToken.deleteMany({ where: { email: { in: [em1, em2] } } });
  await prisma.authToken.deleteMany({ where: { purpose: "WEBVIEW", email: { startsWith: uids[0] ?? "qc-none" } } });
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-mobile-auth: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
