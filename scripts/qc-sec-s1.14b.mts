// QC — SECRETARY S1.14b · ตั๋ว server รวม (invites/pending · invite levels/chat+sensitive · DTO ห้องลูกค้า phoneMasked/tags/replyWindow/can · ai-suggest Bearer · task-from-chat · /me appleLinked · shift GET)
// สัญญา: ledger/secretary-briefs/sec-brief-S1.14b.md · RESOLUTIONS §T §U §V (ตั๋ว · W-12) · §N(147)
//
// กลุ่มข้อ:
//   R  เส้นทางใหม่ (invites/pending GET · ai-suggest POST · task POST · shift GET)
//   I  invites/pending (verified ⇒ ใบของเบอร์ · ไม่ verified ⇒ [])
//   V  invite รับ levels/chat → permissions · sensitive_key 422 · bad_module/bad_level 422 · SENSITIVE_KEYS W-12
//   C  DTO ห้องลูกค้า: phoneMasked · tags · replyWindowEndsAt · can{} · list tags
//   S  ai-suggest: ปิด ⇒ ok:false · เปิด+mock ⇒ options · reply+suggestionId ⇒ outcome · STAFF ไม่มีคีย์ ⇒ 403
//   T  task: not_configured 404 · configured ⇒ card
//   M  /me appleLinked · H shift GET · X ไม่มีเบอร์เต็ม/ความลับใน DTO · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.14b.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.14b";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const SEC_DIR = join(ROOT, "src/app/api/mobile/secretary");
const STARTED = existsSync(SEC_DIR);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/app/api/mobile/secretary/ (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-s1.14b"); // route ของ inbox import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
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
// (helpers ด้านล่างใช้ existsSync/readFileSync จาก import ด้านบน)
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };


const ROUTES: [string, string[]][] = [
  ["secretary/invites/pending", ["GET"]], ["secretary/staff/invite", ["POST"]],
  ["inbox/conversations/[id]", ["GET"]], ["inbox/conversations", ["GET"]], ["inbox/conversations/[id]/reply", ["POST"]],
  ["inbox/conversations/[id]/ai-suggest", ["POST"]], ["inbox/conversations/[id]/task", ["POST"]], ["inbox/shift", ["GET", "POST"]], ["me", ["GET"]],
];
console.log("── R: เส้นทาง ──");
const missing: string[] = [];
const mods: Record<string, Record<string, Handler> | null> = {};
for (const [p, methods] of ROUTES) {
  const m = await route(`@/app/api/mobile/${p}/route`);
  mods[p] = m;
  for (const meth of methods) if (!m || typeof m[meth] !== "function") missing.push(`${meth} ${p}`);
}
chk("R-1", `มีเส้นทางครบ ${ROUTES.length} path (ใหม่: invites/pending · ai-suggest · task · shift GET)`, missing.length === 0, missing.slice(0, 12).join(" · "));
{
  const f = join(ROOT, "src/app/api/mobile/inbox/conversations/[id]/route.ts");
  const s = existsSync(f) ? readFileSync(f, "utf8") : "";
  chk("R-2", "route ห้องลูกค้า: ส่ง phoneMasked · ไม่ส่ง member.phone เต็ม", /phoneMasked/.test(s) && !/phone:\s*member\.phone/.test(s), "grep route.ts");
}

const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const levels = (await import("@/lib/staff/levels")) as AnyMod;
const U = { owner: "qcs114b-owner", staff: "qcs114b-staff", nophone: "qcs114b-nophone", apple: "qcs114b-apple", invitee: "qcs114b-invitee" };
const PH = { invitee: "+66812345614", staff: "+66812345615" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["kanbanCardAssignee", "kanbanCardLabel", "kanbanCard", "kanbanColumn", "kanbanBoardMember", "kanbanBoard", "chatConversationHelper", "chatShift", "chatConversationEvent", "chatReadState", "chatAiSuggestion", "chatAttachment", "chatMessage", "chatConversation", "chatContact", "chatSetting", "staffInvite", "membership", "appSystem", "businessUnit"]) {
      try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ }
    }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s114b-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.staffInvite.deleteMany({ where: { phone: { in: [...Object.values(PH), "+66812345616", "+66812345617"] } } }); } catch { /* */ }
  try { await prisma.userPhone.deleteMany({ where: { userId: { startsWith: "qcs114b-" } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs114b-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs114b-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { contains: "qcs114b" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.14b", slug: `qc-sec-s114b-${Date.now().toString(36)}` } }); tid = t.id;
  await prisma.user.create({ data: { id: U.owner, email: `${U.owner}@example.com`, name: "เจ้าของ" } });
  await prisma.user.create({ data: { id: U.staff, email: `${U.staff}@example.com`, name: "พนักงาน" } });
  await prisma.user.create({ data: { id: U.nophone, email: `${U.nophone}@example.com`, name: "ไม่มีเบอร์" } });
  await prisma.user.create({ data: { id: U.apple, email: `${U.apple}@privaterelay.appleid.com`, name: "แอปเปิล" } });
  await prisma.user.create({ data: { id: U.invitee, email: `${U.invitee}@example.com`, name: "ผู้ถูกเชิญ" } });
  await prisma.userPhone.create({ data: { userId: U.invitee, phone: PH.invitee, verifiedAt: new Date() } });
  await prisma.userPhone.create({ data: { userId: U.staff, phone: PH.staff, verifiedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `u-${Date.now().toString(36)}` } });
  // ORACLE-EDIT (ผู้คุม · R-S1.14b-a): ด่าน ai-suggest = `chat.ai.suggest` ให้ตรงเว็บ ⇒ STAFF ของข้อสอบได้คีย์นี้ด้วย (ระดับ REPLY ไม่รวม ai.suggest — ให้รายคีย์)
const replyPerm = { "chat.conversation.read": true, "chat.message.send": true, "chat.conversation.markRead": true, "chat.ai.suggest": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: replyPerm, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.nophone, role: "STAFF", unitAccess: ["*"], permissions: { "chat.conversation.read": true }, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.apple, role: "STAFF", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  const sysRow = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC" } as never });
  const sid = sysRow.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid, aiSuggestEnabled: false } as never }).catch((e) => console.log("  ⚠️ chatSetting: " + errMsg(e)));
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs114b-c-${Date.now().toString(36)}`, displayName: "ลูกค้า QC" } as never });
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1, tags: ["รอคน", "วีไอพี"] } as never });
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: "ขอจองโต๊ะ 4 ที่ พรุ่งนี้ 19:00 ค่ะ" } as never });
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const H = { authorization: `Bearer ${await tok(U.owner)}`, "x-tenant-id": tid };
  const HS = { authorization: `Bearer ${await tok(U.staff)}`, "x-tenant-id": tid };
  const HN = { authorization: `Bearer ${await tok(U.nophone)}`, "x-tenant-id": tid };
  const HI = { authorization: `Bearer ${await tok(U.invitee)}` };
  const HA = { authorization: `Bearer ${await tok(U.apple)}`, "x-tenant-id": tid };
  const call = async (p: string, meth: string, body?: unknown, headers: Record<string, string> = H, params?: Record<string, string>, qs = "") => {
    const m = mods[p] ?? (await route(`@/app/api/mobile/${p}/route`));
    const fn = m?.[meth];
    if (!fn) return { status: 0, json: {} as Record<string, unknown>, text: "" };
    const url = `/api/mobile/${p.replace("[id]", params?.id ?? "")}${qs}`;
    const res = await fn(J(url, meth, body, headers), params ? P(params) : undefined);
    const text = await res.clone().text();
    return { status: res.status, json: await jsonOf(res), text };
  };
  const bodies: string[] = [];

  console.log("── I: invites/pending ──");
  {
    const inv0 = await call("secretary/invites/pending", "GET", undefined, HI);
    const made = await call("secretary/staff/invite", "POST", { name: "ผู้ถูกเชิญ", phone: "081-234-5614", role: "STAFF", unitIds: [unit.id], levels: { kanban: "VIEW" }, chat: "REPLY" }, H);
    const inv1 = await call("secretary/invites/pending", "GET", undefined, HI);
    const items = (inv1.json.items as Record<string, unknown>[]) ?? [];
    const invN = await call("secretary/invites/pending", "GET", undefined, { authorization: HN.authorization });
    bodies.push(inv1.text, made.text);
    chk("I-1", "ก่อนเชิญ = [] · หลังเชิญ (POST invite 200) ผู้ถูกเชิญเห็น 1 ใบ {inviteId, tenantName, role, expiresAt} · ผู้ใช้ไม่มีเบอร์ verified ⇒ []",
      inv0.status === 200 && Array.isArray(inv0.json.items) && (inv0.json.items as unknown[]).length === 0 && made.status === 200 && inv1.status === 200 && items.length === 1 && typeof items[0]?.inviteId === "string" && items[0]?.tenantName === "QC SEC S1.14b" && items[0]?.role === "STAFF" && typeof items[0]?.expiresAt === "string" && invN.status === 200 && Array.isArray(invN.json.items) && (invN.json.items as unknown[]).length === 0,
      JSON.stringify({ inv0: inv0.status, made: [made.status, made.json.error], inv1: [inv1.status, items.length], invN: [invN.status, invN.json] }).slice(0, 300));
    const noAuth = await call("secretary/invites/pending", "GET", undefined, {});
    chk("I-2", "ไม่มี Bearer ⇒ 401", noAuth.status === 401, String(noAuth.status));

    console.log("── V: invite levels/chat → permissions · sensitive ──");
    const row = await prisma.staffInvite.findFirst({ where: { tenantId: tid, phone: PH.invitee, acceptedAt: null }, orderBy: { createdAt: "desc" } });
    const perms = (row?.permissions ?? {}) as Record<string, unknown>;
    const expectChat = levels.CHAT_LEVELS?.REPLY as string[] | undefined;
    const kanbanRead = Object.keys(perms).filter((k) => k.startsWith("kanban.") && /\.(read|view|list)$/.test(k));
    chk("V-1", "ใบเชิญเก็บ permissions ที่ server แปลง: chat REPLY ครบคีย์ CHAT_LEVELS.REPLY · kanban VIEW = คีย์อ่าน ≥1 · ไม่มีคีย์เขียนของ kanban",
      !!row && Array.isArray(expectChat) && expectChat.every((k) => perms[k] === true) && kanbanRead.length >= 1 && !Object.keys(perms).some((k) => k.startsWith("kanban.") && /\.(create|update|delete|move)$/.test(k) && perms[k] === true),
      JSON.stringify({ has: !!row, keys: Object.keys(perms).slice(0, 12) }).slice(0, 300));
    const sens = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5616", role: "STAFF", chat: "VIEW", extraPermissions: { "pos.staff.manage": true } }, H);
    const sens2 = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5616", role: "STAFF", permissions: { "account.doc.approve": true } }, H);
    const badMod = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5616", role: "STAFF", levels: { chat: "VIEW" } }, H);
    const badMod2 = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5616", role: "STAFF", levels: { nosuchmodule: "VIEW" } }, H);
    const badLvl = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5616", role: "STAFF", levels: { kanban: "ADMIN" } }, H);
    const noRow = await prisma.staffInvite.count({ where: { tenantId: tid, phone: "+66812345616" } });
    chk("V-2", "คีย์อ่อนไหวใน extraPermissions/permissions ⇒ 422 sensitive_key + keys[] · ไม่สร้างใบ", sens.status === 422 && sens.json.error === "sensitive_key" && Array.isArray(sens.json.keys) && (sens.json.keys as string[]).includes("pos.staff.manage") && sens2.status === 422 && sens2.json.error === "sensitive_key" && noRow === 0, JSON.stringify({ sens: [sens.status, sens.json.error, sens.json.keys], sens2: [sens2.status, sens2.json.error], noRow }).slice(0, 300));
    chk("V-3", "levels{chat} ⇒ 422 bad_module (ข้อความไทย) · โมดูลไม่รู้จัก ⇒ 422 bad_module · ระดับแปลก ⇒ 422 bad_level", badMod.status === 422 && badMod.json.error === "bad_module" && thai(badMod.json.message) && badMod2.status === 422 && badMod2.json.error === "bad_module" && badLvl.status === 422 && badLvl.json.error === "bad_level", JSON.stringify({ badMod: [badMod.status, badMod.json.error], badMod2: [badMod2.status, badMod2.json.error], badLvl: [badLvl.status, badLvl.json.error] }).slice(0, 300));
    // ORACLE-EDIT (ผู้คุม · R-S1.14b-f · ผู้ตรวจ Y MAJOR-2): wildcard `<module>.*` ต้องถูกปฏิเสธเป็น sensitive_key (เลี่ยงด่านรายคีย์ไม่ได้)
    const wild = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5617", role: "STAFF", extraPermissions: { "pos.*": true } }, H);
    const wild2 = await call("secretary/staff/invite", "POST", { name: "x", phone: "081-234-5617", role: "STAFF", permissions: { "account.*": true } }, H);
    const wildRow = await prisma.staffInvite.count({ where: { tenantId: tid, phone: "+66812345617" } });
    chk("V-5", "คีย์ wildcard `pos.*`/`account.*` ใน extraPermissions/permissions ⇒ 422 sensitive_key · ไม่สร้างใบ", wild.status === 422 && wild.json.error === "sensitive_key" && wild2.status === 422 && wild2.json.error === "sensitive_key" && wildRow === 0, JSON.stringify({ wild: [wild.status, wild.json.error], wild2: [wild2.status, wild2.json.error], wildRow }));
    const W12 = ["pos.staff.manage", "pos.device.manage", "booking.service.setDeposit", "account.approve.limit", "account.chart.manage", "crm.quota.manage", "crm.report.all", "booking.job.runAny"];
    const OLD = ["account.doc.approve", "pos.refund", "member.point.adjust", "api.key.create", "crm.contact.export", "kanban.board.delete", "booking.slip.review", "account.period.close"];
    const SAFE = ["kanban.card.create", "chat.message.send", "crm.contact.read", "booking.job.create", "member.member.read"];
    const isS = levels.isSensitiveKey as (k: string) => boolean;
    chk("V-4", "isSensitiveKey: W-12 ทั้ง 8 = true (รวมตัวพิมพ์ใหญ่) · รายการเดิม = true · คีย์ปกติ = false", typeof isS === "function" && W12.every((k) => isS(k) && isS(k.toUpperCase())) && OLD.every((k) => isS(k)) && SAFE.every((k) => !isS(k)), JSON.stringify({ w12: W12.filter((k) => !isS(k)), old: OLD.filter((k) => !isS(k)), safe: SAFE.filter((k) => isS(k)) }));
  }

  console.log("── C: DTO ห้องลูกค้า ──");
  {
    const g = await call("inbox/conversations/[id]", "GET", undefined, H, { id: conv.id }, `?systemId=${sid}`);
    const gs = await call("inbox/conversations/[id]", "GET", undefined, HS, { id: conv.id }, `?systemId=${sid}`);
    const c = (g.json.conversation ?? {}) as Record<string, unknown>;
    const cs = (gs.json.conversation ?? {}) as Record<string, unknown>;
    const can = (c.can ?? {}) as Record<string, unknown>, canS = (cs.can ?? {}) as Record<string, unknown>;
    bodies.push(g.text, gs.text);
    chk("C-1", "GET ห้อง: tags = ['รอคน','วีไอพี'] · replyWindowEndsAt = null (WEBCHAT) · linkedMember null หรือมี phoneMasked ไม่มี phone", g.status === 200 && Array.isArray(c.tags) && (c.tags as string[]).join(",") === "รอคน,วีไอพี" && "replyWindowEndsAt" in c && c.replyWindowEndsAt === null && (g.json.linkedMember === null || (typeof (g.json.linkedMember as Record<string, unknown>).phoneMasked === "string" && !("phone" in (g.json.linkedMember as Record<string, unknown>)))), JSON.stringify({ s: g.status, tags: c.tags, rw: c.replyWindowEndsAt, lm: g.json.linkedMember }).slice(0, 300));
    chk("C-2", "can{}: OWNER ทั้ง 4 true · STAFF (read+send) reply=true assign/setStatus/linkCustomer=false", can.reply === true && can.assign === true && can.setStatus === true && can.linkCustomer === true && canS.reply === true && canS.assign === false && canS.setStatus === false && canS.linkCustomer === false, JSON.stringify({ can, canS }));
    const l = await call("inbox/conversations", "GET", undefined, H, undefined, `?systemId=${sid}`);
    const it = ((l.json.items as Record<string, unknown>[]) ?? []).find((x) => x.id === conv.id);
    bodies.push(l.text);
    chk("C-3", "รายการห้อง: item มี tags array เท่ากัน", l.status === 200 && !!it && Array.isArray(it.tags) && (it.tags as string[]).length === 2, JSON.stringify({ s: l.status, found: !!it, tags: it?.tags }).slice(0, 200));
  }

  console.log("── S: ai-suggest ──");
  {
    const off = await call("inbox/conversations/[id]/ai-suggest", "POST", { systemId: sid }, HS, { id: conv.id });
    await prisma.chatSetting.update({ where: { systemId: sid }, data: { aiSuggestEnabled: true } as never }).catch((e) => console.log("  ⚠️ enable: " + errMsg(e)));
    const on = await call("inbox/conversations/[id]/ai-suggest", "POST", { systemId: sid }, HS, { id: conv.id });
    const opts = (on.json.options as Record<string, unknown>[]) ?? [];
    bodies.push(off.text, on.text);
    chk("S-1", "ปิด aiSuggest ⇒ 200 ok:false + reason ไทย · เปิด+mock ⇒ 200 ok:true options ≥1 {id, body, warn} + sourceMessageId", off.status === 200 && off.json.ok === false && thai(off.json.reason) && on.status === 200 && on.json.ok === true && opts.length >= 1 && opts.every((o) => typeof o.id === "string" && typeof o.body === "string" && typeof o.warn === "boolean") && typeof on.json.sourceMessageId === "string", JSON.stringify({ off: [off.status, off.json.ok, off.json.reason], on: [on.status, on.json.ok, opts.length, on.json.reason] }).slice(0, 300));
    const sidOpt = String(opts[0]?.id ?? "");
    const rep = await call("inbox/conversations/[id]/reply", "POST", { systemId: sid, body: String(opts[0]?.body ?? "ตอบจากคำแนะนำ"), suggestionId: sidOpt }, HS, { id: conv.id });
    const sugg = sidOpt ? await (prisma as AnyMod).chatAiSuggestion.findUnique({ where: { id: sidOpt } }).catch(() => null) : null;
    chk("S-2", "reply + suggestionId ⇒ ส่งสำเร็จ (200) และ ChatAiSuggestion.outcome ∈ SENT_AS_IS/SENT_EDITED", rep.status === 200 && !!sugg && ["SENT_AS_IS", "SENT_EDITED"].includes(String(sugg.outcome)), JSON.stringify({ rep: [rep.status, rep.json.error], outcome: sugg?.outcome ?? null }).slice(0, 200));
    // ORACLE-EDIT (ผู้คุม · R-S1.14b-g · ผู้ตรวจ Y LOW-4): suggestionId ของห้องอื่น ⇒ 422 bad_suggestion (ไม่ส่งข้อความ)
    {
      const contact2 = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs114b-c2-${Date.now().toString(36)}`, displayName: "ลูกค้า QC 2" } as never });
      const conv2 = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact2.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
      await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv2.id, direction: "IN", type: "TEXT", body: "สวัสดีค่ะ" } as never });
      const before = await prisma.chatMessage.count({ where: { conversationId: conv2.id, direction: "OUT" } });
      const cross = await call("inbox/conversations/[id]/reply", "POST", { systemId: sid, body: "ข้อความข้ามห้อง", suggestionId: sidOpt, clientMessageId: "qcs114b-cross-1" }, HS, { id: conv2.id });
      const after = await prisma.chatMessage.count({ where: { conversationId: conv2.id, direction: "OUT" } });
      chk("S-4", "reply ห้อง 2 ด้วย suggestionId ของห้อง 1 ⇒ 422 bad_suggestion · ไม่มีข้อความ OUT เพิ่ม", !!sidOpt && cross.status === 422 && cross.json.error === "bad_suggestion" && after === before, JSON.stringify({ s: cross.status, e: cross.json.error, before, after }));
    }
    const denied = await call("inbox/conversations/[id]/ai-suggest", "POST", { systemId: sid }, HN, { id: conv.id });
    chk("S-3", "STAFF ไม่มีคีย์ chat.ai.suggest ⇒ 403", denied.status === 403, String(denied.status));
  }

  console.log("── T: task-from-chat ──");
  {
    const no = await call("inbox/conversations/[id]/task", "POST", { systemId: sid, title: "โทรกลับลูกค้า" }, H, { id: conv.id });
    chk("T-1", "ยังไม่ตั้งค่าบอร์ด ⇒ 404 not_configured (ข้อความไทย)", no.status === 404 && no.json.error === "not_configured" && thai(no.json.message), JSON.stringify({ s: no.status, e: no.json.error }));
    let boardId = "", why = "";
    try {
      const ks = await prisma.appSystem.create({ data: { tenantId: tid, type: "KANBAN", name: "บอร์ด QC", settings: { integrations: { openTaskFromChat: { enabled: true, boardId: "pending", columnId: null } } } } as never });
      const b = await (prisma as AnyMod).kanbanBoard.create({ data: { tenantId: tid, systemId: ks.id, name: "งานจากแชท", status: "ACTIVE" } });
      await (prisma as AnyMod).kanbanColumn.create({ data: { tenantId: tid, systemId: ks.id, boardId: b.id, name: "รับเรื่อง", status: "ACTIVE", sortOrder: 0, position: "a0" } });
      await prisma.appSystem.update({ where: { id: ks.id }, data: { settings: { integrations: { openTaskFromChat: { enabled: true, boardId: b.id, columnId: null } } } } as never });
      boardId = b.id;
    } catch (e) { why = errMsg(e); }
    if (!boardId) skip("T-2", "ตั้งค่าบอร์ดแล้ว ⇒ 200 {cardId, cardNo, cardHref, created}", `fixture บอร์ดสร้างไม่ได้: ${why}`);
    else {
      const ok = await call("inbox/conversations/[id]/task", "POST", { systemId: sid, title: "โทรกลับลูกค้า", description: "จองโต๊ะ 4 ที่" }, H, { id: conv.id });
      const card = ok.json.cardId ? await (prisma as AnyMod).kanbanCard.findUnique({ where: { id: String(ok.json.cardId) } }).catch(() => null) : null;
      bodies.push(ok.text);
      chk("T-2", "ตั้งค่าบอร์ดแล้ว ⇒ 200 {cardId, cardNo, cardHref, created:true} · การ์ดอยู่ในบอร์ดนั้น · title ตรง", ok.status === 200 && typeof ok.json.cardId === "string" && typeof ok.json.cardHref === "string" && ok.json.created === true && !!card && card.boardId === boardId && String(card.title) === "โทรกลับลูกค้า", JSON.stringify({ s: ok.status, e: ok.json.error, m: ok.json.message, card: !!card }).slice(0, 300));
      const bad = await call("inbox/conversations/[id]/task", "POST", { systemId: sid, title: "" }, H, { id: conv.id });
      chk("T-3", "title ว่าง ⇒ 400/422", bad.status === 400 || bad.status === 422, String(bad.status));
    }
  }

  console.log("── M: /me appleLinked · H: shift ──");
  {
    const me1 = await call("me", "GET", undefined, H);
    const me2 = await call("me", "GET", undefined, HA);
    const u1 = (me1.json.user ?? {}) as Record<string, unknown>, u2 = (me2.json.user ?? {}) as Record<string, unknown>;
    bodies.push(me1.text, me2.text);
    chk("M-1", "/me: อีเมลธรรมดา ⇒ appleLinked null (มีคีย์) · อีเมล privaterelay ⇒ true", me1.status === 200 && "appleLinked" in u1 && u1.appleLinked === null && me2.status === 200 && u2.appleLinked === true, JSON.stringify({ a: [me1.status, u1.appleLinked], b: [me2.status, u2.appleLinked] }));
    const s0 = await call("inbox/shift", "GET", undefined, HS);
    const on = await call("inbox/shift", "POST", { onDuty: true }, HS);
    const s1 = await call("inbox/shift", "GET", undefined, HS);
    await call("inbox/shift", "POST", { onDuty: false }, HS);
    const s2 = await call("inbox/shift", "GET", undefined, HS);
    bodies.push(s1.text);
    chk("H-1", "GET shift: ก่อน = {onDuty:false, onDutyAt:null} · เข้าเวร ⇒ {onDuty:true, onDutyAt iso} · ออก ⇒ false", s0.status === 200 && s0.json.onDuty === false && s0.json.onDutyAt === null && on.status === 200 && s1.json.onDuty === true && typeof s1.json.onDutyAt === "string" && s2.json.onDuty === false, JSON.stringify({ s0: s0.json, s1: s1.json, s2: s2.json }).slice(0, 200));
  }

  console.log("── X: ความลับ/เบอร์เต็ม ──");
  {
    const leak = bodies.filter((b) => /"phone":"\+66|codeHash|accessToken|"token":"|apiKey|secret/i.test(b));
    chk("X-1", "DTO ทุกเส้นที่เรียกไม่มีเบอร์เต็ม (+66) · codeHash · token · secret", leak.length === 0, leak.map((b) => b.slice(0, 80)).join(" | ").slice(0, 300));
  }
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`);
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  await cleanup();
}

console.log("── D: fitness ──");
for (const i of [1, 2]) {
  const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 });
  chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
}

const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
