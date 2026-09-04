// QC — ลบบัญชีผู้ใช้ (App Store 5.1.1(v)) + บัญชีผู้ตรวจสโตร์ · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast
//
// สัญญาที่ต้องจริงเสมอ:
//   AD-1 ลบบัญชีแล้ว **หายจริง** — User/Membership/Session ไม่เหลือ (ไม่ใช่แค่ปิดใช้งาน)
//   AD-2 ร้านที่ยังมีสมาชิกคนอื่น → เปลี่ยนมือให้คนอื่น ร้าน**ไม่ถูกลบ** และ**ไม่กำพร้า** (ต้องมี OWNER เสมอ)
//   AD-3 ลำดับผู้รับช่วง: OWNER คนอื่น > MANAGER > คนที่เข้าร่วมนานสุด
//   AD-4 ร้านที่ไม่เหลือใคร → เข้าช่วงพัก 30 วัน (PENDING_DELETE) ไม่ใช่ลบทันที
//   AD-5 พนักงานที่ไม่ได้เป็นเจ้าของร้านไหน → ลบบัญชีได้ และร้านไม่ถูกแตะ
//   AD-6 preview ต้องตรงกับสิ่งที่เกิดขึ้นจริง (จอยืนยันห้ามโกหกผู้ใช้)
//   AD-7 🔴 ข้อมูลของร้าน "อื่น" ห้ามถูกแตะเลยไม่ว่ากรณีใด
//   RV-1 บัญชีผู้ตรวจ: ตั้ง env ครบ → ได้รหัสคงที่ · ไม่ตั้ง/ตั้งไม่ครบ → ไม่มีทางลัด (fail-closed)
//
// รัน: pnpm qc:account-deletion
// WO 9.2 ข้อ 18 — โหลด env ผ่านด่านกลาง: เคารพ QC_ENV_FILE + **ห้ามชี้ prod** (ALLOW_PROD_QC=1 ถึงจะยอม)
//   (เดิมเรียก process.loadEnvFile(".env") ตรง ๆ → เคยพา suite นี้ไปสร้าง tenant บน prod จริง 3 ก.ย.)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-deletion");

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const del = (await import("@/lib/platform/account-deletion" as string)) as {
  previewAccountDeletion: (u: string) => Promise<any>;
  deleteAccount: (u: string) => Promise<any>;
};

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

const ts = Date.now();
const tids: string[] = [];
const uids: string[] = [];

const mkUser = async (tag: string) => {
  const u = await prisma.user.create({ data: { email: `qc-ad-${tag}-${ts}@example.com`, name: `คุณ${tag}` } });
  uids.push(u.id);
  return u;
};
const mkTenant = async (name: string) => {
  const t = await prisma.tenant.create({ data: { name, slug: `qc-ad-${name}-${ts}` } });
  tids.push(t.id);
  return t;
};
const join = (tenantId: string, userId: string, role: string) =>
  prisma.membership.create({ data: { tenantId, userId, role, acceptedAt: new Date() } });

try {
  // ── เคส A: OWNER คนเดียว ไม่มีสมาชิกอื่น → ร้านเข้าช่วงพักลบ ──
  const uA = await mkUser("a");
  const tA = await mkTenant("โซโล");
  await join(tA.id, uA.id, "OWNER");
  await prisma.session.create({
    data: { userId: uA.id, tokenHash: `qc-ad-a-${ts}`, idleExpiresAt: new Date(Date.now() + 8.64e7), expiresAt: new Date(Date.now() + 8.64e7) },
  });

  // ── เคส B: OWNER + มี MANAGER และ STAFF → ต้องส่งมอบให้ MANAGER ──
  const uB = await mkUser("b");
  const uMgr = await mkUser("mgr");
  const uStaff = await mkUser("staff");
  const tB = await mkTenant("มีทีม");
  await join(tB.id, uStaff.id, "STAFF"); // เข้าร่วมก่อน (createdAt เก่ากว่า) — ทดสอบว่าลำดับดูที่ role ไม่ใช่เวลา
  await join(tB.id, uMgr.id, "MANAGER");
  await join(tB.id, uB.id, "OWNER");

  // ── เคส C: ร้านของคนอื่นล้วน — ต้องไม่ถูกแตะ (AD-7) ──
  const uC = await mkUser("c");
  const tC = await mkTenant("ร้านคนอื่น");
  await join(tC.id, uC.id, "OWNER");

  // uB เป็น STAFF ในร้าน tC ด้วย → ทดสอบ AD-5 (ออกจากร้านคนอื่นโดยร้านไม่กระทบ)
  await join(tC.id, uB.id, "STAFF");

  // ── AD-6 preview ต้องตรงกับผลจริง ──
  const pv = await del.previewAccountDeletion(uB.id);
  const pvHanded = pv.tenantsHandedOver.map((x: any) => x.name);
  const pvLeft = pv.tenantsLeftAlone.map((x: any) => x.name);
  chk("AD-6.1", "preview: ร้าน 'มีทีม' อยู่ในกลุ่มเปลี่ยนมือ", pvHanded.includes("มีทีม"), "มีทีม", JSON.stringify(pvHanded));
  chk("AD-6.2", "preview: ร้าน 'ร้านคนอื่น' อยู่กลุ่มไม่กระทบ", pvLeft.includes("ร้านคนอื่น"), "ร้านคนอื่น", JSON.stringify(pvLeft));
  chk("AD-6.3", "preview: ผู้รับช่วงคือ MANAGER (ไม่ใช่ STAFF ที่เข้าก่อน)",
    pv.tenantsHandedOver[0]?.newOwner === "คุณmgr", "คุณmgr", String(pv.tenantsHandedOver[0]?.newOwner));

  // ── ลบ uB ──
  const rB = await del.deleteAccount(uB.id);
  chk("AD-1.1", "ลบบัญชีสำเร็จ", rB.ok === true, "ok", JSON.stringify(rB).slice(0, 80));
  chk("AD-1.2", "🔴 User หายจริง (ไม่ใช่แค่ปิดใช้งาน)",
    (await prisma.user.count({ where: { id: uB.id } })) === 0, "0", String(await prisma.user.count({ where: { id: uB.id } })));
  chk("AD-1.3", "Membership ของคนนั้นหายทุกร้าน (cascade)",
    (await prisma.membership.count({ where: { userId: uB.id } })) === 0, "0", String(await prisma.membership.count({ where: { userId: uB.id } })));

  // ── AD-2/AD-3 ร้าน 'มีทีม' ต้องยังอยู่ + มีเจ้าของใหม่ ──
  const tBrow = await prisma.tenant.findUnique({ where: { id: tB.id }, select: { status: true } });
  chk("AD-2.1", "ร้านที่มีสมาชิกคนอื่น ไม่ถูกลบ (ยัง ACTIVE)", tBrow?.status === "ACTIVE", "ACTIVE", String(tBrow?.status));
  const ownersB = await prisma.membership.findMany({ where: { tenantId: tB.id, role: "OWNER" }, include: { user: { select: { name: true } } } });
  chk("AD-2.2", "🔴 ร้านไม่กำพร้า — ยังมี OWNER เหลืออยู่", ownersB.length === 1, "1 คน", String(ownersB.length));
  chk("AD-3.1", "ผู้รับช่วงคือ MANAGER ตามลำดับที่ตกลง", ownersB[0]?.user?.name === "คุณmgr", "คุณmgr", String(ownersB[0]?.user?.name));
  chk("AD-3.2", "STAFF เดิมยังเป็น STAFF (ไม่ถูกเลื่อนมั่ว)",
    (await prisma.membership.findFirst({ where: { tenantId: tB.id, userId: uStaff.id } }))?.role === "STAFF", "STAFF", "?");

  // ── AD-5 ร้านคนอื่นต้องไม่กระทบเลย ──
  const tCrow = await prisma.tenant.findUnique({ where: { id: tC.id }, select: { status: true } });
  chk("AD-5.1", "ร้านที่ผู้ใช้เป็นแค่ STAFF → ร้านยัง ACTIVE", tCrow?.status === "ACTIVE", "ACTIVE", String(tCrow?.status));
  chk("AD-7.1", "🔴 เจ้าของร้านคนอื่นไม่ถูกแตะ",
    (await prisma.membership.count({ where: { tenantId: tC.id, userId: uC.id, role: "OWNER" } })) === 1, "1", "?");

  // ── AD-4 เคส A: ไม่เหลือใคร → PENDING_DELETE ──
  const rA = await del.deleteAccount(uA.id);
  const tArow = await prisma.tenant.findUnique({ where: { id: tA.id }, select: { status: true, deleteRequestedAt: true } });
  chk("AD-4.1", "ลบบัญชี OWNER เดี่ยวสำเร็จ", rA.ok === true, "ok", JSON.stringify(rA).slice(0, 60));
  chk("AD-4.2", "ร้านที่ไม่เหลือใคร → PENDING_DELETE (ไม่ลบทันที)",
    tArow?.status === "PENDING_DELETE" && !!tArow?.deleteRequestedAt, "PENDING_DELETE+ts", `${tArow?.status}/${tArow?.deleteRequestedAt ? "ts" : "null"}`);
  chk("AD-1.4", "Session ของคนที่ถูกลบหายด้วย (cascade)",
    (await prisma.session.count({ where: { userId: uA.id } })) === 0, "0", String(await prisma.session.count({ where: { userId: uA.id } })));

  // ── RV-1 บัญชีผู้ตรวจสโตร์: fail-closed เมื่อ env ไม่ครบ ──
  const envMod = (await import("@/lib/env" as string)) as { reviewLogin: unknown };
  const hasEnv = !!process.env.REVIEW_EMAIL && /^\d{6}$/.test(process.env.REVIEW_OTP ?? "");
  chk("RV-1.1", `reviewLogin เปิดก็ต่อเมื่อ env ครบ (ตอนนี้ env ${hasEnv ? "ครบ" : "ไม่ครบ"})`,
    hasEnv ? envMod.reviewLogin !== null : envMod.reviewLogin === null,
    hasEnv ? "ไม่ null" : "null", String(envMod.reviewLogin === null ? "null" : "เปิด"));
  const authSrc = (await import("node:fs")).readFileSync("src/lib/core/auth.ts", "utf8");
  chk("RV-1.2", "🔴 ทางลัดผู้ตรวจผูกกับอีเมลเดียวเท่านั้น (เทียบ email === reviewLogin.email)",
    /email\s*===\s*reviewLogin\.email/.test(authSrc), "เทียบอีเมลตรงตัว", "ไม่พบ");
  chk("RV-1.3", "🔴 ผู้ตรวจยังโดน rate limit เหมือนคนอื่น (ทางลัดอยู่ 'หลัง' ด่านนับ)",
    authSrc.indexOf("RL_MESSAGE") < authSrc.indexOf("const isReviewer"), "ด่านมาก่อน", "ทางลัดมาก่อนด่าน");
} catch (e) {
  chk("CRASH", "harness จบไม่ error", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e));
} finally {
  for (const id of tids) {
    await prisma.membership.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  for (const id of uids) {
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
  console.log("[cleanup] ลบ test data เรียบร้อย");
}

const failed = cks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ลบบัญชีผู้ใช้ + บัญชีผู้ตรวจสโตร์ =====");
console.log(`ผ่าน ${cks.length - failed.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({
  total: cks.length,
  passed: cks.length - failed.length,
  findings: failed.map((c) => ({ id: c.id, sev: c.sev })),
}));
process.exit(failed.length ? 1 : 0);
