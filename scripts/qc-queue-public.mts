// QC — คิวหน้าสาธารณะ: ลูกค้ากดรับบัตรคิว + เช็คสถานะเองจากมือถือ
// พิสูจน์ public path (resolve slug → รับบัตร ONLINE → getTicketStatus) ทำงานจริง + กัน leak ข้ามร้าน
// persona: ร้านบริการ 1 ประเภทคิว — ลูกค้า 3 คนสแกน QR กดรับบัตร, คนที่ 3 อยากรู้ "เหลืออีกกี่คิว"

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const q = await import("@/lib/modules/queue/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

const stamp = Date.now();
let tenantAId = "";
let tenantBId = "";

// จำลอง "public path" ที่ server action ทำ (resolve slug → ตรวจ online type → issue ONLINE)
async function publicIssue(tenantSlug: string, unitSlug: string, typeId: string) {
  const resolved = await q.resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) return { ok: false as const, reason: "NO_UNIT" };
  const ctx = { tenantId: resolved.tenant.id, unitId: resolved.unit.id };
  const type = await prisma.queueType.findFirst({
    where: { ...ctx, id: typeId, status: "ACTIVE", onlineIssuable: true },
  });
  if (!type) return { ok: false as const, reason: "NO_TYPE" };
  return q.issueTicket({ ...ctx, typeId: type.id, channel: "ONLINE", actorType: "CUSTOMER" });
}

try {
  console.log("── setup: ร้าน A (1 ประเภทคิว เปิดออนไลน์ + 1 เคาน์เตอร์เปิด) ──");
  const tA = await prisma.tenant.create({ data: { name: "QC คิวสาธารณะ A", slug: `qc-qpub-a-${stamp}` } });
  tenantAId = tA.id;
  const unitA = await prisma.businessUnit.create({ data: { tenantId: tA.id, type: "QUEUE", name: "สาขาA", slug: "sa" } });
  const ctxA = { tenantId: tA.id, unitId: unitA.id };
  const typeOnline = await prisma.queueType.create({
    data: { ...ctxA, code: "GENERAL", name: "คิวทั่วไป", prefix: "A", onlineIssuable: true },
  });
  const typeOffline = await prisma.queueType.create({
    data: { ...ctxA, code: "VIP", name: "คิว VIP", prefix: "V", onlineIssuable: false },
  });
  const counterA = await prisma.queueCounter.create({ data: { ...ctxA, name: "ช่อง 1", code: "1", status: "OPEN" } });

  console.log("\n── resolveQueueUnit: slug ถูก→unit, ผิด→null ──");
  const good = await q.resolveQueueUnit(tA.slug, unitA.slug);
  chk("QP-1.1", "slug ถูก → คืน unit", good?.unit.id === unitA.id, unitA.id, good?.unit.id ?? "null");
  const badTenant = await q.resolveQueueUnit("ไม่มีร้านนี้-xyz", unitA.slug);
  chk("QP-1.2", "tenant slug ผิด → null", badTenant === null, "null", String(badTenant));
  const badUnit = await q.resolveQueueUnit(tA.slug, "ไม่มี-unit");
  chk("QP-1.3", "unit slug ผิด → null", badUnit === null, "null", String(badUnit));

  console.log("\n── listOnlineTypes: เห็นเฉพาะประเภทที่เปิดออนไลน์ ──");
  const online = await q.listOnlineTypes(ctxA);
  chk("QP-2.1", "คืนเฉพาะประเภทออนไลน์ (1)", online.length === 1 && online[0].id === typeOnline.id, "1 online", `${online.length}`);
  chk("QP-2.2", "ไม่หลุดประเภทที่ปิดออนไลน์", !online.some((t) => t.id === typeOffline.id), "no VIP", online.map((t) => t.code).join(","));

  console.log("\n── public path: ออก 3 บัตรผ่านหน้าสาธารณะ → ได้ ticket + publicToken ──");
  const t1 = await publicIssue(tA.slug, unitA.slug, typeOnline.id);
  const t2 = await publicIssue(tA.slug, unitA.slug, typeOnline.id);
  const t3 = await publicIssue(tA.slug, unitA.slug, typeOnline.id);
  chk("QP-3.1", "บัตร 1 ออกสำเร็จ + มี publicToken", t1.ok === true && !!(t1.ok && t1.ticket.publicToken), "ok+token", JSON.stringify(t1).slice(0, 60));
  chk("QP-3.2", "3 บัตรเลขไม่ซ้ำ (A001..A003)", t1.ok && t2.ok && t3.ok && new Set([t1.ticket.number, t2.ticket.number, t3.ticket.number]).size === 3, "3 unique", t1.ok && t2.ok && t3.ok ? [t1.ticket.number, t2.ticket.number, t3.ticket.number].join(",") : "err");
  chk("QP-3.3", "channel = ONLINE", t1.ok === true && t1.ticket.channel === "ONLINE", "ONLINE", t1.ok ? t1.ticket.channel : "err");
  if (!t1.ok || !t2.ok || !t3.ok) throw new Error("issue failed");

  console.log("\n── public path: ประเภทที่ปิดออนไลน์ ห้ามออกบัตร ──");
  const tVip = await publicIssue(tA.slug, unitA.slug, typeOffline.id);
  chk("QP-3.4", "รับบัตรประเภท VIP (ปิดออนไลน์) ไม่ได้", tVip.ok === false, "blocked", JSON.stringify(tVip).slice(0, 40));

  console.log("\n── getTicketStatus: บัตรลูกค้าเปิดดูได้ ──");
  const st1 = await q.getTicketStatus(unitA.id, t1.ticket.publicToken);
  chk("QP-4.1", "เปิดสถานะบัตรด้วย publicToken ได้", !!st1 && st1.ticket.id === t1.ticket.id, t1.ticket.id, st1?.ticket.id ?? "null");
  chk("QP-4.2", "บัตร 3 ตอนยังไม่เรียก เหลือ 2 คิวข้างหน้า (มีคน 1,2 รออยู่)", (await q.getTicketStatus(unitA.id, t3.ticket.publicToken))?.position === 2, "2", String((await q.getTicketStatus(unitA.id, t3.ticket.publicToken))?.position));

  console.log("\n── เรียกบัตร 1 แล้ว → บัตร 3 เหลือ ~1 คิว ──");
  const called = await q.callNext(ctxA, counterA.id);
  chk("QP-5.1", "callNext เรียกบัตรแรก (A001) สำเร็จ", called.ok === true && called.ticket.number === t1.ticket.number, t1.ticket.number, called.ok ? called.ticket.number : "err");
  const st3after = await q.getTicketStatus(unitA.id, t3.ticket.publicToken);
  chk("QP-5.2", "หลังเรียก 1 → บัตร 3 เหลืออีก 1 คิว (บัตร 2 รออยู่)", st3after?.position === 1, "1", String(st3after?.position));
  const st1after = await q.getTicketStatus(unitA.id, t1.ticket.publicToken);
  chk("QP-5.3", "บัตรที่ถูกเรียกแล้ว status = CALLED (ไม่ใช่ WAITING)", st1after?.ticket.status === "CALLED", "CALLED", st1after?.ticket.status ?? "null");

  console.log("\n── getPublicOverview: กำลังเรียก + คนรอ (เลขเท่านั้น ไม่มีชื่อ/เบอร์) ──");
  const ov = await q.getPublicOverview(ctxA);
  chk("QP-6.1", "กำลังเรียก = A001", ov.calling.includes(t1.ticket.number), t1.ticket.number, ov.calling.join(","));
  chk("QP-6.2", "คนรออยู่ = 2 (บัตร 2,3)", ov.waitingCount === 2, "2", String(ov.waitingCount));
  chk("QP-6.3", "overview ไม่มี field ชื่อ/เบอร์ลูกค้า (privacy)", !JSON.stringify(ov).match(/contact|phone|name/i), "no PII", JSON.stringify(ov).slice(0, 60));

  console.log("\n── cross-tenant leak: token ร้าน A + unitId ร้าน B → ต้องไม่คืน ──");
  const tB = await prisma.tenant.create({ data: { name: "QC คิวสาธารณะ B", slug: `qc-qpub-b-${stamp}` } });
  tenantBId = tB.id;
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tB.id, type: "QUEUE", name: "สาขาB", slug: "sb" } });
  const leak = await q.getTicketStatus(unitB.id, t1.ticket.publicToken);
  chk("QP-7.1", "token ร้าน A ถาม unit ร้าน B → null (กัน leak)", leak === null, "null", String(leak));
  const bogus = await q.getTicketStatus(unitA.id, "token-มั่ว-ไม่มีจริง");
  chk("QP-7.2", "token มั่ว → null", bogus === null, "null", String(bogus));

  console.log("\n── policy onlineIssueOpen=false → overview บอกปิด ──");
  await prisma.queuePolicy.create({ data: { ...ctxA, onlineIssueOpen: false } });
  const ovClosed = await q.getPublicOverview(ctxA);
  chk("QP-8.1", "ปิดรับออนไลน์ → overview.onlineOpen=false", ovClosed.onlineOpen === false, "false", String(ovClosed.onlineOpen));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 140) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  for (const tid of [tenantAId, tenantBId]) {
    if (!tid) continue;
    await del(() => prisma.queueTicketEvent.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueTicket.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueDailySequence.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueCounterType.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueCounter.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueType.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queuePolicy.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.queueDisplay.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC Queue Public (รับบัตร/เช็คสถานะเอง) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id })) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
