// seed-crm-perf.mts — ชุดข้อมูลขนาดจริงสำหรับวัดเกณฑ์ประสิทธิภาพ §12 (CRM v2 ใบ C5.1 · มติ C26)
//
// ใช้ (QC2 เท่านั้น — ผ่าน scripts/qc2.sh ที่ตั้ง .env.qc2 + ด่าน URL):
//   bash scripts/qc2.sh pnpm exec tsx scripts/seed-crm-perf.mts            # สร้าง/ต่อจากจุดที่ค้าง (resumable · idempotent)
//   bash scripts/qc2.sh pnpm exec tsx scripts/seed-crm-perf.mts --drop     # ลบร้าน crm-perf-qc ทั้งหมด + ตรวจว่าเหลือ 0 แถวทุกตาราง
//   bash scripts/qc2.sh pnpm exec tsx scripts/seed-crm-perf.mts --status   # นับแถวของร้านนี้ต่อตาราง
//   งานยาว: systemd-run --unit=crm-c51-seed --collect -p MemoryMax=5G --setenv=PATH="$PATH" --setenv=HOME=/root \
//             bash -c 'cd /root/projects/shark-crm-c51 && bash scripts/qc2.sh pnpm exec tsx scripts/seed-crm-perf.mts'
//
// ร้านแยก `crm-perf-qc` (ไม่แตะร้านอื่นเลย) · 1 ระบบ CRM · ผู้ติดต่อ 200,000 · บริษัท 50,000 (+ Party 50,000) ·
// ดีลเปิด 20,000 ใน 2 pipeline (+ ปิดแล้ว 6,000: ชนะ 4,000 / แพ้ 2,000 ให้ funnel/forecast มีของจริง) · ประวัติขั้นทุกดีล ·
// กิจกรรม 1,000,000 (400k ผูกดีล · 600k ผูกผู้ติดต่อ โดย 30% กองอยู่ที่ผู้ติดต่อ "ตัวหนัก" ไม่กี่ร้อยคน) ·
// ฟิลด์ผู้ติดต่อ 30 (กรองได้ 10) · วัตถุกำหนดเอง 3 × 100,000 รายการ · อีเมล 30,000 + event · ลิงก์ติดตาม 200 · web session 30,000
//
// 🔴 วิธีเขียน: แถวจำนวนมากสร้าง "ในฐานข้อมูล" ด้วย INSERT … SELECT generate_series เป็นก้อน (≤ 50,000 แถว/คำสั่ง) —
//    ไม่ต้องส่งข้อมูลข้ามเครือข่าย · ค่าสุ่มเป็น md5 ของเลขแถว ⇒ ข้อมูลเหมือนเดิมทุกครั้งที่สร้างใหม่ (วัดซ้ำเทียบกันได้)
// 🔴 id ของแถวจำนวนมาก = `pf<ชนิด>_<เลข>` (ไม่ใช่ cuid) ⇒ ON CONFLICT DO NOTHING ทำให้รันซ้ำ/ต่อจากที่ค้างได้
//    ความคืบหน้าเก็บที่ `AppSystem.settings.perfSeed` ของระบบ CRM ในร้านนี้เอง (ลบไปพร้อมร้าน)
// 🔴 ไม่เรียก service ที่ยิง event (ไม่มี outbox จากเมล็ดข้อมูล) — โครงของร้าน (ระบบ · pipeline แรก · uiVersion · ค่าอีเมล)
//    ผ่าน service จริง (`system.createSystem` · `crm.ensureCrm` · `setCrmSettingsKey` · `setCrmEmailKeys`) เหมือน seed-crm-qc
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ARGV = process.argv.slice(2);
const DROP = ARGV.includes("--drop");
const STATUS = ARGV.includes("--status");

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const env = accEnv.loadQcEnv();
// 🔴 QC2 เท่านั้น (brief C5.1) — qc2.sh ตรวจแล้ว ตรวจซ้ำที่นี่เผื่อมีคนเรียกตรง
for (const u of [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? ""]) {
  if (!u.includes("ep-cool-shadow") || process.env.QC_BRANCH !== "qc2") {
    console.error("🔴 seed-crm-perf: ต้องรันผ่าน scripts/qc2.sh (QC2 · ep-cool-shadow) เท่านั้น — หยุด");
    process.exit(4);
  }
}

const SLUG = "crm-perf-qc";
const USER_EMAIL = (n: number) => `crm-perf-qc+u${String(n).padStart(2, "0")}@example.test`;
const USER_EMAIL_LIKE = "crm-perf-qc+u%@example.test";
// PERF_SCALE (ทดลองสคริปต์เร็ว ๆ เช่น 0.01) — ค่าปริยาย 1 = ขนาดจริงตามมติ C26
const SCALE = Math.min(1, Math.max(0.001, Number(process.env.PERF_SCALE ?? "1") || 1));
const N0 = {
  contacts: 200_000,
  companies: 50_000,
  openDeals: 20_000,
  wonDeals: 4_000,
  lostDeals: 2_000,
  activitiesDeal: 400_000,
  activitiesContact: 600_000,
  recordsPerObject: 100_000,
  emails: 30_000,
  emailEvents: 40_000,
  links: 200,
  linkClicks: 50_000,
  webSessions: 30_000,
  webEvents: 150_000,
};
const N = Object.fromEntries(Object.entries(N0).map(([k, v]) => [k, Math.max(10, Math.round(v * SCALE))])) as typeof N0;
const DEALS_TOTAL = N.openDeals + N.wonDeals + N.lostDeals;

const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const t0 = Date.now();
const log = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)} +${Math.round((Date.now() - t0) / 1000)}s] ${s}`);

// ═══════════════════ ตารางทั้งหมดที่มีคอลัมน์ tenantId (ใช้ทั้ง --drop และ --status) ═══════════════════
async function tenantTables(): Promise<string[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as { t: string }[];
  return rows.map((r) => r.t);
}
async function countsFor(tenantId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await tenantTables()) {
    const [r] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tenantId)) as { n: number }[];
    if (r && r.n > 0) out[t] = r.n;
  }
  return out;
}

const existing = (await P.tenant.findFirst({ where: { slug: SLUG }, select: { id: true } })) as { id: string } | null;

if (STATUS) {
  if (!existing) console.log(`ไม่มีร้าน ${SLUG}`);
  else {
    const c = await countsFor(existing.id);
    console.log(JSON.stringify({ tenantId: existing.id, counts: c }, null, 1));
    const [sz] = (await prisma.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`)) as { s: string }[];
    console.log(`db size ${sz?.s}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

// ═══════════════════ --drop: ลบร้านทั้งหมด (ลูกใหญ่ก่อน → ทุกตารางที่มี tenantId → Tenant → ผู้ใช้) ═══════════════════
if (DROP) {
  if (!existing) {
    const users = await P.user.count({ where: { email: { startsWith: "crm-perf-qc+u", endsWith: "@example.test" } } });
    if (users) await P.user.deleteMany({ where: { email: { startsWith: "crm-perf-qc+u", endsWith: "@example.test" } } });
    console.log(`ไม่มีร้าน ${SLUG} (ลบผู้ใช้ค้าง ${users})`);
    console.log(`DROP_SUMMARY ${JSON.stringify({ tenant: 0, users: 0, leftover: {} })}`);
    await prisma.$disconnect();
    process.exit(0);
  }
  const tid = existing.id;
  log(`ลบร้าน ${SLUG} ${tid}`);
  const FIRST = [
    "CustomRecordValue", "CustomRecordValueHistory", "CrmActivity", "CrmDealStageHistory", "CrmEmailEvent", "CrmWebEvent", "CrmTrackedClick",
    "CrmEmailMessage", "CrmWebSession", "CrmTrackedLink", "CustomRecord", "CrmCompanyContact", "CrmDealContact", "CrmDealLine",
    "CrmDeal", "CrmContact", "CrmCompany", "Party",
  ];
  const all = await tenantTables();
  const order = [...FIRST.filter((t) => all.includes(t)), ...all.filter((t) => !FIRST.includes(t))];
  // ลบเป็นก้อน (ctid) — ตารางใหญ่ไม่ค้างเป็นคำสั่งเดียวยาว ๆ · FK ล้ม (23503) = ข้ามไปรอบถัดไป
  for (let pass = 1; pass <= 4; pass += 1) {
    let pending = 0;
    for (const t of order) {
      try {
        for (;;) {
          const n = await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE ctid IN (SELECT ctid FROM "${t}" WHERE "tenantId" = $1 LIMIT 50000)`, tid);
          if (n > 0) log(`  ${t} −${n}`);
          if (n < 50000) break;
        }
      } catch (e) {
        pending += 1;
        if (pass === 4) console.error(`  ❌ ${t}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (pending === 0) break;
  }
  await P.tenant.deleteMany({ where: { id: tid, slug: SLUG } });
  const u = await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "email" LIKE $1`, USER_EMAIL_LIKE);
  // ตรวจ: ทุกตารางที่มี tenantId = 0 แถว · Tenant = 0 · User = 0
  const left = await countsFor(tid);
  const tenantLeft = await P.tenant.count({ where: { OR: [{ id: tid }, { slug: SLUG }] } });
  const [ul] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE "email" LIKE $1`, USER_EMAIL_LIKE)) as { n: number }[];
  log(`ลบผู้ใช้ ${u} · เหลือ: ร้าน ${tenantLeft} · ผู้ใช้ ${ul?.n} · ตารางที่ยังมีแถว ${Object.keys(left).length}`);
  console.log(`DROP_SUMMARY ${JSON.stringify({ tenantId: tid, tenant: tenantLeft, users: ul?.n ?? -1, leftover: left })}`);
  await prisma.$disconnect();
  process.exit(tenantLeft === 0 && (ul?.n ?? 1) === 0 && Object.keys(left).length === 0 ? 0 : 1);
}

// ═══════════════════ 0. โครงร้าน (idempotent — หาเจอ = ใช้ของเดิม) ═══════════════════
const sysSvc = await import("@/lib/modules/system/service");
const crm = await import("@/lib/modules/crm/service");
const crmSettings = (await import("@/lib/modules/crm/settings" as string)) as Any;
const access = (await import("@/lib/modules/crm/access" as string)) as { CRM_ROLE_DEFAULTS: { STAFF: readonly string[] } };

const tenant = existing ?? (await P.tenant.create({ data: { name: "CRM PERF QC (ข้อมูลทดสอบขนาดจริง · ลบได้)", slug: SLUG, plan: "FREE" }, select: { id: true } }));
const tenantId: string = tenant.id;
log(`ร้าน ${SLUG} ${tenantId} (${existing ? "มีอยู่แล้ว — ต่อจากเดิม" : "สร้างใหม่"})`);

const unitDefs = [
  { slug: "perf-bkk", name: "สาขากรุงเทพ" },
  { slug: "perf-hkt", name: "สาขาภูเก็ต" },
];
const units: string[] = [];
for (const [i, u] of unitDefs.entries()) {
  const row = (await P.businessUnit.findFirst({ where: { tenantId, slug: u.slug }, select: { id: true } })) ?? (await P.businessUnit.create({ data: { tenantId, type: "SHOP", name: u.name, slug: u.slug, sortOrder: i }, select: { id: true } }));
  units.push(row.id);
}

// ผู้ใช้ 21: #1 เจ้าของ · #2–#3 ผู้จัดการ (#3 ถูกจำกัดสาขาภูเก็ต) · #4–#21 พนักงานขาย 18 (3 ทีม × 6 · คนแรกของทีม = หัวหน้า)
const FN = ["สมชาย", "วรรณา", "กิตติ", "นภา", "ธีระ", "ศิริพร", "อนุชา", "มาลี", "ประเสริฐ", "จันทร์เพ็ญ", "สุรชัย", "อรุณี", "วิชัย", "พรทิพย์", "ชัยวัฒน์", "สุดารัตน์", "ปิยะ", "รัตนา", "เอกชัย", "กนกวรรณ", "ณัฐพล"];
const staffPerms = Object.fromEntries(access.CRM_ROLE_DEFAULTS.STAFF.map((k) => [k, true]));
const userIds: string[] = [];
for (let n = 1; n <= 21; n += 1) {
  const email = USER_EMAIL(n);
  const user = (await P.user.findFirst({ where: { email }, select: { id: true } })) ?? (await P.user.create({ data: { email, name: `${FN[n - 1]} (perf)` }, select: { id: true } }));
  userIds.push(user.id);
  const role = n === 1 ? "OWNER" : n <= 3 ? "MANAGER" : "STAFF";
  const teamIdx = n >= 4 ? Math.floor((n - 4) / 6) : -1;
  const unitAccess = n === 1 || n === 2 ? ["*"] : n === 3 ? [units[1]] : [units[teamIdx === 1 ? 1 : 0]];
  const m = await P.membership.findFirst({ where: { userId: user.id, tenantId }, select: { id: true } });
  if (!m) await P.membership.create({ data: { userId: user.id, tenantId, role, unitAccess, permissions: role === "STAFF" ? staffPerms : {}, acceptedAt: new Date() } });
}
const ownerId = userIds[0]!;
const staffIds = userIds.slice(3);

// ระบบ CRM (ผ่าน service) + ผูกสาขา
let sys = (await P.appSystem.findFirst({ where: { tenantId, type: "CRM" }, select: { id: true, settings: true } })) as { id: string; settings: Any } | null;
if (!sys) {
  const s = await sysSvc.createSystem(tenantId, "CRM" as Any, "CRM (perf)");
  for (const u of units) await sysSvc.linkUnit(tenantId, s.id, u);
  sys = { id: s.id, settings: {} };
}
const SYS = sys.id;
const ctx = { tenantId, systemId: SYS };
await crmSettings.setCrmSettingsKey(ctx, "uiVersion", 2);
const INBOUND_KEY = "perfqcab"; // [a-z2-7]{8} — ที่อยู่ขาเข้า crm+perfqcab@shark.in.th
await crmSettings.setCrmEmailKeys(ctx, { inboundKey: INBOUND_KEY, inboundEnabled: true, strangerToLead: true, bccCaptureEnabled: true, trackOpens: true, trackClicks: true });
const SITE_KEY = "perfqcsite0001";
await prisma.$executeRawUnsafe(
  `UPDATE "AppSystem" SET "settings" = jsonb_set(jsonb_set("settings", '{crm,tracking}', COALESCE("settings"->'crm'->'tracking', '{}'::jsonb)), '{crm,tracking,web}', $2::jsonb) WHERE "id" = $1 AND "tenantId" = $3`,
  SYS,
  JSON.stringify({ enabled: true, siteKey: SITE_KEY, domains: ["perf.example.co.th"], consentVersion: 1, retentionDays: 180 }),
  tenantId,
);

// ความคืบหน้า (resumable): settings.perfSeed = { anchor, done: { "<phase>": <ก้อนล่าสุดที่เสร็จ> } }
const progRow = (await P.appSystem.findFirst({ where: { id: SYS }, select: { settings: true } })) as { settings: Any };
const prog: { anchor: string; done: Record<string, number> } = progRow.settings?.perfSeed ?? { anchor: new Date().toISOString(), done: {} };
const saveProg = () => prisma.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = jsonb_set("settings", '{perfSeed}', $2::jsonb) WHERE "id" = $1`, SYS, JSON.stringify(prog));
await saveProg();
const ANCHOR = prog.anchor; // เวลา "วันนี้" ของชุดข้อมูล (คงที่ตลอดการสร้าง — รันต่อวันหลังได้ข้อมูลเดิม)
log(`ระบบ CRM ${SYS} · anchor ${ANCHOR}`);

// ทีม 3 (unitIds) + สมาชิก
const teamDefs = [
  { name: "ทีมกรุงเทพ A (perf)", unit: 0 },
  { name: "ทีมภูเก็ต (perf)", unit: 1 },
  { name: "ทีมกรุงเทพ B (perf)", unit: 0 },
];
const teamIds: string[] = [];
for (const [i, t] of teamDefs.entries()) {
  const members = staffIds.slice(i * 6, i * 6 + 6);
  const row = (await P.team.findFirst({ where: { tenantId, name: t.name }, select: { id: true } })) ?? (await P.team.create({ data: { tenantId, name: t.name, leadUserId: members[0], unitIds: [units[t.unit]] }, select: { id: true } }));
  teamIds.push(row.id);
  for (const [k, uid] of members.entries()) {
    const has = await P.teamMember.findFirst({ where: { teamId: row.id, userId: uid }, select: { id: true } });
    if (!has) await P.teamMember.create({ data: { tenantId, teamId: row.id, userId: uid, role: k === 0 ? "LEAD" : "MEMBER" } });
  }
}
// กลุ่มผู้ดูแล (ถ่วงน้ำหนักด้วย pow(u,1.3) ⇒ คนต้นรายการได้มากกว่า): พนักงาน 18 → ผู้จัดการ 2 → เจ้าของ
const OWNER_POOL = [...staffIds, userIds[1]!, userIds[2]!, ownerId];
const OWNER_TEAM = OWNER_POOL.map((uid) => {
  const i = staffIds.indexOf(uid);
  return i >= 0 ? teamIds[Math.floor(i / 6)]! : null;
});

// pipeline 1 = ของเริ่มต้นจาก service (3 เปิด + ชนะ + แพ้ = 5 ขั้น — "กระดาน 5 ขั้น" ของ §12) · pipeline 2 = ต่ออายุ 4 เปิด + ชนะ + แพ้
const p1 = (await crm.ensureCrm(ctx)) as Any;
let p2 = (await P.crmPipeline.findFirst({ where: { tenantId, systemId: SYS, isDefault: false }, include: { stages: { orderBy: { sortOrder: "asc" } } } })) as Any;
if (!p2) {
  const names: [string, string, number][] = [["รอต่ออายุ", "OPEN", 20], ["เสนอเงื่อนไขใหม่", "OPEN", 40], ["ต่อรอง", "OPEN", 60], ["รอเซ็น", "OPEN", 85], ["ต่ออายุแล้ว", "WON", 100], ["ไม่ต่อ", "LOST", 0]];
  p2 = await P.crmPipeline.create({
    data: { tenantId, systemId: SYS, name: "ต่ออายุสัญญา", isDefault: false, sortOrder: 1, kind: "RENEWAL", stages: { create: names.map(([name, kind, probability], i) => ({ tenantId, systemId: SYS, name, kind, probability, sortOrder: i })) } },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
}
const stagesOf = (p: Any, kind: string) => (p.stages as { id: string; kind: string }[]).filter((s) => s.kind === kind).map((s) => s.id);
const P1_OPEN = stagesOf(p1, "OPEN");
const P2_OPEN = stagesOf(p2, "OPEN");
const CLOSED = [stagesOf(p1, "WON")[0]!, stagesOf(p1, "LOST")[0]!, stagesOf(p2, "WON")[0]!, stagesOf(p2, "LOST")[0]!];
const lostReasonIds: string[] = [];
for (const [i, label] of ["ราคาสูงไป", "เลือกคู่แข่ง", "ไม่มีงบ", "ติดต่อไม่ได้", "อื่น ๆ"].entries()) {
  const key = `perf${i + 1}`;
  const r = (await P.crmLostReason.findFirst({ where: { systemId: SYS, key }, select: { id: true } })) ?? (await P.crmLostReason.create({ data: { tenantId, systemId: SYS, key, label, sortOrder: i, active: true }, select: { id: true } }));
  lostReasonIds.push(r.id);
}
log(`โครงร้านพร้อม · ผู้ใช้ ${userIds.length} · ทีม ${teamIds.length} · pipeline 2 (${P1_OPEN.length}+2 · ${P2_OPEN.length}+2 ขั้น)`);

// ═══════════════════ ฟิลด์ผู้ติดต่อ 30 (กรองได้ 10) + วัตถุกำหนดเอง 3 ═══════════════════
type FDef = { key: string; label: string; type: string; filterable: boolean; choices?: string[] };
const CONTACT_FIELDS: FDef[] = [
  { key: "industry_pref", label: "อุตสาหกรรมที่สนใจ", type: "SELECT", filterable: true, choices: ["tech", "retail", "hotel", "food", "health", "edu", "logistics", "gov"] },
  { key: "budget", label: "งบประมาณ (บาท)", type: "NUMBER", filterable: true },
  { key: "renewal_date", label: "วันต่ออายุ", type: "DATE", filterable: true },
  { key: "vip", label: "ลูกค้า VIP", type: "BOOLEAN", filterable: true },
  { key: "region", label: "ภูมิภาค", type: "SELECT", filterable: true, choices: ["bkk", "north", "northeast", "central", "east", "south"] },
  { key: "employees", label: "จำนวนพนักงาน", type: "NUMBER", filterable: true },
  { key: "contract_end", label: "สัญญาสิ้นสุด", type: "DATE", filterable: true },
  { key: "segment", label: "กลุ่มลูกค้า", type: "TEXT", filterable: true },
  { key: "referral_code", label: "รหัสแนะนำ", type: "TEXT", filterable: true },
  { key: "nps", label: "คะแนน NPS", type: "NUMBER", filterable: true },
];
const EXTRA_TYPES = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "BOOLEAN"];
for (let i = 1; i <= 20; i += 1) CONTACT_FIELDS.push({ key: `extra_${String(i).padStart(2, "0")}`, label: `ข้อมูลเพิ่ม ${i}`, type: EXTRA_TYPES[(i - 1) % 5]!, filterable: false });

async function ensureSection(objectKey: string, key: string, label: string, sortOrder: number): Promise<string> {
  const s = (await P.memberSection.findFirst({ where: { systemId: SYS, objectKey, key }, select: { id: true } })) ?? (await P.memberSection.create({ data: { tenantId, systemId: SYS, objectKey, key, label, columns: 2, sortOrder }, select: { id: true } }));
  return s.id;
}
async function ensureField(objectKey: string, sectionId: string, f: FDef, sortOrder: number): Promise<string> {
  const got = (await P.memberField.findFirst({ where: { systemId: SYS, objectKey, key: f.key }, select: { id: true } })) as { id: string } | null;
  if (got) return got.id;
  const options = f.choices ? { choices: f.choices.map((c) => ({ value: c, label: c })) } : {};
  return (await P.memberField.create({ data: { tenantId, systemId: SYS, sectionId, objectKey, key: f.key, label: f.label, type: f.type, options, filterable: f.filterable, showInList: f.filterable && sortOrder < 4, sortOrder }, select: { id: true } })).id;
}
const contactFieldIds: string[] = [];
{
  const secs = [await ensureSection("contact", "perf_main", "ข้อมูลการขาย", 0), await ensureSection("contact", "perf_more", "ข้อมูลเพิ่มเติม", 1), await ensureSection("contact", "perf_misc", "อื่น ๆ", 2)];
  for (const [i, f] of CONTACT_FIELDS.entries()) contactFieldIds.push(await ensureField("contact", secs[Math.min(2, Math.floor(i / 10))]!, f, i));
}
type ODef = { key: string; label: string; plural: string; parent: "CONTACT" | "COMPANY"; titleKey: string; fields: FDef[] };
const OBJECTS: ODef[] = [
  { key: "car", label: "รถ", plural: "รถ", parent: "CONTACT", titleKey: "plate", fields: [{ key: "plate", label: "ทะเบียน", type: "TEXT", filterable: false }, { key: "brand", label: "ยี่ห้อ", type: "SELECT", filterable: true, choices: ["toyota", "honda", "isuzu", "mazda", "nissan", "mg", "byd", "bmw"] }, { key: "year", label: "ปีรถ", type: "NUMBER", filterable: true }, { key: "insured_until", label: "ประกันถึง", type: "DATE", filterable: false }] },
  { key: "contract", label: "สัญญา", plural: "สัญญา", parent: "COMPANY", titleKey: "contract_no", fields: [{ key: "contract_no", label: "เลขที่สัญญา", type: "TEXT", filterable: false }, { key: "value", label: "มูลค่า", type: "MONEY", filterable: true }, { key: "end_date", label: "วันสิ้นสุด", type: "DATE", filterable: true }, { key: "auto_renew", label: "ต่ออัตโนมัติ", type: "BOOLEAN", filterable: false }] },
  { key: "pet", label: "สัตว์เลี้ยง", plural: "สัตว์เลี้ยง", parent: "CONTACT", titleKey: "pet_name", fields: [{ key: "pet_name", label: "ชื่อ", type: "TEXT", filterable: false }, { key: "species", label: "ชนิด", type: "SELECT", filterable: true, choices: ["dog", "cat", "rabbit", "bird", "fish"] }, { key: "birth", label: "วันเกิด", type: "DATE", filterable: true }, { key: "vaccinated", label: "ฉีดวัคซีนแล้ว", type: "BOOLEAN", filterable: false }] },
];
const objectIds: string[] = [];
const objectFieldIds: string[][] = [];
for (const [oi, o] of OBJECTS.entries()) {
  const obj = (await P.customObject.findFirst({ where: { systemId: SYS, key: o.key }, select: { id: true } })) ?? (await P.customObject.create({ data: { tenantId, systemId: SYS, key: o.key, label: o.label, labelPlural: o.plural, parentType: o.parent, titleFieldKey: o.titleKey, showAsTab: true, sortOrder: oi }, select: { id: true } }));
  objectIds.push(obj.id);
  const sec = await ensureSection(o.key, "main", `รายละเอียด${o.label}`, 0);
  const ids: string[] = [];
  for (const [fi, f] of o.fields.entries()) ids.push(await ensureField(o.key, sec, f, fi));
  objectFieldIds.push(ids);
}
log(`ฟิลด์ผู้ติดต่อ ${contactFieldIds.length} · วัตถุ ${objectIds.length}`);

// ═══════════════════ ตัวช่วย SQL ═══════════════════
/** ค่าสุ่มคงที่ [0,1) จาก md5 ของ (expr, salt) — ข้อมูลเหมือนเดิมทุกครั้งที่สร้าง */
const U = (expr: string, salt: string) => `(('x' || substr(md5((${expr})::text || '${salt}'), 1, 8))::bit(32)::bigint::float8 / 4294967296.0)`;
const pad = (expr: string, w: number) => `lpad((${expr})::text, ${w}, '0')`;
const arr = (xs: string[]) => `ARRAY[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]`;
const A = `$1::timestamp`; // anchor (เวลา "วันนี้" ของชุดข้อมูล · timestamp UTC แบบคอลัมน์ Prisma)
const cid = (expr: string) => `'pfct_' || ${pad(expr, 7)}`;
const coid = (expr: string) => `'pfco_' || ${pad(expr, 6)}`;
const dlid = (expr: string) => `'pfdl_' || ${pad(expr, 6)}`;

async function phase(name: string, total: number, chunk: number, sqlFor: (lo: number, hi: number) => string, params: unknown[] = []): Promise<void> {
  const chunks = Math.ceil(total / chunk);
  const done = prog.done[name] ?? 0;
  if (done >= chunks) {
    log(`✓ ${name} (เสร็จแล้ว)`);
    return;
  }
  const ts = Date.now();
  let rows = 0;
  for (let c = done; c < chunks; c += 1) {
    const lo = c * chunk + 1;
    const hi = Math.min(total, (c + 1) * chunk);
    rows += await prisma.$executeRawUnsafe(sqlFor(lo, hi), ANCHOR, tenantId, SYS, ...params);
    prog.done[name] = c + 1;
    await saveProg();
  }
  log(`✓ ${name}: +${rows} แถว (${chunks - done} ก้อน · ${Math.round((Date.now() - ts) / 1000)}s)`);
}
// ทุกคำสั่ง: $1 anchor · $2 tenantId · $3 systemId · $4.. = params ของเฟส
const TH_FIRST = ["สมชาย", "สมหญิง", "วรรณา", "สมพงษ์", "นภา", "กิตติ", "อรุณี", "ประยุทธ", "ศิริพร", "ธีระ", "มณีรัตน์", "อนงค์", "ปิยะพงษ์", "จิราพร", "ณัฐวุฒิ", "สุภาพร", "วีระ", "ดารุณี", "ภูมิ", "ชนิดา"];
const TH_LAST = ["ศิริพงษ์", "แก้วมณี", "อินทร์แก้ว", "บุญมาก", "ทองดี", "พงษ์พันธ์", "สุขใจ", "รัตนโชติ", "วงศ์สวัสดิ์", "ศรีสุข", "จันทร์หอม", "มีสุข", "ชัยมงคล", "ธนากร", "เพชรรัตน์", "ปัญญาดี", "สายทอง", "บุญเรือง", "นาคสวัสดิ์", "ใจดี"];
const CO_WORDS = ["สยาม", "ไทยรุ่งเรือง", "อันดามัน", "เจริญกิจ", "ทรัพย์สิน", "ภูเก็ตทัวร์", "โกลบอล", "พัฒนา", "ศรีนคร", "เอเชีย"];

// ═══════════════════ 1. Party + บริษัท 50,000 ═══════════════════
await phase("party", N.companies, 25_000, (lo, hi) => `
  INSERT INTO "Party" ("id","tenantId","kind","name","email","taxId","branchCode","createdAt","updatedAt")
  SELECT 'pfpy_' || ${pad("i", 6)}, $2, 'COMPANY', 'บริษัท ' || (${arr(CO_WORDS)})[1 + floor(${U("i", "cw")} * 10)::int] || ' ' || i || ' จำกัด',
         'info@co' || i || '.example.co.th', CASE WHEN ${U("i", "tx")} < 0.7 THEN '0105' || ${pad("i", 9)} END, '00000',
         ${A} - (${U("i", "cc")} * 730) * interval '1 day', ${A}
    FROM generate_series(${lo}, ${hi}) i WHERE $3::text IS NOT NULL
  ON CONFLICT DO NOTHING`);
await phase("company", N.companies, 25_000, (lo, hi) => `
  INSERT INTO "CrmCompany" ("id","tenantId","systemId","partyId","name","taxId","branchCode","industry","size","website","emailDomain","ownerUserId","teamId","lifecycleStage","score","createdAt","updatedAt")
  SELECT ${coid("i")}, $2, $3, 'pfpy_' || ${pad("i", 6)}, 'บริษัท ' || (${arr(CO_WORDS)})[1 + floor(${U("i", "cw")} * 10)::int] || ' ' || i || ' จำกัด',
         CASE WHEN ${U("i", "tx")} < 0.7 THEN '0105' || ${pad("i", 9)} END, '00000',
         (${arr(["ท่องเที่ยว", "โรงแรม", "ค้าปลีก", "อาหาร", "เทคโนโลยี", "การศึกษา", "สุขภาพ", "โลจิสติกส์"])})[1 + floor(${U("i", "ind")} * 8)::int],
         (ARRAY['MICRO','SMALL','MEDIUM','LARGE','ENTERPRISE'])[1 + floor(pow(${U("i", "sz")}, 1.5) * 5)::int]::"CrmCompanySize",
         'https://co' || i || '.example.co.th', 'co' || i || '.example.co.th',
         ($4::text[])[o.k + 1], ($5::text[])[o.k + 1],
         (CASE WHEN ${U("i", "lc")} < 0.5 THEN 'PROSPECT' WHEN ${U("i", "lc")} < 0.85 THEN 'CUSTOMER' ELSE 'LEAD' END)::"CrmLifecycleStage",
         floor(pow(${U("i", "sc")}, 2) * 100)::int,
         ${A} - (${U("i", "cc")} * 730) * interval '1 day', ${A}
    FROM generate_series(${lo}, ${hi}) i, LATERAL (SELECT least(20, floor(pow(${U("i", "ow")}, 1.3) * 21))::int AS k) o
  ON CONFLICT DO NOTHING`, [OWNER_POOL, OWNER_TEAM]);

// ═══════════════════ 2. ผู้ติดต่อ 200,000 (+ ลิงก์บริษัทหลัก) ═══════════════════
await phase("contact", N.contacts, 25_000, (lo, hi) => `
  INSERT INTO "CrmContact" ("id","tenantId","systemId","name","firstName","lastName","phone","email","lifecycleStage","source","ownerUserId","createdAt","updatedAt",
                            "companyId","jobTitle","leadStatus","score","scoreBand","teamId","sourceKind","locale","tags","archivedAt","emailOptOut","assignedAt")
  SELECT ${cid("g.i")}, $2, $3, g.fn || ' ' || g.ln, g.fn, g.ln,
         CASE WHEN ${U("g.i", "ph")} < 0.9 THEN '08' || ${pad("(g.i * 7919) % 100000000", 8)} END,
         CASE WHEN ${U("g.i", "em")} < 0.85 THEN 'c' || g.i || '@' || CASE WHEN g.co IS NOT NULL THEN 'co' || g.co || '.example.co.th' ELSE (ARRAY['gmail.com','hotmail.com','yahoo.com','outlook.com'])[1 + floor(${U("g.i", "ed")} * 4)::int] END END,
         (CASE WHEN g.ul < 0.55 THEN 'LEAD' WHEN g.ul < 0.85 THEN 'PROSPECT' WHEN g.ul < 0.97 THEN 'CUSTOMER' WHEN g.ul < 0.99 THEN 'LOST' ELSE 'CHURNED' END)::"CrmLifecycleStage",
         g.sk, ($4::text[])[g.k + 1], g.created, g.created,
         CASE WHEN g.co IS NOT NULL THEN ${coid("g.co")} END,
         CASE WHEN g.co IS NOT NULL THEN (ARRAY['ผู้จัดการฝ่ายจัดซื้อ','เจ้าของกิจการ','ฝ่ายบัญชี','ผู้จัดการทั่วไป','ฝ่ายการตลาด'])[1 + floor(${U("g.i", "jt")} * 5)::int] END,
         (CASE WHEN g.us < 0.35 THEN 'NEW' WHEN g.us < 0.60 THEN 'CONTACTED' WHEN g.us < 0.80 THEN 'QUALIFIED' WHEN g.us < 0.90 THEN 'UNQUALIFIED' ELSE 'NURTURE' END)::"CrmLeadStatus",
         g.score, (CASE WHEN g.score >= 50 THEN 'HOT' WHEN g.score >= 20 THEN 'WARM' ELSE 'COLD' END)::"CrmScoreBand",
         ($5::text[])[g.k + 1], g.sk::"MemberSource", 'th',
         CASE WHEN ${U("g.i", "tg")} < 0.2 THEN ARRAY[(ARRAY['vip','event2025','newsletter','partner'])[1 + floor(${U("g.i", "tg2")} * 4)::int]] ELSE ARRAY[]::text[] END,
         CASE WHEN ${U("g.i", "ar")} < 0.01 THEN g.created + interval '30 days' END,
         ${U("g.i", "oo")} < 0.03, g.created
    FROM (SELECT i,
                 (${arr(TH_FIRST)})[1 + floor(${U("i", "fn")} * 20)::int] AS fn,
                 (${arr(TH_LAST)})[1 + floor(${U("i", "ln")} * 20)::int] AS ln,
                 CASE WHEN ${U("i", "hc")} < 0.6 THEN floor(pow(${U("i", "co")}, 1.5) * ${N.companies})::int + 1 END AS co,
                 least(20, floor(pow(${U("i", "ow")}, 1.3) * 21))::int AS k,
                 ${U("i", "lc")} AS ul, ${U("i", "ls")} AS us,
                 floor(pow(${U("i", "sc")}, 2) * 100)::int AS score,
                 (CASE WHEN ${U("i", "src")} < 0.30 THEN 'WEB_FORM' WHEN ${U("i", "src")} < 0.55 THEN 'LINE_OA' WHEN ${U("i", "src")} < 0.70 THEN 'REFERRAL'
                       WHEN ${U("i", "src")} < 0.85 THEN 'IMPORT' WHEN ${U("i", "src")} < 0.95 THEN 'CHAT' ELSE 'OTHER' END) AS sk,
                 ${A} - (${U("i", "cr")} * 730) * interval '1 day' AS created
            FROM generate_series(${lo}, ${hi}) i) g
  ON CONFLICT DO NOTHING`, [OWNER_POOL, OWNER_TEAM]);
await phase("companyContact", N.contacts, 50_000, (lo, hi) => `
  INSERT INTO "CrmCompanyContact" ("id","tenantId","companyId","contactId","role","jobTitle","isPrimary","createdAt")
  SELECT 'pfcc_' || substr(c."id", 6), c."tenantId", c."companyId", c."id",
         (ARRAY['DECISION_MAKER','INFLUENCER','COORDINATOR','BILLING','TECHNICAL','END_USER','OTHER'])[1 + floor(${U("c.id", "rl")} * 7)::int]::"CrmContactRole",
         c."jobTitle", true, c."createdAt"
    FROM "CrmContact" c
   WHERE c."systemId" = $3 AND c."tenantId" = $2 AND $1::timestamp IS NOT NULL AND c."companyId" IS NOT NULL AND c."id" BETWEEN ${cid(String(lo))} AND ${cid(String(hi))}
  ON CONFLICT DO NOTHING`);

// ═══════════════════ 3. ดีล 26,000 (เปิด 20,000 · ชนะ 4,000 · แพ้ 2,000) + ประวัติขั้น ═══════════════════
// $4 pipelines [p1,p2] · $5 p1Open · $6 p2Open · $7 closed [p1Won,p1Lost,p2Won,p2Lost] · $8 lost reasons · $9 owners · $10 owner teams
await phase("deal", DEALS_TOTAL, 13_000, (lo, hi) => `
  INSERT INTO "CrmDeal" ("id","tenantId","systemId","contactId","pipelineId","stageId","title","valueSatang","kind","expectedCloseAt","closedAt","ownerUserId",
                         "createdAt","updatedAt","companyId","teamId","stageEnteredAt","stalledAt","lastActivityAt","forecastCategory","lostReasonId","sourceKind",
                         "wonValueSatang","collaboratorUserIds","tags","probabilityOverride")
  SELECT ${dlid("b.k")}, $2, $3, c."id", ($4::text[])[b.pi], b.stage,
         (ARRAY['แพ็กเกจองค์กร','ต่อสัญญาบริการ','สั่งซื้อรอบใหม่','โครงการติดตั้ง','สัมมนาประจำปี'])[1 + floor(${U("b.k", "tt")} * 5)::int] || ' #' || b.k,
         b.val, b.kind::"CrmStageKind",
         CASE WHEN b.kind = 'OPEN' THEN CASE WHEN ${U("b.k", "ecn")} < 0.05 THEN NULL ELSE date_trunc('day', ${A}) + ((-30 + floor(${U("b.k", "ec")} * 395))::int) * interval '1 day' END
              ELSE date_trunc('day', b.entered) END,
         CASE WHEN b.kind <> 'OPEN' THEN b.entered END,
         ow.owner, b.entered - (5 + ${U("b.k", "ca")} * 200) * interval '1 day', b.entered,
         c."companyId", ($10::text[])[array_position($9::text[], ow.owner)],
         b.entered,
         CASE WHEN b.kind = 'OPEN' AND ${U("b.k", "st")} < 0.10 THEN ${A} - (${U("b.k", "st2")} * 10) * interval '1 day' END,
         CASE WHEN b.kind = 'OPEN' THEN ${A} - (${U("b.k", "la")} * 60) * interval '1 day' ELSE b.entered END,
         (CASE WHEN ${U("b.k", "fc")} < 0.50 THEN 'PIPELINE' WHEN ${U("b.k", "fc")} < 0.75 THEN 'BEST_CASE' WHEN ${U("b.k", "fc")} < 0.95 THEN 'COMMIT' ELSE 'OMITTED' END)::"CrmForecastCategory",
         CASE WHEN b.kind = 'LOST' THEN ($8::text[])[1 + floor(${U("b.k", "lr")} * 5)::int] END,
         c."sourceKind",
         CASE WHEN b.kind = 'WON' THEN b.val::bigint END,
         CASE WHEN ${U("b.k", "cb")} < 0.05 THEN ARRAY[($9::text[])[1 + floor(${U("b.k", "cb2")} * 18)::int]] ELSE ARRAY[]::text[] END,
         CASE WHEN ${U("b.k", "tg")} < 0.15 THEN ARRAY['q' || (1 + floor(${U("b.k", "tg2")} * 4)::int)] ELSE ARRAY[]::text[] END,
         CASE WHEN b.kind = 'OPEN' AND ${U("b.k", "po")} < 0.05 THEN floor(${U("b.k", "po2")} * 100)::int END
    FROM (SELECT b0.*,
                 CASE WHEN b0.kind = 'OPEN' THEN CASE WHEN b0.pi = 1 THEN ($5::text[])[1 + floor(pow(${U("b0.k", "sg")}, 1.4) * ${P1_OPEN.length})::int]
                                                                  ELSE ($6::text[])[1 + floor(pow(${U("b0.k", "sg")}, 1.4) * ${P2_OPEN.length})::int] END
                      WHEN b0.kind = 'WON' THEN ($7::text[])[CASE WHEN b0.pi = 1 THEN 1 ELSE 3 END]
                      ELSE ($7::text[])[CASE WHEN b0.pi = 1 THEN 2 ELSE 4 END] END AS stage,
                 CASE WHEN ${U("b0.k", "own")} < 0.85 THEN NULL ELSE ($9::text[])[least(20, floor(pow(${U("b0.k", "ow")}, 1.3) * 21))::int + 1] END AS own2,
                 ${cid(`floor(pow(${U("b0.k", "ct")}, 1.2) * ${N.contacts})::int + 1`)} AS cid
            FROM (SELECT k,
                         CASE WHEN ${U("k", "pp")} < 0.7 THEN 1 ELSE 2 END AS pi,
                         CASE WHEN k <= ${N.openDeals} THEN 'OPEN' WHEN k <= ${N.openDeals + N.wonDeals} THEN 'WON' ELSE 'LOST' END AS kind,
                         round(100000 * exp(${U("k", "v")} * ln(5000)))::int AS val,
                         CASE WHEN k <= ${N.openDeals} THEN ${A} - (${U("k", "se")} * 120) * interval '1 day' ELSE ${A} - (${U("k", "cl")} * 700) * interval '1 day' END AS entered
                    FROM generate_series(${lo}, ${hi}) k) b0) b
    JOIN "CrmContact" c ON c."id" = b.cid
    CROSS JOIN LATERAL (SELECT COALESCE(b.own2, c."ownerUserId") AS owner) ow
  ON CONFLICT DO NOTHING`, [[p1.id, p2.id], P1_OPEN, P2_OPEN, CLOSED, lostReasonIds, OWNER_POOL, OWNER_TEAM]);
await phase("stageHistory", DEALS_TOTAL, 13_000, (lo, hi) => `
  INSERT INTO "CrmDealStageHistory" ("id","tenantId","dealId","fromStageId","toStageId","byUserId","bySource","enteredAt","leftAt","durationSec")
  SELECT 'pfsh_' || substr(d."id", 6) || '_' || s.rn, d."tenantId", d."id", s.prev, s.id, d."ownerUserId", 'MANUAL',
         d."createdAt" + (d."stageEnteredAt" - d."createdAt") * ((s.rn - 1)::float8 / greatest(s.n - 1, 1)),
         CASE WHEN s.rn < s.n THEN d."createdAt" + (d."stageEnteredAt" - d."createdAt") * (s.rn::float8 / greatest(s.n - 1, 1)) END,
         CASE WHEN s.rn < s.n THEN round(extract(epoch FROM (d."stageEnteredAt" - d."createdAt")) / greatest(s.n - 1, 1))::int END
    FROM "CrmDeal" d
    JOIN "CrmStage" cur ON cur."id" = d."stageId"
    CROSS JOIN LATERAL (
      SELECT x.id, lag(x.id) OVER (ORDER BY x."sortOrder") AS prev, row_number() OVER (ORDER BY x."sortOrder") AS rn, count(*) OVER () AS n
        FROM "CrmStage" x
       WHERE x."pipelineId" = d."pipelineId"
         AND ((x."kind" = 'OPEN' AND (d."kind" = 'WON'
                OR (d."kind" = 'OPEN' AND x."sortOrder" <= cur."sortOrder")
                OR (d."kind" = 'LOST' AND x."sortOrder" <= floor(${U('d."id"', "lc")} * 3))))
              OR (d."kind" <> 'OPEN' AND x."id" = d."stageId"))
    ) s
   WHERE d."systemId" = $3 AND d."tenantId" = $2 AND $1::timestamp IS NOT NULL AND d."id" BETWEEN ${dlid(String(lo))} AND ${dlid(String(hi))}
  ON CONFLICT DO NOTHING`);

// ═══════════════════ 4. กิจกรรม 1,000,000 ═══════════════════
// ส่วนหัวร่วม: ชนิด · สถานะ · เวลา (ผูกกับ createdAt ที่คำนวณแล้วใน g.created)
const ACT_COLS = `"id","tenantId","systemId","contactId","dealId","companyId","type","title","dueAt","doneAt","ownerUserId","createdAt","direction","channel","startAt","durationSec","outcome","body","source","priority","completedById"`;
const actSelect = (idExpr: string) => `
  SELECT 'pfac_' || ${pad(idExpr, 7)}, $2, $3, g.contact, g.deal, g.company, g.t::"CrmActivityType",
         (CASE g.t WHEN 'CALL' THEN 'โทรติดตาม' WHEN 'EMAIL' THEN 'อีเมลถึงลูกค้า' WHEN 'MEETING' THEN 'นัดประชุม' WHEN 'NOTE' THEN 'บันทึก' WHEN 'TASK' THEN 'งานติดตาม' ELSE 'คุยทาง LINE' END) || ' #' || ${idExpr},
         CASE WHEN g.t = 'TASK' THEN CASE WHEN g.done THEN g.created + interval '1 day' ELSE date_trunc('hour', ${A}) + ((-30 + floor(${U(idExpr, "du")} * 60))::int) * interval '1 day' END
              WHEN g.t = 'MEETING' AND NOT g.done THEN date_trunc('hour', ${A}) + ((1 + floor(${U(idExpr, "du")} * 30))::int) * interval '1 day' END,
         CASE WHEN g.done THEN g.created + interval '2 hours' END,
         g.owner, g.created,
         (CASE WHEN g.t IN ('CALL','EMAIL','LINE') THEN CASE WHEN ${U(idExpr, "dir")} < 0.6 THEN 'OUT' ELSE 'IN' END END)::"CrmDirection",
         CASE g.t WHEN 'CALL' THEN 'PHONE' WHEN 'EMAIL' THEN 'EMAIL' WHEN 'LINE' THEN 'LINE' END,
         CASE WHEN g.t IN ('CALL','MEETING','EMAIL','LINE') THEN g.created END,
         CASE WHEN g.t = 'CALL' AND g.done THEN 30 + floor(${U(idExpr, "ds")} * 1800)::int END,
         CASE WHEN g.t = 'CALL' AND g.done THEN (ARRAY['สนใจ','ขอใบเสนอราคา','ไม่รับสาย','โทรกลับภายหลัง'])[1 + floor(${U(idExpr, "oc")} * 4)::int] END,
         CASE WHEN g.t = 'NOTE' THEN 'ลูกค้าแจ้งความต้องการเพิ่มเติม เรื่องที่ ' || ${idExpr} END,
         (CASE WHEN g.t = 'EMAIL' AND ${U(idExpr, "so")} < 0.5 THEN 'EMAIL' WHEN ${U(idExpr, "so")} < 0.05 THEN 'API' ELSE 'MANUAL' END)::"CrmActivitySource",
         (CASE WHEN ${U(idExpr, "pr")} < 0.1 THEN 'HIGH' WHEN ${U(idExpr, "pr")} < 0.2 THEN 'LOW' ELSE 'NORMAL' END)::"CrmPriority",
         CASE WHEN g.done THEN g.owner END`;
const actType = (idExpr: string) => `(CASE WHEN ${U(idExpr, "ty")} < 0.25 THEN 'CALL' WHEN ${U(idExpr, "ty")} < 0.45 THEN 'EMAIL' WHEN ${U(idExpr, "ty")} < 0.55 THEN 'MEETING'
                                          WHEN ${U(idExpr, "ty")} < 0.70 THEN 'NOTE' WHEN ${U(idExpr, "ty")} < 0.90 THEN 'TASK' ELSE 'LINE' END)`;
await phase("activityDeal", N.activitiesDeal, 50_000, (lo, hi) => `
  INSERT INTO "CrmActivity" (${ACT_COLS})
  ${actSelect("g.n")}
    FROM (SELECT b.n, d."contactId" AS contact, d."id" AS deal, d."companyId" AS company, b.t,
                 CASE WHEN ${U("b.n", "ow")} < 0.9 THEN d."ownerUserId" ELSE ($4::text[])[1 + floor(${U("b.n", "ow2")} * 21)::int] END AS owner,
                 d."createdAt" + (COALESCE(d."closedAt", ${A}) - d."createdAt") * ${U("b.n", "at")} AS created,
                 CASE WHEN d."kind" <> 'OPEN' THEN true WHEN b.t = 'TASK' THEN ${U("b.n", "dn")} < 0.7 ELSE ${U("b.n", "dn")} < 0.85 END AS done
            FROM (SELECT n, ${actType("n")} AS t, ${dlid(`floor(${U("n", "dl")} * ${DEALS_TOTAL})::int + 1`)} AS did FROM generate_series(${lo}, ${hi}) n) b
            JOIN "CrmDeal" d ON d."id" = b.did) g
  ON CONFLICT DO NOTHING`, [OWNER_POOL]);
await phase("activityContact", N.activitiesContact, 50_000, (lo, hi) => `
  INSERT INTO "CrmActivity" (${ACT_COLS})
  ${actSelect("g.n")}
    FROM (SELECT b.n, c."id" AS contact, NULL::text AS deal, NULL::text AS company, b.t,
                 CASE WHEN ${U("b.n", "ow")} < 0.9 AND c."ownerUserId" IS NOT NULL THEN c."ownerUserId" ELSE ($4::text[])[1 + floor(${U("b.n", "ow2")} * 21)::int] END AS owner,
                 c."createdAt" + (${A} - c."createdAt") * ${U("b.n", "at")} AS created,
                 CASE WHEN b.t = 'TASK' THEN ${U("b.n", "dn")} < 0.7 ELSE ${U("b.n", "dn")} < 0.85 END AS done
            FROM (SELECT n, ${actType("n")} AS t,
                         ${cid(`CASE WHEN ${U("n", "hv")} < 0.3 THEN floor(pow(${U("n", "cx")}, 3) * ${N.contacts})::int + 1 ELSE floor(${U("n", "cx")} * ${N.contacts})::int + 1 END`)} AS cid
                    FROM generate_series(${N.activitiesDeal + lo}, ${N.activitiesDeal + hi}) n) b
            JOIN "CrmContact" c ON c."id" = b.cid) g
  ON CONFLICT DO NOTHING`, [OWNER_POOL]);
// แคชเวลา (ผู้ติดต่อ/ดีล/บริษัท) จากกิจกรรมจริง — สูตรเดียวกับ seed-crm-qc (ไม่ยิง event)
if (!prog.done.caches) {
  const ts = Date.now();
  await prisma.$executeRawUnsafe(`
    WITH a AS (SELECT "contactId" AS id, max(COALESCE("doneAt", "startAt", "createdAt")) FILTER (WHERE "doneAt" IS NOT NULL) AS last,
                      min("dueAt") FILTER (WHERE "doneAt" IS NULL AND "dueAt" >= $1::timestamp) AS nxt
                 FROM "CrmActivity" WHERE "systemId" = $3 AND "contactId" IS NOT NULL GROUP BY 1)
    UPDATE "CrmContact" c SET "lastActivityAt" = a.last, "nextActivityAt" = a.nxt FROM a WHERE c."id" = a.id AND c."tenantId" = $2`, ANCHOR, tenantId, SYS);
  await prisma.$executeRawUnsafe(`
    WITH a AS (SELECT "dealId" AS id, min("dueAt") FILTER (WHERE "doneAt" IS NULL AND "dueAt" >= $1::timestamp) AS nxt
                 FROM "CrmActivity" WHERE "systemId" = $3 AND "dealId" IS NOT NULL GROUP BY 1)
    UPDATE "CrmDeal" d SET "nextActivityAt" = a.nxt FROM a WHERE d."id" = a.id AND d."tenantId" = $2`, ANCHOR, tenantId, SYS);
  await prisma.$executeRawUnsafe(`
    WITH od AS (SELECT "companyId" AS id, count(*) FILTER (WHERE "kind" = 'OPEN')::int AS o,
                       COALESCE(sum(COALESCE("wonValueSatang", "valueSatang"::bigint)) FILTER (WHERE "kind" = 'WON'), 0)::bigint AS w
                  FROM "CrmDeal" WHERE "systemId" = $3 AND "companyId" IS NOT NULL GROUP BY 1),
         la AS (SELECT d."companyId" AS id, max(a."createdAt") AS last FROM "CrmActivity" a JOIN "CrmDeal" d ON d."id" = a."dealId"
                 WHERE a."systemId" = $3 AND d."companyId" IS NOT NULL GROUP BY 1)
    UPDATE "CrmCompany" co SET "openDealCount" = COALESCE(od.o, 0), "wonValueSatang" = COALESCE(od.w, 0), "lastActivityAt" = la.last
      FROM "CrmCompany" c0 LEFT JOIN od ON od.id = c0."id" LEFT JOIN la ON la.id = c0."id"
     WHERE co."id" = c0."id" AND c0."systemId" = $3 AND co."tenantId" = $2 AND $1::text IS NOT NULL`, ANCHOR, tenantId, SYS);
  prog.done.caches = 1;
  await saveProg();
  log(`✓ caches (${Math.round((Date.now() - ts) / 1000)}s)`);
}

// ═══════════════════ 5. ค่าฟิลด์ผู้ติดต่อ (กรองได้ 40% · อื่น 5%) ═══════════════════
function valueSql(f: FDef, idExpr: string, salt: string): { cols: string; vals: string } {
  const u = U(idExpr, salt);
  switch (f.type) {
    case "SELECT": return { cols: `"valueOptions"`, vals: `ARRAY[(${arr(f.choices!)})[1 + floor(pow(${u}, 1.3) * ${f.choices!.length})::int]]` };
    case "NUMBER": case "MONEY": return { cols: `"valueNumber"`, vals: f.key === "nps" ? `floor(${u} * 11)` : f.key === "year" ? `2005 + floor(${u} * 21)` : `round(1000 * exp(${u} * ln(10000)))` };
    case "DATE": return { cols: `"valueDate"`, vals: `date_trunc('day', ${A}) + ((-365 + floor(${u} * 730))::int) * interval '1 day'` };
    case "BOOLEAN": return { cols: `"valueBool"`, vals: `${u} < 0.3` };
    case "LONG_TEXT": return { cols: `"valueText"`, vals: `'รายละเอียดเพิ่มเติมของลูกค้า ' || ${idExpr}` };
    default: return { cols: `"valueText"`, vals: f.key === "segment" ? `(ARRAY['smb','enterprise','startup','gov','ngo','individual'])[1 + floor(${u} * 6)::int]` : f.key === "referral_code" ? `'REF' || upper(substr(md5(${idExpr}::text), 1, 6))` : `'ค่า ' || ${idExpr} % 997` };
  }
}
for (const [fi, f] of CONTACT_FIELDS.entries()) {
  const fid = contactFieldIds[fi]!;
  const v = valueSql(f, "i", `v${fi}`);
  const p = f.filterable ? 0.4 : 0.05;
  await phase(`cv_${f.key}`, N.contacts, 100_000, (lo, hi) => `
    INSERT INTO "CustomRecordValue" ("id","tenantId","recordType","recordId","fieldId",${v.cols},"updatedAt")
    SELECT 'pfcv${String(fi + 1).padStart(2, "0")}_' || ${pad("i", 7)}, $2, 'CONTACT', ${cid("i")}, $4, ${v.vals}, ${A}
      FROM generate_series(${lo}, ${hi}) i WHERE ${U("i", `p${fi}`)} < ${p} AND $3::text IS NOT NULL
    ON CONFLICT DO NOTHING`, [fid]);
}

// ═══════════════════ 6. วัตถุกำหนดเอง 3 × 100,000 + ค่าฟิลด์กรองได้ 2 ตัว/รายการ ═══════════════════
for (const [oi, o] of OBJECTS.entries()) {
  const objId = objectIds[oi]!;
  const parent = o.parent === "CONTACT" ? cid(`floor(pow(${U("i", `op${oi}`)}, 1.5) * ${N.contacts})::int + 1`) : coid(`floor(pow(${U("i", `op${oi}`)}, 1.5) * ${N.companies})::int + 1`);
  await phase(`rec_${o.key}`, N.recordsPerObject, 50_000, (lo, hi) => `
    INSERT INTO "CustomRecord" ("id","tenantId","systemId","objectId","parentType","parentId","title","ownerUserId","createdById","createdAt","updatedAt")
    SELECT 'pfcr${oi}_' || ${pad("i", 6)}, $2, $3, $4, '${o.parent}'::"CustomParent", ${parent},
           '${o.key.toUpperCase()}-' || ${pad("i", 6)}, ($5::text[])[1 + floor(${U("i", `ro${oi}`)} * 21)::int], $6,
           ${A} - (${U("i", `rc${oi}`)} * 700) * interval '1 day', ${A} - (${U("i", `ru${oi}`)} * 90) * interval '1 day'
      FROM generate_series(${lo}, ${hi}) i
    ON CONFLICT DO NOTHING`, [objId, OWNER_POOL, ownerId]);
  for (const [fi, f] of o.fields.entries()) {
    if (!f.filterable) continue;
    const v = valueSql(f, "i", `o${oi}f${fi}`);
    await phase(`rv_${o.key}_${f.key}`, N.recordsPerObject, 100_000, (lo, hi) => `
      INSERT INTO "CustomRecordValue" ("id","tenantId","recordType","recordId","fieldId",${v.cols},"updatedAt")
      SELECT 'pfrv${oi}${fi}_' || ${pad("i", 6)}, $2, 'CUSTOM', 'pfcr${oi}_' || ${pad("i", 6)}, $4, ${v.vals}, ${A}
        FROM generate_series(${lo}, ${hi}) i WHERE $3::text IS NOT NULL
      ON CONFLICT DO NOTHING`, [objectFieldIds[oi]![fi]!]);
  }
  if (!prog.done[`cnt_${o.key}`]) {
    await prisma.$executeRawUnsafe(`UPDATE "CustomObject" SET "recordCount" = (SELECT count(*)::int FROM "CustomRecord" WHERE "objectId" = $1 AND "archivedAt" IS NULL) WHERE "id" = $1`, objId);
    prog.done[`cnt_${o.key}`] = 1;
    await saveProg();
  }
}

// ═══════════════════ 7. อีเมล 30,000 (+ event 40,000) · ลิงก์ติดตาม 200 (+ คลิก 50,000) · web session 30,000 (+ event 150,000) ═══════════════════
// token ของจดหมายขาออก n: เปิด = `<id>~pftok<n>` · คลิก = `<id>~pfclk<n>` (ข้อสอบ qc-crm-perf สร้าง token เดียวกันได้)
await phase("email", N.emails, 30_000, (lo, hi) => `
  INSERT INTO "CrmEmailMessage" ("id","tenantId","systemId","contactId","companyId","direction","messageId","threadKey","fromAddr","toAddrs","subject","bodyText","snippet",
                                 "sentById","sentAt","receivedAt","status","trackTokenHash","openCount","clickCount","routing","matchedBy","createdAt","updatedAt")
  SELECT 'pfem_' || ${pad("g.n", 6)}, $2, $3, c."id", c."companyId", g.dir::"CrmDirection", '<pf-' || g.n || '@perf.example.co.th>', 'pfth' || ${pad("(g.n + 2) / 3", 6)},
         CASE WHEN g.dir = 'OUT' THEN 'sales@perf.example.co.th' ELSE COALESCE(c."email", 'someone' || g.n || '@gmail.com') END,
         ARRAY[CASE WHEN g.dir = 'OUT' THEN COALESCE(c."email", 'someone' || g.n || '@gmail.com') ELSE 'crm+perfqcab@shark.in.th' END],
         (ARRAY['ใบเสนอราคา','นัดประชุม','ติดตามงาน','ขอบคุณที่ใช้บริการ','สอบถามราคา'])[1 + floor(${U("g.n", "sj")} * 5)::int] || ' #' || ((g.n + 2) / 3),
         'เนื้อหาอีเมลทดสอบ ' || g.n, 'เนื้อหาอีเมลทดสอบ ' || g.n,
         CASE WHEN g.dir = 'OUT' THEN c."ownerUserId" END,
         CASE WHEN g.dir = 'OUT' THEN g.at END, CASE WHEN g.dir = 'IN' THEN g.at END,
         (CASE WHEN g.dir = 'IN' THEN 'RECEIVED' WHEN ${U("g.n", "op")} < 0.4 THEN 'OPENED' ELSE 'SENT' END)::"CrmEmailStatus",
         CASE WHEN g.dir = 'OUT' THEN encode(sha256(convert_to('crm.email.o:' || 'pfem_' || ${pad("g.n", 6)} || '~pftok' || g.n, 'UTF8')), 'hex')
              ELSE encode(sha256(convert_to('crm.email.in:<pf-' || g.n || '@perf.example.co.th>', 'UTF8')), 'hex') END,
         CASE WHEN g.dir = 'OUT' AND ${U("g.n", "op")} < 0.4 THEN 1 + floor(${U("g.n", "oc")} * 4)::int ELSE 0 END, 0,
         CASE WHEN g.dir = 'OUT' THEN jsonb_build_object('via', 'SHARK', 'links', jsonb_build_array(jsonb_build_object(
              'h', encode(sha256(convert_to('crm.email.c:' || 'pfem_' || ${pad("g.n", 6)} || '~pfclk' || g.n, 'UTF8')), 'hex'),
              'url', 'https://perf.example.co.th/p/' || g.n))) END,
         'EMAIL', g.at, g.at
    FROM (SELECT n, CASE WHEN ${U("n", "dr")} < 0.6 THEN 'OUT' ELSE 'IN' END AS dir,
                 ${A} - (${U("n", "ea")} * 365) * interval '1 day' - interval '1 hour' AS at,
                 ${cid(`floor(pow(${U("n", "ec")}, 2) * ${N.contacts})::int + 1`)} AS cid
            FROM generate_series(${lo}, ${hi}) n) g
    JOIN "CrmContact" c ON c."id" = g.cid
  ON CONFLICT DO NOTHING`);
await phase("emailEvent", N.emailEvents, 40_000, (lo, hi) => `
  INSERT INTO "CrmEmailEvent" ("id","tenantId","emailId","kind","userAgent","at")
  SELECT 'pfee_' || ${pad("n", 6)}, $2, e."id", (CASE WHEN ${U("n", "k")} < 0.8 THEN 'OPEN' ELSE 'CLICK' END)::"CrmEmailEventKind", 'Mozilla/5.0', e."sentAt" + interval '3 hours'
    FROM generate_series(${lo}, ${hi}) n
    JOIN "CrmEmailMessage" e ON $1::timestamp IS NOT NULL AND e."id" = 'pfem_' || ${pad(`floor(${U("n", "e")} * ${N.emails})::int + 1`, 6)} AND e."direction" = 'OUT' AND e."systemId" = $3
  ON CONFLICT DO NOTHING`);
await phase("link", N.links, N.links, (lo, hi) => `
  INSERT INTO "CrmTrackedLink" ("id","tenantId","systemId","code","url","name","channel","clicks","uniqueClicks","active","createdById","createdAt")
  SELECT 'pflk_' || ${pad("n", 4)}, $2, $3, 'pfl' || ${pad("n", 4)}, 'https://perf.example.co.th/promo/' || n, 'แคมเปญ ' || n, (ARRAY['facebook','line','qr','email'])[1 + n % 4], 0, 0, true, $4,
         ${A} - (n * 2) * interval '1 day'
    FROM generate_series(${lo}, ${hi}) n
  ON CONFLICT DO NOTHING`, [ownerId]);
await phase("linkClick", N.linkClicks, 50_000, (lo, hi) => `
  INSERT INTO "CrmTrackedClick" ("id","tenantId","linkId","userAgent","at")
  SELECT 'pftc_' || ${pad("n", 6)}, $2, 'pflk_' || ${pad(`floor(pow(${U("n", "l")}, 2) * ${N.links})::int + 1`, 4)}, 'Mozilla/5.0', ${A} - (${U("n", "a")} * 365) * interval '1 day'
    FROM generate_series(${lo}, ${hi}) n WHERE $3::text IS NOT NULL
  ON CONFLICT DO NOTHING`);
if (!prog.done.linkCounts) {
  await prisma.$executeRawUnsafe(`UPDATE "CrmTrackedLink" l SET "clicks" = x.n, "uniqueClicks" = (x.n * 0.7)::int FROM (SELECT "linkId", count(*)::int AS n FROM "CrmTrackedClick" WHERE "tenantId" = $1 GROUP BY 1) x WHERE l."id" = x."linkId"`, tenantId);
  prog.done.linkCounts = 1;
  await saveProg();
}
const uuidOf = (expr: string) => `(substr(md5(${expr}), 1, 8) || '-' || substr(md5(${expr}), 9, 4) || '-4' || substr(md5(${expr}), 14, 3) || '-a' || substr(md5(${expr}), 18, 3) || '-' || substr(md5(${expr}), 21, 12))`;
await phase("webSession", N.webSessions, 30_000, (lo, hi) => `
  INSERT INTO "CrmWebSession" ("id","tenantId","systemId","visitorId","contactId","consentVersion","consentAt","firstUrl","userAgent","ipHash","startedAt","lastSeenAt","pageViews","identifiedBy")
  SELECT 'pfws_' || ${pad("n", 6)}, $2, $3, ${uuidOf(`'pfv' || (n % ${Math.max(1, Math.round(N.webSessions * 2 / 3))})`)},
         CASE WHEN ${U("n", "id")} < 0.2 THEN ${cid(`floor(${U("n", "ic")} * ${N.contacts})::int + 1`)} END,
         1, ${A} - (${U("n", "a")} * 90) * interval '1 day', 'https://perf.example.co.th/', 'Mozilla/5.0', md5('ip' || n),
         ${A} - (${U("n", "a")} * 90) * interval '1 day', ${A} - (${U("n", "a")} * 90) * interval '1 day' + interval '10 minutes', 5,
         CASE WHEN ${U("n", "id")} < 0.2 THEN 'FORM' END
    FROM generate_series(${lo}, ${hi}) n
  ON CONFLICT DO NOTHING`);
await phase("webEvent", N.webEvents, 50_000, (lo, hi) => `
  INSERT INTO "CrmWebEvent" ("id","tenantId","sessionId","kind","url","title","at")
  SELECT 'pfwe_' || ${pad("n", 6)}, $2, 'pfws_' || ${pad(`(n % ${N.webSessions}) + 1`, 6)}, 'PAGEVIEW', 'https://perf.example.co.th/p/' || (n % 50), 'หน้า ' || (n % 50),
         ${A} - (${U("n", "a")} * 90) * interval '1 day'
    FROM generate_series(${lo}, ${hi}) n WHERE $3::text IS NOT NULL
  ON CONFLICT DO NOTHING`);

// ═══════════════════ 8. ANALYZE ตารางที่โตขึ้น (สถิติของ planner ตรงกับขนาดจริง — prod ทำเองผ่าน autovacuum) ═══════════════════
if (!prog.done.analyze) {
  for (const t of ["CrmContact", "CrmCompany", "CrmCompanyContact", "Party", "CrmDeal", "CrmDealStageHistory", "CrmActivity", "CustomRecord", "CustomRecordValue", "CrmEmailMessage", "CrmEmailEvent", "CrmTrackedLink", "CrmTrackedClick", "CrmWebSession", "CrmWebEvent"]) {
    await prisma.$executeRawUnsafe(`ANALYZE "${t}"`);
  }
  prog.done.analyze = 1;
  await saveProg();
  log("✓ ANALYZE");
}

const counts = await countsFor(tenantId);
const [sz] = (await prisma.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`)) as { s: string }[];
const summary = { tenantId, systemId: SYS, anchor: ANCHOR, seconds: Math.round((Date.now() - t0) / 1000), dbSize: sz?.s, counts };
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
await prisma.$disconnect();
