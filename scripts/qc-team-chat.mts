// QC — B27 แชททีม (WhatsApp-style · มติเจ้าของ 15 พ.ย. 2026 · แบบ /root/mockups/team-invite/team2.png)
//   L  ค้นเบอร์: เจ้าของ/ผู้จัดการเท่านั้น · verified เท่านั้น · คืนชื่ออย่างเดียว · AuditLog · เพดานรายวัน (429)
//   A  เพิ่มเข้าทีม + ยอมรับ: คำเชิญ "คุยอย่างเดียว" (STAFF · {} · []) ไม่ส่ง SMS · ซ้ำ = 409 · ไม่มี Lekaa = 404 · รับแล้วเป็นสมาชิก
//   C  คุยอย่างเดียวไม่มีสิทธิ์ระบบ (evaluate ทุกโมดูล = false · เส้นระบบ 403) แต่ใช้แชททีมได้ · ⚙ ตั้งคุยอย่างเดียว (chat-only)
//   D  ห้อง 1:1: เปิดซ้ำ = ห้องเดิม · ส่ง/อ่าน · **ไม่ใช่สมาชิก = 404 ทุกเส้น** · ร้านอื่น = 404/403 (แยกร้าน)
//   R  อ่านแล้ว (1:1 + กลุ่ม readBy) · unread ในรายชื่อ · badges team.messages
//   G  กลุ่ม CRUD: สร้าง · ข้อความระบบ · เปลี่ยนชื่อ (ผู้ดูแลเท่านั้น) · เพิ่ม/เอาออก · คนใหม่ไม่เห็นประวัติก่อนเข้า · ออก = 404 · ผู้ดูแลคนสุดท้ายออก ⇒ ยกคนแทน
//   F  ไฟล์แนบ: ไฟล์ของตัวเองเท่านั้น · สมาชิกเห็นไฟล์ (visibleFile) · ไม่ใช่สมาชิก/ก่อนเข้า = ไม่เห็น · เส้นไฟล์ไม่ใช่สมาชิก = 404
//   M  ปิดเสียง: ไม่อยู่ในผู้รับ push · ไม่นับ badge
//   P  กันสแปม push (17 พ.ย.): ห้องเดียวกันถึงคนเดิมภายใน TEAM_PUSH_WINDOW_MS = ใบเดียว · ห้องอื่น/คนอื่น/พ้นหน้าต่าง = ส่ง · ส่งไม่ออก = คืนการจอง
//   S  ตัวตรวจไฟล์: จอ SMS เดิมถอดแล้ว · เส้นเดิมของแอปรุ่นเก่ายังอยู่ · migration ≥ 20261228000900 · จอกลุ่ม (สร้าง/ตั้งค่า/เมนู +) มีจริงและเรียกเส้นที่ถูก
//   (G-12 ตั้ง/ถอดแอดมินกลุ่ม · F-7 รูปกลุ่ม — เพิ่ม 17 พ.ย. ตอนต่อจอกลุ่ม team4.png)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-team-chat.mts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-team-chat";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return "";
    }
  };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u || !hostOf(u).startsWith(SEC_HOST)) {
      console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`);
      process.exit(4);
    }
  }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") {
    console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`);
    process.exit(4);
  }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv(LABEL);

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; res: "PASS" | "FAIL"; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;

const { prisma } = await import("@/lib/core/db");
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const svc = (await import("@/lib/team-chat/service")) as AnyMod;
const rbac = (await import("@/lib/core/rbac")) as AnyMod;
const perms = (await import("@/lib/core/permissions")) as AnyMod;

const mods = new Map<string, Record<string, Handler> | null>();
async function mod(p: string) {
  if (!mods.has(p)) {
    try {
      mods.set(p, (await import(`@/app/api/mobile/${p}/route`)) as unknown as Record<string, Handler>);
    } catch (e) {
      console.log(`  ⚠️ import ${p}: ${errMsg(e)}`);
      mods.set(p, null);
    }
  }
  return mods.get(p)!;
}
const bodies: string[] = [];
async function call(p: string, meth: string, h: Record<string, string>, body?: unknown, params?: Record<string, string>, qs = "") {
  const m = await mod(p);
  const fn = m?.[meth];
  if (!fn) return { status: 0, json: {} as Record<string, any>, text: "" }; // eslint-disable-line @typescript-eslint/no-explicit-any
  let url = `/api/mobile/${p}`;
  for (const [k, v] of Object.entries(params ?? {})) url = url.replace(`[${k}]`, encodeURIComponent(v));
  const req = new Request(`http://qc.local${url}${qs}`, { method: meth, headers: { "content-type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await fn(req, params ? { params: Promise.resolve(params) } : undefined);
  const text = await res.clone().text();
  bodies.push(text);
  let json: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = JSON.parse(text);
  } catch {
    /* ไม่ใช่ JSON */
  }
  return { status: res.status, json, text };
}

const P = "qcteam-";
const U = { owner: `${P}owner`, mgr: `${P}mgr`, staff: `${P}staff`, invitee: `${P}invitee`, unverified: `${P}unver`, outsider: `${P}outsider`, late: `${P}late` };
const PH = { invitee: "+66812349901", unverified: "+66812349902", nobody: "+66812349903", mgr: "+66812349904", late: "+66812349905" };
let tidA = "";
let tidB = "";
const cleanup = async () => {
  for (const tid of [tidA, tidB].filter(Boolean)) {
    for (const m of ["teamMessage", "teamThreadMember", "teamThread", "staffInvite", "membership", "auditLog", "fileAsset", "appNotification"]) {
      try {
        await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } });
      } catch {
        /* */
      }
    }
    try {
      await prisma.tenant.delete({ where: { id: tid } });
    } catch (e) {
      console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`);
    }
  }
  try {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-team-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } });
  } catch {
    /* */
  }
  await prisma.staffInvite.deleteMany({ where: { phone: { in: Object.values(PH) } } }).catch(() => undefined);
  await prisma.userPhone.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => undefined);
  await prisma.session.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => undefined);
  await (prisma as AnyMod).pushDevice.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
  await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { OR: [{ key: { contains: P } }, ...[tidA, tidB].filter(Boolean).map((t) => ({ key: { contains: t } }))] } }).catch(() => undefined);
};

try {
  await cleanup();
  const stamp = Date.now().toString(36);
  tidA = (await prisma.tenant.create({ data: { name: "QC TEAM A", slug: `qc-team-a-${stamp}` } })).id;
  tidB = (await prisma.tenant.create({ data: { name: "QC TEAM B", slug: `qc-team-b-${stamp}` } })).id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: { owner: "เจ้าของ", mgr: "ครูบอส", staff: "ครูนิว", invitee: "พี่ต้น", unverified: "ยังไม่ยืนยัน", outsider: "ร้านอื่น", late: "แม็ก" }[k] } });
  await prisma.userPhone.create({ data: { userId: U.invitee, phone: PH.invitee, verifiedAt: new Date() } });
  await prisma.userPhone.create({ data: { userId: U.unverified, phone: PH.unverified } });
  await prisma.userPhone.create({ data: { userId: U.mgr, phone: PH.mgr, verifiedAt: new Date() } });
  await prisma.userPhone.create({ data: { userId: U.late, phone: PH.late, verifiedAt: new Date() } });
  const mem = (tenantId: string, userId: string, role: string, permissions: Record<string, unknown> = {}, unitAccess: string[] = ["*"]) =>
    prisma.membership.create({ data: { tenantId, userId, role, unitAccess, permissions, acceptedAt: new Date() } as never });
  await mem(tidA, U.owner, "OWNER");
  const mgrM = await mem(tidA, U.mgr, "MANAGER");
  const staffM = await mem(tidA, U.staff, "STAFF", { "chat.conversation.read": true, "settings.staff.read": true });
  await mem(tidA, U.late, "STAFF", {}, []);
  await mem(tidB, U.outsider, "OWNER");
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token as string;
  const H = async (uid: string, tid: string | null = tidA) => ({ authorization: `Bearer ${await tok(uid)}`, ...(tid ? { "x-tenant-id": tid } : {}) });
  const HO = await H(U.owner);
  const HM = await H(U.mgr);
  const HS = await H(U.staff);
  const HL = await H(U.late);
  const HInvU = await H(U.invitee, null);
  const HX = await H(U.outsider, tidB);
  const HXA = await H(U.outsider, tidA); // คนร้าน B ส่ง x-tenant-id ร้าน A

  console.log("── L: ค้นเบอร์ ──");
  {
    const a = await call("secretary/team/lookup", "POST", HO, { phone: "081-234-9901" });
    chk("L-1", "เจ้าของค้นเบอร์ verified ⇒ 200 {found:true, name:'พี่ต้น', member:false, invited:false} · ไม่มี userId/email/phone ในผล",
      a.status === 200 && a.json.found === true && a.json.name === "พี่ต้น" && a.json.member === false && a.json.invited === false && !/userId|email|\+66|"phone"/.test(a.text), a.text.slice(0, 200));
    const b = await call("secretary/team/lookup", "POST", HO, { phone: "0812349902" });
    const c = await call("secretary/team/lookup", "POST", HO, { phone: "0812349903" });
    chk("L-2", "เบอร์ยังไม่ยืนยัน / ไม่มีในระบบ ⇒ {found:false} เหมือนกัน (ไม่บอกต่าง)", b.status === 200 && b.json.found === false && c.status === 200 && c.text === b.text, `${b.text} | ${c.text}`);
    const d = await call("secretary/team/lookup", "POST", HM, { phone: "0812349901" });
    chk("L-3", "ผู้จัดการค้นได้", d.status === 200 && d.json.found === true, d.text);
    const e = await call("secretary/team/lookup", "POST", HS, { phone: "0812349901" });
    const f = await call("secretary/team/lookup", "POST", HL, { phone: "0812349901" });
    chk("L-4", "พนักงาน / คุยอย่างเดียว ค้นเบอร์ ⇒ 403", e.status === 403 && f.status === 403, `${e.status} ${f.status}`);
    const g = await call("secretary/team/lookup", "POST", HO, { phone: "12345" });
    const g2 = await call("secretary/team/lookup", "POST", HO, { phone: "0812349901", userId: "x" });
    chk("L-5", "เบอร์ผิดรูป ⇒ 400 · คีย์แปลก (strict) ⇒ 400", g.status === 400 && g2.status === 400, `${g.status} ${g2.status}`);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tidA, action: "team.phone.lookup" } });
    chk("L-6", "ทุกการค้นจด AuditLog team.phone.lookup (ไม่มีเบอร์ดิบ · มี hash)", audits.length >= 4 && audits.every((x) => !JSON.stringify(x.after).includes("+66") && !JSON.stringify(x.after).includes("0812349")), `n=${audits.length}`);
    await (prisma as AnyMod).chatRateBucket.update({ where: { key: `team-lookup:u:${tidA}:${U.owner}` }, data: { count: svc.TEAM_LOOKUP_PER_USER_DAY } });
    const h = await call("secretary/team/lookup", "POST", HO, { phone: "0812349901" });
    chk("L-7", "เกินเพดานรายวันต่อผู้ค้น ⇒ 429 rate_limited + Retry-After", h.status === 429 && h.json.error === "rate_limited", h.text);
    await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: `team-lookup:u:${tidA}:${U.owner}` } });
    await (prisma as AnyMod).chatRateBucket.update({ where: { key: `team-lookup:t:${tidA}` }, data: { count: svc.TEAM_LOOKUP_PER_TENANT_DAY } });
    const i = await call("secretary/team/lookup", "POST", HM, { phone: "0812349901" });
    chk("L-8", "เกินเพดานรายวันต่อร้าน ⇒ 429 (คนอื่นในร้านก็ติด)", i.status === 429, i.text);
    await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: `team-lookup:t:${tidA}` } });
  }

  console.log("── A: เพิ่มเข้าทีม + ยอมรับ ──");
  let inviteeMembershipId = "";
  {
    const s = await call("secretary/team/members", "POST", HS, { phone: "0812349901" });
    chk("A-1", "พนักงานเพิ่มคน ⇒ 403", s.status === 403, s.text);
    const n = await call("secretary/team/members", "POST", HO, { phone: "0812349903" });
    const u = await call("secretary/team/members", "POST", HO, { phone: "0812349902" });
    chk("A-2", "เบอร์ไม่มี Lekaa / ยังไม่ยืนยัน ⇒ 404 not_lekaa + ข้อความ 'ให้เขาดาวน์โหลดแอปและสมัครก่อน' · ไม่สร้างคำเชิญ",
      n.status === 404 && n.json.error === "not_lekaa" && /ดาวน์โหลดแอป/.test(String(n.json.message)) && u.status === 404 && (await prisma.staffInvite.count({ where: { tenantId: tidA } })) === 0, `${n.text} ${u.text}`);
    const a = await call("secretary/team/members", "POST", HO, { phone: "081 234 9901" });
    const row = await prisma.staffInvite.findFirst({ where: { tenantId: tidA, phone: PH.invitee } });
    chk("A-3", "เจ้าของเพิ่ม ⇒ 200 role CHAT_ONLY · StaffInvite role STAFF · permissions {} · unitAccess [] · ไม่มี link/code ในผล",
      a.status === 200 && a.json.role === "CHAT_ONLY" && !!row && row.role === "STAFF" && JSON.stringify(row.permissions) === "{}" && JSON.stringify(row.unitAccess) === "[]" && !/link|code|shark\.in\.th\/i\//.test(a.text), a.text);
    const memBefore = await prisma.membership.findFirst({ where: { tenantId: tidA, userId: U.invitee } });
    chk("A-4", "ยังไม่สร้าง Membership จนกว่าจะยอมรับ", !memBefore);
    const dup = await call("secretary/team/members", "POST", HO, { phone: "0812349901" });
    const lk = await call("secretary/team/lookup", "POST", HO, { phone: "0812349901" });
    chk("A-5", "เพิ่มซ้ำ ⇒ 409 already_invited · lookup invited:true", dup.status === 409 && dup.json.error === "already_invited" && lk.json.invited === true, `${dup.text} ${lk.text}`);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: tidA, action: "team.member.invite", targetId: U.invitee } });
    chk("A-6", "จด AuditLog team.member.invite", !!audit);
    const pend = await call("secretary/invites/pending", "GET", HInvU);
    const items = (pend.json.items ?? []) as { inviteId: string; tenantName: string }[];
    chk("A-7", "ผู้ถูกเชิญเห็นคำเชิญค้าง (invites/pending) จากร้าน A", pend.status === 200 && items.some((x) => x.tenantName === "QC TEAM A"), pend.text.slice(0, 200));
    const teamBefore = await call("secretary/team", "GET", HO);
    chk("A-8", "รายชื่อทีมของเจ้าของมีแถวรอยอมรับ (pending) ชื่อ 'พี่ต้น'", teamBefore.status === 200 && (teamBefore.json.pending ?? []).some((p: AnyMod) => p.name === "พี่ต้น"), teamBefore.text.slice(0, 200));
    const acc = await call("secretary/invites/accept", "POST", HInvU, { inviteId: items[0]?.inviteId ?? "" });
    const m = await prisma.membership.findFirst({ where: { tenantId: tidA, userId: U.invitee } });
    inviteeMembershipId = m?.id ?? "";
    chk("A-9", "ยอมรับ ⇒ Membership STAFF · permissions {} · unitAccess [] · acceptedAt", acc.status === 200 && !!m && m.role === "STAFF" && JSON.stringify(m.permissions) === "{}" && JSON.stringify(m.unitAccess) === "[]" && !!m.acceptedAt, acc.text);
    const again = await call("secretary/team/members", "POST", HO, { phone: "0812349901" });
    const lk2 = await call("secretary/team/lookup", "POST", HO, { phone: "0812349901" });
    chk("A-10", "เพิ่มคนที่อยู่ในทีมแล้ว ⇒ 409 already_member · lookup member:true", again.status === 409 && again.json.error === "already_member" && lk2.json.member === true, again.text);
    const team = await call("secretary/team", "GET", HO);
    const p = (team.json.people ?? []).find((x: AnyMod) => x.userId === U.invitee);
    chk("A-11", "รายชื่อทีม: พี่ต้น ป้าย CHAT_ONLY · ไม่มี pending แล้ว · people ไม่มีอีเมล", p?.tag === "CHAT_ONLY" && !(team.json.pending ?? []).some((x: AnyMod) => x.name === "พี่ต้น") && !/@example\.com/.test(team.text), team.text.slice(0, 200));
  }

  console.log("── C: คุยอย่างเดียว = ไม่มีสิทธิ์ระบบ ──");
  const HI = await H(U.invitee);
  {
    const m = await prisma.membership.findFirst({ where: { tenantId: tidA, userId: U.invitee } });
    const ctx = { role: m!.role, unitAccess: m!.unitAccess as string[], permissions: m!.permissions as Record<string, unknown> };
    const keys: string[] = [];
    for (const md of perms.PERMISSION_MODULES as { module: string; actions?: { key: string }[] }[]) {
      for (const a of md.actions ?? []) if (rbac.evaluate(ctx, { module: md.module, action: a.key })) keys.push(a.key);
      if (rbac.evaluate(ctx, { module: md.module })) keys.push(md.module);
    }
    chk("C-1", `evaluate() ทุกโมดูล/ทุก action ของทะเบียน = false (${(perms.PERMISSION_MODULES as unknown[]).length} โมดูล)`, keys.length === 0, keys.slice(0, 8).join(","));
    const st = await call("secretary/staff", "GET", HI);
    const rooms = await call("secretary/rooms", "GET", HI);
    const inbox = await call("inbox/systems", "GET", HI);
    chk("C-2", "เส้นระบบ: secretary/staff 403 · secretary/rooms (เลขา) 403 · inbox/systems 403", st.status === 403 && rooms.status === 403 && (inbox.status === 403 || inbox.status === 0), `${st.status} ${rooms.status} ${inbox.status}`);
    const team = await call("secretary/team", "GET", HI);
    chk("C-3", "แต่ใช้แชททีมได้ (GET team 200 · canManage false)", team.status === 200 && team.json.me?.canManage === false && team.json.me?.tag === "CHAT_ONLY", team.text.slice(0, 160));
    const before = await prisma.membership.findUnique({ where: { id: staffM.id } });
    const sm = await call("secretary/team/members/[membershipId]/chat-only", "PUT", HM, {}, { membershipId: mgrM.id });
    chk("C-4", "ผู้จัดการตั้งผู้จัดการอีกคนเป็นคุยอย่างเดียว ⇒ 400 refused (lib)", sm.status === 400, sm.text);
    const ok = await call("secretary/team/members/[membershipId]/chat-only", "PUT", HM, {}, { membershipId: staffM.id });
    const after = await prisma.membership.findUnique({ where: { id: staffM.id } });
    const dto = await call("secretary/staff", "GET", HO);
    const row = (dto.json.items ?? []).find((x: AnyMod) => x.membershipId === staffM.id);
    chk("C-5", "ผู้จัดการตั้งพนักงานเป็นคุยอย่างเดียว ⇒ 200 · permissions ไม่มีคีย์ true · unitAccess [] · staff DTO chatOnly:true",
      ok.status === 200 && Object.values(before!.permissions as object).some((v) => v === true) && !Object.values(after!.permissions as object).some((v) => v === true) && JSON.stringify(after!.unitAccess) === "[]" && row?.chatOnly === true, ok.text);
    const self = await call("secretary/team/members/[membershipId]/chat-only", "PUT", HS, {}, { membershipId: staffM.id });
    chk("C-6", "คุยอย่างเดียวตั้งสิทธิ์คนอื่น/ตัวเองไม่ได้ ⇒ 400/403", self.status === 400 || self.status === 403, self.text);
    const aud = await prisma.auditLog.findFirst({ where: { tenantId: tidA, targetId: staffM.id, action: { startsWith: "membership." } } });
    chk("C-7", "เปลี่ยนเป็นคุยอย่างเดียวจด AuditLog membership.*", !!aud);
  }

  console.log("── D: ห้อง 1:1 + สมาชิกเท่านั้น ──");
  let dm = "";
  {
    const a = await call("secretary/team/direct", "POST", HO, { userId: U.invitee });
    const b = await call("secretary/team/direct", "POST", HO, { userId: U.invitee });
    const c = await call("secretary/team/direct", "POST", HI, { userId: U.owner });
    dm = String(a.json.threadId ?? "");
    chk("D-1", "เปิดห้อง 1:1 ซ้ำ/อีกฝ่ายเปิด = ห้องเดียวกัน", a.status === 200 && !!dm && b.json.threadId === dm && c.json.threadId === dm, `${a.text} ${b.text} ${c.text}`);
    const self = await call("secretary/team/direct", "POST", HO, { userId: U.owner });
    const out = await call("secretary/team/direct", "POST", HO, { userId: U.outsider });
    chk("D-2", "เปิดกับตัวเอง ⇒ 400 · กับคนร้านอื่น ⇒ 404", self.status === 400 && out.status === 404, `${self.status} ${out.status}`);
    const s = await call("secretary/team/threads/[id]/messages", "POST", HO, { body: "ส่งรูปเรือให้แล้วนะ" }, { id: dm });
    chk("D-3", "ส่งข้อความ ⇒ 200 message {mine, body}", s.status === 200 && s.json.message?.mine === true && s.json.message?.body === "ส่งรูปเรือให้แล้วนะ", s.text);
    const empty = await call("secretary/team/threads/[id]/messages", "POST", HO, { body: "   " }, { id: dm });
    chk("D-4", "ข้อความว่างไม่มีไฟล์ ⇒ 400", empty.status === 400, empty.text);
    const P2 = { id: dm };
    const nm = await Promise.all([
      call("secretary/team/threads/[id]", "GET", HS, undefined, P2),
      call("secretary/team/threads/[id]/messages", "GET", HS, undefined, P2),
      call("secretary/team/threads/[id]/messages", "POST", HS, { body: "แอบส่ง" }, P2),
      call("secretary/team/threads/[id]/read", "POST", HS, {}, P2),
      call("secretary/team/threads/[id]", "PATCH", HS, { muted: true }, P2),
      call("secretary/team/threads/[id]/files/[fileId]", "GET", HS, undefined, { id: dm, fileId: "abcdefghijklmnop1234" }),
      call("secretary/team/threads/[id]/leave", "POST", HS, {}, P2),
    ]);
    chk("D-5", "🔴 ไม่ใช่สมาชิกห้อง (คนในร้านเดียวกัน) ⇒ 404 ทุกเส้น (GET · messages GET/POST · read · PATCH · files · leave)", nm.every((r) => r.status === 404), nm.map((r) => r.status).join(","));
    const msgCount = await prisma.teamMessage.count({ where: { threadId: dm, body: "แอบส่ง" } });
    chk("D-6", "ไม่มีข้อความจากผู้ไม่ใช่สมาชิกถูกบันทึก", msgCount === 0);
    const xb = await call("secretary/team/threads/[id]", "GET", HX, undefined, P2);
    const xm = await call("secretary/team/threads/[id]/messages", "GET", HX, undefined, P2);
    const xa = await call("secretary/team/threads/[id]", "GET", HXA, undefined, P2);
    chk("D-7", "🔴 แยกร้าน: เจ้าของร้าน B (x-tenant-id B) อ่านห้องร้าน A ⇒ 404 · ส่ง x-tenant-id ร้าน A (ไม่ใช่สมาชิก) ⇒ 403 ด่าน", xb.status === 404 && xm.status === 404 && xa.status === 403, `${xb.status} ${xm.status} ${xa.status}`);
    const listB = await call("secretary/team", "GET", HX);
    chk("D-8", "รายชื่อทีมร้าน B ไม่เห็นห้อง/คนของร้าน A", listB.status === 200 && (listB.json.threads ?? []).length === 0 && !(listB.json.people ?? []).some((p: AnyMod) => p.userId !== U.outsider), listB.text.slice(0, 160));
    const noTok = await call("secretary/team", "GET", { "x-tenant-id": tidA });
    chk("D-9", "ไม่มีโทเค็น ⇒ 401", noTok.status === 401, String(noTok.status));
    const g = await call("secretary/team/threads/[id]", "GET", HI, undefined, P2);
    chk("D-10", "หัวห้องของพี่ต้น: kind DIRECT · name = เจ้าของ · peer.tag OWNER · membershipId ของอีกฝ่าย", g.status === 200 && g.json.thread?.kind === "DIRECT" && g.json.thread?.name === "เจ้าของ" && g.json.thread?.peer?.tag === "OWNER" && !!g.json.thread?.peer?.membershipId, g.text.slice(0, 200));
    const dupId = "cmid-qcteam-001";
    const d1 = await call("secretary/team/threads/[id]/messages", "POST", HI, { body: "ขอบคุณครับพี่ 🙏", clientMessageId: dupId }, P2);
    const d2 = await call("secretary/team/threads/[id]/messages", "POST", HI, { body: "ขอบคุณครับพี่ 🙏", clientMessageId: dupId }, P2);
    chk("D-11", "clientMessageId ซ้ำ ⇒ คืนข้อความเดิม (ไม่บันทึกซ้ำ)", d1.status === 200 && d2.status === 200 && d2.json.duplicate === true && d2.json.messageId === d1.json.message?.id && (await prisma.teamMessage.count({ where: { threadId: dm, body: "ขอบคุณครับพี่ 🙏" } })) === 1, d2.text);
    const del = await call("secretary/team/threads/[id]/messages/[messageId]", "DELETE", HO, undefined, { id: dm, messageId: String(d1.json.message?.id) });
    chk("D-12", "ลบข้อความของคนอื่น ⇒ 404", del.status === 404, del.text);
  }

  console.log("── R: อ่านแล้ว + unread + badges ──");
  {
    await call("secretary/team/threads/[id]/read", "POST", HO, {}, { id: dm });
    const s = await call("secretary/team/threads/[id]/messages", "POST", HO, { body: "พรุ่งนี้ลูกค้า 3 คนนะครับ" }, { id: dm });
    const mid = String(s.json.message?.id);
    const o1 = await call("secretary/team/threads/[id]/messages", "GET", HO, undefined, { id: dm });
    const mine1 = (o1.json.items ?? []).find((x: AnyMod) => x.id === mid);
    chk("R-1", "ก่อนอีกฝ่ายเปิด: ข้อความของเรา read:false", mine1?.read === false && mine1?.readBy === 0, JSON.stringify(mine1));
    const l1 = await call("secretary/team", "GET", HI);
    const row1 = (l1.json.threads ?? []).find((x: AnyMod) => x.id === dm);
    const b1 = await call("secretary/badges", "GET", HI);
    chk("R-2", "ฝั่งพี่ต้น: แถวห้อง unread ≥ 1 · last = ข้อความล่าสุด (ไม่ใช่ของเรา) · badges team.messages ≥ 1 และรวมใน total",
      (row1?.unread ?? 0) >= 1 && row1?.last?.body === "พรุ่งนี้ลูกค้า 3 คนนะครับ" && row1?.last?.mine === false && (b1.json.team?.messages ?? 0) >= 1 && b1.json.total >= b1.json.team.messages, `${JSON.stringify(row1?.last)} ${b1.text}`);
    const total = await svc.teamUnreadTotal(tidA, U.invitee);
    chk("R-3", "teamUnreadTotal = unread ในรายชื่อ", total === row1?.unread, `${total} vs ${row1?.unread}`);
    const notif = (await import("@/lib/ai/secretary/notify")) as AnyMod;
    const bt = await notif.badgeTotalFor(U.invitee, tidA);
    chk("R-4", "badgeTotalFor (ตัวเลขไอคอนแอป) รวมข้อความทีม", bt >= total && total > 0, `${bt} ${total}`);
    const rd = await call("secretary/team/threads/[id]/read", "POST", HI, {}, { id: dm });
    const o2 = await call("secretary/team/threads/[id]/messages", "GET", HO, undefined, { id: dm });
    const mine2 = (o2.json.items ?? []).find((x: AnyMod) => x.id === mid);
    const l2 = await call("secretary/team", "GET", HI);
    const b2 = await call("secretary/badges", "GET", HI);
    chk("R-5", "หลังพี่ต้นอ่าน: read:true (อ่านแล้ว) · reads มีเวลาของพี่ต้น · unread 0 · badges team.messages 0",
      rd.status === 200 && mine2?.read === true && (o2.json.reads ?? []).some((r: AnyMod) => r.userId === U.invitee && r.lastReadAt) && ((l2.json.threads ?? []).find((x: AnyMod) => x.id === dm)?.unread ?? -1) === 0 && b2.json.team?.messages === 0, JSON.stringify(mine2));
    const last = (o2.json.items ?? []).at(-1);
    const aft = await call("secretary/team/threads/[id]/messages", "GET", HO, undefined, { id: dm }, `?after=${encodeURIComponent(`${last.at}|${last.id}`)}`);
    chk("R-6", "poll after=<ล่าสุด> ⇒ items [] แต่ยังมี reads", aft.status === 200 && (aft.json.items ?? []).length === 0 && Array.isArray(aft.json.reads), aft.text.slice(0, 120));
    const bad = await call("secretary/team/threads/[id]/messages", "GET", HO, undefined, { id: dm }, "?after=xx");
    chk("R-7", "cursor เพี้ยน ⇒ 400", bad.status === 400, bad.text);
    const lo = await call("secretary/team", "GET", HO);
    const rowO = (lo.json.threads ?? []).find((x: AnyMod) => x.id === dm);
    chk("R-8", "ฝั่งเจ้าของ: last.mine true (แอปแสดง 'คุณ: …') · peer.tag CHAT_ONLY", rowO?.last?.mine === true && rowO?.peer?.tag === "CHAT_ONLY", JSON.stringify(rowO).slice(0, 200));
  }

  console.log("── G: กลุ่ม ──");
  let gid = "";
  {
    const bad = await call("secretary/team/threads", "POST", HO, { name: "ทีมครูสอนดำน้ำ", userIds: [U.invitee, U.outsider] });
    chk("G-1", "สร้างกลุ่มที่มีคนนอกร้าน ⇒ 400 (ไม่สร้าง)", bad.status === 400 && (await prisma.teamThread.count({ where: { tenantId: tidA, kind: "GROUP" } })) === 0, bad.text);
    const a = await call("secretary/team/threads", "POST", HI, { name: "ทีมครูสอนดำน้ำ", userIds: [U.owner, U.staff] });
    gid = String(a.json.threadId ?? "");
    const d = await call("secretary/team/threads/[id]", "GET", HI, undefined, { id: gid });
    chk("G-2", "สมาชิกคุยอย่างเดียวสร้างกลุ่มได้ · ผู้สร้าง = ADMIN · 3 คน · มีข้อความระบบ 'สร้างกลุ่ม'", a.status === 200 && d.json.thread?.myRole === "ADMIN" && d.json.thread?.members?.length === 3 && (await prisma.teamMessage.count({ where: { threadId: gid, kind: "SYSTEM" } })) === 1, d.text.slice(0, 200));
    const s1 = await call("secretary/team/threads/[id]/messages", "POST", HS, { body: "พรุ่งนี้เจอกัน 7 โมงที่ท่าเรือนะครับ" }, { id: gid });
    await call("secretary/team/threads/[id]/messages", "POST", HO, { body: "รับทราบ เตรียมถังให้ 12 ใบ" }, { id: gid });
    chk("G-3", "สมาชิกส่งในกลุ่มได้", s1.status === 200, s1.text);
    const rn = await call("secretary/team/threads/[id]", "PATCH", HS, { name: "เปลี่ยนชื่อ" }, { id: gid });
    chk("G-4", "ไม่ใช่ผู้ดูแลเปลี่ยนชื่อ ⇒ 403", rn.status === 403, rn.text);
    const rn2 = await call("secretary/team/threads/[id]", "PATCH", HI, { name: "ทีมครูสอนดำน้ำ 2" }, { id: gid });
    chk("G-5", "ผู้ดูแลเปลี่ยนชื่อ ⇒ 200 + ข้อความระบบ", rn2.status === 200 && rn2.json.thread?.name === "ทีมครูสอนดำน้ำ 2", rn2.text.slice(0, 160));
    const addNo = await call("secretary/team/threads/[id]/members", "POST", HS, { userIds: [U.mgr] }, { id: gid });
    const add = await call("secretary/team/threads/[id]/members", "POST", HI, { userIds: [U.mgr] }, { id: gid });
    const mgrView = await call("secretary/team/threads/[id]/messages", "GET", HM, undefined, { id: gid });
    const bodies2 = (mgrView.json.items ?? []).map((x: AnyMod) => x.body);
    chk("G-6", "เพิ่มสมาชิก: ไม่ใช่ผู้ดูแล 403 · ผู้ดูแล 200 · คนใหม่ไม่เห็นข้อความก่อนเข้า", addNo.status === 403 && add.status === 200 && add.json.added === 1 && !bodies2.includes("พรุ่งนี้เจอกัน 7 โมงที่ท่าเรือนะครับ"), JSON.stringify(bodies2));
    // อ่านแล้ว N ของกลุ่ม
    const m3 = await call("secretary/team/threads/[id]/messages", "POST", HI, { body: "โอเค ขอบคุณทุกคน 🙏" }, { id: gid });
    await call("secretary/team/threads/[id]/read", "POST", HO, {}, { id: gid });
    await call("secretary/team/threads/[id]/read", "POST", HM, {}, { id: gid });
    const v = await call("secretary/team/threads/[id]/messages", "GET", HI, undefined, { id: gid });
    const mine = (v.json.items ?? []).find((x: AnyMod) => x.id === m3.json.message?.id);
    chk("G-7", "กลุ่ม: readBy = 2 (เจ้าของ + ผู้จัดการ) · read false (ยังไม่ครบ 3)", mine?.readBy === 2 && mine?.read === false, JSON.stringify(mine));
    const lv = await call("secretary/team", "GET", HS);
    const grow = (lv.json.threads ?? []).find((x: AnyMod) => x.id === gid);
    chk("G-8", "รายชื่อ: แถวกลุ่ม kind GROUP · memberCount 4 · last.senderName = พี่ต้น", grow?.kind === "GROUP" && grow?.memberCount === 4 && grow?.last?.senderName === "พี่ต้น", JSON.stringify(grow).slice(0, 220));
    const rmNo = await call("secretary/team/threads/[id]/members/[userId]", "DELETE", HS, undefined, { id: gid, userId: U.mgr });
    const rm = await call("secretary/team/threads/[id]/members/[userId]", "DELETE", HI, undefined, { id: gid, userId: U.mgr });
    const gone = await call("secretary/team/threads/[id]/messages", "GET", HM, undefined, { id: gid });
    chk("G-9", "เอาออก: ไม่ใช่ผู้ดูแล 403 · ผู้ดูแล 200 · คนที่ถูกเอาออกอ่าน ⇒ 404", rmNo.status === 403 && rm.status === 200 && gone.status === 404, `${rmNo.status} ${rm.status} ${gone.status}`);
    const lvI = await call("secretary/team/threads/[id]/leave", "POST", HI, {}, { id: gid });
    const after = await prisma.teamThreadMember.findMany({ where: { threadId: gid, leftAt: null } });
    const lvG = await call("secretary/team/threads/[id]", "GET", HI, undefined, { id: gid });
    chk("G-10", "ผู้ดูแลคนสุดท้ายออก ⇒ คนที่อยู่นานสุดเป็นผู้ดูแลแทน · คนที่ออกอ่าน ⇒ 404", lvI.status === 200 && after.some((x) => x.role === "ADMIN") && lvG.status === 404, after.map((x) => `${x.userId}:${x.role}`).join(","));
    const dmLeave = await call("secretary/team/threads/[id]/leave", "POST", HO, {}, { id: dm });
    chk("G-11", "ออกจากห้อง 1:1 ไม่ได้ ⇒ 400", dmLeave.status === 400, dmLeave.text);
    // G-12 ตั้ง/ถอดแอดมินกลุ่ม (⋯ ของจอตั้งค่ากลุ่ม) — เหลือ เจ้าของ + ครูนิว
    const left = await prisma.teamThreadMember.findMany({ where: { threadId: gid, leftAt: null }, orderBy: { joinedAt: "asc" } });
    const hdr: Record<string, Record<string, string>> = { [U.owner]: HO, [U.staff]: HS };
    const adm = left.find((x) => x.role === "ADMIN");
    const oth = left.find((x) => x.role !== "ADMIN");
    if (adm && oth && hdr[adm.userId] && hdr[oth.userId]) {
      const no = await call("secretary/team/threads/[id]/members/[userId]", "PUT", hdr[oth.userId]!, { admin: true }, { id: gid, userId: oth.userId });
      const yes = await call("secretary/team/threads/[id]/members/[userId]", "PUT", hdr[adm.userId]!, { admin: true }, { id: gid, userId: oth.userId });
      const promoted = await prisma.teamThreadMember.findFirst({ where: { threadId: gid, userId: oth.userId } });
      const down = await call("secretary/team/threads/[id]/members/[userId]", "PUT", hdr[adm.userId]!, { admin: false }, { id: gid, userId: adm.userId });
      const admins = await prisma.teamThreadMember.count({ where: { threadId: gid, leftAt: null, role: "ADMIN" } });
      const view = await call("secretary/team/threads/[id]", "GET", hdr[oth.userId]!, undefined, { id: gid });
      chk("G-12", "แอดมินกลุ่ม: ไม่ใช่ผู้ดูแลตั้ง ⇒ 403 · ผู้ดูแลตั้งคนอื่น ⇒ 200 (ADMIN) · ถอดตัวเองได้ เหลือผู้ดูแล ≥ 1 · หัวห้อง myRole ADMIN",
        no.status === 403 && yes.status === 200 && promoted?.role === "ADMIN" && down.status === 200 && admins >= 1 && view.json.thread?.myRole === "ADMIN", `${no.status} ${yes.status} ${promoted?.role} ${down.status} ${admins}`);
      const strict = await call("secretary/team/threads/[id]/members/[userId]", "PUT", hdr[oth.userId]!, { admin: true, x: 1 }, { id: gid, userId: adm.userId });
      chk("G-13", "PUT แอดมิน คีย์แปลก ⇒ 400 (strict)", strict.status === 400, strict.text);
    } else chk("G-12", "แอดมินกลุ่ม (fixture)", false, left.map((x) => `${x.userId}:${x.role}`).join(","));
  }

  console.log("── F: ไฟล์แนบ ──");
  {
    const mk = async (uid: string) => {
      const id = `qcteamf${Math.random().toString(36).slice(2, 14)}`.slice(0, 24);
      await prisma.fileAsset.create({ data: { id, tenantId: tidA, kind: "ATTACHMENT", path: `t/${tidA}/private/${id}abcdefgh.jpg`, cdnUrl: `private:${id}`, contentType: "image/jpeg", bytes: 1234 } as never });
      await svc.rememberUpload({ tenantId: tidA, userId: uid }, id);
      return id;
    };
    const fOwner = await mk(U.owner);
    const fStaff = await mk(U.staff);
    const s = await call("secretary/team/threads/[id]/messages", "POST", HO, { attachments: [{ id: fOwner, name: "boat.jpg" }] }, { id: dm });
    chk("F-1", "ส่งรูปของตัวเอง (ไม่มีข้อความ) ⇒ 200 · attachments[0] kind image · url = เส้นไฟล์ของห้อง", s.status === 200 && s.json.message?.attachments?.[0]?.kind === "image" && String(s.json.message?.attachments?.[0]?.url).includes(`/team/threads/${dm}/files/${fOwner}`), s.text.slice(0, 200));
    const steal = await call("secretary/team/threads/[id]/messages", "POST", HO, { attachments: [{ id: fStaff, name: "x.jpg" }] }, { id: dm });
    chk("F-2", "แนบไฟล์ที่คนอื่นอัป ⇒ 400 (ไม่บันทึก)", steal.status === 400, steal.text);
    const see = await svc.visibleFile({ tenantId: tidA, userId: U.invitee }, dm, fOwner);
    const notSee = await svc.visibleFile({ tenantId: tidA, userId: U.staff }, dm, fOwner);
    const other = await svc.visibleFile({ tenantId: tidB, userId: U.outsider }, dm, fOwner);
    chk("F-3", "visibleFile: สมาชิกเห็น · ไม่ใช่สมาชิก/ร้านอื่น null", !!see && see.fileId === fOwner && notSee === null && other === null);
    const r404 = await call("secretary/team/threads/[id]/files/[fileId]", "GET", HS, undefined, { id: dm, fileId: fOwner });
    chk("F-4", "เส้นไฟล์: ไม่ใช่สมาชิก ⇒ 404 + no-store", r404.status === 404, String(r404.status));
    const rMem = await call("secretary/team/threads/[id]/files/[fileId]", "GET", HI, undefined, { id: dm, fileId: fOwner });
    chk("F-5", "เส้นไฟล์: สมาชิกผ่านด่านสิทธิ์ (200 หรือ 404/503 จากที่เก็บ QC ที่ไม่มีไบต์จริง — ไม่ใช่ 403)", [200, 404, 503].includes(rMem.status), String(rMem.status), "MINOR");
    const up = await call("secretary/team/attachments", "POST", HL, undefined);
    chk("F-6", "เส้นอัปของทีม: สมาชิกคุยอย่างเดียวผ่านด่าน (ไม่ใช่ 403 · ไม่มีไฟล์ = 411/400)", up.status === 411 || up.status === 400, String(up.status));
    // F-7 รูปกลุ่ม (จอสร้างกลุ่ม 📷 · ตั้งค่ากลุ่ม) — รูปของตัวเองเท่านั้น · สมาชิกเห็นผ่าน visibleFile · แถวรายชื่อมี photoFileId
    const fPhoto = await mk(U.owner);
    const fOther = await mk(U.staff);
    const badG = await call("secretary/team/threads", "POST", HO, { name: "กลุ่มรูปคนอื่น", userIds: [U.invitee], photoFileId: fOther });
    const g2 = await call("secretary/team/threads", "POST", HO, { name: "กลุ่มมีรูป", userIds: [U.invitee], photoFileId: fPhoto });
    const g2id = String(g2.json.threadId ?? "");
    const ph = await svc.visibleFile({ tenantId: tidA, userId: U.invitee }, g2id, fPhoto);
    const lst = await call("secretary/team", "GET", HI);
    const row = (lst.json.threads ?? []).find((x: AnyMod) => x.id === g2id);
    const fPhoto2 = await mk(U.owner);
    const patchNo = await call("secretary/team/threads/[id]", "PATCH", HI, { photoFileId: fPhoto2 }, { id: g2id });
    const patchOk = await call("secretary/team/threads/[id]", "PATCH", HO, { photoFileId: fPhoto2 }, { id: g2id });
    chk("F-7", "รูปกลุ่ม: รูปคนอื่น ⇒ 400 · รูปตัวเอง ⇒ 200 · สมาชิกเห็นรูป · แถวรายชื่อ photoFileId · ไม่ใช่ผู้ดูแลเปลี่ยนรูป 403 · ผู้ดูแลเปลี่ยนได้",
      badG.status === 400 && g2.status === 200 && ph?.kind === "image" && row?.photoFileId === fPhoto && row?.hasPhoto === true && patchNo.status === 403 && patchOk.status === 200 && patchOk.json.thread?.photoFileId === fPhoto2,
      `${badG.status} ${g2.status} ${ph?.kind} ${row?.photoFileId} ${patchNo.status} ${patchOk.status}`);
  }

  console.log("── M: ปิดเสียง ──");
  {
    const mu = await call("secretary/team/threads/[id]", "PATCH", HI, { muted: true }, { id: dm });
    const s = await svc.sendMessage({ tenantId: tidA, userId: U.owner }, dm, { body: "ทดสอบปิดเสียง" });
    chk("M-1", "ห้องที่ปิดเสียง ⇒ ไม่อยู่ในผู้รับ push (recipients)", mu.status === 200 && mu.json.thread?.muted === true && s.ok && !s.recipients.includes(U.invitee), JSON.stringify(s.recipients));
    const tot = await svc.teamUnreadTotal(tidA, U.invitee);
    const b = await call("secretary/badges", "GET", HI);
    chk("M-2", "ห้องที่ปิดเสียงไม่นับ badge ทีม", tot === 0 && b.json.team?.messages === 0, `${tot} ${b.text}`);
    await call("secretary/team/threads/[id]", "PATCH", HI, { muted: false }, { id: dm });
    const s2 = await svc.sendMessage({ tenantId: tidA, userId: U.owner }, dm, { body: "เปิดเสียงแล้ว" });
    chk("M-3", "เปิดเสียงคืน ⇒ อยู่ในผู้รับอีกครั้ง · ผู้ส่งไม่อยู่ในผู้รับ", s2.ok && s2.recipients.includes(U.invitee) && !s2.recipients.includes(U.owner));
    const nt = (await import("@/lib/team-chat/notify")) as AnyMod;
    chk("M-4", "ข้อความ push: ไฟล์อย่างเดียว = '📷 รูปภาพ' · ตัดยาว", nt.teamPreview("", [{ fileId: "a", name: "a.jpg", mimeType: "image/jpeg", size: 1, kind: "image" }]) === "📷 รูปภาพ" && nt.teamPreview("x".repeat(500), []).length <= 120);
  }

  console.log("── P: กันสแปม push ──");
  {
    const nt = (await import("@/lib/team-chat/notify")) as AnyMod;
    nt.resetTeamPushGuard();
    await (prisma as AnyMod).pushDevice.create({ data: { userId: U.staff, tenantId: tidA, expoToken: `ExponentPushToken[${P}staff]`, platform: "ios" } });
    await (prisma as AnyMod).pushDevice.create({ data: { userId: U.invitee, tenantId: tidA, expoToken: `ExponentPushToken[${P}invitee]`, platform: "ios" } });
    let posted: unknown[] = [];
    let fail = false;
    const post = async (payloads: unknown[]) => {
      if (fail) throw new Error("expo down");
      posted.push(...payloads);
      return payloads.map(() => ({ status: "ok", id: "x" }));
    };
    const base = { tenantId: tidA, kind: "GROUP", groupName: "ทีมทดสอบ", senderName: "เจ้าของ", attachments: [], recipients: [U.staff, U.invitee] };
    const t0 = new Date("2026-11-17T03:00:00Z");
    const at = (ms: number) => new Date(t0.getTime() + ms);
    const a = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-1", body: "1" }, { post, now: t0 });
    const b = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-1", body: "2" }, { post, now: at(5_000) });
    chk("P-1", "ห้องเดียวกัน 2 ข้อความติดกัน ⇒ ใบแรกถึง 2 คน · ใบที่สองในหน้าต่าง = ไม่ส่ง", a === 2 && b === 0 && posted.length === 2, `${a} ${b} ${posted.length}`);
    const c2 = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-2", body: "3" }, { post, now: at(6_000) });
    chk("P-2", "ห้องอื่นในหน้าต่างเดียวกัน ⇒ ส่งปกติ (กันต่อห้องต่อคน)", c2 === 2, String(c2));
    const d = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-1", body: "4" }, { post, now: at(nt.TEAM_PUSH_WINDOW_MS + 1) });
    chk("P-3", "พ้นหน้าต่าง ⇒ ส่งอีกครั้ง", d === 2, String(d));
    posted = [];
    fail = true;
    const e = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-3", body: "5" }, { post, now: at(100_000) });
    fail = false;
    const f = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-3", body: "6" }, { post, now: at(101_000) });
    chk("P-4", "ส่งไม่ออก (Expo ล่ม) ⇒ คืนการจอง · ข้อความถัดไปในหน้าต่างเดิมยังส่งได้", e === 0 && f === 2, `${e} ${f}`);
    const g = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-4", body: "7", recipients: [U.staff] }, { post, now: at(200_000) });
    const h = await nt.notifyTeamMessage({ ...base, threadId: "qc-th-4", body: "8", recipients: [U.staff, U.invitee] }, { post, now: at(201_000) });
    chk("P-5", "กันต่อผู้รับ: คนที่ยังไม่ได้ใบของห้องนี้ ⇒ ได้ใบแรกของตัวเอง", g === 1 && h === 1, `${g} ${h}`);
    nt.resetTeamPushGuard();
  }

  console.log("── S: ตัวตรวจไฟล์ ──");
  {
    const app = join(ROOT, "apps/mobile/app/(app)/secretary");
    chk("S-1", "จอเชิญ SMS เดิม (staff/invite.tsx) ถอดแล้ว · จอเพิ่มคน team/add.tsx + ห้อง team/[id] มีจริง", !existsSync(join(app, "staff/invite.tsx")) && existsSync(join(app, "team/add.tsx")) && existsSync(join(app, "team/[id]/index.tsx")));
    const appSrc = [join(app, "staff/index.tsx"), join(app, "team/add.tsx")].map((f) => readFileSync(f, "utf8")).join("\n");
    chk("S-2", "จอทีมไม่เรียก staff/invite (SMS) แล้ว", !/staff\/invite["']/.test(appSrc) && !/inv\.submit/.test(appSrc));
    chk("S-3", "เส้นเดิมของแอปรุ่นเก่ายังอยู่ (staff/invite · invites/accept · invites/pending)", ["staff/invite", "invites/accept", "invites/pending"].every((p) => existsSync(join(ROOT, `src/app/api/mobile/secretary/${p}/route.ts`))));
    const mig = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => d.endsWith("_team_chat"));
    chk("S-4", "migration team_chat มีเลข ≥ 20261228000900 · additive (ไม่มี DROP/ALTER COLUMN)", mig.length === 1 && mig[0]! >= "20261228000900" && !/DROP |ALTER COLUMN/i.test(readFileSync(join(ROOT, "prisma/migrations", mig[0]!, "migration.sql"), "utf8")), mig.join(","));
    const scope = readFileSync(join(ROOT, "src/lib/core/scope.ts"), "utf8");
    chk("S-5", "scope.ts ลงทะเบียน 3 ตาราง (tenant)", /TeamThread: tenant/.test(scope) && /TeamThreadMember: tenant/.test(scope) && /TeamMessage: tenant/.test(scope));
    const rd = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
    const list = rd(join(app, "staff/index.tsx"));
    const ng = rd(join(app, "team/new-group.tsx"));
    const gs = rd(join(app, "team/[id]/settings.tsx"));
    const room = rd(join(app, "team/[id]/index.tsx"));
    const api = rd(join(ROOT, "apps/mobile/src/api/team.ts"));
    chk("S-6", "เมนู + (team4 จอ 2): 2 ทาง team-menu-add → /secretary/team/add · team-menu-group → /secretary/team/new-group · ไม่ใช่ผู้จัดการ = ไปสร้างกลุ่มตรง",
      /team-menu-add/.test(list) && /team-menu-group/.test(list) && /\/secretary\/team\/new-group/.test(list) && /if \(!manage\)[\s\S]{0,80}new-group/.test(list), "", "MAJOR");
    chk("S-7", "จอสร้างกลุ่ม (จอ 3): createGroup · คำเชิญค้างจาง (dim) เลือกไม่ได้ · ตัวนับ team.group.picked", /createGroup\(/.test(ng) && /pending[\s\S]{0,400}dim/.test(ng) && /team\.group\.picked/.test(ng), "", "MAJOR");
    chk("S-8", "จอตั้งค่ากลุ่ม (จอ 5): แก้ชื่อ/รูป · เพิ่ม/เอาออก/แอดมิน · ปิดเสียง · ออกจากกลุ่มมีแผ่นยืนยัน", ["patchThread", "addGroupMembers", "removeGroupMember", "setGroupAdmin", "leaveGroup", "team-gs-leave-sheet", "team-gs-mute"].every((k) => gs.includes(k)), "", "MAJOR");
    chk("S-9", "ห้องกลุ่ม (จอ 4): ⚙ → /settings · บรรทัดรอง memberSummaryOf · ปุ่ม Lekaa แถวเดียวกับช่องพิมพ์ (<LekaaFabSlot/> + TEAM_COMPOSER · รวมเลน b27-fab 17 พ.ย.)", /\/settings`/.test(room) && /memberSummaryOf/.test(room) && /<LekaaFabSlot /.test(room) && /TEAM_COMPOSER/.test(room), "", "MAJOR");
    const sum = api.match(/export function memberSummaryOf[\s\S]*?\n}\n/)?.[0] ?? "";
    chk("S-10", "เส้นกลุ่มของแอปตรงเส้นเซิร์ฟเวอร์ (threads · members · leave)", /\$\{B\}\/threads`/.test(api) && /\/members\/\$\{enc\(userId\)\}/.test(api) && /\/leave`/.test(api) && sum.length > 0, "", "MAJOR");
  }

  console.log("── X: ความลับ ──");
  {
    const LEAK = /"phone":"\+66|\+6681234990|codeHash|"token":"|@example\.com|secret(?!ary)/i; // "secretary" ในเส้นไฟล์ (/api/mobile/secretary/team/…) ≠ ความลับ
    const leak = bodies.filter((b) => LEAK.test(b));
    chk("X-1", "ทุกคำตอบไม่มีเบอร์เต็ม · อีเมล · codeHash · token", leak.length === 0, leak.map((b) => `${b.match(LEAK)?.[0]} @ ${b.slice(Math.max(0, (b.match(LEAK)?.index ?? 0) - 80), (b.match(LEAK)?.index ?? 0) + 40)}`).join(" | ").slice(0, 400));
  }
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`);
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  await cleanup();
}

const passed = cks.filter((c) => c.res === "PASS").length;
const failed = cks.filter((c) => c.res === "FAIL");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev, why: c.why })) }));
await prisma.$disconnect().catch(() => undefined);
process.exit(failed.length ? 1 : 0);
