// QC — SECRETARY S1.11 + S1.16 · digest สด (ตัวเลขเทียบ SQL) · ข้อเสนอจากเลขา (deterministic) · งานที่สั่งบ่อย · กล่องรวมทุกกิจการกลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   G  digest: POS ยอดวันนี้/7/30 วันตรง SQL · ลูกหนี้ค้าง (AWAITING_PAYMENT/PARTIAL · overdue) · ลูกค้าเงียบ ≥30 วัน (ชื่อเท่านั้น) · ระบบไม่เปิด = null · digestBlock ไทย ≤1200 ตัว ไม่มี PII · cache 10 นาที
//   S  suggestions: deterministic จาก digest · กรองตาม access · ≤5 · frequentInstructions นับห้องของผู้ใช้
//   I  inboxForUser: 2 ร้าน · ห้องเลขา STAFF เห็นแต่ canApprove=false · MANAGER สมาชิก canApprove=true · ร้านที่ไม่ได้เป็นสมาชิกไม่เห็น · ไม่มี payload/เบอร์ใน DTO · inboxCount
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.11.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.11";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const DIGEST_FILE = join(ROOT, "src/lib/ai/secretary/digest.ts");
const STARTED = existsSync(DIGEST_FILE);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/digest.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const rooms = await import("@/lib/ai/secretary/rooms");
const dg = (await import("@/lib/ai/secretary/digest").catch(() => null)) as AnyMod | null;
const sg = (await import("@/lib/ai/secretary/suggest").catch(() => null)) as AnyMod | null;
const ib = (await import("@/lib/ai/secretary/inbox").catch(() => null)) as AnyMod | null;
const { dayKeyBangkok } = await import("@/lib/ai/rules");

const U = { owner: "qcs111-owner", mgr: "qcs111-mgr", staff: "qcs111-staff", outsider: "qcs111-out" };
const tids: string[] = [];
const cleanup = async () => {
  for (const tid of tids) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "posSale", "accountDocument", "crmContact", "businessUnit", "appSystem", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s111-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs111-" } } }); } catch { /* */ }
};
const DAY = 86_400_000;
try {
  await cleanup();
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC SEC S1.11 ${tag}`, slug: `qc-sec-s111-${tag}-${Date.now().toString(36)}` } }); tids.push(t.id); return t; };
  const M = (role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ role, unitAccess: ["*"], permissions });
  const actor = (tid: string, userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: M(role, permissions) });
  const mk = (tid: string, role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown> = {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: permissions as never, acceptedAt: new Date() } });
  const t1 = await mkTenant("a"); const tid = t1.id;
  await mk(tid, "OWNER", U.owner); await mk(tid, "MANAGER", U.mgr); await mk(tid, "STAFF", U.staff, { "ai.chat.send": true, "kanban.card.create": true, "pos.sale.read": true });
  const pos = await sys.createSystem(tid, "POS", "ขาย");
  const acc = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  const crm = await sys.createSystem(tid, "CRM", "ลูกค้า");
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "หลัก", slug: `s111-${Date.now().toString(36)}` } as never });
  const now = new Date();
  const sale = (key: string, satang: number, daysAgo: number, status = "PAID") => ({ tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: `s111-${key}`, status, subtotalSatang: satang, grandTotalSatang: satang, createdAt: new Date(now.getTime() - daysAgo * DAY), paidAt: new Date(now.getTime() - daysAgo * DAY) });
  await prisma.posSale.createMany({ data: [sale("t1", 50000, 0), sale("t2", 30000, 0), sale("w1", 20000, 3), sale("m1", 70000, 20), sale("old", 99000, 45), sale("void", 11111, 0, "VOIDED")] as never });
  const doc = (n: number, status: string, grandTotal: number, paidTotal: number, dueDays: number) => prisma.accountDocument.create({ data: { tenantId: tid, systemId: acc.id, docType: "INVOICE", status, docNo: `S111-${n}`, grandTotal, paidTotal, dueDate: new Date(now.getTime() + dueDays * DAY) } as never });
  await doc(1, "AWAITING_PAYMENT", 100000, 0, -3); await doc(2, "PARTIAL", 50000, 20000, 5); await doc(3, "PAID", 70000, 70000, -10); await doc(4, "DRAFT", 10000, 0, -1);
  const contact = (name: string, lastDays: number | null, createdDays: number) => prisma.crmContact.create({ data: { tenantId: tid, systemId: crm.id, name, phone: "0812345678", email: "pii@example.com", lastActivityAt: lastDays === null ? null : new Date(now.getTime() - lastDays * DAY), createdAt: new Date(now.getTime() - createdDays * DAY) } as never });
  await contact("เงียบ ก", 40, 60); await contact("เงียบ ข", null, 45); await contact("ใหม่ ค", null, 5); await contact("คึกคัก ง", 2, 60);

  console.log("── G: digest ──");
  if (!dg) { for (const i of [1, 2, 3, 4, 5, 6]) skip(`G-${i}`, "digest", "ไม่มี digest.ts"); }
  else {
    const d = await dg.computeDigest(tid, now);
    const todayKey = dayKeyBangkok(now);
    const sql = await prisma.posSale.findMany({ where: { tenantId: tid, systemId: pos.id, status: { in: ["PAID", "REFUNDED"] } }, select: { grandTotalSatang: true, createdAt: true } });
    const sum = (days: number) => sql.filter((s) => s.createdAt.getTime() >= now.getTime() - days * DAY).reduce((a, s) => a + s.grandTotalSatang, 0);
    const todaySql = sql.filter((s) => dayKeyBangkok(s.createdAt) === todayKey).reduce((a, s) => a + s.grandTotalSatang, 0);
    chk("G-1", "sales: วันนี้ 80,000 สตางค์ (2 บิล · ไม่นับ VOIDED) · 7 วัน = SQL · 30 วัน = SQL (ไม่รวม 45 วัน)", d.sales?.todaySatang === todaySql && d.sales?.todaySatang === 80000 && d.sales?.todayCount === 2 && d.sales?.d7Satang === sum(7) && d.sales?.d30Satang === sum(30) && d.sales?.d30Satang === 170000, JSON.stringify(d.sales));
    chk("G-2", "receivables: 2 ใบค้าง (AWAITING_PAYMENT+PARTIAL) · รวมค้าง 130,000 · overdue 1", d.receivables?.count === 2 && d.receivables?.totalSatang === 130000 && d.receivables?.overdueCount === 1, JSON.stringify(d.receivables));
    const qs = JSON.stringify(d.quietCustomers ?? null);
    chk("G-3", "quietCustomers: 2 ราย (lastActivity 40 วัน · ไม่มีกิจกรรมและสร้าง 45 วัน) · ไม่นับคนใหม่ 5 วัน/คึกคัก · sample มีชื่อ ไม่มีเบอร์/อีเมล", d.quietCustomers?.count === 2 && /เงียบ/.test(qs) && !/0812345678|pii@example/.test(qs) && !/ใหม่ ค|คึกคัก/.test(qs), qs.slice(0, 200));
    chk("G-4", "ระบบไม่เปิด = null: tomorrow (ไม่มี booking) · lowStock (ไม่มี inventory) · activeSystems มี POS/ACCOUNT/CRM · pending เป็น object", d.tomorrow === null && d.lowStock === null && JSON.stringify(d.activeSystems).includes("POS") && !!d.pending && typeof d.pending.approvalsAged === "number", JSON.stringify({ t: d.tomorrow, l: d.lowStock, a: d.activeSystems, p: d.pending }).slice(0, 200));
    const block = dg.digestBlock(d) as string;
    chk("G-5", "digestBlock ไทย · ≤1200 ตัวอักษร · มียอดขาย+ลูกหนี้+ลูกค้าเงียบ · ไม่มี PII · ไม่มีส่วน null", thai(block) && block.length <= 1200 && /ยอดขาย/.test(block) && /ค้าง|ลูกหนี้/.test(block) && /เงียบ/.test(block) && !/0812345678|pii@example/.test(block) && !/สต็อก|พรุ่งนี้/.test(block), block.slice(0, 200));
    const b1 = await dg.digestBlockFor(tid);
    await prisma.posSale.create({ data: sale("late", 500000, 0) as never });
    const b2 = await dg.digestBlockFor(tid);
    dg.__resetDigestCacheForTests?.();
    const b3 = await dg.digestBlockFor(tid);
    await prisma.posSale.deleteMany({ where: { tenantId: tid, idempotencyKey: "s111-late" } });
    dg.__resetDigestCacheForTests?.();
    chk("G-6", "cache 10 นาที: บิลใหม่ไม่เปลี่ยนบล็อกทันที · reset แล้วเปลี่ยน · ร้านไม่มีระบบ = ''", b1 === b2 && b3 !== b1 && typeof dg.__resetDigestCacheForTests === "function" && (await (async () => { const t0 = await mkTenant("empty"); return (await dg.digestBlockFor(t0.id)) === ""; })()), JSON.stringify({ same: b1 === b2, changed: b3 !== b1 }));
  }

  console.log("── S: suggestions ──");
  if (!sg) { for (const i of [1, 2, 3]) skip(`S-${i}`, "suggest", "ไม่มี suggest.ts"); }
  else {
    const so = await sg.suggestions({ tenantId: tid, actor: actor(tid, U.owner, "OWNER") }, now) as { key: string; system: string; title: string; instruction: string; priority: number }[];
    const keys = so.map((s) => s.key);
    chk("S-1", "OWNER: มี collect_overdue (account) + follow_quiet (crm) · ≤5 · ทุกข้อ title/instruction ไทย · เรียง priority", keys.includes("collect_overdue") && keys.includes("follow_quiet") && so.length <= 5 && so.every((s) => thai(s.title) && thai(s.instruction) && [1, 2, 3].includes(s.priority)) && so.every((s, i) => i === 0 || so[i - 1]!.priority <= s.priority), JSON.stringify(keys));
    const ss = await sg.suggestions({ tenantId: tid, actor: actor(tid, U.staff, "STAFF", { "ai.chat.send": true, "kanban.card.create": true, "pos.sale.read": true }) }, now) as { key: string }[];
    const sk = ss.map((s) => s.key);
    chk("S-2", "STAFF ไม่มีคีย์ account/crm ⇒ ไม่เห็น collect_overdue/follow_quiet", !sk.includes("collect_overdue") && !sk.includes("follow_quiet"), JSON.stringify(sk));
    const own = actor(tid, U.owner, "OWNER");
    for (const title of ["สรุปยอดขายวันนี้", "สรุปยอดขายวันนี้ ", "ตามหนี้ลูกค้า", "สรุป ยอดขาย วันนี้"]) await rooms.startRoom({ tenantId: tid, actor: own as never }, { instruction: title });
    const fr = await sg.frequentInstructions({ tenantId: tid, actor: own }, 5) as { instruction: string; count: number }[];
    chk("S-3", "frequentInstructions: 'สรุปยอดขายวันนี้' นับ 3 (normalize ช่องว่าง) · ไม่มีรายการ count 1", fr.length === 1 && fr[0]!.count === 3 && /สรุปยอดขายวันนี้|สรุป ยอดขาย วันนี้/.test(fr[0]!.instruction), JSON.stringify(fr).slice(0, 200));
  }

  console.log("── I: inbox ──");
  if (!ib) { for (const i of [1, 2, 3, 4]) skip(`I-${i}`, "inbox", "ไม่มี inbox.ts"); }
  else {
    const t2 = await mkTenant("b"); const tid2 = t2.id;
    await mk(tid2, "OWNER", U.outsider); await mk(tid2, "STAFF", U.staff, { "ai.chat.send": true });
    const mkProp = (tenantId: string, convId: string, summary: string) => prisma.aiProposal.create({ data: { tenantId, conversationId: convId, kind: "kanban_create_card", summary, payload: { title: summary, phone: "0899999999" } as never, risk: "NORMAL", expiresAt: new Date(Date.now() + 3_600_000) } });
    const rS = (await rooms.startRoom({ tenantId: tid, actor: actor(tid, U.staff, "STAFF", { "ai.chat.send": true }) as never }, { instruction: "ห้องของ staff" })) as { roomId: string; conversationId: string }; // ORACLE-EDIT typing
    await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId: rS.roomId, userId: U.mgr, addedById: U.staff, seeHistory: true } });
    const pRoom = await mkProp(tid, rS.conversationId, "การ์ดจากห้องเลขา โทร 0899999999");
    const legacy = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs111-${Date.now().toString(36)}`, tenantId: tid, title: "ห้องเดิม" } });
    const pLegacy = await mkProp(tid, legacy.id, "การ์ดจากห้องเดิม");
    const rB = (await rooms.startRoom({ tenantId: tid2, actor: actor(tid2, U.staff, "STAFF", { "ai.chat.send": true }) as never }, { instruction: "ห้องร้าน b" })) as { roomId: string; conversationId: string };
    const pB = await mkProp(tid2, rB.conversationId, "ข้อเสนอร้าน b");
    const expired = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: rS.conversationId, kind: "kanban_create_card", summary: "หมดอายุ", payload: {} as never, risk: "NORMAL", expiresAt: new Date(Date.now() - 1000) } });
    type Item = { tenantId: string; id: string; type: string; canApprove: boolean; summary: string; tenantName: string; why?: string };
    const iStaff = await ib.inboxForUser(U.staff) as Item[];
    const iMgr = await ib.inboxForUser(U.mgr) as Item[];
    const iOwner = await ib.inboxForUser(U.owner) as Item[];
    const iOut = await ib.inboxForUser(U.outsider) as Item[];
    const ids = (xs: Item[]) => xs.map((x) => x.id);
    chk("I-1", "staff: เห็นข้อเสนอห้องตัวเอง 2 ร้าน (a+b) canApprove=false ทั้งคู่ (R-K4) · ไม่เห็นห้องเดิมของ owner · ไม่เห็นที่หมดอายุ", ids(iStaff).includes(pRoom.id) && ids(iStaff).includes(pB.id) && !ids(iStaff).includes(pLegacy.id) && !ids(iStaff).includes(expired.id) && iStaff.every((x) => x.canApprove === false), JSON.stringify(iStaff.map((x) => [x.tenantName, x.id === pRoom.id ? "room" : x.id === pB.id ? "b" : x.id, x.canApprove])).slice(0, 200));
    chk("I-2", "mgr (สมาชิกห้อง): เห็น pRoom canApprove=true + why ไทย · ไม่เห็นร้าน b · owner เห็น pRoom+pLegacy canApprove=true", ids(iMgr).includes(pRoom.id) && iMgr.find((x) => x.id === pRoom.id)?.canApprove === true && thai(iMgr.find((x) => x.id === pRoom.id)?.why) && !ids(iMgr).includes(pB.id) && ids(iOwner).includes(pRoom.id) && ids(iOwner).includes(pLegacy.id) && iOwner.every((x) => x.canApprove === true), JSON.stringify({ mgr: ids(iMgr).length, owner: ids(iOwner).length }));
    const only2 = await ib.inboxForUser(U.staff, { tenantId: tid2 }) as Item[];
    chk("I-3", "outsider (ร้าน b เท่านั้น) ไม่เห็นของร้าน a · ตัวกรอง tenantId=b ของ staff เห็นแค่ pB · DTO ไม่มี payload/เบอร์ (summary ผ่าน mask)", iOut.every((x) => x.tenantId === tid2) && only2.length === 1 && only2[0]!.id === pB.id && !JSON.stringify([...iStaff, ...iMgr, ...iOwner]).includes("0899999999") && !("payload" in (iStaff[0] ?? {})), JSON.stringify({ out: iOut.length, only2: only2.length }));
    const c = await ib.inboxCount(U.mgr) as { total: number; canApprove: number };
    chk("I-4", "inboxCount(mgr) = { total ≥1, canApprove ≥1 } และ total ≥ canApprove", c.total >= 1 && c.canApprove >= 1 && c.total >= c.canApprove, JSON.stringify(c));
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
