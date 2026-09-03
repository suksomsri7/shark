// WO 3.1 — backfill Party ให้แถวเก่าใน 5 ตารางผู้ผลิต (partyId ยังว่าง):
//   AccountContact · Customer · CrmContact · HrEmployee · Supplier
// (ChatContact/PatientRecord/HotelReservation/TicketOrder/SchoolEnrollment มีคอลัมน์แล้วแต่ยัง "ไม่ wiring"
//  ตามใบสั่งงาน WO 3.1 — นอกขอบเขตสคริปต์นี้ ดู ledger/wo-notes/3.1.md)
//
// ใช้:
//   pnpm exec tsx scripts/acc-v2-party-backfill.mts                       → dry-run ทุก tenant ใน DB นี้ (ค่าเริ่มต้น)
//   pnpm exec tsx scripts/acc-v2-party-backfill.mts --apply               → เขียนจริงทุก tenant
//   pnpm exec tsx scripts/acc-v2-party-backfill.mts --tenant <id> --apply → เฉพาะ tenant เดียว
//
// 🔴 โหลด `.env.qc` เท่านั้นผ่าน `scripts/acc-v2-env.mts` (ด่านกัน host production อยู่ในนั้น — ห้ามแตะ prod)
//
// ลำดับจับคู่ต่อ tenant (INTEGRATION-MAP §F.6) — ประมวลผลเป็นชั้น ชั้นถัดไปข้ามแถวที่ชั้นก่อนจัดการไปแล้ว:
//   1) taxId + branchCode  (มีเฉพาะ AccountContact)
//   2) phoneNorm           (ทุกตาราง — normalize ด้วยสูตรเดียวกับ party.findOrCreate)
//   3) name + email ตรงกันทั้งคู่ (ทุกตาราง — ห้ามจับด้วยชื่อเปล่า)
// แถวที่ไม่เข้าเงื่อนไขไหนเลย (ไม่มี taxId/เบอร์/[ชื่อ+อีเมล]) → ข้าม ไม่สร้าง Party จากข้อมูลไม่พอ
//
// กำกวม (ambiguous) = คีย์เดียวกัน (เช่น taxId+branchCode เดียวกัน) ชี้ไปที่ Party ที่มีอยู่แล้ว **มากกว่า 1 ราย**
//   (หรือ Party ที่กำลังจะสร้างใหม่ในรอบนี้ไปชนกับของเดิมมากกว่า 1 ราย) → **ไม่ auto-merge/auto-pick ตัวใดตัวหนึ่ง**
//   ปล่อย partyId ของแถวกลุ่มนั้นเป็นค่าเดิม (null) + บันทึกคู่ Party ที่ชนกันลง PartyMergeCandidate (idempotent)
//   ให้หน้า "รวมผู้ติดต่อซ้ำ" (WO 3.4) จัดการต่อ
//
// idempotent: แถวที่มี partyId แล้วไม่ถูกดึงมาประมวลผลเลย (query กรอง partyId: null) — รันซ้ำได้ไม่จำกัดครั้ง
// dry-run จำลองด้วย pool ในหน่วยความจำ (ไม่เขียน DB) ให้ตัวเลขตรงกับโหมด --apply จริง (ดู `PartyPoolEntry`)

// tsconfig ไม่เปิด allowImportingTsExtensions → import แบบ static .mts จะ typecheck ไม่ผ่าน ⇒ dynamic import
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
};
const { loadQcEnv } = accEnv;
const { host } = loadQcEnv();
console.log(`🗄️  DB QC: ${host}`);

const { prisma } = await import("@/lib/core/db");
const { normalizePartyTaxId, normalizePartyPhone } = await import("@/lib/modules/party");

type PartyKind = "PERSON" | "COMPANY";
type MergeReason = "TAX_ID" | "PHONE" | "NAME_SIMILAR";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const tenantArgIdx = argv.indexOf("--tenant");
const onlyTenantId = tenantArgIdx >= 0 ? argv[tenantArgIdx + 1] : undefined;

console.log(`โหมด: ${apply ? "เขียนจริง (--apply)" : "ซ้อม (dry-run — ไม่เขียน)"}${onlyTenantId ? ` · เฉพาะ tenant ${onlyTenantId}` : " · ทุก tenant ใน DB นี้"}\n`);

// ─────────────────────── แถวต้นทาง (แปลงทุกตารางให้เป็นรูปเดียวกัน) ───────────────────────

type SourceTable = "AccountContact" | "Customer" | "CrmContact" | "HrEmployee" | "Supplier";
type SourceRow = {
  table: SourceTable;
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  branchCode: string | null;
  isCompanyHint: boolean; // legalType COMPANY (AccountContact) หรือเป็น Supplier (ผู้ขายส่วนใหญ่เป็นนิติบุคคล)
};

async function loadSources(tenantId: string): Promise<Record<SourceTable, SourceRow[]>> {
  const [accountRows, customerRows, crmRows, hrRows, supplierRows] = await Promise.all([
    prisma.accountContact.findMany({
      where: { tenantId, partyId: null },
      select: { id: true, name: true, phone: true, email: true, taxId: true, branchCode: true, legalType: true },
    }),
    prisma.customer.findMany({
      where: { tenantId, partyId: null },
      select: { id: true, name: true, phone: true, email: true },
    }),
    prisma.crmContact.findMany({
      where: { tenantId, partyId: null },
      select: { id: true, name: true, phone: true, email: true },
    }),
    prisma.hrEmployee.findMany({
      where: { tenantId, partyId: null },
      select: { id: true, name: true, phone: true, email: true },
    }),
    prisma.supplier.findMany({
      where: { tenantId, partyId: null },
      select: { id: true, name: true, phone: true, email: true },
    }),
  ]);
  return {
    AccountContact: accountRows.map((r) => ({
      table: "AccountContact",
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email,
      taxId: r.taxId,
      branchCode: r.branchCode,
      isCompanyHint: r.legalType === "COMPANY",
    })),
    Customer: customerRows.map((r) => ({
      table: "Customer",
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email,
      taxId: null,
      branchCode: null,
      isCompanyHint: false,
    })),
    CrmContact: crmRows.map((r) => ({
      table: "CrmContact",
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email,
      taxId: null,
      branchCode: null,
      isCompanyHint: false,
    })),
    HrEmployee: hrRows.map((r) => ({
      table: "HrEmployee",
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email,
      taxId: null,
      branchCode: null,
      isCompanyHint: false,
    })),
    Supplier: supplierRows.map((r) => ({
      table: "Supplier",
      id: r.id,
      name: r.name ?? "",
      phone: r.phone,
      email: r.email,
      taxId: null,
      branchCode: null,
      isCompanyHint: true,
    })),
  };
}

// ─────────────────────── pool ของ Party ในหน่วยความจำ (ให้ dry-run จำลองผลตรงกับ --apply) ───────────────────────

type PartyPoolEntry = {
  id: string;
  taxId: string | null;
  branchCode: string | null;
  phoneNorm: string | null;
  name: string;
  email: string | null;
};

async function backfillTenant(tenantId: string) {
  const byTable = await loadSources(tenantId);
  const scanned: Record<SourceTable, number> = {
    AccountContact: byTable.AccountContact.length,
    Customer: byTable.Customer.length,
    CrmContact: byTable.CrmContact.length,
    HrEmployee: byTable.HrEmployee.length,
    Supplier: byTable.Supplier.length,
  };
  const sources: SourceRow[] = [
    ...byTable.AccountContact,
    ...byTable.Customer,
    ...byTable.CrmContact,
    ...byTable.HrEmployee,
    ...byTable.Supplier,
  ];

  let matched = 0;
  let created = 0;
  let ambiguous = 0;
  const skipped = { noKey: 0 };
  const resolution = new Map<number, string>(); // source index → partyId
  const mergeCandidates: { partyAId: string; partyBId: string; reason: MergeReason }[] = [];

  // pool เริ่มจาก Party จริงที่มีอยู่แล้วของ tenant นี้ (ยังไม่ถูกรวม)
  const existingParties = await prisma.party.findMany({
    where: { tenantId, mergedIntoId: null },
    select: { id: true, taxId: true, branchCode: true, phoneNorm: true, name: true, email: true },
  });
  const pool: PartyPoolEntry[] = existingParties.map((p) => ({ ...p }));

  const remaining = new Set<number>(sources.map((_, i) => i));

  async function resolveGroup(idxs: number[], match: (e: PartyPoolEntry) => boolean, reason: MergeReason) {
    const candidates = pool.filter(match);
    if (candidates.length > 1) {
      ambiguous += idxs.length;
      for (let i = 0; i < candidates.length; i++)
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i]!.id;
          const b = candidates[j]!.id;
          const [x, y] = a < b ? [a, b] : [b, a];
          if (!mergeCandidates.some((m) => m.partyAId === x && m.partyBId === y))
            mergeCandidates.push({ partyAId: x, partyBId: y, reason });
        }
      return;
    }
    let partyId: string;
    if (candidates.length === 1) {
      partyId = candidates[0]!.id;
    } else {
      // ไม่มีเลย → สร้างใหม่ 1 ราย จากข้อมูลรวมของกลุ่ม (แถวแรกที่มีค่า ชนะ)
      let name = "";
      let phone: string | null = null;
      let email: string | null = null;
      let taxId: string | null = null;
      let branchCode: string | null = null;
      let isCompanyHint = false;
      for (const i of idxs) {
        const s = sources[i]!;
        if (!name && s.name.trim()) name = s.name.trim();
        if (!phone && s.phone) phone = s.phone;
        if (!email && s.email) email = s.email;
        if (!taxId && s.taxId) taxId = normalizePartyTaxId(s.taxId);
        if (!branchCode && s.branchCode) branchCode = s.branchCode;
        if (s.isCompanyHint) isCompanyHint = true;
      }
      const phoneNorm = normalizePartyPhone(phone) || null;
      const finalName = name || phone || email || "(ไม่ทราบชื่อ)";
      const kind: PartyKind = taxId || isCompanyHint ? "COMPANY" : "PERSON";
      if (apply) {
        const row = await prisma.party.create({
          data: {
            tenantId,
            kind,
            name: finalName,
            phone,
            phoneNorm,
            email,
            taxId: taxId || null,
            ...(taxId || branchCode ? { branchCode: branchCode || "00000" } : {}),
          },
          select: { id: true },
        });
        partyId = row.id;
      } else {
        partyId = `virtual:${pool.length}:${tenantId}`; // id จำลอง — ไม่ persist
      }
      pool.push({ id: partyId, taxId: taxId || null, branchCode: branchCode || null, phoneNorm, name: finalName, email });
      created++;
    }
    for (const i of idxs) {
      resolution.set(i, partyId);
      remaining.delete(i);
    }
    matched += idxs.length;
  }

  // ── Tier 1: taxId + branchCode ──
  {
    const groups = new Map<string, number[]>();
    for (const i of remaining) {
      const s = sources[i]!;
      const taxId = normalizePartyTaxId(s.taxId);
      if (!taxId) continue;
      const key = `${taxId}#${s.branchCode || "00000"}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    for (const [key, idxs] of groups) {
      const [taxId, branchCode] = key.split("#") as [string, string];
      await resolveGroup(idxs, (e) => e.taxId === taxId && (e.branchCode || "00000") === branchCode, "TAX_ID");
    }
  }

  // ── Tier 2: phoneNorm ──
  {
    const groups = new Map<string, number[]>();
    for (const i of remaining) {
      const s = sources[i]!;
      const phoneNorm = normalizePartyPhone(s.phone);
      if (!phoneNorm || phoneNorm.length < 8) continue;
      groups.set(phoneNorm, [...(groups.get(phoneNorm) ?? []), i]);
    }
    for (const [phoneNorm, idxs] of groups) {
      await resolveGroup(idxs, (e) => e.phoneNorm === phoneNorm, "PHONE");
    }
  }

  // ── Tier 3: name + email ──
  {
    const groups = new Map<string, number[]>();
    for (const i of remaining) {
      const s = sources[i]!;
      const name = s.name.trim();
      const email = (s.email ?? "").trim();
      if (!name || !email) continue;
      groups.set(`${name}#${email}`, [...(groups.get(`${name}#${email}`) ?? []), i]);
    }
    for (const [key, idxs] of groups) {
      const cut = key.lastIndexOf("#");
      const name = key.slice(0, cut);
      const email = key.slice(cut + 1);
      await resolveGroup(idxs, (e) => e.name === name && e.email === email, "NAME_SIMILAR");
    }
  }

  skipped.noKey = remaining.size;

  // ── เขียนจริง (apply เท่านั้น) ──
  if (apply) {
    const byTableUpdates = new Map<SourceTable, { id: string; partyId: string }[]>();
    for (const [i, partyId] of resolution) {
      const s = sources[i]!;
      if (!byTableUpdates.has(s.table)) byTableUpdates.set(s.table, []);
      byTableUpdates.get(s.table)!.push({ id: s.id, partyId });
    }
    for (const [table, rows] of byTableUpdates) {
      for (const r of rows) {
        switch (table) {
          case "AccountContact":
            await prisma.accountContact.updateMany({ where: { id: r.id }, data: { partyId: r.partyId } });
            break;
          case "Customer":
            await prisma.customer.updateMany({ where: { id: r.id }, data: { partyId: r.partyId } });
            break;
          case "CrmContact":
            await prisma.crmContact.updateMany({ where: { id: r.id }, data: { partyId: r.partyId } });
            break;
          case "HrEmployee":
            await prisma.hrEmployee.updateMany({ where: { id: r.id }, data: { partyId: r.partyId } });
            break;
          case "Supplier":
            await prisma.supplier.updateMany({ where: { id: r.id }, data: { partyId: r.partyId } });
            break;
        }
      }
    }
    for (const m of mergeCandidates) {
      const existing = await prisma.partyMergeCandidate.findFirst({
        where: { tenantId, partyAId: m.partyAId, partyBId: m.partyBId },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.partyMergeCandidate.create({
        data: { tenantId, partyAId: m.partyAId, partyBId: m.partyBId, reason: m.reason, status: "OPEN" },
      });
    }
  }

  return { scanned, matched, created, ambiguous, skipped: skipped.noKey, mergeCandidatesRecorded: mergeCandidates.length };
}

// ─────────────────────── main ───────────────────────

let tenantIds: string[];
if (onlyTenantId) {
  tenantIds = [onlyTenantId];
} else {
  const [a, c, cr, h, s] = await Promise.all([
    prisma.accountContact.findMany({ where: { partyId: null }, distinct: ["tenantId"], select: { tenantId: true } }),
    prisma.customer.findMany({ where: { partyId: null }, distinct: ["tenantId"], select: { tenantId: true } }),
    prisma.crmContact.findMany({ where: { partyId: null }, distinct: ["tenantId"], select: { tenantId: true } }),
    prisma.hrEmployee.findMany({ where: { partyId: null }, distinct: ["tenantId"], select: { tenantId: true } }),
    prisma.supplier.findMany({ where: { partyId: null }, distinct: ["tenantId"], select: { tenantId: true } }),
  ]);
  tenantIds = [...new Set([a, c, cr, h, s].flat().map((r) => r.tenantId))].sort();
}

const perTenant: {
  tenantId: string;
  scanned: Record<SourceTable, number>;
  matched: number;
  created: number;
  ambiguous: number;
  skipped: number;
  mergeCandidatesRecorded: number;
}[] = [];

for (const tenantId of tenantIds) {
  const r = await backfillTenant(tenantId);
  const totalScanned = Object.values(r.scanned).reduce((a, b) => a + b, 0);
  console.log(`\n=== tenant ${tenantId} ===`);
  console.log(
    `  scanned: AccountContact=${r.scanned.AccountContact} Customer=${r.scanned.Customer} CrmContact=${r.scanned.CrmContact} HrEmployee=${r.scanned.HrEmployee} Supplier=${r.scanned.Supplier} (รวม ${totalScanned})`,
  );
  console.log(
    `  matched=${r.matched} created=${r.created} ambiguous=${r.ambiguous} ข้าม(ไม่มีคีย์)=${r.skipped} คู่ซ้ำที่บันทึก=${r.mergeCandidatesRecorded}`,
  );
  perTenant.push({ tenantId, ...r });
}

if (tenantIds.length === 0) {
  console.log("\nไม่พบแถวที่ต้อง backfill ใน tenant ใดเลย (partyId ครบทุกแถวแล้ว หรือ --tenant ที่ระบุไม่มีข้อมูล)");
}

const totals = perTenant.reduce(
  (acc, t) => {
    acc.scanned += Object.values(t.scanned).reduce((a, b) => a + b, 0);
    acc.matched += t.matched;
    acc.created += t.created;
    acc.ambiguous += t.ambiguous;
    return acc;
  },
  { scanned: 0, matched: 0, created: 0, ambiguous: 0 },
);

console.log(
  `\nสรุปรวม ${tenantIds.length} tenant: scanned=${totals.scanned} matched=${totals.matched} created=${totals.created} ambiguous=${totals.ambiguous}${apply ? "" : " (ซ้อม — ไม่ได้เขียนจริง)"}`,
);

// บรรทัดสุดท้าย = JSON บรรทัดเดียว (ให้ข้อสอบ parse)
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", tenants: perTenant, totals }));

await prisma.$disconnect();
