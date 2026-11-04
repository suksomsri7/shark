// QC — SECRETARY S0.3 + S0.4 · data contract doc · API doc · QC seed (idempotent) · free pack (pure) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SECRETARY-MASTER-PLAN.md แถว S0.3/S0.4 · ใบสั่ง ledger/secretary-briefs/sec-brief-S0.3.md · คำตัดสิน sec-brief-RESOLUTIONS.md
//
// กลุ่มข้อ:
//   D1  เอกสาร: 31-secretary.md มี §0–§11 · 38 หน้าใน §3 · 16 โมเดลใน §4 · ฟังก์ชันทุกตัวใน §5 มีลายเซ็น · ใช้คีย์ chat.message.send · เส้นสาธิต booking
//       SECRETARY-API.md: ≥25 แถว method+path+Bearer+NEW/EXISTS · path บังคับครบ · ไม่มีสตริงคล้ายคีย์
//   D2  seed: ด่าน host (prod / RUN อื่น / ไม่มี env ⇒ exit 4) · รัน ×2 รอบสองเขียน 0 · แถวร้านอื่นไม่เปลี่ยน · id ขึ้นต้น secqc- · เนื้อหาตามสัญญา
//   D3  pack.ts: ค่าคงที่ · countsAsJob · quotaMessage 79/80/95/100/101 · nextResetBangkok/monthKeyBangkok ขอบเดือน+ปีอธิกสุรทิน · ไม่อ่านนาฬิกา
//   D4  pnpm fitness ×2 (มี env / ไม่มี env) · typecheck เมื่อ QC_RUN_TSC=1 (ผู้คุมรันเองตอนรับใบ)
//
// unforced (ไม่มี QC_FORCE) + ยังไม่มี docs/modules/31-secretary.md ⇒ SKIP exit 0
// D2 ต้องรันผ่าน qc-sec.sh (SEC_QC_HOST=ep-calm-flower-aosbmxhm) — ไม่มี DATABASE_URL ⇒ D2 SKIP (CRITICAL แจ้งให้รันให้ถูก) · host อื่น ⇒ exit 4
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s0.3.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s0.3";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";

type Res = "PASS" | "FAIL" | "SKIP";
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; name: string; res: Res; sev: Sev; why?: string }[] = [];
function chk(id: string, name: string, ok: boolean, why = "", sev: Sev = "CRITICAL") {
  cks.push({ id, name, res: ok ? "PASS" : "FAIL", sev, why });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — ${why}`}`);
}
function skip(id: string, name: string, why: string, sev: Sev = "CRITICAL") {
  cks.push({ id, name, res: "SKIP", sev, why });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
}
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
function section(md: string, n: number): string {
  const re = new RegExp(`^##\\s*${n}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s*\\d+\\b|(?![\\s\\S]))`, "m");
  return md.match(re)?.[1] ?? "";
}

const DOC = join(ROOT, "docs/modules/31-secretary.md");
const API = join(ROOT, "docs/api/SECRETARY-API.md");
const PACK = join(ROOT, "src/lib/ai/secretary/pack.ts");
if (!FORCED && !existsSync(DOC)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี docs/modules/31-secretary.md (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}

// ── env: โหลดไฟล์ QC (ถ้ามี) แล้วยืนยัน host — ห้ามเป็น prod/RUN อื่น (exit 4 ก่อนแตะอะไร)
const ENV_FILE = process.env.QC_ENV_FILE ?? "";
if (ENV_FILE === ".env") { console.error(`🔴 ${LABEL}: QC_ENV_FILE=.env คือ production — หยุด`); process.exit(4); }
const preDb = process.env.DATABASE_URL ?? "", preDirect = process.env.DIRECT_URL ?? "";
if (ENV_FILE) { try { process.loadEnvFile(ENV_FILE); } catch { /* ไม่มีไฟล์ */ } }
if (preDb) process.env.DATABASE_URL = preDb;
if (preDirect) process.env.DIRECT_URL = preDirect;
const DB_HOST = hostOf(process.env.DATABASE_URL ?? "");
const DB_OK = DB_HOST.startsWith(SEC_HOST) && hostOf(process.env.DIRECT_URL ?? "").startsWith(SEC_HOST) && process.env.SEC_QC_HOST === SEC_HOST;
if (process.env.DATABASE_URL && !DB_OK) { console.error(`🔴 ${LABEL}: DATABASE_URL host "${DB_HOST}" ไม่ใช่ฐาน QC ของเลขา (${SEC_HOST}) — หยุด · รันผ่าน scripts/qc-sec.sh`); process.exit(4); }
console.log(`${LABEL} · db=${DB_OK ? SEC_HOST : "(none — D2 จะ SKIP)"} · forced=${FORCED}`);

// ═══════════════ D1 เอกสาร ═══════════════
console.log("D1 เอกสาร");
const doc = rd(DOC), api = rd(API);
chk("D1.1", "docs/modules/31-secretary.md มีอยู่ (≥ 300 บรรทัด)", doc.split("\n").length >= 300, `บรรทัด=${doc.split("\n").length}`);
{
  const missing = Array.from({ length: 12 }, (_, i) => i).filter((n) => !new RegExp(`^##\\s*${n}\\b`, "m").test(doc));
  chk("D1.2", "หัวข้อ §0–§11 ครบ", missing.length === 0, `ขาด §${missing.join(", §")}`);
}
const PAGES = ["A1","A2","A3","A4","A5","A6","A7","A8","B1","B2","B3","B4","B5","B6","B7","B8","C1","C3","C4","S1","S2","D1","D2","D3","H1","H2","H3","H4","K1","K2","K3","K4","K5","G1","G2","G3","G4","G5"];
{
  const s3 = section(doc, 3);
  const missing = PAGES.filter((p) => !new RegExp(`\\|\\s*\\*\\*${p}\\*\\*`).test(s3));
  chk("D1.3", `§3 มีแถวของทุกหน้า (${PAGES.length}) — id ตัวหนาต้นแถว`, missing.length === 0, `ขาด ${missing.join(", ")}`);
}
const MODELS = ["AiSecretary","AiRoom","AiRoomMember","AiRoomJob","AiSystemAccess","AiApprovalRule","AiActionLog","AiJobCounter","AiLesson","StaffInvite","ChatRoutingRule","ChatShift","ChatConversationHelper","UserPhone","PhoneOtp","AiNotifyPref"];
{
  const s4 = section(doc, 4);
  const missing = MODELS.filter((m) => !new RegExp(`\\b${m}\\b`).test(s4));
  chk("D1.4", `§4 มีโมเดลใหม่ครบ ${MODELS.length} ตัว`, missing.length === 0, `ขาด ${missing.join(", ")}`);
  const cols = ["authorUserId", "AiMemory", "ownerUserId", "editedReply", "SupportCase"].filter((c) => !s4.includes(c));
  chk("D1.5", "§4 มีคอลัมน์ nullable บนตารางเดิม (AiMessage.authorUserId · AiMemory.status · AiScheduledTask.ownerUserId · AiTrainingSample.editedReply · SupportCase.*)", cols.length === 0, `ขาด ${cols.join(", ")}`, "MAJOR");
  chk("D1.6", "§4 ไม่มี User.phone และไม่มี minute (RESOLUTIONS R-K5/§B.8)", !/User\.phone/.test(s4) && !/\bminute\b/.test(s4), "พบ User.phone หรือ minute");
}
const FUNCS = "ensureSecretary updateSecretary sampleSpeech setAccess listAccess startRoom roomStatus listRooms sightForUser runRoomJobs enqueueRoomJob addMember removeMember classOfKind approvalGate undoAction listLog rejectWithNote editProposal suggestions inboxForUser quotaStatus canRunAi computeDigest lessonBlock recordOutcome openCaseFromApp listCasesForUser assignCase requestPhoneOtp verifyPhoneOtp createTenantFromApp createInvite acceptInvite moduleLevel setModuleLevel assignIncoming callHelper handoff eligibleResponders AnthropicProvider countsAsJob quotaMessage nextResetBangkok monthKeyBangkok".split(" ");
{
  const s5 = section(doc, 5);
  const missing = FUNCS.filter((f) => !new RegExp(`\\b${f}\\s*\\(`).test(s5));
  chk("D1.7", `§5 มีฟังก์ชันพร้อมลายเซ็นครบ ${FUNCS.length} ตัว`, missing.length === 0, `ขาด ${missing.join(", ")}`);
}
chk("D1.8", "คีย์แชท = chat.message.send (ไม่มี chat.conversation.reply) — R-K14", doc.includes("chat.message.send") && !doc.includes("chat.conversation.reply") && !api.includes("chat.conversation.reply"), "พบคีย์ผิด/ไม่พบคีย์ถูก");
chk("D1.9", "เส้นสาธิต 3 = คืนมัดจำนัดหมาย booking (booking.refund_deposit) ไม่ใช่หอพัก — R-K16", doc.includes("booking.refund_deposit") && !/คืนมัดจำหอ/.test(doc), "ไม่พบ booking.refund_deposit หรือยังมี 'คืนมัดจำหอ'");
chk("D1.10", "§8 อ้าง canRunAi + scope jobs + startRoom เป็นจุดนับงาน — R-K6/K7", /canRunAi/.test(section(doc, 8)) && /"?jobs"?/.test(section(doc, 8)) && /startRoom/.test(section(doc, 8)), "§8 ขาด canRunAi / jobs / startRoom", "MAJOR");
chk("D1.11", "§11 ตัด dorm + cron รายนาที ออกจากรุ่นแรก", /dorm|หอพัก/.test(section(doc, 11)) && /รายนาที|ทุกนาที/.test(section(doc, 11)), "§11 ไม่กล่าวถึง dorm / cron รายนาที", "MINOR");
// API doc
chk("D1.12", "docs/api/SECRETARY-API.md มีอยู่", api.length > 0, "ไม่พบไฟล์");
{
  const rows = api.split("\n").filter((l) => /^\|\s*(GET|POST|PATCH|PUT|DELETE)\s*\|\s*`?\/api\/mobile\//.test(l));
  chk("D1.13", `ตาราง API ≥ 25 แถว (method | path | …) — มี ${rows.length}`, rows.length >= 25, `พบ ${rows.length}`);
  const noAuth = rows.filter((l) => !/Bearer/.test(l));
  chk("D1.14", "ทุกแถวระบุ auth Bearer", rows.length > 0 && noAuth.length === 0, `ไม่มี Bearer ${noAuth.length} แถว: ${noAuth.slice(0, 2).map((l) => l.slice(0, 60)).join(" · ")}`);
  const noMark = rows.filter((l) => !/\b(NEW|EXISTS)\b/.test(l));
  chk("D1.15", "ทุกแถวระบุ NEW หรือ EXISTS (ไฟล์)", rows.length > 0 && noMark.length === 0, `ไม่มีป้าย ${noMark.length} แถว`, "MAJOR");
  const REQ = ["/api/mobile/secretary/rooms", "/api/mobile/secretary/quota", "/api/mobile/secretary/proposals", "/api/mobile/secretary/inbox", "/api/mobile/secretary/scheduled", "/api/mobile/inbox/systems", "/api/mobile/inbox/conversations", "/api/mobile/auth/sms/request", "/api/mobile/auth/sms/verify", "/api/mobile/tenants", "/api/mobile/staff/invite", "/api/mobile/help/cases", "/api/mobile/account/delete", "/api/mobile/me"];
  const missing = REQ.filter((p) => !api.includes(p));
  chk("D1.16", `path บังคับครบ ${REQ.length}`, missing.length === 0, `ขาด ${missing.join(", ")}`);
}
{
  const secret = /(sk-ant-[A-Za-z0-9_-]{8,}|sk-or-[A-Za-z0-9_-]{8,}|postgres(ql)?:\/\/[^\s@]+:[^\s@]+@|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{12,})/;
  const hit = [doc, api, rd(join(ROOT, "scripts/sec-qc-data.mts"))].map((t) => t.match(secret)?.[0]).filter(Boolean);
  chk("D1.17", "ไม่มีสตริงคล้ายคีย์/URL ฐานข้อมูลในเอกสาร+ข้อมูล QC", hit.length === 0, `พบ ${hit[0]?.slice(0, 12)}…`);
}

// ═══════════════ D2 seed ═══════════════
console.log("D2 seed");
const ENVF = join(ROOT, "scripts/sec-qc-env.mts"), DATAF = join(ROOT, "scripts/sec-qc-data.mts"), SEEDF = join(ROOT, "scripts/seed-secretary-qc.mts");
{
  const e = rd(ENVF), d = rd(DATAF), s = rd(SEEDF);
  chk("D2.1", "sec-qc-env.mts: export loadSecQcEnv · ยอมเฉพาะ ep-calm-flower-aosbmxhm · exit(4) · ไม่ import @/ หรือ prisma", /export function loadSecQcEnv/.test(e) && e.includes(SEC_HOST) && /exit\(4\)/.test(e) && !/from "@\//.test(e) && !/prisma/i.test(e.replace(/\/\/.*$/gm, "")), "ตรวจไฟล์");
  chk("D2.2", "sec-qc-data.mts: pure (ไม่มี @/ · prisma) · export SEC · มี secqc-tenant/secqc-tenant-b/secqc-owner/secqc-manager/+66800000", /export const SEC\b/.test(d) && !/from "@\//.test(d) && !/prisma/i.test(d.replace(/\/\/.*$/gm, "")) && ["secqc-tenant\"", "secqc-tenant-b", "secqc-owner", "secqc-manager", "+66800000"].every((k) => d.includes(k)), "ตรวจไฟล์");
  chk("D2.3", "seed-secretary-qc.mts: เรียก loadSecQcEnv ก่อน import prisma · ใช้ newConversationId · พิมพ์ JSON_SUMMARY", s.indexOf("loadSecQcEnv(") > 0 && s.indexOf("loadSecQcEnv(") < s.indexOf("@/lib/core/db") && /newConversationId/.test(s) && /JSON_SUMMARY/.test(s), "ตรวจไฟล์");
}
const seedEnvBase = { ...process.env } as Record<string, string | undefined>;
function runSeed(env: Record<string, string | undefined>) {
  return spawnSync("pnpm", ["exec", "tsx", "scripts/seed-secretary-qc.mts"], { cwd: ROOT, encoding: "utf8", env: env as NodeJS.ProcessEnv, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
}
{
  // ด่าน: prod · RUN อื่น · ไม่มี env — ทุกกรณีต้อง exit 4 และไม่มี SEED_SUMMARY
  const fakeProd = "postgresql://u:p@ep-royal-night-zzz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const fakeSvc = "postgresql://u:p@ep-mute-scene-zzz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
  const cases: [string, Record<string, string | undefined>][] = [
    ["prod", { ...seedEnvBase, DATABASE_URL: fakeProd, DIRECT_URL: fakeProd, QC_ENV_FILE: "/nonexistent.env", SEC_QC_HOST: "ep-royal-night-zzz" }],
    ["svc", { ...seedEnvBase, DATABASE_URL: fakeSvc, DIRECT_URL: fakeSvc, QC_ENV_FILE: "/nonexistent.env", SEC_QC_HOST: "ep-mute-scene-zzz" }],
    ["none", { ...seedEnvBase, DATABASE_URL: undefined, DIRECT_URL: undefined, QC_ENV_FILE: "/nonexistent.env", SEC_QC_HOST: undefined }],
  ];
  for (const [name, env] of cases) {
    if (!existsSync(SEEDF)) { skip(`D2.4.${name}`, `ด่าน host (${name})`, "ไม่มี seed"); continue; }
    const r = runSeed(env);
    chk(`D2.4.${name}`, `ด่าน host: ${name} ⇒ exit 4 ไม่แตะฐาน`, r.status === 4 && !/SEED_SUMMARY/.test(r.stdout ?? ""), `exit=${r.status} ${(r.stderr ?? "").slice(-160).replace(/\n/g, " ")}`);
  }
}
if (!DB_OK || !existsSync(SEEDF)) {
  skip("D2.5", "seed ×2 + แถวร้านอื่น + เนื้อหา", DB_OK ? "ไม่มี seed" : "ไม่มี DATABASE_URL ของฐาน QC เลขา — รันผ่าน qc-sec.sh");
} else {
  const { prisma } = await import("@/lib/core/db");
  const notSec = { id: { not: { startsWith: "secqc-" } } };
  const notSecT = { tenantId: { not: { startsWith: "secqc-" } } };
  const others = async () => ({
    tenants: await prisma.tenant.count({ where: notSec }),
    users: await prisma.user.count({ where: notSec }),
    memberships: await prisma.membership.count({ where: notSecT }),
    aiConv: await prisma.aiConversation.count({ where: notSecT }),
    aiMsg: await prisma.aiMessage.count({ where: { conversation: notSecT } }).catch(() => -1),
    chatConv: await prisma.chatConversation.count({ where: notSecT }),
    cases: await prisma.supportCase.count({ where: notSecT }),
  });
  const secStamp = async () => {
    const t = { tenantId: { startsWith: "secqc-" } };
    const m = async (q: Promise<{ _max: { updatedAt: Date | null } }>) => (await q)._max.updatedAt?.toISOString() ?? "-";
    return [
      await m(prisma.aiConversation.aggregate({ where: t, _max: { updatedAt: true } })),
      await m(prisma.chatConversation.aggregate({ where: t, _max: { updatedAt: true } })),
      await m(prisma.supportCase.aggregate({ where: t, _max: { updatedAt: true } })),
      await m(prisma.membership.aggregate({ where: t, _max: { updatedAt: true } })),
    ].join("|");
  };
  const before = await others();
  const r1 = runSeed(seedEnvBase);
  const js = (out: string) => { try { return JSON.parse(out.split("\n").find((l) => l.startsWith("JSON_SUMMARY "))?.slice(13) ?? "null"); } catch { return null; } };
  const j1 = js(r1.stdout ?? "");
  chk("D2.5", "seed รอบ 1 exit 0 + JSON_SUMMARY ok", r1.status === 0 && j1?.ok === true, `exit=${r1.status} ${(r1.stderr ?? "").slice(-200).replace(/\n/g, " ")}`);
  const stamp1 = await secStamp();
  const r2 = runSeed(seedEnvBase);
  const j2 = js(r2.stdout ?? "");
  const empty = (o: unknown) => !o || Object.keys(o as object).length === 0;
  chk("D2.6", "seed รอบ 2 เขียน 0 (created/updated/removed ว่าง)", r2.status === 0 && j2?.ok === true && empty(j2.created) && empty(j2.updated) && empty(j2.removed), `exit=${r2.status} created=${JSON.stringify(j2?.created)} updated=${JSON.stringify(j2?.updated)} removed=${JSON.stringify(j2?.removed)}`);
  const stamp2 = await secStamp();
  chk("D2.7", "รอบ 2 ไม่แตะ updatedAt ของแถว secqc", stamp1 === stamp2, `${stamp1} → ${stamp2}`);
  const after = await others();
  chk("D2.8", "จำนวนแถวของร้านอื่นไม่เปลี่ยน", JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  chk("D2.9", "seed รายงาน TODO(S1.1) เมื่อโมเดล S1.1 ยังไม่มี (หรือไม่รายงานเมื่อมีแล้ว)", (("aiRoom" in prisma) ? !/TODO\(S1\.1\)/.test(r2.stdout ?? "") : /TODO\(S1\.1\)/.test(r2.stdout ?? "")), "ดู stdout ของ seed", "MINOR");
  // เนื้อหา
  const T = "secqc-tenant";
  const tenant = await prisma.tenant.findUnique({ where: { id: T } });
  const tenantB = await prisma.tenant.findUnique({ where: { id: "secqc-tenant-b" } });
  chk("D2.10", "ร้าน secqc-tenant (slug sec-qc) + secqc-tenant-b มีอยู่", !!tenant && tenant.slug === "sec-qc" && !!tenantB, "ไม่พบร้าน");
  const systems = await prisma.appSystem.findMany({ where: { tenantId: T } });
  const types = new Set(systems.map((s) => String(s.type)));
  chk("D2.11", "ระบบของร้าน: POS CRM MEMBER ACCOUNT KANBAN CHAT", ["POS", "CRM", "MEMBER", "ACCOUNT", "KANBAN", "CHAT"].every((t) => types.has(t)), `มี ${[...types].join(",")}`);
  const ms = await prisma.membership.findMany({ where: { tenantId: T } });
  const byUser = Object.fromEntries(ms.map((m) => [m.userId, m]));
  chk("D2.12", "สมาชิก: owner OWNER · manager MANAGER · staff ×3 STAFF (ids secqc-*)", byUser["secqc-owner"]?.role === "OWNER" && byUser["secqc-manager"]?.role === "MANAGER" && ["secqc-staff-sales", "secqc-staff-dorm", "secqc-staff-guard"].every((u) => byUser[u]?.role === "STAFF") && ms.every((m) => m.acceptedAt), `พบ ${ms.map((m) => `${m.userId}:${m.role}`).join(",")}`);
  const perm = (u: string) => JSON.stringify(byUser[u]?.permissions ?? {});
  chk("D2.13", "guard ไม่มีคีย์ chat.* · sales มี chat.conversation.read + chat.message.send", !perm("secqc-staff-guard").includes('"chat.') && perm("secqc-staff-sales").includes('"chat.conversation.read"') && perm("secqc-staff-sales").includes('"chat.message.send"'), `guard=${perm("secqc-staff-guard").slice(0, 80)} sales=${perm("secqc-staff-sales").slice(0, 120)}`);
  const ownerB = await prisma.membership.findFirst({ where: { tenantId: "secqc-tenant-b", role: "OWNER" } });
  chk("D2.14", "ร้าน B เจ้าของคนละคน (secqc-owner-b)", ownerB?.userId === "secqc-owner-b", `owner B = ${ownerB?.userId}`);
  const convs = await prisma.aiConversation.findMany({ where: { tenantId: T } });
  chk("D2.15", "ห้อง AI ≥ 6 · id รูป u~secqc-… (จาก newConversationId)", convs.length >= 6 && convs.every((c) => /^u~secqc-/.test(c.id)), `n=${convs.length} ids=${convs.slice(0, 3).map((c) => c.id.slice(0, 24)).join(",")}`);
  const sales = convs.filter((c) => c.id.startsWith("u~secqc-staff-sales~"));
  chk("D2.16", "มีห้องที่ sales เป็นผู้สร้าง ≥ 1", sales.length >= 1, "ไม่พบ");
  const pend = await prisma.aiProposal.findMany({ where: { tenantId: T, status: "PENDING" } });
  const propsSrc = rd(join(ROOT, "src/lib/ai/proposals.ts"));
  chk("D2.17", "มีข้อเสนอ PENDING ≥ 1 ในห้อง secqc · kind อยู่ใน proposals.ts · expiresAt อนาคต", pend.length >= 1 && pend.every((p) => /^u~secqc-/.test(p.conversationId) && propsSrc.includes(`"${p.kind}"`) && p.expiresAt > new Date()), `n=${pend.length} kinds=${pend.map((p) => p.kind).join(",")}`);
  const chats = await prisma.chatConversation.findMany({ where: { tenantId: T }, include: { messages: true } });
  chk("D2.18", "ห้องแชทลูกค้า 2 (id secqc-… · LINE + WEBCHAT) · 4 ข้อความ/ห้อง · มี isInternal ≥ 1 ต่อห้อง", chats.length === 2 && chats.every((c) => c.id.startsWith("secqc-") && c.messages.length === 4 && c.messages.some((m) => m.isInternal)) && new Set(chats.map((c) => String(c.channel))).size === 2, `n=${chats.length} ${chats.map((c) => `${c.id}:${String(c.channel)}:${c.messages.length}`).join(" ")}`);
  const qr = await prisma.chatQuickReply.count({ where: { tenantId: T } });
  chk("D2.19", "ตอบเร็ว 2 รายการ", qr === 2, `n=${qr}`, "MAJOR");
  const cases = await prisma.supportCase.findMany({ where: { tenantId: T } });
  chk("D2.20", "เคสช่วยเหลือ 1 (id secqc-… · OPEN · ผู้แจ้ง secqc-owner)", cases.length === 1 && cases[0].id.startsWith("secqc-") && String(cases[0].status) === "OPEN" && cases[0].openedByUserId === "secqc-owner", `n=${cases.length} ${cases[0] ? `${cases[0].id}:${String(cases[0].status)}:${cases[0].openedByUserId}` : ""}`);
  const users = await prisma.user.findMany({ where: { id: { startsWith: "secqc-" } } });
  chk("D2.21", "ผู้ใช้ secqc ทุกคนอีเมล @example.com (ไม่ใช่เมลจริง)", users.length >= 6 && users.every((u) => /@example\.com$/.test(u.email ?? "")), `n=${users.length}`);
  await prisma.$disconnect();
}

// ═══════════════ D3 pack ═══════════════
console.log("D3 pack");
{
  const src = rd(PACK);
  chk("D3.1", "pack.ts มีอยู่ · ไม่ import prisma/db · ไม่มี Date.now() · ไม่มี new Date() เปล่า · ไม่มี getter ตามเครื่อง", src.length > 0 && !/@\/lib\/core\/db|prisma/.test(src) && !/Date\.now\(/.test(src) && !/new Date\(\s*\)/.test(src) && !/\.get(Date|Month|FullYear|Hours|Day)\(/.test(src), "ตรวจไฟล์");
  if (!src) { skip("D3.2", "unit pack", "ไม่มีไฟล์"); }
  else {
    const P = await import("@/lib/ai/secretary/pack");
    chk("D3.2", "FREE_PACK = {enabled:true, jobsPerMonth:100, scheduledMax:10, approversMax:5} · SECRETARY_LAUNCH_AT เป็น ISO", JSON.stringify(P.FREE_PACK) === JSON.stringify({ enabled: true, jobsPerMonth: 100, scheduledMax: 10, approversMax: 5 }) && !Number.isNaN(Date.parse(P.SECRETARY_LAUNCH_AT)), `FREE_PACK=${JSON.stringify(P.FREE_PACK)} launch=${P.SECRETARY_LAUNCH_AT}`);
    const cj = [P.countsAsJob({ kind: "room_new" }), P.countsAsJob({ kind: "room_message" }), P.countsAsJob({ kind: "scheduled_run" }), P.countsAsJob({ kind: "room_new", couldNotAct: true }), P.countsAsJob({ kind: "scheduled_run", couldNotAct: true }), P.countsAsJob({ kind: "room_message", couldNotAct: false })];
    chk("D3.3", "countsAsJob: new=1 message=0 scheduled=1 couldNotAct⇒0", JSON.stringify(cj) === "[1,0,1,0,0,0]", `ได้ ${JSON.stringify(cj)}`);
    const reset = new Date("2026-11-30T17:00:00Z"); // 1 ธ.ค. 00:00 BKK
    const now = new Date("2026-11-10T03:00:00Z");
    const q = (u: number, l = 100) => P.quotaMessage(u, l, reset, now);
    const bad = (t: string | null) => t != null && /token|โทเคน|บาท|\$|USD/i.test(t);
    chk("D3.4", "quotaMessage 79/100 ⇒ ok · text null · jobsLeft 21 · pct 79", q(79).level === "ok" && q(79).text === null && q(79).jobsLeft === 21 && q(79).pct === 79, JSON.stringify(q(79)));
    chk("D3.5", "quotaMessage 80 ⇒ warn80 · text มี 80 + วันรีเซ็ต '1 ธ.ค.'", q(80).level === "warn80" && /80/.test(q(80).text ?? "") && /1 ธ\.ค\./.test(q(80).text ?? "") && !bad(q(80).text), JSON.stringify(q(80)));
    chk("D3.6", "quotaMessage 95 ⇒ warn95 · 99 ⇒ warn95", q(95).level === "warn95" && /95/.test(q(95).text ?? "") && q(99).level === "warn95" && !bad(q(95).text), JSON.stringify([q(95), q(99)]));
    chk("D3.7", "quotaMessage 100/101 ⇒ exhausted · text มี 'หมด' + '1 ธ.ค.' · jobsLeft 0 · 101 pct 101", q(100).level === "exhausted" && /หมด/.test(q(100).text ?? "") && /1 ธ\.ค\./.test(q(100).text ?? "") && q(101).level === "exhausted" && q(101).jobsLeft === 0 && q(101).pct === 101 && !bad(q(100).text), JSON.stringify([q(100), q(101)]));
    chk("D3.8", "quotaMessage limit 0 ⇒ exhausted pct 100", q(0, 0).level === "exhausted" && q(0, 0).pct === 100, JSON.stringify(q(0, 0)), "MAJOR");
    const iso = (d: Date) => d.toISOString();
    const nr: [string, string][] = [
      ["2026-11-04T05:00:00Z", "2026-11-30T17:00:00.000Z"],
      ["2026-12-31T16:59:59Z", "2026-12-31T17:00:00.000Z"], // 31 ธ.ค. 23:59:59 BKK → 1 ม.ค. 00:00 BKK
      ["2026-12-31T17:00:00Z", "2027-01-31T17:00:00.000Z"], // 1 ม.ค. 00:00 BKK → 1 ก.พ.
      ["2028-02-15T00:00:00Z", "2028-02-29T17:00:00.000Z"], // ปีอธิกสุรทิน → 1 มี.ค. 2028
      ["2027-01-31T16:30:00Z", "2027-01-31T17:00:00.000Z"], // 31 ม.ค. 23:30 BKK → 1 ก.พ.
    ];
    const nrBad = nr.filter(([a, b]) => iso(P.nextResetBangkok(new Date(a))) !== b).map(([a, b]) => `${a}→${iso(P.nextResetBangkok(new Date(a)))}≠${b}`);
    chk("D3.9", "nextResetBangkok: ขอบเดือน · ขอบปี · ปีอธิกสุรทิน (5 กรณี)", nrBad.length === 0, nrBad.join(" ; "));
    const mk: [string, string][] = [["2026-11-04T05:00:00Z", "2026-11"], ["2026-12-31T16:59:59Z", "2026-12"], ["2026-12-31T17:00:00Z", "2027-01"], ["2028-02-29T16:59:59Z", "2028-02"]];
    const mkBad = mk.filter(([a, b]) => P.monthKeyBangkok(new Date(a)) !== b).map(([a, b]) => `${a}→${P.monthKeyBangkok(new Date(a))}≠${b}`);
    chk("D3.10", "monthKeyBangkok: YYYY-MM ตามเดือนไทย (4 กรณี)", mkBad.length === 0, mkBad.join(" ; "));
  }
}

// ═══════════════ D4 fitness / typecheck ═══════════════
console.log("D4 fitness");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D4.1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ") || (f1.stderr ?? "").slice(-200));
  const env2 = { ...process.env } as Record<string, string | undefined>;
  delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2 as NodeJS.ProcessEnv, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D4.2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ") || (f2.stderr ?? "").slice(-200));
  if (process.env.QC_RUN_TSC === "1") {
    const t = spawnSync("pnpm", ["typecheck"], { cwd: ROOT, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=5632" } });
    chk("D4.3", "pnpm typecheck exit 0", t.status === 0, (t.stdout ?? "").split("\n").filter((l) => /error TS/.test(l)).slice(0, 3).join(" | "));
  } else skip("D4.3", "pnpm typecheck", "ตั้ง QC_RUN_TSC=1 เพื่อรันในข้อสอบ (ผู้คุมรันเองตอนรับใบ)", "MINOR");
}

const passed = cks.filter((c) => c.res === "PASS").length;
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
