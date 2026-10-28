// QC — SVC R0.4 · หน้าค่าตั้งสร้างจากทะเบียน (SettingsForm) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-r0.4.md (§2–§9 ผูกตรงตัว) · ledger/SVC-CORE-CONTRACT.md §1.8 + ภาคต่อ 28 ต.ค. · MASTER-PLAN แถว R0.4
//
// กลุ่มข้อ:
//   F  ไฟล์ส่งมอบ · client ไม่ลากถึง service/db · actions ใช้ requireTenant + refresh() · หน้าห่อ 2 หน้า · หน้าอนุมัติ
//   P  pure: submissionFor (ส่งเฉพาะคีย์ที่แตะ · ตามชั้นบน = reset) · parseFieldInput (ข้อความไทย) · formatFieldValue
//   R  ทะเบียน: ซ่อน payments.slip.onVerifierDown · schema payments.receiver รับรูปพร้อมเพย์ · ป้ายไทยตัวเลือก enum
//   M  loadSettingsForm (ฟิกซ์เจอร์ qcfx): ชุดช่อง = def ไม่ซ่อนที่ตั้งชั้นนั้นได้ · ป้าย/ที่มา/ต่างจากแม่แบบ/ปรับรายคน ·
//      editable ⇔ setSettings ไม่ตอบ PERMISSION (oracle เทียบเครื่องยนต์จริง) · X1/สาขา ⇒ null · PRIVACY ปิด · ประวัติ
//   D  โดเมนจริง (rooms · payments · messaging) บนสาขาหอ: ครบทุก def ไม่ซ่อน · โรงแรม/onVerifierDown ไม่โผล่ ·
//      ป้ายรอที่ปรึกษากฎหมาย · โหมดกฎหมาย 3 แบบ (เจ้าของเท่านั้น) · ช่องเงิน/ownerOnly ตามสิทธิ์ · บัญชีรับเงินพร้อมเพย์
//   H  render จริงด้วย react-dom/server: กล่องละคีย์ · ชนิดช่อง · ป้าย · ล็อก · ความลับไม่หลุด · ไทยล้วน · ปุ่ม ≥ 44px
//   A  สรุปข้อเสนอ settings.legal_override (หน้าอนุมัติ) · ข้ามร้าน · PRIVACY
//   VIS ฉากภาพ r0.4 (หน้าตั้งค่าจองคิว + หน้าค่าตั้งหอ) — ไม่มี QC server = SKIP ยอมได้
//   Z  ทำความสะอาด
//
// ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `svc-r04-*` + ผู้ใช้ `svc-r04-*@qc.invalid` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// รัน (ห้ามครอบ timeout):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.4.mts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.4";

// ═══════════════ 0. ด่านฐานข้อมูล (ด่าน host ของ RUN SVC — ไม่มีทางปลด) ═══════════════
const envMod = (await import("./svc-qc-env.mts" as string)) as { loadSvcQcEnv: (label: string) => { host: string } };
envMod.loadSvcQcEnv(LABEL);
if (process.env.APP_ENV === "production") {
  console.error(`🔴 ${LABEL}: APP_ENV=production`);
  process.exit(4);
}

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string; allowSkip: boolean }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const fmt = (v: unknown): string => {
  try {
    return JSON.stringify(v)?.slice(0, 220) ?? String(v);
  } catch {
    return String(v);
  }
};
const ok = (cond: unknown, why: string): void => {
  if (!cond) throw new AssertFail(why);
};
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
const record = (id: string, name: string, res: Res, why: string, sev: Sev, allowSkip = false) => {
  cks.push({ id, res, sev, why, allowSkip });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
async function t(id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") {
  try {
    await fn();
    record(id, name, "PASS", "", sev);
  } catch (e) {
    record(id, name, "FAIL", errMsg(e), sev);
  }
}
const THAI = /[฀-๿]/;
const isThai = (s: unknown) => typeof s === "string" && THAI.test(s);

// ═══════════════ ตัวช่วยไฟล์ ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => {
  try {
    return { mod: await import(spec as string), err: "" };
  } catch (e) {
    return { mod: null, err: errMsg(e) };
  }
};
const TSX = existsSync(join(ROOT, "node_modules/.bin/tsx")) ? join(ROOT, "node_modules/.bin/tsx") : "";
function runScript(file: string, args: string[], env: Record<string, string | undefined>, timeoutMs: number) {
  const fullEnv = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined) fullEnv[k] = v;
  const r = TSX
    ? spawnSync(TSX, [file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync("pnpm", ["exec", "tsx", file, ...args], { cwd: ROOT, env: fullEnv, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}
const tail = (s: string, n = 200) => s.replace(/\s+/g, " ").trim().slice(-n);

const FILES = {
  form: "src/lib/core/settings/form.ts",
  shared: "src/components/settings/settings-shared.ts",
  comp: "src/components/settings/SettingsForm.tsx",
  actions: "src/lib/core/settings/actions.ts",
  index: "src/lib/core/settings/index.ts",
  bookingPage: "src/app/app/u/[unitSlug]/booking/settings/page.tsx",
  bookingLayout: "src/app/app/u/[unitSlug]/booking/layout.tsx",
  dormPage: "src/app/app/u/[unitSlug]/dorm/settings/page.tsx",
  approvals: "src/app/app/approvals/page.tsx",
};

// ═══════════════ F. ไฟล์ (สแตติก) ═══════════════
console.log("\nF. ไฟล์ · ขอบเขต import · actions · หน้าห่อ");
await t("F-1", "ไฟล์ส่งมอบครบ (form.ts · settings-shared.ts · SettingsForm.tsx · หน้าห่อจองคิว · หน้าห่อหอ)", () => {
  const miss = [FILES.form, FILES.shared, FILES.comp, FILES.bookingPage, FILES.dormPage].filter((f) => !has(f));
  ok(miss.length === 0, `ไม่มี ${miss.join(" · ")}`);
});
const valueImports = (src: string): string[] =>
  [...stripComments(src).matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)]
    .filter((m) => !/^\{\s*type\s/.test(m[1].trim()) || m[1].replace(/type\s+\w+\s*,?/g, "").replace(/[{}\s,]/g, "").length > 0)
    .map((m) => m[2]);
await t("F-2", "SettingsForm.tsx: \"use client\" · ไม่ import ค่าใด ๆ จาก @/lib/core/settings (type เท่านั้น) / db / prisma / _fixture · ไม่ใช้ useRouter", () => {
  const s = read(FILES.comp);
  ok(s, "ไม่มีไฟล์");
  ok(/^\s*["']use client["']/.test(s), "บรรทัดแรกไม่ใช่ \"use client\"");
  const bad = valueImports(s).filter((p) => /^@\/lib\/core\/(settings|db)|prisma|_fixture|^@\/lib\/modules\//.test(p));
  ok(bad.length === 0, `import ค่าต้องห้าม: ${bad.join(", ")}`);
  ok(!/\buseRouter\s*\(/.test(stripComments(s)), "ใช้ useRouter (render นอก Next ไม่ได้ · ใช้ refresh() ใน action)");
});
await t("F-3", "settings-shared.ts pure: ไม่มี value import จาก @/lib · next · prisma · node: (type ได้)", () => {
  const s = read(FILES.shared);
  ok(s, "ไม่มีไฟล์");
  ok(!/["']use (client|server)["']/.test(s.slice(0, 200)), "มี directive");
  const bad = valueImports(s).filter((p) => /^@\/lib\/|^next|prisma|^node:|_fixture/.test(p));
  ok(bad.length === 0, `import ค่าต้องห้าม: ${bad.join(", ")}`);
});
await t("F-4", "actions.ts: \"use server\" · requireTenant · refresh() จาก next/cache · ไม่มี export ที่รับ tenantId/actor/role จาก client", () => {
  const s = stripComments(read(FILES.actions));
  ok(/^\s*["']use server["']/.test(read(FILES.actions)), "ไม่ใช่ \"use server\"");
  ok(/requireTenant\s*\(/.test(s), "ไม่เรียก requireTenant");
  ok(/import\s*\{[^}]*\brefresh\b[^}]*\}\s*from\s*["']next\/cache["']/.test(s), "ไม่ import refresh จาก next/cache");
  ok((s.match(/\brefresh\s*\(\s*\)/g) ?? []).length >= 2, "ต้องเรียก refresh() ใน save และ reset");
  const exps = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)];
  ok(exps.length >= 3, `export async function ${exps.length}`);
  const bad = exps.filter((m) => /\b(tenantId|actor|role|unitAccess|permissions)\b\s*[:,)]/.test(m[2])).map((m) => m[1]);
  ok(bad.length === 0, `รับค่าสิทธิ์จาก client: ${bad.join(",")}`);
  ok(!/export\s+(const|let|type|interface|class)\b/.test(s), "export ที่ไม่ใช่ async function");
});
await t("F-5", "หน้าห่อจองคิว: requireUnit · BOOKING · loadSettingsForm · notFound · ส่ง saveSettingsAction/resetSettingAction · แท็บ \"ตั้งค่า\" ใน layout", () => {
  const s = stripComments(read(FILES.bookingPage));
  ok(s, "ไม่มีไฟล์");
  for (const w of ["requireUnit", "loadSettingsForm", "notFound", "saveSettingsAction", "resetSettingAction", "SettingsForm", "\"BOOKING\""]) ok(s.includes(w), `ไม่มี ${w}`);
  ok(/["']payments["']/.test(s) && /["']messaging["']/.test(s), "domains ต้องมี payments + messaging");
  ok(!/searchParams[\s\S]{0,80}(role|unitAccess|tenantId)/.test(s), "อ่านสิทธิ์จาก searchParams");
  const lay = stripComments(read(FILES.bookingLayout));
  ok(/\/settings[`"']/.test(lay) && lay.includes("ตั้งค่า"), "layout ไม่มีแท็บ ตั้งค่า → /settings");
}, "MAJOR");
await t("F-6", "หน้าห่อหอ: requireUnit · DORM · loadSettingsForm (rooms · payments · messaging) · notFound · actions เป็น prop", () => {
  const s = stripComments(read(FILES.dormPage));
  ok(s, "ไม่มีไฟล์");
  for (const w of ["requireUnit", "loadSettingsForm", "notFound", "saveSettingsAction", "resetSettingAction", "SettingsForm", "\"DORM\""]) ok(s.includes(w), `ไม่มี ${w}`);
  for (const d of ["rooms", "payments", "messaging"]) ok(new RegExp(`["']${d}["']`).test(s), `domains ไม่มี ${d}`);
}, "MAJOR");
await t("F-7", "หน้าอนุมัติใช้ legalOverrideSummaries (สรุปข้อเสนอข้ามคำเตือนกฎหมาย)", () => {
  ok(/legalOverrideSummaries/.test(stripComments(read(FILES.approvals))), "approvals/page.tsx ไม่เรียก legalOverrideSummaries");
}, "MAJOR");
await t("F-8", "SettingsForm.tsx: จัดการ NEEDS_APPROVAL (กล่องยอมรับ + ackLegalWarn) · แสดง messageTh · ตัวกรองดูเฉพาะที่ปรับ · ประวัติ", () => {
  const s = stripComments(read(FILES.comp));
  for (const w of ["NEEDS_APPROVAL", "ackLegalWarn", "messageTh", "ดูเฉพาะที่ปรับ", "ประวัติ", "submissionFor"]) ok(s.includes(w), `ไม่มี ${w}`);
}, "MAJOR");

// ═══════════════ โหลดโมดูล ═══════════════
const S = await tryImport("@/lib/core/settings");
const REG = await tryImport("@/lib/core/settings/registry");
await tryImport("@/lib/core/settings/defs/_fixture"); // ฟิกซ์เจอร์ qcfx (ข้อสอบเท่านั้น)
const SH = has(FILES.shared) ? await tryImport("@/components/settings/settings-shared") : { mod: null, err: "ไม่มีไฟล์" };
const ROOMS = await tryImport("@/lib/core/settings/defs/rooms");
const ZOD = (await import("zod" as string)) as Any;
const z = ZOD.z as Any;
const s: Any = S.mod;
if (!s) console.log(`  (โหลด @/lib/core/settings ไม่ได้: ${S.err})`);
const needFn = (mod: Any, name: string) => {
  if (!mod || typeof mod[name] !== "function") throw new AssertFail(`ไม่มีฟังก์ชัน ${name}`);
  return mod[name] as (...a: Any[]) => Any;
};

// ── def PRIVACY ทดสอบ (ลงทะเบียนในโปรเซส · domain qcfx) ──
const PRIV = "qcfx.r04.privateNote";
const SECRET = `svcr04sec${randomBytes(6).toString("hex")}`;
const SECRET2 = `svcr04sec${randomBytes(6).toString("hex")}`;
try {
  if (REG.mod && !REG.mod.getDef(PRIV)) {
    REG.mod.defineSettings(
      "qcfx",
      [{
        key: PRIV, domain: "qcfx", group: "r04", type: "text", labelTh: "บันทึกส่วนตัวของลูกค้า (ทดสอบ)",
        schema: z.string().max(200), defaults: { _fallback: "" }, chain: ["TENANT", "UNIT"],
        editPermission: "qcfx.settings.edit", sensitivity: "PRIVACY",
      }],
      { groupLabelsTh: { r04: "ความเป็นส่วนตัว (ทดสอบ)" } },
    );
  }
} catch (e) {
  console.log(`  (ลงทะเบียน def PRIVACY ทดสอบไม่ได้: ${errMsg(e)})`);
}

// ═══════════════ R. ทะเบียน (pure) ═══════════════
console.log("\nR. ทะเบียน: ซ่อน · บัญชีรับเงิน · ป้าย enum");
const getDef = (k: string): Any => s?.getDef?.(k);
const listDefs = (d: string): Any[] => (s?.listDefs?.(d) ?? []) as Any[];
await t("R-1", "payments.slip.onVerifierDown ยังนิยามอยู่ (_fallback MANUAL) แต่ hiddenUntil ตั้งแล้ว (ซ่อนจากหน้า)", () => {
  const d = getDef("payments.slip.onVerifierDown");
  ok(d, "ไม่มี def");
  eq(d.defaults?._fallback, "MANUAL", "_fallback");
  ok(typeof d.hiddenUntil === "string" && d.hiddenUntil.length > 0, `hiddenUntil = ${fmt(d.hiddenUntil)}`);
});
await t("R-2", "payments.receiver schema: รับ {paymentProfileId} · {promptpayId} · {promptpayId,displayName,bankAccount} · null — ปฏิเสธพร้อมเพย์ผิดรูป/ว่าง", () => {
  const d = getDef("payments.receiver");
  ok(d?.schema?.safeParse, "ไม่มี def/schema");
  const okV = [{ paymentProfileId: "pp-1" }, { paymentProfileId: "pp-1", labelTh: "บัญชีหลัก" }, { promptpayId: "0812345678" },
    { promptpayId: "0812345678", displayName: "ร้านทดสอบ", bankAccount: "123-4-56789-0" }, null];
  const badV = [{ promptpayId: "12ab" }, { promptpayId: "081234" }, {}, { displayName: "ไม่มีเลข" }, "0812345678"];
  const p: string[] = [];
  for (const v of okV) if (!d.schema.safeParse(v).success) p.push(`ควรรับ ${fmt(v)}`);
  for (const v of badV) if (d.schema.safeParse(v).success) p.push(`ควรปฏิเสธ ${fmt(v)}`);
  eq(d.ownerOnly, true, "ownerOnly คงเดิม");
  ok(p.length === 0, p.join(" · "));
});
const enumOptions = (schema: Any): string[] | null => {
  let sc = schema;
  for (let i = 0; i < 4 && sc; i++) {
    if (Array.isArray(sc.options) && sc.options.every((o: unknown) => typeof o === "string")) return sc.options as string[];
    sc = typeof sc.unwrap === "function" ? sc.unwrap() : null;
  }
  return null;
};
const RAW = /^[A-Z0-9_]+$/;
await t("R-3", "ทุก def ชนิด enum ที่ไม่ซ่อน (payments · messaging · rooms · qcfx) มี enumLabelsTh ครบทุกตัวเลือก · ป้ายไม่ใช่ค่าดิบ", () => {
  const p: string[] = [];
  for (const dm of ["payments", "messaging", "rooms", "qcfx"]) {
    for (const d of listDefs(dm)) {
      if (d.type !== "enum" || d.hiddenUntil) continue;
      const opts = enumOptions(d.schema);
      if (!opts) { p.push(`${d.key}: อ่านตัวเลือกจาก schema ไม่ได้`); continue; }
      for (const o of opts) {
        const lb = d.enumLabelsTh?.[o];
        if (typeof lb !== "string" || !lb.trim() || lb === o || RAW.test(lb)) p.push(`${d.key}.${o}=${fmt(lb)}`);
      }
    }
  }
  ok(p.length === 0, p.slice(0, 10).join(" · ") + (p.length > 10 ? ` …(+${p.length - 10})` : ""));
});

// ═══════════════ P. pure ═══════════════
console.log("\nP. pure: submissionFor · parseFieldInput · formatFieldValue");
const sh: Any = SH.mod;
if (!sh) console.log(`  (โหลด settings-shared ไม่ได้: ${SH.err})`);
const F0 = {
  domain: "qcfx", group: "g", helpTh: null, hasOwn: false, source: "TEMPLATE", sourceLabelTh: "ค่าจากแม่แบบ", templateValue: null,
  differsFromTemplate: false, overrideCount: 0, editable: true, lockedReasonTh: null, masked: false, pendingLegalReview: false,
  options: null, nullable: false, min: null, max: null, templateVars: null, requiresIntegration: null, effectiveDated: false,
  sensitivity: null, ownerOnly: false,
};
const fld = (key: string, type: string, value: unknown, over: Record<string, unknown> = {}) => ({ ...F0, key, type, labelTh: `ช่อง ${key}`, value, ...over });
const PM_FIELDS = [
  fld("x.a", "int", 5, { hasOwn: true, source: "UNIT" }),
  fld("x.b", "int", 7),
  fld("x.c", "money", 1000, { editable: false, lockedReasonTh: "แก้ได้เฉพาะเจ้าของกิจการ" }),
  fld("x.d", "text", null, { masked: true }),
  fld("x.e", "bool", false, { hasOwn: true, source: "UNIT" }),
  fld("x.f", "enum", "A", { options: [{ value: "A", labelTh: "แบบเอ" }, { value: "B", labelTh: "แบบบี" }] }),
  fld("x.g", "int", 3, { hasOwn: true, editable: false, lockedReasonTh: "ไม่มีสิทธิ์" }),
  fld("x.h", "table", { a: [1, 2] }),
];
const PM = { unitId: "u1", unitName: "สาขา", scope: "UNIT", scopeId: "u1", domains: ["qcfx"], templates: [], differsCount: 0, history: [],
  groups: [{ domain: "qcfx", key: "g", labelTh: "กลุ่มทดสอบ", fields: PM_FIELDS }] };
await t("P-1", "submissionFor: ส่งเฉพาะคีย์ที่แตะและเปลี่ยนจริง · ข้ามช่องล็อก/ซ่อน/ไม่รู้จัก · scope จากโมเดล · ตามชั้นบน ⇒ resets เฉพาะ hasOwn+editable", () => {
  const fn = needFn(sh, "submissionFor");
  const edits = { "x.b": 8, "x.c": 2000, "x.d": "ใหม่", "x.f": "B", "x.h": { a: [1, 2] }, "x.zz": 1, "x.a": 9, "x.g": 4 };
  const r = fn(PM, edits, new Set(["x.a", "x.e", "x.b"]));
  const ch = (r?.changes ?? []).map((c: Any) => [c.key, c.scope, c.scopeId, c.value]).sort();
  eq(ch, [["x.f", "UNIT", "u1", "B"]], "changes (x.b อยู่ใน follow · x.h ค่าเท่าเดิม · x.c/x.g ล็อก · x.d ซ่อน · x.zz ไม่รู้จัก · x.a อยู่ใน follow)");
  const rs = (r?.resets ?? []).map((c: Any) => [c.key, c.scope, c.scopeId]).sort();
  eq(rs, [["x.a", "UNIT", "u1"], ["x.e", "UNIT", "u1"]], "resets (x.b ไม่มีแถวของตัวเอง ⇒ ไม่ส่ง)");
  const r2 = fn(PM, {}, new Set());
  eq([r2?.changes?.length, r2?.resets?.length], [0, 0], "ไม่แตะอะไร ⇒ ไม่ส่งอะไร");
  const r3 = fn(PM, { "x.b": 8 }, new Set());
  eq((r3?.changes ?? []).map((c: Any) => c.key), ["x.b"], "แตะคีย์เดียว ⇒ ส่งคีย์เดียว");
});
await t("P-2", "parseFieldInput: เงินบาท→สตางค์ · %→bp · จำนวนเต็ม · ขอบ min/max · ว่าง/nullable · เวลา · enum — ผิด ⇒ ข้อความไทย", () => {
  const fn = needFn(sh, "parseFieldInput");
  const p: string[] = [];
  const good = (f: Any, raw: Any, exp: unknown) => { const r = fn(f, raw); if (r?.ok !== true || !isDeepStrictEqual(r.value, exp)) p.push(`${f.type} ${fmt(raw)} ⇒ ${fmt(r)} (ต้อง ${fmt(exp)})`); };
  const bad = (f: Any, raw: Any, needs?: string) => {
    const r = fn(f, raw);
    if (r?.ok !== false || !isThai(r?.messageTh)) p.push(`${f.type} ${fmt(raw)} ควรปฏิเสธเป็นไทย ได้ ${fmt(r)}`);
    else if (needs && !String(r.messageTh).includes(needs)) p.push(`${f.type} ${fmt(raw)} ข้อความต้องมี "${needs}": ${r.messageTh}`);
  };
  const money = fld("m", "money", 0, { min: 0, max: 1_000_000_000 });
  good(money, "1,250.50", 125050); good(money, "300", 30000); good(money, "0.05", 5);
  bad(money, "1.234"); bad(money, "-5"); bad(money, "สามร้อย"); bad(money, "");
  good(fld("mn", "money", null, { nullable: true }), "", null);
  const pct = fld("p", "percent", 0, { min: 0, max: 10000 });
  good(pct, "7.5", 750); good(pct, "10", 1000); bad(pct, "abc");
  const mins = fld("mi", "minutes", 0, { min: 0, max: 120 });
  good(mins, "15", 15); bad(mins, "1.5"); bad(mins, "121", "120"); bad(mins, "-1", "0");
  good(fld("dd", "days", 0, { min: 0, max: 60 }), "7", 7);
  good(fld("tm", "time", "08:00"), "21:30", "21:30"); bad(fld("tm", "time", "08:00"), "25:00");
  good(fld("bo", "bool", false), true, true);
  const en = fld("en", "enum", "A", { options: [{ value: "A", labelTh: "เอ" }, { value: "B", labelTh: "บี" }] });
  good(en, "B", "B"); bad(en, "C");
  ok(p.length === 0, p.slice(0, 8).join(" · "));
});
await t("P-3", "formatFieldValue: ฿ · % · นาที · วัน · เปิด/ปิด · ป้าย enum · ว่าง = — · table ไม่ใช่ JSON ดิบ · ซ่อน = ซ่อนไว้", () => {
  const fn = needFn(sh, "formatFieldValue");
  const p: string[] = [];
  const exp = (f: Any, v: unknown, want: string | RegExp) => {
    const r = fn(f, v);
    if (typeof r !== "string" || (typeof want === "string" ? r !== want : !want.test(r))) p.push(`${f.type} ${fmt(v)} ⇒ ${fmt(r)} (ต้อง ${String(want)})`);
  };
  exp(fld("m", "money", 0), 125050, "฿1,250.50");
  exp(fld("p", "percent", 0), 750, "7.5%");
  exp(fld("mi", "minutes", 0), 10, "10 นาที");
  exp(fld("d", "days", 0), 7, "7 วัน");
  exp(fld("b", "bool", false), true, "เปิด");
  exp(fld("b", "bool", false), false, "ปิด");
  exp(fld("e", "enum", "A", { options: [{ value: "A", labelTh: "แบบเอ" }] }), "A", "แบบเอ");
  exp(fld("n", "money", null), null, "—");
  exp(fld("t", "table", null), { start: "21:00", end: "08:00" }, /^[^{[]/);
  exp(fld("t2", "table", null), ["LINE", "WEB_LINK"], /^[^{[]/);
  exp(fld("x", "text", null, { masked: true }), null, "ซ่อนไว้");
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");

// ═══════════════ ฐานข้อมูล ═══════════════
const dbMod = await tryImport("@/lib/core/db");
if (!dbMod.mod) {
  console.error(`🔴 ${LABEL}: โหลด @/lib/core/db ไม่ได้ — ${dbMod.err}`);
  process.exit(4);
}
const db: Any = dbMod.mod.prisma;
const SLUG = "svc-r04-";
const MAIL = "svc-r04-";
const tenantIds: string[] = [];
const MODELS_BY_TENANT = [
  "settingChange", "settingValue", "settingProfile", "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
  "appNotification", "outboxEvent", "auditLog", "membership", "roomOccupancy", "hotelRoom", "hotelRoomType", "roomBuilding", "bookingStaff", "bookingService", "businessUnit",
];
const cleanup = async (ids: string[]) => {
  for (const id of ids) {
    for (const m of MODELS_BY_TENANT) {
      try { await db[m].deleteMany({ where: { tenantId: id } }); } catch { /* ไม่มีตาราง/คอลัมน์ */ }
    }
    try { await db.tenant.deleteMany({ where: { id } }); } catch (e) { console.log(`  ⚠️ ลบ tenant ${id}: ${errMsg(e)}`); }
  }
  try { await db.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
};
try {
  const stale = (await db.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })) as { id: string }[];
  if (stale.length) { console.log(`\n(กวาด tenant ค้าง ${stale.length})`); await cleanup(stale.map((r) => r.id)); }
  else await cleanup([]);
} catch (e) {
  console.log(`  ⚠️ กวาดของค้าง: ${errMsg(e)}`);
}

const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
const REASON = "ร้านตกลงกับผู้เช่าเป็นลายลักษณ์อักษรแล้ว";

// ── React (render) ──
const R_SERVER = await tryImport("react-dom/server");
const REACT = await tryImport("react");
const COMP = has(FILES.comp) ? await tryImport("@/components/settings/SettingsForm") : { mod: null, err: "ไม่มีไฟล์" };
if (!COMP.mod) console.log(`  (โหลด SettingsForm ไม่ได้: ${COMP.err})`);
const STUB_ACTIONS = { save: async () => ({ ok: true, saved: 0 }), reset: async () => ({ ok: true, removed: 0 }) };
const render = (model: Any): string => {
  const C = COMP.mod?.default ?? COMP.mod?.SettingsForm;
  if (typeof C !== "function") throw new AssertFail(`SettingsForm ไม่ใช่คอมโพเนนต์ (${COMP.err || "ไม่มี default export"})`);
  return String(R_SERVER.mod.renderToStaticMarkup(REACT.mod.createElement(C, { model, actions: STUB_ACTIONS }))).replace(/<!-- -->/g, "");
};
/** กล่องของคีย์ (ตัดตามแท็กสมดุลจากแท็กที่มี data-setting-key) */
function segmentsOf(html: string): Map<string, { html: string; count: number }> {
  const out = new Map<string, { html: string; count: number }>();
  const re = /data-setting-key="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const key = m[1];
    const open = html.lastIndexOf("<", m.index);
    const tag = /^<([a-zA-Z0-9-]+)/.exec(html.slice(open))?.[1] ?? "div";
    const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
    tagRe.lastIndex = open;
    let depth = 0;
    let end = html.length;
    let mm: RegExpExecArray | null;
    while ((mm = tagRe.exec(html))) {
      if (mm[2] === "/") { if (depth === 0) { end = tagRe.lastIndex; break; } continue; }
      depth += mm[1] === "/" ? -1 : 1;
      if (depth === 0) { end = tagRe.lastIndex; break; }
    }
    const prev = out.get(key);
    out.set(key, { html: prev ? prev.html : html.slice(open, end), count: (prev?.count ?? 0) + 1 });
  }
  return out;
}
const fieldsOf = (m: Any): Any[] => (Array.isArray(m?.groups) ? m.groups.flatMap((g: Any) => (Array.isArray(g?.fields) ? g.fields : [])) : []);
const fieldMap = (m: Any): Map<string, Any> => new Map(fieldsOf(m).map((f: Any) => [String(f.key), f]));
const keysOf = (m: Any): string[] => fieldsOf(m).map((f: Any) => String(f.key)).sort();
const expectedKeys = (domains: string[], scope: string): string[] =>
  domains.flatMap((d) => listDefs(d)).filter((d) => !d.hiddenUntil && (d.chain as string[]).includes(scope)).map((d) => String(d.key)).sort();
const diffKeys = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  return { missing: b.filter((k) => !A.has(k)), extra: a.filter((k) => !B.has(k)) };
};
function jsonPureProblems(v: unknown, path = "$", outP: string[] = []): string[] {
  if (outP.length > 5) return outP;
  if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean") return outP;
  if (typeof v === "number") { if (!Number.isFinite(v)) outP.push(`${path}: ${v}`); return outP; }
  if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint") { outP.push(`${path}: ${typeof v}`); return outP; }
  if (Array.isArray(v)) { v.forEach((x, i) => jsonPureProblems(x, `${path}[${i}]`, outP)); return outP; }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) { outP.push(`${path}: ${(v as object).constructor?.name ?? "class"}`); return outP; }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === "_zod" || k === "safeParse" || k === "_def") outP.push(`${path}.${k}`);
    jsonPureProblems(x, `${path}.${k}`, outP);
  }
  return outP;
}

let tA = "";
let tB = "";
try {
  // ═══════════════ ฉาก ═══════════════
  const mkTenant = async (name: string) => {
    const r = await db.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } });
    tenantIds.push(r.id);
    return r.id as string;
  };
  tA = await mkTenant("QC R0.4 ร้าน A");
  tB = await mkTenant("QC R0.4 ร้าน B");
  const mkUnit = async (tenantId: string, type: string, name: string) => (await db.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UA = await mkUnit(tA, "DORM", "หอทดสอบ R0.4");
  const U2 = await mkUnit(tA, "BOOKING", "ร้านตัดผมทดสอบ R0.4");
  const UB = await mkUnit(tB, "BOOKING", "สาขาร้าน B");
  const ST1 = (await db.bookingStaff.create({ data: { tenantId: tA, unitId: UA, name: "ช่าง 1" } })).id as string;
  const ST2 = (await db.bookingStaff.create({ data: { tenantId: tA, unitId: UA, name: "ช่าง 2" } })).id as string;
  const STB = (await db.bookingStaff.create({ data: { tenantId: tB, unitId: UB, name: "ช่าง ร้าน B" } })).id as string;
  const BL1 = (await db.roomBuilding.create({ data: { tenantId: tA, unitId: UA, name: "อาคาร A", floors: 3, sortOrder: 0 } })).id as string;
  const RT1 = (await db.hotelRoomType.create({ data: { tenantId: tA, unitId: UA, name: "ห้องมาตรฐาน" } })).id as string;
  const RT2 = (await db.hotelRoomType.create({ data: { tenantId: tA, unitId: U2, name: "ห้องของสาขาอื่น" } })).id as string;
  const ctxA = { tenantId: tA };
  const ctxB = { tenantId: tB };
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-r04-${tag}-${RUN}`;
    await db.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@qc.invalid`, name: `QC r04 ${tag}` } });
    await db.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UA]);
  const MGR2 = await mkMember("mgr2", tA, "MANAGER", [U2]);
  const STAFF_P = await mkMember("staffp", tA, "STAFF", [UA], { "qcfx.settings.edit": true, "settings.payments.edit": true });
  const STAFF_N = await mkMember("staffn", tA, "STAFF", [UA]);
  await mkMember("owner-b", tB, "OWNER", ["*"]);

  const setS = (a: Actor, changes: Any[], opts?: Any) => needFn(s, "setSettings")(a, ctxA, changes, opts);
  const load = (a: Actor, q: Any, ctx: Any = ctxA): Promise<Any> => needFn(s, "loadSettingsForm")(a, ctx, q);
  const K = { label: "qcfx.general.label", grace: "qcfx.late.graceMin", noShow: "qcfx.late.noShowAfterMin", rent: "qcfx.fee.rentSatang",
    mode: "qcfx.legal.mode", reason: "qcfx.legal.outOfScopeReason", ret: "qcfx.deposit.returnDays", payout: "qcfx.owner.payoutNote" };

  let seeded = false;
  await t("M-0", "ฉาก: แม่แบบ QCFX_A ที่สาขา UA · ค่า TENANT/UNIT/STAFF×2/PRIVACY · สาขา U2 (เจ้าของตั้งได้ครบ)", async () => {
    if (!s) throw new AssertFail(`โหลด @/lib/core/settings ไม่ได้: ${S.err}`);
    const ap = await s.applyTemplate(OWNER, ctxA, { unitId: UA, domain: "qcfx", templateKey: "QCFX_A", overwrite: "KEEP_CUSTOM" });
    ok(ap?.ok, `applyTemplate ${fmt(ap)}`);
    const r = await setS(OWNER, [
      { key: K.label, scope: "TENANT", scopeId: tA, value: "ช่างใหญ่" },
      { key: K.grace, scope: "UNIT", scopeId: UA, value: 12 },
      { key: K.grace, scope: "STAFF", scopeId: ST1, value: 15 },
      { key: K.grace, scope: "STAFF", scopeId: ST2, value: 14 },
      { key: K.rent, scope: "UNIT", scopeId: UA, value: 380000 },
      { key: PRIV, scope: "UNIT", scopeId: UA, value: SECRET },
      { key: K.label, scope: "UNIT", scopeId: U2, value: "สาขาสอง" },
    ]);
    ok(r?.ok, `setSettings ${fmt(r)}`);
    seeded = true;
  });
  const needSeed = () => { if (!seeded) throw new AssertFail("ฉาก M-0 ไม่ผ่าน"); };

  // ═══════════════ M. loadSettingsForm (ฟิกซ์เจอร์) ═══════════════
  console.log("\nM. loadSettingsForm (qcfx)");
  let mOwner: Any = null;
  await t("M-1", "ชั้น UNIT: ช่อง = def qcfx ไม่ซ่อนที่ chain มี UNIT ครบพอดี · ป้ายกลุ่มไทยไม่ซ้ำ · unitName/scope/scopeId", async () => {
    needSeed();
    mOwner = await load(OWNER, { domains: ["qcfx"], unitId: UA });
    ok(mOwner, "ได้ null");
    const d = diffKeys(keysOf(mOwner), expectedKeys(["qcfx"], "UNIT"));
    ok(!d.missing.length && !d.extra.length, `ขาด ${d.missing.join(",")} · เกิน ${d.extra.join(",")}`);
    eq([mOwner.unitId, mOwner.unitName, mOwner.scope, mOwner.scopeId], [UA, "หอทดสอบ R0.4", "UNIT", UA], "หัวโมเดล");
    const labels = (mOwner.groups as Any[]).map((g) => g.labelTh);
    ok(labels.every(isThai), `ป้ายกลุ่มไม่ใช่ไทย: ${fmt(labels)}`);
    eq(new Set(labels).size, labels.length, "ป้ายกลุ่มซ้ำ");
    ok(fieldsOf(mOwner).every((f: Any) => isThai(f.labelTh)), "labelTh ของช่องไม่ใช่ไทย");
  });
  await t("M-2", "ที่มา/แม่แบบ: grace 12 (UNIT·มีแถว·ต่างจากแม่แบบ 10·ปรับรายคน 2) · noShow 20 (TEMPLATE) · label จาก TENANT · differsCount ถูก", async () => {
    ok(mOwner, "ไม่มีโมเดล");
    const fm = fieldMap(mOwner);
    const g = fm.get(K.grace);
    eq([g?.value, g?.hasOwn, g?.source, g?.templateValue, g?.differsFromTemplate, g?.overrideCount], [12, true, "UNIT", 10, true, 2], "grace");
    const n = fm.get(K.noShow);
    eq([n?.value, n?.hasOwn, n?.source, n?.differsFromTemplate, n?.overrideCount], [20, false, "TEMPLATE", false, 0], "noShow");
    ok(isThai(n?.sourceLabelTh) && String(n?.sourceLabelTh).includes("แม่แบบ"), `sourceLabelTh TEMPLATE: ${fmt(n?.sourceLabelTh)}`);
    const l = fm.get(K.label);
    eq([l?.value, l?.hasOwn, l?.source], ["ช่างใหญ่", false, "TENANT"], "label");
    ok(isThai(l?.sourceLabelTh) && l.sourceLabelTh !== n.sourceLabelTh, `sourceLabelTh TENANT: ${fmt(l?.sourceLabelTh)}`);
    const cnt = fieldsOf(mOwner).filter((f: Any) => f.differsFromTemplate).length;
    eq(mOwner.differsCount, cnt, "differsCount");
    ok(cnt >= 4, `ต่างจากแม่แบบควร ≥ 4 (label grace rent privateNote) ได้ ${cnt}`);
    const tp = (mOwner.templates as Any[] | undefined)?.find((x) => x.domain === "qcfx");
    eq([tp?.key, isThai(tp?.labelTh)], ["QCFX_A", true], "templates.qcfx");
  });
  await t("M-3", "ข้อมูลช่อง: enum มี options ไทยครบ · min/max จาก schema · nullable · templateVars · requiresIntegration · effectiveDated · ownerOnly/sensitivity", async () => {
    ok(mOwner, "ไม่มีโมเดล");
    const fm = fieldMap(mOwner);
    const mode = fm.get(K.mode);
    eq((mode?.options ?? []).map((o: Any) => o.value), ["STRICT", "WARN", "OUT_OF_SCOPE"], "options โหมด");
    ok((mode?.options ?? []).every((o: Any) => typeof o.labelTh === "string" && o.labelTh !== o.value && !RAW.test(o.labelTh)), `ป้ายโหมด ${fmt(mode?.options)}`);
    eq([fm.get(K.grace)?.min, fm.get(K.grace)?.max, fm.get(K.grace)?.nullable], [0, 120, false], "grace min/max/nullable");
    eq(fm.get(K.reason)?.nullable, true, "outOfScopeReason nullable");
    eq(fm.get("qcfx.msg.reminder")?.templateVars, ["ชื่อ", "ห้อง", "ยอด"], "templateVars");
    eq(fm.get("qcfx.deposit.autoVerify")?.requiresIntegration, "SLIP_VERIFY", "requiresIntegration");
    eq(fm.get(K.rent)?.effectiveDated, true, "rent effectiveDated");
    eq([fm.get(K.payout)?.ownerOnly, fm.get(K.payout)?.sensitivity, fm.get(K.mode)?.sensitivity], [true, "MONEY", "LEGAL"], "ownerOnly/sensitivity");
    for (const f of fieldsOf(mOwner)) ok(typeof f.type === "string" && f.type === getDef(f.key)?.type, `${f.key}: type ${fmt(f.type)}`);
  });
  await t("M-4", "โมเดลเป็น JSON ล้วน (ไม่มี function/Date/zod/คลาส) — ส่งเป็น prop ของ client ได้", async () => {
    ok(mOwner, "ไม่มีโมเดล");
    const p = jsonPureProblems(mOwner);
    ok(p.length === 0, p.join(" · "));
  });
  await t("M-5", "ชั้นอื่น: STAFF ST1 = เฉพาะ def ที่ chain มี STAFF (grace 15 ของตัวเอง) · TENANT = def ที่มี TENANT (label มีแถว)", async () => {
    needSeed();
    const m1 = await load(OWNER, { domains: ["qcfx"], unitId: UA, scope: "STAFF", scopeId: ST1 });
    ok(m1, "STAFF ได้ null");
    const d1 = diffKeys(keysOf(m1), expectedKeys(["qcfx"], "STAFF"));
    ok(!d1.missing.length && !d1.extra.length, `STAFF ขาด ${d1.missing} เกิน ${d1.extra}`);
    const g = fieldMap(m1).get(K.grace);
    eq([g?.value, g?.hasOwn, g?.source], [15, true, "STAFF"], "grace ST1");
    eq(fieldMap(m1).get(K.noShow)?.source, "TEMPLATE", "noShow ST1");
    const m2 = await load(OWNER, { domains: ["qcfx"], unitId: UA, scope: "TENANT" });
    ok(m2, "TENANT ได้ null");
    eq(m2.scopeId, tA, "TENANT scopeId = tenantId");
    const d2 = diffKeys(keysOf(m2), expectedKeys(["qcfx"], "TENANT"));
    ok(!d2.missing.length && !d2.extra.length, `TENANT ขาด ${d2.missing} เกิน ${d2.extra}`);
    eq([fieldMap(m2).get(K.label)?.hasOwn, fieldMap(m2).get(K.label)?.value], [true, "ช่างใหญ่"], "label TENANT");
  });
  await t("M-6", "คืน null (X1 · สาขา): ร้านอื่น · ผู้จัดการสาขาอื่น · scopeId ร้านอื่น/สาขาอื่น · ชั้นไม่รองรับ · ไม่ throw", async () => {
    needSeed();
    const cases: [string, Actor, Any, Any][] = [
      ["unit ร้าน B ด้วย ctx A", OWNER, { domains: ["qcfx"], unitId: UB }, ctxA],
      ["ctx ร้าน B ขอ unit A", OWNER, { domains: ["qcfx"], unitId: UA }, ctxB],
      ["ผู้จัดการ U2 ขอ UA", MGR2, { domains: ["qcfx"], unitId: UA }, ctxA],
      ["STAFF ของร้าน B", OWNER, { domains: ["qcfx"], unitId: UA, scope: "STAFF", scopeId: STB }, ctxA],
      ["ROOM_TYPE ของสาขา U2 ใต้ UA", OWNER, { domains: ["rooms"], unitId: UA, scope: "ROOM_TYPE", scopeId: RT2 }, ctxA],
      ["ชั้น LEASE", OWNER, { domains: ["rooms"], unitId: UA, scope: "LEASE", scopeId: "lease-x" }, ctxA],
    ];
    const p: string[] = [];
    for (const [n, a, q, c] of cases) {
      try { const r = await load(a, q, c); if (r !== null) p.push(`${n}: ได้ ${fmt(r).slice(0, 60)}`); }
      catch (e) { p.push(`${n}: โยน ${errMsg(e).slice(0, 80)}`); }
    }
    ok(p.length === 0, p.join(" · "));
  });
  // editable ⇔ setSettings ไม่ตอบ PERMISSION (oracle เทียบเครื่องยนต์จริง — ค่าเดิมจึงไม่เปลี่ยนข้อมูล)
  const equivalence = async (a: Actor, q: Any): Promise<string[]> => {
    const m = await load(a, q);
    if (!m) return ["โมเดล null"];
    const p: string[] = [];
    for (const f of fieldsOf(m)) {
      if (f.masked) continue;
      const r = await setS(a, [{ key: f.key, scope: m.scope, scopeId: m.scopeId, value: f.value }]);
      const denied = r?.ok === false && r?.code === "PERMISSION";
      if (denied === Boolean(f.editable)) p.push(`${f.key}: editable=${f.editable} แต่ setSettings ${r?.ok ? "ok" : r?.code}`);
      if (!f.editable && !isThai(f.lockedReasonTh)) p.push(`${f.key}: ล็อกแต่ไม่มี lockedReasonTh ไทย`);
      if (f.editable && f.lockedReasonTh) p.push(`${f.key}: แก้ได้แต่มี lockedReasonTh`);
    }
    return p;
  };
  await t("M-7", "editable ⇔ เครื่องยนต์: เจ้าของ · ผู้จัดการ · พนักงานมีสิทธิ์ · พนักงานไม่มีสิทธิ์ (ชั้น UNIT) + ผู้จัดการชั้น TENANT (ล็อกทั้งหมด)", async () => {
    needSeed();
    const p: string[] = [];
    for (const [n, a] of [["owner", OWNER], ["mgr", MGR], ["staffP", STAFF_P], ["staffN", STAFF_N]] as [string, Actor][]) {
      for (const x of await equivalence(a, { domains: ["qcfx"], unitId: UA })) p.push(`${n} ${x}`);
    }
    for (const x of await equivalence(MGR, { domains: ["qcfx"], unitId: UA, scope: "TENANT" })) p.push(`mgr/TENANT ${x}`);
    const mt = await load(MGR, { domains: ["qcfx"], unitId: UA, scope: "TENANT" });
    ok(mt && fieldsOf(mt).every((f: Any) => f.editable === false), "ผู้จัดการจำกัดสาขา ชั้น TENANT ต้องล็อกทุกช่อง");
    ok(p.length === 0, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : ""));
  });
  await t("M-8", "ล็อกตามสิทธิ์: ผู้จัดการแก้โหมดกฎหมาย/ownerOnly ไม่ได้ (เหตุผลมี \"เจ้าของ\") · พนักงานไม่มีสิทธิ์แก้ช่องเงินไม่ได้ · พนักงานมีสิทธิ์แก้ค่าเช่าได้แต่ ownerOnly ไม่ได้", async () => {
    needSeed();
    const mm = fieldMap(await load(MGR, { domains: ["qcfx"], unitId: UA }));
    eq([mm.get(K.mode)?.editable, mm.get(K.payout)?.editable, mm.get(K.grace)?.editable], [false, false, true], "ผู้จัดการ mode/payout/grace");
    ok(String(mm.get(K.mode)?.lockedReasonTh ?? "").includes("เจ้าของ"), `เหตุผลล็อกโหมด: ${fmt(mm.get(K.mode)?.lockedReasonTh)}`);
    const mn = fieldMap(await load(STAFF_N, { domains: ["qcfx"], unitId: UA }));
    ok([...mn.values()].every((f: Any) => f.editable === false), "พนักงานไม่มีสิทธิ์ต้องล็อกทุกช่อง");
    const mp = fieldMap(await load(STAFF_P, { domains: ["qcfx"], unitId: UA }));
    eq([mp.get(K.rent)?.editable, mp.get(K.payout)?.editable, mp.get(K.mode)?.editable], [true, false, false], "พนักงานมีสิทธิ์ rent/payout/mode");
  });
  await t("M-9", "PRIVACY: ผู้ไม่ใช่เจ้าของเห็น masked (value null) · ค่าลับไม่อยู่ในโมเดล · เจ้าของเห็นค่า", async () => {
    needSeed();
    const mm = await load(MGR, { domains: ["qcfx"], unitId: UA });
    const f = fieldMap(mm).get(PRIV);
    eq([f?.masked, f?.value ?? null], [true, null], "privateNote ผู้จัดการ");
    ok(!JSON.stringify(mm).includes(SECRET), "ค่าลับหลุดในโมเดลของผู้จัดการ");
    const fo = fieldMap(await load(OWNER, { domains: ["qcfx"], unitId: UA })).get(PRIV);
    eq([fo?.masked, fo?.value], [false, SECRET], "privateNote เจ้าของ");
  });
  await t("M-10", "ประวัติ: settingHistory(actor ผู้จัดการ) ปิดค่า PRIVACY (before/after null · masked) · เจ้าของเห็น · model.history ไทย ไม่มีแถวสาขาอื่นสำหรับผู้จำกัดสาขา", async () => {
    needSeed();
    const hm = (await s.settingHistory(ctxA, { unitId: UA, key: PRIV, actor: MGR })) as Any[];
    ok(hm.length >= 1, "ไม่มีแถวประวัติ privateNote");
    ok(hm.every((r) => r.after === null && r.before === null && r.masked === true), `ผู้จัดการ: ${fmt(hm[0])}`);
    ok(!JSON.stringify(hm).includes(SECRET), "ค่าลับหลุดในประวัติ");
    const ho = (await s.settingHistory(ctxA, { unitId: UA, key: PRIV, actor: OWNER })) as Any[];
    ok(ho.some((r) => r.after === SECRET && !r.masked), "เจ้าของต้องเห็นค่าจริง");
    const mm = await load(MGR, { domains: ["qcfx"], unitId: UA });
    const hist = (mm?.history ?? []) as Any[];
    ok(hist.length >= 1 && hist.length <= 50, `model.history ${hist.length}`);
    ok(hist.every((h) => isThai(h.labelTh) && typeof h.at === "string" && typeof h.beforeTh === "string" && typeof h.afterTh === "string"), `แถวประวัติ ${fmt(hist[0])}`);
    ok(hist.some((h) => h.key === PRIV && h.masked === true), "ไม่มีแถว privateNote แบบ masked");
    ok(!JSON.stringify(hist).includes(SECRET), "ค่าลับหลุดใน model.history");
    ok(!JSON.stringify(hist).includes("สาขาสอง"), "ผู้จัดการ UA เห็นประวัติของสาขา U2");
    const ownerHist = ((await load(OWNER, { domains: ["qcfx"], unitId: UA }))?.history ?? []) as Any[];
    ok(ownerHist.some((h) => h.key === K.grace && String(h.afterTh).includes("12")), "เจ้าของ: ไม่มีแถว grace → 12");
  });

  // ═══════════════ D. โดเมนจริง ═══════════════
  console.log("\nD. โดเมนจริง (rooms · payments · messaging)");
  const DOMS = ["rooms", "payments", "messaging"];
  let mDorm: Any = null;
  await t("D-1", "สาขาหอ ชั้น UNIT: ครบทุก def ไม่ซ่อนที่ตั้งชั้น UNIT ได้ · ไม่มี rooms.hotel.* / onVerifierDown · ป้ายกลุ่มไทยไม่ซ้ำต่อ domain", async () => {
    needSeed();
    mDorm = await load(OWNER, { domains: DOMS, unitId: UA });
    ok(mDorm, "null");
    const ks = keysOf(mDorm);
    const d = diffKeys(ks, expectedKeys(DOMS, "UNIT"));
    ok(!d.missing.length && !d.extra.length, `ขาด ${d.missing.slice(0, 6)} เกิน ${d.extra.slice(0, 6)}`);
    ok(!ks.some((k) => k.startsWith("rooms.hotel.")), "มีค่าโรงแรม (ซ่อนจนเฟส H)");
    ok(!ks.includes("payments.slip.onVerifierDown"), "มี onVerifierDown");
    ok(expectedKeys(DOMS, "UNIT").length >= 50, "def ชั้น UNIT น้อยผิดปกติ");
    const p: string[] = [];
    for (const dm of DOMS) {
      const ls = (mDorm.groups as Any[]).filter((g) => g.domain === dm).map((g) => g.labelTh);
      if (!ls.every(isThai)) p.push(`${dm}: ป้ายไม่ใช่ไทย ${fmt(ls)}`);
      if (new Set(ls).size !== ls.length) p.push(`${dm}: ป้ายกลุ่มซ้ำ ${fmt(ls)}`);
    }
    ok(p.length === 0, p.join(" · "));
  });
  await t("D-2", "ชั้น TENANT · BUILDING · ROOM_TYPE ของหอ: ช่องตรง def ไม่ซ่อนที่ chain มีชั้นนั้น · ทุก def ไม่ซ่อนมีอย่างน้อยหนึ่งชั้นที่หน้าเปิดได้", async () => {
    needSeed();
    const p: string[] = [];
    for (const [scope, scopeId] of [["TENANT", undefined], ["BUILDING", BL1], ["ROOM_TYPE", RT1]] as [string, string | undefined][]) {
      const m = await load(OWNER, { domains: DOMS, unitId: UA, scope, ...(scopeId ? { scopeId } : {}) });
      if (!m) { p.push(`${scope}: null`); continue; }
      const d = diffKeys(keysOf(m), expectedKeys(DOMS, scope));
      if (d.missing.length || d.extra.length) p.push(`${scope}: ขาด ${d.missing.slice(0, 4)} เกิน ${d.extra.slice(0, 4)}`);
    }
    const open = new Set(["TENANT", "UNIT", "BUILDING", "ROOM_TYPE", "ROOM", "STAFF", "SERVICE"]);
    for (const dm of DOMS) for (const d of listDefs(dm)) if (!d.hiddenUntil && !(d.chain as string[]).some((c) => open.has(c))) p.push(`${d.key}: ไม่มีชั้นที่เปิดได้`);
    ok(p.length === 0, p.join(" · "));
  });
  await t("D-3", "ป้าย \"⚠️ รอที่ปรึกษากฎหมายตรวจ\": pendingLegalReview = true เฉพาะคีย์ใน PENDING_LEGAL_REVIEW_KEYS", async () => {
    ok(mDorm, "ไม่มีโมเดล");
    const pend = new Set<string>((ROOMS.mod?.PENDING_LEGAL_REVIEW_KEYS ?? []) as string[]);
    ok(pend.size >= 5, "อ่าน PENDING_LEGAL_REVIEW_KEYS ไม่ได้");
    const bad = fieldsOf(mDorm).filter((f: Any) => Boolean(f.pendingLegalReview) !== pend.has(f.key)).map((f: Any) => f.key);
    ok(bad.length === 0, `ไม่ตรง: ${bad.join(",")}`);
  });
  await t("D-4", "ตัวเลือก enum ในโมเดลตรง schema ครบ + ป้ายไทย (ทุกชั้นที่โหลด)", async () => {
    ok(mDorm, "ไม่มีโมเดล");
    const p: string[] = [];
    for (const f of fieldsOf(mDorm)) {
      if (f.type !== "enum") continue;
      const opts = enumOptions(getDef(f.key)?.schema);
      const got = (f.options ?? []).map((o: Any) => o.value);
      if (!isDeepStrictEqual(got, opts)) p.push(`${f.key}: ${fmt(got)} ≠ ${fmt(opts)}`);
      if ((f.options ?? []).some((o: Any) => !o.labelTh || o.labelTh === o.value || RAW.test(o.labelTh))) p.push(`${f.key}: ป้ายดิบ`);
    }
    ok(p.length === 0, p.slice(0, 6).join(" · "));
  });
  await t("D-5", "โหมดกฎหมาย 3 แบบ: rooms.legal.mode STRICT/WARN/OUT_OF_SCOPE · เจ้าของแก้ได้ · ผู้จัดการหอล็อก (เหตุผลมี \"เจ้าของ\") · ผู้จัดการแก้ค่าอื่นของหอได้", async () => {
    ok(mDorm, "ไม่มีโมเดล");
    const fo = fieldMap(mDorm).get("rooms.legal.mode");
    eq((fo?.options ?? []).map((o: Any) => o.value), ["STRICT", "WARN", "OUT_OF_SCOPE"], "options");
    eq(fo?.editable, true, "เจ้าของ editable");
    const mm = fieldMap(await load(MGR, { domains: DOMS, unitId: UA }));
    const fm = mm.get("rooms.legal.mode");
    eq(fm?.editable, false, "ผู้จัดการ editable");
    ok(String(fm?.lockedReasonTh ?? "").includes("เจ้าของ"), `เหตุผล ${fmt(fm?.lockedReasonTh)}`);
    eq([mm.get("rooms.billing.dueDay")?.editable, mm.get("rooms.general.businessType")?.editable], [true, false], "ผู้จัดการ dueDay / businessType(LEGAL)");
  });
  await t("D-6", "editable ⇔ เครื่องยนต์ บนโดเมนจริง: ผู้จัดการ · พนักงานมีสิทธิ์รับเงิน · พนักงานไม่มีสิทธิ์ (payments: บัญชีรับเงิน ownerOnly ล็อก · ยอดคลาดเคลื่อนแก้ได้)", async () => {
    needSeed();
    const p: string[] = [];
    for (const [n, a] of [["mgr", MGR], ["staffP", STAFF_P], ["staffN", STAFF_N]] as [string, Actor][]) {
      for (const x of await equivalence(a, { domains: DOMS, unitId: UA })) p.push(`${n} ${x}`);
    }
    const mp = fieldMap(await load(STAFF_P, { domains: ["payments"], unitId: UA }));
    eq([mp.get("payments.receiver")?.editable, mp.get("payments.slip.toleranceSatang")?.editable], [false, true], "staffP receiver/tolerance");
    ok(p.length === 0, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : ""));
  });
  await t("D-7", "บัญชีรับเงิน: เจ้าของบันทึก {promptpayId,displayName} ได้ · เลขผิดรูป ⇒ VALIDATION ไทย · โมเดลอ่านค่ากลับ · แสดงผลไม่ใช่ JSON ดิบ", async () => {
    needSeed();
    const v = { promptpayId: "0812345678", displayName: "บัญชีหอทดสอบ" };
    const r1 = await setS(OWNER, [{ key: "payments.receiver", scope: "UNIT", scopeId: UA, value: v }]);
    ok(r1?.ok, `บันทึก ${fmt(r1)}`);
    const r2 = await setS(OWNER, [{ key: "payments.receiver", scope: "UNIT", scopeId: UA, value: { promptpayId: "12ab" } }]);
    ok(r2?.ok === false && r2.code === "VALIDATION" && (r2.issues ?? []).some((i: Any) => isThai(i.messageTh)), `เลขผิด ${fmt(r2)}`);
    const f = fieldMap(await load(OWNER, { domains: ["payments"], unitId: UA })).get("payments.receiver");
    eq([f?.value, f?.hasOwn], [v, true], "ค่าในโมเดล");
    if (sh?.formatFieldValue) {
      const txt = sh.formatFieldValue(f, f.value);
      ok(typeof txt === "string" && !/^[{[]/.test(txt) && txt.includes("0812345678".slice(-4)), `แสดงผล ${fmt(txt)}`);
    } else throw new AssertFail("ไม่มี formatFieldValue");
  });

  // ═══════════════ H. render ═══════════════
  console.log("\nH. render (react-dom/server)");
  await t("H-1", "render เจ้าของ (qcfx): กล่องละคีย์ครั้งเดียว (data-setting-key) · data-kind = ชนิดค่า · ป้ายไทยทุกช่อง · หัวฟอร์ม (ปรับจากแม่แบบ N ข้อ · ดูเฉพาะที่ปรับ · ประวัติ)", async () => {
    const m = await load(OWNER, { domains: ["qcfx"], unitId: UA });
    const html = render(m);
    const seg = segmentsOf(html);
    const p: string[] = [];
    for (const f of fieldsOf(m)) {
      const sg = seg.get(f.key);
      if (!sg) { p.push(`${f.key}: ไม่มีกล่อง`); continue; }
      if (sg.count !== 1) p.push(`${f.key}: ${sg.count} กล่อง`);
      if (!new RegExp(`data-kind="${f.type}"`).test(sg.html)) p.push(`${f.key}: data-kind ≠ ${f.type}`);
      if (!sg.html.includes(f.labelTh)) p.push(`${f.key}: ไม่มีป้าย ${f.labelTh}`);
    }
    if (seg.size !== fieldsOf(m).length) p.push(`กล่อง ${seg.size} ≠ ช่อง ${fieldsOf(m).length}`);
    if (!html.includes(`ปรับจากแม่แบบ ${m.differsCount} ข้อ`)) p.push(`ไม่มี "ปรับจากแม่แบบ ${m.differsCount} ข้อ"`);
    for (const w of ["ดูเฉพาะที่ปรับ", "ประวัติ"]) if (!html.includes(w)) p.push(`ไม่มี ${w}`);
    ok(p.length === 0, p.slice(0, 8).join(" · "));
  });
  const widgetOk = (type: string, h: string): boolean => {
    switch (type) {
      case "bool": return /role="switch"/.test(h) || /type="checkbox"/.test(h);
      case "enum": return /<select\b/.test(h) || /role="radiogroup"/.test(h);
      case "int": case "money": case "percent": case "minutes": case "days": return /inputMode="(numeric|decimal)"|inputmode="(numeric|decimal)"|type="number"/.test(h);
      case "time": return /type="time"/.test(h);
      case "template": return /<textarea\b/.test(h);
      case "text": return /<input\b/.test(h) || /<textarea\b/.test(h);
      case "table": return /<(input|select|button)\b/.test(h) && !/<textarea[^>]*>\s*[{[]/.test(h);
      default: return false;
    }
  };
  await t("H-2", "ตัวรับค่าตรงชนิด (switch · select/radiogroup · numeric · time · textarea · ตารางไม่ใช่ JSON ดิบ) — qcfx + หอ", async () => {
    const p: string[] = [];
    for (const m of [await load(OWNER, { domains: ["qcfx"], unitId: UA }), await load(OWNER, { domains: DOMS, unitId: UA })]) {
      const seg = segmentsOf(render(m));
      for (const f of fieldsOf(m)) {
        const sg = seg.get(f.key);
        if (sg && !widgetOk(f.type, sg.html)) p.push(`${f.key}(${f.type})`);
      }
    }
    ok(p.length === 0, `ตัวรับค่าไม่ตรง: ${p.slice(0, 10).join(", ")}`);
  });
  await t("H-3", "ป้ายต่อช่อง: \"ต่างจากแม่แบบ\" เฉพาะที่ต่าง · \"คืนค่า\" + \"ตามชั้นบน\" เฉพาะ hasOwn+editable · \"ปรับรายคน 2\" ที่ grace", async () => {
    const m = await load(OWNER, { domains: ["qcfx"], unitId: UA });
    const seg = segmentsOf(render(m));
    const p: string[] = [];
    for (const f of fieldsOf(m)) {
      const h = seg.get(f.key)?.html ?? "";
      if (h.includes("ต่างจากแม่แบบ") !== Boolean(f.differsFromTemplate)) p.push(`${f.key}: ต่างจากแม่แบบ=${f.differsFromTemplate}`);
      const own = Boolean(f.hasOwn && f.editable);
      if (h.includes("คืนค่า") !== own) p.push(`${f.key}: คืนค่า (hasOwn+editable=${own})`);
      if (h.includes("ตามชั้นบน") !== own) p.push(`${f.key}: ตามชั้นบน (hasOwn+editable=${own})`);
    }
    if (!(seg.get(K.grace)?.html ?? "").includes("ปรับรายคน 2")) p.push("grace ไม่มี ปรับรายคน 2");
    if ((seg.get(K.noShow)?.html ?? "").includes("ปรับรายคน")) p.push("noShow มี ปรับรายคน");
    ok(p.length === 0, p.slice(0, 8).join(" · "));
  });
  await t("H-4", "render ผู้จัดการ: ช่องล็อกมี disabled + เหตุผลไทย · ช่องแก้ได้ไม่ disabled · ค่าลับ PRIVACY ไม่อยู่ใน HTML", async () => {
    const m = await load(MGR, { domains: ["qcfx"], unitId: UA });
    const html = render(m);
    const seg = segmentsOf(html);
    const p: string[] = [];
    for (const f of fieldsOf(m)) {
      const h = seg.get(f.key)?.html ?? "";
      if (!f.editable && (!/\bdisabled\b/.test(h) || !h.includes(f.lockedReasonTh))) p.push(`${f.key}: ล็อกแต่ไม่ disabled/ไม่มีเหตุผล`);
      if (f.editable && f.type !== "table" && /\bdisabled=""/.test(h)) p.push(`${f.key}: แก้ได้แต่ disabled`);
    }
    if (html.includes(SECRET)) p.push("ค่าลับ PRIVACY อยู่ใน HTML");
    ok(p.length === 0, p.slice(0, 8).join(" · "));
  });
  await t("H-5", "render หอ (เจ้าของ): ป้าย \"⚠️ รอที่ปรึกษากฎหมายตรวจ\" เฉพาะคีย์ที่รอ · ไม่มีค่า enum ดิบเป็นข้อความที่มองเห็น · ไม่มี rooms.hotel", async () => {
    const m = await load(OWNER, { domains: DOMS, unitId: UA });
    const html = render(m);
    const seg = segmentsOf(html);
    const p: string[] = [];
    for (const f of fieldsOf(m)) {
      const h = seg.get(f.key)?.html ?? "";
      if (h.includes("⚠️ รอที่ปรึกษากฎหมายตรวจ") !== Boolean(f.pendingLegalReview)) p.push(`${f.key}: ป้ายรอตรวจ=${f.pendingLegalReview}`);
    }
    const raws = new Set<string>();
    for (const f of fieldsOf(m)) for (const o of f.options ?? []) if (RAW.test(o.value) && o.value.length > 3) raws.add(o.value);
    const texts = [...html.matchAll(/>([^<]+)</g)].map((x) => x[1].trim()).filter(Boolean);
    const shown = texts.filter((tx) => raws.has(tx));
    if (shown.length) p.push(`ค่าดิบเป็นข้อความ: ${[...new Set(shown)].slice(0, 6).join(",")}`);
    if (html.includes("rooms.hotel.")) p.push("มี rooms.hotel.*");
    ok(p.length === 0, p.slice(0, 8).join(" · "));
  });
  await t("H-6", "ปุ่มทุกปุ่ม ≥ 44px (min-h-11 / min-h-[44px] / h-11 / h-12 / min-h-12 / min-h-[48px])", async () => {
    const html = render(await load(OWNER, { domains: DOMS, unitId: UA }));
    const btns = [...html.matchAll(/<button\b[^>]*>/g)].map((x) => x[0]);
    ok(btns.length > 0, "ไม่มีปุ่ม");
    const bad = btns.filter((b) => !/class="[^"]*(?:^|\s)(min-h-11|min-h-\[44px\]|h-11|h-12|min-h-12|min-h-\[48px\])(?:\s|")/.test(b));
    ok(bad.length === 0, `${bad.length}/${btns.length} ปุ่มเล็ก: ${bad[0]?.slice(0, 120)}`);
  }, "MAJOR");

  // ═══════════════ A. สรุปข้อเสนอในหน้าอนุมัติ ═══════════════
  console.log("\nA. สรุปข้อเสนอ settings.legal_override");
  const ap = (await tryImport("@/lib/modules/approval/service")).mod as Any;
  let reqId = "";
  let reqId2 = "";
  await t("A-1", "ฉาก: เจ้าของตั้ง UA = WARN + สายอนุมัติ OWNER · ผู้จัดการ ack คืนประกัน 14 วัน ⇒ NEEDS_APPROVAL + approvalId · ชุดที่มี PRIVACY ⇒ อีกคำขอ", async () => {
    needSeed();
    ok(ap, "โหลด approval/service ไม่ได้");
    ok((await setS(OWNER, [{ key: K.mode, scope: "UNIT", scopeId: UA, value: "WARN" }]))?.ok, "ตั้ง WARN");
    await ap.createPolicy(ctxA, { name: "QC r04 เจ้าของอนุมัติ", entityType: "settings.legal_override", steps: [{ order: 1, approverRole: "OWNER" }] });
    const r = await setS(MGR, [{ key: K.ret, scope: "UNIT", scopeId: UA, value: 14, reason: REASON }], { ackLegalWarn: true });
    ok(r?.ok === false && r.code === "NEEDS_APPROVAL" && typeof r.approvalId === "string", `คำขอ 1 ${fmt(r)}`);
    reqId = r.approvalId;
    const r2 = await setS(MGR, [
      { key: K.ret, scope: "UNIT", scopeId: UA, value: 15, reason: REASON },
      { key: PRIV, scope: "UNIT", scopeId: UA, value: SECRET2, reason: REASON },
    ], { ackLegalWarn: true });
    ok(r2?.ok === false && r2.code === "NEEDS_APPROVAL" && typeof r2.approvalId === "string", `คำขอ 2 ${fmt(r2)}`);
    reqId2 = r2.approvalId;
  });
  await t("A-2", "legalOverrideSummaries: ชื่อสาขา · หัวไทย · codes · บรรทัด labelTh/ก่อน (ตามชั้นบน)/หลัง (14 วัน)/เหตุผล · คำขอที่ไม่รู้จักไม่อยู่ใน Map", async () => {
    ok(reqId, "ไม่มีคำขอจาก A-1");
    const fn = needFn(s, "legalOverrideSummaries");
    const mp = (await fn(ctxA, [reqId, "no-such-request"], OWNER)) as Map<string, Any>;
    ok(mp instanceof Map, "ไม่ได้ Map");
    eq([...mp.keys()], [reqId], "คีย์ของ Map");
    const x = mp.get(reqId);
    eq([x?.requestId, x?.unitId, x?.unitName], [reqId, UA, "หอทดสอบ R0.4"], "หัว");
    ok(isThai(x?.titleTh), `titleTh ${fmt(x?.titleTh)}`);
    ok((x?.codes ?? []).includes("DEPOSIT_RETURN_DAYS"), `codes ${fmt(x?.codes)}`);
    const ln = (x?.lines ?? []) as Any[];
    eq(ln.length, 1, "จำนวนบรรทัด");
    eq([ln[0]?.key, ln[0]?.labelTh, ln[0]?.reasonTh], [K.ret, "คืนเงินประกันภายใน (วัน)", REASON], "บรรทัด");
    ok(String(ln[0]?.afterTh).includes("14") && String(ln[0]?.afterTh).includes("วัน"), `afterTh ${fmt(ln[0]?.afterTh)}`);
    ok(String(ln[0]?.beforeTh).includes("ตามชั้นบน"), `beforeTh ${fmt(ln[0]?.beforeTh)}`);
  });
  await t("A-3", "ข้ามร้าน: ctx ร้าน B ขอคำขอของร้าน A ⇒ Map ว่าง (X1)", async () => {
    ok(reqId, "ไม่มีคำขอ");
    const mp = (await needFn(s, "legalOverrideSummaries")(ctxB, [reqId, reqId2], OWNER)) as Map<string, Any>;
    eq(mp?.size, 0, "size");
  });
  await t("A-4", "PRIVACY ในข้อเสนอ: ผู้ดูไม่ใช่เจ้าของ ⇒ \"ซ่อนไว้\" ไม่มีค่าลับ · เจ้าของเห็นค่า", async () => {
    ok(reqId2, "ไม่มีคำขอ 2");
    const fn = needFn(s, "legalOverrideSummaries");
    const mm = (await fn(ctxA, [reqId2], MGR)) as Map<string, Any>;
    const xm = mm.get(reqId2);
    ok(xm, "ไม่มีสรุปสำหรับผู้จัดการ");
    ok(!JSON.stringify(xm).includes(SECRET2), "ค่าลับหลุดถึงผู้จัดการ");
    ok((xm.lines as Any[]).some((l) => l.key === PRIV && String(l.afterTh).includes("ซ่อนไว้")), `บรรทัด PRIVACY ${fmt(xm.lines)}`);
    const xo = ((await fn(ctxA, [reqId2], OWNER)) as Map<string, Any>).get(reqId2);
    ok(JSON.stringify(xo ?? {}).includes(SECRET2), "เจ้าของต้องเห็นค่า");
  });

  // ═══════════════ M-11 ตามชั้นบน ═══════════════
  await t("M-11", "สวิตช์ \"ตามชั้นบน\" = resetSetting: submissionFor → resets → เครื่องยนต์ลบแถว ⇒ grace กลับเป็นแม่แบบ 10 (ปรับรายคนยังอยู่)", async () => {
    needSeed();
    const m = await load(OWNER, { domains: ["qcfx"], unitId: UA });
    const sub = needFn(sh, "submissionFor")(m, {}, new Set([K.grace]));
    eq((sub?.resets ?? []).map((r: Any) => [r.key, r.scope, r.scopeId]), [[K.grace, "UNIT", UA]], "resets");
    eq(sub?.changes?.length, 0, "changes");
    for (const r of sub.resets) ok((await s.resetSetting(OWNER, ctxA, r))?.ok, "resetSetting");
    const g = fieldMap(await load(OWNER, { domains: ["qcfx"], unitId: UA })).get(K.grace);
    eq([g?.value, g?.hasOwn, g?.source, g?.differsFromTemplate, g?.overrideCount], [10, false, "TEMPLATE", false, 2], "grace หลังคืนค่า");
  });

  // ═══════════════ VIS ═══════════════
  console.log("\nVIS. ฉากภาพ r0.4");
  await t("VIS-1", "visual-svc r0.4 --list ⇒ หน้าตั้งค่าจองคิว + หน้าค่าตั้งหอ", () => {
    const r = runScript("scripts/visual-svc.mts", ["r0.4", "--list"], { QC_BASE: undefined }, 120_000);
    ok(r.code === 0 && r.out.includes("/booking/settings") && r.out.includes("/dorm/settings"), `exit ${r.code} · ${tail(r.out, 160)}`);
  }, "MAJOR");
  {
    const base = process.env.QC_BASE ?? "";
    let reach = "";
    if (!base) reach = "ไม่ได้ตั้ง QC_BASE (ต้อง build QC server ก่อน — builder ห้าม build)";
    else if (/:3215\b/.test(base)) reach = "QC_BASE เป็น :3215 (CRM)";
    else {
      try { const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(8000), redirect: "manual" }); if (r.status >= 500) reach = `server ตอบ ${r.status}`; }
      catch (e) { reach = `ต่อ ${base} ไม่ได้ (${errMsg(e).slice(0, 60)})`; }
    }
    const name = "ถ่ายจริง r0.4 owner 1440/390 ⇒ exit 0 · ≥ 4 ภาพ (> 10 KB) · ไม่ล้นแนวนอน";
    if (reach) record("VIS-2", name, "SKIP", reach, "MAJOR", true);
    else {
      const dir = join(ROOT, ".qc-shots/svc/r0.4");
      const t0 = Date.now();
      const v = runScript("scripts/visual-svc.mts", ["r0.4", "--user", "owner", "--base", base], {}, 900_000);
      const pngs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")).filter((f) => { const st = statSync(join(dir, f)); return st.mtimeMs >= t0 - 1000 && st.size > 10_000; }) : [];
      record("VIS-2", name, v.code === 0 && pngs.length >= 4 ? "PASS" : "FAIL", `exit ${v.code} · ภาพ ${pngs.length} · ${tail(v.out, 160)}`, "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try {
    await cleanup(tenantIds);
    const left = (await db.tenant.count({ where: { slug: { startsWith: SLUG } } })) + (await db.user.count({ where: { email: { startsWith: MAIL } } }));
    record("Z-1", "ทำความสะอาด: ไม่เหลือ tenant/user svc-r04-*", left === 0 ? "PASS" : "FAIL", `เหลือ ${left}`, "MAJOR");
  } catch (e) {
    record("Z-1", "ทำความสะอาด", "FAIL", errMsg(e), "MAJOR");
  }
  await db.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const blockingSkip = skipped.filter((c) => !c.allowSkip);
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.4 · หน้าค่าตั้งจากทะเบียน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length} · ยอมได้ ${skipped.length - blockingSkip.length}: ต้องมี QC server)` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), allowedSkip: skipped.filter((c) => c.allowSkip).map((c) => c.id) })}`);
// รับใบ = ไม่มี FAIL และไม่มี SKIP นอกจาก VIS-2 (ไม่มี QC server — ผู้คุมรันเองตอนรับงาน)
process.exit(failed.length + blockingSkip.length > 0 ? 1 : 0);
