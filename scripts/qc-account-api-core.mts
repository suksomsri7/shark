// QC — API บัญชี WO A3: แกน REST /api/v1/account/* (actor · scope · system · envelope · idempotency · danger · audit · rate limit · registry)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §A3
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// รัน: export DATABASE_URL/DIRECT_URL ของ .env.qc (grep|cut) แล้ว `pnpm exec tsx scripts/qc-account-api-core.mts`
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-core");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any; // จงใจ: oracle ล้ำหน้าโค้ด
const isThai = (s: unknown) => typeof s === "string" && /[ก-๙]/.test(s);
const isAscii = (s: unknown) => typeof s === "string" && /^[\x00-\x7F]+$/.test(s) && s.length > 0;

type Resp = { status: number; headers: Headers; body: Any };
let tidA = "";
let tidB = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string).catch(() => null)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>> | null;
  const registry = (await import("@/lib/modules/account/api/registry" as string).catch(() => null)) as Record<string, Any> | null;
  const respond = (await import("@/lib/modules/account/api/respond" as string).catch(() => null)) as Record<string, Any> | null;

  if (!route) chk("CORE-0.1", "มี src/app/api/v1/account/[...path]/route.ts", false, "มี", "ยังไม่สร้าง");
  if (!registry) chk("CORE-0.2", "มี src/lib/modules/account/api/registry.ts", false, "มี", "ยังไม่สร้าง");
  if (!respond) chk("CORE-0.3", "มี src/lib/modules/account/api/respond.ts", false, "มี", "ยังไม่สร้าง");
  if (!route || !registry || !respond) throw new Error("โครงยังไม่ครบ — หยุดข้อสอบที่เหลือ");

  // ── ร้าน A: บัญชี 2 เล่ม + POS · ร้าน B: บัญชี 1 เล่ม ──
  const tA = await prisma.tenant.create({ data: { name: "QC API Core A", slug: `qc-apicore-a-${Date.now()}` } });
  tidA = tA.id;
  const tB = await prisma.tenant.create({ data: { name: "QC API Core B", slug: `qc-apicore-b-${Date.now()}` } });
  tidB = tB.id;
  const accA = await sys.createSystem(tidA, "ACCOUNT", "บัญชี A");
  const accA2 = await sys.createSystem(tidA, "ACCOUNT", "บัญชี A2");
  const posA = await sys.createSystem(tidA, "POS", "POS A");
  const accB = await sys.createSystem(tidB, "ACCOUNT", "บัญชี B");
  const ctxA = { tenantId: tidA };
  const ctxB = { tenantId: tidB };
  const readOnly = scopes.expandBundles(["read-only"]) as string[];
  const issue = scopes.expandBundles(["issue-and-collect"]) as string[];

  const kRead = await ak.createApiKey(ctxA, "อ่านอย่างเดียว", { scopes: readOnly, systemId: accA.id });
  const kWrite = await ak.createApiKey(ctxA, "ออกเอกสาร", { scopes: issue, systemId: accA.id });
  const kDanger = await ak.createApiKey(ctxA, "อันตราย", { scopes: [...issue, "account.doc.void"], systemId: accA.id });
  const kUnbound = await ak.createApiKey(ctxA, "ระดับร้าน", { scopes: readOnly });
  const kLegacy = await ak.createApiKey(ctxA, "แบบเดิม");
  const kB = await ak.createApiKey(ctxB, "ร้าน B", { scopes: readOnly, systemId: accB.id });
  const kExpired = await ak.createApiKey(ctxA, "หมดอายุ", { scopes: readOnly, systemId: accA.id, expiresAt: new Date(Date.now() + 5_000) });
  await prisma.apiKey.update({ where: { id: kExpired.id }, data: { expiresAt: new Date(Date.now() - 1_000) } as Any });

  const call = async (
    method: string,
    path: string,
    opts: { key?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
  ): Promise<Resp> => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.key) headers.authorization = `Bearer ${opts.key}`;
    let body: string | undefined;
    if (opts.rawBody !== undefined) body = opts.rawBody;
    else if (opts.body !== undefined) body = JSON.stringify(opts.body);
    if (body !== undefined) headers["content-type"] = "application/json";
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const handler = route[method];
    if (!handler) return { status: -1, headers: new Headers(), body: { error: { code: `no_export_${method}` } } };
    const res = await handler(req, { params: Promise.resolve({ path: segs }) });
    let parsed: Any = null;
    const text = await res.text();
    try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  const code = (r: Resp) => r.body?.error?.code as string | undefined;
  const envelopeOk = (r: Resp) =>
    typeof r.body?.requestId === "string" && /^req_[0-9a-f]{16,}$/.test(r.body.requestId) && r.headers.get("x-request-id") === r.body.requestId;
  const errorOk = (r: Resp) =>
    envelopeOk(r) && typeof code(r) === "string" && isThai(r.body.error.message_th) && isAscii(r.body.error.message_en);
  const idem = () => ({ "idempotency-key": `idem-${Date.now()}-${Math.random().toString(16).slice(2)}` });

  // ═══ CORE-1 ตัวตน ═══
  const noKey = await call("GET", "/ping");
  chk("CORE-1.1", "ไม่มี Bearer → 401 unauthorized + envelope error (code/message_th/message_en/requestId + header X-Request-Id)", noKey.status === 401 && code(noKey) === "unauthorized" && errorOk(noKey), "401 unauthorized", `${noKey.status} ${JSON.stringify(noKey.body).slice(0, 160)}`);
  const badKey = await call("GET", "/ping", { key: "shark_" + "0".repeat(64) });
  chk("CORE-1.2", "คีย์ผิด → 401 unauthorized", badKey.status === 401 && code(badKey) === "unauthorized", "401", `${badKey.status} ${code(badKey)}`);
  const exp = await call("GET", "/ping", { key: kExpired.rawKey });
  chk("CORE-1.3", "คีย์หมดอายุ → 401 key_expired", exp.status === 401 && code(exp) === "key_expired", "401 key_expired", `${exp.status} ${code(exp)}`);

  // ═══ CORE-2 ping (read) ═══
  const ping = await call("GET", "/ping", { key: kRead.rawKey });
  chk("CORE-2.1", "GET /ping คีย์อ่าน (ผูกสมุด A) → 200 data.ok + data.systemId = A + envelope", ping.status === 200 && ping.body?.data?.ok === true && ping.body?.data?.systemId === accA.id && envelopeOk(ping), "200", `${ping.status} ${JSON.stringify(ping.body).slice(0, 160)}`);
  chk("CORE-2.2", "200 มี header X-RateLimit-Remaining เป็นตัวเลข", /^\d+$/.test(ping.headers.get("x-ratelimit-remaining") ?? ""), "ตัวเลข", `${ping.headers.get("x-ratelimit-remaining")}`, "MAJOR");
  chk("CORE-2.3", "response ไม่มี keyHash / rawKey / tenantId ของร้านหลุด", !/keyHash|shark_[0-9a-f]{20}/.test(JSON.stringify(ping.body)), "สะอาด", "หลุด");
  const echoId = await call("GET", "/echo/abc-123", { key: kRead.rawKey });
  chk("CORE-2.4", "GET /echo/{id} → params จาก template (data.id = abc-123)", echoId.status === 200 && echoId.body?.data?.id === "abc-123", "abc-123", `${echoId.status} ${JSON.stringify(echoId.body?.data)}`);

  // ═══ CORE-3 สมุดบัญชี (systemId) ═══
  const unbNo = await call("GET", "/ping", { key: kUnbound.rawKey });
  chk("CORE-3.1", "คีย์ระดับร้านไม่ส่ง X-Shark-System → 400 system_required", unbNo.status === 400 && code(unbNo) === "system_required", "400", `${unbNo.status} ${code(unbNo)}`);
  const unbA = await call("GET", "/ping", { key: kUnbound.rawKey, headers: { "x-shark-system": accA.id } });
  chk("CORE-3.2", "คีย์ระดับร้าน + header สมุด A → 200 systemId = A", unbA.status === 200 && unbA.body?.data?.systemId === accA.id, "200 A", `${unbA.status}`);
  const unbB = await call("GET", "/ping", { key: kUnbound.rawKey, headers: { "x-shark-system": accB.id } });
  chk("CORE-3.3", "คีย์ร้าน A + header สมุดของร้าน B → 403 system_mismatch (ไม่ใช่ 404 ไม่ใช่ 200)", unbB.status === 403 && code(unbB) === "system_mismatch", "403", `${unbB.status} ${code(unbB)}`);
  const unbPos = await call("GET", "/ping", { key: kUnbound.rawKey, headers: { "x-shark-system": posA.id } });
  chk("CORE-3.4", "header ชี้ระบบ POS (ไม่ใช่ ACCOUNT) → 403 system_mismatch", unbPos.status === 403 && code(unbPos) === "system_mismatch", "403", `${unbPos.status} ${code(unbPos)}`);
  const boundOther = await call("GET", "/ping", { key: kRead.rawKey, headers: { "x-shark-system": accA2.id } });
  chk("CORE-3.5", "คีย์ผูกสมุด A ส่ง header สมุด A2 (ร้านเดียวกัน) → 403 system_mismatch (คีย์ผูกแล้วเปลี่ยนไม่ได้)", boundOther.status === 403 && code(boundOther) === "system_mismatch", "403", `${boundOther.status} ${code(boundOther)}`);
  const boundSame = await call("GET", "/ping", { key: kRead.rawKey, headers: { "x-shark-system": accA.id } });
  chk("CORE-3.6", "คีย์ผูกสมุด A ส่ง header สมุด A (ตรงกัน) → 200", boundSame.status === 200, "200", `${boundSame.status}`, "MINOR");
  const bOk = await call("GET", "/ping", { key: kB.rawKey });
  chk("CORE-3.7", "คีย์ร้าน B → 200 systemId = B", bOk.status === 200 && bOk.body?.data?.systemId === accB.id, "200 B", `${bOk.status}`);

  // ═══ CORE-4 scope ═══
  const roWrite = await call("POST", "/echo", { key: kRead.rawKey, body: { text: "x" }, headers: idem() });
  chk("CORE-4.1", "คีย์อ่านอย่างเดียว POST /echo → 403 scope_missing + hint บอก scope ที่ขาด", roWrite.status === 403 && code(roWrite) === "scope_missing" && /account\.doc\.create/.test(String(roWrite.body?.error?.hint ?? "")), "403 + hint", `${roWrite.status} ${JSON.stringify(roWrite.body?.error).slice(0, 160)}`);
  const legacy = await call("GET", "/ping", { key: kLegacy.rawKey, headers: { "x-shark-system": accA.id } });
  chk("CORE-4.2", "คีย์แบบเดิม (scopes []) → 403 scope_missing (คีย์เก่าไม่ได้สิทธิ์บัญชีอัตโนมัติ)", legacy.status === 403 && code(legacy) === "scope_missing", "403", `${legacy.status} ${code(legacy)}`);
  const wr = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "hello", amountSatang: 12345 }, headers: idem() });
  chk("CORE-4.3", "คีย์ออกเอกสาร POST /echo → 200 data.echo = body + data.nonce", wr.status === 200 && wr.body?.data?.echo?.text === "hello" && wr.body?.data?.echo?.amountSatang === 12345 && typeof wr.body?.data?.nonce === "string", "200 echo", `${wr.status} ${JSON.stringify(wr.body).slice(0, 160)}`);
  // IMPLIES: คีย์ที่มี doc.create ย่อมอ่านได้แม้ไม่มี doc.view ในรายการ (ตาราง IMPLIES ของ access.ts)
  const kCreateOnly = await ak.createApiKey(ctxA, "create เท่านั้น", { scopes: ["account.doc.create"], systemId: accA.id });
  const impl = await call("GET", "/ping", { key: kCreateOnly.rawKey });
  chk("CORE-4.4", "scope account.doc.create อย่างเดียว → GET /ping (doc.view) ผ่านด้วย IMPLIES", impl.status === 200, "200", `${impl.status} ${code(impl)}`, "MAJOR");

  // ═══ CORE-5 validation ═══
  const badJson = await call("POST", "/echo", { key: kWrite.rawKey, rawBody: "{not json", headers: idem() });
  chk("CORE-5.1", "body ไม่ใช่ JSON → 400 invalid_json", badJson.status === 400 && code(badJson) === "invalid_json", "400", `${badJson.status} ${code(badJson)}`);
  const missing = await call("POST", "/echo", { key: kWrite.rawKey, body: { amountSatang: 1 }, headers: idem() });
  chk("CORE-5.2", "ขาด field บังคับ → 422 validation + details[] ระบุ path", missing.status === 422 && code(missing) === "validation" && Array.isArray(missing.body?.error?.details) && JSON.stringify(missing.body.error.details).includes("text"), "422 details", `${missing.status} ${JSON.stringify(missing.body?.error).slice(0, 200)}`);
  const extra = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "x", tenantId: tidB, extra: 1 }, headers: idem() });
  chk("CORE-5.3", "field เกิน (tenantId/extra) → 422 validation (strict — ไม่รับ tenantId จาก body)", extra.status === 422 && code(extra) === "validation", "422", `${extra.status} ${code(extra)}`);
  const neg = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "x", amountSatang: -1 }, headers: idem() });
  chk("CORE-5.4", "amountSatang ติดลบ → 422", neg.status === 422, "422", `${neg.status}`);
  const frac = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "x", amountSatang: 10.5 }, headers: idem() });
  chk("CORE-5.5", "amountSatang ทศนิยม → 422 (สตางค์ต้องเป็นจำนวนเต็ม)", frac.status === 422, "422", `${frac.status}`);

  // ═══ CORE-6 idempotency ═══
  const noIdem = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "x" } });
  chk("CORE-6.1", "write ไม่ส่ง Idempotency-Key → 400 idempotency_required", noIdem.status === 400 && code(noIdem) === "idempotency_required", "400", `${noIdem.status} ${code(noIdem)}`);
  const k1 = idem();
  const first = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "same" }, headers: k1 });
  const replay = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "same" }, headers: k1 });
  chk("CORE-6.2", "ซ้ำ key+body เดิม → 200 เดิม (nonce เดียวกัน) + header Idempotent-Replayed: true", first.status === 200 && replay.status === 200 && first.body?.data?.nonce === replay.body?.data?.nonce && replay.headers.get("idempotent-replayed") === "true" && first.headers.get("idempotent-replayed") !== "true", "replay", `${first.status}/${replay.status} ${first.body?.data?.nonce}/${replay.body?.data?.nonce} hdr=${replay.headers.get("idempotent-replayed")}`);
  const conflict = await call("POST", "/echo", { key: kWrite.rawKey, body: { text: "different" }, headers: k1 });
  chk("CORE-6.3", "key เดิม body ต่าง → 409 idempotency_conflict", conflict.status === 409 && code(conflict) === "idempotency_conflict", "409", `${conflict.status} ${code(conflict)}`);
  const k2 = idem();
  const [ra, rb] = await Promise.all([
    call("POST", "/echo", { key: kWrite.rawKey, body: { text: "race" }, headers: k2 }),
    call("POST", "/echo", { key: kWrite.rawKey, body: { text: "race" }, headers: k2 }),
  ]);
  const raceOk = [ra, rb].every((r) => r.status === 200 || (r.status === 409 && code(r) === "idempotency_in_progress")) && [ra, rb].some((r) => r.status === 200) && (ra.status !== 200 || rb.status !== 200 || ra.body?.data?.nonce === rb.body?.data?.nonce);
  chk("CORE-6.4", "ยิงพร้อมกัน key เดียว → ทำจริงครั้งเดียว (200 คู่ nonce เดียวกัน หรือ 200+409 in_progress)", raceOk, "ครั้งเดียว", `${ra.status}/${rb.status} ${ra.body?.data?.nonce}/${rb.body?.data?.nonce}`);
  // idempotency แยกต่อคีย์: คีย์อื่นใช้ Idempotency-Key ค่าเดียวกันได้ ไม่ชนกัน
  const kDangerEcho = await call("POST", "/echo", { key: kDanger.rawKey, body: { text: "same" }, headers: k1 });
  chk("CORE-6.5", "Idempotency-Key ค่าเดียวกันแต่คนละคีย์ API → ไม่ชน (200 ใหม่ nonce ต่าง)", kDangerEcho.status === 200 && kDangerEcho.body?.data?.nonce !== first.body?.data?.nonce, "200 ใหม่", `${kDangerEcho.status}`);
  const idemRows = await prisma.$queryRawUnsafe(`SELECT "keyId","idemKey","status","expiresAt" FROM "ApiIdempotency" WHERE "tenantId" = $1`, tidA) as { keyId: string; idemKey: string; status: number | null; expiresAt: Date }[];
  const rowK1 = idemRows.find((r) => r.keyId === kWrite.id && r.idemKey === k1["idempotency-key"]);
  chk("CORE-6.6", "แถว ApiIdempotency ของ key เดิม: status 200 · หมดอายุ ~24 ชม.", !!rowK1 && rowK1.status === 200 && Math.abs(rowK1.expiresAt.getTime() - Date.now() - 24 * 3_600_000) < 10 * 60_000, "200/24h", JSON.stringify(rowK1));
  const idemGet = await call("GET", "/ping", { key: kRead.rawKey, headers: idem() });
  chk("CORE-6.7", "GET ส่ง Idempotency-Key มาด้วยก็ไม่เก็บแถว (read ไม่ idempotency)", idemGet.status === 200 && !idemRows.some((r) => r.keyId === kRead.id), "ไม่เก็บ", "?", "MINOR");

  // ═══ CORE-7 danger ═══
  const dNoScope = await call("POST", "/danger-echo", { key: kWrite.rawKey, body: { confirm: true, reason: "ทดสอบยกเลิก" }, headers: idem() });
  chk("CORE-7.1", "danger op คีย์ไม่มี account.doc.void → 403 scope_missing", dNoScope.status === 403 && code(dNoScope) === "scope_missing", "403", `${dNoScope.status} ${code(dNoScope)}`);
  const dNoConfirm = await call("POST", "/danger-echo", { key: kDanger.rawKey, body: { reason: "ทดสอบยกเลิก" }, headers: idem() });
  chk("CORE-7.2", "danger ไม่มี confirm:true → 409 confirm_required", dNoConfirm.status === 409 && code(dNoConfirm) === "confirm_required", "409", `${dNoConfirm.status} ${code(dNoConfirm)}`);
  const dFalse = await call("POST", "/danger-echo", { key: kDanger.rawKey, body: { confirm: "true", reason: "ทดสอบยกเลิก" }, headers: idem() });
  chk("CORE-7.3", "confirm เป็นสตริง \"true\" → ไม่นับ (409 หรือ 422)", dFalse.status === 409 || dFalse.status === 422, "409/422", `${dFalse.status}`);
  const dShort = await call("POST", "/danger-echo", { key: kDanger.rawKey, body: { confirm: true, reason: "ab" }, headers: idem() });
  chk("CORE-7.4", "reason สั้นกว่า 5 ตัว → 422 validation", dShort.status === 422 && code(dShort) === "validation", "422", `${dShort.status} ${code(dShort)}`);
  const dOk = await call("POST", "/danger-echo", { key: kDanger.rawKey, body: { confirm: true, reason: "ทดสอบยกเลิก" }, headers: idem() });
  chk("CORE-7.5", "danger ครบ (scope+confirm+reason) → 200 data.reason", dOk.status === 200 && dOk.body?.data?.reason === "ทดสอบยกเลิก", "200", `${dOk.status} ${JSON.stringify(dOk.body).slice(0, 120)}`);

  // ═══ CORE-8 audit ═══
  const audits = await prisma.auditLog.findMany({ where: { tenantId: tidA }, orderBy: { createdAt: "asc" } });
  const apiAudits = audits.filter((a) => (a.actorType as string) === "API_KEY");
  const echoAudit = apiAudits.find((a) => a.actorId === kWrite.id && a.action === "account.doc.create");
  const dangerAudit = apiAudits.find((a) => a.actorId === kDanger.id && a.action === "account.doc.void");
  chk("CORE-8.1", "ทุก write ที่สำเร็จมี AuditLog actorType API_KEY · actorId = keyId · action = op.action", !!echoAudit && !!dangerAudit, "มีทั้ง echo และ danger", `${apiAudits.length} แถว: ${apiAudits.map((a) => a.action).join(",")}`);
  const after = (echoAudit?.after ?? {}) as Record<string, unknown>;
  chk("CORE-8.2", "audit.after มี keyName + opId + requestId", after.keyName === "ออกเอกสาร" && after.opId === "echo" && typeof after.requestId === "string", "ครบ", JSON.stringify(after).slice(0, 160), "MAJOR");
  const dAfter = (dangerAudit?.after ?? {}) as Record<string, unknown>;
  chk("CORE-8.3", "audit ของ danger เก็บ reason", dAfter.reason === "ทดสอบยกเลิก", "reason", JSON.stringify(dAfter).slice(0, 120), "MAJOR");
  // จำนวน audit ของ echo ที่สำเร็จ: first(1) + replay(0) + race(1) + kDangerEcho(1 บน kDanger) + wr(1) = kWrite มี 3 · replay ต้องไม่เพิ่ม
  const echoCount = apiAudits.filter((a) => a.actorId === kWrite.id && (a.after as Any)?.opId === "echo").length;
  chk("CORE-8.4", "replay/ปฏิเสธ ไม่สร้าง audit (kWrite echo สำเร็จ = 3 แถว: wr · first · race)", echoCount === 3, "3", `${echoCount}`, "MAJOR");
  const readAudit = apiAudits.filter((a) => a.actorId === kRead.id).length;
  chk("CORE-8.5", "read ไม่เขียน audit", readAudit === 0, "0", `${readAudit}`, "MINOR");

  // ═══ CORE-9 routing ═══
  const nf = await call("GET", "/nope", { key: kRead.rawKey });
  chk("CORE-9.1", "path ไม่มีในทะเบียน → 404 not_found envelope", nf.status === 404 && code(nf) === "not_found" && errorOk(nf), "404", `${nf.status} ${code(nf)}`);
  const mna = await call("POST", "/ping", { key: kWrite.rawKey, body: {}, headers: idem() });
  chk("CORE-9.2", "path มีแต่ method ไม่ตรง → 405 method_not_allowed + header Allow", mna.status === 405 && code(mna) === "method_not_allowed" && /GET/.test(mna.headers.get("allow") ?? ""), "405 Allow: GET", `${mna.status} ${code(mna)} allow=${mna.headers.get("allow")}`, "MAJOR");
  const trailing = await call("GET", "/ping/", { key: kRead.rawKey });
  chk("CORE-9.3", "trailing slash → ยังจับคู่ /ping ได้", trailing.status === 200, "200", `${trailing.status}`, "MINOR");
  for (const m of ["GET", "POST", "PATCH", "PUT", "DELETE"]) chk(`CORE-9.4.${m}`, `route export ${m}`, typeof route[m] === "function", "function", typeof route[m], "MAJOR");

  // ═══ CORE-10 registry ═══
  const ops = registry.ACCOUNT_OPS as Any[];
  chk("CORE-10.1", "ACCOUNT_OPS เป็น array มี ping/echo/echo-by-id/danger-echo", Array.isArray(ops) && ["ping", "echo", "echo-by-id", "danger-echo"].every((id) => ops.some((o) => o.id === id)), "4 op", ops?.map((o) => o.id).join(","));
  const shapeBad = ops.filter((o) => !(typeof o.id === "string" && /^(GET|POST|PATCH|PUT|DELETE)$/.test(o.method) && typeof o.path === "string" && o.path.startsWith("/") && /^(read|write|danger)$/.test(o.kind) && typeof o.action === "string" && o.action.startsWith("account.") && isAscii(o.summary) && isThai(o.label) && typeof o.test === "string" && o.test.length > 0 && typeof o.handler === "function"));
  chk("CORE-10.2", "ทุก op มี id/method/path/kind/action(account.*)/summary(EN)/label(TH)/test/handler", shapeBad.length === 0, "ครบ", shapeBad.map((o) => o.id).join(","));
  const ids = ops.map((o) => o.id);
  const routesKey = ops.map((o) => `${o.method} ${o.path}`);
  chk("CORE-10.3", "id และ method+path ไม่ซ้ำ", new Set(ids).size === ids.length && new Set(routesKey).size === routesKey.length, "ไม่ซ้ำ", "ซ้ำ");
  const m1 = registry.matchOp("GET", ["echo", "xyz"]);
  const m2 = registry.matchOp("GET", ["documents", "d1", "issue"]);
  chk("CORE-10.4", "matchOp คืน op + params จาก template · path ที่ไม่มี → null", m1?.op?.id === "echo-by-id" && m1?.params?.id === "xyz" && m2 === null, "echo-by-id {id:xyz} · null", JSON.stringify({ m1: m1?.op?.id, p: m1?.params, m2 }));
  const dangerOp = ops.find((o) => o.id === "danger-echo");
  chk("CORE-10.5", "danger-echo kind=danger action=account.doc.void · echo kind=write action=account.doc.create · ping kind=read action=account.doc.view", dangerOp?.kind === "danger" && dangerOp?.action === "account.doc.void" && ops.find((o) => o.id === "echo")?.kind === "write" && ops.find((o) => o.id === "ping")?.action === "account.doc.view", "ตรง", "?");

  // ═══ CORE-11 mapError ═══
  const mapError = respond.mapError as (e: unknown) => { status: number; code: string; message_th: string; message_en: string };
  const cases: [string, unknown, number, string][] = [
    ["ปิดงวด", new Error("งวดบัญชี 2026-08 ปิดแล้ว ไม่สามารถลงรายการได้"), 409, "period_locked"],
    ["ล็อกวันที่", new Error("ข้อมูลก่อนวันที่ 1 ส.ค. 2569 ถูกล็อกไว้"), 409, "period_locked"],
    ["ไม่ใช่ร่าง", new Error("แก้ไขได้เฉพาะเอกสารที่เป็นร่าง"), 409, "state_conflict"],
    ["ซ้ำ", new Error("เลขผู้เสียภาษีนี้ซ้ำกับผู้ติดต่อเดิม"), 409, "duplicate"],
    ["ไม่พบ", new Error("ไม่พบเอกสาร"), 404, "not_found"],
    ["ไม่มีสิทธิ์", new Error("ไม่มีสิทธิ์ทำรายการนี้"), 403, "forbidden"],
  ];
  for (const [name, err, st, cd] of cases) {
    const r = mapError(err);
    chk(`CORE-11.${cd}`, `mapError "${name}" → ${st} ${cd} + message_th ไทย + message_en ascii`, r.status === st && r.code === cd && isThai(r.message_th) && isAscii(r.message_en), `${st} ${cd}`, `${r.status} ${r.code}`);
  }
  const eng = mapError(new Error("PrismaClientKnownRequestError: Unique constraint failed on the fields: (`keyHash`)"));
  chk("CORE-11.leak", "error อังกฤษ/ภายใน → 422 unprocessable · message_th ไทยกลาง (ไม่รั่วข้อความดิบ)", eng.status === 422 && eng.code === "unprocessable" && isThai(eng.message_th) && !/Prisma|keyHash/.test(eng.message_th + eng.message_en), "422 กลาง", `${eng.status} ${eng.code} ${eng.message_th}`);
  const zodErr = mapError(Object.assign(new Error("zod"), { name: "ZodError", issues: [{ path: ["text"], message: "Required" }] }));
  chk("CORE-11.zod", "ZodError → 422 validation", zodErr.status === 422 && zodErr.code === "validation", "422 validation", `${zodErr.status} ${zodErr.code}`);

  // ═══ CORE-12 rate limit (DB · ต่อคีย์ · read 300/นาที) ═══
  const kRate = await ak.createApiKey(ctxA, "rate", { scopes: readOnly, systemId: accA.id });
  let got429: Resp | null = null;
  let okBefore = 0;
  for (let i = 0; i < 320; i++) {
    const r = await call("GET", "/ping", { key: kRate.rawKey });
    if (r.status === 429) { got429 = r; break; }
    okBefore++;
  }
  chk("CORE-12.1", "อ่านเกิน 300/นาที/คีย์ → 429 rate_limited + Retry-After (ผ่านก่อนหน้า 300 พอดี)", !!got429 && code(got429) === "rate_limited" && /^\d+$/.test(got429.headers.get("retry-after") ?? "") && okBefore === 300, "429 หลัง 300", `429=${!!got429} ok=${okBefore} retry=${got429?.headers.get("retry-after")}`);
  const otherStillOk = await call("GET", "/ping", { key: kRead.rawKey });
  chk("CORE-12.2", "เพดานแยกต่อคีย์ — คีย์อื่นยังเรียกได้", otherStillOk.status === 200, "200", `${otherStillOk.status}`);
  const bucket = await prisma.$queryRawUnsafe(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, `%${kRate.id}%`) as { key: string; count: number }[];
  chk("CORE-12.3", "ตัวนับอยู่บน DB (ChatRateBucket) ไม่ใช่ Map ในโปรเซส", bucket.length >= 1 && bucket[0]!.count >= 300, "แถวบน DB", JSON.stringify(bucket).slice(0, 120));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 220) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const tid of [tidA, tidB]) {
    if (!tid) continue;
    for (const m of ["apiIdempotency", "apiKey", "auditLog", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API Core (A3) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
