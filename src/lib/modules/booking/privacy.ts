// ─────────────────────────────────────────────────────────────
// booking/privacy.ts — ลบข้อมูลส่วนบุคคลของลูกค้า walk-in ตามอายุที่ร้านตั้ง (server) · SVC B.11 ใบสั่ง §8.1 · ภาคผนวก ก #66
//
//   N = booking.privacy.walkInRetentionDays ที่มีผลต่อสาขา (null = ไม่แตะสาขานั้น · ร้านเดิม _fallback = ไม่ลบ)
//   (ก) นัด walk-in ที่ไม่ใช่สมาชิกเก่ากว่า N วัน ⇒ ตัดชื่อ/เบอร์/โน้ต/Party (แถวอยู่ต่อเพื่อรายงาน/บิล)
//   (ข) บัตรคิวที่ไม่ใช่สมาชิกเก่ากว่า N วัน ⇒ ตัดชื่อ/เบอร์/อีเมล/Party
//   (ค) Customer ที่ค้างจากทางจอง (source BOOKING/WALK_IN เท่านั้น · มติผู้คุม 29 ต.ค.) ที่ไม่มีอะไรอ้างถึงเลย ⇒ ลบแถว
//   (ง) Party ที่หลุดจาก (ก)–(ค) ในรอบนี้และไม่มีอะไรอ้างถึง ⇒ ลบแถว
//   ตัวอ้างอิงหาจาก Prisma.dmmf (ห้ามพิมพ์รายชื่อตารางมือ) · ทุกขั้นเป็นคำสั่งเดียวที่มีเงื่อนไขซ้ำใน WHERE ⇒ รันพร้อมกันได้ผลรวมเท่ารอบเดียว (X5)
//   ผ่าน tenantDb เท่านั้น (ไม่ใช้ prisma ดิบ) · ตรวจตัวอ้างอิงข้ามตารางด้วย SQL ที่ประกอบชื่อตาราง/คอลัมน์จาก dmmf
//   AuditLog booking.privacy.purged มีจำนวนเท่านั้น (ไม่มีชื่อ/เบอร์ — X8) · ทีละ ≤ 500 แถว/ชนิด/รอบ
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { resolveSettingsMany } from "@/lib/core/settings";

const K_RETENTION = "booking.privacy.walkInRetentionDays";
const BATCH = 500;
const DAY_MS = 86_400_000;
const WALKIN_NAME = "ลูกค้า walk-in";
const PURGE_SOURCES = ["BOOKING", "WALK_IN"] as const;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type PurgeResult = { appointments: number; tickets: number; customers: number; parties: number };

type RefCol = { model: string; field: string };
type DmmfField = { name: string; kind: string; type: string; relationFromFields?: readonly string[] };
type DmmfModel = { name: string; fields: readonly DmmfField[] };

/** คอลัมน์ที่อาจอ้างถึงแถวของ target (ชื่อคอลัมน์ตามแบบแผน + FK จากความสัมพันธ์ใน schema) — จาก Prisma.dmmf */
function refColumns(target: "Customer" | "Party"): RefCol[] {
  const models = (Prisma.dmmf.datamodel.models ?? []) as unknown as readonly DmmfModel[];
  const out = new Map<string, RefCol>();
  const add = (model: string, field: string) => {
    if (IDENT.test(model) && IDENT.test(field)) out.set(`${model}.${field}`, { model, field });
  };
  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind === "scalar" && f.type === "String") {
        const n = f.name;
        if (target === "Customer") {
          if (["customerId", "memberId", "referredById", "mergedIntoId"].includes(n) || n.endsWith("CustomerId") || n.endsWith("MemberId")) add(m.name, n);
        } else if (n === "partyId" || n.endsWith("PartyId") || (m.name === "Party" && n === "mergedIntoId")) add(m.name, n);
      }
      if (f.kind === "object" && f.type === target) for (const fk of f.relationFromFields ?? []) add(m.name, fk);
    }
  }
  return [...out.values()];
}

let CUSTOMER_REFS: RefCol[] | null = null;
let PARTY_REFS: RefCol[] | null = null;

type Db = ReturnType<typeof tenantDb>;
const q = (id: string) => Prisma.raw(`"${id}"`);

/** id ใน ids ที่มีแถวใดในฐานอ้างถึง (ยกเว้นแถวของตัวเองในคอลัมน์ของตัวเอง) — ข้ามทุกร้าน (id เป็น cuid ไม่ชนกัน) */
async function referenced(db: Db, cols: readonly RefCol[], ids: readonly string[], selfModel: string): Promise<Set<string>> {
  const hit = new Set<string>();
  if (!ids.length) return hit;
  const arr = [...ids];
  for (const c of cols) {
    const self = c.model === selfModel;
    const rows = await db.$queryRaw<{ v: string | null; id: string | null }[]>(
      Prisma.sql`SELECT DISTINCT ${q(c.field)}::text AS v, ${self ? q("id") : Prisma.raw("NULL")}::text AS id FROM ${q(c.model)} WHERE ${q(c.field)} = ANY(${arr}::text[])`,
    );
    for (const r of rows) {
      if (typeof r.v !== "string") continue;
      if (self && r.id === r.v) continue;
      hit.add(r.v);
    }
  }
  return hit;
}

type UnitPolicy = { unitId: string; cutoff: Date };

async function purgeTenant(tenantId: string, now: Date): Promise<PurgeResult> {
  const res: PurgeResult = { appointments: 0, tickets: 0, customers: 0, parties: 0 };
  const tdb = tenantDb({ tenantId });
  const units = await tdb.businessUnit.findMany({ where: { type: "BOOKING" }, select: { id: true } });
  if (!units.length) return res;
  const sets = await resolveSettingsMany({ tenantId }, [K_RETENTION], units.map((u) => ({ unitId: u.id })), now);
  const withN: UnitPolicy[] = [];
  const withoutN = new Set<string>();
  units.forEach((u, i) => {
    const n = sets[i]?.[K_RETENTION]?.value;
    if (typeof n === "number" && Number.isInteger(n) && n >= 1) withN.push({ unitId: u.id, cutoff: new Date(now.getTime() - n * DAY_MS) });
    else withoutN.add(u.id);
  });
  if (!withN.length) return res;
  CUSTOMER_REFS ??= refColumns("Customer");
  PARTY_REFS ??= refColumns("Party");

  /** partyId ที่ถูกตัดออกในรอบนี้ → cutoff ที่ใช้ตัดสิน (เก่ากว่า cutoff เท่านั้นจึงลบ) */
  const partyCut = new Map<string, Date>();
  const notePartyCut = (pid: string | null, cutoff: Date) => {
    if (!pid) return;
    const prev = partyCut.get(pid);
    if (!prev || cutoff < prev) partyCut.set(pid, cutoff);
  };
  const STILL_HAS_DATA = { NOT: { AND: [{ customerName: WALKIN_NAME }, { customerPhone: "" }, { note: null }, { partyId: null }] } };
  const TICKET_HAS_DATA = { OR: [{ contactName: { not: null } }, { contactPhone: { not: null } }, { contactEmail: { not: null } }, { partyId: { not: null } }] };

  for (const p of withN) {
    const udb = tenantDb({ tenantId, unitId: p.unitId });
    // (ก) นัด walk-in ที่ไม่ใช่สมาชิก — UPDATE ซ้ำเงื่อนไข "ยังมีข้อมูล" ⇒ รอบพร้อมกันนับแถวละครั้ง
    const appts = await udb.appointment.findMany({
      where: { kind: "WALKIN", customerId: null, startAt: { lt: p.cutoff }, ...STILL_HAS_DATA },
      select: { id: true, partyId: true },
      take: BATCH,
    });
    if (appts.length) {
      const u = await udb.appointment.updateMany({
        where: { id: { in: appts.map((a) => a.id) }, kind: "WALKIN", customerId: null, ...STILL_HAS_DATA },
        data: { customerName: WALKIN_NAME, customerPhone: "", note: null, partyId: null },
      });
      res.appointments += u.count;
      for (const a of appts) notePartyCut(a.partyId, p.cutoff);
    }
    // (ข) บัตรคิวที่ไม่ใช่สมาชิก
    const tickets = await udb.queueTicket.findMany({
      where: { memberId: null, createdAt: { lt: p.cutoff }, ...TICKET_HAS_DATA },
      select: { id: true, partyId: true },
      take: BATCH,
    });
    if (tickets.length) {
      const u = await udb.queueTicket.updateMany({
        where: { id: { in: tickets.map((t) => t.id) }, memberId: null, ...TICKET_HAS_DATA },
        data: { contactName: null, contactPhone: null, contactEmail: null, partyId: null },
      });
      res.tickets += u.count;
      for (const t of tickets) notePartyCut(t.partyId, p.cutoff);
    }
  }

  // (ค) Customer ค้างจากทางจอง — ระบบสมาชิกที่ผูกกับสาขาที่มี N (ผูกหลายสาขา ⇒ N มากสุด · ผูกสาขาจองที่ไม่ลบ ⇒ ไม่แตะทั้งระบบ)
  const links = await tdb.appSystemUnit.findMany({
    where: { type: "MEMBER", unitId: { in: [...withN.map((p) => p.unitId), ...withoutN] } },
    select: { systemId: true, unitId: true },
  });
  const cutOfUnit = new Map(withN.map((p) => [p.unitId, p.cutoff]));
  const sysCut = new Map<string, Date | null>();
  for (const l of links) {
    const c = cutOfUnit.get(l.unitId) ?? null;
    if (!sysCut.has(l.systemId)) sysCut.set(l.systemId, c);
    else {
      const prev = sysCut.get(l.systemId) ?? null;
      sysCut.set(l.systemId, prev === null || c === null ? null : c < prev ? c : prev);
    }
  }
  const CUSTOMER_LEFTOVER = {
    source: { in: [...PURGE_SOURCES] },
    visitCount: 0,
    totalSpentSatang: 0,
    tierPoints: 0,
    marketingConsent: false,
    consentAt: null,
    email: null,
    lineUserId: null,
    note: null,
    referralCode: null,
    mergedIntoId: null,
  };
  for (const [systemId, cutoff] of sysCut) {
    if (!cutoff) continue;
    const sdb = tenantDb({ tenantId, systemId });
    const cands = await sdb.customer.findMany({ where: { createdAt: { lt: cutoff }, ...CUSTOMER_LEFTOVER }, select: { id: true, partyId: true }, take: BATCH });
    if (!cands.length) continue;
    const refs = await referenced(sdb, CUSTOMER_REFS, cands.map((c) => c.id), "Customer");
    const del = cands.filter((c) => !refs.has(c.id));
    if (!del.length) continue;
    const d = await sdb.customer.deleteMany({ where: { id: { in: del.map((c) => c.id) }, createdAt: { lt: cutoff }, ...CUSTOMER_LEFTOVER } });
    res.customers += d.count;
    for (const c of del) notePartyCut(c.partyId, cutoff);
  }

  // (ง) Party ที่หลุดในรอบนี้ · เก่ากว่า cutoff · ไม่มีอะไรอ้างถึง
  if (partyCut.size) {
    const ids = [...partyCut.keys()].slice(0, BATCH);
    const rows = await tdb.party.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } });
    const old = rows.filter((r) => r.createdAt < (partyCut.get(r.id) ?? new Date(0))).map((r) => r.id);
    const refs = await referenced(tdb, PARTY_REFS, old, "Party");
    const del = old.filter((id) => !refs.has(id));
    if (del.length) res.parties += (await tdb.party.deleteMany({ where: { id: { in: del } } })).count;
  }

  if (res.appointments + res.tickets + res.customers + res.parties > 0) {
    await tdb.auditLog.create({
      data: { tenantId, actorType: "SYSTEM", action: "booking.privacy.purged", targetType: "Tenant", targetId: tenantId, after: { ...res, at: now.toISOString() } },
    });
  }
  return res;
}

/** ร้านที่มีสาขาจองคิว (ไม่ส่ง opts.tenantIds = ทุกร้าน) — อ่านข้ามร้านด้วย SQL อ่านอย่างเดียว */
async function bookingTenantIds(): Promise<string[]> {
  const rows = await tenantDb({ tenantId: "" }).$queryRaw<{ tenantId: string }[]>(
    Prisma.sql`SELECT DISTINCT "tenantId" FROM "BusinessUnit" WHERE "type"::text = 'BOOKING'`,
  );
  return rows.map((r) => r.tenantId);
}

/** งานลบข้อมูลส่วนตัว walk-in (minute-job booking.privacy.purge ชั่วโมงละครั้ง) · opts.tenantIds จำกัดร้าน (ไม่ส่ง = ทุกร้าน) · ไม่ throw ต่อร้าน */
export async function purgeBookingPersonalData(now: Date, opts?: { tenantIds?: string[] }): Promise<PurgeResult> {
  const total: PurgeResult = { appointments: 0, tickets: 0, customers: 0, parties: 0 };
  const ids = opts?.tenantIds ? [...new Set(opts.tenantIds.filter((x): x is string => typeof x === "string" && x.length > 0))] : await bookingTenantIds();
  for (const tenantId of ids) {
    try {
      const r = await purgeTenant(tenantId, now);
      total.appointments += r.appointments;
      total.tickets += r.tickets;
      total.customers += r.customers;
      total.parties += r.parties;
    } catch (e) {
      console.error(`[booking.privacy.purge] ร้าน ${tenantId}:`, e instanceof Error ? e.message : e);
    }
  }
  return total;
}
