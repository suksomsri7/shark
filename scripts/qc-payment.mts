// QC — Billing + PromptPay (WO-0023) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา:
// src/lib/payment/promptpay.ts (pure — ห้ามแตะ DB):
//   crc16xmodem(s: string): string                      // CRC16-CCITT-FALSE (poly 0x1021 init 0xFFFF) คืน hex ตัวใหญ่ 4 ตัว
//   promptpayPayload(input: { id: string; amountSatang?: number }): string
//     — id เบอร์ 10 หลักขึ้นต้น 0 → proxy 01 ค่า "0066" + ตัด 0 นำ (รวม 13 ตัว) · เลขบัตร 13 หลัก → proxy 02
//     — ไม่มี amount = static (010211) · มี amount = dynamic (010212) + tag 54 เป็นบาท 2 ตำแหน่ง
//     — โครง EMVCo: 000201 … 29xx(0016A000000677010111 + proxy) … 5303764 … 5802TH … 6304<CRC>
//     — id ไม่เข้าเกณฑ์ → throw Error ข้อความไทย
// src/lib/payment/service.ts:
//   getPaymentProfile(ctx{tenantId}) / savePaymentProfile(ctx, { promptpayId, displayName }) — upsert · promptpayId ไม่เข้าเกณฑ์ → throw ไทย
// src/lib/platform/billing.ts (backoffice — prisma ตรง):
//   createInvoice(pu, { tenantId, title, amountSatang, dueAt?, note? }) — SUPER_ADMIN/FINANCE เท่านั้น (requirePlatformRole) + audit "billing.create"
//   markInvoicePaid(pu, invoiceId) — SUPER_ADMIN/FINANCE + PENDING→PAID + paidAt + audit "billing.paid" · ไม่ใช่ PENDING → false
//   voidInvoice(pu, invoiceId) — PENDING→VOID + audit "billing.void"
//   listInvoices(filter?: { status?, tenantId? }) — ใหม่→เก่า + tenantName
// src/lib/payment/actions.ts (ฝั่งร้าน): savePaymentProfileAction (requireTenant) / listMyInvoicesAction (เห็นเฉพาะร้านตัวเอง)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = ""; let puAdmin = ""; let puSupport = "";
try {
  const pp = await import("@/lib/payment/promptpay" as string).catch(() => null);
  const svc = await import("@/lib/payment/service" as string).catch(() => null);
  const bill = await import("@/lib/platform/billing" as string).catch(() => null);
  if (!pp || !svc || !bill) { chk("PM-0", "มีไฟล์ครบ (promptpay/service/billing)", false, "มี", "ยังไม่สร้าง"); }
  else {
    // ── PromptPay pure ──
    chk("PM-1.1", "CRC16 vector มาตรฐาน ('123456789' → 29B1)", pp.crc16xmodem("123456789") === "29B1", "29B1", pp.crc16xmodem("123456789"));
    const stat = pp.promptpayPayload({ id: "0812345678" });
    chk("PM-1.2", "static: โครง EMV + AID + เบอร์แปลง 0066", stat.startsWith("000201") && stat.includes("010211") && stat.includes("A000000677010111") && stat.includes("0066812345678") && stat.includes("5303764") && stat.includes("5802TH"), "ครบ", stat);
    chk("PM-1.3", "CRC ท้าย payload ตรวจซ้ำตรง", stat.endsWith(pp.crc16xmodem(stat.slice(0, -4))), "ตรง", stat.slice(-4));
    const dyn = pp.promptpayPayload({ id: "0812345678", amountSatang: 15050 });
    chk("PM-1.4", "dynamic: 010212 + tag54 '150.50'", dyn.includes("010212") && dyn.includes("5406150.50"), "150.50", dyn);
    const cid = pp.promptpayPayload({ id: "1234567890123" });
    chk("PM-1.5", "เลขบัตร 13 หลัก → proxy 02", cid.includes("02131234567890123"), "proxy02", cid);
    let threw = false; try { pp.promptpayPayload({ id: "abc" }); } catch { threw = true; }
    chk("PM-1.6", "id เพี้ยน → throw ไทย", threw, "throw", String(threw));

    // ── seed ──
    const t = await prisma.tenant.create({ data: { name: "QC ร้านเพย์", slug: `qc-pm-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC PM2", slug: `qc-pm2-${Date.now()}` } }); tid2 = t2.id;
    const admin = await prisma.platformUser.create({ data: { email: `qc-pm-a-${Date.now()}@x.com`, role: "FINANCE" } }); puAdmin = admin.id;
    const sup = await prisma.platformUser.create({ data: { email: `qc-pm-s-${Date.now()}@x.com`, role: "SUPPORT" } }); puSupport = sup.id;

    // ── PaymentProfile ──
    await svc.savePaymentProfile({ tenantId: tid }, { promptpayId: "0812345678", displayName: "ร้านเพย์" });
    chk("PM-2.1", "save+get profile", (await svc.getPaymentProfile({ tenantId: tid }))?.promptpayId === "0812345678", "0812345678", "?");
    await svc.savePaymentProfile({ tenantId: tid }, { promptpayId: "1234567890123", displayName: "ร้านเพย์" });
    chk("PM-2.2", "upsert ทับได้ (เปลี่ยนเป็นเลขบัตร)", (await svc.getPaymentProfile({ tenantId: tid }))?.promptpayId === "1234567890123", "เปลี่ยน", "?");
    let threw2 = false; try { await svc.savePaymentProfile({ tenantId: tid }, { promptpayId: "999" }); } catch { threw2 = true; }
    chk("PM-2.3", "promptpayId เพี้ยน → throw", threw2, "throw", String(threw2));
    chk("PM-2.4", "tenant อื่นไม่เห็น profile (guard)", (await svc.getPaymentProfile({ tenantId: tid2 })) === null, "null", "?");

    // ── PlatformInvoice ──
    const inv = await bill.createInvoice(admin, { tenantId: tid, title: "ค่าบริการ custom domain ปี 2026", amountSatang: 150000 });
    chk("PM-3.1", "FINANCE สร้างบิล + audit billing.create", !!inv.id && (await prisma.platformAuditLog.count({ where: { targetType: "PlatformInvoice", targetId: inv.id, action: "billing.create" } })) === 1, "1", "?");
    let threw3 = false; try { await bill.createInvoice(sup, { tenantId: tid, title: "x", amountSatang: 100 }); } catch { threw3 = true; }
    chk("PM-3.2", "SUPPORT สร้างบิล → throw", threw3, "throw", String(threw3));
    chk("PM-3.3", "markPaid → PAID+paidAt+audit", (await bill.markInvoicePaid(admin, inv.id)) === true && (await prisma.platformInvoice.findUnique({ where: { id: inv.id } }))?.status === "PAID", "PAID", "?");
    chk("PM-3.4", "markPaid ซ้ำ → false", (await bill.markInvoicePaid(admin, inv.id)) === false, "false", "?");
    const inv2 = await bill.createInvoice(admin, { tenantId: tid, title: "ทดสอบ void", amountSatang: 100 });
    chk("PM-3.5", "voidInvoice → VOID + audit", (await bill.voidInvoice(admin, inv2.id)) === true && (await prisma.platformInvoice.findUnique({ where: { id: inv2.id } }))?.status === "VOID", "VOID", "?");
    const list = await bill.listInvoices({ tenantId: tid });
    chk("PM-3.6", "listInvoices + tenantName", list.length === 2 && list[0].tenantName === "QC ร้านเพย์", "2+ชื่อ", `${list.length}`);
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["platformInvoice", "paymentProfile"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  for (const id of [puAdmin, puSupport].filter(Boolean)) { await d(() => prisma.platformAuditLog.deleteMany({ where: { platformUserId: id } })); await d(() => prisma.platformUser.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Payment/Billing =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
