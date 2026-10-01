// QC POS P0.2 — ทะเบียน op ของ POS (โครง) · **ไม่เขียน DB เลย**
// requires: QC DB ใดก็ได้ (อ่านแถว PosSale/AppSystemUnit ที่มีอยู่แล้ว — ไม่มีแถวที่ต้องใช้ = SKIP เฉพาะข้อนั้น)
// รัน: bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/qc-pos-p0.2.mts
//
// ชนิดของข้อ (รอบ 2 — ผู้ตรวจอิสระ):
//   S1–S4  STATIC  — โหลดทะเบียน/สกิล/permissions อ่านค่าในหน่วยความจำ (ไม่แตะ DB)
//   S5     UNIT    — schema zod ของ op (validateOpInput) · helper กันซ้ำ/สาขา/บิลต่างระบบ (ไม่แตะ DB)
//   S6     DB-READ — เรียก handler ของ op จริงด้วย actor ปลอม · **ทุกทางเขียนถูกตัดเชิงโครงสร้าง**:
//                    `prisma.$transaction` ของ singleton ถูกแทนด้วยตัวที่โยน `QC-WRITE-BLOCKED` ระหว่าง S6
//                    (createSale / voidSale เขียนผ่าน $transaction เท่านั้น) + มี positive control ว่าตัวตัดทำงานจริง
//                    ⇒ ถึงด่าน id จะพัง ข้อสอบก็เขียนบิลลง QC ไม่ได้ (ได้ผล `error:QC-WRITE-BLOCKED` แทน = แดง)
//   S7     DB-READ — op อ่านยอดเทียบกับคิวรีอิสระ (aggregate ตรงของข้อสอบ) บนวันที่มีบิลจริง · ยอด 0 = SKIP (ไม่นับ 0==0 เป็นผ่าน)
//   S1.5 (ท้ายไฟล์) — ทุก op มีข้อสอบที่ "รันจริงและผ่าน" ติดป้าย test id ของมัน (ไม่ใช่แค่ข้อความในไฟล์)

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";

loadLegacyQcEnv("qc-pos-p0.2"); // 🔴 กัน prod: ใช้ QC_ENV_FILE ที่ qc4.sh ตั้งให้

const { prisma } = await import("@/lib/core/db");
const reg = await import("@/lib/modules/pos/api/registry");
const salesOps = await import("@/lib/modules/pos/api/ops/sales");
const { matchOpIn, allowedMethodsIn } = await import("@/lib/api/dispatch");
const { validateOpInput } = await import("@/lib/api/run");
const { ApiError } = await import("@/lib/api/respond");
const { membershipFromScopes } = await import("@/lib/api/actor");
const { isPermissionKey } = await import("@/lib/core/permissions");
const { API_SCOPE_BUNDLES } = await import("@/lib/api-keys/scopes");
const { SKILLS, assertSkillRegistryComplete } = await import("@/lib/ai/skills");
const { toolRegistry } = await import("@/lib/ai/tools");
const { bkkToday } = await import("@/lib/modules/pos");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev; op?: string };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL", op?: string) {
  checks.push({ id, name, ok, expected, actual, sev, op });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const skips: string[] = [];
function skip(id: string, name: string, why: string) {
  skips.push(id);
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
// test id ของแต่ละ op (ต้องตรงกับ `test:` ในทะเบียน — S1.5 ตรวจทั้งสองทาง)
const T_SUMMARY = "POS-P0.2-OP.1";
const T_DAILY = "POS-P0.2-OP.2";
const T_CREATE = "POS-P0.2-OP.3";
const T_VOID = "POS-P0.2-OP.4";
const ALL_SCOPES = Object.values(reg.POS_SCOPES) as string[];
const DAY = 86_400_000;

/** actor ปลอม — คีย์ API (ระดับร้าน) */
function keyActor(tenantId: string, systemId: string, keyId = `qc-p0.2-key-${RAND}`): Any {
  return { kind: "apikey", tenantId, systemId, keyId, keyName: `qc-p0.2-${RAND}`, scopes: ALL_SCOPES, membership: membershipFromScopes(ALL_SCOPES), module: "pos", can: (a: string) => ALL_SCOPES.includes(a) };
}
/** actor ปลอม — คนในร้าน (STAFF) ที่เข้าได้เฉพาะสาขาที่ระบุ */
function userActor(tenantId: string, systemId: string, unitAccess: string[], userId = `qc-p0.2-user-${RAND}`): Any {
  const permissions = Object.fromEntries(ALL_SCOPES.map((s) => [s, true]));
  return { kind: "user", tenantId, systemId, userId, keyName: "qc", scopes: ALL_SCOPES, membership: { role: "STAFF", unitAccess, permissions }, module: "pos", can: () => true };
}

/** เรียก handler แล้วคืน "status:code ของ ApiError" / 'ok' / 'error:<ข้อความ>' */
async function statusOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    return `error:${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
  }
}
const call = (id: string, actor: Any, input: unknown, params: Record<string, string> = {}) =>
  statusOf(() => op(id).handler({ actor, params, input, requestId: `qc-${RAND}`, idempotencyKey: `qc-p0.2-${RAND}` }));

const bkkDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const bkkStart = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 7 * 3600_000);
const minusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

const good = { unitId: "u1", lines: [{ name: "กาแฟ", qty: 2, unitPriceSatang: 4500 }], payMethods: [{ type: "CASH", amountSatang: 9000 }] };
const VALID: Record<string, unknown> = {
  "sales.summary": { days: "3" },
  "sales.byDay": { days: "3" },
  "sales.create": good,
  "sales.void": { reason: "ลูกค้าขอยกเลิก" },
};

// ตัวตัดการเขียน (S6) — แทน $transaction ของ singleton · คืนค่าเดิมใน finally เสมอ
const prismaAny = prisma as Any;
const realTx = prismaAny.$transaction;
const blockWrites = () => {
  prismaAny.$transaction = () => {
    throw new Error("QC-WRITE-BLOCKED");
  };
};
const unblockWrites = () => {
  prismaAny.$transaction = realTx;
};

try {
  // ─────────── S1 ทะเบียน (STATIC) ───────────
  console.log("\n── S1 ทะเบียนโหลดได้ + รูปทรงของ op (static) ──");
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
      !/^[\x20-\x7e]+$/.test(o.summary) ||
      !o.label ||
      !/[฀-๿]/.test(o.label) ||
      !o.test ||
      !o.path.startsWith("/") ||
      typeof o.handler !== "function" ||
      !o.input,
  );
  chk("P0.2-S1.4", "ทุก op: module=pos · auditAction · scope · summary EN · ป้ายไทย · test id · มี input schema", badShape.length === 0, "0", badShape.map((o) => o.id).join(",") || "0");
  // S1.6 — payload ที่ถูกต้องของทุก op ผ่าน · ตัวเดียวกัน + ฟิลด์แปลก 1 ตัว ถูกปัด (strict จริง ไม่ใช่ปัดเพราะขาดฟิลด์)
  const strictBad: string[] = [];
  for (const o of OPS) {
    const v = VALID[o.id];
    if (v === undefined) {
      strictBad.push(`${o.id}(ไม่มี payload ตัวอย่าง)`);
      continue;
    }
    if (!validateOpInput(o, v).ok) strictBad.push(`${o.id}(ตัวอย่างไม่ผ่าน)`);
    if (validateOpInput(o, { ...(v as object), __qcExtra: 1 }).ok) strictBad.push(`${o.id}(ฟิลด์แปลกผ่าน)`);
  }
  chk("P0.2-S1.6", "ทุก op: payload ถูกต้องผ่าน · payload เดิม + ฟิลด์แปลก 1 ตัว ถูกปัด (strict)", strictBad.length === 0, "0", strictBad.join(",") || "0");

  // ─────────── S2 scope (STATIC) ───────────
  console.log("\n── S2 scope (static) ──");
  const badScope = OPS.filter((o) => !o.action.startsWith("pos.") || !isPermissionKey(o.action));
  chk("P0.2-S2.1", "scope ของทุก op เป็น permission key จริงของโมดูล pos", badScope.length === 0, "0", badScope.map((o) => `${o.id}:${o.action}`).join(",") || "0");
  const constOk = ALL_SCOPES.every((s) => isPermissionKey(s)) && OPS.every((o) => ALL_SCOPES.includes(o.action));
  chk("P0.2-S2.2", "POS_SCOPES ทุกตัวมีจริง และทุก op ใช้ค่าจาก POS_SCOPES", constOk, "true", String(constOk));
  const posBundles = API_SCOPE_BUNDLES.filter((b) => b.scopes.some((s: string) => s.startsWith("pos.")));
  chk("P0.2-S2.3", "ยังไม่มี bundle คีย์ API ของ POS (เลื่อนไป P2.13)", posBundles.length === 0, "0", posBundles.map((b) => b.id).join(",") || "0", "MINOR");
  chk("P0.2-S2.4", "sales.void = danger + pos.sale.void", op("sales.void").kind === "danger" && op("sales.void").action === "pos.sale.void", "danger/pos.sale.void", `${op("sales.void").kind}/${op("sales.void").action}`, "CRITICAL", T_VOID);
  chk("P0.2-S2.5", "sales.create = write + pos.sale.create · อ่านทั้งสอง = read + pos.sale.create", op("sales.create").kind === "write" && op("sales.create").action === "pos.sale.create" && op("sales.summary").kind === "read" && op("sales.byDay").kind === "read", "true", "-", "CRITICAL", T_CREATE);

  // ─────────── S3 tool เดิม ↔ op (STATIC) ───────────
  console.log("\n── S3 tool เดิมของสกิล sales ↔ op (static) ──");
  const salesSkill = SKILLS.find((s) => s.id === "sales");
  const skillTools = [...(salesSkill?.tools ?? [])].sort();
  const mapTools = reg.POS_LEGACY_AI_TOOLS.map((r) => r.tool).sort();
  chk("P0.2-S3.1", "ตาราง POS_LEGACY_AI_TOOLS = รายชื่อ tool ของสกิล sales พอดี", JSON.stringify(skillTools) === JSON.stringify(mapTools), skillTools.join(","), mapTools.join(","));
  const mapOpIds = reg.POS_LEGACY_AI_TOOLS.map((r) => r.opId).filter((x): x is string => x !== null);
  const danglingMap = mapOpIds.filter((id) => !byId.has(id));
  chk("P0.2-S3.2", "opId ทุกแถวมีจริงในทะเบียน", danglingMap.length === 0, "0", danglingMap.join(",") || "0");
  const unmapped = OPS.filter((o) => !mapOpIds.includes(o.id));
  chk("P0.2-S3.3", "op ทุกตัวมีแถวในตาราง", unmapped.length === 0, "0", unmapped.map((o) => o.id).join(",") || "0");
  const ownerOk = reg.POS_LEGACY_AI_TOOLS.every((r) => (r.owner === "pos") === (r.opId !== null));
  chk("P0.2-S3.4", "แถวที่ไม่ใช่ของ POS ไม่มี op ปลอม (owner≠pos ⇔ opId=null)", ownerOk, "true", String(ownerOk));
  const withTool = OPS.filter((o) => o.tool);
  chk("P0.2-S3.5", "ไม่มี op ไหนประกาศ tool (มติข้อ 1)", withTool.length === 0, "0", withTool.map((o) => o.id).join(",") || "0");
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

  // ─────────── S4 ตัวจับคู่ + ไม่มี route (STATIC) ───────────
  console.log("\n── S4 matchOp / dispatch helpers (static) ──");
  const m1 = reg.matchOp("POST", ["sales", "abc123", "void"]);
  chk("P0.2-S4.1", "matchOp POST /sales/{id}/void → sales.void + params.id", m1?.op.id === "sales.void" && m1.params.id === "abc123", "sales.void id=abc123", `${m1?.op.id} id=${m1?.params.id}`, "CRITICAL", T_VOID);
  const m2 = reg.matchOp("POST", ["sales", ""]);
  chk("P0.2-S4.2", "matchOp POST /sales/ (trailing slash) → sales.create", m2?.op.id === "sales.create", "sales.create", String(m2?.op.id), "CRITICAL", T_CREATE);
  const m3 = matchOpIn(OPS, "GET", ["reports", "daily"]);
  chk("P0.2-S4.3", "matchOpIn(POS_OPS) GET /reports/daily (POS-API §3) → sales.byDay", m3?.op.id === "sales.byDay", "sales.byDay", String(m3?.op.id), "CRITICAL", T_DAILY);
  const m4 = reg.matchOp("GET", ["reports", "summary"]);
  chk("P0.2-S4.3b", "matchOp GET /reports/summary → sales.summary", m4?.op.id === "sales.summary", "sales.summary", String(m4?.op.id), "CRITICAL", T_SUMMARY);
  const allow = reg.allowedMethods(["sales"]);
  const allow2 = allowedMethodsIn(OPS, ["nope"]);
  chk("P0.2-S4.4", "allowedMethods(/sales)=[POST] · path ที่ไม่มี = []", JSON.stringify(allow) === '["POST"]' && allow2.length === 0, '["POST"] / []', `${JSON.stringify(allow)} / ${JSON.stringify(allow2)}`);
  chk("P0.2-S4.5", "matchOp GET /sales → null (ยังไม่มี op อ่านรายการบิล)", reg.matchOp("GET", ["sales"]) === null, "null", String(reg.matchOp("GET", ["sales"])?.op.id));
  const routeDir = join(ROOT, "src", "app", "api", "v1", "pos");
  chk("P0.2-S4.6", "ยังไม่มี route ใต้ src/app/api/v1/pos (โครงเท่านั้น — P2.13)", !existsSync(routeDir), "ไม่มีโฟลเดอร์", existsSync(routeDir) ? "มี" : "ไม่มี");

  // ─────────── S5 schema + helper (UNIT) ───────────
  console.log("\n── S5 input schema + helper (unit) ──");
  const vc = (p: unknown) => validateOpInput(op("sales.create"), p);
  const thaiDetail = (r: ReturnType<typeof vc>, path: string) => !r.ok && r.details.some((d) => d.path.startsWith(path) && /[฀-๿]/.test(d.message));
  chk("P0.2-S5.1", "sales.create: จ่ายครบพอดีผ่าน", vc(good).ok, "true", String(vc(good).ok), "CRITICAL", T_CREATE);
  chk("P0.2-S5.2", "sales.create: แนบ tenantId/systemId มาใน body = ถูกปัด (strict)", !vc({ ...good, tenantId: "x" }).ok && !vc({ ...good, systemId: "x" }).ok, "false", "-", "CRITICAL", T_CREATE);
  chk("P0.2-S5.3", "sales.create: เงินไม่ใช่จำนวนเต็มสตางค์/ติดลบ = ถูกปัด", !vc({ ...good, lines: [{ name: "a", qty: 1, unitPriceSatang: 10.5 }] }).ok && !vc({ ...good, payMethods: [{ type: "CASH", amountSatang: -1 }] }).ok, "false", "-", "CRITICAL", T_CREATE);
  chk("P0.2-S5.4", "sales.create: qty 0 / ไม่มีรายการ / ชื่อว่าง = ถูกปัด", !vc({ ...good, lines: [{ name: "a", qty: 0, unitPriceSatang: 1 }] }).ok && !vc({ ...good, lines: [] }).ok && !vc({ ...good, lines: [{ name: "  ", qty: 1, unitPriceSatang: 1 }] }).ok, "false", "-", "CRITICAL", T_CREATE);
  chk("P0.2-S5.5", "sales.create: DEPOSIT / itemId (ยังไม่ resolve) = ถูกปัด", !vc({ ...good, payMethods: [{ type: "DEPOSIT", amountSatang: 9000 }] }).ok && !vc({ ...good, lines: [{ name: "a", qty: 1, unitPriceSatang: 9000, itemId: "x" }] }).ok, "false", "-", "CRITICAL", T_CREATE);
  const mism = vc({ ...good, payMethods: [{ type: "CASH", amountSatang: 8999 }] });
  chk("P0.2-S5.8", "sales.create: Σ จ่าย ≠ ยอดบิล → validation ที่ช่อง payMethods ข้อความไทย", thaiDetail(mism, "payMethods"), "payMethods + ไทย", JSON.stringify(mism.ok ? "ok" : mism.details), "CRITICAL", T_CREATE);
  const split = vc({ ...good, payMethods: [{ type: "CASH", amountSatang: 4000 }, { type: "PROMPTPAY", amountSatang: 5000 }] });
  chk("P0.2-S5.9", "sales.create: หลายวิธีจ่ายรวมพอดี = ผ่าน", split.ok, "true", String(split.ok), "CRITICAL", T_CREATE);
  const big = 2_000_000_000;
  const ovLine = vc({ unitId: "u1", lines: [{ name: "a", qty: 2, unitPriceSatang: big }], payMethods: [{ type: "CASH", amountSatang: big }] });
  const ovSum = vc({ unitId: "u1", lines: [{ name: "a", qty: 1, unitPriceSatang: big }, { name: "b", qty: 1, unitPriceSatang: big }], payMethods: [{ type: "CASH", amountSatang: big }, { type: "CASH", amountSatang: big }] });
  const ovField = vc({ unitId: "u1", lines: [{ name: "a", qty: 1, unitPriceSatang: 2_147_483_648 }], payMethods: [{ type: "CASH", amountSatang: 2_147_483_648 }] });
  const atMax = vc({ unitId: "u1", lines: [{ name: "a", qty: 1, unitPriceSatang: 2_147_483_647 }], payMethods: [{ type: "CASH", amountSatang: 2_147_483_647 }] });
  chk("P0.2-S5.10", "sales.create: ล้น Int (บรรทัดเดียว / ผลรวมหลายบรรทัด / ช่องเกิน) = ถูกปัดพร้อมข้อความไทย · พอดี Int max = ผ่าน", thaiDetail(ovLine, "lines") && thaiDetail(ovSum, "lines") && !ovField.ok && atMax.ok, "ปัด/ปัด/ปัด/ผ่าน", `${ovLine.ok}/${ovSum.ok}/${ovField.ok}/${atMax.ok}`, "CRITICAL", T_CREATE);
  const vv = (p: unknown) => validateOpInput(op("sales.void"), p).ok;
  chk("P0.2-S5.6", "sales.void: ต้องมีเหตุผล ≥5 ตัวอักษร", vv({ reason: "ลูกค้าขอยกเลิก" }) && !vv({ reason: "abc" }) && !vv({}), "true/false/false", `${vv({ reason: "ลูกค้าขอยกเลิก" })}/${vv({ reason: "abc" })}/${vv({})}`, "CRITICAL", T_VOID);
  const vd = (p: unknown) => validateOpInput(op("sales.summary"), p).ok;
  chk("P0.2-S5.7", "sales.summary: days จาก query string แปลงได้ · 0/32 ถูกปัด", vd({ days: "7" }) && vd({}) && !vd({ days: "0" }) && !vd({ days: "32" }), "true", `${vd({ days: "7" })}/${vd({ days: "0" })}/${vd({ days: "32" })}`, "MAJOR", T_SUMMARY);
  // กันซ้ำผูกผู้เรียก (BLOCKER รอบ 1)
  const sk = salesOps.posSaleServiceKey;
  const kA = sk(keyActor("t", "s", "keyA"), "same", "r1");
  const kB = sk(keyActor("t", "s", "keyB"), "same", "r2");
  const kA2 = sk(keyActor("t", "s", "keyA"), "same", "r3");
  const kU = sk(userActor("t", "s", ["*"], "userX"), "same", "r4");
  const kNull = sk(keyActor("t", "s", "keyA"), null, "req-9");
  chk("P0.2-S5.11", "คีย์กันซ้ำของ createSale: คนละผู้เรียก + Idempotency-Key เดียวกัน = คนละคีย์ · ผู้เรียกเดิม = คีย์เดิม", kA !== kB && kA === kA2 && kU !== kA && kU.includes("userX") && kNull === "api:keyA:req-9", "A≠B · A=A' · user ต่าง · null→requestId", `${kA} | ${kB} | ${kU} | ${kNull}`, "CRITICAL", T_CREATE);
  // สาขา
  const cu = salesOps.actorCanUseUnit;
  chk("P0.2-S5.12", "สิทธิ์สาขา: คีย์ API ผ่านทุกสาขา · คนที่ได้แค่สาขา A ใช้ B ไม่ได้ · OWNER ผ่าน", cu(keyActor("t", "s"), "B") && cu(userActor("t", "s", ["A"]), "A") && !cu(userActor("t", "s", ["A"]), "B") && cu({ kind: "user", membership: { role: "OWNER", unitAccess: [], permissions: {} } } as Any, "B"), "true", "-", "CRITICAL", T_CREATE);
  // บิลต่างระบบ + สถานะชนกัน
  const fe = salesOps.foreignSaleError;
  const foreignOk = ["HOTEL", "RESTAURANT", "BOOKING", "TICKET", "ECOM", "MEMBER", "CLINIC", "RENTAL", "SCHOOL", "SOMETHING_NEW"].every((s) => {
    const e = fe(s);
    return e instanceof ApiError && e.status === 409 && /ยกเลิกจาก/.test(e.message_th);
  });
  const nativeOk = ["POS", "AI", "API"].every((s) => fe(s) === null) && fe(null) === null;
  chk("P0.2-S5.13", "sales.void: บิลจากระบบอื่น (รวมค่าที่ไม่รู้จัก) → 409 บอกให้ยกเลิกจากระบบต้นทาง · POS/AI/API → ยกเลิกได้", foreignOk && nativeOk, "true/true", `${foreignOk}/${nativeOk}`, "CRITICAL", T_VOID);
  const raced = salesOps.voidErrorToApi(new Error("บิลนี้ void ไม่ได้"));
  const other = new Error("อย่างอื่น");
  chk("P0.2-S5.14", "sales.void: voidSale โยนเรื่องสถานะ (ชนกันระหว่างตรวจ-ลงมือ) → 409 state_conflict · error อื่นผ่านไปตามเดิม", raced instanceof ApiError && raced.status === 409 && raced.code === "state_conflict" && salesOps.voidErrorToApi(other) === other, "409", raced instanceof ApiError ? `${raced.status}:${raced.code}` : String(raced), "CRITICAL", T_VOID);

  // ─────────── S6 ด่าน id + สาขา (DB-READ · ตัดการเขียนเชิงโครงสร้าง) ───────────
  console.log("\n── S6 ด่าน id/สาขา (อ่าน DB · การเขียนถูกตัด) ──");
  blockWrites();
  try {
    let blockerOk = false;
    try {
      await prisma.$transaction(async () => 1);
    } catch (e) {
      blockerOk = e instanceof Error && e.message === "QC-WRITE-BLOCKED";
    }
    chk("P0.2-S6.B", "positive control: ตัวตัดการเขียน ($transaction โยน QC-WRITE-BLOCKED) ทำงานจริง", blockerOk, "true", String(blockerOk));
    if (!blockerOk) throw new Error("ตัวตัดการเขียนไม่ทำงาน — หยุด S6 (กันเขียนบิลจริง)");

    const ghostT = `qc-p0.2-t-${RAND}`;
    const ghostS = `qc-p0.2-s-${RAND}`;
    // payload ที่ส่งตรงเข้า handler (ข้าม schema) — ถึงด่านพังก็ไปได้แค่ $transaction ที่ถูกตัด
    const createIn = (unitId: string) => ({ ...good, unitId });

    chk("P0.2-S6.1", "sales.create: unitId ที่ไม่มีจริง → 404", (await call("sales.create", keyActor(ghostT, ghostS), createIn(`nope-${RAND}`))) === "404:not_found", "404:not_found", "-", "CRITICAL", T_CREATE);
    const linked = await prisma.appSystemUnit.findFirst({ where: { type: "POS" }, select: { tenantId: true, systemId: true, unitId: true } });
    if (linked) {
      const pc = await call("sales.create", keyActor(linked.tenantId, linked.systemId), createIn(linked.unitId));
      chk("P0.2-S6.0", "positive control: สาขาจริง + ระบบจริง ผ่านด่าน แล้วไปชนตัวตัดการเขียน (ไม่ใช่ 404)", pc === "error:QC-WRITE-BLOCKED", "error:QC-WRITE-BLOCKED", pc, "MAJOR", T_CREATE);
      const crossTenant = await call("sales.create", keyActor(ghostT, linked.systemId), createIn(linked.unitId));
      chk("P0.2-S6.2", "sales.create: สาขาจริงของร้านอื่น (tenant ไม่ตรง) → 404", crossTenant === "404:not_found", "404:not_found", crossTenant, "CRITICAL", T_CREATE);
      const crossSystem = await call("sales.create", keyActor(linked.tenantId, ghostS), createIn(linked.unitId));
      chk("P0.2-S6.3", "sales.create: สาขาจริงของร้านเดียวกันแต่คนละระบบ POS → 404", crossSystem === "404:not_found", "404:not_found", crossSystem, "CRITICAL", T_CREATE);
      const uOther = await call("sales.create", userActor(linked.tenantId, linked.systemId, [`other-${RAND}`]), createIn(linked.unitId));
      const uSelf = await call("sales.create", userActor(linked.tenantId, linked.systemId, [linked.unitId]), createIn(linked.unitId));
      chk("P0.2-S6.4", "sales.create: คนที่เข้าได้แค่สาขาอื่น → 404 · positive control: คนที่เข้าสาขานี้ได้ผ่านด่าน (ชนตัวตัด)", uOther === "404:not_found" && uSelf === "error:QC-WRITE-BLOCKED", "404 / BLOCKED", `${uOther} / ${uSelf}`, "CRITICAL", T_CREATE);
    } else {
      for (const id of ["P0.2-S6.0", "P0.2-S6.2", "P0.2-S6.3", "P0.2-S6.4"]) skip(id, "ต้องมีสาขาที่ผูก POS", "QC DB ไม่มีแถว AppSystemUnit type POS");
    }

    chk("P0.2-S6.5", "sales.void: saleId ที่ไม่มีจริง → 404", (await call("sales.void", keyActor(ghostT, ghostS), { reason: "qc test" }, { id: `nope-${RAND}` })) === "404:not_found", "404:not_found", "-", "CRITICAL", T_VOID);
    // บิลตัวอย่าง: เลือกบิลที่ "ยกเลิกไม่ได้อยู่แล้ว" ก่อน (ต่างระบบ/ไม่ใช่ PAID) — ตัวตัดการเขียนคือชั้นที่สอง
    const safeSale =
      (await prisma.posSale.findFirst({ where: { OR: [{ status: { not: "PAID" } }, { sourceModule: { notIn: ["POS", "AI", "API"] } }] }, select: { id: true, tenantId: true, systemId: true, unitId: true, status: true, sourceModule: true } })) ??
      (await prisma.posSale.findFirst({ select: { id: true, tenantId: true, systemId: true, unitId: true, status: true, sourceModule: true } }));
    if (safeSale) {
      const vt = await call("sales.void", keyActor(ghostT, safeSale.systemId), { reason: "qc test" }, { id: safeSale.id });
      const vs = await call("sales.void", keyActor(safeSale.tenantId, ghostS), { reason: "qc test" }, { id: safeSale.id });
      chk("P0.2-S6.6", "sales.void: บิลจริงของร้านอื่น / ระบบอื่น → 404 ทั้งคู่", vt === "404:not_found" && vs === "404:not_found", "404/404", `${vt}/${vs}`, "CRITICAL", T_VOID);
      const vOther = await call("sales.void", userActor(safeSale.tenantId, safeSale.systemId, [`other-${RAND}`]), { reason: "qc test" }, { id: safeSale.id });
      const vSelf = await call("sales.void", userActor(safeSale.tenantId, safeSale.systemId, [safeSale.unitId]), { reason: "qc test" }, { id: safeSale.id });
      chk("P0.2-S6.8", "sales.void: คนที่เข้าได้แค่สาขาอื่น → 404 · positive control: คนที่เข้าสาขาของบิลได้ผ่านด่าน (ไม่ใช่ 404)", vOther === "404:not_found" && vSelf !== "404:not_found" && vSelf !== "ok", "404 / ไม่ใช่ 404", `${vOther} / ${vSelf}`, "CRITICAL", T_VOID);
    } else {
      for (const id of ["P0.2-S6.6", "P0.2-S6.8"]) skip(id, "ต้องมีบิลใน QC", "QC DB ไม่มี PosSale");
    }
    const foreignSale = await prisma.posSale.findFirst({ where: { sourceModule: { notIn: ["POS", "AI", "API"] } }, select: { id: true, tenantId: true, systemId: true, sourceModule: true } });
    if (foreignSale) {
      const st = await call("sales.void", keyActor(foreignSale.tenantId, foreignSale.systemId), { reason: "qc test" }, { id: foreignSale.id });
      chk("P0.2-S6.9", `sales.void: บิลจริงที่มาจาก ${foreignSale.sourceModule} → 409 (ไม่ถึง voidSale)`, st === "409:state_conflict", "409:state_conflict", st, "CRITICAL", T_VOID);
    } else {
      skip("P0.2-S6.9", "บิลจากระบบอื่น", "QC DB ไม่มี PosSale ที่ sourceModule ไม่ใช่ POS/AI/API");
    }
    const voided = await prisma.posSale.findFirst({ where: { status: "VOIDED", sourceModule: { in: ["POS", "AI", "API"] } }, select: { id: true, tenantId: true, systemId: true } });
    if (voided) {
      const st = await call("sales.void", keyActor(voided.tenantId, voided.systemId), { reason: "qc test" }, { id: voided.id });
      chk("P0.2-S6.7", "sales.void: บิล POS ที่ void แล้ว → 409 state_conflict", st === "409:state_conflict", "409:state_conflict", st, "CRITICAL", T_VOID);
    } else {
      skip("P0.2-S6.7", "บิล POS ที่ void แล้ว", "QC DB ไม่มี PosSale สถานะ VOIDED (เส้นเดียวกันครอบโดย S5.14 ระดับ unit)");
    }
  } finally {
    unblockWrites();
  }
  // หมายเหตุรอบ 2: ข้อ "ไม่มีสิทธิ์ → 403" รอบ 1 ทดสอบ `runOpAsActor` ของแกนกลาง ไม่ใช่โค้ด POS ⇒ ถอดออก
  //   (การผูก scope ของแต่ละ op ตรวจแบบ static ที่ S2.4/S2.5 แทน)

  // ─────────── S7 op อ่าน (DB-READ เทียบคิวรีอิสระ) ───────────
  console.log("\n── S7 op อ่านยอดขาย (อ่าน DB · เทียบ aggregate อิสระบนวันที่มีบิลจริง) ──");
  const today = bkkToday();
  const ghost = keyActor(`qc-p0.2-t-${RAND}`, `qc-p0.2-s-${RAND}`);
  const runRead = async (id: string, actor: Any, days: number) => (await op(id).handler({ actor, params: {}, input: { days }, requestId: "qc", idempotencyKey: null })) as Any;
  const sum3 = await runRead("sales.summary", ghost, 3);
  chk("P0.2-S7.2", "sales.summary ช่วงวัน = วันไทย 3 วันรวมวันนี้", sum3.to === today && sum3.from === minusDays(today, 2) && sum3.days === 3, `${minusDays(today, 2)}..${today}`, `${sum3.from}..${sum3.to}`, "CRITICAL", T_SUMMARY);
  const def = (await op("sales.summary").handler({ actor: ghost, params: {}, input: {}, requestId: "qc", idempotencyKey: null })) as Any;
  chk("P0.2-S7.3", "sales.summary ไม่ระบุ days = 7", def.days === 7, "7", String(def.days), "MAJOR", T_SUMMARY);
  const bd5 = await runRead("sales.byDay", ghost, 5);
  const datesOk = Array.isArray(bd5.rows) && bd5.rows.length === 5 && bd5.rows.every((r: Any, i: number) => r.businessDate === minusDays(today, i));
  chk("P0.2-S7.4", "sales.byDay 5 แถว ใหม่→เก่า เริ่มวันนี้ วันต่อเนื่อง", datesOk, `5 แถว ${today}..${minusDays(today, 4)}`, JSON.stringify(bd5.rows?.map((r: Any) => r.businessDate)), "CRITICAL", T_DAILY);

  // วันที่มีบิล PAID จริงภายใน 31 วัน (ของระบบใดก็ได้) → คิวรีอิสระ vs op
  const recent = await prisma.posSale.findFirst({
    where: { status: "PAID", createdAt: { gte: bkkStart(minusDays(today, 30)) } },
    orderBy: { createdAt: "desc" },
    select: { tenantId: true, systemId: true, createdAt: true },
  });
  const realSum = recent
    ? await (async () => {
        const day = bkkDate(recent.createdAt);
        const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY) + 1;
        const range = await prisma.posSale.aggregate({
          where: { tenantId: recent.tenantId, systemId: recent.systemId, status: "PAID", createdAt: { gte: bkkStart(minusDays(today, days - 1)), lt: new Date(bkkStart(today).getTime() + DAY) } },
          _sum: { grandTotalSatang: true },
          _count: { _all: true },
        });
        const dayAgg = await prisma.posSale.aggregate({
          where: { tenantId: recent.tenantId, systemId: recent.systemId, status: "PAID", createdAt: { gte: bkkStart(day), lt: new Date(bkkStart(day).getTime() + DAY) } },
          _sum: { grandTotalSatang: true },
          _count: { _all: true },
        });
        return { day, days, rangeSatang: range._sum.grandTotalSatang ?? 0, rangeCount: range._count._all, daySatang: dayAgg._sum.grandTotalSatang ?? 0, dayCount: dayAgg._count._all };
      })()
    : null;
  if (realSum && realSum.rangeSatang > 0 && realSum.daySatang > 0) {
    const realActor = keyActor(recent!.tenantId, recent!.systemId);
    const s = await runRead("sales.summary", realActor, realSum.days);
    chk("P0.2-S7.1", `sales.summary ระบบจริง ${realSum.days} วัน = aggregate อิสระ (ยอด ${realSum.rangeSatang} สตางค์ · ${realSum.rangeCount} บิล)`, s.netSalesSatang === realSum.rangeSatang && s.billCount === realSum.rangeCount, `${realSum.rangeSatang}/${realSum.rangeCount}`, `${s.netSalesSatang}/${s.billCount}`, "CRITICAL", T_SUMMARY);
    const b = await runRead("sales.byDay", realActor, realSum.days);
    const row = (b.rows as Any[]).find((r) => r.businessDate === realSum.day);
    chk("P0.2-S7.5", `sales.byDay วัน ${realSum.day} = aggregate อิสระของวันนั้น (${realSum.daySatang} สตางค์)`, row?.netSalesSatang === realSum.daySatang && row?.billCount === realSum.dayCount, `${realSum.daySatang}/${realSum.dayCount}`, `${row?.netSalesSatang}/${row?.billCount}`, "CRITICAL", T_DAILY);
    const g = await runRead("sales.summary", keyActor(recent!.tenantId, `qc-p0.2-s-${RAND}`), realSum.days);
    chk("P0.2-S7.6", "ระบบ POS อื่นของร้านเดียวกัน (ช่วงเดียวกันที่มียอดจริง > 0) เห็น 0 — ไม่รั่วข้ามระบบ", g.netSalesSatang === 0 && g.billCount === 0, "0/0", `${g.netSalesSatang}/${g.billCount}`, "CRITICAL", T_SUMMARY);
  } else {
    for (const id of ["P0.2-S7.1", "P0.2-S7.5", "P0.2-S7.6"]) skip(id, "เทียบยอดของระบบจริง", "QC DB ไม่มีบิล PAID ยอด > 0 ภายใน 31 วัน (ไม่นับ 0 = 0 เป็นผ่าน)");
  }

  // ─────────── S1.5 ทุก op มีข้อสอบที่รันจริง ───────────
  const testIds = OPS.map((o) => o.test);
  const declared = [T_SUMMARY, T_DAILY, T_CREATE, T_VOID];
  const cover = OPS.map((o) => {
    const mine = checks.filter((c) => c.op === o.test);
    return { id: o.id, test: o.test, ran: mine.length, allOk: mine.every((c) => c.ok) };
  });
  const coverBad = cover.filter((c) => c.ran === 0 || !c.allOk);
  const idsMatch = JSON.stringify([...testIds].sort()) === JSON.stringify([...declared].sort()) && new Set(testIds).size === testIds.length;
  chk("P0.2-S1.5", "ทุก op มี test id ไม่ซ้ำ และมีข้อสอบที่รันจริง + ผ่าน ติดป้าย id นั้น (ไม่นับข้อความในไฟล์)", coverBad.length === 0 && idsMatch, "ทุก op ≥1 ข้อผ่าน", cover.map((c) => `${c.id}:${c.ran}${c.allOk ? "" : "✗"}`).join(" "));
} catch (e) {
  chk("P0.2-FATAL", "ข้อสอบรันจบ", false, "no throw", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}` : String(e));
} finally {
  unblockWrites();
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: POS P0.2 ทะเบียน op =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length} · SKIP ${skips.length}${skips.length ? ` (${skips.join(", ")})` : ""}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, skipped: skips, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length > 0 ? 1 : 0);
