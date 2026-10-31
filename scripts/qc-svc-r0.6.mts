// QC — SVC R0.6 · QR + ตรวจสลิปกลาง · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SVC-MASTER-PLAN.md แถว R0.6 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.6.md (ผูกตรงตัว) · ledger/SVC-CORE-CONTRACT.md §2.3 §3 §7 §8
//        ledger/wo-notes/svc-r0.8-carry.md (R0.6: PII กรองก่อนเก็บ · ซ้ำต่างสาขา P2002 ⇒ DUPLICATE · paymentProfileId ต้องเป็นของร้าน)
//
// กลุ่มข้อ:
//   F  ไฟล์ส่งมอบ · export · ไม่ import POS/บัญชี/fake ตรง · คีย์สิทธิ์ · event 3 ทะเบียน
//   Q  pure: parseSlipQr · maskPayerName · payerNameMatches · receiverMatches
//   R  receiverFor (PaymentProfile) · promptpayQrFor (ยอดล็อก dynamic · CRC · svg) · ข้ามร้าน
//   V  ตรวจ input (คู่ domain/refType · ยอด · key · mime/หัวไฟล์/ขนาด · ไม่มี storage) ⇒ ไม่มีแถว
//   M  ไม่เชื่อมตัวต่อ = ตรวจมือเสมอ · ไฟล์ส่วนตัว · แฮช · QR ⇒ transRef/bankCode · replay · IDEMPOTENCY_CONFLICT
//   D  ซ้ำ: แฮช/เลขอ้างอิง ข้ามสาขา ⇒ REJECTED · ข้ามร้านไม่ชน · ยิงพร้อมกัน 10 (X3) ได้ 1
//   A  FAKE ผ่าน: ตรวจในระบบ 5 ข้อ · autoApprove · ยอดขาด/เกิน/tolerance · ผู้รับ · เวลา · ชื่อ OFF/WARN/BLOCK · INVALID/DUPLICATE/UNKNOWN
//   O  FAKE ล่ม/TIMEOUT ⇒ ตาม onFailure (MANUAL/REJECT) · call log ไม่มี PII
//   P  สิทธิ์ decide: Membership สด · payments.slip.review · สาขา · ข้ามร้าน (X1)
//   K  decideSlip: APPROVE/PARTIAL/REJECT · เหตุผลบังคับ · INVALID_STATE · พร้อมกัน 10 = 1 (X3/X4) · audit
//   QU slipQueue · U slipFileUrl (ลิงก์ชั่วคราว ≤300 วิ · ไม่มี URL ถาวร X10)
//   E  event payment.slip.* ครั้งเดียว · payload พอดี
//   N  ไม่มีผลเงิน (ตารางเงิน POS/บัญชีไม่ขยับ)
//   ST ค่าตั้ง payments.* (R0.3) — SKIP ยอมได้จนกว่า R0.3 ลง
//   Z  PII ไม่หลุด (DB · console · ผลคืน) · ทำความสะอาด
//   W  มติหลังผู้ตรวจ 28 ต.ค. (ORACLE-EDIT R0.6-W1..W9 · /root/svc-runs/fix/r0.6.md): ถอนสิทธิ์ (acceptedAt null) · replay ตรงทุกช่อง · เพดานยอดอนุมัติ ·
//      ทางมือบังคับ transRef + กันซ้ำ · transRef canonical · TIMEOUT ไม่ REJECT · capability checksReceiver · ไม่มีไฟล์ค้าง · slip-shared ไม่ import server
//
// 🔴 เขียนฐาน qc-svc — รันผ่าน gate lock (ห้ามครอบ timeout):
//    bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.6.mts
// แถวของข้อสอบ: refId/label ขึ้นต้น "svc-r06-" · ลบใน finally · env/membership/PaymentProfile คืนใน finally · วันที่สัมพัทธ์ทั้งหมด
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { format } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.6";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_HINT = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.6.mts";

// ═══════════════ 0. ด่านฐานข้อมูล + gate lock (ในตัวข้อสอบ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: ${RUN_HINT}`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
  if (process.env.SHARK_GATE_LOCK_MARKER !== "1" || !/^\/tmp\/shark-gate-svc(-ep-[a-z0-9-]+)?\.lock$/.test(process.env.GATE_LOCK_FILE ?? "") /* ORACLE-EDIT (ผู้คุม 31 ต.ค. · ล็อกต่อฐาน) */) {
    console.error(`🔴 ${LABEL}: ไม่ได้รันใต้ gate lock ของ SVC (with-gate-lock.sh ผ่าน qc-svc.sh) — รันผ่าน: ${RUN_HINT}`);
    process.exit(4);
  }
}
loadSvcQcEnv(LABEL);

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string; allowSkip: boolean }[] = [];
const ORIG = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
const out = (s: string) => ORIG.log(s);
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail, allowSkip: false });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL", allowSkip = false) => {
  cks.push({ id, res: "SKIP", sev, why, allowSkip });
  out(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const PMAX = 8;
const why = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
async function step(id: string, name: string, fn: (p: string[]) => Promise<void>, sev: Sev = "CRITICAL") {
  const p: string[] = [];
  try { await fn(p); } catch (e) { p.push(`โยน: ${errMsg(e)}`); }
  chk(id, name, p.length === 0, why(p), sev);
}

// ═══════════════ env ของรอบ ═══════════════
const RAND = randomBytes(4).toString("hex");
const PFX = `svc-r06-${RAND}`;
const ENV_KEYS = ["INTEGRATIONS_CREDENTIALS_KEY", "INTEGRATIONS_FAKE", "SESSION_SECRET", "SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"] as const;
const ENV_SAVED: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
envSet("INTEGRATIONS_CREDENTIALS_KEY", randomBytes(32).toString("hex"));
envSet("INTEGRATIONS_FAKE", "1");
if ((process.env.SESSION_SECRET ?? "").length < 32) envSet("SESSION_SECRET", randomBytes(32).toString("hex"));
// storage จริงห้ามถูกยิง — ทุก submit ใช้ deps.put ของข้อสอบ (ไม่มี put = ต้องได้ STORAGE_NOT_CONFIGURED)
for (const k of ["SHARK_BUNNY_ZONE", "SHARK_BUNNY_KEY", "SHARK_BUNNY_CDN"]) envSet(k, undefined);

// ═══════════════ ดัก console ═══════════════
const CAPTURED: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  console[k] = (...a: unknown[]) => { CAPTURED.push(format(...a)); ORIG[k](...a); };
}

// ═══════════════ สัญญาข้อมูล (seed R0.2) ═══════════════
const TA = "svcqc-tenant";
const TB = "svcqc-other-tenant";
const U = { barber: "svcqc-unit-barber", massage: "svcqc-unit-massage", dorm: "svcqc-unit-dorm", hotel: "svcqc-unit-hotel" } as const;
const UB = "svcqc-other-unit-barber";
type Actor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
const ACT: Record<string, Actor> = {
  owner: { userId: "svcqc-user-owner", role: "OWNER", unitAccess: ["*"], permissions: {} },
  manager: { userId: "svcqc-user-manager", role: "MANAGER", unitAccess: [U.barber, U.massage], permissions: {} },
  fai: { userId: "svcqc-user-fai", role: "STAFF", unitAccess: [U.dorm], permissions: {} },
  faiLies: { userId: "svcqc-user-fai", role: "OWNER", unitAccess: ["*"], permissions: { "payments.slip.review": true } },
  nobody: { userId: `svc-r06-nobody-${RAND}`, role: "OWNER", unitAccess: ["*"], permissions: {} },
  otherOwner: { userId: "svcqc-other-user-owner", role: "OWNER", unitAccess: ["*"], permissions: {} },
};
const MB_FAI = "svcqc-mb-fai";
const MB_MGR = "svcqc-mb-manager"; // ORACLE-EDIT R0.6-W1: ถอนสิทธิ์ = acceptedAt null (คืนใน finally)
let D6_PUTS: string[] = [];
const ALL_REASONS = ["DUPLICATE_IMAGE", "DUPLICATE_TRANSREF", "AMOUNT_SHORT", "AMOUNT_OVER", "RECEIVER_MISMATCH", "RECEIVER_NOT_SET", "TOO_OLD", "FUTURE_TIME", "PAYER_NAME_MISMATCH", "DATA_MISSING", "UNVERIFIED", "VERIFIER_DOWN", "VERIFIER_INVALID", "VERIFIER_DUPLICATE", "VERIFIER_UNKNOWN", "TRANSREF_MISMATCH"];
const CTX_A = { tenantId: TA };
const CTX_B = { tenantId: TB };
const EVENTS = ["payment.slip.submitted", "payment.slip.approved", "payment.slip.rejected"];
const HOUR = 3_600_000;
const START = new Date(Date.now() - 5_000);
const EXPECT = 556_232; // ภาพ 06 ห้อง 206 ยอดบิล ฿5,562.32
const VERIFIER_RESULT_KEYS = new Set(["status", "amountSatang", "transRef", "transferredAt", "receiverMasked", "providerRef"]);
const SURNAME = `ZED${RAND.toUpperCase()}`; // นามสกุลเต็ม = เครื่องหมายสแกนรั่ว PII
const PAYER_FULL = `MR. ANAN ${SURNAME}`;
const PAYER_EXPECT = `Anan ${SURNAME}`;
const PAYER_MASKED = "ANAN Z.";
const PII_MARKS = [SURNAME, SURNAME.toLowerCase()];

// ═══════════════ ตัวช่วย ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };
const codeOf = (r: Any) => (r?.ok === true ? `ok(${r.status ?? ""})` : r?.__missing ? "ไม่มีฟังก์ชัน" : r?.threw ? `โยน(${String(r.message).slice(0, 80)})` : String(r?.code ?? js(r).slice(0, 60)));
const refused = (r: Any, ...codes: string[]) => r?.ok === false && codes.includes(r?.code) && !r?.threw && !r?.__missing;
const tryImport = async (p: string): Promise<Any> => {
  try { return await import(p as string); } catch (e) { out(`  (โหลด ${p} ไม่ได้: ${errMsg(e).slice(0, 160)})`); return null; }
};
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, __missing: true, code: `MISSING:${name}` };
  try { return keep(await fn(...args)); } catch (e) { return { ok: false, threw: true, code: "THREW", message: errMsg(e) }; }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true };
  try { return fn(...args); } catch (e) { return { __threw: true, message: errMsg(e) }; }
}
function listTs(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const o: string[] = [];
  for (const n of readdirSync(abs)) {
    const rel = join(dir, n);
    if (statSync(join(ROOT, rel)).isDirectory()) o.push(...listTs(rel));
    else if (/\.(ts|tsx)$/.test(n)) o.push(rel);
  }
  return o;
}
const sameSet = (a: unknown[], b: unknown[]) => js([...a].map(String).sort()) === js([...b].map(String).sort());
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// ── TLV (EMV/PromptPay · QR สลิป) ──
const tlv = (tag: string, v: string) => tag + String(v.length).padStart(2, "0") + v;
function parseTlv(s: string): Map<string, string> | null {
  const m = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > s.length) return null;
    m.set(tag, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return m;
}
function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xffff; }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
/** QR สั้นบนสลิปธนาคารไทย (ใบสั่ง §4) — CRC ใส่ให้ถูก แต่ parseSlipQr ไม่ต้องตรวจ */
function slipQr(bank: string, transRef: string): string {
  const body = tlv("00", tlv("00", "000001") + tlv("01", bank) + tlv("02", transRef)) + tlv("51", "TH") + "9104";
  return body + crc16(body);
}
const fakeSlip = (o: Record<string, unknown>) => `FAKESLIP:${Buffer.from(JSON.stringify(o), "utf8").toString("base64url")}`;
let trN = 0;
const newTR = () => `${RAND}TR${String(++trN).padStart(4, "0")}${randomBytes(3).toString("hex")}`.toUpperCase();

// ── ไฟล์รูป ──
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (): Uint8Array => Uint8Array.from(Buffer.concat([PNG_SIG, randomBytes(96)]));
const jpg = (): Uint8Array => Uint8Array.from(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(96)]));
const PUTS: { path: string; bytes: number; hash: string }[] = [];
const put = async (path: string, data: Uint8Array) => { PUTS.push({ path, bytes: data.length, hash: sha(data) }); };
const DELS: string[] = []; // ORACLE-EDIT R0.6-W8: deps.del → deleteFileAsset/deleteStoredFile
const del = async (path: string): Promise<number> => { DELS.push(path); return 200; };

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: Any };
const FILES = { slip: "src/lib/payment/slip-verify.ts", receiver: "src/lib/payment/receiver.ts", fake: "src/lib/core/integrations/providers/fake.ts" };
const SV: Any = has(FILES.slip) ? await tryImport("@/lib/payment/slip-verify") : null;
const RC: Any = has(FILES.receiver) ? await tryImport("@/lib/payment/receiver") : null;
const I: Any = await tryImport("@/lib/core/integrations");
const LINKS: Any = await tryImport("@/lib/storage/private-links");
const SETTINGS_READY = has("src/lib/core/settings/index.ts") && has("src/lib/core/settings/defs/payments.ts");
const NEED = (): string[] => (SV ? [] : ["ยังไม่มี @/lib/payment/slip-verify"]);

// ── ตัวเรียก ──
const UNIT_KIND: Record<string, { domain: string; refType: string }> = {
  [U.barber]: { domain: "BOOKING", refType: "APPT_DEPOSIT" },
  [U.massage]: { domain: "BOOKING", refType: "APPT_DEPOSIT" },
  [U.dorm]: { domain: "DORM", refType: "DORM_BILL" },
  [U.hotel]: { domain: "HOTEL", refType: "HOTEL_DEPOSIT" },
  [UB]: { domain: "BOOKING", refType: "APPT_DEPOSIT" },
};
let refN = 0;
const newRef = () => `${PFX}-${++refN}`;
const newKey = () => `${PFX}-k-${randomBytes(6).toString("hex")}`;
type SubOpts = { input?: Any; deps?: Any; noPut?: boolean };
async function submit(ctx: Any, unitId: string, o: SubOpts = {}): Promise<Any> {
  const k = UNIT_KIND[unitId] ?? { domain: "BOOKING", refType: "APPT_DEPOSIT" };
  const input = { unitId, domain: k.domain, refType: k.refType, refId: newRef(), file: { data: png(), contentType: "image/png" }, expectedSatang: EXPECT, idempotencyKey: newKey(), ...(o.input ?? {}) };
  const deps = o.noPut ? { ...(o.deps ?? {}) } : { put, del, policy: { autoApprove: true }, ...(o.deps ?? {}) };
  return call(SV, "submitSlip", ctx, input, deps);
}
const decide = (a: Any, ctx: Any, id: string, input: Any) => call(SV, "decideSlip", a, ctx, id, input);
const queue = (a: Any, ctx: Any, f: Any) => call(SV, "slipQueue", a, ctx, f);
const fileUrl = (a: Any, ctx: Any, id: string) => call(SV, "slipFileUrl", a, ctx, id);
const slipRow = async (id: string): Promise<Any> => (id ? prisma.paymentSlip.findUnique({ where: { id } }) : null);
const evOf = async (slipId: string, type?: string): Promise<Any[]> =>
  ((await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, type: type ? type : { in: EVENTS }, createdAt: { gte: START } }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => e?.payload?.slipId === slipId);
const reasonsOf = (r: Any): string[] => (Array.isArray(r?.reasons) ? r.reasons.map(String) : []);
const hasReason = (r: Any, x: string) => reasonsOf(r).includes(x);
/** สคริปต์สลิปที่ผ่านทุกข้อ (ทับได้) */
let RECV = ""; // promptpayId ของร้าน A (ตั้งใน setup)
const goodMasked = () => `xxx-xxx-${RECV.replace(/\D/g, "").slice(-4)}`;
const goodScript = (over: Record<string, unknown> = {}) => fakeSlip({ status: "VALID", amountSatang: EXPECT, transRef: newTR(), payerName: PAYER_FULL, receiverMasked: goodMasked(), transferredAt: new Date(Date.now() - 2 * HOUR).toISOString(), ...over });
/** ORACLE-EDIT R0.6-W3: สลิปรอตรวจที่ยอดเต็ม (ผู้รับไม่ตรง) — ใช้แทนสลิปยอดขาดในข้อที่ APPROVE ปกติ */
const reviewScript = (over: Record<string, unknown> = {}) => goodScript({ receiverMasked: `xxx-xxx-${RECV.replace(/\D/g, "").slice(-4) === "1357" ? "2468" : "1357"}`, ...over });
const subFake = (unitId: string, script: string, deps: Any = {}, input: Any = {}) => submit(CTX_A, unitId, { input: { qrPayload: script, expectedPayerNames: [PAYER_EXPECT], ...input }, deps });

// ═══════════════ สถานะที่ต้องคืน ═══════════════
const created = {
  intId: "",
  payA: "none" as "none" | "created" | "patched",
  payAPrev: null as Any,
  payB: "none" as "none" | "created",
  faiPerm: undefined as unknown,
  faiTouched: false,
  mgrAccepted: undefined as unknown,
  mgrTouched: false,
  capPrev: undefined as unknown,
  capTouched: false,
  settingIds: [] as string[],
};
const SLIP_IDS = new Set<string>();
const track = (r: Any) => { if (r?.ok === true && typeof r.slipId === "string") SLIP_IDS.add(r.slipId); return r; };
const moneyCounts = async (): Promise<Record<string, number | string>> => {
  const o: Record<string, number | string> = {};
  for (const m of ["accountJournalEntry", "accountDocumentPayment", "posDeposit", "posDepositTxn", "posPayment", "posSale", "posPaymentSlip"]) {
    try { o[m] = await prisma[m].count({ where: { tenantId: { in: [TA, TB] } } }); } catch (e) { o[m] = `อ่านไม่ได้ ${errMsg(e).slice(0, 40)}`; }
  }
  return o;
};

async function cleanup(): Promise<void> {
  const rows = (await prisma.paymentSlip.findMany({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: "svc-r06-" } }, select: { id: true, fileId: true } })) as Any[];
  const ids = [...new Set([...rows.map((r) => r.id), ...SLIP_IDS])];
  const fileIds = rows.map((r) => r.fileId).filter((x: unknown) => typeof x === "string");
  await prisma.auditLog.deleteMany({ where: { targetType: "PaymentSlip", targetId: { in: ids } } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS } } });
  await prisma.paymentSlip.deleteMany({ where: { id: { in: ids } } });
  const paths = PUTS.map((p) => p.path);
  await prisma.fileAsset.deleteMany({ where: { tenantId: { in: [TA, TB] }, OR: [{ id: { in: fileIds } }, { path: { in: paths } }] } });
  const ints = (await prisma.tenantIntegration.findMany({ where: { tenantId: { in: [TA, TB] }, label: { startsWith: "svc-r06-" } }, select: { id: true } })) as { id: string }[];
  const intIds = ints.map((r) => r.id);
  if (intIds.length) {
    await prisma.integrationCallLog.deleteMany({ where: { integrationId: { in: intIds } } });
    await prisma.auditLog.deleteMany({ where: { targetType: "TenantIntegration", targetId: { in: intIds } } });
    await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: [TA, TB] }, type: { in: ["integration.connected", "integration.failed"] }, createdAt: { gte: START } } });
    await prisma.tenantIntegration.deleteMany({ where: { id: { in: intIds } } });
  }
  if (created.settingIds.length) await prisma.settingValue.deleteMany({ where: { id: { in: created.settingIds } } });
  await prisma.settingValue.deleteMany({ where: { tenantId: { in: [TA, TB] }, setById: "svc-r06" } });
}

out(`\n===== QC SVC R0.6 · QR + ตรวจสลิปกลาง · รอบ ${RAND} =====`);
let MONEY0: Record<string, number | string> = {};
try {
  await cleanup();
  const tenantsOk = (await prisma.tenant.count({ where: { id: { in: [TA, TB] } } })) === 2;
  chk("PRE-1", "ร้าน QC ของ SVC มีอยู่ (seed R0.2)", tenantsOk, "ไม่พบ svcqc-tenant/svcqc-other-tenant — รัน seed-svc-qc ก่อน");
  const foreign = await prisma.tenantIntegration.count({ where: { tenantId: { in: [TA, TB] }, kind: "SLIP_VERIFY", status: { in: ["CONNECTED", "ERROR"] }, NOT: { label: { startsWith: "svc-r06-" } } } });
  chk("PRE-2", "ไม่มี SLIP_VERIFY ค้างในร้าน QC (หน่วย hotel/ร้าน B ต้องไม่มีตัวต่อ)", foreign === 0, `พบ ${foreign} แถว — ลบของรอบอื่นก่อน`);
  MONEY0 = await moneyCounts();

  // ── PaymentProfile ร้าน A (ผู้รับ) ──
  {
    const pp = (await prisma.paymentProfile.findUnique({ where: { tenantId: TA } })) as Any;
    const valid = (s: unknown) => typeof s === "string" && /^(0\d{9}|\d{13})$/.test(s.replace(/\D/g, ""));
    if (!pp) { await prisma.paymentProfile.create({ data: { tenantId: TA, promptpayId: "0812346006", displayName: `svc-r06 ${RAND}` } }); created.payA = "created"; RECV = "0812346006"; }
    else if (!valid(pp.promptpayId)) { created.payAPrev = { promptpayId: pp.promptpayId, displayName: pp.displayName }; await prisma.paymentProfile.update({ where: { tenantId: TA }, data: { promptpayId: "0812346006", displayName: pp.displayName ?? `svc-r06 ${RAND}` } }); created.payA = "patched"; RECV = "0812346006"; }
    else RECV = String(pp.promptpayId);
  }

  // ═══════════════ F ไฟล์ ═══════════════
  out("\n— F ไฟล์ส่งมอบ —");
  await step("F-1", "ไฟล์ slip-verify.ts + receiver.ts มี · export ครบ (submit/decide/queue/fileUrl/parseSlipQr/mask/match + receiverFor/promptpayQrFor)", async (p) => {
    for (const [k, f] of Object.entries(FILES)) if (!has(f)) p.push(`ไม่มี ${k}: ${f}`);
    p.push(...NEED());
    for (const n of ["submitSlip", "decideSlip", "slipQueue", "slipFileUrl", "parseSlipQr", "maskPayerName", "payerNameMatches", "receiverMatches"]) if (SV && typeof SV[n] !== "function") p.push(`slip-verify ไม่มี ${n}`);
    if (!RC) p.push("ยังไม่มี @/lib/payment/receiver");
    else for (const n of ["receiverFor", "promptpayQrFor"]) if (typeof RC[n] !== "function") p.push(`receiver ไม่มี ${n}`);
  });
  await step("F-2", "ไม่มีผลเงิน/ทางลัด: ไม่ import modules/pos·account · ไม่เรียก moduleTakeDeposit/recordExternalPayment · ไม่ import providers/fake ตรง · ใช้ getIntegration+callIntegration · uploadFile private", async (p) => {
    for (const f of [FILES.slip, FILES.receiver]) {
      const s = read(f);
      if (!s) { p.push(`ไม่มี ${f}`); continue; }
      if (/from\s+["'][^"']*modules\/(pos|account)[^"']*["']|import\(\s*["'][^"']*modules\/(pos|account)/.test(s)) p.push(`${f} import POS/บัญชี`);
      if (/moduleTakeDeposit|recordExternalPayment/.test(s)) p.push(`${f} อ้างฟังก์ชันเงิน`);
      if (/providers\/fake/.test(s)) p.push(`${f} import fake ตรง`);
      if (/PosPaymentSlip|posPaymentSlip/.test(s)) p.push(`${f} แตะ PosPaymentSlip (X-POS.1)`);
    }
    const s = read(FILES.slip);
    if (s && !(/getIntegration/.test(s) && /callIntegration/.test(s))) p.push("slip-verify ไม่ใช้ getIntegration+callIntegration");
    if (s && !/visibility\s*:\s*["']private["']/.test(s)) p.push("slip-verify ไม่อัปแบบ visibility: \"private\"");
  });
  await step("F-3", "คีย์สิทธิ์ payments.slip.review มีป้ายไทยใน permissions.ts", async (p) => {
    const s = read("src/lib/core/permissions.ts");
    const m = s.match(/["']payments\.slip\.review["']\s*:\s*["']([^"']+)["']/);
    if (!m) p.push("ไม่มีคีย์ payments.slip.review");
    else if (!/[฀-๿]/.test(m[1] ?? "")) p.push("ป้ายไม่ใช่ภาษาไทย");
  });
  await step("F-4", "event payment.slip.submitted/approved/rejected ลง 3 ทะเบียน", async (p) => {
    for (const f of ["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"]) {
      const s = read(f);
      for (const e of EVENTS) if (!s.includes(`"${e}"`)) p.push(`${f} ไม่มี ${e}`);
    }
  }, "MAJOR");

  // ═══════════════ Q pure ═══════════════
  out("\n— Q ฟังก์ชันบริสุทธิ์ —");
  await step("Q-1", "parseSlipQr: QR สลิป ⇒ {bankCode, transRef} · ขยะ/ขาด tag/API id ผิด ⇒ null ไม่ throw", async (p) => {
    p.push(...NEED());
    const tr = newTR();
    const r = callSync(SV, "parseSlipQr", slipQr("014", tr));
    if (r?.bankCode !== "014" || r?.transRef !== tr) p.push(`ถูก → ${js(r)}`);
    const badApi = tlv("00", tlv("00", "000009") + tlv("01", "014") + tlv("02", tr)) + tlv("51", "TH");
    const noRef = tlv("00", tlv("00", "000001") + tlv("01", "014")) + tlv("51", "TH");
    for (const [lbl, v] of [["ขยะ", "hello"], ["ว่าง", ""], ["API id ผิด", badApi], ["ไม่มีเลขอ้างอิง", noRef], ["QR พร้อมเพย์รับเงิน", tlv("00", "01") + tlv("01", "12")], ["ไม่ใช่ string", 42], ["FAKESLIP", fakeSlip({})]] as const) {
      const x = callSync(SV, "parseSlipQr", v);
      if (x !== null) p.push(`${lbl} → ${js(x).slice(0, 60)}`);
    }
  });
  await step("Q-2", "maskPayerName: ตัดคำนำหน้า · ชื่อต้น + อักษรแรกนามสกุล + \".\" · ว่าง ⇒ null", async (p) => {
    p.push(...NEED());
    const cases: [unknown, string | null][] = [
      ["นางสาว สมพร ชัยดีเลิศ", "สมพร ช."], ["นาย สมชาย ใจดี", "สมชาย ใ."], ["น.ส. สมพร ช", "สมพร ช."], ["MR. JOHN SMITH", "JOHN S."],
      ["Mrs Jane Doe", "Jane D."], ["สมศรี", "สมศรี"], ["", null], ["   ", null], [null, null],
    ];
    for (const [i, want] of cases) {
      const r = callSync(SV, "maskPayerName", i);
      if (r !== want) p.push(`${js(i)} → ${js(r)} (คาด ${js(want)})`);
    }
  });
  await step("Q-3", "payerNameMatches: ชื่อต้นตรง+อักษรแรกนามสกุลตรง · สลิปตัดนามสกุลยังตรง · ไม่มีชื่อ ⇒ null", async (p) => {
    p.push(...NEED());
    const cases: [unknown, unknown, boolean | null][] = [
      ["นางสาว สมพร ชัยดีเลิศ", ["สมพร ชัยดีเลิศ"], true], ["น.ส. สมพร ช", ["สมพร ชัยดีเลิศ"], true], ["MR. ANAN ZED", ["anan zed"], true],
      ["นาย สมชาย ใจดี", ["สมพร ชัยดีเลิศ"], false], ["นางสาว สมพร ก", ["สมพร ชัยดีเลิศ"], false], ["สมพร ชัยดีเลิศ", ["มานี มีนา", "สมพร ชัยดี"], true],
      [null, ["สมพร"], null], ["สมพร ช", [], null],
    ];
    for (const [a, b, want] of cases) {
      const r = callSync(SV, "payerNameMatches", a, b);
      if (r !== want) p.push(`${js(a)} vs ${js(b)} → ${js(r)} (คาด ${js(want)})`);
    }
  });
  await step("Q-4", "receiverMatches: ตัวเลข ≥4 หลักใน masked อยู่ในพร้อมเพย์/บัญชี · <4 หลัก/ไม่มี ⇒ null", async (p) => {
    p.push(...NEED());
    const rc = { promptpayId: "0812346006" };
    const cases: [unknown, unknown, boolean | null][] = [
      ["xxx-xxx-6006", rc, true], ["XXX-XXX-6006", rc, true], ["xxx-xxx-1111", rc, false], ["xx-x-x6-x", rc, null], [null, rc, null],
      ["xxx-x-x5678-x", { promptpayId: "0812346006", bankAccount: "123-4-45678-9" }, true], ["66812346006", rc, true],
    ];
    for (const [m, r, want] of cases) {
      const x = callSync(SV, "receiverMatches", m, r);
      if (x !== want) p.push(`${js(m)} → ${js(x)} (คาด ${js(want)})`);
    }
  });

  // ═══════════════ R ผู้รับ + QR ═══════════════
  out("\n— R ผู้รับ · QR พร้อมเพย์ยอดล็อก —");
  await step("R-1", "receiverFor(barber) = PaymentProfile ของร้าน · unit ร้านอื่น/มั่ว ⇒ null", async (p) => {
    if (!RC) { p.push("ไม่มี receiver"); return; }
    const r = await call(RC, "receiverFor", CTX_A, U.barber);
    if (r?.promptpayId !== RECV) p.push(`barber → ${js(r).slice(0, 80)} (คาด promptpayId ${RECV})`);
    if (typeof r?.displayName !== "string") p.push("ไม่มี displayName");
    for (const [lbl, ctx, u] of [["unit ร้าน B ด้วย ctx A", CTX_A, UB], ["unit ร้าน A ด้วย ctx B", CTX_B, U.barber], ["unit มั่ว", CTX_A, `${PFX}-nounit`]] as const) {
      const x = await call(RC, "receiverFor", ctx, u);
      if (x !== null) p.push(`${lbl} → ${js(x).slice(0, 60)}`);
    }
  });
  await step("R-2", "promptpayQrFor: payload dynamic (01=12) · 54 = ยอดล็อก · 29 มี proxy ของร้าน · CRC ถูก · svg data URL", async (p) => {
    if (!RC) { p.push("ไม่มี receiver"); return; }
    const r = await call(RC, "promptpayQrFor", CTX_A, { unitId: U.dorm, amountSatang: EXPECT, ref: `${PFX}-bill` });
    if (r?.ok !== true) { p.push(`→ ${codeOf(r)}`); return; }
    const t = parseTlv(String(r.payload));
    if (!t) { p.push("payload อ่าน TLV ไม่ได้"); return; }
    if (t.get("01") !== "12") p.push(`01 = ${t.get("01")} (คาด 12 dynamic)`);
    if (t.get("54") !== "5562.32") p.push(`54 = ${t.get("54")} (คาด 5562.32)`);
    if (t.get("53") !== "764") p.push("53 ไม่ใช่ THB");
    const digits = RECV.replace(/\D/g, "");
    const proxy = digits.length === 10 ? "0066" + digits.slice(1) : digits;
    if (!String(t.get("29") ?? "").includes(proxy)) p.push("29 ไม่มี proxy พร้อมเพย์ของร้าน");
    const s = String(r.payload);
    if (crc16(s.slice(0, -4)) !== s.slice(-4)) p.push("CRC ไม่ถูก");
    if (!String(r.svgDataUrl ?? "").startsWith("data:image/svg+xml")) p.push("svgDataUrl ไม่ใช่ data:image/svg+xml");
  });
  await step("R-3", "promptpayQrFor: ยอด 0/ติดลบ/ทศนิยม/เกินเพดาน ⇒ VALIDATION · unit ร้านอื่น ⇒ NOT_FOUND", async (p) => {
    if (!RC) { p.push("ไม่มี receiver"); return; }
    for (const a of [0, -100, 12.5, 10_000_000_000, Number.NaN]) {
      const r = await call(RC, "promptpayQrFor", CTX_A, { unitId: U.dorm, amountSatang: a, ref: "x" });
      if (!refused(r, "VALIDATION")) p.push(`ยอด ${a} → ${codeOf(r)}`);
    }
    const r2 = await call(RC, "promptpayQrFor", CTX_B, { unitId: U.dorm, amountSatang: 1000, ref: "x" });
    if (!refused(r2, "NOT_FOUND")) p.push(`ctx B + unit A → ${codeOf(r2)}`);
  });
  {
    const ppB = await prisma.paymentProfile.findUnique({ where: { tenantId: TB } });
    if (ppB) skip("R-4", "ร้านไม่มีผู้รับ ⇒ NO_RECEIVER", "ร้าน B มี PaymentProfile อยู่แล้ว (ไม่ลบของเดิม)", "MINOR", true);
    else await step("R-4", "ร้านไม่มีผู้รับ ⇒ NO_RECEIVER (ไม่สร้าง QR ไปบัญชีอื่น)", async (p) => {
      if (!RC) { p.push("ไม่มี receiver"); return; }
      const r = await call(RC, "promptpayQrFor", CTX_B, { unitId: UB, amountSatang: 1000, ref: "x" });
      if (!refused(r, "NO_RECEIVER")) p.push(`→ ${codeOf(r)}`);
    }, "MAJOR");
  }

  // ═══════════════ V input ═══════════════
  out("\n— V ตรวจ input (ล้ม = ไม่มีแถว) —");
  const rowsNow = async () => prisma.paymentSlip.count({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: PFX } } });
  await step("V-1", "domain/refType ไม่คู่ · ยอดผิด · key สั้น/อักขระแปลก · refId ว่าง ⇒ VALIDATION", async (p) => {
    p.push(...NEED());
    const n0 = await rowsNow();
    const bad: [string, Any][] = [
      ["BOOKING+DORM_BILL", { domain: "BOOKING", refType: "DORM_BILL" }], ["DORM+APPT_DEPOSIT", { domain: "DORM", refType: "APPT_DEPOSIT" }], ["domain มั่ว", { domain: "SHOP", refType: "APPT_DEPOSIT" }],
      ["ยอด 0", { expectedSatang: 0 }], ["ยอดทศนิยม", { expectedSatang: 100.5 }], ["ยอดติดลบ", { expectedSatang: -1 }],
      ["key สั้น", { idempotencyKey: "abc" }], ["key มีช่องว่าง", { idempotencyKey: "abc def ghi jkl" }], ["refId ว่าง", { refId: "" }],
    ];
    for (const [lbl, input] of bad) {
      const r = await submit(CTX_A, U.barber, { input });
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if ((await rowsNow()) !== n0) p.push("มีแถวเกิด");
  });
  await step("V-2", "ไฟล์: mime ไม่รับ · หัวไฟล์ไม่ตรง mime · > 5 MB ⇒ VALIDATION · ไม่มีอัป", async (p) => {
    p.push(...NEED());
    const n0 = await rowsNow();
    const p0 = PUTS.length;
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(PNG_SIG, 0);
    const bad: [string, Any][] = [
      ["pdf", { data: Uint8Array.from(Buffer.from("%PDF-1.4 xxxxxxxx")), contentType: "application/pdf" }],
      ["png แต่ไบต์ขยะ", { data: Uint8Array.from(randomBytes(80)), contentType: "image/png" }],
      ["jpeg แต่ไบต์ png", { data: png(), contentType: "image/jpeg" }],
      ["> 5 MB", { data: big, contentType: "image/png" }],
      ["ว่าง", { data: new Uint8Array(0), contentType: "image/png" }],
    ];
    for (const [lbl, file] of bad) {
      const r = await submit(CTX_A, U.hotel, { input: { file } });
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const ok = await submit(CTX_A, U.hotel, { input: { file: { data: jpg(), contentType: "image/jpeg" } } });
    track(ok);
    if (ok?.ok !== true) p.push(`jpeg ถูกต้อง → ${codeOf(ok)} (positive control)`);
    if ((await rowsNow()) !== n0 + (ok?.ok === true ? 1 : 0)) p.push("แถวเกิดจากไฟล์ที่ผิด");
    if (PUTS.length !== p0 + (ok?.ok === true ? 1 : 0)) p.push(`อัปไฟล์ที่ผิด (${PUTS.length - p0} ครั้ง)`);
  });
  await step("V-3", "unit ร้านอื่น ⇒ NOT_FOUND · ไม่มี storage (ไม่มี put/env) ⇒ STORAGE_NOT_CONFIGURED · ไม่มีแถว", async (p) => {
    p.push(...NEED());
    const n0 = await rowsNow();
    const r1 = await submit(CTX_A, UB);
    if (!refused(r1, "NOT_FOUND")) p.push(`ctx A + unit B → ${codeOf(r1)}`);
    const r2 = await submit(CTX_B, U.barber);
    if (!refused(r2, "NOT_FOUND")) p.push(`ctx B + unit A → ${codeOf(r2)}`);
    const r3 = await submit(CTX_A, U.hotel, { noPut: true });
    if (!refused(r3, "STORAGE_NOT_CONFIGURED")) p.push(`ไม่มี storage → ${codeOf(r3)}`);
    if ((await rowsNow()) !== n0) p.push("มีแถวเกิด");
  });

  // ═══════════════ ตั้งตัวต่อ FAKE (barber · massage · dorm) — hotel/ร้าน B ไม่มีตัวต่อ ═══════════════
  const setMode = async (mode: string, onFailure: "MANUAL" | "REJECT" = "MANUAL") =>
    call(I, "saveIntegration", CTX_A, ACT.owner, { id: created.intId, kind: "SLIP_VERIFY", provider: "FAKE", fields: { mode }, onFailure });
  {
    const s = await call(I, "saveIntegration", CTX_A, ACT.owner, { create: true, kind: "SLIP_VERIFY", provider: "FAKE", label: `${PFX}-int`, unitIds: [U.barber, U.massage, U.dorm], onFailure: "MANUAL", fields: { apiKey: `qc06${randomBytes(14).toString("hex")}`, mode: "OK" } });
    created.intId = s?.integration?.id ?? "";
    const t = created.intId ? await call(I, "testIntegration", CTX_A, ACT.owner, { id: created.intId }) : null;
    const row = created.intId ? await prisma.tenantIntegration.findUnique({ where: { id: created.intId } }) : null;
    chk("PRE-3", "ตั้งตัวต่อ FAKE SLIP_VERIFY (barber/massage/dorm) ⇒ CONNECTED (R0.5)", row?.status === "CONNECTED", `save ${codeOf(s)} · test ${codeOf(t)} · status ${row?.status}`);
  }
  const callLogs = async () => (created.intId ? prisma.integrationCallLog.count({ where: { integrationId: created.intId } }) : 0);

  // ═══════════════ M ทางมือ ═══════════════
  out("\n— M ไม่เชื่อมตัวต่อ = ตรวจมือเสมอ · ไฟล์ส่วนตัว · replay —");
  let M1: Any = null;
  const M1_DATA = png();
  const M1_KEY = newKey();
  const M1_REF = newRef(); // ORACLE-EDIT R0.6-W2: replay ต้องตรง unitId/domain/refType/refId/expectedSatang
  const M1_TR = newTR();
  await step("M-1", "hotel (ไม่มีตัวต่อ) + autoApprove เปิด + สลิปข้อมูลครบ ⇒ NEEDS_REVIEW [UNVERIFIED] (ไม่อนุมัติอัตโนมัติ)", async (p) => {
    p.push(...NEED());
    M1 = track(await submit(CTX_A, U.hotel, { input: { file: { data: M1_DATA, contentType: "image/png" }, idempotencyKey: M1_KEY, refId: M1_REF, qrPayload: slipQr("014", M1_TR), expectedPayerNames: [PAYER_EXPECT] } }));
    if (M1?.ok !== true) { p.push(`→ ${codeOf(M1)}`); return; }
    if (M1.status !== "NEEDS_REVIEW") p.push(`status ${M1.status}`);
    if (!sameSet(reasonsOf(M1), ["UNVERIFIED"])) p.push(`reasons ${js(M1.reasons)}`);
    const row = await slipRow(M1.slipId);
    if (row?.verifierIntegrationId) p.push("มี verifierIntegrationId ทั้งที่ไม่มีตัวต่อ");
  });
  await step("M-2", "แถว: imageHash = sha256 ไบต์ · transRef/bankCode จาก QR · fileId → FileAsset ส่วนตัว (path t/<ร้าน>/private/ · cdnUrl private://) · อัปไบต์เดียวกัน", async (p) => {
    if (M1?.ok !== true) { p.push("M-1 ไม่ผ่าน"); return; }
    const row = await slipRow(M1.slipId);
    if (!row) { p.push("ไม่พบแถว"); return; }
    if (row.imageHash !== sha(M1_DATA)) p.push("imageHash ไม่ใช่ sha256 hex ของไบต์");
    if (row.transRef !== M1_TR) p.push(`transRef ${row.transRef}`);
    if (row.bankCode !== "014") p.push(`bankCode ${row.bankCode}`);
    if (row.tenantId !== TA || row.unitId !== U.hotel || row.domain !== "HOTEL" || row.refType !== "HOTEL_DEPOSIT" || row.expectedSatang !== EXPECT) p.push("คอลัมน์หลักไม่ตรง input");
    const fa = await prisma.fileAsset.findUnique({ where: { id: row.fileId } });
    if (!fa) p.push("fileId ไม่ชี้ FileAsset");
    else {
      if (!String(fa.path).startsWith(`t/${TA}/private/`)) p.push(`path ${String(fa.path).slice(0, 30)}…`);
      if (!String(fa.cdnUrl).startsWith("private://")) p.push("cdnUrl ไม่ใช่ private://");
      if (fa.tenantId !== TA) p.push("FileAsset ร้านผิด");
    }
    if (!PUTS.some((x) => x.path === fa?.path && x.hash === sha(M1_DATA))) p.push("ไม่ได้อัปไบต์นี้ผ่าน deps.put");
    if (/https?:\/\/|private:\/\//.test(js(row))) p.push("แถวสลิปมี URL");
    if (/https?:\/\/|private:\/\/|\/private\//.test(js(M1))) p.push("ผลคืนมี URL/path ไฟล์");
  });
  await step("M-3", "replay: key เดิม + รูปเดิม ⇒ slipId เดิม replayed · ไม่มีแถว/ไฟล์/event เพิ่ม", async (p) => {
    if (M1?.ok !== true) { p.push("M-1 ไม่ผ่าน"); return; }
    const n0 = await rowsNow(); const p0 = PUTS.length; const e0 = (await evOf(M1.slipId)).length;
    const r = await submit(CTX_A, U.hotel, { input: { file: { data: M1_DATA, contentType: "image/png" }, idempotencyKey: M1_KEY, refId: M1_REF, qrPayload: slipQr("014", M1_TR) } });
    if (r?.ok !== true || r.slipId !== M1.slipId || r.replayed !== true) p.push(`→ ${codeOf(r)} slipId ${r?.slipId === M1.slipId ? "เดิม" : "ใหม่"} replayed ${js(r?.replayed)}`);
    if ((await rowsNow()) !== n0) p.push("มีแถวเพิ่ม");
    if (PUTS.length !== p0) p.push("อัปไฟล์ซ้ำ");
    if ((await evOf(M1.slipId)).length !== e0) p.push("มี event เพิ่ม");
  });
  await step("M-4", "key เดิม + รูปอื่น ⇒ IDEMPOTENCY_CONFLICT · ไม่มีแถว", async (p) => {
    p.push(...NEED());
    const n0 = await rowsNow();
    const r = await submit(CTX_A, U.hotel, { input: { idempotencyKey: M1_KEY } });
    if (!refused(r, "IDEMPOTENCY_CONFLICT")) p.push(`→ ${codeOf(r)}`);
    if ((await rowsNow()) !== n0) p.push("มีแถวเกิด");
  });

  // ═══════════════ D ซ้ำ ═══════════════
  out("\n— D สลิปซ้ำ (แฮช · เลขอ้างอิง · ข้ามสาขา · ข้ามร้าน · พร้อมกัน) —");
  await step("D-1", "รูปเดิม (คนละ key) ที่สาขาอื่นในร้านเดียวกัน ⇒ REJECTED [DUPLICATE_IMAGE] · ไม่เรียกตัวต่อ", async (p) => {
    p.push(...NEED());
    const c0 = await callLogs();
    const r = track(await subFake(U.barber, goodScript(), {}, { file: { data: M1_DATA, contentType: "image/png" } }));
    if (r?.ok !== true || r.status !== "REJECTED" || !hasReason(r, "DUPLICATE_IMAGE")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    if ((await callLogs()) !== c0) p.push("เรียกตัวต่อทั้งที่ซ้ำชัดเจน (เปลืองโควตา)");
  });
  await step("D-2", "เลขอ้างอิงใน QR ซ้ำ (รูปใหม่ · สาขาอื่น) ⇒ REJECTED [DUPLICATE_TRANSREF]", async (p) => {
    p.push(...NEED());
    const r = track(await submit(CTX_A, U.dorm, { input: { qrPayload: slipQr("002", M1_TR) } }));
    if (r?.ok !== true || r.status !== "REJECTED" || !hasReason(r, "DUPLICATE_TRANSREF")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
  });
  await step("D-3", "ข้ามร้านไม่ชน: ร้าน B ส่งรูปเดิม + QR เดิม ⇒ ไม่ใช่ซ้ำ (NEEDS_REVIEW [UNVERIFIED])", async (p) => {
    p.push(...NEED());
    const r = track(await submit(CTX_B, UB, { input: { file: { data: M1_DATA, contentType: "image/png" }, qrPayload: slipQr("014", M1_TR) } }));
    if (r?.ok !== true || r.status !== "NEEDS_REVIEW" || !sameSet(reasonsOf(r), ["UNVERIFIED"])) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    const row = r?.ok ? await slipRow(r.slipId) : null;
    if (row && row.tenantId !== TB) p.push("แถวไม่อยู่ร้าน B");
  });
  let D4_IDS: string[] = [];
  await step("D-4", "X3: รูปเดียวกัน 10 ทางพร้อมกัน (คนละ key · สลิปผ่านทุกข้อ) ⇒ AUTO_APPROVED 1 · REJECTED [DUPLICATE_IMAGE] 9 · ไม่มีใครโยน · approved event 1", async (p) => {
    p.push(...NEED());
    const data = png();
    const rs = await Promise.all(Array.from({ length: 10 }, () => subFake(U.barber, goodScript(), {}, { file: { data, contentType: "image/png" } })));
    rs.forEach(track);
    D4_IDS = rs.filter((r) => r?.ok).map((r) => r.slipId);
    const bad = rs.filter((r) => r?.ok !== true);
    if (bad.length) p.push(`ไม่ ok ${bad.length}: ${bad.map(codeOf).slice(0, 3).join(",")}`);
    const auto = rs.filter((r) => r?.status === "AUTO_APPROVED");
    const dup = rs.filter((r) => r?.status === "REJECTED" && hasReason(r, "DUPLICATE_IMAGE"));
    if (auto.length !== 1 || dup.length !== 9) p.push(`AUTO ${auto.length} · REJECTED-dup ${dup.length}`);
    const live = await prisma.paymentSlip.count({ where: { tenantId: TA, imageHash: sha(data), status: { not: "REJECTED" } } });
    if (live !== 1) p.push(`แถวไม่ใช่ REJECTED ${live}`);
    const appr = (await prisma.outboxEvent.findMany({ where: { tenantId: TA, type: "payment.slip.approved", createdAt: { gte: START } } }) as Any[]).filter((e) => D4_IDS.includes(e?.payload?.slipId));
    if (appr.length !== 1) p.push(`approved event ${appr.length}`);
  });
  await step("D-5", "X3: 10 รูปต่างกัน · ตัวต่อคืนเลขอ้างอิงเดียวกัน พร้อมกัน ⇒ ไม่ใช่ REJECTED 1 · REJECTED [DUPLICATE_TRANSREF] 9", async (p) => {
    p.push(...NEED());
    const tr = newTR();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => subFake([U.barber, U.massage, U.dorm][i % 3]!, goodScript({ transRef: tr }))));
    rs.forEach(track);
    const bad = rs.filter((r) => r?.ok !== true);
    if (bad.length) p.push(`ไม่ ok ${bad.length}: ${bad.map(codeOf).slice(0, 3).join(",")}`);
    const live = rs.filter((r) => r?.ok && r.status !== "REJECTED");
    const dup = rs.filter((r) => r?.status === "REJECTED" && hasReason(r, "DUPLICATE_TRANSREF"));
    if (live.length !== 1 || dup.length !== 9) p.push(`ไม่ใช่ REJECTED ${live.length} · REJECTED-dupRef ${dup.length}`);
    const n = await prisma.paymentSlip.count({ where: { tenantId: TA, transRef: tr, status: { not: "REJECTED" } } });
    if (n !== 1) p.push(`DB แถวไม่ใช่ REJECTED ที่ transRef นี้ ${n}`);
  });
  await step("D-6", "X3: key เดียวกัน + รูปเดียวกัน 10 ทางพร้อมกัน ⇒ slipId เดียวกันทั้งหมด · แถว 1 · submitted event 1", async (p) => {
    p.push(...NEED());
    const data = png(); const key = newKey(); const script = goodScript(); const refId = newRef();
    const p0 = PUTS.length;
    const rs = await Promise.all(Array.from({ length: 10 }, () => subFake(U.massage, script, {}, { file: { data, contentType: "image/png" }, idempotencyKey: key, refId })));
    D6_PUTS = PUTS.slice(p0).map((x) => x.path);
    rs.forEach(track);
    const ids = new Set(rs.filter((r) => r?.ok).map((r) => r.slipId));
    if (rs.some((r) => r?.ok !== true)) p.push(`ไม่ ok: ${rs.filter((r) => r?.ok !== true).map(codeOf).slice(0, 3).join(",")}`);
    if (ids.size !== 1) p.push(`slipId ${ids.size} ตัว`);
    const n = await prisma.paymentSlip.count({ where: { tenantId: TA, imageHash: sha(data) } });
    if (n !== 1) p.push(`แถว ${n}`);
    const [id] = [...ids];
    if (id && (await evOf(id, "payment.slip.submitted")).length !== 1) p.push("submitted event ไม่ใช่ 1");
  });

  // ═══════════════ A ตัวต่อผ่าน ═══════════════
  out("\n— A ตรวจในระบบ 5 ข้อ (FAKE ผ่าน) —");
  let A1: Any = null;
  await step("A-1", "สลิปผ่านทุกข้อ + autoApprove ⇒ AUTO_APPROVED reasons [] · checks.items 5 ข้อ OK/SKIP · verifierIntegrationId · call log 1", async (p) => {
    p.push(...NEED());
    const c0 = await callLogs();
    A1 = track(await subFake(U.dorm, goodScript()));
    if (A1?.ok !== true || A1.status !== "AUTO_APPROVED" || reasonsOf(A1).length) { p.push(`→ ${codeOf(A1)} ${js(A1?.reasons)}`); return; }
    const row = await slipRow(A1.slipId);
    const items = row?.checks?.items ?? {};
    if (!sameSet(Object.keys(items), ["amount", "transRef", "receiver", "age", "payerName"])) p.push(`checks.items ${js(Object.keys(items))}`);
    for (const [k, v] of Object.entries(items)) if (!["OK", "SKIP"].includes((v as Any)?.state)) p.push(`${k}.state ${(v as Any)?.state}`);
    if (row?.verifierIntegrationId !== created.intId) p.push("verifierIntegrationId ไม่ตรงแถวตัวต่อ");
    if (row?.amountSatang !== EXPECT) p.push(`amountSatang ${row?.amountSatang}`);
    if (!row?.transferredAt) p.push("ไม่เก็บ transferredAt");
    if ((await callLogs()) !== c0 + 1) p.push(`call log +${(await callLogs()) - c0} (คาด 1)`);
  });
  await step("A-2", "ผ่านทุกข้อแต่ autoApprove ปิด ⇒ PENDING · ไม่มี approved event", async (p) => {
    p.push(...NEED());
    const r = track(await subFake(U.dorm, goodScript(), { policy: { autoApprove: false } }));
    if (r?.ok !== true || r.status !== "PENDING" || reasonsOf(r).length) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    if (r?.ok && (await evOf(r.slipId, "payment.slip.approved")).length) p.push("มี approved event");
  });
  await step("A-3", "ไม่ส่ง policy (ค่าปริยาย autoApprove=false · ยังไม่มีแถวค่าตั้ง) ⇒ PENDING", async (p) => {
    p.push(...NEED());
    const r = track(await submit(CTX_A, U.barber, { input: { qrPayload: goodScript(), expectedPayerNames: [PAYER_EXPECT] }, deps: { policy: undefined } }));
    if (r?.ok !== true || r.status !== "PENDING") p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
  });
  await step("A-4", "ยอด: ขาด ฿62.32 ⇒ NEEDS_REVIEW [AMOUNT_SHORT] · เกิน ⇒ [AMOUNT_OVER] · tolerance ครอบ ⇒ AUTO_APPROVED", async (p) => {
    p.push(...NEED());
    const short = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 })));
    if (short?.status !== "NEEDS_REVIEW" || !hasReason(short, "AMOUNT_SHORT")) p.push(`ขาด → ${codeOf(short)} ${js(short?.reasons)}`);
    const over = track(await subFake(U.dorm, goodScript({ amountSatang: 560_000 })));
    if (over?.status !== "NEEDS_REVIEW" || !hasReason(over, "AMOUNT_OVER")) p.push(`เกิน → ${codeOf(over)} ${js(over?.reasons)}`);
    const tol = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 }), { policy: { autoApprove: true, toleranceSatang: 6_232 } }));
    if (tol?.status !== "AUTO_APPROVED") p.push(`tolerance พอดี → ${codeOf(tol)} ${js(tol?.reasons)}`);
    const tol2 = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 }), { policy: { autoApprove: true, toleranceSatang: 6_231 } }));
    if (tol2?.status !== "NEEDS_REVIEW" || !hasReason(tol2, "AMOUNT_SHORT")) p.push(`tolerance ขาด 1 สตางค์ → ${codeOf(tol2)}`);
  });
  await step("A-5", "ผู้รับ: เลขไม่ตรง ⇒ [RECEIVER_MISMATCH] · ตัวต่อไม่ส่งผู้รับ ⇒ NEEDS_REVIEW [DATA_MISSING]", async (p) => {
    p.push(...NEED());
    const other = RECV.replace(/\D/g, "").slice(-4) === "1357" ? "2468" : "1357";
    const r1 = track(await subFake(U.dorm, goodScript({ receiverMasked: `xxx-xxx-${other}` })));
    if (r1?.status !== "NEEDS_REVIEW" || !hasReason(r1, "RECEIVER_MISMATCH")) p.push(`ไม่ตรง → ${codeOf(r1)} ${js(r1?.reasons)}`);
    const r2 = track(await subFake(U.dorm, goodScript({ receiverMasked: undefined })));
    if (r2?.status !== "NEEDS_REVIEW" || !hasReason(r2, "DATA_MISSING")) p.push(`ไม่มีผู้รับ → ${codeOf(r2)} ${js(r2?.reasons)}`);
  });
  await step("A-6", "เวลาโอน: เก่า 73 ชม. (เพดาน 72) ⇒ [TOO_OLD] · 71 ชม. ⇒ ผ่าน · ล้ำอนาคต 1 ชม. ⇒ [FUTURE_TIME] · เพดาน 24 ⇒ 25 ชม. TOO_OLD", async (p) => {
    p.push(...NEED());
    const at = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
    const r1 = track(await subFake(U.dorm, goodScript({ transferredAt: at(73) })));
    if (r1?.status !== "NEEDS_REVIEW" || !hasReason(r1, "TOO_OLD")) p.push(`73 ชม. → ${codeOf(r1)} ${js(r1?.reasons)}`);
    const r2 = track(await subFake(U.dorm, goodScript({ transferredAt: at(71) })));
    if (r2?.status !== "AUTO_APPROVED") p.push(`71 ชม. → ${codeOf(r2)} ${js(r2?.reasons)}`);
    const r3 = track(await subFake(U.dorm, goodScript({ transferredAt: at(-1) })));
    if (r3?.status !== "NEEDS_REVIEW" || !hasReason(r3, "FUTURE_TIME")) p.push(`อนาคต → ${codeOf(r3)} ${js(r3?.reasons)}`);
    const r4 = track(await subFake(U.dorm, goodScript({ transferredAt: at(25) }), { policy: { autoApprove: true, maxAgeHours: 24 } }));
    if (r4?.status !== "NEEDS_REVIEW" || !hasReason(r4, "TOO_OLD")) p.push(`เพดาน 24 → ${codeOf(r4)}`);
  });
  await step("A-7", "ชื่อผู้โอน: WARN ไม่ตรง ⇒ AUTO_APPROVED + เตือน [PAYER_NAME_MISMATCH] · BLOCK ไม่ตรง ⇒ NEEDS_REVIEW · OFF ⇒ AUTO_APPROVED ไม่มีเหตุผล · BLOCK ตรงแบบธนาคารตัดนามสกุล ⇒ AUTO_APPROVED", async (p) => {
    p.push(...NEED());
    const wrong = goodScript({ payerName: "นาย สมชาย ใจดี" });
    const w = track(await subFake(U.dorm, wrong, { policy: { autoApprove: true, payerNameMatch: "WARN" } }));
    if (w?.status !== "AUTO_APPROVED" || !hasReason(w, "PAYER_NAME_MISMATCH")) p.push(`WARN → ${codeOf(w)} ${js(w?.reasons)}`);
    const b = track(await subFake(U.dorm, goodScript({ payerName: "นาย สมชาย ใจดี" }), { policy: { autoApprove: true, payerNameMatch: "BLOCK" } }));
    if (b?.status !== "NEEDS_REVIEW" || !hasReason(b, "PAYER_NAME_MISMATCH")) p.push(`BLOCK → ${codeOf(b)} ${js(b?.reasons)}`);
    const o = track(await subFake(U.dorm, goodScript({ payerName: "นาย สมชาย ใจดี" }), { policy: { autoApprove: true, payerNameMatch: "OFF" } }));
    if (o?.status !== "AUTO_APPROVED" || reasonsOf(o).length) p.push(`OFF → ${codeOf(o)} ${js(o?.reasons)}`);
    const t = track(await subFake(U.dorm, goodScript({ payerName: `MR ANAN ${SURNAME.slice(0, 1)}` }), { policy: { autoApprove: true, payerNameMatch: "BLOCK" } }));
    if (t?.status !== "AUTO_APPROVED") p.push(`BLOCK ตัดนามสกุล → ${codeOf(t)} ${js(t?.reasons)}`);
  });
  await step("A-8", "ผลตัวต่อ INVALID/DUPLICATE/UNKNOWN ⇒ NEEDS_REVIEW [VERIFIER_INVALID/VERIFIER_DUPLICATE/VERIFIER_UNKNOWN] (คนตัดสิน)", async (p) => {
    p.push(...NEED());
    for (const [st, reason] of [["INVALID", "VERIFIER_INVALID"], ["DUPLICATE", "VERIFIER_DUPLICATE"], ["UNKNOWN", "VERIFIER_UNKNOWN"]] as const) {
      const r = track(await subFake(U.dorm, goodScript({ status: st })));
      if (r?.status !== "NEEDS_REVIEW" || !hasReason(r, reason)) p.push(`${st} → ${codeOf(r)} ${js(r?.reasons)}`);
    }
  });
  await step("A-9", "ตัวต่อคืนเลขอ้างอิงที่เคยใช้ (สาขาอื่น) ⇒ REJECTED [DUPLICATE_TRANSREF]", async (p) => {
    p.push(...NEED());
    const prev = A1?.ok ? await slipRow(A1.slipId) : null;
    if (!prev?.transRef) { p.push("A-1 ไม่มี transRef"); return; }
    const r = track(await subFake(U.barber, goodScript({ transRef: prev.transRef })));
    if (r?.status !== "REJECTED" || !hasReason(r, "DUPLICATE_TRANSREF")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
  });

  // ═══════════════ O ตัวต่อล่ม ═══════════════
  out("\n— O ตัวต่อล่ม/หมดเวลา ⇒ ตาม onFailure —");
  await step("O-1", "FAKE FAIL + onFailure MANUAL ⇒ NEEDS_REVIEW [VERIFIER_DOWN] (ไม่ throw)", async (p) => {
    p.push(...NEED());
    const s = await setMode("FAIL", "MANUAL");
    if (s?.ok !== true) p.push(`ตั้ง mode → ${codeOf(s)}`);
    const r = track(await subFake(U.massage, goodScript()));
    if (r?.ok !== true || r.status !== "NEEDS_REVIEW" || !sameSet(reasonsOf(r), ["VERIFIER_DOWN"])) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
  });
  await step("O-2", "FAKE FAIL + onFailure REJECT ⇒ REJECTED [VERIFIER_DOWN] + rejected event", async (p) => {
    p.push(...NEED());
    const s = await setMode("FAIL", "REJECT");
    if (s?.ok !== true) p.push(`ตั้ง mode → ${codeOf(s)}`);
    const r = track(await subFake(U.massage, goodScript()));
    if (r?.ok !== true || r.status !== "REJECTED" || !hasReason(r, "VERIFIER_DOWN")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    if (r?.ok && (await evOf(r.slipId, "payment.slip.rejected")).length !== 1) p.push("rejected event ไม่ใช่ 1");
  });
  await step("O-3", "FAKE HANG + verifyTimeoutMs 300 + MANUAL ⇒ NEEDS_REVIEW [VERIFIER_DOWN] ภายใน 5 วิ (signal ถูก abort)", async (p) => {
    p.push(...NEED());
    const s = await setMode("HANG", "MANUAL");
    if (s?.ok !== true) p.push(`ตั้ง mode → ${codeOf(s)}`);
    const t0 = Date.now();
    const r = track(await subFake(U.massage, goodScript(), { verifyTimeoutMs: 300 }));
    const ms = Date.now() - t0;
    if (r?.ok !== true || r.status !== "NEEDS_REVIEW" || !hasReason(r, "VERIFIER_DOWN")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    if (ms > 5000) p.push(`ใช้เวลา ${ms} ms (ไม่เคารพ verifyTimeoutMs)`);
  });
  await step("W6", "ORACLE-EDIT W6: HANG + onFailure REJECT + หมดเวลา ⇒ ไม่สรุป = NEEDS_REVIEW [VERIFIER_DOWN] (REJECT ใช้เฉพาะ PROVIDER_ERROR · CC §2.3)", async (p) => {
    p.push(...NEED());
    const s = await setMode("HANG", "REJECT");
    if (s?.ok !== true) p.push(`ตั้ง mode → ${codeOf(s)}`);
    const r = track(await subFake(U.massage, goodScript(), { verifyTimeoutMs: 300 }));
    if (r?.ok !== true || r.status !== "NEEDS_REVIEW" || !hasReason(r, "VERIFIER_DOWN")) p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    if (r?.ok && (await evOf(r.slipId, "payment.slip.rejected")).length) p.push("มี rejected event");
  });
  {
    const back = await setMode("OK", "MANUAL");
    const r = await subFake(U.massage, goodScript());
    track(r);
    chk("O-4", "กลับ OK ⇒ ตัวต่อใช้ได้ต่อ (AUTO_APPROVED) — ล้ม 3 ครั้งไม่ปิดตัวต่อ", back?.ok === true && r?.status === "AUTO_APPROVED", `save ${codeOf(back)} · ${codeOf(r)} ${js(r?.reasons)}`, "MAJOR");
  }
  await step("O-5", "IntegrationCallLog ของตัวต่อ: มีทุกครั้งที่เรียก · ไม่มีชื่อผู้โอน/เลขอ้างอิง/ยอด", async (p) => {
    const logs = created.intId ? await prisma.integrationCallLog.findMany({ where: { integrationId: created.intId } }) : [];
    if (logs.length < 10) p.push(`call log ${logs.length} (คาด ≥ 10)`);
    const s = js(logs);
    if (PII_MARKS.some((m) => s.includes(m))) p.push("มีชื่อผู้โอน");
    if (s.includes(RAND.toUpperCase() + "TR")) p.push("มีเลขอ้างอิง");
  }, "MAJOR");

  // ═══════════════ P สิทธิ์ ═══════════════
  out("\n— P สิทธิ์ตัดสินสลิป (Membership สด) —");
  const pendDorm = track(await subFake(U.dorm, reviewScript())); // ORACLE-EDIT R0.6-W3 (เดิมยอดขาด — APPROVE ยอดขาดต้อง PARTIAL)
  const pendBarber = track(await subFake(U.barber, reviewScript()));
  const pendDormId: string = pendDorm?.slipId ?? "";
  const pendBarberId: string = pendBarber?.slipId ?? "";
  const reason = "ตรวจยอดกับบัญชีธนาคารแล้ว";
  await step("P-1", "fai (STAFF หอ ไม่มีคีย์) ⇒ PERMISSION_DENIED · อ้างตัวเป็น OWNER ใน actor ก็ไม่ได้ (อ่าน Membership สด)", async (p) => {
    p.push(...NEED());
    if (!pendDormId) { p.push("สร้างสลิปรอตรวจไม่ได้"); return; }
    const r1 = await decide(ACT.fai, CTX_A, pendDormId, { decision: "APPROVE", reason });
    if (!refused(r1, "PERMISSION_DENIED")) p.push(`fai → ${codeOf(r1)}`);
    const r2 = await decide(ACT.faiLies, CTX_A, pendDormId, { decision: "APPROVE", reason });
    if (!refused(r2, "PERMISSION_DENIED")) p.push(`fai อ้าง OWNER → ${codeOf(r2)}`);
    const r3 = await decide(ACT.nobody, CTX_A, pendDormId, { decision: "APPROVE", reason });
    if (!refused(r3, "PERMISSION_DENIED", "NOT_FOUND")) p.push(`ผู้ใช้ไม่มีสมาชิกภาพ → ${codeOf(r3)}`);
    if ((await slipRow(pendDormId))?.status !== "NEEDS_REVIEW") p.push("สถานะเปลี่ยน");
  });
  await step("P-2", "X1: เจ้าของร้าน B ⇒ NOT_FOUND (decide/queue/fileUrl) · ไม่มีข้อมูลหลุด", async (p) => {
    p.push(...NEED());
    const d = await decide(ACT.otherOwner, CTX_B, pendDormId, { decision: "REJECT", reason });
    if (!refused(d, "NOT_FOUND")) p.push(`decide ctx B → ${codeOf(d)}`);
    const d2 = await decide(ACT.otherOwner, CTX_A, pendDormId, { decision: "REJECT", reason });
    if (!refused(d2, "NOT_FOUND", "PERMISSION_DENIED")) p.push(`decide ctx A โดยเจ้าของร้าน B → ${codeOf(d2)}`);
    const q = await queue(ACT.otherOwner, CTX_B, { unitId: U.dorm });
    if (!refused(q, "NOT_FOUND")) p.push(`queue → ${codeOf(q)}`);
    const u = await fileUrl(ACT.otherOwner, CTX_B, pendDormId);
    if (!refused(u, "NOT_FOUND")) p.push(`fileUrl → ${codeOf(u)}`);
    if (js([d, q, u]).includes(pendDorm?.slipId ?? "∅") && js([d, q, u]).includes("refId")) p.push("คำปฏิเสธมีข้อมูลสลิป");
    if ((await slipRow(pendDormId))?.status !== "NEEDS_REVIEW") p.push("สถานะเปลี่ยน");
  });
  await step("P-3", "manager (barber+massage) ตัดสินสลิปหอไม่ได้ (PERMISSION_DENIED) · fai ได้คีย์ใน Membership ⇒ ตัดสินหอได้ แต่สลิป barber ไม่ได้", async (p) => {
    p.push(...NEED());
    const m = await decide(ACT.manager, CTX_A, pendDormId, { decision: "APPROVE", reason });
    if (!refused(m, "PERMISSION_DENIED", "NOT_FOUND")) p.push(`manager → หอ ${codeOf(m)}`);
    const mb = (await prisma.membership.findUnique({ where: { id: MB_FAI } })) as Any;
    if (!mb) { p.push("ไม่มี membership fai"); return; }
    created.faiPerm = mb.permissions; created.faiTouched = true;
    await prisma.membership.update({ where: { id: MB_FAI }, data: { permissions: { ...(mb.permissions ?? {}), "payments.slip.review": true } } });
    const fb = await decide(ACT.fai, CTX_A, pendBarberId, { decision: "APPROVE", reason });
    if (!refused(fb, "PERMISSION_DENIED", "NOT_FOUND")) p.push(`fai → barber ${codeOf(fb)}`);
    const fd = await decide(ACT.fai, CTX_A, pendDormId, { decision: "APPROVE", reason });
    if (fd?.ok !== true || fd.status !== "APPROVED") p.push(`fai (มีคีย์) → หอ ${codeOf(fd)}`);
  });
  await step("P-4", "manager ตัดสินสลิป barber ได้ (MANAGER เต็มสิทธิ์ในสาขาที่คุม)", async (p) => {
    p.push(...NEED());
    const r = await decide(ACT.manager, CTX_A, pendBarberId, { decision: "REJECT", reason: "ยอดไม่ครบ ขอให้โอนใหม่" });
    if (r?.ok !== true || r.status !== "REJECTED") p.push(`→ ${codeOf(r)}`);
  });

  // ═══════════════ K decideSlip ═══════════════
  out("\n— K ตัดสินสลิป —");
  await step("K-1", "APPROVE (NEEDS_REVIEW ผู้รับไม่ตรง · ยอดเต็ม) ⇒ APPROVED · decidedById/At · checks.decided · approved event ยอด = ยอดในสลิป · audit payments.slip.decide 1", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.dorm, reviewScript()));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    const r = await decide(ACT.owner, CTX_A, s.slipId, { decision: "APPROVE", reason });
    if (r?.ok !== true || r.status !== "APPROVED") { p.push(`→ ${codeOf(r)}`); return; }
    const row = await slipRow(s.slipId);
    if (row?.status !== "APPROVED" || row?.decidedById !== ACT.owner.userId || !row?.decidedAt) p.push(`แถว ${row?.status} ${row?.decidedById}`);
    if (row?.checks?.decided?.decision !== "APPROVE" || row?.checks?.decided?.amountSatang !== EXPECT) p.push(`checks.decided ${js(row?.checks?.decided)}`);
    const ev = await evOf(s.slipId, "payment.slip.approved");
    if (ev.length !== 1 || ev[0]?.payload?.amountSatang !== EXPECT || ev[0]?.payload?.status !== "APPROVED") p.push(`approved event ${js(ev.map((e) => e.payload))}`);
    const au = await prisma.auditLog.count({ where: { tenantId: TA, action: "payments.slip.decide", targetType: "PaymentSlip", targetId: s.slipId } });
    if (au !== 1) p.push(`audit ${au}`);
  });
  await step("K-2", "APPROVE_PARTIAL: ไม่มียอด/ยอด ≥ คาด/0/ทศนิยม ⇒ VALIDATION · ยอด 5,500.00 ⇒ APPROVED + event ยอด 550000", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 })));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    for (const a of [undefined, EXPECT, EXPECT + 1, 0, 100.5]) {
      const r = await decide(ACT.owner, CTX_A, s.slipId, { decision: "APPROVE_PARTIAL", amountSatang: a, reason });
      if (!refused(r, "VALIDATION")) p.push(`ยอด ${a} → ${codeOf(r)}`);
    }
    const ok = await decide(ACT.owner, CTX_A, s.slipId, { decision: "APPROVE_PARTIAL", amountSatang: 550_000, reason: "รับไว้ก่อน ยกยอดที่ขาดไปบิลหน้า" });
    if (ok?.ok !== true || ok.status !== "APPROVED") p.push(`→ ${codeOf(ok)}`);
    const ev = await evOf(s.slipId, "payment.slip.approved");
    if (ev.length !== 1 || ev[0]?.payload?.amountSatang !== 550_000) p.push(`event ${js(ev.map((e) => e.payload))}`);
    const row = await slipRow(s.slipId);
    if (row?.checks?.decided?.decision !== "APPROVE_PARTIAL" || row?.checks?.decided?.partial !== true) p.push(`checks.decided ${js(row?.checks?.decided)} (คาด partial: true · W3)`);
  });
  await step("K-3", "เหตุผลว่าง/ช่องว่าง/ยาว > 500 ⇒ VALIDATION · decision มั่ว ⇒ VALIDATION · REJECT ⇒ REJECTED + rejected event 1", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 })));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    for (const [lbl, inp] of [["ว่าง", { decision: "REJECT", reason: "" }], ["ช่องว่าง", { decision: "REJECT", reason: "   " }], ["ไม่ส่ง", { decision: "REJECT" }], ["ยาว", { decision: "REJECT", reason: "ก".repeat(501) }], ["decision มั่ว", { decision: "MAYBE", reason }]] as const) {
      const r = await decide(ACT.owner, CTX_A, s.slipId, inp);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const r = await decide(ACT.owner, CTX_A, s.slipId, { decision: "REJECT", reason: "ยอดไม่ตรงบิล" });
    if (r?.ok !== true || r.status !== "REJECTED") p.push(`→ ${codeOf(r)}`);
    if ((await evOf(s.slipId, "payment.slip.rejected")).length !== 1) p.push("rejected event ไม่ใช่ 1");
    if ((await evOf(s.slipId, "payment.slip.approved")).length) p.push("มี approved event");
  });
  await step("K-4", "INVALID_STATE: ตัดสินซ้ำ · AUTO_APPROVED · REJECTED (ซ้ำ) — ไม่มี event เพิ่ม", async (p) => {
    p.push(...NEED());
    const targets: [string, string][] = [];
    if (A1?.ok) targets.push(["AUTO_APPROVED", A1.slipId]);
    if (pendDormId) targets.push(["APPROVED แล้ว", pendDormId]);
    const dup = D4_IDS.length ? ((await prisma.paymentSlip.findFirst({ where: { id: { in: D4_IDS }, status: "REJECTED" } })) as Any) : null;
    if (dup) targets.push(["REJECTED ซ้ำ", dup.id]);
    if (targets.length < 3) p.push(`เตรียมได้ ${targets.length}/3`);
    for (const [lbl, id] of targets) {
      const e0 = (await evOf(id)).length;
      const r = await decide(ACT.owner, CTX_A, id, { decision: "APPROVE", reason });
      if (!refused(r, "INVALID_STATE")) p.push(`${lbl} → ${codeOf(r)}`);
      if ((await evOf(id)).length !== e0) p.push(`${lbl}: มี event เพิ่ม`);
    }
  });
  await step("K-5", "X3/X4: APPROVE 10 ทางพร้อมกัน ⇒ สำเร็จ 1 · INVALID_STATE 9 · approved event 1 · audit 1", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.dorm, reviewScript()));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    const rs = await Promise.all(Array.from({ length: 10 }, () => decide(ACT.owner, CTX_A, s.slipId, { decision: "APPROVE", reason })));
    const ok = rs.filter((r) => r?.ok === true).length;
    const inv = rs.filter((r) => refused(r, "INVALID_STATE")).length;
    if (ok !== 1 || inv !== 9) p.push(`ok ${ok} · INVALID_STATE ${inv} · อื่น ${rs.filter((r) => r?.ok !== true && !refused(r, "INVALID_STATE")).map(codeOf).slice(0, 2).join(",")}`);
    if ((await evOf(s.slipId, "payment.slip.approved")).length !== 1) p.push("approved event ไม่ใช่ 1");
    const au = await prisma.auditLog.count({ where: { action: "payments.slip.decide", targetId: s.slipId } });
    if (au !== 1) p.push(`audit ${au}`);
  });
  await step("K-6", "X3: APPROVE 5 + REJECT 5 พร้อมกัน ⇒ ชนะ 1 · สถานะสุดท้ายตรงผู้ชนะ · event ของผู้ชนะ 1 ของผู้แพ้ 0", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.dorm, reviewScript()));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => decide(ACT.owner, CTX_A, s.slipId, { decision: i % 2 ? "REJECT" : "APPROVE", reason })));
    const wins = rs.filter((r) => r?.ok === true);
    if (wins.length !== 1) { p.push(`ชนะ ${wins.length}`); return; }
    const row = await slipRow(s.slipId);
    if (row?.status !== wins[0].status) p.push(`แถว ${row?.status} ผู้ชนะ ${wins[0].status}`);
    const a = (await evOf(s.slipId, "payment.slip.approved")).length;
    const rj = (await evOf(s.slipId, "payment.slip.rejected")).length;
    if (wins[0].status === "APPROVED" ? a !== 1 || rj !== 0 : a !== 0 || rj !== 1) p.push(`approved ${a} · rejected ${rj}`);
  });

  // ═══════════════ QU คิว · U ไฟล์ ═══════════════
  out("\n— QU คิวตรวจ · U ลิงก์ไฟล์ชั่วคราว —");
  await step("QU-1", "slipQueue(owner, hotel) ค่าปริยาย = PENDING+NEEDS_REVIEW ของ hotel เท่านั้น · มี M-1 · ไม่มี URL/path/ชื่อเต็ม · payerName masked", async (p) => {
    p.push(...NEED());
    const r = await queue(ACT.owner, CTX_A, { unitId: U.hotel });
    if (r?.ok !== true || !Array.isArray(r.items)) { p.push(`→ ${codeOf(r)}`); return; }
    if (M1?.ok && !r.items.some((x: Any) => x?.id === M1.slipId)) p.push("ไม่มีสลิป M-1");
    for (const x of r.items) {
      if (!["PENDING", "NEEDS_REVIEW"].includes(x?.status)) p.push(`มีสถานะ ${x?.status}`);
      if (x?.unitId !== U.hotel) p.push(`มีสาขา ${x?.unitId}`);
    }
    const s = js(r);
    if (/https?:\/\/|private:\/\/|\/private\/|"path"|cdnUrl/.test(s)) p.push("มี URL/path ไฟล์");
    if (PII_MARKS.some((m) => s.includes(m))) p.push("มีชื่อเต็ม");
    const d = await queue(ACT.owner, CTX_A, { unitId: U.dorm });
    const masked = (d?.items ?? []).map((x: Any) => x?.payerName).filter(Boolean);
    if (!masked.includes(PAYER_MASKED)) p.push(`คิวหอไม่มี payerName "${PAYER_MASKED}" (${js(masked.slice(0, 3))})`);
    const keys = ["id", "unitId", "domain", "refType", "refId", "status", "reasons", "expectedSatang", "amountSatang", "payerName", "bankCode", "transferredAt", "createdAt", "hasFile"];
    const first = d?.items?.[0];
    if (first) for (const k of keys) if (!(k in first)) p.push(`SlipView ไม่มี ${k}`);
  });
  await step("QU-2", "status: \"REJECTED\" ⇒ เฉพาะ REJECTED · fai (คีย์ถูกถอนคืน) ⇒ PERMISSION_DENIED · manager ⇒ หอ PERMISSION_DENIED", async (p) => {
    p.push(...NEED());
    const r = await queue(ACT.owner, CTX_A, { unitId: U.dorm, status: "REJECTED" });
    if (r?.ok !== true || !r.items?.length || r.items.some((x: Any) => x?.status !== "REJECTED")) p.push(`REJECTED → ${codeOf(r)} ${r?.items?.length}`);
    if (created.faiTouched) await prisma.membership.update({ where: { id: MB_FAI }, data: { permissions: created.faiPerm as Any } });
    const f = await queue(ACT.fai, CTX_A, { unitId: U.dorm });
    if (!refused(f, "PERMISSION_DENIED")) p.push(`fai ไม่มีคีย์ → ${codeOf(f)}`);
    const m = await queue(ACT.manager, CTX_A, { unitId: U.dorm });
    if (!refused(m, "PERMISSION_DENIED", "NOT_FOUND")) p.push(`manager → ${codeOf(m)}`);
  });
  await step("U-1", "slipFileUrl(owner) ⇒ /api/files/<fileId>?exp&sig · อายุ ≤ 300 วิ · ลายเซ็นตรงผู้ดู STAFF:owner เท่านั้น", async (p) => {
    p.push(...NEED());
    if (M1?.ok !== true) { p.push("M-1 ไม่ผ่าน"); return; }
    const r = await fileUrl(ACT.owner, CTX_A, M1.slipId);
    if (r?.ok !== true) { p.push(`→ ${codeOf(r)}`); return; }
    const row = await slipRow(M1.slipId);
    const m = String(r.url).match(/^\/api\/files\/([^?]+)\?exp=(\d+)&sig=([0-9a-f]{64})$/);
    if (!m) { p.push(`url รูปแบบผิด ${String(r.url).slice(0, 60)}`); return; }
    if (decodeURIComponent(m[1]!) !== row?.fileId) p.push("fileId ใน url ไม่ตรงแถว");
    const ttl = Number(m[2]) - Math.floor(Date.now() / 1000);
    if (ttl > 300 || ttl < 1) p.push(`อายุ ${ttl} วิ`);
    if (LINKS?.privateFileSignatureOk) {
      if (!LINKS.privateFileSignatureOk(row?.fileId, m[2], m[3], { kind: "STAFF", id: ACT.owner.userId })) p.push("ลายเซ็นไม่ผ่านสำหรับ owner");
      if (LINKS.privateFileSignatureOk(row?.fileId, m[2], m[3], { kind: "STAFF", id: ACT.manager.userId })) p.push("ลายเซ็นผ่านสำหรับคนอื่น");
    }
  });
  await step("U-2", "slipFileUrl: fai ไม่มีคีย์ (สลิปหอ) ⇒ PERMISSION_DENIED · manager (สลิป hotel) ⇒ PERMISSION_DENIED", async (p) => {
    p.push(...NEED());
    const f = await fileUrl(ACT.fai, CTX_A, pendDormId);
    if (!refused(f, "PERMISSION_DENIED")) p.push(`fai → ${codeOf(f)}`);
    const m = M1?.ok ? await fileUrl(ACT.manager, CTX_A, M1.slipId) : null;
    if (!refused(m, "PERMISSION_DENIED", "NOT_FOUND")) p.push(`manager → ${codeOf(m)}`);
  });
  await step("U-3", "X10: ไม่มี URL ถาวร — แถว PaymentSlip ของรอบไม่มี http/private:// · FileAsset ของรอบเป็น private:// ทั้งหมด", async (p) => {
    const rows = (await prisma.paymentSlip.findMany({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: PFX } } })) as Any[];
    if (!rows.length) p.push("ไม่มีแถว");
    if (/https?:\/\/|private:\/\//.test(js(rows))) p.push("แถวสลิปมี URL");
    const fas = (await prisma.fileAsset.findMany({ where: { id: { in: rows.map((r) => r.fileId) } } })) as Any[];
    if (fas.length !== new Set(rows.map((r) => r.fileId)).size) p.push(`FileAsset ${fas.length} ไม่ครบ`);
    for (const f of fas) if (!String(f.cdnUrl).startsWith("private://") || !String(f.path).includes("/private/")) p.push(`ไฟล์ ${f.id} ไม่ส่วนตัว`);
  });

  // ═══════════════ E event ═══════════════
  out("\n— E event payment.slip.* —");
  await step("E-1", "ทุกสลิปของรอบมี submitted 1 ครั้ง · approved ≤ 1 · rejected ≤ 1 · ไม่มีทั้งคู่", async (p) => {
    const rows = (await prisma.paymentSlip.findMany({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: PFX } }, select: { id: true, status: true } })) as Any[];
    if (rows.length < 30) p.push(`สลิป ${rows.length} (คาด ≥ 30)`);
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS }, createdAt: { gte: START } } })) as Any[];
    for (const r of rows) {
      const mine = evs.filter((e) => e?.payload?.slipId === r.id);
      const n = (t: string) => mine.filter((e) => e.type === t).length;
      if (n("payment.slip.submitted") !== 1) p.push(`${r.id.slice(-6)} submitted ${n("payment.slip.submitted")}`);
      if (n("payment.slip.approved") > 1 || n("payment.slip.rejected") > 1 || (n("payment.slip.approved") && n("payment.slip.rejected"))) p.push(`${r.id.slice(-6)} approved ${n("payment.slip.approved")} rejected ${n("payment.slip.rejected")}`);
      if (["APPROVED", "AUTO_APPROVED"].includes(r.status) && n("payment.slip.approved") !== 1) p.push(`${r.id.slice(-6)} ${r.status} ไม่มี approved`);
      if (r.status === "REJECTED" && n("payment.slip.rejected") !== 1) p.push(`${r.id.slice(-6)} REJECTED ไม่มี rejected`);
      if (["PENDING", "NEEDS_REVIEW"].includes(r.status) && (n("payment.slip.approved") || n("payment.slip.rejected"))) p.push(`${r.id.slice(-6)} ${r.status} มี event ตัดสิน`);
    }
  });
  await step("E-2", "payload พอดี {slipId, domain, refType, refId, amountSatang, status} · tenantId/unitId ถูก · ไม่มี PII", async (p) => {
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS }, createdAt: { gte: START } } })) as Any[];
    if (!evs.length) p.push("ไม่มี event");
    const rows = new Map(((await prisma.paymentSlip.findMany({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: PFX } } })) as Any[]).map((r) => [r.id, r]));
    for (const e of evs) {
      const keys = Object.keys(e.payload ?? {}).sort().join(",");
      if (keys !== "amountSatang,domain,refId,refType,slipId,status") { p.push(`keys ${keys}`); continue; }
      const r = rows.get(e.payload.slipId);
      if (!r) { p.push("event ชี้สลิปที่ไม่ใช่ของรอบ"); continue; }
      if (e.tenantId !== r.tenantId || e.payload.domain !== r.domain || e.payload.refId !== r.refId) p.push(`event ${e.type} ไม่ตรงแถว`);
    }
    const s = js(evs);
    if (PII_MARKS.some((m) => s.includes(m)) || s.includes("ANAN")) p.push("มีชื่อผู้โอน");
  });

  // ═══════════════ N ไม่มีผลเงิน ═══════════════
  out("\n— N ไม่มีผลเงิน —");
  await step("N-1", "ตารางเงิน POS/บัญชี (journal · ใบรับชำระ · มัดจำ · ชำระ POS · สลิป POS) ของร้าน QC ไม่ขยับ", async (p) => {
    const now = await moneyCounts();
    for (const [k, v] of Object.entries(now)) if (v !== MONEY0[k]) p.push(`${k}: ${MONEY0[k]} → ${v}`);
  });

  // ═══════════════ ST ค่าตั้ง (R0.3) ═══════════════
  out("\n— ST ค่าตั้ง payments.* (ต้องมี R0.3) —");
  if (!SETTINGS_READY) {
    const w = "R0.3 (src/lib/core/settings + defs/payments.ts) ยังไม่ลง — ผู้คุมรันซ้ำหลัง merge R0.3";
    skip("ST-1", "payments.receiver ระดับสาขา (massage) ชนะ PaymentProfile · สาขาอื่นยังได้ของร้าน", w, "CRITICAL", true);
    skip("ST-2", "payments.receiver {paymentProfileId: ของร้าน B} ⇒ ไม่นับ (ได้ของร้าน A)", w, "CRITICAL", true);
    skip("ST-3", "ค่าตั้ง autoApprove+toleranceSatang ระดับสาขาหอ มีผลเมื่อไม่ส่ง deps.policy", w, "CRITICAL", true);
  } else {
    const sv = async (unitId: string, key: string, value: unknown) => {
      const r = (await prisma.settingValue.create({ data: { tenantId: TA, key, scope: "UNIT", scopeId: unitId, value: value as Any, setById: "svc-r06" } })) as Any;
      created.settingIds.push(r.id);
    };
    // ORACLE-EDIT R0.6-ST: ค่าตั้งของแต่ละข้อ ST ลบทันทีเมื่อจบข้อ (ไม่รอ finally) — กันค้างไปกระทบกลุ่ม W (W3 · builder รายงาน 28 ต.ค.)
    const clearSv = async () => {
      if (created.settingIds.length) await prisma.settingValue.deleteMany({ where: { id: { in: created.settingIds } } });
      created.settingIds = [];
    };
    const stepST = async (id: string, name: string, fn: (p: string[]) => Promise<void>) => {
      try { await step(id, name, fn); } finally { await clearSv(); }
    };
    await stepST("ST-1", "payments.receiver ระดับสาขา (massage) ชนะ PaymentProfile · สาขาอื่นยังได้ของร้าน", async (p) => {
      if (!RC) { p.push("ไม่มี receiver"); return; }
      await sv(U.massage, "payments.receiver", { promptpayId: "0899990606", displayName: "svc-r06 นวด" });
      const m = await call(RC, "receiverFor", CTX_A, U.massage);
      if (m?.promptpayId !== "0899990606") p.push(`massage → ${js(m).slice(0, 80)}`);
      const b = await call(RC, "receiverFor", CTX_A, U.barber);
      if (b?.promptpayId !== RECV) p.push(`barber → ${js(b).slice(0, 80)}`);
    });
    await stepST("ST-2", "payments.receiver {paymentProfileId: ของร้าน B} ⇒ ไม่นับ (ได้ของร้าน A)", async (p) => {
      if (!RC) { p.push("ไม่มี receiver"); return; }
      let ppB = (await prisma.paymentProfile.findUnique({ where: { tenantId: TB } })) as Any;
      if (!ppB) { ppB = await prisma.paymentProfile.create({ data: { tenantId: TB, promptpayId: "0811110606", displayName: `svc-r06 B ${RAND}` } }); created.payB = "created"; }
      await sv(U.hotel, "payments.receiver", { paymentProfileId: ppB.id });
      const h = await call(RC, "receiverFor", CTX_A, U.hotel);
      if (h?.promptpayId !== RECV) p.push(`hotel → ${js(h).slice(0, 80)} (คาดของร้าน A)`);
    });
    await stepST("ST-3", "ค่าตั้ง autoApprove+toleranceSatang ระดับสาขาหอ มีผลเมื่อไม่ส่ง deps.policy", async (p) => {
      p.push(...NEED());
      await sv(U.dorm, "payments.slip.autoApprove", true);
      await sv(U.dorm, "payments.slip.toleranceSatang", 10_000);
      const r = track(await submit(CTX_A, U.dorm, { input: { qrPayload: goodScript({ amountSatang: 550_000 }), expectedPayerNames: [PAYER_EXPECT] }, deps: { policy: undefined } }));
      if (r?.status !== "AUTO_APPROVED") p.push(`→ ${codeOf(r)} ${js(r?.reasons)}`);
    });
  }

  // ═══════════════ W มติหลังผู้ตรวจ 28 ต.ค. (ORACLE-EDIT R0.6-W1..W9) ═══════════════
  out("\n— W มติหลังผู้ตรวจ 28 ต.ค. —");
  await step("W1", "ORACLE-EDIT W1 [BLOCKER]: manager ถูกถอนสิทธิ์ (Membership.acceptedAt = null) ⇒ decideSlip/slipQueue/slipFileUrl = PERMISSION_DENIED · คืนแล้วใช้ได้ (positive control)", async (p) => {
    p.push(...NEED());
    const s = track(await subFake(U.barber, reviewScript()));
    if (s?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(s)}`); return; }
    const mb = (await prisma.membership.findUnique({ where: { id: MB_MGR } })) as Any;
    if (!mb?.acceptedAt) { p.push("membership manager ไม่มี acceptedAt (seed)"); return; }
    created.mgrAccepted = mb.acceptedAt; created.mgrTouched = true;
    await prisma.membership.update({ where: { id: MB_MGR }, data: { acceptedAt: null } });
    try {
      const d = await decide(ACT.manager, CTX_A, s.slipId, { decision: "APPROVE", reason });
      if (!refused(d, "PERMISSION_DENIED")) p.push(`decide → ${codeOf(d)}`);
      const q = await queue(ACT.manager, CTX_A, { unitId: U.barber });
      if (!refused(q, "PERMISSION_DENIED")) p.push(`queue → ${codeOf(q)}`);
      const u = await fileUrl(ACT.manager, CTX_A, s.slipId);
      if (!refused(u, "PERMISSION_DENIED")) p.push(`fileUrl → ${codeOf(u)}`);
      if ((await slipRow(s.slipId))?.status !== "NEEDS_REVIEW") p.push("สถานะเปลี่ยนทั้งที่ถูกถอนสิทธิ์");
    } finally {
      await prisma.membership.update({ where: { id: MB_MGR }, data: { acceptedAt: created.mgrAccepted as Any } });
    }
    const q2 = await queue(ACT.manager, CTX_A, { unitId: U.barber });
    if (q2?.ok !== true) p.push(`คืนสิทธิ์แล้ว queue → ${codeOf(q2)} (positive control)`);
  });
  await step("W1s", "ORACLE-EDIT W1: ทุกจุดอ่าน Membership ใน core/settings · core/integrations · payment · modules/rooms กรอง acceptedAt (ถอนสิทธิ์ = ไม่นับ)", async (p) => {
    const files = ["src/lib/core/settings", "src/lib/core/integrations", "src/lib/payment", "src/lib/modules/rooms"].flatMap((d) => listTs(d));
    let n = 0;
    for (const f of files) {
      const lines = read(f).split("\n");
      lines.forEach((ln, i) => {
        if (!/\bmembership\.(findUnique|findFirst|findMany|count)\s*\(/.test(ln)) return;
        n++;
        const win = lines.slice(i, i + 8).join("\n");
        if (!/acceptedAt/.test(win)) p.push(`${f}:${i + 1} ไม่กรอง acceptedAt`);
      });
    }
    if (n === 0) p.push("ไม่พบจุดอ่าน Membership เลย (คาดอย่างน้อย slip-verify + settings/service)");
  });
  await step("W2", "ORACLE-EDIT W2: replay key+รูปเดิม แต่ refId/expectedSatang/unitId(domain) ต่าง ⇒ IDEMPOTENCY_CONFLICT · ตรงทุกช่อง ⇒ replayed", async (p) => {
    p.push(...NEED());
    const data = png(); const key = newKey(); const refId = newRef(); const script = goodScript();
    const base = track(await subFake(U.dorm, script, {}, { file: { data, contentType: "image/png" }, idempotencyKey: key, refId }));
    if (base?.ok !== true) { p.push(`เตรียม → ${codeOf(base)}`); return; }
    const n0 = await rowsNow();
    const variants: [string, string, Any][] = [
      ["refId ต่าง", U.dorm, { refId: newRef() }],
      ["expectedSatang ต่าง", U.dorm, { refId, expectedSatang: EXPECT + 100 }],
      ["unitId/domain ต่าง", U.hotel, { refId }],
    ];
    for (const [lbl, unit, over] of variants) {
      const r = await subFake(unit, script, {}, { file: { data, contentType: "image/png" }, idempotencyKey: key, ...over });
      if (!refused(r, "IDEMPOTENCY_CONFLICT")) p.push(`${lbl} → ${codeOf(r)}${r?.slipId === base.slipId ? " (คืนแถวเดิม)" : ""}`);
    }
    const same = await subFake(U.dorm, script, {}, { file: { data, contentType: "image/png" }, idempotencyKey: key, refId });
    if (same?.ok !== true || same.slipId !== base.slipId || same.replayed !== true) p.push(`ตรงทุกช่อง → ${codeOf(same)} replayed ${js(same?.replayed)}`);
    if ((await rowsNow()) !== n0) p.push("มีแถวเพิ่ม");
  });
  await step("W3", "ORACLE-EDIT W3: APPROVE ยอด ≤ max(expected, ยอดสลิป)+tolerance · เกิน ⇒ VALIDATION · APPROVE ต่ำกว่า expected (ไม่ใช่ PARTIAL) ⇒ VALIDATION", async (p) => {
    p.push(...NEED());
    const over = track(await subFake(U.dorm, reviewScript({ amountSatang: 560_000 })));
    if (over?.status !== "NEEDS_REVIEW") { p.push(`เตรียมสลิปเกิน → ${codeOf(over)}`); return; }
    for (const a of [560_001, 1_000_000]) {
      const r = await decide(ACT.owner, CTX_A, over.slipId, { decision: "APPROVE", amountSatang: a, reason });
      if (!refused(r, "VALIDATION")) p.push(`APPROVE ${a} บนสลิป 560000 → ${codeOf(r)}`);
    }
    const low = await decide(ACT.owner, CTX_A, over.slipId, { decision: "APPROVE", amountSatang: EXPECT - 1, reason });
    if (!refused(low, "VALIDATION")) p.push(`APPROVE ต่ำกว่า expected → ${codeOf(low)}`);
    const ok = await decide(ACT.owner, CTX_A, over.slipId, { decision: "APPROVE", amountSatang: 560_000, reason });
    if (ok?.ok !== true) p.push(`APPROVE 560000 → ${codeOf(ok)} (positive control)`);
    const ev = await evOf(over.slipId, "payment.slip.approved");
    if (ev.length !== 1 || ev[0]?.payload?.amountSatang !== 560_000) p.push(`event ${js(ev.map((e) => e.payload))}`);
    const short = track(await subFake(U.dorm, goodScript({ amountSatang: 550_000 })));
    if (short?.status !== "NEEDS_REVIEW") { p.push(`เตรียมสลิปขาด → ${codeOf(short)}`); return; }
    const r2 = await decide(ACT.owner, CTX_A, short.slipId, { decision: "APPROVE", reason });
    if (!refused(r2, "VALIDATION")) p.push(`APPROVE สลิปขาดไม่ระบุยอด → ${codeOf(r2)}`);
    if ((await evOf(short.slipId, "payment.slip.approved")).length) p.push("สลิปขาดมี approved event");
  });
  await step("W4", "ORACLE-EDIT W4: ทางมือ (ไม่มีตัวต่อ/QR) 2 สลิปไบต์ต่าง · APPROVE ไม่ส่ง transRef ⇒ VALIDATION · transRef เดียวกัน (\"X-1\" vs \"x1\") อนุมัติได้ใบเดียว ⇒ ใบสอง DUPLICATE", async (p) => {
    p.push(...NEED());
    const a = track(await submit(CTX_A, U.hotel));
    const b = track(await submit(CTX_A, U.hotel));
    if (a?.status !== "NEEDS_REVIEW" || b?.status !== "NEEDS_REVIEW") { p.push(`เตรียม → ${codeOf(a)} / ${codeOf(b)}`); return; }
    const tr = `W4${RAND}-ab-1`;
    const canon = tr.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const r0 = await decide(ACT.owner, CTX_A, a.slipId, { decision: "APPROVE", reason });
    if (!refused(r0, "VALIDATION")) p.push(`ไม่ส่ง transRef → ${codeOf(r0)}`);
    const r1 = await decide(ACT.owner, CTX_A, a.slipId, { decision: "APPROVE", reason, transRef: tr });
    if (r1?.ok !== true) p.push(`ใบแรก → ${codeOf(r1)}`);
    if ((await slipRow(a.slipId))?.transRef !== canon) p.push(`ใบแรก transRef ${(await slipRow(a.slipId))?.transRef} (คาด ${canon})`);
    const r2 = await decide(ACT.owner, CTX_A, b.slipId, { decision: "APPROVE", reason, transRef: canon.toLowerCase() });
    if (!refused(r2, "DUPLICATE")) p.push(`ใบสอง transRef ซ้ำ → ${codeOf(r2)} (คาด DUPLICATE)`);
    const rowB = await slipRow(b.slipId);
    if (rowB?.status !== "NEEDS_REVIEW") p.push(`ใบสองสถานะ ${rowB?.status}`);
    if ((await evOf(b.slipId, "payment.slip.approved")).length) p.push("ใบสองมี approved event");
    const live = await prisma.paymentSlip.count({ where: { tenantId: TA, transRef: canon, status: { not: "REJECTED" } } });
    if (live !== 1) p.push(`แถวไม่ใช่ REJECTED ที่ transRef นี้ ${live}`);
    const rj = await decide(ACT.owner, CTX_A, b.slipId, { decision: "REJECT", reason: "สลิปซ้ำกับใบที่อนุมัติแล้ว" });
    if (rj?.ok !== true) p.push(`REJECT ไม่ต้องมี transRef → ${codeOf(rj)}`);
  });
  await step("W4b", "ORACLE-EDIT W4: ตัวต่อ INVALID/UNKNOWN ที่ส่ง transRef มา ⇒ แถวเก็บ transRef (canonical) ไว้กันใช้ซ้ำ", async (p) => {
    p.push(...NEED());
    for (const st of ["INVALID", "UNKNOWN"]) {
      const tr = newTR();
      const r = track(await subFake(U.dorm, goodScript({ status: st, transRef: tr })));
      if (r?.status !== "NEEDS_REVIEW") { p.push(`${st} → ${codeOf(r)}`); continue; }
      const row = await slipRow(r.slipId);
      if (row?.transRef !== tr) p.push(`${st}: transRef ${js(row?.transRef)} (คาด ${tr})`);
    }
  });
  await step("W5", "ORACLE-EDIT W5: transRef canonical (ตัวใหญ่ · เหลือ A-Z0-9): QR \"r6…-abc-123\" เก็บ \"R6…ABC123\" · ใบถัดไป QR ตัวใหญ่ไม่มีขีด ⇒ DUPLICATE_TRANSREF · ตัวต่อคืนตัวเล็กมีขีด ⇒ ซ้ำด้วย", async (p) => {
    p.push(...NEED());
    const raw = `r6${RAND}-abc-123`;
    const canon = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const q = callSync(SV, "parseSlipQr", slipQr("014", raw));
    if (q?.transRef !== canon) p.push(`parseSlipQr → ${js(q)} (คาด transRef ${canon})`);
    const a = track(await submit(CTX_A, U.hotel, { input: { qrPayload: slipQr("014", raw) } }));
    if (a?.ok !== true) { p.push(`ใบแรก → ${codeOf(a)}`); return; }
    if ((await slipRow(a.slipId))?.transRef !== canon) p.push(`ใบแรก transRef ${(await slipRow(a.slipId))?.transRef}`);
    const b = track(await submit(CTX_A, U.hotel, { input: { qrPayload: slipQr("014", canon) } }));
    if (b?.status !== "REJECTED" || !hasReason(b, "DUPLICATE_TRANSREF")) p.push(`QR ตัวใหญ่ → ${codeOf(b)} ${js(b?.reasons)}`);
    const c = track(await subFake(U.dorm, goodScript({ transRef: `${canon.slice(0, 4).toLowerCase()}-${canon.slice(4).toLowerCase()}` })));
    if (c?.status !== "REJECTED" || !hasReason(c, "DUPLICATE_TRANSREF")) p.push(`ตัวต่อตัวเล็กมีขีด → ${codeOf(c)} ${js(c?.reasons)}`);
  });
  await step("W7", "ORACLE-EDIT W7: ผู้ให้บริการไม่ประกาศ capabilities.checksReceiver ⇒ ไม่อนุมัติอัตโนมัติ (PENDING) แม้ตั้งเปิด · FAKE ประกาศ true", async (p) => {
    p.push(...NEED());
    const FK: Any = await tryImport("@/lib/core/integrations/providers/fake");
    const def = FK?.FAKE_PROVIDER;
    if (!def) { p.push("โหลด FAKE_PROVIDER ไม่ได้"); return; }
    if (def.capabilities?.checksReceiver !== true) p.push(`FAKE capabilities ${js(def.capabilities)} (คาด { checksReceiver: true })`);
    created.capPrev = def.capabilities; created.capTouched = true;
    try {
      def.capabilities = { ...(def.capabilities ?? {}), checksReceiver: false };
      const r = track(await subFake(U.dorm, goodScript()));
      if (r?.ok !== true || r.status === "AUTO_APPROVED") p.push(`checksReceiver false → ${codeOf(r)} (ห้าม AUTO_APPROVED)`);
      else if (r.status !== "PENDING") p.push(`checksReceiver false → ${r.status} ${js(r.reasons)} (คาด PENDING)`);
    } finally {
      def.capabilities = created.capPrev; created.capTouched = false;
    }
    const ok = track(await subFake(U.dorm, goodScript()));
    if (ok?.status !== "AUTO_APPROVED") p.push(`คืน capability → ${codeOf(ok)} (positive control)`);
  });
  await step("W8", "ORACLE-EDIT W8: ไม่มีไฟล์ค้าง — ทุกวัตถุที่อัป (deps.put) มี FileAsset อยู่ หรือถูกลบด้วย deps.del · ผู้แพ้ replay ใน D-6 ถูกลบ (FileAsset ของรอบนั้นเหลือ 1)", async (p) => {
    if (!PUTS.length) { p.push("ไม่มีการอัปให้ตรวจ"); return; }
    const rows = (await prisma.fileAsset.findMany({ where: { path: { in: PUTS.map((x) => x.path) } }, select: { path: true } })) as Any[];
    const live = new Set(rows.map((r) => r.path));
    const dels = new Set(DELS);
    const orphan = PUTS.filter((x) => !live.has(x.path) && !dels.has(x.path));
    if (orphan.length) p.push(`วัตถุค้าง (ไม่มีแถว · ไม่ถูกลบ) ${orphan.length}`);
    const both = PUTS.filter((x) => live.has(x.path) && dels.has(x.path));
    if (both.length) p.push(`ลบวัตถุแต่แถวยังอยู่ ${both.length}`);
    if (D6_PUTS.length > 1) {
      const kept = D6_PUTS.filter((x) => live.has(x)).length;
      if (kept !== 1) p.push(`D-6 อัป ${D6_PUTS.length} เหลือแถว ${kept} (คาด 1)`);
    }
  });
  await step("W9", "ORACLE-EDIT W9: slip-shared.ts ไม่ import ฝั่ง server · มี SLIP_REASON_TH ป้ายไทยทุกเหตุผล · slip-verify re-export pure", async (p) => {
    const f = "src/lib/payment/slip-shared.ts";
    const s = read(f);
    if (!s) { p.push(`ไม่มี ${f}`); return; }
    const imps = [...s.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2] ?? "");
    for (const m of imps) if (/(core\/db|prisma|storage\/service|core\/integrations(?!\/types)|core\/settings(?!\/types)|next\/|server-only|node:|modules\/)/.test(m)) p.push(`import ${m}`);
    if (/["']use server["']/.test(s)) p.push("มี use server");
    const SH: Any = await tryImport("@/lib/payment/slip-shared");
    const th = SH?.SLIP_REASON_TH;
    if (!th || typeof th !== "object") { p.push("ไม่มี SLIP_REASON_TH"); return; }
    for (const r of ALL_REASONS) if (typeof th[r] !== "string" || !/[฀-๿]/.test(th[r])) p.push(`ไม่มีป้ายไทย ${r}`);
    for (const n of ["parseSlipQr", "maskPayerName", "payerNameMatches", "receiverMatches"]) {
      if (typeof SH?.[n] !== "function") p.push(`slip-shared ไม่มี ${n}`);
      else if (SV && SV[n] !== SH[n]) p.push(`slip-verify.${n} ไม่ใช่ตัวเดียวกับ slip-shared (re-export)`);
    }
  });

  // ═══════════════ Z PII ═══════════════
  out("\n— Z PII · สแกนรั่ว —");
  await step("Z-1", "payerName เก็บ masked เท่านั้น · verifierResult คีย์ในรายการอนุญาต (ไม่มีชื่อ/รูป)", async (p) => {
    const rows = (await prisma.paymentSlip.findMany({ where: { tenantId: TA, refId: { startsWith: PFX }, verifierIntegrationId: { not: null } } })) as Any[];
    if (!rows.length) p.push("ไม่มีแถวที่ผ่านตัวต่อ");
    for (const r of rows) {
      if (r.payerName !== null && r.payerName !== PAYER_MASKED && r.payerName !== "สมชาย ใ." && r.payerName !== "ANAN Z.") p.push(`payerName ${js(r.payerName)}`);
      if (r.verifierResult && typeof r.verifierResult === "object") for (const k of Object.keys(r.verifierResult)) if (!VERIFIER_RESULT_KEYS.has(k)) p.push(`verifierResult มี ${k}`);
    }
    const a1 = A1?.ok ? await slipRow(A1.slipId) : null;
    if (a1 && a1.payerName !== PAYER_MASKED) p.push(`A-1 payerName ${js(a1.payerName)} (คาด ${PAYER_MASKED})`);
  });
  await step("Z-2", "ชื่อเต็ม/นามสกุลไม่อยู่ใน PaymentSlip · OutboxEvent · IntegrationCallLog · AuditLog · OpsEvent · console · ผลคืน", async (p) => {
    const sources: [string, unknown][] = [
      ["PaymentSlip", await prisma.paymentSlip.findMany({ where: { tenantId: { in: [TA, TB] }, refId: { startsWith: PFX } } })],
      ["OutboxEvent", await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } })],
      ["IntegrationCallLog", await prisma.integrationCallLog.findMany({ where: { tenantId: { in: [TA, TB] }, at: { gte: START } } })],
      ["AuditLog", await prisma.auditLog.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } })],
      ["OpsEvent", await prisma.opsEvent.findMany({ where: { createdAt: { gte: START } } })],
      ["console", CAPTURED.join("\n")],
      ["ผลคืน", RESULTS],
    ];
    for (const [lbl, v] of sources) {
      const s = js(v);
      if (PII_MARKS.some((m) => s.includes(m))) p.push(lbl);
      if (/ใจดี/.test(s)) p.push(`${lbl} (ใจดี)`);
    }
  });
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
  try {
    if (created.faiTouched) await prisma.membership.update({ where: { id: MB_FAI }, data: { permissions: created.faiPerm as Any } });
    if (created.mgrTouched) await prisma.membership.update({ where: { id: MB_MGR }, data: { acceptedAt: created.mgrAccepted as Any } });
    if (created.capTouched) { const FK: Any = await tryImport("@/lib/core/integrations/providers/fake"); if (FK?.FAKE_PROVIDER) FK.FAKE_PROVIDER.capabilities = created.capPrev; }
    await cleanup();
    if (created.payA === "created") await prisma.paymentProfile.deleteMany({ where: { tenantId: TA, displayName: `svc-r06 ${RAND}` } });
    if (created.payA === "patched") await prisma.paymentProfile.update({ where: { tenantId: TA }, data: created.payAPrev });
    if (created.payB === "created") await prisma.paymentProfile.deleteMany({ where: { tenantId: TB, displayName: `svc-r06 B ${RAND}` } });
    const left = (await prisma.paymentSlip.count({ where: { refId: { startsWith: "svc-r06-" } } }))
      + (await prisma.tenantIntegration.count({ where: { label: { startsWith: "svc-r06-" } } }))
      + (await prisma.outboxEvent.count({ where: { tenantId: { in: [TA, TB] }, type: { in: EVENTS } } }))
      + (await prisma.fileAsset.count({ where: { path: { in: PUTS.map((x) => x.path) } } }))
      + (await prisma.settingValue.count({ where: { setById: "svc-r06" } }));
    const mb = created.faiTouched ? ((await prisma.membership.findUnique({ where: { id: MB_FAI } })) as Any) : null;
    const mgr = created.mgrTouched ? ((await prisma.membership.findUnique({ where: { id: MB_MGR } })) as Any) : null;
    const mbOk = (!created.faiTouched || js(mb?.permissions) === js(created.faiPerm)) && (!created.mgrTouched || js(mgr?.acceptedAt) === js(created.mgrAccepted));
    chk("Z-3", "ทำความสะอาด: ไม่เหลือสลิป/ตัวต่อ/event/ไฟล์/ค่าตั้ง svc-r06 · membership fai คืนเดิม", left === 0 && mbOk, `เหลือ ${left} · membership ${mbOk ? "คืนแล้ว" : "ไม่ตรงเดิม"}`, "MAJOR");
  } catch (e) {
    chk("Z-3", "ทำความสะอาด", false, errMsg(e), "MAJOR");
  }
  await prisma.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const blockingSkip = skipped.filter((c) => !c.allowSkip);
const passed = cks.length - failed.length - skipped.length;
out(`\n===== QC SVC R0.6 · QR + ตรวจสลิปกลาง =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length}${skipped.length > blockingSkip.length ? ` · ยอมได้ ${skipped.length - blockingSkip.length}: รอ R0.3 / ร้าน B มีผู้รับ` : ""})` : ""}`);
out(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), allowedSkip: skipped.filter((c) => c.allowSkip).map((c) => c.id), findings: [...failed, ...blockingSkip].map((c) => c.id) })}`);
// รับใบ = ไม่มี FAIL และไม่มี SKIP นอกจาก ST-* (รอ R0.3) / R-4 (ร้าน B มีผู้รับอยู่แล้ว)
process.exit(failed.length + blockingSkip.length > 0 ? 1 : 0);
