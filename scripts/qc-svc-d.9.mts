// QC — SVC D.9 · ผู้เช่าผ่าน LINE + หน้าจ่าย/พอร์ทัลผู้เช่า (ลิงก์เซ็น) · oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-d.9.md (§3 สัญญา · §4 DOM · §6 จุดที่เลือกเอง · §8.1 สถานการณ์แข่ง) · ledger/SVC-MASTER-PLAN.md แถว D.9
//        CC §3 (submitSlip · promptpayQrFor) §4 (ChatLinkCode · postback-routes · notifyCustomer · signLink) · ภาพ ledger/design-dorm/05-line-tenant.png
//        บทเรียน /root/svc-runs/fix/{b9,b6,d8,d11,d3}.md
//
// กลุ่มข้อ:
//   S  โครงสร้าง/ไฟล์/ค่าตั้ง/สัญญาโค้ด (ไม่แตะชิ้นกลางนอกที่อนุญาต · ไม่ส่ง LINE ตรง · ไม่มีคำต้องห้าม สคบ.)
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): รอบบิล D.8 · signLink · รหัสผูก R0.7 · notifyCustomer OA เดียว · submitSlip · QR ยอดตรง · ตัวจำลอง LINE
//   B  ส่งบิลจริงจาก D.8 (consumer dorm.billrun.sent): Flex · OA ที่ตั้งเท่านั้น · ส่งซ้ำ/พร้อมกัน/หลายโพรเซส = 1 · อ่านสด (ใบลดหนี้ · จ่ายแล้ว · สัญญาจบ · VOID)
//      · ปิดช่องทาง · เวลาเงียบ + งานส่งซ้ำ (X5) · H hook ของ D.11 (payLink = ลิงก์พอร์ทัล)
//   L  รหัสผูกห้อง: ออก/ปฏิเสธ · ผูกซ้ำพร้อมกัน (หลายโพรเซส) ⇒ ผูก 1 · สัญญาจบ/หมดอายุ/ยกเลิกผูกไม่ได้ (คำตอบเดียวกับรหัสผิด)
//   K  postback dorm.*: เจ้าของเท่านั้น · ข้อความกลางเดียว (ไม่มี Party · Party อื่น · OA อื่น · สัญญาจบ · ร้านอื่น) · ลิงก์เซ็นอายุตามค่าตั้ง · สองสัญญา
//   R  rich menu: spec 6 ช่อง · OA ของหน่วยเท่านั้น · idempotent · ปิด/ไม่มี OA/OA ใช้ร่วม/สิทธิ์
//   P  พอร์ทัล: 404 เดียวกัน (ห้องอื่น · ร้านอื่น · purpose อื่น · ปลอม · หมดอายุ · สัญญาจบ/ยกเลิก/หมดอายุ — X1 X7) · ลิงก์เก่าก่อนย้ายออก · เวลาใกล้กัน · rate limit
//      · QR ยอดค้างสดตรงทุกสตางค์ · ใบเสร็จ · สัญญา/ไฟล์ (ไม่มีบัตร/ลายเซ็น) · แนบสลิป submitSlip(DORM_BILL)
//   A  รูปสลิปในแชท ⇒ แนบบิลเปิดเดียวของตัวเอง · กำกวมไม่แนบ · ไม่ใช่ผู้เช่าไม่ดึงรูป · ส่งซ้ำหลายโพรเซส = 1 · แข่งกับการรับเงิน
//   U  DOM DormPortal · M ข้อความ/สคบ./PII · Q ฉาก svcqc · V ภาพ + HTTP 404 เดียวกัน (QC_BASE) · Z ล้าง · G regression (หลังล้าง)
//
// 🔴 ไม่ยิง LINE จริง: ตัวจำลอง (node:http 127.0.0.1) + LINE_API_BASE + ครอบ fetch (นอกเครื่อง = บล็อก) · โพรเซสลูกได้ LINE_API_BASE/APP_URL เดียวกัน
// 🔴 APP_URL = https://qc-d9.invalid ในโพรเซสนี้ (ลิงก์พอร์ทัลเต็ม) · ร้านทดสอบ slug `qc-svc-d9-*` · ผู้ใช้ `svc-d9-*@shark.local` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.9.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = G เป็น SKIP · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_VISUAL_SPECS, SQC_DORM_PORTAL_SCENE, SQC_TENANT, SQC_UNITS, sqcPortalToken, sqcPortalSceneRead } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-d.9";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_D9_NO_REGRESSION === "1";
const ORIGIN = "https://qc-d9.invalid";
const F = {
  line: "src/lib/platform/dorm-line.ts",
  portal: "src/lib/platform/dorm-portal.ts",
  image: "src/lib/platform/dorm-richmenu-image.ts",
  dormPortal: "src/lib/modules/dorm/portal.ts",
  dormIndex: "src/lib/modules/dorm/index.ts",
  content: "src/lib/modules/chat/line-content.ts",
  chatIndex: "src/lib/modules/chat/index.ts",
  webhook: "src/app/api/chat/webhook/[connectionId]/route.ts",
  page: "src/app/(store)/d/[token]/page.tsx",
  actions: "src/app/(store)/d/[token]/actions.ts",
  receipt: "src/app/(store)/d/[token]/receipt/page.tsx",
  lease: "src/app/(store)/d/[token]/lease/page.tsx",
  file: "src/app/(store)/d/[token]/f/[fileId]/route.ts",
  comp: "src/components/dorm/portal/DormPortal.tsx",
  staffPage: "src/app/app/u/[unitSlug]/dorm/tenants/[leaseId]/line/page.tsx",
  staffActions: "src/app/app/u/[unitSlug]/dorm/tenants/[leaseId]/line/actions.ts",
  staffCard: "src/components/dorm/DormLineCard.tsx",
  scene: "scripts/svc-qc-portal-scene.mts",
  postback: "src/lib/platform/postback-routes.ts",
  consumers: "src/lib/outbox-consumers.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  dunning: "src/lib/modules/dorm/dunning.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  posD: "src/app/(store)/d/page.tsx",
  posDActions: "src/app/(store)/d/actions.ts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
// ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — ตัวตรวจสลิป FAKE แบบเดียวกับ qc-svc-r0.6 (INTEGRATIONS_FAKE=1 · กุญแจลับของรอบเมื่อยังไม่มี) · คืนค่าเดิมก่อนหมวด G
const INT_ENV_SAVED = { fake: process.env.INTEGRATIONS_FAKE, key: process.env.INTEGRATIONS_CREDENTIALS_KEY };
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** รูป PNG ที่ผ่าน magic (เนื้อกำหนดจาก seed ⇒ messageId เดิม = ไบต์เดิม = แฮชเดิม) */
const pngOf = (seed: string): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from(PNG_SIG), createHash("sha256").update(`qc-d9:${seed}`).digest(), createHash("sha256").update(seed).digest()]));
const noopDeps = { put: async () => {}, del: async () => 200 };

// ═══════════════ โหมดโพรเซสลูก (`--child <base64 JSON>`) — ยิงพร้อมกันจากโพรเซสแยก (ไม่สร้างข้อมูล/ไม่ล้าง) ═══════════════
{
  const ix = process.argv.indexOf("--child");
  if (ix >= 0) {
    let out: unknown[] = [];
    try {
      const job = JSON.parse(Buffer.from(process.argv[ix + 1] ?? "", "base64url").toString("utf8")) as { op: string; items: Any[]; at: number };
      const wait = job.at - Date.now();
      const runOne = async (x: Any): Promise<unknown> => {
        if (job.op === "link") return (await import("@/lib/platform/postback-routes" as string)).handleLinkCodeText(x.ctx, x.text);
        if (job.op === "image") {
          if (!existsSync(join(ROOT, F.line))) return { childFail: `ยังไม่มี ${F.line}` };
          const m = (await import(pathToFileURL(join(ROOT, F.line)).href)) as Any;
          if (typeof m.onLineImage !== "function") return { childFail: "ไม่มี onLineImage" };
          return m.onLineImage(x.ctx, { messageId: x.messageId }, { deps: noopDeps });
        }
        if (job.op === "consume") { await (await import("@/lib/outbox-consumers" as string)).consumers["dorm.billrun.sent"](x.evt); return { ok: true }; }
        if (job.op === "pay") return (await import("@/lib/modules/account" as string)).recordExternalPayment({ ...x.input, paidAt: new Date(x.input.paidAt) });
        return { childFail: `op ${job.op}` };
      };
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      out = await Promise.all(job.items.map(async (x) => { try { return await runOne(x); } catch (e) { return { threw: errMsg(e) }; } }));
    } catch (e) { out = [{ childFail: errMsg(e) }]; }
    console.log(`CHILD_RESULT ${JSON.stringify(out)}`);
    try { const { prisma } = (await import("@/lib/core/db" as string)) as Any; await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
    process.exit(0);
  }
}

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const LEGAL_BAD = /ล็อ[กค]ห้อง|ล็อ[กค]ประตู|ตัดน้ำ|ตัดไฟ|ระงับ(การ)?(จ่าย)?(น้ำ|ไฟ)|งด(จ่าย)?(น้ำ|ไฟ)|ยึดทรัพย์|ยึดของ|ขนของออก|เข้าห้องโดยไม่/;
const PHONE_RE = /(\+?66|0)[689]\d{8}/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (existsSync(join(ROOT, rel)) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return v;
};
/** PromptPay EMV: ค่าของ tag ระดับบน */
const emvTag = (payload: string, tag: string): string | null => {
  let i = 0;
  while (i + 4 <= payload.length) {
    const t = payload.slice(i, i + 2), l = Number(payload.slice(i + 2, i + 4));
    if (!Number.isFinite(l)) return null;
    if (t === tag) return payload.slice(i + 4, i + 4 + l);
    i += 4 + l;
  }
  return null;
};
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
process.env.APP_URL = ORIGIN;
type FakeReq = { method: string; path: string; auth: string; json: Any; status: number; bytes: number };
const FAKE: FakeReq[] = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: Any = null;
    if (String(req.headers["content-type"] ?? "").includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), json, status: 0, bytes: raw.length };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const content = /^\/v2\/bot\/message\/([^/]+)\/content$/.exec(path);
    if (req.method === "GET" && content) {
      if (content[1].startsWith("404")) return send(404, { message: "not found" });
      rec.status = 200;
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(Buffer.from(pngOf(`line-${content[1]}`)));
    }
    if (req.method === "POST" && path === "/v2/bot/message/push") return send(200, { sentMessages: [{ id: `fm${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "POST" && path === "/v2/bot/richmenu") return send(200, { richMenuId: `richmenu-qcd9${FAKE.length}` });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ผู้เช่าคิวซี", userId: path.split("/").pop() });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const LINE_API_BASE_SAVED = process.env.LINE_API_BASE;
process.env.LINE_API_BASE = FAKE_BASE;
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const mark = () => FAKE.length;
const since = (m: number) => FAKE.slice(m);
const pushes = (m: number) => since(m).filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const pushesTo = (ext: string, m: number) => pushes(m).filter((r) => r.json?.to === ext);
const msgOf = (r: FakeReq | undefined): Any => r?.json?.messages?.[0];
const contentGets = (m: number) => since(m).filter((r) => r.method === "GET" && /\/content$/.test(r.path));

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const lineL = await loadIf(F.line);
const portalL = await loadIf(F.portal);
const imageL = await loadIf(F.image);
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SL = (await tryImport("@/lib/core/signed-link")).mod as Any;
const PB = (await tryImport("@/lib/platform/postback-routes")).mod as Any;
const CHAT = (await tryImport("@/lib/modules/chat")).mod as Any;
const NC = (await tryImport("@/lib/platform/notify-customer")).mod as Any;
const SLIP = (await tryImport("@/lib/payment/slip-verify")).mod as Any;
const RCV = (await tryImport("@/lib/payment/receiver")).mod as Any;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const ACC = (await tryImport("@/lib/modules/account")).mod as Any;
const SYS = (await tryImport("@/lib/modules/system/service")).mod as Any;
const ASV = (await tryImport("@/lib/modules/account/service")).mod as Any;
const GL = (await tryImport("@/lib/modules/account/gl")).mod as Any;
const DORM = (await tryImport("@/lib/modules/dorm")).mod as Any;
const OC = (await tryImport("@/lib/outbox-consumers")).mod as Any;
const INT = (await tryImport("@/lib/core/integrations")).mod as Any; // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3)
const PRISMA_NS = ((await tryImport("@prisma/client")).mod as Any)?.Prisma;
const LN = {
  issue: () => fnOf(lineL, "issueDormLinkCode", F.line),
  resolve: () => fnOf(lineL, "resolveDormParty", F.line),
  postback: () => fnOf(lineL, "onDormPostback", F.line),
  linked: () => fnOf(lineL, "onDormLinked", F.line),
  spec: () => fnOf(lineL, "dormRichMenuSpec", F.line),
  sync: () => fnOf(lineL, "syncDormRichMenu", F.line),
  flex: () => fnOf(lineL, "dormBillFlex", F.line),
  send: () => fnOf(lineL, "sendDormBill", F.line),
  jobs: () => fnOf(lineL, "runDormLineJobs", F.line),
  image: () => fnOf(lineL, "onLineImage", F.line),
  NF: (): string => { const t = valOf(lineL, "DORM_POSTBACK_NOT_FOUND", F.line); ok(typeof t === "string" && THAI.test(t), "DORM_POSTBACK_NOT_FOUND ต้องเป็นข้อความไทย"); return t; },
};
const PT = {
  url: () => fnOf(portalL, "portalUrl", F.portal),
  load: () => fnOf(portalL, "loadPortal", F.portal),
  slip: () => fnOf(portalL, "submitPortalSlip", F.portal),
  receipt: () => fnOf(portalL, "loadPortalReceipt", F.portal),
  lease: () => fnOf(portalL, "loadPortalLease", F.portal),
  file: () => fnOf(portalL, "portalFileRef", F.portal),
};
const URL_RE = /https:\/\/qc-d9\.invalid\/d\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(\/lease)?(\?bill=([A-Za-z0-9_-]+))?/g;
const portalLinks = (v: unknown): { token: string; lease: boolean; bill: string | null; sub: { tenantId: string; subjectId: string } | null }[] =>
  [...J(v).matchAll(URL_RE)].map((m) => ({ token: m[1], lease: !!m[2], bill: m[4] ?? null, sub: SL?.verifyLink?.(m[1], "dorm.portal") ?? null }));
const tokenExpSec = (token: string): number => { try { return Number(JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")).e); } catch { return NaN; } };

// ═══════════════ ฐานข้อมูล: ล้าง ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const soft = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ไม่เป็นไร */ } };
  await soft(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: { in: tids } }, data: { reversalOfId: null } }));
  await soft(() => prisma.accountDocumentPayment.updateMany({ where: { tenantId: { in: tids } }, data: { chequeId: null, whtCertDocId: null } }));
  await soft(() => prisma.accountDocument.updateMany({ where: { tenantId: { in: tids } }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
  await soft(() => prisma.accountLedger.updateMany({ where: { tenantId: { in: tids } }, data: { parentId: null } }));
  await soft(() => prisma.dormMeter.updateMany({ where: { tenantId: { in: tids } }, data: { replacedById: null } }));
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const CK = (k: string) => `qc-d9-${STAMP}-${k}`;
async function cleanupMisc(tids: string[]) {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: "svc-d9-" } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d9-${STAMP}%`);
    for (const t of tids) await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `chat-link:${t}:%`);
  } catch (e) { console.log(`  ⚠️ ลบ rate bucket: ${errMsg(e)}`); }
}
const parkOutbox = async (tids: string[]) => { await prisma.$executeRawUnsafe(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 days' WHERE "tenantId" = ANY($1::text[]) AND status::text = 'PENDING'`, tids); };

// ═══════════════ ยิงพร้อมกันจากโพรเซสลูก ═══════════════
const SYNC_MS = 13_000;
async function fanout(op: string, groups: Any[][], at: number): Promise<Any[]> {
  const outs = await Promise.all(groups.map((items) => new Promise<Any[]>((resolve) => {
    const job = { op, items, at };
    const child = spawn(process.execPath, [...process.execArgv, SELF, "--child", Buffer.from(JSON.stringify(job)).toString("base64url")], { cwd: ROOT, env: process.env });
    let buf = "";
    child.stdout.on("data", (d) => { buf += String(d); });
    child.stderr.on("data", (d) => { buf += String(d); });
    child.on("close", (code) => {
      const m = /CHILD_RESULT (\[.*\])/.exec(buf);
      try { resolve(m ? (JSON.parse(m[1]) as Any[]) : items.map(() => ({ childFail: `exit=${code} ${buf.split("\n").slice(-3).join(" | ").slice(0, 200)}` }))); }
      catch { resolve(items.map(() => ({ childFail: "อ่านผลลูกไม่ได้" }))); }
    });
  })));
  return outs.flat();
}
const atIn = (ms = SYNC_MS) => Date.now() + ms;
const inProcAt = async <T,>(at: number, calls: (() => Promise<T>)[]) => { const w = at - Date.now(); if (w > 0) await sleep(w); return Promise.all(calls.map(async (c) => { try { return await c(); } catch (e) { return { threw: errMsg(e) } as Any; } })); };
const badOf = (rs: Any[]) => rs.filter((r) => r?.threw || r?.childFail || /P2028|P2024|P2002|40P01|Unique constraint/i.test(J(r)));

// ═══════════════ ฉาก (วันที่ตายตัว) ═══════════════
const P1 = "2026-10", P2 = "2026-11";
const NOW1 = "2026-09-25T03:00:00.000Z";   // เตรียม/ส่งรอบ ต.ค.
const NOW2 = "2026-10-25T03:00:00.000Z";   // เตรียม/ส่งรอบ พ.ย.
const NOWQ = "2026-10-26T15:00:00.000Z";   // 22:00 ไทย (เวลาเงียบ)
const NOWQ2 = "2026-10-27T01:05:00.000Z";  // 08:05 ไทย
const NOW_DUN = "2026-10-08T03:00:00.000Z"; // เลยกำหนด ต.ค. 3 วัน 10:00 ไทย
const RENT = 450_000, COMMON = 30_000, BASE = RENT + COMMON;
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const tenantIds: string[] = [];
const PHONES: string[] = [];
const NAMES: string[] = [];
const RESULTS: unknown[] = [];
const REPLIES: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };
let ready = false;
const needReady = () => ok(ready, "ฉากข้อมูลทดสอบสร้างไม่สำเร็จ (ดู PC-1)");

// สถานะที่ข้อหลังใช้
const ids: Record<string, string> = {};
const bills: Record<string, Any> = {};          // "L1:2026-11" → แถวบิล
const C: Record<string, { id: string; ext: string; partyId: string | null; conn: string }> = {};
let tokenL3old = "";
let portalUrlL3before: string | null = null;
let codeL3 = "";

console.log(`\n(ตัวจำลอง LINE ${FAKE_BASE} · APP_URL ${ORIGIN})`);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-d9-" } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc([]);

  // ═══════════════ S (ไม่แตะฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const NEW_FILES = [F.line, F.portal, F.image, F.dormPortal, F.content, F.page, F.actions, F.receipt, F.lease, F.file, F.comp, F.staffPage, F.staffActions, F.staffCard, F.scene];
  await st("S-3", "มีไฟล์ของใบครบ 15 ไฟล์ (§1)", () => { const miss = NEW_FILES.filter((f) => !existsSync(join(ROOT, f))); ok(!miss.length, `ขาด ${miss.join(", ")}`); });
  await st("S-4", "facade: dorm-line 12 ชื่อ · dorm-portal 8 ชื่อ · chat facade export fetchLineMessageContent", () => {
    const L = ["DORM_POSTBACK_NOT_FOUND", "DORM_MENU", "issueDormLinkCode", "resolveDormParty", "onDormPostback", "onDormLinked", "dormRichMenuSpec", "syncDormRichMenu", "dormBillFlex", "sendDormBill", "onDormBillSent", "runDormLineJobs", "onLineImage"];
    const P = ["DORM_PORTAL_PURPOSE", "PORTAL_RATE", "portalUrl", "loadPortal", "submitPortalSlip", "loadPortalReceipt", "loadPortalLease", "portalFileRef"];
    const ml = L.filter((n) => lineL.mod?.[n] === undefined), mp = P.filter((n) => portalL.mod?.[n] === undefined);
    ok(!ml.length && !mp.length, `dorm-line ขาด ${ml.join(",") || "—"} (${lineL.err || "โหลดได้"}) · dorm-portal ขาด ${mp.join(",") || "—"} (${portalL.err || "โหลดได้"})`);
    ok(typeof CHAT?.fetchLineMessageContent === "function", "@/lib/modules/chat ไม่มี fetchLineMessageContent");
    eq(portalL.mod.DORM_PORTAL_PURPOSE, "dorm.portal", "DORM_PORTAL_PURPOSE");
    eq(J(portalL.mod.PORTAL_RATE), J({ view: { limit: 120, windowMs: 600_000 }, slip: { limit: 10, windowMs: 600_000 } }), "PORTAL_RATE");
    eq((lineL.mod.DORM_MENU as Any[]).map((m) => m.action), ["bills", "repair", "announce", "lease", "parcel", "contact"], "DORM_MENU");
  });
  await st("S-5", "หน้า /d/[token] (+ receipt · lease · f/[fileId]): server · ไม่มี session · loadPortal*/portalFileRef → notFound/404 · force-dynamic · robots noindex · referrer no-referrer · route ไฟล์ no-store", () => {
    const p = stripComments(read(F.page)), r = stripComments(read(F.receipt)), l = stripComments(read(F.lease)), f = stripComments(read(F.file));
    ok(p && r && l && f, "ยังไม่มีไฟล์หน้า");
    const bad: string[] = [];
    for (const [n, s, fn] of [["page", p, "loadPortal"], ["receipt", r, "loadPortalReceipt"], ["lease", l, "loadPortalLease"]] as const) {
      if (/^\s*["']use client["']/.test(read(n === "page" ? F.page : n === "receipt" ? F.receipt : F.lease))) bad.push(`${n}: use client`);
      if (!new RegExp(`\\b${fn}\\s*\\(`).test(s) || !/notFound\s*\(/.test(s)) bad.push(`${n}: ไม่เรียก ${fn}/notFound`);
      if (!/force-dynamic/.test(s) || !/index:\s*false/.test(s)) bad.push(`${n}: force-dynamic/noindex`);
      if (/requireUnit|getSession|requireMembership|@\/lib\/core\/db|@prisma\//.test(s)) bad.push(`${n}: แตะ session/prisma`);
    }
    if (!/referrer:\s*["']no-referrer["']/.test(p)) bad.push("page: ไม่มี referrer no-referrer");
    if (!/portalFileRef\s*\(/.test(f) || !/no-store/.test(f) || !/404/.test(f)) bad.push("route ไฟล์: portalFileRef/no-store/404");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-6", "actions.ts: 'use server' · export async function เท่านั้น (submitPortalSlipAction) · เรียก submitPortalSlip โดยไม่ส่ง deps/policy · clientKey จาก x-real-ip · ไม่รับ tenantId/ยอดจากฟอร์ม", () => {
    const a = read(F.actions);
    ok(a, `ยังไม่มี ${F.actions}`);
    ok(/^\s*["']use server["']/.test(a), "ไม่มี use server บรรทัดแรก");
    const code = stripComments(a);
    ok(!/export\s+(const|let|type|interface|default|class|function\s)/.test(code.replace(/export\s+async\s+function/g, "")), "export อื่นที่ไม่ใช่ async function");
    ok(/export\s+async\s+function\s+submitPortalSlipAction\b/.test(code) && /submitPortalSlip\s*\(/.test(code), "ไม่มี submitPortalSlipAction → submitPortalSlip");
    ok(/x-real-ip/.test(code), "clientKey ไม่อ่าน x-real-ip");
    ok(!/\bdeps\s*:|\bpolicy\s*:|\bput\s*:/.test(code), "ส่ง deps/policy จาก action");
    ok(!/get\(\s*["'](tenantId|expectedSatang|amount|unitId|leaseId)["']\s*\)/.test(code), "อ่าน tenantId/ยอด/หน่วยจากฟอร์ม");
  }, "MAJOR");
  await st("S-7", "DormPortal.tsx: 'use client' บรรทัดแรก · default export · ไม่ import โมดูล server/actions/next/* (import type ได้)", () => {
    const s = read(F.comp);
    ok(s, `ยังไม่มี ${F.comp}`);
    ok(/^\s*["']use client["']/.test(s), "ไม่มี use client");
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
    const bad = imps.filter((x) => /^@prisma\//.test(x) || /^@\/lib\/(modules|platform|core\/db|core\/settings|payment|storage)/.test(x) || /^next\//.test(x) || /actions$/.test(x));
    ok(!bad.length, `import ต้องห้าม ${bad.join(", ")}`);
    ok(/export\s+default\b/.test(s), "ไม่มี default export");
  }, "MAJOR");
  await st("S-9", "consumer dorm.billrun.sent = งานจริง (dynamic import dorm-line → onDormBillSent) · ไม่มี event ใหม่ใน consumers", () => {
    const s = stripComments(read(F.consumers));
    const i = s.search(/["']dorm\.billrun\.sent["']\s*:/);
    ok(i >= 0, "ไม่มี consumer dorm.billrun.sent");
    const blk = s.slice(i, i + 400);
    ok(/import\(\s*["']@\/lib\/platform\/dorm-line["']\s*\)/.test(blk) && /onDormBillSent\s*\(/.test(blk) && !/async\s*\(\)\s*=>\s*\{\s*\}/.test(blk.split("\n")[0] ?? ""), `บล็อก: ${blk.slice(0, 160).replace(/\s+/g, " ")}`);
  }, "MAJOR");
  await st("S-10", "minute-jobs: dorm.line ทุก 5 นาที (import ตอนรัน · runDormLineJobs)", () => {
    const mj = read(F.minute);
    const i = mj.search(/name:\s*["']dorm\.line["']/);
    ok(i >= 0, "ไม่มีงาน dorm.line");
    const blk = mj.slice(i, i + 500);
    ok(/everyMinutes:\s*5\b/.test(blk) && /import\(\s*["']@\/lib\/platform\/dorm-line["']\s*\)/.test(blk) && /runDormLineJobs\s*\(/.test(blk), blk.slice(0, 200).replace(/\s+/g, " "));
  }, "MAJOR");
  await st("S-11", "ค่าตั้งใหม่ 4 คีย์ (ป้ายไทย · ชั้น UNIT · กลุ่มเดิม notify/payment · ค่าเริ่ม/ช่วง) + ไฟล์ของใบอ่านนโยบายจากทะเบียน (ไม่ฝังเลขอายุ)", () => {
    const want: [string, string, string, unknown, unknown[], unknown[]][] = [
      ["rooms.notify.portalLinkDays", "notify", "days", 35, [1, 90], [0, 91, 1.5]],
      ["rooms.notify.linkCodeDays", "notify", "days", 30, [1, 30], [0, 31]],
      ["rooms.notify.richMenu", "notify", "bool", true, [true, false], ["x"]],
      ["rooms.payment.slipAutoAttach", "payment", "bool", true, [true, false], [1]],
    ];
    const bad: string[] = [];
    for (const [k, g, ty, fb, good, no] of want) {
      const d = SET?.getDef?.(k);
      if (!d) { bad.push(`${k} ไม่มี`); continue; }
      if (d.group !== g || d.type !== ty || !THAI.test(d.labelTh ?? "") || !(d.chain as string[]).includes("UNIT") || !isDeepStrictEqual(d.defaults?._fallback, fb)) bad.push(`${k} ${J({ g: d.group, ty: d.type, fb: d.defaults?._fallback })}`);
      for (const v of good) if (d.schema?.safeParse?.(v)?.success !== true) bad.push(`${k} ไม่รับ ${J(v)}`);
      for (const v of no) if (d.schema?.safeParse?.(v)?.success === true) bad.push(`${k} รับ ${J(v)}`);
    }
    const ls = stripComments(read(F.line)), ps = stripComments(read(F.portal));
    for (const k of ["rooms.notify.linkCodeDays", "rooms.notify.richMenu", "rooms.payment.slipAutoAttach", "messaging.lineConnectionId"]) if (!ls.includes(k)) bad.push(`dorm-line ไม่อ่าน ${k}`);
    if (!ps.includes("rooms.notify.portalLinkDays")) bad.push("dorm-portal ไม่อ่าน portalLinkDays");
    if (/\b(43200|50400|129600)\b/.test(ls + ps)) bad.push("ฝังเลขอายุ (นาที) ในไฟล์ platform");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("S-12", "ตัวเชื่อมสลับได้: ไฟล์ของใบไม่ส่ง LINE ตรง (push*/sendLineToParty/replyFlex/api.line.me) · ส่งบิลผ่าน notifyCustomer · เมนูผ่าน syncRichMenu · สลิปผ่าน submitSlip · พอร์ทัลใช้ verifyLink + checkRateLimitDb + promptpayQrFor", () => {
    const files = [F.line, F.portal, F.page, F.actions, F.receipt, F.lease, F.file, F.dormPortal];
    const bad: string[] = [];
    for (const f of files) { const m = /\b(pushLineMessagesToContact|pushFlexToParty|sendLineToParty|pushToContact|replyFlex|replyLineMessages)\b|api(-data)?\.line\.me/.exec(stripComments(read(f))); if (m) bad.push(`${f}: ${m[0]}`); }
    const ls = stripComments(read(F.line)), ps = stripComments(read(F.portal));
    for (const [s, re, n] of [[ls, /notifyCustomer\s*\(/, "dorm-line notifyCustomer"], [ls, /syncRichMenu\s*\(/, "dorm-line syncRichMenu"], [ls, /submitSlip\s*\(/, "dorm-line submitSlip"], [ls, /fetchLineMessageContent\s*\(/, "dorm-line fetchLineMessageContent"],
      [ps, /verifyLink\s*\(/, "portal verifyLink"], [ps, /checkRateLimitDb\s*\(/, "portal checkRateLimitDb"], [ps, /promptpayQrFor\s*\(/, "portal promptpayQrFor"], [ps, /submitSlip\s*\(/, "portal submitSlip"]] as const) if (!re.test(s)) bad.push(`ไม่มี ${n}`);
    ok(ls && ps && !bad.length, bad.join(" · ") || "ยังไม่มีไฟล์");
  }, "MAJOR");
  await st("S-13", "ไม่มี any · ไม่มี getDay/getDate/getMonth/getHours/getFullYear ดิบ · ไฟล์ platform/dorm portal ไม่ import prisma ดิบ (F5.1)", () => {
    const files = [F.line, F.portal, F.dormPortal, F.content, F.page, F.actions, F.receipt, F.lease, F.file, F.comp, F.staffPage, F.staffActions, F.staffCard];
    const miss = files.filter((f) => !existsSync(join(ROOT, f)));
    ok(!miss.length, `ยังไม่มี ${miss.join(", ")}`);
    const anyUse = files.filter((f) => /:\s*any\b|as\s+any\b|<any>/.test(stripComments(read(f))));
    const raw = files.filter((f) => /\.(getDay|getDate|getMonth|getHours|getFullYear)\s*\(\s*\)/.test(stripComments(read(f))));
    const pr = [F.line, F.portal, F.dormPortal].filter((f) => /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(read(f)));
    ok(!anyUse.length && !raw.length && !pr.length, `any=${anyUse.join(",") || "—"} เวลาเครื่อง=${raw.join(",") || "—"} prisma ดิบ=${pr.join(",") || "—"}`);
  }, "MAJOR");
  await st("S-16", "รูปเมนูล่าง: DORM_RICHMENU_PNG_BASE64 = PNG 2500×1686 · ≤ 1 MB", () => {
    const b64 = imageL.mod?.DORM_RICHMENU_PNG_BASE64;
    ok(typeof b64 === "string" && b64.length > 100, `ไม่มี DORM_RICHMENU_PNG_BASE64 (${imageL.err})`);
    const buf = Buffer.from(b64, "base64");
    ok(buf.subarray(0, 8).equals(Buffer.from(PNG_SIG)), "ไม่ใช่ PNG");
    eq([buf.readUInt32BE(16), buf.readUInt32BE(20)], [2500, 1686], "ขนาด");
    ok(buf.length <= 1_048_576, `ใหญ่ ${buf.length}`);
  }, "MAJOR");
  await st("S-17", "ไม่มีคำต้องห้าม สคบ. (ตัดน้ำไฟ · ล็อกห้อง · ยึดของ · เข้าห้องโดยไม่…) และไม่มีฟังก์ชันชื่อทำนองนั้นในไฟล์ของใบ", () => {
    const bad: string[] = [];
    for (const f of NEW_FILES) { const s = read(f); const m = LEGAL_BAD.exec(stripComments(s)); if (m) bad.push(`${f}: ${m[0]}`); if (/function\s+\w*(cutWater|cutPower|cutElec|lockRoom|seize)\w*/i.test(s)) bad.push(`${f}: ฟังก์ชันต้องห้าม`); }
    ok(existsSync(join(ROOT, F.line)) && !bad.length, bad.join(" · ") || "ยังไม่มีไฟล์");
  });
  await st("S-18", "(ผู้เขียนข้อสอบตั้งแล้ว) SQC_VISUAL_SPECS d.9 = 2 จอพอร์ทัล /d/<token> · SQC_DORM_PORTAL_SCENE ครบ", () => {
    const sp = SQC_VISUAL_SPECS["d.9"];
    ok(Array.isArray(sp) && sp.length === 2 && sp.map((x) => x.name).join(",") === "dorm-portal-open,dorm-portal-paid" && sp.every((x) => x.path.startsWith("/d/")), J(sp));
    ok(SQC_DORM_PORTAL_SCENE.rooms.paid === "204" && SQC_DORM_PORTAL_SCENE.rooms.open === "106" && SQC_DORM_PORTAL_SCENE.sceneFile.startsWith(".qc-shots/"), "ค่าฉาก");
  }, "MINOR");

  // ═══════════════ ข้อมูลทดสอบ ═══════════════
  console.log("\n── สร้างข้อมูลทดสอบ ──");
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `QC D9 ${tag}`, slug: `qc-svc-d9-${tag}-${STAMP}` } }); tenantIds.push(t.id); return t.id as string; };
  const A = await mkTenant("a"), B = await mkTenant("b");
  ids.A = A; ids.B = B;
  const mkBook = async (tenantId: string, name: string) => {
    const s = await SYS.createSystem(tenantId, "ACCOUNT", name);
    await ASV.saveSettings(tenantId, s.id, { orgName: name, vatRegistered: false });
    await GL.ensureAccounting({ tenantId, systemId: s.id });
    await prisma.accountFinance.create({ data: { tenantId, systemId: s.id, type: "BANK", name: "บัญชีรับเงินหอ", promptpayId: "0812345678", useForReceive: true } });
    return s.id as string;
  };
  const mkUnit = async (tenantId: string, tag: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "DORM", name, slug: `d9${tag}-${STAMP}` } })).id as string;
  const linkBook = (tenantId: string, systemId: string, unitId: string) => prisma.accountSystemLink.create({ data: { tenantId, systemId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
  const mkUser = async (key: string, tenantId: string, role: string, unitAccess: string[], perms: string[] = []) => {
    const u = await prisma.user.create({ data: { email: `svc-d9-${STAMP}-${key}@shark.local`, name: `QC D9 ${key}` } });
    await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions: Object.fromEntries(perms.map((p) => [p, true])), acceptedAt: new Date() } });
    return u.id as string;
  };
  const setVal = async (tenantId: string, key: string, scopeId: string, value: unknown) => {
    await prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
    await prisma.settingValue.create({ data: { tenantId, key, scope: "UNIT", scopeId, value: value === null ? PRISMA_NS.JsonNull : value, setById: "qc-d9" } });
  };
  const unsetVal = (tenantId: string, key: string, scopeId: string) => prisma.settingValue.deleteMany({ where: { tenantId, key, scope: "UNIT", scopeId } });
  const newPhone = () => { for (;;) { const p = `08${randomInt(10_000_000, 99_999_999)}`; if (!PHONES.includes(p)) { PHONES.push(p); return p; } } };
  const mkParty = async (tenantId: string, name: string) => { NAMES.push(name); return (await prisma.party.create({ data: { tenantId, name, phone: newPhone() } })).id as string; };
  const snapOf = async (tenantId: string, unitId: string, roomTypeId: string, roomId: string, extra: Record<string, unknown> = {}) => {
    const s = await SET.snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId, roomId });
    return { ...s, ...extra };
  };
  type LeaseOpt = { tenantId: string; unitId: string; roomId: string; roomTypeId: string; partyId: string; status?: string; start?: string; end?: string | null; occEnd?: string | null; snapExtra?: Record<string, unknown>; photos?: unknown; sig?: string | null };
  const mkLease = async (o: LeaseOpt) => {
    const start = o.start ?? "2026-01-01", end = o.end === undefined ? "2027-12-31" : o.end;
    const l = await prisma.dormLease.create({ data: {
      tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, partyId: o.partyId, status: o.status ?? "ACTIVE", startDate: dbDate(start), endDate: end ? dbDate(end) : null,
      rentSatang: RENT, commonFeeSatang: COMMON, depositSatang: 0, advanceRentSatang: 0, bookingFeeSatang: 0, coTenants: { occupants: [], vehicles: [] },
      policySnapshot: await snapOf(o.tenantId, o.unitId, o.roomTypeId, o.roomId, o.snapExtra), signedAt: new Date(), createdById: "qc-d9",
      moveInPhotos: (o.photos ?? []) as Any, signatureFileId: o.sig ?? null,
    } });
    if (o.occEnd !== null) {
      const oc = await prisma.roomOccupancy.create({ data: { tenantId: o.tenantId, unitId: o.unitId, roomId: o.roomId, startDate: dbDate(start), endDate: dbDate(o.occEnd ?? "2028-01-01"), kind: "LEASE", refType: "DormLease", refId: l.id } });
      await prisma.dormLease.update({ where: { id: l.id }, data: { occupancyId: oc.id } });
    }
    return l.id as string;
  };
  const mkRoomSet = async (tenantId: string, unitId: string, numbers: string[]) => {
    const ty = (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "มาตรฐาน", capacity: 2, baseRateSatang: RENT, depositSatang: 0, rentMode: "MONTHLY", areaSqm: 24 } })).id as string;
    const b = (await prisma.roomBuilding.create({ data: { tenantId, unitId, name: "อาคาร ทดสอบ", floors: 3, sortOrder: 1 } })).id as string;
    const R: Record<string, string> = {};
    for (const n of numbers) R[n] = (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId: ty, number: n, buildingId: b, floorNo: Number(n[0]), floor: n[0] } })).id as string;
    return { ty, R };
  };
  const mkFile = async (tenantId: string, ct = "image/png") => {
    const f = await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path: `t/${tenantId}/private/qc-d9-${randomBytes(6).toString("hex")}.png`, cdnUrl: "private://qc-d9", contentType: ct, bytes: 64 } });
    return f.id as string;
  };
  const billOf = async (leaseId: string, periodKey: string): Promise<Any> => prisma.dormBill.findFirst({ where: { leaseId, periodKey } });
  const sendAll = async (ctx: Any, unitId: string, runId: string, now: string) => { let last: Any = null; for (let i = 0; i < 40; i++) { last = await DORM.sendBillRun(ctx, { unitId, runId }, { now: new Date(now) }); if (!last?.ok || last.done) break; } return last; };
  const runPeriod = async (ctx: Any, unitId: string, periodKey: string, now: string) => {
    const r = await DORM.prepareBillRun(ctx, { unitId, periodKey }, { now: new Date(now) });
    const s = r?.ok ? await sendAll(ctx, unitId, r.runId, now) : null;
    await parkOutbox(tenantIds);
    return { r, s };
  };
  let payN = 0;
  const pay = async (unitId: string, tenantId: string, bill: Any, amount: number, ymd: string) => {
    const r = await ACC.recordExternalPayment({ tenantId, unitId, docId: bill.accountDocumentId, amountSatang: amount, idempotencyKey: `qc-d9-${STAMP}-${++payN}`, paidAt: new Date(`${ymd}T05:00:00.000Z`) });
    if (!r?.ok) throw new Error(`fixture รับชำระ: ${r?.code} ${r?.reason ?? ""}`);
    return r;
  };

  try {
    // ร้าน/สมุด/หน่วย/ผู้ใช้
    const BOOK_A = await mkBook(A, `บัญชีหอ D9 A ${STAMP}`), BOOK_B = await mkBook(B, `บัญชีหอ D9 B ${STAMP}`);
    const DA = await mkUnit(A, "a", "หอดีเก้าเอ"), DN = await mkUnit(A, "n", "หอดีเก้าไม่มีโอเอ"), DB = await mkUnit(B, "b", "หอดีเก้าบี");
    Object.assign(ids, { DA, DN, DB, BOOK_A, BOOK_B });
    for (const [t, bk, u] of [[A, BOOK_A, DA], [A, BOOK_A, DN], [B, BOOK_B, DB]] as const) {
      await linkBook(t, bk, u);
      await setVal(t, "rooms.utility.elec.metering", u, "NONE");
      await setVal(t, "rooms.utility.water.metering", u, "NONE");
      await setVal(t, "messaging.quietHours", u, null);
      await setVal(t, "messaging.channelOrder", u, ["LINE", "WEB_LINK"]);
      await setVal(t, "rooms.lateFee.autoCharge", u, false); // บิลค้าง ต.ค. ไม่ให้เกิดค่าปรับอัตโนมัติใน พ.ย. (D.11) — ยอดฉากคงที่ 480,000
    }
    await setVal(A, "payments.receiver", DA, { promptpayId: "0812345678", displayName: "หอดีเก้าเอ" });
    ids.OWN = await mkUser("owner", A, "OWNER", ["*"]);
    ids.OWNB = await mkUser("owner-b", B, "OWNER", ["*"]);
    ids.VIEW = await mkUser("view", A, "STAFF", [DA], ["dorm.view"]);
    // LINE OA (ตัวจำลอง): OA1 = ของหน่วย DA · OA2 = OA อื่นของร้าน A · OAB = ร้าน B
    const sysA = (await prisma.appSystem.create({ data: { tenantId: A, type: "CHAT", name: `qc-d9-chat-${STAMP}` } })).id;
    const sysB = (await prisma.appSystem.create({ data: { tenantId: B, type: "CHAT", name: `qc-d9-chat-b-${STAMP}` } })).id;
    const RAND = randomBytes(3).toString("hex");
    const mkConn = async (tenantId: string, sys: string, tag: string, basic: string) =>
      (await prisma.chatChannelConnection.create({ data: { tenantId, systemId: sys, type: "LINE", displayName: `qc-d9-${tag}-${STAMP}`, externalAccountId: `qc-d9-${tag}-${STAMP}`, credentials: { channelAccessToken: `qcd9tok${tag}${RAND}`, channelSecret: `qcd9sec${tag}${RAND}` }, meta: { basicId: basic } } })).id as string;
    ids.OA1 = await mkConn(A, sysA, "a1", "@qcd9a1"); ids.OA2 = await mkConn(A, sysA, "a2", "@qcd9a2"); ids.OAB = await mkConn(B, sysB, "b", "@qcd9b");
    ids.TOK1 = `Bearer qcd9toka1${RAND}`; ids.TOK2 = `Bearer qcd9toka2${RAND}`; ids.TOKB = `Bearer qcd9tokb${RAND}`;
    await setVal(A, "messaging.lineConnectionId", DA, ids.OA1);
    await setVal(B, "messaging.lineConnectionId", DB, ids.OAB);
    // ห้อง/ผู้เช่า/สัญญา
    const RA = await mkRoomSet(A, DA, ["101", "102", "103", "104", "105", "106", "107"]);
    const RN = await mkRoomSet(A, DN, ["201"]);
    const RB = await mkRoomSet(B, DB, ["101"]);
    for (const [k, n] of [["P1", "สมชาย ดีเก้าหนึ่ง"], ["P2", "สมหญิง ดีเก้าสอง"], ["P3", "ธนพล ผู้เช่าเก่า"], ["P5", "วิภา สองห้อง"], ["P6", "หมดสัญญา แล้ว"], ["P7", "เบญจา ผู้เช่าใหม่"], ["P8", "ยกเลิก สัญญา"], ["PX", "คนนอก ไม่เช่า"], ["PN", "หอไม่มี โอเอ"]] as const) ids[k] = await mkParty(A, n);
    ids.PB = await mkParty(B, "ร้านบี ผู้เช่า");
    ids.f1 = await mkFile(A); ids.f2 = await mkFile(A); ids.f3 = await mkFile(A, "application/pdf"); ids.f4 = await mkFile(A); ids.f5 = await mkFile(A);
    // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W1): ข้อความสัญญามีชื่อเต็มของ Party (P1) ทั้งใน textTh และ clause + tenantName — พอร์ทัลต้องไม่ส่งชื่อออก
    const CONTRACT = { tenantName: "สมชาย ดีเก้าหนึ่ง", textTh: `สัญญาเช่าห้องพักทดสอบ D9 ${STAMP} ระหว่างผู้ให้เช่า กับ สมชาย ดีเก้าหนึ่ง`, clauses: [{ id: "c1", titleTh: "ข้อ 1 ค่าเช่า", textTh: "สมชาย ดีเก้าหนึ่ง ผู้เช่าชำระค่าเช่าทุกเดือนภายในวันที่ 5", mandatory: true }] };
    ids.L1 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["101"], roomTypeId: RA.ty, partyId: ids.P1, snapExtra: { contract: CONTRACT },
      photos: [{ fileId: ids.f1, kind: "ROOM_PHOTO", at: "2026-01-01" }, { fileId: ids.f2, kind: "ID_CARD", at: "2026-01-01" }, { fileId: ids.f3, kind: "DOCUMENT", at: "2026-01-01" }], sig: ids.f4 });
    ids.L2 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["102"], roomTypeId: RA.ty, partyId: ids.P2, photos: [{ fileId: ids.f5, kind: "DOCUMENT", at: "2026-01-01" }] });
    ids.L3 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["103"], roomTypeId: RA.ty, partyId: ids.P3 });
    ids.L4 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["104"], roomTypeId: RA.ty, partyId: ids.P5 });
    ids.L5 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["105"], roomTypeId: RA.ty, partyId: ids.P5 });
    ids.LN1 = await mkLease({ tenantId: A, unitId: DN, roomId: RN.R["201"], roomTypeId: RN.ty, partyId: ids.PN });
    ids.LB1 = await mkLease({ tenantId: B, unitId: DB, roomId: RB.R["101"], roomTypeId: RB.ty, partyId: ids.PB });
    // ผู้ติดต่อ LINE
    const mkContact = async (key: string, tenantId: string, sys: string, conn: string, partyId: string | null) => {
      const ext = `Uqcd9${key}${RAND}`;
      const row = await prisma.chatContact.create({ data: { tenantId, systemId: sys, channel: "LINE", channelConnectionId: conn, externalUserId: ext, partyId, lang: "th" } });
      C[key] = { id: row.id, ext, partyId, conn };
    };
    await mkContact("C1", A, sysA, ids.OA1, ids.P1); await mkContact("C1b", A, sysA, ids.OA2, ids.P1); await mkContact("C2", A, sysA, ids.OA1, ids.P2);
    await mkContact("C3", A, sysA, ids.OA1, ids.P3); await mkContact("C5", A, sysA, ids.OA1, ids.P5); await mkContact("CX", A, sysA, ids.OA1, ids.PX);
    await mkContact("CN", A, sysA, ids.OA1, null); await mkContact("CNN", A, sysA, ids.OA1, ids.PN); await mkContact("CB", B, sysB, ids.OAB, ids.PB);
    for (let i = 0; i < 10; i++) await mkContact(`KL${i}`, A, sysA, ids.OA1, null);
    for (let i = 0; i < 6; i++) await mkContact(`KP${i}`, A, sysA, ids.OA1, null);
    // ลิงก์/รหัสของผู้เช่าเก่า "ก่อนย้ายออก" (ตอน L3 ยัง ACTIVE)
    tokenL3old = SL.signLink({ tenantId: A, purpose: "dorm.portal", subjectId: ids.L3, expMin: 35 * 1440 });
    if (typeof portalL.mod?.portalUrl === "function") { try { portalUrlL3before = await portalL.mod.portalUrl({ tenantId: A }, { leaseId: ids.L3 }); } catch { portalUrlL3before = null; } }
    const ic = await CHAT.issueLinkCode({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.L3, ttlMin: 600, connectionId: ids.OA1 });
    codeL3 = ic?.ok ? ic.code : "";
    // รอบ ต.ค.
    const cO = { tenantId: A, actorUserId: ids.OWN }, cB = { tenantId: B, actorUserId: ids.OWNB };
    const o1 = await runPeriod(cO, DA, P1, NOW1), n1 = await runPeriod(cO, DN, P1, NOW1), b1 = await runPeriod(cB, DB, P1, NOW1);
    for (const k of ["L1", "L2", "L3", "L4", "L5", "LN1", "LB1"]) bills[`${k}:${P1}`] = await billOf(ids[k], P1);
    await pay(DA, A, bills[`L2:${P1}`], BASE, "2026-10-04");
    // L3 ย้ายออก (ENDED) · ผู้เช่าใหม่ L3b ห้องเดิม 103 เข้า 1 พ.ย.
    await prisma.dormLease.update({ where: { id: ids.L3 }, data: { status: "ENDED", endedAt: new Date("2026-10-31T10:00:00Z"), endReason: "MOVE_OUT", endDate: dbDate("2026-10-31") } });
    await prisma.roomOccupancy.updateMany({ where: { refType: "DormLease", refId: ids.L3 }, data: { endDate: dbDate("2026-11-01") } });
    ids.L3b = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["103"], roomTypeId: RA.ty, partyId: ids.P7, start: "2026-11-01", end: "2027-10-31" });
    const o2 = await runPeriod(cO, DA, P2, NOW2);
    for (const k of ["L1", "L2", "L3b", "L4", "L5"]) bills[`${k}:${P2}`] = await billOf(ids[k], P2);
    bills[`L3:${P2}`] = await billOf(ids.L3, P2);
    await pay(DA, A, bills[`L2:${P2}`], 100_000, "2026-11-02");
    // สัญญาหมดอายุแต่ยังไม่ปิด (L6) · ยกเลิก (L8) — สร้างหลังรอบบิล (ไม่มีบิล)
    ids.L6 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["106"], roomTypeId: RA.ty, partyId: ids.P6, start: "2025-10-01", end: "2026-09-30", occEnd: "2026-10-01" });
    ids.L8 = await mkLease({ tenantId: A, unitId: DA, roomId: RA.R["107"], roomTypeId: RA.ty, partyId: ids.P8, status: "CANCELLED", occEnd: null });
    const sentOk = (k: string) => bills[k]?.status && ["SENT", "PARTIALLY_PAID", "PAID"].includes(bills[k].status) && !!bills[k].accountDocumentId && bills[k].totalSatang === BASE;
    const want = ["L1", "L2", "L3", "L4", "L5", "LN1", "LB1"].map((k) => `${k}:${P1}`).concat(["L1", "L2", "L3b", "L4", "L5"].map((k) => `${k}:${P2}`));
    const bad = want.filter((k) => !sentOk(k));
    await st("PC-1", "ฉากเงินผ่าน D.8 (หน่วยไม่มีน้ำไฟ): รอบ ต.ค. DA 5 + DN 1 + ร้าน B 1 · รอบ พ.ย. DA 5 (L3 ย้ายออกไม่มีบิล พ.ย. · L3b ผู้เช่าใหม่มี) · บิลละ 480,000 มีใบแจ้งหนี้", () => {
      ok(!bad.length && !bills[`L3:${P2}`] && o1.s?.done && n1.s?.done && b1.s?.done && o2.s?.done, `ขาด ${bad.join(",")} · L3 พ.ย.=${!!bills[`L3:${P2}`]} · ${J({ o1: o1.r?.code ?? o1.s?.done, o2: o2.r?.code ?? o2.s?.done })}`);
    });
    ready = !bad.length;
  } catch (e) {
    record("PC-1", "ฉากเงินผ่าน D.8", "FAIL", `สร้างฉากไม่ได้: ${errMsg(e)}`, "CRITICAL");
  }
  const DA = ids.DA, DN = ids.DN;
  const cO = { tenantId: A, actorUserId: ids.OWN };
  const bl = (k: string): Any => bills[k] ?? {};
  const ALL_BILL_IDS = () => Object.values(bills).filter(Boolean).map((b: Any) => b.id as string);

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-2", "signLink/verifyLink (R0.7): purpose dorm.portal ไปกลับได้ · purpose อื่น/ตัดท้าย ⇒ null", () => {
    const t = SL.signLink({ tenantId: "qc-t", purpose: "dorm.portal", subjectId: "qc-s", expMin: 5 });
    eq(SL.verifyLink(t, "dorm.portal"), { tenantId: "qc-t", subjectId: "qc-s" }, "ไปกลับ");
    eq([SL.verifyLink(t, "booking.manage"), SL.verifyLink(t.slice(0, -3), "dorm.portal")], [null, null], "ล้ม");
  });
  await st("PC-3", "รหัสผูก R0.7 (DORM_LEASE): ออก + ใช้พร้อมกัน 6 ทาง (resolveParty ส่งเอง) ⇒ สำเร็จ 1 · ผู้ติดต่อได้ Party 1 คน", async () => {
    needReady();
    const ic = await CHAT.issueLinkCode({ tenantId: A }, { purpose: "DORM_LEASE", refId: `qc-d9-pc3-${STAMP}`, ttlMin: 30, connectionId: ids.OA1 });
    ok(ic?.ok, `issue ${J(ic)}`);
    const rs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => CHAT.consumeLinkCode({ tenantId: A }, { connectionId: ids.OA1, chatContactId: C[`KP${i}`].id, text: ic.code, resolveParty: async () => ids.PX })));
    eq(rs.filter((r: Any) => r !== null).length, 1, "สำเร็จ");
    eq(await prisma.chatContact.count({ where: { id: { in: [0, 1, 2, 3, 4, 5].map((i) => C[`KP${i}`].id) }, partyId: ids.PX } }), 1, "ผู้ติดต่อที่ได้ Party");
  });
  await st("PC-4", "notifyCustomer (R0.7): Party P1 บนหน่วย DA ⇒ push 1 ครั้งถึงผู้ติดต่อ OA1 (Bearer OA1) · ผู้ติดต่อ OA2 ของ Party เดียวกันไม่ได้", async () => {
    needReady();
    const m = mark();
    const r = await NC.notifyCustomer({ tenantId: A }, { unitId: DA, domain: "rooms", messageKey: "reminder", partyId: ids.P1, vars: { roomNo: "101" }, dedupeKey: `qc-d9-pc4-${STAMP}` });
    ok(r?.status === "SENT", `ผล ${J(r)}`);
    eq(pushes(m).map((p) => [p.json?.to, p.auth]), [[C.C1.ext, ids.TOK1]], "push");
    await prisma.serviceMessageLog.deleteMany({ where: { tenantId: A, dedupeKey: `qc-d9-pc4-${STAMP}` } });
  });
  await st("PC-5", "submitSlip (R0.6) DORM_BILL บนบิล DN (put ฉีด) ⇒ แถว PaymentSlip domain DORM · ซ้ำคีย์เดิม = ผลเดิม", async () => {
    needReady();
    const inp = { unitId: DN, domain: "DORM", refType: "DORM_BILL", refId: bl(`LN1:${P1}`).id, partyId: ids.PN, file: { data: pngOf(`pc5-${STAMP}`), contentType: "image/png" }, expectedSatang: BASE, idempotencyKey: `qcd9pc5${STAMP}` };
    const a = await SLIP.submitSlip({ tenantId: A }, inp, noopDeps), b = await SLIP.submitSlip({ tenantId: A }, inp, noopDeps);
    ok(a?.ok && b?.ok && a.slipId === b.slipId, `${J(a)} ${J(b)}`);
    const row = await prisma.paymentSlip.findFirst({ where: { id: a.slipId } });
    eq([row?.domain, row?.refType, row?.expectedSatang], ["DORM", "DORM_BILL", BASE], "แถว");
  });
  await st("PC-6", "promptpayQrFor (R0.6): หน่วย DA ผู้รับจากค่าตั้ง · ยอด 548,600 ⇒ payload tag 54 = 5486.00 · svg data url", async () => {
    needReady();
    const r = await RCV.promptpayQrFor({ tenantId: A }, { unitId: DA, amountSatang: 548_600, ref: "qc" });
    ok(r?.ok && emvTag(r.payload, "54") === "5486.00" && String(r.svgDataUrl).startsWith("data:image/svg+xml"), J(r).slice(0, 200));
  });
  await st("PC-7", "ตัวจำลอง LINE: lineApiBase ชี้ตัวจำลอง · GET เนื้อรูปคืน PNG เดิมตาม id", async () => {
    const r = await fetch(`${FAKE_BASE}/v2/bot/message/777/content`);
    const b = new Uint8Array(await r.arrayBuffer());
    ok(r.status === 200 && Buffer.from(b).equals(Buffer.from(pngOf("line-777"))), "content");
  }, "MINOR");

  // ═══════════════ B ส่งบิลจริง (consumer dorm.billrun.sent) ═══════════════
  console.log("\n── B ส่งบิล (hook D.8) ──");
  const evtOf = async (billId: string): Promise<Any> => prisma.outboxEvent.findFirst({ where: { tenantId: A, type: "dorm.billrun.sent", idempotencyKey: `dorm.billrun.sent:${billId}` } });
  const consume = async (billId: string) => { const e = await evtOf(billId); ok(e, `ไม่มี event ของบิล ${billId}`); await OC.consumers["dorm.billrun.sent"](e); };
  const smlRows = (billId: string) => prisma.serviceMessageLog.findMany({ where: { tenantId: A, dedupeKey: `rooms:bill:${billId}` } });
  await st("B-1", "consumer ส่งบิล L1 พ.ย.: push 1 ครั้ง ถึงผู้ติดต่อ OA1 ของผู้เช่า (Bearer OA1) · Flex bubble มี \"ห้อง 101\" · \"฿4,800.00\" · ปุ่ม uri https ลิงก์พอร์ทัลของสัญญา L1 · altText = แม่แบบ rooms.msg.bill (มีลิงก์จ่าย) · log rooms:bill:<id> SENT", async () => {
    needReady();
    const m = mark();
    await consume(bl(`L1:${P2}`).id);
    const ps = pushes(m);
    eq(ps.map((p) => [p.json?.to, p.auth]), [[C.C1.ext, ids.TOK1]], "push");
    const msg = msgOf(ps[0]);
    ok(msg?.type === "flex" && msg?.contents?.type === "bubble", `ชนิด ${msg?.type}/${msg?.contents?.type}`);
    const fx = J(msg.contents);
    ok(fx.includes("ห้อง 101") && fx.includes("฿4,800.00"), "Flex ขาดห้อง/ยอด");
    const acts = [...fx.matchAll(/"action":\{[^}]*\}/g)].map((x) => x[0]);
    ok(acts.length >= 1 && acts.every((a) => /"type":"uri"/.test(a) && /"uri":"https:\/\//.test(a)), `ปุ่ม ${acts.join(" ")}`);
    const links = portalLinks(msg);
    ok(links.length >= 1 && links.every((l) => l.sub?.subjectId === ids.L1 && l.sub?.tenantId === A), `ลิงก์ ${J(links.map((l) => l.sub))}`);
    ok(String(msg.altText).includes("101") && portalLinks(msg.altText).length >= 1, `altText ${String(msg.altText).slice(0, 120)}`);
    eq((await smlRows(bl(`L1:${P2}`).id)).map((r: Any) => [r.status, r.channel]), [["SENT", "LINE"]], "log");
  });
  await st("B-2", "X4: consumer บิลเดิมซ้ำ 3 ทางพร้อมกัน + 2 โพรเซส ⇒ ไม่มี push ใหม่ · log 1 แถว · ไม่มี throw", async () => {
    needReady();
    const m = mark();
    const e = await evtOf(bl(`L1:${P2}`).id);
    const at = atIn();
    const [a, b] = await Promise.all([fanout("consume", [[{ evt: e }], [{ evt: e }]], at), inProcAt(at, [0, 1, 2].map(() => () => OC.consumers["dorm.billrun.sent"](e).then(() => ({ ok: true }))))]);
    ok(!badOf([...a, ...b]).length, J(badOf([...a, ...b])));
    eq(pushes(m).length, 0, "push ใหม่");
    eq((await smlRows(bl(`L1:${P2}`).id)).length, 1, "log");
  });
  await st("B-3", "OA ที่ตั้งเท่านั้น: หน่วยไม่มี OA (DN) ⇒ NO_CHANNEL ไม่มี push (แม้ผู้เช่ามีผู้ติดต่อบน OA1) · บิลร้าน B ใต้ ctx ร้าน A / id มั่ว ⇒ NOT_FOUND · ไม่มี push ถึง OA2/ร้าน B ตลอดข้อ B", async () => {
    needReady();
    const m = mark();
    const r1 = keep(await LN.send()({ tenantId: A }, { billId: bl(`LN1:${P1}`).id }));
    const r2 = keep(await LN.send()({ tenantId: A }, { billId: bl(`LB1:${P1}`).id }));
    const r3 = keep(await LN.send()({ tenantId: A }, { billId: `nope-${STAMP}` }));
    eq([r1?.status, r2?.status, r3?.status], ["NO_CHANNEL", "NOT_FOUND", "NOT_FOUND"], "สถานะ");
    eq(pushes(m).length, 0, "push");
    eq(FAKE.filter((f) => f.auth === ids.TOK2 || f.auth === ids.TOKB).length, 0, "คำขอด้วยโทเคน OA2/ร้าน B");
  });
  await st("B-4", "อ่านสด (บทเรียน D.8/D.11): ใบลดหนี้ 20,000 หลังส่งก่อน consumer ⇒ ยอดในข้อความ = ค้างสด ฿4,600.00 (ไม่ใช่ ฿4,800.00) · sendDormBill amountSatang 460,000", async () => {
    needReady();
    const adj = await DORM.adjustSentBill(cO, { unitId: DA, billId: bl(`L4:${P2}`).id, kind: "CREDIT", reason: "ลดค่าห้องตามข้อตกลงซ่อมแอร์ล่าช้า", idempotencyKey: `qc-d9-b4-${STAMP}`, lines: [{ code: "RENT", labelTh: "ส่วนลดค่าห้อง", amountSatang: 20_000 }] });
    ok(adj?.ok, `ใบลดหนี้ ${J(adj)}`);
    const m = mark();
    await consume(bl(`L4:${P2}`).id);
    const ps = pushesTo(C.C5.ext, m);
    ok(ps.length === 1, `push ${ps.length}`);
    const s = J(msgOf(ps[0]));
    ok(s.includes("฿4,600.00") && !s.includes("฿4,800.00"), "ยอดในข้อความไม่ใช่ค้างสด");
    const r = keep(await LN.send()({ tenantId: A }, { billId: bl(`L4:${P2}`).id }));
    eq([r?.amountSatang, r?.duplicate], [460_000, true], "ผลส่งซ้ำ");
  });
  await st("B-5", "ไม่ส่ง (ไม่มีแถว log · ไม่มี push): บิลจ่ายครบแล้ว ⇒ PAID · สัญญาจบ ⇒ LEASE_ENDED", async () => {
    needReady();
    const m = mark();
    const a = keep(await LN.send()({ tenantId: A }, { billId: bl(`L2:${P1}`).id }));
    const b = keep(await LN.send()({ tenantId: A }, { billId: bl(`L3:${P1}`).id }));
    eq([a?.status, b?.status, a?.dedupeKey, b?.dedupeKey], ["PAID", "LEASE_ENDED", null, null], "สถานะ");
    eq(pushes(m).length, 0, "push");
    eq((await smlRows(bl(`L2:${P1}`).id)).length + (await smlRows(bl(`L3:${P1}`).id)).length, 0, "log");
  });
  await st("B-6", "ช่องทางส่งบิลของหน่วยไม่มี LINE/SMS (rooms.billing.sendChannels = [PRINT]) ⇒ DISABLED ไม่มี log", async () => {
    needReady();
    await setVal(A, "rooms.billing.sendChannels", DA, ["PRINT"]);
    try {
      const r = keep(await LN.send()({ tenantId: A }, { billId: bl(`L5:${P2}`).id }));
      eq(r?.status, "DISABLED", "สถานะ");
      eq((await smlRows(bl(`L5:${P2}`).id)).length, 0, "log");
    } finally { await unsetVal(A, "rooms.billing.sendChannels", DA); }
  }, "MAJOR");
  await st("B-7", "X5 เวลาเงียบ: 22:00 ⇒ SKIPPED_QUIET ไม่มี push · งานส่งซ้ำ 22:10 ยังเงียบ · 08:05 งาน 2 ทางพร้อมกัน ⇒ push 1 ครั้ง (log SENT) · งานรอบถัดไปไม่ส่งซ้ำ", async () => {
    needReady();
    await setVal(A, "messaging.quietHours", DA, { start: "21:00", end: "08:00" });
    try {
      const id = bl(`L5:${P2}`).id;
      const m = mark();
      const r = keep(await LN.send()({ tenantId: A }, { billId: id }, { now: new Date(NOWQ) }));
      eq(r?.status, "SKIPPED_QUIET", "22:00");
      await LN.jobs()(new Date(Date.parse(NOWQ) + 600_000), { tenantId: A });
      eq(pushesTo(C.C5.ext, m).length, 0, "push ช่วงเงียบ");
      const rs = await Promise.all([LN.jobs()(new Date(NOWQ2), { tenantId: A }), LN.jobs()(new Date(NOWQ2), { tenantId: A })]);
      await LN.jobs()(new Date(Date.parse(NOWQ2) + 300_000), { tenantId: A });
      eq(pushesTo(C.C5.ext, m).length, 1, `push หลังเงียบ (${J(rs)})`);
      eq((await smlRows(id)).map((x: Any) => x.status), ["SENT"], "log");
    } finally { await setVal(A, "messaging.quietHours", DA, null); }
  });
  await st("B-8", "บิล VOID ⇒ BILL_VOID ไม่ส่ง", async () => {
    needReady();
    await prisma.dormBill.update({ where: { id: bl(`L4:${P1}`).id }, data: { status: "VOID" } });
    const r = keep(await LN.send()({ tenantId: A }, { billId: bl(`L4:${P1}`).id }));
    eq([r?.status, (await smlRows(bl(`L4:${P1}`).id)).length], ["BILL_VOID", 0], "ผล");
  }, "MAJOR");
  await st("B-9", "dormBillFlex (pure): bubble · ปุ่ม uri 2 ปุ่ม (จ่าย/รายละเอียด) ไปลิงก์ที่ให้ · ยอด/ห้อง/ครบกำหนด · ลิงก์ไม่ใช่ https ⇒ ไม่มีปุ่ม uri · ไม่มี postback · ไม่มีคำต้องห้าม", () => {
    const v = { unitName: "บ้านสวนอพาร์ตเมนต์", roomNumber: "204", periodLabel: "พ.ย. 2569", dueLabel: "5 พ.ย. 2569", lines: [{ labelTh: "ค่าห้อง + ส่วนกลาง", detail: null, amountSatang: 480_000 }, { labelTh: "ไฟ", detail: "125 หน่วย", amountSatang: 59_000 }], amountSatang: 548_600, payUrl: `${ORIGIN}/d/x.y`, detailUrl: `${ORIGIN}/d/x.y?bill=b1` };
    const f = LN.flex()(v), s = J(f);
    ok(f?.type === "bubble" && s.includes("ห้อง 204") && s.includes("฿5,486.00") && s.includes("5 พ.ย. 2569") && s.includes("125 หน่วย"), s.slice(0, 200));
    const uris = [...s.matchAll(/"uri":"([^"]+)"/g)].map((x) => x[1]);
    eq(uris.sort(), [v.payUrl, v.detailUrl].sort(), "ปุ่ม");
    ok(!/"type":"postback"/.test(s) && !LEGAL_BAD.test(s), "postback/คำต้องห้าม");
    const s2 = J(LN.flex()({ ...v, payUrl: "http://x/d/a", detailUrl: "/d/a" }));
    ok(!/"type":"uri"/.test(s2), "ลิงก์ไม่ใช่ https ยังมีปุ่ม");
  }, "MAJOR");
  await st("H-1", "hook ของ D.11: ทวงมือ (sendDunningNow) บิล L5 ต.ค. ⇒ ข้อความมีลิงก์พอร์ทัล (payLink) ของสัญญา L5 · ไม่ใช่สัญญาอื่น", async () => {
    needReady();
    const m = mark();
    const r = await DORM.sendDunningNow(cO, { unitId: DA, billId: bl(`L5:${P1}`).id }, { now: new Date(NOW_DUN) });
    ok(r?.ok, `ทวง ${J(r)}`);
    const ps = pushesTo(C.C5.ext, m);
    ok(ps.length === 1, `push ${ps.length}`);
    const links = portalLinks(msgOf(ps[0]));
    ok(links.length >= 1 && links.every((l) => l.sub?.subjectId === ids.L5 && l.sub?.tenantId === A), `ลิงก์ ${J(links.map((l) => l.sub))}`);
  });

  // ═══════════════ L รหัสผูกห้อง ═══════════════
  console.log("\n── L รหัสผูกห้อง ──");
  const linkRow = async (code: string) => prisma.chatLinkCode.findFirst({ where: { tenantId: A, codeLast4: code.slice(-4), purpose: "DORM_LEASE" }, orderBy: { createdAt: "desc" } });
  let codeL3b = "";
  await st("L-1", "ออกรหัสผูก (เจ้าของ · สัญญา L3b live): รหัส 8 ตัว · ChatLinkCode DORM_LEASE refId สัญญา · OA ของหน่วย · อายุ = rooms.notify.linkCodeDays (30 วัน · ตั้ง 3 ⇒ 3 วัน) · deepLink @qcd9a1 · QR svg", async () => {
    needReady();
    const t0 = Date.now();
    const r = keep(await LN.issue()(cO, { unitId: DA, leaseId: ids.L3b }));
    ok(r?.ok && /^[A-Z0-9]{8}$/.test(r.code) && String(r.qrSvgDataUrl).startsWith("data:image/svg+xml") && String(r.deepLink ?? "").includes("qcd9a1"), J(r).slice(0, 200));
    ok(Math.abs(new Date(r.expiresAt).getTime() - (t0 + 30 * 86_400_000)) < 600_000, `อายุ ${r.expiresAt}`);
    const row = await linkRow(r.code);
    eq([row?.refId, row?.connectionId, row?.usedAt], [ids.L3b, ids.OA1, null], "แถว");
    codeL3b = r.code;
    await setVal(A, "rooms.notify.linkCodeDays", DA, 3);
    try {
      const r2 = await LN.issue()(cO, { unitId: DA, leaseId: ids.L3b });
      ok(r2?.ok && Math.abs(new Date(r2.expiresAt).getTime() - (Date.now() + 3 * 86_400_000)) < 600_000, `ค่าตั้ง 3 วัน ⇒ ${r2?.expiresAt}`);
    } finally { await unsetVal(A, "rooms.notify.linkCodeDays", DA); }
  });
  await st("L-2", "ปฏิเสธ (ไม่มีแถวรหัสใหม่): ไม่มีสิทธิ์ dorm.lease.manage / เจ้าของร้าน B ⇒ NOT_FOUND · สัญญาจบ/ยกเลิก/เลยวันจบ ⇒ BAD_STATE · หน่วยไม่มี OA ⇒ NOT_CONFIGURED", async () => {
    needReady();
    const n0 = await prisma.chatLinkCode.count({ where: { tenantId: A } });
    const rs = [
      await LN.issue()({ tenantId: A, actorUserId: ids.VIEW }, { unitId: DA, leaseId: ids.L1 }),
      await LN.issue()({ tenantId: B, actorUserId: ids.OWNB }, { unitId: DA, leaseId: ids.L1 }),
      await LN.issue()(cO, { unitId: DA, leaseId: ids.L3 }),
      await LN.issue()(cO, { unitId: DA, leaseId: ids.L8 }),
      await LN.issue()(cO, { unitId: DA, leaseId: ids.L6 }),
      await LN.issue()(cO, { unitId: DN, leaseId: ids.LN1 }),
    ];
    eq(rs.map((r: Any) => r?.code), ["NOT_FOUND", "NOT_FOUND", "BAD_STATE", "BAD_STATE", "BAD_STATE", "NOT_CONFIGURED"], "รหัสผล");
    ok(rs.every((r: Any) => r?.ok === false && THAI.test(r?.reason ?? "")), "reason ไทย");
    eq(await prisma.chatLinkCode.count({ where: { tenantId: A } }), n0, "แถวรหัส");
  });
  let linkWinner = "";
  await st("L-3", "X3 ผูกรหัสเดียวพร้อมกัน 8 ผู้ติดต่อ (4 ในโพรเซส + 2 โพรเซส×2) ผ่าน handleLinkCodeText ⇒ ผูก 1 พอดี (Party P7) · รหัสถูกใช้ครั้งเดียว · ผู้แพ้ได้ LINK_FAILED_TEXT", async () => {
    needReady();
    ok(codeL3b, "ไม่มีรหัสจาก L-1");
    const ctxOf = (i: number) => ({ tenantId: A, connectionId: ids.OA1, chatContactId: C[`KL${i}`].id, replyToken: null });
    const at = atIn();
    const [ch, inp] = await Promise.all([
      fanout("link", [[{ ctx: ctxOf(4), text: codeL3b }, { ctx: ctxOf(5), text: codeL3b }], [{ ctx: ctxOf(6), text: codeL3b }, { ctx: ctxOf(7), text: codeL3b }]], at),
      inProcAt(at, [0, 1, 2, 3].map((i) => () => PB.handleLinkCodeText(ctxOf(i), codeL3b))),
    ]);
    const all = [...ch, ...inp];
    REPLIES.push(...all);
    ok(!badOf(all).length, J(badOf(all)));
    const bound = await prisma.chatContact.findMany({ where: { id: { in: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => C[`KL${i}`].id) }, partyId: { not: null } }, select: { id: true, partyId: true } });
    eq(bound.map((b: Any) => b.partyId), [ids.P7], "ผูก");
    linkWinner = bound[0]?.id ?? "";
    const row = await linkRow(codeL3b);
    ok(row?.usedAt && row?.usedByChatContactId === linkWinner, "แถวรหัส");
    eq(all.filter((r: Any) => r?.linked === true).length, 1, "linked:true");
    ok(all.filter((r: Any) => r?.linked !== true).every((r: Any) => r?.reply?.text === PB.LINK_FAILED_TEXT), "คำตอบผู้แพ้");
  });
  await st("L-4", "onDormLinked ของผู้ชนะ: ข้อความมี \"ห้อง 103\" + ลิงก์พอร์ทัลของสัญญา L3b (ไม่ใช่ L3 ผู้เช่าเก่าห้องเดียวกัน) · ไม่มีเบอร์", async () => {
    needReady();
    const r = keep(await LN.linked()({ tenantId: A, connectionId: ids.OA1, chatContactId: linkWinner, partyId: ids.P7, replyToken: null }, { purpose: "DORM_LEASE", refId: ids.L3b, partyId: ids.P7, resolvedPartyId: ids.P7, partyMismatch: false }));
    REPLIES.push(r);
    ok(J(r).includes("103"), "ไม่มีเลขห้อง");
    const ls = portalLinks(r);
    ok(ls.length >= 1 && ls.every((l) => l.sub?.subjectId === ids.L3b), J(ls.map((l) => l.sub)));
  });
  await st("L-5", "สัญญาจบ: รหัสที่ออกตอน L3 ยัง ACTIVE พิมพ์หลังย้ายออก ⇒ คำตอบ = LINK_FAILED_TEXT ตรงตัว · ผู้ติดต่อไม่ได้ Party · onDormLinked(resolvedPartyId null) = LINK_FAILED_TEXT · partyMismatch = LINK_OK_TEXT", async () => {
    needReady();
    ok(codeL3, "ไม่มีรหัส L3");
    const r = await PB.handleLinkCodeText({ tenantId: A, connectionId: ids.OA1, chatContactId: C.KL8.id, replyToken: null }, codeL3);
    REPLIES.push(r);
    eq(r?.reply?.text, PB.LINK_FAILED_TEXT, "คำตอบ");
    eq((await prisma.chatContact.findUnique({ where: { id: C.KL8.id } }))?.partyId ?? null, null, "Party");
    const ctx = { tenantId: A, connectionId: ids.OA1, chatContactId: C.KL9.id, partyId: null, replyToken: null };
    const a = await LN.linked()(ctx, { purpose: "DORM_LEASE", refId: ids.L3, partyId: null, resolvedPartyId: null, partyMismatch: false });
    const b = await LN.linked()({ ...ctx, partyId: ids.PX }, { purpose: "DORM_LEASE", refId: ids.L1, partyId: ids.PX, resolvedPartyId: ids.P1, partyMismatch: true });
    eq([a?.text, b?.text, !!a?.flex, !!b?.flex], [PB.LINK_FAILED_TEXT, PB.LINK_OK_TEXT, false, false], "onDormLinked");
  });
  await st("L-6", "resolveDormParty: DORM_LEASE สัญญา live ⇒ Party · สัญญาจบ/ยกเลิก/เลยวันจบ/ร้านอื่น/purpose อื่น/ขยะ ⇒ null", async () => {
    needReady();
    const R = LN.resolve();
    const got = [await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.L1 }), await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.L3 }), await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.L8 }),
      await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.L6 }), await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: ids.LB1 }), await R({ tenantId: A }, { purpose: "APPOINTMENT", refId: ids.L1 }), await R({ tenantId: A }, { purpose: "DORM_LEASE", refId: "x" })];
    eq(got, [ids.P1, null, null, null, null, null, null], "ผล");
  });

  // ═══════════════ K postback dorm.* ═══════════════
  console.log("\n── K postback ──");
  const pctx = (k: string, over: Record<string, unknown> = {}) => ({ tenantId: A, connectionId: C[k].conn, chatContactId: C[k].id, partyId: C[k].partyId, replyToken: null, ...over });
  const pb = async (ctx: Any, data: string) => { const evt = PB.parsePostbackData(data); ok(evt, `parse ${data}`); const r = await LN.postback()(ctx, evt); REPLIES.push(r); return r; };
  await st("K-1", "ทะเบียน: POSTBACK_ROUTES มี prefix dorm. (resolveParty · onPostback · onLinked) · dispatchPostback(\"dorm.bills\") ของผู้เช่า ⇒ handled:true + ลิงก์พอร์ทัล", async () => {
    needReady();
    const r = (PB.POSTBACK_ROUTES as Any[]).find((x) => x?.prefix === "dorm.");
    ok(r && ["resolveParty", "onPostback", "onLinked"].every((k) => typeof r[k] === "function"), "ไม่มี route dorm.");
    const d = await PB.dispatchPostback(pctx("C1"), "dorm.bills");
    REPLIES.push(d);
    ok(d?.handled === true && portalLinks(d.reply).some((l) => l.sub?.subjectId === ids.L1), J(d).slice(0, 200));
  });
  await st("K-2", "บิลของฉัน (C1 · สัญญาเดียว): ลิงก์พอร์ทัล 1 สัญญา = L1 (ร้าน A) · อายุ 35 วัน (±5 นาที) · มี \"101\" · ไม่มี id/ห้องของคนอื่น", async () => {
    needReady();
    const r = await pb(pctx("C1"), "dorm.bills");
    const ls = portalLinks(r);
    ok(ls.length >= 1 && new Set(ls.map((l) => l.sub?.subjectId)).size === 1 && ls[0].sub?.subjectId === ids.L1 && ls[0].sub?.tenantId === A, J(ls.map((l) => l.sub)));
    ok(Math.abs(tokenExpSec(ls[0].token) - (Date.now() / 1000 + 35 * 86_400)) < 300, `อายุ ${tokenExpSec(ls[0].token)}`);
    const s = J(r);
    ok(s.includes("101") && ![ids.L2, ids.L4, ids.L5, ids.L3, bl(`L2:${P2}`).id].some((x) => s.includes(x)) && !/\b10[2-5]\b/.test(s.replace(/https:[^"\s]+/g, "")), "มีข้อมูลห้องอื่น");
  });
  await st("K-3", "X1/X7 ข้อความกลางเดียวกันทุกไบต์ (ไม่มีลิงก์ · ไม่มี flex): ไม่มี Party · Party ที่ไม่เช่า · Party ผู้เช่าแต่กดจาก OA2 · ผู้เช่าเก่า (สัญญาจบ) · Party ร้าน B ใต้ ctx A · ผู้เช่าสัญญาเลยวันจบ · action ไม่รู้จัก", async () => {
    needReady();
    const NF = LN.NF();
    const rs = [await pb(pctx("CN"), "dorm.bills"), await pb(pctx("CX"), "dorm.bills"), await pb(pctx("C1b"), "dorm.bills"), await pb(pctx("C3"), "dorm.bills"),
      await pb(pctx("CX", { partyId: ids.PB }), "dorm.bills"), await pb(pctx("CX", { partyId: ids.P6 }), "dorm.bills"), await pb(pctx("C1"), "dorm.zzz"), await pb(pctx("C3"), "dorm.lease")];
    const bad = rs.map((r: Any, i) => (r?.text === NF && !r?.flex && portalLinks(r).length === 0 ? null : `#${i} ${J(r).slice(0, 80)}`)).filter(Boolean);
    ok(!bad.length, bad.join(" · "));
  });
  await st("K-4", "อายุลิงก์เป็นค่าตั้ง: rooms.notify.portalLinkDays = 7 ⇒ ลิงก์ \"บิลของฉัน\" อายุ 7 วัน", async () => {
    needReady();
    await setVal(A, "rooms.notify.portalLinkDays", DA, 7);
    try {
      const ls = portalLinks(await pb(pctx("C1"), "dorm.bills"));
      ok(ls.length && Math.abs(tokenExpSec(ls[0].token) - (Date.now() / 1000 + 7 * 86_400)) < 300, `อายุ ${ls[0] ? tokenExpSec(ls[0].token) : "—"}`);
    } finally { await unsetVal(A, "rooms.notify.portalLinkDays", DA); }
  }, "MAJOR");
  await st("K-5", "เมนูอื่น: lease ⇒ ลิงก์ /d/<token>/lease ของ L1 · contact/repair/announce/parcel ⇒ ข้อความไทยที่ไม่ใช่ข้อความกลาง · ไม่มีคำต้องห้าม", async () => {
    needReady();
    const NF = LN.NF();
    const l = await pb(pctx("C1"), "dorm.lease");
    ok(portalLinks(l).some((x) => x.lease && x.sub?.subjectId === ids.L1), `lease ${J(l).slice(0, 120)}`);
    for (const a of ["contact", "repair", "announce", "parcel"]) {
      const r = await pb(pctx("C1"), `dorm.${a}`);
      ok(typeof r?.text === "string" && THAI.test(r.text) && r.text !== NF && !LEGAL_BAD.test(J(r)), `${a}: ${J(r).slice(0, 80)}`);
    }
  }, "MAJOR");
  await st("K-6", "Party เดียวสองสัญญา (P5 · 104 + 105): บิลของฉัน ⇒ ลิงก์ 2 สัญญา (L4 · L5) มี \"104\" \"105\"", async () => {
    needReady();
    const r = await pb(pctx("C5"), "dorm.bills");
    const subs = [...new Set(portalLinks(r).map((l) => l.sub?.subjectId))].sort();
    eq(subs, [ids.L4, ids.L5].sort(), "สัญญา");
    ok(J(r).includes("104") && J(r).includes("105"), "เลขห้อง");
  }, "MAJOR");
  await st("K-7", "ร้าน B: ผู้เช่าร้าน B กดบนร้าน B ⇒ ลิงก์ของ LB1 (tenant B) เท่านั้น · postback ไม่เขียน ServiceMessageLog/AuditLog", async () => {
    needReady();
    const n0 = [await prisma.serviceMessageLog.count({ where: { tenantId: { in: [A, B] } } }), await prisma.auditLog.count({ where: { tenantId: { in: [A, B] } } })];
    const r = await pb({ tenantId: B, connectionId: ids.OAB, chatContactId: C.CB.id, partyId: ids.PB, replyToken: null }, "dorm.bills");
    const ls = portalLinks(r);
    ok(ls.length >= 1 && ls.every((l) => l.sub?.subjectId === ids.LB1 && l.sub?.tenantId === B), J(ls.map((l) => l.sub)));
    const n1 = [await prisma.serviceMessageLog.count({ where: { tenantId: { in: [A, B] } } }), await prisma.auditLog.count({ where: { tenantId: { in: [A, B] } } })];
    eq(n1, n0, "แถวที่เขียน");
  }, "MAJOR");

  // ═══════════════ R rich menu ═══════════════
  console.log("\n── R rich menu ──");
  await st("R-1", "dormRichMenuSpec: 2500×1686 · 6 ช่อง (3×2 ไม่ซ้อน ไม่ล้น) · postback dorm.{bills,repair,announce,lease,parcel,contact} · displayText ไทยตาม DORM_MENU · chatBarText ไทย · รูป PNG ≤ 1 MB · ไม่มีคำต้องห้าม", () => {
    const s = LN.spec()();
    eq([s?.size?.width, s?.size?.height, s?.areas?.length], [2500, 1686, 6], "ขนาด/ช่อง");
    const acts = (s.areas as Any[]).map((a) => a.action);
    eq(acts.map((a) => a.data).sort(), ["dorm.announce", "dorm.bills", "dorm.contact", "dorm.lease", "dorm.parcel", "dorm.repair"], "postback");
    ok(acts.every((a) => a.type === "postback" && THAI.test(a.displayText ?? "")), "displayText");
    const menu = lineL.mod.DORM_MENU as Any[];
    ok(menu.every((m) => acts.some((a) => a.data === `dorm.${m.action}` && a.displayText === m.labelTh)), "ป้ายไม่ตรง DORM_MENU");
    const bx = (s.areas as Any[]).map((a) => a.bounds);
    ok(bx.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.width <= 2500 && b.y + b.height <= 1686), "ล้น");
    ok(bx.every((b, i) => bx.every((c, j) => i === j || b.x + b.width <= c.x || c.x + c.width <= b.x || b.y + b.height <= c.y || c.y + c.height <= b.y)), "ซ้อน");
    ok(THAI.test(s.chatBarText ?? "") && s.image?.contentType === "image/png" && s.image.data.length <= 1_048_576 && !LEGAL_BAD.test(J({ ...s, image: null })), "chatBar/รูป/คำต้องห้าม");
  }, "MAJOR");
  await st("R-2", "syncDormRichMenu (เจ้าของ): ยิงสร้างเมนูบน OA1 (Bearer OA1) เท่านั้น · created true · เรียกซ้ำ ⇒ created false ไม่สร้างใหม่", async () => {
    needReady();
    const m = mark();
    const r = keep(await LN.sync()(cO, { unitId: DA }));
    ok(r?.ok && r.created === true, J(r));
    const cr = since(m).filter((f) => f.method === "POST" && f.path === "/v2/bot/richmenu");
    ok(cr.length === 1 && cr[0].auth === ids.TOK1 && J(cr[0].json).includes("dorm.bills"), `สร้าง ${cr.length}`);
    ok(since(m).every((f) => f.auth === ids.TOK1), "มีโทเคนอื่น");
    const m2 = mark();
    const r2 = await LN.sync()(cO, { unitId: DA });
    ok(r2?.ok && r2.created === false && !since(m2).some((f) => f.path === "/v2/bot/richmenu"), J(r2));
  }, "MAJOR");
  await st("R-3", "ไม่ยิง LINE: richMenu ปิด ⇒ DISABLED · หน่วยไม่มี OA ⇒ NOT_CONFIGURED · ไม่มีสิทธิ์/ร้านอื่น ⇒ NOT_FOUND · OA ใช้ร่วมกับหน่วยอื่น ⇒ SHARED_OA", async () => {
    needReady();
    const m = mark();
    await setVal(A, "rooms.notify.richMenu", DA, false);
    const a = await LN.sync()(cO, { unitId: DA });
    await unsetVal(A, "rooms.notify.richMenu", DA);
    const b = await LN.sync()(cO, { unitId: DN });
    const c = await LN.sync()({ tenantId: A, actorUserId: ids.VIEW }, { unitId: DA });
    const d = await LN.sync()({ tenantId: B, actorUserId: ids.OWNB }, { unitId: DA });
    await setVal(A, "messaging.lineConnectionId", DN, ids.OA1);
    const e = await LN.sync()(cO, { unitId: DA });
    await unsetVal(A, "messaging.lineConnectionId", DN);
    eq([a, b, c, d, e].map((x: Any) => x?.code), ["DISABLED", "NOT_CONFIGURED", "NOT_FOUND", "NOT_FOUND", "SHARED_OA"], "รหัสผล");
    eq(since(m).length, 0, "คำขอ LINE");
  }, "MAJOR");

  // ═══════════════ P พอร์ทัล ═══════════════
  console.log("\n── P พอร์ทัล ──");
  const tok = (leaseId: string, tenantId = A, purpose = "dorm.portal") => SL.signLink({ tenantId, purpose, subjectId: leaseId, expMin: 60 });
  let ckN = 0;
  const ck = () => CK(`p${++ckN}`);
  const load = async (t: string, bill?: string | null) => keep(await PT.load()(t, { bill: bill ?? null }, { clientKey: ck() }));
  let viewL1: Any = null, viewL2paid: Any = null, viewL2nov: Any = null;
  await st("P-1", "loadPortal (L1 · ไม่ระบุบิล) ⇒ บิลเปิดงวดล่าสุด พ.ย. · ห้อง 101 · ยอด/ค้าง 480,000 · UNPAID · ครบกำหนด 2026-11-05 · QR ยอดตรง (tag 54 = 4800.00 · พร้อมเพย์ 0812345678) · ประวัติ = บิล L1 เท่านั้น (2 งวด) · ไม่มีเบอร์/ชื่อ/id คนอื่น", async () => {
    needReady();
    const v = (viewL1 = await load(tok(ids.L1)));
    ok(v, "null");
    eq([v.roomNumber, v.bill?.billId, v.bill?.periodKey, v.bill?.totalSatang, v.bill?.outstandingSatang, v.bill?.state, v.bill?.dueDate], ["101", bl(`L1:${P2}`).id, P2, BASE, BASE, "UNPAID", "2026-11-05"], "บิล");
    ok((v.bill.lines as Any[]).reduce((s, l) => s + l.amountSatang, 0) === BASE, "Σ บรรทัด");
    ok(v.pay?.amountSatang === BASE && emvTag(v.pay.payload, "54") === "4800.00" && v.pay.promptpayId === "0812345678" && String(v.pay.qrSvgDataUrl).startsWith("data:image/svg+xml"), `pay ${J(v.pay).slice(0, 120)}`);
    eq((v.history as Any[]).map((h) => h.billId).sort(), [bl(`L1:${P1}`).id, bl(`L1:${P2}`).id].sort(), "ประวัติ");
    eq((v.history as Any[]).map((h) => h.periodKey), [P2, P1], "เรียงงวด");
    ok(v.can?.uploadSlip === true && String(v.links?.self ?? "").includes("/d/") && String(v.links?.lease ?? "").includes("/lease"), "can/links");
    const s = J(v);
    ok(!PHONES.some((p) => s.includes(p)) && !NAMES.some((n) => s.includes(n)) && ![ids.L1, ids.L2, ids.L3, ids.L4, ids.P1, bl(`L2:${P2}`).id].some((x) => s.includes(x)), "มีเบอร์/ชื่อ/id");
  });
  const NULL_CASES = (): [string, string, string | null][] => {
    const good = tok(ids.L1);
    const [p, sg] = good.split(".");
    const flip = `${p}.${sg.slice(0, -2)}${sg.slice(-2) === "AA" ? "AB" : "AA"}`;
    const secret = process.env.SESSION_SECRET ?? "";
    const expired = sqcPortalToken(secret, { tenantId: A, leaseId: ids.L1, nowMs: Date.now() - 3 * 3_600_000, ttlMin: 60 });
    return [
      ["ขยะ", "abc", null], ["ลายเซ็นปลอม", flip, null], ["purpose อื่น", tok(ids.L1, A, "booking.manage"), null], ["หมดอายุ", expired, null],
      ["tenant B + สัญญาร้าน A", tok(ids.L1, B), null], ["tenant A + สัญญาร้าน B", tok(ids.LB1, A), null],
      ["บิลห้องอื่น", good, bl(`L2:${P2}`).id], ["บิลร้าน B", good, bl(`LB1:${P1}`).id], ["บิลขยะ", good, "zz"], ["บิล VOID ของตัวเอง?", tok(ids.L4), bl(`L4:${P1}`).id],
      ["สัญญาจบ (ลิงก์เก่าก่อนย้ายออก)", tokenL3old, null], ["สัญญาจบ + บิลของเขาเอง", tokenL3old, bl(`L3:${P1}`).id], ["สัญญายกเลิก", tok(ids.L8), null], ["สัญญาเลยวันจบ", tok(ids.L6), null],
    ];
  };
  await st("P-2", "X1/X7 404 เดียวกัน: loadPortal ⇒ null ทุกกรณี (ขยะ · ลายเซ็นปลอม · purpose อื่น · หมดอายุ · สลับร้าน 2 ทาง · บิลห้องอื่น/ร้านอื่น/ขยะ/VOID · สัญญาจบ/ยกเลิก/เลยวันจบ) · receipt/lease/file ⇒ null · slip ⇒ NOT_FOUND reason เดียวกัน", async () => {
    needReady();
    const bad: string[] = [];
    const reasons = new Set<string>();
    for (const [n, t, b] of NULL_CASES()) {
      const v = await PT.load()(t, { bill: b }, { clientKey: ck() });
      if (v !== null) bad.push(`load ${n}`);
      const rc = await PT.receipt()(t, { bill: b ?? bl(`L1:${P1}`).id }, { clientKey: ck() });
      if (rc !== null) bad.push(`receipt ${n}`);
      if (!b) {
        if ((await PT.lease()(t, { clientKey: ck() })) !== null) bad.push(`lease ${n}`);
        if ((await PT.file()(t, ids.f1, { clientKey: ck() })) !== null) bad.push(`file ${n}`);
      }
      const s = await PT.slip()(t, { billId: b ?? bl(`L1:${P2}`).id, file: { data: pngOf(`p2-${n}`), contentType: "image/png" }, idempotencyKey: `p2-${STAMP}-${ckN}` }, { clientKey: ck(), deps: noopDeps });
      if (!(s?.ok === false && s.code === "NOT_FOUND")) bad.push(`slip ${n}=${J(s).slice(0, 60)}`); else reasons.add(s.reason);
    }
    ok(!bad.length, bad.join(" · "));
    ok(reasons.size === 1 && THAI.test([...reasons][0]), `reason ต่างกัน ${J([...reasons])}`);
    eq(await prisma.paymentSlip.count({ where: { tenantId: { in: [A, B] }, refId: { in: [bl(`L1:${P2}`).id, bl(`L2:${P2}`).id, bl(`LB1:${P1}`).id, bl(`L3:${P1}`).id, bl(`L4:${P1}`).id] } } }), 0, "สลิปที่เกิด");
  });
  await st("P-3", "ลิงก์เก่าก่อนย้ายออก: portalUrl(L3) ตอนยัง ACTIVE ได้ลิงก์ · หลังจบ portalUrl(L3) = \"\" · ผู้เช่าใหม่ห้องเดิม (L3b) เห็นเฉพาะบิลของตัวเอง ไม่เห็นบิล ต.ค. ของคนเก่า", async () => {
    needReady();
    ok(typeof portalUrlL3before === "string" && portalLinks(portalUrlL3before).some((l) => l.sub?.subjectId === ids.L3), `ก่อนย้ายออก = ${J(portalUrlL3before)}`);
    eq(await PT.url()({ tenantId: A }, { leaseId: ids.L3 }), "", "หลังย้ายออก");
    const v = await load(tok(ids.L3b));
    ok(v && v.roomNumber === "103", "L3b");
    eq((v.history as Any[]).map((h) => h.billId), [bl(`L3b:${P2}`).id], "ประวัติ L3b");
    ok(!J(v).includes(bl(`L3:${P1}`).id), "เห็นบิลคนเก่า");
  });
  await st("P-4", "X7 เวลาใกล้กัน: ค่ากลาง 7 รอบของ (ขยะ · ลิงก์สัญญาจบ · ลิงก์ถูก+บิลห้องอื่น) ต่างกัน ≤ 250 ms", async () => {
    needReady();
    const cases: [string, string | null][] = [["abc", null], [tokenL3old, null], [tok(ids.L1), bl(`L2:${P2}`).id]];
    const ms: number[][] = [[], [], []];
    for (let r = 0; r < 7; r++) for (const [i, [t, b]] of cases.entries()) { const t0 = performance.now(); await PT.load()(t, { bill: b }, { clientKey: ck() }); ms[i].push(performance.now() - t0); }
    const md = ms.map(median);
    ok(Math.max(...md) - Math.min(...md) <= 250, `ค่ากลาง ${md.map((x) => Math.round(x)).join(" / ")} ms`);
  }, "MAJOR");
  await st("P-5", "rate limit ก่อนตรวจลิงก์: clientKey เดิมเกิน PORTAL_RATE.view ⇒ ลิงก์ถูกก็ null · clientKey อื่นยังเปิดได้ · slip เกิน PORTAL_RATE.slip ⇒ RATE_LIMITED", async () => {
    needReady();
    const R = portalL.mod?.PORTAL_RATE;
    ok(R?.view?.limit && R?.slip?.limit, "ไม่มี PORTAL_RATE");
    const k = CK("rl");
    for (let i = 0; i < R.view.limit; i++) await PT.load()("abc", {}, { clientKey: k });
    eq(await PT.load()(tok(ids.L1), {}, { clientKey: k }), null, "เกินโควตา");
    ok((await PT.load()(tok(ids.L1), {}, { clientKey: ck() })) !== null, "clientKey อื่น");
    const k2 = CK("rls");
    for (let i = 0; i < R.slip.limit; i++) await PT.slip()("abc", { billId: "x", file: { data: pngOf("x"), contentType: "image/png" }, idempotencyKey: `rls${STAMP}${i}x` }, { clientKey: k2, deps: noopDeps });
    const s = await PT.slip()(tok(ids.L2), { billId: bl(`L2:${P2}`).id, file: { data: pngOf(`rl-${STAMP}`), contentType: "image/png" }, idempotencyKey: `rls${STAMP}ok` }, { clientKey: k2, deps: noopDeps });
    eq([s?.ok, s?.code], [false, "RATE_LIMITED"], "slip");
  }, "MAJOR");
  await st("P-6", "QR ยอดค้างสดตรงทุกสตางค์: L2 พ.ย. จ่ายแล้ว 100,000 ⇒ ค้าง 380,000 · PARTIAL · tag 54 = 3800.00 · L4 พ.ย. ใบลดหนี้ 20,000 ⇒ ค้าง 460,000 · tag 54 = 4600.00 · adjustments CREDIT 20,000", async () => {
    needReady();
    const v = (viewL2nov = await load(tok(ids.L2), bl(`L2:${P2}`).id));
    eq([v?.bill?.outstandingSatang, v?.bill?.paidSatang, v?.bill?.state, v?.pay?.amountSatang, emvTag(v?.pay?.payload ?? "", "54")], [380_000, 100_000, "PARTIAL", 380_000, "3800.00"], "L2");
    const w = await load(tok(ids.L4), bl(`L4:${P2}`).id);
    eq([w?.bill?.outstandingSatang, w?.pay?.amountSatang, emvTag(w?.pay?.payload ?? "", "54"), (w?.bill?.adjustments as Any[] ?? []).map((a) => [a.kind, a.amountSatang])], [460_000, 460_000, "4600.00", [["CREDIT", 20_000]]], "L4");
  });
  await st("P-7", "บิลจ่ายครบ (L2 ต.ค.): PAID · ไม่มี QR · ไม่ให้แนบสลิป · มีลิงก์ใบเสร็จ", async () => {
    needReady();
    const v = (viewL2paid = await load(tok(ids.L2), bl(`L2:${P1}`).id));
    eq([v?.bill?.state, v?.bill?.outstandingSatang, v?.pay, v?.can?.uploadSlip, typeof v?.links?.receipt === "string" && v.links.receipt.includes("/receipt")], ["PAID", 0, null, false, true], "PAID");
  }, "MAJOR");
  await st("P-8", "ใบเสร็จ: L2 ต.ค. ⇒ \"ใบเสร็จรับเงิน\" · เลขใบแจ้งหนี้จริง · รับ 480,000 · L2 พ.ย. ⇒ \"บางส่วน\" 100,000 · L1 พ.ย. (ยังไม่จ่าย) ⇒ null · ลิงก์ L1 + บิล L2 ⇒ null", async () => {
    needReady();
    const doc = await prisma.accountDocument.findFirst({ where: { id: bl(`L2:${P1}`).accountDocumentId }, select: { docNo: true } });
    const a = keep(await PT.receipt()(tok(ids.L2), { bill: bl(`L2:${P1}`).id }, { clientKey: ck() }));
    ok(a && String(a.titleTh).includes("ใบเสร็จ") && a.docNo === doc?.docNo && (a.payments as Any[]).reduce((s, p) => s + p.amountSatang, 0) === BASE && a.roomNumber === "102", J(a).slice(0, 200));
    const b = keep(await PT.receipt()(tok(ids.L2), { bill: bl(`L2:${P2}`).id }, { clientKey: ck() }));
    ok(b && String(b.titleTh).includes("บางส่วน") && (b.payments as Any[]).reduce((s, p) => s + p.amountSatang, 0) === 100_000, J(b).slice(0, 160));
    eq([await PT.receipt()(tok(ids.L1), { bill: bl(`L1:${P2}`).id }, { clientKey: ck() }), await PT.receipt()(tok(ids.L1), { bill: bl(`L2:${P1}`).id }, { clientKey: ck() })], [null, null], "null");
  }, "MAJOR");
  await st("P-9", "X10 สัญญา/เอกสารของตัวเอง: L1 ⇒ ข้อความสัญญาจาก snapshot · ไฟล์ ROOM_PHOTO + DOCUMENT เท่านั้น (ไม่มีบัตร ID_CARD · ไม่มีลายเซ็น) · portalFileRef: ของตัวเองได้ · บัตร/ลายเซ็น/ไฟล์สัญญาอื่น ⇒ null", async () => {
    needReady();
    const v = keep(await PT.lease()(tok(ids.L1), { clientKey: ck() }));
    ok(v && v.roomNumber === "101" && String(v.contract?.textTh ?? "").includes(`ทดสอบ D9 ${STAMP}`) && v.contract.clauses?.length === 1, J(v).slice(0, 200));
    ok(!NAMES.some((n) => J(v).includes(n)), "ผลของ loadPortalLease มีชื่อผู้เช่า"); // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W1) — หน้า lease render จากผลนี้ตรงตัว (ไม่มีแหล่งข้อความอื่น)
    eq((v.files as Any[]).map((f) => [f.fileId, f.kind]).sort(), [[ids.f1, "ROOM_PHOTO"], [ids.f3, "DOCUMENT"]].sort(), "ไฟล์");
    ok((v.files as Any[]).every((f) => String(f.path).includes(`/f/${f.fileId}`)), "path ไฟล์");
    const ref = await PT.file()(tok(ids.L1), ids.f1, { clientKey: ck() });
    eq([ref?.fileId, ref?.contentType], [ids.f1, "image/png"], "ref");
    eq([await PT.file()(tok(ids.L1), ids.f2, { clientKey: ck() }), await PT.file()(tok(ids.L1), ids.f4, { clientKey: ck() }), await PT.file()(tok(ids.L1), ids.f5, { clientKey: ck() })], [null, null, null], "ห้าม");
  }, "MAJOR");
  await st("P-10", "แนบสลิปพอร์ทัล (L2 พ.ย.): submitSlip(DORM_BILL) refId บิล · ยอดคาดหวัง = ค้างสด 380,000 · Party P2 · ซ้ำคีย์ ⇒ replayed สลิปเดิม · บิลจ่ายครบ ⇒ NOT_PAYABLE · ไฟล์ไม่ใช่รูป/ใหญ่เกิน ⇒ BAD_FILE · ไม่มีแถวเกินมา · หน้าแสดง PENDING_REVIEW", async () => {
    needReady();
    const t = tok(ids.L2), k = `pk${STAMP}a`;
    const file = { data: pngOf(`p10-${STAMP}`), contentType: "image/png" };
    const a = keep(await PT.slip()(t, { billId: bl(`L2:${P2}`).id, file, idempotencyKey: k }, { clientKey: ck(), deps: noopDeps }));
    const b = keep(await PT.slip()(t, { billId: bl(`L2:${P2}`).id, file, idempotencyKey: k }, { clientKey: ck(), deps: noopDeps }));
    ok(a?.ok && b?.ok && a.slipId === b.slipId && b.replayed === true, `${J(a)} ${J(b)}`);
    const row = await prisma.paymentSlip.findFirst({ where: { id: a.slipId } });
    eq([row?.tenantId, row?.unitId, row?.domain, row?.refType, row?.refId, row?.expectedSatang, row?.partyId], [A, DA, "DORM", "DORM_BILL", bl(`L2:${P2}`).id, 380_000, ids.P2], "แถว");
    const c = await PT.slip()(t, { billId: bl(`L2:${P1}`).id, file: { data: pngOf(`p10c-${STAMP}`), contentType: "image/png" }, idempotencyKey: `pk${STAMP}c` }, { clientKey: ck(), deps: noopDeps });
    const d = await PT.slip()(t, { billId: bl(`L2:${P2}`).id, file: { data: Uint8Array.from(Buffer.from("%PDF-1.4 qc")), contentType: "application/pdf" }, idempotencyKey: `pk${STAMP}d` }, { clientKey: ck(), deps: noopDeps });
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(PNG_SIG, 0);
    const e = await PT.slip()(t, { billId: bl(`L2:${P2}`).id, file: { data: big, contentType: "image/png" }, idempotencyKey: `pk${STAMP}e` }, { clientKey: ck(), deps: noopDeps });
    eq([c?.code, d?.code, e?.code], ["NOT_PAYABLE", "BAD_FILE", "BAD_FILE"], "ปฏิเสธ");
    eq(await prisma.paymentSlip.count({ where: { tenantId: A, refId: { in: [bl(`L2:${P1}`).id, bl(`L2:${P2}`).id] } } }), 1, "แถวสลิป");
    const v = (viewL2nov = await load(t, bl(`L2:${P2}`).id));
    eq([v?.bill?.state, v?.bill?.slip?.status !== undefined], ["PENDING_REVIEW", true], "สถานะหน้า");
  });

  // ═══════════════ A แนบสลิปจากรูปในแชท ═══════════════
  console.log("\n── A รูปสลิปในแชท ──");
  const slipsOn = (billIds: string[]) => prisma.paymentSlip.count({ where: { tenantId: { in: [A, B] }, refType: "DORM_BILL", refId: { in: billIds } } });
  const img = async (k: string, mid: string, over: Record<string, unknown> = {}) => { const r = keep(await LN.image()({ ...pctx(k), ...over }, { messageId: mid }, { deps: noopDeps })); REPLIES.push(r); return r; };
  const MID = (n: string) => `9${Date.now() % 1_000_000_000}${n}`;
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — W3: แนบอัตโนมัติเฉพาะเมื่อมีตัวตรวจสลิป ⇒ A-1/A-6 แยก (ก) ไม่มีตัวตรวจ = control ลบ (ข) ตัวตรวจ FAKE (VALID + transRef)
  //   A-1 ย้ายไปบิล L3b พ.ย. (ผู้เช่าใหม่ P7 ห้อง 103 · ผู้ติดต่อที่ผูกรหัสชนะใน L-3) — บิล L2 พ.ย. มีสลิปพอร์ทัลจาก P-10 รอตรวจอยู่ (W7 ห้ามใบที่สอง)
  const mkFakeVerifier = async (tenantId: string, ownerId: string, unitId: string, tag: string): Promise<string> => {
    const actor = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const sv = await INT?.saveIntegration?.({ tenantId }, actor, { create: true, kind: "SLIP_VERIFY", provider: "FAKE", label: `qc-d9-${STAMP}-${tag}`, unitIds: [unitId], onFailure: "MANUAL", fields: { apiKey: `qcd9${randomBytes(14).toString("hex")}`, mode: "OK" } });
    const id = sv?.integration?.id ?? "";
    if (id) await INT.testIntegration({ tenantId }, actor, { id });
    const row = id ? await prisma.tenantIntegration.findUnique({ where: { id } }) : null;
    ok(row?.status === "CONNECTED", `ตั้งตัวตรวจ FAKE ไม่ได้: ${J(sv).slice(0, 160)} · status ${row?.status}`);
    return id;
  };
  const ctxP7 = () => ({ tenantId: A, connectionId: ids.OA1, chatContactId: linkWinner, partyId: ids.P7, replyToken: null });
  const midA1 = MID("1");
  await st("A-1a", "ไม่มีตัวตรวจสลิป (control ลบ · W3): ผู้เช่า P7 (บิลเปิด 1 ใบ L3b พ.ย.) ส่งรูป ⇒ handled false · ไม่ดึงรูป · ไม่มีสลิป · ไม่ตอบ", async () => {
    needReady();
    ok(linkWinner, "ไม่มีผู้ติดต่อ P7 จาก L-3");
    const m = mark(), n0 = await slipsOn([bl(`L3b:${P2}`).id]);
    const r = keep(await LN.image()(ctxP7(), { messageId: MID("1a") }, { deps: noopDeps }));
    REPLIES.push(r);
    ok(r?.handled === false && r?.attached === null && !r?.reply, J(r).slice(0, 160));
    eq(contentGets(m).length, 0, "ดึงรูป");
    eq((await slipsOn([bl(`L3b:${P2}`).id])) - n0, 0, "สลิป");
  });
  await st("A-1", "ตัวตรวจ FAKE (VALID + transRef) บนหน่วย DA: ผู้เช่า P7 (บิลเปิด 1 ใบ: L3b พ.ย.) ส่งรูป ⇒ ดึงเนื้อรูปจาก OA1 (Bearer OA1) · สลิปแนบ L3b พ.ย. 1 ใบพอดี · ยอดคาดหวัง = ค้างสด 480,000 · Party P7 · ตอบ \"103\"", async () => {
    needReady();
    ok(linkWinner, "ไม่มีผู้ติดต่อ P7 จาก L-3");
    await mkFakeVerifier(A, ids.OWN, DA, "a");
    const m = mark(), n0 = await slipsOn([bl(`L3b:${P2}`).id]), nAll = await slipsOn(ALL_BILL_IDS());
    const r = await LN.image()(ctxP7(), { messageId: midA1 }, { deps: noopDeps });
    keep(r); REPLIES.push(r);
    ok(r?.handled === true && r?.attached?.billId === bl(`L3b:${P2}`).id, J(r).slice(0, 200));
    const g = contentGets(m);
    ok(g.length === 1 && g[0].auth === ids.TOK1 && g[0].path.includes(midA1), `ดึงรูป ${g.map((x) => x.path).join(",")}`);
    const row = await prisma.paymentSlip.findFirst({ where: { id: r.attached.slipId } });
    eq([row?.refId, row?.expectedSatang, row?.partyId, row?.domain, (await slipsOn([bl(`L3b:${P2}`).id])) - n0, (await slipsOn(ALL_BILL_IDS())) - nAll], [bl(`L3b:${P2}`).id, BASE, ids.P7, "DORM", 1, 1], "แถว");
    ok(typeof row?.transRef === "string" && row.transRef.length > 0, "สลิปไม่มีเลขอ้างอิงจากตัวตรวจ");
    ok(J(r.reply).includes("103"), "คำตอบ");
  });
  await st("A-2", "X3/X4 LINE ส่ง event รูปเดิมซ้ำ 2 ทาง + 2 โพรเซส ⇒ ไม่มีสลิปใหม่ (คีย์ messageId) · ไม่มี throw", async () => {
    needReady();
    const n0 = await slipsOn([bl(`L3b:${P2}`).id]); // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — รูปของ A-1 (P7 · L3b)
    const at = atIn();
    const ctx = ctxP7();
    const [ch, inp] = await Promise.all([fanout("image", [[{ ctx, messageId: midA1 }], [{ ctx, messageId: midA1 }]], at), inProcAt(at, [0, 1].map(() => () => LN.image()(ctx, { messageId: midA1 }, { deps: noopDeps })))]);
    ok(!badOf([...ch, ...inp]).length, J(badOf([...ch, ...inp])));
    eq((await slipsOn([bl(`L3b:${P2}`).id])) - n0, 0, "สลิปใหม่");
  });
  await st("A-3", "กำกวม (สัญญาเดียวค้าง 2 งวด: P1 L1 ต.ค.+พ.ย.) ⇒ ไม่แนบ · handled true · ตอบลิงก์พอร์ทัลของ L1", async () => {
    needReady();
    const n0 = await slipsOn([bl(`L1:${P1}`).id, bl(`L1:${P2}`).id]);
    const r = await img("C1", MID("3"));
    ok(r?.handled === true && r?.attached === null && portalLinks(r.reply).some((l) => l.sub?.subjectId === ids.L1), J(r).slice(0, 200));
    eq((await slipsOn([bl(`L1:${P1}`).id, bl(`L1:${P2}`).id])) - n0, 0, "สลิป");
  });
  await st("A-4", "กำกวม (สองสัญญา P5: L4 + L5) ⇒ ไม่แนบ · ตอบลิงก์ 2 สัญญา", async () => {
    needReady();
    const ids4 = [bl(`L4:${P2}`).id, bl(`L5:${P1}`).id, bl(`L5:${P2}`).id];
    const n0 = await slipsOn(ids4);
    const r = await img("C5", MID("4"));
    ok(r?.handled === true && r?.attached === null, J(r).slice(0, 160));
    eq([...new Set(portalLinks(r.reply).map((l) => l.sub?.subjectId))].sort(), [ids.L4, ids.L5].sort(), "ลิงก์");
    eq((await slipsOn(ids4)) - n0, 0, "สลิป");
  });
  await st("A-5", "ไม่ใช่ผู้เช่าที่ live ⇒ handled false · ไม่ดึงรูป · ไม่ตอบ · ไม่มีสลิป: ไม่มี Party · Party ไม่เช่า · ผู้เช่าส่งจาก OA2 · ผู้เช่าเก่า (สัญญาจบมีบิลค้าง) · Party ร้าน B ใต้ ctx A · ปิด slipAutoAttach (P2)", async () => {
    needReady();
    const m = mark(), n0 = await slipsOn(ALL_BILL_IDS());
    const rs = [await img("CN", MID("51")), await img("CX", MID("52")), await img("C1b", MID("53")), await img("C3", MID("54")), await img("CX", MID("55"), { partyId: ids.PB })];
    await setVal(A, "rooms.payment.slipAutoAttach", DA, false);
    try { rs.push(await img("C2", MID("56"))); } finally { await unsetVal(A, "rooms.payment.slipAutoAttach", DA); }
    const bad = rs.map((r: Any, i) => (r?.handled === false && r?.attached === null && !r?.reply ? null : `#${i} ${J(r).slice(0, 60)}`)).filter(Boolean);
    ok(!bad.length, bad.join(" · "));
    eq(contentGets(m).length, 0, "ดึงรูป");
    eq((await slipsOn(ALL_BILL_IDS())) - n0, 0, "สลิป");
  });
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — A-6 แยก (ก) ร้าน B ไม่มีตัวตรวจ = control ลบ (ข) ตัวตรวจ FAKE ของร้าน B
  const ctxB = () => ({ tenantId: B, connectionId: ids.OAB, chatContactId: C.CB.id, partyId: ids.PB, replyToken: null });
  await st("A-6a", "ร้าน B ไม่มีตัวตรวจสลิป (control ลบ · W3) ⇒ handled false · ไม่ดึงรูป · ไม่มีสลิปบิลร้าน B", async () => {
    needReady();
    const m = mark(), n0 = await slipsOn([bl(`LB1:${P1}`).id]);
    const r = keep(await LN.image()(ctxB(), { messageId: MID("6a") }, { deps: noopDeps }));
    ok(r?.handled === false && r?.attached === null && !r?.reply, J(r).slice(0, 160));
    eq(contentGets(m).length, 0, "ดึงรูป");
    eq((await slipsOn([bl(`LB1:${P1}`).id])) - n0, 0, "สลิป");
  }, "MAJOR");
  await st("A-6", "ร้าน B + ตัวตรวจ FAKE ของร้าน B (ผู้เช่าร้าน B บน OA ร้าน B · บิลเปิด 1 ใบ) ⇒ แนบบิลร้าน B 1 ใบพอดี · สลิป tenantId B (ไม่ปนร้าน A)", async () => {
    needReady();
    await mkFakeVerifier(B, ids.OWNB, ids.DB, "b");
    const n0 = await slipsOn([bl(`LB1:${P1}`).id]), nA = await prisma.paymentSlip.count({ where: { tenantId: A } });
    const r = keep(await LN.image()(ctxB(), { messageId: MID("6") }, { deps: noopDeps }));
    ok(r?.attached?.billId === bl(`LB1:${P1}`).id, J(r).slice(0, 160));
    const row = await prisma.paymentSlip.findFirst({ where: { id: r.attached.slipId } });
    eq([row?.tenantId, row?.unitId, (await slipsOn([bl(`LB1:${P1}`).id])) - n0, (await prisma.paymentSlip.count({ where: { tenantId: A } })) - nA], [B, ids.DB, 1, 0], "แถว");
  }, "MAJOR");
  await st("A-7", "§8.1 ข้อ 3 แข่ง: รูปใหม่ 1 ใบ (2 โพรเซส + ในโพรเซส) พร้อมพนักงานรับเงินครบ 380,000 ⇒ สลิปของรูปนี้ ≤ 1 · ถ้ามีต้องอยู่บิล L2 พ.ย. ยอดคาดหวัง 380,000 · ไม่มีสลิปบิลอื่น · ไม่มี throw · หลังจากนั้นบิลปิด ⇒ รูปถัดไปไม่แนบ", async () => {
    needReady();
    const mid = MID("7");
    const others = ALL_BILL_IDS().filter((x) => x !== bl(`L2:${P2}`).id);
    const n0 = await slipsOn(others);
    const t0 = new Date(Date.now() - 1_500);
    const ctx = pctx("C2");
    const at = atIn();
    const payIn = { tenantId: A, unitId: DA, docId: bl(`L2:${P2}`).accountDocumentId, amountSatang: 380_000, idempotencyKey: `qc-d9-${STAMP}-race`, paidAt: "2026-11-03T05:00:00.000Z" };
    const [ch, inp] = await Promise.all([fanout("image", [[{ ctx, messageId: mid }], [{ ctx, messageId: mid }]], at), fanout("pay", [[{ input: payIn }]], at), inProcAt(at, [() => LN.image()(ctx, { messageId: mid }, { deps: noopDeps })])]).then(([a, b, c]) => [[...a, ...b], c]);
    ok(!badOf([...ch, ...inp]).length, J(badOf([...ch, ...inp])));
    ok(ch.some((x: Any) => x?.ok === true && x?.appliedSatang === 380_000), `รับเงิน ${J(ch).slice(0, 200)}`);
    const mine = await prisma.paymentSlip.findMany({ where: { tenantId: A, refType: "DORM_BILL", createdAt: { gte: t0 } } });
    ok(mine.length <= 1 && mine.every((s: Any) => s.refId === bl(`L2:${P2}`).id && s.expectedSatang === 380_000), J(mine.map((s: Any) => [s.refId, s.expectedSatang])));
    eq((await slipsOn(others)) - n0, 0, "สลิปบิลอื่น");
    const after = await img("C2", MID("71"));
    eq([after?.handled, after?.attached], [false, null], "หลังจ่ายครบ");
  });

  // ═══════════════ U DOM ═══════════════
  console.log("\n── U DOM ──");
  const compL = await loadIf(F.comp);
  const React = (await tryImport("react")).mod as Any;
  const RDS = (await tryImport("react-dom/server")).mod as Any;
  const render = (view: Any): string => {
    const Comp = compL.mod?.default;
    if (typeof Comp !== "function") throw new AssertFail(`โหลด ${F.comp} ไม่ได้: ${compL.err || "ไม่มี default export"}`);
    return String(RDS.renderToStaticMarkup(React.createElement(Comp, { view, token: "tok", action: async () => ({}) }))).replace(/<!-- -->/g, "");
  };
  const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
  const textOf = (h: string) => unesc(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const tagWith = (h: string, attr: string, val?: string): string | null => {
    const re = new RegExp(`<[^>]*\\s${attr}(?:="([^"]*)")?[^>]*>`, "g");
    for (const m of h.matchAll(re)) if (val === undefined || m[1] === val) return m[0];
    return null;
  };
  const HTML: string[] = [];
  await st("U-1", "UNPAID (L1): ราก data-dorm-portal data-state=UNPAID · \"บิลห้อง 101\" · บิล data-portal-bill=2026-11 · บรรทัด · ยอด ฿4,800.00 · ครบกำหนด 5 พ.ย. 2569 · กล่องจ่าย QR (src = svg) ยอดตรง · บันทึก QR/คัดลอกพร้อมเพย์ · ฟอร์มสลิป (file accept · billId · idempotencyKey) · ประวัติ 2 แถว · ลิงก์สัญญา", () => {
    needReady();
    ok(viewL1, "ไม่มี view จาก P-1");
    const h = render(viewL1); HTML.push(h);
    const t = textOf(h);
    ok(tagWith(h, "data-dorm-portal") && /data-state="UNPAID"/.test(tagWith(h, "data-dorm-portal") ?? ""), "ราก");
    ok(t.includes("บิลห้อง 101") && t.includes("฿4,800.00") && t.includes("5 พ.ย. 2569"), `ข้อความ ${t.slice(0, 160)}`);
    ok(tagWith(h, "data-portal-bill", P2) && tagWith(h, "data-portal-line") && tagWith(h, "data-portal-total") && tagWith(h, "data-portal-due"), "บิล");
    const q = tagWith(h, "data-portal-qr") ?? "";
    ok(/src="data:image\/svg\+xml/.test(q) && tagWith(h, "data-portal-pay") && tagWith(h, "data-portal-save-qr") && tagWith(h, "data-portal-copy-promptpay"), "กล่องจ่าย");
    ok(textOf(h).includes("4,800.00") && (tagWith(h, "data-portal-pay-amount") ?? "") !== "", "ยอดจ่าย");
    const fm = tagWith(h, "data-portal-slip-form");
    const file = /<input[^>]*type="file"[^>]*>/.exec(h)?.[0] ?? "";
    ok(fm && /name="slip"/.test(file) && /accept="image\/jpeg,image\/png,image\/webp"/.test(file), `ฟอร์ม ${file}`);
    ok(new RegExp(`name="billId"[^>]*value="${viewL1.bill.billId}"|value="${viewL1.bill.billId}"[^>]*name="billId"`).test(h) && /name="idempotencyKey"/.test(h), "hidden");
    eq((h.match(/data-portal-history-row="/g) ?? []).length, 2, "ประวัติ");
    ok(/href="[^"]*\/lease[^"]*"/.test(tagWith(h, "data-portal-lease") ?? ""), "ลิงก์สัญญา");
  });
  await st("U-2", "PAID (L2 ต.ค.): data-portal-status=PAID \"ชำระแล้ว ขอบคุณค่ะ\" + ลิงก์ใบเสร็จ · ไม่มีกล่องจ่าย/ฟอร์มสลิป", () => {
    needReady();
    ok(viewL2paid, "ไม่มี view จาก P-7");
    const h = render(viewL2paid); HTML.push(h);
    const rc = tagWith(h, "data-portal-receipt") ?? "";
    ok(tagWith(h, "data-portal-status", "PAID") && textOf(h).includes("ชำระแล้ว ขอบคุณค่ะ") && /href="[^"]*\/receipt[^"]*"/.test(rc), `สถานะ/ใบเสร็จ ${rc}`);
    ok(!tagWith(h, "data-portal-pay") && !tagWith(h, "data-portal-slip-form"), "มีกล่องจ่าย/ฟอร์ม");
  }, "MAJOR");
  await st("U-3", "PENDING_REVIEW (L2 พ.ย. หลังแนบสลิป): data-portal-status=PENDING_REVIEW \"รอตรวจ\"", () => {
    needReady();
    ok(viewL2nov, "ไม่มี view จาก P-10");
    const h = render(viewL2nov); HTML.push(h);
    ok(tagWith(h, "data-portal-status", "PENDING_REVIEW") && textOf(h).includes("รอตรวจ"), "สถานะ");
  }, "MAJOR");

  // ═══════════════ M ข้อความ · สคบ. · PII ═══════════════
  console.log("\n── M ข้อความ/PII ──");
  await st("M-1", "ไม่มีคำต้องห้าม สคบ. ใน: คำตอบ postback/ผูกรหัส/รูป · ข้อความที่ push · HTML พอร์ทัล · ผลคืนทั้งหมด", () => {
    const s = J([REPLIES, FAKE.map((f) => f.json), HTML, RESULTS]);
    const m = LEGAL_BAD.exec(s);
    ok(!m, `พบ "${m?.[0]}"`);
  });
  await st("M-2", "X8 PII: ไม่มีเบอร์ผู้เช่าใน ServiceMessageLog (dedupeKey) · OutboxEvent · AuditLog · คำตอบ · ข้อความที่ push · HTML/ผลคืนพอร์ทัล · ไม่มีชื่อผู้เช่าใน HTML/ผลคืนพอร์ทัล", async () => {
    needReady();
    const sml = await prisma.serviceMessageLog.findMany({ where: { tenantId: { in: [A, B] } }, select: { dedupeKey: true } });
    const ob = await prisma.outboxEvent.findMany({ where: { tenantId: { in: [A, B] } }, select: { payload: true } });
    const au = await prisma.auditLog.findMany({ where: { tenantId: { in: [A, B] } }, select: { after: true, before: true } });
    const bad: string[] = [];
    for (const [n, v] of [["log", sml], ["outbox", ob], ["audit", au], ["คำตอบ", REPLIES], ["push", FAKE.map((f) => f.json)], ["HTML", HTML], ["ผลคืน", RESULTS]] as const) { const s = J(v); if (PHONES.some((p) => s.includes(p) || s.includes(`66${p.slice(1)}`))) bad.push(`${n}: เบอร์`); }
    const portal = J([HTML, viewL1, viewL2paid, viewL2nov]);
    if (NAMES.some((n) => portal.includes(n))) bad.push("พอร์ทัล: ชื่อ");
    ok(!bad.length, bad.join(" · "));
  }, "MAJOR");
  await st("M-3", "ไม่มีคำขอออกนอกเครื่อง (ไม่ยิง LINE จริง)", () => eq(BLOCKED, [], "คำขอนอกเครื่อง"), "MINOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc(tenantIds);
  await st("Z-1", "หลังล้าง: tenant `qc-svc-d9-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (บิล/สัญญา/สลิป/รหัสผูก/log/outbox/ค่าตั้ง) · ผู้ใช้ทดสอบ 0 · rate bucket ของรอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: "qc-svc-d9-" } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: "svc-d9-" } } }), 0, "user");
    const rb: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d9-${STAMP}%`);
    eq(Number(rb[0]?.n ?? 0), 0, "rate bucket");
  }, "MAJOR");
  globalThis.fetch = REAL_FETCH;
  if (LINE_API_BASE_SAVED === undefined) delete process.env.LINE_API_BASE; else process.env.LINE_API_BASE = LINE_API_BASE_SAVED;
  server.close();
}

// ═══════════════ S (git) ═══════════════
console.log("\n── S: ไฟล์ที่แตะ (git) ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
const F_NOTIFY = "src/lib/platform/notify-customer.ts"; // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — มติ W2: precheck แบบเพิ่มอย่างเดียว
const OWN_FIXED = new Set<string>([F.line, F.portal, F.image, F.dormPortal, F.dormIndex, F.content, F.chatIndex, F.webhook, F.staffPage, F.staffActions, F.staffCard, F.postback, F.consumers, F.minute, F.dunning, F.defs, F_NOTIFY]);
const ownPath = (f: string) => OWN_FIXED.has(f) || f.startsWith("src/app/(store)/d/[token]/") || f.startsWith("src/components/dorm/portal/");
{
  const ch = dirty(["src", "prisma", "public"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.line}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("S-1", "แตะเฉพาะไฟล์ของใบ", "D.9 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("S-1", "แตะเฉพาะไฟล์ของใบ (§1) · มีไฟล์ใหม่ครบ", () => {
    const outside = ch.filter((f) => !ownPath(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 8).join(", ")}`);
    const miss = [F.line, F.portal, F.page, F.comp].filter((f) => !existsSync(join(ROOT, f)));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
  });
}
await st("S-2", "ไม่แตะชิ้นต้องห้าม: prisma · core (นอก defs/rooms.ts) · notify-customer · payment · แชท (นอก line-content + index) · โมดูลหอเดิม (นอก portal.ts/index.ts/dunning.ts) · บัญชี · ทะเบียนป้าย event · จอลูกค้า POS /d", () => {
  const banned = dirty(["prisma", "src/lib/core", "src/lib/platform/notify-customer.ts", "src/lib/payment", "src/lib/modules/chat", "src/lib/modules/dorm", "src/lib/modules/account", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", F.posD, F.posDActions, "src/components/dorm/dorm-policy-shared.ts"])
    .filter((f) => ![F.defs, F.content, F.chatIndex, F.dormPortal, F.dormIndex, F.dunning, F_NOTIFY].includes(f as never)); // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3)
  eq(banned, [], "ไฟล์");
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — notify-customer.ts เทียบ c791bf51: เพิ่มอย่างเดียว (ไม่มีบรรทัดที่ลบ) · ไม่มีคอมมิตฐานในทรี = ตรวจกับ HEAD
  const base = (() => { try { git(["cat-file", "-e", "c791bf51^{commit}"]); return "c791bf51"; } catch { return "HEAD"; } })();
  const rmNotify = git(["diff", "-U0", base, "--", F_NOTIFY]).split("\n").filter((l) => /^-(?!-)/.test(l) && l.slice(1).trim());
  eq(rmNotify, [], "notify-customer.ts บรรทัดที่ลบ");
});
await st("S-8", "postback-routes.ts: เพิ่มบรรทัดเท่านั้น · route dorm. lazy import dorm-line (resolveDormParty · onDormPostback · onDormLinked)", () => {
  eq(diffLines(F.postback).filter((l) => l.startsWith("-") && l.slice(1).trim()), [], "บรรทัดที่ลบ");
  const s = stripComments(read(F.postback));
  const i = s.search(/prefix:\s*["']dorm\.["']/);
  ok(i >= 0, "ไม่มี route dorm.");
  const blk = s.slice(i, i + 600);
  ok(/import\(\s*["']@\/lib\/platform\/dorm-line["']\s*\)/.test(blk) && /resolveDormParty/.test(blk) && /onDormPostback/.test(blk) && /onDormLinked/.test(blk), blk.slice(0, 200).replace(/\s+/g, " "));
}, "MAJOR");
await st("S-14", "webhook: เพิ่มบล็อกเท่านั้น (ไม่ลบบรรทัด) · รูป LINE (IMAGE) ⇒ dynamic import dorm-line → onLineImage · มีด่าน connection.type LINE", () => {
  eq(diffLines(F.webhook).filter((l) => l.startsWith("-") && l.slice(1).trim()), [], "บรรทัดที่ลบ");
  const s = stripComments(read(F.webhook));
  ok(/import\(\s*["']@\/lib\/platform\/dorm-line["']\s*\)/.test(s) && /onLineImage\s*\(/.test(s) && /["']IMAGE["']/.test(s), "ไม่มีบล็อกรูป");
}, "MAJOR");
await st("S-15", "dunning.ts: แก้จุดเดียว (payLink = portalUrl ผ่าน dynamic import dorm-portal) · ลบบรรทัด ≤ 2 · ยังส่งผ่าน notifyCustomer", () => {
  const d = diffLines(F.dunning);
  const rm = d.filter((l) => l.startsWith("-") && l.slice(1).trim());
  ok(rm.length <= 2, `ลบ ${rm.length} บรรทัด`);
  const s = stripComments(read(F.dunning));
  ok(/import\(\s*["']@\/lib\/platform\/dorm-portal["']\s*\)/.test(s) && /portalUrl\s*\(/.test(s) && /notifyCustomer\s*\(/.test(s), "ไม่มี hook portalUrl");
}, "MAJOR");

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc ──");
{
  let why = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.dorm.slug }, select: { id: true } }) : null;
    const nb = u ? await prisma.dormBill.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nb === 0) why = "ร้าน svcqc ยังไม่มีฉาก D.13 (reseed → roomboard → lease → dorm-home ก่อน)";
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScene = (args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  if (why) { skip("Q-1", "ฉาก svc-qc-portal-scene: รันได้ · รันซ้ำ = 0/0/0 · ไฟล์ฉากครบ", why, "MAJOR"); skip("Q-2", "ฉากซ่อมตัวเอง + พอร์ทัลบนฉาก (204 PAID · 106 ค้างมี QR)", why, "MAJOR"); }
  else {
    await st("Q-1", "ฉาก svc-qc-portal-scene: รันได้ · รันซ้ำ = 0/0/0 · ไฟล์ฉากมีสัญญา 204/106 + บิล", () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      const a = runScene();
      ok(a.status === 0, `รอบแรก exit=${a.status} ${`${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
      const b = runScene();
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const s = sqcPortalSceneRead(ROOT);
      ok(s && s.tenantId === SQC_TENANT.id && s.leases["204"] && s.leases["106"] && s.bills["204"] && s.bills["106"], J(s));
    }, "MAJOR");
    await st("Q-2", "ซ่อมตัวเอง: ลบไฟล์ฉากแล้วรันใหม่ ⇒ ได้คืน · พอร์ทัลบนฉาก: 204 = PAID · 106 = ค้าง + QR", async () => {
      ok(existsSync(join(ROOT, F.scene)), `ยังไม่มี ${F.scene}`);
      try { rmSync(join(ROOT, SQC_DORM_PORTAL_SCENE.sceneFile)); } catch { /* ไม่มีอยู่แล้ว */ }
      const a = runScene();
      ok(a.status === 0 && sqcPortalSceneRead(ROOT), "ไม่ซ่อม");
      const s = sqcPortalSceneRead(ROOT)!;
      const load = fnOf(portalL, "loadPortal", F.portal);
      const v204 = await load(SL.signLink({ tenantId: s.tenantId, purpose: "dorm.portal", subjectId: s.leases["204"], expMin: 30 }), { bill: null }, { clientKey: CK("q204") });
      const v106 = await load(SL.signLink({ tenantId: s.tenantId, purpose: "dorm.portal", subjectId: s.leases["106"], expMin: 30 }), { bill: null }, { clientKey: CK("q106") });
      eq([v204?.roomNumber, v204?.bill?.state, v106?.roomNumber, v106?.bill?.state !== "PAID", !!v106?.pay], ["204", "PAID", "106", true, true], "พอร์ทัล");
      await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d9-${STAMP}%`);
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ + HTTP 404 ═══════════════
console.log("\n── V ภาพ / HTTP ──");
{
  const base = process.env.QC_BASE ?? "";
  const n1 = "visual-svc d.9 (2 จอพอร์ทัล · 1440 + 390 ไม่ล้น · HTTP < 400)";
  const n2 = "HTTP: ลิงก์ผิดทุกแบบ (ขยะ · ลายเซ็นปลอม · purpose อื่น · บิลห้องอื่น · สัญญาจบ) ⇒ 404 เนื้อเดียวกันทุกไบต์ · ลิงก์ถูก ⇒ 200 · มี noindex";
  if (!base) { skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก D.13 + ฉาก D.9 แล้วรันซ้ำด้วย QC_BASE", "MAJOR"); skip("V-2", n2, "ไม่มี QC_BASE", "CRITICAL"); }
  else {
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "d.9", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const o = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    record("V-1", n1, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status} ${o.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    await st("V-2", n2, async () => {
      const s = sqcPortalSceneRead(ROOT);
      ok(s, "ไม่มีไฟล์ฉาก D.9 (รัน svc-qc-portal-scene ก่อน)");
      const good = SL.signLink({ tenantId: s!.tenantId, purpose: "dorm.portal", subjectId: s!.leases["106"], expMin: 30 });
      const [p, sg] = good.split(".");
      const urls = [`/d/abc`, `/d/${p}.${sg.slice(0, -2)}${sg.slice(-2) === "AA" ? "AB" : "AA"}`, `/d/${SL.signLink({ tenantId: s!.tenantId, purpose: "booking.manage", subjectId: s!.leases["106"], expMin: 30 })}`, `/d/${good}?bill=${s!.bills["204"]}`];
      if (s!.endedLeaseId) urls.push(`/d/${SL.signLink({ tenantId: s!.tenantId, purpose: "dorm.portal", subjectId: s!.endedLeaseId, expMin: 30 })}`);
      const got: { st: number; body: string }[] = [];
      for (const u of urls) { const res = await REAL_FETCH(`${base}${u}`, { headers: { "x-real-ip": `qc-d9-${STAMP}-v2` } }); got.push({ st: res.status, body: await res.text() }); }
      ok(got.every((g) => g.st === 404), `สถานะ ${got.map((g) => g.st).join(",")}`);
      ok(new Set(got.map((g) => g.body)).size === 1, `เนื้อ 404 ต่างกัน (${got.map((g) => g.body.length).join(",")} ไบต์)`);
      const ok200 = await REAL_FETCH(`${base}/d/${good}`, { headers: { "x-real-ip": `qc-d9-${STAMP}-v2b` } });
      const html = await ok200.text();
      ok(ok200.status === 200 && /noindex/.test(html), `ลิงก์ถูก ${ok200.status}`);
      await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-d9-${STAMP}%`);
    });
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
// ORACLE-EDIT (ผู้คุม 30 ต.ค. · W2/W3) — คืน env ของตัวตรวจ FAKE ก่อนชุด regression (ลูกโพรเซสได้ env เดิม)
if (INT_ENV_SAVED.fake === undefined) delete process.env.INTEGRATIONS_FAKE; else process.env.INTEGRATIONS_FAKE = INT_ENV_SAVED.fake;
if (INT_ENV_SAVED.key === undefined) delete process.env.INTEGRATIONS_CREDENTIALS_KEY; else process.env.INTEGRATIONS_CREDENTIALS_KEY = INT_ENV_SAVED.key;
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-d.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.11", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.7", judge: (out, code) => code === 0 || judgeNoFail(out), note: "postback-routes · notifyCustomer · รหัสผูก" },
  { s: "qc-svc-r0.5", judge: (out, code) => code === 0 || judgeNoFail(out), note: "ไม่มี FAIL" },
  { s: "qc-svc-b.9", args: ["--no-regression"], judge: (out) => { const s = summaryOf(out); return !!s && s.failed.every((id) => id === "S-1" || id === "S-2"); }, note: "ไม่มี FAIL ยกเว้น S-1/S-2 = ข้อ 'ไฟล์ของใบ B.9'" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof lineL.mod?.sendDormBill === "function" && typeof portalL.mod?.loadPortal === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (dorm-line.sendDormBill / dorm-portal.loadPortal) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_D9_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-d9-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC D.9 · ผู้เช่าผ่าน LINE + พอร์ทัลจ่าย =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-* ไม่มี QC_BASE · Q-* svcqc ยังไม่มีฉาก D.13 · S-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
