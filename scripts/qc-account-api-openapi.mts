// QC — API บัญชี WO A4: OpenAPI generator + /api/v1/account/openapi.json + gen docs + fitness F13
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §A4
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// รัน: export env ของ .env.qc (grep|cut) แล้ว `pnpm exec tsx scripts/qc-account-api-openapi.mts` (ไม่แตะ DB — env ไว้กัน guard)
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-openapi");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const isAscii = (s: unknown) => typeof s === "string" && /^[\x00-\x7F]+$/.test(s) && s.length > 0;

try {
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const oa = (await import("@/lib/modules/account/api/openapi" as string).catch(() => null)) as Record<string, Any> | null;
  if (!oa) { chk("OA-0", "มี src/lib/modules/account/api/openapi.ts", false, "มี", "ยังไม่สร้าง"); throw new Error("stop"); }
  const ops = registry.ACCOUNT_OPS as Any[];
  const spec = oa.buildOpenApi(ops) as Any;

  // ═══ OA-1 โครงเอกสาร ═══
  chk("OA-1.1", "openapi 3.1.x + info.title/version + servers[0] = https://shark.in.th/api/v1/account",
    /^3\.1\./.test(spec?.openapi ?? "") && typeof spec?.info?.title === "string" && typeof spec?.info?.version === "string" && spec?.servers?.[0]?.url === "https://shark.in.th/api/v1/account",
    "3.1 + servers", JSON.stringify({ v: spec?.openapi, s: spec?.servers }).slice(0, 120));
  chk("OA-1.2", "securitySchemes.bearer (http bearer) + security ระดับเอกสาร", spec?.components?.securitySchemes?.bearer?.type === "http" && spec.components.securitySchemes.bearer.scheme === "bearer" && Array.isArray(spec?.security) && spec.security.some((s: Any) => "bearer" in s), "bearer", JSON.stringify(spec?.components?.securitySchemes).slice(0, 120));
  const errSchema = spec?.components?.schemas?.Error;
  chk("OA-1.3", "components.schemas.Error = { error: { code, message_th, message_en, hint?, details? }, requestId }",
    !!errSchema && !!errSchema.properties?.error?.properties?.code && !!errSchema.properties?.error?.properties?.message_th && !!errSchema.properties?.error?.properties?.message_en && !!errSchema.properties?.requestId,
    "Error schema", JSON.stringify(errSchema).slice(0, 160));
  const codes = (errSchema?.properties?.error?.properties?.code?.enum ?? []) as string[];
  const mustCodes = ["unauthorized", "key_expired", "system_required", "system_mismatch", "scope_missing", "invalid_json", "validation", "idempotency_required", "idempotency_conflict", "idempotency_in_progress", "confirm_required", "not_found", "method_not_allowed", "rate_limited", "period_locked", "state_conflict", "duplicate", "forbidden", "unprocessable"];
  chk("OA-1.4", "Error.code enum ครบทุก code ในสัญญา", mustCodes.every((c) => codes.includes(c)), `${mustCodes.length} codes`, mustCodes.filter((c) => !codes.includes(c)).join(","), "MAJOR");
  chk("OA-1.5", "info.description เป็นอังกฤษ (คู่มือหลักอังกฤษ) และพูดถึง satang + Idempotency-Key + X-Shark-System",
    isAscii(spec?.info?.description) && /satang/i.test(spec.info.description) && /Idempotency-Key/.test(spec.info.description) && /X-Shark-System/.test(spec.info.description), "EN + 3 คำ", String(spec?.info?.description).slice(0, 120), "MAJOR");

  // ═══ OA-2 ต่อ op ═══
  const toOaPath = (p: string) => p; // template {id} ใช้รูปเดียวกับ OpenAPI อยู่แล้ว
  let missing: string[] = [];
  let badMeta: string[] = [];
  let badSec: string[] = [];
  let badResp: string[] = [];
  for (const op of ops) {
    const item = spec?.paths?.[toOaPath(op.path)]?.[String(op.method).toLowerCase()];
    if (!item) { missing.push(op.id); continue; }
    if (item.operationId !== op.id || item["x-shark-kind"] !== op.kind || item["x-shark-scope"] !== op.action || !isAscii(item.summary) || (op.tool && item["x-shark-tool"] !== op.tool.name)) badMeta.push(op.id);
    if (!Array.isArray(item.security) || !item.security.some((s: Any) => "bearer" in s)) badSec.push(op.id);
    const r200 = item.responses?.["200"]?.content?.["application/json"]?.schema;
    const r401 = item.responses?.["401"];
    if (!r200 || !r401) badResp.push(op.id);
  }
  chk("OA-2.1", "ทุก op ใน ACCOUNT_OPS มี path+method ใน spec", missing.length === 0, "ครบ", missing.join(","));
  chk("OA-2.2", "operationId = id · x-shark-kind · x-shark-scope · x-shark-tool · summary EN", badMeta.length === 0, "ครบ", badMeta.join(","));
  chk("OA-2.3", "ทุก op ประกาศ security bearer", badSec.length === 0, "ครบ", badSec.join(","), "MAJOR");
  chk("OA-2.4", "ทุก op มี responses 200 (schema) + 401 (Error)", badResp.length === 0, "ครบ", badResp.join(","), "MAJOR");
  const echo = spec?.paths?.["/echo"]?.post;
  const echoSchema = echo?.requestBody?.content?.["application/json"]?.schema;
  chk("OA-2.5", "POST /echo มี requestBody จาก zod: properties.text (string) + amountSatang (integer) + additionalProperties false + required [text]",
    echoSchema?.properties?.text?.type === "string" && echoSchema?.properties?.amountSatang?.type === "integer" && echoSchema?.additionalProperties === false && JSON.stringify(echoSchema?.required) === JSON.stringify(["text"]),
    "schema ตรง", JSON.stringify(echoSchema).slice(0, 200));
  chk("OA-2.6", "POST /echo ประกาศ header parameter Idempotency-Key (required)", (echo?.parameters ?? []).some((p: Any) => p.in === "header" && p.name === "Idempotency-Key" && p.required === true), "มี", JSON.stringify(echo?.parameters).slice(0, 160), "MAJOR");
  const danger = spec?.paths?.["/danger-echo"]?.post;
  const dSchema = danger?.requestBody?.content?.["application/json"]?.schema;
  chk("OA-2.7", "danger op: body schema มี confirm (boolean, const/enum true) + reason (minLength 5) ใน required", !!dSchema?.properties?.confirm && !!dSchema?.properties?.reason && (dSchema?.required ?? []).includes("confirm") && (dSchema?.required ?? []).includes("reason") && (dSchema.properties.reason.minLength ?? 0) >= 5, "confirm+reason", JSON.stringify(dSchema).slice(0, 200));
  chk("OA-2.8", "danger op responses มี 409 (confirm_required)", !!danger?.responses?.["409"], "409", JSON.stringify(Object.keys(danger?.responses ?? {})), "MAJOR");
  const byId = spec?.paths?.["/echo/{id}"]?.get;
  chk("OA-2.9", "GET /echo/{id} มี path parameter id (required, in path)", (byId?.parameters ?? []).some((p: Any) => p.in === "path" && p.name === "id" && p.required === true), "มี", JSON.stringify(byId?.parameters).slice(0, 120));
  chk("OA-2.10", "GET op ประกาศ header X-Shark-System (optional)", (spec?.paths?.["/ping"]?.get?.parameters ?? []).some((p: Any) => p.in === "header" && p.name === "X-Shark-System" && p.required !== true), "มี", "ไม่มี", "MINOR");
  chk("OA-2.11", "spec ไม่มี handler/function หลุด (serializable) และไม่มีข้อมูลร้าน (cuid)", (() => { try { const s = JSON.stringify(spec); return !/"handler"/.test(s) && !/c[a-z0-9]{24}/.test(s); } catch { return false; } })(), "สะอาด", "หลุด");

  // ═══ OA-3 route /openapi.json (ไม่ต้องใช้คีย์) ═══
  const routeMod = (await import("@/app/api/v1/account/openapi.json/route" as string).catch(() => null)) as { GET: (r: Request) => Promise<Response> } | null;
  if (!routeMod) chk("OA-3.1", "มี route src/app/api/v1/account/openapi.json/route.ts", false, "มี", "ยังไม่สร้าง");
  else {
    const r = await routeMod.GET(new Request("http://x/api/v1/account/openapi.json"));
    const body = (await r.json()) as Any;
    chk("OA-3.1", "GET /openapi.json ไม่ต้องใช้คีย์ → 200 JSON openapi 3.1 + Cache-Control", r.status === 200 && /^3\.1\./.test(body?.openapi ?? "") && /max-age/.test(r.headers.get("cache-control") ?? ""), "200", `${r.status} ${r.headers.get("cache-control")}`);
    chk("OA-3.2", "ผลจาก route เท่ากับ buildOpenApi (แหล่งเดียว)", JSON.stringify(body) === JSON.stringify(JSON.parse(JSON.stringify(spec))), "เท่ากัน", "ต่าง");
    // catch-all ต้องไม่กิน path นี้: GET /openapi.json ผ่าน catch-all ไม่ควรถูกเรียก — ตรวจว่า registry ไม่มี op ชื่อนี้
    chk("OA-3.3", "registry ไม่มี op ที่ path ชน /openapi.json", !ops.some((o) => /openapi/.test(o.path)), "ไม่มี", "มี", "MINOR");
  }

  // ═══ OA-4 docs generator ═══
  const docPath = "docs/api/ACCOUNT-API.md";
  chk("OA-4.1", "มี docs/api/ACCOUNT-API.md", existsSync(docPath), "มี", "ไม่มี");
  if (existsSync(docPath)) {
    const md = readFileSync(docPath, "utf8");
    const missDoc = ops.filter((o) => !md.includes(`${o.method} ${o.path}`) || !md.includes(o.action));
    chk("OA-4.2", "เอกสารมี `METHOD path` + scope ของทุก op", missDoc.length === 0, "ครบ", missDoc.map((o) => o.id).join(","));
    chk("OA-4.3", "เอกสารเป็นอังกฤษเป็นหลัก (บรรทัดแรก ๆ ไม่มีไทย) + มี glossary ไทย + Idempotency-Key + satang + X-Shark-System",
      !/[ก-๙]/.test(md.split("\n").slice(0, 5).join("\n")) && /Idempotency-Key/.test(md) && /satang/i.test(md) && /X-Shark-System/.test(md) && /[ก-๙]/.test(md),
      "EN + glossary", md.slice(0, 80).replace(/\n/g, " "), "MAJOR");
    chk("OA-4.4", "เอกสารมีหัวข้อ error codes ครบ", mustCodes.every((c) => md.includes(c)), "ครบ", mustCodes.filter((c) => !md.includes(c)).join(","), "MAJOR");
    const check = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-account-api-docs.mts", "--check"], { encoding: "utf8", env: process.env, timeout: 120_000 });
    chk("OA-4.5", "`gen-account-api-docs.mts --check` = 0 (ไฟล์ตรงกับ generator ไม่ stale)", check.status === 0, "exit 0", `exit ${check.status} ${(check.stdout + check.stderr).slice(-200).replace(/\n/g, " ")}`);
  }

  // ═══ OA-5 fitness F13 ═══
  const fit = readFileSync("scripts/fitness.mts", "utf8");
  chk("OA-5.1", "fitness.mts มีด่าน F13 (ทะเบียน API บัญชี)", /F13\.1/.test(fit) && /ACCOUNT_OPS|api\/registry/.test(fit), "มี", "ไม่มี");
  const testsSrc = ["scripts/qc-account-api-core.mts", "scripts/qc-account-api-keys.mts", "scripts/qc-account-api-openapi.mts"].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
  const noTest = ops.filter((o) => !o.test || !testsSrc.includes(`"${o.test}"`));
  chk("OA-5.2", "ทุก op มี test id ที่ปรากฏจริงในสคริปต์ qc-account-api-*.mts", noTest.length === 0, "ครบ", noTest.map((o) => `${o.id}:${o.test}`).join(","));
} catch (e) {
  if (!(e instanceof Error && e.message === "stop")) chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e));
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API OpenAPI (A4) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
