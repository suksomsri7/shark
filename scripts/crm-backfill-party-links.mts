// CRM v2 backfill (ใบ C1.1 · พิมพ์เขียว 20-crm-v2 §4.6 ข้อ 3 · มติ C11) — `party-links`
//
// เติม `partyId` (ตัวตนกลาง Party) ให้แถวเดิมที่ยังว่าง — จุดเขียนใหม่ 9 จุดของใบ C1.1 ดูแลแถวใหม่แล้ว สคริปต์นี้เก็บของเก่า:
//   ผู้ติดต่อ CRM (CrmContact) + ตารางธุรกรรม 9 ตาราง (ชื่อจริงใน prisma/schema — ตรวจแล้ว):
//     Appointment · ShopOrder · RentalBooking · QueueTicket · ClinicVisit (ผ่าน PatientRecord ของคนไข้)
//     TicketOrder · SchoolEnrollment · HotelReservation · PatientRecord
//   บิลขายหน้าร้านไม่อยู่ในรายการ (ไม่มีเบอร์ในแถว — ผูกลูกค้าผ่าน memberId)
// จับคู่ผ่าน facade `party.safeFindOrCreate` (เลขภาษี → เบอร์ normalize → ชื่อ+อีเมล) ด้วยชื่อ/เบอร์/อีเมลที่แถวมีอยู่แล้ว
// 🔴 แถวที่ไม่มีเบอร์ ≥ 9 หลักและไม่มีอีเมลถูกรูป = ข้าม (จับคู่จากชื่อเปล่าคือการเดา — กติกาเดียวกับ member-backfill-party-links)
// 🔴 ห้ามทับ: แตะเฉพาะแถวที่ partyId เป็น null (`updateMany … where partyId null`) ⇒ รันซ้ำ = 0 แถว (idempotent)
// 🔴 กุญแจที่เชื่อถือได้เท่านั้น: เบอร์ normalize ≥ 9 หลัก หรืออีเมลถูกรูป (จับคู่ "ชื่อ + อีเมล") — กติกาเดียวกับจุดเขียน 9 จุด
// 🔴 AUDIT-CLASS X3: ทำเป็น batch ละ 200 แถว · batch ละ transaction สั้น ๆ ที่ยึด `pg_advisory_xact_lock` ของร้านใหม่ทุกครั้ง
//    ⇒ 2 โปรเซสพร้อมกันไม่สร้าง Party ซ้ำ (อีกตัวรอจน batch นี้ commit) · ไม่ถือ row lock ของตารางธุรกรรมจริงทั้งร้านไว้นาน
//    Party หา "นอก" tx ของ batch (facade เปิดขาของตัวเอง) — ถ้า batch ล้ม Party ที่สร้างแล้วถูกหาเจอด้วยกุญแจเดิมในรอบถัดไป
// 🔴 ร้านหนึ่งล้ม = log tenant id แล้วร้านถัดไปเดินต่อ
// 🔴 AUDIT-CLASS X8: log แค่ชื่อตาราง/จำนวน ไม่พิมพ์เบอร์/อีเมล/ชื่อลูกค้า
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/crm-backfill-party-links.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/crm-backfill-party-links.mts --tenant <slug> --dry-run   (ใบ C6.2 เท่านั้น)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "crm-backfill-party-links";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const party = (await import("@/lib/modules/party" as string)) as Any;
const P = prisma as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

type Src = { table: string; model: string; name: string; phone: string; email?: string };
/** ตารางที่มีตัวตนลูกค้าในแถวเอง (ClinicVisit ทำแยกหลัง PatientRecord — ได้ partyId จากคนไข้) */
const SOURCES: Src[] = [
  { table: "CrmContact", model: "crmContact", name: "name", phone: "phone", email: "email" },
  { table: "PatientRecord", model: "patientRecord", name: "name", phone: "phone" },
  { table: "Appointment", model: "appointment", name: "customerName", phone: "customerPhone" },
  { table: "ShopOrder", model: "shopOrder", name: "customerName", phone: "customerPhone" },
  { table: "RentalBooking", model: "rentalBooking", name: "customerName", phone: "customerPhone" },
  { table: "QueueTicket", model: "queueTicket", name: "contactName", phone: "contactPhone", email: "contactEmail" },
  { table: "TicketOrder", model: "ticketOrder", name: "buyerName", phone: "buyerPhone" },
  { table: "SchoolEnrollment", model: "schoolEnrollment", name: "studentName", phone: "studentPhone" },
  { table: "HotelReservation", model: "hotelReservation", name: "guestName", phone: "guestPhone", email: "guestEmail" },
];

const counts: Record<string, number> = { ร้านที่แก้: 0, ร้านที่ล้ม: 0 };
for (const s of SOURCES) counts[s.table] = 0;
counts.ClinicVisit = 0;
counts.ข้ามเพราะไม่มีกุญแจที่เชื่อถือได้ = 0;

/** batch ละกี่แถว — transaction สั้น ๆ ต่อ batch (ห้ามถือ row lock ของตารางธุรกรรมจริงทั้งร้านไว้ใน tx เดียว) */
const BATCH = 200;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const lockKey = (tenantId: string) => `crm-backfill:party-links:${tenantId}`;

/**
 * กุญแจที่เชื่อถือได้ของแถว (กติกาเดียวกับจุดเขียน 9 จุด):
 *   เบอร์ normalize ≥ 9 หลัก → จับคู่ด้วยเบอร์ · ไม่งั้นอีเมลที่ถูกรูป → จับคู่ด้วย "ชื่อ + อีเมล" (กติกาของ Party)
 *   ไม่มีทั้งสอง = ไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์สั้น ⇒ Party ขยะ)
 */
function keyOf(name: string, phone: string, email: string): { key: string; phone: string | null; email: string | null } | null {
  const pn = phone ? party.normalizePartyPhone(phone) : "";
  if (pn.length >= 9) return { key: `p:${pn}`, phone, email: EMAIL_OK.test(email) ? email : null };
  if (EMAIL_OK.test(email)) return { key: `e:${name.toLowerCase()}|${email.toLowerCase()}`, phone: null, email };
  return null;
}

async function linkTenant(t: { id: string }, write: boolean): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const cache = new Map<string, string>(); // กุญแจ → partyId (กันหา Party ซ้ำในรอบเดียว)
  for (const s of SOURCES) {
    const select: Record<string, true> = { id: true, [s.name]: true, [s.phone]: true };
    if (s.email) select[s.email] = true;
    let n = 0;
    let cursor = "";
    for (;;) {
      // 🔴 batch ละ transaction สั้น ๆ + advisory lock ของร้านถูกยึดใหม่ทุก batch (AUDIT-CLASS X3):
      //    อีกโปรเซสที่รันพร้อมกันต้องรอ batch นี้ commit ก่อน ⇒ เห็น Party/partyId ที่เพิ่งเขียน ไม่สร้างซ้ำ
      //    · row lock ของตารางธุรกรรมถูกถือแค่ช่วง batch เดียว (งานสดของร้าน เช่นยืนยันจ่าย/เช็กอิน ไม่ค้าง)
      const step = async (db: Any) => {
        if (write) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(t.id)}))`;
        const rows = (await db[s.model].findMany({
          where: { tenantId: t.id, partyId: null, ...(cursor ? { id: { gt: cursor } } : {}) },
          select, orderBy: { id: "asc" }, take: BATCH,
        })) as Any[];
        let linked = 0;
        for (const r of rows) {
          const name = String(r[s.name] ?? "").trim() || "ลูกค้าไม่ระบุชื่อ";
          const k = keyOf(name, String(r[s.phone] ?? "").trim(), s.email ? String(r[s.email] ?? "").trim() : "");
          if (!k) { counts.ข้ามเพราะไม่มีกุญแจที่เชื่อถือได้ += 1; continue; }
          linked += 1;
          if (!write) continue;
          let partyId = cache.get(k.key) ?? null;
          if (!partyId) {
            // Party หา "นอก" tx ของ batch (facade เปิดขาของตัวเอง) — ยังอยู่ใต้ advisory lock ของร้าน
            partyId = await party.safeFindOrCreate(t.id, { name, phone: k.phone, email: k.email, kind: "PERSON" });
            if (partyId) cache.set(k.key, partyId);
          }
          if (!partyId) { console.warn(`  ⚠️  ${s.table}: หา Party ไม่ได้ 1 แถว — ปล่อยว่างไว้ (รันซ้ำได้)`); linked -= 1; continue; }
          await db[s.model].updateMany({ where: { id: r.id, tenantId: t.id, partyId: null }, data: { partyId } });
        }
        return { linked, last: rows.length ? rows[rows.length - 1].id : null, size: rows.length };
      };
      const r = write ? await P.$transaction(step, { timeout: 120_000, maxWait: 120_000 }) : await step(P);
      n += r.linked;
      if (!r.last || r.size < BATCH) break;
      cursor = r.last;
    }
    out[s.table] = n;
  }
  // ClinicVisit: ไม่มีเบอร์ในแถว — ใช้ partyId ของคนไข้ (PatientRecord) ที่เพิ่งเติมด้านบน
  // 🔴 AUDIT-CLASS X1: คนไข้ต้องอยู่ร้านเดียวกับ visit (p.tenantId = v.tenantId) — ห้ามพึ่ง FK อย่างเดียว
  out.ClinicVisit = write
    ? Number(await P.$executeRaw`
        UPDATE "ClinicVisit" v SET "partyId" = p."partyId"
          FROM "PatientRecord" p
         WHERE v."patientId" = p."id" AND p."tenantId" = v."tenantId" AND v."tenantId" = ${t.id}
           AND v."partyId" IS NULL AND p."partyId" IS NOT NULL`)
    : Number((await P.clinicVisit.count({ where: { tenantId: t.id, partyId: null } })) ?? 0);
  return out;
}

for (const t of tenants) {
  try {
    // 🔴 ร้านหนึ่งล้ม = log (tenant id เท่านั้น ไม่มีข้อมูลลูกค้า) แล้วร้านถัดไปเดินต่อ · batch ที่ commit แล้วคงอยู่ (idempotent — รันซ้ำเก็บตกได้)
    let r: Record<string, number>;
    try {
      r = await linkTenant(t, !args.dryRun);
    } catch (e) {
      counts.ร้านที่ล้ม += 1;
      console.error(`  ❌ ร้าน ${t.id} (${t.slug}): ล้ม — ${e instanceof Error ? e.name : "unknown"} · ข้ามไปร้านถัดไป`);
      continue;
    }
    const total = Object.values(r).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(r)) counts[k] = (counts[k] ?? 0) + v;
    if (total) counts.ร้านที่แก้ += 1;
    const body = Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ") || "ไม่มีแถวที่ต้องเติม";
    console.log(`  ${total ? "✏️ " : "· "} ${t.name} (${t.slug}) · ${args.dryRun ? "จะเติม" : "เติมแล้ว"}: ${body}`);
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
