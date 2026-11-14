// seed-hr-walk.mts — ชุดข้อมูลเสริมสำหรับเดินทุกปุ่ม HR 3 ขนาดจอ (ใบ H5.1) — "บวกเพิ่ม" บนร้าน QC ของ seed-hr-qc (ไม่แก้ seed-hr-qc / hr-expected.json)
//
// รัน (ฐานของเลนเท่านั้น · หลัง seed-hr-qc):
//   bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-hr-walk.mts            # ขึ้น (idempotent)
//   … seed-hr-walk.mts --dry-run      # อ่านอย่างเดียว: พิมพ์แผน + สถานะ ไม่เขียน
//   … seed-hr-walk.mts --line off|on  # สลับนโยบาย LINE ของร้าน (ผ่าน saveLineNotifyPolicy) เพื่อถ่ายสถานะ "ร้านปิด LINE" — ไม่นับเป็นส่วนของ manifest
//   … seed-hr-walk.mts --down         # ถอดเฉพาะที่ไฟล์นี้เพิ่ม (รวมแถวกฎหมาย ACTIVE + ผู้ใช้ payroll-branch) แล้วรายงานของค้าง
//
// 🔴 ข้อมูลเดินผ่าน service จริงทุกที่ที่มี service (ทางเดียวกับข้อสอบ) — เขียนตรงเฉพาะที่ข้อสอบเองก็เขียนตรง:
//    (ก) ผู้ใช้/สมาชิกภาพ payroll-branch (แบบ seed-hr-qc) (ข) แถวกฎหมาย ACTIVE ใต้ sourceKey ของตัวเอง `qc-hr-walk:*` (แบบ h3.4-ytd/h4.2 · มติ Q7 — ฐานเลนเท่านั้น)
//    (ค) ยอดขาย POS รายชั่วโมง `PosSale` (แบบ h4.2 — HR ไม่มี service ฝั่ง POS) (ง) ห้อง LINE ปลอม: chatChannelConnection + settingValue + chatContact (แบบ h4.5)
//    (จ) รหัส LINE ที่รอ: beginLineLink ด้วย now = +6 วัน (TTL 10 นาทีของจริงหมดก่อนเดิน)
// 🔴 ไม่เรียก drainAll / ไม่ส่ง LINE จริง / ไม่พิมพ์ PIN-ช่องอ่อนไหว
// 🔴 ถอดได้แน่นอน: ก่อนเขียนจดภาพฐาน (id ทุกแถวของร้านต่อตาราง + ลายนิ้วมือแถว + settings ของระบบ HR) ลง manifest `scripts/hr-walk-expected.json`
//    (ห้าม commit) · --down ลบแถวที่ id ไม่อยู่ในภาพฐาน · คืน settings · ลบกฎหมาย/ผู้ใช้/ถังจำกัดอัตราที่เพิ่ม · เทียบลายนิ้วมือ ⇒ ของค้าง
// 🔴 รันซ้ำ = ไม่เปลี่ยนอะไร: manifest ครบ + ร้านเดิม ⇒ เทียบลายนิ้วมือปัจจุบันกับหลังขึ้น แล้วจบ (ไม่เขียน)
// ผลลัพธ์: `JSON_SUMMARY {...}` บรรทัดท้าย · exit 0 = ครบ · 1 = มีขั้นที่ล้ม/มีของค้าง · 2 = ใช้ผิด · 3 = ไม่มี seed-hr-qc

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { HQC, hqcDates, addDays, addMonths, lastDayOf, atBkk, loadHrQcEnv, findQcTenant, type HqcUserKey } from "./hr-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const argv = process.argv.slice(2);
const DOWN = argv.includes("--down");
const DRY = argv.includes("--dry-run");
const LINE_ARG = argv.includes("--line") ? argv[argv.indexOf("--line") + 1] : undefined;
if (LINE_ARG !== undefined && LINE_ARG !== "on" && LINE_ARG !== "off") {
  console.error("❌ seed-hr-walk: --line ต้องเป็น on หรือ off");
  process.exit(2);
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class Done {}

const WALK = {
  manifestPath: "scripts/hr-walk-expected.json",
  lawPrefix: "qc-hr-walk:",
  sessionUa: "qc-walk-hr",
  user: { key: "payroll-branch", email: "hr-qc-payroll-branch@shark.local", name: "ฝ่ายเงินเดือนสาขาหัวหิน (QC HR walk)", role: "STAFF" as const, units: ["huahin"] as const },
  /** พนักงานเสริม 1 คน (วิว = กรอกยอดยกมาแล้ว + ข้อมูลครบสำหรับ 50 ทวิ) · "ขาดยอดยกมา" = พนักงานเดิมของ seed บนรอบร่าง (ไม่มีรอบก่อนในปี) */
  employees: {
    view: { name: "วิว", code: "EMP-W01", position: "บาริสต้า", department: "บาร์", baseSalarySatang: 1_800_000, startMonthDay: "01-15" },
  },
  /** เดือนของรอบรุ่น 2 (นับจากเดือนนี้): จ่ายแล้ว = −2 · อนุมัติ = −3 · กลับรายการ = −4 · ร่าง = −5 (−1 = รอบรุ่น 1 ที่จ่ายแล้วของ seed-hr-qc)
   *  ร่างเดือนนี้/เดือนหน้าทำไม่ได้ (ลองแล้ว 14 พ.ย.): วันที่ยังไม่ถึงในตารางงาน = REVIEW ⇒ WORK_ENTRIES + คำขอ OT ที่ seed-hr-qc ตั้งใจให้ค้าง = OT_OPEN ·
   *  ร่างย้อนหลัง (−5) ไม่มีรอบก่อนหน้าในปี ⇒ ทุกคนที่ไม่มียอดยกมาได้คำเตือน YTD_OPENING · วิว (กรอกยอดยกมาแล้ว) ไม่มี */
  runs: { DRAFT: -5, PAID: -2, APPROVED: -3, REVERSED: -4 },
} as const;

/** สตริงเลขประจำตัว 13 หลักที่หลักตรวจถูก (ข้อมูลทดสอบ) */
function thaiId(prefix12: string): string {
  const d = prefix12.split("").map(Number);
  const s = d.reduce((a, x, i) => a + x * (13 - i), 0);
  return prefix12 + String((11 - (s % 11)) % 10);
}

const t0 = Date.now();
await loadHrQcEnv("seed-hr-walk");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const D = hqcDates();
const Y = Number(D.today.slice(0, 4));

type Step = { id: string; ok: boolean; note: string };
const steps: Step[] = [];
async function step<T>(id: string, fn: () => Promise<T>, okOf: (r: T) => boolean = (r: Any) => r?.ok !== false, noteOf: (r: T) => string = (r: Any) => (r?.ok === false ? `${r.code ?? ""} ${r.reason ?? r.note ?? ""}`.trim() : "ok")): Promise<T | null> {
  try {
    const r = await fn();
    const ok = okOf(r);
    steps.push({ id, ok, note: noteOf(r).slice(0, 220) });
    console.log(`  ${ok ? "✅" : "❌"} ${id} — ${noteOf(r).slice(0, 160)}`);
    return r;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n").slice(0, 3).join(" | ").slice(0, 300);
    steps.push({ id, ok: false, note: `throw: ${msg}` });
    console.log(`  ❌ ${id} — throw: ${msg}`);
    return null;
  }
}

// ═══════════════════ ภาพฐาน (ถอดได้แน่นอน) ═══════════════════
async function tenantTables(): Promise<{ name: string; hasId: boolean; hasCreatedAt: boolean }[]> {
  const rows = (await P.$queryRaw`
    SELECT c.table_name AS name,
      bool_or(c2.column_name = 'id') AS "hasId", bool_or(c2.column_name = 'createdAt') AS "hasCreatedAt"
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    JOIN information_schema.columns c2 ON c2.table_name = c.table_name AND c2.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
    GROUP BY c.table_name ORDER BY c.table_name`) as { name: string; hasId: boolean; hasCreatedAt: boolean }[];
  return rows;
}
type Digest = Record<string, { n: number; h: string }>;
/** ลายนิ้วมือต่อตาราง (ไม่นับ updatedAt) — เฉพาะตารางที่มีแถวของร้าน */
async function digestOf(tenantId: string, tables: { name: string }[]): Promise<Digest> {
  const out: Digest = {};
  for (const t of tables) {
    const r = (await P.$queryRawUnsafe(
      `SELECT count(*)::int AS n, md5(coalesce(string_agg(h, ',' ORDER BY h), '')) AS h FROM (SELECT md5((to_jsonb(x) - 'updatedAt')::text) AS h FROM "${t.name}" x WHERE "tenantId" = $1) s`,
      tenantId,
    )) as { n: number; h: string }[];
    if ((r[0]?.n ?? 0) > 0) out[t.name] = { n: r[0]!.n, h: r[0]!.h };
  }
  return out;
}
const diffDigest = (a: Digest, b: Digest) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((k) => a[k]?.h !== b[k]?.h).map((k) => `${k} ${a[k]?.n ?? 0}→${b[k]?.n ?? 0}${a[k]?.n === b[k]?.n ? " (แถวเดิมเปลี่ยน)" : ""}`);
async function idsOf(tenantId: string, tables: { name: string; hasId: boolean }[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const t of tables.filter((x) => x.hasId)) {
    const r = (await P.$queryRawUnsafe(`SELECT id::text AS id FROM "${t.name}" WHERE "tenantId" = $1`, tenantId)) as { id: string }[];
    if (r.length) out[t.name] = r.map((x) => x.id).sort();
  }
  return out;
}

type Manifest = {
  $note: string;
  tenantId: string;
  day: string;
  startedAt: string;
  complete: boolean;
  hrSettingsBefore: unknown;
  rateKeysBefore: string[];
  baseline: { ids: Record<string, string[]>; digest: Digest };
  after?: Digest;
  lawKeys: string[];
  userEmail: string;
  ids: Record<string, Any>;
  users: Record<string, { userId: string; membershipId: string; email: string }>;
  steps?: Step[];
};
const readManifest = (): Manifest | null => (existsSync(WALK.manifestPath) ? (JSON.parse(readFileSync(WALK.manifestPath, "utf8")) as Manifest) : null);
const writeManifest = (m: Manifest) => writeFileSync(WALK.manifestPath, JSON.stringify(m, null, 1) + "\n");

// ═══════════════════ ถอด ═══════════════════
async function down(m: Manifest, scopeTenantId: string | null): Promise<string[]> {
  const residue: string[] = [];
  const sameTenant = scopeTenantId === m.tenantId;
  if (sameTenant) {
    const tables = await tenantTables();
    const base = m.baseline.ids;
    // รอบรุ่น 2 ของ walk อาจผูกรายการเดิมของ seed (runId) — ปลดก่อนลบรอบ
    const walkRuns = Object.values((m.ids.runs ?? {}) as Record<string, string>).filter(Boolean);
    if (walkRuns.length) await P.hrPayAdjustment.updateMany({ where: { tenantId: m.tenantId, runId: { in: walkRuns } }, data: { runId: null } });
    let pending = tables.filter((t) => t.hasId || t.hasCreatedAt);
    for (let pass = 0; pass < 14 && pending.length; pass++) {
      const still: typeof pending = [];
      for (const t of pending) {
        try {
          if (t.hasId) {
            const keep = base[t.name] ?? [];
            await P.$executeRawUnsafe(`DELETE FROM "${t.name}" WHERE "tenantId" = $1 AND NOT (id::text = ANY($2::text[]))`, m.tenantId, keep);
          } else {
            await P.$executeRawUnsafe(`DELETE FROM "${t.name}" WHERE "tenantId" = $1 AND "createdAt" >= $2::timestamptz`, m.tenantId, m.startedAt);
          }
        } catch {
          still.push(t);
        }
      }
      if (still.length === pending.length) {
        residue.push(...still.map((t) => `ลบไม่ได้ (FK) ${t.name}`));
        break;
      }
      pending = still;
    }
    // คืน settings ของระบบ HR (เครื่องรุ่น · ค่าแรง) ทั้งก้อน
    const hr = (await P.appSystem.findMany({ where: { tenantId: m.tenantId, type: "HR" }, select: { id: true }, orderBy: { createdAt: "asc" } }))[0];
    if (hr) await P.appSystem.update({ where: { id: hr.id }, data: { settings: m.hrSettingsBefore ?? null } });
  } else {
    residue.push(`ร้านในฐาน (${scopeTenantId ?? "ไม่มี"}) ≠ manifest (${m.tenantId}) — ข้ามการลบแถวของร้าน (seed-hr-qc ลบร้านเดิมแล้ว)`);
  }
  // ถังจำกัดอัตราที่เพิ่ม (key มี id ร้าน · ไม่อยู่ในภาพฐาน)
  const keys = ((await P.chatRateBucket.findMany({ where: { key: { contains: m.tenantId } }, select: { key: true } })) as { key: string }[]).map((r) => r.key);
  const newKeys = keys.filter((k) => !m.rateKeysBefore.includes(k));
  if (newKeys.length) await P.chatRateBucket.deleteMany({ where: { key: { in: newKeys } } });
  await P.hrLawTable.deleteMany({ where: { sourceKey: { startsWith: WALK.lawPrefix } } });
  const u = await P.user.findFirst({ where: { email: m.userEmail }, select: { id: true } });
  if (u) {
    await P.session.deleteMany({ where: { userId: u.id } });
    const others = await P.membership.count({ where: { userId: u.id } });
    if (others === 0) await P.user.delete({ where: { id: u.id } });
    else residue.push(`ผู้ใช้ ${m.userEmail} ยังมีสมาชิกภาพ ${others} ร้าน — ไม่ลบ`);
  }
  // ตรวจของค้าง
  if ((await P.hrLawTable.count({ where: { sourceKey: { startsWith: WALK.lawPrefix } } })) > 0) residue.push("HrLawTable qc-hr-walk:* ยังเหลือ");
  if (await P.user.findFirst({ where: { email: m.userEmail }, select: { id: true } })) residue.push(`User ${m.userEmail} ยังเหลือ`);
  if (sameTenant) {
    const now = await digestOf(m.tenantId, await tenantTables());
    residue.push(...diffDigest(m.baseline.digest, now).map((x) => `ต่างจากภาพฐาน: ${x}`));
  }
  return residue;
}

// ═══════════════════ เริ่ม ═══════════════════
let exitCode = 0;
const summary: Record<string, Any> = { suite: "seed-hr-walk", mode: DOWN ? "down" : DRY ? "dry-run" : LINE_ARG ? `line-${LINE_ARG}` : "up", day: D.today };
try {
  const scope = await findQcTenant(P);
  const E = existsSync(HQC.expectedPath) ? (JSON.parse(readFileSync(HQC.expectedPath, "utf8")) as Any) : null;
  let m = readManifest();

  if (DOWN) {
    if (!m) {
      summary.note = "ไม่มี manifest — ไม่มีอะไรต้องถอด (ตรวจกฎหมาย/ผู้ใช้ค้าง)";
      const law = await P.hrLawTable.count({ where: { sourceKey: { startsWith: WALK.lawPrefix } } });
      const usr = await P.user.count({ where: { email: WALK.user.email } });
      summary.residue = [...(law ? [`HrLawTable qc-hr-walk:* ${law}`] : []), ...(usr ? [`User ${WALK.user.email}`] : [])];
    } else {
      summary.residue = await down(m, scope?.tenantId ?? null);
      if ((summary.residue as string[]).every((x) => x.startsWith("ร้านในฐาน"))) rmSync(WALK.manifestPath, { force: true });
    }
    summary.residueCount = (summary.residue as string[]).filter((x) => !x.startsWith("ร้านในฐาน")).length;
    exitCode = summary.residueCount ? 1 : 0;
    throw new Done();
  }

  if (!scope || !E || E.tenant?.id !== scope.tenantId) {
    console.error(`❌ ไม่มีร้าน QC ของ seed-hr-qc ที่ตรงกับ ${HQC.expectedPath} — รัน seed-hr-qc ก่อน (ร้านในฐาน ${scope?.tenantId ?? "ไม่มี"} · เฉลย ${E?.tenant?.id ?? "ไม่มี"})`);
    exitCode = 3;
    throw new Done();
  }
  const tenantId = scope.tenantId;
  const ctx = { tenantId, systemId: scope.hrSystemId };
  const accSys = scope.accountSystemId;
  const units = E.units as Record<string, string>;
  const emp = E.employees as Record<string, string>;
  const memberOf = async (userId: string) => P.membership.findFirst({ where: { userId, tenantId }, select: { id: true, role: true, unitAccess: true, permissions: true } });
  const viewerOf = async (userId: string) => {
    const mm = await memberOf(userId);
    return { role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: (mm.permissions ?? {}) as Record<string, boolean>, userId };
  };
  const selfOf = async (userId: string) => ({ tenantId, ...(await viewerOf(userId)) });
  const uid = (k: HqcUserKey) => E.users[k].userId as string;
  const periodOf = (off: number) => addMonths(D.thisMonth, off);
  const PER = { DRAFT: periodOf(WALK.runs.DRAFT), PAID: periodOf(WALK.runs.PAID), APPROVED: periodOf(WALK.runs.APPROVED), REVERSED: periodOf(WALK.runs.REVERSED) };

  if (LINE_ARG) {
    const line = (await import("@/lib/modules/hr/line-notify" as string)) as Any;
    const r = await step(`line-${LINE_ARG}`, async () => line.saveLineNotifyPolicy(ctx, await viewerOf(uid("owner")), { enabled: LINE_ARG === "on", events: { ROSTER: true, LEAVE: true, OT: true, SWAP: true, SLIP: true }, mode: "IMMEDIATE", digestAt: "17:30", monthlyCap: 200, unitId: null }));
    exitCode = r && (r as Any).ok ? 0 : 1;
    throw new Done();
  }

  if (DRY) {
    summary.plan = {
      tenant: tenantId,
      manifest: m ? { tenantId: m.tenantId, complete: m.complete, day: m.day } : null,
      user: WALK.user,
      periods: PER,
      steps: ["user", "law", "engine", "book", "employees", "opening", "runs", "cert", "filings", "bank", "labour", "line", "notices", "todo-4.3", "todo-4.8"],
    };
    throw new Done();
  }

  // ── รันซ้ำ: manifest ครบ + ร้านเดิม ⇒ ไม่เขียน ──
  if (m && m.complete && m.tenantId === tenantId) {
    const now = await digestOf(tenantId, await tenantTables());
    const changed = diffDigest(m.after ?? {}, now);
    summary.idempotent = true;
    summary.changedSinceUp = changed;
    summary.ids = m.ids;
    summary.counts = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v.n]));
    console.log(`♻️  manifest ครบ (ขึ้นเมื่อ ${m.day}) — ไม่เขียนอะไร · ตารางที่เปลี่ยนหลังขึ้น: ${changed.length ? changed.join(" · ") : "ไม่มี"}`);
    exitCode = changed.length ? 1 : 0;
    throw new Done();
  }
  if (m) {
    console.log(`🧹 manifest ค้าง (ครบ=${m.complete} · ร้าน ${m.tenantId}) — ถอดก่อนขึ้นใหม่`);
    const res = await down(m, tenantId);
    if (res.some((x) => !x.startsWith("ร้านในฐาน"))) {
      summary.residue = res;
      console.error(`❌ ถอดของเดิมไม่สะอาด: ${res.join(" · ")}`);
      exitCode = 1;
      throw new Done();
    }
    rmSync(WALK.manifestPath, { force: true });
    m = null;
  }

  // ── ภาพฐาน ──
  const tables = await tenantTables();
  const startedAt = ((await P.$queryRaw`SELECT (now() - interval '2 seconds') AS t`) as { t: Date }[])[0]!.t.toISOString();
  const hrRow = await P.appSystem.findFirst({ where: { id: ctx.systemId }, select: { settings: true } });
  const man: Manifest = {
    $note: "seed-hr-walk.mts manifest — never commit. --down uses baseline.ids to remove exactly what the walk seed added.",
    tenantId,
    day: D.today,
    startedAt,
    complete: false,
    hrSettingsBefore: hrRow?.settings ?? null,
    rateKeysBefore: ((await P.chatRateBucket.findMany({ where: { key: { contains: tenantId } }, select: { key: true } })) as { key: string }[]).map((r) => r.key),
    baseline: { ids: await idsOf(tenantId, tables), digest: await digestOf(tenantId, tables) },
    lawKeys: [],
    userEmail: WALK.user.email,
    ids: { periods: PER },
    users: {},
  };
  writeManifest(man);
  console.log(`📸 ภาพฐาน ${Object.keys(man.baseline.digest).length} ตาราง · เริ่ม ${startedAt}`);

  const pay = (await import("@/lib/modules/hr/payroll" as string)) as Any;
  const hr = (await import("@/lib/modules/hr/service" as string)) as Any;
  const opening = (await import("@/lib/modules/hr/payroll-opening" as string)) as Any;
  const slip = (await import("@/lib/modules/hr/payslip" as string)) as Any;
  const filings = (await import("@/lib/modules/hr/filings/service" as string)) as Any;
  const bank = (await import("@/lib/modules/hr/bank-files/service" as string)) as Any;
  const labor = (await import("@/lib/modules/hr/labor" as string)) as Any;
  const lineNotify = (await import("@/lib/modules/hr/line-notify" as string)) as Any;
  const lineLink = (await import("@/lib/modules/hr/line-link" as string)) as Any;
  const sys = (await import("@/lib/modules/system/service" as string)) as Any;
  const finance = (await import("@/lib/modules/account/finance" as string)) as Any;

  const owner = await viewerOf(uid("owner"));
  const ownerActor = { userId: uid("owner"), isOwner: true };
  const payrollV = await viewerOf(uid("payroll"));
  const payrollActor = { userId: uid("payroll"), isOwner: false };

  // 1. ผู้ใช้ payroll-branch (ผู้ดูเงินเดือน · สาขาหัวหินเท่านั้น · + pos.report.view ให้การ์ดค่าแรงเห็นยอดขาย)
  await step("user.payroll-branch", async () => {
    const left = await P.user.findFirst({ where: { email: WALK.user.email }, select: { id: true } });
    if (left && (await P.membership.count({ where: { userId: left.id } })) === 0) await P.user.delete({ where: { id: left.id } });
    const u = left && (await P.membership.count({ where: { userId: left.id } })) > 0 ? left : await P.user.create({ data: { email: WALK.user.email, name: WALK.user.name } });
    const keys = { ...(HQC.users.payroll.keys as Record<string, boolean>), "pos.report.view": true };
    const mm = (await P.membership.findFirst({ where: { userId: u.id, tenantId } })) ?? (await P.membership.create({ data: { userId: u.id, tenantId, role: WALK.user.role, unitAccess: WALK.user.units.map((k) => units[k]!), permissions: keys, acceptedAt: new Date() } }));
    man.users[WALK.user.key] = { userId: u.id, membershipId: mm.id, email: WALK.user.email };
    return { ok: true, reason: `user ${u.id} · units ${WALK.user.units.join(",")}` };
  }, (r) => r.ok, (r) => r.reason);

  // 2. กฎหมาย ACTIVE ใต้ sourceKey ของตัวเอง (มติ Q7) — วันที่มีผล = 1 ม.ค. ปีที่แล้ว (เลื่อนวันถ้าชนแถว ACTIVE ของคนอื่นชนิดเดียวกัน)
  await step("law.active", async () => {
    const V = JSON.parse(readFileSync("scripts/fixtures/hr-h3.4-vectors.json", "utf8")).law as Record<string, unknown>;
    const made: string[] = [];
    for (const [kind, j] of [["SSO", V.SSO], ["TAX_BRACKET", V.TAX_BRACKET], ["DEDUCTION", V.DEDUCTION]] as const) {
      let day = `${Y - 1}-01-01`;
      for (let i = 0; i < 5 && (await P.hrLawTable.count({ where: { kind, status: "ACTIVE", effectiveFrom: new Date(`${day}T00:00:00Z`) } })) > 0; i++) day = addDays(day, 1);
      const key = `${WALK.lawPrefix}${kind}`;
      await P.hrLawTable.create({ data: { kind, effectiveFrom: new Date(`${day}T00:00:00Z`), json: j, status: "ACTIVE", sourceKey: key, note: "qc H5.1 walk fixture (lane DB only)", approvedByName: "QC walk", approvedAt: new Date() } });
      man.lawKeys.push(key);
      made.push(`${kind}@${day}`);
    }
    writeManifest(man);
    return { ok: true, reason: made.join(" · ") };
  }, (r) => r.ok, (r) => r.reason);

  // 3. เครื่องคิดเงินเดือนรุ่น 2 (service ในนามเจ้าของ)
  await step("engine.v2", () => pay.setPayrollEngine(ctx, owner, { engineVersion: 2 }));

  // 4. สมุดบัญชีเงินเดือน + บัญชีจ่าย
  if (accSys) {
    await step("book.link", () => pay.setPayrollBook(ctx, owner, { accountSystemId: accSys }));
    const fa = await step("book.finance", () => finance.createFinanceAccount({ tenantId, systemId: accSys, type: "BANK", name: "บัญชีจ่ายเงินเดือน (QC walk)", bankName: "KBank", accountNo: "1112223334", accountName: "บ้านกาแฟสวนผึ้ง" }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `finance ${r.id}` : r?.reason));
    if ((fa as Any)?.ok) {
      man.ids.financeAccountId = (fa as Any).id;
      await step("book.payAccount", () => pay.setPayrollPayAccount(ctx, owner, { financeAccountId: (fa as Any).id }));
    }
  } else steps.push({ id: "book", ok: false, note: "ร้านไม่มีระบบบัญชี" });

  // 5. พนักงานเสริม 2 คน (ยอดยกมา: กรอก / ขาด)
  const W = WALK.employees;
  const startView = `${Y}-${W.view.startMonthDay}`;
  const mkEmp = async (key: "view", start: string, extra: Record<string, unknown>) => {
    const e = W[key];
    const { id } = await hr.createEmployee(ctx, { name: e.name, position: e.position, unitId: units.huahin });
    const r = await hr.saveEmployeeProfile(ctx, id, { employmentStatus: "ACTIVE", code: e.code, nickname: e.name, department: e.department, employmentType: "FULL_TIME", startDate: start, ...extra });
    if (!r?.ok) return { ok: false, reason: `profile ${r?.reason}` };
    await pay.setSalaryProfile(ctx, { employeeId: id, baseSalarySatang: e.baseSalarySatang, ssoEligible: true });
    man.ids[`emp.${key}`] = id;
    return { ok: true, reason: `${e.name} ${id} เริ่ม ${start}` };
  };
  await step("emp.view", () =>
    mkEmp("view", startView, { nationalId: thaiId("110000000881"), bankName: "KBank", bankAccountNo: "0000088123", bankAccountName: "วิว ทดสอบ", addressLine: "9/9 ถ.นเรศดำริ", subdistrict: "หัวหิน", district: "หัวหิน", province: "ประจวบคีรีขันธ์", postcode: "77110" }),
  );
  writeManifest(man);

  // 6. ยอดยกมา (วิว = กรอกแล้ว ณ สิ้นเดือนก่อนรอบรุ่น 2 แรก (ร่าง −5) — ต้อง < วันจ่ายของรอบ · ที่เหลือไม่กรอก ⇒ คำเตือนบนร่าง)
  const openAsOf = lastDayOf(periodOf(WALK.runs.DRAFT - 1));
  const openMonths = Number(openAsOf.slice(5, 7));
  if (man.ids["emp.view"]) {
    await step("opening.view", () =>
      opening.saveOpeningYtd(ctx, owner, { employeeId: man.ids["emp.view"], taxYear: Y, asOfDay: openAsOf, months: openMonths, incomeSatang: openMonths * W.view.baseSalarySatang, whtSatang: openMonths * 2_500, ssoSatang: openMonths * 75_000, expectRev: null }),
    );
  }

  // 7. รอบรุ่น 2: กลับรายการ (−4) · อนุมัติ (−3) · จ่ายแล้ว (−2) · ร่าง (เดือนนี้ · มีคำเตือนยอดยกมา)
  man.ids.runs = {} as Record<string, string>;
  const payDateOf = (pk: string) => atBkk(lastDayOf(pk), 12 * 60);
  const create = async (state: keyof typeof PER) => {
    const pk = PER[state];
    const r = await pay.createPayrollRunV2(ctx, payrollV, { periodKey: pk, payDate: payDateOf(pk) }, { actor: payrollActor });
    if (r?.ok) man.ids.runs[state] = r.id;
    writeManifest(man);
    return r;
  };
  for (const st of ["REVERSED", "APPROVED", "PAID"] as const) {
    const c = await step(`run.${st}.create ${PER[st]}`, () => create(st), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.id} · ${r.employees} คน` : `${r?.code} ${r?.reason}`));
    if (!(c as Any)?.ok) continue;
    const id = (c as Any).id as string;
    const a = await step(`run.${st}.approve`, () => pay.approveRun(ctx, id, undefined, ownerActor), (r: Any) => r?.ok, (r: Any) => `${r?.code ?? ""} ${r?.note ?? ""}`);
    if (!(a as Any)?.ok) continue;
    if (st === "REVERSED") await step("run.REVERSED.reverse", () => pay.reverseRun(ctx, id, "QC walk: สถานะกลับรายการ", ownerActor), (r: Any) => r?.ok, (r: Any) => `${r?.code ?? ""} ${r?.note ?? ""}`);
    if (st === "PAID") await step("run.PAID.markPaid", () => pay.markPaidRun(ctx, id, { actor: ownerActor, paidOn: lastDayOf(PER.PAID), ...(man.ids.financeAccountId ? { financeAccountId: man.ids.financeAccountId } : {}) }), (r: Any) => r?.ok, (r: Any) => `${r?.code ?? ""} ${r?.note ?? ""}`);
  }
  const dr = await step(`run.DRAFT.create ${PER.DRAFT}`, () => create("DRAFT"), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.id} · ${r.employees} คน` : `${r?.code} ${r?.reason}`));
  if ((dr as Any)?.ok) {
    await step("run.DRAFT.ytdWarning", async () => {
      const pv = await pay.previewPayrollRunV2(ctx, owner, { runId: (dr as Any).id });
      const review = ((pv as Any)?.review ?? []) as { employeeId: string; code: string }[];
      const miss = review.filter((x) => x.code === "YTD_OPENING").map((x) => x.employeeId);
      return { ok: miss.includes(emp.namfon) && !miss.includes(man.ids["emp.view"]), reason: `YTD_OPENING ${miss.length} คน (น้ำฝน ${miss.includes(emp.namfon) ? "มี" : "ไม่มี"} · วิว ${miss.includes(man.ids["emp.view"]) ? "มี" : "ไม่มี"})` };
    }, (r) => r.ok, (r) => r.reason);
  }

  // 8a. ข้อมูลผู้จ่ายเงิน (ทั้งหนังสือรับรองเงินเดือนและแบบยื่นใช้ชื่อนายจ้าง/ผู้ลงนามจากที่นี่)
  await step("filing.profile", () =>
    filings.saveFilingProfile(ctx, owner, { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท บ้านกาแฟสวนผึ้ง (QC) จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000051", rdFormFlag: 1, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" }),
  );
  // 8. หนังสือรับรองเงินเดือน: ออก 1 ใบ (เจ้าของ → น้ำฝน) + คำขอค้าง 1 (น้ำฝนขอเอง · ชนิด CERT ในกล่องคำขอ)
  const cert = await step("cert.issue", () => slip.issueSalaryCertificate(ctx, owner, { employeeId: emp.namfon, purpose: "GENERAL" }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.certId} ${r.docNo}` : `${r?.code} ${r?.reason}`));
  if ((cert as Any)?.ok) man.ids.certIssued = (cert as Any).certId;
  const req = await step("cert.request", async () => slip.requestSalaryCertificate(await selfOf(uid("staff")), { purpose: "BANK" }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.certId}` : `${r?.code} ${r?.reason}`));
  if ((req as Any)?.ok) man.ids.certPending = (req as Any).certId;

  // 9. แบบยื่น: ข้อมูลผู้จ่าย + บุคคล → ภ.ง.ด.1 + สปส.1-10 (รอบที่จ่ายแล้ว) + 50 ทวิ (วิว · ANNUAL · now = 5 ม.ค. ปีหน้า — ANNUAL ออกได้หลังสิ้นปีภาษี)
  for (const [k, id, first] of [["view", man.ids["emp.view"], "วิว"], ["namfon", emp.namfon, "น้ำฝน"], ["bow", emp.bow, "พิมพ์ชนก"]] as const) {
    if (id) await step(`filing.person.${k}`, () => filings.saveFilingPerson(ctx, owner, { employeeId: id, title: "นางสาว", firstName: first, lastName: "ใจดี" }));
  }
  const paidRun = man.ids.runs.PAID as string | undefined;
  const g1 = await step(`filing.PND1 ${PER.PAID}`, () => filings.generateFiling(ctx, owner, { kind: "PND1", period: PER.PAID }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.fileId} ${r.lineCount} บรรทัด` : `${r?.code} ${r?.reason}`));
  if ((g1 as Any)?.ok) man.ids.filingPnd1 = (g1 as Any).fileId;
  if (paidRun) {
    const g2 = await step("filing.SSO110", () => filings.generateFiling(ctx, owner, { kind: "SSO110", runId: paidRun }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.fileId} ${r.lineCount} บรรทัด` : `${r?.code} ${r?.reason}`));
    if ((g2 as Any)?.ok) man.ids.filingSso = (g2 as Any).fileId;
  }
  if (man.ids["emp.view"]) {
    const c50 = await step("filing.50tawi", () => filings.issueTaxCertificate(ctx, owner, { employeeId: man.ids["emp.view"], taxYear: Y, kind: "ANNUAL" }, { now: new Date(`${Y + 1}-01-05T03:00:00Z`) }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.certId} ${r.docNo}` : `${r?.code} ${r?.reason}`));
    if ((c50 as Any)?.ok) man.ids.taxCert = (c50 as Any).certId;
  }

  // 10. ไฟล์โอน: บัญชีต้นทาง + KBANK_PCT (รับทราบยังไม่ทดสอบ) → ไฟล์ของรอบที่จ่ายแล้ว
  await step("bank.profile", () => bank.saveBankProfile(ctx, owner, { debitBankCode: "004", debitAccountNo: "1112223334", debitBranchCode: null, companyNameEn: "QC SHOP CO", ktbCompanyId: null, formatsEnabled: ["KBANK_PCT"], acknowledgeUntested: true }));
  if (paidRun) {
    const bf = await step("bank.file", () => bank.generateBankFile(ctx, owner, { runId: paidRun, format: "KBANK_PCT", options: {} }), (r: Any) => r?.ok, (r: Any) => (r?.ok ? `${r.fileId} ${r.itemCount} คน` : `${r?.code} ${r?.reason}`));
    if ((bf as Any)?.ok) man.ids.bankFile = (bf as Any).fileId;
  }
  writeManifest(man);

  // 11. ค่าแรงต่อยอดขาย: ระบบ POS + ผูกหัวหิน + ยอดขายรายชั่วโมง วันนี้/เมื่อวาน (PosSale ตรง — แบบ h4.2) + ค่าตั้ง splh
  await step("labour.pos", async () => {
    const pos = await sys.createSystem(tenantId, "POS", "POS หน้าร้าน (QC walk)");
    await sys.linkUnit(tenantId, pos.id, units.huahin);
    man.ids.posSystem = pos.id;
    let n = 0;
    for (const day of [addDays(D.today, -1), D.today]) {
      for (let h = 8; h <= 20; h++) {
        const at = atBkk(day, h * 60 + 10);
        const grand = 150_000 + ((h * 37) % 9) * 40_000;
        await P.posSale.create({ data: { tenantId, unitId: units.huahin, systemId: pos.id, idempotencyKey: `qc-hr-walk-${day}-${h}`, status: "PAID", docType: "SALE", subtotalSatang: grand, grandTotalSatang: grand, createdAt: at, paidAt: at } });
        n++;
      }
    }
    return { ok: true, reason: `POS ${pos.id} · ${n} บิล (08–20 น. × 2 วัน)` };
  }, (r) => r.ok, (r) => r.reason);
  await step("labour.settings", () => labor.setLaborSettings(ctx, owner, { targetTenths: 280, splhSatang: 150_000, minStaff: 1 }));

  // 12. LINE (ปลอม): ระบบแชท + ห้อง LINE + ผูกสาขา · นโยบายเปิด · น้ำฝน = ผูกแล้ว · ก้อย = รอรหัส · ที่เหลือ = ยังไม่ผูก
  await step("line.room", async () => {
    const chat = await sys.createSystem(tenantId, "CHAT", "แชท (QC walk)");
    const conn = await P.chatChannelConnection.create({ data: { tenantId, systemId: chat.id, type: "LINE", displayName: "qc-hr-walk LINE", externalAccountId: `qc-hr-walk-${tenantId.slice(-6)}`, credentials: { channelAccessToken: "qc-walk-fake-token", channelSecret: "qc-walk-fake-secret" }, meta: { basicId: "@qcwalk" } } });
    for (const u of Object.values(units)) await P.settingValue.create({ data: { tenantId, key: "messaging.lineConnectionId", scope: "UNIT", scopeId: u, value: conn.id } });
    man.ids.chatSystem = chat.id;
    man.ids.lineConnection = conn.id;
    return { ok: true, reason: `CHAT ${chat.id} · LINE ${conn.id}` };
  }, (r) => r.ok, (r) => r.reason);
  await step("line.policy.on", () => lineNotify.saveLineNotifyPolicy(ctx, owner, { enabled: true, events: { ROSTER: true, LEAVE: true, OT: true, SWAP: true, SLIP: true }, mode: "IMMEDIATE", digestAt: "17:30", monthlyCap: 200, unitId: null }));
  if (man.ids.lineConnection) {
    await step("line.linked.namfon", async () => {
      const b = await lineLink.beginLineLink(await selfOf(uid("staff")));
      if (!b?.ok) return { ok: false, reason: `begin ${b?.code} ${b?.reason}` };
      const contact = await P.chatContact.create({ data: { tenantId, systemId: man.ids.chatSystem, channel: "LINE", channelConnectionId: man.ids.lineConnection, externalUserId: "Uqcwalk0000000000000000000000001", displayName: "น้ำฝน (LINE ทดสอบ)", lang: "th" } });
      const c = await lineLink.completeLineLink({ tenantId, connectionId: man.ids.lineConnection, chatContactId: contact.id, linkId: b.linkId });
      return { ok: !!c?.ok, reason: c?.ok ? `link ${b.linkId}` : "complete ไม่ผ่าน" };
    }, (r) => r.ok, (r) => r.reason);
    await step("line.pending.koy", async () => {
      const b = await lineLink.beginLineLink(await selfOf(uid("payrollSelf")), { now: new Date(Date.now() + 6 * 86_400_000) });
      return b?.ok ? { ok: true, reason: `link ${b.linkId} หมดอายุ ${new Date(b.expiresAt).toISOString()}` } : { ok: false, reason: `${b?.code} ${b?.reason}` };
    }, (r) => r.ok, (r) => r.reason);
  }

  // 13. แจ้งเตือน HR (ในแอป + คิว LINE) จากเหตุการณ์ที่มีอยู่แล้ว (ประกาศตารางกะของ seed · จ่ายรอบของ walk) — ไม่ระบายคิว outbox ไม่ส่ง LINE
  await step("notices", async () => {
    const evts = (await P.outboxEvent.findMany({ where: { tenantId, type: { in: ["hr.roster.published", "hr.payroll.paid"] } }, select: { id: true, tenantId: true, systemId: true, type: true, payload: true }, orderBy: { createdAt: "asc" } })) as Any[];
    let n = 0;
    for (const e of evts) n += ((await lineNotify.planHrNotices(e))?.ids ?? []).length;
    return { ok: n > 0, reason: `${evts.length} เหตุการณ์ → ${n} แจ้งเตือน` };
  }, (r) => r.ok, (r) => r.reason);

  // 14. TODO hooks — ใบที่ยังไม่อยู่บน branch นี้ (ไม่มีโมดูล = ข้าม ไม่ล้ม)
  //   H4.3 ข้อเสนอ AI (hr_draft_roster 1 + hr_flag_pattern 1) · H4.8 การ์ด API key (ใช้อยู่ 1 + เพิกถอน 1) — เติมเมื่อ merge (ผ่าน service ของใบนั้น)
  for (const [id, file, what] of [
    ["todo.H4.3", "src/lib/modules/hr/ai-proposals.ts", "ข้อเสนอ AI hr_draft_roster + hr_flag_pattern"],
    ["todo.H4.8", "src/lib/modules/hr/api-keys.ts", "API key ใช้อยู่ 1 + เพิกถอน 1"],
  ] as const) {
    if (!existsSync(file)) steps.push({ id, ok: true, note: `ข้าม — ยังไม่มี ${file} (${what}) · TODO เมื่อ merge` });
    else steps.push({ id, ok: false, note: `มี ${file} แล้ว แต่ยังไม่ได้เขียนขั้น seed (${what}) — เติมก่อนเดิน` });
  }

  // ── ปิด ──
  const after = await digestOf(tenantId, await tenantTables());
  man.after = after;
  man.steps = steps;
  man.complete = steps.every((s) => s.ok);
  writeManifest(man);
  summary.ids = man.ids;
  summary.users = man.users;
  summary.added = diffDigest(man.baseline.digest, after);
  summary.counts = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v.n]));
  summary.complete = man.complete;
  exitCode = man.complete ? 0 : 1;
} catch (e) {
  if (!(e instanceof Done)) {
    summary.fatal = (e instanceof Error ? e.stack ?? e.message : String(e)).split("\n").slice(0, 4).join(" | ").slice(0, 500);
    exitCode = 1;
  }
} finally {
  await P.$disconnect?.();
}
summary.steps = steps;
summary.failed = steps.filter((s) => !s.ok).map((s) => `${s.id}: ${s.note}`);
summary.seconds = Math.round((Date.now() - t0) / 100) / 10;
console.log(`\nJSON_SUMMARY ${JSON.stringify(summary)}`);
process.exit(exitCode);
