// QC — SECRETARY S1.14 · API ชุดเดียว /api/mobile/secretary/** (Bearer · rate-limit · DTO ไม่มี token/คีย์ · quota อ่านอย่างเดียว · เรียก handler ตรง)กลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   R  เส้นทางครบตามตารางใบ S1.14 (import route module + method)
//   A  401 ไม่มี Bearer · 403/404 ร้านที่ไม่ได้เป็นสมาชิก · body ไม่ใช่ JSON ⇒ 400
//   H  rooms: POST → GET list → GET messages → POST send → close · members · proposals list
//   Q  quota GET อ่านอย่างเดียว (ไม่สร้าง wallet/GRANT) · suggestions/inbox/count shape
//   X  DTO ทุกเส้น GET ไม่มี token/secret/codeHash/accessToken/credentials · route ห้ามอ่าน now/userId/tenantId จาก body (grep source)
//   L  rate-limit: send 10/นาที ⇒ ครั้งที่ 11 = 429 มี retryAfterSec
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.14.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.14";
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
import { readdirSync, statSync } from "node:fs";
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };

// ตารางเส้นทางตามใบ S1.14 (path ใต้ /api/mobile/secretary · เมธอดที่ต้องมี)
const ROUTES: [string, string[]][] = [
  ["secretary", ["GET", "PUT"]], ["rooms", ["GET", "POST"]], ["rooms/[id]", ["GET"]], ["rooms/[id]/messages", ["GET"]], ["rooms/[id]/send", ["POST"]], ["rooms/[id]/close", ["POST"]], ["rooms/[id]/title", ["PUT"]],
  ["rooms/[id]/members", ["GET", "POST"]], ["rooms/[id]/members/[userId]", ["DELETE"]], ["rooms/[id]/proposals", ["GET"]],
  ["proposals/[id]/approve", ["POST"]], ["proposals/[id]/reject", ["POST"]], ["proposals/[id]/edit", ["POST"]], ["plans/[id]/approve", ["POST"]], ["plans/[id]/reject", ["POST"]],
  ["log", ["GET"]], ["log/[id]/undo", ["POST"]], ["access", ["GET", "PUT"]], ["rules", ["GET", "PUT"]],
  ["scheduled", ["GET", "POST"]], ["scheduled/[id]", ["PUT", "DELETE"]],
  ["suggestions", ["GET"]], ["frequent", ["GET"]], ["inbox", ["GET"]], ["inbox/count", ["GET"]], ["quota", ["GET"]],
  ["account/delete", ["POST"]], ["account/delete/preview", ["GET"]],
  ["lessons", ["GET"]], ["lessons/[id]/confirm", ["POST"]], ["lessons/[id]", ["DELETE"]], ["memories/pending", ["GET"]], ["memories/[id]/confirm", ["POST"]], ["memories/[id]", ["DELETE"]],
  ["digest", ["GET"]],
  ["support/cases", ["GET", "POST"]], ["support/cases/[id]", ["GET"]], ["support/cases/[id]/reply", ["POST"]], ["support/cases/[id]/resolve", ["POST"]], ["support/upload", ["POST"]],
  ["notify", ["GET", "PUT"]], ["badge", ["GET"]],
  ["tenants/create", ["POST"]], ["staff", ["GET"]], ["staff/invite", ["POST"]], ["staff/invites", ["GET"]], ["staff/invites/[id]/resend", ["POST"]], ["staff/invites/[id]", ["DELETE"]], ["staff/[membershipId]", ["PUT"]], ["staff/[membershipId]/suspend", ["POST"]], ["staff/[membershipId]/remove", ["POST"]], ["invites/accept", ["POST"]], ["invites/[code]", ["GET"]],
  ["after-hours", ["GET", "PUT"]],
];

console.log("── R: เส้นทาง ──");
const missing: string[] = [];
const mods: Record<string, Record<string, Handler> | null> = {};
for (const [p, methods] of ROUTES) {
  const m = await route(`@/app/api/mobile/secretary/${p}/route`);
  mods[p] = m;
  for (const meth of methods) if (!m || typeof m[meth] !== "function") missing.push(`${meth} ${p}`);
}
chk("R-1", `มีเส้นทางครบ ${ROUTES.length} path ตามตารางใบ S1.14`, missing.length === 0, missing.slice(0, 12).join(" · "));
// ห้ามอ่าน now/userId/tenantId จาก body · ต้องมี checkRateLimitDb ในทุกเส้นเขียน
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : q.endsWith("route.ts") ? [q] : []; });
const files = existsSync(SEC_DIR) ? walk(SEC_DIR) : [];
const badBody = files.filter((f) => /body\??\.(now|userId|tenantId|actorUserId)\b/.test(readFileSync(f, "utf8")));
const writeNoRl = files.filter((f) => { const s = readFileSync(f, "utf8"); return /export async function (POST|PUT|DELETE|PATCH)/.test(s) && !/checkRateLimitDb|withRateLimit|rateLimit\(/.test(s); });
chk("R-2", "route ไม่อ่าน body.now/userId/tenantId/actorUserId · ทุกเส้นเขียนมี rate-limit", files.length > 0 && badBody.length === 0 && writeNoRl.length === 0, JSON.stringify({ badBody: badBody.map((f) => f.replace(ROOT, "")).slice(0, 4), noRl: writeNoRl.map((f) => f.replace(ROOT, "")).slice(0, 6) }));

const U = { owner: "qcs114-owner", staff: "qcs114-staff", out: "qcs114-out" };
let tid = "", tid2 = "";
const cleanup = async () => {
  for (const t of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiSystemAccess", "aiApprovalRule", "aiScheduledTask", "aiNotifyPref", "appNotification", "supportMessage", "supportCase", "appSystem", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: t } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s114-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs114-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { startsWith: "sec:" } } }); } catch { /* */ } // ORACLE-EDIT: ล้างแถว rate-limit ของข้อสอบ
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.14", slug: `qc-sec-s114-${Date.now().toString(36)}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC SEC S1.14 อื่น", slug: `qc-sec-s114-o-${Date.now().toString(36)}` } }); tid2 = t2.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid2, userId: U.out, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const auth = await import("@/lib/mobile/auth");
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const H = { authorization: `Bearer ${await tok(U.owner)}`, "x-tenant-id": tid };
  const HS = { authorization: `Bearer ${await tok(U.staff)}`, "x-tenant-id": tid };
  const HO = { authorization: `Bearer ${await tok(U.out)}`, "x-tenant-id": tid }; // คนนอกชี้ร้าน a
  const call = async (p: string, method: string, body?: unknown, headers: Record<string, string> = H, params: Record<string, string> = {}) => { const m = mods[p] ?? (await route(`@/app/api/mobile/secretary/${p}/route`)); if (!m || typeof m[method] !== "function") return { status: 0, body: {} as Record<string, unknown> }; const r = await m[method]!(J(`/api/mobile/secretary/${p}`, method, body, headers), P(params)); return { status: r.status, body: await jsonOf(r) }; };

  console.log("── A: auth ──");
  const a1 = await call("rooms", "GET", undefined, { "x-tenant-id": tid });
  const a2 = await call("rooms", "GET", undefined, HO);
  const a3 = await call("rooms", "POST", undefined, H);
  const a4 = await (async () => { const m = mods["rooms"]; if (!m?.POST) return 0; const r = await m.POST(new Request("http://qc.local/api/mobile/secretary/rooms", { method: "POST", headers: { "content-type": "application/json", ...H }, body: "{bad" })); return r.status; })();
  chk("A-1", "ไม่มี Bearer ⇒ 401 · คนนอกชี้ร้านอื่น ⇒ 403/404 · body ไม่ใช่ JSON ⇒ 400 · error shape {error}", a1.status === 401 && [403, 404].includes(a2.status) && a4 === 400 && typeof a2.body.error === "string" && [400, 401, 403, 404].includes(a3.status), JSON.stringify({ a1: a1.status, a2: a2.status, a3: a3.status, a4 }));

  console.log("── H: rooms ──");
  const r1 = await call("rooms", "POST", { instruction: "สรุปยอดขายวันนี้" });
  const roomId = String(r1.body.roomId ?? r1.body.id ?? "");
  const r2 = await call("rooms", "GET");
  const r3 = await call("rooms/[id]", "GET", undefined, H, { id: roomId });
  const r4 = await call("rooms/[id]/messages", "GET", undefined, H, { id: roomId });
  const r5 = await call("rooms/[id]/send", "POST", { text: "เพิ่มเติม: เฉพาะสาขาหลัก", clientMessageId: `qc-${Date.now()}` }, H, { id: roomId });
  const r5b = await call("rooms/[id]/send", "POST", { text: "ซ้ำ", clientMessageId: "qc-dup-1" }, H, { id: roomId });
  const r5c = await call("rooms/[id]/send", "POST", { text: "ซ้ำ", clientMessageId: "qc-dup-1" }, H, { id: roomId });
  const rS = await call("rooms/[id]", "GET", undefined, HS, { id: roomId });
  const r6 = await call("rooms/[id]/close", "POST", {}, H, { id: roomId });
  const items = (r2.body.items ?? r2.body.rooms ?? []) as { id: string }[];
  const msgs = (r4.body.messages ?? r4.body.items ?? []) as unknown[];
  chk("H-1", "POST rooms 200 roomId · GET rooms มีห้อง · GET room 200 · messages ≥1 · send 200 · ส่งซ้ำ clientMessageId เดิม ⇒ 200 duplicate หรือ 409 · STAFF ที่ไม่ใช่สมาชิก ⇒ 404 · close 200", r1.status === 200 && !!roomId && items.some((x) => x.id === roomId) && r3.status === 200 && r4.status === 200 && msgs.length >= 1 && r5.status === 200 && r5b.status === 200 && (r5c.status === 409 || (r5c.status === 200 && r5c.body.duplicate === true)) && rS.status === 404 && r6.status === 200, JSON.stringify({ r1: r1.status, n: items.length, r3: r3.status, r4: r4.status, m: msgs.length, r5: r5.status, r5c: r5c.status, rS: rS.status, r6: r6.status }));
  const rM = await call("rooms", "POST", { instruction: "ห้องสำหรับสมาชิก" }); const roomM = String(rM.body.roomId ?? rM.body.id ?? ""); // ORACLE-EDIT H-2: ห้องเปิดใหม่ (H-1 ปิดห้องแรกแล้ว)
  const m1 = await call("rooms/[id]/members", "POST", { userId: U.staff, seeHistory: true }, H, { id: roomM });
  const m2 = await call("rooms/[id]/members", "GET", undefined, H, { id: roomM });
  const m3 = await call("rooms/[id]/members/[userId]", "DELETE", undefined, H, { id: roomM, userId: U.staff });
  const pr = await call("rooms/[id]/proposals", "GET", undefined, H, { id: roomM });
  const mem = (m2.body.members ?? m2.body.items ?? []) as { userId: string }[];
  chk("H-2", "members POST/GET/DELETE 200 · รายชื่อมี staff หลังเพิ่ม · proposals GET 200 array", m1.status === 200 && m2.status === 200 && mem.some((x) => x.userId === U.staff) && m3.status === 200 && pr.status === 200 && Array.isArray(pr.body.items ?? pr.body.proposals ?? pr.body), JSON.stringify({ m1: m1.status, m2: m2.status, m3: m3.status, pr: pr.status }));
  // H-3 (R-S1.14a): POST rooms ส่ง clientMessageId ซ้ำ ⇒ duplicate ห้องเดิม · นับงานครั้งเดียว
  const jobsBefore = (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0;
  const cm = `qc114-${Date.now()}`;
  const d1 = await call("rooms", "POST", { instruction: "งานกันซ้ำ", clientMessageId: cm });
  const d2 = await call("rooms", "POST", { instruction: "งานกันซ้ำ", clientMessageId: cm });
  const jobsAfter = (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0;
  chk("H-3", "POST rooms + clientMessageId: ครั้งแรก 200 roomId · ซ้ำ ⇒ 200 duplicate:true roomId เดิม · ตัวนับงาน +1 เท่านั้น", d1.status === 200 && !!d1.body.roomId && d2.status === 200 && d2.body.duplicate === true && d2.body.roomId === d1.body.roomId && jobsAfter === jobsBefore + 1, JSON.stringify({ d1: d1.status, d2: d2.status, dup: d2.body.duplicate, jobs: [jobsBefore, jobsAfter] }));
  // A-2 (T/U gaps): STAFF เขียน access/rules ⇒ 403 · STAFF GET after-hours ⇒ 403
  const sA = await call("access", "PUT", { module: "kanban", level: "OFF" }, HS);
  const sR = await call("rules", "PUT", { key: "chat.send", enabled: false }, HS);
  const sH = await call("after-hours", "GET", undefined, HS);
  chk("A-2", "STAFF: PUT access ⇒ 403 · PUT rules ⇒ 403 · GET after-hours ⇒ 403", sA.status === 403 && sR.status === 403 && sH.status === 403, JSON.stringify({ sA: sA.status, sR: sR.status, sH: sH.status }));

  console.log("── Q: quota · home ──");
  const walletsBefore = await prisma.aiCreditWallet.count({ where: { tenantId: tid } });
  const q = await call("quota", "GET");
  const walletsAfter = await prisma.aiCreditWallet.count({ where: { tenantId: tid } });
  const grants = await prisma.aiCreditTxn.count({ where: { tenantId: tid, kind: "GRANT" } }).catch(() => 0);
  const jobs = (q.body.jobs ?? {}) as Record<string, unknown>;
  chk("Q-1", "GET quota 200 {jobs{used,limit,left,resetAt}, credit, pack} · อ่านอย่างเดียว (ไม่สร้าง wallet · ไม่มี GRANT)", q.status === 200 && typeof jobs.used === "number" && typeof jobs.limit === "number" && typeof jobs.left === "number" && !!jobs.resetAt && "credit" in q.body && walletsAfter === walletsBefore && grants === 0, JSON.stringify(q.body).slice(0, 200));
  const sg = await call("suggestions", "GET"); const fr = await call("frequent", "GET"); const ib = await call("inbox", "GET", undefined, { authorization: H.authorization }); const ic = await call("inbox/count", "GET", undefined, { authorization: H.authorization }); const dg = await call("digest", "GET");
  chk("Q-2", "suggestions/frequent/digest 200 · inbox/inbox.count 200 โดยไม่มี x-tenant-id", sg.status === 200 && fr.status === 200 && dg.status === 200 && ib.status === 200 && ic.status === 200 && typeof (ic.body.total ?? ic.body.count) === "number", JSON.stringify({ sg: sg.status, fr: fr.status, dg: dg.status, ib: ib.status, ic: ic.status }));

  console.log("── X: DTO ──");
  const gets: [string, Record<string, string>][] = [["secretary", {}], ["rooms", {}], ["log", {}], ["access", {}], ["rules", {}], ["scheduled", {}], ["lessons", {}], ["memories/pending", {}], ["support/cases", {}], ["notify", {}], ["badge", {}], ["staff", {}], ["staff/invites", {}], ["after-hours", {}], ["quota", {}], ["suggestions", {}]];
  const leaks: string[] = [];
  for (const [p, params] of gets) { const r = await call(p, "GET", undefined, H, params); const s = JSON.stringify(r.body); if (r.status !== 200) leaks.push(`${p}:${r.status}`); if (/"(token|accessToken|secret|codeHash|credentials|channelSecret|apiKey|passwordHash|balanceMicro|costMicro)"/i.test(s) || /"\+66\d{9}"|@example\.com/.test(s)) leaks.push(`${p}:leak`); }
  chk("X-1", "GET ทุกเส้นในชุด 200 · ไม่มีคีย์ token/accessToken/secret/codeHash/credentials/apiKey ใน body", leaks.length === 0, leaks.join(" · "), "CRITICAL");

  console.log("── L: rate-limit ──");
  const r0 = await call("rooms", "POST", { instruction: "ห้องทดสอบ rate" });
  const rid = String(r0.body.roomId ?? r0.body.id ?? "");
  let got429 = 0, retryAfter = false;
  for (let i = 0; i < 14; i++) { const r = await call("rooms/[id]/send", "POST", { text: `ข้อความ ${i}`, clientMessageId: `qc-rl-${Date.now()}-${i}` }, H, { id: rid }); if (r.status === 429) { got429++; if (typeof r.body.retryAfterSec === "number") retryAfter = true; } }
  chk("L-1", "send 14 ครั้งติดใน 1 นาที ⇒ มี 429 (เพดาน 10/นาที) พร้อม retryAfterSec · error 'rate_limited'", got429 >= 1 && retryAfter, JSON.stringify({ got429, retryAfter }));
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
