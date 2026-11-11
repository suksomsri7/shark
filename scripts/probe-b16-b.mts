// PROBE — SVC B.16 reviewer B (X8 ข้อมูลอ่อนไหว · บันทึกการดู · X1 แยกร้าน/สาขา · ตารางสิทธิ์ · ฉีด/ค่ายักษ์ · N+1) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b16-b.mts
// ข้อมูลใต้ร้าน `qc-svc-b16pb-*` + ผู้ใช้ `svc-b16pb-*@shark.local` · id ขึ้นต้น `pb16_` · ล้างใน finally
// หมวด: RM ตารางสิทธิ์ · PO นโยบายเปลี่ยนมีผลทันที · SU sameUnitOnly + แคชต่อคำขอ · LG บันทึกการดู (กันซ้ำ · พร้อมกัน · logAccess=false · นาฬิกา QC)
//       XS ข้ามร้าน/สาขา (ทุกไบต์) · MC MERGED/CLOSED · PI PII ใน DTO/event/console · IJ ฉีด/ค่ายักษ์ · NQ จำนวนคิวรี
/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadSvcQcEnv("probe-b16-b");
if (process.env.CI || process.env.APP_ENV === "production") { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };

type Sev = "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
const results: { id: string; ok: boolean; sev: Sev }[] = [];
const rec = (id: string, ok: boolean, sev: Sev, what: string, data?: unknown) => {
  results.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : sev === "INFO" ? "ℹ️ " : "❌"} [${id}] ${what}${ok ? "" : ` — ${J(data)?.slice(0, 600)}`}`);
};
const run = async (id: string, sev: Sev, what: string, fn: () => Promise<[boolean, unknown?]>) => {
  try { const [ok, d] = await fn(); rec(id, ok, sev, what, d); } catch (e) { rec(id, false, sev, what, { threw: errMsg(e) }); }
};

const notesMod: any = await import(pathToFileURL(join(ROOT, "src/lib/modules/booking/customer-notes.ts")).href);
const perm: any = await import("@/lib/core/permissions" as string);
const dbMod: any = await import("@/lib/core/db" as string);
const react: any = await import("react");
const rds: any = await import("react-dom/server");
const TodayLine: any = (await import(pathToFileURL(join(ROOT, "src/components/booking/TodayLine.tsx")).href)).default;
const MyQueue: any = (await import(pathToFileURL(join(ROOT, "src/components/booking/MyQueue.tsx")).href)).default;
const prisma = dbMod.prisma;

// ── console capture ──
const captured: string[] = [];
const KEEP = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
let depth = 0; // พร้อมกันหลายคำขอ: ยึด console ครั้งเดียว คืนเมื่อคำขอสุดท้ายจบ
async function quiet<R>(fn: () => Promise<R>): Promise<R> {
  const grab = (...a: unknown[]) => { captured.push(a.map((x) => (typeof x === "string" ? x : J(x))).join(" ")); };
  if (depth++ === 0) { console.log = grab; console.info = grab; console.warn = grab; console.error = grab; console.debug = grab; }
  try { return await fn(); } finally { if (--depth === 0) Object.assign(console, KEEP); }
}
const LOAD = (ctx: any, v: any, ids: any, opts?: any): Promise<any> => quiet(() => notesMod.loadJobCustomerNotes(ctx, v, ids, opts));

// ── DB ──
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows as any[];
const colCache = new Map<string, any[]>();
const cols = async (t: string) => {
  if (!colCache.has(t)) colCache.set(t, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [t]));
  return colCache.get(t)!;
};
const rid = (p: string) => `pb16_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function ins(table: string, vals: Record<string, unknown>) {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(", ")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b16pb-";
const MAIL = "svc-b16pb-";
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ Tenant ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ user ${errMsg(e)}`); }
}

// ── ฉาก ──
const RUN = Date.now().toString(36);
const T = (k: string) => `pb16_${k}_${RUN}`;
const id = { tA: T("tA"), tB: T("tB"), uS: T("uS"), uS2: T("uS2"), uB: T("uB"), mA: T("mA"), mB: T("mB"), hrA: T("hrA") };
const preset = (tpl: string, role: string) => Object.fromEntries(Object.entries(perm.bookingPresetPermissions(tpl, role) ?? {}).filter(([, v]) => v === true));
const V = (k: string, role: string, ua: string[], perms: Record<string, unknown>) => ({ userId: T(`u_${k}`), member: { role, unitAccess: ua, permissions: perms } });
const NOTES = "booking.customer.notes";
const VW: Record<string, any> = {
  owner: V("owner", "OWNER", ["*"], {}),
  mgr: V("mgr", "MANAGER", [id.uS], {}),
  mgr2: V("mgr2", "MANAGER", [id.uS2], {}),
  mgrAll: V("mgrAll", "MANAGER", ["*"], {}),
  lead: V("lead", "STAFF", [id.uS], preset("SPA", "LEAD")),
  provHR: V("provHR", "STAFF", [id.uS], preset("SPA", "PROVIDER")),
  provNoHR: V("provNoHR", "STAFF", [id.uS], preset("SPA", "PROVIDER")),
  provBoth: V("provBoth", "STAFF", [id.uS, id.uS2], preset("SPA", "PROVIDER")),
  cashier: V("cashier", "STAFF", [id.uS], preset("SPA", "CASHIER")),
  assistant: V("assistant", "STAFF", [id.uS], preset("CLINIC", "ASSISTANT")),
  provX: V("provX", "STAFF", [id.uS2], preset("SPA", "PROVIDER")),
  hrOnly: V("hrOnly", "STAFF", [id.uS], { "booking.job.run": true }), // ตำแหน่ง HR หมอนวด แต่ไม่มีคีย์ notes
  ownerB: V("ownerB", "OWNER", ["*"], {}),
  racer: V("racer", "MANAGER", [id.uS], {}),
  racer2: V("racer2", "OWNER", ["*"], {}),
  qcclock: V("qcclock", "OWNER", ["*"], {}),
};
const sec: Record<string, string> = {};
const fld: Record<string, string> = {};
const cust: Record<string, string> = {};
const ap: Record<string, string> = {};
const PII: string[] = [];
const SECRETS: string[] = [];
const cA = { tenantId: id.tA, unitId: id.uS };
const cA2 = { tenantId: id.tA, unitId: id.uS2 };
const HUGE = "ก".repeat(30_000) + "TAILSECRET";
const INJ = `<script>alert("x")</script><img src=x onerror=alert(1)> "'&amp; ‮evil`;
const EMOJI = "👍🏽".repeat(130);
let exitCode = 0;

const keysOf = (r: any, a: string) => ((r?.[a]?.items ?? []) as any[]).map((i) => i.key);
const LG = async (where = "", p: unknown[] = []) => q(`SELECT "userId","customerId","targetType","targetId",page,"createdAt" FROM "MemberAccessLog" WHERE "tenantId" = $1 ${where}`, [id.tA, ...p]);

try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) await cleanup(stale);
  await cleanupUsers();
  const now = new Date();
  for (const [t, n] of [[id.tA, "a"], [id.tB, "b"]]) await ins("Tenant", { id: t, name: `PB16 ${n}`, slug: `${SLUG}${n}-${RUN}`, updatedAt: now });
  const units: [string, string, string][] = [[id.uS, id.tA, "spa"], [id.uS2, id.tA, "spa2"], [id.uB, id.tB, "b"]];
  for (const [u, t, s] of units) await ins("BusinessUnit", { id: u, tenantId: t, type: "BOOKING", name: `PB16 ${s}`, slug: `pb16${s}-${RUN}`, updatedAt: now });
  for (const [s, t, type] of [[id.mA, id.tA, "MEMBER"], [id.mB, id.tB, "MEMBER"], [id.hrA, id.tA, "HR"]]) await ins("AppSystem", { id: s, tenantId: t, type, name: `PB16 ${type}`, updatedAt: now });
  for (const [u, t, s] of [[id.uS, id.tA, id.mA], [id.uS2, id.tA, id.mA], [id.uB, id.tB, id.mB]]) await ins("AppSystemUnit", { id: rid("asu"), tenantId: t, systemId: s, unitId: u, type: "MEMBER" });
  for (const [u, t] of [[id.uS, id.tA], [id.uS2, id.tA], [id.uB, id.tB]]) await ins("SettingProfile", { id: rid("sp"), tenantId: t, unitId: u, domain: "booking", templateKey: "SPA", templateVersion: 1, appliedById: VW.owner.userId });
  const SETTING = ["music", "pressurePref", "allergy", "inj", "huge", "emoji", "badSel", "__proto__", "constructor"];
  await ins("SettingValue", { id: rid("sv"), tenantId: id.tA, key: "booking.privacy.jobCardFields", scope: "TENANT", scopeId: id.tA, value: JSON.stringify(SETTING), updatedAt: now });
  await ins("SettingValue", { id: rid("sv"), tenantId: id.tB, key: "booking.privacy.jobCardFields", scope: "TENANT", scopeId: id.tB, value: JSON.stringify(["music"]), updatedAt: now });
  const ten: Record<string, string> = { ownerB: id.tB };
  for (const [k, v] of Object.entries(VW)) {
    await ins("User", { id: v.userId, email: `${MAIL}${k}-${RUN}@shark.local`, name: `PB16 ${k}`, updatedAt: now });
    await ins("Membership", { id: rid("mb"), userId: v.userId, tenantId: ten[k] ?? id.tA, role: v.member.role, unitAccess: JSON.stringify(v.member.unitAccess), permissions: JSON.stringify(v.member.permissions), acceptedAt: now, updatedAt: now });
  }
  for (const k of ["provHR", "hrOnly", "provBoth"]) await ins("HrEmployee", { id: T(`emp_${k}`), tenantId: id.tA, systemId: id.hrA, name: `หมอ ${k}`, position: "หมอนวด", linkedUserId: VW[k].userId, updatedAt: now });
  // ส่วน/ฟิลด์
  for (const [k, label, s] of [["health", "สุขภาพ", true], ["prefs", "ความชอบ", false]] as const) { sec[k] = T(`sec_${k}`); await ins("MemberSection", { id: sec[k], tenantId: id.tA, systemId: id.mA, key: k, label, sensitive: s, updatedAt: now }); }
  const choices = (xs: [string, string][]) => ({ choices: xs.map(([value, label]) => ({ value, label })) });
  const FIELDS: [string, string, string, string, boolean, unknown][] = [
    ["pressurePref", "health", "แรงกดที่ชอบ", "SELECT", false, choices([["LIGHT", "เบา"], ["MEDIUM", "ปานกลาง"]])],
    ["allergy", "prefs", "แพ้น้ำมัน", "LONG_TEXT", true, {}],
    ["music", "prefs", "เพลง", "TEXT", false, {}],
    ["inj", "prefs", `<b onmouseover=alert(2)>ป้าย</b>`, "TEXT", false, {}],
    ["huge", "prefs", "ยาวมาก", "LONG_TEXT", false, {}],
    ["emoji", "prefs", "อีโมจิ", "TEXT", false, {}],
    ["badSel", "prefs", "ตัวเลือกเลิกใช้", "SELECT", false, choices([["A", "เอ"]])],
  ];
  for (const [i, [k, s, label, type, sens, opt]] of FIELDS.entries()) {
    fld[k] = T(`f_${k}`);
    await ins("MemberField", { id: fld[k], tenantId: id.tA, systemId: id.mA, sectionId: sec[s], key: k, label, type, options: JSON.stringify(opt), sensitive: sens, sortOrder: i, updatedAt: now });
  }
  fld.bMusic = T("f_bmusic"); sec.bP = T("sec_bp");
  await ins("MemberSection", { id: sec.bP, tenantId: id.tB, systemId: id.mB, key: "prefs", label: "ความชอบ", sensitive: false, updatedAt: now });
  await ins("MemberField", { id: fld.bMusic, tenantId: id.tB, systemId: id.mB, sectionId: sec.bP, key: "music", label: "เพลง", type: "TEXT", options: "{}", updatedAt: now });
  // นโยบาย: health = MANAGER + ตำแหน่งหมอนวด · allergy (FIELD) ไม่มีแถว = OWNER/MANAGER
  const polHealth = T("pol_health");
  await ins("MemberSensitivePolicy", { id: polHealth, tenantId: id.tA, systemId: id.mA, targetType: "SECTION", targetId: sec.health, roles: ["MANAGER"], hrPositions: ["หมอนวด"], hrDepartments: [], sameUnitOnly: false, logAccess: true, updatedAt: now });
  // ลูกค้า
  const mk = async (k: string, t: string, s: string, home: string | null, status = "ACTIVE") => {
    cust[k] = T(`c_${k}`);
    const name = `คุณ${k} พีบีสิบหก`, phone = `08611${String(Object.keys(cust).length).padStart(5, "0")}`, email = `${k}.pb16@qc.invalid`;
    PII.push(name, phone, email, cust[k]);
    await ins("Customer", { id: cust[k], tenantId: t, memberSystemId: s, homeUnitId: home, name, firstName: name, phone, email, memberCode: `PB16-${k}`, status, updatedAt: now });
  };
  await mk("c1", id.tA, id.mA, id.uS); await mk("c2", id.tA, id.mA, id.uS2); await mk("c3", id.tA, id.mA, null);
  await mk("cM", id.tA, id.mA, id.uS, "MERGED"); await mk("cC", id.tA, id.mA, id.uS, "CLOSED"); await mk("cB", id.tB, id.mB, id.uB);
  for (const k of Object.values(fld)) PII.push(k); // fieldId ห้ามอยู่ใน DTO
  const put = async (t: string, c: string, f: string, cell: Record<string, unknown>) => ins("MemberFieldValue", { id: rid("fv"), tenantId: t, customerId: c, fieldId: f, ...cell, updatedAt: now });
  for (const c of ["c1", "c2", "c3", "cM", "cC"]) {
    await put(id.tA, cust[c], fld.pressurePref, { valueOptions: ["MEDIUM"] });
    await put(id.tA, cust[c], fld.allergy, { valueText: `แพ้ตะไคร้ลับ${c}` }); SECRETS.push(`แพ้ตะไคร้ลับ${c}`);
    await put(id.tA, cust[c], fld.music, { valueText: `เพลงลับ${c}` }); SECRETS.push(`เพลงลับ${c}`);
  }
  await put(id.tA, cust.c1, fld.inj, { valueText: INJ });
  await put(id.tA, cust.c1, fld.huge, { valueText: HUGE }); SECRETS.push("TAILSECRET");
  await put(id.tA, cust.c1, fld.emoji, { valueText: EMOJI });
  await put(id.tA, cust.c1, fld.badSel, { valueOptions: ["GONE"] });
  await put(id.tB, cust.cB, fld.bMusic, { valueText: "เพลงร้านบี" });
  // นัด
  const st: Record<string, string> = {}, sv: Record<string, string> = {};
  for (const [i, [u, t]] of units.entries()) {
    st[u] = T(`st${i}`); sv[u] = T(`sv${i}`);
    await ins("BookingStaff", { id: st[u], tenantId: t, unitId: u, name: "หมอ", updatedAt: now });
    await ins("BookingService", { id: sv[u], tenantId: t, unitId: u, name: "นวด", durationMin: 60, updatedAt: now });
  }
  const start = new Date(Date.now() + 3_600_000), end = new Date(start.getTime() + 3_600_000);
  const mkAp = async (k: string, t: string, u: string, c: string | null) => { ap[k] = T(`ap_${k}`); await ins("Appointment", { id: ap[k], tenantId: t, unitId: u, staffId: st[u], serviceId: sv[u], startAt: start, endAt: end, customerName: "x", customerPhone: "0800000000", customerId: c ? cust[c] : null, status: "CONFIRMED", updatedAt: now }); };
  await mkAp("a1", id.tA, id.uS, "c1"); await mkAp("a2", id.tA, id.uS, "c2"); await mkAp("a3", id.tA, id.uS, "c3");
  await mkAp("aM", id.tA, id.uS, "cM"); await mkAp("aC", id.tA, id.uS, "cC"); await mkAp("aU2", id.tA, id.uS2, "c1"); await mkAp("aB", id.tB, id.uB, "cB");
  for (let i = 0; i < 30; i++) await mkAp(`bulk${i}`, id.tA, id.uS, i % 2 ? "c1" : "c2");
  console.log("(ฉากพร้อม)");

  // ═══ RM ตารางสิทธิ์ ═══
  console.log("\n── RM: ตารางสิทธิ์ (ctx สาขา uS · นัด a1 ลูกค้า c1) ──");
  const base = ["music", "inj", "huge", "emoji"];
  const EXP: Record<string, { keys: string[]; hidden: number } | null> = {
    owner: { keys: ["music", "pressurePref", "allergy", ...base.slice(1)], hidden: 0 },
    mgr: { keys: ["music", "pressurePref", "allergy", ...base.slice(1)], hidden: 0 },
    mgrAll: { keys: ["music", "pressurePref", "allergy", ...base.slice(1)], hidden: 0 },
    mgr2: null,
    lead: { keys: base, hidden: 2 },
    provHR: { keys: ["music", "pressurePref", ...base.slice(1)], hidden: 1 },
    provNoHR: { keys: base, hidden: 2 },
    cashier: null, assistant: null, provX: null, hrOnly: null,
  };
  for (const [k, exp] of Object.entries(EXP)) {
    await run(`RM-${k}`, "CRITICAL", `${k}: ${exp ? `${exp.keys.join(",")} hidden ${exp.hidden}` : "{}"}`, async () => {
      const r = await LOAD(cA, VW[k], [ap.a1], { page: "booking.today" });
      if (!exp) return [J(r) === "{}", r];
      return [J(keysOf(r, ap.a1)) === J(exp.keys) && r[ap.a1]?.hidden === exp.hidden, { keys: keysOf(r, ap.a1), hidden: r[ap.a1]?.hidden }];
    });
  }
  await run("RM-presets", "CRITICAL", "ชุดสิทธิ์: LEAD/PROVIDER มีคีย์ notes · CASHIER/ASSISTANT(คลินิก) ไม่มี · ทุกแม่แบบ", async () => {
    const got: Record<string, boolean> = {};
    for (const tpl of ["BARBER", "SPA", "CLINIC"]) for (const r of ["LEAD", "PROVIDER", "CASHIER", "ASSISTANT"]) got[`${tpl}.${r}`] = perm.bookingPresetPermissions(tpl, r)?.[NOTES] === true;
    const bad = Object.entries(got).filter(([k, v]) => v !== (k.endsWith("LEAD") || k.endsWith("PROVIDER")));
    return [bad.length === 0, bad];
  });
  await run("RM-provX-own", "MAJOR", "provX (สาขา uS2) ที่ ctx uS2 นัด aU2 ⇒ เห็นของไม่อ่อนไหว hidden 2 (positive ของ RM-provX)", async () => {
    const r = await LOAD(cA2, VW.provX, [ap.aU2]);
    return [J(keysOf(r, ap.aU2)) === J(base) && r[ap.aU2]?.hidden === 2, r[ap.aU2]];
  });
  await run("RM-badSel", "MINOR", "SELECT ค่าที่เลิกใช้ (GONE) ไม่ขึ้น · __proto__/constructor ในค่าตั้งไม่ทำพัง/ไม่ขึ้น", async () => {
    const r = await LOAD(cA, VW.owner, [ap.a1]);
    const k = keysOf(r, ap.a1);
    return [!k.includes("badSel") && !k.includes("__proto__") && !k.includes("constructor") && k.includes("music"), k];
  });

  // ═══ PO นโยบายเปลี่ยนมีผลทันที ═══
  console.log("\n── PO: นโยบายเปลี่ยน = มีผลคำขอถัดไป ──");
  await run("PO-1", "CRITICAL", "ตัดตำแหน่งหมอนวดออกจาก health ⇒ provHR คำขอถัดไป hidden 2 · ให้ STAFF ⇒ provNoHR เห็น pressurePref · คืนค่า", async () => {
    await q(`UPDATE "MemberSensitivePolicy" SET "hrPositions" = '{}' WHERE id = $1`, [polHealth]);
    const r1 = await LOAD(cA, VW.provHR, [ap.a1]);
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER','STAFF']::"Role"[] WHERE id = $1`, [polHealth]);
    const r2 = await LOAD(cA, VW.provNoHR, [ap.a1]);
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER']::"Role"[], "hrPositions" = ARRAY['หมอนวด'] WHERE id = $1`, [polHealth]);
    const r3 = await LOAD(cA, VW.provNoHR, [ap.a1]);
    return [r1[ap.a1]?.hidden === 2 && !keysOf(r1, ap.a1).includes("pressurePref") && keysOf(r2, ap.a1).includes("pressurePref") && r2[ap.a1]?.hidden === 1 && !keysOf(r3, ap.a1).includes("pressurePref"),
      { r1: r1[ap.a1], r2: r2[ap.a1]?.hidden, r3: keysOf(r3, ap.a1) }];
  });
  await run("PO-2", "CRITICAL", "MANAGER ถูกถอดจาก health (roles=[]) ⇒ mgr ไม่เห็น pressurePref ทันที · OWNER ยังเห็น (กติกาเดิม) · คืนค่า", async () => {
    await q(`UPDATE "MemberSensitivePolicy" SET roles = '{}'::"Role"[] WHERE id = $1`, [polHealth]);
    const m = await LOAD(cA, VW.mgr, [ap.a1]); const o = await LOAD(cA, VW.owner, [ap.a1]);
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER']::"Role"[] WHERE id = $1`, [polHealth]);
    return [!keysOf(m, ap.a1).includes("pressurePref") && m[ap.a1]?.hidden === 1 && keysOf(o, ap.a1).includes("pressurePref"), { m: keysOf(m, ap.a1), o: keysOf(o, ap.a1) }];
  });

  // ═══ SU sameUnitOnly ═══
  console.log("\n── SU: sameUnitOnly (สาขาหลักของลูกค้า) + แคชในคำขอ ──");
  await run("SU-1", "CRITICAL", "health sameUnitOnly + STAFF: provNoHR (uS) คำขอเดียว a1(c1 บ้าน uS) + a2(c2 บ้าน uS2) ⇒ a1 เห็น pressurePref · a2 ซ่อน — ทั้งสองลำดับ", async () => {
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER','STAFF']::"Role"[], "sameUnitOnly" = true WHERE id = $1`, [polHealth]);
    const f = await LOAD(cA, VW.provNoHR, [ap.a1, ap.a2]);
    const b = await LOAD(cA, VW.provNoHR, [ap.a2, ap.a1]);
    const both = await LOAD(cA, VW.provBoth, [ap.a2, ap.a1]);
    const okF = keysOf(f, ap.a1).includes("pressurePref") && !keysOf(f, ap.a2).includes("pressurePref") && f[ap.a2]?.hidden === 2;
    const okB = keysOf(b, ap.a1).includes("pressurePref") && !keysOf(b, ap.a2).includes("pressurePref");
    const okBoth = keysOf(both, ap.a1).includes("pressurePref") && keysOf(both, ap.a2).includes("pressurePref");
    return [okF && okB && okBoth, { f: [keysOf(f, ap.a1), keysOf(f, ap.a2)], b: [keysOf(b, ap.a1), keysOf(b, ap.a2)], both: [keysOf(both, ap.a1), keysOf(both, ap.a2)] }];
  });
  await run("SU-2", "CRITICAL", "c3 ไม่มีสาขาหลัก + sameUnitOnly ⇒ STAFF uS ไม่เห็น (coversUnit null) · mgrAll (*) เห็น", async () => {
    const s = await LOAD(cA, VW.provNoHR, [ap.a3]); const m = await LOAD(cA, VW.mgrAll, [ap.a3]);
    return [!keysOf(s, ap.a3).includes("pressurePref") && keysOf(m, ap.a3).includes("pressurePref"), { s: keysOf(s, ap.a3), m: keysOf(m, ap.a3) }];
  });
  await run("SU-3", "MAJOR", "ปิด sameUnitOnly ⇒ คำขอถัดไป a2 เห็น pressurePref (ไม่แคชข้ามคำขอ)", async () => {
    await q(`UPDATE "MemberSensitivePolicy" SET "sameUnitOnly" = false WHERE id = $1`, [polHealth]);
    const r = await LOAD(cA, VW.provNoHR, [ap.a1, ap.a2]);
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER']::"Role"[] WHERE id = $1`, [polHealth]);
    return [keysOf(r, ap.a2).includes("pressurePref"), keysOf(r, ap.a2)];
  });

  // ═══ LG บันทึกการดู ═══
  console.log("\n── LG: บันทึกการดู ──");
  await run("LG-1", "MAJOR", "พร้อมกัน ×8 (Promise.all · mgr racer · a1) ⇒ ต่อ (ผู้ดู,ลูกค้า,เป้าหมาย,หน้า) 1 แถว", async () => {
    await Promise.all(Array.from({ length: 8 }, () => LOAD(cA, VW.racer, [ap.a1], { page: "booking.today" })));
    const rows = await LG(`AND "userId" = $2`, [VW.racer.userId]);
    const by: Record<string, number> = {};
    for (const r of rows) by[`${r.targetType}:${r.targetId === sec.health ? "health" : r.targetId === fld.allergy ? "allergy" : r.targetId}`] = (by[`${r.targetType}:${r.targetId === sec.health ? "health" : r.targetId === fld.allergy ? "allergy" : r.targetId}`] ?? 0) + 1;
    return [rows.length === 2, { rows: rows.length, by }];
  });
  await run("LG-1b", "MAJOR", "พร้อมกัน ×8 สองหน้าปน (today ×4 + mine ×4 · OWNER racer2) ⇒ 4 แถว", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => LOAD(cA, VW.racer2, [ap.a1], { page: i % 2 ? "booking.mine" : "booking.today" })));
    const rows = await LG(`AND "userId" = $2`, [VW.racer2.userId]);
    return [rows.length === 4, { rows: rows.length }];
  });
  await run("LG-2", "MAJOR", "ทยอย ×10 (จอรีเฟรช) หลังแถวแรกแล้ว ⇒ ไม่เพิ่ม", async () => {
    const b = (await LG(`AND "userId" = $2`, [VW.racer.userId])).length;
    for (let i = 0; i < 10; i++) await LOAD(cA, VW.racer, [ap.a1], { page: "booking.today" });
    const a = (await LG(`AND "userId" = $2`, [VW.racer.userId])).length;
    return [a === b, { before: b, after: a }];
  });
  await run("LG-3", "CRITICAL", "logAccess=false บน allergy (FIELD · roles MANAGER) ⇒ mgr เห็น allergy · ไม่มีแถว FIELD allergy · health ยังบันทึก", async () => {
    const pol = T("pol_allergy");
    await ins("MemberSensitivePolicy", { id: pol, tenantId: id.tA, systemId: id.mA, targetType: "FIELD", targetId: fld.allergy, roles: ["MANAGER"], hrPositions: [], hrDepartments: [], sameUnitOnly: false, logAccess: false, updatedAt: new Date() });
    const r = await LOAD(cA, VW.mgr, [ap.a1], { page: "booking.mine" });
    const rows = await LG(`AND "userId" = $2 AND page = 'booking.mine'`, [VW.mgr.userId]);
    await q(`DELETE FROM "MemberSensitivePolicy" WHERE id = $1`, [pol]);
    return [keysOf(r, ap.a1).includes("allergy") && !rows.some((x) => x.targetId === fld.allergy) && rows.some((x) => x.targetId === sec.health), { keys: keysOf(r, ap.a1), rows: rows.map((x) => x.targetType) }];
  });
  await run("LG-4", "CRITICAL", "ไม่บันทึกสิ่งที่ไม่ได้เห็น: provNoHR (health/allergy ซ่อน) = 0 แถว · cashier/ไม่มีสิทธิ์ = 0 · MERGED/CLOSED = 0", async () => {
    const t0 = (await q(`SELECT now() AS t`))[0].t;
    await LOAD(cA, VW.provNoHR, [ap.a1, ap.a2, ap.a3]); await LOAD(cA, VW.cashier, [ap.a1]); await LOAD(cA, VW.owner, [ap.aM, ap.aC]);
    const a = await LG(`AND "userId" = ANY($2::text[]) AND "createdAt" >= $3`, [[VW.provNoHR.userId, VW.cashier.userId], t0]);
    const m = await LG(`AND "customerId" = ANY($2::text[])`, [[cust.cM, cust.cC]]);
    return [a.length === 0 && m.length === 0, { staff: a.length, mergedClosed: m.length }];
  });
  await run("LG-5", "MINOR", "นาฬิกา QC (now = +3 วัน) เรียก 3 ครั้ง ⇒ ควร 2 แถว (กันซ้ำ) — ส่วนเบี่ยง 4", async () => {
    const fut = new Date(Date.now() + 3 * 86_400_000);
    for (let i = 0; i < 3; i++) await LOAD(cA, VW.qcclock, [ap.a1], { page: "booking.today", now: fut });
    const rows = await LG(`AND "userId" = $2`, [VW.qcclock.userId]);
    return [rows.length === 2, { rows: rows.length }];
  });
  await run("LG-6", "MAJOR", "แถวบันทึก: ตำแหน่ง HR ณ ตอนดู (provHR = หมอนวด) · page ตามที่ขอ · ไม่มีค่าฟิลด์ในแถว", async () => {
    await LOAD(cA, VW.provHR, [ap.a1], { page: "booking.mine" });
    const rows = await q(`SELECT * FROM "MemberAccessLog" WHERE "tenantId" = $1 AND "userId" = $2`, [id.tA, VW.provHR.userId]);
    const leak = SECRETS.filter((s) => J(rows).includes(s));
    return [rows.length >= 1 && rows.every((r) => r.hrPosition === "หมอนวด" && ["booking.today", "booking.mine"].includes(r.page)) && leak.length === 0, { rows: rows.map((r) => [r.targetType, r.page, r.hrPosition]), leak }];
  });

  // ═══ XS ข้ามร้าน/สาขา ═══
  console.log("\n── XS: ข้ามร้าน/สาขา ≡ ไม่มีจริง ──");
  await run("XS-1", "CRITICAL", "ทุกทางข้าม ≡ id ไม่มีจริง (ทุกไบต์ = {}) · ไม่มีแถวบันทึกจากทางข้าม", async () => {
    const before = (await LG()).length + (await q(`SELECT 1 FROM "MemberAccessLog" WHERE "tenantId" = $1`, [id.tB])).length;
    const none = J(await LOAD(cA, VW.owner, ["pb16-nope"]));
    const cases: Record<string, string> = {
      aB_from_A: J(await LOAD(cA, VW.owner, [ap.aB])),
      aU2_from_uS: J(await LOAD(cA, VW.owner, [ap.aU2])),
      ctx_tA_uB: J(await LOAD({ tenantId: id.tA, unitId: id.uB }, VW.owner, [ap.aB, ap.a1])),
      ctx_tB_uS: J(await LOAD({ tenantId: id.tB, unitId: id.uS }, VW.ownerB, [ap.a1])),
      ownerB_a1: J(await LOAD({ tenantId: id.tB, unitId: id.uB }, VW.ownerB, [ap.a1])),
      provNoHR_uS2: J(await LOAD(cA2, VW.provNoHR, [ap.aU2])),
      mgr_uS2: J(await LOAD(cA2, VW.mgr, [ap.aU2])),
    };
    const after = (await LG()).length + (await q(`SELECT 1 FROM "MemberAccessLog" WHERE "tenantId" = $1`, [id.tB])).length;
    const pos = await LOAD({ tenantId: id.tB, unitId: id.uB }, VW.ownerB, [ap.aB]);
    const bad = Object.entries(cases).filter(([, v]) => v !== none || v !== "{}");
    return [bad.length === 0 && after === before && keysOf(pos, ap.aB).includes("music"), { bad, logDelta: after - before, pos: keysOf(pos, ap.aB) }];
  });

  // ═══ MC ═══
  await run("MC-1", "CRITICAL", "MERGED/CLOSED ไม่ขึ้น (OWNER) · ปนกับ a1 ⇒ ขึ้นเฉพาะ a1", async () => {
    const r = await LOAD(cA, VW.owner, [ap.aM, ap.a1, ap.aC]);
    return [J(Object.keys(r)) === J([ap.a1]), Object.keys(r)];
  });

  // ═══ IJ ฉีด / ค่ายักษ์ ═══
  console.log("\n── IJ: ฉีด · ค่ายักษ์ · escape ──");
  const r1 = await LOAD(cA, VW.owner, [ap.a1]);
  const it = (k: string) => ((r1?.[ap.a1]?.items ?? []) as any[]).find((i) => i.key === k);
  await run("IJ-1", "CRITICAL", "ค่า 30,010 ตัว ⇒ 120 code point + … · ไม่มีหาง TAILSECRET", async () => {
    const d = it("huge")?.display ?? "";
    return [[...d].length === 121 && d.endsWith("…") && !d.includes("TAILSECRET"), { len: [...d].length }];
  });
  await run("IJ-2", "MAJOR", "อีโมจิ 130 ตัว (คู่ surrogate + skin tone) ⇒ ตัดตาม code point ไม่มี surrogate ขาด", async () => {
    const d = it("emoji")?.display ?? "";
    const broken = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(d);
    return [[...d].length === 121 && !broken, { len: [...d].length, broken }];
  });
  await run("IJ-3", "CRITICAL", "render TodayLine + MyQueue ด้วยโน้ตจริง: ค่า/ป้ายที่มี <script>/<img onerror>/<b onmouseover> ถูก escape (ไม่มีแท็กดิบ)", async () => {
    const nowMs = Date.now();
    const job = (aid: string, status: string): any => ({ appointmentId: aid, kind: "BOOKED", status, assignMode: "SPECIFIC", ticketNumber: "P1", ticketStatus: status === "IN_SERVICE" ? "SERVING" : "WAITING", label: "x", serviceName: "s", staffId: "st1", staffName: "n", bookedStartMs: nowMs, plannedStartMs: nowMs, plannedEndMs: nowMs + 3_600_000, waitMin: 1, waitedMin: 1, whyText: null, phoneMasked: "", phone: null, mine: true, actions: [] });
    const VIEW: any = { unitId: "u1", dayStr: new Date(nowMs + 7 * 3_600_000).toISOString().slice(0, 10), nowMs, openMin: 600, closeMin: 1260, axisStartMs: nowMs - 3_600_000, axisEndMs: nowMs + 4 * 3_600_000,
      kpi: { booked: 1, arrived: 1, absent: 0, upcoming: 0, walkIns: 0, walkInsLeft: 0, waiting: 1, longestWaitMin: 1, longestWaitTicket: "P1", done: 0 },
      staff: [{ staffId: "st1", name: "n", seat: 1, mine: true, blocks: [] }], waiting: [job(ap.a1, "ARRIVED")], inService: [job("other", "IN_SERVICE")], skipped: [], todo: [], why: null,
      access: { view: true, operate: true, checkIn: true, walkIn: true, runOwn: true, runAny: true, fullPhone: false }, myStaffIds: ["st1"], walkInForm: null };
    const ACTS = Object.fromEntries(["call", "recall", "skip", "start", "done", "move", "checkin", "noshow", "cancel", "walkin"].map((k) => [k, async () => {}]));
    const hs = [TodayLine, MyQueue].map((C) => String(rds.renderToStaticMarkup(react.createElement(C, { view: VIEW, unitSlug: "spa", actions: ACTS, notes: r1 }))));
    const raw = hs.some((h) => /<script|<img\s|<b\s+onmouseover/i.test(h));
    const esc = hs.every((h) => h.includes("&lt;script&gt;"));
    const noSecrets = hs.every((h) => !h.includes("TAILSECRET"));
    return [!raw && esc && noSecrets, { raw, esc, noSecrets }];
  });

  // ═══ PI PII ═══
  console.log("\n── PI: PII ──");
  await run("PI-1", "CRITICAL", "DTO ทุกผลลัพธ์ (OWNER ทั้งหมดรวม bulk) ไม่มีชื่อ/เบอร์/อีเมล/customerId/fieldId · รูป DTO ตามสัญญา", async () => {
    const r = await LOAD(cA, VW.owner, Object.values(ap));
    const s = J(r);
    const leak = PII.filter((p) => s.includes(p));
    const shape = Object.values(r).every((e: any) => J(Object.keys(e).sort()) === J(["appointmentId", "hidden", "items"]) && e.items.every((i: any) => J(Object.keys(i).sort()) === J(["display", "key", "label", "sensitive"])));
    return [leak.length === 0 && shape, { leak: leak.slice(0, 4), shape }];
  });
  await run("PI-2", "CRITICAL", "event member.sensitive.viewed (ร้าน A) payload ไม่มีชื่อ/เบอร์/อีเมล/ค่าฟิลด์ · ไม่มี event ชนิดอื่น", async () => {
    const rows = await q(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = $1`, [id.tA]);
    const s = J(rows.map((r) => r.payload));
    const leak = [...PII.filter((p) => !p.startsWith("pb16_")), ...SECRETS].filter((p) => s.includes(p));
    const types = [...new Set(rows.map((r) => r.type))];
    return [leak.length === 0 && J(types) === J(["member.sensitive.viewed"]), { leak, types, n: rows.length }];
  });
  await run("PI-3", "CRITICAL", "console ระหว่างเรียกตัวโหลดทั้งหมด ไม่มี PII/ค่า", async () => {
    const s = captured.join("\n");
    const leak = [...PII, ...SECRETS].filter((p) => s.includes(p));
    return [leak.length === 0, { lines: captured.length, leak }];
  });
  await run("PI-4", "MAJOR", "อ่านอย่างเดียว: ไม่มี AuditLog จากการเปิดดู · Customer/MemberFieldValue ไม่เปลี่ยน", async () => {
    const a = await q(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1`, [id.tA]);
    const c = await q(`SELECT count(*)::int n FROM "Customer" WHERE "tenantId" = $1 AND "updatedAt" > $2`, [id.tA, now]);
    return [a[0].n === 0 && c[0].n === 0, { audit: a[0].n, custTouched: c[0].n }];
  });

  // ═══ NQ จำนวนคิวรี ═══
  console.log("\n── NQ: จำนวนคิวรีต่อการโหลด 1 ครั้ง (30+ งาน) ──");
  {
    const counts: Record<string, number> = {};
    const restore: (() => void)[] = [];
    let patched = 0;
    for (const model of ["customer", "memberSensitivePolicy", "hrEmployee", "memberAccessLog", "memberField", "memberSection", "memberFieldValue", "appointment"]) {
      const d = prisma[model];
      if (!d || prisma[model] !== d) continue;
      for (const m of ["findFirst", "findMany", "findUnique", "createMany", "count"]) {
        const orig = d[m];
        if (typeof orig !== "function") continue;
        try {
          d[m] = (...a: unknown[]) => { counts[`${model}.${m}`] = (counts[`${model}.${m}`] ?? 0) + 1; return orig.apply(d, a); };
          if (d[m] === orig) continue;
          patched++;
          restore.push(() => { d[m] = orig; });
        } catch { /* */ }
      }
    }
    const bulk = Object.keys(ap).filter((k) => k.startsWith("bulk")).map((k) => ap[k]);
    const measure = async (label: string) => { for (const k of Object.keys(counts)) delete counts[k]; await LOAD(cA, VW.provNoHR, bulk); return { label, total: Object.values(counts).reduce((a, b) => a + b, 0), counts: { ...counts } }; };
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER','STAFF']::"Role"[] WHERE id = $1`, [polHealth]);
    const plain = await measure("no sameUnitOnly");
    await q(`UPDATE "MemberSensitivePolicy" SET "sameUnitOnly" = true WHERE id = $1`, [polHealth]);
    const scoped = await measure("sameUnitOnly");
    await q(`UPDATE "MemberSensitivePolicy" SET roles = ARRAY['MANAGER']::"Role"[], "sameUnitOnly" = false WHERE id = $1`, [polHealth]);
    for (const r of restore) r();
    if (patched === 0) rec("NQ-1", false, "INFO", "นับคิวรีไม่ได้ (delegate ไม่ให้ patch)");
    else {
      rec("NQ-1", plain.total <= 12, "MINOR", `ไม่มี sameUnitOnly: คิวรีคงที่ (≤12) ต่อการโหลด 30 งาน · ได้ ${plain.total}`, plain);
      rec("NQ-2", scoped.total <= 12, "MINOR", `sameUnitOnly: ควรไม่โตตามจำนวนลูกค้า (≤12) · ได้ ${scoped.total}`, scoped);
    }
  }
} catch (e) {
  console.log(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 1;
} finally {
  const all = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]).catch(() => [])).map((r: any) => r.id);
  await cleanup(all);
  await cleanupUsers();
  const left = Number((await q(`SELECT count(*)::int n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0]?.n ?? -1);
  const leftU = Number((await q(`SELECT count(*)::int n FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]))[0]?.n ?? -1);
  console.log(`(cleanup: tenant ค้าง ${left} · user ค้าง ${leftU})`);
  const breach = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: breach.map((r) => `${r.id}:${r.sev}`), info: results.filter((r) => !r.ok && r.sev === "INFO").map((r) => r.id), cleanupLeft: left + leftU })}`);
  await pool.end().catch(() => {});
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(exitCode);
}
