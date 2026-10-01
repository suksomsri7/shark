// QC POS P0.2 — ทะเบียน op ของ POS (โครง): static + unit · **ไม่เขียน DB เลย** (อ่านอย่างเดียว)
// requires: QC DB ใดก็ได้ (อ่านแถว PosSale/AppSystemUnit ที่มีอยู่แล้วเพื่อทดสอบด่านข้ามร้าน — ไม่มีแถว = SKIP เฉพาะข้อนั้น)
// รัน: bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/qc-pos-p0.2.mts
//
// ตรวจ:
//   S1 ทะเบียนโหลดได้ · id ไม่ซ้ำ · ทุก op มี scope/คำอธิบาย/ป้ายไทย/test id · module=pos · write/danger มี input schema
//   S2 scope ทุกตัวเป็น permission key จริงของโมดูล pos · ยังไม่มี bundle POS ใน API_SCOPE_BUNDLES (เลื่อนไป P2.13)
//   S3 ตาราง tool เดิม ↔ op ครบเท่าสกิล `sales` พอดี · op ทุกตัวมีแถว · ไม่มี op ไหนประกาศ `tool` (มติข้อ 1) ·
//      tool เดิมทั้ง 6 ยังอยู่ในทะเบียน tool + assertSkillRegistryComplete ผ่าน (พฤติกรรม AI ไม่เปลี่ยน)
//   S4 matchOp/allowedMethods/matchOpIn ใช้กับทะเบียนนี้ได้ · ไม่มี route ใต้ src/app/api/v1/pos (โครงเท่านั้น)
//   S5 schema: strict (กัน tenantId ปลอม) · เงินเป็นจำนวนเต็มสตางค์ · วิธีจ่ายภายใน (DEPOSIT) ถูกปัด · danger ต้องมีเหตุผล
//   S6 ด่าน id (อ่านอย่างเดียว): unitId/saleId ของร้านอื่นหรือระบบอื่น = 404 · บิลที่ไม่ใช่ PAID = 409 · ไม่มีสิทธิ์ = 403
//   S7 op อ่าน: สรุปยอดของระบบที่ไม่มีบิล = 0 · ช่วงวันถูกต้อง (วันไทย รวมวันนี้)

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";

loadLegacyQcEnv("qc-pos-p0.2"); // 🔴 กัน prod: ใช้ QC_ENV_FILE ที่ qc4.sh ตั้งให้

const { prisma } = await import("@/lib/core/db");
const reg = await import("@/lib/modules/pos/api/registry");
const { matchOpIn, allowedMethodsIn } = await import("@/lib/api/dispatch");
const { runOpAsActor, validateOpInput } = await import("@/lib/api/run");
const { ApiError } = await import("@/lib/api/respond");
const { membershipFromScopes } = await import("@/lib/api/actor");
const { isPermissionKey } = await import("@/lib/core/permissions");
const { API_SCOPE_BUNDLES } = await import("@/lib/api-keys/scopes");
const { SKILLS, assertSkillRegistryComplete } = await import("@/lib/ai/skills");
const { toolRegistry } = await import("@/lib/ai/tools");
const { bkkToday } = await import("@/lib/modules/pos");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
function skip(id: string, name: string, why: string) {
  console.log(`  ⏭  [${id}] ${name} — SKIP: ${why}`);
}

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const RAND = Math.random().toString(36).slice(2, 10);
const ROOT = process.cwd();
const OPS = reg.POS_OPS;
const byId = new Map(OPS.map((o) => [o.id, o]));
const op = (id: string) => {
  const o = byId.get(id);
  if (!o) throw new Error(`ไม่มี op ${id}`);
  return o;
};

/** actor ปลอมสำหรับเรียก handler ตรง (ไม่ผ่าน REST) — สิทธิ์ = scope ที่ให้มาเท่านั้น */
function actorOf(tenantId: string, systemId: string, scopes: string[]): Any {
  return {
    kind: "apikey",
    tenantId,
    systemId,
    keyId: `qc-p0.2-key-${RAND}`,
    keyName: `qc-p0.2-${RAND}`,
    scopes,
    membership: membershipFromScopes(scopes),
    module: "pos",
    can: (a: string) => scopes.includes(a),
  };
}
const ALL_SCOPES = Object.values(reg.POS_SCOPES) as string[];

/** เรียก handler แล้วคืน "status ของ ApiError" (หรือ 'ok' / ข้อความ error อื่น) */
async function statusOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    return `error:${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
  }
}

try {
  // ─────────── S1 ทะเบียน ───────────
  console.log("\n── S1 ทะเบียนโหลดได้ + รูปทรงของ op ──");
  chk("P0.2-S1.1", "POS_OPS โหลดได้และไม่ว่าง", Array.isArray(OPS) && OPS.length > 0, ">0", String(OPS?.length));
  const dupIds = OPS.map((o) => o.id).filter((id, i, a) => a.indexOf(id) !== i);
  chk("P0.2-S1.2", "op id ไม่ซ้ำ", dupIds.length === 0, "0 ซ้ำ", dupIds.join(",") || "0");
  const dupRoutes = OPS.map((o) => `${o.method} ${o.path}`).filter((r, i, a) => a.indexOf(r) !== i);
  chk("P0.2-S1.3", "method+path ไม่ซ้ำ", dupRoutes.length === 0, "0 ซ้ำ", dupRoutes.join(",") || "0");
  const badShape = OPS.filter(
    (o) =>
      o.module !== "pos" ||
      o.auditAction !== `pos.api.${o.id}` ||
      !o.action ||
      !o.summary ||
      !/^[\x20-\x7e]+$/.test(o.summary) || // summary = อังกฤษ ASCII (คู่มือ/OpenAPI)
      !o.label ||
      !/[฀-๿]/.test(o.label) || // ป้ายไทย
      !o.test ||
      !o.path.startsWith("/") ||
      typeof o.handler !== "function" ||
      ((o.kind === "write" || o.kind === "danger") && !o.input),
  );
  chk("P0.2-S1.4", "ทุก op: module=pos · auditAction · scope · summary EN · ป้ายไทย · test id · write/danger มี input", badShape.length === 0, "0", badShape.map((o) => o.id).join(",") || "0");
  const testIds = OPS.map((o) => o.test);
  // test id ต้องปรากฏในไฟล์ข้อสอบนี้จริง (แบบเดียวกับ F13.x ของโมดูลอื่น)
  const src = (await import("node:fs")).readFileSync(join(ROOT, "scripts", "qc-pos-p0.2.mts"), "utf8");
  const untested = testIds.filter((t) => !src.includes(`"${t}"`) || testIds.indexOf(t) !== testIds.lastIndexOf(t));
  chk("P0.2-S1.5", "test id ของทุก op ไม่ซ้ำและอ้างถึงจริงในข้อสอบนี้", untested.length === 0, "0", untested.join(",") || "0");
  // ข้อสอบที่ครอบ op แต่ละตัว (id ต้องตรงกับ `test:` ของ op):
  //   "POS-P0.2-OP.1" sales.summary → S7.1–S7.3 · "POS-P0.2-OP.2" sales.byDay → S7.4
  //   "POS-P0.2-OP.3" sales.create → S5.x, S6.1–S6.4 · "POS-P0.2-OP.4" sales.void → S5.6, S6.5–S6.8
  const inputsStrict = OPS.filter((o) => o.input).every((o) => validateOpInput(o, { __qcExtra: 1 }).ok === false);
  chk("P0.2-S1.6", "ทุก input schema เป็น strict (ฟิลด์แปลกถูกปัด)", inputsStrict, "true", String(inputsStrict));

  // ─────────── S2 scope ───────────
  console.log("\n── S2 scope ──");
  const badScope = OPS.filter((o) => !o.action.startsWith("pos.") || !isPermissionKey(o.action));
  chk("P0.2-S2.1", "scope ของทุก op เป็น permission key จริงของโมดูล pos", badScope.length === 0, "0", badScope.map((o) => `${o.id}:${o.action}`).join(",") || "0");
  const constOk = ALL_SCOPES.every((s) => isPermissionKey(s)) && OPS.every((o) => ALL_SCOPES.includes(o.action));
  chk("P0.2-S2.2", "POS_SCOPES ทุกตัวมีจริง และทุก op ใช้ค่าจาก POS_SCOPES", constOk, "true", String(constOk));
  const posBundles = API_SCOPE_BUNDLES.filter((b) => b.scopes.some((s: string) => s.startsWith("pos.")));
  chk("P0.2-S2.3", "ยังไม่มี bundle คีย์ API ของ POS (เลื่อนไป P2.13 · ไม่มี route ให้คีย์เข้าถึง)", posBundles.length === 0, "0", posBundles.map((b) => b.id).join(",") || "0", "MINOR");
  const dangerVoid = op("sales.void").kind === "danger" && op("sales.void").action === "pos.sale.void";
  chk("P0.2-S2.4", "sales.void = danger + pos.sale.void · sales.create = write + pos.sale.create", dangerVoid && op("sales.create").kind === "write" && op("sales.create").action === "pos.sale.create", "true", String(dangerVoid));

  // ─────────── S3 tool เดิม ↔ op ───────────
  console.log("\n── S3 tool เดิมของสกิล sales ↔ op ──");
  const salesSkill = SKILLS.find((s) => s.id === "sales");
  const skillTools = [...(salesSkill?.tools ?? [])].sort();
  const mapTools = reg.POS_LEGACY_AI_TOOLS.map((r) => r.tool).sort();
  chk("P0.2-S3.1", "ตาราง POS_LEGACY_AI_TOOLS = รายชื่อ tool ของสกิล sales พอดี (ไม่ขาด ไม่เกิน)", JSON.stringify(skillTools) === JSON.stringify(mapTools), skillTools.join(","), mapTools.join(","));
  const mapOpIds = reg.POS_LEGACY_AI_TOOLS.map((r) => r.opId).filter((x): x is string => x !== null);
  const danglingMap = mapOpIds.filter((id) => !byId.has(id));
  chk("P0.2-S3.2", "opId ทุกแถวมีจริงในทะเบียน", danglingMap.length === 0, "0", danglingMap.join(",") || "0");
  const unmapped = OPS.filter((o) => !mapOpIds.includes(o.id));
  chk("P0.2-S3.3", "op ทุกตัวมีแถวในตาราง (op ↔ tool ชัดเจน)", unmapped.length === 0, "0", unmapped.map((o) => o.id).join(",") || "0");
  const ownerOk = reg.POS_LEGACY_AI_TOOLS.every((r) => (r.owner === "pos") === (r.opId !== null));
  chk("P0.2-S3.4", "แถวที่ไม่ใช่ของ POS ไม่มี op ปลอม (owner≠pos ⇔ opId=null)", ownerOk, "true", String(ownerOk));
  const withTool = OPS.filter((o) => o.tool);
  chk("P0.2-S3.5", "ไม่มี op ไหนประกาศ tool (การสลับผิว AI = P2.13/P3.9 · มติข้อ 1)", withTool.length === 0, "0", withTool.map((o) => o.id).join(",") || "0");
  const live = new Set(toolRegistry().map((t) => t.def.name));
  const missingLive = skillTools.filter((n) => !live.has(n));
  chk("P0.2-S3.6", "tool เดิมทั้ง 6 ของสกิล sales ยังอยู่ในทะเบียน tool จริง", missingLive.length === 0 && skillTools.length === 6, "6 ครบ", `${skillTools.length} · ขาด ${missingLive.join(",") || "-"}`);
  let complete = "ok";
  try {
    assertSkillRegistryComplete();
  } catch (e) {
    complete = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  chk("P0.2-S3.7", "assertSkillRegistryComplete ผ่าน (F10.1)", complete === "ok", "ok", complete);

  // ─────────── S4 ตัวจับคู่ + ไม่มี route ───────────
  console.log("\n── S4 matchOp / dispatch helpers ──");
  const m1 = reg.matchOp("POST", ["sales", "abc123", "void"]);
  chk("P0.2-S4.1", "matchOp POST /sales/{id}/void → sales.void + params.id", m1?.op.id === "sales.void" && m1.params.id === "abc123", "sales.void id=abc123", `${m1?.op.id} id=${m1?.params.id}`);
  const m2 = reg.matchOp("POST", ["sales", ""]);
  chk("P0.2-S4.2", "matchOp POST /sales/ (trailing slash) → sales.create", m2?.op.id === "sales.create", "sales.create", String(m2?.op.id));
  const m3 = matchOpIn(OPS, "GET", ["reports", "sales-by-day"]);
  chk("P0.2-S4.3", "matchOpIn(POS_OPS) GET /reports/sales-by-day → sales.byDay", m3?.op.id === "sales.byDay", "sales.byDay", String(m3?.op.id));
  const allow = reg.allowedMethods(["sales"]);
  const allow2 = allowedMethodsIn(OPS, ["nope"]);
  chk("P0.2-S4.4", "allowedMethods(/sales)=[POST] · path ที่ไม่มี = []", JSON.stringify(allow) === '["POST"]' && allow2.length === 0, '["POST"] / []', `${JSON.stringify(allow)} / ${JSON.stringify(allow2)}`);
  chk("P0.2-S4.5", "matchOp GET /sales → null (ไม่มี op อ่านรายการบิลในโครงนี้)", reg.matchOp("GET", ["sales"]) === null, "null", String(reg.matchOp("GET", ["sales"])?.op.id));
  const routeDir = join(ROOT, "src", "app", "api", "v1", "pos");
  chk("P0.2-S4.6", "ยังไม่มี route ใต้ src/app/api/v1/pos (โครงเท่านั้น — P2.13)", !existsSync(routeDir), "ไม่มีโฟลเดอร์", existsSync(routeDir) ? "มี" : "ไม่มี");

  // ─────────── S5 schema ───────────
  console.log("\n── S5 input schema ──");
  const good = { unitId: "u1", lines: [{ name: "กาแฟ", qty: 2, unitPriceSatang: 4500 }], payMethods: [{ type: "CASH", amountSatang: 9000 }] };
  const vc = (p: unknown) => validateOpInput(op("sales.create"), p).ok;
  chk("P0.2-S5.1", "sales.create: payload ปกติผ่าน", vc(good), "true", String(vc(good)));
  chk("P0.2-S5.2", "sales.create: แนบ tenantId/systemId มาใน body = ถูกปัด (strict)", !vc({ ...good, tenantId: "x" }) && !vc({ ...good, systemId: "x" }), "false", String(vc({ ...good, tenantId: "x" })));
  chk("P0.2-S5.3", "sales.create: เงินไม่ใช่จำนวนเต็มสตางค์/ติดลบ = ถูกปัด", !vc({ ...good, lines: [{ name: "a", qty: 1, unitPriceSatang: 10.5 }] }) && !vc({ ...good, payMethods: [{ type: "CASH", amountSatang: -1 }] }), "false", "-");
  chk("P0.2-S5.4", "sales.create: qty 0 / ไม่มีรายการ / ชื่อว่าง = ถูกปัด", !vc({ ...good, lines: [{ name: "a", qty: 0, unitPriceSatang: 1 }] }) && !vc({ ...good, lines: [] }) && !vc({ ...good, lines: [{ name: "  ", qty: 1, unitPriceSatang: 1 }] }), "false", "-");
  chk("P0.2-S5.5", "sales.create: วิธีจ่ายภายใน DEPOSIT/ROOM_CHARGE = ถูกปัด · itemId (ยังไม่ resolve) = ถูกปัด", !vc({ ...good, payMethods: [{ type: "DEPOSIT", amountSatang: 9000 }] }) && !vc({ ...good, lines: [{ name: "a", qty: 1, unitPriceSatang: 9000, itemId: "x" }] }), "false", "-");
  const vv = (p: unknown) => validateOpInput(op("sales.void"), p).ok;
  chk("P0.2-S5.6", "sales.void: ต้องมีเหตุผล ≥5 ตัวอักษร", vv({ reason: "ลูกค้าขอยกเลิก" }) && !vv({ reason: "abc" }) && !vv({}), "true/false/false", `${vv({ reason: "ลูกค้าขอยกเลิก" })}/${vv({ reason: "abc" })}/${vv({})}`);
  const vd = (p: unknown) => validateOpInput(op("sales.summary"), p).ok;
  chk("P0.2-S5.7", "sales.summary: days จาก query string (ข้อความ) แปลงได้ · 0/32 ถูกปัด", vd({ days: "7" }) && vd({}) && !vd({ days: "0" }) && !vd({ days: "32" }), "true", `${vd({ days: "7" })}/${vd({ days: "0" })}/${vd({ days: "32" })}`, "MAJOR");

  // ─────────── S6 ด่าน id (อ่านอย่างเดียว) ───────────
  console.log("\n── S6 ด่าน id ข้ามร้าน/ข้ามระบบ (อ่านอย่างเดียว — ไม่มีการเขียน) ──");
  const ghostT = `qc-p0.2-t-${RAND}`;
  const ghostS = `qc-p0.2-s-${RAND}`;
  const run = (id: string, actor: Any, input: unknown, params: Record<string, string> = {}, key: string | null = `qc-p0.2-${RAND}`) =>
    statusOf(() => op(id).handler({ actor, params, input, requestId: `qc-${RAND}`, idempotencyKey: key }));

  const linked = await prisma.appSystemUnit.findFirst({ where: { type: "POS" }, select: { tenantId: true, systemId: true, unitId: true } });
  const createIn = (unitId: string) => ({ ...good, unitId });
  chk("P0.2-S6.1", "sales.create: unitId ที่ไม่มีจริง → 404 (ไม่ถึง createSale)", (await run("sales.create", actorOf(ghostT, ghostS, ALL_SCOPES), createIn(`nope-${RAND}`))) === "404:not_found", "404:not_found", await run("sales.create", actorOf(ghostT, ghostS, ALL_SCOPES), createIn(`nope-${RAND}`)));
  if (linked) {
    // positive control: ด่านเดียวกัน (posUnitIsLinked) ตอบ "ผ่าน" กับสาขาจริงของระบบจริง ⇒ 404 ด้านล่างไม่ใช่ด่านที่ปัดทุกอย่าง
    const { posUnitIsLinked } = await import("@/lib/modules/pos/register");
    const pc = await posUnitIsLinked(linked.tenantId, linked.systemId, linked.unitId);
    chk("P0.2-S6.0", "positive control: สาขาจริง + ระบบจริง ผ่านด่าน unit", pc === true, "true", String(pc), "MAJOR");
    const crossTenant = await run("sales.create", actorOf(ghostT, linked.systemId, ALL_SCOPES), createIn(linked.unitId));
    chk("P0.2-S6.2", "sales.create: สาขาจริงของร้านอื่น (tenant ไม่ตรง) → 404", crossTenant === "404:not_found", "404:not_found", crossTenant);
    const crossSystem = await run("sales.create", actorOf(linked.tenantId, ghostS, ALL_SCOPES), createIn(linked.unitId));
    chk("P0.2-S6.3", "sales.create: สาขาจริงของร้านเดียวกันแต่คนละระบบ POS → 404", crossSystem === "404:not_found", "404:not_found", crossSystem);
  } else {
    skip("P0.2-S6.2", "สาขาของร้านอื่น", "QC DB ไม่มีแถว AppSystemUnit type POS");
    skip("P0.2-S6.3", "สาขาคนละระบบ", "QC DB ไม่มีแถว AppSystemUnit type POS");
  }
  // ไม่มีสิทธิ์ → 403 ก่อนถึง handler (runOpAsActor ตรวจ action ก่อน · ไม่เขียน audit เพราะล้มก่อน)
  const noScope = await statusOf(() => runOpAsActor(op("sales.create"), actorOf(ghostT, ghostS, ["pos.sale.void"]), { input: createIn("x"), requestId: `qc-${RAND}` }));
  chk("P0.2-S6.4", "sales.create: คีย์ที่ไม่มี pos.sale.create → 403 scope_missing", noScope === "403:scope_missing", "403:scope_missing", noScope);

  chk("P0.2-S6.5", "sales.void: saleId ที่ไม่มีจริง → 404", (await run("sales.void", actorOf(ghostT, ghostS, ALL_SCOPES), { reason: "qc test" }, { id: `nope-${RAND}` })) === "404:not_found", "404:not_found", "-");
  // 🔴 ใช้ actor ที่ tenant/ระบบ "ไม่ตรง" เท่านั้น — ห้ามยิง void ด้วย actor ตัวจริงกับบิล PAID (จะ void ของจริง)
  const anySale = await prisma.posSale.findFirst({ select: { id: true, tenantId: true, systemId: true } });
  if (anySale) {
    const vt = await run("sales.void", actorOf(ghostT, anySale.systemId, ALL_SCOPES), { reason: "qc test" }, { id: anySale.id });
    const vs = await run("sales.void", actorOf(anySale.tenantId, ghostS, ALL_SCOPES), { reason: "qc test" }, { id: anySale.id });
    chk("P0.2-S6.6", "sales.void: บิลจริงของร้านอื่น / ระบบอื่น → 404 ทั้งคู่ (ไม่รั่วว่ามีอยู่)", vt === "404:not_found" && vs === "404:not_found", "404/404", `${vt}/${vs}`);
    // positive control (อ่านอย่างเดียว): คิวรีแบบเดียวกับ handler ด้วยร้าน+ระบบที่ถูก "เจอ" บิล ⇒ 404 ข้างบนมาจากขอบเขตจริง
    const { tenantDb } = await import("@/lib/core/db");
    const found = await tenantDb({ tenantId: anySale.tenantId, systemId: anySale.systemId }).posSale.findFirst({ where: { id: anySale.id }, select: { id: true } });
    chk("P0.2-S6.6b", "positive control: ร้าน+ระบบที่ถูกต้องหาบิลเจอด้วยคิวรีเดียวกัน", found?.id === anySale.id, anySale.id, String(found?.id), "MAJOR");
  } else {
    skip("P0.2-S6.6", "บิลของร้านอื่น", "QC DB ไม่มี PosSale");
  }
  const voided = await prisma.posSale.findFirst({ where: { status: "VOIDED" }, select: { id: true, tenantId: true, systemId: true } });
  if (voided) {
    const st = await run("sales.void", actorOf(voided.tenantId, voided.systemId, ALL_SCOPES), { reason: "qc test" }, { id: voided.id });
    chk("P0.2-S6.7", "sales.void: บิลที่ void แล้ว → 409 state_conflict (ไม่เรียก voidSale)", st === "409:state_conflict", "409:state_conflict", st);
  } else {
    skip("P0.2-S6.7", "บิลที่ void แล้ว", "QC DB ไม่มี PosSale สถานะ VOIDED");
  }
  const voidNoScope = await statusOf(() => runOpAsActor(op("sales.void"), actorOf(ghostT, ghostS, ["pos.sale.create"]), { input: { reason: "qc test" }, params: { id: "x" }, requestId: `qc-${RAND}` }));
  chk("P0.2-S6.8", "sales.void: คีย์ที่มีแค่ pos.sale.create → 403", voidNoScope === "403:scope_missing", "403:scope_missing", voidNoScope);

  // ─────────── S7 op อ่าน ───────────
  console.log("\n── S7 op อ่านยอดขาย (closeDaySummary ผ่าน facade) ──");
  const today = bkkToday();
  const sum = (await op("sales.summary").handler({ actor: actorOf(ghostT, ghostS, ALL_SCOPES), params: {}, input: { days: 3 }, requestId: "qc", idempotencyKey: null })) as Any;
  const d2 = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10);
  chk("P0.2-S7.1", "sales.summary ระบบที่ไม่มีบิล → 0 บิล 0 สตางค์", sum.billCount === 0 && sum.netSalesSatang === 0 && sum.voidCount === 0, "0/0/0", `${sum.billCount}/${sum.netSalesSatang}/${sum.voidCount}`);
  chk("P0.2-S7.2", "sales.summary ช่วงวัน = วันไทย 3 วันรวมวันนี้", sum.to === today && sum.from === d2 && sum.days === 3, `${d2}..${today}`, `${sum.from}..${sum.to}`);
  const def = (await op("sales.summary").handler({ actor: actorOf(ghostT, ghostS, ALL_SCOPES), params: {}, input: {}, requestId: "qc", idempotencyKey: null })) as Any;
  chk("P0.2-S7.3", "sales.summary ไม่ระบุ days = 7", def.days === 7, "7", String(def.days), "MAJOR");
  const bd = (await op("sales.byDay").handler({ actor: actorOf(ghostT, ghostS, ALL_SCOPES), params: {}, input: { days: 5 }, requestId: "qc", idempotencyKey: null })) as Any;
  const datesOk = Array.isArray(bd.rows) && bd.rows.length === 5 && bd.rows[0].businessDate === today && bd.rows.every((r: Any, i: number) => i === 0 || r.businessDate < bd.rows[i - 1].businessDate) && bd.rows.every((r: Any) => Number.isInteger(r.netSalesSatang) && r.billCount === 0);
  chk("P0.2-S7.4", "sales.byDay 5 แถว ใหม่→เก่า เริ่มวันนี้ · ตัวเลขเป็นจำนวนเต็มสตางค์", datesOk, `5 แถว เริ่ม ${today}`, JSON.stringify(bd.rows?.map((r: Any) => r.businessDate)));
  if (anySale) {
    // อ่านระบบจริงหนึ่งระบบ: ยอดของ op = ผลรวมของ closeDaySummary รายวันเดียวกันเป๊ะ (ไม่มีตรรกะของตัวเอง)
    const { closeDaySummary } = await import("@/lib/modules/pos");
    const realActor = actorOf(anySale.tenantId, anySale.systemId, ALL_SCOPES);
    const s3 = (await op("sales.summary").handler({ actor: realActor, params: {}, input: { days: 3 }, requestId: "qc", idempotencyKey: null })) as Any;
    let expect = 0;
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
      expect += (await closeDaySummary({ tenantId: anySale.tenantId, systemId: anySale.systemId }, d)).netSalesSatang;
    }
    chk("P0.2-S7.5", "sales.summary ของระบบจริง = Σ closeDaySummary รายวัน (สตางค์ตรงเป๊ะ)", s3.netSalesSatang === expect, String(expect), String(s3.netSalesSatang), "MAJOR");
  } else {
    skip("P0.2-S7.5", "ยอดของระบบจริง", "QC DB ไม่มี PosSale");
  }
} catch (e) {
  chk("P0.2-FATAL", "ข้อสอบรันจบ", false, "no throw", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}` : String(e));
} finally {
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: POS P0.2 ทะเบียน op =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length > 0 ? 1 : 0);
