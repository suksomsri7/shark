// QC — Backoffice Phase 1: Support Desk + ระงับร้าน + Audit (WO-0021) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา:
// src/lib/support/service.ts (ฝั่งร้าน — tenant-scoped ทั้งหมด):
//   createCase(ctx: {tenantId}, input: {userId, subject, body}): Promise<{ id }>   // เคส OPEN + ข้อความแรก SHOP
//   listMyCases(ctx, take=50)                                                      // ใหม่→เก่า
//   listCaseMessages(ctx, caseId)                                                  // เก่า→ใหม่
//   addShopMessage(ctx, caseId, userId, body): Promise<boolean>                    // เพิ่มข้อความ · ถ้าเคส RESOLVED → เปิดใหม่เป็น OPEN · เคสไม่ใช่ของ tenant → false
// src/lib/platform/support.ts (ฝั่งแพลตฟอร์ม — prisma ตรง เพราะอ่านข้ามร้าน):
//   listAllCases(filter?: { status? }): Promise<(SupportCase & { tenantName: string })[]>  // updatedAt ใหม่→เก่า
//   setCaseStatus(pu: PlatformUser, caseId, status): Promise<boolean>              // + PlatformAuditLog action "support.status"
//   addPlatformMessage(pu: PlatformUser, caseId, body): Promise<boolean>           // + ตั้งเคส PENDING (ตอบแล้วรอร้าน)
//   suspendTenant(pu: PlatformUser, tenantId, reason): Promise<boolean>            // SUPER_ADMIN เท่านั้น (requirePlatformRole) → SUSPENDED + audit "tenant.suspend"
//   reactivateTenant(pu: PlatformUser, tenantId): Promise<boolean>                 // SUPER_ADMIN → ACTIVE + audit "tenant.reactivate"
// gate ระงับร้าน: Fable ใส่ใน requireTenant แล้ว (SUSPENDED/CLOSED → redirect /suspended) — Builder สร้างหน้า /suspended
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = ""; let puAdmin = ""; let puSupport = "";
try {
  const shop = await import("@/lib/support/service" as string).catch(() => null);
  const plat = await import("@/lib/platform/support" as string).catch(() => null);
  if (!shop || !plat) { chk("SD-0", "มี support/service.ts + platform/support.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC ร้านซัพพอร์ต", slug: `qc-sd-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC SD2", slug: `qc-sd2-${Date.now()}` } }); tid2 = t2.id;
    const admin = await prisma.platformUser.create({ data: { email: `qc-sd-a-${Date.now()}@x.com`, role: "SUPER_ADMIN" } }); puAdmin = admin.id;
    const sup = await prisma.platformUser.create({ data: { email: `qc-sd-s-${Date.now()}@x.com`, role: "SUPPORT" } }); puSupport = sup.id;
    const ctx = { tenantId: tid };

    // 1) ฝั่งร้าน: เปิดเคส + ข้อความแรก
    const c1 = await shop.createCase(ctx, { userId: "user-1", subject: "พิมพ์ใบเสร็จไม่ออก", body: "กดพิมพ์แล้วไม่มีอะไรเกิดขึ้น" });
    const row = await prisma.supportCase.findUnique({ where: { id: c1.id }, include: { messages: true } });
    chk("SD-1.1", "createCase → OPEN + ข้อความแรก SHOP", row?.status === "OPEN" && row.messages.length === 1 && row.messages[0].authorSide === "SHOP", "OPEN+1", `${row?.status}+${row?.messages.length}`);
    chk("SD-1.2", "listMyCases เห็นเคส", (await shop.listMyCases(ctx)).some((x: { id: string }) => x.id === c1.id), "เห็น", "?");
    chk("SD-1.3", "tenant อื่นไม่เห็น (kernel guard)", (await shop.listMyCases({ tenantId: tid2 })).length === 0, "0", "?");
    chk("SD-1.4", "addShopMessage เคสข้าม tenant → false", (await shop.addShopMessage({ tenantId: tid2 }, c1.id, "user-x", "แฮ็ก")) === false, "false", "?");

    // 2) ฝั่งแพลตฟอร์ม: เห็นทุกร้าน + ตอบ + ปิด
    const all = await plat.listAllCases();
    const found = all.find((x: { id: string }) => x.id === c1.id);
    chk("SD-2.1", "listAllCases เห็นเคส + tenantName", !!found && found.tenantName === "QC ร้านซัพพอร์ต", "มี+ชื่อร้าน", String(found?.tenantName));
    chk("SD-2.2", "addPlatformMessage → PENDING", (await plat.addPlatformMessage(sup, c1.id, "รบกวนแคปหน้าจอ")) === true && (await prisma.supportCase.findUnique({ where: { id: c1.id } }))?.status === "PENDING", "PENDING", "?");
    chk("SD-2.3", "setCaseStatus RESOLVED + audit", (await plat.setCaseStatus(sup, c1.id, "RESOLVED")) === true && (await prisma.platformAuditLog.count({ where: { targetType: "SupportCase", targetId: c1.id, action: "support.status" } })) >= 1, "RESOLVED+audit", "?");
    chk("SD-2.4", "ร้านพิมพ์ต่อบนเคส RESOLVED → เปิดใหม่ OPEN", (await shop.addShopMessage(ctx, c1.id, "user-1", "ยังไม่หาย")) === true && (await prisma.supportCase.findUnique({ where: { id: c1.id } }))?.status === "OPEN", "OPEN", "?");
    chk("SD-2.5", "listCaseMessages เรียงครบ 3", (await shop.listCaseMessages(ctx, c1.id)).length === 3, "3", String((await shop.listCaseMessages(ctx, c1.id)).length));

    // 3) ระงับร้าน — SUPER_ADMIN เท่านั้น + audit
    let threw = false;
    try { await plat.suspendTenant(sup, tid2, "ทดสอบสิทธิ์"); } catch { threw = true; }
    chk("SD-3.1", "SUPPORT ระงับร้าน → throw", threw && (await prisma.tenant.findUnique({ where: { id: tid2 } }))?.status === "ACTIVE", "throw+ACTIVE", `${threw}`);
    chk("SD-3.2", "SUPER_ADMIN ระงับ → SUSPENDED + audit", (await plat.suspendTenant(admin, tid2, "ค้างชำระ")) === true && (await prisma.tenant.findUnique({ where: { id: tid2 } }))?.status === "SUSPENDED" && (await prisma.platformAuditLog.count({ where: { targetType: "Tenant", targetId: tid2, action: "tenant.suspend" } })) === 1, "SUSPENDED+audit", "?");
    chk("SD-3.3", "reactivate → ACTIVE + audit", (await plat.reactivateTenant(admin, tid2)) === true && (await prisma.tenant.findUnique({ where: { id: tid2 } }))?.status === "ACTIVE", "ACTIVE", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["supportMessage", "supportCase", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  for (const id of [puAdmin, puSupport].filter(Boolean)) { await d(() => prisma.platformAuditLog.deleteMany({ where: { platformUserId: id } })); await d(() => prisma.platformUser.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Support Desk (Phase 1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
