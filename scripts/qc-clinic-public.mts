// QC — Clinic public appointment: ผู้ป่วยจองนัดออนไลน์ (ไม่เก็บเงินล่วงหน้า)
//   (resolve slug → ขอนัด PENDING+publicToken → ร้านยืนยัน/ปฏิเสธ → สถานะ → cross-tenant → rate limit)
// standalone-typesafe: dynamic import + wide cast (ไม่ผูก type ตอน compile)
//
// สัญญา src/lib/modules/clinic/service.ts:
//   resolveClinicUnit(tenantSlug, unitSlug) — public resolve (ACTIVE + type=CLINIC) · ผิด → null
//   requestAppointment(ctx, ...) — PENDING + publicToken · ไม่เก็บเงิน
//   getPublicAppointment(unitId, publicToken) — สถานะนัด (กัน cross-tenant PII/สุขภาพ)
//   confirmAppointment / rejectAppointment / completeAppointment — claim อะตอมมิก
//   listAppointments(ctx) — คำขอนัดฝั่งร้าน
// rate limit: checkRateLimit (src/lib/core/rate-limit) — ต่อ IP ต่อ unit
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { checkRateLimit } = await import("@/lib/core/rate-limit");
const svc = (await import("@/lib/modules/clinic/service" as string)) as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = ""; let tid2 = "";
try {
  const stamp = Date.now();
  const tSlug = `qc-clpub-${stamp}`;
  const uSlug = `clpub-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: "QC CL PUB", slug: tSlug } }); tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "CLINIC", name: "คลินิกริมเล", slug: uSlug } });
  const ctx = { tenantId: tid, unitId: unit.id };
  const future = new Date(Date.now() + 3 * 86400000);

  // ── CP-1: resolveClinicUnit ──
  const r1 = await svc.resolveClinicUnit(tSlug, uSlug);
  chk("CP-1.1", "resolveClinicUnit slug ถูก → tenant+unit", !!r1 && r1.unit?.id === unit.id, "unit.id", `${r1?.unit?.id === unit.id}`);
  const r1b = await svc.resolveClinicUnit(tSlug, "ไม่มีสาขานี้");
  chk("CP-1.2", "resolveClinicUnit slug ผิด → null", r1b === null, "null", JSON.stringify(r1b));

  // ── CP-2: requestAppointment → PENDING + publicToken (ไม่เก็บเงิน) ──
  const a1 = await svc.requestAppointment(ctx, { patientName: "สมชาย", patientPhone: "0891112222", preferredAt: future, symptom: "ปวดหัว" });
  const a1Id = a1.id as string;
  const token = a1.publicToken as string;
  chk("CP-2.1", "requestAppointment ok + publicToken", !!a1Id && !!token, "id+token", `${!!a1Id}/${!!token}`);
  const row = await prisma.clinicAppointment.findUnique({ where: { id: a1Id } });
  chk("CP-2.2", "PENDING + snapshot ชื่อ/เบอร์/อาการ + ไม่มี posSaleId (ตารางไม่มีคอลัมน์เงิน)", row?.status === "PENDING" && row?.patientName === "สมชาย" && row?.symptom === "ปวดหัว", "PENDING/สมชาย", `${row?.status}/${row?.patientName}`);
  const pub0 = await svc.getPublicAppointment(unit.id, token);
  chk("CP-2.3", "getPublicAppointment(token) → นัดถูกใบ", pub0?.id === a1Id && pub0?.patientName === "สมชาย", "a1Id+สมชาย", `${pub0?.id === a1Id}/${pub0?.patientName}`);
  const appList = await svc.listAppointments(ctx);
  chk("CP-2.4", "listAppointments (ฝั่งร้าน) เห็นคำขอ PENDING", appList.some((x: any) => x.id === a1Id && x.status === "PENDING"), "เห็น", `${appList.length}`);

  // ── CP-3: ร้านยืนยันนัด (PENDING → CONFIRMED) · claim อะตอมมิก ──
  const cf = await svc.confirmAppointment(ctx, a1Id);
  const rowC = await prisma.clinicAppointment.findUnique({ where: { id: a1Id } });
  chk("CP-3.1", "confirmAppointment ok → CONFIRMED + confirmedAt", cf === true && rowC?.status === "CONFIRMED" && !!rowC?.confirmedAt, "CONFIRMED", `${cf}/${rowC?.status}`);
  const cf2 = await svc.confirmAppointment(ctx, a1Id);
  chk("CP-3.2", "confirm ซ้ำ → false (idempotent guard PENDING)", cf2 === false, "false", `${cf2}`);
  const rj = await svc.rejectAppointment(ctx, a1Id);
  chk("CP-3.3", "reject นัดที่ CONFIRMED แล้ว → false (guard PENDING เท่านั้น)", rj === false, "false", `${rj}`);
  const pub1 = await svc.getPublicAppointment(unit.id, token);
  chk("CP-3.4", "หน้า public เห็นสถานะ CONFIRMED", pub1?.status === "CONFIRMED", "CONFIRMED", `${pub1?.status}`);

  // ── CP-4: ปิดนัด (CONFIRMED → DONE) ──
  const dn = await svc.completeAppointment(ctx, a1Id);
  const rowD = await prisma.clinicAppointment.findUnique({ where: { id: a1Id } });
  chk("CP-4.1", "completeAppointment → DONE", dn === true && rowD?.status === "DONE", "DONE", `${dn}/${rowD?.status}`);

  // ── CP-5: ปฏิเสธนัดใหม่ (PENDING → REJECTED) ──
  const a2 = await svc.requestAppointment(ctx, { patientName: "สมหญิง", patientPhone: "0810000009", preferredAt: future });
  const rj2 = await svc.rejectAppointment(ctx, a2.id);
  const row2 = await prisma.clinicAppointment.findUnique({ where: { id: a2.id as string } });
  chk("CP-5.1", "requestAppointment ไม่มีอาการ (symptom null ได้) + reject → REJECTED + rejectedAt", row2?.symptom === null && rj2 === true && row2?.status === "REJECTED" && !!row2?.rejectedAt, "null+REJECTED", `${row2?.symptom}/${row2?.status}`);

  // ── CP-6: cross-tenant guard (กัน leak ข้อมูลสุขภาพ/PII ร้านอื่น) ──
  const t2 = await prisma.tenant.create({ data: { name: "QC CL PUB2", slug: `qc-clpub2-${stamp}` } }); tid2 = t2.id;
  const unitX = await prisma.businessUnit.create({ data: { tenantId: tid2, type: "CLINIC", name: "ร้านอื่น", slug: `clpub2-${stamp}` } });
  const cross = await svc.getPublicAppointment(unitX.id, token); // token ร้าน A + unit ร้าน B
  chk("CP-6.1", "publicToken ร้าน A + unit ร้าน B → null (ไม่ leak)", cross === null, "null", JSON.stringify(cross));
  // confirm ข้ามร้าน → ต้องไม่มีผล (tenantDb กรอง tenantId → claim ไม่ match)
  const crossConfirm = await svc.confirmAppointment({ tenantId: tid2, unitId: unitX.id }, a2.id);
  chk("CP-6.2", "confirm นัดร้าน A ด้วย ctx ร้าน B → false (ไม่แตะ record ร้านอื่น)", crossConfirm === false, "false", `${crossConfirm}`);

  // ── CP-7: rate limit ต่อ IP ต่อ unit (5/นาที — ครั้งที่ 6 บล็อก) ──
  const key = `clinic-appt:${tSlug}:${uSlug}:1.2.3.4`;
  const results: boolean[] = [];
  for (let i = 0; i < 6; i++) results.push(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).ok);
  chk("CP-7.1", "5 ครั้งแรกผ่าน · ครั้งที่ 6 ถูกบล็อก", results.slice(0, 5).every((x) => x === true) && results[5] === false, "5ok/6block", JSON.stringify(results));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["clinicAppointment", "clinicVisit", "patientRecord", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Clinic Public =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
