// QC — API บัญชี WO D4: WRITE ตั้งค่า — ข้อมูลกิจการ · เอกสารและเลขที่ · นโยบาย · สิทธิ์ผู้ใช้งาน · เชื่อมระบบใน SHARK · webhook CRUD/test · คีย์ API (list) + event ที่เหลือ
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §D4
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-write-settings");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/modules/account/api/registry" as string)) as { ACCOUNT_OPS: { id: string }[] }).ACCOUNT_OPS.some((o) => o.id === "settings.update")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (settings.update)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const idem = () => ({ "idempotency-key": `d4-${Date.now()}-${Math.random().toString(16).slice(2)}` });
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

let tid = "";
const realFetch = globalThis.fetch;
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
  const labels = (await import("@/lib/webhooks/labels" as string)) as Record<string, Any>;
  const consumersMod = (await import("@/lib/outbox-consumers" as string)) as Record<string, Any>;

  const t = await prisma.tenant.create({ data: { name: "QC API D4", slug: `qc-api-d4-${Date.now()}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-d4-${Date.now()}@qc.local`, name: "เจ้าของ D4" } });
  const ownerMem = await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const staff = await prisma.user.create({ data: { email: `qc-d4s-${Date.now()}@qc.local`, name: "พนักงาน D4" } });
  const staffMem = await prisma.membership.create({ data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date(), permissions: {} } });
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี D4");
  const SYS = s.id;
  const pos = await sys.createSystem(tid, "POS", "POS D4");
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน D4", taxId: "0105561000012", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const kS = await ak.createApiKey({ tenantId: tid }, "D4 settings", { scopes: scopes.expandBundles(["accountant", "settings"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: tid }, "D4 read", { scopes: scopes.expandBundles(["read-only"]), systemId: SYS });

  const call = async (method: string, path: string, key: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : idem()), ...extra };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  const S = kS.rawKey;
  const code = (r: Any) => r.body?.error?.code;
  void ownerMem;

  // ═══ S1 ข้อมูลกิจการ ═══
  const st = await call("PATCH", "/settings", S, { orgName: "ร้าน D4 (แก้)", phone: "0812345678", email: "ar@d4.test", address: "1 ถ.ทดสอบ", vatRegistered: true, vatRateBp: 700 });
  chk("D4-S1.1", "PATCH /settings → 200 orgName/phone/email ใหม่ (ไม่รับ stampUrl/signatureUrl)", st.status === 200 && st.body?.data?.orgName === "ร้าน D4 (แก้)" && st.body?.data?.phone === "0812345678", "ใหม่", `${st.status} ${JSON.stringify(st.body?.data).slice(0, 160)}`);
  const stBad = await call("PATCH", "/settings", S, { taxId: "12" });
  chk("D4-S1.2", "taxId ไม่ครบ 13 หลัก → 422", stBad.status === 422, "422", `${stBad.status}`);
  const stDenied = await call("PATCH", "/settings", kR.rawKey, { orgName: "x" });
  chk("D4-S1.3", "read-only → 403", stDenied.status === 403, "403", `${stDenied.status}`);
  const stStamp = await call("PATCH", "/settings", S, { stampUrl: "https://x/y.png" });
  chk("D4-S1.4", "ส่ง stampUrl → 422 validation (field ปิดใน API)", stStamp.status === 422, "422", `${stStamp.status}`, "MAJOR");

  // ═══ S2 เอกสารและเลขที่ ═══
  const seq = await call("PATCH", "/settings/documents/INVOICE", S, { prefix: "INV", pattern: "{prefix}-{yyyy}{mm}-{seq4}", reset: "MONTHLY", dueDays: 15, notes: "ชำระภายใน 15 วัน", terms: "โอนเข้าบัญชีบริษัทเท่านั้น" });
  chk("D4-S2.1", "PATCH /settings/documents/{type} → 200 {docType,prefix INV,pattern,reset,nextNo,example,dueDays 15}", seq.status === 200 && seq.body?.data?.prefix === "INV" && seq.body?.data?.dueDays === 15 && typeof seq.body?.data?.example === "string" && /^INV-/.test(seq.body.data.example), "INV", `${seq.status} ${JSON.stringify(seq.body).slice(0, 220)}`);
  const next = await call("POST", "/settings/documents/INVOICE/next-no", S, { nextNo: 100 });
  chk("D4-S2.2", "POST /settings/documents/{type}/next-no {100} → 200 nextNo 100 · example ลงท้าย 0100", next.status === 200 && next.body?.data?.nextNo === 100 && /0100$/.test(next.body?.data?.example ?? ""), "100", `${next.status} ${JSON.stringify(next.body?.data)}`);
  const nextBack = await call("POST", "/settings/documents/INVOICE/next-no", S, { nextNo: 1 });
  chk("D4-S2.3", "ตั้งเลขถัดไปถอยหลังต่ำกว่าที่ออกแล้ว → 200 (ยังไม่มีเอกสาร) หรือ 409 ไทย", nextBack.status === 200 || nextBack.status === 409, "200/409", `${nextBack.status}`, "MINOR");
  const badPattern = await call("PATCH", "/settings/documents/INVOICE", S, { pattern: "{nope}" });
  chk("D4-S2.4", "pattern ไม่ถูกต้อง → 422 ไทย", badPattern.status === 422 && /[ก-๙]/.test(badPattern.body?.error?.message_th ?? ""), "422", `${badPattern.status}`, "MAJOR");
  const tag = await call("POST", "/settings/tags", S, { name: "เร่งด่วน", color: "#ff0000", docTypes: ["INVOICE"] });
  chk("D4-S2.5", "POST /settings/tags → 200 {id,name,color,docTypes}", tag.status === 200 && typeof tag.body?.data?.id === "string", "200", `${tag.status} ${JSON.stringify(tag.body).slice(0, 120)}`, "MAJOR");
  const docSettingsGet = await call("GET", "/settings/documents", S);
  chk("D4-S2.6", "GET /settings/documents สะท้อนค่าที่แก้ (INVOICE prefix INV dueDays 15)", docSettingsGet.body?.data?.find((d: Any) => d.docType === "INVOICE")?.prefix === "INV", "INV", JSON.stringify(docSettingsGet.body?.data?.find((d: Any) => d.docType === "INVOICE")).slice(0, 160));

  // ═══ S3 นโยบาย ═══
  const pol = await call("PATCH", "/settings/policy", S, { fiscalYearStartMonth: 4, lockBeforeDate: "2026-01-01", dupContactPolicy: "WARN", autoClosePeriods: false });
  chk("D4-S3.1", "PATCH /settings/policy → 200 fiscalYearStartMonth 4 · lockBeforeDate 2026-01-01", pol.status === 200 && pol.body?.data?.fiscalYearStartMonth === 4 && pol.body?.data?.lockBeforeDate === "2026-01-01", "4 / 2026-01-01", `${pol.status} ${JSON.stringify(pol.body?.data).slice(0, 200)}`);
  const lockedDoc = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "QUOTATION", issueDate: new Date("2025-12-15T05:00:00Z"), vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 100, vatRateBp: 700 }] }).catch((e: Any) => ({ error: e?.message }));
  chk("D4-S3.2", "นโยบายล็อกมีผลจริง: สร้างเอกสารก่อนวันล็อก → service ปฏิเสธ (ไทย)", "error" in (lockedDoc ?? {}) && /[ก-๙]/.test((lockedDoc as Any).error ?? ""), "ปฏิเสธ", JSON.stringify(lockedDoc).slice(0, 120));
  const polBad = await call("PATCH", "/settings/policy", S, { fiscalYearStartMonth: 13 });
  chk("D4-S3.3", "fiscalYearStartMonth 13 → 422", polBad.status === 422, "422", `${polBad.status}`);
  await call("PATCH", "/settings/policy", S, { lockBeforeDate: null });
  chk("D4-S3.4", "lockBeforeDate null → ปลดล็อก", (await call("GET", "/settings/policy", S)).body?.data?.lockBeforeDate === null, "null", "?", "MAJOR");

  // ═══ S4 สิทธิ์ผู้ใช้งาน ═══
  const roles = await call("GET", "/settings/permissions", S);
  chk("D4-S4.1", "GET /settings/permissions → {roles[{key,name,system,cells,capSatang}],users[{membershipId,name,email,role,accountRole,capSatang}]} · มีผู้ใช้ 2", roles.status === 200 && Array.isArray(roles.body?.data?.roles) && roles.body.data.roles.some((r: Any) => r.key === "OWNER" && r.system === true) && roles.body?.data?.users?.length >= 2, "ครบ", `${roles.status} ${JSON.stringify(roles.body?.data).slice(0, 200)}`);
  const addRole = await call("POST", "/settings/permissions/roles", S, { name: "พนักงานขาย API", cells: { revenue: { view: true, create: true } }, capSatang: 5_000_000 });
  const roleKey = addRole.body?.data?.key as string;
  chk("D4-S4.2", "POST /settings/permissions/roles → 200 {key,name,cells,capSatang}", addRole.status === 200 && typeof roleKey === "string" && addRole.body?.data?.capSatang === 5_000_000, "200", `${addRole.status} ${JSON.stringify(addRole.body).slice(0, 200)}`);
  const assign = await call("POST", "/settings/permissions/assign", S, { membershipId: staffMem.id, roleKey });
  const staffPerm = await prisma.membership.findUnique({ where: { id: staffMem.id }, select: { permissions: true } });
  chk("D4-S4.3", "POST /settings/permissions/assign → 200 · Membership.permissions ของพนักงานได้ account.doc.view/create + เพดาน", assign.status === 200 && (staffPerm?.permissions as Any)?.["account.doc.view"] === true && (staffPerm?.permissions as Any)?.["account.doc.create"] === true, "สิทธิ์ลงจริง", `${assign.status} ${JSON.stringify(staffPerm?.permissions).slice(0, 160)}`);
  const saveRole = await call("PUT", `/settings/permissions/roles/${roleKey}`, S, { name: "พนักงานขาย API", cells: { revenue: { view: true } }, capSatang: null });
  const staffPerm2 = await prisma.membership.findUnique({ where: { id: staffMem.id }, select: { permissions: true } });
  chk("D4-S4.4", "PUT roles/{key} ลด cell → 200 · สิทธิ์ของคนในบทบาทถูกเขียนใหม่ (doc.create หาย)", saveRole.status === 200 && (staffPerm2?.permissions as Any)?.["account.doc.create"] !== true, "หาย", `${saveRole.status} ${JSON.stringify(staffPerm2?.permissions).slice(0, 160)}`);
  const sysRole = await call("PUT", "/settings/permissions/roles/OWNER", S, { name: "x", cells: {}, capSatang: null });
  chk("D4-S4.5", "แก้บทบาทระบบ OWNER → 409/422 ไทย", (sysRole.status === 409 || sysRole.status === 422) && /[ก-๙]/.test(sysRole.body?.error?.message_th ?? ""), "409/422", `${sysRole.status}`, "MAJOR");
  const cap = await call("PUT", `/settings/permissions/caps/${staffMem.id}`, S, { capSatang: 1_000_000 });
  chk("D4-S4.6", "PUT caps/{membershipId} → 200 · _maxApproveSatang = 1,000,000", cap.status === 200 && ((await prisma.membership.findUnique({ where: { id: staffMem.id }, select: { permissions: true } }))?.permissions as Any)?._maxApproveSatang === 1_000_000, "1000000", `${cap.status}`);
  const revoke = await call("DELETE", `/settings/permissions/members/${staffMem.id}`, S, { confirm: true, reason: "ลาออกแล้ว" });
  chk("D4-S4.7", "DELETE members/{membershipId} (danger) → 200 · สิทธิ์ account.* ถูกถอน", revoke.status === 200 && !Object.keys(((await prisma.membership.findUnique({ where: { id: staffMem.id }, select: { permissions: true } }))?.permissions as Any) ?? {}).some((k) => k.startsWith("account.")), "ถอนหมด", `${revoke.status} ${code(revoke)}`);

  // ═══ S5 เชื่อมระบบใน SHARK ═══
  const links0 = await call("GET", "/links", S);
  const posCard = (links0.body?.data ?? []).find((l: Any) => l.kind === "POS");
  chk("D4-S5.1", "GET /links → การ์ด POS status unlinked + linkedSystem null (มีระบบให้เชื่อม)", links0.status === 200 && posCard?.status === "unlinked", "unlinked", `${links0.status} ${JSON.stringify(posCard).slice(0, 160)}`);
  const link = await call("POST", "/links", S, { kind: "POS", linkedId: pos.id });
  chk("D4-S5.2", "POST /links {kind,linkedId} → 200 status linked · AccountSystemLink enabled", link.status === 200 && link.body?.data?.status === "linked" && !!(await prisma.accountSystemLink.findFirst({ where: { systemId: SYS, linkedKind: "POS", enabled: true } })), "linked", `${link.status} ${JSON.stringify(link.body).slice(0, 160)}`);
  const opt = await call("PATCH", "/links/POS", S, { options: { autoPost: true, autoCreateContact: false } });
  chk("D4-S5.3", "PATCH /links/{kind} {options} → 200 options สะท้อน", opt.status === 200 && opt.body?.data?.options?.autoPost === true && opt.body?.data?.options?.autoCreateContact === false, "ตรง", `${opt.status} ${JSON.stringify(opt.body?.data?.options)}`);
  const unlink = await call("DELETE", "/links/POS", S, { confirm: true, reason: "เลิกใช้ POS" });
  chk("D4-S5.4", "DELETE /links/{kind} (danger · ตัดการเชื่อม = เงินไม่ลงบัญชี) → 200 enabled=false (แถวยังอยู่)", unlink.status === 200 && (await prisma.accountSystemLink.findFirst({ where: { systemId: SYS, linkedKind: "POS" } }))?.enabled === false, "false", `${unlink.status} ${code(unlink)}`);
  const linkBad = await call("POST", "/links", S, { kind: "POS", linkedId: "nope" });
  chk("D4-S5.5", "linkedId ไม่ใช่ระบบของร้าน → 404/422", linkBad.status === 404 || linkBad.status === 422, "404/422", `${linkBad.status}`, "MAJOR");

  // ═══ S6 webhook ═══
  const hook = await call("POST", "/webhooks", S, { url: "https://hook.test/d4", events: ["account.document.issued", "account.contact.created"] });
  const hookId = hook.body?.data?.id as string;
  chk("D4-S6.1", "POST /webhooks → 200 {id,url,events,active,secret (ครั้งเดียว)}", hook.status === 200 && typeof hookId === "string" && typeof hook.body?.data?.secret === "string" && hook.body.data.secret.length >= 24 && hook.body?.data?.events?.length === 2, "200 + secret", `${hook.status} ${JSON.stringify(hook.body).slice(0, 200)}`);
  const hookBad = await call("POST", "/webhooks", S, { url: "ftp://x", events: [] });
  chk("D4-S6.2", "url ไม่ใช่ http(s) → 422", hookBad.status === 422, "422", `${hookBad.status}`);
  const hookBadEv = await call("POST", "/webhooks", S, { url: "https://hook.test/x", events: ["nope.event"] });
  chk("D4-S6.3", "event ที่ไม่มีในทะเบียน → 422", hookBadEv.status === 422, "422", `${hookBadEv.status}`, "MAJOR");
  const hooks = await call("GET", "/webhooks", S);
  chk("D4-S6.4", "GET /webhooks → data[] ไม่มี secret", hooks.status === 200 && hooks.body?.data?.length === 1 && !("secret" in hooks.body.data[0]), "ไม่มี secret", `${hooks.status} ${JSON.stringify(hooks.body?.data?.[0]).slice(0, 160)}`);
  const hookUpd = await call("PATCH", `/webhooks/${hookId}`, S, { events: ["account.document.issued"], active: true });
  chk("D4-S6.5", "PATCH /webhooks/{id} {events} → 200 events 1 (secret ไม่เปลี่ยน)", hookUpd.status === 200 && hookUpd.body?.data?.events?.length === 1 && (await prisma.webhookEndpoint.findUnique({ where: { id: hookId }, select: { secret: true } }))?.secret === hook.body?.data?.secret, "1", `${hookUpd.status} ${JSON.stringify(hookUpd.body?.data)}`);
  const captured: { url: string; body: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
    const u = String(url);
    if (u.startsWith("https://hook.test/")) { captured.push({ url: u, body: String(init?.body ?? ""), headers: (init?.headers ?? {}) as Record<string, string> }); return new Response("ok", { status: 200 }); }
    return realFetch(url as Any, init as Any);
  }) as typeof fetch;
  const test = await call("POST", `/webhooks/${hookId}/test`, S, { event: "account.document.issued" });
  globalThis.fetch = realFetch;
  chk("D4-S6.6", "POST /webhooks/{id}/test → 200 {delivered 1} · ปลายทางได้รับ body.type + X-Shark-Signature", test.status === 200 && captured.length === 1 && JSON.parse(captured[0]!.body).type === "account.document.issued" && typeof captured[0]!.headers["X-Shark-Signature"] === "string", "1", `${test.status} ${JSON.stringify(test.body).slice(0, 120)} captured=${captured.length}`);
  const deliveries = await call("GET", `/webhooks/${hookId}/deliveries`, S);
  chk("D4-S6.7", "GET /webhooks/{id}/deliveries → data[{id,event,status OK,attempts,at,lastError}] ≥1", deliveries.status === 200 && deliveries.body?.data?.length >= 1 && deliveries.body.data[0].status === "OK", "≥1 OK", `${deliveries.status} ${JSON.stringify(deliveries.body?.data?.[0]).slice(0, 160)}`);
  const hookDel = await call("DELETE", `/webhooks/${hookId}`, S, { confirm: true, reason: "เลิกใช้ปลายทาง" });
  chk("D4-S6.8", "DELETE /webhooks/{id} (danger) → 200 · GET ว่าง", hookDel.status === 200 && (await call("GET", "/webhooks", S)).body?.data?.length === 0, "0", `${hookDel.status} ${code(hookDel)}`);
  const keys = await call("GET", "/api-keys", S);
  chk("D4-S6.9", "GET /api-keys → data[{id,name,prefix,scopes,bundleLabel,systemId,expiresAt,lastUsedAt,revoked}] ไม่มี keyHash", keys.status === 200 && keys.body?.data?.length >= 2 && keys.body.data.every((k: Any) => !("keyHash" in k) && typeof k.prefix === "string" && Array.isArray(k.scopes)), "ไม่มี hash", `${keys.status} ${JSON.stringify(keys.body?.data?.[0]).slice(0, 160)}`);
  const keyCreate = await call("POST", "/api-keys", S, { name: "x" });
  chk("D4-S6.10", "POST /api-keys → 404/405 (คีย์สร้างคีย์ไม่ได้ผ่าน API)", keyCreate.status === 404 || keyCreate.status === 405, "404/405", `${keyCreate.status}`);

  // ═══ S7 event ที่เหลือ (cheque/reconcile/period.reopened/asset/recurring) ═══
  const REST_EVENTS = ["account.cheque.changed", "account.reconcile.confirmed", "account.period.reopened", "account.asset.depreciated", "account.asset.disposed", "account.recurring.ran"];
  const labelValues = (labels.WEBHOOK_EVENTS as { value: string }[]).map((e) => e.value);
  const consumers = consumersMod.consumers as Record<string, unknown>;
  chk("D4-S7.1", "WEBHOOK_EVENTS + consumer ครบ 6 event ที่เหลือ", REST_EVENTS.every((e) => labelValues.includes(e) && typeof consumers[e] === "function"), "ครบ", REST_EVENTS.filter((e) => !labelValues.includes(e) || typeof consumers[e] !== "function").join(","));
  const allAccountEvents = labelValues.filter((v) => v.startsWith("account."));
  const md = (await import("node:fs")).readFileSync("docs/api/ACCOUNT-API.md", "utf8");
  chk("D4-S7.2", "คู่มือมี event บัญชีครบทุกตัวใน labels", allAccountEvents.every((e) => md.includes(e)), "ครบ", allAccountEvents.filter((e) => !md.includes(e)).join(","), "MAJOR");

  // ═══ S8 registry ═══
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const need: [string, string, string][] = [["settings.update", "write", "account.settings.manage"], ["settings.documents.update", "write", "account.settings.manage"], ["settings.documents.next-no", "write", "account.settings.manage"], ["settings.tags.create", "write", "account.settings.manage"], ["settings.policy.update", "write", "account.settings.manage"], ["settings.permissions.get", "read", "account.settings.manage"], ["settings.permissions.add-role", "write", "account.settings.manage"], ["settings.permissions.save-role", "write", "account.settings.manage"], ["settings.permissions.assign", "write", "account.settings.manage"], ["settings.permissions.set-cap", "write", "account.settings.manage"], ["settings.permissions.revoke", "danger", "account.settings.manage"], ["links.connect", "write", "account.settings.manage"], ["links.update", "write", "account.settings.manage"], ["links.disconnect", "danger", "account.settings.manage"], ["webhooks.list", "read", "account.settings.manage"], ["webhooks.create", "write", "account.settings.manage"], ["webhooks.update", "write", "account.settings.manage"], ["webhooks.delete", "danger", "account.settings.manage"], ["webhooks.test", "write", "account.settings.manage"], ["webhooks.deliveries", "read", "account.settings.manage"], ["api-keys.list", "read", "account.settings.manage"]];
  const bad = need.filter(([id, kind, action]) => { const o = ops.find((x) => x.id === id); return !o || o.kind !== kind || o.action !== action; });
  chk("D4-S8.1", "registry มี op ครบ 21 ตัวของ D4 · kind/action ตามสัญญา", bad.length === 0, "ครบ", bad.map(([id]) => id).join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  globalThis.fetch = realFetch;
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["webhookDelivery", "webhookEndpoint", "accountSystemLink", "accountDocTag", "accountJournalLine", "accountJournalEntry", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "membership", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, name: { in: ["เจ้าของ D4", "พนักงาน D4"] } } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API WRITE settings (D4) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
