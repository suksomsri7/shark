// QC — ระบบสมาชิก v2 WO M3.10: REST/AI ชุดสาม + manifest — ops §2.13–2.20 (segments · campaigns · journeys · reviews · referrals · notifications · reports · settings/api-keys/webhooks · join (public) · me เพิ่ม) · tools ครบ ~40 · manifest skill · OpenAPI · webhooks CRUD ผ่าน REST + delivery HMAC + retry · หน้า settings/api (webhooks) · หน้าผู้ช่วย AI สมาชิก (ภาพ 27 ซ้าย · proposal flow) · docs generator สมบูรณ์
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.10 · MEMBER-API (ร่างเดิม 708722b §2.13–2.20 · ปัจจุบัน generator ทับ — ยึด id/path/scope ในหัวไฟล์นี้) · พิมพ์เขียว §8 (ผู้ช่วย AI) §9.7 · ภาพ 27 · fitness F13.7/F13.8/F13.9
// requires: member-seed
//
// สัญญา (เพิ่ม src/lib/modules/member/api/ops/{segments,campaigns,journeys,reviews,referrals,notifications,reports,settings,webhooks,join}.ts + ขยาย ops/me.ts · ต่อเข้า MEMBER_OPS · ทุก op เรียก facade (member/marketing/webhooks) ห้าม prisma ตรง · ทุก op ใหม่มี `test: "M3.10-S3.x"` (F13.7) · write ต้อง Idempotency-Key · error codes ตาม @/lib/api/respond · 404-not-403 ข้ามร้าน)
//   op id (method path · scope · kind) — Fable ตัดสินชื่อ path ให้เป็นระเบียบเดียวกับชุดหนึ่ง/สอง:
//     segments.list GET /segments · segments.get GET /segments/{id} · segments.create POST /segments · segments.update PATCH /segments/{id} · segments.delete DELETE /segments/{id} (danger) · segments.count POST /segments/count (read · {definition} → {count, sample[≤5], avgSpend12mSatang}) · segments.members GET /segments/{id}/members — scope member.promo.read (read) / member.promo.manage (write)   [test M3.10-S3.1]
//     campaigns.list GET /campaigns · campaigns.get · campaigns.create POST · campaigns.update PATCH · campaigns.preview POST /campaigns/{id}/preview (read) · campaigns.testSend POST /campaigns/{id}/test · campaigns.send POST /campaigns/{id}/send · campaigns.cancel POST /campaigns/{id}/cancel · campaigns.stats GET /campaigns/{id}/stats   [M3.10-S3.2]
//     journeys.list GET /journeys · journeys.get · journeys.create POST · journeys.update PATCH · journeys.toggle POST /journeys/{id}/toggle · journeys.stats GET /journeys/{id}/stats · journeys.presets GET /journeys/presets · journeys.runs GET /journeys/{id}/runs   [M3.10-S3.3]
//     reviews.list GET /reviews · reviews.get · reviews.request POST /members/{id}/reviews/request · reviews.reply POST /reviews/{id}/reply · reviews.hide POST /reviews/{id}/hide · reviews.escalate POST /reviews/{id}/escalate · reviews.summary GET /reviews/summary · reviews.stats GET /reviews/stats · reviews.settings.get GET /reviews/settings · reviews.settings.set PUT /reviews/settings — member.review.read / member.review.reply / member.settings.manage   [M3.10-S3.4]
//     referrals.program.get GET /referrals/program · referrals.program.set PUT /referrals/program · referrals.list GET /referrals · referrals.leaderboard GET /referrals/leaderboard · referrals.stats GET /referrals/stats · referrals.reject POST /referrals/{id}/reject — member.promo.read / member.referral.manage   [M3.10-S3.5]
//     notifications.templates.list GET /notifications/templates · notifications.templates.set PUT /notifications/templates/{key} · notifications.settings.set PUT /notifications/settings · notifications.stats GET /notifications/stats · notifications.testSend POST /notifications/templates/{key}/test — member.settings.manage (list/stats = read)   [M3.10-S3.6]
//     reports.overview GET /reports/overview · reports.rfm · reports.tiers · reports.points · reports.promotions · reports.sources · reports.cohort (GET /reports/{tab}) · reports.export GET /reports/{tab}/csv (text/csv) — member.report.view   [M3.10-S3.7]
//     settings.get GET /settings · settings.set PUT /settings (member.settings.manage · {review?, referral?, notifications?, giftCard?, reports?} partial) · apikeys.list GET /api-keys · apikeys.create POST /api-keys ({name, bundle, ttlDays?} → secret ครั้งเดียว) · apikeys.revoke DELETE /api-keys/{id} — member.api.manage (danger revoke)   [M3.10-S3.8]
//     webhooks.list GET /webhooks · webhooks.create POST /webhooks ({url https, events[] ⊆ memberWebhookEvents} → {id, secret ครั้งเดียว}) · webhooks.update PATCH /webhooks/{id} ({events?, active?}) · webhooks.delete DELETE /webhooks/{id} (danger) · webhooks.deliveries GET /webhooks/{id}/deliveries · webhooks.test POST /webhooks/{id}/test — member.api.manage · ใช้ src/lib/webhooks/service (createEndpoint/setEndpointEvents/…/testEndpoint/listDeliveries) ผ่าน facade   [M3.10-S3.9]
//     join (public lane · ไม่ต้องคีย์ · rate limit ต่อ IP · tenantSlug ใน path): join.start POST /join/{tenantSlug}/start ({phone?|email?, src?, referralCode?} → {otpId, expiresAt, maskedTo, devOtp? (QC_OTP_PREVIEW)} · ไม่เผยว่ามีสมาชิก) · join.verify POST /join/{tenantSlug}/verify ({otpId, code} → {joinToken (jt_ · 15 นาที) · existing: boolean (เบอร์นี้เป็นสมาชิกแล้ว → คืน session token แทน)}) · join.form GET /join/{tenantSlug}/form (→ {fields[customerEditable+required/optional ตาม layout], consents[channels], policyVersion, welcomePoints, referralEnabled}) · join.complete POST /join/{tenantSlug}/complete ({joinToken, fields{}, consents[{channel, granted}], referralCode?, policyVersion, src?, lineUserId?} → {customerId, memberCode, token (session cs_), welcomePoints}) — service src/lib/modules/member/join.ts (startJoin/verifyJoin/joinForm/completeJoin · ใช้ customer-session.ts ของ M2.9 + profile.createMember source LIFF + sources.resolveSource(src) + referrals.attach)   [M3.10-S3.10]
//     me เพิ่ม: me.reviews.submit POST /me/reviews ({token, rating, body?, photoFileIds?}) · me.referral GET /me/referral · me.history GET /me/history · me.pushDevices.register POST /me/push-devices ({expoToken, platform}) · me.pushDevices.remove DELETE /me/push-devices/{id} — CUSTOMER session   [M3.10-S3.11]
//   tools: memberToolOps() ≥ 38 · ชื่อต้องมี member_search member_summary member_recommend_offer campaign_draft_message segment_count review_summary report_overview journey_stats referral_leaderboard notification_test_send · manifest GET /api/v1/ai/skills/members → tools[] รูป OpenAI function (name/description/parameters JSON Schema · write boolean) จำนวน = memberToolOps().length · F13.9 ผ่าน
//   docs: gen-member-api-docs --check exit 0 · MEMBER-API.md มี §Operations ครอบ op ทุกตัว (ค้น id) · SKILL.md/endpoints.md อัปเดต (มี join/webhooks) · buildOpenApi paths ครอบทุก op · หน้า /developers/member ขึ้น
//   UI: settings/api (ภาพ 27 ขวา) เพิ่มส่วน webhooks จริง: member-api-webhooks (ตาราง endpoint url/events/สถานะ/ส่งล่าสุด) · member-api-webhook-new (ฟอร์ม url + events checkbox) · member-api-webhook-secret (แสดงครั้งเดียว) · member-api-deliveries · member-api-tools (นับ tool + ลิงก์ manifest) · หน้า /member/assistant (ภาพ 27 ซ้าย): member-assistant · member-assistant-messages · member-assistant-input · member-assistant-send · member-assistant-result-table (ตารางผลค้นหา) · member-assistant-proposal (กล่อง "ข้อเสนอ (ยังไม่ทำ)" summary ไทย + ต้นทุน) · member-assistant-confirm · member-assistant-edit · member-assistant-cancel · member-assistant-tools (บรรทัดเครื่องมือที่ใช้) — ใช้ ai/service sendMessage (skill members · source MEMBER_ASSIST) + ai/proposals (confirm ด้วยสิทธิ์ของคนกด) · SHARK_AI_MOCK=1 ใช้ได้
//   testid: member-api-page member-api-keys member-api-webhooks member-api-webhook-new member-api-webhook-secret member-api-deliveries member-api-tools · member-assistant member-assistant-messages member-assistant-input member-assistant-send member-assistant-result-table member-assistant-proposal member-assistant-confirm member-assistant-edit member-assistant-cancel member-assistant-tools
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
process.env.QC_OTP_PREVIEW = "1"; process.env.SHARK_AI_MOCK = "1";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
if (!existsSync("src/lib/modules/member/api/ops/webhooks.ts") || !existsSync("src/lib/modules/member/api/ops/join.ts") || !existsSync("src/lib/modules/member/join.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/api/ops/webhooks.ts · ops/join.ts · member/join.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = "";
const keyIds: string[] = []; const made = { endpoints: [] as string[], segments: [] as string[], customers: [] as string[], convs: [] as string[] };
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const reg = (await import("@/lib/modules/member/api/registry" as string)) as Any;
  const dispatch = (await import("@/lib/modules/member/api/dispatch" as string)) as Any;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const OPS: Any[] = reg.MEMBER_OPS;
  const opById = new Map(OPS.map((o) => [o.id, o]));
  const mkKey = async (bundle: string) => { const k = await ak.createApiKey({ tenantId: tid }, `QC M3.10 ${bundle}`, { scopes: scopes.expandBundles([bundle]), systemId: SYS }); keyIds.push(k.id); return k.rawKey as string; };
  const kAdmin = await mkKey("member-admin"); const kRead = await mkKey("member-read");
  const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
  const http = async (method: string, path: string, key: string | null, body?: unknown, extra: Record<string, string> = {}) => { const r = await fetch(`${BASE}/api/v1${path}`, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", ...(method === "GET" ? {} : { "idempotency-key": `m310-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }), ...extra }, body: body ? JSON.stringify(body) : undefined }).catch(() => null); return r ? { status: r.status, body: await r.json().catch(async () => null), headers: r.headers } : { status: 0, body: null, headers: new Headers() }; };
  const up = (await http("GET", "/member/ping", kRead)).status;

  // ═══ S1 ทะเบียน op ═══
  const NEED = ["segments.list", "segments.get", "segments.create", "segments.update", "segments.delete", "segments.count", "segments.members", "campaigns.list", "campaigns.get", "campaigns.create", "campaigns.update", "campaigns.preview", "campaigns.testSend", "campaigns.send", "campaigns.cancel", "campaigns.stats", "journeys.list", "journeys.get", "journeys.create", "journeys.update", "journeys.toggle", "journeys.stats", "journeys.presets", "journeys.runs", "reviews.list", "reviews.get", "reviews.request", "reviews.reply", "reviews.hide", "reviews.escalate", "reviews.summary", "reviews.stats", "reviews.settings.get", "reviews.settings.set", "referrals.program.get", "referrals.program.set", "referrals.list", "referrals.leaderboard", "referrals.stats", "referrals.reject", "notifications.templates.list", "notifications.templates.set", "notifications.settings.set", "notifications.stats", "notifications.testSend", "reports.overview", "reports.rfm", "reports.tiers", "reports.points", "reports.promotions", "reports.sources", "reports.cohort", "reports.export", "settings.get", "settings.set", "apikeys.list", "apikeys.create", "apikeys.revoke", "webhooks.list", "webhooks.create", "webhooks.update", "webhooks.delete", "webhooks.deliveries", "webhooks.test", "join.start", "join.verify", "join.form", "join.complete", "me.reviews.submit", "me.referral", "me.history", "me.pushDevices.register", "me.pushDevices.remove"];
  const missing = NEED.filter((id) => !opById.has(id));
  const newOps = OPS.filter((o) => NEED.includes(o.id));
  const badTest = newOps.filter((o) => !/^M3\.10-S3\.\d+$/.test(o.test ?? ""));
  const badKind = newOps.filter((o) => !["read", "write", "danger"].includes(o.kind) || (o.method !== "GET" && o.kind === "read" && !/count|preview|quote/.test(o.id)));
  chk("M3.10-S1.1", `MEMBER_OPS มี op ชุดสามครบ ${NEED.length} ตัว · รวมทั้งทะเบียน ≥ 190 · ทุก op ใหม่ test id รูป M3.10-S3.x · kind ถูก (GET = read · POST/PATCH/PUT/DELETE = write/danger ยกเว้น count/preview) · id ไม่ซ้ำ · danger: segments.delete/webhooks.delete/apikeys.revoke`, missing.length === 0 && OPS.length >= 190 && badTest.length === 0 && badKind.length === 0 && new Set(OPS.map((o) => o.id)).size === OPS.length && ["segments.delete", "webhooks.delete", "apikeys.revoke"].every((id) => opById.get(id)?.kind === "danger"), "ครบ", `missing=${missing.join(",") || "-"} total=${OPS.length} badTest=${badTest.map((o) => o.id).join(",") || "-"} badKind=${badKind.map((o) => o.id).join(",") || "-"}`);
  const pub = NEED.filter((id) => id.startsWith("join.")).map((id) => opById.get(id));
  const meOps = NEED.filter((id) => id.startsWith("me.")).map((id) => opById.get(id));
  chk("M3.10-S1.2", "join.* เป็น public lane (auth: 'public' หรือ scope null · path ขึ้นต้น /join/{tenantSlug}) · me.* ต้อง auth customer (scope 'customer' หรือ auth 'customer') · reports.* scope member.report.view · webhooks/apikeys scope member.api.manage · notifications.templates.set scope member.settings.manage", pub.every((o) => o && (o.auth === "public" || o.scope === null || o.public === true) && /^\/join\/\{tenantSlug\}/.test(o.path)) && meOps.every((o) => o && (o.auth === "customer" || o.scope === "customer" || o.customer === true)) && ["reports.overview", "reports.cohort", "reports.export"].every((id) => opById.get(id)?.scope === "member.report.view") && ["webhooks.create", "apikeys.create", "webhooks.deliveries"].every((id) => opById.get(id)?.scope === "member.api.manage") && opById.get("notifications.templates.set")?.scope === "member.settings.manage", "lane ถูก", `join=${JSON.stringify(pub.map((o) => [o?.id, o?.auth ?? o?.scope, o?.path]))} me=${JSON.stringify(meOps.map((o) => [o?.id, o?.auth ?? o?.scope]))}`);

  // ═══ S2 tools · manifest · docs ═══
  const toolOps: Any[] = reg.memberToolOps();
  const toolNames = new Set(toolOps.map((o) => o.tool));
  const TN = ["member_search", "member_summary", "member_recommend_offer", "campaign_draft_message", "segment_count", "review_summary", "report_overview", "journey_stats", "referral_leaderboard", "notification_test_send"];
  const man = await http("GET", "/ai/skills/members", kAdmin);
  const manTools: Any[] = man.body?.tools ?? [];
  chk("M3.10-S2.1", `tools: memberToolOps ≥ 38 · ชื่อ 10 ตัวหลักครบ (${TN.join(" ")}) · manifest GET /api/v1/ai/skills/members → 200 {id 'members', tools[] รูป OpenAI {type 'function', function{name, description, parameters}, write}} จำนวน = memberToolOps · write ของ member_search false · ของ campaign/segment write op = true`, up === 200 && toolOps.length >= 38 && TN.every((n) => toolNames.has(n)) && man.status === 200 && man.body?.id === "members" && manTools.length === toolOps.length && manTools.every((t) => t.type === "function" && t.function?.name && t.function?.parameters && typeof t.write === "boolean") && manTools.find((t) => t.function.name === "member_search")?.write === false, "manifest ครบ", `up=${up} tools=${toolOps.length} missing=${TN.filter((n) => !toolNames.has(n)).join(",") || "-"} man=${man.status}/${manTools.length}`);
  const tRead = await http("POST", "/ai/tools/member_search", kAdmin, { args: { q: m(1).firstName ?? m(1).memberCode } });
  const tWrite = await http("POST", "/ai/tools/member_set_tags", kAdmin, { args: { customerId: m(2).id, add: ["qc310"] } });
  const tags2 = (await prisma.customer.findUnique({ where: { id: m(2).id }, select: { tags: true } }))?.tags as Any;
  if (tWrite.body?.conversationId) made.convs.push(tWrite.body.conversationId);
  chk("M3.10-S2.2", "POST /api/v1/ai/tools/member_search → 200 {tool, skill 'members', write false, result เป็น JSON string มี items} · member_set_tags → 200 {write true, pendingConfirmation true, conversationId, result มี proposalId + summary ไทย} · แท็กยังไม่ถูกเขียน (proposal เท่านั้น)", tRead.status === 200 && tRead.body?.skill === "members" && tRead.body?.write === false && typeof tRead.body?.result === "string" && /items/.test(tRead.body.result) && tWrite.status === 200 && tWrite.body?.write === true && tWrite.body?.pendingConfirmation === true && !!tWrite.body?.conversationId && /proposalId/.test(tWrite.body?.result ?? "") && /[ก-๙]/.test(tWrite.body?.result ?? "") && !(Array.isArray(tags2) ? tags2 : []).includes("qc310"), "proposal flow", `read=${tRead.status}/${tRead.body?.write} write=${tWrite.status}/${JSON.stringify(tWrite.body).slice(0, 160)} tags=${JSON.stringify(tags2)}`);
  const gen = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-member-api-docs.mts", "--check"], { encoding: "utf8", timeout: 180_000 });
  const doc = read("docs/api/MEMBER-API.md"); const endpoints = read(".claude/skills/shark-member-api/references/endpoints.md"); const skill = read(".claude/skills/shark-member-api/SKILL.md");
  const docMissing = NEED.filter((id) => !doc.includes(`\`${id}\``) && !doc.includes(id));
  const oa = (await import("@/lib/modules/member/api/openapi" as string)) as Any;
  const spec = oa.buildOpenApi({ baseUrl: "https://shark.in.th" });
  const pathCount = Object.values(spec?.paths ?? {}).reduce((s: number, p: Any) => s + Object.keys(p).length, 0);
  chk("M3.10-S2.3", "gen-member-api-docs --check exit 0 · MEMBER-API.md มี op ชุดสามทุกตัว · endpoints.md มี /join และ /webhooks · SKILL.md ไม่บอกว่า points/segments 'ยังไม่อยู่ในรุ่นนี้' · OpenAPI operations = MEMBER_OPS.length (join ไม่ต้อง security · me ใช้ customerToken)", gen.status === 0 && docMissing.length === 0 && /\/join\//.test(endpoints) && /\/webhooks/.test(endpoints) && !/not in this release/i.test(skill) && pathCount === OPS.length && Object.entries(spec.paths).some(([p, v]: Any) => p.startsWith("/join/") && Object.values(v).some((op: Any) => Array.isArray(op.security) && op.security.length === 0)), "docs ครบ", `gen=${gen.status} ${(gen.stdout + gen.stderr).slice(-200).replace(/\n/g, " ")} docMissing=${docMissing.slice(0, 6).join(",") || "-"} paths=${pathCount}/${OPS.length}`);

  // ═══ S3 op ทำงานจริงผ่าน HTTP (QC server) — test id ที่ op อ้าง ═══
  const seg = await http("POST", "/member/segments", kAdmin, { name: `QC310 ${Date.now()}`, definition: [{ field: "tier", op: "in", value: ["GOLD", "PLATINUM"] }] });
  if (seg.body?.id) made.segments.push(seg.body.id);
  const segCount = await http("POST", "/member/segments/count", kRead, { definition: [{ field: "tier", op: "in", value: ["GOLD", "PLATINUM"] }] });
  const segList = await http("GET", "/member/segments", kRead);
  const segDel = await http("DELETE", `/member/segments/${seg.body?.id}`, kAdmin, { confirm: true, reason: "qc" });
  chk("M3.10-S3.1", "segments: POST /segments 201 {id, name} · POST /segments/count (read key) 200 {count 15 (GOLD 10 + PLATINUM 5), sample ≤ 5, avgSpend12mSatang} · GET /segments มี id · DELETE (danger confirm) 200 · หลังลบ GET /segments/{id} 404", seg.status === 201 && !!seg.body?.id && segCount.status === 200 && segCount.body?.count === 15 && (segCount.body?.sample?.length ?? 9) <= 5 && segList.status === 200 && (segList.body?.items ?? segList.body ?? []).some((s: Any) => s.id === seg.body.id) && segDel.status === 200 && (await http("GET", `/member/segments/${seg.body?.id}`, kRead)).status === 404, "segments ok", `create=${seg.status} count=${segCount.status}/${segCount.body?.count} list=${segList.status} del=${segDel.status}`);
  const camp = await http("POST", "/member/campaigns", kAdmin, { name: `QC310 camp`, segmentId: null, channels: ["LINE"], content: { line: "สวัสดี {ชื่อ}" }, holdoutPct: 0 });
  const campPrev = camp.body?.id ? await http("POST", `/member/campaigns/${camp.body.id}/preview`, kRead) : { status: 0, body: null };
  const campStats = camp.body?.id ? await http("GET", `/member/campaigns/${camp.body.id}/stats`, kRead) : { status: 0, body: null };
  const campCancel = camp.body?.id ? await http("POST", `/member/campaigns/${camp.body.id}/cancel`, kAdmin, {}) : { status: 0, body: null };
  chk("M3.10-S3.2", "campaigns: POST 201 · preview 200 {willSend, holdout, maxCostSatang} · stats 200 {variants[]} · cancel 200 · read key POST /campaigns → 403", camp.status === 201 && campPrev.status === 200 && "willSend" in (campPrev.body ?? {}) && campStats.status === 200 && Array.isArray(campStats.body?.variants) && campCancel.status === 200 && (await http("POST", "/member/campaigns", kRead, { name: "x", channels: ["LINE"], content: { line: "x" } })).status === 403, "campaigns ok", `create=${camp.status} prev=${campPrev.status} stats=${campStats.status} cancel=${campCancel.status}`);
  const presets = await http("GET", "/member/journeys/presets", kRead);
  const jr = await http("POST", "/member/journeys", kAdmin, { presetKey: presets.body?.[0]?.key ?? presets.body?.items?.[0]?.key ?? "birthday", name: "QC310 journey", enabled: false });
  const jToggle = jr.body?.id ? await http("POST", `/member/journeys/${jr.body.id}/toggle`, kAdmin, { enabled: false }) : { status: 0, body: null };
  const jStats = jr.body?.id ? await http("GET", `/member/journeys/${jr.body.id}/stats`, kRead) : { status: 0, body: null };
  const jRuns = jr.body?.id ? await http("GET", `/member/journeys/${jr.body.id}/runs`, kRead) : { status: 0, body: null };
  if (jr.body?.id) await P.automationRule.deleteMany({ where: { id: jr.body.id } }).catch(() => null);
  chk("M3.10-S3.3", "journeys: GET /journeys/presets 200 (6) · POST จาก presetKey 201 · toggle 200 · stats 200 {entered, perStep[]} · runs 200 {items[]}", presets.status === 200 && ((presets.body?.length ?? presets.body?.items?.length) >= 6) && jr.status === 201 && jToggle.status === 200 && jStats.status === 200 && Array.isArray(jStats.body?.perStep) && jRuns.status === 200, "journeys ok", `presets=${presets.status}/${presets.body?.length ?? presets.body?.items?.length} create=${jr.status} toggle=${jToggle.status} stats=${jStats.status} runs=${jRuns.status}`);
  const rvSet = await http("PUT", "/member/reviews/settings", kAdmin, { rewardPoints: 50 });
  const rvGet = await http("GET", "/member/reviews/settings", kRead);
  const rvList = await http("GET", "/member/reviews?take=5", kRead);
  const rvStats = await http("GET", "/member/reviews/stats", kRead);
  const rvSum = await http("GET", "/member/reviews/summary", kRead);
  chk("M3.10-S3.4", "reviews: PUT /reviews/settings 200 · GET 200 {rewardPoints 50} · GET /reviews 200 {items} · GET /reviews/stats 200 {avg, count} · GET /reviews/summary 200 {strengths} (SHARK_AI_MOCK)", rvSet.status === 200 && rvGet.status === 200 && rvGet.body?.rewardPoints === 50 && rvList.status === 200 && Array.isArray(rvList.body?.items) && rvStats.status === 200 && "avg" in (rvStats.body ?? {}) && rvSum.status === 200 && typeof rvSum.body?.strengths === "string", "reviews ok", `set=${rvSet.status} get=${rvGet.status}/${rvGet.body?.rewardPoints} list=${rvList.status} stats=${rvStats.status} sum=${rvSum.status}`);
  const rfGet = await http("GET", "/member/referrals/program", kRead);
  const rfSet = await http("PUT", "/member/referrals/program", kAdmin, { enabled: true, monthlyCap: 10 });
  const rfLb = await http("GET", "/member/referrals/leaderboard?days=90", kRead);
  const rfSt = await http("GET", "/member/referrals/stats", kRead);
  chk("M3.10-S3.5", "referrals: GET /referrals/program 200 · PUT 200 {enabled true} · GET /referrals/leaderboard 200 [] · GET /referrals/stats 200 {referredMembers}", rfGet.status === 200 && rfSet.status === 200 && rfSet.body?.enabled === true && rfLb.status === 200 && Array.isArray(rfLb.body?.items ?? rfLb.body) && rfSt.status === 200 && "referredMembers" in (rfSt.body ?? {}), "referrals ok", `get=${rfGet.status} set=${rfSet.status} lb=${rfLb.status} st=${rfSt.status}`);
  const ntList = await http("GET", "/member/notifications/templates", kRead);
  const ntSet = await http("PUT", "/member/notifications/templates/WELCOME", kAdmin, { enabled: true, channels: { LINE: { enabled: true, body: "ยินดีต้อนรับ {ชื่อ} สู่ {ร้าน}" } } });
  const ntBad = await http("PUT", "/member/notifications/templates/WELCOME", kAdmin, { channels: { LINE: { enabled: true, body: "{แต้มที่จะหมด}" } } });
  const ntStats = await http("GET", "/member/notifications/stats", kRead);
  chk("M3.10-S3.6", "notifications: GET /notifications/templates 200 (8 แถว) · PUT /templates/WELCOME 200 · ตัวแปรผิด → 400 {error.code 'VALIDATION' และ message ไทย} · GET /notifications/stats 200 {sent}", ntList.status === 200 && (ntList.body?.items?.length ?? Object.keys(ntList.body?.templates ?? {}).length) === 8 && ntSet.status === 200 && ntBad.status === 400 && /[ก-๙]/.test(JSON.stringify(ntBad.body ?? {})) && ntStats.status === 200 && "sent" in (ntStats.body ?? {}), "notifications ok", `list=${ntList.status} set=${ntSet.status} bad=${ntBad.status} stats=${ntStats.status}`);
  const rpO = await http("GET", "/member/reports/overview", kRead);
  const rpR = await http("GET", "/member/reports/rfm", kRead);
  const rpCsv = await fetch(`${BASE}/api/v1/member/reports/rfm/csv`, { headers: { authorization: `Bearer ${kRead}` } }).catch(() => null);
  const csvText = rpCsv ? await rpCsv.text() : "";
  const rpNo = await http("GET", "/member/reports/overview", (await mkKey("member-operate")));
  chk("M3.10-S3.7", "reports: GET /reports/overview 200 {members.total 60} · /reports/rfm 200 {segments 9} · /reports/rfm/csv 200 text/csv มี BOM · คีย์ operate (ไม่มี report.view) → 403", rpO.status === 200 && rpO.body?.members?.total === 60 && rpR.status === 200 && rpR.body?.segments?.length === 9 && rpCsv?.status === 200 && /text\/csv/.test(rpCsv.headers.get("content-type") ?? "") && csvText.startsWith("﻿") && rpNo.status === 403, "reports ok", `o=${rpO.status}/${rpO.body?.members?.total} rfm=${rpR.status}/${rpR.body?.segments?.length} csv=${rpCsv?.status}/${rpCsv?.headers.get("content-type")} noperm=${rpNo.status}`);
  const stGet = await http("GET", "/member/settings", kAdmin);
  const stSet = await http("PUT", "/member/settings", kAdmin, { review: { askAfterHours: 3 } });
  const akList = await http("GET", "/member/api-keys", kAdmin);
  const akNew = await http("POST", "/member/api-keys", kAdmin, { name: "QC310 via REST", bundle: "member-read", ttlDays: 30 });
  if (akNew.body?.id) keyIds.push(akNew.body.id);
  const akRevoke = akNew.body?.id ? await http("DELETE", `/member/api-keys/${akNew.body.id}`, kAdmin, { confirm: true, reason: "qc" }) : { status: 0, body: null };
  const akUse = await http("GET", "/member/ping", akNew.body?.secret ?? "x");
  chk("M3.10-S3.8", "settings: GET /settings 200 {review, referral, notifications, giftCard, reports} · PUT 200 (review.askAfterHours 3) · api-keys: GET 200 (≥ 3 คีย์ QC) · POST 201 {id, secret ครั้งเดียว (sk_/mk_), bundle} · DELETE (danger) 200 → คีย์ใช้ไม่ได้ (401)", stGet.status === 200 && ["review", "referral", "notifications"].every((k) => k in (stGet.body ?? {})) && stSet.status === 200 && (stSet.body?.review?.askAfterHours === 3 || (await http("GET", "/member/settings", kAdmin)).body?.review?.askAfterHours === 3) && akList.status === 200 && (akList.body?.items?.length ?? akList.body?.length ?? 0) >= 3 && akNew.status === 201 && typeof akNew.body?.secret === "string" && akRevoke.status === 200 && akUse.status === 401, "settings/keys ok", `st=${stGet.status}/${stSet.status} keys=${akList.status} new=${akNew.status} revoke=${akRevoke.status} use=${akUse.status}`);
  // webhooks CRUD + delivery HMAC + retry
  const hooksSvc = (await import("@/lib/webhooks/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const whBad = await http("POST", "/member/webhooks", kAdmin, { url: "http://insecure.example.com/x", events: ["member.created"] });
  const wh = await http("POST", "/member/webhooks", kAdmin, { url: "https://hooks.example.com/qc310", events: ["member.created", "member.updated"] });
  if (wh.body?.id) made.endpoints.push(wh.body.id);
  const whBadEv = await http("POST", "/member/webhooks", kAdmin, { url: "https://hooks.example.com/z", events: ["kanban.card.created"] });
  const whList = await http("GET", "/member/webhooks", kAdmin);
  const whUpd = wh.body?.id ? await http("PATCH", `/member/webhooks/${wh.body.id}`, kAdmin, { events: ["member.created"] }) : { status: 0, body: null };
  const whRow = wh.body?.id ? await P.webhookEndpoint.findUnique({ where: { id: wh.body.id } }) : null;
  chk("M3.10-S3.9", "webhooks: url http → 400 · POST https 201 {id, secret ครั้งเดียว} · events นอก memberWebhookEvents → 400 · GET /webhooks 200 มี id (ไม่คืน secret) · PATCH events → 200 · แถว WebhookEndpoint eventsJson = ['member.created'] active true", whBad.status === 400 && wh.status === 201 && typeof wh.body?.secret === "string" && wh.body.secret.length >= 16 && whBadEv.status === 400 && whList.status === 200 && (whList.body?.items ?? whList.body ?? []).some((e: Any) => e.id === wh.body.id && !e.secret) && whUpd.status === 200 && JSON.stringify(whRow?.eventsJson) === JSON.stringify(["member.created"]) && whRow?.active === true, "CRUD ok", `bad=${whBad.status} create=${wh.status} badEv=${whBadEv.status} list=${whList.status} upd=${whUpd.status} row=${JSON.stringify(whRow?.eventsJson)}`);
  const calls: Any[] = [];
  const fetchOk = async (url: string, init: Any) => { calls.push({ url, init }); return new Response("ok", { status: 200 }); };
  const fetchFail = async (url: string, init: Any) => { calls.push({ url, init }); return new Response("boom", { status: 500 }); };
  const evt = { tenantId: tid, type: "member.created", payload: { customerId: m(3).id, source: "STAFF" }, id: `qc310-${Date.now()}` };
  const n1 = await hooksSvc.dispatchWebhooks(evt as Any, { fetch: fetchOk } as Any);
  const c1 = calls.find((c) => /qc310/.test(c.url));
  const sigHdr = c1?.init?.headers?.["X-Shark-Signature"] ?? c1?.init?.headers?.["x-shark-signature"] ?? (c1?.init?.headers instanceof Headers ? c1.init.headers.get("x-shark-signature") : null);
  const expSig = c1 ? createHmac("sha256", whRow!.secret).update(String(c1.init.body)).digest("hex") : null;
  const del1 = await http("GET", `/member/webhooks/${wh.body?.id}/deliveries`, kAdmin);
  calls.length = 0;
  const evt2 = { ...evt, id: `qc310b-${Date.now()}` };
  await hooksSvc.dispatchWebhooks(evt2 as Any, { fetch: fetchFail } as Any);
  const failed = await P.webhookDelivery.findFirst({ where: { endpointId: wh.body?.id, status: "FAILED" }, orderBy: { createdAt: "desc" } });
  const retried = await hooksSvc.retryFailedWebhooks({ fetch: fetchOk } as Any);
  const afterRetry = failed ? await P.webhookDelivery.findUnique({ where: { id: failed.id } }) : null;
  const tst = await http("POST", `/member/webhooks/${wh.body?.id}/test`, kAdmin, {});
  chk("M3.10-S3.10", "delivery: dispatch member.created → ยิง 1 ครั้งไป url ที่ตั้ง · X-Shark-Signature = hex hmac-sha256(secret, body) · GET /webhooks/{id}/deliveries 200 มีแถว OK · ปลายทาง 500 → FAILED attempts 1 · retryFailedWebhooks → OK attempts 2 · POST /webhooks/{id}/test 200 {deliveryId|ok}", n1 >= 1 && !!c1 && !!sigHdr && sigHdr === expSig && del1.status === 200 && (del1.body?.items ?? del1.body ?? []).some((d: Any) => d.status === "OK") && !!failed && failed.attempts === 1 && retried >= 1 && afterRetry?.status === "OK" && afterRetry?.attempts === 2 && tst.status === 200, "HMAC + retry", `n1=${n1} sig=${sigHdr === expSig} del=${del1.status} failed=${!!failed}/${failed?.attempts} retried=${retried} after=${afterRetry?.status}/${afterRetry?.attempts} test=${tst.status}`);
  // join public lane
  const slug = mq.MQC.tenantSlug;
  const jPhone = `0844${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const jForm = await http("GET", `/member/join/${slug}/form`, null);
  const jStart = await http("POST", `/member/join/${slug}/start`, null, { phone: jPhone, src: "qc310" }, { "idempotency-key": "" });
  const jVerifyBad = await http("POST", `/member/join/${slug}/verify`, null, { otpId: jStart.body?.otpId, code: "000000" }, { "idempotency-key": "" });
  const jVerify = await http("POST", `/member/join/${slug}/verify`, null, { otpId: jStart.body?.otpId, code: jStart.body?.devOtp }, { "idempotency-key": "" });
  const jComplete = await http("POST", `/member/join/${slug}/complete`, null, { joinToken: jVerify.body?.joinToken, fields: { firstName: "สมัครผ่าน", lastName: "REST" }, consents: [{ channel: "LINE", granted: true }], policyVersion: jForm.body?.policyVersion ?? 1, src: "qc310" }, { "idempotency-key": "" });
  if (jComplete.body?.customerId) made.customers.push(jComplete.body.customerId);
  const jCust = jComplete.body?.customerId ? await prisma.customer.findUnique({ where: { id: jComplete.body.customerId } }) : null;
  const meAfter = await http("GET", "/member/me", jComplete.body?.token ?? "x");
  chk("M3.10-S3.11", "join (ไม่ต้องคีย์): GET /join/{slug}/form 200 {fields[], consents[], policyVersion, welcomePoints} · POST start 200 {otpId, devOtp (QC)} · verify ผิด → 400/401 · verify ถูก → 200 {joinToken jt_, existing false} · complete → 201 {customerId, memberCode, token cs_} · Customer source LIFF · ยินยอม LINE · Bearer token → GET /me 200", jForm.status === 200 && Array.isArray(jForm.body?.fields) && Array.isArray(jForm.body?.consents) && jStart.status === 200 && /^\d{6}$/.test(jStart.body?.devOtp ?? "") && [400, 401].includes(jVerifyBad.status) && jVerify.status === 200 && /^jt_/.test(jVerify.body?.joinToken ?? "") && jVerify.body?.existing === false && jComplete.status === 201 && /^cs_/.test(jComplete.body?.token ?? "") && jCust?.source === "LIFF" && meAfter.status === 200 && meAfter.body?.member?.customerId === jComplete.body?.customerId, "join ครบ", `form=${jForm.status} start=${jStart.status} bad=${jVerifyBad.status} verify=${jVerify.status}/${jVerify.body?.existing} complete=${jComplete.status} src=${jCust?.source} me=${meAfter.status}`);
  const jStart2 = await http("POST", `/member/join/${slug}/start`, null, { phone: jPhone }, { "idempotency-key": "" });
  const jVerify2 = await http("POST", `/member/join/${slug}/verify`, null, { otpId: jStart2.body?.otpId, code: jStart2.body?.devOtp }, { "idempotency-key": "" });
  const meRef = await http("GET", "/member/me/referral", jComplete.body?.token ?? "x");
  const meHist = await http("GET", "/member/me/history", jComplete.body?.token ?? "x");
  const mePush = await http("POST", "/member/me/push-devices", jComplete.body?.token ?? "x", { expoToken: `ExponentPushToken[qc310-${Date.now()}]`, platform: "ios" });
  const mePushRm = mePush.body?.id ? await http("DELETE", `/member/me/push-devices/${mePush.body.id}`, jComplete.body?.token ?? "x", {}) : { status: 0, body: null };
  chk("M3.10-S3.12", "สมัครซ้ำเบอร์เดิม: verify → 200 {existing true, token cs_} (ไม่สร้างซ้ำ · จำนวน Customer เบอร์นี้ = 1) · me.referral 200 {code} · me.history 200 {items} · me.pushDevices.register 201 {id} → MemberPushDevice · remove 200", jVerify2.status === 200 && jVerify2.body?.existing === true && /^cs_/.test(jVerify2.body?.token ?? "") && (await prisma.customer.count({ where: { tenantId: tid, phone: jPhone } })) === 1 && meRef.status === 200 && !!meRef.body?.code && meHist.status === 200 && Array.isArray(meHist.body?.items) && mePush.status === 201 && !!mePush.body?.id && mePushRm.status === 200, "me ok", `v2=${jVerify2.status}/${jVerify2.body?.existing} n=${await prisma.customer.count({ where: { tenantId: tid, phone: jPhone } })} ref=${meRef.status} hist=${meHist.status} push=${mePush.status}/${mePushRm.status}`);

  // ═══ S4 fitness · UI · ภาพ ═══
  const fit = spawnSync("pnpm", ["exec", "tsx", "scripts/fitness.mts"], { encoding: "utf8", timeout: 300_000 });
  const fitJson = (() => { try { return JSON.parse((fit.stdout.match(/JSON_SUMMARY (.*)/) ?? [])[1] ?? "{}"); } catch { return {}; } })();
  chk("M3.10-S4.1", "fitness ผ่านทั้งชุด (F13.7 ทุก op มี test id ในข้อสอบ · F13.8 docs ไม่ stale · F13.9 tool อยู่ในสกิล) · ops ใหม่ไม่ import prisma ตรง", fitJson.passed === fitJson.total && fitJson.total >= 26 && readdirSync("src/lib/modules/member/api/ops").every((f) => !/@\/lib\/core\/db"|from "\.\.\/\.\.\/db"/.test(read(`src/lib/modules/member/api/ops/${f}`))), "fitness เขียว", `fit=${fitJson.passed}/${fitJson.total} findings=${JSON.stringify(fitJson.findings ?? []).slice(0, 160)}`);
  const apiUi = read("src/components/member/MemberApiSettings.tsx") + read("src/app/app/sys/[id]/member/settings/api/page.tsx");
  const asst = read("src/app/app/sys/[id]/member/assistant/page.tsx") + (existsSync("src/components/member/MemberAssistant.tsx") ? read("src/components/member/MemberAssistant.tsx") : "");
  const T1 = ["member-api-webhooks", "member-api-webhook-new", "member-api-webhook-secret", "member-api-deliveries", "member-api-tools"]; const T2 = ["member-assistant", "member-assistant-messages", "member-assistant-input", "member-assistant-send", "member-assistant-result-table", "member-assistant-proposal", "member-assistant-confirm", "member-assistant-edit", "member-assistant-cancel", "member-assistant-tools"];
  const miss1 = T1.filter((t) => !apiUi.includes(t)); const miss2 = T2.filter((t) => !asst.includes(t));
  const LB = ["ข้อเสนอ", "ยังไม่ทำ", "ยืนยัน", "แก้ไข", "ยกเลิก", "เครื่องมือที่ใช้"];
  chk("M3.10-S4.2", "UI: settings/api มี webhooks จริง (testid 5) · หน้า /member/assistant มีจริง requireTenant (testid 10 · ป้าย 'ข้อเสนอ (ยังไม่ทำ)' ยืนยัน/แก้ไข/ยกเลิก เครื่องมือที่ใช้) · ใช้ ai/service + ai/proposals (source MEMBER_ASSIST) · nav มี assistant · ไม่มีอีโมจิ/hex", miss1.length === 0 && asst.length > 0 && /requireTenant/.test(asst) && miss2.length === 0 && LB.every((l) => asst.includes(l)) && /MEMBER_ASSIST/.test(asst + read("src/lib/modules/member/assistant-actions.ts")) && /assistant/.test(read("src/lib/modules/member/nav.ts")) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test((apiUi + asst).replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test((apiUi + asst).replace(/\/\/.*$/gm, "")), "ครบ", `api-missing=${miss1.join(",") || "-"} asst-missing=${miss2.join(",") || "-"} labels=${LB.filter((l) => !asst.includes(l)).join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.10`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.10-S4.3", "ภาพ 27 ขวา: api-webhooks-owner desktop 200 (คีย์ + webhooks + tools) · ภาพ 27 ซ้าย: assistant-owner desktop+mobile 200 (TMP310: บทสนทนา + ตารางผล + กล่องข้อเสนอ ปุ่ม 3 + บรรทัดเครื่องมือ)", ok("owner", "api-webhooks-owner", "desktop") && ok("owner", "assistant-owner", "desktop") && ok("owner", "assistant-owner", "mobile"), "200 ×3", `${r("owner", "api-webhooks-owner", "desktop")?.status}/${r("owner", "assistant-owner", "desktop")?.status}/${r("owner", "assistant-owner", "mobile")?.status} missing=${JSON.stringify(r("owner", "assistant-owner", "desktop")?.missing)}`);
  chk("M3.10-S4.4", "🔴 parity ภาพ 27 (ซ้าย+ขวา) — Fable ตรวจด้วยตา · wo-notes/member-M3.10.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M3.10.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.10-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  if (made.endpoints.length) { await d(() => P.webhookDelivery.deleteMany({ where: { endpointId: { in: made.endpoints } } })); await d(() => P.webhookEndpoint.deleteMany({ where: { id: { in: made.endpoints } } })); }
  if (made.segments.length) await d(() => P.memberSegment.deleteMany({ where: { id: { in: made.segments } } }));
  await d(() => P.mktCampaign.deleteMany({ where: { tenantId: tid, name: { startsWith: "QC310" } } }));
  await d(() => P.aiProposal.deleteMany({ where: { tenantId: tid, conversationId: { in: made.convs } } }));
  await d(() => P.aiMessage.deleteMany({ where: { conversationId: { in: made.convs } } }));
  await d(() => P.aiConversation.deleteMany({ where: { id: { in: made.convs } } }));
  if (keyIds.length) await d(() => P.apiKey.deleteMany({ where: { id: { in: keyIds } } }));
  await d(() => P.apiKey.deleteMany({ where: { tenantId: tid, name: { startsWith: "QC310" } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberPushDevice", "customerSession", "memberNotification", "referral", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl]?.deleteMany?.({ where: { customerId: { in: made.customers } } }));
    await d(() => P.referral.deleteMany({ where: { refereeCustomerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, target: { startsWith: "0844" } } }));
  await d(() => prisma.appSystem.update({ where: { id: SYS }, data: {} }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.10: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
