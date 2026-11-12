// svc-pos-carry.mts — ORACLE-EDIT (ผู้คุม 31 ต.ค. · G1-D) ทะเบียนไฟล์ที่ใบ SVC ได้รับอนุญาตให้แตะ ซึ่งข้อสอบ POS/hf/crm ปักหมุดไว้
//
// ที่มา: G1 (B.12) qc:all บนทรี SVC — ข้อหมุด/ขอบเขตของข้อสอบ POS (ตรวจ "ตอนรับใบ POS" เทียบหมุดเลน) แดงเพราะ SVC แตะไฟล์ตามใบสั่งที่เจ้าของอนุญาต
//   (/root/svc-runs/g1-classify.md §E1) · ใบ POS ทั้ง 55 ใบรับแล้วที่ 940e3aca (= merge-base ของ session/svc กับ session/pos)
//
// 🔴 มติผู้คุม 31 ต.ค. (G1 รอบ 1 ข้อ 4): ใบ SVC ใหม่ที่แตะไฟล์ของ POS (POS_OWNED_PATHS ข้างล่าง) ต้องเพิ่ม/ขยายแถวใน SVC_POS_CARRY ในใบนั้นเอง
//   พร้อมอ้างใบสั่ง (ledger/svc-briefs/svc-brief-<ใบ>.md §ไฟล์) ในคอลัมน์ wo — ไม่เพิ่ม ⇒ svcPosGuard แดงในข้อขอบเขตของ POS (p6.1 Z1 · p6.2 Z1 · hf-fu2 ST1)
//   และข้อหมุดอื่นตรวจทรีงานเหมือนเดิม (= แดง) · แถวที่ไม่มีใบสั่งรองรับ = ห้ามเพิ่ม
//
// กติกา (จำกัดขอบเขต ไม่ลดความเข้ม):
//   • ไฟล์ในทะเบียนนี้ ⇒ ข้อหมุด POS ตรวจ "เนื้อไฟล์ ณ 940e3aca" (ปลายทาง POS) แทนทรีงาน — การันตีของ POS ต่อเนื้อไฟล์ช่วง POS คงเดิมทุกข้อ
//     ส่วนที่ SVC เพิ่ม = ข้อสอบ SVC ของใบนั้นตรวจ (คอลัมน์ wo) · ไฟล์นอกทะเบียน = ตรวจทรีงานเหมือนเดิม
//   • ใช้ได้เฉพาะเมื่อ 940e3aca เป็นบรรพบุรุษของ HEAD และ **ทุก commit (ไม่นับ merge) หลัง 940e3aca ที่แตะไฟล์นั้นเป็น commit ของ SVC**
//     (หัวเรื่อง `<ชนิด>(svc):`) — มี commit อื่นแตะ / อ่าน git ไม่ได้ ⇒ ไม่ยกเว้น (ข้อหมุดตรวจทรีงานเหมือนเดิม)
//   • ทรีงานมีการแก้ที่ยังไม่ commit ในไฟล์ทะเบียน ⇒ ไม่ยกเว้น ยกเว้นไฟล์ที่ระบุ `uncommittedOk` (การแก้ของรอบ G1 ที่ผู้คุมสั่ง · ยังไม่ commit)
import { execFileSync } from "node:child_process";

export const SVC_BASE = "940e3aca"; // ปลายทาง POS (55/55 · HANDOVER-2026-10-POS) = merge-base ของ session/svc

type Carry = { path: string; prefix?: boolean; wo: string; uncommittedOk?: boolean };
/** path = ไฟล์ (หรือโฟลเดอร์ เมื่อ prefix) · wo = ใบ SVC + ข้อในใบสั่งที่อนุญาต */
export const SVC_POS_CARRY: readonly Carry[] = [
  // schema + migration ของ SVC (เพิ่มล้วน · ใบสั่งแต่ละใบ §ไฟล์): svc_r0/svc_r0b (R0.1) · svc_b + pos.prisma 9 บรรทัด (B.0) · svc_d (D.0) · svc_d4 (D.4)
  { path: "prisma/", prefix: true, wo: "R0.1 · B.0 · D.0 · D.4 (migration svc_r0/svc_r0b/svc_b/svc_d/svc_d4 + schema)" },
  // B.10 "POS — 2 จุดที่เจ้าของอนุญาต" (ledger/svc-briefs/svc-brief-b.10.md §1)
  { path: "src/lib/modules/pos/service-bill.ts", wo: "B.10 จุด 1 (ไฟล์ใหม่ · createSale จุดเดิม)" },
  { path: "src/lib/modules/pos/index.ts", wo: "B.10 จุด 1 (export serviceBills)" },
  { path: "src/lib/modules/pos/held-cart.ts", wo: "B.10 จุด 1 (บิลจากคิว ไม่หมดอายุ · recall/list ไม่แตะแถว serviceJobId)" },
  { path: "src/lib/modules/pos/service.ts", wo: "B.10 จุด 1 (createSale รับ lines[].performerEmployeeId · เพิ่มล้วน)" },
  { path: "src/lib/modules/pos/register-ui.tsx", wo: "B.10 จุด 1 (แผงบิลจากคิว + ปุ่มรับเงิน)" },
  { path: "src/lib/modules/pos/register-actions.ts", wo: "B.10 จุด 1 (listServiceBills/serviceBillView/payServiceBill action)" },
  { path: "src/lib/modules/pos/staff-commission.ts", wo: "B.10 จุด 2 (ค่าคอมฯ ตามผู้ให้บริการ)" },
  // 3 ทะเบียน event (ทุกใบ SVC ที่มี event ใหม่ · ใบสั่ง §ไฟล์ "3 ทะเบียน event")
  { path: "src/lib/outbox-consumers.ts", wo: "R0.3 R0.5 R0.6 R0.8 B.4 B.8 B.9 B.10 C.3 D.5 D.6 D.8 D.9 D.10 D.11 D.12 D.16 D.17 D.18 (consumer ของ event ใบนั้น)" },
  { path: "src/lib/automation/labels.ts", wo: "ใบ SVC ที่มี event ใหม่ (ทะเบียน event · ป้ายไทย)" },
  { path: "src/lib/webhooks/labels.ts", wo: "ใบ SVC ที่มี event ใหม่ (+ G1-A1 ลบ settings.changed ที่ซ้ำ)", uncommittedOk: true },
  // D.16 แจ้งซ่อม → บอร์ดงาน (สะพานแพลตฟอร์ม)
  { path: "src/lib/platform/kanban-bridges.ts", wo: "D.16 (แจ้งซ่อม → บอร์ดงาน)" },
  // R0.3 approval เจ้าของเท่านั้น (BLOCKER 1) + entityType ของ R0.3/D.5/D.11/D.12
  { path: "src/lib/modules/approval/actions.ts", wo: "R0.3 (สายอนุมัติ = เจ้าของ) · D.5 · D.11 · D.12 (entityType)" },
  { path: "src/lib/approval-effects.ts", wo: "R0.3 (settings.legal_override) · D.11 (dorm.latefee.waive) — ผลของ entityType ใหม่" },
  // บัญชี: facade ให้หอ (D.2) + ใบที่ต่อยอด (D.3 ใบกำกับภาษี · D.4 นำเข้า · D.5 เงินประกัน · D.8 รอบบิล · D.10 รับเงิน · D.12 ย้ายออก · D.13 หน้าแรกหอ)
  { path: "src/lib/modules/account/", prefix: true, wo: "D.2 · D.3 · D.4 · D.5 · D.8 · D.10 · D.12 · D.13 (facade บัญชีของหอ)" },
  // แชท LINE (R0.7 flex/richmenu/link code · D.9 พอร์ทัลผู้เช่า) · สมาชิก (B.16 โน้ตลูกค้าบนการ์ดงาน)
  { path: "src/lib/modules/chat/", prefix: true, wo: "R0.7 · D.9 (LINE flex/richmenu/link code · พอร์ทัลผู้เช่า)" },
  { path: "src/lib/modules/member/", prefix: true, wo: "B.16 (โน้ตลูกค้าบนการ์ดงาน)" },
  // ทะเบียนแพลตฟอร์มที่ทุกใบเพิ่มแถว: scope ของโมเดลใหม่ · งานรายนาที · กฎ fitness
  { path: "src/lib/core/scope.ts", wo: "R0.1 · B.0 · D.0 · D.4 (scope ของโมเดลใหม่)" },
  { path: "src/lib/platform/minute-jobs.ts", wo: "R0.5 R0.8 R0.9 B.3 B.4 B.9 B.11 C.3 D.8 D.9 D.10 D.11 D.12 D.16 D.17 D.18 (งานรายนาทีของใบ)" },
  { path: "scripts/fitness.mts", wo: "R0.8 B.4 B.6 D.2 D.3 D.5 D.6 D.8 (กฎ fitness ของใบ)" },
  // G1-A2 (ผู้คุม 31 ต.ค.) เมนูข้าง "ตั้งค่า" จองคิวชี้ /booking/settings + widget — ยังไม่ commit
  { path: "src/app/app/layout.tsx", wo: "G1-A2 (เมนูข้างจองคิว · บล็อก BOOKING)", uncommittedOk: true },
  { path: "src/lib/pages/registry.ts", wo: "G1-A2 (widget /booking/settings)", uncommittedOk: true },
];

const SVC_SUBJECT = /^[a-z]+\(svc\):/;
// ORACLE-EDIT 12 พ.ย. 2569 (release svc→main): the release fix 1e27b67b7 "fix(hotel): register night-audit and OTA channel consumers in the main
//   consumer registry" moved the SVC H.7/H.10 consumer blocks of outbox-consumers.ts into the baseConsumers object (SVC work, non-svc subject).
//   Only this exact commit counts as SVC in addition to SVC_SUBJECT — any other non-svc commit still voids the carry.
const SVC_RELEASE_FIX = ["1e27b67b7"];

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

const cache = new Map<string, string | null>();
let baseOk: boolean | null = null;

function entryOf(file: string): Carry | null {
  const f = file.replace(/^\.\//, "");
  return SVC_POS_CARRY.find((c) => (c.prefix ? f.startsWith(c.path) || `${f}/` === c.path : f === c.path)) ?? null;
}

/** ไฟล์นี้อยู่ในทะเบียน + ผ่านเงื่อนไข ⇒ คืนคำอธิบายใบ SVC · ไม่ใช่ ⇒ null (ข้อหมุดตรวจทรีงานเหมือนเดิม) */
export function svcCarry(root: string, file: string): string | null {
  const key = `${root}\u0000${file}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: string | null = null;
  const e = entryOf(file);
  if (e) {
    try {
      if (baseOk === null) {
        try { git(root, ["merge-base", "--is-ancestor", SVC_BASE, "HEAD"]); baseOk = true; } catch { baseOk = false; }
      }
      if (baseOk) {
        const subs = git(root, ["log", "--no-merges", "--format=%H %s", `${SVC_BASE}..HEAD`, "--", file]).split("\n").filter(Boolean)
          .filter((l) => !SVC_RELEASE_FIX.some((h) => l.startsWith(h))).map((l) => l.slice(l.indexOf(" ") + 1)); // ORACLE-EDIT 12 พ.ย. 2569 (release svc→main): SVC_RELEASE_FIX
        const dirty = git(root, ["status", "--porcelain", "--", file]).trim();
        if (subs.every((s) => SVC_SUBJECT.test(s)) && (!dirty || e.uncommittedOk)) out = `SVC ${e.wo}`;
      }
    } catch {
      out = null;
    }
  }
  cache.set(key, out);
  return out;
}

/** เนื้อไฟล์ ณ ปลายทาง POS (940e3aca) — ไม่มีไฟล์ ณ จุดนั้น ⇒ null (= ไฟล์ใหม่ของ SVC) */
export function atSvcBase(root: string, file: string): Buffer | null {
  try {
    return execFileSync("git", ["-C", root, "show", `${SVC_BASE}:${file.replace(/^\.\//, "")}`], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/** อ่านไฟล์สำหรับข้อหมุด POS: ไฟล์ในทะเบียน ⇒ เนื้อ ณ 940e3aca (ไม่มี ณ จุดนั้น = null · ไฟล์ใหม่ของ SVC) · ไม่อยู่ในทะเบียน ⇒ undefined (ผู้เรียกอ่านทรีงานเอง) */
export function svcRead(root: string, file: string): string | null | undefined {
  if (!svcCarry(root, file)) return undefined;
  const b = atSvcBase(root, file);
  return b ? b.toString("utf8") : null;
}

/** schema ทั้งโฟลเดอร์ ณ 940e3aca (เมื่อ prisma/ อยู่ในทะเบียน) — ไม่ใช่ ⇒ null */
export function svcSchemaFiles(root: string): { path: string; text: string }[] | null {
  if (!svcCarry(root, "prisma/")) return null;
  try {
    const ls = git(root, ["ls-tree", "-r", "--name-only", SVC_BASE, "--", "prisma/schema/"]).split("\n").filter((f) => f.endsWith(".prisma"));
    return ls.map((f) => ({ path: f, text: atSvcBase(root, f)?.toString("utf8") ?? "" }));
  } catch {
    return null;
  }
}

/** ชื่อ migration ที่ SVC เพิ่ม (โฟลเดอร์ใหม่หลัง 940e3aca · ทุก commit เป็นของ SVC) — ข้อหมุด migration ของ POS ไม่นับ */
export function svcMigrationDirs(root: string): Set<string> {
  const out = new Set<string>();
  try {
    if (!svcCarry(root, "prisma/migrations/")) return out;
    const base = new Set(git(root, ["ls-tree", "--name-only", SVC_BASE, "prisma/migrations/"]).split("\n").map((x) => x.split("/").pop() ?? ""));
    const now = git(root, ["ls-tree", "--name-only", "HEAD", "prisma/migrations/"]).split("\n").map((x) => x.split("/").pop() ?? "");
    for (const d of now) if (d && !base.has(d) && /^\d{14}_svc_[a-z0-9]+$/.test(d) && svcCarry(root, `prisma/migrations/${d}/migration.sql`)) out.add(d);
  } catch {
    /* อ่านไม่ได้ = ไม่ยกเว้น */
  }
  return out;
}

/** ข้อสอบ POS/hf (scripts/qc-*.mts) ที่ถูกแก้หลัง 940e3aca โดย SVC เท่านั้น และทุกครั้งเป็น ORACLE-EDIT ที่ติดป้าย
 *  (ทุก commit หลัง 940e3aca ที่แตะไฟล์เป็นของ SVC · diff 940e3aca→ทรีงาน มีบรรทัดเพิ่มที่มี "ORACLE-EDIT") — ข้อ "ข้อสอบเดิมไม่ถูกแก้" ของ POS ไม่นับไฟล์นี้ */
export function svcOracleEdited(root: string, file: string): boolean {
  if (!/^scripts\/qc-[^/]+\.mts$/.test(file)) return false;
  try {
    git(root, ["merge-base", "--is-ancestor", SVC_BASE, "HEAD"]);
    const subs = git(root, ["log", "--no-merges", "--format=%s", `${SVC_BASE}..HEAD`, "--", file]).split("\n").filter(Boolean);
    if (!subs.every((s) => /^[a-z]+\(svc(-qc)?\):/.test(s))) return false;
    const d = git(root, ["diff", "--no-color", "-U0", SVC_BASE, "--", file]);
    if (!d.trim()) return false;
    return d.split("\n").some((l) => l.startsWith("+") && !l.startsWith("+++") && /ORACLE-EDIT/.test(l));
  } catch {
    return false;
  }
}

/** ไฟล์ที่เปลี่ยนหลัง 940e3aca ใต้ paths ที่ "ไม่ใช่" ของ SVC ตามทะเบียน (ข้อหมุดที่ย้ายไปตรวจ ณ 940e3aca ต้องยังจับไฟล์พวกนี้ได้) */
export function svcUncarried(root: string, paths: string[]): string[] {
  try {
    const a = git(root, ["diff", "--name-only", SVC_BASE, "--", ...paths]).split("\n").filter(Boolean);
    const b = git(root, ["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
    return [...new Set([...a, ...b])].filter((f) => !svcCarry(root, f) && !svcOracleEdited(root, f));
  } catch {
    return [`อ่าน git เทียบ ${SVC_BASE} ไม่ได้`];
  }
}

/** ทรีนี้เป็นทรี SVC (940e3aca เป็นบรรพบุรุษของ HEAD และไม่ใช่ HEAD เอง) */
const svcTreeCache = new Map<string, boolean>();
export function isSvcTree(root: string): boolean {
  if (svcTreeCache.has(root)) return svcTreeCache.get(root)!;
  let v = false;
  try {
    git(root, ["merge-base", "--is-ancestor", SVC_BASE, "HEAD"]);
    v = git(root, ["rev-parse", "HEAD"]).trim().slice(0, SVC_BASE.length) !== SVC_BASE;
  } catch {
    v = false;
  }
  svcTreeCache.set(root, v);
  return v;
}

/** ตัวห่อคำสั่ง git ของข้อสอบ POS (ทรี SVC เท่านั้น — ทรีอื่นส่งต่อเหมือนเดิม):
 *  • `git diff <rev> [--opts] -- <paths>` (เทียบทรีงาน) — paths อยู่ในทะเบียนทั้งหมด ⇒ เทียบ `<rev> 940e3aca` แทน ·
 *    แบบ --name-only/--name-status ที่ paths ปนกัน ⇒ ไฟล์ในทะเบียนเอาจาก `<rev> 940e3aca` · ไฟล์อื่นเอาจากทรีงาน (เหมือนเดิม)
 *  • `git ls-files --others` ⇒ ตัดไฟล์ในทะเบียน (ไฟล์ใหม่ของ SVC ที่ยังไม่ commit · ปกติไม่มี)
 *  • คำสั่งอื่น ⇒ เหมือนเดิม · run = ตัวรัน git เดิมของข้อสอบ (คืนข้อความ หรือ null เมื่อพัง) */
export function svcGit(root: string, args: string[], run: (a: string[]) => string | null): string | null {
  if (!SVC_PIN_VIEW.on || !isSvcTree(root)) return run(args);
  const i0 = args.indexOf("--");
  if (args[0] === "diff") {
    const i = i0 > 0 ? i0 : args.length; // ไม่มี "--" = ทั้งทรี
    const pre = args.slice(1, i);
    const paths = i0 > 0 ? args.slice(i + 1).map((p) => p.replace(/^:\(literal\)/, "")) : ["."];
    const revs = pre.filter((a) => !a.startsWith("-"));
    if (revs.length !== 1 || /\.\./.test(revs[0]!) || !paths.length) return run(args);
    const withBase = [...args.slice(0, i), SVC_BASE, ...args.slice(i)];
    if (paths.every((p) => svcCarry(root, p))) return run(withBase);
    const listing = pre.includes("--name-only") || pre.includes("--name-status");
    if (!listing) return run(args);
    const a = run(args);
    const b = run(withBase);
    if (a === null || b === null) return a;
    const fileOf = (l: string) => l.split("\t").pop() ?? l;
    const keep = [...a.split("\n").filter((l) => l && !svcCarry(root, fileOf(l))), ...b.split("\n").filter((l) => l && !!svcCarry(root, fileOf(l)))];
    return keep.length ? `${keep.join("\n")}\n` : "";
  }
  if (args[0] === "ls-files" && args.includes("--others")) {
    const a = run(args);
    if (a === null) return a;
    const keep = a.split("\n").filter((l) => l && !svcCarry(root, l));
    return keep.length ? `${keep.join("\n")}\n` : "";
  }
  return run(args);
}

/** สวิตช์ "มุมมองหมุด" — เปิดเฉพาะระหว่างข้อหมุด/ขอบเขตเลนของ POS ที่ผู้คุมระบุ (svcPinStep) · ข้อกติกาถาวร (เช่น POS ห้าม import booking) ยังอ่านทรีงานเสมอ */
export const SVC_PIN_VIEW = { on: false };
/** รัน fn ใน "มุมมองหมุด": rd/ex/git ของข้อสอบที่ห่อด้วย svcRdView/svcExView/svcGit เห็นไฟล์ในทะเบียน ณ 940e3aca */
export async function svcPinStep<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = SVC_PIN_VIEW.on;
  SVC_PIN_VIEW.on = true;
  try {
    return await fn();
  } finally {
    SVC_PIN_VIEW.on = prev;
  }
}
export function svcPinStepSync<T>(fn: () => T): T {
  const prev = SVC_PIN_VIEW.on;
  SVC_PIN_VIEW.on = true;
  try {
    return fn();
  } finally {
    SVC_PIN_VIEW.on = prev;
  }
}
/** rd ของข้อสอบ: ในมุมมองหมุด + ไฟล์ในทะเบียน ⇒ เนื้อ ณ 940e3aca ("" = ไม่มี ณ จุดนั้น) · อื่น ๆ ⇒ orig */
export function svcRdView(root: string, p: string, orig: (p: string) => string): string {
  if (!SVC_PIN_VIEW.on) return orig(p);
  const rel = p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
  const sv = svcRead(root, rel);
  return sv === undefined ? orig(p) : sv ?? "";
}
export function svcExView(root: string, p: string, orig: (p: string) => boolean): boolean {
  if (!SVC_PIN_VIEW.on) return orig(p);
  const rel = p.startsWith(root + "/") ? p.slice(root.length + 1) : p;
  return svcCarry(root, rel) ? atSvcBase(root, rel) !== null : orig(p);
}

/** สำหรับตัวรัน git ที่คืนสถานะ (เช่น `diff --quiet`): ในมุมมองหมุด + diff เทียบทรีงานที่ทุก path อยู่ในทะเบียน ⇒ args ที่เทียบ 940e3aca แทน · อื่น ๆ ⇒ args เดิม */
export function svcDiffArgs(root: string, args: string[]): string[] {
  if (!SVC_PIN_VIEW.on || !isSvcTree(root) || args[0] !== "diff") return args;
  const i = args.indexOf("--");
  if (i < 0) return args;
  const revs = args.slice(1, i).filter((a) => !a.startsWith("-"));
  const paths = args.slice(i + 1).map((x) => x.replace(/^:\(literal\)/, ""));
  if (revs.length !== 1 || /\.\./.test(revs[0]!) || !paths.length || !paths.every((x) => svcCarry(root, x))) return args;
  return [...args.slice(0, i), SVC_BASE, ...args.slice(i)];
}

/** ไฟล์ของ POS (โมดูล · หน้า · route · ทะเบียน event · schema) — ด่านกัน: SVC แก้ไฟล์เหล่านี้ได้เฉพาะที่อยู่ในทะเบียน */
export const POS_OWNED_PATHS = [
  "src/lib/modules/pos", ":(glob)src/lib/pos-*.ts", ":(literal)src/app/app/sys/[id]/pos", "src/components/pos", "src/app/api/pos", "src/app/api/v1/pos",
  "src/lib/outbox-consumers.ts", "src/lib/core/outbox.ts", "src/proxy.ts", "package.json", "prisma", "scripts/pos-sale-contract.json",
];
/** ด่านกันของทรี SVC: ไฟล์ POS ที่เปลี่ยนหลัง 940e3aca แต่ไม่อยู่ในทะเบียน (หรือมี commit ที่ไม่ใช่ของ SVC) ⇒ รายการปัญหา · ทรีอื่น ⇒ [] */
export function svcPosGuard(root: string): string[] {
  if (!isSvcTree(root)) return [];
  return svcUncarried(root, POS_OWNED_PATHS).map((f) => `${f} เปลี่ยนหลัง ${SVC_BASE} นอกทะเบียน svc-pos-carry (ใบ SVC ไม่ได้รับอนุญาต)`);
}
