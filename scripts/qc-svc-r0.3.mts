// QC — SVC R0.3 · เครื่องยนต์ค่าตั้ง (Settings core) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/SVC-CORE-CONTRACT.md §1 (+ §3.4 §4.4 §7 §8) · ledger/SVC-MASTER-PLAN.md แถว R0.3 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.3.md
//
// กลุ่มข้อ:
//   S  ไฟล์ · ความบริสุทธิ์ (import graph) · ทะเบียน event 3 ที่ · approval 3 ที่ · คีย์สิทธิ์ · SettingChange ต่อท้ายอย่างเดียว
//   R  ทะเบียน (pure): ฟิกซ์เจอร์ · ตัวตรวจตอนลงทะเบียน · validateGroup · renderTemplate · defs payments/messaging
//   D  แม่แบบ/ค่าเริ่ม (FALLBACK → TEMPLATE)        P  ชั้นเจาะจงชนะทุกคู่ · ไม่แคช · แถวร้านอื่นไม่มีผล
//   E  effectiveFrom                                 SN snapshotPolicy (ค่าที่จดไม่เปลี่ยนเมื่อแก้ทีหลัง)
//   V  ตรวจค่า/ตรวจข้ามค่า/ต้องเชื่อมตัวต่อ          A  สิทธิ์ · ownerOnly · LEGAL = เจ้าของ
//   X  ข้ามร้าน/ข้ามสาขา (X1) · เขียนพร้อมกัน 10 ทาง (X3)
//   L  กฎหมาย 3 โหมด + สายอนุมัติ settings.legal_override
//   H  ประวัติ SettingChange · AuditLog · outbox settings.changed
//   T  applyTemplate KEEP_CUSTOM / RESET_ALL
//
// ใช้ Prisma client ของแอป (ผ่าน @/lib/core/db) · ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-r03-*` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.3.mts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.3";

// ═══════════════ 0. ด่านฐานข้อมูล (ด่าน host ของ RUN SVC — ไม่มีทางปลด) ═══════════════
const envMod = (await import("./svc-qc-env.mts" as string)) as { loadSvcQcEnv: (label: string) => { host: string } };
envMod.loadSvcQcEnv(LABEL);

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 260);
const fmt = (v: unknown): string => {
  try {
    return JSON.stringify(v)?.slice(0, 200) ?? String(v);
  } catch {
    return String(v);
  }
};
const ok = (cond: boolean, why: string): void => {
  if (!cond) throw new AssertFail(why);
};
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
/** ข้อสอบที่ไม่ต้องมีโมดูล (ไฟล์/ทะเบียน) */
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try {
    await fn();
    record(id, name, "PASS", "", sev);
  } catch (e) {
    record(id, name, "FAIL", errMsg(e), sev);
  }
};

// ═══════════════ ชนิดตามใบสั่ง §2 (ข้อสอบล้ำหน้าโค้ด ⇒ dynamic import + ชนิดกว้าง) ═══════════════
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type Ctx = { tenantId: string };
type Refs = { unitId: string; buildingId?: string; roomTypeId?: string; roomId?: string; staffId?: string; serviceId?: string };
type Change = { key: string; scope: string; scopeId: string; value: unknown; effectiveFrom?: Date; reason?: string };
type Issue = { key?: string; code: string; messageTh: string };
type SetRes = { ok: boolean; saved?: number; removed?: number; code?: string; issues?: Issue[]; approvalId?: string | null };
type Resolved = { value: unknown; source: string; scopeId?: string; templateKey: string | null; differsFromTemplate: boolean };
type Snapshot = { v: number; domain: string; at: string; template: { key: string; version: number }; values: Record<string, unknown>; sources: Record<string, string> };
type ChangeRow = { key: string; scope: string; scopeId: string; unitId: string | null; before: unknown; after: unknown; legalLevel: string; legalCode: string | null; reason: string | null; approvalId: string | null; actorId: string; effectiveFrom: Date };
type DiffRow = { key: string; scope: string; scopeId: string; value: unknown; templateValue: unknown };
type DefLike = { key: string; domain: string; group: string; type: string; chain: string[]; editPermission: string; defaults: Record<string, unknown>; ownerOnly?: boolean; sensitivity?: string; legal?: string[]; requires?: { integration?: string }; effectiveDated?: boolean; templateVars?: string[]; labelTh?: string; schema: unknown };
type SettingsApi = {
  resolveSetting: (ctx: Ctx, key: string, refs: Refs, at?: Date) => Promise<Resolved>;
  resolveSettings: (ctx: Ctx, keys: string[], refs: Refs, at?: Date) => Promise<Record<string, Resolved>>;
  settingsDiff: (ctx: Ctx, q: { unitId: string; domain: string; actor?: Actor }) => Promise<DiffRow[]>;
  setSettings: (actor: Actor, ctx: Ctx, changes: Change[], opts?: { ackLegalWarn?: boolean }) => Promise<SetRes>;
  resetSetting: (actor: Actor, ctx: Ctx, t: { key: string; scope: string; scopeId: string }) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: Ctx, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  settingHistory: (ctx: Ctx, q: { unitId?: string; key?: string; actor?: Actor }) => Promise<ChangeRow[]>;
  snapshotPolicy: (ctx: Ctx, kind: string, refs: Refs, at?: Date) => Promise<Snapshot>;
  fromSnapshot: (snap: Snapshot, key: string) => unknown;
  renderTemplate: (def: DefLike, value: unknown, vars: Record<string, string>, locale: string) => string;
  validateGroup: (domain: string, group: string, values: Record<string, unknown>) => Issue[];
  getDef: (key: string) => DefLike | undefined;
  listDefs: (domain: string, group?: string) => DefLike[];
  TEMPLATES: Record<string, readonly { key: string; version: number; labelTh?: string }[]>;
  SNAPSHOT_KEYS: Record<string, readonly string[]>;
};
type RegistryApi = { defineSettings: (domain: string, defs: unknown[], opts?: Record<string, unknown>) => void; getDef: (key: string) => DefLike | undefined };
type ModelApi = {
  create: (a: unknown) => Promise<{ id: string } & Record<string, unknown>>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a?: unknown) => Promise<Record<string, unknown> | null>;
  count: (a?: unknown) => Promise<number>;
  deleteMany: (a?: unknown) => Promise<unknown>;
};
type Db = Record<string, ModelApi> & {
  $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T>;
  $disconnect: () => Promise<void>;
};

const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try {
    return { mod: (await import(spec as string)) as T, err: "" };
  } catch (e) {
    return { mod: null, err: errMsg(e) };
  }
};

// ═══════════════ S. ไฟล์ · ความบริสุทธิ์ · ทะเบียน (ไม่ต้องใช้ฐาน) ═══════════════
console.log("\nS. ไฟล์ · ความบริสุทธิ์ · ทะเบียน event/approval/สิทธิ์");
const SET_DIR = "src/lib/core/settings";
const FILES = ["types.ts", "registry.ts", "template.ts", "service.ts", "index.ts", "actions.ts", "defs/payments.ts", "defs/messaging.ts", "defs/_fixture.ts"].map((f) => `${SET_DIR}/${f}`);
const read = (rel: string): string => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

await st("S-1", "มีไฟล์ครบ 9 ไฟล์ตามใบสั่ง §1", () => {
  const miss = FILES.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ขาด ${miss.join(", ")}`);
});

// import graph: ไฟล์ pure ห้ามถึง prisma/db/next/โมดูล (ตรงหรืออ้อม) · `import type` ไม่นับ
const FORBIDDEN_SPEC = [/^@prisma\/client$/, /^@\/lib\/core\/db$/, /^next($|\/)/, /^server-only$/, /^@\/lib\/modules\//, /^@\/lib\/platform\//, /^pg$/, /^@\/lib\/core\/(audit|outbox)$/];
const resolveImport = (fromFile: string, spec: string): string | null => {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(dirname(fromFile), spec);
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
};
const valueImports = (src: string): string[] => {
  const out: string[] = [];
  const s = stripComments(src);
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[2]) continue; // import type / export type
    if (m[1] === "export" && !m[3]) continue;
    out.push(m[4]);
  }
  for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
};
const impureReach = (entry: string): string[] => {
  const bad: string[] = [];
  const seen = new Set<string>();
  const walk = (abs: string, trail: string) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    const src = readFileSync(abs, "utf8");
    for (const spec of valueImports(src)) {
      if (FORBIDDEN_SPEC.some((r) => r.test(spec))) {
        bad.push(`${trail} → ${spec}`);
        continue;
      }
      const next = resolveImport(abs, spec);
      if (next && /settings[\\/]service\.ts$/.test(next)) {
        bad.push(`${trail} → service.ts`);
        continue;
      }
      if (next && next.startsWith(join(ROOT, "src"))) walk(next, `${trail} → ${next.slice(ROOT.length + 1)}`);
    }
  };
  walk(join(ROOT, entry), entry);
  return bad;
};
await st("S-2", "types/registry/template/defs/* บริสุทธิ์ (ไม่ถึง prisma/db/next/โมดูล/service ทั้งตรงและอ้อม)", () => {
  const pure = [`${SET_DIR}/types.ts`, `${SET_DIR}/registry.ts`, `${SET_DIR}/template.ts`, `${SET_DIR}/defs/payments.ts`, `${SET_DIR}/defs/messaging.ts`, `${SET_DIR}/defs/_fixture.ts`];
  const miss = pure.filter((f) => !existsSync(join(ROOT, f)));
  ok(miss.length === 0, `ยังไม่มี ${miss.join(", ")}`);
  const bad = pure.flatMap((f) => impureReach(f));
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
const walkSrc = (dir: string, acc: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walkSrc(p, acc);
    else if (/\.(ts|tsx|mts)$/.test(n)) acc.push(p);
  }
  return acc;
};
const SRC_FILES = walkSrc(join(ROOT, "src"));
await st("S-3", "ไม่มีไฟล์ใน src/ import defs/_fixture (ฟิกซ์เจอร์ QC เท่านั้น)", () => {
  const hit = SRC_FILES.filter((f) => !f.endsWith("_fixture.ts") && valueImports(readFileSync(f, "utf8")).some((s) => /settings\/defs\/_fixture$|\/_fixture$/.test(s)));
  ok(hit.length === 0, hit.map((f) => f.slice(ROOT.length + 1)).join(", "));
});
await st("S-4", 'actions.ts: "use server" + export async function เท่านั้น + saveSettingsAction/resetSettingAction/applyTemplateAction', () => {
  const s = read(`${SET_DIR}/actions.ts`);
  ok(s.length > 0, "ยังไม่มี actions.ts");
  const body = stripComments(s).trim();
  ok(/^["']use server["']/.test(body), 'บรรทัดแรก (ไม่นับคอมเมนต์) ต้องเป็น "use server"');
  const exps = [...body.matchAll(/^\s*export\s+(?!async\s+function)(\S+)/gm)].map((m) => m[0].trim());
  ok(exps.length === 0, `export ที่ไม่ใช่ async function: ${exps.join(" | ")}`);
  for (const n of ["saveSettingsAction", "resetSettingAction", "applyTemplateAction"]) ok(new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(body), `ไม่มี ${n}`);
});
await st("S-5", "event settings.changed ลง 3 ทะเบียน (consumer · automation · webhook)", async () => {
  ok(/["']settings\.changed["']\s*:/.test(stripComments(read("src/lib/outbox-consumers.ts"))), "outbox-consumers.ts ไม่มี consumer \"settings.changed\"");
  const a = (await import("@/lib/automation/labels" as string)) as { AUTOMATION_EVENTS: { value: string; label: string }[] };
  const w = (await import("@/lib/webhooks/labels" as string)) as { WEBHOOK_EVENTS: { value: string; label: string }[] };
  const ae = a.AUTOMATION_EVENTS.find((e) => e.value === "settings.changed");
  const we = w.WEBHOOK_EVENTS.find((e) => e.value === "settings.changed");
  ok(!!ae && /[฀-๿]/.test(ae.label), "AUTOMATION_EVENTS ไม่มี settings.changed (ป้ายไทย)");
  ok(!!we && /[฀-๿]/.test(we.label), "WEBHOOK_EVENTS ไม่มี settings.changed (ป้ายไทย)");
});
await st("S-6", "approval entityType settings.legal_override ลง 3 ที่ (labels · actions allowlist · approval-effects)", async () => {
  const l = (await import("@/lib/modules/approval/labels" as string)) as { ENTITY_TYPES: readonly { value: string; label: string }[] };
  const e = l.ENTITY_TYPES.find((x) => x.value === "settings.legal_override");
  ok(!!e && /[฀-๿]/.test(e.label), "labels.ts ENTITY_TYPES ไม่มี settings.legal_override (ป้ายไทย)");
  ok(/["']settings\.legal_override["']/.test(stripComments(read("src/lib/modules/approval/actions.ts"))), "approval/actions.ts allowlist ไม่มี");
  ok(/["']settings\.legal_override["']/.test(stripComments(read("src/lib/approval-effects.ts"))), "approval-effects.ts ไม่มีกิ่ง");
});
await st("S-7", "คีย์สิทธิ์ settings.payments.edit · settings.messaging.edit ลงทะเบียน + ป้ายไทย", async () => {
  const p = (await import("@/lib/core/permissions" as string)) as { PERMISSION_KEYS: ReadonlySet<string>; permissionLabel: (k: string) => string };
  for (const k of ["settings.payments.edit", "settings.messaging.edit"]) {
    ok(p.PERMISSION_KEYS.has(k), `ไม่มี ${k}`);
    ok(/[฀-๿]/.test(p.permissionLabel(k)), `${k} ไม่มีป้ายไทย`);
  }
});
await st("S-8", "SettingChange เขียนต่อท้ายอย่างเดียว (ไม่มี settingChange.update/delete/upsert ใน src)", () => {
  const hit = SRC_FILES.filter((f) => /settingChange\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\s*\(/.test(stripComments(readFileSync(f, "utf8"))));
  ok(hit.length === 0, hit.map((f) => f.slice(ROOT.length + 1)).join(", "));
});
await st("S-9", "ไม่มี any ในไฟล์ของใบ + service ใช้ evaluateLegal ของ legal/th-rental-2568 (ไม่เขียนตรรกะโหมดซ้ำ)", () => {
  const anyHit = FILES.filter((f) => /(:\s*any\b|\bas\s+any\b|<any>|\bany\[\])/.test(stripComments(read(f))));
  ok(anyHit.length === 0, `มี any: ${anyHit.join(", ")}`);
  const svc = stripComments(read(`${SET_DIR}/service.ts`));
  ok(/legal\/th-rental-2568["']/.test(svc) && /\bevaluateLegal\s*\(/.test(svc), "service.ts ต้อง import และเรียก evaluateLegal จาก ./legal/th-rental-2568");
}, "MAJOR");

// ═══════════════ โหลดโมดูล ═══════════════
const fx = await tryImport<unknown>("@/lib/core/settings/defs/_fixture");
const facade = await tryImport<SettingsApi>("@/lib/core/settings");
const reg = await tryImport<RegistryApi>("@/lib/core/settings/registry");
const S: SettingsApi | null = facade.mod && fx.mod ? facade.mod : null;
const missingWhy = !existsSync(join(ROOT, SET_DIR, "index.ts")) ? `ยังไม่มี «${SET_DIR}/index.ts» (ใบ R0.3 ยังไม่ลง)` : !facade.mod ? `โหลด facade ไม่ได้: ${facade.err}` : !fx.mod ? `ยังไม่มี/โหลด defs/_fixture ไม่ได้: ${fx.err}` : "";
/** ข้อสอบที่ต้องใช้โมดูล — โมดูลยังไม่มี ⇒ SKIP พร้อมเหตุผล */
const t = async (id: string, name: string, fn: (s: SettingsApi) => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  if (!S) return record(id, name, "SKIP", missingWhy, sev);
  try {
    await fn(S);
    record(id, name, "PASS", "", sev);
  } catch (e) {
    record(id, name, "FAIL", errMsg(e), sev);
  }
};
await st("M-0", "โหลด facade @/lib/core/settings + defs/_fixture ได้", () => ok(!!S, missingWhy));

// ═══════════════ R. ทะเบียน (pure) ═══════════════
console.log("\nR. ทะเบียน (pure)");
const FX_KEYS = [
  "qcfx.general.label", "qcfx.late.graceMin", "qcfx.late.noShowAfterMin", "qcfx.fee.rentSatang", "qcfx.legal.mode",
  "qcfx.legal.outOfScopeReason", "qcfx.deposit.returnDays", "qcfx.deposit.autoVerify", "qcfx.msg.reminder", "qcfx.owner.payoutNote",
];
const K = {
  label: "qcfx.general.label", grace: "qcfx.late.graceMin", noShow: "qcfx.late.noShowAfterMin", rent: "qcfx.fee.rentSatang", mode: "qcfx.legal.mode",
  reason: "qcfx.legal.outOfScopeReason", ret: "qcfx.deposit.returnDays", auto: "qcfx.deposit.autoVerify", msg: "qcfx.msg.reminder", payout: "qcfx.owner.payoutNote",
} as const;
await t("R-1", "ฟิกซ์เจอร์ลงทะเบียนครบ 10 ค่าตามใบสั่ง §8 (chain · ค่าเริ่ม · ธง)", (s) => {
  eq(s.listDefs("qcfx").map((d) => d.key).sort(), [...FX_KEYS].sort(), "listDefs(qcfx)");
  eq(s.listDefs("qcfx", "late").map((d) => d.key).sort(), [K.grace, K.noShow].sort(), "listDefs(qcfx, late)");
  const d = (k: string) => {
    const x = s.getDef(k);
    if (!x) throw new AssertFail(`ไม่มี def ${k}`);
    return x;
  };
  eq(d(K.grace).chain, ["TENANT", "UNIT", "SERVICE", "STAFF"], "chain graceMin");
  eq(d(K.rent).chain, ["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM"], "chain rent");
  eq([d(K.rent).defaults.QCFX_A, d(K.rent).defaults.QCFX_B, d(K.rent).defaults._fallback, d(K.rent).effectiveDated, d(K.rent).sensitivity], [350000, 420000, 0, true, "MONEY"], "rent");
  eq([d(K.mode).sensitivity, d(K.mode).ownerOnly ?? false], ["LEGAL", false], "mode (LEGAL ไม่ใส่ ownerOnly)");
  eq(d(K.ret).legal, ["DEPOSIT_RETURN_DAYS"], "returnDays.legal");
  eq(d(K.msg).legal, ["TEMPLATE_NO_THREAT"], "msg.legal");
  eq(d(K.auto).requires, { integration: "SLIP_VERIFY" }, "autoVerify.requires");
  eq(d(K.payout).ownerOnly, true, "payout.ownerOnly");
  for (const k of FX_KEYS) ok(d(k).domain === "qcfx" && d(k).editPermission === "qcfx.settings.edit" && /[฀-๿]/.test(d(k).labelTh ?? ""), `${k}: domain/editPermission/labelTh`);
});
await t("R-2", "TEMPLATES.qcfx = QCFX_A v1 · QCFX_B v2 · SNAPSHOT_KEYS['qcfx.doc'] = 4 คีย์", (s) => {
  const tp = (s.TEMPLATES.qcfx ?? []).map((x) => [x.key, x.version]);
  eq(tp, [["QCFX_A", 1], ["QCFX_B", 2]], "TEMPLATES.qcfx");
  eq([...(s.SNAPSHOT_KEYS["qcfx.doc"] ?? [])].sort(), [K.grace, K.noShow, K.rent, K.ret].sort(), "SNAPSHOT_KEYS qcfx.doc");
});
const zmod = (await import("zod" as string)) as { z: { number: () => { int: () => { min: (n: number) => { max: (n: number) => unknown } } } } };
const intSchema = () => zmod.z.number().int().min(0).max(10);
const negDef = (key: string, over: Record<string, unknown> = {}) => ({
  key, domain: "qcfx", group: "neg", labelTh: "ทดสอบ", type: "int", schema: intSchema(),
  defaults: { _fallback: 1 }, chain: ["TENANT", "UNIT"], editPermission: "qcfx.settings.edit", ...over,
});
const throwsReg = (fn: () => void): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
await t("R-3", "defineSettings ตรวจทะเบียนตอนโหลด: key ซ้ำ · chain ผิด 3 แบบ · ค่าเริ่มแม่แบบไม่ผ่าน zod · snapshot อ้างคีย์ไม่มี ⇒ throw และไม่ลงอะไร", () => {
  if (!reg.mod) throw new AssertFail(`โหลด registry ไม่ได้: ${reg.err}`);
  const R = reg.mod;
  const bad: string[] = [];
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef(K.label)]))) bad.push("key ซ้ำไม่ throw");
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef("qcfx.neg.c1", { chain: ["UNIT", "TENANT"] })]))) bad.push("chain UNIT→TENANT ไม่ throw");
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef("qcfx.neg.c2", { chain: ["TENANT", "UNIT", "UNIT"] })]))) bad.push("chain ซ้ำไม่ throw");
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef("qcfx.neg.c3", { chain: ["TENANT", "GALAXY"] })]))) bad.push("chain ไม่รู้จักไม่ throw");
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef("qcfx.neg.d1", { defaults: { QCFX_A: 99, _fallback: 1 } })]))) bad.push("ค่าเริ่มแม่แบบเกินช่วงไม่ throw");
  if (!throwsReg(() => R.defineSettings("qcfx", [negDef("qcfx.neg.s1")], { snapshots: { "qcfx.neg": ["qcfx.nope.x"] } }))) bad.push("snapshot อ้างคีย์ไม่มีไม่ throw");
  for (const k of ["qcfx.neg.c1", "qcfx.neg.c2", "qcfx.neg.c3", "qcfx.neg.d1", "qcfx.neg.s1"]) if (R.getDef(k)) bad.push(`${k} ลงทะเบียนทั้งที่ throw`);
  ok(bad.length === 0, bad.join(" · "));
});
await t("R-4", "validateGroup (pure): noShow ≤ grace ⇒ issue NO_SHOW_BEFORE_GRACE ไทย · ถูก ⇒ [] · OUT_OF_SCOPE ไร้เหตุผล ⇒ issue", (s) => {
  const bad = s.validateGroup("qcfx", "late", { [K.grace]: 30, [K.noShow]: 20 });
  ok(bad.length >= 1 && bad.some((i) => i.code === "NO_SHOW_BEFORE_GRACE" && /[฀-๿]/.test(i.messageTh)), `ได้ ${fmt(bad)}`);
  eq(s.validateGroup("qcfx", "late", { [K.grace]: 10, [K.noShow]: 20 }), [], "late ถูก");
  const lg = s.validateGroup("qcfx", "legal", { [K.mode]: "OUT_OF_SCOPE", [K.reason]: "   " });
  ok(lg.some((i) => i.code === "OUT_OF_SCOPE_REASON_REQUIRED"), `legal ได้ ${fmt(lg)}`);
  eq(s.validateGroup("qcfx", "legal", { [K.mode]: "OUT_OF_SCOPE", [K.reason]: "ให้เช่าเพียงสองห้องเท่านั้นครับ" }), [], "legal มีเหตุผล");
});
await t("R-5", "renderTemplate: แทนตัวแปร · ตัวแปรไม่ส่ง = ว่าง · en ไม่มี ⇒ th", (s) => {
  const d = s.getDef(K.msg);
  if (!d) throw new AssertFail("ไม่มี def msg");
  eq(s.renderTemplate(d, { th: "เรียน {ชื่อ} ยอด {ยอด}", en: "Dear {ชื่อ}" }, { ชื่อ: "สมชาย", ยอด: "1,500" }, "th"), "เรียน สมชาย ยอด 1,500", "th");
  eq(s.renderTemplate(d, { th: "เรียน {ชื่อ} ยอด {ยอด}", en: "Dear {ชื่อ}" }, { ชื่อ: "สมชาย" }, "en"), "Dear สมชาย", "en");
  eq(s.renderTemplate(d, { th: "ห้อง {ห้อง}." }, {}, "en"), "ห้อง .", "en ไม่มี ⇒ th · ตัวแปรไม่ส่ง = ว่าง");
}, "MAJOR");
await t("R-6", "defs/payments.ts ตาม CC §3.4 (ค่าเริ่ม · chain TENANT→UNIT · autoApprove ต้อง SLIP_VERIFY · receiver ownerOnly)", async (s) => {
  const want: [string, unknown][] = [
    ["payments.receiver", null], ["payments.slip.autoApprove", false], ["payments.slip.toleranceSatang", 0],
    ["payments.slip.payerNameMatch", "WARN"], ["payments.slip.maxAgeHours", 72], ["payments.slip.onVerifierDown", "MANUAL"],
  ];
  const p = (await import("@/lib/core/permissions" as string)) as { PERMISSION_KEYS: ReadonlySet<string> };
  for (const [k, v] of want) {
    const d = s.getDef(k);
    if (!d) throw new AssertFail(`ไม่มี ${k}`);
    eq(d.defaults._fallback, v, `${k} _fallback`);
    eq(d.chain, ["TENANT", "UNIT"], `${k} chain`);
    ok(d.domain === "payments" && p.PERMISSION_KEYS.has(d.editPermission), `${k} domain/editPermission`);
  }
  eq(s.getDef("payments.slip.autoApprove")?.requires, { integration: "SLIP_VERIFY" }, "autoApprove.requires");
  eq(s.getDef("payments.receiver")?.ownerOnly, true, "receiver.ownerOnly");
});
await t("R-7", "defs/messaging.ts ตาม CC §4.4 (channelOrder · lineConnectionId ระดับ UNIT · quietHours)", async (s) => {
  const p = (await import("@/lib/core/permissions" as string)) as { PERMISSION_KEYS: ReadonlySet<string> };
  const co = s.getDef("messaging.channelOrder");
  const ln = s.getDef("messaging.lineConnectionId");
  const qh = s.getDef("messaging.quietHours");
  ok(!!co && !!ln && !!qh, "ขาด def messaging");
  eq(co?.defaults._fallback, ["LINE", "WEB_LINK"], "channelOrder");
  eq(ln?.defaults._fallback, null, "lineConnectionId");
  ok((ln?.chain ?? []).includes("UNIT"), "lineConnectionId ต้องตั้งระดับ UNIT ได้");
  for (const d of s.listDefs("messaging")) ok(p.PERMISSION_KEYS.has(d.editPermission), `${d.key} editPermission ไม่อยู่ใน PERMISSION_KEYS`);
});

// ═══════════════ ฐานข้อมูล ═══════════════
const dbMod = await tryImport<{ prisma: unknown }>("@/lib/core/db");
if (!dbMod.mod) {
  console.error(`🔴 ${LABEL}: โหลด @/lib/core/db ไม่ได้ — ${dbMod.err}`);
  process.exit(4);
}
const db = dbMod.mod.prisma as Db;
const SLUG = "qc-svc-r03-";
const tenantIds: string[] = [];
const MODELS_BY_TENANT = [
  "settingChange", "settingValue", "settingProfile", "tenantIntegration", "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
  "appNotification", "outboxEvent", "auditLog", "hotelRoom", "hotelRoomType", "roomBuilding", "bookingStaff", "bookingService", "businessUnit",
];
const cleanup = async (ids: string[]) => {
  for (const id of ids) {
    for (const m of MODELS_BY_TENANT) {
      try {
        await db[m].deleteMany({ where: { tenantId: id } });
      } catch {
        /* ตารางไม่มี/ไม่มีคอลัมน์ — ข้าม */
      }
    }
    try {
      await db.tenant.deleteMany({ where: { id } });
    } catch (e) {
      console.log(`  ⚠️ ลบ tenant ${id}: ${errMsg(e)}`);
    }
  }
};
// กวาดของค้างจากรอบก่อน
try {
  const stale = await db.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) {
    console.log(`\n(กวาด tenant ค้าง ${stale.length})`);
    await cleanup(stale.map((r) => String(r.id)));
  }
} catch (e) {
  console.log(`  ⚠️ กวาดของค้าง: ${errMsg(e)}`);
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const DAY = 86_400_000;
const FUT = new Date(Date.now() + 30 * DAY);
const FUT2 = new Date(Date.now() + 31 * DAY);

try {
  // ── ฉาก: ร้าน A (สาขา A1 · A2) · ร้าน B (สาขา B1) ──
  const mkTenant = async (name: string) => {
    const r = await db.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } });
    tenantIds.push(r.id);
    return r.id;
  };
  const tA = await mkTenant("QC R0.3 ร้าน A");
  const tB = await mkTenant("QC R0.3 ร้าน B");
  const mkUnit = async (tenantId: string, name: string) => (await db.businessUnit.create({ data: { tenantId, type: "HOTEL", name, slug: `u-${uid()}` } })).id;
  const A1 = await mkUnit(tA, "สาขา A1");
  const A2 = await mkUnit(tA, "สาขา A2");
  const B1 = await mkUnit(tB, "สาขา B1");
  const mkStaff = async (tenantId: string, unitId: string, name: string) => (await db.bookingStaff.create({ data: { tenantId, unitId, name } })).id;
  const ST1 = await mkStaff(tA, A1, "ช่าง 1");
  const ST2 = await mkStaff(tA, A1, "ช่าง 2");
  const ST3 = await mkStaff(tA, A2, "ช่าง 3 (A2)");
  const STB = await mkStaff(tB, B1, "ช่าง ร้าน B");
  const SV1 = (await db.bookingService.create({ data: { tenantId: tA, unitId: A1, name: "ตัดผม", durationMin: 30 } })).id;
  const BL1 = (await db.roomBuilding.create({ data: { tenantId: tA, unitId: A1, name: "ตึก A", floors: 3, sortOrder: 0 } })).id;
  const RT1 = (await db.hotelRoomType.create({ data: { tenantId: tA, unitId: A1, name: "ห้องมาตรฐาน" } })).id;
  const RM1 = (await db.hotelRoom.create({ data: { tenantId: tA, unitId: A1, roomTypeId: RT1, number: "201", buildingId: BL1 } })).id;

  const ctxA: Ctx = { tenantId: tA };
  const ctxB: Ctx = { tenantId: tB };
  const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: "qc-r03-owner" };
  const OWNER_B: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: "qc-r03-owner-b" };
  const MGR_ALL: Actor = { role: "MANAGER", unitAccess: ["*"], permissions: {}, userId: "qc-r03-mgr" };
  const MGR_A1: Actor = { role: "MANAGER", unitAccess: [A1], permissions: {}, userId: "qc-r03-mgr-a1" };
  const STAFF_A1: Actor = { role: "STAFF", unitAccess: [A1], permissions: { "qcfx.settings.edit": true }, userId: "qc-r03-staff" };
  const STAFF_NOPERM: Actor = { role: "STAFF", unitAccess: [A1], permissions: {}, userId: "qc-r03-staff-np" };
  const REASON = "ร้านตกลงกับผู้เช่าเป็นลายลักษณ์อักษรแล้ว";

  const svCount = (tenantId: string) => db.settingValue.count({ where: { tenantId } });
  const chCount = (tenantId: string) => db.settingChange.count({ where: { tenantId } });
  const obCount = (tenantId: string) => db.outboxEvent.count({ where: { tenantId, type: "settings.changed" } });
  const snapCounts = async (tenantId: string) => [await svCount(tenantId), await chCount(tenantId), await obCount(tenantId)];
  const rv = async (s: SettingsApi, key: string, refs: Refs, at?: Date) => s.resolveSetting(ctxA, key, refs, at);
  const mustOk = (r: SetRes, what: string) => ok(r.ok === true, `${what}: ${fmt(r)}`);
  const mustCode = (r: SetRes, code: string, what: string) => ok(r.ok === false && r.code === code, `${what}: ต้อง ${code} ได้ ${fmt(r)}`);
  const thaiIssue = (r: SetRes) => (r.issues ?? []).some((i) => /[฀-๿]/.test(i.messageTh ?? ""));
  const lastChange = async (key: string, scope: string, scopeId: string) =>
    (await db.settingChange.findFirst({ where: { tenantId: tA, key, scope, scopeId }, orderBy: { at: "desc" } })) as ChangeRow | null;

  // ═══════════════ D. แม่แบบ/ค่าเริ่ม ═══════════════
  console.log("\nD. ค่าเริ่ม · แม่แบบ");
  await t("D-1", "ไม่มี SettingProfile ⇒ _fallback (source FALLBACK · templateKey null)", async (s) => {
    const r = await rv(s, K.label, { unitId: A1 });
    eq([r.value, r.source, r.templateKey], ["พนักงาน", "FALLBACK", null], "label A1");
  });
  await t("D-2", "applyTemplate QCFX_A (เจ้าของ) ⇒ SettingProfile v1 · ค่า TEMPLATE · differsFromTemplate=false · audit settings.template.apply · outbox", async (s) => {
    const ob0 = await obCount(tA);
    mustOk(await s.applyTemplate(OWNER, ctxA, { unitId: A1, domain: "qcfx", templateKey: "QCFX_A", overwrite: "KEEP_CUSTOM" }), "apply A1");
    mustOk(await s.applyTemplate(OWNER, ctxA, { unitId: A2, domain: "qcfx", templateKey: "QCFX_A", overwrite: "KEEP_CUSTOM" }), "apply A2");
    const prof = await db.settingProfile.findFirst({ where: { tenantId: tA, unitId: A1, domain: "qcfx" } });
    eq([prof?.templateKey, prof?.templateVersion, prof?.appliedById], ["QCFX_A", 1, OWNER.userId], "SettingProfile A1");
    const r = await rv(s, K.label, { unitId: A1 });
    eq([r.value, r.source, r.templateKey, r.differsFromTemplate], ["ช่าง", "TEMPLATE", "QCFX_A", false], "label A1");
    eq((await rv(s, K.grace, { unitId: A1 })).value, 10, "graceMin A1");
    ok((await db.auditLog.count({ where: { tenantId: tA, action: "settings.template.apply" } })) >= 2, "ไม่มี audit settings.template.apply");
    ok((await obCount(tA)) >= ob0 + 2, "ไม่มี outbox settings.changed ของ applyTemplate");
  });
  await t("D-3", "applyTemplate: MANAGER ⇒ PERMISSION · แม่แบบไม่รู้จัก ⇒ VALIDATION · สาขาร้านอื่น ⇒ NOT_FOUND", async (s) => {
    mustCode(await s.applyTemplate(MGR_ALL, ctxA, { unitId: A1, domain: "qcfx", templateKey: "QCFX_B", overwrite: "KEEP_CUSTOM" }), "PERMISSION", "MANAGER");
    mustCode(await s.applyTemplate(OWNER, ctxA, { unitId: A1, domain: "qcfx", templateKey: "QCFX_ZZ", overwrite: "KEEP_CUSTOM" }), "VALIDATION", "แม่แบบไม่รู้จัก");
    mustCode(await s.applyTemplate(OWNER, ctxA, { unitId: B1, domain: "qcfx", templateKey: "QCFX_A", overwrite: "KEEP_CUSTOM" }), "NOT_FOUND", "สาขาร้าน B");
    eq((await db.settingProfile.findFirst({ where: { tenantId: tA, unitId: A1, domain: "qcfx" } }))?.templateKey, "QCFX_A", "profile A1 ไม่เปลี่ยน");
    eq(await db.settingProfile.count({ where: { unitId: B1 } }), 0, "ไม่มี profile ของ B1");
  });

  // ═══════════════ P. ชั้นเจาะจงชนะ ═══════════════
  console.log("\nP. ชั้นเจาะจงชนะ");
  const pairTest = async (s: SettingsApi, key: string, chain: string[], ids: string[], vals: number[], refs: Refs) => {
    const fails: string[] = [];
    for (let i = 0; i < chain.length; i++)
      for (let j = i + 1; j < chain.length; j++) {
        const w = await s.setSettings(OWNER, ctxA, [
          { key, scope: chain[i], scopeId: ids[i], value: vals[i] },
          { key, scope: chain[j], scopeId: ids[j], value: vals[j] },
        ]);
        if (!w.ok) {
          fails.push(`${chain[i]}+${chain[j]} เขียนไม่ได้ ${fmt(w)}`);
          continue;
        }
        const r = await rv(s, key, refs);
        if (r.value !== vals[j] || r.source !== chain[j] || r.scopeId !== ids[j]) fails.push(`${chain[i]}+${chain[j]} ⇒ ${fmt([r.value, r.source, r.scopeId])}`);
        for (const k of [i, j]) {
          const x = await s.resetSetting(OWNER, ctxA, { key, scope: chain[k], scopeId: ids[k] });
          if (!x.ok || x.removed !== 1) fails.push(`reset ${chain[k]} ${fmt(x)}`);
        }
      }
    ok(fails.length === 0, fails.slice(0, 3).join(" | "));
  };
  await t("P-1", "graceMin ทุกคู่ชั้น (TENANT·UNIT·SERVICE·STAFF = 6 คู่): ตัวท้ายใน chain ชนะ · source/scopeId ถูก", (s) =>
    pairTest(s, K.grace, ["TENANT", "UNIT", "SERVICE", "STAFF"], [tA, A1, SV1, ST1], [11, 12, 13, 14], { unitId: A1, serviceId: SV1, staffId: ST1 }));
  await t("P-2", "rent ทุกคู่ชั้น (TENANT·UNIT·BUILDING·ROOM_TYPE·ROOM = 10 คู่)", (s) =>
    pairTest(s, K.rent, ["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM"], [tA, A1, BL1, RT1, RM1], [300001, 300002, 300003, 300004, 300005], { unitId: A1, buildingId: BL1, roomTypeId: RT1, roomId: RM1 }));
  await t("P-3", "แถวของช่างอื่นไม่มีผล · ไม่ส่ง ref ชั้นนั้น = ไม่ใช้ชั้นนั้น", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "STAFF", scopeId: ST2, value: 9 }]), "ST2 grace 9");
    eq((await rv(s, K.grace, { unitId: A1, staffId: ST1 })).value, 10, "ST1");
    eq((await rv(s, K.grace, { unitId: A1, staffId: ST2 })).value, 9, "ST2");
    eq((await rv(s, K.grace, { unitId: A1 })).source, "TEMPLATE", "ไม่ส่ง staffId");
  });
  await t("P-4", "ค่า UNIT ต่างจากแม่แบบ ⇒ source UNIT · differsFromTemplate=true + แถวประวัติ/audit/outbox ถูกรูป (H)", async (s) => {
    const a0 = await db.auditLog.count({ where: { tenantId: tA, action: "settings.set" } });
    const ob0 = await obCount(tA);
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A1, value: "ช่างตัดผม" }]), "label A1");
    const r = await rv(s, K.label, { unitId: A1 });
    eq([r.value, r.source, r.scopeId, r.differsFromTemplate], ["ช่างตัดผม", "UNIT", A1, true], "label A1");
    const c = await lastChange(K.label, "UNIT", A1);
    eq([c?.before ?? null, c?.after, c?.unitId, c?.actorId, c?.legalLevel, c?.effectiveFrom?.toISOString()], [null, "ช่างตัดผม", A1, OWNER.userId, "OK", "1970-01-01T00:00:00.000Z"], "SettingChange");
    eq(await db.auditLog.count({ where: { tenantId: tA, action: "settings.set" } }), a0 + 1, "audit settings.set +1");
    eq(await obCount(tA), ob0 + 1, "outbox settings.changed +1");
    const ev = await db.outboxEvent.findFirst({ where: { tenantId: tA, type: "settings.changed" }, orderBy: { createdAt: "desc" } });
    eq(ev?.payload, { tenantId: tA, unitId: A1, domain: "qcfx", keys: [K.label], scope: "UNIT", scopeId: A1 }, "payload (ไม่มีค่า)");
  });
  await t("P-5", "resolveSettings (ชุด) = resolveSetting ทีละตัว", async (s) => {
    const refs: Refs = { unitId: A1, staffId: ST2, serviceId: SV1, buildingId: BL1, roomTypeId: RT1, roomId: RM1 };
    const keys = [K.label, K.grace, K.noShow, K.rent, K.ret, K.msg];
    const m = await s.resolveSettings(ctxA, keys, refs);
    for (const k of keys) eq(m[k], await rv(s, k, refs), k);
  });
  await t("P-6", "ไม่มีแคชข้ามการเรียก: แถวที่เพิ่มตรงในฐานเห็นทันที", async (s) => {
    eq((await rv(s, K.noShow, { unitId: A2 })).value, 20, "ก่อน");
    const row = await db.settingValue.create({ data: { tenantId: tA, key: K.noShow, scope: "TENANT", scopeId: tA, value: 25 } });
    try {
      eq([(await rv(s, K.noShow, { unitId: A2 })).value, (await rv(s, K.noShow, { unitId: A2 })).source], [25, "TENANT"], "หลังเพิ่มแถว");
    } finally {
      await db.settingValue.deleteMany({ where: { id: row.id } });
    }
    eq((await rv(s, K.noShow, { unitId: A2 })).value, 20, "หลังลบแถว");
  });
  await t("P-7", "X1 อ่าน: แถวของร้าน B ที่ scopeId ชี้สาขา A1 ไม่มีผลกับร้าน A · ร้าน A อ่าน ref สาขาร้าน B ไม่เห็นค่าร้าน B", async (s) => {
    await db.settingValue.create({ data: { tenantId: tB, key: K.grace, scope: "UNIT", scopeId: A1, value: 99 } });
    ok((await rv(s, K.grace, { unitId: A1 })).value !== 99, "ค่าร้าน B รั่วเข้าร้าน A");
    mustOk(await s.setSettings(OWNER_B, ctxB, [{ key: K.label, scope: "UNIT", scopeId: B1, value: "ร้านบี" }]), "ร้าน B ตั้ง label B1");
    ok((await s.resolveSetting(ctxA, K.label, { unitId: B1 })).value !== "ร้านบี", "ร้าน A อ่านค่าร้าน B ได้");
    eq((await s.resolveSetting(ctxB, K.label, { unitId: B1 })).value, "ร้านบี", "ร้าน B อ่านค่าตัวเอง");
  });
  await t("P-8", "ค่าเท่ากับที่สืบจากชั้นบน ⇒ ไม่เก็บแถว (CC §1.2)", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "UNIT", scopeId: A2, value: 10 }]), "A2 grace = ค่าแม่แบบ");
    eq(await db.settingValue.count({ where: { tenantId: tA, key: K.grace, scope: "UNIT", scopeId: A2 } }), 0, "แถว UNIT A2");
  }, "MINOR");

  // ═══════════════ E. effectiveFrom ═══════════════
  console.log("\nE. effectiveFrom");
  await t("E-1", "ค่าวันที่มีผลในอนาคตยังไม่มีผลตอนนี้ · มีผลเมื่อ at ถึง", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.rent, scope: "UNIT", scopeId: A1, value: 360000 }]), "rent A1 360000");
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.rent, scope: "UNIT", scopeId: A1, value: 400000, effectiveFrom: FUT }]), "rent A1 400000 อนาคต");
    eq(await db.settingValue.count({ where: { tenantId: tA, key: K.rent, scope: "UNIT", scopeId: A1 } }), 2, "แถวต่อวันที่มีผล");
    eq((await rv(s, K.rent, { unitId: A1 })).value, 360000, "ตอนนี้");
    eq((await rv(s, K.rent, { unitId: A1 }, FUT2)).value, 400000, "อนาคต");
  });
  await t("E-2", "เลือกแถวล่าสุดต่อชั้นก่อนไล่ชั้น: ROOM (เก่า) ชนะ UNIT (ใหม่กว่า)", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.rent, scope: "ROOM", scopeId: RM1, value: 351000 }]), "ROOM 351000");
    const r = await rv(s, K.rent, { unitId: A1, buildingId: BL1, roomTypeId: RT1, roomId: RM1 }, FUT2);
    eq([r.value, r.source], [351000, "ROOM"], "อนาคต + ห้อง");
    mustOk(await s.resetSetting(OWNER, ctxA, { key: K.rent, scope: "ROOM", scopeId: RM1 }), "reset ROOM");
  });
  await t("E-3", "effectiveFrom บนค่าที่ไม่ใช่ effectiveDated ⇒ VALIDATION · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "UNIT", scopeId: A1, value: 12, effectiveFrom: FUT }]), "VALIDATION", "grace + effectiveFrom");
    eq(await snapCounts(tA), c0, "นับแถว");
  }, "MAJOR");

  // ═══════════════ SN. snapshot ═══════════════
  console.log("\nSN. snapshotPolicy");
  const fullRefs: Refs = { unitId: A1, staffId: ST1, serviceId: SV1, buildingId: BL1, roomTypeId: RT1, roomId: RM1 };
  await t("SN-1", "snapshotPolicy รูป v1 · domain · template {QCFX_A,1} · values/sources = resolver ณ ตอนนั้น · เฉพาะ SNAPSHOT_KEYS", async (s) => {
    const sn = await s.snapshotPolicy(ctxA, "qcfx.doc", fullRefs);
    eq([sn.v, sn.domain, sn.template], [1, "qcfx", { key: "QCFX_A", version: 1 }], "หัว");
    ok(!Number.isNaN(Date.parse(sn.at)), "at ต้องเป็น ISO");
    eq(sn.values, { [K.grace]: 10, [K.noShow]: 20, [K.rent]: 360000, [K.ret]: 7 }, "values");
    eq(sn.sources, { [K.grace]: "TEMPLATE", [K.noShow]: "TEMPLATE", [K.rent]: "UNIT", [K.ret]: "TEMPLATE" }, "sources");
    eq(JSON.parse(JSON.stringify(sn)), sn, "JSON ล้วน");
  });
  await t("SN-2", "แก้ค่าตั้งหลังจด ⇒ snapshot เดิม (ที่เก็บไว้) ไม่เปลี่ยน · fromSnapshot อ่านค่าเก่า · snapshot ใหม่ได้ค่าใหม่", async (s) => {
    const stored = JSON.stringify(await s.snapshotPolicy(ctxA, "qcfx.doc", fullRefs));
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "UNIT", scopeId: A1, value: 12 }]), "grace A1 12");
    const old = JSON.parse(stored) as Snapshot;
    eq(s.fromSnapshot(old, K.grace), 10, "fromSnapshot ค่าเก่า");
    eq((await s.snapshotPolicy(ctxA, "qcfx.doc", fullRefs)).values[K.grace], 12, "snapshot ใหม่");
    let threw = false;
    try {
      s.fromSnapshot(old, K.label);
    } catch {
      threw = true;
    }
    ok(threw, "fromSnapshot คีย์ที่ไม่ได้จด ⇒ ต้อง throw (ห้ามตกไปอ่าน resolver)");
  });
  await t("SN-3", "snapshotPolicy เคารพ at (ค่าอนาคต) · kind ไม่รู้จัก ⇒ throw", async (s) => {
    eq((await s.snapshotPolicy(ctxA, "qcfx.doc", fullRefs, FUT2)).values[K.rent], 400000, "at อนาคต");
    let threw = false;
    try {
      await s.snapshotPolicy(ctxA, "qcfx.nope", fullRefs);
    } catch {
      threw = true;
    }
    ok(threw, "kind ไม่รู้จักต้อง throw");
  }, "MAJOR");

  // ═══════════════ V. ตรวจค่า ═══════════════
  console.log("\nV. ตรวจค่า · ตรวจข้ามค่า · ตัวต่อ");
  await t("V-1", "ค่าผิดช่วง (zod) ⇒ VALIDATION + ข้อความไทย · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    const r = await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "UNIT", scopeId: A1, value: 500 }]);
    mustCode(r, "VALIDATION", "grace 500");
    ok(thaiIssue(r), `issues ต้องมีข้อความไทย: ${fmt(r.issues)}`);
    eq(await snapCounts(tA), c0, "นับแถว");
  });
  await t("V-2", "key ไม่รู้จัก · scope ไม่อยู่ใน chain · scope ไม่รู้จัก ⇒ VALIDATION", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: "qcfx.nope.x", scope: "UNIT", scopeId: A1, value: 1 }]), "VALIDATION", "key ไม่รู้จัก");
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "ROOM", scopeId: RM1, value: 3 }]), "VALIDATION", "ROOM ไม่อยู่ใน chain");
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "GALAXY", scopeId: A1, value: 3 }]), "VALIDATION", "scope ไม่รู้จัก");
  });
  await t("V-3", "ชุดที่มีข้อผิดข้อเดียว ⇒ ไม่มีอะไรลงเลย (SettingValue/SettingChange/outbox)", async (s) => {
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(OWNER, ctxA, [
      { key: K.label, scope: "UNIT", scopeId: A1, value: "เปลี่ยนแล้ว" },
      { key: K.grace, scope: "UNIT", scopeId: A1, value: 999 },
    ]), "VALIDATION", "ชุดผสม");
    eq(await snapCounts(tA), c0, "นับแถว");
    eq((await rv(s, K.label, { unitId: A1 })).value, "ช่างตัดผม", "label ไม่เปลี่ยน");
  });
  await t("V-4", "validateGroup ผ่าน setSettings: ST1 grace 25 ≥ noShow 20 ⇒ VALIDATION · แก้คู่ในชุดเดียว (A2 30/40) ⇒ ผ่าน + outbox 1 event 2 keys", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "STAFF", scopeId: ST1, value: 25 }]), "VALIDATION", "ST1 grace 25");
    const ob0 = await obCount(tA);
    mustOk(await s.setSettings(OWNER, ctxA, [
      { key: K.grace, scope: "UNIT", scopeId: A2, value: 30 },
      { key: K.noShow, scope: "UNIT", scopeId: A2, value: 40 },
    ]), "A2 30/40");
    eq(await obCount(tA), ob0 + 1, "outbox 1 event ต่อ scope");
    const ev = await db.outboxEvent.findFirst({ where: { tenantId: tA, type: "settings.changed" }, orderBy: { createdAt: "desc" } });
    eq([...((ev?.payload as { keys?: string[] } | undefined)?.keys ?? [])].sort(), [K.grace, K.noShow].sort(), "keys");
  });
  await t("V-5", "โหมด OUT_OF_SCOPE ไม่มีเหตุผล ⇒ VALIDATION (กลุ่ม legal) · ไม่เขียน", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.mode, scope: "UNIT", scopeId: A2, value: "OUT_OF_SCOPE" }]), "VALIDATION", "OOS ไร้เหตุผล");
    eq((await rv(s, K.mode, { unitId: A2 })).value, "STRICT", "โหมด A2");
  });
  await t("V-6", "ค่าที่ต้องเชื่อมตัวต่อ: ไม่มี/ไม่ครอบคลุมสาขา/ปิด/ของร้านอื่น ⇒ REQUIRES_INTEGRATION · CONNECTED ครอบคลุม ⇒ ผ่าน", async (s) => {
    const ti = (tenantId: string, label: string, unitIds: string[], status: string) =>
      db.tenantIntegration.create({ data: { tenantId, kind: "SLIP_VERIFY", provider: "FAKE", label, unitIds, status, createdById: "qc", updatedById: "qc" } });
    const set = () => s.setSettings(OWNER, ctxA, [{ key: K.auto, scope: "UNIT", scopeId: A1, value: true }]);
    mustCode(await set(), "REQUIRES_INTEGRATION", "ไม่มีตัวต่อ");
    await ti(tB, "qc-b", [], "CONNECTED");
    mustCode(await set(), "REQUIRES_INTEGRATION", "มีแต่ของร้าน B");
    await ti(tA, "qc-a2", [A2], "CONNECTED");
    mustCode(await set(), "REQUIRES_INTEGRATION", "ครอบคลุมแค่ A2");
    await ti(tA, "qc-a1-off", [A1], "DISABLED");
    mustCode(await set(), "REQUIRES_INTEGRATION", "ของ A1 แต่ปิด");
    await ti(tA, "qc-all", [], "CONNECTED");
    mustOk(await set(), "CONNECTED ทุกสาขา");
    eq((await rv(s, K.auto, { unitId: A1 })).value, true, "autoVerify A1");
  });
  await t("V-7", "แม่แบบใช้ตัวแปรที่ไม่อนุญาต ⇒ VALIDATION · ตัวแปรที่อนุญาต ⇒ ผ่าน", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.msg, scope: "UNIT", scopeId: A1, value: { th: "สวัสดี {ชื่อ} เบอร์ {เบอร์}" } }]), "VALIDATION", "{เบอร์}");
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.msg, scope: "UNIT", scopeId: A1, value: { th: "เรียนคุณ {ชื่อ} ห้อง {ห้อง}" } }]), "ตัวแปรถูก");
  }, "MAJOR");
  await t("V-8", "key+scope+scopeId ซ้ำในชุดเดียว ⇒ CONFLICT · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(OWNER, ctxA, [
      { key: K.label, scope: "UNIT", scopeId: A1, value: "หนึ่ง" },
      { key: K.label, scope: "UNIT", scopeId: A1, value: "สอง" },
    ]), "CONFLICT", "ซ้ำในชุด");
    eq(await snapCounts(tA), c0, "นับแถว");
  }, "MAJOR");

  // ═══════════════ A. สิทธิ์ ═══════════════
  console.log("\nA. สิทธิ์ · ownerOnly · LEGAL");
  await t("A-1", "STAFF ไม่มี editPermission ⇒ PERMISSION · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(STAFF_NOPERM, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A1, value: "ลองแก้" }]), "PERMISSION", "STAFF ไร้สิทธิ์");
    eq(await snapCounts(tA), c0, "นับแถว");
  });
  await t("A-2", "STAFF มีสิทธิ์ แก้ค่าในสาขาตัวเอง (SERVICE ใน A1) ⇒ ผ่าน", async (s) => {
    mustOk(await s.setSettings(STAFF_A1, ctxA, [{ key: K.noShow, scope: "SERVICE", scopeId: SV1, value: 26 }]), "SV1 noShow 26");
    eq((await rv(s, K.noShow, { unitId: A1, serviceId: SV1 })).value, 26, "SV1 noShow");
  });
  await t("A-3", "ownerOnly: MANAGER (ทุกสาขา) ⇒ PERMISSION · OWNER ⇒ ผ่าน", async (s) => {
    mustCode(await s.setSettings(MGR_ALL, ctxA, [{ key: K.payout, scope: "TENANT", scopeId: tA, value: "บัญชีหลัก" }]), "PERMISSION", "MANAGER");
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.payout, scope: "TENANT", scopeId: tA, value: "บัญชีหลัก" }]), "OWNER");
  });
  await t("A-4", "sensitivity LEGAL (ไม่ใส่ ownerOnly) = เจ้าของเท่านั้น: MANAGER เปลี่ยนโหมดกฎหมาย ⇒ PERMISSION", async (s) => {
    mustCode(await s.setSettings(MGR_ALL, ctxA, [{ key: K.mode, scope: "UNIT", scopeId: A1, value: "WARN" }]), "PERMISSION", "MANAGER โหมด");
    eq((await rv(s, K.mode, { unitId: A1 })).value, "STRICT", "โหมด A1");
  });
  await t("A-5", "พนักงานจำกัดสาขาแก้ค่าระดับทั้งร้าน (TENANT) ⇒ PERMISSION", async (s) => {
    mustCode(await s.setSettings(STAFF_A1, ctxA, [{ key: K.label, scope: "TENANT", scopeId: tA, value: "ทั้งร้าน" }]), "PERMISSION", "STAFF TENANT");
    mustCode(await s.setSettings(MGR_A1, ctxA, [{ key: K.label, scope: "TENANT", scopeId: tA, value: "ทั้งร้าน" }]), "PERMISSION", "MANAGER A1 TENANT");
  });
  await t("A-6", "resetSetting ค่า ownerOnly โดย MANAGER ⇒ PERMISSION · แถวยังอยู่", async (s) => {
    mustCode(await s.resetSetting(MGR_ALL, ctxA, { key: K.payout, scope: "TENANT", scopeId: tA }), "PERMISSION", "MANAGER reset");
    eq(await db.settingValue.count({ where: { tenantId: tA, key: K.payout } }), 1, "แถว payout");
  });

  // ═══════════════ X. ข้ามร้าน/ข้ามสาขา ═══════════════
  console.log("\nX. ข้ามร้าน · ข้ามสาขา · พร้อมกัน");
  await t("X-1", "scopeId ของร้านอื่น = scopeId ที่ไม่มีอยู่ ⇒ NOT_FOUND (คำตอบเดียวกัน) · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    const r1 = await s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "UNIT", scopeId: B1, value: "แอบแก้" }]);
    const r2 = await s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "UNIT", scopeId: `nope_${uid()}`, value: "แอบแก้" }]);
    mustCode(r1, "NOT_FOUND", "สาขาร้าน B");
    mustCode(r2, "NOT_FOUND", "ไม่มีอยู่");
    eq((r1.issues ?? []).map((i) => i.code), (r2.issues ?? []).map((i) => i.code), "issues ต้องเหมือนกัน");
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.grace, scope: "STAFF", scopeId: STB, value: 3 }]), "NOT_FOUND", "ช่างร้าน B");
    eq(await snapCounts(tA), c0, "นับแถวร้าน A");
    eq((await s.resolveSetting(ctxB, K.label, { unitId: B1 })).value, "ร้านบี", "ค่าร้าน B ไม่เปลี่ยน");
  });
  await t("X-2", "scope TENANT แต่ scopeId = tenant อื่น ⇒ NOT_FOUND", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "TENANT", scopeId: tB, value: "แอบ" }]), "NOT_FOUND", "TENANT ร้าน B");
  });
  await t("X-3", "ข้ามสาขา: STAFF/MANAGER จำกัด A1 แก้ UNIT A2 · ช่างใน A2 ⇒ NOT_FOUND · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(STAFF_A1, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A2, value: "ข้ามสาขา" }]), "NOT_FOUND", "STAFF → UNIT A2");
    mustCode(await s.setSettings(STAFF_A1, ctxA, [{ key: K.grace, scope: "STAFF", scopeId: ST3, value: 3 }]), "NOT_FOUND", "STAFF → ช่าง A2");
    mustCode(await s.setSettings(MGR_A1, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A2, value: "ข้ามสาขา" }]), "NOT_FOUND", "MANAGER A1 → A2");
    mustCode(await s.resetSetting(MGR_A1, ctxA, { key: K.grace, scope: "UNIT", scopeId: A2 }), "NOT_FOUND", "MANAGER A1 reset A2");
    eq(await snapCounts(tA), c0, "นับแถว");
    eq((await rv(s, K.grace, { unitId: A2 })).value, 30, "grace A2 ยังเดิม");
  });
  await t("X-4", "resetSetting ข้ามร้าน ⇒ NOT_FOUND · แถวร้าน B ยังอยู่", async (s) => {
    mustCode(await s.resetSetting(OWNER, ctxA, { key: K.label, scope: "UNIT", scopeId: B1 }), "NOT_FOUND", "reset B1");
    eq(await db.settingValue.count({ where: { tenantId: tB, key: K.label, scope: "UNIT", scopeId: B1 } }), 1, "แถว B1");
  });
  await t("X-5", "ประวัติ/ส่วนต่าง: ร้าน A ไม่เห็นแถวร้าน B · พนักงานจำกัด A1 เห็นเฉพาะ A1 · ขอ A2 ⇒ []", async (s) => {
    const all = await s.settingHistory(ctxA, {});
    ok(all.length > 0, "ประวัติร้าน A ว่าง");
    ok(!all.some((r) => r.scopeId === B1), "ประวัติร้าน A มีแถวร้าน B");
    const mine = await s.settingHistory(ctxA, { actor: STAFF_A1 });
    ok(mine.length > 0 && mine.every((r) => r.unitId === A1), `พนักงาน A1 เห็น unitId ${fmt([...new Set(mine.map((r) => r.unitId))])}`);
    eq(await s.settingHistory(ctxA, { unitId: A2, actor: STAFF_A1 }), [], "ขอประวัติ A2");
    eq(await s.settingsDiff(ctxA, { unitId: A2, domain: "qcfx", actor: STAFF_A1 }), [], "ขอส่วนต่าง A2");
    const diff = await s.settingsDiff(ctxA, { unitId: A1, domain: "qcfx" });
    const lab = diff.find((d) => d.key === K.label && d.scope === "UNIT");
    eq([lab?.scopeId, lab?.value, lab?.templateValue], [A1, "ช่างตัดผม", "ช่าง"], "diff label A1");
    eq((await s.settingHistory(ctxA, { unitId: A1, key: K.label })).every((r) => r.key === K.label && r.unitId === A1), true, "กรอง unitId+key");
  });
  await t("X-6", "X3 เขียนพร้อมกัน 10 ทาง: ok ครบ · แถวเดียว · ประวัติ 10 แถว · ค่าสุดท้ายคงที่", async (s) => {
    const vals = Array.from({ length: 10 }, (_, i) => `พร้อมกัน-${i}`);
    const res = await Promise.all(vals.map((v) => s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A2, value: v }])));
    ok(res.every((r) => r.ok), `ไม่ ok: ${fmt(res.filter((r) => !r.ok))}`);
    eq(await db.settingValue.count({ where: { tenantId: tA, key: K.label, scope: "UNIT", scopeId: A2 } }), 1, "แถว");
    eq(await db.settingChange.count({ where: { tenantId: tA, key: K.label, scope: "UNIT", scopeId: A2 } }), 10, "ประวัติ");
    const fin = (await rv(s, K.label, { unitId: A2 })).value;
    ok(vals.includes(String(fin)), `ค่าสุดท้าย ${fmt(fin)}`);
    eq((await rv(s, K.label, { unitId: A2 })).value, fin, "อ่านซ้ำคงที่");
  });
  await t("X-7", "X3 ประวัติต่อกันเป็นสายเดียว (before ของแต่ละแถว = after ของแถวก่อน · จบที่ค่าปัจจุบัน — ไม่มี lost update)", async (s) => {
    const rows = (await db.settingChange.findMany({ where: { tenantId: tA, key: K.label, scope: "UNIT", scopeId: A2 } })) as unknown as ChangeRow[];
    const left = [...rows];
    let cur: unknown = null;
    while (left.length) {
      const i = left.findIndex((r) => isDeepStrictEqual(r.before ?? null, cur));
      if (i < 0) throw new AssertFail(`สายขาดที่ before=${fmt(cur)} (เหลือ ${left.length})`);
      cur = left[i].after;
      left.splice(i, 1);
    }
    eq(cur, (await rv(s, K.label, { unitId: A2 })).value, "ปลายสาย = ค่าปัจจุบัน");
  }, "MAJOR");

  // ═══════════════ L. กฎหมาย 3 โหมด + สายอนุมัติ ═══════════════
  console.log("\nL. กฎหมาย · โหมด · อนุมัติ");
  const ap = (await tryImport<{
    createPolicy: (ctx: Ctx, i: unknown) => Promise<{ id: string }>;
    setPolicyActive: (ctx: Ctx, id: string, a: boolean) => Promise<unknown>;
    decide: (m: Actor, ctx: Ctx, id: string, i: { decision: "APPROVED" | "REJECTED"; note?: string }) => Promise<{ ok: boolean }>;
  }>("@/lib/modules/approval/service")).mod;
  const eff = (await tryImport<{ applyApprovalEffect: (e: { tenantId: string; type: string; payload: unknown }) => Promise<void> }>("@/lib/approval-effects")).mod;
  const reqCount = () => db.approvalRequest.count({ where: { tenantId: tA, entityType: "settings.legal_override" } });
  const retRefsRT: Refs = { unitId: A1, roomTypeId: RT1 };
  await t("L-0", "เจ้าของตั้งโหมด A1 = WARN ได้", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.mode, scope: "UNIT", scopeId: A1, value: "WARN" }]), "A1 WARN");
    eq((await rv(s, K.mode, { unitId: A1 })).value, "WARN", "โหมด A1");
  });
  await t("L-1", "STRICT (A2): คืนประกัน 10 วัน ⇒ LEGAL_BLOCK (code DEPOSIT_RETURN_DAYS · ไทย) แม้เจ้าของ ack+เหตุผล · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    const r = await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A2, value: 10, reason: REASON }], { ackLegalWarn: true });
    mustCode(r, "LEGAL_BLOCK", "STRICT");
    ok((r.issues ?? []).some((i) => i.code === "DEPOSIT_RETURN_DAYS") && thaiIssue(r), `issues ${fmt(r.issues)}`);
    eq(await snapCounts(tA), c0, "นับแถว");
  });
  await t("L-2", "STRICT: ค่าที่ไม่เกินเพดาน (6 วัน) ⇒ ผ่าน · legalLevel OK", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A2, value: 6 }]), "A2 6 วัน");
    eq((await lastChange(K.ret, "UNIT", A2))?.legalLevel, "OK", "legalLevel");
  });
  await t("L-3", "WARN (A1) ไม่ ack ⇒ NEEDS_APPROVAL · ไม่สร้างคำขอ · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    const q0 = await reqCount();
    const r = await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A1, value: 10, reason: REASON }]);
    mustCode(r, "NEEDS_APPROVAL", "ไม่ ack");
    ok(!r.approvalId, `ไม่ควรมี approvalId: ${fmt(r.approvalId)}`);
    eq([await snapCounts(tA), await reqCount()], [c0, q0], "นับแถว/คำขอ");
  });
  await t("L-4", "WARN: ack แต่ไม่มีเหตุผล ⇒ VALIDATION (REASON_REQUIRED) · ไม่เขียน", async (s) => {
    const c0 = await snapCounts(tA);
    const r = await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A1, value: 10 }], { ackLegalWarn: true });
    mustCode(r, "VALIDATION", "ไม่มีเหตุผล");
    ok((r.issues ?? []).some((i) => i.code === "REASON_REQUIRED"), `issues ${fmt(r.issues)}`);
    eq(await snapCounts(tA), c0, "นับแถว");
  }, "MAJOR");
  await t("L-5", "WARN: เจ้าของ ack+เหตุผล ⇒ บันทึกทันที · SettingChange legalLevel WARN · legalCode · reason · approvalId null", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A1, value: 10, reason: REASON }], { ackLegalWarn: true }), "OWNER override");
    eq((await rv(s, K.ret, { unitId: A1 })).value, 10, "returnDays A1");
    const c = await lastChange(K.ret, "UNIT", A1);
    eq([c?.legalLevel, c?.legalCode, c?.reason, c?.approvalId ?? null, c?.actorId], ["WARN", "DEPOSIT_RETURN_DAYS", REASON, null, OWNER.userId], "SettingChange");
  });
  let reqId = "";
  await t("L-6", "WARN: ผู้จัดการ ack+เหตุผล (มีนโยบาย) ⇒ NEEDS_APPROVAL + approvalId · คำขอ PENDING entityType settings.legal_override · ค่ายังไม่เปลี่ยน", async (s) => {
    if (!ap) throw new AssertFail("โหลด approval/service ไม่ได้");
    await ap.createPolicy(ctxA, { name: "QC ข้ามคำเตือนกฎหมาย", entityType: "settings.legal_override", steps: [{ order: 1, approverRole: "OWNER" }] });
    const r = await s.setSettings(MGR_ALL, ctxA, [{ key: K.ret, scope: "ROOM_TYPE", scopeId: RT1, value: 14, reason: REASON }], { ackLegalWarn: true });
    mustCode(r, "NEEDS_APPROVAL", "MANAGER override");
    ok(typeof r.approvalId === "string" && r.approvalId.length > 0, `approvalId ${fmt(r.approvalId)}`);
    reqId = String(r.approvalId);
    const q = await db.approvalRequest.findFirst({ where: { id: reqId, tenantId: tA } });
    eq([q?.entityType, q?.status, q?.requestedById, q?.unitId], ["settings.legal_override", "PENDING", MGR_ALL.userId, A1], "ApprovalRequest");
    eq((await rv(s, K.ret, retRefsRT)).value, 10, "RT1 ยังสืบจาก UNIT");
  });
  await t("L-7", "เจ้าของอนุมัติ ⇒ approval-effects ใช้ค่า (เรียกซ้ำ 2 รอบ = ผลครั้งเดียว · X4) · SettingChange WARN + approvalId + actorId ผู้ยื่น", async (s) => {
    if (!ap || !eff || !reqId) throw new AssertFail("ไม่มีคำขอจาก L-6 / โหลด approval ไม่ได้");
    const d = await ap.decide(OWNER, ctxA, reqId, { decision: "APPROVED" });
    ok(d.ok, `decide ${fmt(d)}`);
    const q = await db.approvalRequest.findFirst({ where: { id: reqId } });
    const evt = { tenantId: tA, type: "approval.request.approved", payload: { requestId: reqId, entityType: "settings.legal_override", entityId: q?.entityId } };
    await eff.applyApprovalEffect(evt);
    await eff.applyApprovalEffect(evt);
    eq((await rv(s, K.ret, retRefsRT)).value, 14, "RT1 หลังอนุมัติ");
    const rows = (await db.settingChange.findMany({ where: { tenantId: tA, approvalId: reqId } })) as unknown as ChangeRow[];
    eq(rows.length, 1, "แถวประวัติของคำขอ");
    eq([rows[0]?.legalLevel, rows[0]?.actorId, rows[0]?.after, rows[0]?.scope, rows[0]?.scopeId, rows[0]?.unitId], ["WARN", MGR_ALL.userId, 14, "ROOM_TYPE", RT1, A1], "SettingChange");
  });
  await t("L-8", "เจ้าของปฏิเสธ ⇒ ค่าไม่เปลี่ยน", async (s) => {
    if (!ap || !eff) throw new AssertFail("โหลด approval ไม่ได้");
    const r = await s.setSettings(MGR_ALL, ctxA, [{ key: K.ret, scope: "ROOM_TYPE", scopeId: RT1, value: 20, reason: REASON }], { ackLegalWarn: true });
    mustCode(r, "NEEDS_APPROVAL", "เสนอ 20");
    const id = String(r.approvalId);
    ok((await ap.decide(OWNER, ctxA, id, { decision: "REJECTED", note: "ไม่อนุญาต" })).ok, "decide REJECTED");
    const q = await db.approvalRequest.findFirst({ where: { id } });
    await eff.applyApprovalEffect({ tenantId: tA, type: "approval.request.rejected", payload: { requestId: id, entityType: "settings.legal_override", entityId: q?.entityId } });
    eq((await rv(s, K.ret, retRefsRT)).value, 14, "RT1 คงเดิม");
  });
  await t("L-9", "ไม่มีนโยบาย (ปิด) ⇒ ผู้จัดการ override ไม่ถูก autoApprove: NEEDS_APPROVAL · ไม่มีคำขอใหม่ · ไม่เขียน", async (s) => {
    if (!ap) throw new AssertFail("โหลด approval ไม่ได้");
    const pol = await db.approvalPolicy.findMany({ where: { tenantId: tA, entityType: "settings.legal_override" } });
    for (const p of pol) await ap.setPolicyActive(ctxA, String(p.id), false);
    const c0 = await snapCounts(tA);
    const q0 = await reqCount();
    const r = await s.setSettings(MGR_ALL, ctxA, [{ key: K.ret, scope: "ROOM_TYPE", scopeId: RT1, value: 21, reason: REASON }], { ackLegalWarn: true });
    mustCode(r, "NEEDS_APPROVAL", "ไม่มีนโยบาย");
    ok(!r.approvalId, `approvalId ต้องว่าง ได้ ${fmt(r.approvalId)}`);
    eq([await snapCounts(tA), await reqCount()], [c0, q0], "นับแถว/คำขอ");
    eq((await rv(s, K.ret, retRefsRT)).value, 14, "RT1 คงเดิม");
  });
  await t("L-10", "ค่าระดับ TENANT ตรวจแบบ STRICT เสมอ (แม้มีสาขาโหมด WARN) ⇒ LEGAL_BLOCK", async (s) => {
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "TENANT", scopeId: tA, value: 10, reason: REASON }], { ackLegalWarn: true }), "LEGAL_BLOCK", "TENANT 10 วัน");
  }, "MAJOR");
  await t("L-11", "OUT_OF_SCOPE: ตั้งโหมด+เหตุผลในชุดเดียว ⇒ ผ่าน · คืนประกัน 30 วัน ⇒ ผ่าน (legalLevel OK)", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [
      { key: K.mode, scope: "UNIT", scopeId: A2, value: "OUT_OF_SCOPE" },
      { key: K.reason, scope: "UNIT", scopeId: A2, value: "สาขานี้ให้เช่าเพียงสองห้องจึงอยู่นอกขอบเขตประกาศ" },
    ]), "A2 OOS");
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.ret, scope: "UNIT", scopeId: A2, value: 30 }]), "A2 30 วัน");
    eq((await lastChange(K.ret, "UNIT", A2))?.legalLevel, "OK", "legalLevel");
  });
  await t("L-12", "คำขู่ในแม่แบบข้อความ (always) ⇒ LEGAL_BLOCK ทุกโหมด (OUT_OF_SCOPE · WARN) แม้เจ้าของ ack+เหตุผล", async (s) => {
    const threat = { th: "คุณ {ชื่อ} ค้างชำระ หากไม่จ่ายจะตัดไฟห้อง {ห้อง}" };
    const c0 = await snapCounts(tA);
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.msg, scope: "UNIT", scopeId: A2, value: threat, reason: REASON }], { ackLegalWarn: true }), "LEGAL_BLOCK", "A2 OOS");
    mustCode(await s.setSettings(OWNER, ctxA, [{ key: K.msg, scope: "UNIT", scopeId: A1, value: threat, reason: REASON }], { ackLegalWarn: true }), "LEGAL_BLOCK", "A1 WARN");
    eq(await snapCounts(tA), c0, "นับแถว");
  });

  // ═══════════════ H. ประวัติ · audit · outbox ═══════════════
  console.log("\nH. ประวัติ · audit · outbox");
  await t("H-1", "resetSetting ⇒ ลบแถว · SettingChange after=null · audit settings.reset · outbox · กลับไปค่าที่สืบ", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: K.label, scope: "UNIT", scopeId: A2, value: "ชั่วคราว" }]), "label A2");
    const a0 = await db.auditLog.count({ where: { tenantId: tA, action: "settings.reset" } });
    const ob0 = await obCount(tA);
    const r = await s.resetSetting(OWNER, ctxA, { key: K.label, scope: "UNIT", scopeId: A2 });
    ok(r.ok === true && r.removed === 1, `reset ${fmt(r)}`);
    eq(await db.settingValue.count({ where: { tenantId: tA, key: K.label, scope: "UNIT", scopeId: A2 } }), 0, "แถว");
    const c = await lastChange(K.label, "UNIT", A2);
    eq([c?.before, c?.after ?? null, c?.actorId], ["ชั่วคราว", null, OWNER.userId], "SettingChange");
    eq(await db.auditLog.count({ where: { tenantId: tA, action: "settings.reset" } }), a0 + 1, "audit settings.reset");
    eq(await obCount(tA), ob0 + 1, "outbox");
    eq((await rv(s, K.label, { unitId: A2 })).value, "ช่าง", "กลับเป็นค่าแม่แบบ");
  });
  await t("H-2", "outbox settings.changed ทุกแถว: payload มีเฉพาะ tenantId/unitId/domain/keys/scope/scopeId (ไม่มีค่า) · idempotencyKey ไม่ซ้ำ", async () => {
    const evs = await db.outboxEvent.findMany({ where: { tenantId: tA, type: "settings.changed" } });
    ok(evs.length >= 10, `มี ${evs.length} event`);
    const allowed = new Set(["tenantId", "unitId", "domain", "keys", "scope", "scopeId"]);
    for (const e of evs) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const extra = Object.keys(p).filter((k) => !allowed.has(k));
      ok(extra.length === 0, `payload มี ${extra.join(",")}`);
      ok(p.tenantId === tA && Array.isArray(p.keys) && (p.keys as unknown[]).length > 0, `payload ${fmt(p)}`);
    }
    eq(new Set(evs.map((e) => e.idempotencyKey)).size, evs.length, "idempotencyKey ซ้ำ");
  }, "MAJOR");

  // ═══════════════ T. applyTemplate ═══════════════
  console.log("\nT. applyTemplate KEEP_CUSTOM / RESET_ALL");
  const A1_SCOPE_IDS = [A1, SV1, ST1, ST2, BL1, RT1, RM1];
  await t("T-1", "KEEP_CUSTOM QCFX_B: profile v2 · ค่าที่ปรับไว้คงอยู่ · ค่าที่ไม่ได้ปรับเป็นของ B", async (s) => {
    mustOk(await s.setSettings(OWNER, ctxA, [{ key: "payments.slip.toleranceSatang", scope: "UNIT", scopeId: A1, value: 100 }]), "payments A1");
    const n0 = await db.settingValue.count({ where: { tenantId: tA, key: { startsWith: "qcfx." }, scopeId: { in: A1_SCOPE_IDS } } });
    mustOk(await s.applyTemplate(OWNER, ctxA, { unitId: A1, domain: "qcfx", templateKey: "QCFX_B", overwrite: "KEEP_CUSTOM" }), "apply B keep");
    const prof = await db.settingProfile.findFirst({ where: { tenantId: tA, unitId: A1, domain: "qcfx" } });
    eq([prof?.templateKey, prof?.templateVersion], ["QCFX_B", 2], "profile");
    eq(await db.settingValue.count({ where: { tenantId: tA, key: { startsWith: "qcfx." }, scopeId: { in: A1_SCOPE_IDS } } }), n0, "แถวที่ปรับไว้");
    eq((await rv(s, K.label, { unitId: A1 })).value, "ช่างตัดผม", "label (UNIT)");
    const ns = await rv(s, K.noShow, { unitId: A1 });
    eq([ns.value, ns.source, ns.templateKey], [30, "TEMPLATE", "QCFX_B"], "noShow (B)");
    eq((await rv(s, K.grace, { unitId: A1, staffId: ST2 })).value, 9, "ST2 grace");
  });
  await t("T-2", "RESET_ALL: ลบแถว qcfx ของ A1 (UNIT+ลึกกว่า) ครบ · ประวัติ after=null ต่อแถว · คงแถว TENANT/สาขา A2/domain อื่น/ร้าน B", async (s) => {
    const n0 = await db.settingValue.count({ where: { tenantId: tA, key: { startsWith: "qcfx." }, scopeId: { in: A1_SCOPE_IDS } } });
    ok(n0 >= 6, `ฉากต้องมีแถวปรับใน A1 ≥ 6 (มี ${n0})`);
    const keepTenant = await db.settingValue.count({ where: { tenantId: tA, scope: "TENANT" } });
    const keepA2 = await db.settingValue.count({ where: { tenantId: tA, scopeId: A2 } });
    const keepB = await db.settingValue.count({ where: { tenantId: tB } });
    const t0 = new Date(Date.now() - 1000);
    const r = await s.applyTemplate(OWNER, ctxA, { unitId: A1, domain: "qcfx", templateKey: "QCFX_B", overwrite: "RESET_ALL" });
    ok(r.ok === true && r.removed === n0, `apply RESET_ALL ${fmt(r)} (ต้องลบ ${n0})`);
    eq(await db.settingValue.count({ where: { tenantId: tA, key: { startsWith: "qcfx." }, scopeId: { in: A1_SCOPE_IDS } } }), 0, "แถว qcfx A1");
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "SettingChange" WHERE "tenantId" = $1 AND "after" IS NULL AND "at" >= $2 AND "key" LIKE 'qcfx.%'`, tA, t0);
    ok(n >= n0, `ประวัติ after=null ${n} < ${n0}`);
    eq(await db.settingValue.count({ where: { tenantId: tA, scope: "TENANT" } }), keepTenant, "แถว TENANT");
    eq(await db.settingValue.count({ where: { tenantId: tA, scopeId: A2 } }), keepA2, "แถว A2");
    eq(await db.settingValue.count({ where: { tenantId: tB } }), keepB, "แถวร้าน B");
    eq(await db.settingValue.count({ where: { tenantId: tA, key: "payments.slip.toleranceSatang", scopeId: A1 } }), 1, "แถว payments A1");
    eq([(await rv(s, K.label, { unitId: A1 })).value, (await rv(s, K.grace, { unitId: A1, staffId: ST2 })).value, (await rv(s, K.mode, { unitId: A1 })).value, (await rv(s, K.ret, retRefsRT)).value],
      ["หมอนวด", 15, "STRICT", 7], "ค่าหลังรีเซ็ต");
  });
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try {
    await cleanup(tenantIds);
    const left = await db.tenant.count({ where: { id: { in: tenantIds } } });
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch (e) {
    console.log(`  ⚠️ cleanup: ${errMsg(e)}`);
  }
  await db.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.3 · เครื่องยนต์ค่าตั้ง =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
