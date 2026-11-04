// QC — SECRETARY S1.25 · กิจการจากแอป · เชิญพนักงานด้วยเบอร์ (StaffInvite · ไม่สร้าง Membership จนรับ) · ระดับสิทธิ์ ปิด/ดู/ใช้งาน · ระงับ/เอาออกกลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   T  createTenantFromApp: OWNER acceptedAt · ระบบที่เลือก (ตัดซ้ำ/ไม่รู้จัก) · ห้องแรกเปิด (นับงาน 1) · ชื่อสั้น throw · เพดาน 3 ร้าน
//   I  inviteStaff/list/cancel/resend/claim/accept: mock SMS · codeHash ไม่ใช่ code · ไม่มี Membership จนรับ · เหตุผลปฏิเสธครบ · throttle · รับด้วยเบอร์ · hook signupWithPhone
//   L  levels: levelOfModule/permissionsForLevel/CHAT_LEVELS/setStaffLevels/staffViewOf/suspend/remove
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.25.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.25";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const INV_FILE = join(ROOT, "src/lib/staff/invite.ts");
const STARTED = existsSync(INV_FILE);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/staff/invite.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
process.env.SMS_PROVIDER = "mock"; delete process.env.SMS_API_KEY; delete process.env.SMS_ENDPOINT;
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
const sms = await import("@/lib/core/sms");
sms.__resetSmsProviderCacheForTests?.();
const pa = await import("@/lib/core/phone-auth");
const tn = await import("@/lib/mobile/tenants");
const inv = (await import("@/lib/staff/invite").catch(() => null)) as AnyMod | null;
const lv = (await import("@/lib/staff/levels").catch(() => null)) as AnyMod | null;

const U = { owner: "qcs125-owner", mgr: "qcs125-mgr", staff: "qcs125-staff", newbie: "qcs125-newbie", other: "qcs125-other", login: "qcs125-login" };
const PH = { invite: "+66812345001", staff: "+66812345002", other: "+66812345003", signup: "+66812345004", resend: "+66812345005", login: "+66812345006", rl: "+66812345007" };
const tids: string[] = [];
const cleanup = async () => {
  for (const tid of tids) {
    for (const m of ["staffInvite", "aiActionLog", "aiProposal", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appNotification", "appSystem", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { OR: [{ slug: { startsWith: "qc-sec-s125-" } }, { name: { startsWith: "QC S1.25 " } }], createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.userPhone.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { OR: [{ id: { startsWith: "qcs125-" } }, { email: { startsWith: "qcs125-" } }, { email: { endsWith: "@phone.shark.in.th", in: Object.values(PH).map((p) => p.replace("+", "") + "@phone.shark.in.th") } }] } }); } catch { /* */ }
};
const DAY = 86_400_000;
try {
  await cleanup();
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  await prisma.userPhone.create({ data: { userId: U.staff, phone: PH.staff, verifiedAt: new Date() } });
  await prisma.userPhone.create({ data: { userId: U.other, phone: PH.other, verifiedAt: new Date() } });
  const M = (role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ role, unitAccess: ["*"], permissions });
  const ctxOf = (tid: string, userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ tenantId: tid, actorUserId: userId, membership: M(role, permissions) });

  console.log("── T: createTenantFromApp ──");
  let tid = "";
  if (typeof tn.createTenantFromApp !== "function") { for (const i of [1, 2]) skip(`T-${i}`, "tenant", "ไม่มี createTenantFromApp"); }
  else {
    const r = await tn.createTenantFromApp(U.owner, { name: "QC S1.25 ร้าน", type: "retail", systems: ["POS", "KANBAN", "NOSUCH", "POS"] }) as { tenant: { id: string }; systems: { type: string; id: string }[]; room: { roomId: string; conversationId: string } | null };
    tid = r.tenant.id; tids.push(tid);
    const mem = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.owner, tenantId: tid } } });
    const systems = await prisma.appSystem.findMany({ where: { tenantId: tid }, select: { type: true } });
    const room = r.room ? await prisma.aiRoom.findUnique({ where: { id: r.room.roomId } }) : null;
    const counter = await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } });
    chk("T-1", "สร้างร้าน: OWNER acceptedAt · ระบบ POS+KANBAN (ตัดซ้ำ/ไม่รู้จัก = 2) · ห้องแรก startedById=owner title ไทย · นับงาน 1", mem?.role === "OWNER" && !!mem?.acceptedAt && systems.length === 2 && r.systems.length === 2 && !!room && room.startedById === U.owner && thai(room.title) && counter?.jobs === 1, JSON.stringify({ sys: systems.map((s) => s.type), room: !!room, jobs: counter?.jobs }));
    const eShort = await throws(() => tn.createTenantFromApp(U.owner, { name: "ก", type: "retail", systems: [] }));
    const t2 = await tn.createTenantFromApp(U.owner, { name: "QC S1.25 สอง", type: "weird-type", systems: [] }) as { tenant: { id: string } }; tids.push(t2.tenant.id);
    const t3 = await tn.createTenantFromApp(U.owner, { name: "QC S1.25 สาม", type: "service", systems: [] }) as { tenant: { id: string } }; tids.push(t3.tenant.id);
    const eCap = await throws(() => tn.createTenantFromApp(U.owner, { name: "QC S1.25 สี่", type: "service", systems: [] }));
    const after = await prisma.tenant.count({ where: { name: "QC S1.25 สี่" } });
    chk("T-2", "ชื่อสั้น ⇒ throw ไทย · type แปลก ⇒ ไม่ throw (= other) · ร้านที่ 4 ⇒ throw ไทยมี '3' · ไม่สร้าง", thai(eShort) && thai(eCap) && /3/.test(eCap ?? "") && after === 0, JSON.stringify({ eShort, eCap }).slice(0, 200));
  }
  if (!tid) { const t = await prisma.tenant.create({ data: { name: "QC S1.25 fallback", slug: `qc-sec-s125-${Date.now().toString(36)}` } }); tid = t.id; tids.push(tid); await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } }); }
  await prisma.membership.create({ data: { tenantId: tid, userId: U.mgr, role: "MANAGER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: { "kanban.card.read": true } as never, acceptedAt: new Date() } });
  const OWN = ctxOf(tid, U.owner, "OWNER"), MGR = ctxOf(tid, U.mgr, "MANAGER"), STF = ctxOf(tid, U.staff, "STAFF", { "kanban.card.read": true });

  console.log("── I: invites ──");
  if (!inv) { for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) skip(`I-${i}`, "invite", "ไม่มี invite.ts"); }
  else {
    const now = new Date();
    const i1 = await inv.inviteStaff(OWN, { name: "สมชาย", phone: "081-234-5001", role: "STAFF", unitIds: [], permissions: { "kanban.card.create": true } }, now) as { ok: boolean; inviteId?: string; link?: string; sms?: string; expiresAt?: Date; reason?: string; message?: string };
    const row = i1.ok ? await prisma.staffInvite.findUnique({ where: { id: i1.inviteId! } }) : null;
    const code = i1.link?.split("/i/")[1] ?? "";
    chk("I-1", "เชิญสำเร็จ: sms mocked · link https://shark.in.th/i/<8 ตัว ไม่มี 0/O/1/I> · phone E.164 · codeHash ≠ code · expiresAt ≈ +7 วัน · ยังไม่มี Membership/User ของเบอร์", i1.ok === true && i1.sms === "mocked" && /^https:\/\/shark\.in\.th\/i\/[A-HJ-NP-Z2-9]{8}$/.test(i1.link ?? "") && row?.phone === PH.invite && !!row && !row.codeHash.includes(code) && row.codeHash.length >= 32 && Math.abs((i1.expiresAt!.getTime() - now.getTime()) / DAY - 7) < 0.01 && row.acceptedAt === null && (await prisma.userPhone.count({ where: { phone: PH.invite } })) === 0, JSON.stringify({ i1, ph: row?.phone }).slice(0, 220));
    const rBad = await inv.inviteStaff(OWN, { name: "x", phone: "12345", role: "STAFF" }) as { ok: boolean; reason?: string };
    const rRole = await inv.inviteStaff(OWN, { name: "x", phone: "0812345009", role: "OWNER" as never }) as { ok: boolean; reason?: string };
    const rForb = await inv.inviteStaff(STF, { name: "x", phone: "0812345009", role: "STAFF" }) as { ok: boolean; reason?: string };
    const rDup = await inv.inviteStaff(OWN, { name: "สมชาย", phone: "0812345001", role: "STAFF" }, new Date(now.getTime() + 61_000)) as { ok: boolean; reason?: string };
    const rMem = await inv.inviteStaff(OWN, { name: "x", phone: PH.staff, role: "STAFF" }) as { ok: boolean; reason?: string };
    const rPerm = await inv.inviteStaff(OWN, { name: "x", phone: "0812345009", role: "STAFF", permissions: { "nosuch.key": true } }) as { ok: boolean; reason?: string; message?: string };
    const rMgrUp = await inv.inviteStaff(MGR, { name: "x", phone: "0812345009", role: "MANAGER" }) as { ok: boolean; reason?: string };
    chk("I-2", "ปฏิเสธ: bad_phone · bad_role (OWNER) · forbidden (STAFF เชิญ) · already_invited · already_member · bad_permissions · MANAGER เชิญ MANAGER ⇒ bad_role/forbidden (canAssignRole) · ไม่มีแถวเพิ่ม", rBad.reason === "bad_phone" && rRole.reason === "bad_role" && rForb.reason === "forbidden" && rDup.reason === "already_invited" && rMem.reason === "already_member" && rPerm.reason === "bad_permissions" && thai(rPerm.message) && rMgrUp.ok === false && (await prisma.staffInvite.count({ where: { tenantId: tid } })) === 1, JSON.stringify({ rBad, rRole, rForb, rDup, rMem, rPerm, rMgrUp }).slice(0, 300));
    const list = await inv.listInvites(OWN) as Record<string, unknown>[];
    const ls = JSON.stringify(list);
    const iR = await inv.inviteStaff(OWN, { name: "รีเซนด์", phone: PH.resend, role: "STAFF" }, now) as { ok: boolean; inviteId?: string; link?: string };
    const rs1 = await inv.resendInvite(OWN, iR.inviteId!, new Date(now.getTime() + 10_000)) as { ok: boolean; reason?: string; link?: string };
    const rs2 = await inv.resendInvite(OWN, iR.inviteId!, new Date(now.getTime() + 61_000)) as { ok: boolean; reason?: string; link?: string };
    const cancelled = await inv.cancelInvite(OWN, iR.inviteId!);
    chk("I-3", "listInvites: 1 แถว · ไม่มี codeHash · เบอร์ถูกปิดเลขกลาง · resend ทันที ⇒ throttled · หลัง 60 วิ ⇒ ok code ใหม่ · cancel ⇒ true แถวหาย", list.length === 1 && !/codeHash/.test(ls) && !ls.includes("0812345001") && !ls.includes(PH.invite) && rs1.reason === "throttled" && rs2.ok === true && rs2.link !== iR.link && cancelled === true && (await prisma.staffInvite.count({ where: { id: iR.inviteId! } })) === 0, JSON.stringify({ n: list.length, rs1, rs2: rs2.ok, cancelled }).slice(0, 200));
    const expiredRow = await prisma.staffInvite.create({ data: { tenantId: tid, phone: PH.invite, name: "หมดอายุ", role: "MANAGER", codeHash: `exp-${Date.now()}`, expiresAt: new Date(now.getTime() - DAY), invitedById: U.owner } });
    await prisma.userPhone.create({ data: { userId: U.newbie, phone: PH.invite, verifiedAt: new Date() } });
    const claim = await inv.claimInvitesForPhone(U.newbie, PH.invite, now) as { accepted: { tenantId: string; membershipId: string }[] };
    const memN = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.newbie, tenantId: tid } } });
    const rowAfter = await prisma.staffInvite.findUnique({ where: { id: i1.inviteId! } });
    const claim2 = await inv.claimInvitesForPhone(U.newbie, PH.invite, now) as { accepted: unknown[] };
    const expAfter = await prisma.staffInvite.findUnique({ where: { id: expiredRow.id } });
    chk("I-4", "claimInvitesForPhone: Membership STAFF acceptedAt · permissions จากใบ · invite acceptedAt/acceptedUserId · ใบหมดอายุไม่รับ (คง MANAGER ไม่ถูกใช้) · claim ซ้ำ = []", claim.accepted.length === 1 && memN?.role === "STAFF" && !!memN?.acceptedAt && (memN?.permissions as Record<string, unknown>)?.["kanban.card.create"] === true && !!rowAfter?.acceptedAt && rowAfter?.acceptedUserId === U.newbie && expAfter?.acceptedAt === null && claim2.accepted.length === 0, JSON.stringify({ claim, role: memN?.role, perms: memN?.permissions }).slice(0, 200));
    const iC = await inv.inviteStaff(OWN, { name: "ตามโค้ด", phone: PH.other, role: "STAFF" }, new Date(now.getTime() + 120_000)) as { ok: boolean; inviteId?: string; link?: string };
    const codeC = iC.link?.split("/i/")[1] ?? "";
    const pv = await inv.previewInvite(codeC, now) as { ok: boolean; tenantName?: string; phoneMasked?: string; reason?: string };
    const aMis = await inv.acceptInviteByCode(U.staff, codeC, now) as { ok: boolean; reason?: string };
    const aNo = await inv.acceptInviteByCode(U.other, "ZZZZZZZZ", now) as { ok: boolean; reason?: string };
    const aOk = await inv.acceptInviteByCode(U.other, codeC, now) as { ok: boolean; tenantId?: string; reason?: string };
    const aAgain = await inv.acceptInviteByCode(U.other, codeC, now) as { ok: boolean; reason?: string };
    const memO = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.other, tenantId: tid } } });
    chk("I-5", "previewInvite: ok ชื่อร้าน + เบอร์ปิดเลขกลาง · acceptInviteByCode: เบอร์ไม่ตรง ⇒ phone_mismatch · code ผิด ⇒ not_found · ตรง ⇒ ok + Membership · ซ้ำ ⇒ accepted", pv.ok === true && !!pv.tenantName && !!pv.phoneMasked && !pv.phoneMasked.includes("5003") && aMis.reason === "phone_mismatch" && aNo.reason === "not_found" && aOk.ok === true && aOk.tenantId === tid && !!memO?.acceptedAt && aAgain.reason === "accepted", JSON.stringify({ pv, aMis, aNo, aOk, aAgain }).slice(0, 240));
    const iS = await inv.inviteStaff(OWN, { name: "สมัครใหม่", phone: PH.signup, role: "STAFF" }, new Date(now.getTime() + 180_000)) as { ok: boolean };
    const su = await pa.signupWithPhone({ phone: PH.signup, email: "qcs125-signup@example.com", name: "สมัครใหม่" }) as { ok: boolean; user?: { id: string } };
    const memS = su.ok && su.user ? await prisma.membership.findUnique({ where: { userId_tenantId: { userId: su.user.id, tenantId: tid } } }) : null;
    chk("I-6", "hook S1.19: signupWithPhone ด้วยเบอร์ที่มีคำเชิญ ⇒ Membership STAFF acceptedAt อัตโนมัติ", iS.ok === true && su.ok === true && memS?.role === "STAFF" && !!memS?.acceptedAt, JSON.stringify({ iS, su: su.ok, mem: memS?.role }));
    if (su.ok && su.user) { try { await prisma.user.delete({ where: { id: su.user.id } }); } catch { /* */ } }
    // I-7 (R-S1.25b): ผู้ใช้เดิมผูกเบอร์ที่มีคำเชิญ ⇒ ไม่ auto-join · pendingInvitesForUser เห็น 1 · acceptInvite ⇒ สมาชิก
    const iL = await inv.inviteStaff(OWN, { name: "ล็อกอินเดิม", phone: PH.login, role: "STAFF" }, new Date(now.getTime() + 240_000)) as { ok: boolean; inviteId?: string };
    const link = await pa.linkPhoneToUser(U.login, PH.login) as { ok: boolean };
    const memL0 = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.login, tenantId: tid } } });
    const pend = typeof inv.pendingInvitesForUser === "function" ? (await inv.pendingInvitesForUser(U.login)) as { inviteId: string; tenantName: string }[] : [];
    const acc = typeof inv.acceptInvite === "function" && iL.inviteId ? (await inv.acceptInvite(U.login, iL.inviteId)) as { ok: boolean } : { ok: null };
    const memL1 = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.login, tenantId: tid } } });
    chk("I-7", "ผู้ใช้เดิม linkPhoneToUser ⇒ ok · ไม่มี Membership (ไม่ auto-join) · pendingInvitesForUser = 1 มี tenantName · acceptInvite ⇒ ok + Membership STAFF acceptedAt", iL.ok === true && link.ok === true && memL0 === null && pend.length === 1 && pend[0]!.inviteId === iL.inviteId && !!pend[0]!.tenantName && acc.ok === true && memL1?.role === "STAFF" && !!memL1?.acceptedAt, JSON.stringify({ iL, link, pend: pend.length, acc, mem: memL1?.role }));
    // I-8 (R-S1.25c): invite→cancel→invite วน — rate-limit ต่อ (ร้าน,เบอร์) 5/วัน ไม่ขึ้นกับแถว
    let rlHit = false; let okCount = 0;
    for (let k = 0; k < 7; k++) {
      const r = await inv.inviteStaff(OWN, { name: "วนส่ง", phone: PH.rl, role: "STAFF" }, new Date(now.getTime() + 300_000 + k * 61_000)) as { ok: boolean; inviteId?: string; reason?: string };
      if (r.ok) { okCount++; await inv.cancelInvite(OWN, r.inviteId!); } else if (r.reason === "rate_limited") { rlHit = true; break; }
    }
    chk("I-8", "invite→cancel→invite ซ้ำ ⇒ สำเร็จ ≤5 ครั้งแล้วเจอ rate_limited (ไม่ใช่ throttled/already_invited)", rlHit && okCount <= 5 && okCount >= 1, JSON.stringify({ okCount, rlHit }));
  }

  console.log("── L: levels ──");
  if (!lv) { for (const i of [1, 2, 3, 4, 5, 6, 7]) skip(`L-${i}`, "levels", "ไม่มี levels.ts"); }
  else {
    chk("L-1", "levelOfModule: {} = OFF · read อย่างเดียว = VIEW · มี create = USE · โมดูลอื่นไม่เกี่ยว", lv.levelOfModule({}, "kanban") === "OFF" && lv.levelOfModule({ "kanban.card.read": true }, "kanban") === "VIEW" && lv.levelOfModule({ "kanban.card.read": true, "kanban.card.create": true }, "kanban") === "USE" && lv.levelOfModule({ "pos.sale.read": true }, "kanban") === "OFF", "");
    const pv = lv.permissionsForLevel("kanban", "VIEW", { "pos.sale.read": true }) as Record<string, unknown>;
    const pu = lv.permissionsForLevel("kanban", "USE", { "pos.sale.read": true }) as Record<string, unknown>;
    const po = lv.permissionsForLevel("kanban", "OFF", { "pos.sale.read": true, "kanban.card.read": true }) as Record<string, unknown>;
    const kanbanKeys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => k.startsWith("kanban."));
    chk("L-2", "permissionsForLevel: VIEW = เฉพาะคีย์อ่านของ kanban + คง pos · USE = มี create ไม่มี delete · OFF = ไม่มีคีย์ kanban คง pos", kanbanKeys(pv).length > 0 && kanbanKeys(pv).every((k) => /\.(read|view|list)$/.test(k)) && pv["pos.sale.read"] === true && pu["kanban.card.create"] === true && !("kanban.card.delete" in pu) && pu["pos.sale.read"] === true && kanbanKeys(po).length === 0 && po["pos.sale.read"] === true, JSON.stringify({ v: kanbanKeys(pv).slice(0, 4), uDel: "kanban.card.delete" in pu }));
    chk("L-3", "CHAT_LEVELS (R-S1.25a): NONE [] · VIEW read+markRead (ไม่มี send) · REPLY read+markRead+send+setStatus (ไม่มี assign)", JSON.stringify(lv.CHAT_LEVELS.NONE) === "[]" && (lv.CHAT_LEVELS.VIEW as string[]).includes("chat.conversation.read") && (lv.CHAT_LEVELS.VIEW as string[]).includes("chat.conversation.markRead") && !(lv.CHAT_LEVELS.VIEW as string[]).includes("chat.message.send") && ["chat.message.send", "chat.conversation.read", "chat.conversation.markRead", "chat.conversation.setStatus"].every((k) => (lv.CHAT_LEVELS.REPLY as string[]).includes(k)) && !(lv.CHAT_LEVELS.REPLY as string[]).includes("chat.conversation.assign"), JSON.stringify(lv.CHAT_LEVELS));
    const memStaff = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.staff, tenantId: tid } } });
    const s1 = await lv.setStaffLevels(OWN, memStaff!.id, { levels: { kanban: "USE" }, chat: "REPLY" }) as { ok: boolean };
    const after = await prisma.membership.findUnique({ where: { id: memStaff!.id } });
    const perms = (after?.permissions ?? {}) as Record<string, unknown>;
    const view = lv.staffViewOf({ role: after?.role, unitAccess: after?.unitAccess, permissions: perms }) as { levels: Record<string, string>; chat: string };
    const sForb = await lv.setStaffLevels(STF, memStaff!.id, { levels: { kanban: "OFF" } }) as { ok: boolean };
    const memMgr = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.mgr, tenantId: tid } } });
    const sRole = await lv.setStaffLevels(MGR, memStaff!.id, { role: "OWNER" }) as { ok: boolean };
    chk("L-4", "setStaffLevels OWNER: kanban USE + chat REPLY ⇒ permissions มี kanban.card.create+chat.message.send · staffViewOf levels.kanban=USE chat=REPLY · STAFF ตั้ง ⇒ ok:false · MANAGER ตั้ง role OWNER ⇒ ok:false", s1.ok === true && perms["kanban.card.create"] === true && perms["chat.message.send"] === true && view.levels.kanban === "USE" && view.chat === "REPLY" && sForb.ok === false && sRole.ok === false && !!memMgr, JSON.stringify({ s1, view, sForb, sRole }).slice(0, 200));
    // L-6 (R-S1.25e/f): กวาดทุกโมดูล — USE ไม่ให้คีย์อ่อนไหว · คีย์ตัวเลขคงอยู่ทุกระดับ
    const { PERMISSION_MODULES } = await import("@/lib/core/permissions");
    const badKeys: string[] = [];
    const MUST_NOT = ["crm.api.manage", "api.key.create", "account.payment.record", "hr.payroll.read", "member.point.adjust", "pos.sale.priceOverride", "settings.staff.write", "webhook.endpoint.create", "member.sensitive.read", "account.period.reopen", "account.wht.unmark", "account.finance.manage", "account.asset.writeoff", "account.asset.dispose", "account.cheque.clear", "account.cheque.bounce", "dorm.payment.manual", "dorm.latefee.waive", "ticket.order.markPaid", "booking.deposit.record", "booking.deposit.waive", "booking.deposit.forfeit", "school.enrollment.pay", "crm.commission.approve", "member.point.transfer", "pos.credit.manage", "booking.customer.phoneFull", "system.system.create"]; // re-check N1: รายการตายตัว ไม่พึ่ง isSensitiveKey
    for (const m of PERMISSION_MODULES as { module: string }[]) { const pu = lv.permissionsForLevel(m.module, "USE", {}) as Record<string, unknown>; for (const k of Object.keys(pu)) if (MUST_NOT.includes(k) || (typeof lv.isSensitiveKey === "function" && lv.isSensitiveKey(k))) badKeys.push(k); } for (const m of PERMISSION_MODULES as { module: string }[]) { const pv = lv.permissionsForLevel(m.module, "VIEW", {}) as Record<string, unknown>; for (const k of Object.keys(pv)) if (MUST_NOT.includes(k)) badKeys.push("VIEW:" + k); }
    const numKeep = ["OFF", "VIEW", "USE"].every((L) => { const r = lv.permissionsForLevel("crm", L, { "crm._maxReassignPerDay": 3, "crm.contact.read": true }) as Record<string, unknown>; return r["crm._maxReassignPerDay"] === 3; });
    chk("L-6", "USE ทุกโมดูลไม่มีคีย์อ่อนไหว (isSensitiveKey export · crm.api.manage/api.key/payment.record/payroll/point.adjust/priceOverride/settings.staff.write ไม่โผล่) · คีย์ตัวเลข crm._maxReassignPerDay คงอยู่ทุกระดับ", typeof lv.isSensitiveKey === "function" && badKeys.length === 0 && numKeep, JSON.stringify({ bad: badKeys.slice(0, 8), numKeep }));
    // L-7 (R-S1.25g/h): levels.chat ปฏิเสธ · levelsAvailableFor · staffViewOf ไม่มี levels.chat
    const memMgr7 = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: U.mgr, tenantId: tid } } });
    const sChat = await lv.setStaffLevels(OWN, memMgr7!.id, { levels: { chat: "USE" } }) as { ok: boolean };
    const avK = typeof lv.levelsAvailableFor === "function" ? (lv.levelsAvailableFor("kanban") as string[]) : [];
    const avS = typeof lv.levelsAvailableFor === "function" ? (lv.levelsAvailableFor("settings") as string[]) : [];
    const v7 = lv.staffViewOf({ role: "STAFF", unitAccess: ["*"], permissions: { "chat.conversation.read": true, "chat.message.send": true } }) as { levels: Record<string, string>; chat: string };
    chk("L-7", "levels.chat ⇒ ok:false · levelsAvailableFor(kanban) = OFF/VIEW/USE · settings = [OFF] · staffViewOf.levels ไม่มี chat · chat read+send (ไม่ครบ 4) ≠ REPLY", sChat.ok === false && JSON.stringify(avK) === '["OFF","VIEW","USE"]' && JSON.stringify(avS) === '["OFF"]' && !("chat" in v7.levels) && v7.chat !== "REPLY", JSON.stringify({ sChat, avK, avS, v7 }).slice(0, 200));
    const rooms = await import("@/lib/ai/secretary/rooms");
    const r = await rooms.startRoom({ tenantId: tid, actor: { kind: "member", tenantId: tid, userId: U.owner, membership: M("OWNER") } as never }, { instruction: "ห้องทดสอบเอาออก" });
    await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId: r.roomId, userId: U.staff, addedById: U.owner, seeHistory: false } });
    await prisma.staffInvite.create({ data: { tenantId: tid, phone: PH.staff, name: "ค้าง", role: "STAFF", codeHash: `pend-${Date.now()}`, expiresAt: new Date(Date.now() + DAY), invitedById: U.owner } });
    const sus = await lv.suspendStaff(OWN, memStaff!.id) as { ok: boolean };
    const afterSus = await prisma.membership.findUnique({ where: { id: memStaff!.id } });
    const res = await prisma.membership.update({ where: { id: memStaff!.id }, data: { acceptedAt: new Date() } }).then(() => true).catch(() => false);
    const rem = await lv.removeStaff(OWN, memStaff!.id) as { ok: boolean };
    const afterRem = await prisma.membership.findUnique({ where: { id: memStaff!.id } });
    chk("L-5", "suspendStaff ⇒ acceptedAt null (แถวยังอยู่) · removeStaff ⇒ acceptedAt null + AiRoomMember ของเขาในร้านหาย + คำเชิญค้างของเบอร์เขาหาย · Membership ไม่ถูกลบ", sus.ok === true && afterSus?.acceptedAt === null && res && rem.ok === true && !!afterRem && afterRem.acceptedAt === null && (await prisma.aiRoomMember.count({ where: { tenantId: tid, userId: U.staff } })) === 0 && (await prisma.staffInvite.count({ where: { tenantId: tid, phone: PH.staff, acceptedAt: null } })) === 0, JSON.stringify({ sus, rem }));
  }
} finally {
  await cleanup();
}
console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
