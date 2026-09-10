// backfill 4/6 — เชื่อมตัวตนกลาง Party (D12 · พิมพ์เขียว §4.6 ข้อ 5)
//
// ทำ 4 อย่าง (ตามลำดับ — ขั้นหลังใช้ผลของขั้นแรก)
//   1) `Customer.partyId` ว่าง → หา/สร้าง Party จากชื่อ/เบอร์/อีเมล (ผ่าน facade `@/lib/modules/party`)
//   2) `ChatContact.partyId` ว่าง + เบอร์/อีเมลตรงกับสมาชิกในร้าน → partyId เดียวกับสมาชิก +
//      `customerId` + `linkedBy` (PHONE/EMAIL) + `linkedAt`
//   3) `CrmContact.partyId` ว่าง → partyId ผ่านเบอร์/อีเมล (**ไม่** ตั้ง customerId — CRM มี memberCustomerId ของตัวเอง)
//   4) `AccountContact.partyId` ว่าง → เหมือนข้อ 3
//
// 🔴 ห้ามทับค่าที่มีอยู่: แตะเฉพาะแถวที่ partyId เป็น null · customerId ที่มีคนตั้งไว้แล้วไม่เปลี่ยน
//    (คนที่ผูกมือไว้ = ความจริงที่ดีกว่าการเดาจากเบอร์เสมอ)
// 🔴 ผู้ติดต่อที่ไม่มีทั้งเบอร์และอีเมล = ข้าม (จับคู่จากชื่อเปล่าคือการเดา — ห้ามตามกติกาของ party facade)
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-party-links.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-party-links.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-party-links";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const party = (await import("@/lib/modules/party" as string)) as Any;
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const P = prisma as Any;
const norm = (p?: string | null) => party.normalizePartyPhone(p ?? "");
const lowerEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();

const counts = { ร้านที่แก้: 0, สมาชิกผูกParty: 0, ห้องแชทผูก: 0, ผู้ติดต่อCRM: 0, ผู้ติดต่อบัญชี: 0 };

for (const t of tenants) {
  let touched = false;

  // ── 1. สมาชิกที่ยังไม่มี Party ──
  // 🔴 อยู่นอก transaction เพราะ party.safeFindOrCreate เปิดขาอ่าน/เขียนของตัวเอง (facade — ห้ามยัดเข้า tx ของเรา)
  const orphanCustomers = (await P.customer.findMany({
    where: { tenantId: t.id, partyId: null },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { createdAt: "asc" },
  })) as Any[];
  for (const c of orphanCustomers) {
    const name = (c.name ?? "").trim() || c.phone || c.email || "";
    if (!name) continue; // ไม่มีอะไรให้จับคู่เลย — ข้าม (ไม่สร้าง Party ชื่อว่าง)
    counts.สมาชิกผูกParty += 1;
    touched = true;
    if (args.dryRun) continue;
    const partyId = await party.safeFindOrCreate(t.id, { name, phone: c.phone, email: c.email, kind: "PERSON" });
    if (partyId) await P.customer.update({ where: { id: c.id }, data: { partyId } });
  }
  if (args.dryRun && orphanCustomers.length) {
    console.log(`  [dry-run] ${t.slug}: สมาชิก ${orphanCustomers.length} คนยังไม่มีตัวตนกลาง — จะหา/สร้าง Party ให้`);
  }

  // ── ดัชนีสมาชิกของร้าน (เบอร์ normalize / อีเมลตัวพิมพ์เล็ก) สำหรับขั้น 2–4 ──
  const members = (await P.customer.findMany({
    where: { tenantId: t.id },
    select: { id: true, partyId: true, phone: true, email: true },
    orderBy: { createdAt: "asc" },
  })) as Any[];
  const byPhone = new Map<string, Any>();
  const byEmail = new Map<string, Any>();
  for (const m of members) {
    const p = norm(m.phone);
    if (p && p.length >= 8 && !byPhone.has(p)) byPhone.set(p, m);
    const e = lowerEmail(m.email);
    if (e && !byEmail.has(e)) byEmail.set(e, m);
  }
  const matchMember = (phone?: string | null, email?: string | null): { m: Any; via: "PHONE" | "EMAIL" } | null => {
    const p = norm(phone);
    if (p && p.length >= 8) {
      const m = byPhone.get(p);
      if (m) return { m, via: "PHONE" };
    }
    const e = lowerEmail(email);
    if (e) {
      const m = byEmail.get(e);
      if (m) return { m, via: "EMAIL" };
    }
    return null;
  };

  // ── 2. ห้องแชท (ChatContact) ──
  const contacts = (await P.chatContact.findMany({
    where: { tenantId: t.id, partyId: null },
    select: { id: true, phone: true, email: true, customerId: true },
    orderBy: { createdAt: "asc" },
  })) as Any[];
  for (const ct of contacts) {
    const hit = matchMember(ct.phone, ct.email);
    if (!hit || !hit.m.partyId) continue;
    counts.ห้องแชทผูก += 1;
    touched = true;
    if (args.dryRun) continue;
    await P.chatContact.update({
      where: { id: ct.id },
      data: {
        partyId: hit.m.partyId,
        // ห้ามทับ customerId ที่พนักงานผูกมือไว้แล้ว
        ...(ct.customerId ? {} : { customerId: hit.m.id }),
        linkedBy: hit.via,
        linkedAt: new Date(),
      },
    });
  }

  // ── 3–4. ผู้ติดต่อของ CRM / บัญชี ──
  const linkContacts = async (model: string, label: "ผู้ติดต่อCRM" | "ผู้ติดต่อบัญชี") => {
    if (!P[model]) return;
    const rows = (await P[model].findMany({
      where: { tenantId: t.id, partyId: null },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { createdAt: "asc" },
    })) as Any[];
    for (const r of rows) {
      const hit = matchMember(r.phone, r.email);
      const name = (r.name ?? "").trim() || r.phone || r.email || "";
      if (!hit && !name) continue;
      if (!hit && !r.phone && !r.email) continue; // ไม่มีกุญแจจับคู่ = ไม่เดา
      counts[label] += 1;
      touched = true;
      if (args.dryRun) continue;
      const partyId = hit?.m.partyId ?? (await party.safeFindOrCreate(t.id, { name, phone: r.phone, email: r.email, kind: "PERSON" }));
      if (partyId) await P[model].update({ where: { id: r.id }, data: { partyId } });
    }
  };
  await linkContacts("crmContact", "ผู้ติดต่อCRM");
  await linkContacts("accountContact", "ผู้ติดต่อบัญชี");

  if (touched) {
    counts.ร้านที่แก้ += 1;
    console.log(`  ✏️  ${t.name} (${t.slug})`);
  }
}

common.summary(SCRIPT, args, counts);
await prisma.$disconnect();
