// QC — SVC B.11 · จอตั้งค่าจองคิว (08 · 11 · 12 ส่วนคน · 14) + สิทธิ์ต่อบทบาท + ความเป็นส่วนตัว · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.11.md (§2–§10 ผูกตรงตัว) · MASTER-PLAN แถว B.11 · CC §1.8 §8 · DESIGN-BOOKING-QUEUE R10 + ภาคผนวก ก #65 #66
//        ภาพ ledger/design-booking/{08,11,12,14}-*.png · หนี้ ledger/wo-notes/svc-r0.8-carry.md ("ภาพเทียบแบบ R0.4") · /root/svc-runs/fix/b3.md (Customer/Party ค้าง)
//
// กลุ่มข้อ:
//   PC positive control (ต้องเขียวตั้งแต่ก่อนทำ: เครื่องยนต์ R0.3 · ฟอร์ม R0.4 · rbac · ฉาก "6 ข้อ" นับจากเครื่องยนต์เอง)
//   S  โครงสร้าง: ไฟล์ · client ไม่ลาก server · actions มีด่านสิทธิ์ก่อนแตะฐาน · หน้า/แท็บ · ไม่แตะเครื่องยนต์/prisma · minute-job · ไม่มีคีย์ค่าตั้งใน tsx
//   R  ทะเบียน: ป้ายกลุ่ม/ตัวเลือกไทยของ booking · ตาราง BOOKING_SETTINGS_LAYOUT ครอบทุกช่อง · % เต็มของ booking (บั๊กหน่วย)
//   K  สิทธิ์: คีย์ใหม่ + ป้ายไทย + planned · 10 แถว (9 แถวภาพ 14 + รับมัดจำ) · ชุดตามแม่แบบ · ช่าง/แคชเชียร์ไม่มีคีย์เงิน · BOOKING_ACTIONS ครบทุก action · canBookingAction
//   P  pure: maskPhone · phoneForViewer
//   T  แม่แบบ: ไม่มีแม่แบบ · เลือก · ซ่อน (คลินิก) ⇒ ปฏิเสธ · KEEP_CUSTOM/RESET_ALL · สิทธิ์ · ข้ามร้าน
//   M  จอง 08 (โมเดล + render): เมนูซ้าย · การ์ดแม่แบบ · แถบ 6 ข้อ · การ์ดเลข 1–6 สองคอลัมน์ · แถวกะทัดรัด · ดูเฉพาะที่ปรับ · ล็อกตามสิทธิ์
//   N  จอง 14: ข้อความ 10 ชนิด · ตัวแก้+ตัวแปร+ตัวอย่าง LINE · ทีวี/ตู้ · ตารางสิทธิ์ · ความเป็นส่วนตัว (เจ้าของเท่านั้น)
//   SV จอง 11: ตาราง 8 คอลัมน์ · แผงบริการ · ใครทำได้ 5/6 + ราคา/เวลาเฉพาะคน · กล่องค่าร้าน · setStaffService · setServiceBooking
//   W  จอง 12 ส่วนคน: ตาราง · แหล่งเวลา · % ออนไลน์ · เตือนไม่ผูก · แผงช่าง · แถบสัปดาห์
//   E  ด่านสิทธิ์จริงในเครื่องยนต์ด้วยชุดบทบาท (ช่าง/แคชเชียร์แก้เงินไม่ได้) · applyBookingRolePreset
//   RT ทุกค่าบน 08/11/12/14 บันทึก/คืนค่าได้ (ผ่าน scope ของโมเดลหน้า)
//   X  ข้ามร้าน/ข้ามสาขา/ผิดชนิดหน่วย ⇒ null / NOT_FOUND
//   PR งานลบข้อมูล walk-in + Customer/Party ค้าง (ตัดเฉพาะที่ควร · ซ้ำ = 0 · X5 · X8 · ร้านอื่นไม่ถูกแตะ)
//   Q  ฉาก svcqc (scripts/svc-qc-booking-settings-scene.mts) · V ภาพ (QC_BASE) · G regression · Z ล้างครบ
//
// ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `svc-b11-*` + ผู้ใช้ `svc-b11-*@qc.invalid` · ลบใน finally (+ กวาดของค้างตอนเริ่ม)
// รัน (ห้ามครอบ timeout):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.11.mts
//   ต่อท้าย `--no-regression` ข้ามหมวด G (SKIP — ไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้ SVC_B11_NO_REGRESSION=1 ผ่าน iso ไม่ได้)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";

type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.11";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B11_NO_REGRESSION === "1";

// ═══════════════ 0. ด่านฐานข้อมูล (ด่าน host ของ RUN SVC) ═══════════════
const envMod = (await import("./svc-qc-env.mts" as string)) as { loadSvcQcEnv: (label: string) => { host: string } };
envMod.loadSvcQcEnv(LABEL);
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 240) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const skip = (id: string, name: string, why: string, sev: Sev = "MAJOR") => record(id, name, "SKIP", why, sev);
async function t(id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
}
const THAI = /[฀-๿]/;
const isThai = (s: unknown) => typeof s === "string" && THAI.test(s);
const RAW_ENUM = /^[A-Z0-9_]+$/;

// ═══════════════ ไฟล์ ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => {
  try { return { mod: await import(spec as string), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const importFile = async (rel: string): Promise<{ mod: Any; err: string }> =>
  has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มี ${rel}` };
const B = "src/app/app/u/[unitSlug]/booking";
const F = {
  shared: "src/components/booking/settings/booking-settings-shared.ts",
  policy: "src/components/booking/settings/BookingPolicySettings.tsx",
  services: "src/components/booking/settings/BookingServicesSettings.tsx",
  staff: "src/components/booking/settings/BookingStaffSettings.tsx",
  messages: "src/components/booking/settings/BookingMessagesSettings.tsx",
  model: "src/lib/modules/booking/settings-model.ts",
  access: "src/lib/modules/booking/access.ts",
  privShared: "src/lib/modules/booking/privacy-shared.ts",
  privacy: "src/lib/modules/booking/privacy.ts",
  index: "src/lib/modules/booking/index.ts",
  perms: "src/lib/core/permissions.ts",
  actions: "src/lib/actions/booking.ts",
  sactions: "src/lib/actions/booking-settings.ts",
  defs: "src/lib/core/settings/defs/booking.ts",
  mj: "src/lib/platform/minute-jobs.ts",
  layout: `${B}/layout.tsx`,
  pPolicy: `${B}/settings/page.tsx`,
  pMessages: `${B}/settings/messages/page.tsx`,
  pServices: `${B}/services/page.tsx`,
  pStaff: `${B}/staff/page.tsx`,
  pToday: `${B}/page.tsx`,
  scene: "scripts/svc-qc-booking-settings-scene.mts",
};
const COMP_FILES = [F.policy, F.services, F.staff, F.messages];
const valueImports = (src: string): string[] =>
  [...stripComments(src).matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gm)]
    .filter((m) => !/^\{\s*type\s/.test(m[1].trim()) || m[1].replace(/type\s+\w+\s*,?/g, "").replace(/[{}\s,]/g, "").length > 0)
    .map((m) => m[2]);
const exportedFns = (src: string): { name: string; params: string; body: string }[] => {
  const s = stripComments(src);
  const ms = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)];
  return ms.map((m, i) => ({ name: m[1], params: m[2], body: s.slice(m.index!, i + 1 < ms.length ? ms[i + 1].index : s.length) }));
};
function gitDirty(paths: string[]): string[] {
  const r = spawnSync("git", ["status", "--porcelain", "--", ...paths], { cwd: ROOT, encoding: "utf8" });
  return (r.stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

// ═══════════════ HTML ═══════════════
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
const textOf = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const VOID = new Set(["input", "img", "br", "hr", "meta", "link", "source", "area", "col", "wbr"]);
type El = { tag: string; attrs: Record<string, string>; html: string; start: number };
function parseAttrs(open: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = open.replace(/^<[a-zA-Z][\w-]*/, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) out[m[1].toLowerCase()] = unesc(m[2] ?? "");
  return out;
}
function elems(html: string, attr: string, val?: string): El[] {
  const out: El[] = [];
  const re = /<([a-zA-Z][\w-]*)(\s[^>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttrs(m[0]);
    if (!(attr in attrs) || (val !== undefined && attrs[attr] !== val)) continue;
    const tag = m[1].toLowerCase();
    const start = m.index;
    if (VOID.has(tag) || m[0].endsWith("/>")) { out.push({ tag, attrs, html: m[0], start }); continue; }
    const tr = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
    tr.lastIndex = start;
    let depth = 0;
    let end = html.length;
    let x: RegExpExecArray | null;
    while ((x = tr.exec(html))) {
      if (x[2] === "/") continue;
      depth += x[1] === "/" ? -1 : 1;
      if (depth === 0) { end = tr.lastIndex; break; }
    }
    out.push({ tag, attrs, html: html.slice(start, end), start });
  }
  return out;
}
const one = (html: string, attr: string, val?: string): El => {
  const xs = elems(html, attr, val);
  if (xs.length !== 1) throw new AssertFail(`ต้องมี [${attr}${val !== undefined ? `="${val}"` : ""}] 1 ตัว ได้ ${xs.length}`);
  return xs[0];
};
const keysIn = (html: string): string[] => elems(html, "data-setting-key").map((e) => e.attrs["data-setting-key"]);
const uniq = <T,>(a: T[]) => [...new Set(a)];
const sorted = (a: string[]) => [...a].sort();
const setDiff = (a: string[], b: string[]) => ({ missing: b.filter((k) => !a.includes(k)), extra: a.filter((k) => !b.includes(k)) });

// ═══════════════ โหลดโมดูล ═══════════════
const S = await tryImport("@/lib/core/settings");
const SH = await tryImport("@/components/settings/settings-shared");
const RBAC = await tryImport("@/lib/core/rbac");
const PERM = await tryImport("@/lib/core/permissions");
const LAY = await importFile(F.shared);
const ACC = await importFile(F.access);
const PRS = await importFile(F.privShared);
const BK = await tryImport("@/lib/modules/booking");
const SQ = (await import("./svc-qc-data.mts" as string)) as Any;
const REACT = await tryImport("react");
const RDS = await tryImport("react-dom/server");
const COMP: Record<string, { mod: Any; err: string }> = {};
for (const [k, f] of [["policy", F.policy], ["services", F.services], ["staff", F.staff], ["messages", F.messages]] as const) COMP[k] = await importFile(f);
const s: Any = S.mod;
const sh: Any = SH.mod;
const fnOf = (mod: Any, name: string, why = ""): ((...a: Any[]) => Any) => {
  if (!mod || typeof mod[name] !== "function") throw new AssertFail(`ไม่มีฟังก์ชัน ${name}${why ? ` (${why})` : ""}`);
  return mod[name];
};
const bk = (name: string) => fnOf(BK.mod, name, BK.err || "ยังไม่ export จาก @/lib/modules/booking");
const noop = async () => ({ ok: true });
const ACTIONS = { save: noop, reset: noop, applyTemplate: noop, setStaffService: noop, setServiceBooking: noop, applyRolePreset: noop };
const render = (page: "policy" | "services" | "staff" | "messages", model: Any, view?: Any): string => {
  const m = COMP[page].mod;
  const C = m ? (typeof m.default === "function" ? m.default : Object.values(m).find((x) => typeof x === "function")) : null;
  if (typeof C !== "function") throw new AssertFail(`คอมโพเนนต์ ${page}: ${COMP[page].err || "ไม่มี default export"}`);
  if (!model) throw new AssertFail("ไม่มีโมเดล");
  return String(RDS.mod.renderToStaticMarkup(REACT.mod.createElement(C, { model, actions: ACTIONS, ...(view ? { view } : {}) }))).replace(/<!-- -->/g, "");
};
const listDefs = (d: string): Any[] => (s?.listDefs?.(d) ?? []) as Any[];
const getDef = (k: string): Any => s?.getDef?.(k);
const unitKeysOf = (domain: string, group?: string): string[] =>
  listDefs(domain).filter((d) => !d.hiddenUntil && (d.chain as string[]).includes("UNIT") && (group === undefined || d.group === group)).map((d) => String(d.key));
const chainKeys = (domain: string, scope: string): string[] =>
  listDefs(domain).filter((d) => !d.hiddenUntil && (d.chain as string[]).includes(scope)).map((d) => String(d.key));

// ═══════════════ ค่าคาดหวัง (จากใบสั่ง §3 §7) ═══════════════
const POLICY_CARDS = [
  { key: "booking", no: 1, column: "left", head: "เวลาและการจอง" },
  { key: "late", no: 2, column: "left", head: "มาสาย · ไม่มา · ยกเลิก" },
  { key: "deposit", no: 3, column: "right", head: "มัดจำ" },
  { key: "queue", no: 4, column: "left", head: "walk-in และลำดับคิว" },
  { key: "money", no: 5, column: "right", head: "ค่าคอมมิชชัน" },
  { key: "notify", no: 6, column: "right", head: "แจ้งเตือนและหน้าจอ" },
  { key: "general", no: 7, column: "left", head: "ทั่วไป" },
  { key: "course", no: 8, column: "right", head: "คอร์ส" },
  { key: "payments", no: 9, column: "right", head: "รับเงินและตรวจสลิป" },
] as const;
const cardKeys = (card: string): string[] => {
  if (card === "payments") return unitKeysOf("payments");
  if (card === "queue") return unitKeysOf("booking", "queue").filter((k) => k !== "booking.queue.walkInPickStaff");
  if (card === "notify") return [...unitKeysOf("booking", "notify"), ...unitKeysOf("messaging").filter((k) => k === "messaging.channelOrder")];
  return unitKeysOf("booking", card);
};
const MESSAGES_UNIT_KEYS = (): string[] => [
  ...unitKeysOf("booking", "msg"),
  ...unitKeysOf("messaging").filter((k) => k === "messaging.lineConnectionId" || k === "messaging.quietHours"),
  ...unitKeysOf("booking", "queue").filter((k) => k === "booking.queue.walkInPickStaff"),
];
const MSG_KINDS = ["confirmation", "reminder", "checkedIn", "ticketIssued", "nearTurn", "yourTurn", "delayed", "noShowRebook", "rebookInvite", "courseExpiry"];
const NEW_KEYS = [
  "booking.queue.operate", "booking.checkin", "booking.walkin.create", "booking.job.run", "booking.job.runAny", "booking.deposit.confirm", "booking.devices.manage",
  "booking.appointment.reschedule", "booking.deposit.waive", "booking.deposit.forfeit", "booking.customer.phoneFull", "booking.report.view",
];
const OLD_KEYS = [
  "booking.appointment.create", "booking.appointment.setStatus", "booking.service.create", "booking.service.update", "booking.service.setDeposit",
  "booking.deposit.record", "booking.deposit.refund", "booking.staff.create", "booking.staff.delete", "booking.hours.set", "booking.settings.edit", "booking.settings.money",
];
const ROLE_ROWS: { id: string; labelTh: string; keys: string[] }[] = [
  { id: "job.own", labelTh: "เรียก · เริ่ม · เสร็จ งานของตัวเอง", keys: ["booking.job.run"] },
  { id: "job.any", labelTh: "เรียก/ย้ายงานของช่างคนอื่น", keys: ["booking.job.runAny", "booking.queue.operate"] },
  { id: "counter", labelTh: "จองให้ลูกค้า · เช็กอิน · ออกบัตร", keys: ["booking.appointment.create", "booking.checkin", "booking.walkin.create"] },
  // มติผู้คุม 29 ต.ค. (3): รับ/ยืนยันมัดจำ = แถวของตัวเอง (หัวหน้าร้าน + แคชเชียร์ · ไม่ให้ช่างโดยปริยาย) — แถวที่ 10 นอกภาพ 14
  { id: "deposit.take", labelTh: "รับมัดจำ · ยืนยันสลิปมัดจำ", keys: ["booking.deposit.record", "booking.deposit.confirm"] },
  { id: "reschedule", labelTh: "ยกเลิกนัด · เลื่อนนัดแทนลูกค้า", keys: ["booking.appointment.reschedule"] },
  { id: "deposit.waive", labelTh: "ยกเว้นมัดจำ / คืนมัดจำ", keys: ["booking.deposit.waive", "booking.deposit.refund"] },
  { id: "deposit.forfeit", labelTh: "ยึดมัดจำเมื่อไม่มา (ระบบทำอัตโนมัติ)", keys: ["booking.deposit.forfeit"] },
  { id: "phone", labelTh: "เห็นเบอร์โทรลูกค้าเต็ม", keys: ["booking.customer.phoneFull"] },
  { id: "settings", labelTh: "แก้ตั้งค่า · บริการ · ช่าง", keys: ["booking.settings.edit", "booking.settings.money", "booking.service.create", "booking.service.update", "booking.service.setDeposit", "booking.staff.create", "booking.staff.delete", "booking.hours.set", "booking.devices.manage"] },
  { id: "report", labelTh: "ดูรายงาน · ยอดเงิน", keys: ["booking.report.view"] },
];
const PRESET_ROWS: Record<string, string[]> = {
  LEAD: ["job.own", "job.any", "counter", "deposit.take", "reschedule", "deposit.waive", "deposit.forfeit", "phone", "report"],
  PROVIDER: ["job.own", "counter"],
  CASHIER: ["counter", "deposit.take", "reschedule", "phone"],
  ASSISTANT: ["counter", "reschedule", "phone"],
};
const PROVIDER_FORBIDDEN_DEPOSIT = ["booking.deposit.record", "booking.deposit.confirm"];
const MONEY_KEYS = ["booking.settings.money", "booking.service.setDeposit", "booking.deposit.refund", "booking.deposit.waive", "booking.deposit.forfeit"];
const presetPerms = (role: string): Record<string, boolean> => {
  const on = new Set(PRESET_ROWS[role].flatMap((r) => ROLE_ROWS.find((x) => x.id === r)!.keys));
  return Object.fromEntries(ROLE_ROWS.flatMap((r) => r.keys).map((k) => [k, on.has(k)]));
};
const ACTION_KEYS: Record<string, string[]> = {
  setServiceDepositAction: ["booking.service.setDeposit"],
  recordDepositAction: ["booking.deposit.record", "booking.deposit.confirm"],
  refundDepositAction: ["booking.deposit.refund"],
  addStaffAction: ["booking.staff.create"],
  setStaffReceivingAction: ["booking.staff.create"],
  linkStaffToHrAction: ["booking.staff.create"],
  removeStaffAction: ["booking.staff.delete"],
  setBookingHoursAction: ["booking.hours.set"],
  addClosureAction: ["booking.hours.set"],
  removeClosureAction: ["booking.hours.set"],
  setServiceOfferedAction: ["booking.service.update"],
  importServicesToCatalogAction: ["booking.service.create"],
  applyBookingTemplateAction: ["booking.settings.edit"],
  setStaffServiceAction: ["booking.staff.create"],
  setServiceBookingAction: ["booking.service.update"],
  applyBookingRolePresetAction: ["booking.settings.edit"],
};
const STATUS_KEYS: Record<string, string[]> = {
  CANCELLED: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  NO_SHOW: ["booking.appointment.setStatus", "booking.job.runAny"],
  PENDING: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  CONFIRMED: ["booking.appointment.setStatus", "booking.appointment.reschedule"],
  ARRIVED: ["booking.appointment.setStatus", "booking.checkin"],
  DONE: ["booking.appointment.setStatus", "booking.job.run", "booking.job.runAny"],
};
const SCN = SQ.SQC_BOOKING_SETTINGS_SCENE as Any;

// ═══════════════ PC (ส่วนที่ไม่ต้องใช้ฐาน) ═══════════════
console.log("\nPC. positive control (เครื่องยนต์/ฟอร์ม/rbac — ต้องเขียวก่อนทำ)");
await t("PC-1", "ทะเบียน booking โหลดได้ · แม่แบบ BARBER/SPA/CLINIC (CLINIC ซ่อน) · ฟอร์ม R0.4 มี formatFieldValue/submissionFor · rbac.evaluate", () => {
  ok(s, `โหลด @/lib/core/settings ไม่ได้: ${S.err}`);
  ok(listDefs("booking").length >= 60, `booking defs ${listDefs("booking").length}`);
  ok(s.getTemplate?.("booking", "BARBER") && s.getTemplate?.("booking", "SPA"), "ไม่มีแม่แบบ BARBER/SPA");
  ok(typeof s.getTemplate?.("booking", "CLINIC")?.hiddenUntil === "string", "CLINIC ต้องซ่อน");
  ok(typeof sh?.formatFieldValue === "function" && typeof sh?.submissionFor === "function", `settings-shared: ${SH.err}`);
  ok(typeof RBAC.mod?.evaluate === "function", "ไม่มี evaluate");
  const st = { role: "STAFF", unitAccess: ["u1"], permissions: { "booking.settings.edit": true } };
  ok(RBAC.mod.evaluate(st, { module: "booking", action: "booking.settings.edit", unitId: "u1" }) === true, "STAFF ถือคีย์ ⇒ ผ่าน");
  ok(RBAC.mod.evaluate(st, { module: "booking", action: "booking.settings.money", unitId: "u1" }) === false, "STAFF ไม่ถือคีย์ ⇒ ไม่ผ่าน");
  ok(SCN?.barber?.unitDiffs?.length === 6, "SQC_BOOKING_SETTINGS_SCENE.barber.unitDiffs ต้อง 6");
  for (const d of SCN.barber.unitDiffs) {
    const def = getDef(d.key);
    ok(def && (def.chain as string[]).includes("UNIT") && def.schema.safeParse(d.value).success, `ค่าฉาก ${d.key} ใช้ไม่ได้`);
    ok(!isDeepStrictEqual(s.defaultFor(def, "BARBER"), d.value), `${d.key} เท่าแม่แบบ (ต้องต่าง)`);
  }
});

// ═══════════════ S. โครงสร้าง ═══════════════
console.log("\nS. โครงสร้าง · ขอบเขต import · ด่าน action · หน้า");
await t("S-1", "ไฟล์ส่งมอบครบ (คอมโพเนนต์ 4 + shared · settings-model · access · privacy(-shared) · actions ใหม่ · หน้า 14 · สคริปต์ฉาก)", () => {
  const miss = [F.shared, ...COMP_FILES, F.model, F.access, F.privShared, F.privacy, F.sactions, F.pMessages, F.scene].filter((f) => !has(f));
  ok(miss.length === 0, `ไม่มี ${miss.join(" · ")}`);
});
await t("S-2", "คอมโพเนนต์ 4 ไฟล์: \"use client\" · ไม่ import ค่าจาก @/lib/core/settings · db · prisma · @/lib/modules · ไม่ใช้ useRouter · render ได้ (default export)", () => {
  const p: string[] = [];
  for (const f of COMP_FILES) {
    const src = read(f);
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    if (!/^\s*["']use client["']/.test(src)) p.push(`${f}: ไม่ใช่ "use client"`);
    const bad = valueImports(src).filter((x) => /^@\/lib\/core\/(settings|db)|prisma|^@\/lib\/modules\/|_fixture/.test(x));
    if (bad.length) p.push(`${f}: ${bad.join(",")}`);
    if (/\buseRouter\s*\(/.test(stripComments(src))) p.push(`${f}: useRouter`);
  }
  for (const k of Object.keys(COMP)) if (!COMP[k].mod) p.push(`${k}: ${COMP[k].err}`);
  ok(p.length === 0, p.join(" · "));
});
await t("S-3", "ไฟล์ pure (booking-settings-shared · access · privacy-shared): ไม่มี directive · ไม่ import prisma/next/db/node:/service", () => {
  const p: string[] = [];
  for (const f of [F.shared, F.access, F.privShared]) {
    const src = read(f);
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    if (/["']use (client|server)["']/.test(src.slice(0, 300))) p.push(`${f}: มี directive`);
    const bad = valueImports(src).filter((x) => /prisma|^next|^@\/lib\/core\/db|^node:|\/service$|settings-model|_fixture|^@\/lib\/core\/settings$/.test(x));
    if (bad.length) p.push(`${f}: ${bad.join(",")}`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-4", "src/lib/actions/booking.ts: ทุก export เรียก assertBookingAction(auth, unit.id, \"<ชื่อตัวเอง>\") ก่อนแตะฐาน · ไม่เหลือ assertBookingCan( · ชื่อครบตาม BOOKING_ACTIONS", () => {
  const src = read(F.actions);
  ok(src, "ไม่มีไฟล์");
  ok(!/assertBookingCan\s*\(/.test(stripComments(src)), "ยังเรียก assertBookingCan(");
  const p: string[] = [];
  for (const fn of exportedFns(src)) {
    const m = new RegExp(`assertBookingAction\\s*\\(\\s*auth\\s*,\\s*unit\\.id\\s*,\\s*["']${fn.name}["']`).exec(fn.body);
    if (!m) { p.push(`${fn.name}: ไม่มี assertBookingAction ด้วยชื่อตัวเอง`); continue; }
    const firstDb = fn.body.search(/tenantDb\s*\(|prisma\.|\bbooking\.\w+\s*\(|\bpos\.\w+\s*\(|\bmember\.\w+\s*\(/);
    if (firstDb >= 0 && firstDb < m.index) p.push(`${fn.name}: แตะฐานก่อนตรวจสิทธิ์`);
    if (!(fn.name in ACTION_KEYS) && fn.name !== "setStatusAction") p.push(`${fn.name}: ไม่อยู่ในตารางใบสั่ง §7.2`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-5", "booking-settings.ts: \"use server\" · export async function เท่านั้น · requireUnit → assertBookingAction ก่อนเรียกงาน · refresh() · ไม่รับ tenantId/role/permissions · มี 4 action ตามใบสั่ง", () => {
  const raw = read(F.sactions);
  ok(raw, "ไม่มีไฟล์");
  ok(/^\s*["']use server["']/.test(raw), "ไม่ใช่ \"use server\"");
  const src = stripComments(raw);
  ok(!/export\s+(const|let|type|interface|class|function\s)/.test(src.replace(/export\s+async\s+function/g, "")), "มี export ที่ไม่ใช่ async function");
  ok(/import\s*\{[^}]*\brefresh\b[^}]*\}\s*from\s*["']next\/cache["']/.test(src), "ไม่ import refresh จาก next/cache");
  const fns = exportedFns(raw);
  eq(sorted(fns.map((f) => f.name)), sorted(["applyBookingTemplateAction", "setStaffServiceAction", "setServiceBookingAction", "applyBookingRolePresetAction"]), "ชื่อ action");
  const p: string[] = [];
  for (const fn of fns) {
    if (/\b(tenantId|role|unitAccess|permissions|actor)\b\s*[:,)]/.test(fn.params)) p.push(`${fn.name}: รับค่าสิทธิ์จาก client`);
    const ru = fn.body.search(/requireUnit\s*\(/);
    const as = fn.body.search(new RegExp(`assertBookingAction\\s*\\([^)]*["']${fn.name}["']`));
    const work = fn.body.search(/\b(applyBookingTemplate|setStaffService|setServiceBooking|applyBookingRolePreset)\s*\(/);
    if (ru < 0 || as < 0 || work < 0 || !(ru < as && as < work)) p.push(`${fn.name}: ลำดับ requireUnit(${ru}) → assert(${as}) → งาน(${work}) ผิด`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-6", "หน้า 4 หน้า: requireUnit · BOOKING · notFound · loadBookingSettingsPage · actor จาก auth.active (ไม่อ่านสิทธิ์จาก searchParams) · ส่ง actions เป็น prop", () => {
  const p: string[] = [];
  for (const [f, page] of [[F.pPolicy, "policy"], [F.pMessages, "messages"], [F.pServices, "services"], [F.pStaff, "staff"]] as const) {
    const src = stripComments(read(f));
    if (!src) { p.push(`${f}: ไม่มี`); continue; }
    for (const w of ["requireUnit", "notFound", "loadBookingSettingsPage", "auth.active", `"${page}"`]) if (!src.includes(w)) p.push(`${f}: ไม่มี ${w}`);
    if (/searchParams[\s\S]{0,120}\b(role|unitAccess|tenantId|permissions)\b/.test(src)) p.push(`${f}: อ่านสิทธิ์จาก searchParams`);
  }
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");
await t("S-7", "แท็บโมดูล (layout): คิววันนี้ → <คำเรียกผู้ให้บริการ>/staff → บริการ → เวลาทำการ → ตั้งค่า · ไม่ครอบทั้งโมดูลด้วย max-w-2xl", () => {
  const src = stripComments(read(F.layout));
  ok(src, "ไม่มีไฟล์");
  const idx = ["คิววันนี้", "/staff", "บริการ", "/hours", "ตั้งค่า"].map((w) => src.indexOf(w));
  ok(idx.every((i) => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]), `ลำดับแท็บ ${fmt(idx)}`);
  ok(!src.includes("นัดวันนี้") && !src.includes("ใครรับคิว"), "ยังใช้ป้ายแท็บเดิม");
  ok(/providerLabel/.test(src), "แท็บช่างต้องใช้ booking.general.providerLabel");
  ok(!/max-w-2xl/.test(src), "ยังครอบ max-w-2xl (หน้าตั้งค่ากว้างตามแบบ)");
}, "MAJOR");
await t("S-8", "ไม่แตะเครื่องยนต์/ฟอร์มกลาง/prisma: service · actions · template · SettingsForm.tsx · prisma/ ไม่มีการแก้ค้าง · types/registry/form แก้ได้เฉพาะเพิ่ม percentScale (ไม่มีบรรทัดถูกลบ · บรรทัดเพิ่มทุกบรรทัดเกี่ยว percentScale)", () => {
  const dirty = gitDirty(["prisma", "src/lib/core/settings/service.ts", "src/lib/core/settings/actions.ts", "src/lib/core/settings/template.ts", "src/components/settings/SettingsForm.tsx"]);
  eq(dirty, [], "ไฟล์ต้องห้ามที่ถูกแก้");
  const p: string[] = [];
  for (const f of ["src/lib/core/settings/types.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/form.ts"]) {
    const d = spawnSync("git", ["diff", "-U0", "HEAD", "--", f], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
    const lines = d.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
    const removed = lines.filter((l) => l.startsWith("-") && l.slice(1).trim() !== "");
    const added = lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1).trim()).filter((l) => l && !/^(\/\/|\*|\/\*)/.test(l) && !/^[{}()\[\];,]+$/.test(l));
    if (removed.length) p.push(`${f}: ลบ ${removed.length} บรรทัด (${removed[0].slice(0, 80)})`);
    const off = added.filter((l) => !/percentScale/.test(l));
    if (off.length) p.push(`${f}: บรรทัดเพิ่มที่ไม่เกี่ยว percentScale: ${off[0].slice(0, 80)}`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("S-9", "minute-job \"booking.privacy.purge\": everyMinutes 60 · ไม่ vpsOnly · เรียก purgeBookingPersonalData · ลงทะเบียนจริง", async () => {
  const src = read(F.mj);
  const i = src.indexOf(`"booking.privacy.purge"`);
  ok(i >= 0, "ไม่พบชื่องาน");
  const blk = src.slice(Math.max(0, src.lastIndexOf("registerMinuteJob(", i)), src.indexOf("});", i) + 3);
  ok(/everyMinutes:\s*60\b/.test(blk) && /purgeBookingPersonalData/.test(blk) && !/vpsOnly:\s*true/.test(blk), `บล็อก: ${blk.slice(0, 200)}`);
  const mj = (await tryImport("@/lib/platform/minute-jobs")).mod;
  const [st] = await mj.getMinuteJobStatus(["booking.privacy.purge"]);
  eq(st?.everyMinutes, 60, "everyMinutes จากทะเบียน");
}, "MAJOR");
await t("S-10", "คอมโพเนนต์ .tsx ไม่มีคีย์ค่าตั้ง \"booking.<กลุ่ม>.<ชื่อ>\" (ตำแหน่งอยู่ใน booking-settings-shared ที่เดียว · กติกาเหล็ก #16)", () => {
  const p: string[] = [];
  for (const f of COMP_FILES) {
    const hits = [...stripComments(read(f)).matchAll(/["'`](booking|payments|messaging)\.[a-z]+\.[A-Za-z]+["'`]/g)].map((m) => m[0]);
    if (hits.length) p.push(`${f}: ${uniq(hits).slice(0, 4).join(",")}`);
  }
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");
await t("S-11", "หน้าคิววันนี้แสดงเบอร์ผ่าน phoneForViewer เท่านั้น (ไม่มี {a.customerPhone} ตรง)", () => {
  const src = stripComments(read(F.pToday));
  ok(/phoneForViewer\s*\(/.test(src), "ไม่เรียก phoneForViewer");
  ok(!/\{\s*\w+\.customerPhone\s*\}/.test(src), "ยังแสดง customerPhone ดิบ");
}, "MAJOR");
await t("S-12", "facade booking/index.ts export ฟังก์ชันใบนี้ (loadBookingSettingsPage · applyBookingTemplate · setStaffService · setServiceBooking · applyBookingRolePreset · purgeBookingPersonalData · canBookingAction · phoneForViewer)", () => {
  const miss = ["loadBookingSettingsPage", "applyBookingTemplate", "setStaffService", "setServiceBooking", "applyBookingRolePreset", "purgeBookingPersonalData", "canBookingAction", "phoneForViewer"]
    .filter((n) => typeof BK.mod?.[n] !== "function");
  ok(miss.length === 0, `ขาด ${miss.join(", ")}${BK.err ? ` (${BK.err})` : ""}`);
});
await t("S-13", "ทางจองที่สร้างลูกค้าใหม่ติด source BOOKING (walk-in = WALK_IN) — ไม่งั้น Customer ค้างจากแข่งจอง (หนี้ B.3) เป็น source ว่างซึ่งงานลบไม่แตะ (มติผู้คุม 4)", () => {
  const src = stripComments(read("src/lib/modules/booking/service.ts"));
  ok(/customer\.(update|updateMany)\s*\([\s\S]{0,400}source:\s*["']BOOKING["']/.test(src) || /source:\s*["']BOOKING["'][\s\S]{0,400}customer\.(update|updateMany)/.test(src), "booking/service.ts ไม่ติด source BOOKING ให้ลูกค้าที่สร้างใหม่");
}, "MAJOR");

// ═══════════════ R. ทะเบียน · ตำแหน่ง ═══════════════
console.log("\nR. ทะเบียน booking · ตาราง BOOKING_SETTINGS_LAYOUT");
await t("R-1", "booking: ทุกกลุ่มของ def ที่ไม่ซ่อนมีป้ายไทย (groupLabelTh) ไม่ซ้ำกัน", () => {
  const groups = uniq(listDefs("booking").filter((d) => !d.hiddenUntil).map((d) => String(d.group)));
  const labels = groups.map((g) => s?.groupLabelTh?.("booking", g));
  const bad = groups.filter((_, i) => !isThai(labels[i]));
  ok(bad.length === 0, `ไม่มีป้ายไทย: ${bad.join(",")}`);
  eq(new Set(labels).size, labels.length, "ป้ายซ้ำ");
}, "MAJOR");
const enumOptions = (schema: Any): string[] | null => {
  let sc = schema;
  for (let i = 0; i < 4 && sc; i++) {
    if (Array.isArray(sc.options) && sc.options.every((o: unknown) => typeof o === "string")) return sc.options as string[];
    sc = typeof sc.unwrap === "function" ? sc.unwrap() : null;
  }
  return null;
};
await t("R-2", "booking: ทุก def enum ที่ไม่ซ่อนมี enumLabelsTh ครบทุกตัวเลือก · ป้ายไม่ใช่ค่าดิบ", () => {
  const p: string[] = [];
  for (const d of listDefs("booking")) {
    if (d.type !== "enum" || d.hiddenUntil) continue;
    const opts = enumOptions(d.schema);
    if (!opts) { p.push(`${d.key}: อ่านตัวเลือกไม่ได้`); continue; }
    for (const o of opts) { const lb = d.enumLabelsTh?.[o]; if (typeof lb !== "string" || !isThai(lb) || lb === o || RAW_ENUM.test(lb)) p.push(`${d.key}.${o}=${fmt(lb)}`); }
  }
  ok(p.length === 0, p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : ""));
}, "MAJOR");
const LAYOUT: Any = LAY.mod?.BOOKING_SETTINGS_LAYOUT;
await t("R-3", "BOOKING_SETTINGS_LAYOUT.policyCards: 9 การ์ด ลำดับ/เลข/คอลัมน์/หัวตามใบสั่ง §3", () => {
  ok(LAYOUT, `ไม่มี BOOKING_SETTINGS_LAYOUT (${LAY.err})`);
  const got = (LAYOUT.policyCards as Any[]).map((c) => [c.key, c.no, c.column]);
  eq(got, POLICY_CARDS.map((c) => [c.key, c.no, c.column]), "การ์ด");
  const p = (LAYOUT.policyCards as Any[]).filter((c, i) => !String(c.labelTh).includes(POLICY_CARDS[i].head)).map((c) => `${c.key}=${c.labelTh}`);
  ok(p.length === 0, `หัวการ์ด ${p.join(" · ")}`);
}, "MAJOR");
await t("R-4", "percentScale (มติผู้คุม): def percent ของ booking ที่เก็บ % เต็ม (onlineSharePct · forfeitPct = ทุกตัว) ตั้ง percentScale 100 · def percent อื่นไม่ตั้ง/10000 · ทะเบียนปฏิเสธค่าแปลก · ฟอร์มส่ง percentScale ต่อ · 60 ⇒ \"60%\" · \"70\" ⇒ 70 · bp ที่ max 100 ยังเป็น bp (ไม่มี heuristic)", async () => {
  const pct = listDefs("booking").filter((d) => d.type === "percent").map((d) => String(d.key)).sort();
  eq(pct, ["booking.booking.onlineSharePct", "booking.deposit.forfeitPct"], "def percent ของ booking (ถ้าเพิ่มต้องตั้ง scale ด้วย)");
  for (const k of pct) eq(getDef(k)?.percentScale, 100, `${k}.percentScale`);
  for (const dm of ["rooms", "payments", "messaging"]) for (const d of listDefs(dm)) if (d.type === "percent" && d.percentScale !== undefined && d.percentScale !== 10000) throw new AssertFail(`${d.key}.percentScale=${d.percentScale}`);
  let threw = false;
  try { s.defineSettings("qcb11", [{ key: "qcb11.x.bad", domain: "qcb11", group: "x", type: "percent", labelTh: "ทดสอบ", schema: (await import("zod" as string)).z.number(), defaults: { _fallback: 1 }, chain: ["UNIT"], editPermission: "qcb11.edit", percentScale: 50 }]); } catch { threw = true; }
  ok(threw, "ทะเบียนต้องปฏิเสธ percentScale ที่ไม่ใช่ 100/10000");
  const base = { domain: "booking", group: "booking", helpTh: null, hasOwn: false, source: "TEMPLATE", sourceLabelTh: "ค่าจากแม่แบบ", templateValue: 60, differsFromTemplate: false, overrideCount: 0,
    editable: true, lockedReasonTh: null, masked: false, pendingLegalReview: false, options: null, nullable: false, templateVars: null, requiresIntegration: null, effectiveDated: false, sensitivity: null, ownerOnly: false, labelTh: "สัดส่วน" };
  const whole = { ...base, key: "booking.booking.onlineSharePct", type: "percent", value: 60, min: 0, max: 100, percentScale: 100 };
  const bp100 = { ...base, key: "x.bp100", type: "percent", value: 50, min: 0, max: 100 };
  const bp = { ...base, key: "x.bp", type: "percent", value: 750, min: 0, max: 10000 };
  eq(sh.formatFieldValue(whole, 60), "60%", "format 60");
  eq(sh.parseFieldInput(whole, "70"), { ok: true, value: 70 }, "parse 70");
  ok(sh.parseFieldInput(whole, "101")?.ok === false, "101 ต้องปฏิเสธ");
  eq(sh.formatFieldValue(bp100, 50), "0.5%", "bp ที่ max 100 (ไม่มี percentScale) ยังเป็น bp");
  eq(sh.formatFieldValue(bp, 750), "7.5%", "bp 750");
  eq(sh.parseFieldInput(bp, "7.5"), { ok: true, value: 750 }, "bp parse");
});

// ═══════════════ K. สิทธิ์ (pure) ═══════════════
console.log("\nK. สิทธิ์: คีย์ · 9 แถว · ชุดตามแม่แบบ · ด่าน action");
const pm: Any = PERM.mod;
await t("K-1", "คีย์ใหม่ 12 ตัวลงทะเบียน (isPermissionKey) + ป้ายไทยไม่ใช่คีย์ดิบ · คีย์เดิม 12 ตัวยังอยู่", () => {
  const p: string[] = [];
  for (const k of [...NEW_KEYS, ...OLD_KEYS]) {
    if (!pm?.isPermissionKey?.(k)) p.push(`${k}: ไม่ลงทะเบียน`);
    else if (!isThai(pm.permissionLabel(k)) || pm.permissionLabel(k) === k) p.push(`${k}: ป้าย ${pm.permissionLabel(k)}`);
  }
  ok(p.length === 0, p.join(" · "));
});
await t("K-2", "planned ตรงความจริง: คีย์ใหม่ที่ไม่มีโค้ดใน src (นอก permissions.ts) อ้างถึง ⇒ planned · ที่มีโค้ดอ้าง ⇒ ไม่ planned", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(join(ROOT, d))) { const r = `${d}/${n}`; const st = statSync(join(ROOT, r)); if (st.isDirectory()) walk(r); else if (/\.(ts|tsx)$/.test(n) && r !== F.perms) files.push(r); } };
  walk("src");
  const corpus = files.map((f) => stripComments(read(f))).join("\n");
  const p: string[] = [];
  for (const k of NEW_KEYS) {
    const used = corpus.includes(`"${k}"`) || corpus.includes(`'${k}'`);
    const planned = (pm?.PERMISSIONS as Any[] | undefined)?.find((x) => x.key === k)?.planned === true;
    if (used === planned) p.push(`${k}: ใช้=${used} planned=${planned}`);
  }
  ok(p.length === 0, p.join(" · "));
}, "MAJOR");
await t("K-3", "BOOKING_ROLE_ROWS: 10 แถว (ภาพ 14 + \"รับมัดจำ\" แถวที่ 4 · มติผู้คุม) · id/ป้าย (ตรงภาพ 14)/คีย์ ตามใบสั่ง §7.1 · ทุกคีย์ลงทะเบียน", () => {
  const rows = pm?.BOOKING_ROLE_ROWS as Any[] | undefined;
  ok(Array.isArray(rows), "ไม่มี BOOKING_ROLE_ROWS");
  eq(rows!.map((r) => [r.id, r.labelTh, sorted([...r.keys])]), ROLE_ROWS.map((r) => [r.id, r.labelTh, sorted(r.keys)]), "แถว");
});
await t("K-4", "BOOKING_ROLE_PRESETS: BARBER = SPA = ตารางภาพ 14 (LEAD · PROVIDER · CASHIER) · CLINIC + ASSISTANT · bookingPresetPermissions คืนทุกคีย์ true/false", () => {
  const P = pm?.BOOKING_ROLE_PRESETS as Any;
  ok(P, "ไม่มี BOOKING_ROLE_PRESETS");
  for (const tpl of ["BARBER", "SPA", "CLINIC"]) for (const role of ["LEAD", "PROVIDER", "CASHIER"]) eq(sorted([...(P[tpl]?.[role] ?? [])]), sorted(PRESET_ROWS[role]), `${tpl}.${role}`);
  eq(sorted([...(P.CLINIC?.ASSISTANT ?? [])]), sorted(PRESET_ROWS.ASSISTANT), "CLINIC.ASSISTANT");
  ok(!P.BARBER?.ASSISTANT && !P.SPA?.ASSISTANT, "ASSISTANT เฉพาะคลินิก");
  for (const role of ["LEAD", "PROVIDER", "CASHIER"]) eq(pm.bookingPresetPermissions("BARBER", role), presetPerms(role), `bookingPresetPermissions BARBER ${role}`);
  eq(pm.bookingPresetPermissions("NO_SUCH", "PROVIDER"), presetPerms("PROVIDER"), "แม่แบบไม่รู้จัก = BARBER");
});
await t("K-5", "ช่าง/แคชเชียร์ไม่มีคีย์เงิน · ช่างไม่มีรับ/ยืนยันมัดจำ (หัวหน้าร้าน/แคชเชียร์มี) · หัวหน้าร้านแก้ค่าตั้ง/เงินค่าตั้งไม่ได้ (เจ้าของเท่านั้น)", () => {
  const p: string[] = [];
  for (const role of ["PROVIDER", "CASHIER"]) { const m = pm?.bookingPresetPermissions?.("SPA", role) ?? {}; for (const k of MONEY_KEYS) if (m[k] === true) p.push(`${role} ได้ ${k}`); }
  for (const tpl of ["BARBER", "SPA", "CLINIC"]) { const m = pm?.bookingPresetPermissions?.(tpl, "PROVIDER") ?? {}; for (const k of PROVIDER_FORBIDDEN_DEPOSIT) if (m[k] !== false) p.push(`PROVIDER ${tpl} ${k}=${m[k]}`); }
  for (const role of ["LEAD", "CASHIER"]) { const m = pm?.bookingPresetPermissions?.("BARBER", role) ?? {}; for (const k of PROVIDER_FORBIDDEN_DEPOSIT) if (m[k] !== true) p.push(`${role} ต้องได้ ${k}`); }
  const lead = pm?.bookingPresetPermissions?.("BARBER", "LEAD") ?? {};
  for (const k of ["booking.settings.edit", "booking.settings.money", "booking.service.setDeposit"]) if (lead[k] !== false) p.push(`LEAD ${k}=${lead[k]}`);
  ok(Object.keys(lead).length > 0 && p.length === 0, p.join(" · ") || "ไม่มี bookingPresetPermissions");
});
const acc: Any = ACC.mod;
await t("K-6", "BOOKING_ACTIONS = ทุก export ใน actions/booking.ts + booking-settings.ts · คีย์ตามใบสั่ง §7.2 · setStatusAction แยกตามสถานะ", () => {
  ok(acc?.BOOKING_ACTIONS, `ไม่มี BOOKING_ACTIONS (${ACC.err})`);
  const names = sorted([...exportedFns(read(F.actions)), ...exportedFns(read(F.sactions))].map((f) => f.name));
  eq(sorted(Object.keys(acc.BOOKING_ACTIONS)), names, "ชื่อ action ในตาราง = export จริง");
  for (const [a, keys] of Object.entries(ACTION_KEYS)) eq(sorted([...(acc.bookingActionKeys(a) ?? [])]), sorted(keys), a);
  for (const [st, keys] of Object.entries(STATUS_KEYS)) eq(sorted([...(acc.bookingActionKeys("setStatusAction", { status: st }) ?? [])]), sorted(keys), `setStatus ${st}`);
  eq([...(acc.bookingActionKeys("setStatusAction", {}) ?? [])], ["booking.appointment.setStatus"], "setStatus ไม่ระบุสถานะ");
  for (const k of Object.values(ACTION_KEYS).flat()) ok(pm?.isPermissionKey?.(k), `${k} ไม่ลงทะเบียน`);
});
await t("K-7", "canBookingAction: OWNER ✓ · MANAGER สาขานี้ ✓ / สาขาอื่น ✗ · STAFF ไม่มีคีย์ ✗ · STAFF คีย์อื่น ✗ · STAFF ถือคีย์ใดคีย์หนึ่ง ✓ (positive) · action ไม่รู้จัก ✗", () => {
  const fn = fnOf(acc, "canBookingAction", ACC.err);
  const U = "unit-x";
  const p: string[] = [];
  const all: [string, Any, string[]][] = [
    ...Object.entries(ACTION_KEYS).map(([a, k]) => [a, undefined, k] as [string, Any, string[]]),
    ...Object.entries(STATUS_KEYS).map(([st, k]) => ["setStatusAction", { status: st }, k] as [string, Any, string[]]),
  ];
  for (const [a, input, keys] of all) {
    const tag = `${a}${input ? `:${input.status}` : ""}`;
    if (!fn({ role: "OWNER", unitAccess: ["*"], permissions: {} }, U, a, input)) p.push(`${tag} OWNER`);
    if (!fn({ role: "MANAGER", unitAccess: [U], permissions: {} }, U, a, input)) p.push(`${tag} MANAGER`);
    if (fn({ role: "MANAGER", unitAccess: ["other"], permissions: {} }, U, a, input)) p.push(`${tag} MANAGER สาขาอื่นผ่าน`);
    if (fn({ role: "STAFF", unitAccess: [U], permissions: {} }, U, a, input)) p.push(`${tag} STAFF ว่างผ่าน`);
    if (fn({ role: "STAFF", unitAccess: [U], permissions: { "pos.sale.create": true } }, U, a, input)) p.push(`${tag} STAFF คีย์อื่นผ่าน`);
    for (const k of keys) {
      if (!fn({ role: "STAFF", unitAccess: [U], permissions: { [k]: true } }, U, a, input)) p.push(`${tag} STAFF+${k} ไม่ผ่าน`);
      if (fn({ role: "STAFF", unitAccess: ["other"], permissions: { [k]: true } }, U, a, input)) p.push(`${tag} STAFF+${k} สาขาอื่นผ่าน`);
    }
  }
  if (fn({ role: "OWNER", unitAccess: ["*"], permissions: {} }, U, "noSuchAction")) p.push("action ไม่รู้จักผ่าน");
  ok(p.length === 0, p.slice(0, 8).join(" · "));
});

// ═══════════════ P. pure เบอร์ ═══════════════
console.log("\nP. ซ่อนเบอร์");
await t("P-1", "maskPhone: \"081-234-5678\"/\"+66812345678\" ⇒ \"•••-•••-5678\" · \"\"/null ⇒ \"\" · \"12\" ⇒ \"•••\" · ไม่เหลือเลขหน้า", () => {
  const fn = fnOf(PRS.mod, "maskPhone", PRS.err);
  eq(fn("081-234-5678"), "•••-•••-5678", "081-234-5678");
  eq(fn("+66812345678"), "•••-•••-5678", "+66");
  eq(fn(""), "", "ว่าง");
  eq(fn(null), "", "null");
  eq(fn("12"), "•••", "สั้น");
  ok(!/081|234/.test(fn("0812345678")), "เลขหน้าเหลือ");
});
await t("P-2", "phoneForViewer: OWNER/MANAGER/STAFF+booking.customer.phoneFull ⇒ เต็ม · STAFF ไม่มีคีย์/สาขาอื่น ⇒ ซ่อน", () => {
  const fn = fnOf(PRS.mod, "phoneForViewer", PRS.err);
  const U = "u-1";
  eq(fn({ role: "OWNER", unitAccess: ["*"], permissions: {} }, U, "0812345678"), "0812345678", "OWNER");
  eq(fn({ role: "MANAGER", unitAccess: [U], permissions: {} }, U, "0812345678"), "0812345678", "MANAGER");
  eq(fn({ role: "STAFF", unitAccess: [U], permissions: { "booking.customer.phoneFull": true } }, U, "0812345678"), "0812345678", "STAFF+phoneFull");
  eq(fn({ role: "STAFF", unitAccess: [U], permissions: { "booking.appointment.setStatus": true } }, U, "0812345678"), "•••-•••-5678", "STAFF ไม่มีคีย์");
  eq(fn({ role: "STAFF", unitAccess: ["other"], permissions: { "booking.customer.phoneFull": true } }, U, "0812345678"), "•••-•••-5678", "สาขาอื่น");
});

// ═══════════════ ฐานข้อมูล ═══════════════
const dbMod = await tryImport("@/lib/core/db");
if (!dbMod.mod) { console.error(`🔴 ${LABEL}: โหลด @/lib/core/db ไม่ได้ — ${dbMod.err}`); process.exit(4); }
const db: Any = dbMod.mod.prisma;
const PRISMA_NS: Any = (await import("@prisma/client" as string)).Prisma;
const DMMF_MODELS: { name: string; fields: { name: string; kind: string; type: string }[] }[] = PRISMA_NS?.dmmf?.datamodel?.models ?? [];
const delegate = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);
const TENANT_MODELS = DMMF_MODELS.filter((m) => m.fields.some((f) => f.name === "tenantId" && f.kind === "scalar")).map((m) => m.name).filter((n) => n !== "Tenant");
const SLUG = "svc-b11-";
const MAIL = "svc-b11-";
const tenantIds: string[] = [];
async function cleanup(ids: string[]) {
  if (ids.length) {
    for (let pass = 0; pass < 4; pass++) {
      for (const m of TENANT_MODELS) { try { await db[delegate(m)].deleteMany({ where: { tenantId: { in: ids } } }); } catch { /* FK — รอบถัดไป */ } }
    }
    try { await db.tenant.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant: ${errMsg(e)}`); }
  }
  try { await db.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
async function leftovers(ids: string[]): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  if (!ids.length) return out;
  for (const m of TENANT_MODELS) { try { const n = await db[delegate(m)].count({ where: { tenantId: { in: ids } } }); if (n) out.push({ table: m, n }); } catch { /* ไม่มีตาราง */ } }
  return out;
}
try {
  const stale = (await db.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })) as { id: string }[];
  if (stale.length) console.log(`\n(กวาด tenant ค้าง ${stale.length})`);
  await cleanup(stale.map((r) => r.id));
} catch (e) { console.log(`  ⚠️ กวาดของค้าง: ${errMsg(e)}`); }

const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };
const DAY = 86_400_000;

try {
  // ═══════════════ ฉาก ═══════════════
  const mkTenant = async (name: string) => { const r = await db.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC B.11 ร้าน A");
  const tB = await mkTenant("QC B.11 ร้าน B");
  const ctxA = { tenantId: tA };
  const ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await db.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UA = await mkUnit(tA, "BOOKING", "บาร์เบอร์ทดสอบ B11");
  const UM = await mkUnit(tA, "BOOKING", "ร้านนวดทดสอบ B11");
  const U2 = await mkUnit(tA, "BOOKING", "สาขาสองไม่มีแม่แบบ B11");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ B11");
  const UB = await mkUnit(tB, "BOOKING", "บาร์เบอร์ร้าน B");
  const mkStaff = async (tenantId: string, unitId: string, name: string, sortOrder: number, employeeId: string | null = null) =>
    (await db.bookingStaff.create({ data: { tenantId, unitId, name, sortOrder, employeeId } })).id as string;
  const mkSvc = async (tenantId: string, unitId: string, x: { name: string; durationMin: number; priceSatang: number; depositSatang?: number; bufferMin?: number; bookable?: boolean; sortOrder: number }) =>
    (await db.bookingService.create({ data: { tenantId, unitId, depositSatang: 0, bufferMin: 0, bookable: true, ...x } })).id as string;
  const barberStaff: Record<string, string> = {};
  for (const [i, n] of ["ช่างเอก", "ช่างบอย", "ช่างนุ่น", "ช่างแจ๊ค"].entries()) barberStaff[n] = await mkStaff(tA, UA, n, i + 1);
  const svcA1 = await mkSvc(tA, UA, { name: "ตัดผมชาย", durationMin: 45, priceSatang: 25000, sortOrder: 1 });
  const MS = [
    { name: "นวดไทย", durationMin: 60, priceSatang: 35000, bufferMin: 5 },
    { name: "นวดไทย+ประคบ", durationMin: 120, priceSatang: 80000, bufferMin: 10 },
    { name: "นวดเท้า", durationMin: 60, priceSatang: 35000, bufferMin: 0 },
    { name: "น้ำมันอโรมา", durationMin: 90, priceSatang: 90000, bufferMin: 15 },
    { name: "คู่รัก VIP", durationMin: 90, priceSatang: 200000, bufferMin: 20, depositSatang: 50000 },
    { name: "หินร้อน", durationMin: 90, priceSatang: 120000, bufferMin: 15, depositSatang: 30000, bookable: false },
  ];
  const svcM: Record<string, string> = {};
  for (const [i, x] of MS.entries()) svcM[x.name] = await mkSvc(tA, UM, { ...x, sortOrder: i + 1 });
  const MST = ["พี่แดง", "พี่นก", "พี่จันทร์", "น้องฝ้าย", "น้องเมย์", "พี่ศรี"];
  const stM: Record<string, string> = {};
  for (const [i, n] of MST.entries()) stM[n] = await mkStaff(tA, UM, n, i + 1, n === "พี่แดง" ? `emp-b11-${RUN}` : null);
  for (let wd = 0; wd < 7; wd++) await db.bookingHours.create({ data: { tenantId: tA, unitId: UM, weekday: wd, openMin: 600, closeMin: 1260, closed: false } });
  for (const wd of [0, 1, 2, 4, 5, 6]) await db.bookingStaffHours.create({ data: { tenantId: tA, unitId: UM, staffId: stM["น้องฝ้าย"], weekday: wd, startMin: 780, endMin: 1320 } });
  const st2 = await mkStaff(tA, U2, "ช่างสาขาสอง", 1);
  const svc2 = await mkSvc(tA, U2, { name: "บริการสาขาสอง", durationMin: 30, priceSatang: 10000, sortOrder: 1 });
  const stB = await mkStaff(tB, UB, "ช่างร้าน B", 1);
  const svcB = await mkSvc(tB, UB, { name: "บริการร้าน B", durationMin: 30, priceSatang: 10000, sortOrder: 1 });

  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-b11-${tag}-${RUN}`;
    await db.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@qc.invalid`, name: `QC b11 ${tag}` } });
    const mb = await db.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const both = [UA, UM];
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", both);
  const MGR2 = await mkMember("mgr2", tA, "MANAGER", [U2]);
  const LEAD = await mkMember("lead", tA, "STAFF", both, presetPerms("LEAD"));
  const PROV = await mkMember("prov", tA, "STAFF", both, presetPerms("PROVIDER"));
  const CASH = await mkMember("cash", tA, "STAFF", both, presetPerms("CASHIER"));
  const SEDIT = await mkMember("sedit", tA, "STAFF", both, { "booking.settings.edit": true, "booking.staff.create": true, "booking.service.update": true });
  const SMONEY = await mkMember("smoney", tA, "STAFF", both, { "booking.settings.edit": true, "booking.settings.money": true, "booking.staff.create": true, "booking.service.update": true });
  const NOPERM = await mkMember("noperm", tA, "STAFF", both, {});
  const TARGET = await mkMember("target", tA, "STAFF", both, { "booking.settings.edit": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);

  const setS = (a: Actor, ch: Any[], ctx: Any = ctxA) => fnOf(s, "setSettings")(a, ctx, ch);
  const L = (a: Actor, q: Any, ctx: Any = ctxA): Promise<Any> => bk("loadBookingSettingsPage")(a, ctx, q);
  const scopeOf = (scope: string, scopeId: string) => ({ scope, scopeId });

  let seeded = false;
  await t("PC-2", "ฉาก (เครื่องยนต์ล้วน): BARBER ที่บาร์เบอร์ · SPA ที่ร้านนวด · 6 ข้อ + noise + ปรับรายคน 3 · ค่าร้านนวด · ใครทำได้ (แถวตรง)", async () => {
    const ap = fnOf(s, "applyTemplate");
    ok((await ap(OWNER, ctxA, { unitId: UA, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" }))?.ok, "applyTemplate BARBER");
    ok((await ap(OWNER, ctxA, { unitId: UM, domain: "booking", templateKey: "SPA", overwrite: "KEEP_CUSTOM" }))?.ok, "applyTemplate SPA");
    const ch: Any[] = [
      ...SCN.barber.unitDiffs.map((d: Any) => ({ key: d.key, ...scopeOf("UNIT", UA), value: d.value })),
      ...SCN.barber.noise.map((d: Any) => ({ key: d.key, ...scopeOf("UNIT", UA), value: d.value })),
      ...Object.entries(SCN.barber.staffOnlinePct).map(([n, v]) => ({ key: "booking.booking.onlineSharePct", ...scopeOf("STAFF", barberStaff[n]), value: v })),
      { key: "booking.booking.minLeadMin", ...scopeOf("SERVICE", svcA1), value: 120 },
      ...SCN.massage.unitValues.map((d: Any) => ({ key: d.key, ...scopeOf("UNIT", UM), value: d.value })),
      ...Object.entries(SCN.massage.staffOnlinePct).map(([n, v]) => ({ key: "booking.booking.onlineSharePct", ...scopeOf("STAFF", stM[n]), value: v })),
      ...Object.entries(SCN.massage.staffCommissionBp).map(([n, v]) => ({ key: "booking.money.commissionRate", ...scopeOf("STAFF", stM[n]), value: { serviceBp: v, productBp: 0 } })),
      ...SCN.massage.serviceValues.map((d: Any) => ({ key: d.key, ...scopeOf("SERVICE", svcM[d.service]), value: d.value })),
    ];
    const r = await setS(OWNER, ch);
    ok(r?.ok, `setSettings ${fmt(r)}`);
    for (const x of SCN.massage.staffServices) for (const sv of x.services)
      await db.bookingStaffService.create({ data: { tenantId: tA, unitId: UM, staffId: stM[x.staff], serviceId: svcM[sv.name], priceSatang: sv.priceSatang ?? null, durationMin: sv.durationMin ?? null } });
    seeded = true;
  });
  const needSeed = () => { if (!seeded) throw new AssertFail("ฉาก PC-2 ไม่ผ่าน"); };
  await t("PC-3", "ฟอร์ม R0.4 ชั้น UNIT ของบาร์เบอร์: ช่อง booking ที่ต่างจากแม่แบบ = 6 คีย์ของฉากพอดี · onlineSharePct ปรับรายคน 3 (เครื่องยนต์นับเอง)", async () => {
    needSeed();
    const m = await fnOf(s, "loadSettingsForm")(OWNER, ctxA, { domains: ["booking"], unitId: UA });
    const f = (m?.groups ?? []).flatMap((g: Any) => g.fields);
    eq(sorted(f.filter((x: Any) => x.differsFromTemplate).map((x: Any) => x.key)), sorted(SCN.barber.unitDiffs.map((d: Any) => d.key)), "ต่างจากแม่แบบ");
    eq(f.find((x: Any) => x.key === "booking.booking.onlineSharePct")?.overrideCount, 3, "ปรับรายคน");
  });

  // ═══════════════ T. แม่แบบ ═══════════════
  console.log("\nT. เลือก/เปลี่ยนแม่แบบ");
  await t("T-1", "สาขายังไม่มีแม่แบบ: โมเดล 08 template=null · ไม่มีการ์ด active · render มี data-bk-no-template \"ยังไม่ได้เลือกแม่แบบ\" · ไม่มีแถบ diff", async () => {
    const m = await L(OWNER, { unitId: U2, page: "policy" });
    ok(m, "ได้ null");
    eq(m.template, null, "template");
    ok((m.templates as Any[]).every((x) => x.active === false), "มีการ์ด active");
    const h = render("policy", m);
    ok(textOf(one(h, "data-bk-no-template").html).includes("ยังไม่ได้เลือกแม่แบบ"), "ข้อความ");
    eq(elems(h, "data-active", "true").length, 0, "การ์ด active");
    eq(elems(h, "data-bk-diff-bar").length, 0, "แถบ diff");
  }, "MAJOR");
  await t("T-2", "applyBookingTemplate: เจ้าของเลือก BARBER (KEEP_CUSTOM) ⇒ ok · โปรไฟล์ BARBER · โมเดล template.key BARBER + การ์ด BARBER active", async () => {
    const r = await bk("applyBookingTemplate")(OWNER, ctxA, { unitId: U2, templateKey: "BARBER", overwrite: "KEEP_CUSTOM" });
    ok(r?.ok, fmt(r));
    eq((await db.settingProfile.findFirst({ where: { unitId: U2, domain: "booking" } }))?.templateKey, "BARBER", "โปรไฟล์");
    const m = await L(OWNER, { unitId: U2, page: "policy" });
    eq([m?.template?.key, (m?.templates as Any[]).filter((x) => x.active).map((x) => x.key)], ["BARBER", ["BARBER"]], "โมเดล");
  });
  await t("T-3", "แม่แบบซ่อน (CLINIC) / ไม่รู้จัก ⇒ VALIDATION ไม่เขียน · overwrite ไม่ระบุ/ผิด ⇒ VALIDATION (ต้องถามก่อนทับทุกครั้ง)", async () => {
    const fn = bk("applyBookingTemplate");
    for (const [tk, ow] of [["CLINIC", "KEEP_CUSTOM"], ["NOPE", "KEEP_CUSTOM"], ["SPA", undefined], ["SPA", "MERGE"]] as const) {
      const r = await fn(OWNER, ctxA, { unitId: U2, templateKey: tk, overwrite: ow });
      ok(r?.ok === false && r.code === "VALIDATION", `${tk}/${ow}: ${fmt(r)}`);
    }
    eq((await db.settingProfile.findFirst({ where: { unitId: U2, domain: "booking" } }))?.templateKey, "BARBER", "โปรไฟล์ไม่เปลี่ยน");
  });
  await t("T-4", "เปลี่ยนเป็น SPA: KEEP_CUSTOM คงแถวที่ปรับ · RESET_ALL ล้างแถว booking ชั้น UNIT/STAFF/SERVICE ของสาขา แต่คง payments/messaging และ TENANT", async () => {
    const fn = bk("applyBookingTemplate");
    ok((await setS(OWNER, [
      { key: "booking.late.graceMin", ...scopeOf("UNIT", U2), value: 20 },
      { key: "booking.booking.onlineSharePct", ...scopeOf("STAFF", st2), value: 30 },
      { key: "booking.booking.minLeadMin", ...scopeOf("SERVICE", svc2), value: 30 },
      { key: "messaging.channelOrder", ...scopeOf("UNIT", U2), value: ["LINE", "SMS"] },
      { key: "booking.privacy.walkInRetentionDays", ...scopeOf("TENANT", tA), value: 365 },
    ]))?.ok, "ตั้งค่าก่อน");
    const rows = async () => (await db.settingValue.findMany({ where: { tenantId: tA, scopeId: { in: [U2, st2, svc2, tA] } }, select: { key: true } })).map((r: Any) => r.key).sort();
    ok((await fn(OWNER, ctxA, { unitId: U2, templateKey: "SPA", overwrite: "KEEP_CUSTOM" }))?.ok, "KEEP_CUSTOM");
    eq(await rows(), sorted(["booking.late.graceMin", "booking.booking.onlineSharePct", "booking.booking.minLeadMin", "messaging.channelOrder", "booking.privacy.walkInRetentionDays"]), "หลัง KEEP_CUSTOM");
    ok((await fn(OWNER, ctxA, { unitId: U2, templateKey: "SPA", overwrite: "RESET_ALL" }))?.ok, "RESET_ALL");
    eq(await rows(), sorted(["messaging.channelOrder", "booking.privacy.walkInRetentionDays"]), "หลัง RESET_ALL");
    eq((await db.settingProfile.findFirst({ where: { unitId: U2, domain: "booking" } }))?.templateKey, "SPA", "โปรไฟล์");
    ok((await fnOf(s, "resetSetting")(OWNER, ctxA, { key: "booking.privacy.walkInRetentionDays", scope: "TENANT", scopeId: tA }))?.ok, "คืน TENANT");
  });
  await t("T-5", "สิทธิ์: ผู้จัดการ/หัวหน้าร้าน ⇒ PERMISSION · ร้าน B ขอสาขาร้าน A ⇒ NOT_FOUND · โปรไฟล์ไม่เปลี่ยน", async () => {
    const fn = bk("applyBookingTemplate");
    for (const a of [MGR, LEAD]) { const r = await fn(a, ctxA, { unitId: UA, templateKey: "SPA", overwrite: "KEEP_CUSTOM" }); ok(r?.ok === false && r.code === "PERMISSION", `${a.role}: ${fmt(r)}`); }
    const rb = await fn(OWNER_B, ctxB, { unitId: UA, templateKey: "SPA", overwrite: "KEEP_CUSTOM" });
    ok(rb?.ok === false && rb.code === "NOT_FOUND", `ข้ามร้าน ${fmt(rb)}`);
    eq((await db.settingProfile.findFirst({ where: { unitId: UA, domain: "booking" } }))?.templateKey, "BARBER", "โปรไฟล์ UA");
  });

  // ═══════════════ M. จอง 08 ═══════════════
  console.log("\nM. จอง 08 (แม่แบบ + นโยบาย)");
  let mPol: Any = null;
  let hPol = "";
  await t("M-1", "โมเดล 08 (เจ้าของ · บาร์เบอร์): template BARBER · diffCount 6 · diffKeys = 6 คีย์ฉาก · diffLinks (การ์ด 08 → policy · ข้อความ → messages · พักขั้นต่ำ → staff) · JSON ล้วน", async () => {
    needSeed();
    mPol = await L(OWNER, { unitId: UA, page: "policy" });
    ok(mPol, "ได้ null");
    eq([mPol.page, mPol.template?.key, mPol.diffCount], ["policy", "BARBER", 6], "หัวโมเดล");
    eq(sorted(mPol.diffKeys), sorted(SCN.barber.unitDiffs.map((d: Any) => d.key)), "diffKeys");
    eq(mPol.diffLinks, {
      "booking.money.commissionRate": "policy", "booking.queue.overrunExtendMin": "policy", "booking.msg.nearTurn": "messages",
      "booking.msg.reminder": "messages", "booking.msg.confirmation": "messages", "booking.staff.minBreakMin": "staff",
    }, "diffLinks");
    eq(JSON.parse(JSON.stringify(mPol)), mPol, "JSON ล้วน");
    hPol = render("policy", mPol);
  });
  await t("M-2", "เมนูซ้าย: 5 รายการลำดับ/ป้ายตามแบบ · policy = aria-current · ศูนย์เชื่อมต่อ → /app/settings/integrations", () => {
    ok(hPol, "ไม่มี render");
    const nav = one(hPol, "data-bk-nav");
    const items = elems(nav.html, "data-bk-nav-item");
    eq(items.map((x) => x.attrs["data-bk-nav-item"]), ["policy", "messages", "devices", "roles", "integrations"], "ลำดับ");
    const labels = ["แม่แบบและนโยบาย", "ข้อความแจ้งเตือน", "จอทีวี · ตู้ · บัตร", "สิทธิ์ผู้ใช้", "ศูนย์เชื่อมต่อ"];
    items.forEach((x, i) => ok(textOf(x.html).includes(labels[i]), `ป้าย ${i}: ${textOf(x.html)}`));
    eq(items.filter((x) => elems(x.html, "aria-current", "page").length > 0 || x.attrs["aria-current"] === "page").map((x) => x.attrs["data-bk-nav-item"]), ["policy"], "aria-current");
    ok(/href="\/app\/settings\/integrations"/.test(items[4].html), "ลิงก์ศูนย์เชื่อมต่อ");
  }, "MAJOR");
  await t("M-3", "การ์ดแม่แบบ: BARBER · SPA · CLINIC (ซ่อน \"เร็ว ๆ นี้\" ไม่มีปุ่มเลือก) · BARBER ใช้อยู่ · สรุป 1–3 บรรทัดไทย · ปุ่มเลือก SPA · กล่องยืนยัน KEEP_CUSTOM/RESET_ALL", () => {
    ok(hPol, "ไม่มี render");
    const box = one(hPol, "data-bk-templates");
    const cards = elems(box.html, "data-template-card");
    eq(cards.map((c) => c.attrs["data-template-card"]), ["BARBER", "SPA", "CLINIC"], "การ์ด");
    eq(cards.map((c) => c.attrs["data-active"]), ["true", "false", "false"], "data-active");
    ok(textOf(cards[0].html).includes("ใช้อยู่"), "ป้าย ใช้อยู่");
    ok(cards[2].attrs["data-hidden"] === "true" && textOf(cards[2].html).includes("เร็ว ๆ นี้") && elems(cards[2].html, "data-template-pick").length === 0, "คลินิกซ่อน");
    eq(elems(box.html, "data-template-pick").map((x) => x.attrs["data-template-pick"]), ["SPA"], "ปุ่มเลือก");
    for (const x of mPol.templates as Any[]) ok(Array.isArray(x.summaryTh) && x.summaryTh.length >= 1 && x.summaryTh.length <= 3 && x.summaryTh.every(isThai), `summaryTh ${x.key}`);
    const cf = one(hPol, "data-template-confirm");
    ok(textOf(one(cf.html, "data-overwrite", "KEEP_CUSTOM").html).includes("คงค่าที่ปรับ") && textOf(one(cf.html, "data-overwrite", "RESET_ALL").html).includes("ล้าง"), "ปุ่มยืนยัน");
  }, "MAJOR");
  await t("M-4", "แถบ diff: data-diff-count=6 · ข้อความ \"ตัดผม/เสริมสวย\" + \"ปรับจากแม่แบบแล้ว 6 ข้อ\" · ปุ่ม ดูเฉพาะที่ปรับ / คืนค่าแม่แบบ", () => {
    const bar = one(hPol, "data-bk-diff-bar");
    eq(bar.attrs["data-diff-count"], "6", "data-diff-count");
    const tx = textOf(bar.html);
    ok(tx.includes(String(s.getTemplate("booking", "BARBER").labelTh)) && tx.includes("ปรับจากแม่แบบแล้ว 6 ข้อ"), tx);
    ok(textOf(one(bar.html, "data-bk-action", "only-changed").html).includes("ดูเฉพาะที่ปรับ"), "ดูเฉพาะที่ปรับ");
    ok(textOf(one(bar.html, "data-bk-action", "reset-template").html).includes("คืนค่าแม่แบบ"), "คืนค่าแม่แบบ");
  }, "MAJOR");
  await t("M-5", "การ์ดเลข: ลำดับ/เลข/หัว 1 เวลาและการจอง … 6 แจ้งเตือนและหน้าจอ (+7–9) · สองคอลัมน์ left = 1,2,4,7 · right = 3,5,6,8,9 · โมเดล cards ตรง", () => {
    const cards = elems(hPol, "data-bk-group");
    const want = POLICY_CARDS.filter((c) => cardKeys(c.key).length > 0);
    // ORACLE-EDIT 29 ต.ค. (builder · ผู้คุมอนุมัติ): เดิมบังคับลำดับ DOM 1→9 ซึ่งขัดกับคอลัมน์ซ้าย/ขวา (DOM = 1,2,4,7,3,5,6,8,9) ⇒ ตรวจเป็นชุด + ลำดับภายในคอลัมน์
    eq(sorted(cards.map((c) => `${c.attrs["data-bk-group"]}:${c.attrs["data-group-no"]}`)), sorted(want.map((c) => `${c.key}:${c.no}`)), "ชุดการ์ด (key:no)");
    for (const c of cards) { const w = want.find((x) => x.key === c.attrs["data-bk-group"]); ok(w && textOf(c.html).includes(w.head), `หัวการ์ด ${c.attrs["data-bk-group"]}`); }
    const cols = one(hPol, "data-bk-cols", "2");
    for (const side of ["left", "right"] as const) {
      const col = one(cols.html, "data-bk-col", side);
      eq(elems(col.html, "data-bk-group").map((c) => c.attrs["data-bk-group"]), want.filter((c) => c.column === side).map((c) => c.key), `คอลัมน์ ${side}`);
    }
    eq((mPol.cards as Any[]).map((c) => [c.key, c.no, c.column]), want.map((c) => [c.key, c.no, c.column]), "model.cards");
  }, "MAJOR");
  await t("M-6", "ช่องในการ์ด = ตำแหน่งใบสั่ง §3 พอดี (กลุ่ม · คิวไม่มี walkInPickStaff · แจ้งเตือนมี messaging.channelOrder · payments) · แถวลิงก์ไปหน้า 14 ในการ์ด 6", () => {
    const p: string[] = [];
    for (const c of elems(hPol, "data-bk-group")) {
      const d = setDiff(keysIn(c.html), cardKeys(c.attrs["data-bk-group"]));
      if (d.missing.length || d.extra.length) p.push(`${c.attrs["data-bk-group"]}: ขาด ${d.missing.join(",")} เกิน ${d.extra.join(",")}`);
    }
    const notify = one(hPol, "data-bk-group", "notify");
    if (!/href="[^"]*\/booking\/settings\/messages/.test(notify.html)) p.push("การ์ด 6 ไม่มีลิงก์หน้า 14");
    ok(p.length === 0, p.join(" · "));
  });
  await t("M-7", "แถวกะทัดรัด: ไม่ใช่ bool ⇒ data-bk-pill = formatFieldValue · bool ⇒ role=switch aria-checked · ไม่มี <textarea ในการ์ด · ป้าย changed (\"ปรับแล้ว\"+\"แม่แบบ\") เฉพาะที่ต่าง · override \"3\" ที่ % ออนไลน์ · ค่าเปอร์เซ็นต์ \"60%\"", () => {
    const fm = new Map<string, Any>(((mPol.form?.groups ?? []) as Any[]).flatMap((g) => g.fields).map((f: Any) => [f.key, f]));
    const p: string[] = [];
    for (const c of elems(hPol, "data-bk-group")) {
      if (/<textarea/i.test(c.html)) p.push(`${c.attrs["data-bk-group"]}: มี textarea`);
      for (const row of elems(c.html, "data-setting-key")) {
        const k = row.attrs["data-setting-key"];
        const f = fm.get(k);
        if (!f) { p.push(`${k}: ไม่อยู่ใน model.form`); continue; }
        if (f.type === "bool") {
          const sw = elems(row.html, "role", "switch");
          if (sw.length !== 1 || sw[0].attrs["aria-checked"] !== String(f.value === true)) p.push(`${k}: switch`);
        } else {
          const pill = elems(row.html, "data-bk-pill");
          if (pill.length !== 1 || textOf(pill[0].html) !== sh.formatFieldValue(f, f.value)) p.push(`${k}: pill ${pill[0] ? textOf(pill[0].html) : "—"} ≠ ${sh.formatFieldValue(f, f.value)}`);
        }
        const ch = elems(row.html, "data-bk-chip", "changed");
        if (f.differsFromTemplate !== (ch.length === 1)) p.push(`${k}: ป้าย changed`);
        if (ch.length === 1 && !(textOf(ch[0].html).includes("ปรับแล้ว") && textOf(ch[0].html).includes("แม่แบบ"))) p.push(`${k}: ข้อความป้าย changed`);
      }
    }
    const on = one(one(hPol, "data-bk-group", "booking").html, "data-setting-key", "booking.booking.onlineSharePct");
    ok(textOf(one(on.html, "data-bk-chip", "override").html).includes("3"), "ป้ายปรับรายคน 3");
    ok(textOf(one(on.html, "data-bk-pill").html) === "60%", `% ออนไลน์ ${textOf(one(on.html, "data-bk-pill").html)}`);
    eq(fm.get("booking.booking.onlineSharePct")?.percentScale, 100, "model.form field percentScale");
    ok(p.length === 0, p.slice(0, 8).join(" · "));
  });
  await t("M-8", "ดูเฉพาะที่ปรับ (view.onlyChanged): data-bk-changed-list มีแถว = 6 คีย์พอดี (ทุกหน้า) พร้อมลิงก์ไปหน้าของมัน · ไม่มีการ์ดเลข", () => {
    const h = render("policy", mPol, { onlyChanged: true });
    const list = one(h, "data-bk-changed-list");
    eq(sorted(keysIn(list.html)), sorted(SCN.barber.unitDiffs.map((d: Any) => d.key)), "แถว");
    const msgRow = one(list.html, "data-setting-key", "booking.msg.nearTurn");
    ok(/href="[^"]*\/booking\/settings\/messages/.test(msgRow.html), "ลิงก์ข้อความ → 14");
    ok(/href="[^"]*\/booking\/staff/.test(one(list.html, "data-setting-key", "booking.staff.minBreakMin").html), "ลิงก์พักขั้นต่ำ → 12");
    eq(elems(h, "data-bk-group").length, 0, "การ์ดเลข");
  }, "MAJOR");
  await t("M-9", "ครอบทุกช่อง: UNIT (ไม่ซ่อน) ของ booking/payments/messaging = 08 ∪ 14 ∪ ค่าร้าน 11 ∪ ค่าร้าน 12 · 08 ∩ 14 = ∅ · ไม่ซ้ำในหน้า", async () => {
    const hM = render("messages", await L(OWNER, { unitId: UA, page: "messages" }));
    const hS = one(render("services", await L(OWNER, { unitId: UA, page: "services" })), "data-bk-shop-defaults").html;
    const hT = one(render("staff", await L(OWNER, { unitId: UA, page: "staff" })), "data-bk-shop-defaults").html;
    const k08 = keysIn(hPol), k14 = keysIn(one(hM, "data-bk-settings-page", "messages").html).filter((k) => getDef(k) && (getDef(k).chain as string[]).includes("UNIT"));
    const all = uniq([...k08, ...k14, ...keysIn(hS), ...keysIn(hT)]);
    const want = [...unitKeysOf("booking"), ...unitKeysOf("payments"), ...unitKeysOf("messaging")];
    const d = setDiff(all, want);
    ok(!d.missing.length && !d.extra.length, `ขาด ${d.missing.join(",")} · เกิน ${d.extra.join(",")}`);
    eq(k08.filter((k) => k14.includes(k)), [], "08 ∩ 14");
    eq(k08.length, uniq(k08).length, "08 ซ้ำ");
    eq(sorted(uniq(k14)), sorted(MESSAGES_UNIT_KEYS()), "14 ชั้น UNIT");
    ok(unitKeysOf("booking", "service").every((k) => keysIn(hS).includes(k)), "ค่าร้าน 11 ⊇ กลุ่ม service");
    ok(unitKeysOf("booking", "staff").every((k) => keysIn(hT).includes(k)), "ค่าร้าน 12 ⊇ กลุ่ม staff");
  });
  await t("M-10", "ล็อกตามสิทธิ์จริง: ช่าง (PROVIDER) ทุกแถวล็อก + เหตุผลไทย · ไม่มีปุ่มเลือก/คืนค่าแม่แบบ · ผู้แก้ทั่วไป (settings.edit) แก้ค่าทั่วไปได้แต่แถวเงินล็อก · data-locked ⇔ !editable", async () => {
    const mp = await L(PROV, { unitId: UA, page: "policy" });
    ok(mp, "ช่างเปิดหน้าไม่ได้ (ควรอ่านได้)");
    const hp = render("policy", mp);
    const rows = elems(hp, "data-setting-key");
    ok(rows.length > 20 && rows.every((r) => r.attrs["data-locked"] === "true" && isThai(textOf(r.html))), "แถวไม่ล็อก");
    eq([elems(hp, "data-template-pick").length, elems(hp, "data-bk-action", "reset-template").length, elems(hp, "data-template-confirm").length, mp.canApplyTemplate], [0, 0, 0, false], "ปุ่มแม่แบบ");
    const me = await L(SEDIT, { unitId: UA, page: "policy" });
    const he = render("policy", me);
    const fm = new Map<string, Any>(((me.form?.groups ?? []) as Any[]).flatMap((g) => g.fields).map((f: Any) => [f.key, f]));
    const p: string[] = [];
    for (const r of elems(he, "data-setting-key")) {
      const f = fm.get(r.attrs["data-setting-key"]);
      if (!f) continue;
      if ((r.attrs["data-locked"] === "true") !== !f.editable) p.push(`${f.key}: locked≠!editable`);
      if (f.sensitivity === "MONEY" && f.editable) p.push(`${f.key}: เงินแก้ได้`);
    }
    ok(fm.get("booking.late.graceMin")?.editable === true, "ค่าทั่วไปต้องแก้ได้");
    ok(p.length === 0, p.slice(0, 6).join(" · "));
  });

  // ═══════════════ N. จอง 14 ═══════════════
  console.log("\nN. จอง 14 (ข้อความ · ทีวี/ตู้ · สิทธิ์)");
  let mMsg: Any = null;
  let hMsg = "";
  await t("N-1", "โมเดล 14: msgKinds 10 ชนิดลำดับ MSG_KINDS · enabled ตาม booking.msg.enabled (BARBER: courseExpiry ปิด) · selectedKind ปริยาย confirmation · ?msg=nearTurn ⇒ preview ไม่มี { และใช้ข้อความที่ร้านแก้", async () => {
    needSeed();
    const m0 = await L(OWNER, { unitId: UA, page: "messages" });
    ok(m0, "ได้ null");
    eq((m0.msgKinds as Any[]).map((x) => x.kind), MSG_KINDS, "ลำดับ");
    eq((m0.msgKinds as Any[]).filter((x) => !x.enabled).map((x) => x.kind), ["courseExpiry"], "ปิดอยู่");
    eq(m0.selectedKind, "confirmation", "ปริยาย");
    mMsg = await L(OWNER, { unitId: UA, page: "messages", msgKind: "nearTurn" });
    eq(mMsg?.selectedKind, "nearTurn", "selectedKind");
    const pv = String(mMsg?.preview?.th ?? "");
    ok(pv.length > 10 && !pv.includes("{") && pv.includes("คิวถึงคุณ"), `preview ${pv}`);
    hMsg = render("messages", mMsg);
  });
  await t("N-2", "render 14: แถว data-msg-kind ×10 + switch aria-checked · ตัวแก้ nearTurn มีแถว booking.msg.nearTurn + ปุ่มตัวแปรครบ templateVars + ตัวอย่าง LINE = preview · เมนู messages aria-current", () => {
    ok(hMsg, "ไม่มี render");
    const box = one(hMsg, "data-bk-messages");
    const rows = elems(box.html, "data-msg-kind").filter((r) => !("data-bk-msg-editor" in r.attrs));
    eq(rows.map((r) => r.attrs["data-msg-kind"]), MSG_KINDS, "แถว");
    rows.forEach((r) => { const sw = elems(r.html, "role", "switch"); ok(sw.length === 1 && sw[0].attrs["aria-checked"] === String(r.attrs["data-msg-kind"] !== "courseExpiry"), `switch ${r.attrs["data-msg-kind"]}`); });
    const ed = one(hMsg, "data-bk-msg-editor");
    eq(ed.attrs["data-msg-kind"], "nearTurn", "ตัวแก้");
    ok(elems(ed.html, "data-setting-key", "booking.msg.nearTurn").length === 1, "แถว template");
    eq(sorted(elems(ed.html, "data-var").map((x) => x.attrs["data-var"])), sorted((getDef("booking.msg.nearTurn").templateVars as string[]).map((v) => `{${v}}`)), "ปุ่มตัวแปร");
    eq(textOf(one(ed.html, "data-bk-line-preview").html), textOf(String(mMsg.preview.th)), "ตัวอย่าง LINE");
    const nav = elems(one(hMsg, "data-bk-nav").html, "data-bk-nav-item").filter((x) => x.attrs["aria-current"] === "page" || elems(x.html, "aria-current", "page").length);
    eq(nav.map((x) => x.attrs["data-bk-nav-item"]), ["messages"], "aria-current");
  }, "MAJOR");
  await t("N-3", "ทีวี/ตู้ (id devices): การ์ด tv = booking.display.* ล็อก · kiosk = booking.kiosk.* ล็อก + walkInPickStaff แก้ได้ (เจ้าของ) · เหตุผลล็อกมีคำว่า \"เครื่อง\" · ค่าเป็นป้ายไทย", () => {
    const dv = one(hMsg, "data-bk-devices");
    ok(/id="devices"/.test(dv.html.slice(0, 300)) || elems(hMsg, "id", "devices").length === 1, "ไม่มี id=devices");
    const tv = one(dv.html, "data-bk-device-card", "tv");
    const ki = one(dv.html, "data-bk-device-card", "kiosk");
    const dvKeys = (g: string) => listDefs("booking").filter((d) => d.group === g && !d.hiddenUntil).map((d) => String(d.key));
    eq(sorted(keysIn(tv.html)), sorted(dvKeys("display")), "ทีวี");
    eq(sorted(keysIn(ki.html)), sorted([...dvKeys("kiosk"), "booking.queue.walkInPickStaff"]), "ตู้");
    const p: string[] = [];
    for (const r of [...elems(tv.html, "data-setting-key"), ...elems(ki.html, "data-setting-key")]) {
      const k = r.attrs["data-setting-key"];
      const locked = r.attrs["data-locked"] === "true";
      if (k === "booking.queue.walkInPickStaff") { if (locked) p.push(`${k} ล็อก`); continue; }
      if (!locked || !textOf(r.html).includes("เครื่อง")) p.push(`${k}: ไม่ล็อก/ไม่มีเหตุผล`);
      if (RAW_ENUM.test(textOf(r.html).split(" ").pop() ?? "")) p.push(`${k}: ค่าดิบ`);
    }
    ok(p.length === 0, p.join(" · "));
  }, "MAJOR");
  await t("N-4", "ตารางสิทธิ์ (id roles): หัว OWNER LEAD PROVIDER CASHIER (หัวผู้ให้บริการ = \"ช่าง\") · 10 แถว (ภาพ + รับมัดจำ) · เซลล์ = ชุด BARBER · เจ้าของติ๊กครบ", () => {
    const rl = one(hMsg, "data-bk-roles");
    ok(elems(hMsg, "id", "roles").length === 1, "ไม่มี id=roles");
    const heads = elems(rl.html, "data-role");
    eq(heads.map((x) => x.attrs["data-role"]), ["OWNER", "LEAD", "PROVIDER", "CASHIER"], "หัว");
    eq(heads.map((x) => textOf(x.html)), ["เจ้าของ", "หัวหน้าร้าน", "ช่าง", "แคชเชียร์"], "ป้ายหัว");
    const rows = elems(rl.html, "data-role-row");
    eq(rows.map((r) => r.attrs["data-role-row"]), ROLE_ROWS.map((r) => r.id), "แถว");
    rows.forEach((r, i) => ok(textOf(r.html).includes(ROLE_ROWS[i].labelTh), `ป้ายแถว ${ROLE_ROWS[i].id}`));
    const p: string[] = [];
    for (const r of ROLE_ROWS) for (const role of ["OWNER", "LEAD", "PROVIDER", "CASHIER"]) {
      const c = elems(rl.html, "data-role-cell", `${r.id}:${role}`);
      const want = role === "OWNER" || PRESET_ROWS[role].includes(r.id);
      if (c.length !== 1 || c[0].attrs["data-checked"] !== String(want)) p.push(`${r.id}:${role}`);
    }
    ok(p.length === 0, p.join(" · "));
  });
  await t("N-5", "ร้านนวด (SPA): หัวผู้ให้บริการ = \"หมอนวด\" · เซลล์เท่า BARBER (#65 เหมือนกัน) · เจ้าของเห็นฟอร์มใช้ชุดสิทธิ์ (applyTargets ไม่มีอีเมล) · ช่างไม่เห็น", async () => {
    const m = await L(OWNER, { unitId: UM, page: "messages" });
    const h = render("messages", m);
    eq(textOf(one(h, "data-role", "PROVIDER").html), "หมอนวด", "หัว");
    ok(Array.isArray(m.roles?.applyTargets) && m.roles.applyTargets.length > 0 && !JSON.stringify(m.roles.applyTargets).includes("@"), "applyTargets");
    ok(elems(h, "data-bk-role-apply").length === 1, "ฟอร์มใช้ชุดสิทธิ์");
    const mp = await L(PROV, { unitId: UM, page: "messages" });
    eq([mp?.roles?.applyTargets ?? null, elems(render("messages", mp), "data-bk-role-apply").length], [null, 0], "ช่าง");
  }, "MAJOR");
  await t("N-6", "ความเป็นส่วนตัว (data-bk-privacy): เจ้าของเห็น booking.privacy.walkInRetentionDays แก้ได้ \"180 วัน\" · ผู้จัดการเห็นแบบล็อก ไม่มีค่า (ซ่อนไว้)", async () => {
    const ho = one(hMsg, "data-bk-privacy");
    const ro = one(ho.html, "data-setting-key", "booking.privacy.walkInRetentionDays");
    ok(ro.attrs["data-locked"] !== "true" && textOf(ro.html).includes("180 วัน"), `เจ้าของ ${textOf(ro.html)}`);
    const hm = render("messages", await L(MGR, { unitId: UA, page: "messages" }));
    const rm = one(one(hm, "data-bk-privacy").html, "data-setting-key", "booking.privacy.walkInRetentionDays");
    ok(rm.attrs["data-locked"] === "true" && !textOf(rm.html).includes("180") && textOf(rm.html).includes("ซ่อนไว้"), `ผู้จัดการ ${textOf(rm.html)}`);
  }, "MAJOR");
  await t("N-7", "msgKind ไม่รู้จัก ⇒ null", async () => {
    eq(await L(OWNER, { unitId: UA, page: "messages", msgKind: "nope" }), null, "msgKind");
  }, "MAJOR");

  // ═══════════════ SV. จอง 11 ═══════════════
  console.log("\nSV. จอง 11 (บริการ)");
  let mSv: Any = null;
  let hSv = "";
  const AROMA = () => svcM["น้ำมันอโรมา"];
  await t("SV-1", "โมเดล 11 (ร้านนวด · ?service=ชื่อ \"น้ำมันอโรมา\"): rows 6 ตาม sortOrder · selectedId = อโรมา · canCount/staffTotal 5/6 · walkIn (VIP/หินร้อน ปิด) · bookable หินร้อน false", async () => {
    needSeed();
    mSv = await L(OWNER, { unitId: UM, page: "services", serviceId: "น้ำมันอโรมา" });
    ok(mSv, "ได้ null");
    // ORACLE-EDIT 29 ต.ค.: render ก่อน assert ที่ throw ได้ (SV-2..5 ไม่ล้มตามกัน)
    try { hSv = render("services", mSv); } catch { /* SV-2.. รายงานเอง */ }
    eq((mSv.rows as Any[]).map((r) => r.name), MS.map((x) => x.name), "rows");
    eq(mSv.selectedId, AROMA(), "selectedId");
    const ar = (mSv.rows as Any[]).find((r) => r.id === AROMA());
    eq([ar.durationMin, ar.bufferMin, ar.priceSatang, ar.depositSatang, ar.canCount, ar.staffTotal, ar.bookable, ar.walkIn], [90, 15, 90000, 0, 5, 6, true, true], "แถวอโรมา");
    eq((mSv.rows as Any[]).map((r) => r.walkIn), [true, true, true, true, false, false], "walkIn");
    eq((mSv.rows as Any[]).map((r) => r.bookable), [true, true, true, true, true, false], "bookable");
    // ORACLE-EDIT 29 ต.ค.: ค่าเดิม [6,5,6,5,5,4] ผิด — คิดใหม่ตามกติกา B.1 (มีแถว = เฉพาะแถว · ไม่มีแถว = ALL ตาม SPA) กับฉาก PC-2:
    //   นวดไทย: แดง✓ นก✓ จันทร์✓ ฝ้าย✗ เมย์✓ ศรี✓ = 5 · ประคบ: แดง✗ ฝ้าย✗ ศรี✓ +3 = 4 · เท้า: แดง✗ ฝ้าย✓ ศรี✗ +3 = 4
    //   อโรมา: แดง✓ ฝ้าย✓ ศรี✗ +3 = 5 · VIP: แดง✗ ฝ้าย✓ ศรี✗ +3 = 4 · หินร้อน: แดง✓ ฝ้าย✗ ศรี✗ +3 = 4
    eq((mSv.rows as Any[]).map((r) => r.canCount), [5, 4, 4, 5, 4, 4], "canCount");
    hSv = render("services", mSv);
  });
  await t("SV-2", "ตาราง: แถว data-service-id ×6 (อโรมา data-selected) · เซลล์ minutes \"90 · 15\" · price ฿900 · deposit — / ฿500 · staff 5/6 · online ✓/— · walkin ✓/—", () => {
    const tb = one(hSv, "data-bk-services-table");
    const rows = elems(tb.html, "data-service-id");
    eq(rows.length, 6, "แถว");
    eq(rows.filter((r) => r.attrs["data-selected"] === "true").map((r) => r.attrs["data-service-id"]), [AROMA()], "เลือก");
    const cell = (sid: string, col: string) => textOf(one(rows.find((r) => r.attrs["data-service-id"] === sid)!.html, "data-col", col).html);
    eq([cell(AROMA(), "name"), cell(AROMA(), "minutes"), cell(AROMA(), "price"), cell(AROMA(), "deposit"), cell(AROMA(), "staff"), cell(AROMA(), "online"), cell(AROMA(), "walkin")],
      ["น้ำมันอโรมา", "90 · 15", "฿900", "—", "5/6", "✓", "✓"], "อโรมา");
    eq([cell(svcM["คู่รัก VIP"], "deposit"), cell(svcM["คู่รัก VIP"], "walkin"), cell(svcM["หินร้อน"], "online")], ["฿500", "—", "—"], "VIP/หินร้อน");
    for (const r of rows) ok(elems(r.html, "data-col").map((c) => c.attrs["data-col"]).join(",") === "name,minutes,price,deposit,requires,staff,online,walkin", "คอลัมน์ 8 ตามแบบ");
  }, "MAJOR");
  await t("SV-3", "แผงบริการ: หัว \"น้ำมันอโรมา · ตั้งค่าการจอง\" · data-bk-col-field bufferMin/bookable/depositSatang · แถวชั้น SERVICE = chain SERVICE ไม่ซ่อน ยกเว้น cleanupMin/onlineBookable · ค่าคอมฯ อโรมา 15% ป้ายทับค่าร้าน", () => {
    const pn = one(hSv, "data-bk-service-panel");
    eq(pn.attrs["data-service-id"], AROMA(), "service-id");
    ok(textOf(pn.html).includes("น้ำมันอโรมา · ตั้งค่าการจอง"), "หัวแผง");
    eq(sorted(elems(pn.html, "data-bk-col-field").map((x) => x.attrs["data-bk-col-field"])), ["bookable", "bufferMin", "depositSatang"], "ช่องคอลัมน์");
    const want = chainKeys("booking", "SERVICE").filter((k) => k !== "booking.service.cleanupMin" && k !== "booking.service.onlineBookable");
    const got = keysIn(pn.html).filter((k) => !one(pn.html, "data-setting-key", k).html.includes("data-bk-who"));
    const d = setDiff(uniq(got), want);
    ok(!d.missing.length && !d.extra.length, `ขาด ${d.missing.join(",")} เกิน ${d.extra.join(",")}`);
    eq(mSv.serviceForm?.scope, "SERVICE", "serviceForm.scope");
    eq(mSv.serviceForm?.scopeId, AROMA(), "serviceForm.scopeId");
  });
  await t("SV-4", "ใครทำได้: 6 คน · ทำได้ 5 (พี่ศรี \"ไม่รับบริการนี้\") · พี่แดง ราคาเฉพาะ 100000 มี ฿ · น้องฝ้าย 100 นาที · คนไม่มีแถว \"ตามค่าบริการ\"", () => {
    const who = one(hSv, "data-bk-who");
    const rows = elems(who.html, "data-staff-id");
    eq(rows.map((r) => r.attrs["data-staff-id"]), MST.map((n) => stM[n]), "ลำดับ");
    const by = (n: string) => rows.find((r) => r.attrs["data-staff-id"] === stM[n])!;
    eq(MST.map((n) => by(n).attrs["data-can"]), ["true", "true", "true", "true", "true", "false"], "data-can");
    eq([by("พี่แดง").attrs["data-price-satang"], by("น้องฝ้าย").attrs["data-duration-min"], by("พี่นก").attrs["data-price-satang"]], ["100000", "100", ""], "ค่าเฉพาะ");
    ok(textOf(by("พี่ศรี").html).includes("ไม่รับบริการนี้"), "พี่ศรี");
    ok(textOf(by("พี่แดง").html).includes("฿"), "พี่แดง ฿");
    ok(textOf(by("น้องฝ้าย").html).includes("100 นาที"), "ฝ้าย นาที");
    ok(textOf(by("พี่นก").html).includes("ตามค่าบริการ"), "พี่นก");
    eq((mSv.who as Any[]).map((w) => [w.name, w.can, w.priceSatang, w.durationMin]), MST.map((n) => [n, n !== "พี่ศรี", n === "พี่แดง" ? 100000 : null, n === "น้องฝ้าย" ? 100 : null]), "model.who");
  });
  await t("SV-5", "กล่องค่าร้าน 11: data-bk-shop-defaults ⊇ ช่อง UNIT กลุ่ม service · เท่านั้น (+ commissionRate/deposit.amount)", () => {
    const keys = keysIn(one(hSv, "data-bk-shop-defaults").html);
    const base = unitKeysOf("booking", "service");
    ok(base.every((k) => keys.includes(k)), `ขาด ${base.filter((k) => !keys.includes(k))}`);
    const extra = keys.filter((k) => !base.includes(k) && k !== "booking.money.commissionRate" && k !== "booking.deposit.amount");
    eq(extra, [], "เกิน");
  }, "MAJOR");
  const SSV = (a: Actor, i: Any, ctx: Any = ctxA) => bk("setStaffService")(a, ctx, { unitId: UM, ...i });
  const ssRows = async (staffId: string) => (await db.bookingStaffService.findMany({ where: { staffId }, select: { serviceId: true, priceSatang: true, durationMin: true } }))
    .map((r: Any) => [r.serviceId, r.priceSatang, r.durationMin]).sort((a: Any, b: Any) => String(a[0]).localeCompare(String(b[0])));
  await t("SV-6", "setStaffService: พี่นก (ไม่มีแถว · ALL) can=false หินร้อน ⇒ แถวครบ 5 บริการที่เหลือ · ไม่มีหินร้อน · ใครทำได้ของบริการอื่นไม่เปลี่ยน", async () => {
    needSeed();
    const before = (await L(OWNER, { unitId: UM, page: "services" })).rows.map((r: Any) => [r.name, r.canCount]);
    const r = await SSV(OWNER, { staffId: stM["พี่นก"], serviceId: svcM["หินร้อน"], can: false, priceSatang: null, durationMin: null });
    ok(r?.ok, fmt(r));
    eq((await ssRows(stM["พี่นก"])).map((x: Any) => x[0]), sorted(MS.filter((x) => x.name !== "หินร้อน").map((x) => svcM[x.name])), "แถวพี่นก");
    const after = (await L(OWNER, { unitId: UM, page: "services" })).rows.map((r: Any) => [r.name, r.canCount]);
    eq(after, before.map(([n, c]: Any) => [n, n === "หินร้อน" ? c - 1 : c]), "canCount");
  });
  await t("SV-7", "setStaffService: ราคา/เวลาเฉพาะคน upsert · can=true ไม่มีค่าเฉพาะ ⇒ null/null · ลบแถวสุดท้าย ⇒ LAST_SERVICE ไม่เปลี่ยน · ค่าผิด (ติดลบ · เวลา 3 · can=false+ราคา) ⇒ BAD_INPUT", async () => {
    const nok = stM["พี่นก"];
    ok((await SSV(OWNER, { staffId: nok, serviceId: AROMA(), can: true, priceSatang: 95000, durationMin: 80 }))?.ok, "upsert");
    ok((await ssRows(nok)).some((x: Any) => x[0] === AROMA() && x[1] === 95000 && x[2] === 80), "ค่าเฉพาะ");
    ok((await SSV(OWNER, { staffId: nok, serviceId: AROMA(), can: true, priceSatang: null, durationMin: null }))?.ok, "ล้างค่าเฉพาะ");
    ok((await ssRows(nok)).some((x: Any) => x[0] === AROMA() && x[1] === null && x[2] === null), "null/null");
    const sri = stM["พี่ศรี"];
    ok((await SSV(OWNER, { staffId: sri, serviceId: svcM["นวดไทย+ประคบ"], can: false, priceSatang: null, durationMin: null }))?.ok, "เหลือแถวเดียว");
    const snap = await ssRows(sri);
    const last = await SSV(OWNER, { staffId: sri, serviceId: svcM["นวดไทย"], can: false, priceSatang: null, durationMin: null });
    ok(last?.ok === false && last.code === "LAST_SERVICE" && isThai(last.reason), `LAST_SERVICE ${fmt(last)}`);
    eq(await ssRows(sri), snap, "ไม่เปลี่ยน");
    for (const bad of [{ priceSatang: -1, durationMin: null, can: true }, { priceSatang: null, durationMin: 3, can: true }, { priceSatang: 100, durationMin: null, can: false }, { priceSatang: 1.5, durationMin: null, can: true }]) {
      const r = await SSV(OWNER, { staffId: nok, serviceId: svcM["นวดไทย"], ...bad });
      ok(r?.ok === false && r.code === "BAD_INPUT", `${fmt(bad)} ⇒ ${fmt(r)}`);
    }
  });
  await t("SV-8", "setStaffService สิทธิ์ + X1: ช่าง/แคชเชียร์ ⇒ PERMISSION · settings.edit+staff.create ตั้งราคา ⇒ PERMISSION แต่ผูก/เลิกผูกได้ · มี settings.money ⇒ ตั้งราคาได้ · staff/service สาขาอื่น/ร้านอื่น ⇒ NOT_FOUND ไม่เขียน", async () => {
    const may = stM["น้องเมย์"];
    for (const a of [PROV, CASH, NOPERM]) { const r = await SSV(a, { staffId: may, serviceId: AROMA(), can: true, priceSatang: null, durationMin: null }); ok(r?.ok === false && r.code === "PERMISSION", `${a.userId}: ${fmt(r)}`); }
    eq(await ssRows(may), [], "เมย์ยังไม่มีแถว");
    const rp = await SSV(SEDIT, { staffId: may, serviceId: AROMA(), can: true, priceSatang: 99000, durationMin: null });
    ok(rp?.ok === false && rp.code === "PERMISSION", `ราคาไม่มีสิทธิ์เงิน ${fmt(rp)}`);
    ok((await SSV(SEDIT, { staffId: may, serviceId: svcM["หินร้อน"], can: false, priceSatang: null, durationMin: null }))?.ok, "เลิกผูกไม่ใช่เงิน");
    ok((await SSV(SMONEY, { staffId: may, serviceId: AROMA(), can: true, priceSatang: 99000, durationMin: null }))?.ok, "มีสิทธิ์เงิน");
    const cnt = await db.bookingStaffService.count({ where: { tenantId: { in: [tA, tB] } } });
    for (const [a, ctx, i] of [
      [OWNER, ctxA, { unitId: UM, staffId: st2, serviceId: AROMA() }], [OWNER, ctxA, { unitId: UM, staffId: may, serviceId: svc2 }],
      [OWNER, ctxA, { unitId: UM, staffId: stB, serviceId: svcB }], [OWNER_B, ctxB, { unitId: UM, staffId: may, serviceId: AROMA() }],
      [MGR2, ctxA, { unitId: UM, staffId: may, serviceId: AROMA() }],
    ] as [Actor, Any, Any][]) {
      const r = await bk("setStaffService")(a, ctx, { ...i, can: true, priceSatang: null, durationMin: null });
      ok(r?.ok === false && (r.code === "NOT_FOUND" || (a === MGR2 && r.code === "PERMISSION")), `${fmt(i)} ⇒ ${fmt(r)}`);
    }
    eq(await db.bookingStaffService.count({ where: { tenantId: { in: [tA, tB] } } }), cnt, "ไม่มีแถวใหม่");
  });
  await t("SV-9", "setServiceBooking: เจ้าของแก้ bufferMin/bookable/depositSatang ⇒ คอลัมน์เปลี่ยน · มัดจำต้อง settings.money · ช่าง ⇒ PERMISSION · ค่าผิด ⇒ BAD_INPUT · บริการสาขาอื่น/ร้านอื่น ⇒ NOT_FOUND", async () => {
    const fn = (a: Actor, i: Any, ctx: Any = ctxA) => bk("setServiceBooking")(a, ctx, { unitId: UM, serviceId: svcM["นวดเท้า"], ...i });
    ok((await fn(OWNER, { bufferMin: 7, bookable: false, depositSatang: 10000 }))?.ok, "เจ้าของ");
    const row = async () => db.bookingService.findFirst({ where: { id: svcM["นวดเท้า"] }, select: { bufferMin: true, bookable: true, depositSatang: true } });
    eq(await row(), { bufferMin: 7, bookable: false, depositSatang: 10000 }, "คอลัมน์");
    const rd = await fn(SEDIT, { depositSatang: 0 });
    ok(rd?.ok === false && rd.code === "PERMISSION", `มัดจำไม่มีสิทธิ์เงิน ${fmt(rd)}`);
    ok((await fn(SEDIT, { bufferMin: 5, bookable: true }))?.ok, "service.update แก้ bufferMin");
    ok((await fn(PROV, { bufferMin: 9 }))?.code === "PERMISSION", "ช่าง");
    for (const bad of [{ bufferMin: -1 }, { bufferMin: 241 }, { depositSatang: -5 }, { bufferMin: 1.5 }]) ok((await fn(OWNER, bad))?.code === "BAD_INPUT", `${fmt(bad)}`);
    ok((await bk("setServiceBooking")(OWNER, ctxA, { unitId: UM, serviceId: svc2, bufferMin: 3 }))?.code === "NOT_FOUND", "สาขาอื่น");
    ok((await bk("setServiceBooking")(OWNER_B, ctxB, { unitId: UB, serviceId: svcM["นวดเท้า"], bufferMin: 3 }))?.code === "NOT_FOUND", "ร้านอื่น");
    eq(await row(), { bufferMin: 5, bookable: true, depositSatang: 10000 }, "คอลัมน์สุดท้าย");
  });

  // ═══════════════ W. จอง 12 ═══════════════
  console.log("\nW. จอง 12 (คน)");
  let mSt: Any = null;
  let hSt = "";
  await t("W-1", "โมเดล 12 (?staff=\"พี่นก\"): rows 6 · hoursSource แดง HR_SHIFT / ฝ้าย STAFF_WEEKLY / นก UNIT_HOURS · onlinePct 70/70/60/40/70/70 · commission แดง 1200 · linked เฉพาะแดง · selectedId นก", async () => {
    needSeed();
    mSt = await L(OWNER, { unitId: UM, page: "staff", staffId: "พี่นก" });
    ok(mSt, "ได้ null");
    eq((mSt.rows as Any[]).map((r) => r.name), MST, "rows");
    const by = (n: string) => (mSt.rows as Any[]).find((r) => r.name === n);
    eq([by("พี่แดง").hoursSource, by("น้องฝ้าย").hoursSource, by("พี่นก").hoursSource], ["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"], "hoursSource");
    eq(MST.map((n) => by(n).onlinePct), [70, 70, 60, 40, 70, 70], "onlinePct");
    eq([by("พี่แดง").commissionBp, by("พี่นก").commissionBp], [1200, 1000], "commissionBp");
    eq(MST.map((n) => by(n).linked), MST.map((n) => n === "พี่แดง"), "linked");
    eq(mSt.selectedId, stM["พี่นก"], "selectedId");
    eq([mSt.staffForm?.scope, mSt.staffForm?.scopeId], ["STAFF", stM["พี่นก"]], "staffForm");
    hSt = render("staff", mSt);
  });
  await t("W-2", "render 12: ตาราง data-staff-id ×6 + data-hours-source · online \"70%\" · เตือนไม่ผูก 5 คน (\"ค่าคอม\") · แผงนก หัว \"พี่นก · ตั้งค่าการรับงาน\" · แถว STAFF = chain STAFF ไม่ซ่อนพอดี", () => {
    const tb = one(hSt, "data-bk-staff-table");
    const rows = elems(tb.html, "data-staff-id");
    eq(rows.map((r) => r.attrs["data-staff-id"]), MST.map((n) => stM[n]), "แถว");
    eq(rows.map((r) => r.attrs["data-hours-source"]), (mSt.rows as Any[]).map((r) => r.hoursSource), "hours-source");
    eq(textOf(one(rows[0].html, "data-col", "online").html), "70%", "online");
    const warns = rows.filter((r) => elems(r.html, "data-bk-warn", "no-user").length === 1);
    eq(warns.length, 5, "เตือนไม่ผูก");
    ok(warns.every((r) => textOf(one(r.html, "data-bk-warn", "no-user").html).includes("ค่าคอม")), "ข้อความเตือน");
    const pn = one(hSt, "data-bk-staff-panel");
    eq(pn.attrs["data-staff-id"], stM["พี่นก"], "แผง");
    ok(textOf(pn.html).includes("พี่นก · ตั้งค่าการรับงาน"), "หัวแผง");
    eq(sorted(uniq(keysIn(pn.html))), sorted(chainKeys("booking", "STAFF")), "แถว STAFF");
  });
  await t("W-3", "แถบสัปดาห์: นก (เวลาร้าน 10–21) ทุกวันมี \"10\" และ \"21\" · ฝ้าย (ตารางตัวเอง) พุธ = \"หยุด\" · อื่น 13–22", async () => {
    const wk = one(hSt, "data-bk-week");
    const chips = elems(wk.html, "data-weekday");
    eq(chips.map((c) => c.attrs["data-weekday"]), ["0", "1", "2", "3", "4", "5", "6"], "ชิป");
    ok(chips.every((c) => /10/.test(textOf(c.html)) && /21/.test(textOf(c.html))), "เวลาร้าน");
    const mf = await L(OWNER, { unitId: UM, page: "staff", staffId: stM["น้องฝ้าย"] });
    eq((mf.week as Any[]).map((w) => [w.weekday, w.startMin, w.endMin]), [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 3 ? [d, null, null] : [d, 780, 1320])), "model.week");
    const cf = elems(one(render("staff", mf), "data-bk-week").html, "data-weekday");
    ok(textOf(cf[3].html).includes("หยุด") && /13/.test(textOf(cf[1].html)) && /22/.test(textOf(cf[1].html)), "ฝ้าย");
  }, "MAJOR");
  await t("W-4", "กล่องค่าร้าน 12 ⊇ ช่อง UNIT กลุ่ม staff (+ onlineSharePct เท่านั้น)", () => {
    const keys = keysIn(one(hSt, "data-bk-shop-defaults").html);
    const base = unitKeysOf("booking", "staff");
    ok(base.every((k) => keys.includes(k)), `ขาด ${base.filter((k) => !keys.includes(k))}`);
    eq(keys.filter((k) => !base.includes(k) && k !== "booking.booking.onlineSharePct"), [], "เกิน");
  }, "MAJOR");

  // ═══════════════ E. ด่านสิทธิ์จริงด้วยชุดบทบาท ═══════════════
  console.log("\nE. ด่านสิทธิ์ในเครื่องยนต์ด้วยชุดบทบาท · ใช้ชุดสิทธิ์กับพนักงาน");
  await t("E-1", "ช่าง/แคชเชียร์/หัวหน้าร้าน (ชุดตามแม่แบบ) แก้ค่าเงิน (ค่าคอมฯ · ริบมัดจำ · ยอดมัดจำ) ⇒ PERMISSION · ค่าทั่วไปก็ไม่ได้ · ผู้ถือ settings.edit แก้ทั่วไปได้ เงินไม่ได้ · ถือ money ด้วย ⇒ ได้ (positive)", async () => {
    const money = [
      { key: "booking.money.commissionRate", scope: "UNIT", scopeId: UA, value: { serviceBp: 700, productBp: 0 } },
      { key: "booking.deposit.forfeitPct", scope: "UNIT", scopeId: UA, value: 50 },
    ];
    const general = { key: "booking.late.graceMin", scope: "UNIT", scopeId: UA, value: 12 };
    for (const a of [PROV, CASH, LEAD]) {
      for (const c of [...money, general]) { const r = await setS(a, [c]); ok(r?.ok === false && r.code === "PERMISSION", `${a.userId} ${c.key}: ${fmt(r)}`); }
    }
    for (const c of money) { const r = await setS(SEDIT, [c]); ok(r?.ok === false && r.code === "PERMISSION", `SEDIT ${c.key}: ${fmt(r)}`); }
    ok((await setS(SEDIT, [general]))?.ok, "SEDIT ทั่วไป");
    ok((await setS(SMONEY, [money[1]]))?.ok, "SMONEY เงิน");
    for (const c of [general, money[1]]) ok((await fnOf(s, "resetSetting")(OWNER, ctxA, { key: c.key, scope: c.scope, scopeId: c.scopeId }))?.ok, `คืน ${c.key}`);
  });
  await t("E-2", "applyBookingRolePreset: เจ้าของใช้ชุด PROVIDER (ร้านนวด SPA) กับพนักงาน ⇒ permissions ตรงชุด (settings.edit เดิมถูกปลด) · role/unitAccess ไม่เปลี่ยน · evaluate ตามจริง", async () => {
    const r = await bk("applyBookingRolePreset")(OWNER, ctxA, { unitId: UM, membershipId: TARGET.membershipId, role: "PROVIDER" });
    ok(r?.ok, fmt(r));
    const mb = await db.membership.findFirst({ where: { id: TARGET.membershipId } });
    eq([mb.role, mb.unitAccess], ["STAFF", both], "role/unitAccess");
    const ev = (k: string) => RBAC.mod.evaluate({ role: mb.role, unitAccess: mb.unitAccess, permissions: mb.permissions }, { module: "booking", action: k, unitId: UM });
    const p = ROLE_ROWS.flatMap((x) => x.keys).filter((k) => ev(k) !== presetPerms("PROVIDER")[k]);
    ok(p.length === 0, `ไม่ตรงชุด: ${p.join(",")}`);
  });
  await t("E-3", "applyBookingRolePreset ปฏิเสธ: พนักงาน (ไม่มีสิทธิ์จัดการคน) ⇒ ไม่ ok · membership ร้านอื่น ⇒ ไม่ ok · role แปลก ⇒ ไม่ ok · ไม่มีอะไรเปลี่ยน", async () => {
    const snap = await db.membership.findFirst({ where: { id: TARGET.membershipId }, select: { permissions: true } });
    const fn = bk("applyBookingRolePreset");
    for (const [a, ctx, i] of [
      [PROV, ctxA, { unitId: UM, membershipId: TARGET.membershipId, role: "LEAD" }],
      [OWNER, ctxA, { unitId: UM, membershipId: OWNER_B.membershipId, role: "CASHIER" }],
      [OWNER_B, ctxB, { unitId: UM, membershipId: TARGET.membershipId, role: "CASHIER" }],
      [OWNER, ctxA, { unitId: UM, membershipId: TARGET.membershipId, role: "OWNER" }],
    ] as [Actor, Any, Any][]) {
      const r = await fn(a, ctx, i);
      ok(r?.ok === false && isThai(r.reason ?? r.issues?.[0]?.messageTh ?? ""), `${fmt(i)} ⇒ ${fmt(r)}`);
    }
    eq(await db.membership.findFirst({ where: { id: TARGET.membershipId }, select: { permissions: true } }), snap, "ไม่เปลี่ยน");
  });

  // ═══════════════ RT. บันทึก/คืนค่าได้ทุกช่อง ═══════════════
  console.log("\nRT. ทุกค่าบน 08/11/12/14 บันทึก/คืนค่าได้ (scope ของโมเดลหน้า)");
  const altValue = (def: Any, v: Any): { ok: boolean; value?: Any } => {
    const cands: Any[] = [];
    if (def.type === "bool") cands.push(!v);
    else if (typeof v === "number") cands.push(v + 1, v - 1, v + 5, v * 2, 15);
    else if (def.type === "enum") cands.push(...(enumOptions(def.schema) ?? []).filter((o) => o !== v), null);
    else if (def.type === "template" && v && typeof v === "object") cands.push({ ...v, th: `${String(v.th)} ค่ะ` });
    else if (typeof v === "string") cands.push(`${v}ก`, "ทดสอบ");
    else if (Array.isArray(v)) cands.push([...v].reverse(), v.slice(0, Math.max(1, v.length - 1)), [...v, 30]);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "number") cands.push({ ...v, [k]: x + 1 }, { ...v, [k]: Math.max(0, x - 1) });
        if (typeof x === "boolean") cands.push({ ...v, [k]: !x });
        if (x === null) cands.push({ ...v, [k]: 30 });
      }
    } else if (v === null) cands.push(1, 30, "ทดสอบ", true);
    for (const c of cands) if (!isDeepStrictEqual(c, v) && def.schema.safeParse(c).success) return { ok: true, value: c };
    return { ok: false };
  };
  await t("RT-1", "ทุกช่องที่แก้ได้ (เจ้าของ) ใน 08 · 14 · แผงบริการ 11 · แผงช่าง 12 · ค่าร้าน 11/12: บันทึกค่าใหม่ ⇒ โมเดลหน้าเห็นค่า (hasOwn) · คืนค่า ⇒ กลับค่าเดิม · ≥ 90% ของช่องทำได้ (ที่เหลือ = ค่าตั้งข้ามกลุ่มปฏิเสธเป็นไทย)", async () => {
    needSeed();
    const pages: { q: Any; forms: string[] }[] = [
      { q: { unitId: UA, page: "policy" }, forms: ["form"] },
      { q: { unitId: UA, page: "messages" }, forms: ["form", "tenantForm"] },
      { q: { unitId: UM, page: "services", serviceId: AROMA() }, forms: ["serviceForm", "shopForm"] },
      { q: { unitId: UM, page: "staff", staffId: stM["พี่จันทร์"] }, forms: ["staffForm", "shopForm"] },
    ];
    let tried = 0, done = 0;
    const p: string[] = [];
    for (const pg of pages) {
      for (const fk of pg.forms) {
        const m0 = await L(OWNER, pg.q);
        const form = m0?.[fk];
        if (!form) { p.push(`${pg.q.page}.${fk}: ไม่มีฟอร์ม`); continue; }
        for (const f of (form.groups as Any[]).flatMap((g) => g.fields)) {
          if (!f.editable || f.masked) continue;
          const def = getDef(f.key);
          const alt = altValue(def, f.value);
          if (!alt.ok) continue;
          tried++;
          const r = await setS(OWNER, [{ key: f.key, scope: form.scope, scopeId: form.scopeId, value: alt.value }]);
          if (!r?.ok) { if (!(r?.code === "VALIDATION" && (r.issues ?? []).every((x: Any) => isThai(x.messageTh)))) p.push(`${f.key}@${form.scope}: ${fmt(r)}`); continue; }
          const m1 = await L(OWNER, pg.q);
          const f1 = (m1?.[fk]?.groups as Any[]).flatMap((g) => g.fields).find((x: Any) => x.key === f.key);
          if (!f1?.hasOwn || !isDeepStrictEqual(f1.value, alt.value)) p.push(`${f.key}@${form.scope}: หลังบันทึก ${fmt(f1?.value)}`);
          const rr = await fnOf(s, "resetSetting")(OWNER, ctxA, { key: f.key, scope: form.scope, scopeId: form.scopeId });
          if (!rr?.ok && !f.hasOwn) p.push(`${f.key}: คืนค่าไม่ได้ ${fmt(rr)}`);
          if (f.hasOwn) await setS(OWNER, [{ key: f.key, scope: form.scope, scopeId: form.scopeId, value: f.value }]);
          const m2 = await L(OWNER, pg.q);
          const f2 = (m2?.[fk]?.groups as Any[]).flatMap((g) => g.fields).find((x: Any) => x.key === f.key);
          if (!isDeepStrictEqual(f2?.value, f.value)) p.push(`${f.key}@${form.scope}: คืนแล้ว ${fmt(f2?.value)} ≠ ${fmt(f.value)}`);
          else done++;
        }
      }
    }
    ok(tried >= 60, `ลองได้แค่ ${tried} ช่อง`);
    ok(p.length === 0 && done >= Math.ceil(tried * 0.9), `สำเร็จ ${done}/${tried} · ${p.slice(0, 5).join(" · ")}`);
  });

  // ═══════════════ X. ขอบเขต ═══════════════
  console.log("\nX. ข้ามร้าน · ข้ามสาขา · ชนิดหน่วย");
  await t("X-1", "loadBookingSettingsPage ⇒ null: ร้าน B ขอสาขาร้าน A · ร้าน A ขอสาขาร้าน B · หน่วย DORM · ผู้จัดการสาขาอื่น · ทั้ง 4 หน้า · ไม่ throw", async () => {
    const p: string[] = [];
    for (const page of ["policy", "messages", "services", "staff"]) {
      for (const [tag, a, q, ctx] of [
        ["B→A", OWNER_B, { unitId: UA, page }, ctxB], ["A→B", OWNER, { unitId: UB, page }, ctxA],
        ["DORM", OWNER, { unitId: UD, page }, ctxA], ["MGR2", MGR2, { unitId: UA, page }, ctxA],
      ] as [string, Actor, Any, Any][]) {
        try { const m = await L(a, q, ctx); if (m !== null) p.push(`${page} ${tag}`); } catch (e) { p.push(`${page} ${tag} throw ${errMsg(e)}`); }
      }
    }
    ok(p.length === 0, p.join(" · "));
  });
  await t("X-2", "เลือกรายการข้ามขอบเขต ⇒ null: ?service= ของสาขาอื่น/ร้านอื่น/ชื่อไม่มี · ?staff= ของสาขาอื่น/ร้านอื่น (ไม่ถอยไปแถวแรก)", async () => {
    const p: string[] = [];
    for (const sid of [svc2, svcB, "ไม่มีบริการนี้"]) if ((await L(OWNER, { unitId: UM, page: "services", serviceId: sid })) !== null) p.push(`service ${sid}`);
    for (const sid of [st2, stB]) if ((await L(OWNER, { unitId: UM, page: "staff", staffId: sid })) !== null) p.push(`staff ${sid}`);
    ok(p.length === 0, p.join(" · "));
  });
  await t("X-3", "ช่องค่าตั้งในโมเดลไม่มี id ของร้านอื่น · โมเดลร้าน A ไม่มีชื่อบริการ/ช่างของร้าน B", async () => {
    const all = JSON.stringify([await L(OWNER, { unitId: UM, page: "services" }), await L(OWNER, { unitId: UM, page: "staff" }), await L(OWNER, { unitId: UA, page: "messages" })]);
    for (const x of [tB, UB, stB, svcB, "บริการร้าน B", "ช่างร้าน B"]) ok(!all.includes(x), `หลุด ${x}`);
  }, "MAJOR");

  // ═══════════════ PR. ลบข้อมูลส่วนตัว ═══════════════
  console.log("\nPR. งานลบข้อมูล walk-in + Customer/Party ค้าง");
  const NOW = new Date();
  const OLD = new Date(NOW.getTime() - 200 * DAY);
  const RECENT = new Date(NOW.getTime() - 10 * DAY);
  const UP = await mkUnit(tA, "BOOKING", "สาขาข้อมูลส่วนตัว B11");
  const UPN = await mkUnit(tA, "BOOKING", "สาขาไม่มีแม่แบบ B11");
  const UBP = await mkUnit(tB, "BOOKING", "สาขาข้อมูลส่วนตัวร้าน B");
  const PRV: Record<string, string> = {};
  let prReady = false;
  await t("PR-0", "ฉาก: สาขา BARBER (เก็บ 180 วัน) + สาขาไม่มีแม่แบบ (ไม่ลบ) + ร้าน B · นัด/บัตรคิว/ลูกค้า/Party เก่า-ใหม่ตามเงื่อนไข", async () => {
    const ap = fnOf(s, "applyTemplate");
    ok((await ap(OWNER, ctxA, { unitId: UP, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" }))?.ok, "BARBER UP");
    ok((await ap(OWNER_B, ctxB, { unitId: UBP, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" }))?.ok, "BARBER UBP");
    const r = await fnOf(s, "resolveSetting")(ctxA, "booking.privacy.walkInRetentionDays", { unitId: UP });
    eq(r?.value, 180, "N สาขา BARBER");
    eq((await fnOf(s, "resolveSetting")(ctxA, "booking.privacy.walkInRetentionDays", { unitId: UPN }))?.value, null, "N สาขาไม่มีแม่แบบ");
    const sysOf = async (tenantId: string, unitIds: string[]) => {
      const sys = await db.appSystem.create({ data: { tenantId, type: "MEMBER", name: `สมาชิก B11 ${uid()}` } });
      for (const u of unitIds) await db.appSystemUnit.create({ data: { tenantId, systemId: sys.id, unitId: u, type: "MEMBER" } });
      return sys.id as string;
    };
    const MSA = await sysOf(tA, [UP]);
    const MSN = await sysOf(tA, [UPN]);
    const MSB = await sysOf(tB, [UBP]);
    const stP = await mkStaff(tA, UP, "ช่าง P", 1);
    const svP = await mkSvc(tA, UP, { name: "ตัด P", durationMin: 30, priceSatang: 10000, sortOrder: 1 });
    const stPN = await mkStaff(tA, UPN, "ช่าง PN", 1);
    const svPN = await mkSvc(tA, UPN, { name: "ตัด PN", durationMin: 30, priceSatang: 10000, sortOrder: 1 });
    const stPB = await mkStaff(tB, UBP, "ช่าง PB", 1);
    const svPB = await mkSvc(tB, UBP, { name: "ตัด PB", durationMin: 30, priceSatang: 10000, sortOrder: 1 });
    const party = async (tenantId: string, name: string, createdAt: Date) => (await db.party.create({ data: { tenantId, name, createdAt } })).id as string;
    let ph = 100;
    const cust = async (tag: string, tenantId: string, memberSystemId: string, x: Any = {}) => {
      ph++;
      PRV[tag] = (await db.customer.create({ data: { tenantId, memberSystemId, memberCode: `B11${RUN}${ph}`, phone: `08123${String(ph).padStart(5, "0")}`, name: `ลูกค้า ${tag}`, createdAt: OLD, source: "BOOKING", ...x } })).id;
      return PRV[tag];
    };
    PRV.pW = await party(tA, "วอล์กอินมีปาร์ตี้", OLD);
    PRV.pc1 = await party(tA, "ลูกค้าค้าง c1", OLD);
    PRV.pShared = await party(tA, "ปาร์ตี้ใช้ร่วม", OLD);
    await cust("c1", tA, MSA, { partyId: PRV.pc1 });
    await cust("c2", tA, MSA, { createdAt: RECENT });
    await cust("c3", tA, MSA);
    await cust("c4", tA, MSA);
    await db.memberConsent.create({ data: { tenantId: tA, customerId: PRV.c4, channel: "LINE", granted: true, source: "STAFF" } });
    await cust("c5", tA, MSA, { source: "IMPORT" });
    await cust("c14", tA, MSA, { source: "LIFF" }); // สมัครเอง ⇒ ไม่ลบแม้ไม่มีอะไรอ้าง
    await cust("c6", tA, MSA);
    await db.memberActivity.create({ data: { tenantId: tA, customerId: PRV.c6, module: "booking", type: "VISIT", summary: "มาใช้บริการ" } });
    await cust("c7", tA, MSA, { partyId: PRV.pShared });
    await cust("c9", tA, MSA);
    await cust("c10", tA, MSA, { referredById: PRV.c9, visitCount: 1 });
    await cust("c11", tA, MSN);
    await cust("c12", tA, MSA, { source: null }); // มติผู้คุม (4): source ว่าง = ไม่ลบเด็ดขาด (positive control: ไม่มีอะไรอ้าง · เก่า · แต่ต้องอยู่)
    await cust("c13", tA, MSA, { source: "WALK_IN" }); // ค้าง · WALK_IN ⇒ ลบ
    await cust("cB", tB, MSB);
    const appt = async (tag: string, tenantId: string, unitId: string, staffId: string, serviceId: string, x: Any) => {
      const start = x.startAt as Date;
      PRV[tag] = (await db.appointment.create({ data: { tenantId, unitId, staffId, serviceId, startAt: start, endAt: new Date(start.getTime() + 30 * 60_000), status: "DONE",
        customerName: `ชื่อ ${tag}`, customerPhone: "0899990001", note: `โน้ต ${tag}`, kind: "WALKIN", ...x } })).id;
    };
    await appt("a1", tA, UP, stP, svP, { startAt: OLD });
    await appt("a2", tA, UP, stP, svP, { startAt: RECENT });
    await appt("a3", tA, UP, stP, svP, { startAt: new Date(OLD.getTime() + 3600_000), kind: "BOOKED", partyId: PRV.pShared });
    await appt("a4", tA, UP, stP, svP, { startAt: new Date(OLD.getTime() + 7200_000), customerId: PRV.c3 });
    await appt("a5", tA, UPN, stPN, svPN, { startAt: OLD });
    await appt("a6", tA, UP, stP, svP, { startAt: new Date(OLD.getTime() + 3 * 3600_000), partyId: PRV.pW });
    await appt("aB", tB, UBP, stPB, svPB, { startAt: OLD });
    const qt = await db.queueType.create({ data: { tenantId: tA, unitId: UP, code: "GENERAL", name: "ทั่วไป", prefix: "A" } });
    const tk = async (tag: string, x: Any, seq: number) => {
      PRV[tag] = (await db.queueTicket.create({ data: { tenantId: tA, unitId: UP, typeId: qt.id, businessDate: "2026-01-01", seq, number: `A${seq}`, priority: 0, channel: "KIOSK",
        contactName: `บัตร ${tag}`, contactPhone: "+66899990002", contactEmail: "b11@qc.invalid", ...x } })).id;
    };
    await tk("t1", { createdAt: OLD }, 1);
    await tk("t2", { createdAt: OLD, memberId: PRV.c3 }, 2);
    await tk("t3", { createdAt: RECENT }, 3);
    prReady = true;
  });
  const PURGE = () => bk("purgeBookingPersonalData");
  let first: Any = null;
  await t("PR-1", "รอบแรก (tenantIds=[ร้าน A]): appointments 2 (a1 a6) · tickets 1 (t1) · customers 3 (c1 c7 c13) · parties 2 (pW pc1)", async () => {
    ok(prReady, "ฉาก PR-0 ไม่ผ่าน");
    first = await PURGE()(NOW, { tenantIds: [tA] });
    eq(first, { appointments: 2, tickets: 1, customers: 3, parties: 2 }, "ผล");
  });
  await t("PR-2", "นัด/บัตรที่ถูกตัด: ชื่อ \"ลูกค้า walk-in\" · เบอร์ \"\" · note/partyId null · บัตร contact null — แถวยังอยู่", async () => {
    ok(first, "ไม่มีรอบแรก");
    for (const k of ["a1", "a6"]) eq(await db.appointment.findFirst({ where: { id: PRV[k] }, select: { customerName: true, customerPhone: true, note: true, partyId: true } }),
      { customerName: "ลูกค้า walk-in", customerPhone: "", note: null, partyId: null }, k);
    eq(await db.queueTicket.findFirst({ where: { id: PRV.t1 }, select: { contactName: true, contactPhone: true, contactEmail: true, partyId: true } }),
      { contactName: null, contactPhone: null, contactEmail: null, partyId: null }, "t1");
  });
  await t("PR-3", "ไม่ถูกแตะ: walk-in ใหม่ (a2) · นัดจอง (a3) · walk-in สมาชิก (a4) · สาขาไม่มีแม่แบบ (a5) · บัตรสมาชิก (t2) · บัตรใหม่ (t3)", async () => {
    ok(first, "ไม่มีรอบแรก");
    for (const k of ["a2", "a3", "a4", "a5"]) eq((await db.appointment.findFirst({ where: { id: PRV[k] }, select: { customerName: true } }))?.customerName, `ชื่อ ${k}`, k);
    for (const k of ["t2", "t3"]) eq((await db.queueTicket.findFirst({ where: { id: PRV[k] }, select: { contactName: true } }))?.contactName, `บัตร ${k}`, k);
  });
  await t("PR-4", "Customer: ลบ c1 c7 (BOOKING) c13 (WALK_IN) · คง c12 (source ว่าง) c14 (LIFF) c2 (ใหม่) c3 (มีนัด) c4 (ยินยอม) c5 (IMPORT) c6 (กิจกรรม) c9 (ถูกอ้าง referredBy) c10 c11 (สาขาไม่ลบ) · Party: ลบ pW pc1 · คง pShared (นัด a3 อ้าง)", async () => {
    ok(first, "ไม่มีรอบแรก");
    const ex = async (k: string) => (await db.customer.count({ where: { id: PRV[k] } })) === 1;
    eq(await Promise.all(["c1", "c7", "c13"].map(ex)), [false, false, false], "ลบ (BOOKING/WALK_IN ค้าง)");
    eq(await Promise.all(["c2", "c3", "c4", "c5", "c6", "c9", "c10", "c11", "c14"].map(ex)), Array(9).fill(true), "คง");
    ok(await ex("c12"), "c12 source ว่าง ไม่มีอะไรอ้าง เก่า — ต้องไม่ถูกลบ (positive control มติผู้คุม)");
    const px = async (k: string) => (await db.party.count({ where: { id: PRV[k] } })) === 1;
    eq([await px("pW"), await px("pc1"), await px("pShared")], [false, false, true], "Party");
  });
  await t("PR-5", "ร้าน B ไม่ถูกแตะ (tenantIds จำกัด) · รันซ้ำ = 0 ทุกตัว", async () => {
    ok(first, "ไม่มีรอบแรก");
    eq((await db.appointment.findFirst({ where: { id: PRV.aB }, select: { customerName: true } }))?.customerName, "ชื่อ aB", "aB");
    eq(await db.customer.count({ where: { id: PRV.cB } }), 1, "cB");
    eq(await PURGE()(NOW, { tenantIds: [tA] }), { appointments: 0, tickets: 0, customers: 0, parties: 0 }, "รอบสอง");
  });
  await t("PR-6", "X5: เพิ่ม walk-in เก่า 3 + ลูกค้าค้าง 2 แล้วรัน 2 รอบพร้อมกัน ⇒ ไม่ throw · ผลรวม appointments 3 · customers 2", async () => {
    ok(first, "ไม่มีรอบแรก");
    const a1 = await db.appointment.findFirst({ where: { id: PRV.a1 } });
    for (let i = 0; i < 3; i++) await db.appointment.create({ data: { tenantId: tA, unitId: UP, staffId: a1.staffId, serviceId: a1.serviceId, startAt: new Date(OLD.getTime() + (10 + i) * 3600_000),
      endAt: new Date(OLD.getTime() + (10 + i) * 3600_000 + 1800_000), status: "DONE", customerName: `ซ้อน ${i}`, customerPhone: "0899990003", kind: "WALKIN" } });
    const sysId = (await db.customer.findFirst({ where: { id: PRV.c2 } })).memberSystemId;
    for (let i = 0; i < 2; i++) await db.customer.create({ data: { tenantId: tA, memberSystemId: sysId, memberCode: `B11X${RUN}${i}`, phone: `08777${RUN.slice(-3)}${i}`, createdAt: OLD, source: "WALK_IN" } });
    const rs = await Promise.allSettled([PURGE()(NOW, { tenantIds: [tA] }), PURGE()(NOW, { tenantIds: [tA] })]);
    ok(rs.every((r) => r.status === "fulfilled"), `throw: ${rs.filter((r) => r.status === "rejected").map((r: Any) => errMsg(r.reason)).join(" | ")}`);
    const v = rs.map((r: Any) => r.value);
    eq([v[0].appointments + v[1].appointments, v[0].customers + v[1].customers], [3, 2], "ผลรวม");
  });
  await t("PR-7", "X8: AuditLog booking.privacy.purged ของร้าน A มีจำนวน · ไม่มีชื่อ/เบอร์ในแถว · outbox/audit ไม่มีเบอร์ทดสอบ", async () => {
    ok(first, "ไม่มีรอบแรก");
    const rows = await db.auditLog.findMany({ where: { tenantId: tA, action: "booking.privacy.purged" } });
    ok(rows.length >= 1, "ไม่มี audit");
    const js = JSON.stringify(rows);
    for (const x of ["0899990001", "899990002", "ชื่อ a1", "ลูกค้า c1", "บัตร t1"]) ok(!js.includes(x), `audit มี ${x}`);
    ok(/appointments|customers/.test(js), "audit ไม่มีจำนวน");
  }, "MAJOR");

  // ═══════════════ Q. ฉาก svcqc ═══════════════
  console.log("\nQ. ฉาก svcqc (สคริปต์ฉากของ builder)");
  {
    const SQC = SQ.SQC;
    const bu = await db.businessUnit.findFirst({ where: { id: SQC.units.barber.id, tenantId: SQC.tenant.id } }).catch(() => null);
    const mu = await db.businessUnit.findFirst({ where: { id: SQC.units.massage.id, tenantId: SQC.tenant.id } }).catch(() => null);
    const runTsx = (args: string[] = []) => {
      const r = spawnSync("pnpm", ["exec", "tsx", F.scene, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = /SCENE_SUMMARY (\{.*\})/.exec(out);
      let sum: Any = null;
      try { sum = m ? JSON.parse(m[1]) : null; } catch { /* อ่านไม่ได้ */ }
      return { status: r.status, out, sum };
    };
    if (!bu || !mu) {
      for (const [id, n] of [["Q-1", "ฉากรันได้"], ["Q-2", "โมเดลหน้าบนฉาก"], ["Q-3", "รันซ้ำไม่เขียน"]]) skip(id, n, "ร้าน svcqc ยังไม่ seed — รัน scripts/seed-svc-qc.mts ก่อน");
    } else {
      await t("Q-1", "ฉากรันได้ (exit 0) · SCENE_SUMMARY {created,updated,removed}", () => {
        ok(has(F.scene), `ยังไม่มี ${F.scene}`);
        const r = runTsx();
        ok(r.status === 0 && r.sum && ["created", "updated", "removed"].every((k) => typeof r.sum[k] === "number"), `exit=${r.status} ${r.sum ? fmt(r.sum) : r.out.split("\n").slice(-4).join(" | ").slice(0, 240)}`);
      }, "MAJOR");
      await t("Q-2", "โมเดลบนฉาก svcqc: บาร์เบอร์ diffCount 6 + ปรับรายคน 3 · ร้านนวด อโรมา 5/6 · พี่นก online 70", async () => {
        const ou = (SQC.users as Any[]).find((u) => u.key === "owner");
        const own: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ou.userId };
        const c = { tenantId: SQC.tenant.id };
        const mp = await L(own, { unitId: SQC.units.barber.id, page: "policy" }, c);
        eq(mp?.diffCount, 6, "diffCount");
        const on = ((mp?.form?.groups ?? []) as Any[]).flatMap((g) => g.fields).find((f: Any) => f.key === "booking.booking.onlineSharePct");
        eq(on?.overrideCount, 3, "ปรับรายคน");
        const ms = await L(own, { unitId: SQC.units.massage.id, page: "services", serviceId: "น้ำมันอโรมา" }, c);
        const ar = (ms?.rows as Any[] | undefined)?.find((r) => r.name === "น้ำมันอโรมา");
        eq([ar?.canCount, ar?.staffTotal], [5, 6], "อโรมา");
        const mt = await L(own, { unitId: SQC.units.massage.id, page: "staff", staffId: "พี่นก" }, c);
        eq((mt?.rows as Any[] | undefined)?.find((r) => r.name === "พี่นก")?.onlinePct, 70, "พี่นก");
      }, "MAJOR");
      await t("Q-3", "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0", () => {
        const r = runTsx();
        ok(r.status === 0 && r.sum?.created === 0 && r.sum?.updated === 0 && r.sum?.removed === 0, `exit=${r.status} ${fmt(r.sum)}`);
      }, "MAJOR");
    }
  }

  // ═══════════════ V. ภาพ ═══════════════
  console.log("\nV. ภาพ b.11 (จอง 08 · 11 · 12 · 14)");
  await t("V-1", "SQC_VISUAL_SPECS b.11 = 4 หน้า (settings · services?service=อโรมา · staff?staff=พี่นก · settings/messages?msg=nearTurn) · visual-svc --list ได้", () => {
    const sp = SQ.SQC_VISUAL_SPECS?.["b.11"] as Any[] | undefined;
    eq(sp?.map((x) => x.name), ["booking-settings-policy", "booking-services", "booking-staff", "booking-settings-messages"], "ชื่อ");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.11", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/booking/settings/messages"), `exit ${r.status}`);
  }, "MAJOR");
  {
    const base = process.env.QC_BASE ?? "";
    const name = "ถ่าย b.11 owner 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน (ผู้คุมเทียบ PARITY กับ ledger/design-booking/{08,11,12,14}-*.png)";
    if (!base) skip("V-2", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + รันฉาก แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>");
    else {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "b.11", "--user", "owner", "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      record("V-2", name, r.status === 0 ? "PASS" : "FAIL", `exit=${r.status} ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "MAJOR");
    }
  }

  // ═══════════════ G. regression ═══════════════
  console.log("\nG. regression (ลูกโพรเซส · env เดียวกัน · ผ่าน = JSON_SUMMARY ไม่มี failed หรือ exit 0)");
  const REG: [string, string, string[], Record<string, string>][] = [
    ["G-0", "qc-svc-r0.3", [], {}], ["G-1", "qc-svc-r0.4", [], {}], ["G-2", "qc-svc-b.0", [], {}], ["G-3", "qc-svc-b.1", [], { SVC_B1_NO_REGRESSION: "1" }], ["G-4", "qc-svc-b.3", [], { SVC_B3_NO_REGRESSION: "1" }],
    ["G-5", "qc-booking-deposit", [], {}], ["G-6", "qc-booking-race", [], {}], ["G-7", "qc-booking-edit-schedule", [], {}], ["G-8", "qc-hr-leave-booking", [], {}], ["G-9", "qc-svc-smoke", [], {}],
  ];
  for (const [id, f, args, env] of REG) {
    if (NO_REG) { skip(id, `regression ${f}`, "--no-regression / SVC_B11_NO_REGRESSION=1", "CRITICAL"); continue; }
    const t0 = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const js = [...out.matchAll(/JSON_SUMMARY (\{.*\})/g)].map((m) => m[1]).pop();
    let sum: Any = null;
    try { sum = js ? JSON.parse(js) : null; } catch { /* อ่านไม่ได้ */ }
    const failed: string[] = Array.isArray(sum?.failed) ? sum.failed : [];
    // ORACLE-EDIT 29 ต.ค.: qc-svc-b.0 G-9 (qc-pos-p3.5 P3.5-ST2 ห้าม migration ใหม่) = หนี้ฐานที่รู้แล้ว SVC-D3 (migration svc_* ของ RUN นี้) ⇒ ยอมเฉพาะข้อนั้นข้อเดียว
    const knownD3 = f === "qc-svc-b.0" && isDeepStrictEqual(failed, ["G-9"]) && /"suite":"qc-pos-p3\.5"[^\n]*"failed":\["P3\.5-ST2"\]/.test(out);
    const pass = (!!sum && (failed.length === 0 || knownD3)) || (!sum && r.status === 0);
    record(id, `regression ${f} (${Math.round((Date.now() - t0) / 1000)} วิ${sum ? ` · ${sum.passed}/${sum.total}` : ""})`, pass ? "PASS" : "FAIL",
      pass ? "" : `exit=${r.status} failed=${fmt(failed)} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = await leftovers(tenantIds);
    const tl = await db.tenant.count({ where: { slug: { startsWith: SLUG } } });
    const ul = await db.user.count({ where: { email: { startsWith: MAIL } } });
    if (tl) left.push({ table: "Tenant", n: tl });
    if (ul) left.push({ table: "User", n: ul });
    record("Z-1", `ล้างครบ: ทุกตารางที่มี tenantId ของร้านทดสอบ ${tenantIds.length} ร้าน + tenant + ผู้ใช้ svc-b11-* = 0 แถว (ฉาก svcqc คงไว้ให้ถ่ายภาพ — ล้างด้วย ${F.scene} --clear)`,
      left.length ? "FAIL" : "PASS", fmt(left), "MAJOR");
  } catch (e) { record("Z-1", "ล้างครบ", "FAIL", `ตรวจไม่ได้: ${errMsg(e)}`, "MAJOR"); }
  await db.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.11 · จอตั้งค่าจองคิว + สิทธิ์ + ความเป็นส่วนตัว =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// exit 0 เมื่อไม่มีข้อแดง · รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้: V-2 ไม่มี QC_BASE · Q-* ร้าน svcqc ยังไม่ seed · G-* เมื่อ --no-regression — ผู้คุมรันครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
