// PROBE — SVC ใบแก้หนี้ B8-PB12 (ทางเดี่ยว B.8: ใบรับค้างไม่ผูก + สลิปอนุมัติ) · ไม่ใช่ข้อสอบ · ไม่แก้ src
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-b8-pb12.mts
// ข้อมูลใต้ร้าน slug `qc-svc-b8pb12-*` + ผู้ใช้ `qc-svc-b8pb12-*@qc.invalid` · IP `b8pb12-*` · ล้างใน finally (+ กวาดค้างตอนเริ่ม)
// ฉาก: S0 ทางปกติ (ตัวควบคุม) · S1 ใบเงินสดค้างไม่ผูก + สลิป · S2 ใบของสลิปตัวเองค้างแล้ว consumer ลองใหม่ · S3 สองสลิปบนแถวเดียว · S4 หน่วยไม่ผูก POS · S5 หน้าจ่ายเมื่อมีใบค้าง
// ผู้ตรวจ B เพิ่ม: S6 ร้านยืนยันเงินสด ∥ consumer (2 ลำดับ + พร้อมกัน) · S7 ใบค้างของนัดที่ยกเลิก + สลิป ⇒ ค้างคืน · S8 consumer ×3 ⇒ slip_after_paid 1 · S9 หน้าจ่าย RECORDING ⇒ ผูกได้ไม่ค้าง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";

loadSvcQcEnv("probe-b8-pb12");
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* */ }
  if (!hn.startsWith(svcQcHostMark())) { console.error(`🔴 probe: ${n} ไม่ใช่ฐาน qc-svc — หยุด`); process.exit(4); }
}
if (process.env.APP_ENV === "production" || process.env.CI) { console.error("🔴 probe: env ต้องห้าม"); process.exit(4); }
if (!process.env.INTEGRATIONS_CREDENTIALS_KEY) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.INTEGRATIONS_FAKE = "1";
for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) delete process.env[k];

const errMsg = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").trim().slice(0, 300);
const J = (x: unknown) => { try { return JSON.stringify(x); } catch { return String(x); } };
const RUN = Date.now().toString(36);

type R = { id: string; ok: boolean; sev: string; what: string; detail: string };
const results: R[] = [];
const rec = (id: string, ok: boolean, sev: string, what: string, detail: unknown = "") => {
  results.push({ id, ok, sev, what, detail: typeof detail === "string" ? detail : J(detail) });
  console.log(`  ${ok ? "✅ HOLD" : sev === "INFO" ? "ℹ️  INFO" : "❌ BREACH"} [${id}] (${sev}) ${what}${ok ? "" : ` — ${(typeof detail === "string" ? detail : J(detail)).slice(0, 600)}`}`);
};
const step = async (id: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { rec(id, false, "ERR", "probe ล้มเอง (ไม่ใช่ผลตัดสิน)", errMsg(e)); } };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await pool.query(sql, p)).rows;
const colCache = new Map<string, any[]>();
const rid = (p: string) => `b8pb_${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
async function insertRow(table: string, vals: Record<string, unknown>) {
  if (!colCache.has(table)) colCache.set(table, await q(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  const v: Record<string, unknown> = { ...vals };
  for (const c of colCache.get(table)!) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type as string;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const k = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(", ")}) VALUES (${k.map((_, i) => `$${i + 1}`).join(", ")})`, k.map((x) => v[x]));
}
const SLUG = "qc-svc-b8pb12-";
const MAIL = "qc-svc-b8pb12-";
const TOKENS = new Set<string>();
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  const tables = (await q(`SELECT DISTINCT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.t as string);
  let pending = tables;
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${MAIL}%`]);
    await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%b8pb12-%'`);
    const keys = [...TOKENS].map((t) => `bq:manage:tk:${createHash("sha256").update(t).digest("hex").slice(0, 32)}`);
    if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
  } catch (e) { console.log(`  ⚠️ ลบผู้ใช้/ถัง: ${errMsg(e)}`); }
}

const addDays = (ds: string, n: number) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const DS = addDays(TODAY, 7);
const T = (k: string) => `b8pb_${k}_${RUN}`;
const ids = { tA: T("tA"), owner: T("owner") };
const TIDS = [ids.tA];
const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const SHOP = { tenantId: ids.tA, actorUserId: ids.owner };
type Unit = { key: string; id: string; ctx: { tenantId: string; unitId: string }; staff: string[]; svc: string };
let ord = 0, phoneN = 0, ipSeq = 0;
const PH0 = 64_000_000 + Math.floor(Math.random() * 600_000) * 10;
const newPhone = () => `08${String(PH0 + ++phoneN).slice(-8)}`;
const newName = () => `คุณโพรบเดี่ยว ${RUN}-${++phoneN}`;
const newIp = () => `b8pb12-${RUN}-${++ipSeq}`;
async function mkUnit(key: string): Promise<Unit> {
  const id = T(`u_${key}`);
  await insertRow("BusinessUnit", { id, tenantId: ids.tA, type: "BOOKING", name: `pb12 ${key}`, slug: `b8pb12-${key.toLowerCase()}-${RUN}`, updatedAt: new Date() });
  for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: ids.tA, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
  const staff: string[] = [];
  for (let i = 0; i < 8; i++) {
    const sid = T(`${key}_s${i}`);
    await insertRow("BookingStaff", { id: sid, tenantId: ids.tA, unitId: id, name: `หมอ ${key} ${i + 1}`, sortOrder: i + 1, createdAt: new Date(Date.now() - 900_000 + ++ord * 1000), updatedAt: new Date() });
    staff.push(sid);
  }
  const svc = T(`${key}_OIL`);
  await insertRow("BookingService", { id: svc, tenantId: ids.tA, unitId: id, name: "น้ำมัน 60", durationMin: 60, priceSatang: 90_005, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
  return { key, id, ctx: { tenantId: ids.tA, unitId: id }, staff, svc };
}

const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: any };
const BK: any = await import("@/lib/modules/booking/service" as string);
const DP: any = await import("@/lib/modules/booking/deposit" as string);
const ON: any = await import("@/lib/modules/booking/online" as string);
const CONS: any = await import("@/lib/outbox-consumers" as string);
const SET: any = await import("@/lib/core/settings" as string);
const SV: any = await import("@/lib/payment/slip-verify" as string);

const DEP = 18_001; // 90,005 × 20%
const receiptsOf = async (apptId: string) => q(`SELECT s.id, s."grandTotalSatang"::int AS grand, d.note, d.status::text AS dst FROM "PosSale" s LEFT JOIN "PosDeposit" d ON d."receiptSaleId" = s.id
  WHERE s."sourceModule" = 'POS_DEPOSIT' AND s."tenantId" = $1 AND s."idempotencyKey" LIKE $2 AND s.status::text <> 'VOIDED' ORDER BY s."createdAt"`, [ids.tA, `booking-deposit-${apptId}%`]);
const apRow = async (id: string) => (await q(`SELECT id, status::text AS status, "depositSatang", "depositPaidAt", "depositSaleId" FROM "Appointment" WHERE id = $1`, [id]))[0];
const sapOf = async (apptId: string) => q(`SELECT after FROM "AuditLog" WHERE "targetId" = $1 AND action = 'booking.deposit.slip_after_paid'`, [apptId]);
const auditOf = async (apptId: string, action: string) => q(`SELECT after FROM "AuditLog" WHERE "targetId" = $1 AND action = $2`, [apptId, action]);
/** ค่าคงที่เงินของแถว: ใบรับ ≤ 1 · ไม่มีใบรับไม่ผูก · Σ ใบที่ผูก + slip_after_paid = เงินเข้า */
async function money(apptId: string, moneyIn: number): Promise<{ issues: string[]; bound: number; sap: number; rc: any[]; row: any }> {
  const row = await apRow(apptId);
  const rc = await receiptsOf(apptId);
  const sap = (await sapOf(apptId)).reduce((t, x) => t + Number(x.after?.amountSatang ?? 0), 0);
  const issues: string[] = [];
  if (rc.length > 1) issues.push(`ใบรับ ${rc.length} ใบ`);
  const unbound = rc.filter((x) => x.id !== row.depositSaleId);
  if (unbound.length) issues.push(`ใบรับไม่ผูกนัด ${J(unbound.map((x) => x.grand))} (เงินลอย)`);
  const bound = rc.filter((x) => x.id === row.depositSaleId).reduce((t, x) => t + x.grand, 0);
  if (bound + sap !== moneyIn) issues.push(`ผูก ${bound} + แจ้งเกิน ${sap} ≠ เงินเข้า ${moneyIn}`);
  return { issues, bound, sap, rc, row };
}
async function pump(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    const rows = await q(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND status = 'PENDING' ORDER BY "createdAt", id LIMIT 200`, [TIDS]);
    if (!rows.length) return;
    for (const row of rows) {
      const claim = await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [row.id]);
      if (!claim.rowCount) continue;
      const h = CONS.consumers?.[row.type];
      if (typeof h === "function") { try { await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, unitId: row.unitId, systemId: null }); } catch { /* ลองรอบหน้า */ } }
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [row.id]);
    }
  }
}
const tokenOf = async (u: Unit, id: string): Promise<string> => {
  const url = await ON.manageLinkFor(u.ctx, id);
  if (typeof url !== "string" || !url.startsWith("/bq/m/")) throw new Error(`manageLinkFor ${J(url)}`);
  const t = url.slice("/bq/m/".length);
  TOKENS.add(t);
  return t;
};
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(96)]));
const put = async (_p: string, _d: Uint8Array, _c: string): Promise<void> => { void _p; void _d; void _c; };
const del = async (_p: string): Promise<number> => { void _p; return 200; };
const newTR = () => `B8PB${Date.now().toString(36)}${randomBytes(4).toString("hex")}`.toUpperCase();
async function submit(token: string): Promise<{ ok: boolean; code?: string; slipId?: string; expected?: number }> {
  const s = await DP.submitDepositSlip(token, { file: { data: png(), contentType: "image/png" }, idempotencyKey: `b8pb12-s-${randomBytes(6).toString("hex")}` }, { ip: newIp(), deps: { put, del } });
  if (!s?.ok) return { ok: false, code: s?.code };
  return { ok: true };
}
async function latestSlip(apptId: string) { return (await q(`SELECT id, status::text AS status, "expectedSatang" AS exp FROM "PaymentSlip" WHERE "refId" = $1 ORDER BY "createdAt" DESC`, [apptId]))[0]; }
async function approve(slipId: string) {
  const d = await SV.decideSlip({ userId: ids.owner }, { tenantId: ids.tA }, slipId, { reason: "ตรวจกับแอปธนาคารแล้ว", transRef: newTR(), decision: "APPROVE" });
  if (d?.ok !== true) throw new Error(`decideSlip ${J(d)}`);
}
/** consumer สลิปอนุมัติ ×n พร้อมกันในโพรเซสเดียว (ทาง B.8 onDepositSlipApproved) · คืนจำนวนที่ throw */
async function consume(u: Unit, slipId: string, n = 2): Promise<string[]> {
  const outs = await Promise.all(Array.from({ length: n }, async (_, k) => {
    await new Promise((r) => setTimeout(r, k * 3));
    try { await DP.onDepositSlipApproved({ tenantId: ids.tA, unitId: u.id, payload: { slipId } }); return ""; } catch (e) { return errMsg(e); }
  }));
  return outs.filter(Boolean);
}
/** สลิปตัวที่สองของแถวเดียว (ด่านส่งสลิปกันไว้ ⇒ คัดลอกแถวสลิปเดิมด้วย SQL · สถานะ APPROVED · คีย์ใหม่) */
async function cloneApprovedSlip(fromId: string): Promise<string> {
  const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PaymentSlip'`)).map((r) => r.column_name as string);
  const newId = rid("slip");
  const sel = cols.map((c) => (c === "id" ? `$2::text` : c === "status" ? `'APPROVED'` : c === "checks" ? `jsonb_set(COALESCE("checks", '{}'::jsonb), '{idempotencyKey}', to_jsonb($3::text))` : c === "transRef" ? `$4::text` : c === "imageHash" ? `$5::text` : `"${c}"`));
  await pool.query(`INSERT INTO "PaymentSlip" (${cols.map((c) => `"${c}"`).join(", ")}) SELECT ${sel.join(", ")} FROM "PaymentSlip" WHERE id = $1`, [fromId, newId, `b8pb12-clone-${randomBytes(4).toString("hex")}`, newTR(), randomBytes(32).toString("hex")]);
  return newId;
}

let tA0 = 600;
async function bookOnline(u: Unit): Promise<string> {
  const k = ++ord;
  const r = await BK.bookAppointment(u.ctx, { serviceId: u.svc, staffId: u.staff[k % u.staff.length], dateStr: DS, startMin: tA0, channel: "ONLINE", customerName: newName(), customerPhone: newPhone(), idempotencyKey: rid("idem") });
  tA0 += 60;
  if (tA0 > 1080) tA0 = 600;
  if (!r.ok) throw new Error(`จอง ${u.key} ล้ม ${r.code} ${r.reason}`);
  if (r.groupId) throw new Error("ได้นัดกลุ่ม (ต้องเดี่ยว)");
  return r.id;
}

try {
  const stale = (await q(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id as string);
  if (stale.length) { console.log(`(กวาดร้านค้าง ${stale.length})`); await cleanup(stale); }
  await insertRow("Tenant", { id: ids.tA, name: "PB12 ร้าน", slug: `${SLUG}a-${RUN}`, updatedAt: new Date() });
  await insertRow("User", { id: ids.owner, email: `${MAIL}owner-${RUN}@qc.invalid`, name: "PB12 owner", updatedAt: new Date() });
  await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: ids.tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
  const uP = await mkUnit("pos");
  const uN = await mkUnit("nopos");
  for (const u of [uP, uN]) {
    const a = await SET.applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u.id, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
    if (!a.ok) throw new Error(`applyTemplate ${J(a)}`);
  }
  const s = await SET.setSettings(OWNER, { tenantId: ids.tA }, [uP, uN].flatMap((u) => [
    { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u.id, value: 0 },
    { key: "booking.booking.onlineSharePct", scope: "UNIT", scopeId: u.id, value: 100 },
    { key: "booking.booking.horizonDays", scope: "UNIT", scopeId: u.id, value: 60 },
    { key: "booking.booking.maxOpenPerPhone", scope: "UNIT", scopeId: u.id, value: null },
    { key: "booking.booking.requireConfirm", scope: "UNIT", scopeId: u.id, value: false },
    { key: "booking.deposit.method", scope: "UNIT", scopeId: u.id, value: "PROMPTPAY_SLIP" },
    { key: "booking.deposit.amount", scope: "UNIT", scopeId: u.id, value: { mode: "PERCENT", bp: 2000, minDurationMin: null } },
    { key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: u.id, value: 1440 },
  ]));
  if (!s.ok) throw new Error(`setSettings ${J(s)}`);
  {
    const SYS: any = await import("@/lib/modules/system/service" as string);
    const ACC: any = await import("@/lib/modules/account/service" as string);
    const GL: any = await import("@/lib/modules/account/gl" as string);
    const posSys = await SYS.createSystem(ids.tA, "POS", "ขาย PB12");
    await SYS.linkUnit(ids.tA, posSys.id, uP.id); // uN = หน่วยไม่ผูก POS
    const acc = await SYS.createSystem(ids.tA, "ACCOUNT", "บัญชี PB12");
    await ACC.saveSettings(ids.tA, acc.id, { orgName: "PB12 จำกัด", taxId: "0105561177639", vatRegistered: true });
    await GL.ensureAccounting({ tenantId: ids.tA, systemId: acc.id });
    await insertRow("AccountSystemLink", { id: rid("asl"), tenantId: ids.tA, systemId: acc.id, linkedKind: "POS", linkedId: posSys.id });
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: ids.tA, promptpayId: "0812345678", displayName: "PB12 Shop", updatedAt: new Date() });
  }
  console.log(`(fixtures พร้อม · วัน ${DS})`);

  // S0 ตัวควบคุม: ทางปกติ — สลิปอนุมัติ consumer ×2 ⇒ ใบรับ 1 ใบ ผูก ยอด 18,001 · ไม่มีแจ้งเกิน · CONFIRMED
  for (let r = 0; r < 2; r++) await step(`S0-${r}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    await approve(sl.id);
    const thrown = await consume(uP, sl.id);
    await pump();
    const m = await money(id, DEP);
    const extra = [...m.issues];
    if (m.row.status !== "CONFIRMED") extra.push(`สถานะ ${m.row.status}`);
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S0-${r}`, extra.length === 0, "CRITICAL", "ทางปกติ: สลิป 18,001 consumer ×2 ⇒ ใบรับ 1 ผูก · ไม่มีแจ้งเกิน · CONFIRMED (ตัวควบคุม)", { issues: extra, rc: m.rc.map((x) => x.grand) });
  });

  // S1 ใบเงินสดค้าง: ลูกค้าส่งสลิป (ค้างตรวจ) → ร้านออกใบเงินสดแล้วล้มก่อนผูก → ร้านอนุมัติสลิป → consumer ×2
  //    ⇒ ใบเงินสดผูกเป็นเงินของแถว (audit recover) · เงินโอนทั้งก้อน ⇒ slip_after_paid · ไม่มีใบลอย · ผูก + แจ้งเกิน = 36,002
  for (let r = 0; r < 2; r++) await step(`S1-${r}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    const cash = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: "CASH", customerId: null, customerName: null, serviceName: "probe" });
    if (!cash?.ok) throw new Error(`ใบเงินสด ${J(cash)}`);
    await approve(sl.id);
    const thrown = await consume(uP, sl.id);
    await pump();
    const m = await money(id, DEP * 2);
    const extra = [...m.issues];
    if ((await auditOf(id, "booking.deposit.recover")).length !== 1) extra.push("ไม่มี audit booking.deposit.recover ของใบเงินสด");
    if ((await auditOf(id, "booking.deposit.receive")).some((x) => x.after?.slipId === sl.id)) extra.push("ใบเงินสดถูกบันทึกเป็นเงินของสลิป (receive) ⇒ เงินโอนถูกกลืน");
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S1-${r}`, extra.length === 0, "CRITICAL", "ใบเงินสดค้างไม่ผูก + สลิปอนุมัติ ⇒ ผูกใบเงินสด (recover) · เงินโอน ⇒ slip_after_paid · ไม่มีเงินหาย", { issues: extra, bound: m.bound, sap: m.sap, rc: m.rc.map((x) => `${x.grand}:${x.note}`) });
  });

  // S2 ใบของสลิปตัวเองค้าง: consumer รอบแรกออกใบ (ป้าย [slip:<id>]) แล้วตายก่อนผูก → consumer ×2 ลองใหม่ ⇒ ผูกใบเดิม · ไม่มีแจ้งเกิน · ใบเดียว
  for (let r = 0; r < 2; r++) await step(`S2-${r}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    await approve(sl.id);
    const own = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: "PROMPTPAY", customerId: null, customerName: null, serviceName: "probe", slipId: sl.id });
    if (!own?.ok) throw new Error(`ใบของสลิป ${J(own)}`);
    const thrown = await consume(uP, sl.id);
    await pump();
    const m = await money(id, DEP);
    const extra = [...m.issues];
    if (m.rc.length !== 1 || m.row.depositSaleId !== own.saleId) extra.push(`ไม่ได้ผูกใบเดิมของสลิป (${J(m.rc.map((x) => x.id === own.saleId))})`);
    if (m.row.status !== "CONFIRMED") extra.push(`สถานะ ${m.row.status}`);
    if ((await auditOf(id, "booking.deposit.recover")).length) extra.push("ใบของสลิปตัวเองถูกนับเป็นเงินทางอื่น (recover)");
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S2-${r}`, extra.length === 0, "CRITICAL", "ใบของสลิปตัวเองค้าง ⇒ consumer ลองใหม่ ×2 ผูกใบเดิม · ไม่มีแจ้งเกิน · ใบเดียว", { issues: extra, sap: m.sap });
  });

  // S3 สองสลิปบนแถวเดียว: สลิป A ออกใบ ([slip:A]) แล้วตาย → สลิป B อนุมัติ consumer ×2 ⇒ B ไม่ผูกใบของ A · เงิน B ⇒ slip_after_paid →
  //    A ลองใหม่ ×2 ⇒ ผูกใบของตัวเอง · ใบที่ผูกเป็นของสลิปเจ้าของ (audit receive slipId = ป้ายใบ) · ผูก + แจ้งเกิน = 36,002
  for (let r = 0; r < 2; r++) await step(`S3-${r}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const a = await latestSlip(id);
    await approve(a.id);
    const b = await cloneApprovedSlip(a.id);
    const ownA = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: "PROMPTPAY", customerId: null, customerName: null, serviceName: "probe", slipId: a.id });
    if (!ownA?.ok) throw new Error(`ใบของสลิป A ${J(ownA)}`);
    const tB = await consume(uP, b);
    const midRow = await apRow(id);
    const tA = await consume(uP, a.id);
    await pump();
    const m = await money(id, DEP * 2);
    const extra = [...m.issues];
    if (midRow.depositSaleId) extra.push("สลิป B ผูกใบของสลิป A");
    const rcv = await auditOf(id, "booking.deposit.receive");
    if (!rcv.some((x) => x.after?.slipId === a.id && x.after?.receiptSaleId === ownA.saleId)) extra.push(`ใบของ A ไม่ได้ผูกในนามสลิป A (${J(rcv.map((x) => x.after?.slipId === a.id ? "A" : x.after?.slipId === b ? "B" : "?"))})`);
    if ([...tB, ...tA].length) extra.push(`throw ${[...tB, ...tA][0]}`);
    rec(`S3-${r}`, extra.length === 0, "CRITICAL", "สองสลิปบนแถวเดียว ⇒ สลิป B ไม่ผูกใบของ A (แจ้งเกิน) · A ลองใหม่ผูกใบตัวเอง · เงินครบ 36,002", { issues: extra, bound: m.bound, sap: m.sap });
  });

  // S4 หน่วยไม่ผูก POS: สลิปอนุมัติ consumer ×2 ⇒ จ่ายแล้ว (saleId null) · CONFIRMED · ไม่มีใบรับ · ไม่มีแจ้งเกิน
  await step("S4", async () => {
    const id = await bookOnline(uN);
    const tok = await tokenOf(uN, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    await approve(sl.id);
    const thrown = await consume(uN, sl.id);
    await pump();
    const row = await apRow(id);
    const extra: string[] = [];
    if (!row.depositPaidAt || row.depositSaleId !== null || row.status !== "CONFIRMED") extra.push(`แถว ${J({ paid: !!row.depositPaidAt, sale: row.depositSaleId, st: row.status })}`);
    if ((await receiptsOf(id)).length) extra.push("มีใบรับทั้งที่หน่วยไม่ผูก POS");
    if ((await sapOf(id)).length) extra.push("มีแจ้งเกิน");
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec("S4", extra.length === 0, "MAJOR", "หน่วยไม่ผูก POS ⇒ ลงเงินแบบไม่มีใบรับ (saleId null) · CONFIRMED · ไม่มีแจ้งเกิน", extra);
  });

  // S5 หน้าจ่ายเมื่อมีใบเงินสดค้างไม่ผูก ⇒ ไม่ขอลูกค้าจ่ายซ้ำ (ไม่ใช่ AWAITING · ส่งสลิปไม่ได้)
  await step("S5", async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const cash = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: "CASH", customerId: null, customerName: null, serviceName: "probe" });
    if (!cash?.ok) throw new Error(`ใบเงินสด ${J(cash)}`);
    const p = await DP.loadDepositPay(tok, { ip: newIp() });
    const sb = await submit(tok);
    const c = await DP.confirmDepositByShop(SHOP, { unitId: uP.id, appointmentId: id, payType: "CASH" });
    await pump();
    const m = await money(id, DEP);
    const extra = [...m.issues];
    if (!p?.ok || p.pay.state === "AWAITING" || p.pay.canSubmitSlip) extra.push(`หน้าจ่าย ${p?.ok ? `${p.pay.state} canSubmit=${p.pay.canSubmitSlip}` : p?.code}`);
    if (sb.ok) extra.push("ลูกค้าส่งสลิปได้ทั้งที่ร้านรับเงินแล้ว");
    if (!c?.ok) extra.push(`ร้านยืนยัน ${c?.code}`);
    rec("S5", extra.length === 0, "MINOR", "ใบเงินสดค้างไม่ผูก ⇒ หน้าจ่ายไม่ขอเงินซ้ำ · ส่งสลิปไม่ได้ · ร้านยืนยันผูกใบเดิม", { issues: extra, pay: p?.ok ? p.pay.state : p?.code, submit: sb.ok ? "OK" : sb.code });
  });

  // ═══════════ เพิ่มโดยผู้ตรวจ B (S6–S9) ═══════════
  const LN: any = await import("@/lib/modules/booking/queue-line" as string);
  const confirmCash = async (id: string) => { try { return await DP.confirmDepositByShop(SHOP, { unitId: uP.id, appointmentId: id, payType: "CASH" }); } catch (e) { return { ok: false, code: `THREW ${errMsg(e).slice(0, 80)}` }; } };
  const tookCash = (c: any) => !!c?.ok && !c?.duplicated; // ร้านรับเงินสดจริง (ไม่ใช่ทางลัดจ่ายแล้ว)
  // S6 ร้านยืนยันเงินสด ∥ consumer สลิป (ลำดับ: consumer ก่อน · ร้านก่อน · พร้อมกัน ×3) ⇒ ใบรับ ≤1 ผูก · ผูก + แจ้งเกิน = เงินเข้า (สลิป + เงินสดถ้าร้านรับจริง) · ไม่มีใบลอย
  for (const mode of ["consumer-first", "shop-first", "concurrent-0", "concurrent-1", "concurrent-2"] as const) await step(`S6-${mode}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    await approve(sl.id);
    let c: any; let thrown: string[] = [];
    if (mode === "consumer-first") { thrown = await consume(uP, sl.id); c = await confirmCash(id); }
    else if (mode === "shop-first") { c = await confirmCash(id); thrown = await consume(uP, sl.id); }
    else { const k = Number(mode.slice(-1)); const [cc, tt] = await Promise.all([(async () => { await new Promise((r) => setTimeout(r, k * 4)); return confirmCash(id); })(), consume(uP, sl.id)]); c = cc; thrown = tt; }
    await pump();
    const moneyIn = DEP + (tookCash(c) ? DEP : 0);
    const m = await money(id, moneyIn);
    const extra = [...m.issues];
    if (m.row.status !== "CONFIRMED") extra.push(`สถานะ ${m.row.status}`);
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S6-${mode}`, extra.length === 0, "CRITICAL", `ร้านยืนยันเงินสด ∥ consumer สลิป (${mode}) ⇒ ใบรับ ≤1 ผูก · ผูก + แจ้งเกิน = เงินเข้า ${moneyIn}`, { issues: extra, confirm: c?.ok ? `OK${c.duplicated ? "/dup" : ""}` : c?.code, bound: m.bound, sap: m.sap });
  });
  // S7 ใบค้างของนัดที่ถูกยกเลิกแล้ว + สลิป ⇒ ค้างคืน (CANCELLED · ไม่ฟื้น) · ผูก + แจ้งเกิน = เงินเข้า
  for (const kind of ["cash", "own-slip"] as const) await step(`S7-${kind}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    if (kind === "own-slip") await approve(sl.id);
    const t = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: kind === "cash" ? "CASH" : "PROMPTPAY", customerId: null, customerName: null, serviceName: "probe", ...(kind === "own-slip" ? { slipId: sl.id } : {}) });
    if (!t?.ok) throw new Error(`ใบค้าง ${J(t)}`);
    const cx = await LN.cancelByShop(uP.ctx, id);
    if (kind === "cash") await approve(sl.id);
    const thrown = await consume(uP, sl.id, 2);
    await pump();
    const moneyIn = kind === "cash" ? DEP * 2 : DEP;
    const m = await money(id, moneyIn);
    const inf = await DP.depositInfo(uP.ctx, id);
    const extra = [...m.issues];
    if (!cx?.ok) extra.push(`ยกเลิก ${cx?.code}`);
    if (m.row.status !== "CANCELLED") extra.push(`นัดที่ยกเลิกกลายเป็น ${m.row.status}`);
    if (!inf || inf.refundDueSatang !== m.bound) extra.push(`ค้างคืน ${inf?.refundDueSatang} (${inf?.state}) ≠ ใบที่ผูก ${m.bound}`);
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S7-${kind}`, extra.length === 0, "CRITICAL", `ใบค้าง (${kind === "cash" ? "เงินสดร้าน" : "ของสลิปตัวเอง"}) ของนัดที่ถูกยกเลิก + สลิป ⇒ CANCELLED + ค้างคืนเท่าใบที่ผูก · ผูก + แจ้งเกิน = ${moneyIn}`, { issues: extra, bound: m.bound, sap: m.sap, state: inf?.state, refundDue: inf?.refundDueSatang });
  });
  // S8 consumer ×3 พร้อมกัน (+ ซ้ำอีก ×3) เมื่อเงินสลิปต้องไปแจ้งเกิน ⇒ slip_after_paid 1 รายการพอดี
  for (let r = 0; r < 3; r++) await step(`S8-${r}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    const sb = await submit(tok);
    if (!sb.ok) throw new Error(`submit ${sb.code}`);
    const sl = await latestSlip(id);
    const cash = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: "CASH", customerId: null, customerName: null, serviceName: "probe" });
    if (!cash?.ok) throw new Error(`ใบเงินสด ${J(cash)}`);
    await approve(sl.id);
    const t1 = await consume(uP, sl.id, 3);
    const t2 = await consume(uP, sl.id, 3);
    await pump();
    const m = await money(id, DEP * 2);
    const n = (await sapOf(id)).length;
    const extra = [...m.issues];
    if (n !== 1) extra.push(`slip_after_paid ${n} รายการ (ต้อง 1)`);
    if ([...t1, ...t2].length) extra.push(`throw ${[...t1, ...t2][0]}`);
    rec(`S8-${r}`, extra.length === 0, "MAJOR", "consumer ×3 พร้อมกัน + ซ้ำ ×3 (เงินสลิปต้องแจ้งเกิน) ⇒ slip_after_paid 1 รายการ · เงินครบ", { issues: extra, sapN: n, sap: m.sap });
  });
  // S9 หน้าจ่าย RECORDING เมื่อมีใบค้าง ⇒ ร้านกดยืนยันผูกได้ ⇒ หลังผูกไม่ค้าง RECORDING (ไม่ค้างถาวร) · ใบของสลิปตัวเองค้าง ⇒ consumer ลองใหม่แล้วหลุด RECORDING
  for (const kind of ["cash", "own-slip"] as const) await step(`S9-${kind}`, async () => {
    const id = await bookOnline(uP);
    const tok = await tokenOf(uP, id);
    let slId = "";
    if (kind === "own-slip") { const sb = await submit(tok); if (!sb.ok) throw new Error(`submit ${sb.code}`); slId = (await latestSlip(id)).id; await approve(slId); }
    const t = await BK.takeAppointmentDeposit({ tenantId: ids.tA, unitId: uP.id, appointmentId: id, amountSatang: DEP, payType: kind === "cash" ? "CASH" : "PROMPTPAY", customerId: null, customerName: null, serviceName: "probe", ...(slId ? { slipId: slId } : {}) });
    if (!t?.ok) throw new Error(`ใบค้าง ${J(t)}`);
    const p1 = await DP.loadDepositPay(tok, { ip: newIp() });
    let c: any = null; let thrown: string[] = [];
    if (kind === "cash") c = await confirmCash(id);
    else { c = await confirmCash(id); thrown = await consume(uP, slId, 2); }
    await pump();
    const p2 = await DP.loadDepositPay(tok, { ip: newIp() });
    const m = await money(id, DEP);
    const extra = [...m.issues];
    if (!p1?.ok || p1.pay.state !== "RECORDING") extra.push(`หน้าจ่ายก่อนผูก ${p1?.ok ? p1.pay.state : p1?.code} (คาด RECORDING)`);
    if (!p2?.ok || p2.pay.state === "RECORDING" || p2.pay.state === "AWAITING") extra.push(`หน้าจ่ายหลังผูก ${p2?.ok ? p2.pay.state : p2?.code} (ค้าง)`);
    if (kind === "cash" && !c?.ok) extra.push(`ร้านยืนยันผูกไม่ได้ ${c?.code}`);
    if (!m.row.depositPaidAt || m.row.status !== "CONFIRMED") extra.push(`แถว ${m.row.status} paid=${!!m.row.depositPaidAt}`);
    if (thrown.length) extra.push(`throw ${thrown[0]}`);
    rec(`S9-${kind}`, extra.length === 0, "MAJOR", `ใบค้าง (${kind}) ⇒ หน้าจ่าย RECORDING → ${kind === "cash" ? "ร้านยืนยัน" : "consumer ลองใหม่"} ผูกได้ ⇒ PAID ไม่ค้าง · เงินครบ`, { issues: extra, before: p1?.ok ? p1.pay.state : p1?.code, after: p2?.ok ? p2.pay.state : p2?.code, confirm: c?.ok ? `OK${c.duplicated ? "/dup" : ""}` : c?.code });
  });
} catch (e) {
  rec("FATAL", false, "ERR", "probe ล้ม", errMsg(e));
} finally {
  try { await cleanup(TIDS); await cleanupGlobal(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  const left = (await q(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n;
  const br = results.filter((r) => !r.ok && r.sev !== "INFO");
  console.log(`\n══ สรุป: ${results.filter((r) => r.ok).length} HOLD · ${br.length} BREACH/ERR ══`);
  console.log(`PROBE_SUMMARY ${J({ total: results.length, hold: results.filter((r) => r.ok).length, breach: br.map((r) => `${r.id}(${r.sev})`), cleanupLeft: left })}`);
  await pool.end();
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(0);
}
