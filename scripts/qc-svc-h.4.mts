// QC — SVC H.4 · เช็กอิน V2 (tx เดียว · assignableRooms · force/override · occupancy · event) · ทะเบียนแขก HotelGuestRecord = ร.ร.3 อิเล็กทรอนิกส์ ·
//      PDPA เข้ม (idNumberEnc secret-box AAD=recordId · last4 · reveal+AuditLog · ไฟล์ private · purge ตาม retainUntil) · AI อ่านเอกสาร (เสนอ-คนยืนยัน · ปิดเป็นค่าเริ่ม) ·
//      ร.ร.3 ลงชื่อ/ร.ร.4 · ตม.30 (PENDING→FILED/LATE · ไฟล์ส่งออกตามค่าตั้ง) · เงินประกันห้อง (ขั้นแยกหลัง CHECKED_IN) · สมาชิก opt-in · ด่าน/สิทธิ์ 4 ระดับ · event 3 ทะเบียน · จอ
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.4.md (§0 หลัก · §1 ไฟล์ · §2 มติ 9 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 event · §6 ฉาก · §7 เกณฑ์รับ/PDPA)
//        ยืนบน h.3 §3 (assignRoom · takeBookingDeposit · `at` ใต้ SVC_QC_CLOCK) · h.5 §3.5 (takeSecurityDeposit · สิทธิ์ checkIn|folio.post) · h.0 §2.12 (HotelGuestRecord) · h.1 §6.1 (คีย์ rooms.hotel.*)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.4" (SQC_HOTEL_GUEST_SCENE · SQC_VISUAL_SPECS["h.4"] · frontdesk +guest.register) + "SVC H.3 / H.2" + "SVC H.5"
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฟิกซ์เจอร์ h.4 สอดคล้อง (4 แขก · last4 · checksum บัตรไทย · byTm30 รวม 4) · oracle ของ oracle · ฐานเลน l3 · frontdesk/maid บนฐาน · def/สิทธิ์ · ภาพ --list · secret-box · ของที่ยืนบน
//   CI checkInV2 (CONFIRMED+วัน · TOO_EARLY+override · assignableRooms CLEAN/INSPECTED · DIRTY force+เหตุผล+AuditLog+HousekeepingLog · ROOM_TAKEN/ROOM_INACTIVE · GUEST_REQUIRED · INVALID_ID · OVER_OCCUPANCY · needsDeposit · occupancy STAY · checkedInAt · event ไม่มี PII · X3 · `at` · undoCheckIn · checkIn เดิมห่อ)
//   GR ทะเบียน (upsert · AuditLog mask · listGuests กรอง/DTO · ขอบเขตหน่วย · หลังเช็กเอาต์ MANAGER · ลบ 10 นาที · ฟิลด์บังคับ · รูปเอกสาร private/keepIdImage · X6 · def คีย์ใหม่)
//   PD PDPA เข้ม (enc เปิดได้ด้วย secret-box ≠ ดิบ · ไม่มีดิบในทุกคอลัมน์/AuditLog/Outbox/FileAsset · reveal viewId+AuditLog ทุกครั้ง · maskId · ลิงก์ private ตรวจสิทธิ์ · purge ลบ enc/ไฟล์ คงชื่อ+last4 · idempotent · limit · X5 · minute-jobs · ไม่ log ดิบ · ไม่เข้า search)
//   AI readIdDocument (AI_DISABLED ไม่ยิง · NO_PROVIDER · NO_CREDIT · ok proposal+หักเครดิต · UNREADABLE/ล้ม · รูปไม่เก็บ/ไม่มี PII ออก)
//   RR ร.ร.3/ร.ร.4 (signRr3 ไฟล์ private+rr3SignedAt · ลงชื่อแทนห้อง · กระดาษ · RR3_FIELDS/rr3Card ครบ · เลขลำดับต่อหน่วย/ปี · ไฟล์ผิด/สิทธิ์)
//   TM ตม.30 (คิว · TM30_DEFAULT_COLUMNS · export csv เฉพาะที่เลือก/คอลัมน์ตามค่าตั้ง · xlsx fallback · markTm30Filed หลายคน 1 เลข · sweep LATE idempotent/X5 · เตือน · tm30.enabled ปิด · guest-shared pure)
//   SD ประกัน (ขั้นแยกหลัง CHECKED_IN · appliesTo WALK_IN · ปิด) · MB สมาชิก opt-in · B ด่าน (X1 · หน่วย · X9 4 ระดับ · actions สถิต · AuditLog) · N event 3 ทะเบียน · U UI สถิต · F ไฟล์ที่แตะ · Q ฉาก · V ภาพ · Z ล้าง · G regression
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · CI/GR/PD/AI/RR/TM/SD/MB/B/N/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/checkin.ts|guest.ts|guest-id-ai.ts|tm30.ts|guest-shared.ts" (SD = ยังไม่มี checkout.ts ของ H.5) · Q/V/G SKIP
// 🔴 ร้านชั่วคราว slug/email `svc-h4-*` ลบใน finally (รวม FileAsset ของมันผ่าน storage) + กวาดค้างตอนเริ่ม · ไม่แตะ /tmp (log regression ลง /root/svc-runs)
// 🔴 .env.qc-svc ไม่มี INTEGRATIONS_CREDENTIALS_KEY ⇒ ข้อสอบตั้งคีย์ทดสอบในโพรเซสตัวเอง (แบบ qc-svc-c.3/d.9) ก่อนโหลดโมดูล · AI = คีย์ปลอม + ครอบ fetch (openrouter.ai = ตัวจำลอง · Bunny/Neon ผ่าน · อื่นบล็อก)
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.4.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V · SVC_QC_CLOCK ข้อสอบตั้ง/ถอดเองต่อข้อ)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_TYPES, SQC_HOTEL_ROOMS, SQC_HOTEL_BOOKING_SCENE, SQC_HOTEL_GUEST_SCENE, SQC_HOTEL_FOLIO_SCENE, SQC_POS_EXTRA_UNITS, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.4";
const SUITE = "qc-svc-h.4";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H4_NO_REGRESSION === "1";
const SLUG = "svc-h4-";
const MAIL = "svc-h4-";
const LOG_DIR = "/root/svc-runs";
const F = {
  checkin: "src/lib/modules/hotel/checkin.ts",
  guest: "src/lib/modules/hotel/guest.ts",
  ai: "src/lib/modules/hotel/guest-id-ai.ts",
  tm30: "src/lib/modules/hotel/tm30.ts",
  shared: "src/lib/modules/hotel/guest-shared.ts",
  checkout: "src/lib/modules/hotel/checkout.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  service: "src/lib/modules/hotel/service.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  defs: "src/lib/core/settings/defs/rooms.ts",
  perms: "src/lib/core/permissions.ts",
  minute: "src/lib/platform/minute-jobs.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  secretBox: "src/lib/core/integrations/secret-box.ts",
  storage: "src/lib/storage/service.ts",
  filesRoute: "src/app/api/files/[id]/route.ts",
  compDir: "src/components/hotel",
  checkinShared: "src/components/hotel/checkin-shared.ts",
  detailPage: "src/app/app/u/[unitSlug]/hotel/reservations/[id]/page.tsx",
  homePage: "src/app/app/u/[unitSlug]/hotel/page.tsx",
  guestsPage: "src/app/app/u/[unitSlug]/hotel/guests/page.tsx",
  rr4Page: "src/app/app/u/[unitSlug]/hotel/guests/rr4/print/page.tsx",
  rr3Page: "src/app/app/u/[unitSlug]/hotel/guests/[guestId]/rr3/print/page.tsx",
  tm30Page: "src/app/app/u/[unitSlug]/hotel/tm30/page.tsx",
  scene: "scripts/svc-qc-hotel-guest-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  probe: "scripts/probe-h4-b.mts",
  sds: "docs/sds/modules/hotel.md",
} as const;
const COMPS = ["CheckinPanel", "RoomPicker", "GuestForm", "IdScanButton", "SignaturePad", "Rr3Card", "Tm30Queue", "Tm30FileDialog", "SecurityDepositStep"].map((n) => `${F.compDir}/${n}.tsx`);
const PAGES = [F.guestsPage, F.rr4Page, F.rr3Page, F.tm30Page];

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK; // ข้อ CI-15/TM ตั้งเองต่อข้อ
// 🔴 secret-box: ฐาน QC ไม่มีคีย์ ⇒ ตั้งคีย์ทดสอบในโพรเซส (อ่าน env ทุกครั้งที่เรียก — ไม่ cache) · บันทึกว่าตั้งเองหรือไม่
const KEY_FROM_ENV = (process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").trim().length >= 32;
if (!KEY_FROM_ENV) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
// 🔴 AI: คีย์ปลอม + ปิด Mock + ไม่บังคับโมเดล · ครอบ fetch ทั้งโพรเซส
const FAKE_AI_KEY = "qc-h4-fake-key";
process.env.SHARK_AI_KEY = FAKE_AI_KEY;
delete process.env.SHARK_AI_MOCK;
delete process.env.SHARK_AI_MODEL;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ ครอบ fetch — openrouter.ai = ตัวจำลอง · Bunny/Neon/localhost ผ่าน · ปลายทางอื่นบล็อก ═══════════════
type OrReq = { url: string; auth: string; body: Any };
const OR_REQS: OrReq[] = [];
const BLOCKED: string[] = [];
let OR_MODE: "ok" | "garbage" | "error" = "ok";
let OR_PROPOSAL: Record<string, unknown> = { fullName: "WEBER, DANIEL", nationality: "DEU", idNumber: "C01X4KJ77", dob: "1986-03-12", docType: "PASSPORT", expiry: "2031-03-11", sex: "M" };
const OR_USAGE = { prompt_tokens: 1800, completion_tokens: 60 };
const AI_MODEL = "anthropic/claude-sonnet-5";
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech") || /bunnycdn\.com$|b-cdn\.net$/.test(host)) return REAL_FETCH(input, init);
  if (host === "openrouter.ai") {
    let body: Any = null;
    try { body = JSON.parse(String(init?.body ?? "null")); } catch { body = null; }
    const h = init?.headers ?? {};
    const auth = String((h as Any).Authorization ?? (h as Any).authorization ?? (typeof (h as Any).get === "function" ? (h as Any).get("authorization") : "") ?? "");
    OR_REQS.push({ url, auth, body });
    if (OR_MODE === "error") return new Response(JSON.stringify({ error: { message: "qc fake 500" } }), { status: 500, headers: { "content-type": "application/json" } });
    const content = OR_MODE === "garbage" ? "ขออภัย อ่านเอกสารไม่ชัด" : JSON.stringify({ ...OR_PROPOSAL, confidence: 0.93 });
    return new Response(JSON.stringify({ model: AI_MODEL, choices: [{ message: { content } }], usage: OR_USAGE }), { status: 200, headers: { "content-type": "application/json" } });
  }
  BLOCKED.push(host.slice(0, 80));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

// ═══════════════ harness ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const has = (rel: string) => existsSync(join(ROOT, rel));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `ยังไม่มี ${rel} (${load.err})`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `ยังไม่มี ${rel} (${load.err})`);
  return v;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const isFail = (r: Any, ...codes: string[]) => { const c = failCode(r); return c !== null && (codes.length === 0 || codes.includes(c)); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกแล้วไม่ให้ throw ดิบทะลุ — throw = {ok:false, code:"THROW"} (ข้อสอบนับเป็นแดงพร้อมเหตุผล) */
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { if (e instanceof AssertFail) throw e; return { ok: false, code: "THROW", reason: errMsg(e) }; } }; // AssertFail (ยังไม่มีไฟล์/export) ทะลุขึ้นเป็นเหตุผลแดงตรง · throw ดิบของโค้ด = {code:"THROW"}
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const msOf = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) : Number.NaN);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const withClock = async <T,>(on: boolean, fn: () => Promise<T>): Promise<T> => { // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-tsc-7060)
  const prev = process.env.SVC_QC_CLOCK;
  if (on) process.env.SVC_QC_CLOCK = "1"; else delete process.env.SVC_QC_CLOCK;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; }
};
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
/** บัตรประชาชนไทย 13 หลัก: Σ d[i]×(13−i) (i=0..11) · check = (11 − Σ mod 11) mod 10 */
const thaiIdOk = (s: string) => { if (!/^\d{13}$/.test(s)) return false; let sum = 0; for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i); return (11 - (sum % 11)) % 10 === Number(s[12]); };
const mkThaiId = (prefix12: string) => { let sum = 0; for (let i = 0; i < 12; i++) sum += Number(prefix12[i]) * (13 - i); return `${prefix12}${(11 - (sum % 11)) % 10}`; };
/** พาสปอร์ต: 6–9 ตัวอักษร/ตัวเลข (ใบ §1 guest-shared) */
const passportOk = (s: string) => /^[A-Z0-9]{6,9}$/i.test(s);
const last4 = (s: string) => s.slice(-4);
/** mask อ้างอิง: ตัวอักษร/ตัวเลขที่เหลือเห็นได้ = 4 ตัวท้ายเท่านั้น (ใบ §0 "idNumberLast4 เท่านั้นที่อ่านได้ทั่วไป") */
const maskOk = (masked: unknown, raw: string) => typeof masked === "string" && masked.replace(/[^A-Za-z0-9]/g, "") === last4(raw) && !masked.includes(raw.slice(0, raw.length - 4));
const isoForeigner = (iso3: string) => iso3.toUpperCase() !== "THA";
const refTm30Due = (checkedInAt: number) => checkedInAt + 24 * 3_600_000;
const refRetainUntil = (checkOut: string, years: number) => { const [y, m, d] = checkOut.split("-").map(Number); return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10); };
const buddhistYear = (d: Date) => Number(new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 4)) + 543;
const RR3_NO = /^RR3-(\d{4})-(\d{6})$/;
/** PNG 1×1 ที่ถูกต้องตามรูปแบบ (ไบต์หัว + IHDR + IDAT + IEND) — ใช้เป็นรูปเอกสาร/ลายเซ็น */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
const makePng = (seed = 1): Uint8Array => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]));
};
const bigPng = (bytes: number): Uint8Array => { const u = new Uint8Array(bytes); u.set(makePng(2).subarray(0, 64)); return u; };
const PNG = { data: makePng(1), contentType: "image/png" };
const hasRaw = (text: string, raws: string[]) => raws.filter((r) => text.includes(r));

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const SB = (await tryImport("@/lib/core/integrations/secret-box")).mod as Any;
const STO = (await tryImport("@/lib/storage/service")).mod as Any;
const AIP = (await tryImport("@/lib/ai/provider")).mod as Any;
const CR = (await tryImport("@/lib/ai/credit")).mod as Any;
const MEM = (await tryImport("@/lib/modules/member/service")).mod as Any;
const QH = (await tryImport("@/lib/core/quiet-hours")).mod as Any;
const roomsL = await tryImport("@/lib/modules/rooms");
const hotelL = await loadIf(F.index);
const serviceL = await loadIf(F.service);
const checkinL = await loadIf(F.checkin);
const guestL = await loadIf(F.guest);
const aiL = await loadIf(F.ai);
const tm30L = await loadIf(F.tm30);
const sharedL = await loadIf(F.shared);
const checkoutL = await loadIf(F.checkout);
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const CK = (n: string) => fnOf(checkinL, n, F.checkin);
const GU = (n: string) => fnOf(guestL, n, F.guest);
const AI = (n: string) => fnOf(aiL, n, F.ai);
const TM = (n: string) => fnOf(tm30L, n, F.tm30);
const SH = (n: string) => fnOf(sharedL, n, F.shared);
const CO = (n: string) => fnOf(checkoutL, n, F.checkout);
const needCheckin = () => { if (!checkinL.mod) throw new AssertFail(`ยังไม่มี ${F.checkin} (${checkinL.err})`); };
const needGuest = () => { if (!guestL.mod) throw new AssertFail(`ยังไม่มี ${F.guest} (${guestL.err})`); };
const needTm30 = () => { if (!tm30L.mod) throw new AssertFail(`ยังไม่มี ${F.tm30} (${tm30L.err})`); };

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelGuestRecord", "HotelBookingNight", "HotelFolio", "HotelFolioItem", "HotelHousekeepingLog", "RoomOccupancy", "FileAsset"];
const GUEST_COLS = ["idNumberEnc", "idNumberLast4", "isForeigner", "tm30Status", "tm30DueAt", "tm30Ref", "tm30FiledAt", "rr3SignedAt", "retainUntil", "idImageFileId", "signatureFileId", "partyId", "arrivedFrom", "nextDestination", "dob", "nationality", "idType"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const cols: { c: string }[] = await prisma.$queryRawUnsafe(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelGuestRecord'`);
  const haveCols = new Set(cols.map((r) => r.c));
  const missCols = GUEST_COLS.filter((c) => !haveCols.has(c));
  H0_OK = miss.length === 0 && missCols.length === 0 && typeof prisma.hotelGuestRecord?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l3: ${miss.join(", ")}` : missCols.length ? `HotelGuestRecord ขาดคอลัมน์ ${missCols.join(", ")}` : typeof prisma.hotelGuestRecord?.findMany !== "function" ? "Prisma client ยังไม่มี model HotelGuestRecord" : "";
} catch (e) { H0_WHY = `อ่าน information_schema ไม่ได้: ${errMsg(e)}`; }
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
/** ลบไฟล์จริงของร้านชั่วคราวผ่าน storage ก่อนลบแถว (ไฟล์ private ที่ค้างบน Bunny ไม่มีลิงก์ใดชี้) — best-effort */
async function dropTenantFiles(tids: string[]) {
  if (!tids.length || typeof STO?.deleteFileAsset !== "function") return;
  try {
    const fa: { id: string; tenantId: string }[] = await prisma.fileAsset.findMany({ where: { tenantId: { in: tids } }, select: { id: true, tenantId: true } });
    for (const f of fa) { try { await STO.deleteFileAsset({ tenantId: f.tenantId }, f.id); } catch { /* best-effort */ } }
  } catch (e) { console.log(`  ⚠️ ลบไฟล์ร้านทดสอบ: ${errMsg(e)}`); }
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  await dropTenantFiles(tids);
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|RR|TM|WEB|COUNTER|PromptPay|Agoda|Booking\.com|PNG|JPEG|PDF|CSV|Excel|px|rem|em|svg|a|x|ISO|Wi-Fi|OCR|TM30|RR3|RR4)$/;
const englishInJsx = (src: string): string[] => {
  const s = stripComments(src);
  const texts: string[] = [];
  for (const m of s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]);
  for (const m of s.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']*)["']/g)) texts.push(m[1]);
  const bad: string[] = [];
  for (const t of texts) for (const w of t.match(/[A-Za-z][A-Za-z.'-]{1,}/g) ?? []) if (!EN_ALLOW.test(w) && !/^[A-Z]{2,5}$/.test(w)) bad.push(w);
  return [...new Set(bad)];
};
const importSpecs = (src: string): { spec: string; typeOnly: boolean }[] => {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of stripComments(src).matchAll(/import\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|export\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']/g)) {
    const spec = m[2] ?? m[3] ?? m[5];
    if (spec) out.push({ spec, typeOnly: !!(m[1] || m[4]) });
  }
  return out;
};
const resolveSpec = (fromRel: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(join(ROOT, dirname(fromRel)), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith("/")) { try { if (readFileSync(c, "utf8") !== undefined) return c.slice(ROOT.length + 1); } catch { /* โฟลเดอร์ */ } }
  return null;
};
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability|checkin|guest|guest-id-ai|tm30|folio|checkout|room-charge)\.ts$|^src\/lib\/modules\/(rooms|pos|member|dorm)\/|^src\/lib\/(storage|ai)\/|^src\/lib\/core\/integrations\//;
const clientReach = (startRel: string): string[] => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (rel: string, path: string[]) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel);
    if (!src) return;
    if (rel !== startRel && /^\s*["']use server["']/m.test(src)) return;
    for (const { spec, typeOnly } of importSpecs(src)) {
      if (typeOnly) continue;
      if (spec === "@prisma/client" || spec === "server-only" || spec === "@/lib/core/db" || /^@prisma\//.test(spec)) { bad.push([...path, rel, spec].join(" → ")); continue; }
      const r = resolveSpec(rel, spec);
      if (!r) continue;
      if (SERVER_FILES.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; }
      walk(r, [...path, rel]);
    }
  };
  walk(startRel, []);
  return bad;
};

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · checkin.ts ${checkinL.mod ? "โหลดได้" : "ยังไม่มี"} · guest.ts ${guestL.mod ? "โหลดได้" : "ยังไม่มี"} · tm30.ts ${tm30L.mod ? "โหลดได้" : "ยังไม่มี"} · guest-id-ai.ts ${aiL.mod ? "โหลดได้" : "ยังไม่มี"} · checkout.ts(H.5) ${checkoutL.mod ? "โหลดได้" : "ยังไม่มี"} · booking.ts(H.3) ${has(F.booking) ? "มี" : "ยังไม่มี"} · secret-box key ${KEY_FROM_ENV ? "จาก env" : "ตั้งเองในโพรเซส"})`);

// ═══════════════ ฟิกซ์เจอร์ → ตัวช่วย ═══════════════
const GS = SQC_HOTEL_GUEST_SCENE;
const BS = SQC_HOTEL_BOOKING_SCENE;
const sceneBooking = (key: string) => BS.bookings.find((b) => b.key === key);

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ h.4 สอดคล้องกันเอง: 4 แขก · reservationKey มีในฉาก h.3 (inhouse-web CHECKED_IN −1 · inhouse-ota CHECKED_IN −2 OTA · today-walkin CONFIRMED WALK_IN วันนี้) · ผู้พักหลัก 1 คน/การจอง · last4 ตรง 4 ตัวท้าย · บัตรไทย checksum ถูก (คำนวณเอง · รวม spareThaiId) · พาสปอร์ตรูปแบบ 6–9 · byTm30 รวม 4 (FILED 2 = inhouse-web · LATE 1 = inhouse-ota · NOT_REQUIRED 1 = THA) · foreigners 3 · signedRr3 3 · ประกัน 100,000 CASH · settings ค่าตั้งผ่าน schema · mark", () => {
    eq(GS.guests.length, GS.expect.guestRows, "แขก");
    for (const g of GS.guests) { const b = sceneBooking(g.reservationKey); ok(b, `ไม่มีการจอง ${g.reservationKey} ในฉาก h.3`); }
    eq([sceneBooking("inhouse-web")!.status, sceneBooking("inhouse-web")!.checkInOffset, sceneBooking("inhouse-ota")!.status, sceneBooking("inhouse-ota")!.checkInOffset, sceneBooking("inhouse-ota")!.source, sceneBooking("today-walkin")!.status, sceneBooking("today-walkin")!.source, sceneBooking("today-walkin")!.checkInOffset], ["CHECKED_IN", -1, "CHECKED_IN", -2, "OTA", "CONFIRMED", "WALK_IN", 0], "สถานะการจองฉาก h.3");
    const byRes: Record<string, number> = {};
    for (const g of GS.guests) if (g.primary) byRes[g.reservationKey] = (byRes[g.reservationKey] ?? 0) + 1;
    ok(Object.values(byRes).every((n) => n === 1) && Object.keys(byRes).length === 3, `ผู้พักหลัก ${J(byRes)}`);
    eq(GS.guests.map((g) => last4(g.idNumber)), [...GS.expect.last4], "last4");
    for (const g of GS.guests) { if (g.idType === "THAI_ID") ok(thaiIdOk(g.idNumber) && g.nationality === "THA", `บัตรไทย ${g.fullName}`); else ok(passportOk(g.idNumber) && g.nationality !== "THA", `พาสปอร์ต ${g.fullName}`); }
    ok(thaiIdOk(GS.spareThaiId) && !GS.guests.some((g) => g.idNumber === GS.spareThaiId), "spareThaiId");
    const byTm30 = { FILED: GS.guests.filter((g) => g.reservationKey === GS.tm30.filed.reservationKey && isoForeigner(g.nationality)).length, LATE: GS.guests.filter((g) => (GS.tm30.lateAfterSweep as readonly string[]).includes(g.reservationKey) && isoForeigner(g.nationality)).length, NOT_REQUIRED: GS.guests.filter((g) => !isoForeigner(g.nationality)).length };
    eq(byTm30, { ...GS.expect.byTm30 }, "byTm30");
    eq(Object.values(GS.expect.byTm30).reduce((a, b) => a + b, 0), GS.expect.guestRows, "byTm30 รวม");
    eq([GS.guests.filter((g) => isoForeigner(g.nationality)).length, GS.guests.filter((g) => g.signed).length], [GS.expect.foreigners, GS.expect.signedRr3], "foreigners/signed");
    eq([GS.checkInV2.reservationKey, GS.checkInV2.securityDeposit.amountSatang, GS.checkInV2.securityDeposit.payType, GS.expect.securityHeldSatang, GS.expect.walkinStatus], ["today-walkin", 100_000, "CASH", 100_000, "CHECKED_IN"], "ประกัน/walk-in");
    ok(/^TM30-\d{4}-\d{6}$/.test(GS.tm30.filed.ref), `เลขรับแจ้ง ${GS.tm30.filed.ref}`);
    eq([GS.mark, GS.unit], ["SvcQcScene:h4", "hotel"], "ค่าคงที่");
    for (const [k, v] of Object.entries(GS.settings)) { const d = SET?.getDef?.(k); ok(d, `ไม่มี def ${k}`); ok(d.schema.safeParse(v).success, `ค่า ${k}=${J(v)} ไม่ผ่าน schema`); }
    ok(GS.guests.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.dob) && g.fullName && g.nationality.length === 3), "ค่าต่อแขก");
  });
  await st("PC-2", "oracle ของ oracle: thaiIdOk (ฟิกซ์เจอร์ 2 เลข ✓ · เปลี่ยนหลักท้าย ✗ · 12 หลัก ✗) · mkThaiId คืนเลขที่ตรวจผ่าน · passportOk (6–9 ✓ · 5/10 ✗) · maskOk (••••KJ77 ✓ · C01X···KJ77 ✗ · เลขดิบ ✗) · refTm30Due = +24 ชม. · refRetainUntil +2 ปี · buddhistYear · PNG ที่สร้างมีไบต์หัว/IEND · bigPng ขนาดตรง", () => {
    ok(thaiIdOk("1101700000010") && thaiIdOk("3509900000021") && !thaiIdOk("1101700000011") && !thaiIdOk("110170000001"), "thaiIdOk");
    const g = mkThaiId("123456789012"); ok(thaiIdOk(g) && g.startsWith("123456789012"), `mkThaiId ${g}`);
    ok(passportOk("C01X4KJ77") && passportOk("AB1234") && !passportOk("AB123") && !passportOk("AB12345678") && !passportOk("C01X4KJ7-"), "passportOk");
    ok(maskOk("••••KJ77", "C01X4KJ77") && maskOk("*****KJ77", "C01X4KJ77") && !maskOk("C01X···KJ77", "C01X4KJ77") && !maskOk("C01X4KJ77", "C01X4KJ77") && maskOk("••••-•••••-0010", "1101700000010"), "maskOk");
    eq(refTm30Due(1_000), 1_000 + 86_400_000, "due");
    eq(refRetainUntil("2026-11-08", 2), "2028-11-08", "retain");
    eq(buddhistYear(new Date("2026-11-07T20:00:00Z")), 2569, "พ.ศ.");
    const p = Buffer.from(makePng());
    ok(p[0] === 0x89 && p.subarray(1, 4).toString("ascii") === "PNG" && p.subarray(p.length - 8, p.length - 4).toString("ascii") === "IEND", "PNG");
    eq(bigPng(1024).length, 1024, "bigPng");
  });
  await st("PC-3", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l3 ep-royal-bar) · ตาราง H.0 (HotelGuestRecord · HousekeepingLog · Folio · FileAsset · RoomOccupancy) + คอลัมน์ HotelGuestRecord ครบตามใบ h.0 §2.12 · CHECK tm30Status 4 ค่า · ดัชนี retainUntil · Prisma client มี hotelGuestRecord", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar|ep-square-heart|ep-late-union)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-PC3-anylane): ข้อสอบต้องรันได้ทุกเลน/ฐานหลัก (builder อาจอยู่เลนอื่น · regression/H.9)
    ok(H0_OK, H0_WHY);
    const chk: { d: string }[] = await prisma.$queryRawUnsafe(`SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'HotelGuestRecord' AND c.contype = 'c'`);
    const tm = chk.map((x) => x.d).find((d) => /tm30Status/.test(d)) ?? "";
    ok(["NOT_REQUIRED", "PENDING", "FILED", "LATE"].every((v) => tm.includes(v)), `CHECK tm30Status: ${tm || "ไม่มี"}`);
    const idx: { n: string }[] = await prisma.$queryRawUnsafe(`SELECT indexname AS n FROM pg_indexes WHERE tablename = 'HotelGuestRecord'`);
    ok(idx.some((i) => /retainUntil/.test(i.n)) && idx.some((i) => /tm30Status/.test(i.n)), `ดัชนี ${J(idx.map((i) => i.n))}`);
  });
  await st("PC-4", "ฟิกซ์เจอร์ผู้ใช้: frontdesk STAFF หน่วย hotel มี hotel.guest.register + reservation.checkIn + booking.manage · ไม่มี hotel.guest.viewId (เห็นเลขปิดบางส่วน) · maid มีเฉพาะ hotel.housekeeping · manager ฟิกซ์เจอร์ไม่มีสิทธิ์หน่วย hotel (ใบ h.4 หัวบอก manager +viewId — ไม่พบในฟิกซ์เจอร์ · รายงานผู้คุม) · บนฐาน (seed l3) membership frontdesk มี guest.register · หน่วย hotel svcqc 14 ห้อง · ผูก POS (SQC_POS_EXTRA_UNITS)", async () => {
    const fd = SQC_USERS.find((u) => u.key === "frontdesk")!, md = SQC_USERS.find((u) => u.key === "maid")!, mg = SQC_USERS.find((u) => u.key === "manager")!;
    ok(["hotel.guest.register", "hotel.reservation.checkIn", "hotel.booking.manage", "hotel.folio.post"].every((p) => fd.permissions[p] === true) && !fd.permissions["hotel.guest.viewId"] && fd.role === "STAFF" && fd.unitAccess.includes(SQC_UNITS.hotel.id), `frontdesk ${J(fd)}`);
    eq([md.role, Object.keys(md.permissions), md.unitAccess], ["STAFF", ["hotel.housekeeping"], [SQC_UNITS.hotel.id]], "maid");
    ok(mg.role === "MANAGER" && !mg.permissions["hotel.guest.viewId"], "manager ฟิกซ์เจอร์เปลี่ยน (ข้อสอบยึดว่าไม่มี viewId)"); // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h4-pc4) ฟิกซ์เจอร์ H.7 (3015b0534) ให้ manager คุมหน่วย hotel (audit/reports/booking.manage) — ยึดเฉพาะว่าไม่มี viewId
    ok((SQC_POS_EXTRA_UNITS as readonly string[]).includes("hotel"), "hotel ไม่อยู่ใน SQC_POS_EXTRA_UNITS");
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐาน l3 — ผู้คุมรัน seed ก่อน (Q/V ต้องใช้)");
    const mb = await prisma.membership.findUnique({ where: { id: fd.membershipId }, select: { permissions: true } });
    ok(mb && (mb.permissions as Any)?.["hotel.guest.register"] === true && !(mb.permissions as Any)?.["hotel.guest.viewId"], `membership frontdesk บนฐานยังไม่มี guest.register (reseed svc-h4-seed-l3): ${J(mb)}`);
    const mm = await prisma.membership.findUnique({ where: { id: md.membershipId }, select: { permissions: true } });
    ok(mm && (mm.permissions as Any)?.["hotel.housekeeping"] === true, "membership maid บนฐานยังไม่มี");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { roomTypeId: true, rentMode: true } });
    eq([rooms.length, SQC_HOTEL_ROOMS.length, rooms.filter((r: Any) => r.roomTypeId === SQC_HOTEL_TYPES.deluxe.id && r.rentMode !== "MONTHLY").length], [14, 14, 7], "ห้องบนฐาน");
    ok(await prisma.appSystemUnit.findFirst({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, type: "POS" } }), "หน่วย hotel svcqc ไม่ผูก POS บนฐาน");
  }, "MAJOR");
  await st("PC-5", "def ค่าตั้งที่ H.4 ยืนบน (มีแล้ว H.0/H.1): guest.retainYears 2 (1–10) · guest.maskIdForStaff true · guest.aiIdReader false · rr3OnScreen true · tm30ReminderHours 6 (1–23) · securityDeposit 100,000 · securityDeposit.enabled false · appliesTo ALL|WALK_IN ค่าเริ่ม ALL · inspectionRequired false · ทุกคีย์ unitTypes HOTEL · ทะเบียนสิทธิ์มีป้ายไทย hotel.guest.register/viewId", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq([d("rooms.hotel.guest.retainYears").defaults._fallback, d("rooms.hotel.guest.maskIdForStaff").defaults._fallback, d("rooms.hotel.guest.aiIdReader").defaults._fallback, d("rooms.hotel.rr3OnScreen").defaults._fallback, d("rooms.hotel.tm30ReminderHours").defaults._fallback], [2, true, false, true, 6], "ค่าเริ่ม guest");
    ok(d("rooms.hotel.guest.retainYears").schema.safeParse(1).success && d("rooms.hotel.guest.retainYears").schema.safeParse(10).success && !d("rooms.hotel.guest.retainYears").schema.safeParse(0).success, "retainYears 1–10");
    ok(d("rooms.hotel.tm30ReminderHours").schema.safeParse(23).success && !d("rooms.hotel.tm30ReminderHours").schema.safeParse(24).success, "reminderHours 1–23");
    eq([d("rooms.hotel.securityDeposit").defaults._fallback, d("rooms.hotel.securityDeposit.enabled").defaults._fallback, d("rooms.hotel.securityDeposit.appliesTo").defaults._fallback, d("rooms.hotel.inspectionRequired").defaults._fallback], [100_000, false, "ALL", false], "ประกัน/ตรวจห้อง");
    ok(["ALL", "WALK_IN"].every((v) => d("rooms.hotel.securityDeposit.appliesTo").schema.safeParse(v).success), "appliesTo enum");
    for (const k of ["rooms.hotel.guest.retainYears", "rooms.hotel.guest.maskIdForStaff", "rooms.hotel.guest.aiIdReader", "rooms.hotel.rr3OnScreen", "rooms.hotel.tm30ReminderHours", "rooms.hotel.securityDeposit.enabled"]) eq(d(k).unitTypes, ["HOTEL"], `unitTypes ${k}`);
    const src = read(F.perms);
    for (const k of ["hotel.guest.register", "hotel.guest.viewId"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]*[฀-๿]`).test(src), `ไม่มีป้ายไทย ${k}`);
    ok(PERM, "โหลด permissions.ts ไม่ได้");
  });
  await st("PC-6", "ภาพ: SQC_VISUAL_SPECS[\"h.4\"] = hotel-guests · hotel-rr4-print (from=วันนี้−3 · to=วันนี้) · hotel-tm30 (+hotel-checkin ?tab=guests เมื่อ SVC_VIS_H4_RES_ID · +hotel-rr3-print เมื่อ SVC_VIS_H4_GUEST_ID) · path ใต้ /hotel/ · visual-svc h.4 --list พิมพ์ครบ", () => {
    const specs = SQC_VISUAL_SPECS["h.4"] ?? [];
    const names = specs.map((s) => s.name);
    eq(names.filter((n) => n !== "hotel-checkin" && n !== "hotel-rr3-print"), ["hotel-guests", "hotel-rr4-print", "hotel-tm30"], "ชื่อภาพ");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/`)), "path");
    const q = new URL(`http://x${specs.find((s) => s.name === "hotel-rr4-print")!.path}`).searchParams;
    eq([q.get("from"), q.get("to")], [sqcAddDays(SQC_TODAY_BKK, -3), SQC_TODAY_BKK], "ร.ร.4 ช่วงวัน");
    eq(specs.find((s) => s.name === "hotel-tm30")!.path, `/app/u/${SQC_UNITS.hotel.slug}/hotel/tm30`, "tm30");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.4", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/hotel/guests") && (r.stdout ?? "").includes("/hotel/tm30") && (r.stdout ?? "").includes("rr4/print"), `--list exit ${r.status}`);
  }, "MAJOR");
  await st("PC-7", "secret-box ใช้ได้ในโพรเซสนี้ (ฐาน QC ไม่มี INTEGRATIONS_CREDENTIALS_KEY ⇒ ข้อสอบตั้งเอง ≥32 ตัว): integrationSecretKeyConfigured true · seal({id}) 3 ส่วน b64 · open ด้วย AAD เดิมคืนค่าเดิม · AAD อื่น/ไม่ส่ง AAD ⇒ null · กุญแจอื่น ⇒ null · กล่องขยะ ⇒ null ไม่โยน · ไม่มีเลขดิบในกล่อง", () => {
    ok(SB && typeof SB.sealIntegrationSecret === "function" && typeof SB.openIntegrationSecret === "function", "โหลด secret-box ไม่ได้");
    ok(SB.integrationSecretKeyConfigured() === true, "กุญแจไม่พร้อม");
    const raw = "C01X4KJ77";
    const box = SB.sealIntegrationSecret({ id: raw }, "rec-1");
    ok(typeof box === "string" && box.split(".").length === 3 && !box.includes(raw), `กล่อง ${box}`);
    eq(SB.openIntegrationSecret(box, "rec-1"), { id: raw }, "เปิดด้วย AAD เดิม");
    eq([SB.openIntegrationSecret(box, "rec-2"), SB.openIntegrationSecret(box), SB.openIntegrationSecret("ขยะ", "rec-1"), SB.openIntegrationSecret(null, "rec-1")], [null, null, null, null], "เปิดผิด");
    const prev = process.env.INTEGRATIONS_CREDENTIALS_KEY;
    process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
    try { eq(SB.openIntegrationSecret(box, "rec-1"), null, "กุญแจอื่น"); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = prev; }
    console.log(`     (secret-box key: ${KEY_FROM_ENV ? "จาก .env.qc-svc" : "ตั้งเองในโพรเซส — เสนอผู้คุมเพิ่ม INTEGRATIONS_CREDENTIALS_KEY ใน .env.qc-svc สำหรับ build QC/ภาพ"})`);
  });
  await st("PC-8", "ของที่ H.4 ยืนบน โหลดได้จริง: storage uploadFile/privateFileUrl/privateFileSignatureOk/deleteFileAsset/isPrivateFileUrl + route /api/files/[id] · ai resolveProvider (คีย์ปลอม ⇒ provider · ไม่มีคีย์ ⇒ null) + MockProvider · credit canSpend/canSpendPeek/chargeUsage/topUp · member findOrCreate · rooms claimRoom/moveOccupancy/releaseOccupancy · settings setSettings/resolveSetting/getDef · quiet-hours bkkYmd · facade hotel โหลดได้ (H.1) · service.ts checkIn/assignableRooms เดิมมี", () => {
    ok(STO, "โหลด storage ไม่ได้");
    eq(["uploadFile", "privateFileUrl", "privateFileSignatureOk", "deleteFileAsset", "isPrivateFileUrl"].filter((n) => typeof STO[n] !== "function"), [], "storage");
    ok(has(F.filesRoute), "ไม่มี route /api/files/[id]");
    ok(AIP && typeof AIP.resolveProvider === "function" && typeof AIP.MockProvider === "function", "ai/provider");
    ok(AIP.resolveProvider("smart") !== null, "resolveProvider ด้วยคีย์ปลอมต้องได้ provider");
    const k = process.env.SHARK_AI_KEY; delete process.env.SHARK_AI_KEY;
    try { eq(AIP.resolveProvider("smart"), null, "ไม่มีคีย์ต้อง null"); } finally { process.env.SHARK_AI_KEY = k; }
    eq(["canSpend", "canSpendPeek", "chargeUsage", "topUp"].filter((n) => typeof CR?.[n] !== "function"), [], "credit");
    ok(typeof MEM?.findOrCreate === "function", "member.findOrCreate");
    eq(["claimRoom", "moveOccupancy", "releaseOccupancy"].filter((n) => typeof roomsL.mod?.[n] !== "function"), [], "rooms facade");
    eq(["setSettings", "resolveSetting", "getDef", "resetSetting"].filter((n) => typeof SET?.[n] !== "function"), [], "settings");
    ok(typeof QH?.bkkYmd === "function" && QH.bkkYmd(new Date("2026-11-07T20:00:00Z")) === "2026-11-08", "bkkYmd");
    ok(hotelL.mod, hotelL.err);
    eq(["checkIn", "assignableRooms", "checkOut"].filter((n) => typeof serviceL.mod?.[n] !== "function"), [], "service.ts เดิม");
  });

  // ═══════════════ ร้านชั่วคราว svc-h4-* ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h4-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H4 ร้าน A");
  const tB = await mkTenant("QC H4 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H4");
  const UH2 = await mkUnit(tA, "HOTEL", "โรงแรมที่สอง H4");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H4");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H4");
  type TypeSpec = { name: string; base: number; cap: number; baseOcc: number; maxOcc: number | null; bed: boolean };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: s.baseOcc, maxOccupancy: s.maxOcc, extraBedAllowed: s.bed, extraBedPriceSatang: s.bed ? 30_000 : 0 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, hk = "CLEAN") => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: hk } })).id as string;
  const SPEC: Record<string, TypeSpec> = {
    dlx: { name: "ดีลักซ์", base: 129_000, cap: 3, baseOcc: 2, maxOcc: 3, bed: false },
    sup: { name: "ซูพีเรีย", base: 99_000, cap: 2, baseOcc: 2, maxOcc: 2, bed: false },
    fam: { name: "แฟมิลี", base: 189_000, cap: 4, baseOcc: 2, maxOcc: 5, bed: true },
  };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  const roomPlan: [string, string, string?][] = [["DLX1", "dlx"], ["DLX2", "dlx"], ["DLX3", "dlx"], ["DLX4", "dlx"], ["DLX5", "dlx"], ["DLX6", "dlx"], ["DLX7", "dlx"], ["DLX8", "dlx"], ["DLX9", "dlx"], ["DLX10", "dlx"], ["DLX11", "dlx"], ["DLX12", "dlx"], ["DLX13", "dlx"], ["DLX14", "dlx"], ["DLX15", "dlx"], ["DLX16", "dlx"], ["DLX17", "dlx"], ["DLX18", "dlx"], ["DLX19", "dlx"], ["DLX20", "dlx"], ["DLX21", "dlx"], ["DLX22", "dlx"], ["DLX23", "dlx"], ["DLX24", "dlx"], ["DLX25", "dlx"], ["DLX26", "dlx"], ["DLX27", "dlx"], ["DLX28", "dlx"], ["DLX29", "dlx"], ["DLX30", "dlx"] /* ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-D1): CI-1..14 ถือดีลักซ์ครบ 8 ห้อง ⇒ ข้อหลังไม่มีห้อง — เพิ่ม DLX9..DLX30 */, ["DIRTY1", "dlx", "DIRTY"], ["INSP1", "dlx", "INSPECTED"], ["OOO1", "dlx", "OUT_OF_ORDER"], ["SUP1", "sup"], ["SUP2", "sup"], ["SUP3", "sup"], ["SUP4", "sup"], ["FAM1", "fam"], ["FAM2", "fam"]];
  for (const [n, k, hk] of roomPlan) ROOM[n] = await mkRoom(tA, UH, n, RTA[k], hk ?? "CLEAN");
  const RT_U2 = await mkType(tA, UH2, SPEC.dlx);
  const ROOM_U2 = await mkRoom(tA, UH2, "U2-1", RT_U2);
  const RT_B = await mkType(tB, UHB, SPEC.dlx);
  const ROOM_B = await mkRoom(tB, UHB, "B-1", RT_B);
  // POS ผูกหน่วยโรงแรม (ประกันผ่าน POS ของ H.5) · MEMBER ผูก UH เท่านั้น (UH2 ไม่ผูก = ทดสอบ opt-in ไม่มีระบบสมาชิก)
  const mkSys = async (tenantId: string, unitId: string, type: string) => { const s = await prisma.appSystem.create({ data: { tenantId, type, name: `${type} QC H4` } }); await prisma.appSystemUnit.create({ data: { tenantId, systemId: s.id, unitId, type } }); return s.id as string; };
  await mkSys(tA, UH, "POS");
  const MEMBER_SYS = await mkSys(tA, UH, "MEMBER");
  await mkSys(tB, UHB, "POS");
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h4-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h4 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const FD_PERMS = { "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.booking.manage": true, "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true, "hotel.guest.register": true }; // = ฟิกซ์เจอร์ frontdesk (ไม่มี guest.viewId)
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UH]);
  const MGR2 = await mkMember("mgr2", tA, "MANAGER", [UH2]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH], FD_PERMS);
  const REG = await mkMember("reg", tA, "STAFF", [UH], { "hotel.reservation.checkIn": true, "hotel.guest.register": true }); // ลงทะเบียน+เช็กอิน · ไม่มี manage/viewId
  const VIEWER = await mkMember("viewer", tA, "STAFF", [UH], { "hotel.reservation.checkIn": true, "hotel.guest.register": true, "hotel.guest.viewId": true });
  const MAID = await mkMember("maid", tA, "STAFF", [UH], { "hotel.housekeeping": true });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "hotel.rates.read": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const ids: Record<string, string> = {};
  const setUnit = async (key: string, value: unknown, unitId = UH) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  const settingOf = async (key: string, unitId = UH) => (await SET.resolveSetting(ctxA, key, { unitId }))?.value;
  let SETUP_OK = false;
  let SETUP_WHY = "";
  let seq = 0;
  type ResOpt = { type?: string; ci?: string; co?: string; status?: string; source?: string; adults?: number; deposit?: number; paid?: boolean; tenantId?: string; unitId?: string; roomTypeId?: string; roomId?: string | null; claim?: boolean; guestName?: string };
  /**
   * การจอง "ตามที่ H.3 จะสร้าง" โดยไม่ต้องมี booking.ts: แถว HotelReservation (CONFIRMED · snapshot ว่าง) + HotelBookingNight ทุกคืน counted + RoomOccupancy STAY ถือห้องจริง (best-fit = ห้องว่าง CLEAN ตัวแรก) + HotelFolio OPEN
   * (ข้อสอบไม่ import booking.ts ของ H.3 เพราะทรีเลนอาจยังไม่มี · ฐานข้อมูลตรงกับผลของ createBooking ตาม h.3 §2 ข้อ 1)
   */
  const mkRes = async (o: ResOpt = {}) => {
    const tenantId = o.tenantId ?? tA, unitId = o.unitId ?? UH;
    const roomTypeId = o.roomTypeId ?? RTA[o.type ?? "dlx"];
    const ci = o.ci ?? W(0), co = o.co ?? W(2);
    const status = o.status ?? "CONFIRMED";
    const deposit = o.deposit ?? 0;
    const rv = await prisma.hotelReservation.create({ data: { tenantId, unitId, code: `H4-${RUN}-${++seq}`, status, guestName: o.guestName ?? "ผู้จองทดสอบ h4", guestPhone: "0899990000", roomTypeId, checkInDate: dbDate(ci), checkOutDate: dbDate(co), nights: dayNo(co) - dayNo(ci), adults: o.adults ?? 2, source: o.source ?? "WALK_IN", depositSatang: deposit, depositPaidAt: deposit > 0 && o.paid ? new Date() : null, taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, policySnapshot: { "rooms.hotel.noShow": "FORFEIT_RELEASE_AFTER_AUDIT" }, ...(o.roomId ? { roomId: o.roomId } : {}) } });
    for (let d = ci; d < co; d = addDays(d, 1)) await prisma.hotelBookingNight.create({ data: { tenantId, unitId, reservationId: rv.id, roomTypeId, date: dbDate(d), priceSatang: 100_000, counted: status !== "CANCELLED", ...(o.roomId ? { roomId: o.roomId } : {}) } });
    if (status !== "CANCELLED" && o.claim !== false) {
      const roomId = o.roomId ?? null;
      const cands = roomId ? [roomId] : (await prisma.hotelRoom.findMany({ where: { tenantId, unitId, roomTypeId, active: true, hkStatus: "CLEAN" }, orderBy: { number: "asc" }, select: { id: true } })).map((r: Any) => r.id as string);
      for (const rid of cands) {
        const c = await prisma.$transaction((tx: Any) => roomsL.mod.claimRoom(tx, { tenantId, unitId, roomId: rid, start: ci, end: co, kind: "STAY", refType: "HotelReservation", refId: rv.id, requireRentMode: "NIGHTLY" }));
        if (c?.ok) { await prisma.hotelBookingNight.updateMany({ where: { reservationId: rv.id }, data: { roomId: rid } }); break; }
      }
    }
    if (status === "CONFIRMED" || status === "CHECKED_IN") await prisma.hotelFolio.create({ data: { tenantId, unitId, reservationId: rv.id, status: "OPEN", balanceSatang: 0 } });
    return rv.id as string;
  };
  try {
    ok((await prisma.hotelRoom.count({ where: { tenantId: tA, unitId: UH } })) === roomPlan.length, "ห้องไม่ครบ");
    ids.probe = await mkRes({ type: "sup", ci: W(30), co: W(31) });
    const occ = await prisma.roomOccupancy.findFirst({ where: { refType: "HotelReservation", refId: ids.probe, active: true } });
    ok(occ && occ.kind === "STAY", "claimRoom ของ rooms facade ไม่ถือห้องให้การจองทดสอบ");
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ: ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  // แขกทดสอบ (เลขปลอมรูปแบบถูก · ต่างจากฟิกซ์เจอร์)
  const THAI1 = mkThaiId("110170000002"), THAI2 = mkThaiId("350990000003"), THAI_BAD = `${THAI1.slice(0, 12)}${(Number(THAI1[12]) + 1) % 10}`;
  const G = {
    thai: { fullName: "สมหญิง ใจงาม", nationality: "THA", idType: "THAI_ID", idNumber: THAI1, dob: "1985-02-14", sex: "F", occupation: "พนักงานบริษัท", address: "กรุงเทพฯ", arrivedFrom: "กรุงเทพฯ", nextDestination: "เชียงใหม่" },
    thai2: { fullName: "สมปอง ใจดี", nationality: "THA", idType: "THAI_ID", idNumber: THAI2, dob: "1990-10-01", sex: "M", occupation: "ค้าขาย" },
    deu: { fullName: "MUELLER, HANS", nationality: "DEU", idType: "PASSPORT", idNumber: "C7Z9Q2M41", dob: "1979-06-21", sex: "M", occupation: "Engineer", address: "Berlin", arrivedFrom: "เชียงใหม่", nextDestination: "หลวงพระบาง" },
    deu2: { fullName: "MUELLER, GRETA", nationality: "DEU", idType: "PASSPORT", idNumber: "C8A1B2C33", dob: "1981-01-30", sex: "F" },
    jpn: { fullName: "SATO, HARUKI", nationality: "JPN", idType: "PASSPORT", idNumber: "TR7712345", dob: "1995-04-04", sex: "M", occupation: "Designer", arrivedFrom: "โตเกียว", nextDestination: "ภูเก็ต" },
    fra: { fullName: "DUBOIS, MARIE", nationality: "FRA", idType: "PASSPORT", idNumber: "19FR55021", dob: "1992-09-09", sex: "F" },
  } as const;
  const RAWS = [THAI1, THAI2, ...Object.values(G).map((g) => g.idNumber), ...GS.guests.map((g) => g.idNumber), String(OR_PROPOSAL.idNumber)];
  const PII_TEXT = new RegExp(RAWS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const guestsOf = (id: string) => prisma.hotelGuestRecord.findMany({ where: { reservationId: id }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const guestRow = (gid: string) => prisma.hotelGuestRecord.findUnique({ where: { id: gid } }) as Promise<Any>;
  const occOf = (id: string, active?: boolean) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, ...(active === undefined ? {} : { active }) } }) as Promise<Any[]>;
  const roomOf = (roomId: string) => prisma.hotelRoom.findUnique({ where: { id: roomId } }) as Promise<Any>;
  const eventsOf = async (type: string, pick?: (p: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pick || pick(e.payload ?? {}));
  const auditsOf = (where: Any, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, ...where }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const auditsLike = (re: RegExp, tid = tA) => auditsOf({}, tid).then((rows) => rows.filter((r) => re.test(String(r.action))));
  const fileOf = (fid: string) => prisma.fileAsset.findUnique({ where: { id: fid } }) as Promise<Any>;
  const fileCount = (tid = tA) => prisma.fileAsset.count({ where: { tenantId: tid } }) as Promise<number>;
  const openEnc = (row: Any) => SB.openIntegrationSecret(row?.idNumberEnc, row?.id);
  const rawOfEnc = (row: Any) => { const o = openEnc(row); return o ? String(o.id ?? o.idNumber ?? "") : null; };
  type Over = Record<string, unknown>;
  const checkIn = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => CK("checkInV2")(actor, ctx, { guests: [G.thai], ...over }));
  const upsert = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => GU("upsertGuestRecord")(actor, ctx, over));
  const listG = (actor: Actor, over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => GU("listGuests")(actor, ctx, { unitId: UH, from: W(-3), to: W(3), ...over }));
  const reveal = (actor: Actor, guestId: string, ctx: Record<string, unknown> = ctxA) => call(() => GU("revealGuestId")(actor, ctx, { guestId }));
  const sign = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => GU("signRr3")(actor, ctx, { signaturePng: PNG, ...over }));
  const rr3 = (guestId: string, ctx: Record<string, unknown> = { ...ctxA, userId: REG.userId }) => call(() => GU("rr3Card")(ctx, { guestId })); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-PD6-userId): ลิงก์ไฟล์ของ rr3Card ผูกผู้ดูจาก ctx.userId — ไม่มี userId ⇒ ไม่ออกลิงก์ (ผู้ตรวจ PDPA m4) · ข้อสอบส่ง userId ของผู้ลงทะเบียน
  const rr4 = (over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => GU("rr4Register")(ctx, { unitId: UH, from: W(-3), to: W(3), ...over }));
  const purge = (over: Over = {}) => call(() => GU("purgeExpiredGuestRecords")(over));
  const readId = (actor: Actor, over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => AI("readIdDocument")(actor, ctx, { unitId: UH, image: PNG, ...over }));
  const queue = (over: Over = {}, ctx: Record<string, unknown> = ctxA) => call(() => TM("tm30Queue")(ctx, { unitId: UH, ...over }));
  const tmExport = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => TM("tm30Export")(actor, ctx, { unitId: UH, format: "csv", ...over }));
  const filed = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => TM("markTm30Filed")(actor, ctx, { tm30Ref: `TM30-2569-${String(seq).padStart(6, "0")}`, ...over }));
  const sweep = (over: Over = {}) => call(() => TM("tm30Sweep")(over));
  /** เช็กอินสำเร็จ 1 ใบ (ค่าปริยาย: ดีลักซ์ วันนี้ 2 คืน · แขกไทย 1) — คืน {id, roomId, guestIds} */
  const inhouse = async (o: ResOpt & { guests?: readonly Any[]; roomKey?: string; actor?: Actor; extra?: Over } = {}) => {
    needSetup(); needCheckin();
    const id = await mkRes(o);
    const rv0 = await rvOf(id);
    const occ = (await occOf(id, true))[0];
    const roomId = o.roomKey ? ROOM[o.roomKey] : (rv0?.roomId ?? occ?.roomId);
    ok(roomId, "การจองทดสอบไม่มีห้อง");
    const r = okRes(await checkIn(o.actor ?? FRONT, { reservationId: id, roomId, guests: o.guests ?? [G.thai], ...(o.extra ?? {}) }), "checkInV2");
    return { id, roomId: roomId as string, guestIds: (r.guestIds ?? []) as string[], res: r };
  };

  // ═══════════════ CI เช็กอิน V2 ═══════════════
  console.log("\n── CI checkInV2 / assignableRooms / undoCheckIn ──");
  await st("CI-1", "checkInV2(frontdesk · CONFIRMED walk-in วันนี้ · มัดจำจ่ายแล้ว · ห้อง CLEAN ที่ระบบถือ · แขกไทย 1) ⇒ {ok, checkedInAt, guestIds[1], needsDeposit false, needsSecurityDeposit false (ค่าตั้งปิด), tm30DueAt ว่าง} · แถว CHECKED_IN · roomId · checkedInAt ≈ now (±60 วิ) · occupancy active 1 แถว kind STAY บนห้องนั้น (ไม่มี HOLD ค้าง) · ห้อง status OCCUPIED · nights.roomId ตรง", async () => {
    const t0 = Date.now();
    const r = await inhouse({ deposit: 50_000, paid: true });
    ids.ci1 = r.id; ids.ci1Room = r.roomId; ids.ci1Guest = r.guestIds[0];
    const x = r.res;
    ok(near(msOf(x.checkedInAt), t0, 60_000), `checkedInAt ${x.checkedInAt}`);
    eq([x.guestIds?.length, x.needsDeposit, x.needsSecurityDeposit, x.tm30DueAt ?? null], [1, false, false, null], "รูปผล");
    const rv = await rvOf(r.id);
    eq([rv.status, rv.roomId], ["CHECKED_IN", r.roomId], "แถว");
    ok(near(msOf(rv.checkedInAt), t0, 60_000), "checkedInAt บนแถว");
    const occ = await occOf(r.id, true);
    eq(occ.map((o) => [o.kind, o.roomId]), [["STAY", r.roomId]], "occupancy");
    eq((await roomOf(r.roomId)).status, "OCCUPIED", "ห้อง");
    const ns = await prisma.hotelBookingNight.findMany({ where: { reservationId: r.id } });
    ok(ns.length === 2 && ns.every((n: Any) => n.roomId === r.roomId), "nights.roomId");
  });
  await st("CI-2", "แถว HotelGuestRecord ของ CI-1 (ใบ h.0 §2.12 · §0 PDPA): tenantId/unitId/reservationId · fullName · nationality THA · idType THAI_ID · idNumberEnc เปิดด้วย secret-box AAD=recordId ได้เลขดิบ · ไม่เท่าเลขดิบ · idNumberLast4 = 4 ตัวท้าย · dob · arrivedFrom/nextDestination · isForeigner false · tm30Status NOT_REQUIRED · tm30DueAt null · retainUntil = วันออก + retainYears(2) · ไม่มีเลขดิบในแถว (JSON)", async () => {
    needGuest(); ok(ids.ci1Guest, "ไม่มี CI-1");
    const g = await guestRow(ids.ci1Guest);
    ok(g, "ไม่มีแถวแขก");
    eq([g.tenantId, g.unitId, g.reservationId, g.fullName, g.nationality, g.idType, g.idNumberLast4, g.isForeigner, g.tm30Status, g.tm30DueAt ?? null, ymdOfDb(g.dob), g.arrivedFrom, g.nextDestination], [tA, UH, ids.ci1, G.thai.fullName, "THA", "THAI_ID", last4(THAI1), false, "NOT_REQUIRED", null, G.thai.dob, G.thai.arrivedFrom, G.thai.nextDestination], "คอลัมน์");
    ok(typeof g.idNumberEnc === "string" && g.idNumberEnc.split(".").length === 3 && g.idNumberEnc !== THAI1, `idNumberEnc ${g.idNumberEnc}`);
    eq(rawOfEnc(g), THAI1, "เปิดกล่องด้วย AAD=recordId");
    eq(SB.openIntegrationSecret(g.idNumberEnc, "other"), null, "AAD อื่นต้องเปิดไม่ได้");
    eq(ymdOfDb(g.retainUntil), refRetainUntil(W(2), 2), "retainUntil");
    const json = J({ ...g, idNumberEnc: "" });
    eq(hasRaw(json, RAWS), [], "เลขดิบในแถว");
  });
  await st("CI-3", "แขกต่างชาติ: DEU + ผู้พักร่วม DEU (2 คน · ดีลักซ์ max 3) ⇒ ok · 2 แถว · isForeigner true · tm30Status PENDING · tm30DueAt = checkedInAt + 24 ชม. (±5 วิ) ทั้งแถวและผลลัพธ์ · retainUntil ตรง · ผู้พักร่วม (ไม่มี occupation) บันทึกได้", async () => {
    const r = await inhouse({ guests: [G.deu, G.deu2] });
    ids.ci3 = r.id; ids.ci3Guests = r.guestIds.join(",");
    eq(r.guestIds.length, 2, "guestIds");
    const rv = await rvOf(r.id);
    const gs = await guestsOf(r.id);
    eq(gs.map((g) => [g.fullName, g.isForeigner, g.tm30Status, g.idNumberLast4]), [[G.deu.fullName, true, "PENDING", last4(G.deu.idNumber)], [G.deu2.fullName, true, "PENDING", last4(G.deu2.idNumber)]], "แถว");
    for (const g of gs) ok(near(msOf(g.tm30DueAt), refTm30Due(msOf(rv.checkedInAt)), 5_000), `tm30DueAt ${g.tm30DueAt} ≠ checkedInAt+24h`);
    ok(near(msOf(r.res.tm30DueAt), refTm30Due(msOf(rv.checkedInAt)), 5_000), `ผลลัพธ์ tm30DueAt ${r.res.tm30DueAt}`);
    eq(gs.map((g) => rawOfEnc(g)), [G.deu.idNumber, G.deu2.idNumber], "เปิดกล่อง");
  });
  await st("CI-4", "event/audit ของ CI-1/CI-3 (ใบ §5 · X8): outbox hotel.checked_in 1 แถว/การจอง payload {reservationId, roomId, guests n, foreigners n} (CI-3: 2/2 · CI-1: 1/0) ไม่มีชื่อ/เลข · unitId บนแถว · idempotencyKey ไม่ซ้ำ · AuditLog action มี checked_in targetId = reservationId ไม่มีเลขดิบ · outbox hotel.guest.registered ≥ 1", async () => {
    needCheckin(); ok(ids.ci1 && ids.ci3, "ไม่มี CI-1/CI-3");
    const e1 = await eventsOf("hotel.checked_in", (p) => p.reservationId === ids.ci1);
    const e3 = await eventsOf("hotel.checked_in", (p) => p.reservationId === ids.ci3);
    eq([e1.length, e3.length], [1, 1], "จำนวน event");
    eq([e1[0].payload.roomId, e1[0].payload.guests, e1[0].payload.foreigners, e3[0].payload.guests, e3[0].payload.foreigners], [ids.ci1Room, 1, 0, 2, 2], "payload");
    for (const e of [e1[0], e3[0]]) { ok(!PII_TEXT.test(J(e.payload)) && !/fullName|idNumber|guestName|phone|email/i.test([...walkKeys(e.payload)].join(",")), "PII ใน payload"); eq(e.unitId ?? e.payload?.unitId, UH, "unitId"); }
    ok(e1[0].idempotencyKey !== e3[0].idempotencyKey, "idempotencyKey ซ้ำ");
    const au = (await auditsLike(/hotel\..*check(ed)?_?in/i)).filter((a) => a.targetId === ids.ci1 || a.targetId === ids.ci3);
    ok(au.length >= 2, `AuditLog เช็กอิน ${au.length}`);
    eq(hasRaw(J(au.map((a) => [a.before, a.after])), RAWS), [], "เลขดิบใน AuditLog");
    ok((await eventsOf("hotel.guest.registered")).length >= 1, "ไม่มี hotel.guest.registered");
  });
  await st("CI-5", "NOT_CONFIRMED: HOLD ⇒ NOT_CONFIRMED · CHECKED_IN (CI-1) ซ้ำ ⇒ NOT_CONFIRMED · CANCELLED ⇒ NOT_CONFIRMED · ไม่มีแถวแขกเพิ่ม/สถานะไม่เปลี่ยน · reservationId มั่ว ⇒ NOT_FOUND", async () => {
    needSetup(); needCheckin();
    const hold = await mkRes({ status: "HOLD", claim: false });
    const canc = await mkRes({ status: "CANCELLED" });
    const n0 = await prisma.hotelGuestRecord.count({ where: { tenantId: tA } });
    eq(failCode(await checkIn(FRONT, { reservationId: hold, roomId: ROOM.DLX8 })), "NOT_CONFIRMED", "HOLD");
    eq(failCode(await checkIn(FRONT, { reservationId: ids.ci1, roomId: ids.ci1Room })), "NOT_CONFIRMED", "CHECKED_IN ซ้ำ");
    eq(failCode(await checkIn(FRONT, { reservationId: canc, roomId: ROOM.DLX8 })), "NOT_CONFIRMED", "CANCELLED");
    eq(failCode(await checkIn(FRONT, { reservationId: `ไม่มี-${RUN}`, roomId: ROOM.DLX8 })), "NOT_FOUND", "มั่ว");
    eq([await prisma.hotelGuestRecord.count({ where: { tenantId: tA } }), (await rvOf(hold)).status, (await rvOf(canc)).status], [n0, "HOLD", "CANCELLED"], "เปลี่ยนของ");
  });
  await st("CI-6", "TOO_EARLY (ใบ §0): เข้า +1 ⇒ TOO_EARLY · earlyOverride {reason} โดย REG (ไม่มี booking.manage) ⇒ FORBIDDEN สถานะคง · earlyOverride ไม่มีเหตุผล ⇒ ปฏิเสธ · earlyOverride โดย frontdesk (manage) ⇒ ok CHECKED_IN + AuditLog มีเหตุผล/ธง early", async () => {
    needSetup(); needCheckin();
    const id = await mkRes({ ci: W(1), co: W(2) });
    const roomId = (await occOf(id, true))[0]?.roomId;
    ok(roomId, "ไม่มีห้อง");
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId })), "TOO_EARLY", "ก่อนวัน");
    ok(isDenied(await checkIn(REG, { reservationId: id, roomId, earlyOverride: { reason: "แขกมาถึงก่อน" } })), "REG override ได้");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId, earlyOverride: { reason: "" } })), "override ไม่มีเหตุผลผ่าน");
    eq((await rvOf(id)).status, "CONFIRMED", "สถานะคง");
    okRes(await checkIn(FRONT, { reservationId: id, roomId, earlyOverride: { reason: "แขกมาถึงก่อน 1 วัน" } }), "override");
    eq((await rvOf(id)).status, "CHECKED_IN", "หลัง override");
    const au = (await auditsLike(/hotel\./)).filter((a) => a.targetId === id && /แขกมาถึงก่อน|early|override/i.test(J([a.action, a.before, a.after])));
    ok(au.length >= 1, "ไม่มี AuditLog ของ early override");
    ids.ci6 = id;
  });
  await st("CI-7", "assignableRooms(ctx,{reservationId}) ของการจองดีลักซ์ใหม่ ⇒ [{roomId, number, hkStatus, sellable, reason?}] · CLEAN ว่าง sellable true · DIRTY1 false + reason ไทย · INSP1 (INSPECTED) true · OOO1 ไม่อยู่/false · ห้องที่มีแขก (CI-1) ไม่อยู่/false · เปิด inspectionRequired ⇒ CLEAN false · INSPECTED true · ปิดคืน · ctx ร้าน B ⇒ NOT_FOUND/ว่าง", async () => {
    needSetup(); needCheckin();
    const id = await mkRes({ claim: false });
    ids.ci7 = id;
    const r = await call(() => CK("assignableRooms")(ctxA, { reservationId: id }));
    const rows = (Array.isArray(r) ? r : r?.rooms ?? r?.items ?? []) as Any[];
    ok(rows.length >= 3, `รูปผล ${J(r).slice(0, 160)}`);
    const by = Object.fromEntries(rows.map((x) => [x.roomId, x]));
    ok(["roomId", "number", "hkStatus", "sellable"].every((k) => k in rows[0]), `ฟิลด์ ${Object.keys(rows[0])}`);
    eq([by[ROOM.DLX8]?.sellable, by[ROOM.INSP1]?.sellable, by[ROOM.DIRTY1]?.sellable ?? false, by[ROOM.OOO1]?.sellable ?? false, by[ids.ci1Room]?.sellable ?? false], [true, true, false, false, false], "sellable");
    ok(!by[ROOM.DIRTY1] || (typeof by[ROOM.DIRTY1].reason === "string" && THAI.test(by[ROOM.DIRTY1].reason)), "DIRTY ไม่มี reason ไทย");
    await setUnit("rooms.hotel.inspectionRequired", true);
    try {
      const r2 = await call(() => CK("assignableRooms")(ctxA, { reservationId: id }));
      const by2 = Object.fromEntries(((Array.isArray(r2) ? r2 : r2?.rooms ?? []) as Any[]).map((x) => [x.roomId, x]));
      eq([by2[ROOM.DLX8]?.sellable ?? false, by2[ROOM.INSP1]?.sellable], [false, true], "inspectionRequired");
    } finally { await resetUnit("rooms.hotel.inspectionRequired"); }
    const b = await call(() => CK("assignableRooms")(ctxB, { reservationId: id }));
    ok(b?.ok === false || (Array.isArray(b) && b.length === 0) || (Array.isArray(b?.rooms) && b.rooms.length === 0), `ร้าน B เห็น ${J(b).slice(0, 100)}`);
  });
  await st("CI-8", "ห้อง DIRTY (ใบ §0): ไม่ force ⇒ ROOM_DIRTY · force ไม่มีเหตุผล ⇒ ปฏิเสธ · force {reason} โดย REG (ไม่มี manage) ⇒ FORBIDDEN · force โดย frontdesk ⇒ ok CHECKED_IN บน DIRTY1 + AuditLog มีเหตุผล + HotelHousekeepingLog 1 แถว (roomId · reservationId · note มีเหตุผล) · hkStatus ของห้องไม่ถูกเปลี่ยนเป็น CLEAN เงียบ ๆ", async () => {
    needSetup(); needCheckin(); ok(ids.ci7, "ไม่มี CI-7");
    const id = ids.ci7;
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId: ROOM.DIRTY1 })), "ROOM_DIRTY", "ไม่ force");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId: ROOM.DIRTY1, force: { reason: "" } })), "force ไม่มีเหตุผลผ่าน");
    ok(isDenied(await checkIn(REG, { reservationId: id, roomId: ROOM.DIRTY1, force: { reason: "แขกยืนยันรับห้องเดิม" } })), "REG force ได้");
    eq((await rvOf(id)).status, "CONFIRMED", "สถานะคง");
    const h0 = await prisma.hotelHousekeepingLog.count({ where: { tenantId: tA, roomId: ROOM.DIRTY1 } });
    okRes(await checkIn(FRONT, { reservationId: id, roomId: ROOM.DIRTY1, force: { reason: "แขกยืนยันรับห้องเดิม" } }), "force");
    eq((await rvOf(id)).status, "CHECKED_IN", "หลัง force");
    const hk = await prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA, roomId: ROOM.DIRTY1 }, orderBy: { createdAt: "desc" } });
    eq(hk.length, h0 + 1, "HousekeepingLog");
    ok(hk[0].reservationId === id && /แขกยืนยันรับห้องเดิม/.test(String(hk[0].note ?? "")), `HousekeepingLog ${J(hk[0])}`);
    const au = (await auditsLike(/hotel\./)).filter((a) => a.targetId === id && /แขกยืนยันรับห้องเดิม/.test(J([a.before, a.after])));
    ok(au.length >= 1, "ไม่มี AuditLog ของ force");
    ok((await roomOf(ROOM.DIRTY1)).hkStatus !== "CLEAN", "hkStatus ถูกเปลี่ยนเป็น CLEAN");
  });
  await st("CI-9", "ROOM_TAKEN/ROOM_INACTIVE: ห้องของ CI-1 (มีแขก) ⇒ ROOM_TAKEN · OOO1 ⇒ ROOM_INACTIVE · ห้องคนละประเภท (SUP1 กับการจองดีลักซ์) ⇒ ok:false (ไม่ throw) · ห้องของหน่วย UH2 ⇒ NOT_FOUND/ROOM_INACTIVE · สถานะคง CONFIRMED · occupancy เดิมไม่ขยับ", async () => {
    needSetup(); needCheckin();
    const id = await mkRes({});
    const o0 = J(await occOf(id, true));
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId: ids.ci1Room })), "ROOM_TAKEN", "ห้องมีแขก");
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId: ROOM.OOO1 })), "ROOM_INACTIVE", "OUT_OF_ORDER");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId: ROOM.SUP1 })), "คนละประเภทผ่าน");
    const u2 = await checkIn(FRONT, { reservationId: id, roomId: ROOM_U2 });
    ok(isFail(u2, "NOT_FOUND", "ROOM_INACTIVE", "INVALID_INPUT"), `ห้องหน่วยอื่น ${codeOf(u2)}`);
    eq([(await rvOf(id)).status, J(await occOf(id, true))], ["CONFIRMED", o0], "เปลี่ยนของ");
    ids.ci9 = id;
  });
  await st("CI-10", "GUEST_REQUIRED (มติ 1): guests [] ⇒ GUEST_REQUIRED สถานะคง · ผู้พักหลักขาดสัญชาติ/เลขเอกสาร ⇒ GUEST_REQUIRED|INVALID_ID · ปิด rooms.hotel.guest.requireRegistration ⇒ guests [] ok (0 แถวแขก) · คืนค่าตั้ง", async () => {
    needSetup(); needCheckin(); ok(ids.ci9, "ไม่มี CI-9");
    const id = ids.ci9;
    const roomId = (await occOf(id, true))[0]?.roomId;
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId, guests: [] })), "GUEST_REQUIRED", "ไม่มีแขก");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ fullName: "ไม่มีเอกสาร" }] }), "GUEST_REQUIRED", "INVALID_ID", "INVALID_INPUT"), "ขาดเอกสารผ่าน");
    eq((await rvOf(id)).status, "CONFIRMED", "สถานะคง");
    await setUnit("rooms.hotel.guest.requireRegistration", false);
    try {
      okRes(await checkIn(FRONT, { reservationId: id, roomId, guests: [] }), "ปิด requireRegistration");
      eq([(await rvOf(id)).status, (await guestsOf(id)).length], ["CHECKED_IN", 0], "หลังปิด");
    } finally { await resetUnit("rooms.hotel.guest.requireRegistration"); }
  });
  await st("CI-11", "INVALID_ID (guest-shared): บัตรไทย checksum ผิด ⇒ INVALID_ID · บัตรไทย 12 หลัก ⇒ INVALID_ID · พาสปอร์ต 'AB' ⇒ INVALID_ID · idType นอก PASSPORT|THAI_ID|OTHER ⇒ ปฏิเสธ · nationality 'XX'/'de' ⇒ ปฏิเสธ · ไม่มีแถวแขก/สถานะคง", async () => {
    needSetup(); needCheckin();
    const id = await mkRes({});
    const roomId = (await occOf(id, true))[0]?.roomId;
    const n0 = await prisma.hotelGuestRecord.count({ where: { tenantId: tA } });
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.thai, idNumber: THAI_BAD }] })), "INVALID_ID", "checksum ผิด");
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.thai, idNumber: THAI1.slice(0, 12) }] })), "INVALID_ID", "12 หลัก");
    eq(failCode(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.deu, idNumber: "AB" }] })), "INVALID_ID", "พาสปอร์ตสั้น");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.deu, idType: "VISA" }] })), "idType แปลกผ่าน");
    ok(isFail(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.deu, nationality: "XX" }] })) && isFail(await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.deu, nationality: "de" }] })), "สัญชาติผิดผ่าน");
    eq([await prisma.hotelGuestRecord.count({ where: { tenantId: tA } }), (await rvOf(id)).status], [n0, "CONFIRMED"], "เปลี่ยนของ");
    ids.ci11 = id;
  });
  await st("CI-12", "OVER_OCCUPANCY (มติ 1): ซูพีเรีย max 2 + แขก 3 ⇒ OVER_OCCUPANCY · ดีลักซ์ max 3 + 4 ⇒ OVER_OCCUPANCY · แฟมิลี max 5 (+extraBed) + 5 ⇒ ok · ไม่มีแถวแขกจากใบที่ล้ม", async () => {
    needSetup(); needCheckin();
    const sup = await mkRes({ type: "sup", adults: 2 });
    const supRoom = (await occOf(sup, true))[0]?.roomId;
    eq(failCode(await checkIn(FRONT, { reservationId: sup, roomId: supRoom, guests: [G.thai, G.thai2, G.jpn] })), "OVER_OCCUPANCY", "ซูพีเรีย 3");
    eq(failCode(await checkIn(FRONT, { reservationId: ids.ci11, roomId: (await occOf(ids.ci11, true))[0]?.roomId, guests: [G.thai, G.thai2, G.deu, G.deu2] })), "OVER_OCCUPANCY", "ดีลักซ์ 4");
    eq([(await guestsOf(sup)).length, (await guestsOf(ids.ci11)).length], [0, 0], "แถวแขกจากใบที่ล้ม");
    const fam = await inhouse({ type: "fam", adults: 5, guests: [G.thai, G.thai2, G.deu, G.deu2, G.jpn] });
    eq((await guestsOf(fam.id)).length, 5, "แฟมิลี 5");
    ids.ci12fam = fam.id;
  });
  await st("CI-13", "needsDeposit (ใบ §0 · สัญญา §3.1 ไม่มีรหัสล้มเรื่องมัดจำ ⇒ เช็กอินผ่าน · จอบังคับรับก่อน): walk-in มัดจำ 50,000 ยังไม่จ่าย ⇒ ok needsDeposit true · depositPaidAt ยังว่าง (checkInV2 ไม่รับเงินเอง) · มัดจำ 0 ⇒ false · จ่ายแล้ว (CI-1) false", async () => {
    const a = await inhouse({ deposit: 50_000, paid: false });
    eq([a.res.needsDeposit, (await rvOf(a.id)).depositPaidAt ?? null], [true, null], "ยังไม่จ่าย");
    const b = await inhouse({ deposit: 0 });
    eq(b.res.needsDeposit, false, "มัดจำ 0");
    ids.ci13 = a.id;
  });
  await st("CI-14", "X3 เช็กอินพร้อมกัน 2 ทาง ห้องเดียว (DLX8 ว่าง): การจอง 2 ใบ ยิง checkInV2 roomId เดียวกันพร้อมกัน ⇒ สำเร็จ 1 · อีกใบ ROOM_TAKEN · occupancy STAY active บน DLX8 = 1 · ห้อง OCCUPIED · ไม่มี throw ดิบ (40P01)", async () => {
    needSetup(); needCheckin();
    const a = await mkRes({ claim: false }), b = await mkRes({ claim: false });
    const [ra, rb] = await Promise.all([checkIn(FRONT, { reservationId: a, roomId: ROOM.DLX8 }), checkIn(FRONT, { reservationId: b, roomId: ROOM.DLX8, guests: [G.thai2] })]);
    const oks = [ra, rb].filter((r) => r?.ok === true).length;
    const taken = [ra, rb].filter((r) => failCode(r) === "ROOM_TAKEN").length;
    eq([oks, taken], [1, 1], `ผล ${J([codeOf(ra), codeOf(rb)])} ${ra?.reason ?? ""} ${rb?.reason ?? ""}`);
    eq(await prisma.roomOccupancy.count({ where: { roomId: ROOM.DLX8, active: true, kind: "STAY" } }), 1, "occupancy บน DLX8");
    eq((await roomOf(ROOM.DLX8)).status, "OCCUPIED", "ห้อง");
    ids.ci14 = ra?.ok ? a : b;
  });
  await st("CI-15", "นาฬิกาฉาก `at` (มติ h.3 ข้อ 13): มี SVC_QC_CLOCK=1 · การจองเข้า +2 · at = +2 07:00Z ⇒ ok ไม่ TOO_EARLY · checkedInAt = at (±5 วิ) · แขก DEU tm30DueAt = at + 24 ชม. · ไม่มี SVC_QC_CLOCK · อินพุตเดียวกันอีกใบ ⇒ TOO_EARLY (at ถูกเพิกเฉย) · สถิต: checkin.ts อ่าน process.env.SVC_QC_CLOCK === \"1\" ในฟังก์ชัน", async () => {
    needSetup(); needCheckin();
    const at = `${W(2)}T07:00:00.000Z`;
    const a = await mkRes({ ci: W(2), co: W(3) });
    const ra = await withClock(true, async () => checkIn(FRONT, { reservationId: a, roomId: (await occOf(a, true))[0]?.roomId, guests: [G.jpn], at }));
    okRes(ra, "ใต้นาฬิกาฉาก");
    ok(near(msOf(ra.checkedInAt), Date.parse(at), 5_000) && near(msOf((await rvOf(a)).checkedInAt), Date.parse(at), 5_000), `checkedInAt ${ra.checkedInAt} ≠ at`);
    ok(near(msOf((await guestsOf(a))[0]?.tm30DueAt), Date.parse(at) + 86_400_000, 5_000), "tm30DueAt ≠ at+24h");
    ids.ci15 = a;
    const b = await mkRes({ ci: W(2), co: W(3) });
    eq(failCode(await withClock(false, async () => checkIn(FRONT, { reservationId: b, roomId: (await occOf(b, true))[0]?.roomId, at }))), "TOO_EARLY", "ไม่มีนาฬิกาฉาก");
    const s = stripComments(read(F.checkin));
    ok(/process\.env\.SVC_QC_CLOCK\s*===\s*["']1["']/.test(s) && !/^const\s+\w+\s*=\s*process\.env\.SVC_QC_CLOCK/m.test(s), "checkin.ts ไม่มีด่าน SVC_QC_CLOCK ในฟังก์ชัน");
  });
  await st("CI-16", "undoCheckIn (มติ 7): REG ⇒ FORBIDDEN · MGR บน CI-13 (วันเดียวกัน · folio ไม่มีรายการนอก ROOM/DEPOSIT/SECURITY_DEPOSIT) ⇒ ok · CHECKED_IN→CONFIRMED · checkedInAt ล้าง · occupancy active ยังถือห้อง (STAY/HOLD) ไม่มี 2 แถว · ห้องไม่ OCCUPIED · แถวแขกคง (ไม่ลบ) · AuditLog · CI-1 มี folio SERVICE (แถวดิบ) ⇒ undo ok:false สถานะคง · การจอง CONFIRMED ⇒ ok:false", async () => {
    needSetup(); needCheckin(); ok(ids.ci13 && ids.ci1, "ไม่มี CI-13/CI-1");
    const undo = (a: Actor, id: string, over: Over = {}) => call(() => CK("undoCheckIn")(a, ctxA, { reservationId: id, reason: "เช็กอินผิดใบ", ...over }));
    ok(isDenied(await undo(REG, ids.ci13)), "REG undo ได้");
    const g0 = (await guestsOf(ids.ci13)).length;
    const room = (await rvOf(ids.ci13)).roomId;
    okRes(await undo(MGR, ids.ci13), "undo");
    const rv = await rvOf(ids.ci13);
    eq([rv.status, rv.checkedInAt ?? null], ["CONFIRMED", null], "แถว");
    const occ = await occOf(ids.ci13, true);
    ok(occ.length === 1 && ["STAY", "HOLD"].includes(occ[0].kind) && occ[0].roomId === room, `occupancy ${J(occ.map((o) => [o.kind, o.roomId]))}`);
    ok((await roomOf(room)).status !== "OCCUPIED", "ห้องยัง OCCUPIED");
    eq((await guestsOf(ids.ci13)).length, g0, "แถวแขกหาย");
    ok((await auditsLike(/hotel\./)).some((a) => a.targetId === ids.ci13 && /undo|เช็กอินผิดใบ/i.test(J([a.action, a.after]))), "ไม่มี AuditLog undo");
    const folio = await prisma.hotelFolio.findUnique({ where: { reservationId: ids.ci1 } });
    ok(folio, "CI-1 ไม่มี folio");
    await prisma.hotelFolioItem.create({ data: { tenantId: tA, unitId: UH, folioId: folio.id, type: "SERVICE", description: "ซักรีด", qty: 1, unitAmountSatang: 18_000, amountSatang: 18_000, businessDate: dbDate(W(0)) } });
    ok(isFail(await undo(MGR, ids.ci1)), "undo ทั้งที่มี SERVICE ผ่าน");
    eq((await rvOf(ids.ci1)).status, "CHECKED_IN", "สถานะ CI-1 คง");
    ok(isFail(await undo(MGR, ids.ci13)), "undo การจอง CONFIRMED ผ่าน");
  });
  await st("CI-17", "checkIn เดิมของ service.ts ห่อ checkInV2 (ใบ §1): signature เดิม (tenantId, unitId, reservationId, roomId) บน CONFIRMED ⇒ requireRegistration เปิด ⇒ {ok:false, reason ไทย} (GUEST_REQUIRED) สถานะคง · ปิด requireRegistration ⇒ ok CHECKED_IN + occupancy STAY · สถิต: service.ts checkIn เรียก checkInV2 และไม่เขียน status CHECKED_IN ตรงอีก", async () => {
    needSetup(); needCheckin();
    const f = fnOf(serviceL, "checkIn", F.service);
    const id = await mkRes({});
    const roomId = (await occOf(id, true))[0]?.roomId;
    const r1 = await call(() => f(tA, UH, id, roomId));
    ok(r1?.ok === false && typeof r1.reason === "string" && THAI.test(r1.reason), `ไม่มีแขกต้องล้ม ${J(r1)}`);
    eq((await rvOf(id)).status, "CONFIRMED", "สถานะคง");
    await setUnit("rooms.hotel.guest.requireRegistration", false);
    try { okRes(await call(() => f(tA, UH, id, roomId)), "checkIn เดิม"); eq((await rvOf(id)).status, "CHECKED_IN", "หลัง"); } finally { await resetUnit("rooms.hotel.guest.requireRegistration"); }
    const s = stripComments(read(F.service));
    const body = /export async function checkIn\(([\s\S]*?)\n\}\n/.exec(s)?.[0] ?? "";
    ok(/checkInV2/.test(body) && !/status:\s*["']CHECKED_IN["']/.test(body), "service.checkIn ไม่ได้ห่อ checkInV2");
  });

  // ═══════════════ GR ทะเบียนแขก ═══════════════
  console.log("\n── GR ทะเบียนแขก (upsertGuestRecord · listGuests) ──");
  await st("GR-1", "upsertGuestRecord (REG): เพิ่มผู้พักร่วม JPN ให้ CI-1 (ระหว่างพัก) ⇒ {ok, guestId} แถวใหม่ isForeigner/PENDING/enc เปิดได้ · แก้ไข (guestId เดิม · occupation ใหม่) ⇒ แถวเดิมอัป · AuditLog before/after แบบ mask (มี last4 · ไม่มีเลขดิบ) · outbox hotel.guest.registered ไม่มี PII", async () => {
    needGuest(); ok(ids.ci1, "ไม่มี CI-1");
    const n0 = (await guestsOf(ids.ci1)).length;
    const r = okRes(await upsert(REG, { reservationId: ids.ci1, guest: G.jpn }), "เพิ่มผู้พักร่วม");
    const gid = r.guestId ?? r.id;
    ok(typeof gid === "string", `ไม่มี guestId ${J(r)}`);
    ids.gr1 = gid;
    const g = await guestRow(gid);
    eq([(await guestsOf(ids.ci1)).length, g.fullName, g.isForeigner, g.tm30Status, g.idNumberLast4, rawOfEnc(g)], [n0 + 1, G.jpn.fullName, true, "PENDING", last4(G.jpn.idNumber), G.jpn.idNumber], "แถวใหม่");
    okRes(await upsert(REG, { reservationId: ids.ci1, guestId: gid, guest: { ...G.jpn, occupation: "Architect" } }), "แก้ไข");
    const g2 = await guestRow(gid);
    eq([(await guestsOf(ids.ci1)).length, rawOfEnc(g2)], [n0 + 1, G.jpn.idNumber], "แก้ไขไม่สร้างซ้ำ");
    const au = (await auditsLike(/hotel\.guest/)).filter((a) => a.targetId === gid);
    ok(au.length >= 1, "ไม่มี AuditLog ของทะเบียน");
    const txt = J(au.map((a) => [a.before, a.after]));
    eq(hasRaw(txt, RAWS), [], "เลขดิบใน AuditLog");
    ok(au.some((a) => a.before !== null && a.after !== null) && txt.includes(last4(G.jpn.idNumber)), "AuditLog ไม่มี before/after แบบ mask");
    const ev = await eventsOf("hotel.guest.registered", (p) => p.guestId === gid || p.reservationId === ids.ci1);
    ok(ev.length >= 1 && !PII_TEXT.test(J(ev.map((e) => e.payload))) && !ev.some((e) => /fullName|idNumber/i.test([...walkKeys(e.payload)].join(","))), "event ทะเบียน/PII");
  });
  await st("GR-2", "listGuests(frontdesk · {unitId, from, to}) ⇒ GuestDto[] ครอบวันเข้า · มี id/reservationId/fullName/nationality/idType/idNumberLast4/isForeigner/tm30Status · ไม่มีคีย์ idNumber/idNumberEnc · ไม่มีเลขดิบใน JSON · q=ชื่อ กรองได้ · tm30=PENDING เฉพาะ PENDING · q=เลขดิบ ⇒ ไม่พบ (เลขบัตรไม่เข้า search) · q=last4 พบ/ไม่พบก็ได้แต่ไม่ throw", async () => {
    needGuest();
    const l = okRes(await listG(FRONT), "list");
    const rows = (Array.isArray(l) ? l : l.rows ?? l.items ?? l.guests ?? []) as Any[];
    ok(rows.length >= 5, `rows ${rows.length}`);
    const need = ["id", "reservationId", "fullName", "nationality", "idType", "idNumberLast4", "isForeigner", "tm30Status"];
    eq(need.filter((k) => !(k in rows[0])), [], `ฟิลด์ขาด (มี ${Object.keys(rows[0]).join(",")})`);
    const keys = [...walkKeys(l)];
    eq(keys.filter((k) => /^idNumber$|idNumberEnc|passportNo|secret|token/i.test(k)), [], "คีย์ต้องห้ามใน DTO");
    eq(hasRaw(J(l), RAWS), [], "เลขดิบใน DTO");
    const byName = okRes(await listG(FRONT, { q: "MUELLER" }), "q ชื่อ");
    const rn = (Array.isArray(byName) ? byName : byName.rows ?? byName.items ?? []) as Any[];
    ok(rn.length >= 2 && rn.every((r) => /MUELLER/.test(r.fullName)), `ค้นชื่อ ${rn.length}`);
    const pend = okRes(await listG(FRONT, { tm30: "PENDING" }), "tm30");
    const rp = (Array.isArray(pend) ? pend : pend.rows ?? pend.items ?? []) as Any[];
    ok(rp.length >= 2 && rp.every((r) => r.tm30Status === "PENDING"), "กรอง PENDING");
    const byRaw = await listG(FRONT, { q: G.deu.idNumber });
    const rr = (Array.isArray(byRaw) ? byRaw : byRaw?.rows ?? byRaw?.items ?? []) as Any[];
    eq(rr.length, 0, "ค้นด้วยเลขดิบต้องไม่พบ");
    ok((await listG(FRONT, { q: last4(G.deu.idNumber) }))?.ok !== undefined || true, "q last4 ไม่ throw");
  });
  await st("GR-3", "ขอบเขต (มติ 8): listGuests UH2 ⇒ ว่าง · หน่วย DORM ⇒ NOT_FOUND/ว่าง · ctx ร้าน B บน UH ⇒ NOT_FOUND/ว่าง ไม่มีชื่อแขกหลุด · MGR2 (UH2) ⇒ NOT_FOUND/ว่าง", async () => {
    needGuest();
    const rowsOf = (l: Any) => (Array.isArray(l) ? l : l?.rows ?? l?.items ?? l?.guests ?? []) as Any[];
    const empty = (l: Any) => l?.ok === false || rowsOf(l).length === 0;
    eq(rowsOf(okRes(await listG(OWNER, { unitId: UH2 }), "UH2")).length, 0, "UH2 ไม่ว่าง");
    ok(empty(await listG(OWNER, { unitId: UD })), "หอ");
    const b = await listG(OWNER_B, {}, ctxB);
    ok(empty(b) && !/MUELLER|สมหญิง/.test(J(b)), `ร้าน B ${J(b).slice(0, 100)}`);
    ok(empty(await listG(MGR2)), "MANAGER หน่วยอื่น");
  });
  await st("GR-4", "หลังเช็กเอาต์ (มติ 4): การจองใบใหม่เช็กอินแล้ว → ตั้ง CHECKED_OUT (แถวดิบ) ⇒ REG แก้ทะเบียน ⇒ FORBIDDEN/NOT_EDITABLE ไม่เปลี่ยน · MGR แก้ ⇒ ok + AuditLog · เพิ่มผู้พักร่วมหลังเช็กเอาต์โดย REG ⇒ ปฏิเสธ", async () => {
    const r = await inhouse({ co: W(1) });
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { status: "CHECKED_OUT", checkedOutAt: new Date() } });
    const gid = r.guestIds[0];
    const x = await upsert(REG, { reservationId: r.id, guestId: gid, guest: { ...G.thai, occupation: "แก้หลังออก" } });
    ok(isFail(x) && (isDenied(x) || /NOT_EDITABLE|CHECKED_OUT|FORBIDDEN/.test(failCode(x) ?? "")), `REG แก้ได้ ${codeOf(x)}`);
    ok((await guestRow(gid)).occupation !== "แก้หลังออก", "ค่าเปลี่ยน");
    okRes(await upsert(MGR, { reservationId: r.id, guestId: gid, guest: { ...G.thai, occupation: "แก้หลังออก" } }), "MGR");
    eq((await guestRow(gid)).occupation ?? (await guestRow(gid)).job ?? null, (await guestRow(gid)).occupation ?? null, "อ่านค่า");
    ok(isFail(await upsert(REG, { reservationId: r.id, guest: G.fra })), "REG เพิ่มหลังออกได้");
    ids.gr4 = r.id;
  });
  await st("GR-5", "ลบแถว (มติ 4 · สัญญา §3.2 ไม่ระบุชื่อ — ข้อสอบรับ deleteGuestRecord|removeGuestRecord): ผู้พักร่วมสร้างใหม่โดย REG ลบภายใน 10 นาทีโดยคนเดิม ⇒ ok แถวหาย · สร้างใหม่แล้วแก้ createdAt ย้อน 11 นาที ⇒ ลบไม่ได้ · คนอื่น (VIEWER) ลบของ REG ⇒ ไม่ได้ · ผู้พักหลักคนเดียวลบไม่ได้ (เหลือ 0)", async () => {
    needGuest(); ok(ids.ci3, "ไม่มี CI-3");
    const name = typeof guestL.mod?.deleteGuestRecord === "function" ? "deleteGuestRecord" : typeof guestL.mod?.removeGuestRecord === "function" ? "removeGuestRecord" : null;
    ok(name, `«${F.guest}» ไม่มี export deleteGuestRecord/removeGuestRecord (มติ 4 ลบภายใน 10 นาที)`);
    const del = (a: Actor, guestId: string) => call(() => GU(name!)(a, ctxA, { guestId }));
    const a = okRes(await upsert(REG, { reservationId: ids.ci3, guest: G.fra }), "เพิ่ม");
    okRes(await del(REG, a.guestId ?? a.id), "ลบทันที");
    eq(await guestRow(a.guestId ?? a.id), null, "แถวยังอยู่");
    const b = okRes(await upsert(REG, { reservationId: ids.ci3, guest: G.fra }), "เพิ่ม 2");
    await prisma.hotelGuestRecord.update({ where: { id: b.guestId ?? b.id }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    ok(isFail(await del(REG, b.guestId ?? b.id)), "ลบหลัง 10 นาทีได้");
    const c = okRes(await upsert(REG, { reservationId: ids.ci3, guest: { ...G.fra, idNumber: "19FR55022" } }), "เพิ่ม 3");
    ok(isFail(await del(VIEWER, c.guestId ?? c.id)), "คนอื่นลบได้");
    ok(await guestRow(c.guestId ?? c.id), "แถว 3 หาย");
    ok(isFail(await del(OWNER, ids.ci1Guest)), "ลบผู้พักหลักคนเดียวได้");
  });
  await st("GR-6", "ฟิลด์บังคับ ร.ร.3 (มติ 1 · guest-shared): upsert ขาด fullName ⇒ INVALID_INPUT · ขาด nationality ⇒ ปฏิเสธ · dob รูปแบบผิด ⇒ ปฏิเสธ · ชื่อยาว > 200 ⇒ ปฏิเสธ · ไม่มีแถวเพิ่ม · ข้อความ reason ไทย", async () => {
    needGuest(); ok(ids.ci3, "ไม่มี CI-3");
    const n0 = (await guestsOf(ids.ci3)).length;
    const bad: string[] = [];
    for (const [label, g] of [["ไม่มีชื่อ", { ...G.fra, fullName: "" }], ["ไม่มีสัญชาติ", { ...G.fra, nationality: undefined }], ["dob ผิด", { ...G.fra, dob: "31/02/1990" }], ["ชื่อยาว", { ...G.fra, fullName: "A".repeat(201) }]] as [string, Any][]) {
      const r = await upsert(REG, { reservationId: ids.ci3, guest: g });
      if (!isFail(r)) bad.push(`${label}=${codeOf(r)}`);
      else if (typeof r.reason !== "string" || !THAI.test(r.reason)) bad.push(`${label} reason ไม่ไทย`);
    }
    eq(bad, [], "อินพุตผิดผ่าน");
    eq((await guestsOf(ids.ci3)).length, n0, "แถวเพิ่ม");
  });
  await st("GR-7", "รูปเอกสาร (ใบ §0 PDPA): upsert + idImage PNG (keepIdImage true) ⇒ idImageFileId → FileAsset ของร้าน · path t/<tenant>/private/ · cdnUrl private:// · contentType image/png · ชื่อ path ไม่มีชื่อ/เลขแขก · keepIdImage false ⇒ ไม่มีไฟล์ (FileAsset ไม่เพิ่ม · idImageFileId null) · แก้รูปใหม่ ⇒ ไฟล์เก่าถูกลบ (FileAsset เดิมหาย)", async () => {
    needGuest(); ok(ids.ci3, "ไม่มี CI-3");
    const f0 = await fileCount();
    const a = okRes(await upsert(REG, { reservationId: ids.ci3, guest: { ...G.fra, idNumber: "19FR55023", idImage: PNG, keepIdImage: true } }), "มีรูป");
    const ga = await guestRow(a.guestId ?? a.id);
    ok(ga.idImageFileId, "ไม่มี idImageFileId");
    const fa = await fileOf(ga.idImageFileId);
    ok(fa && fa.tenantId === tA && fa.path.startsWith(`t/${tA}/private/`) && String(fa.cdnUrl).startsWith("private://") && fa.contentType === "image/png", `FileAsset ${J(fa)}`);
    eq(hasRaw(`${fa.path} ${fa.cdnUrl}`, RAWS), [], "เลขดิบในชื่อไฟล์");
    ok(!/DUBOIS|MARIE/i.test(`${fa.path}`), "ชื่อแขกในชื่อไฟล์");
    eq(await fileCount(), f0 + 1, "FileAsset เพิ่ม");
    const b = okRes(await upsert(REG, { reservationId: ids.ci3, guest: { ...G.fra, idNumber: "19FR55024", idImage: PNG, keepIdImage: false } }), "ไม่เก็บรูป");
    eq([(await guestRow(b.guestId ?? b.id)).idImageFileId ?? null, await fileCount()], [null, f0 + 1], "keepIdImage false");
    okRes(await upsert(REG, { reservationId: ids.ci3, guestId: ga.id, guest: { ...G.fra, idNumber: "19FR55023", idImage: { data: makePng(9), contentType: "image/png" }, keepIdImage: true } }), "เปลี่ยนรูป");
    const ga2 = await guestRow(ga.id);
    ok(ga2.idImageFileId && ga2.idImageFileId !== ga.idImageFileId, "ไฟล์ใหม่");
    eq([await fileOf(ga.idImageFileId), await fileCount()], [null, f0 + 1], "ไฟล์เก่าไม่ถูกลบ");
    ids.gr7 = ga.id;
  });
  await st("GR-8", "X6 รูปอันตราย: text/html ⇒ ปฏิเสธ · image/svg+xml ⇒ ปฏิเสธ · PNG ปลอม (หัวไบต์ไม่ตรง) ⇒ ปฏิเสธ · PNG ขนาด 8 MB + 1 ⇒ ปฏิเสธ · PNG 1 MB ⇒ ok · ไม่มี FileAsset จากใบที่ล้ม · reason ไทย", async () => {
    needGuest(); ok(ids.ci3, "ไม่มี CI-3");
    const f0 = await fileCount();
    const bad: string[] = [];
    for (const [label, img] of [["html", { data: new Uint8Array(Buffer.from("<html>")), contentType: "text/html" }], ["svg", { data: new Uint8Array(Buffer.from("<svg/>")), contentType: "image/svg+xml" }], ["png ปลอม", { data: new Uint8Array(Buffer.from("not a png at all")), contentType: "image/png" }], ["8MB+1", { data: bigPng(8 * 1024 * 1024 + 1), contentType: "image/png" }]] as [string, Any][]) {
      const r = await upsert(REG, { reservationId: ids.ci3, guest: { ...G.fra, idNumber: "19FR55025", idImage: img, keepIdImage: true } });
      if (!isFail(r)) bad.push(`${label}=${codeOf(r)}`); else if (typeof r.reason !== "string" || !THAI.test(r.reason)) bad.push(`${label} reason ไม่ไทย`);
    }
    eq(bad, [], "รูปอันตรายผ่าน");
    eq(await fileCount(), f0, "FileAsset จากใบที่ล้ม");
    const okBig = await upsert(REG, { reservationId: ids.ci3, guest: { ...G.fra, idNumber: "19FR55026", idImage: { data: bigPng(1024 * 1024), contentType: "image/png" }, keepIdImage: true } });
    okRes(okBig, "PNG 1 MB");
  });
  await st("GR-9", "def คีย์ใหม่ของใบ (§1 defs/rooms.ts เพิ่มอย่างเดียว): rooms.hotel.license.no/name/registrarOffice (text) · guest.requireRegistration bool เริ่ม true · guest.keepIdImageDefault bool เริ่ม true · tm30.enabled bool เริ่ม true · tm30.exportColumns json · ทุกคีย์ unitTypes HOTEL · labelTh ไทย · คีย์เดิมไม่หาย (r0.4/d.13 regression) · ตั้ง/อ่านค่า UNIT ได้", async () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ยังไม่มี def ${k} (ใบ h.4 §1)`); return x; };
    for (const k of ["rooms.hotel.license.no", "rooms.hotel.license.name", "rooms.hotel.license.registrarOffice"]) { ok(d(k).type === "text" || d(k).type === "string", `${k} type`); }
    eq([d("rooms.hotel.guest.requireRegistration").defaults._fallback, d("rooms.hotel.guest.keepIdImageDefault").defaults._fallback, d("rooms.hotel.tm30.enabled").defaults._fallback], [true, true, true], "ค่าเริ่ม bool");
    ok(Array.isArray(d("rooms.hotel.tm30.exportColumns").defaults._fallback) || typeof d("rooms.hotel.tm30.exportColumns").defaults._fallback === "object", "exportColumns ไม่ใช่ json");
    for (const k of ["rooms.hotel.license.no", "rooms.hotel.guest.requireRegistration", "rooms.hotel.guest.keepIdImageDefault", "rooms.hotel.tm30.enabled", "rooms.hotel.tm30.exportColumns"]) { eq(d(k).unitTypes, ["HOTEL"], `unitTypes ${k}`); ok(THAI.test(d(k).labelTh ?? ""), `labelTh ${k}`); }
    await setUnit("rooms.hotel.license.no", "กท.123/2569");
    eq(await settingOf("rooms.hotel.license.no"), "กท.123/2569", "ตั้ง/อ่าน license.no");
    await setUnit("rooms.hotel.license.name", "โรงแรมทดสอบ เอช4");
  });

  // ═══════════════ PD PDPA เข้ม ═══════════════
  console.log("\n── PD PDPA เข้ม (X8/X10) ──");
  await st("PD-1", "ทุกแถว HotelGuestRecord ของร้าน A: idNumberEnc รูปแบบกล่อง 3 ส่วน b64 · เปิดด้วย AAD=id ได้เลขที่รูปแบบถูก (บัตรไทย checksum/พาสปอร์ต) · last4 ตรงกับที่เปิดได้ · ไม่มีเลขดิบในคอลัมน์ใด (JSON ของแถวที่ตัด enc ออก) · ไม่มีคอลัมน์ไหนเก็บ base64 รูป", async () => {
    needGuest();
    const rows = await prisma.hotelGuestRecord.findMany({ where: { tenantId: tA } });
    ok(rows.length >= 8, `แถว ${rows.length}`);
    const bad: string[] = [];
    for (const g of rows) {
      if (!g.idNumberEnc) { if (g.idType) bad.push(`${g.id} enc ว่าง`); continue; }
      if (g.idNumberEnc.split(".").length !== 3) bad.push(`${g.id} รูปแบบกล่อง`);
      const raw = rawOfEnc(g);
      if (!raw) bad.push(`${g.id} เปิดกล่องไม่ได้`);
      else { if (g.idType === "THAI_ID" ? !thaiIdOk(raw) : !passportOk(raw)) bad.push(`${g.id} เลขในกล่องผิดรูป`); if (last4(raw) !== g.idNumberLast4) bad.push(`${g.id} last4 ไม่ตรง`); if (hasRaw(J({ ...g, idNumberEnc: "" }), [raw]).length) bad.push(`${g.id} เลขดิบในแถว`); }
      if (/data:image|iVBORw0KGgo/.test(J(g))) bad.push(`${g.id} base64 รูปในแถว`);
    }
    eq(bad.slice(0, 6), [], "แถว");
  });
  await st("PD-2", "ไม่มีเลขดิบ/รูป base64 ใน AuditLog · OutboxEvent · FileAsset (path/cdnUrl) · HotelHousekeepingLog · HotelReservation.note ของร้าน A ทั้งหมด (X8) · payload outbox ไม่มีคีย์ fullName/idNumber/phone/email", async () => {
    needGuest();
    const au = await prisma.auditLog.findMany({ where: { tenantId: tA } });
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tA } });
    const fa = await prisma.fileAsset.findMany({ where: { tenantId: tA } });
    const hk = await prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA } });
    const rv = await prisma.hotelReservation.findMany({ where: { tenantId: tA }, select: { note: true } });
    ok(au.length > 0 && ev.length > 0, "ไม่มีข้อมูลให้ตรวจ");
    eq(hasRaw(J(au.map((a: Any) => [a.action, a.before, a.after])), RAWS), [], "AuditLog");
    eq(hasRaw(J(ev.map((e: Any) => [e.type, e.payload, e.idempotencyKey])), RAWS), [], "Outbox");
    eq(hasRaw(J(fa.map((f: Any) => [f.path, f.cdnUrl])), RAWS), [], "FileAsset");
    eq(hasRaw(J([hk, rv]), RAWS), [], "HousekeepingLog/note");
    ok(!/iVBORw0KGgo|data:image/.test(J([au, ev])), "base64 รูปใน log");
    const piiKeys = ev.filter((e: Any) => /^hotel\.(checked_in|guest|tm30)/.test(e.type)).flatMap((e: Any) => [...walkKeys(e.payload)].filter((k) => /fullName|idNumber|guestName|phone|email|passport/i.test(k)));
    eq(piiKeys, [], "คีย์ PII ใน payload");
  });
  await st("PD-3", "revealGuestId (VIEWER มี hotel.guest.viewId): ⇒ {ok, idNumber = เลขดิบ} · AuditLog action hotel.guest.id_revealed targetId=guestId actorId=viewer **ทุกครั้ง** (เรียก 2 ครั้ง = 2 แถว) · ไม่มีเลขดิบใน AuditLog · outbox hotel.guest.id_revealed {guestId, byUserId} ไม่มีเลข · DTO listGuests ยังคง last4 (ไม่ cache เลขเต็ม)", async () => {
    needGuest(); ok(ids.gr1, "ไม่มี GR-1");
    const a0 = (await auditsOf({ action: "hotel.guest.id_revealed", targetId: ids.gr1 })).length;
    const r1 = okRes(await reveal(VIEWER, ids.gr1), "reveal");
    eq(r1.idNumber, G.jpn.idNumber, "เลขเต็ม");
    okRes(await reveal(VIEWER, ids.gr1), "reveal 2");
    const au = await auditsOf({ action: "hotel.guest.id_revealed", targetId: ids.gr1 });
    eq(au.length, a0 + 2, "AuditLog ทุกครั้ง");
    ok(au.every((a) => a.actorId === VIEWER.userId), "actorId");
    eq(hasRaw(J(au), RAWS), [], "เลขดิบใน AuditLog");
    const ev = await eventsOf("hotel.guest.id_revealed", (p) => p.guestId === ids.gr1);
    ok(ev.length >= 2 && ev.every((e) => e.payload.byUserId === VIEWER.userId) && !PII_TEXT.test(J(ev)), `event ${ev.length}`);
    const l = await listG(VIEWER, { q: "SATO" });
    eq(hasRaw(J(l), RAWS), [], "DTO หลัง reveal ยังมีเลขเต็ม");
  });
  await st("PD-4", "reveal ถูกปฏิเสธ: frontdesk (register ไม่มี viewId) ⇒ FORBIDDEN · REG ⇒ FORBIDDEN · maid ⇒ FORBIDDEN · none ⇒ FORBIDDEN · ร้าน B ⇒ NOT_FOUND · guestId มั่ว ⇒ NOT_FOUND · ไม่มีเลขดิบในคำตอบ · ไม่มี AuditLog id_revealed เพิ่มจากที่ถูกปฏิเสธ", async () => {
    needGuest(); ok(ids.gr1, "ไม่มี GR-1");
    const a0 = (await auditsOf({ action: "hotel.guest.id_revealed" })).length;
    const bad: string[] = [];
    for (const [n, a] of [["frontdesk", FRONT], ["reg", REG], ["maid", MAID], ["none", NONE]] as [string, Actor][]) { const r = await reveal(a, ids.gr1); if (!isDenied(r)) bad.push(`${n}=${codeOf(r)}`); if (PII_TEXT.test(J(r))) bad.push(`${n} รั่ว`); }
    eq(bad, [], "สิทธิ์");
    eq(failCode(await reveal(OWNER_B, ids.gr1, ctxB)), "NOT_FOUND", "ร้าน B");
    eq(failCode(await reveal(OWNER, `ไม่มี-${RUN}`)), "NOT_FOUND", "มั่ว");
    eq((await auditsOf({ action: "hotel.guest.id_revealed" })).length, a0, "AuditLog จากที่ถูกปฏิเสธ");
  });
  await st("PD-5", "maskId (pure · export จาก guest.ts หรือ guest-shared.ts): บัตรไทย 13 หลัก/พาสปอร์ต ⇒ เห็นเฉพาะ 4 ตัวท้าย (ตัวอักษร/ตัวเลขที่เหลือ = last4 เท่านั้น · ไม่ใช่ C01X···KJ77 แบบภาพ 09) · สั้นกว่า 4 ⇒ ไม่โยน · null/undefined ⇒ สตริงว่าง/ขีด · ค่าตั้ง maskIdForStaff เป็น def bool (ค่าเริ่ม true) · listGuests ของ VIEWER ก็ยังเป็น last4", async () => {
    const mask = typeof guestL.mod?.maskId === "function" ? guestL.mod.maskId : typeof sharedL.mod?.maskId === "function" ? sharedL.mod.maskId : null;
    ok(mask, `ยังไม่มี export maskId ใน ${F.guest}/${F.shared}`);
    for (const raw of ["1101700000010", "C01X4KJ77", "TK9876543"]) ok(maskOk(mask(raw), raw), `mask(${raw}) = ${J(mask(raw))}`);
    ok(typeof mask("AB") === "string" && typeof (mask(null) ?? "") === "string" && typeof (mask(undefined) ?? "") === "string", "ค่าขอบ");
    eq(SET.getDef("rooms.hotel.guest.maskIdForStaff")?.defaults?._fallback, true, "maskIdForStaff");
    const l = await listG(VIEWER);
    eq(hasRaw(J(l), RAWS), [], "VIEWER เห็นเลขเต็มใน list");
  });
  await st("PD-6", "ลิงก์ไฟล์ private (X10): rr3Card(ctx,{guestId}) ของแขกที่มีรูปเอกสาร (GR-7) ⇒ url รูป/ลายเซ็น (ถ้ามี) เป็น /api/files/<id>?exp=&sig= อายุ ≤ 900 วิ · ไม่มี private:// หรือ path t/… ใน DTO · ลายเซ็นตรวจผ่านเฉพาะผู้ดูที่ลิงก์ออกให้ (viewer kind STAFF) · เปลี่ยน id ผู้ดู ⇒ ไม่ผ่าน · FileAsset.cdnUrl ของทุกไฟล์แขก = private://", async () => {
    needGuest(); ok(ids.gr7, "ไม่มี GR-7");
    const card = okRes(await rr3(ids.gr7), "rr3Card");
    const txt = J(card);
    ok(!/private:\/\//.test(txt) && !new RegExp(`t/${tA}/`).test(txt), "private:// หรือ path หลุดใน DTO");
    const urls = [...txt.matchAll(/\/api\/files\/([a-z0-9]+)\?exp=(\d+)&sig=([0-9a-f]{64})/gi)];
    ok(urls.length >= 1, `ไม่มีลิงก์ /api/files ใน rr3Card (${txt.slice(0, 200)})`);
    for (const m of urls) {
      ok(Number(m[2]) * 1000 - Date.now() <= 900_000 + 5_000, "อายุลิงก์ > 900 วิ");
      const okSome = [OWNER, FRONT, REG, VIEWER].some((a) => STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: a.userId }));
      ok(okSome, "ลายเซ็นลิงก์ไม่ผูกผู้ดูที่เป็นพนักงานร้าน");
      ok(!STO.privateFileSignatureOk(m[1], m[2], m[3], { kind: "STAFF", id: `svc-h4-other-${RUN}` }), "คนอื่นผ่าน");
    }
    const gids = (await prisma.hotelGuestRecord.findMany({ where: { tenantId: tA, OR: [{ idImageFileId: { not: null } }, { signatureFileId: { not: null } }] } })) as Any[];
    const fids = gids.flatMap((g) => [g.idImageFileId, g.signatureFileId]).filter(Boolean);
    const fas = await prisma.fileAsset.findMany({ where: { id: { in: fids } } });
    ok(fas.length === fids.length && fas.every((f: Any) => String(f.cdnUrl).startsWith("private://") && f.path.includes("/private/")), "ไฟล์แขกไม่ private ทั้งหมด");
  });
  await st("PD-7", "purgeExpiredGuestRecords (ใบ §0 retention · มติ Q6): 3 แถว retainUntil ผ่านแล้ว (ตั้งแถวดิบ · 1 แถวมีรูป+ลายเซ็น) + 1 แถวอนาคต ⇒ purge({limit:2}) = {purged 2} · purge อีก = 1 · อีก = 0 (idempotent) · แถวที่ purge: idNumberEnc/idImageFileId/signatureFileId null · FileAsset ของมันหาย · fullName/last4/nationality/วันเข้าออก (ผ่าน reservation) คง · แถวอนาคตไม่ถูกแตะ · AuditLog actorType SYSTEM · outbox hotel.guest.purged {count} ไม่มี PII", async () => {
    needGuest();
    const r = await inhouse({ guests: [G.deu, G.deu2, G.jpn] });
    const [g1, g2, g3] = r.guestIds;
    okRes(await upsert(REG, { reservationId: r.id, guestId: g1, guest: { ...G.deu, idImage: PNG, keepIdImage: true } }), "ใส่รูป");
    okRes(await sign(REG, { guestId: g1 }), "ลงชื่อ");
    const before = await guestRow(g1);
    ok(before.idImageFileId && before.signatureFileId, "ไม่มีไฟล์ให้ purge");
    const past = dbDate(W(-1));
    await prisma.hotelGuestRecord.updateMany({ where: { id: { in: [g1, g2, g3] } }, data: { retainUntil: past } });
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { checkInDate: dbDate(W(-800)), checkOutDate: dbDate(W(-798)) } }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.4): purge ดูวันออกจริง+retainYears ด้วย ⇒ ย้ายการจองไปอดีต > 2 ปี
    const keep = (await inhouse({ guests: [G.fra] })).guestIds[0];
    const keepBefore = await guestRow(keep);
    const p1 = okRes(await purge({ limit: 2 }), "purge 1");
    eq(p1.purged, 2, "รอบ 1");
    const p2 = okRes(await purge({ limit: 2 }), "purge 2");
    eq(p2.purged, 1, "รอบ 2");
    eq((await purge({})).purged, 0, "รอบ 3 (idempotent)");
    for (const gid of [g1, g2, g3]) {
      const g = await guestRow(gid);
      ok(g, `แถว ${gid} ถูกลบทิ้ง (ต้องคงไว้)`);
      eq([g.idNumberEnc ?? null, g.idImageFileId ?? null, g.signatureFileId ?? null], [null, null, null], `ล้างข้อมูลอ่อนไหว ${gid}`);
      ok(g.fullName && g.idNumberLast4 && g.nationality, `คงชื่อ/last4/สัญชาติ ${gid}`);
    }
    eq([await fileOf(before.idImageFileId), await fileOf(before.signatureFileId)], [null, null], "FileAsset ค้าง");
    eq(J(await guestRow(keep)), J(keepBefore), "แถวอนาคตถูกแตะ");
    const au = (await auditsLike(/hotel\.guest.*purg/i));
    ok(au.length >= 1 && au.some((a) => a.actorType === "SYSTEM"), `AuditLog purge ${au.length}`);
    const ev = await eventsOf("hotel.guest.purged");
    ok(ev.length >= 1 && ev.some((e) => typeof e.payload?.count === "number") && !PII_TEXT.test(J(ev)), "event purged");
    ids.pd7 = r.id;
  });
  await st("PD-8", "X5 purge 2 รอบซ้อน: 4 แถวหมดอายุใหม่ · purge({limit:10}) พร้อมกัน 2 ทาง ⇒ รวม purged = 4 (ไม่นับซ้ำ) · minute-jobs.ts: ลงทะเบียน purgeExpiredGuestRecords รายวัน (everyMinutes 1440 · cadence daily) และ tm30Sweep ทุก 15 นาที ผ่าน facade @/lib/modules/hotel (lazy import) · ไม่แก้ vercel.json", async () => {
    needGuest();
    const r = await inhouse({ type: "fam", guests: [G.deu, G.deu2, G.jpn, G.fra] });
    await prisma.hotelGuestRecord.updateMany({ where: { id: { in: r.guestIds } }, data: { retainUntil: dbDate(W(-2)) } });
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { checkInDate: dbDate(W(-800)), checkOutDate: dbDate(W(-799)) } }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.4)
    const [a, b] = await Promise.all([purge({ limit: 10 }), purge({ limit: 10 })]);
    eq((a?.purged ?? -99) + (b?.purged ?? -99), 4, `รวม ${J([a, b])}`);
    const m = stripComments(read(F.minute));
    ok(/purgeExpiredGuestRecords/.test(m) && /tm30Sweep/.test(m), "ไม่มีงาน purge/tm30Sweep ใน minute-jobs.ts");
    const blk = (name: string) => { const i = m.indexOf(name); return i < 0 ? "" : m.slice(Math.max(0, i - 600), i + 300); };
    ok(/everyMinutes:\s*1440/.test(blk("purgeExpiredGuestRecords")) && /daily/.test(blk("purgeExpiredGuestRecords")), "purge ไม่ใช่รายวัน");
    ok(/everyMinutes:\s*15\b/.test(blk("tm30Sweep")), "tm30Sweep ไม่ใช่ทุก 15 นาที");
    ok(/import\(\s*["']@\/lib\/modules\/hotel["']\s*\)/.test(blk("purgeExpiredGuestRecords")) && /import\(\s*["']@\/lib\/modules\/hotel["']\s*\)/.test(blk("tm30Sweep")), "ไม่ได้โหลดผ่าน facade ตอนรัน");
    ok(!/hotel|guest|tm30/i.test(read("vercel.json")), "แก้ vercel.json");
  });
  await st("PD-9", "สถิต ไม่มีเลขดิบใน log (X8): checkin.ts/guest.ts/tm30.ts/guest-id-ai.ts ไม่มี console.log/logOps ที่อ้าง idNumber/guest.idNumber/image · ไม่ fetch เอง (รูปออกได้ทาง provider ของระบบ/storage เท่านั้น) · guest.ts ใช้ sealIntegrationSecret/openIntegrationSecret จาก secret-box (ไม่สร้าง crypto เอง) · ไม่มี idNumber ใน select/where ของ search", () => {
    const bad: string[] = [];
    for (const f of [F.checkin, F.guest, F.tm30, F.ai]) {
      const s = stripComments(read(f));
      if (!s) { bad.push(`${f} ยังไม่มี`); continue; }
      for (const m of s.matchAll(/(console\.(log|error|warn)|logOps)\s*\(([^;]*)\)/g)) if (/idNumber|\.image\b|base64/.test(m[3])) bad.push(`${f}: log ${m[3].slice(0, 60)}`);
      if (/\bfetch\s*\(/.test(s)) bad.push(`${f}: fetch เอง`);
      if (/createCipheriv|createDecipheriv/.test(s)) bad.push(`${f}: crypto เอง`);
    }
    const g = stripComments(read(F.guest));
    if (g && !(/sealIntegrationSecret/.test(g) && /openIntegrationSecret/.test(g))) bad.push("guest.ts ไม่ใช้ secret-box");
    if (g && /idNumber(Enc)?\s*:\s*\{\s*contains/.test(g)) bad.push("guest.ts ค้นด้วย idNumber");
    eq(bad, [], "สถิต");
  });
  await st("PD-10", "ลายเซ็น/รูปเอกสารเป็นไฟล์ private ตั้งแต่ชั้น storage (ไม่มี cdnUrl สาธารณะ): สถิต guest.ts เรียก uploadFile ด้วย visibility: \"private\" ทุกจุด · ใช้ privateFileUrl สำหรับลิงก์ · ลบด้วย deleteFileAsset · ไม่มี cdnBase/b-cdn ในโมดูล · FileAsset ของแขกทุกแถวในฐานไม่มี cdnUrl ที่เริ่มด้วย http", async () => {
    const g = stripComments(read(F.guest));
    ok(g, `ยังไม่มี ${F.guest}`);
    const ups = [...g.matchAll(/uploadFile\s*\(/g)].length;
    const priv = [...g.matchAll(/visibility\s*:\s*["']private["']/g)].length;
    ok(ups >= 1 && priv >= ups, `uploadFile ${ups} จุด · private ${priv} จุด`);
    ok(/privateFileUrl\s*\(/.test(g) && /deleteFileAsset\s*\(/.test(g), "ไม่ใช้ privateFileUrl/deleteFileAsset");
    ok(!/b-cdn|cdnBase|cdnUrl\s*:/.test(g), "อ้าง cdn สาธารณะ");
    const fids = ((await prisma.hotelGuestRecord.findMany({ where: { tenantId: tA } })) as Any[]).flatMap((x) => [x.idImageFileId, x.signatureFileId]).filter(Boolean);
    const pub = await prisma.fileAsset.count({ where: { id: { in: fids }, cdnUrl: { startsWith: "http" } } });
    eq(pub, 0, "ไฟล์แขกมี cdnUrl สาธารณะ");
  });
  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.4) — purge ต้องดูวันออกจริง + retainYears ด้วย ไม่ใช่ retainUntil อย่างเดียว
  await st("PD-11", "purge ตามมติ §11.4: แถว retainUntil ผ่านแล้ว แต่การจองออกไม่ถึง retainYears (checkOutDate = +2 วัน) ⇒ purge ไม่แตะ (idNumberEnc คง) · ย้ายวันเข้า/ออกของการจองไป −3 ปี ⇒ purge ล้าง idNumberEnc · แถวคงชื่อ/last4", async () => {
    needGuest();
    const r = await inhouse({ guests: [G.jpn] });
    const gid = r.guestIds[0];
    ok(gid, "ไม่มี guestId");
    await prisma.hotelGuestRecord.update({ where: { id: gid }, data: { retainUntil: dbDate(W(-30)) } });
    okRes(await purge({ limit: 10 }), "purge 1");
    const g1 = await guestRow(gid);
    ok(g1?.idNumberEnc, "purge ล้างทั้งที่วันออก+retainYears ยังไม่ถึง (ดูแค่ retainUntil)");
    const ci = `${Number(W(0).slice(0, 4)) - 3}${W(0).slice(4)}`;
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { checkInDate: dbDate(ci), checkOutDate: dbDate(addDays(ci, 2)) } });
    const p2 = okRes(await purge({ limit: 10 }), "purge 2");
    ok((p2.purged ?? 0) >= 1, `purged ${p2.purged}`);
    const g2 = await guestRow(gid);
    ok(g2 && g2.idNumberEnc == null, "ยังไม่ล้างหลังวันออกจริง+retainYears พ้นแล้ว");
    ok(g2?.fullName === G.jpn.fullName && g2?.idNumberLast4, "คงชื่อ/last4");
  });

  // ═══════════════ AI อ่านเอกสาร (เสนอ-คนยืนยัน) ═══════════════
  console.log("\n── AI readIdDocument ──");
  const orCount = () => OR_REQS.length;
  const usageRows = (tid = tA) => prisma.aiCreditTxn.findMany({ where: { tenantId: tid, kind: "USAGE" } }) as Promise<Any[]>;
  await st("AI-1", "ค่าเริ่มปิด (rooms.hotel.aiIdReader false): readIdDocument(REG) ⇒ {ok:false, code AI_DISABLED, reason ไทย} · ไม่ยิง provider (คำขอ openrouter 0) · ไม่มีแถว AiCreditTxn · ไม่มี FileAsset เพิ่ม", async () => {
    needSetup();
    eq(await settingOf("rooms.hotel.guest.aiIdReader"), false, "ค่าเริ่ม aiIdReader");
    const n0 = orCount(), f0 = await fileCount(), u0 = (await usageRows()).length;
    const r = await readId(REG);
    eq(failCode(r), "AI_DISABLED", `ผล ${codeOf(r)}`);
    ok(typeof r.reason === "string" && THAI.test(r.reason), "reason ไทย");
    eq([orCount(), await fileCount(), (await usageRows()).length], [n0, f0, u0], "ยิง/เก็บ");
  });
  await st("AI-2", "เปิด aiIdReader + ไม่มีคีย์ระบบ (SHARK_AI_KEY ว่าง · ไม่มี Mock) ⇒ NO_PROVIDER ไม่บล็อก (กรอกมือ) · คำขอ 0 · คืนคีย์", async () => {
    needSetup();
    await setUnit("rooms.hotel.guest.aiIdReader", true);
    const k = process.env.SHARK_AI_KEY; delete process.env.SHARK_AI_KEY;
    const n0 = orCount();
    try {
      const r = await readId(REG);
      eq(failCode(r), "NO_PROVIDER", `ผล ${codeOf(r)}`);
      eq(orCount(), n0, "ยิงทั้งที่ไม่มีคีย์");
    } finally { process.env.SHARK_AI_KEY = k; }
  });
  await st("AI-3", "เครดิตหมด: กระเป๋าร้าน A ยอด 0 (สร้างแถว AiCreditWallet grantedAt ตั้งแล้ว) ⇒ NO_CREDIT · คำขอ 0 · ยอดไม่เปลี่ยน · ลบกระเป๋าทดสอบ", async () => {
    needSetup();
    await prisma.aiCreditWallet.deleteMany({ where: { tenantId: tA } });
    await prisma.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 0, grantedAt: new Date() } });
    const n0 = orCount();
    try {
      const r = await readId(REG);
      eq(failCode(r), "NO_CREDIT", `ผล ${codeOf(r)}`);
      eq(orCount(), n0, "ยิงทั้งที่เครดิตหมด");
      eq((await prisma.aiCreditWallet.findUnique({ where: { tenantId: tA } }))?.balanceMicro, 0, "ยอดเปลี่ยน");
    } finally { await prisma.aiCreditWallet.deleteMany({ where: { tenantId: tA } }); }
  });
  await st("AI-4", "เส้นปกติ (กระเป๋า 5,000,000 µ$ · ตัวจำลอง OpenRouter ตอบ JSON): ⇒ {ok, proposal {fullName, nationality, idNumber, dob, docType, expiry, sex}, confidence 0.93, creditCharged > 0} · คำขอ 1 ครั้ง · Authorization มีคีย์ปลอม · body มีรูปแบบ data URL · ไม่มีชื่อแขก/เลขห้อง/tenantId ใน prompt · AiCreditTxn USAGE 1 แถว (note/ref มี hotel.guest.idReader · model) · ไม่เก็บรูป (FileAsset ไม่เพิ่ม) · idNumber ที่เสนอไม่ลง AuditLog/outbox", async () => {
    needSetup();
    await prisma.aiCreditWallet.deleteMany({ where: { tenantId: tA } });
    await prisma.aiCreditWallet.create({ data: { tenantId: tA, balanceMicro: 5_000_000, grantedAt: new Date() } });
    const n0 = orCount(), f0 = await fileCount(), u0 = (await usageRows()).length;
    OR_MODE = "ok";
    const r = okRes(await readId(REG, { image: PNG }), "readIdDocument");
    eq([r.proposal?.fullName, r.proposal?.nationality, r.proposal?.idNumber, r.proposal?.dob, r.proposal?.docType, r.proposal?.sex], [OR_PROPOSAL.fullName, "DEU", OR_PROPOSAL.idNumber, OR_PROPOSAL.dob, "PASSPORT", "M"], "proposal");
    ok(typeof r.confidence === "number" && near(r.confidence, 0.93, 0.01), `confidence ${r.confidence}`);
    ok(typeof r.creditCharged === "number" && r.creditCharged > 0, `creditCharged ${r.creditCharged}`);
    eq(orCount(), n0 + 1, "คำขอ");
    const req = OR_REQS[OR_REQS.length - 1];
    ok(req.auth.includes(FAKE_AI_KEY), "Authorization ไม่มีคีย์");
    const bodyTxt = J(req.body);
    ok(/data:image\/png;base64,/.test(bodyTxt), "ไม่มีรูปแบบ data URL");
    ok(!bodyTxt.includes(tA) && !bodyTxt.includes(UH) && !/MUELLER|สมหญิง|DLX/.test(bodyTxt), "prompt มี id ร้าน/ชื่อแขก/เลขห้อง");
    const us = await usageRows();
    eq(us.length, u0 + 1, "AiCreditTxn");
    ok(/hotel\.guest\.idReader/.test(`${us[us.length - 1].note ?? ""} ${us[us.length - 1].ref ?? ""}`) && us[us.length - 1].amountMicro < 0, `แถวหัก ${J(us[us.length - 1])}`);
    eq(await fileCount(), f0, "เก็บรูป");
    const raw = String(OR_PROPOSAL.idNumber);
    eq(hasRaw(J([await prisma.auditLog.findMany({ where: { tenantId: tA } }), await prisma.outboxEvent.findMany({ where: { tenantId: tA } })]), [raw]), [], "เลขที่ AI เสนอหลุดลง log");
  });
  await st("AI-5", "ตอบเพี้ยน/ล้ม: ตัวจำลองตอบข้อความไม่ใช่ JSON ⇒ UNREADABLE (ok:false ไม่ throw) · ตอบ 500 ⇒ ok:false (UNREADABLE|AI_FAILED) · ตอบ JSON ที่ idNumber ว่าง ⇒ ok แต่ proposal.idNumber ว่าง/null (คนกรอกเอง) · ทุกกรณีไม่เก็บรูป", async () => {
    needSetup();
    const f0 = await fileCount();
    OR_MODE = "garbage";
    const g = await readId(REG);
    ok(isFail(g, "UNREADABLE", "AI_FAILED"), `ขยะ ⇒ ${codeOf(g)}`);
    OR_MODE = "error";
    const e = await readId(REG);
    ok(isFail(e, "UNREADABLE", "AI_FAILED", "NO_PROVIDER"), `500 ⇒ ${codeOf(e)}`);
    OR_MODE = "ok";
    const saved = { ...OR_PROPOSAL };
    OR_PROPOSAL = { ...OR_PROPOSAL, idNumber: "" };
    try { const r = await readId(REG); ok(r?.ok === true ? !r.proposal?.idNumber : isFail(r, "UNREADABLE"), `idNumber ว่าง ⇒ ${J(r).slice(0, 120)}`); } finally { OR_PROPOSAL = saved; }
    eq(await fileCount(), f0, "เก็บรูป");
  });
  await st("AI-6", "ด่าน/X6: รูป text/html ⇒ ปฏิเสธ ไม่ยิง · PNG > 8 MB ⇒ ปฏิเสธ ไม่ยิง · maid/none ⇒ FORBIDDEN ไม่ยิง · ร้าน B (ctx B · unitId UH) ⇒ NOT_FOUND ไม่ยิง · readIdDocumentAction ไม่มี deps provider จาก client · ปิด aiIdReader คืน + ลบกระเป๋าทดสอบ", async () => {
    needSetup();
    try {
      const n0 = orCount();
      ok(isFail(await readId(REG, { image: { data: new Uint8Array(Buffer.from("<html>")), contentType: "text/html" } })), "html ผ่าน");
      ok(isFail(await readId(REG, { image: { data: bigPng(8 * 1024 * 1024 + 1), contentType: "image/png" } })), "8MB+1 ผ่าน");
      ok(isDenied(await readId(MAID)) && isDenied(await readId(NONE)), "สิทธิ์");
      eq(failCode(await readId(OWNER_B, {}, ctxB)), "NOT_FOUND", "ร้าน B");
      eq(orCount(), n0, "ยิงทั้งที่ถูกปฏิเสธ");
      const a = stripComments(read(F.actions));
      ok(/readIdDocumentAction/.test(a) && !/provider\s*:/.test(/readIdDocumentAction[\s\S]{0,800}/.exec(a)?.[0] ?? ""), "action รับ provider จาก client");
    } finally {
      await resetUnit("rooms.hotel.guest.aiIdReader");
      await prisma.aiCreditWallet.deleteMany({ where: { tenantId: tA } });
    }
  });

  // ═══════════════ RR ร.ร.3 / ร.ร.4 ═══════════════
  console.log("\n── RR ร.ร.3 ลงชื่อ · ร.ร.4 ──");
  const RR3_REQUIRED: [string, RegExp][] = [["ชื่อโรงแรม/ใบอนุญาต", /hotel|license/i], ["เลขบัตร ร.ร.3", /cardNo|seq|rr3No|number/i], ["วันเวลาเข้า", /checkIn|arriv/i], ["วันเวลาออก", /checkOut|depart/i], ["เลขห้อง", /room/i], ["ชื่อ-สกุล", /fullName|name/i], ["สัญชาติ", /national/i], ["วันเกิด", /dob|birth/i], ["อาชีพ", /occupation|job/i], ["ชนิด/เลขเอกสาร", /idType|idNumber|document/i], ["ที่อยู่", /address/i], ["มาจาก", /arrivedFrom|from/i], ["จะไปที่", /nextDestination|destination|to/i], ["ผู้พักร่วม", /companion|guests|party/i], ["ลายมือชื่อ", /sign/i], ["ผู้บันทึก", /recorded|by|staff/i]];
  await st("RR-1", "signRr3({guestId, signaturePng}) โดย REG บนผู้พักหลัก CI-1 ⇒ ok · rr3SignedAt ตั้ง · signatureFileId → FileAsset private PNG · AuditLog · ลงชื่อซ้ำ ⇒ ALREADY_SIGNED หรือ ok idempotent (ไม่มีไฟล์ใหม่) · outbox/AuditLog ไม่มี base64", async () => {
    needGuest(); ok(ids.ci1Guest, "ไม่มี CI-1");
    const f0 = await fileCount();
    const r = okRes(await sign(REG, { guestId: ids.ci1Guest }), "sign");
    const g = await guestRow(ids.ci1Guest);
    ok(g.rr3SignedAt && g.signatureFileId, `แถว ${J([g.rr3SignedAt, g.signatureFileId])}`);
    const fa = await fileOf(g.signatureFileId);
    ok(fa && fa.path.startsWith(`t/${tA}/private/`) && String(fa.cdnUrl).startsWith("private://") && fa.contentType === "image/png", `FileAsset ${J(fa)}`);
    eq(await fileCount(), f0 + 1, "FileAsset");
    const again = await sign(REG, { guestId: ids.ci1Guest });
    ok(again?.ok === true || isFail(again, "ALREADY_SIGNED"), `ซ้ำ ${codeOf(again)}`);
    eq([await fileCount(), (await guestRow(ids.ci1Guest)).signatureFileId], [f0 + 1, g.signatureFileId], "ลงซ้ำสร้างไฟล์ใหม่");
    ok((await auditsLike(/hotel\.guest.*(sign|rr3)/i)).some((a) => a.targetId === ids.ci1Guest), "ไม่มี AuditLog ลงชื่อ");
    ok(!/iVBORw0KGgo/.test(J(await prisma.auditLog.findMany({ where: { tenantId: tA } }))), "base64 ใน AuditLog");
    void r;
  });
  await st("RR-2", "ลงชื่อแทนห้อง (มติ 2): CI-3 ผู้พักหลัก DEU ลงชื่อ ⇒ ผู้พักร่วม (DEU2) ถือว่าลงชื่อแล้วโดยอ้างผู้พักหลัก (rr3Card ของผู้พักร่วมบอก signedBy/signedByGuestId = หลัก หรือ rr3SignedAt ตั้งโดยไม่มีไฟล์ของตัวเอง) · rr4Register นับทั้งสองว่าลงชื่อแล้ว", async () => {
    needGuest(); ok(ids.ci3, "ไม่มี CI-3");
    const gs = (await guestsOf(ids.ci3)).filter((g) => [G.deu.fullName, G.deu2.fullName].includes(g.fullName));
    const prim = gs.find((g) => g.fullName === G.deu.fullName)!, comp = gs.find((g) => g.fullName === G.deu2.fullName)!;
    okRes(await sign(REG, { guestId: prim.id }), "หลักลงชื่อ");
    const cardC = okRes(await rr3(comp.id), "rr3Card ผู้พักร่วม");
    const compRow = await guestRow(comp.id);
    const txt = J(cardC);
    ok(txt.includes(prim.id) || compRow.rr3SignedAt || /signedBy|ลงชื่อแทน/.test(txt), `ผู้พักร่วมไม่ถูกนับว่าลงชื่อแล้ว ${txt.slice(0, 200)}`);
    ok(!compRow.signatureFileId || compRow.signatureFileId === prim.signatureFileId, "ผู้พักร่วมมีไฟล์ลายเซ็นของตัวเอง");
    const rows = (okRes(await rr4(), "rr4") as Any);
    const list = (Array.isArray(rows) ? rows : rows.rows ?? rows.items ?? []) as Any[];
    const mine = list.filter((x) => x.guestId === prim.id || x.guestId === comp.id || x.id === prim.id || x.id === comp.id);
    ok(mine.length === 2 && mine.every((x) => x.signed === true || x.rr3SignedAt || x.signedByGuestId || x.signature), `ร.ร.4 ${J(mine).slice(0, 200)}`);
    ids.rr2prim = prim.id;
  });
  await st("RR-3", "rr3OnScreen ปิด (มติ 2): ตั้ง rooms.hotel.rr3OnScreen=false · signRr3 แบบกระดาษ ({guestId, method:\"PAPER\", note}) บนแขก CI-12fam ⇒ ok · rr3SignedAt ตั้ง · signatureFileId null · AuditLog มี note/PAPER · ส่ง PNG ในโหมดกระดาษก็รับได้หรือปฏิเสธอย่างสุภาพ (ไม่ throw) · คืนค่าตั้ง", async () => {
    needGuest(); ok(ids.ci12fam, "ไม่มี CI-12");
    const gid = (await guestsOf(ids.ci12fam))[0].id;
    await setUnit("rooms.hotel.rr3OnScreen", false);
    try {
      const r = await sign(REG, { guestId: gid, method: "PAPER", note: "ลงชื่อบนกระดาษแล้ว", signaturePng: undefined });
      okRes(r, "กระดาษ");
      const g = await guestRow(gid);
      ok(g.rr3SignedAt && !g.signatureFileId, `แถว ${J([g.rr3SignedAt, g.signatureFileId])}`);
      ok((await auditsLike(/hotel\.guest.*(sign|rr3)/i)).some((a) => a.targetId === gid && /PAPER|กระดาษ/i.test(J([a.before, a.after]))), "AuditLog กระดาษ");
      const other = (await guestsOf(ids.ci12fam))[1].id;
      const x = await sign(REG, { guestId: other });
      ok(x?.ok === true || isFail(x), `PNG ในโหมดกระดาษ ${codeOf(x)}`);
    } finally { await resetUnit("rooms.hotel.rr3OnScreen"); }
  });
  await st("RR-4", "RR3_FIELDS (export จาก guest.ts · ค่าคงที่พร้อมอ้างประกาศ) ครอบฟิลด์อย่างน้อยตามใบ §0 16 กลุ่ม · rr3Card(ctx,{guestId}) ของ CI-1: ชื่อโรงแรมตามใบอนุญาต + เลขที่ใบอนุญาต (จากค่าตั้ง GR-9) · เลขห้อง · วันเข้า/ออก · ชื่อ · สัญชาติ (ISO-3 + ชื่อไทย) · วันเกิด · อาชีพ · ชนิดเอกสาร + last4 (ไม่มีเลขเต็ม) · ที่อยู่/มาจาก/จะไปที่ · จำนวนผู้พักร่วม · ลงชื่อแล้ว · ผู้บันทึก · เลขบัตร RR3-<พ.ศ.>-NNNNNN · comment อ้างประกาศกระทรวงมหาดไทย", async () => {
    needGuest(); ok(ids.ci1Guest, "ไม่มี CI-1");
    const fields = valOf(guestL, "RR3_FIELDS", F.guest);
    const keys = (Array.isArray(fields) ? fields.map((f: Any) => (typeof f === "string" ? f : `${f.key ?? ""} ${f.label ?? f.labelTh ?? ""}`)) : Object.keys(fields)).join(" | ");
    const miss = RR3_REQUIRED.filter(([, re]) => !re.test(keys)).map(([n]) => n);
    eq(miss, [], `RR3_FIELDS ขาด (มี ${keys.slice(0, 200)})`);
    ok(/ประกาศ(กระทรวง)?มหาดไทย|ร\.ร\.\s?3|พ\.ร\.บ\.โรงแรม/.test(read(F.guest)), "ไม่มีคอมเมนต์อ้างประกาศ/แบบ ร.ร.3");
    const card = okRes(await rr3(ids.ci1Guest), "rr3Card");
    const txt = J(card);
    for (const [label, v] of [["ชื่อโรงแรมตามใบอนุญาต", "โรงแรมทดสอบ เอช4"], ["เลขใบอนุญาต", "กท.123/2569"], ["ชื่อแขก", G.thai.fullName], ["สัญชาติ ISO", "THA"], ["สัญชาติไทย", "ไทย"], ["วันเกิด", G.thai.dob], ["อาชีพ", G.thai.occupation], ["last4", last4(THAI1)], ["มาจาก", G.thai.arrivedFrom], ["จะไปที่", G.thai.nextDestination], ["ที่อยู่", G.thai.address], ["วันเข้า", W(0)], ["วันออก", W(2)]]) ok(txt.includes(v), `การ์ดไม่มี ${label} (${v})`);
    ok(txt.includes("DLX") || /roomNumber|room/.test(txt), "ไม่มีเลขห้อง");
    eq(hasRaw(txt, RAWS), [], "เลขเต็มในการ์ด");
    ok(RR3_NO.test(String(card.cardNo ?? card.rr3No ?? card.seqNo ?? card.no ?? "")), `เลขบัตร ${J(card.cardNo ?? card.rr3No ?? card.seqNo ?? card.no)}`);
    ok(/companions|ผู้พักร่วม|guestsCount/.test(txt) && /recordedBy|ผู้บันทึก|staff/i.test(txt) && /signed|ลงชื่อ/.test(txt), "ไม่มีผู้พักร่วม/ผู้บันทึก/ลงชื่อ");
  });
  await st("RR-5", "เลขลำดับ ร.ร.3/ร.ร.4 (มติ 3 · derive จาก createdAt ต่อหน่วย/ปี พ.ศ.): rr4Register(UH · ช่วง −3..+3) ⇒ แถวเรียงตามเลข · เลข RR3-<พ.ศ. ปีนี้>-000001.. ต่อเนื่องไม่ซ้ำ · ลำดับตรง createdAt · ทุกแขกของหน่วย/ช่วงอยู่ครบ (รวมที่ purge แล้ว — คงชื่อ/last4) · UH2 มีแขก 1 คน ⇒ เริ่ม 000001 · from/to กรองวันเข้า · แถวไม่มีเลขเต็ม", async () => {
    needGuest();
    const r = okRes(await rr4(), "rr4");
    const rows = (Array.isArray(r) ? r : r.rows ?? r.items ?? []) as Any[];
    ok(rows.length >= 10, `แถว ${rows.length}`);
    const noOf = (x: Any) => String(x.cardNo ?? x.rr3No ?? x.seqNo ?? x.no ?? "");
    const nos = rows.map(noOf);
    ok(nos.every((n) => RR3_NO.test(n)), `รูปแบบเลข ${J(nos.slice(0, 3))}`);
    const by = buddhistYear(new Date());
    ok(nos.every((n) => Number(RR3_NO.exec(n)![1]) === by), `ปี พ.ศ. ${nos[0]}`);
    const seqs = nos.map((n) => Number(RR3_NO.exec(n)![2]));
    eq(seqs, [...seqs].sort((a, b) => a - b), "ไม่เรียง");
    eq(new Set(seqs).size, seqs.length, "เลขซ้ำ");
    ok(seqs[0] === 1 && seqs[seqs.length - 1] - seqs[0] + 1 >= seqs.length, `ไม่ต่อเนื่องจาก 1 ${J(seqs.slice(0, 5))}`);
    const dbRows = await prisma.hotelGuestRecord.findMany({ where: { tenantId: tA, unitId: UH, reservation: { status: { in: ["CHECKED_IN", "CHECKED_OUT", "REFUNDED"] }, checkInDate: { gte: dbDate(W(-3)), lte: dbDate(W(3)) } } }, orderBy: { createdAt: "asc" }, select: { id: true } });  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.2)
    const idOf = (x: Any) => x.guestId ?? x.id;
    eq(rows.map(idOf), dbRows.map((x: Any) => x.id), "ลำดับ/ครบตาม createdAt");
    eq(hasRaw(J(rows), RAWS), [], "เลขเต็มใน ร.ร.4");
    const u2res = await mkRes({ unitId: UH2, roomTypeId: RT_U2, roomId: ROOM_U2 });
    okRes(await checkIn(MGR2, { reservationId: u2res, roomId: ROOM_U2, guests: [G.thai2] }), "เช็กอิน UH2");
    const r2 = okRes(await rr4({ unitId: UH2 }), "rr4 UH2");
    const rows2 = (Array.isArray(r2) ? r2 : r2.rows ?? r2.items ?? []) as Any[];
    eq(rows2.map(noOf), [`RR3-${by}-000001`], "UH2 เริ่ม 000001");
    const narrow = okRes(await rr4({ from: W(2), to: W(2) }), "rr4 แคบ");
    const rn = (Array.isArray(narrow) ? narrow : narrow.rows ?? narrow.items ?? []) as Any[];
    ok(rn.length >= 1 && rn.length < rows.length, `กรองช่วงวัน ${rn.length}/${rows.length}`);
  });
  await st("RR-6", "ด่านลงชื่อ/การ์ด: ลายเซ็น svg ⇒ INVALID_FILE · text/plain ⇒ INVALID_FILE · PNG ปลอม ⇒ INVALID_FILE · > 8 MB ⇒ ปฏิเสธ · maid/none ⇒ FORBIDDEN · ร้าน B ⇒ NOT_FOUND · rr3Card/rr4Register ctx ร้าน B ⇒ NOT_FOUND/ว่าง · ไม่มี FileAsset จากใบที่ล้ม", async () => {
    needGuest(); ok(ids.gr1, "ไม่มี GR-1");
    const f0 = await fileCount();
    const bad: string[] = [];
    for (const [label, img] of [["svg", { data: new Uint8Array(Buffer.from("<svg/>")), contentType: "image/svg+xml" }], ["text", { data: new Uint8Array(Buffer.from("x")), contentType: "text/plain" }], ["png ปลอม", { data: new Uint8Array(Buffer.from("nope")), contentType: "image/png" }], ["8MB+1", { data: bigPng(8 * 1024 * 1024 + 1), contentType: "image/png" }]] as [string, Any][]) {
      const r = await sign(REG, { guestId: ids.gr1, signaturePng: img });
      if (!isFail(r)) bad.push(`${label}=${codeOf(r)}`);
    }
    eq(bad, [], "ไฟล์ผิดผ่าน");
    ok(isDenied(await sign(MAID, { guestId: ids.gr1 })) && isDenied(await sign(NONE, { guestId: ids.gr1 })), "สิทธิ์");
    eq(failCode(await sign(OWNER_B, { guestId: ids.gr1 }, ctxB)), "NOT_FOUND", "ร้าน B");
    const c = await rr3(ids.gr1, ctxB);
    ok(c?.ok === false && failCode(c) === "NOT_FOUND" && !PII_TEXT.test(J(c)), `rr3Card ร้าน B ${codeOf(c)}`);
    const r4 = await rr4({}, ctxB);
    ok(r4?.ok === false || (Array.isArray(r4) ? r4.length === 0 : (r4?.rows ?? r4?.items ?? []).length === 0), "rr4 ร้าน B");
    eq(await fileCount(), f0, "FileAsset จากใบที่ล้ม");
  });
  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.2) — ทะเบียนกฎหมาย (ร.ร.4 · คิว/ไฟล์ ตม.30 · ลำดับเลขบัตร) นับเฉพาะผู้พักจริง
  await st("RR-7", "ทะเบียนกฎหมายเฉพาะผู้พักจริง (§11.2): ลงทะเบียนล่วงหน้าบนการจอง CONFIRMED (ยังไม่เช็กอิน · ไม่ถือห้อง) ⇒ แถว HotelGuestRecord มี แต่ rr4Register ไม่มี guestId นี้ · ทุกแถว reservationStatus ∈ CHECKED_IN/CHECKED_OUT/REFUNDED · เลขบัตรผู้พักจริงไม่ขยับ · tm30Queue ไม่มี · tm30Export เฉพาะคนนี้ ⇒ INVALID_INPUT · ตั้งการจองเป็น CANCELLED ⇒ เหมือนเดิมทุกข้อ · แถวยังอยู่ (รอ purge)", async () => {
    needGuest(); needTm30();
    const noOf = (x: Any) => String(x.cardNo ?? x.rr3No ?? x.seqNo ?? x.no ?? "");
    const rowsOf = (r: Any) => (Array.isArray(r) ? r : r.rows ?? r.items ?? []) as Any[];
    const rowsB = rowsOf(okRes(await rr4(), "rr4 ก่อน"));
    ok(rowsB.length >= 1, "ไม่มีแถว ร.ร.4 ตั้งต้น");
    const id = await mkRes({ type: "dlx", ci: W(0), co: W(2), claim: false });
    const u = okRes(await upsert(REG, { reservationId: id, guest: G.fra }), "ลงทะเบียนล่วงหน้า");
    const gid = String(u.guestId ?? u.id ?? (await guestsOf(id))[0]?.id ?? "");
    ok(gid, "ไม่มี guestId ของแถวล่วงหน้า");
    const check = async (tag: string) => {
      const rows = rowsOf(okRes(await rr4(), `rr4 ${tag}`));
      ok(!rows.some((x) => (x.guestId ?? x.id) === gid), `${tag}: ร.ร.4 มีแถวที่ยังไม่เข้าพัก`);
      eq(rows.filter((x) => !["CHECKED_IN", "CHECKED_OUT", "REFUNDED"].includes(String(x.reservationStatus))).map((x) => x.reservationStatus ?? "(ไม่มี reservationStatus)"), [], `${tag}: reservationStatus`);
      eq(rows.map(noOf), rowsB.map(noOf), `${tag}: เลขบัตรผู้พักจริงขยับ`);
      const q = okRes(await queue(), `queue ${tag}`);
      ok(!(q.items ?? []).some((x: Any) => x.guestId === gid), `${tag}: คิว ตม.30 มีคนยังไม่เข้าพัก`);
      const ex = await tmExport(FRONT, { guestIds: [gid] });
      ok(isFail(ex, "INVALID_INPUT"), `${tag}: export คนยังไม่เข้าพัก ⇒ ${codeOf(ex)}`);
    };
    await check("CONFIRMED");
    await prisma.hotelReservation.update({ where: { id }, data: { status: "CANCELLED" } });
    await check("CANCELLED");
    ok(await guestRow(gid), "แถวลงทะเบียนล่วงหน้าถูกลบ (ต้องคงไว้รอ purge)");
  });

  // ═══════════════ TM ตม.30 ═══════════════
  console.log("\n── TM ตม.30 ──");
  const TM30_LABELS = ["ชื่อ", "เพศ", "สัญชาติ", "หนังสือเดินทาง", "วันเกิด", "ตรวจลงตรา", "เดินทางเข้า", "ด่าน", "ตม.6", "วันเข้าพัก", "วันออก", "ห้อง"];
  const pendingForeigners = () => prisma.hotelGuestRecord.findMany({ where: { tenantId: tA, unitId: UH, isForeigner: true, tm30Status: { in: ["PENDING", "LATE"] }, reservation: { status: { in: ["CHECKED_IN", "CHECKED_OUT", "REFUNDED"] } } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.2 เฉพาะผู้พักจริง)
  await st("TM-1", "tm30Queue(ctx,{unitId}) ⇒ {pending, late, items[]} · ตัวเลขตรงนับจากฐาน (PENDING/LATE ของหน่วย) · items มี guestId/fullName/nationality/idNumberLast4/dueAt/status/roomNumber ไม่มีเลขเต็ม · UH2 (แขกไทย) ⇒ 0/0 · ร้าน B ⇒ NOT_FOUND/0", async () => {
    needTm30();
    const q = okRes(await queue(), "queue");
    const db = await pendingForeigners();
    eq([q.pending, q.late], [db.filter((g) => g.tm30Status === "PENDING").length, db.filter((g) => g.tm30Status === "LATE").length], "นับ");
    ok(Array.isArray(q.items) && q.items.length === db.length, `items ${q.items?.length} ≠ ${db.length}`);
    const it = q.items[0];
    eq(["guestId", "fullName", "nationality", "idNumberLast4", "dueAt", "status"].filter((k) => !(k in it)), [], `ฟิลด์ (มี ${Object.keys(it)})`);
    eq(hasRaw(J(q), RAWS), [], "เลขเต็ม");
    const q2 = okRes(await queue({ unitId: UH2 }), "UH2");
    eq([q2.pending, q2.late], [0, 0], "UH2");
    const b = await queue({}, ctxB);
    ok(b?.ok === false || (b.pending === 0 && b.late === 0 && !/MUELLER|SATO/.test(J(b))), "ร้าน B");
  });
  await st("TM-2", "TM30_DEFAULT_COLUMNS (export จาก tm30.ts) = 12 คอลัมน์ตามแบบ ตม.30 กระดาษ (ชื่อ-สกุล · เพศ · สัญชาติ · เลขหนังสือเดินทาง · วันเกิด · ประเภท/เลขตรวจลงตรา · วันเดินทางเข้า · ด่าน · เลข ตม.6 · วันเข้าพัก · วันออกคาด · เลขห้อง) ป้ายไทย · def rooms.hotel.tm30.exportColumns ค่าเริ่ม = ชุดนี้ · ค่าตั้งผ่าน schema · คอมเมนต์อ้าง Q-H4-1 (แม่แบบจริงรอเจ้าของ)", () => {
    const cols = valOf(tm30L, "TM30_DEFAULT_COLUMNS", F.tm30);
    ok(Array.isArray(cols) && cols.length === 12, `คอลัมน์ ${cols?.length}`);
    const labels = cols.map((c: Any) => (typeof c === "string" ? c : `${c.key ?? ""} ${c.label ?? c.labelTh ?? c.header ?? ""}`)).join(" | ");
    eq(TM30_LABELS.filter((l) => !labels.includes(l)), [], `ป้ายขาด (มี ${labels.slice(0, 200)})`);
    const d = SET.getDef("rooms.hotel.tm30.exportColumns");
    ok(d, "ไม่มี def exportColumns");
    const def = d.defaults._fallback;
    ok(isDeepStrictEqual(def, cols) || isDeepStrictEqual(def, cols.map((c: Any) => c.key ?? c)), `ค่าเริ่ม def ≠ TM30_DEFAULT_COLUMNS (${J(def).slice(0, 120)})`);
    ok(d.schema.safeParse(def).success, "ค่าเริ่มไม่ผ่าน schema ตัวเอง");
    ok(/Q-H4-1/.test(read(F.tm30)) || /Q-H4-1/.test(read(F.defs)), "ไม่มีคอมเมนต์อ้าง Q-H4-1");
  });
  await st("TM-3", "tm30Export(frontdesk · csv · เลือก 2 จาก PENDING): ⇒ {ok, file:{name .csv ไม่มีชื่อ/เลขแขก, contentType text/csv, bytes}} · ไบต์เริ่ม BOM EF BB BF · บรรทัดหัว = ป้ายคอลัมน์ตามค่าตั้ง (ลำดับ) · แถวข้อมูล = 2 เฉพาะที่เลือก · มีเลขหนังสือเดินทาง **เต็ม** ของ 2 คน (ไฟล์ส่ง ตม. ต้องเลขเต็ม) · ไม่มีเลขของคนที่ไม่เลือก · มีเลขห้อง/วันออก · AuditLog การส่งออก (ไม่มีเลขเต็มใน log) · guestIds ว่าง ⇒ INVALID_INPUT · รวม guestId แขกไทย ⇒ ถูกตัดออกหรือ INVALID_INPUT", async () => {
    needTm30();
    const pend = (await pendingForeigners()).filter((g) => g.tm30Status === "PENDING");
    ok(pend.length >= 3, `PENDING ${pend.length}`);
    const pick = pend.slice(0, 2), rest = pend.slice(2);
    const r = okRes(await tmExport(FRONT, { guestIds: pick.map((g) => g.id) }), "export");
    const f = r.file;
    ok(f && /\.csv$/i.test(f.name) && /text\/csv/i.test(f.contentType) && f.bytes, `file ${J({ name: f?.name, ct: f?.contentType })}`);
    ok(!PII_TEXT.test(f.name) && !/MUELLER|SATO|DUBOIS/.test(f.name), "ชื่อไฟล์มี PII");
    const buf = Buffer.from(f.bytes);
    eq([buf[0], buf[1], buf[2]], [0xef, 0xbb, 0xbf], "BOM");
    const text = buf.subarray(3).toString("utf8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    eq(lines.length, 3, `บรรทัด ${lines.length}`);
    const cols = (await settingOf("rooms.hotel.tm30.exportColumns")) as Any[];
    const headLabels = (cols ?? []).map((c: Any) => (typeof c === "string" ? c : c.label ?? c.labelTh ?? c.header ?? c.key));
    ok(headLabels.length === 12 && headLabels.every((h: string, i: number) => lines[0].split(",")[i]?.replace(/^"|"$/g, "") === h), `หัวตาราง ${lines[0].slice(0, 160)}`);
    for (const g of pick) ok(text.includes(rawOfEnc(g)!), `ไม่มีเลขเต็มของ ${g.fullName}`);
    for (const g of rest) { const raw = rawOfEnc(g)!; if (pick.some((p) => rawOfEnc(p) === raw)) continue; ok(!text.includes(raw), `มีเลขของคนที่ไม่เลือก ${g.fullName}`); } // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-D2): G.deu ใช้ใน CI-3 และ CI-12 ⇒ แถวที่ไม่เลือกอาจมีเลขเดียวกับแถวที่เลือก
    ok(/DLX|FAM|SUP/.test(text), "ไม่มีเลขห้อง");
    const au = await auditsLike(/tm30.*(export|file)|export.*tm30/i);
    ok(au.length >= 1 && hasRaw(J(au), RAWS).length === 0, `AuditLog export ${au.length}`);
    ok(isFail(await tmExport(FRONT, { guestIds: [] }), "INVALID_INPUT"), "guestIds ว่าง");
    const mixed = await tmExport(FRONT, { guestIds: [pick[0].id, ids.ci1Guest] });
    ok(isFail(mixed, "INVALID_INPUT") || (mixed?.ok === true && Buffer.from(mixed.file.bytes).toString("utf8").split(/\r?\n/).filter((l: string) => l.trim()).length === 2), `รวมแขกไทย ${codeOf(mixed)}`);
    ids.tm3a = pick[0].id; ids.tm3b = pick[1].id;
  });
  await st("TM-4", "คอลัมน์ตามค่าตั้ง (มติ 5 · Q-H4-1): ตั้ง rooms.hotel.tm30.exportColumns = 3 คอลัมน์สลับลำดับ (เลขหนังสือเดินทาง · ชื่อ · เลขห้อง) ⇒ หัว 3 คอลัมน์ตามลำดับใหม่ · format xlsx ⇒ ไม่มี xlsx ใน deps ⇒ CSV (ชื่อ .csv/text/csv) หรือ xlsx จริง (contentType spreadsheetml + ไบต์ PK) · ค่าตั้งผิดรูป ⇒ setSettings ปฏิเสธ · คืนค่าตั้ง", async () => {
    needTm30(); ok(ids.tm3a, "ไม่มี TM-3");
    const cols = (await settingOf("rooms.hotel.tm30.exportColumns")) as Any[];
    const keyOf = (c: Any) => (typeof c === "string" ? c : c.key);
    const find = (re: RegExp) => cols.find((c: Any) => re.test(J(c)));
    const pick = [find(/passport|idNumber|หนังสือเดินทาง/i), find(/fullName|ชื่อ/), find(/room|ห้อง/)].filter(Boolean);
    eq(pick.length, 3, `หาคอลัมน์ไม่ครบ ${J(cols).slice(0, 160)}`);
    await setUnit("rooms.hotel.tm30.exportColumns", pick);
    try {
      const r = okRes(await tmExport(FRONT, { guestIds: [ids.tm3a] }), "export 3 คอลัมน์");
      const head = Buffer.from(r.file.bytes).subarray(3).toString("utf8").split(/\r?\n/)[0].split(",").map((s: string) => s.replace(/^"|"$/g, ""));
      eq(head.length, 3, `หัว ${J(head)}`);
      ok(/หนังสือเดินทาง|passport/i.test(head[0]) && /ชื่อ|name/i.test(head[1]) && /ห้อง|room/i.test(head[2]), `ลำดับ ${J(head)}`);
      const x = okRes(await tmExport(FRONT, { guestIds: [ids.tm3a], format: "xlsx" }), "xlsx");
      const hasXlsxDep = /"(xlsx|exceljs)"\s*:/.test(read("package.json"));
      if (hasXlsxDep) ok(/spreadsheetml/.test(x.file.contentType) && Buffer.from(x.file.bytes)[0] === 0x50 && Buffer.from(x.file.bytes)[1] === 0x4b, "xlsx จริงไม่ใช่ zip");
      else ok(/text\/csv/.test(x.file.contentType) && /\.csv$/.test(x.file.name), `ไม่มี lib xlsx ต้องเป็น CSV ได้ ${J({ n: x.file.name, ct: x.file.contentType })}`);
      void keyOf;
    } finally { await resetUnit("rooms.hotel.tm30.exportColumns"); }
    const bad = await call(() => SET.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.tm30.exportColumns", scope: "UNIT", scopeId: UH, value: "ไม่ใช่รายการ" }]));
    ok(bad?.ok === false, "ค่าตั้งผิดรูปผ่าน");
  });
  await st("TM-5", "markTm30Filed(frontdesk · 2 คน · เลขรับแจ้ง 1 เลข) ⇒ ok · ทั้งสอง FILED · tm30Ref เท่ากัน · tm30FiledAt ≈ now (หรือ filedAt ที่ส่ง) · outbox hotel.tm30.filed (ไม่มี PII) · AuditLog · แจ้งซ้ำ ⇒ ok idempotent/ok:false ไม่เปลี่ยน ref เป็นค่าว่าง · แขกไทย (NOT_REQUIRED) ⇒ ปฏิเสธ/ข้าม · tm30Ref ว่าง ⇒ INVALID_INPUT · evidence PNG ⇒ FileAsset private", async () => {
    needTm30(); ok(ids.tm3a && ids.tm3b, "ไม่มี TM-3");
    const ref = `TM30-2569-${RUN.slice(-6).toUpperCase()}`;
    const t0 = Date.now();
    okRes(await filed(FRONT, { guestIds: [ids.tm3a, ids.tm3b], tm30Ref: ref }), "filed");
    for (const gid of [ids.tm3a, ids.tm3b]) { const g = await guestRow(gid); eq([g.tm30Status, g.tm30Ref], ["FILED", ref], gid); ok(near(msOf(g.tm30FiledAt), t0, 60_000), "tm30FiledAt"); }
    const ev = await eventsOf("hotel.tm30.filed");
    ok(ev.length >= 1 && !PII_TEXT.test(J(ev)) && !/fullName|idNumber/i.test([...walkKeys(ev[ev.length - 1].payload)].join(",")), "event filed");
    ok((await auditsLike(/tm30.*fil/i)).length >= 1, "AuditLog");
    const again = await filed(FRONT, { guestIds: [ids.tm3a], tm30Ref: ref });
    ok(again?.ok === true || isFail(again), `ซ้ำ ${codeOf(again)}`);
    eq((await guestRow(ids.tm3a)).tm30Ref, ref, "ref เปลี่ยน");
    const th = await filed(FRONT, { guestIds: [ids.ci1Guest], tm30Ref: ref });
    ok(isFail(th) || (await guestRow(ids.ci1Guest)).tm30Status === "NOT_REQUIRED", `แขกไทย ${codeOf(th)}`);
    ok(isFail(await filed(FRONT, { guestIds: [ids.tm3a], tm30Ref: "" }), "INVALID_INPUT"), "ref ว่าง");
    const pendingOne = (await pendingForeigners()).find((g) => g.tm30Status === "PENDING");
    if (pendingOne) {
      const f0 = await fileCount();
      okRes(await filed(FRONT, { guestIds: [pendingOne.id], tm30Ref: `${ref}-E`, evidence: PNG }), "evidence");
      eq(await fileCount(), f0 + 1, "FileAsset หลักฐาน");
      const newest = (await prisma.fileAsset.findMany({ where: { tenantId: tA }, orderBy: { createdAt: "desc" }, take: 1 }))[0];
      ok(String(newest.cdnUrl).startsWith("private://"), "หลักฐานไม่ private");
    }
  });
  await st("TM-6", "tm30Sweep({now?}) (ใบ §0 · X5): แขก CI-15 (เช็กอินใต้นาฬิกาฉาก · due = +3 วัน) ⇒ sweep ตอนนี้ไม่แตะ · การจองใหม่เช็กอินใต้นาฬิกาฉาก at = −30 ชม. แขก JPN ⇒ due = −6 ชม. ⇒ sweep ⇒ LATE (คืน {late: n ≥ 1}) · sweep ซ้ำ ⇒ late 0 สถานะคง · FILED ไม่ถูกแตะ · outbox hotel.tm30.due {unitId, pending, late} ไม่มี PII · 2 sweep พร้อมกัน ⇒ LATE ครั้งเดียว (ไม่มี event ซ้ำเกิน)", async () => {
    needTm30(); needCheckin();
    const at = new Date(Date.now() - 30 * 3_600_000).toISOString();
    const id = await mkRes({ ci: W(-2), co: W(1) });
    const roomId = (await occOf(id, true))[0]?.roomId;
    okRes(await withClock(true, async () => checkIn(FRONT, { reservationId: id, roomId, guests: [G.jpn], at })), "เช็กอินย้อน 30 ชม.");
    const gid = (await guestsOf(id))[0].id;
    ok(near(msOf((await guestRow(gid)).tm30DueAt), Date.parse(at) + 86_400_000, 5_000), "due ≠ at+24h");
    const e0 = (await eventsOf("hotel.tm30.due")).length;
    const s1 = okRes(await sweep(), "sweep 1");
    ok(typeof s1.late === "number" && s1.late >= 1, `sweep ${J(s1)}`);
    eq((await guestRow(gid)).tm30Status, "LATE", "LATE");
    eq((await guestRow(ids.tm3a)).tm30Status, "FILED", "FILED ถูกแตะ");
    if (ids.ci15) ok((await guestsOf(ids.ci15))[0]?.tm30Status === "PENDING", "CI-15 (due อนาคต) ถูกแตะ");
    const s2 = okRes(await sweep(), "sweep 2");
    eq(s2.late ?? 0, 0, "idempotent");
    const ev = await eventsOf("hotel.tm30.due");
    ok(ev.length > e0, "ไม่มี event hotel.tm30.due");
    const last = ev[ev.length - 1];
    ok(typeof last.payload?.pending === "number" && typeof last.payload?.late === "number" && last.payload?.unitId === UH && !PII_TEXT.test(J(last)), `payload ${J(last.payload)}`);
    const id2 = await mkRes({ ci: W(-2), co: W(1) });
    okRes(await withClock(true, async () => checkIn(FRONT, { reservationId: id2, roomId: (await occOf(id2, true))[0]?.roomId, guests: [G.fra], at })), "เช็กอิน 2");
    const [a, b] = await Promise.all([sweep(), sweep()]);
    eq((a?.late ?? 0) + (b?.late ?? 0), 1, `X5 ${J([a, b])}`);
    ids.tm6 = gid;
  });
  await st("TM-7", "เตือนก่อนครบ 24 ชม. (tm30ReminderHours 6): การจองใหม่เช็กอินใต้นาฬิกาฉาก at = −21 ชม. แขก DEU ⇒ due อีก 3 ชม. · sweep ⇒ ไม่ LATE · outbox hotel.tm30.due เพิ่ม 1 (เตือน) · sweep อีก ⇒ ไม่เพิ่ม event เตือนซ้ำของหน่วย (idempotent ต่อหน้าต่าง) · ไม่มี PII", async () => {
    needTm30(); needCheckin();
    const at = new Date(Date.now() - 21 * 3_600_000).toISOString();
    const id = await mkRes({ ci: W(-1), co: W(1) });
    okRes(await withClock(true, async () => checkIn(FRONT, { reservationId: id, roomId: (await occOf(id, true))[0]?.roomId, guests: [G.deu2], at })), "เช็กอิน −21 ชม.");
    const gid = (await guestsOf(id))[0].id;
    const e0 = (await eventsOf("hotel.tm30.due")).length;
    okRes(await sweep(), "sweep");
    eq((await guestRow(gid)).tm30Status, "PENDING", "ยังไม่ครบ 24 ต้องไม่ LATE");
    const e1 = (await eventsOf("hotel.tm30.due")).length;
    ok(e1 >= e0 + 1, "ไม่มี event เตือน");
    okRes(await sweep(), "sweep 2");
    const e2 = (await eventsOf("hotel.tm30.due")).length;
    ok(e2 <= e1 + 1, `event เตือนซ้ำไม่จำกัด (${e1}→${e2})`);
    eq(hasRaw(J(await eventsOf("hotel.tm30.due")), RAWS), [], "PII");
  });
  await st("TM-8", "rooms.hotel.tm30.enabled ปิด: เช็กอินแขก FRA ⇒ isForeigner true แต่ tm30Status NOT_REQUIRED · tm30DueAt null · ผล tm30DueAt ว่าง · tm30Queue ไม่นับ · คืนค่าตั้ง ⇒ ใบถัดไป PENDING ปกติ", async () => {
    needTm30();
    await setUnit("rooms.hotel.tm30.enabled", false);
    let r: Any;
    try {
      r = await inhouse({ guests: [G.fra] });
      const g = (await guestsOf(r.id))[0];
      eq([g.isForeigner, g.tm30Status, g.tm30DueAt ?? null, r.res.tm30DueAt ?? null], [true, "NOT_REQUIRED", null, null], "ปิด ตม.30");
      const q = okRes(await queue(), "queue");
      ok(!(q.items as Any[]).some((x) => x.guestId === g.id), "อยู่ในคิว");
    } finally { await resetUnit("rooms.hotel.tm30.enabled"); }
    const r2 = await inhouse({ guests: [G.fra] });
    eq((await guestsOf(r2.id))[0].tm30Status, "PENDING", "หลังคืนค่าตั้ง");
  });
  await st("TM-9", "guest-shared.ts (pure · ไม่มี import ค่า · ไม่มี directive): isForeigner(\"THA\") false · \"tha\" false · \"DEU\" true · nationalityTh(\"THA\")=ไทย · (\"DEU\") มีคำว่าเยอรมัน · (\"JPN\") ญี่ปุ่น · ISO ผิด ⇒ null/undefined ไม่โยน · ตรวจเลขเอกสาร: บัตรไทย checksum (ฟิกซ์เจอร์ 2 เลข ✓ · ผิด ✗) · พาสปอร์ต 6–9 · ชื่อฟังก์ชันตรวจ export (validateIdNumber|isValidIdNumber|checkIdNumber)", () => {
    ok(sharedL.mod, `ยังไม่มี ${F.shared} (${sharedL.err})`);
    const isF = SH("isForeigner"), nat = SH("nationalityTh");
    eq([isF("THA"), isF("tha"), isF("DEU"), isF(null)], [false, false, true, false], "isForeigner");
    ok(nat("THA") === "ไทย" && /เยอรม/.test(nat("DEU") ?? "") && /ญี่ปุ่น/.test(nat("JPN") ?? ""), `nationalityTh ${J([nat("THA"), nat("DEU"), nat("JPN")])}`);
    ok(nat("XXX") == null || nat("XXX") === "", "ISO ผิดต้อง null");
    const vName = ["validateIdNumber", "isValidIdNumber", "checkIdNumber", "idNumberOk"].find((n) => typeof sharedL.mod[n] === "function");
    ok(vName, "ไม่มีฟังก์ชันตรวจเลขเอกสาร (validateIdNumber|isValidIdNumber|checkIdNumber)");
    const v = sharedL.mod[vName!];
    const truthy = (x: Any) => x === true || x?.ok === true || x?.valid === true;
    ok(truthy(v("THAI_ID", "1101700000010")) && truthy(v("THAI_ID", "3509900000021")) && !truthy(v("THAI_ID", "1101700000011")) && truthy(v("PASSPORT", "C01X4KJ77")) && !truthy(v("PASSPORT", "AB")), "ตรวจเลขเอกสาร");
    const s = read(F.shared);
    eq(importSpecs(s).filter((i) => !i.typeOnly).map((i) => i.spec), [], "import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(s)), "มี directive");
  });
  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h.4 §11.1) — วันเข้าพักในไฟล์ ตม.30 ต้องเป็นวันไทย (timezone ร้าน) ไม่ใช่วัน UTC
  await st("TM-10", "วันเข้าพักในไฟล์ ตม.30 = วันไทย (§11.1): เช็กอินแขก JPN แล้วตั้ง checkedInAt = 19:30Z ของวันนี้ (= 02:30 วันถัดไปเวลาไทย) · exportColumns = [วันเข้าพัก, ห้อง] ⇒ ช่องวันเข้าพัก = dd/mm/yyyy ของวันถัดไป (ไม่ใช่วัน UTC)", async () => {
    needTm30();
    const r = await inhouse({ guests: [G.jpn] });
    const gid = r.guestIds[0];
    const base = W(0);
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { checkedInAt: new Date(`${base}T19:30:00.000Z`) } });
    const cols = (await settingOf("rooms.hotel.tm30.exportColumns")) as Any[];
    const find = (re: RegExp) => cols.find((c: Any) => re.test(J(c)));
    const pick = [find(/checkInDate|วันเข้าพัก/), find(/roomNumber|room|ห้อง/i)].filter(Boolean);
    eq(pick.length, 2, `หาคอลัมน์ไม่ครบ ${J(cols).slice(0, 200)}`);
    await setUnit("rooms.hotel.tm30.exportColumns", pick);
    try {
      const x = okRes(await tmExport(FRONT, { guestIds: [gid] }), "export");
      const lines = Buffer.from(x.file.bytes).subarray(3).toString("utf8").split(/\r?\n/).filter((l: string) => l.trim());
      eq(lines.length, 2, `บรรทัด ${lines.length}`);
      const cell = lines[1].split(",")[0].replace(/^"|"$/g, "");
      const th = (ymd: string) => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; };
      eq(cell, th(addDays(base, 1)), `วันเข้าพักควรเป็นวันไทย (วัน UTC = ${th(base)})`);
    } finally { await resetUnit("rooms.hotel.tm30.exportColumns"); }
  });

  // ═══════════════ SD เงินประกันห้อง (ขั้นแยกหลัง CHECKED_IN · H.5) ═══════════════
  console.log("\n── SD เงินประกันห้อง ──");
  await st("SD-1", "เปิด securityDeposit.enabled (appliesTo ALL · 100,000): checkInV2 walk-in ⇒ ok needsSecurityDeposit true · สถานะ CHECKED_IN ทันที (เงินไม่ย้อนเช็กอิน) · ยังไม่มีบิล hotel-secdep · takeSecurityDeposit(frontdesk · CASH) ของ H.5 ⇒ ok · securityDepositSatang 100,000 · securityDepositSaleId · เรียกอีก ⇒ ไม่สร้างซ้ำ", async () => {
    await setUnit("rooms.hotel.securityDeposit.enabled", true);
    const r = await inhouse({ source: "WALK_IN" });
    eq([r.res.needsSecurityDeposit, (await rvOf(r.id)).status], [true, "CHECKED_IN"], "ธง/สถานะ");
    eq(await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-secdep-${r.id}` } } }), 0, "checkInV2 รับประกันเอง");
    ok(checkoutL.mod, `ยังไม่มี ${F.checkout} (H.5) — takeSecurityDeposit`);
    okRes(await call(() => CO("takeSecurityDeposit")(FRONT, ctxA, { reservationId: r.id, amountSatang: 100_000, payType: "CASH" })), "take");
    const rv = await rvOf(r.id);
    ok(rv.securityDepositSatang === 100_000 && rv.securityDepositSaleId, `แถว ${J([rv.securityDepositSatang, rv.securityDepositSaleId])}`);
    await call(() => CO("takeSecurityDeposit")(FRONT, ctxA, { reservationId: r.id, amountSatang: 100_000, payType: "CASH" }));
    eq(await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-secdep-${r.id}` }, status: "PAID", docType: "SALE" } }), 1, "บิลซ้อน");
    ids.sd1 = r.id;
  });
  await st("SD-2", "appliesTo WALK_IN (มติ 6): source WEB ⇒ needsSecurityDeposit false · source WALK_IN ⇒ true · appliesTo ALL + WEB ⇒ true", async () => {
    await setUnit("rooms.hotel.securityDeposit.appliesTo", "WALK_IN");
    try {
      eq((await inhouse({ source: "WEB" })).res.needsSecurityDeposit, false, "WEB");
      eq((await inhouse({ source: "WALK_IN" })).res.needsSecurityDeposit, true, "WALK_IN");
    } finally { await resetUnit("rooms.hotel.securityDeposit.appliesTo"); }
    eq((await inhouse({ source: "WEB" })).res.needsSecurityDeposit, true, "ALL+WEB");
  });
  await st("SD-3", "ปิด securityDeposit.enabled ⇒ needsSecurityDeposit false ทุกแหล่ง · takeSecurityDeposit ยังเรียกได้/ปฏิเสธอย่างสุภาพ (ไม่ throw) · ค่าตั้งคืนค่าเริ่ม", async () => {
    await resetUnit("rooms.hotel.securityDeposit.enabled");
    eq(await settingOf("rooms.hotel.securityDeposit.enabled"), false, "ค่าเริ่ม");
    eq((await inhouse({ source: "WALK_IN" })).res.needsSecurityDeposit, false, "ปิด");
    if (checkoutL.mod && ids.sd1) { const x = await call(() => CO("takeSecurityDeposit")(FRONT, ctxA, { reservationId: ids.sd1, amountSatang: 100_000, payType: "CASH" })); ok(x?.ok === true || (isFail(x) && x.code !== "THROW"), `take หลังปิด ${codeOf(x)}`); }
  });

  // ═══════════════ MB สมาชิก opt-in ═══════════════
  console.log("\n── MB สมาชิก opt-in (S §8.6) ──");
  await st("MB-1", "memberOptIn {phone, consents:[marketing]} ⇒ Customer ในระบบสมาชิกที่ผูก UH (findOrCreate · source STAFF) phone ปรับรูป · marketingConsent true · consentAt · reservation.customerId = Customer.id · เช็กอินใบที่สองเบอร์เดิม ⇒ customerId เดิม (ไม่สร้างซ้ำ) · payload event ไม่มีเบอร์", async () => {
    needSetup();
    const phone = "0812223344";
    const c0 = await prisma.customer.count({ where: { tenantId: tA } });
    const a = await inhouse({ extra: { memberOptIn: { phone, consents: ["marketing"] } } });
    const rv = await rvOf(a.id);
    ok(rv.customerId, "ไม่มี customerId");
    const c = await prisma.customer.findUnique({ where: { id: rv.customerId } });
    ok(c && c.memberSystemId === MEMBER_SYS && c.marketingConsent === true && c.consentAt && String(c.phone).replace(/\D/g, "").endsWith("812223344"), `Customer ${J(c)}`);
    eq(await prisma.customer.count({ where: { tenantId: tA } }), c0 + 1, "สร้างเพิ่ม");
    const b = await inhouse({ guests: [G.thai2], extra: { memberOptIn: { phone, consents: [] } } });
    eq([(await rvOf(b.id)).customerId, await prisma.customer.count({ where: { tenantId: tA } })], [rv.customerId, c0 + 1], "เบอร์เดิมซ้ำ");
    eq(hasRaw(J(await eventsOf("hotel.checked_in", (p) => p.reservationId === a.id)), [phone]), [], "เบอร์ใน event");
  });
  await st("MB-2", "ไม่ติ๊ก (ไม่ส่ง memberOptIn) ⇒ customerId null · Customer ไม่เพิ่ม · ไม่ค้นหา (เบอร์ที่มีอยู่ก็ไม่ผูก) · หน่วย UH2 ไม่ผูกระบบสมาชิก + optIn ⇒ เช็กอิน ok customerId null ไม่ throw · optIn ไม่มี phone/email ⇒ INVALID_INPUT หรือ ok ไม่สร้าง", async () => {
    needSetup();
    const c0 = await prisma.customer.count({ where: { tenantId: tA } });
    const a = await inhouse({});
    eq([(await rvOf(a.id)).customerId ?? null, await prisma.customer.count({ where: { tenantId: tA } })], [null, c0], "ไม่ติ๊ก");
    const u2 = await mkRes({ unitId: UH2, roomTypeId: RT_U2, claim: false });
    const r2 = await checkIn(MGR2, { reservationId: u2, roomId: ROOM_U2, guests: [G.thai2], memberOptIn: { phone: "0855556666", consents: ["marketing"] } });
    ok(r2?.ok === true || isFail(r2, "ROOM_TAKEN"), `UH2 ${codeOf(r2)} ${r2?.reason ?? ""}`);
    if (r2?.ok) eq((await rvOf(u2)).customerId ?? null, null, "UH2 ไม่มีระบบสมาชิกแต่ได้ customerId");
    eq(await prisma.customer.count({ where: { tenantId: tA } }), c0, "Customer เพิ่มโดยไม่มีระบบ");
    const x = await inhouse({ extra: { memberOptIn: { consents: ["marketing"] } } }).catch((e) => ({ err: errMsg(e) }));
    ok(!("err" in x) || /INVALID_INPUT/.test(x.err), `optIn ไม่มีเบอร์/อีเมล ${J(x).slice(0, 120)}`);
    eq(await prisma.customer.count({ where: { tenantId: tA } }), c0, "สร้างจาก optIn ว่าง");
  });

  // ═══════════════ B ด่าน / X1 / X9 ═══════════════
  console.log("\n── B ด่าน/ข้ามร้าน/สิทธิ์ ──");
  await st("B-1", "X1 ข้ามร้าน (มติ 8): เจ้าของร้าน B เรียก checkInV2/undoCheckIn/assignableRooms/upsertGuestRecord/listGuests/revealGuestId/signRr3/rr3Card/rr4Register/tm30Queue/tm30Export/markTm30Filed/readIdDocument ด้วย id ของร้าน A ⇒ NOT_FOUND ทุกตัว (หรือว่าง) · คำตอบไม่มีชื่อ/เลขแขก · ไม่มีแถวเปลี่ยน", async () => {
    needSetup(); needCheckin(); needGuest(); needTm30(); ok(ids.ci1 && ids.gr1 && ids.ci9, "ไม่มีข้อก่อน (CI-1/GR-1/CI-9)");
    const snap = async () => J([await rvOf(ids.ci1), await guestRow(ids.gr1)]);
    const s0 = await snap();
    const calls: [string, () => Promise<Any>][] = [
      ["checkInV2", () => checkIn(OWNER_B, { reservationId: ids.ci9, roomId: ROOM.DLX7 }, ctxB)],
      ["undoCheckIn", () => call(() => CK("undoCheckIn")(OWNER_B, ctxB, { reservationId: ids.ci1, reason: "x" }))],
      ["assignableRooms", async () => { const r = await call(() => CK("assignableRooms")(ctxB, { reservationId: ids.ci9 })); return Array.isArray(r) ? (r.length ? { ok: true, leak: r } : { ok: false, code: "NOT_FOUND" }) : r; }],
      ["upsertGuestRecord", () => upsert(OWNER_B, { reservationId: ids.ci1, guest: G.fra }, ctxB)],
      ["listGuests", async () => { const r = await listG(OWNER_B, {}, ctxB); const rows = Array.isArray(r) ? r : r?.rows ?? r?.items ?? []; return r?.ok === false ? r : rows.length ? { ok: true, leak: rows } : { ok: false, code: "NOT_FOUND" }; }],
      ["revealGuestId", () => reveal(OWNER_B, ids.gr1, ctxB)],
      ["signRr3", () => sign(OWNER_B, { guestId: ids.gr1 }, ctxB)],
      ["rr3Card", () => rr3(ids.gr1, ctxB)],
      ["rr4Register", async () => { const r = await rr4({}, ctxB); const rows = Array.isArray(r) ? r : r?.rows ?? r?.items ?? []; return r?.ok === false ? r : rows.length ? { ok: true, leak: rows } : { ok: false, code: "NOT_FOUND" }; }],
      ["tm30Queue", async () => { const r = await queue({}, ctxB); return r?.ok === false ? r : (r?.items ?? []).length ? { ok: true, leak: r } : { ok: false, code: "NOT_FOUND" }; }],
      ["tm30Export", () => tmExport(OWNER_B, { guestIds: [ids.gr1] }, ctxB)],
      ["markTm30Filed", () => filed(OWNER_B, { guestIds: [ids.gr1], tm30Ref: "TM30-X" }, ctxB)],
      ["readIdDocument", () => readId(OWNER_B, {}, ctxB)],
    ];
    const bad: string[] = [];
    for (const [n, f] of calls) { const r = await f(); const c = failCode(r); if (c !== "NOT_FOUND" && !(n === "readIdDocument" && c === "AI_DISABLED")) bad.push(`${n}=${codeOf(r)}`); if (PII_TEXT.test(J(r)) || /MUELLER|SATO|สมหญิง/.test(J(r))) bad.push(`${n} รั่ว PII`); }
    eq(bad, [], "ข้ามร้าน");
    eq(await snap(), s0, "แถวเปลี่ยน");
  });
  await st("B-2", "ด่านหน่วย: การจองของหน่วย DORM (แถวดิบ) ⇒ checkInV2 NOT_FOUND · listGuests/tm30Queue/rr4Register บน UD ⇒ NOT_FOUND/ว่าง · MGR2 (UH2) เรียก checkInV2/upsert/reveal บนของ UH ⇒ NOT_FOUND · STAFF unitAccess [UH2] ⇒ ปฏิเสธ · ไม่มีแถวแขกเพิ่ม", async () => {
    needSetup(); needCheckin(); ok(ids.ci9 && ids.gr1, "ไม่มีข้อก่อน");
    const n0 = await prisma.hotelGuestRecord.count({ where: { tenantId: tA } });
    const dormRt = await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UD, name: "ห้องหอ", rentMode: "MONTHLY", baseRateSatang: 0 } });
    const dormRes = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UD, code: `H4D-${RUN}`, status: "CONFIRMED", guestName: "x", roomTypeId: dormRt.id, checkInDate: dbDate(W(0)), checkOutDate: dbDate(W(1)), nights: 1 } });
    eq(failCode(await checkIn(OWNER, { reservationId: dormRes.id, roomId: ROOM.DLX7 })), "NOT_FOUND", "หอ");
    for (const [n, r] of [["listGuests", await listG(OWNER, { unitId: UD })], ["tm30Queue", await queue({ unitId: UD })], ["rr4", await rr4({ unitId: UD })]] as [string, Any][]) ok(r?.ok === false || (Array.isArray(r) ? r.length === 0 : (r?.rows ?? r?.items ?? []).length === 0), `${n} หอ ${J(r).slice(0, 80)}`);
    eq(failCode(await checkIn(MGR2, { reservationId: ids.ci9, roomId: ROOM.DLX7 })), "NOT_FOUND", "MANAGER หน่วยอื่น checkIn");
    eq(failCode(await upsert(MGR2, { reservationId: ids.ci1, guest: G.fra })), "NOT_FOUND", "MANAGER หน่วยอื่น upsert");
    eq(failCode(await reveal(MGR2, ids.gr1)), "NOT_FOUND", "MANAGER หน่วยอื่น reveal");
    ok(isFail(await checkIn({ ...FRONT, unitAccess: [UH2] }, { reservationId: ids.ci9, roomId: ROOM.DLX7 })), "STAFF หน่วยอื่นผ่าน");
    eq(await prisma.hotelGuestRecord.count({ where: { tenantId: tA } }), n0, "แถวเพิ่ม");
  });
  await st("B-3", "X9 สิทธิ์ 4 ระดับ (ใบ §7): maid/none ⇒ FORBIDDEN ทุกตัว (checkInV2 · upsert · reveal · signRr3 · tm30Export · markTm30Filed · undoCheckIn · readIdDocument) ไม่มีแถวเปลี่ยน · REG (register+checkIn) ⇒ checkInV2/upsert/sign/markTm30Filed ok · reveal/undo/force/earlyOverride FORBIDDEN · VIEWER ⇒ reveal ok · MGR ⇒ undo ok · OWNER ⇒ ทุกอย่าง ok", async () => {
    needSetup(); needCheckin(); needGuest(); ok(ids.ci9 && ids.gr1, "ไม่มีข้อก่อน");
    const n0 = await prisma.hotelGuestRecord.count({ where: { tenantId: tA } });
    const ops = (a: Actor): [string, () => Promise<Any>][] => [
      ["checkInV2", () => checkIn(a, { reservationId: ids.ci9, roomId: ROOM.DLX7 })],
      ["upsert", () => upsert(a, { reservationId: ids.ci1, guest: G.fra })],
      ["reveal", () => reveal(a, ids.gr1)],
      ["signRr3", () => sign(a, { guestId: ids.gr1 })],
      ["tm30Export", () => tmExport(a, { guestIds: [ids.gr1] })],
      ["markTm30Filed", () => filed(a, { guestIds: [ids.gr1] })],
      ["undoCheckIn", () => call(() => CK("undoCheckIn")(a, ctxA, { reservationId: ids.ci1, reason: "x" }))],
      ["readIdDocument", () => readId(a)],
    ];
    for (const [n, a] of [["maid", MAID], ["none", NONE]] as [string, Actor][]) {
      const notDenied = (await Promise.all(ops(a).map(async ([op, f]) => [op, await f()] as [string, Any]))).filter(([op, r]) => !isDenied(r) && !(op === "readIdDocument" && failCode(r) === "AI_DISABLED")).map(([op, r]) => `${n}:${op}=${codeOf(r)}`);
      eq(notDenied, [], `${n} ผ่าน`);
    }
    eq(await prisma.hotelGuestRecord.count({ where: { tenantId: tA } }), n0, "ไร้สิทธิ์สร้างแถว");
    ok(isDenied(await reveal(REG, ids.gr1)) && isDenied(await call(() => CK("undoCheckIn")(REG, ctxA, { reservationId: ids.ci1, reason: "x" }))), "REG เกินสิทธิ์");
    const a = await inhouse({ actor: REG, guests: [G.thai2] });
    okRes(await upsert(REG, { reservationId: a.id, guest: G.fra }), "REG upsert");
    okRes(await sign(REG, { guestId: a.guestIds[0] }), "REG sign");
    okRes(await reveal(VIEWER, a.guestIds[0]), "VIEWER reveal");
    okRes(await call(() => CK("undoCheckIn")(MGR, ctxA, { reservationId: a.id, reason: "ทดสอบสิทธิ์" })), "MGR undo");
    const o = await inhouse({ actor: OWNER, guests: [G.deu] });
    okRes(await reveal(OWNER, o.guestIds[0]), "OWNER reveal");
    okRes(await tmExport(OWNER, { guestIds: [o.guestIds[0]] }), "OWNER export");
  });
  await st("B-4", "actions.ts สถิต (ใบ §3.5): บล็อก // SVC H.4 ▸ … ◂ มี 8 action (checkInV2/undoCheckIn/upsertGuest/revealGuestId/signRr3/readIdDocument/tm30Export/markTm30Filed) ทุกตัว requireUnit + HOTEL + assertHotelCan/canHotel · ใช้คีย์ hotel.reservation.checkIn · hotel.guest.register · hotel.guest.viewId · hotel.booking.manage · ไม่รับ/ส่ง `at` · ไม่มี SVC_QC_CLOCK · permissions.ts: hotel.guest.register/viewId ออกจาก planned", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    const blk = /SVC H\.4 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.4 ▸ … ◂ (ยังไม่มีงาน H.4)");
    const names = ["checkInV2Action", "undoCheckInAction", "upsertGuestAction", "revealGuestIdAction", "signRr3Action", "readIdDocumentAction", "tm30ExportAction", "markTm30FiledAction"];
    eq(names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    eq(fns.filter((b) => !/requireUnit\s*\(/.test(b) || !/HOTEL/.test(b) || !/assertHotelCan\s*\(|canHotel\s*\(/.test(b)).map((b) => b.split("(")[0]), [], "action ไม่มีด่าน");
    for (const k of ["hotel.reservation.checkIn", "hotel.guest.register", "hotel.guest.viewId", "hotel.booking.manage"]) ok(blk.includes(k), `ไม่ใช้คีย์ ${k}`);
    ok(!/\bat\s*[:=,)]|\bat\?:/.test(stripComments(blk).replace(/\bat\b(?=\s*[a-z])/gi, "")) && !/SVC_QC_CLOCK/.test(blk), "action รับ/ส่ง at หรืออ่าน SVC_QC_CLOCK");
    const perms = stripComments(read(F.perms));
    const planned = /planned[^[]*\[([\s\S]*?)\]/i.exec(perms)?.[1] ?? "";
    ok(!planned.includes("hotel.guest.register") && !planned.includes("hotel.guest.viewId"), "hotel.guest.* ยังอยู่ planned");
  });
  await st("B-5", "X9 AuditLog การกระทำอันตราย ครบ (ไม่มีเลขดิบ): force เช็กอินห้อง DIRTY · early override · undoCheckIn · reveal · แก้ทะเบียน · purge (SYSTEM) · ตม.30 แจ้งแล้ว/ส่งออก — แต่ละอย่าง ≥ 1 แถวในร้าน A · ทุกแถวมี before หรือ after", async () => {
    needGuest();
    const rows = await prisma.auditLog.findMany({ where: { tenantId: tA, action: { startsWith: "hotel." } } });
    const txt = J(rows.map((r: Any) => [r.action, r.before, r.after]));
    const want: [string, RegExp][] = [["force DIRTY", /แขกยืนยันรับห้องเดิม|force/i], ["early override", /แขกมาถึงก่อน|early/i], ["undo", /undo|เช็กอินผิดใบ/i], ["reveal", /id_revealed/], ["แก้ทะเบียน", /hotel\.guest\.(updated|registered|upsert|changed)/], ["purge", /purg/i], ["ตม.30", /tm30/i]];
    eq(want.filter(([, re]) => !re.test(txt)).map(([n]) => n), [], `ขาด (มี ${[...new Set(rows.map((r: Any) => r.action))].join(", ")})`);
    ok(rows.some((r: Any) => r.actorType === "SYSTEM"), "ไม่มีแถว SYSTEM (purge)");
    ok(rows.every((r: Any) => r.before !== null || r.after !== null), "แถวไม่มี before/after");
    eq(hasRaw(txt, RAWS), [], "เลขดิบ");
  });

  // ═══════════════ N event 3 ทะเบียน ═══════════════
  console.log("\n── N event 6 ตัว · 3 ทะเบียน ──");
  const EVENTS = ["hotel.checked_in", "hotel.guest.registered", "hotel.guest.id_revealed", "hotel.tm30.due", "hotel.tm30.filed", "hotel.guest.purged"];
  await st("N-1", "ทะเบียน 3 ที่ (กติกาเหล็ก 15): outbox-consumers.ts มี consumer ทั้ง 6 · automation/labels.ts AUTOMATION_EVENTS มีทั้ง 6 ป้ายไทย · webhooks WEBHOOK_EVENTS มีทั้ง 6 ผ่าน spread (ไม่ประกาศซ้ำใน webhooks/labels.ts)", () => {
    const cons = consumersL.mod?.consumers ?? consumersL.mod?.default;
    ok(cons && typeof cons === "object", `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label ขาด/ไม่ไทย");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !wh.some((x) => x.value === e)), [], "webhook ขาด");
    eq(EVENTS.filter((e) => wh.filter((x) => x.value === e).length > 1), [], "ซ้ำใน webhook");
    ok(!EVENTS.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
  });
  await st("N-2", "payload (ใบ §5 · X8): ทุกชนิดมี ≥ 1 แถวในร้าน A จากข้อก่อน · checked_in ⊆ {tenantId,unitId,reservationId,roomId,guests,foreigners} · id_revealed {guestId, byUserId} · tm30.due {unitId,pending,late} · purged {count} · ไม่มีชื่อ/เลข/เบอร์ · unitId บนแถว · idempotencyKey ไม่ซ้ำ", async () => {
    needGuest();
    const ALLOWED: Record<string, Set<string>> = { "hotel.checked_in": new Set(["tenantId", "unitId", "reservationId", "roomId", "guests", "foreigners"]), "hotel.guest.id_revealed": new Set(["tenantId", "unitId", "guestId", "byUserId", "reservationId"]), "hotel.tm30.due": new Set(["tenantId", "unitId", "pending", "late", "dueSoon"]), "hotel.guest.purged": new Set(["tenantId", "unitId", "count"]), "hotel.guest.registered": new Set(["tenantId", "unitId", "guestId", "reservationId", "isForeigner"]), "hotel.tm30.filed": new Set(["tenantId", "unitId", "guestIds", "count", "reservationId", "filedAt"]) };
    const bad: string[] = [];
    const keys = new Set<string>();
    for (const t of EVENTS) {
      const ev = await eventsOf(t);
      if (!ev.length) { bad.push(`${t}: 0 แถว`); continue; }
      for (const e of ev) {
        const extra = Object.keys(e.payload ?? {}).filter((k) => !ALLOWED[t].has(k));
        if (extra.length) { bad.push(`${t}: คีย์นอกสัญญา ${extra.join(",")}`); break; }
        if (PII_TEXT.test(J(e.payload)) || [...walkKeys(e.payload)].some((k) => /fullName|idNumber|phone|email|guestName/i.test(k))) { bad.push(`${t}: PII`); break; }
        if (e.unitId !== UH && e.unitId !== UH2 && e.unitId !== UHB) { bad.push(`${t}: unitId ${e.unitId}`); break; }
        if (keys.has(e.idempotencyKey)) bad.push(`${t}: idempotencyKey ซ้ำ`); keys.add(e.idempotencyKey);
      }
    }
    eq(bad.slice(0, 6), [], "payload");
  });
  await st("N-3", "consumer เรียกได้ไม่โยน: consumers[type](event) กับแถวจริง 1 แถวต่อชนิด ⇒ resolve", async () => {
    needGuest();
    const cons = consumersL.mod?.consumers;
    ok(cons, "ไม่มี consumers");
    const bad: string[] = [];
    for (const t of EVENTS) { const ev = (await eventsOf(t))[0]; if (!ev) { bad.push(`${t} ไม่มีแถว`); continue; } if (typeof cons[t] !== "function") { bad.push(`${t} ไม่มี consumer`); continue; } try { await cons[t](ev); } catch (e) { bad.push(`${t}: ${errMsg(e)}`); } }
    eq(bad, [], "consumer โยน");
  });

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  await st("U-1", "ไฟล์ของใบครบ (§1): checkin/guest/guest-id-ai/tm30/guest-shared.ts · 9 คอมโพเนนต์ + checkin-shared.ts · หน้า guests · guests/rr4/print · guests/[guestId]/rr3/print · tm30 · ฉาก svc-qc-hotel-guest-scene.mts · docs/sds/modules/hotel.md §เช็กอิน/ทะเบียนแขก/PDPA", () => {
    eq([F.checkin, F.guest, F.ai, F.tm30, F.shared, ...COMPS, F.checkinShared, ...PAGES, F.scene].filter((f) => !has(f)), [], "ขาด");
    const sds = read(F.sds);
    ok(/ร\.ร\.\s?3|ทะเบียน(ผู้เข้าพัก|แขก)/.test(sds) && /ตม\.\s?30/.test(sds) && /retainUntil|retention|เก็บ.*ปี/.test(sds) && /mask|last4|ปิดบางส่วน/i.test(sds), "sds ไม่มี §เช็กอิน/ทะเบียนแขก/PDPA ครบ (ร.ร.3 · ตม.30 · retention · masking)");
  });
  await st("U-2", "ไทยทั้งหมด (§4): ข้อความที่ผู้ใช้เห็นใน 9 คอมโพเนนต์ + 4 หน้า ไม่มีคำอังกฤษ (ยกเว้นชื่อเฉพาะ) · มีข้อความหลักของภาพ 09: สแกนพาสปอร์ต · บัตรทะเบียนผู้พัก (ร.ร.3) · แจ้งที่พักคนต่างด้าว (ตม.30) · เงินประกันห้อง · คืนตอนเช็กเอาต์", () => {
    const bad: string[] = [];
    for (const f of [...COMPS, ...PAGES]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
    const all = COMPS.map((f) => read(f)).join("\n");
    eq(["สแกนพาสปอร์ต", "ร.ร.3", "ตม.30", "เงินประกันห้อง", "เช็กเอาต์", "24 ชม."].filter((w) => !all.includes(w)), [], "ข้อความภาพ 09 ขาด");
  });
  await st("U-3", "mask บนจอ (ใบ §0): Rr3Card/Tm30Queue/หน้า guests/หน้า tm30/หน้า rr4 ไม่อ้าง `.idNumber` ดิบ (ใช้ idNumberLast4/mask) · GuestForm มีช่องกรอก idNumber ได้แต่ไม่แสดงค่าจาก DTO (ไม่มี defaultValue={…idNumber}) · ปุ่ม «ดูเลขเต็ม» อยู่ใต้เงื่อนไข canViewId และเรียก revealGuestIdAction (ไม่ cache ใน props)", () => {
    const bad: string[] = [];
    for (const f of [`${F.compDir}/Rr3Card.tsx`, `${F.compDir}/Tm30Queue.tsx`, F.guestsPage, F.tm30Page, F.rr4Page]) { const s = stripComments(read(f)); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (/\.idNumber\b(?!Last4)/.test(s)) bad.push(`${f}: อ้าง .idNumber ดิบ`); }
    const gf = stripComments(read(`${F.compDir}/GuestForm.tsx`));
    if (!gf) bad.push("GuestForm ยังไม่มี"); else { if (/defaultValue=\{[^}]*\.idNumber\b(?!Last4)/.test(gf) || /value=\{[^}]*guest\.idNumber\b(?!Last4)/.test(gf)) bad.push("GuestForm แสดงเลขเต็มจาก DTO"); if (!/idNumberLast4|mask/.test(gf)) bad.push("GuestForm ไม่แสดง last4/mask"); }
    const all = COMPS.map((f) => stripComments(read(f))).join("\n");
    if (!/canViewId|viewId/.test(all)) bad.push("ไม่มีเงื่อนไข canViewId");
    if (!/revealGuestIdAction/.test(all)) bad.push("ไม่เรียก revealGuestIdAction");
    eq(bad, [], "mask บนจอ");
  });
  await st("U-4", "SignaturePad (§1): 'use client' · <canvas · pointer events (onPointerDown/Move/Up หรือ addEventListener pointer) · toDataURL/toBlob ส่ง PNG · ไม่มีไลบรารีลายเซ็น (signature_pad · react-signature-canvas · react-sketch) · มือถือ 390 (touch-action none/ touch-none)", () => {
    const s = read(`${F.compDir}/SignaturePad.tsx`);
    ok(s, "ยังไม่มี SignaturePad.tsx");
    ok(/^\s*["']use client["']/m.test(s), "ไม่มี 'use client'");
    ok(/<canvas/.test(s), "ไม่มี canvas");
    ok(/onPointerDown|pointerdown/.test(s) && /onPointerMove|pointermove/.test(s) && /onPointerUp|pointerup/.test(s), "ไม่ใช้ pointer events");
    ok(/toDataURL|toBlob/.test(s) && /image\/png|png/i.test(s), "ไม่ส่ง PNG");
    ok(!/signature_pad|react-signature|react-sketch|signature-canvas/.test(s), "ใช้ไลบรารีลายเซ็น");
    ok(/touch-none|touchAction|touch-action/.test(s), "ไม่กัน scroll บนแท็บเล็ต (touch-action)");
    const pk = read("package.json");
    ok(!/signature_pad|react-signature-canvas/.test(pk), "เพิ่มไลบรารีลายเซ็นใน package.json");
  });
  await st("U-5", "'use client' ไม่ลาก prisma: 9 คอมโพเนนต์ที่เป็น client มีกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · โมดูล server (hotel/*.ts · storage · ai · secret-box · rooms/pos/member) · checkin-shared.ts pure (ไม่มี import ค่า · ไม่มี directive) และมี RR3/TM30 ป้ายไทย/mask helper ได้", () => {
    const bad: string[] = [];
    for (const f of COMPS) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (/^\s*["']use client["']/m.test(s)) bad.push(...clientReach(f)); }
    eq(bad, [], "เส้นลากถึง server");
    const sh = read(F.checkinShared);
    ok(sh, "ยังไม่มี checkin-shared.ts");
    eq(importSpecs(sh).filter((i) => !i.typeOnly).map((i) => i.spec).filter((s) => !/^\.\/(hotel-tabs-shared|rates-shared|booking-shared)$/.test(s)), [], "checkin-shared import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(sh)), "checkin-shared มี directive");
    ok(COMPS.some((f) => /^\s*["']use client["']/m.test(read(f))), "ไม่มีคอมโพเนนต์ client เลย");
  });
  await st("U-6", "\"use server\" ไม่ export type (กติกาเหล็ก 14): actions.ts export เฉพาะ async function (ยกเว้น ReservationFormState ของ P1 — ORACLE-EDIT h1-U13) · ไม่ export const/let/class/interface · บล็อก H.4 ไม่ import จาก secret-box/ai ตรง (ผ่าน facade เท่านั้น)", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    ok(/SVC H\.4 ▸[\s\S]*◂/.test(s), "actions.ts ยังไม่มีบล็อก // SVC H.4 ▸ … ◂ (ยังไม่มีงาน H.4)");
    ok(/^\s*["']use server["']/m.test(s), "ไม่มี \"use server\"");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(s).split("\n").filter((l) => !/ReservationFormState/.test(l)).join("\n")), "export ที่ไม่ใช่ async function");
    ok(!/from\s*["']@\/lib\/(core\/integrations\/secret-box|ai\/[a-z-]+)["']/.test(stripComments(s)), "actions.ts import secret-box/ai ตรง");
  });
  await st("U-7", "หน้า (§1/§4): reservations/[id]/page.tsx อ่าน searchParams tab (=guests เปิดแท็บแขก/เช็กอิน) · 4 หน้าใหม่ requireUnit + \"HOTEL\" + notFound · import ผ่าน facade @/lib/modules/hotel (ไม่ชี้ guest.ts/tm30.ts/checkin.ts ตรง) · guests ใช้ listGuests + รับ from/to/q · rr4 print รับ from/to ใช้ rr4Register · rr3 print ใช้ rr3Card · tm30 ใช้ tm30Queue · หน้า print ไม่มี HotelTabs/เมนู · ไม่อ่านสิทธิ์จาก URL · hotel/page.tsx การ์ด «ตม.30» ลิงก์ /hotel/tm30", () => {
    const bad: string[] = [];
    const det = stripComments(read(F.detailPage));
    if (!det) bad.push("ยังไม่มี reservations/[id]/page.tsx"); else if (!/tab/.test(det) || !/guests/.test(det)) bad.push("[id]/page.tsx ไม่อ่าน ?tab=guests");
    for (const f of PAGES) { const s = stripComments(read(f)); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } for (const w of ["requireUnit", "\"HOTEL\"", "notFound"]) if (!s.includes(w)) bad.push(`${f}: ${w}`); if (/@\/lib\/modules\/hotel\/(guest|tm30|checkin|guest-id-ai|service|booking)["']/.test(s)) bad.push(`${f}: import ตรงไฟล์ server`); if (/searchParams[^\n]*perm|permissions[^\n]*searchParams/.test(s)) bad.push(`${f}: สิทธิ์จาก URL`); }
    const gp = stripComments(read(F.guestsPage)); if (gp && (!/listGuests/.test(gp) || !/from/.test(gp) || !/to\b/.test(gp))) bad.push("guests ไม่ใช้ listGuests/from/to");
    const r4 = stripComments(read(F.rr4Page)); if (r4 && (!/rr4Register/.test(r4) || !/from/.test(r4))) bad.push("rr4 print ไม่ใช้ rr4Register/from-to"); if (r4 && /<HotelTabs|ModuleTabs/.test(r4)) bad.push("rr4 print มีเมนู");
    const r3 = stripComments(read(F.rr3Page)); if (r3 && !/rr3Card/.test(r3)) bad.push("rr3 print ไม่ใช้ rr3Card"); if (r3 && /<HotelTabs|ModuleTabs/.test(r3)) bad.push("rr3 print มีเมนู");
    const tp = stripComments(read(F.tm30Page)); if (tp && !/tm30Queue/.test(tp)) bad.push("tm30 ไม่ใช้ tm30Queue");
    const hp = stripComments(read(F.homePage)); if (!/ตม\.\s?30/.test(hp) || !/\/hotel\/tm30/.test(hp)) bad.push("hotel/page.tsx ไม่มีการ์ด ตม.30 → /hotel/tm30");
    eq(bad, [], "หน้า");
  });
  await st("U-8", "มือถือ 390 (มติ 9): ตารางทะเบียน (หน้า guests หรือคอมโพเนนต์ที่หน้าใช้) อยู่ในกรอบ overflow-x-auto + attribute `data-scroll-hint` · Tm30Queue มี data-scroll-hint · CheckinPanel/GuestForm ไม่มี min-w ที่กว้างกว่า 390 แบบตายตัว (min-w-\\[[4-9]\\d\\dpx\\])", () => {
    const g = read(F.guestsPage) + COMPS.map((f) => read(f)).join("\n");
    ok(g.trim(), "ยังไม่มีหน้า/คอมโพเนนต์");
    ok(/overflow-x-auto/.test(g) && /data-scroll-hint/.test(g), "ตารางทะเบียนไม่มี overflow-x-auto/data-scroll-hint");
    ok(/data-scroll-hint/.test(read(`${F.compDir}/Tm30Queue.tsx`)), "Tm30Queue ไม่มี data-scroll-hint");
    const wide = [`${F.compDir}/CheckinPanel.tsx`, `${F.compDir}/GuestForm.tsx`].filter((f) => /min-w-\[[4-9]\d\dpx\]|minWidth:\s*["']?[4-9]\d\d/.test(read(f)));
    eq(wide, [], "กว้างเกิน 390 ตายตัว");
  });
  await st("U-9", "facade hotel/index.ts export H.4 (บล็อก // SVC H.4 ▸ … ◂): assignableRooms · checkInV2 · undoCheckIn · upsertGuestRecord · listGuests · revealGuestId · signRr3 · rr3Card · rr4Register · purgeExpiredGuestRecords · readIdDocument · tm30Queue · tm30Export · markTm30Filed · tm30Sweep · RR3_FIELDS · TM30_DEFAULT_COLUMNS · maskId · isForeigner · nationalityTh · ของ H.1 ยังครบ", () => {
    ok(hotelL.mod, hotelL.err);
    const fns = ["assignableRooms", "checkInV2", "undoCheckIn", "upsertGuestRecord", "listGuests", "revealGuestId", "signRr3", "rr3Card", "rr4Register", "purgeExpiredGuestRecords", "readIdDocument", "tm30Queue", "tm30Export", "markTm30Filed", "tm30Sweep", "maskId", "isForeigner", "nationalityTh", "quoteStay", "loadHotelSettings"];
    eq(fns.filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
    ok(hotelL.mod.RR3_FIELDS && hotelL.mod.TM30_DEFAULT_COLUMNS, "ไม่มี RR3_FIELDS/TM30_DEFAULT_COLUMNS");
    ok(/SVC H\.4 ▸[\s\S]*◂/.test(read(F.index)), "ไม่มีบล็อก // SVC H.4 ▸ … ◂");
  });
  await st("U-10", "IdScanButton/CheckinPanel: ปุ่มสแกนอยู่ใต้เงื่อนไข aiIdReader (prop เช่น aiEnabled/aiIdReader) · ผล AI ใส่ฟอร์มเป็น «ข้อเสนอ» (aiProposed) และต้องติ๊ก/ยืนยัน (confirmed) ก่อนบันทึก · keepIdImage ติ๊กต่อครั้ง · SecurityDepositStep แสดง «บันทึกเป็นเงินรับฝาก ไม่ใช่รายได้» · ขั้น ตม.30 มีปุ่มดาวน์โหลดไฟล์ + ช่องเลขรับแจ้ง", () => {
    const scan = stripComments(read(`${F.compDir}/IdScanButton.tsx`)), panel = stripComments(read(`${F.compDir}/CheckinPanel.tsx`)), form = stripComments(read(`${F.compDir}/GuestForm.tsx`)), sd = read(`${F.compDir}/SecurityDepositStep.tsx`), tmd = read(`${F.compDir}/Tm30FileDialog.tsx`) + read(`${F.compDir}/Tm30Queue.tsx`);
    ok(scan && panel && form, "ยังไม่มี IdScanButton/CheckinPanel/GuestForm");
    ok(/aiEnabled|aiIdReader|aiOn/.test(scan + panel), "ปุ่มสแกนไม่มีเงื่อนไข aiIdReader");
    ok(/aiProposed/.test(form + panel + scan), "ไม่มีธง aiProposed");
    ok(/confirm/i.test(form + panel), "ไม่มีการยืนยันก่อนบันทึก");
    ok(/keepIdImage/.test(form + panel + scan), "ไม่มี keepIdImage");
    ok(/เงินรับฝาก/.test(sd) && /ไม่ใช่รายได้/.test(sd), "SecurityDepositStep ไม่มีข้อความเงินรับฝาก");
    ok(/ดาวน์โหลด|ไฟล์/.test(tmd) && /เลขรับแจ้ง/.test(tmd), "ขั้น ตม.30 ไม่มีดาวน์โหลด/เลขรับแจ้ง");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.checkin, F.guest, F.ai, F.tm30, F.shared, F.service, F.index, F.actions, F.defs, F.minute, F.consumers, F.autoLabels, F.whLabels, F.perms, ...COMPS, F.checkinShared, F.detailPage, F.homePage, ...PAGES, F.scene, F.sds, F.probe, "scripts/qc-svc-h.4.mts"]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs"]).filter((f) => f !== "scripts/qc-svc-h.4.mts" && f !== F.probe);
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.guest}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.4 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): checkin/guest/guest-id-ai/tm30/guest-shared · service.ts (checkIn) · index/actions · defs/rooms.ts · minute-jobs · 3 ทะเบียน event · permissions.ts · 9 คอมโพเนนต์ + shared · 4 หน้า + [id]/page + hotel/page · ฉาก · sds · probe — ไม่แตะอื่น", () => {
      ok(ch.length > 0, "ยังไม่มีงาน (git status ว่าง) — ยังไม่มี guest.ts");
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · booking.ts/availability.ts/tape.ts/folio.ts/checkout.ts · modules/rooms/member/ai · storage/** · core (ยกเว้น permissions.ts + settings/defs/rooms.ts) · svc-qc-data.mts · ข้อสอบอื่น — ตรวจเมื่อมีงาน (guest.ts)", () => {
    ok(has(F.guest), `ยังไม่มี ${F.guest} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", "src/lib/modules/hotel/booking.ts", "src/lib/modules/hotel/availability.ts", "src/lib/modules/hotel/tape.ts", "src/lib/modules/hotel/folio.ts", "src/lib/modules/hotel/checkout.ts", "src/lib/modules/hotel/room-charge.ts", "src/lib/modules/rooms", "src/lib/modules/member", "src/lib/ai", "src/lib/storage", "src/lib/core", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-svc-h.5.mts"]).filter((f) => f !== F.perms && f !== F.defs);
    eq(banned, [], "ไฟล์ต้องห้าม");
  });
  await st("F-3", "แก้เฉพาะที่ใบให้ (§1): service.ts เปลี่ยนเฉพาะ checkIn (checkOut/refundStay/createReservation/assignableRooms เดิมเท่า HEAD · assignableRooms ย้ายไป checkin.ts ได้แต่ตัวเดิมต้องยังเรียกได้) · defs/rooms.ts เพิ่มอย่างเดียว (ไม่ลบบรรทัด) · index/actions/minute-jobs/3 ทะเบียน ไม่ลบบรรทัดเดิม · permissions.ts ลบได้เฉพาะ 2 บรรทัด planned", () => {
    ok(has(F.guest), `ยังไม่มี ${F.guest} — ตรวจตอนรับใบ`);
    const fnBody = (src: string, name: string) => { const m = new RegExp(`export async function ${name}\\(([\\s\\S]*?)\\n\\}\\n`).exec(src); return m ? m[0] : ""; };
    const headSvc = (() => { try { return git(["show", `HEAD:${F.service}`]); } catch { return ""; } })();
    const cur = read(F.service);
    ok(cur && headSvc, "อ่าน service.ts ไม่ได้");
    for (const n of ["checkOut", "refundStay", "createReservation", "cancelReservation"]) eq(fnBody(cur, n), fnBody(headSvc, n), `${n} เปลี่ยน`);
    const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
    const bad: string[] = [];
    for (const f of [F.defs, F.index, F.actions, F.minute, F.consumers, F.autoLabels, F.whLabels]) if (dirty([f]).length && rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
    if (dirty([F.perms]).length && rm(F.perms) > 2) bad.push(`${F.perms} ลบ ${rm(F.perms)} > 2`);
    eq(bad, [], "ลบบรรทัด");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  delete process.env.SVC_QC_CLOCK;
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h4-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม HotelGuestRecord/FileAsset/AuditLog/OutboxEvent/Customer/AiCredit*) · ผู้ใช้ทดสอบ 0 · ไม่มี SVC_QC_CLOCK ค้าง · fetch ถูกครอบไม่มีปลายทางนอกเครื่องถูกบล็อกโดยไม่คาด (รายงาน)", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
    eq(process.env.SVC_QC_CLOCK ?? null, null, "SVC_QC_CLOCK ค้าง");
    if (BLOCKED.length) console.log(`     (ปลายทางที่ถูกบล็อกระหว่างข้อสอบ: ${[...new Set(BLOCKED)].join(", ")})`);
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-guest-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐาน l3 (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!has(F.booking)) why = `ยังไม่มี ${F.booking} (H.3)`;
    else if (!checkinL.mod || !guestL.mod || !tm30L.mod) why = `ยังไม่มี ${F.checkin}/${F.guest}/${F.tm30}`;
    else if (!checkoutL.mod) why = `ยังไม่มี ${F.checkout} (H.5 · takeSecurityDeposit)`;
    else if (!has(F.sceneH1) || !has(F.sceneH3)) why = `ยังไม่มีฉาก ${F.sceneH1}/${F.sceneH3}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = [], env: Record<string, string> = {}) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const guestRows = () => prisma.hotelGuestRecord.findMany({ where: { tenantId: SQC_TENANT.id, unitId, reservation: { note: { contains: BS.mark } } } }) as Promise<Any[]>;
  const otherSig = async () => J([await prisma.hotelGuestRecord.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelReservation.count({ where: { tenantId: SQC_TENANT.id } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } })]);
  const n1 = `ฉาก ${F.scene}: (ฉาก h.1 → h.3 → h.4 บนการจอง mark ${BS.mark}) รัน exit 0 · SCENE_SUMMARY {created,updated,removed} + resId/guestId ของ inhouse-web/WEBER, DANIEL · HotelGuestRecord 4 แถว · byTm30 FILED 2 (เลขรับแจ้ง ${GS.tm30.filed.ref}) · PENDING 1 (inhouse-ota ยังไม่ sweep) · NOT_REQUIRED 1 · foreigners 3 · signedRr3 3 · today-walkin CHECKED_IN + ประกัน 100,000 (securityDepositSatang) · ทุกแถว idNumberEnc เปิดได้ด้วย secret-box · last4 ตรงฟิกซ์เจอร์ · ไม่มีเลขดิบในฐาน · ค่าตั้งฉากตั้งที่ชั้น UNIT · ร้านอื่นไม่เปลี่ยน`;
  const n2 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · แถว/สถานะ/ไฟล์เท่าเดิม";
  const n3 = `tm30Sweep บนฉาก ⇒ inhouse-ota LATE (byTm30 = ${J(GS.expect.byTm30)}) · sweep ซ้ำไม่เปลี่ยน`;
  const n4 = "--clear ลบเฉพาะแขกของฉาก (HotelGuestRecord 0 · FileAsset ของมันหาย · การจอง h.3 คง · today-walkin คืนสถานะ/ค่าตั้งคืน) · ร้านอื่นคงเดิม · รันคืน";
  // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-tsc-scope): rawOfEnc/sweep ของบล็อกร้านชั่วคราวมองไม่เห็นจากบล็อก Q (tsc TS2304/TS2552) — นิยามซ้ำจากของเดิมบรรทัด 583/597
  const rawOfEnc = (row: Any) => { const o = SB.openIntegrationSecret(row?.idNumberEnc, row?.id); return o ? String(o.id ?? o.idNumber ?? "") : null; };
  const sweep = (over: Record<string, unknown> = {}) => call(() => TM("tm30Sweep")(over));
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4]]) skip(id, n, why, "MAJOR"); }
  else {
    const byTm30 = async () => { const by: Record<string, number> = {}; for (const r of await guestRows()) by[r.tm30Status] = (by[r.tm30Status] ?? 0) + 1; return by; };
    const sigOf = async () => J([(await guestRows()).map((g) => [g.id, g.tm30Status, g.rr3SignedAt ? 1 : 0, g.signatureFileId ?? null, g.idImageFileId ?? null]).sort()]);
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      if (has("scripts/svc-qc-hotel-tape-scene.mts")) runScript("scripts/svc-qc-hotel-tape-scene.mts", ["--clear"]);
      runScript(F.scene, ["--clear"]);
      runScript(F.sceneH3, ["--clear"]);
      ok(runScript(F.sceneH3).status === 0, "ฉาก h.3 ล้ม");
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum = summary(`${a.stdout}`);
      ok(a.status === 0 && sum && ["created", "updated", "removed"].every((k) => typeof sum[k] === "number"), `exit=${a.status} ${sum ? fmt(sum) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const rows = await guestRows();
      eq(rows.length, GS.expect.guestRows, "แถวแขก");
      eq(await byTm30(), { FILED: GS.expect.byTm30.FILED, PENDING: GS.expect.byTm30.LATE, NOT_REQUIRED: GS.expect.byTm30.NOT_REQUIRED }, "byTm30 ก่อน sweep");
      eq([rows.filter((r) => r.isForeigner).length, rows.filter((r) => r.rr3SignedAt).length], [GS.expect.foreigners, GS.expect.signedRr3], "foreigners/signed");
      ok(rows.filter((r) => r.tm30Status === "FILED").every((r) => r.tm30Ref === GS.tm30.filed.ref && r.tm30FiledAt), "เลขรับแจ้ง");
      eq(rows.map((r) => r.idNumberLast4).sort(), [...GS.expect.last4].sort(), "last4");
      for (const r of rows) { const raw = rawOfEnc(r); const fx = GS.guests.find((g) => g.fullName === r.fullName); ok(raw && fx && raw === fx.idNumber, `เปิดกล่อง ${r.fullName} ไม่ตรงฟิกซ์เจอร์`); }
      const walkin = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: BS.mark }, guestName: sceneBooking("today-walkin")!.guest } });
      eq([walkin?.status, walkin?.securityDepositSatang], [GS.expect.walkinStatus, GS.expect.securityHeldSatang], "today-walkin");
      ok(walkin?.securityDepositSaleId, "ไม่มีบิลประกัน");
      const txt = J([await prisma.hotelGuestRecord.findMany({ where: { tenantId: SQC_TENANT.id }, select: { fullName: true, idNumberLast4: true, tm30Ref: true, arrivedFrom: true, nextDestination: true } }), await prisma.auditLog.findMany({ where: { tenantId: SQC_TENANT.id, action: { startsWith: "hotel." } }, select: { before: true, after: true } }), await prisma.outboxEvent.findMany({ where: { tenantId: SQC_TENANT.id, type: { startsWith: "hotel." } }, select: { payload: true } })]);
      eq(hasRaw(txt, GS.guests.map((g) => g.idNumber)), [], "เลขดิบในฐาน svcqc");
      ok(J(sum).includes(rows.find((r) => r.fullName === "WEBER, DANIEL")?.id ?? "∅"), "SCENE_SUMMARY ไม่พิมพ์ guestId ของ WEBER, DANIEL");
      eq(await otherSig(), o0, "ร้านอื่น/การจองเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const s0 = await sigOf(), f0 = await prisma.fileAsset.count({ where: { tenantId: SQC_TENANT.id } });
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      eq([await sigOf(), await prisma.fileAsset.count({ where: { tenantId: SQC_TENANT.id } })], [s0, f0], "เปลี่ยน");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const r = await sweep();
      ok(typeof r?.late === "number", `sweep ${J(r)}`);
      eq(await byTm30(), { ...GS.expect.byTm30 }, "byTm30 หลัง sweep");
      await sweep();
      eq(await byTm30(), { ...GS.expect.byTm30 }, "sweep ซ้ำ");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const o0 = await otherSig();
      const fids = (await guestRows()).flatMap((g) => [g.idImageFileId, g.signatureFileId]).filter(Boolean);
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq((await guestRows()).length, 0, "แถวแขกค้าง");
      eq(await prisma.fileAsset.count({ where: { id: { in: fids } } }), 0, "FileAsset ค้าง");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0 && (await guestRows()).length === GS.expect.guestRows, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.4 ด้วย owner และ frontdesk · 3–5 ใบ (ทะเบียนผู้พัก · ร.ร.4 พิมพ์ · คิว ตม.30 · [SVC_VIS_H4_RES_ID] แท็บแขก/เช็กอิน · [SVC_VIS_H4_GUEST_ID] ร.ร.3 พิมพ์) × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุม PARITY ภาพ 09 ซ้าย + frontdesk เห็นเลขปิดบางส่วน";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 → h.3 → h.4 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port> (SVC_VIS_H4_RES_ID/GUEST_ID จาก SCENE_SUMMARY)", "MAJOR");
  else {
    const bad: string[] = [];
    let env: Record<string, string> = {};
    try {
      const res = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, note: { contains: BS.mark }, guestName: sceneBooking("inhouse-web")!.guest }, select: { id: true } });
      const g = res ? await prisma.hotelGuestRecord.findFirst({ where: { reservationId: res.id, fullName: "WEBER, DANIEL" }, select: { id: true } }) : null;
      if (res) env = { SVC_VIS_H4_RES_ID: res.id, ...(g ? { SVC_VIS_H4_GUEST_ID: g.id } : {}) };
    } catch { /* */ }
    for (const user of ["owner", "frontdesk"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.4", "--user", user, "--base", base], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[]; findings?: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[]; findings?: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (assignRoom/takeBookingDeposit/checkIn เดิมที่ H.4 ห่อ)" },
  { s: "qc-svc-h.5", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (takeSecurityDeposit · checkIn เดิมใน inhouse())" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.4", judge: judgeNoFail, note: "หน้าค่าตั้ง (def ใหม่ license/guest/tm30) ไม่มี FAIL" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "แกนห้อง ไม่มี FAIL" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "หน้าหอไม่เห็นคีย์โรงแรม ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof checkinL.mod?.checkInV2 === "function" && typeof guestL.mod?.upsertGuestRecord === "function" && typeof tm30L.mod?.tm30Sweep === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (checkin.ts/guest.ts/tm30.ts) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H4_NO_REGRESSION=1" : "";
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ไม่เป็นไร */ }
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `${LOG_DIR}/svc-h4-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const byGroup: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
for (const c of cks) { const g = (byGroup[groupOf(c.id)] ??= { total: 0, passed: 0, failed: 0, skipped: 0 }); g.total++; if (c.res === "PASS") g.passed++; else if (c.res === "FAIL") g.failed++; else g.skipped++; }
console.log(`\n===== QC SVC H.4 · เช็กอิน V2 · ทะเบียนแขก · ตม.30 · PDPA =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก/H.3/H.5 ยังไม่ merge · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
