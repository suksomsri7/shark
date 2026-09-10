// QC — ระบบสมาชิก v2 WO M1.11: REST/AI ชุดแรก — ทะเบียน `member` (op M1 ~55) · route /api/v1/member/* (แกน @/lib/api) · bundle 3 · OpenAPI · generator docs + skill · tools-member (proposal) · webhook events M1 · หน้า settings/api · developers
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.11 · `docs/api/MEMBER-API.md` §1 §2.1–2.5 (+ me.get/update/card) §6–8 · พิมพ์เขียว §6.3 (API readonly ไม่เห็นอ่อนไหว) §8 §9.7 · แบบ K1.15/K3.5 ของบอร์ดงาน · ภาพ 27 (ครึ่งขวา)
// requires: member-seed
//
// สัญญา (เลียน kanban/api ทุกอย่าง — อ่าน src/lib/modules/kanban/api/* · src/lib/api/* · src/lib/ai/tools-kanban.ts · scripts/gen-kanban-api-docs.mts):
//   src/lib/modules/member/api/{registry.ts (MEMBER_OPS · matchOp · allowedMethods · memberToolOps) · op.ts · actor.ts · dispatch.ts · openapi.ts (buildOpenApi) · serialize.ts · ops/*.ts}
//   route: src/app/api/v1/member/[...path]/route.ts + src/app/api/v1/member/openapi.json/route.ts · ping op `GET /ping`
//   bundle ใน api-keys/scopes.ts: `member-read` (คีย์ *.read ทั้งหมด · ไม่มี sensitive.read) · `member-operate` (read + customer.create/update/import · loyalty.stamp · promo.issue · point.adjust · review.reply) · `member-admin` (ทุกคีย์ member.*) — readonly/operate **ไม่เห็นข้อมูลอ่อนไหวเสมอ** · admin เห็น
//   op ต้องมี: members.{list,search,get,create,update,setStatus,setTags,setOwner,addresses.set,duplicates.list,duplicates.compare,merge,duplicates.dismiss,import.start,import.status,export,activity,brief,identities.list,identities.link,identities.unlink,resolve} · channels.list · fields.{layout,sections.create,sections.update,sections.reorder,sections.delete,create,update,reorder,archive,choices.replace,templates.apply} · consents.{get,set} · privacy.{policies.list,policies.create,policies.publish,sensitive.list,sensitive.set,hrPositions,accessLog,requests.list,export,erase} · sources.{links.list,links.create,links.update,links.toggle,report,touch} · tiers.{list,create,update,reorder,archive,benefits.set,rules.get,rules.set,rules.dryRun,evaluate,setManual,history,reviewNow} · me.{get,update,card} (ต้อง session ลูกค้า → 401 `customer_session_required` เมื่อเรียกด้วยคีย์ · M2.9 ต่อ)
//   danger (confirm:true + reason): members.merge · privacy.erase · tiers.setManual · ทุก write ต้อง Idempotency-Key · error codes ตาม @/lib/api/respond · 404-not-403 ข้ามร้าน/unit
//   generator scripts/gen-member-api-docs.mts (--check) → docs/api/MEMBER-API.md (ทับไฟล์ร่าง) + .claude/skills/shark-member-api/{SKILL.md,references/endpoints.md} (+copy /root/.claude/skills) · หน้า /developers/member + /developers/member.md · fitness F13.7/F13.8/F13.9 (test ครบ · docs ไม่ stale · tool มีบ้าน)
//   AI: src/lib/ai/tools-member.ts (generate จาก MEMBER_OPS.filter(o => o.tool) · read รันทันที · write = proposal) + src/lib/modules/member/api/tools.ts (runMemberTool · memberKindAccess · memberKindOf · dispatchMemberKind — แบบ kanban) · สกิล `members` ใน skills.ts มี tool member_* ≥ 20 (คงชื่อเดิม member_count member_create customer_search customer_points point_adjust reward_redeem reward_list_redemptions coupon_create) · proposals.ts รับ kind `member.${string}` · ยืนยันด้วย Membership ของคนกด (K3.5)
//   หน้า settings/api: src/app/app/sys/[id]/member/settings/api/page.tsx (ภาพ 27 ขวา: คีย์ 3 ชุดสิทธิ์ · ออก/ถอนคีย์ · curl ตัวอย่าง · ลิงก์ manifest/OpenAPI/developers · webhook) testid member-api-page member-api-keys member-api-new member-api-curl member-api-webhooks · gate member.api.manage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/api/registry.ts") || !existsSync("src/app/api/v1/member/[...path]/route.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/api/registry.ts · api/v1/member route)");
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
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = "";
const keyIds: string[] = []; const made = { customers: [] as string[], otherTenant: null as string | null };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const reg = (await import("@/lib/modules/member/api/registry" as string)) as { MEMBER_OPS: Any[]; memberToolOps: () => Any[] };
  const ops = reg.MEMBER_OPS;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/member/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  // ═══ S1 ทะเบียน + แกนกลาง + bundle ═══
  const ids = ops.map((o) => o.id); const mp = ops.map((o) => `${o.method} ${o.path}`);
  chk("M1.11-S1.1", "ทะเบียน MEMBER_OPS ≥ 55 op · id ไม่ซ้ำ · method+path ไม่ซ้ำ · ทุก op มี test (M<x>-S…) · kind ∈ read/write/danger · action ขึ้นต้น member. · registry ใช้แกนกลาง @/lib/api (matchOpIn/allowedMethodsIn) ไม่ก๊อป dispatch", ops.length >= 55 && new Set(ids).size === ids.length && new Set(mp).size === mp.length && ops.every((o) => /^M\d+(\.\d+)?-S/.test(o.test ?? "") && ["read", "write", "danger"].includes(o.kind) && /^member\./.test(o.action ?? "")) && /@\/lib\/api\/dispatch/.test(read("src/lib/modules/member/api/registry.ts")), "≥55 · สะอาด", `n=${ops.length} dupId=${ids.length - new Set(ids).size} noTest=${ops.filter((o) => !/^M\d+(\.\d+)?-S/.test(o.test ?? "")).map((o) => o.id).slice(0, 5).join(",")} badAction=${ops.filter((o) => !/^member\./.test(o.action ?? "")).map((o) => o.id).slice(0, 5).join(",")}`);
  const MUST = ["members.list", "members.search", "members.get", "members.create", "members.update", "members.setStatus", "members.setTags", "members.setOwner", "members.duplicates.list", "members.merge", "members.duplicates.dismiss", "members.import.start", "members.export", "members.activity", "members.brief", "members.identities.list", "members.identities.link", "members.identities.unlink", "members.resolve", "channels.list", "fields.layout", "fields.sections.create", "fields.create", "fields.update", "fields.archive", "fields.templates.apply", "consents.get", "consents.set", "privacy.policies.list", "privacy.policies.create", "privacy.sensitive.list", "privacy.sensitive.set", "privacy.hrPositions", "privacy.accessLog", "privacy.requests.list", "privacy.export", "privacy.erase", "sources.links.list", "sources.links.create", "sources.report", "sources.touch", "tiers.list", "tiers.create", "tiers.benefits.set", "tiers.rules.get", "tiers.rules.set", "tiers.rules.dryRun", "tiers.evaluate", "tiers.setManual", "tiers.history", "tiers.reviewNow", "me.get", "me.update", "me.card"];
  chk("M1.11-S1.2", `op หลักครบ ${MUST.length} ตัว (MEMBER-API §2.1–2.5 + me.*)`, MUST.every((x) => ids.includes(x)), "ครบ", MUST.filter((x) => !ids.includes(x)).join(",") || "ครบ");
  chk("M1.11-S1.3", "danger ops = members.merge · privacy.erase · tiers.setManual (kind danger) · write อื่นเป็น write · list/get/report เป็น read", ["members.merge", "privacy.erase", "tiers.setManual"].every((x) => ops.find((o) => o.id === x)?.kind === "danger") && ["members.list", "members.get", "sources.report", "tiers.evaluate"].every((x) => ops.find((o) => o.id === x)?.kind === "read") && ["members.create", "consents.set", "fields.create"].every((x) => ops.find((o) => o.id === x)?.kind === "write"), "3 danger", ["members.merge", "privacy.erase", "tiers.setManual"].map((x) => ops.find((o) => o.id === x)?.kind).join("/"));
  const bundles = scopes.API_SCOPE_BUNDLES as { id: string; scopes: string[] }[];
  const bRead = bundles.find((b) => b.id === "member-read"); const bOp = bundles.find((b) => b.id === "member-operate"); const bAdmin = bundles.find((b) => b.id === "member-admin");
  chk("M1.11-S1.4", "bundle member-read / member-operate / member-admin ใน scopes.ts · read = เฉพาะ *.read/*.view (ไม่มี sensitive.read · ไม่มี write) · operate ⊇ read + customer.create/update · loyalty.stamp · promo.issue (ไม่มี settings/privacy/api.manage) · admin ⊇ operate + settings.manage/privacy.manage/tier.manage/customer.delete/api.manage", !!bRead && !!bOp && !!bAdmin && bRead.scopes.every((s) => /\.(read|view)$/.test(s)) && !bRead.scopes.includes("member.sensitive.read") && bRead.scopes.every((s) => bOp.scopes.includes(s)) && ["member.customer.create", "member.customer.update", "member.loyalty.stamp", "member.promo.issue"].every((s) => bOp.scopes.includes(s)) && !bOp.scopes.some((s) => /settings\.manage|privacy\.manage|api\.manage/.test(s)) && bOp.scopes.every((s) => bAdmin.scopes.includes(s)) && ["member.settings.manage", "member.privacy.manage", "member.tier.manage", "member.customer.delete", "member.api.manage"].every((s) => bAdmin.scopes.includes(s)), "3 bundle", `read=${bRead?.scopes?.length} op=${bOp?.scopes?.length} admin=${bAdmin?.scopes?.length}`);
  const routeSrc = read("src/app/api/v1/member/[...path]/route.ts");
  chk("M1.11-S1.5", "route [...path] ใช้ dispatch แกนกลาง (@/lib/api หรือ member/api/dispatch ที่ห่อแกนกลาง) · export GET/POST/PATCH/PUT/DELETE · openapi.json route มี · ไม่มี any", /dispatch/.test(routeSrc) && ["GET", "POST", "PATCH", "PUT", "DELETE"].every((mth) => new RegExp(`export (const|async function) ${mth}\\b`).test(routeSrc)) && existsSync("src/app/api/v1/member/openapi.json/route.ts") && !/\bany\b/.test(routeSrc.replace(/\/\/.*$/gm, "")), "ครบ", `methods=${["GET", "POST", "PATCH", "PUT", "DELETE"].filter((mth) => !new RegExp(`export (const|async function) ${mth}\\b`).test(routeSrc)).join(",")}`);

  // ═══ S2 ยิงจริงผ่าน route handler ═══
  const mkKey = async (bundle: string, tenantId = tid, systemId = SYS) => { const k = await ak.createApiKey({ tenantId }, `QC M1.11 ${bundle}`, { scopes: scopes.expandBundles([bundle]), systemId }); keyIds.push(k.id); return k.rawKey as string; };
  const kRead = await mkKey("member-read"); const kOp = await mkKey("member-operate"); const kAdmin = await mkKey("member-admin");
  const call = async (method: string, path: string, key: string | null, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(method === "GET" || extra["idempotency-key"] === "" ? {} : { "idempotency-key": `m111-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...extra };
    if (extra["idempotency-key"] === "") delete headers["idempotency-key"];
    let b: string | undefined; if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await route[method]!(new Request(`http://x/api/v1/member${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const buf = new Uint8Array(await res.arrayBuffer()); const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf); let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text, _bom: hasBom }; }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const ping = await call("GET", "/ping", kRead); const noKey = await call("GET", "/ping", null);
  chk("M1.11-S2.1", "GET /ping → 200 {ok, systemId, keyName} + requestId + X-RateLimit-Remaining · ไม่มีคีย์ → 401", ping.status === 200 && ping.body?.data?.ok === true && ping.body.data.systemId === SYS && typeof ping.body?.requestId === "string" && !!ping.headers.get("x-ratelimit-remaining") && noKey.status === 401, "200/401", `${ping.status}/${noKey.status} ${JSON.stringify(ping.body).slice(0, 120)}`);
  const list = await call("GET", "/members?take=20", kRead);
  const listJson = JSON.stringify(list.body);
  chk("M1.11-S2.2", "GET /members (คีย์ read) → 200 {items[20], total 60} · แถว MemberBrief+listFields (memberCode name tier phoneMasked points) · ไม่มีเบอร์เต็ม · ไม่มีค่าอ่อนไหว · Accept text/csv → BOM", list.status === 200 && list.body?.data?.total === 60 && list.body.data.items?.length === 20 && list.body.data.items[0].memberCode && list.body.data.items[0].tier?.key && !/08100000\d\d/.test(listJson) && !/ภูมิแพ้|โรคประจำตัว/.test(listJson) && (await call("GET", "/members?take=5", kRead, undefined, { accept: "text/csv" })).body?._bom === true, "60 · ปลอดภัย", `${list.status} total=${list.body?.data?.total} n=${list.body?.data?.items?.length} leak=${/08100000\d\d/.test(listJson)}`);
  const cond = ((await P.memberFieldValue.findFirst({ where: { customerId: m(1).id, fieldId: E.fields.health.conditions } })) as Any)?.valueText as string;
  const gRead = await call("GET", `/members/${m(1).id}`, kRead); const gOp = await call("GET", `/members/${m(1).id}`, kOp); const gAdmin = await call("GET", `/members/${m(1).id}`, kAdmin);
  const health = (r: Any) => r.body?.data?.sections?.find((s: Any) => s.key === "health");
  chk("M1.11-S2.3", "🔴 GET /members/{id}: read/operate → 200 แต่ส่วน health visible=false ไม่มีค่าโรคประจำตัวใน JSON (§6.3 API ไม่เห็นอ่อนไหว) · admin → เห็น · DTO มี profile/sections/stats/tier/identities/consents/attribution", gRead.status === 200 && health(gRead)?.visible === false && !JSON.stringify(gRead.body).includes(cond) && health(gOp)?.visible === false && gAdmin.status === 200 && health(gAdmin)?.visible === true && JSON.stringify(gAdmin.body).includes(cond) && ["profile", "sections", "stats", "tier", "identities", "consents", "attribution"].every((k) => k in gAdmin.body.data), "ซ่อน/ซ่อน/เห็น", `${gRead.status}/${health(gRead)?.visible} op=${health(gOp)?.visible} admin=${health(gAdmin)?.visible} leakRead=${JSON.stringify(gRead.body).includes(cond)}`);
  const idem = `m111-create-${Date.now()}`;
  const phone = `0894${String(Date.now() % 1_000_000).padStart(6, "0")}`;
  const c1 = await call("POST", "/members", kOp, { phone, firstName: "จาก", lastName: "API", source: "API", consents: [{ channel: "LINE", granted: true }], fields: { certLevel: "Open Water" } }, { "idempotency-key": idem });
  if (c1.body?.data?.customerId) made.customers.push(c1.body.data.customerId);
  const c2 = await call("POST", "/members", kOp, { phone, firstName: "จาก", lastName: "API", source: "API" }, { "idempotency-key": idem });
  const cNoIdem = await call("POST", "/members", kOp, { phone: "0894999999", firstName: "x", source: "API" }, { "idempotency-key": "" });
  const cu = c1.body?.data?.customerId ? await prisma.customer.findUnique({ where: { id: c1.body.data.customerId } }) as Any : null;
  chk("M1.11-S2.4", "POST /members (operate + Idempotency-Key) → 200 {customerId, memberCode, partyId, created true} · source API + sourceDetail.apiKeyName · consent LINE · fields · ยิงซ้ำคีย์เดิม → ตอบเดิม + Idempotent-Replayed · ไม่มี Idempotency-Key → 400 idempotency_required · สมาชิกใน DB 1 คน", c1.status === 200 && c1.body.data.customerId && c1.body.data.memberCode && c1.body.data.partyId && cu?.source === "API" && typeof (cu.sourceDetail as Any)?.apiKeyName === "string" && c2.status === 200 && c2.body?.data?.customerId === c1.body.data.customerId && !!c2.headers.get("idempotent-replayed") && cNoIdem.status === 400 && (await prisma.customer.count({ where: { memberSystemId: SYS, phone } })) === 1 && (await P.memberConsent.count({ where: { customerId: c1.body.data.customerId, channel: "LINE", granted: true } })) === 1, "200 · replay · 400", `${c1.status} ${JSON.stringify(c1.body).slice(0, 120)} · c2=${c2.status}/${c2.headers.get("idempotent-replayed")} · noIdem=${cNoIdem.status}`);
  const roWrite = await call("POST", "/members", kRead, { phone: "0894999998", firstName: "x", source: "API" });
  const bad = await call("POST", "/members", kOp, { phone: "12", firstName: "", source: "MOON" });
  const other = await prisma.tenant.create({ data: { name: "MEMBER API OTHER", slug: `member-api-other-${Date.now()}` } }); made.otherTenant = other.id;
  const otherSys = await prisma.appSystem.create({ data: { tenantId: other.id, type: "MEMBER" as Any, name: "สมาชิกร้านอื่น" } });
  const kOther = await mkKey("member-admin", other.id, otherSys.id);
  const cross = await call("GET", `/members/${m(1).id}`, kOther); const crossW = await call("PATCH", `/members/${m(1).id}`, kOther, { fields: { nickname: "แฮก" } });
  chk("M1.11-S2.5", "คีย์ read เขียน → 403 scope_missing (+hint) · body ผิด schema (เบอร์ 12 · source นอก enum) → 422 validation + details[] · คีย์ร้านอื่นดู/แก้สมาชิกเรา → 404 not_found (ไม่ leak) · nickname ไม่เปลี่ยน", roWrite.status === 403 && roWrite.body?.error?.code === "scope_missing" && bad.status === 422 && bad.body?.error?.code === "validation" && Array.isArray(bad.body.error.details) && cross.status === 404 && crossW.status === 404 && ((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).nickname !== "แฮก", "403/422/404/404", `${roWrite.status}/${bad.status}/${cross.status}/${crossW.status}`);
  const upd = await call("PATCH", `/members/${c1.body.data.customerId}`, kOp, { fields: { nickname: "นิค API", diveCount: 5 }, tags: ["api"] });
  const st = await call("PUT", `/members/${c1.body.data.customerId}/status`, kOp, { status: "SUSPENDED", reason: "QC" });
  const tags = await call("PUT", `/members/${c1.body.data.customerId}/tags`, kOp, { add: ["vip"], remove: ["api"] });
  const cu2 = (await prisma.customer.findUnique({ where: { id: c1.body.data.customerId } })) as Any;
  chk("M1.11-S2.6", "PATCH /members/{id} {fields, tags} → 200 · PUT /status SUSPENDED → 200 · PUT /tags {add,remove} → tags ['vip'] · AuditLog actorType API_KEY", upd.status === 200 && st.status === 200 && tags.status === 200 && cu2.nickname === "นิค API" && cu2.status === "SUSPENDED" && JSON.stringify(cu2.tags) === JSON.stringify(["vip"]) && (await prisma.auditLog.count({ where: { tenantId: tid, targetId: c1.body.data.customerId, actorType: "API_KEY" as Any } })) >= 1, "ครบ", `${upd.status}/${st.status}/${tags.status} nick=${cu2?.nickname} st=${cu2?.status} tags=${JSON.stringify(cu2?.tags)}`);
  const lay = await call("GET", "/fields/layout", kRead); const ch = await call("GET", "/channels", kRead); const tiers = await call("GET", "/tiers", kRead);
  const cons = await call("PUT", `/members/${m(7).id}/consents`, kOp, { channel: "EMAIL", granted: true, source: "API" });
  restore.push(() => P.memberConsent.updateMany({ where: { customerId: m(7).id, channel: "EMAIL" }, data: { granted: ((E.members[6].index % 3) !== 0) } }));
  const ev = await call("GET", `/members/${m(1).id}/tier`, kRead);
  chk("M1.11-S2.7", "GET /fields/layout → sections[] (audience staff) · GET /channels → 15 {key,label,kind,canConsent,canNotify,connected} · GET /tiers → 4 · PUT /members/{id}/consents → 200 + แถว · GET /members/{id}/tier → {current,next,evidence,progressToNext}", lay.status === 200 && lay.body.data.sections?.length >= 5 && ch.status === 200 && ch.body.data.items?.length === 15 && ch.body.data.items.every((x: Any) => typeof x.connected === "boolean") && tiers.status === 200 && tiers.body.data.items?.length === 4 && cons.status === 200 && ((await P.memberConsent.findFirst({ where: { customerId: m(7).id, channel: "EMAIL" } })) as Any)?.granted === true && ev.status === 200 && ev.body.data.current?.key && "next" in ev.body.data && ev.body.data.evidence, "ครบ", `${lay.status}/${ch.status}:${ch.body?.data?.items?.length}/${tiers.status}:${tiers.body?.data?.items?.length}/${cons.status}/${ev.status}`);
  const res = await call("POST", "/members/resolve", kOp, { channel: "WHATSAPP", externalId: `wa-api-${Date.now()}`, phone: m(8).phone });
  const idsList = await call("GET", `/members/${m(8).id}/identities`, kRead);
  const rep = await call("GET", "/sources/report", kRead);
  const srcLink = await call("POST", "/sources/links", kAdmin, { name: "API QR", source: "LIFF", target: "LIFF_JOIN" });
  chk("M1.11-S2.8", "POST /members/resolve (operate) → {customerId สมาชิก 8, matchedBy PHONE} · GET /members/{id}/identities → externalId ปิดบัง (masked) · GET /sources/report → rows[] (report.view อยู่ใน read) · POST /sources/links (admin) → {link, url, qrDataUrl}", res.status === 200 && res.body.data.customerId === m(8).id && res.body.data.matchedBy === "PHONE" && idsList.status === 200 && idsList.body.data.items?.some((i: Any) => i.channel === "WHATSAPP" && /[x*…]/.test(i.externalId)) && rep.status === 200 && Array.isArray(rep.body.data.rows) && srcLink.status === 200 && srcLink.body.data.url && /^data:image\/png/.test(srcLink.body.data.qrDataUrl ?? ""), "ครบ", `${res.status}:${res.body?.data?.matchedBy}/${idsList.status}/${rep.status}/${srcLink.status}`);
  if (srcLink.body?.data?.link?.id) restore.push(() => P.acquisitionLink.delete({ where: { id: srcLink.body.data.link.id } }));
  await P.memberChannelIdentity.deleteMany({ where: { tenantId: tid, externalId: { startsWith: "wa-api-" } } });
  const plat = await P.memberTierDef.findFirst({ where: { systemId: SYS, key: "platinum" } });
  const cid = c1.body.data.customerId;
  const d0 = await call("POST", `/members/${cid}/tier`, kAdmin, { tierDefId: plat.id, reason: "VIP" });
  const dRO = await call("POST", `/members/${cid}/tier`, kOp, { tierDefId: plat.id, reason: "VIP", confirm: true });
  const d1 = await call("POST", `/members/${cid}/tier`, kAdmin, { tierDefId: plat.id, reason: "VIP จาก API", confirm: true });
  const cu3 = (await prisma.customer.findUnique({ where: { id: cid } })) as Any;
  chk("M1.11-S2.9", "danger tiers.setManual: ไม่มี confirm:true → 409 confirm_required · คีย์ operate → 403 (ต้อง tier.setManual = admin) · admin + confirm → 200 {applied true} · tierDefId platinum · history MANUAL · AuditLog API_KEY", d0.status === 409 && d0.body?.error?.code === "confirm_required" && dRO.status === 403 && d1.status === 200 && d1.body.data?.applied === true && cu3.tierDefId === plat.id && (await P.memberTierHistory.count({ where: { customerId: cid, reason: "MANUAL" } })) >= 1, "409/403/200", `${d0.status}/${dRO.status}/${d1.status} ${JSON.stringify(d1.body).slice(0, 100)}`);
  const merge0 = await call("POST", `/members/${m(2).id}/merge`, kAdmin, { mergeId: m(3).id });
  const erase0 = await call("POST", `/members/${m(2).id}/privacy/erase`, kAdmin, {});
  const me = await call("GET", "/me", kOp);
  chk("M1.11-S2.10", "danger members.merge/privacy.erase ไม่มี confirm → 409 (ไม่แตะข้อมูล) · GET /me ด้วยคีย์ API → 401 customer_session_required (op me.* ต้อง session ลูกค้า — M2.9)", merge0.status === 409 && erase0.status === 409 && ((await prisma.customer.findUnique({ where: { id: m(3).id } })) as Any).status === "ACTIVE" && me.status === 401 && me.body?.error?.code === "customer_session_required", "409/409/401", `${merge0.status}/${erase0.status}/${me.status}:${me.body?.error?.code}`);
  const search = await call("GET", `/members/search?q=${encodeURIComponent(m(9).memberCode)}`, kRead);
  const brief = await call("GET", `/members/brief?ids=${m(1).id},${m(2).id}`, kRead);
  const act = await call("GET", `/members/${m(1).id}/activity?take=5`, kRead);
  const exp = await call("POST", "/members/export", kAdmin, { filters: { tier: "gold" }, columns: ["memberCode", "name"] });
  chk("M1.11-S2.11", "GET /members/search?q=รหัส → 1 · GET /members/brief?ids= → 2 · GET /members/{id}/activity → items[] · POST /members/export (customer.export ∈ admin) → {jobId|csv, rows 10}", search.status === 200 && search.body.data.items?.length === 1 && brief.status === 200 && brief.body.data.items?.length === 2 && act.status === 200 && Array.isArray(act.body.data.items) && exp.status === 200 && (exp.body.data.rows === 10 || exp.body.data.jobId), "ครบ", `${search.status}:${search.body?.data?.items?.length}/${brief.status}:${brief.body?.data?.items?.length}/${act.status}/${exp.status}:${exp.body?.data?.rows}`);
  let limited = 0; for (let i = 0; i < 5; i++) { const r = await call("GET", "/ping", kRead); if (r.status === 429) limited++; }
  const rl = await call("GET", "/ping", kRead);
  chk("M1.11-S2.12", "rate limit: หัว X-RateLimit-Limit/Remaining มีทุกคำตอบ · ยิง 5 ครั้งไม่ถึงเพดาน (600/นาที) · เมื่อถึง → 429 rate_limited (โค้ดจากแกนกลาง — ตรวจว่า require.ts ใช้ API_RATE_LIMITS ต่อคีย์)", !!rl.headers.get("x-ratelimit-limit") && !!rl.headers.get("x-ratelimit-remaining") && limited === 0 && /rate/i.test(read("src/lib/api/require.ts")), "มีหัว · ไม่ 429", `limit=${rl.headers.get("x-ratelimit-limit")} rem=${rl.headers.get("x-ratelimit-remaining")} 429=${limited}`, "MAJOR");

  // ═══ S3 openapi · docs · skill · developers · fitness ═══
  const oa = (await import("@/app/api/v1/member/openapi.json/route" as string)) as { GET: (r: Request) => Promise<Response> };
  const spec = await (await oa.GET(new Request("http://x/api/v1/member/openapi.json"))).json();
  const specOps = Object.values(spec.paths ?? {}).reduce((n: number, v: Any) => n + Object.keys(v).length, 0);
  chk("M1.11-S3.1", "GET /api/v1/member/openapi.json (ไม่ต้องมีคีย์) = จำนวน op ในทะเบียน · info.title มี Member", specOps === ops.length && /member/i.test(spec.info?.title ?? ""), "= ทะเบียน", `${specOps}/${ops.length}`);
  const { spawnSync } = await import("node:child_process");
  const gen = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-member-api-docs.mts", "--check"], { encoding: "utf8" });
  const md = read("docs/api/MEMBER-API.md");
  chk("M1.11-S3.2", "gen-member-api-docs --check exit 0 · docs/api/MEMBER-API.md ถูก generator ทับ (ไม่ใช่ร่างเดิม: ไม่มี 'draft สำหรับสั่งทำ') · มี Webhooks (member.created …) · AI agents · Idempotency-Key · confirm · error codes · bundles 3", gen.status === 0 && !/draft สำหรับสั่งทำ/.test(md) && /member\.created/.test(md) && /AI agents/i.test(md) && /Idempotency-Key/.test(md) && /confirm/.test(md) && /member-read/.test(md) && /member-admin/.test(md), "exit 0 · regenerated", `${gen.status} ${(gen.stdout + gen.stderr).slice(-160)}`);
  const skill = read(".claude/skills/shark-member-api/SKILL.md"); const endpoints = read(".claude/skills/shark-member-api/references/endpoints.md");
  chk("M1.11-S3.3", "สกิล .claude/skills/shark-member-api: SKILL.md (name: shark-member-api · EN · https://shark.in.th/api/v1/member · Bearer · Idempotency-Key · recipes curl ≥ 6) + references/endpoints.md ครบทุก op path · สำเนาที่ /root/.claude/skills/shark-member-api", /name:\s*shark-member-api/.test(skill) && /https:\/\/shark\.in\.th\/api\/v1\/member/.test(skill) && /Bearer/.test(skill) && /Idempotency-Key/.test(skill) && (skill.match(/curl /g) ?? []).length >= 6 && ops.every((o) => endpoints.includes(o.path)) && existsSync("/root/.claude/skills/shark-member-api/SKILL.md"), "ครบ", `skill=${!!skill} curl=${(skill.match(/curl /g) ?? []).length} missing=${ops.filter((o) => !endpoints.includes(o.path)).map((o) => o.id).slice(0, 5).join(",")} copy=${existsSync("/root/.claude/skills/shark-member-api/SKILL.md")}`);
  const devPage = read("src/app/developers/member/page.tsx");
  const mdRoute = (await import("@/app/developers/member.md/route" as string).catch(() => null)) as { GET: (r: Request) => Promise<Response> } | null;
  const mdText = mdRoute ? await (await mdRoute.GET(new Request("http://x/developers/member.md"))).text() : "";
  const fit = read("scripts/fitness.mts");
  chk("M1.11-S3.4", "หน้า /developers/member (render จาก buildOpenApi/MEMBER_OPS) + /developers/member.md = docs เป๊ะ + ลิงก์จาก /developers · fitness F13.7 (ทุก op มี test ใน qc-member-*) F13.8 (docs ไม่ stale) F13.9 (tool มีบ้านในสกิล members)", /buildOpenApi|MEMBER_OPS/.test(devPage) && mdText === md && /developers\/member/.test(read("src/app/developers/page.tsx")) && /F13\.7/.test(fit) && /F13\.8/.test(fit) && /F13\.9/.test(fit) && /MEMBER-API/.test(fit), "ครบ", `dev=${/buildOpenApi|MEMBER_OPS/.test(devPage)} md=${mdText === md} link=${/developers\/member/.test(read("src/app/developers/page.tsx"))} fit=${[/F13\.7/, /F13\.8/, /F13\.9/].map((r) => r.test(fit)).join("/")}`);

  // ═══ S4 AI tools (proposal flow · ยืนยันด้วย Membership จริง) ═══
  const tk = read("src/lib/ai/tools-member.ts");
  const mops = (await import("@/lib/modules/member/api/tools" as string)) as Record<string, (...a: Any[]) => Any>;
  const skillsMod = (await import("@/lib/ai/skills" as string)) as Any;
  const memSkill = (skillsMod.SKILLS as Any[]).find((s) => s.id === "members");
  const toolNames: string[] = mops.memberToolNames?.() ?? reg.memberToolOps().map((o) => o.tool.name);
  const LEGACY = ["member_count", "member_create", "customer_search", "customer_points", "point_adjust", "reward_redeem", "reward_list_redemptions", "coupon_create"];
  chk("M1.11-S4.1", "tools-member.ts generate จาก MEMBER_OPS.filter(o => o.tool) (read รันทันที · write = createProposal pendingConfirmation) · tool member_* ≥ 20 · สกิล members มีชื่อครบทุก tool + ชื่อเดิม 8 ตัวคง · danger ops มี risk DESTRUCTIVE · assertSkillRegistryComplete ผ่าน", /MEMBER_OPS/.test(tk) && /createProposal/.test(tk) && /pendingConfirmation/.test(tk) && toolNames.filter((n) => /^member_/.test(n)).length >= 20 && !!memSkill && toolNames.every((n) => memSkill.tools.includes(n)) && LEGACY.every((n) => memSkill.tools.includes(n)) && reg.memberToolOps().filter((o) => o.kind === "danger").every((o) => /DESTRUCTIVE/.test(JSON.stringify(o.tool))) && (typeof skillsMod.assertSkillRegistryComplete !== "function" || (await fails(() => skillsMod.assertSkillRegistryComplete())) === null), "≥20 · ครบ", `n=${toolNames.length} member_=${toolNames.filter((n) => /^member_/.test(n)).length} missingInSkill=${toolNames.filter((n) => !memSkill?.tools?.includes(n)).slice(0, 5).join(",")} legacyMissing=${LEGACY.filter((n) => !memSkill?.tools?.includes(n)).join(",")}`);
  const rd = await mops.runMemberTool(tid, "member_search", { q: m(9).memberCode }, { systemId: SYS });
  const rdGhost = await mops.runMemberTool(tid, "member_get", { customerId: "ไม่มี" }, { systemId: SYS });
  chk("M1.11-S4.2", "runMemberTool(member_search {q}) → mode read · result มีสมาชิก 9 (ไม่มีเบอร์เต็ม · ไม่มีอ่อนไหว) · member_get id ไม่มี → mode error ไทย (ไม่ throw)", rd?.mode === "read" && JSON.stringify(rd.result).includes(m(9).memberCode) && !/08100000\d\d/.test(JSON.stringify(rd.result)) && rdGhost?.mode === "error" && /[ก-๙]/.test(rdGhost.error), "read · error", JSON.stringify({ rd: rd?.mode, ghost: rdGhost }).slice(0, 160));
  const pr = await mops.runMemberTool(tid, "member_set_tags", { customerId: m(10).id, add: ["ai-qc"] }, { systemId: SYS });
  const noPerm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId: E.users.noPerm.userId } }))!;
  const owner = (await prisma.membership.findFirst({ where: { tenantId: tid, userId: E.users.owner.userId } }))!;
  const mc = (a: Any) => ({ role: a.role, unitAccess: a.unitAccess, permissions: a.permissions });
  const eNoPerm = await fails(() => mops.dispatchMemberKind(mc(noPerm), tid, "qc-m111-p1", pr?.kind, { ...pr?.payload, systemId: SYS }, E.users.noPerm.userId));
  const before10 = ((await prisma.customer.findUnique({ where: { id: m(10).id } })) as Any).tags;
  const okMsg = await mops.dispatchMemberKind(mc(owner), tid, "qc-m111-p1", pr?.kind, { ...pr?.payload, systemId: SYS }, E.users.owner.userId);
  const after10 = ((await prisma.customer.findUnique({ where: { id: m(10).id } })) as Any).tags as string[];
  restore.push(() => prisma.customer.update({ where: { id: m(10).id }, data: { tags: before10.filter((t: string) => t !== "ai-qc") } }));
  chk("M1.11-S4.3", "🔴 write tool (member_set_tags) → mode propose {kind member.*, summary ไทย, payload} ไม่เขียน DB · dispatchMemberKind ด้วย STAFF ไม่มีคีย์ → throw ไทย (ตรวจสิทธิ์ Membership ของคนกดยืนยัน K3.5) · OWNER → ทำจริง แท็กเพิ่ม + AuditLog actorId owner + ข้อความผลไทย · memberKindAccess ของ kind ชี้ member.customer.update", pr?.mode === "propose" && /^member\./.test(pr.kind) && /[ก-๙]/.test(pr.summary) && !JSON.stringify(before10).includes("ai-qc") && !!eNoPerm && /[ก-๙]/.test(eNoPerm.message) && typeof okMsg === "string" && /[ก-๙]/.test(okMsg) && after10.includes("ai-qc") && mops.memberKindAccess()?.[pr.kind]?.action === "member.customer.update", "propose → confirm", JSON.stringify({ pr: pr?.mode, kind: pr?.kind, noPerm: !!eNoPerm, ok: typeof okMsg, tags: after10, access: mops.memberKindAccess?.()?.[pr?.kind] }).slice(0, 220));

  // ═══ S5 หน้า settings/api + webhook events ═══
  const apiPage = read("src/app/app/sys/[id]/member/settings/api/page.tsx");
  const uiAll = readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n");
  const W = (await import("@/lib/webhooks/labels" as string)) as Any;
  const M1_EVENTS = ["member.created", "member.updated", "member.merged", "member.identity.linked", "member.sensitive.viewed", "member.tier.changed", "member.tier.at_risk", "member.consent.changed"];
  chk("M1.11-S5.1", "หน้า settings/api (ภาพ 27 ขวา): gate member.api.manage · คีย์ 3 ชุดสิทธิ์ (bundle member-*) ออก/ถอน (reuse api-keys service · pattern kanban ApiKeysPanel) · curl ตัวอย่าง 3 เส้น · ลิงก์ OpenAPI/developers/skill · webhook events member.* 8 ตัวใน WEBHOOK_EVENTS · testid 5", /member\.api\.manage/.test(apiPage) && /member-read|member-operate|member-admin/.test(apiPage + uiAll) && ["member-api-page", "member-api-keys", "member-api-new", "member-api-curl", "member-api-webhooks"].every((t) => (apiPage + uiAll).includes(t)) && (uiAll.match(/curl /g) ?? []).length >= 3 && /openapi\.json|\/developers\/member/.test(apiPage + uiAll) && M1_EVENTS.every((e) => W.WEBHOOK_EVENTS.some((x: Any) => x.value === e)), "ครบ", `gate=${/member\.api\.manage/.test(apiPage)} testid=${["member-api-page", "member-api-keys", "member-api-new", "member-api-curl", "member-api-webhooks"].filter((t) => !(apiPage + uiAll).includes(t)).join(",")} events=${M1_EVENTS.filter((e) => !W.WEBHOOK_EVENTS.some((x: Any) => x.value === e)).join(",")}`);
  const dir = `${mq.MQC.shotsDir}/1.11`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumO = existsSync(`${dir}/summary-owner.json`) ? JSON.parse(read(`${dir}/summary-owner.json`)) : null;
  const rO = sumO?.results?.find((x: Any) => x.name === "settings-api-owner" && x.device === "desktop");
  chk("M1.11-S5.2", "ภาพ 27 (ครึ่งขวา): settings-api-owner desktop 200 · PARITY: ผ่าน ใน wo-notes/member-M1.11.md", shots.includes("settings-api-owner-desktop.png") && rO?.status === 200 && rO.missing.length === 0 && /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.11.md")), "200 · PARITY", `shots=${shots.join(",")} o=${rO?.status}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.11-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of keyIds) await d(() => P.apiKey.delete({ where: { id } }));
  await d(() => P.apiKey.deleteMany({ where: { tenantId: tid, name: { startsWith: "QC M1.11" } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  if (made.otherTenant) { const o = made.otherTenant; for (const mdl of ["apiKey", "appSystem"]) await d(() => P[mdl].deleteMany({ where: { tenantId: o } })); await d(() => prisma.tenant.delete({ where: { id: o } })); }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.11: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
