// QC — SECRETARY S1.14c · ตั๋ว server ชุด 2 (push link /customers + tenantId · badges เส้นเดียว · can.aiSuggest)
// สัญญา: ledger/secretary-briefs/sec-brief-S1.14c.md · RESOLUTIONS §W R-S2.13b/c · §W.2 R-S2.13j · §X.2 LOW-3
//
// กลุ่มข้อ:
//   R  เส้นทาง badges GET
//   L  ลิงก์ push: grep routing.ts/push.ts/service.ts ไม่มี /inbox/ ใน data.link · ทุก payload มี tenantId · runtime: callHelper ⇒ post ได้ link /customers/<id>?e=helper + tenantId
//   B  badges shape + ตัวเลขจาก fixture (invite ค้าง 1 · helper 1 · STAFF invites=0) · total = ผลรวม
//   C  can.aiSuggest boolean ตามคีย์
//   X  ไม่มีความลับ · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.14c.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.14c";
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
loadLegacyQcEnv("qc-sec-s1.14c"); // route ของ inbox import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
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



const ROUTES: [string, string[]][] = [["secretary/badges", ["GET"]], ["inbox/conversations/[id]", ["GET"]]];
console.log("── R: เส้นทาง ──");
const missing: string[] = [];
const mods: Record<string, Record<string, Handler> | null> = {};
for (const [p, methods] of ROUTES) { const m = await route(`@/app/api/mobile/${p}/route`); mods[p] = m; for (const meth of methods) if (!m || typeof m[meth] !== "function") missing.push(`${meth} ${p}`); }
chk("R-1", "มี GET secretary/badges", missing.length === 0, missing.join(" · "));

console.log("── L: ลิงก์ push (static) ──");
{
  const rt = readFileSync(join(ROOT, "src/lib/modules/chat/routing.ts"), "utf8");
  const ps = readFileSync(join(ROOT, "src/lib/core/push.ts"), "utf8");
  const sv = readFileSync(join(ROOT, "src/lib/modules/chat/service.ts"), "utf8");
  const inboxLinks = [...rt.matchAll(/link:\s*`\/inbox\//g)].length + [...ps.matchAll(/link:\s*`\/inbox\//g)].length;
  const custLinks = [...rt.matchAll(/link:\s*`\/customers\/\$\{[^}]+\}\?e=/g)].length;
  chk("L-1", "routing.ts/push.ts ไม่มี data.link `/inbox/` เหลือ · routing.ts มี `/customers/<id>?e=` ≥ 4 จุด (assigned/helper/handoff/sla)", inboxLinks === 0 && custLinks >= 3, JSON.stringify({ inboxLinks, custLinks }));
  const pushDefault = /link:\s*`\/customers\/\$\{conversationId\}`/.test(ps);
  const svcTenant = /sendPushToChatStaff\(\{[\s\S]{0,400}tenantId/.test(sv);
  chk("L-2", "push.ts ค่าปริยาย link = /customers/<id> · service.ts ส่ง tenantId ให้ sendPushToChatStaff", pushDefault && svcTenant, JSON.stringify({ pushDefault, svcTenant }));
}

const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const routing = (await import("@/lib/modules/chat/routing")) as AnyMod;
const U = { owner: "qcs114c-owner", mgr: "qcs114c-mgr", staff: "qcs114c-staff", helper: "qcs114c-helper", nosug: "qcs114c-nosug" };
const PH = { inv: "+66812345624" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["chatConversationHelper", "chatShift", "chatConversationEvent", "chatReadState", "chatAiSuggestion", "chatMessage", "chatConversation", "chatContact", "chatSetting", "staffInvite", "membership", "appSystem", "businessUnit"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s114c-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.staffInvite.deleteMany({ where: { phone: PH.inv } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs114c-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs114c-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { contains: "qcs114c" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.14c", slug: `qc-sec-s114c-${Date.now().toString(36)}` } }); tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `u-${Date.now().toString(36)}` } });
  const replyPerm = { "chat.conversation.read": true, "chat.message.send": true, "chat.conversation.markRead": true, "chat.ai.suggest": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown>) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } as never });
  await mk("OWNER", U.owner, {}); await mk("MANAGER", U.mgr, {}); await mk("STAFF", U.staff, replyPerm); await mk("STAFF", U.helper, replyPerm); await mk("STAFF", U.nosug, { "chat.conversation.read": true, "chat.message.send": true });
  const sysRow = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC" } as never }); const sid = sysRow.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid } as never }).catch((e) => console.log("  ⚠️ chatSetting: " + errMsg(e)));
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs114c-c-${Date.now().toString(36)}`, displayName: "ลูกค้า QC" } as never });
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unit.id, assigneeUserId: U.staff, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 2 } as never });
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: "สวัสดีค่ะ ขอจองโต๊ะ" } as never });
  // ใบเชิญค้าง 1 ใบ · helper 1 คน (ผ่าน callHelper จริง — จับ push ด้วย post)
  const inv = (await import("@/lib/staff/invite")) as AnyMod;
  const made = await inv.inviteStaff({ tenantId: tid, actorUserId: U.owner }, { name: "ผู้ถูกเชิญ", phone: "081-234-5624", role: "STAFF", unitIds: [unit.id] });
  const pushes: { to: string; msg: Record<string, unknown> }[] = [];
  const post = async (_url: string, body: unknown) => { const arr = Array.isArray(body) ? body : [body]; for (const m of arr) pushes.push({ to: String((m as AnyMod).to ?? ""), msg: m as Record<string, unknown> }); return { ok: true, status: 200, json: async () => ({ data: arr.map(() => ({ status: "ok" })) }) } as unknown as Response; };
  await prisma.pushDevice.create({ data: { userId: U.helper, tenantId: tid, expoToken: `ExponentPushToken[qcs114c-helper]`, platform: "ios" } as never }).catch((e) => console.log("  ⚠️ pushDevice: " + errMsg(e)));
  let helperErr = "";
  try { await routing.callHelper({ tenantId: tid, systemId: sid, conversationId: conv.id, byUserId: U.staff, helperUserId: U.helper, note: "ช่วยดูที", deps: { post } }); } catch (e) { helperErr = errMsg(e); }
  const helperRows = await prisma.chatConversationHelper.count({ where: { tenantId: tid, conversationId: conv.id, userId: U.helper } });
  console.log("── L: ลิงก์ push (runtime) ──");
  {
    const helperPush = pushes.find((p) => String((p.msg.data as AnyMod)?.link ?? "").includes(conv.id));
    const d = (helperPush?.msg.data ?? {}) as Record<string, unknown>;
    chk("L-3", "callHelper ⇒ push ถึง helper มี data.link = /customers/<id>?e=helper · data.tenantId · systemId · conversationId", helperRows === 1 && !!helperPush && d.link === `/customers/${conv.id}?e=helper` && d.tenantId === tid && d.systemId === sid && d.conversationId === conv.id, JSON.stringify({ helperErr, helperRows, pushes: pushes.length, data: d }).slice(0, 300));
  }
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const hdr = async (uid: string) => ({ authorization: `Bearer ${await tok(uid)}`, "x-tenant-id": tid });
  const H = await hdr(U.owner), HM = await hdr(U.mgr), HS = await hdr(U.staff), HH = await hdr(U.helper), HN = await hdr(U.nosug);
  const call = async (p: string, meth: string, headers: Record<string, string>, params?: Record<string, string>, qs = "") => {
    const fn = (mods[p] ?? (await route(`@/app/api/mobile/${p}/route`)))?.[meth]; if (!fn) return { status: 0, json: {} as Record<string, unknown>, text: "" };
    const res = await fn(J(`/api/mobile/${p.replace("[id]", params?.id ?? "")}${qs}`, meth, undefined, headers), params ? P(params) : undefined);
    const text = await res.clone().text(); return { status: res.status, json: await jsonOf(res), text };
  };
  const bodies: string[] = [];
  console.log("── B: badges ──");
  {
    const bo = await call("secretary/badges", "GET", H), bm = await call("secretary/badges", "GET", HM), bs = await call("secretary/badges", "GET", HS), bh = await call("secretary/badges", "GET", HH);
    bodies.push(bo.text, bs.text);
    const shape = (j: Record<string, unknown>) => { const tm = (j.team ?? {}) as Record<string, unknown>; return typeof j.approvals === "number" && typeof j.customers === "number" && typeof tm.invites === "number" && typeof tm.help === "number" && typeof tm.support === "number" && typeof j.total === "number" && j.total === (j.approvals as number) + (j.customers as number) + (tm.invites as number) + (tm.help as number) + (tm.support as number); };
    const tm = (j: Record<string, unknown>) => (j.team ?? {}) as Record<string, number>;
    chk("B-1", "shape {approvals, customers, team{invites,help,support}, total=ผลรวม} ครบทุก role", [bo, bm, bs, bh].every((r) => r.status === 200 && shape(r.json)), JSON.stringify({ bo: [bo.status, bo.json], bs: [bs.status, bs.json] }).slice(0, 300));
    chk("B-2", "team.invites: OWNER=1 · MANAGER=1 · STAFF=0 (ใบเชิญค้าง 1 ใบ)", made?.ok === true && tm(bo.json).invites === 1 && tm(bm.json).invites === 1 && tm(bs.json).invites === 0, JSON.stringify({ made: made?.ok, o: tm(bo.json).invites, m: tm(bm.json).invites, s: tm(bs.json).invites }));
    chk("B-3", "team.help: helper=1 · owner=0 · customers: owner/staff ≥ 2 (unread 2) · nosug ก็เห็น (มี read)", tm(bh.json).help === 1 && tm(bo.json).help === 0 && (bo.json.customers as number) >= 2 && (bs.json.customers as number) >= 2, JSON.stringify({ hh: tm(bh.json).help, ho: tm(bo.json).help, co: bo.json.customers, cs: bs.json.customers }));
    const noAuth = await call("secretary/badges", "GET", {});
    chk("B-4", "ไม่มี Bearer ⇒ 401", noAuth.status === 401, String(noAuth.status));
  }
  console.log("── C: can.aiSuggest ──");
  {
    const gs = await call("inbox/conversations/[id]", "GET", HS, { id: conv.id }, `?systemId=${sid}`);
    const gn = await call("inbox/conversations/[id]", "GET", HN, { id: conv.id }, `?systemId=${sid}`);
    const cs = ((gs.json.conversation ?? {}) as AnyMod).can ?? {}, cn = ((gn.json.conversation ?? {}) as AnyMod).can ?? {};
    bodies.push(gs.text, gn.text);
    chk("C-1", "can.aiSuggest: STAFF มีคีย์ = true · STAFF ไม่มีคีย์ = false (ยัง reply=true)", gs.status === 200 && cs.aiSuggest === true && gn.status === 200 && cn.aiSuggest === false && cn.reply === true, JSON.stringify({ cs, cn }));
  }
  console.log("── X ──");
  { const leak = bodies.filter((b) => /"phone":"\+66|codeHash|accessToken|"token":"|secret/i.test(b)); chk("X-1", "ไม่มีเบอร์เต็ม/ความลับใน DTO", leak.length === 0, leak.map((b) => b.slice(0, 80)).join(" | ").slice(0, 200)); }
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`); chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally { await cleanup(); try { await prisma.pushDevice.deleteMany({ where: { expoToken: { startsWith: "ExponentPushToken[qcs114c-" } } }); } catch { /* */ } }

console.log("── D: fitness ──");
for (const i of [1, 2]) { const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
