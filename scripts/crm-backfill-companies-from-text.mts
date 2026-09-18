// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.6 ข้อ 3) — `companies-from-text`
//
// ผู้ติดต่อที่มี "ชื่อบริษัทแบบข้อความ" (`CrmContact.company`) แต่ยังไม่ผูกบริษัทจริง (companyId ว่าง + ไม่มีแถว CrmCompanyContact)
//   → จัดกลุ่มตามชื่อที่ normalize (ตัดช่องว่างหัวท้าย · ยุบช่องว่างซ้ำ · ตัวพิมพ์เล็ก) ต่อระบบ CRM
//   → กลุ่มละ 1 `CrmCompany`: ใช้บริษัทเดิมในระบบที่ชื่อตรงกัน ถ้าไม่มีจึงสร้างใหม่ + Party kind COMPANY ตัวใหม่
//     🔴 ไม่ใช้ Party เดิมจาก "ชื่อเปล่า" (บริษัทต่างนิติบุคคลชื่อซ้ำกันได้ · กติกาของ Party: ห้ามจับคู่ด้วยชื่ออย่างเดียว)
//        ข้อความในช่องบริษัทไม่มีเลขภาษี (กุญแจเดียวที่เชื่อถือได้) ⇒ สร้าง Party ใหม่เสมอ — รวมทีหลังได้ที่หน้ารวมบริษัทซ้ำ
//   🔴 ข้ามข้อความที่ไม่ใช่ชื่อบริษัท: รายการคำแทน ("-" "ไม่มี" "ส่วนตัว" "n/a" "freelance" …) และข้อความที่มีตัวอักษร < 2 ตัว
//   → ผูกผู้ติดต่อทุกคนในกลุ่ม: แถว CrmCompanyContact (isPrimary = บริษัทหลักของผู้ติดต่อคนนั้น) + cache CrmContact.companyId
//   "mapping" = แถว CrmCompanyContact เอง · ข้อความ `company` เดิมไม่ลบ (หน้า v1 ยังแสดง)
// 🔴 idempotent: ผู้ติดต่อที่ผูกแล้วไม่ถูกเลือกซ้ำ · บริษัทที่สร้างแล้วถูกหาเจอด้วยชื่อในรอบถัดไป
// 🔴 AUDIT-CLASS X3: ทีละระบบใต้ `pg_advisory_xact_lock` ทั้งก้อน (หา→สร้าง Party→สร้างบริษัท→ผูก อยู่ใน tx เดียว)
//    ⇒ 2 โปรเซสพร้อมกัน: ตัวที่สองรอ แล้วเห็นบริษัท/การผูกของตัวแรก = ไม่มีบริษัทซ้ำ · unique (systemId, partyId) เป็นตาข่ายชั้นสอง
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-companies-from-text.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-companies-from-text.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-companies-from-text";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const party = (await import("@/lib/modules/party" as string)) as Any;
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const display = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");
const keyOf = (s: unknown) => display(s).toLowerCase();
/** คำแทน "ไม่มีบริษัท" ที่คนพิมพ์ใส่ช่องบริษัท — เทียบหลังตัดช่องว่าง/ตัวพิมพ์เล็ก/จุดท้าย */
const PLACEHOLDERS = new Set([
  "-", "--", "---", ".", "..", "/", "x", "xx", "xxx", "?", "none", "nil", "null", "n/a", "na", "n.a", "no", "nope", "unknown",
  "freelance", "freelancer", "self", "self-employed", "self employed", "personal", "private", "individual", "home", "student", "test",
  "ไม่มี", "ไม่มีบริษัท", "ไม่ระบุ", "ไม่ทราบ", "ไม่รู้", "ส่วนตัว", "บุคคลธรรมดา", "บุคคลทั่วไป", "อิสระ", "ฟรีแลนซ์", "ฟรีแลนส์",
  "นักเรียน", "นักศึกษา", "ว่างงาน", "แม่บ้าน", "ทดสอบ", "เทส", "ลูกค้าทั่วไป", "ทั่วไป",
]);
/** ข้อความนี้เป็นชื่อบริษัทจริงได้ไหม (ไม่ใช่คำแทน + มีตัวอักษรอย่างน้อย 2 ตัว) */
const looksLikeCompany = (s: unknown) => {
  const k = keyOf(s).replace(/[.\s]+$/, "");
  if (!k || PLACEHOLDERS.has(k)) return false;
  return (k.match(/\p{L}/gu) ?? []).length >= 2;
};

const counts = { ระบบที่แก้: 0, บริษัทที่สร้าง: 0, บริษัทเดิมที่ใช้ซ้ำ: 0, ผู้ติดต่อที่ผูก: 0, ข้ามคำแทน: 0, ร้านที่ล้ม: 0 };

async function run(db: Any, tenantId: string, systemId: string, write: boolean) {
  const contacts = (await db.crmContact.findMany({
    where: { tenantId, systemId, companyId: null, company: { not: null }, companyLinks: { none: {} } },
    select: { id: true, company: true, ownerUserId: true, jobTitle: true },
    orderBy: { createdAt: "asc" },
  })) as Any[];
  const groups = new Map<string, Any[]>();
  for (const c of contacts) {
    const k = keyOf(c.company);
    if (!k) continue;
    if (!looksLikeCompany(c.company)) { counts.ข้ามคำแทน += 1; continue; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const res = { created: 0, reused: 0, linked: 0 };
  if (groups.size === 0) return res;
  const existing = (await db.crmCompany.findMany({ where: { tenantId, systemId, mergedIntoId: null }, select: { id: true, name: true, legalName: true }, orderBy: { createdAt: "asc" } })) as Any[];
  const byName = new Map<string, string>();
  for (const co of existing) for (const n of [co.name, co.legalName]) if (n && !byName.has(keyOf(n))) byName.set(keyOf(n), co.id);

  for (const [k, members] of groups) {
    let companyId = byName.get(k) ?? null;
    if (companyId) res.reused += 1;
    else {
      res.created += 1;
      if (write) {
        const name = display(members[0].company);
        // party.findOrCreate ใน tx เดียวกัน (ไม่ใช่ safe*) — ล้ม = ทั้งระบบนี้ rollback แล้วรันใหม่ได้ ไม่มี Party กำพร้า
        // ไม่มีเลขภาษี/เบอร์/อีเมล ⇒ facade สร้าง Party ใหม่ (ไม่จับคู่ด้วยชื่อเปล่า — ตั้งใจ)
        const partyId = (await party.findOrCreate(tenantId, { name, kind: "COMPANY" }, db)).id as string;
        // กัน unique (systemId, partyId): ถ้ามีบริษัทในระบบนี้ถือ Party นี้อยู่แล้ว (เช่นเปลี่ยนชื่อไป) ใช้ตัวนั้น
        const holder = await db.crmCompany.findFirst({ where: { systemId, partyId }, select: { id: true } });
        const co = holder ?? (await db.crmCompany.create({ data: { tenantId, systemId, partyId, name, ownerUserId: members[0].ownerUserId ?? null } }));
        companyId = co.id;
        byName.set(k, co.id);
      }
    }
    res.linked += members.length;
    if (!write || !companyId) continue;
    for (const c of members) {
      await db.crmCompanyContact.create({ data: { tenantId, companyId, contactId: c.id, isPrimary: true, jobTitle: c.jobTitle ?? null } });
      await db.crmContact.updateMany({ where: { id: c.id, companyId: null }, data: { companyId } });
    }
  }
  return res;
}

for (const t of tenants) {
  try {
    const systems = (await P.appSystem.findMany({ where: { tenantId: t.id, type: "CRM" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } })) as Any[];
    if (systems.length === 0) { console.log(`  · ${t.slug}: ไม่มีระบบ CRM`); continue; }
    for (const s of systems) {
      let r: { created: number; reused: number; linked: number };
      try {
        r = args.dryRun
          ? await run(P, t.id, s.id, false)
          : await P.$transaction(async (tx: Any) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-backfill:companies-from-text:${s.id}`}))`;
              return run(tx, t.id, s.id, true);
            }, { timeout: 600_000, maxWait: 120_000 });
      } catch (e) {
        // 🔴 ร้าน/ระบบหนึ่งล้ม = rollback เฉพาะระบบนั้น · log แค่ id (ไม่มีข้อมูลลูกค้า) แล้วเดินต่อ
        counts.ร้านที่ล้ม += 1;
        console.error(`  ❌ ร้าน ${t.id} (${t.slug}) ระบบ ${s.id}: ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปต่อ`);
        continue;
      }
      if (r.created || r.linked) counts.ระบบที่แก้ += 1;
      counts.บริษัทที่สร้าง += r.created;
      counts.บริษัทเดิมที่ใช้ซ้ำ += r.reused;
      counts.ผู้ติดต่อที่ผูก += r.linked;
      const will = args.dryRun ? "จะ" : "";
      console.log(`  ${r.linked ? "✏️ " : "· "} ${t.name} (${t.slug}) · ระบบ "${s.name}" · บริษัทที่${will}สร้าง ${r.created} · ใช้บริษัทเดิม ${r.reused} · ผู้ติดต่อที่${will}ผูก ${r.linked}`);
    }
  } catch (e) {
    // 🔴 ร้านหนึ่งล้ม (รวมตอนอ่านข้อมูลก่อนเขียน) = log แค่ tenant id (ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ
    counts.ร้านที่ล้ม = (counts.ร้านที่ล้ม ?? 0) + 1;
    console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
  }
}

common.summary(SCRIPT, args, counts);
// ร้านที่ล้ม > 0 = exit 1 (ร้านอื่นทำครบแล้ว — รันซ้ำเก็บตกได้เพราะ idempotent) ให้คนรัน/CI เห็นว่าไม่ครบ
if (counts.ร้านที่ล้ม) process.exitCode = 1;
await prisma.$disconnect();
