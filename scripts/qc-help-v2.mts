// QC — Help Center ระบบเคสเต็ม (feedback #2/#3/#8) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// schema เพิ่มแล้ว: SupportCase.caseNo(unique ต่อ tenant) + shopLastReadAt · SupportMessage.attachmentsJson
// สัญญา src/lib/support/service.ts (คงของเดิม — เพิ่ม/ปรับ):
//   createCase(ctx, {userId, subject, body, attachments?}) → { id, caseNo } — caseNo running ต่อ tenant เริ่ม 1 (race-safe: P2002 → recount แบบ PO)
//   addShopMessage(ctx, caseId, userId, body, attachments?) → boolean — เก็บ attachmentsJson (แนบรูป/ไฟล์: [{name,url,kind}])
//   markCaseRead(ctx, caseId) → boolean — set shopLastReadAt = now (ใช้เคลียร์ badge)
//   listMyCasesWithMeta(ctx) → [{ id, caseNo, subject, status, unreadCount }] — unreadCount = ข้อความ PLATFORM ที่ createdAt > shopLastReadAt (ยังไม่อ่าน)
//   unreadCaseTotal(ctx) → number — ผลรวม unread ทุกเคส (สำหรับ badge ปุ่ม help บน Topbar)
// UI HelpSheet: การ์ดเคสโชว์ #caseNo + สถานะ + badge ตัวเลข unread · ฟอร์มแนบรูป/ไฟล์ (attach) · เปิดเคส = markCaseRead
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
async function platformReply(caseId: string, tenantId: string, body: string) { await prisma.supportMessage.create({ data: { tenantId, caseId, authorSide: "PLATFORM", authorId: "admin-1", body } }); await prisma.supportCase.update({ where: { id: caseId }, data: { status: "PENDING" } }); }
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
let tid = ""; let tid2 = "";
try {
  const svc = (await import("@/lib/support/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  if (typeof svc.markCaseRead !== "function" || typeof svc.unreadCaseTotal !== "function") { chk("HV-0", "service มี markCaseRead/unreadCaseTotal", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC HELPV2", slug: `qc-hv-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC HV2", slug: `qc-hv2-${Date.now()}` } }); tid2 = t2.id;
    const ctx = { tenantId: tid };
    const c1 = await svc.createCase(ctx, { userId: "u1", subject: "พิมพ์ใบเสร็จไม่ออก", body: "กดปุ่มแล้วไม่มีอะไรเกิดขึ้น", attachments: [{ name: "screen.png", url: "data:image/png;base64,AAA", kind: "image" }] });
    chk("HV-1.1", "createCase คืน caseNo = 1 (เคสแรกของ tenant)", c1.caseNo === 1, "1", String(c1.caseNo));
    const c2 = await svc.createCase(ctx, { userId: "u1", subject: "เรื่องที่สอง", body: "ทดสอบ" });
    chk("HV-1.2", "เคสที่สอง caseNo = 2 · tenant อื่นเริ่มนับ 1 ใหม่", c2.caseNo === 2 && (await svc.createCase({ tenantId: tid2 }, { userId: "x", subject: "a", body: "b" })).caseNo === 1, "2/1", "?");
    chk("HV-1.3", "ข้อความแรกเก็บ attachment (รูป)", await (async () => { const m = await prisma.supportMessage.findFirst({ where: { tenantId: tid, caseId: c1.id as string } }); return JSON.stringify(m?.attachmentsJson).includes("screen.png"); })(), "มี", "?");

    // platform ตอบ → unread ฝั่งร้าน
    await platformReply(c1.id as string, tid, "ทีมงานกำลังตรวจสอบให้ครับ");
    await platformReply(c1.id as string, tid, "รบกวนแจ้งรุ่นเครื่องพิมพ์");
    const meta1 = (await svc.listMyCasesWithMeta(ctx)) as { id: string; caseNo: number; unreadCount: number; status: string }[];
    const row1 = meta1.find((r) => r.id === c1.id);
    chk("HV-2.1", "listMyCasesWithMeta: เคส c1 unreadCount = 2 (2 ข้อความจากทีมงาน) + caseNo/status", row1?.unreadCount === 2 && row1?.caseNo === 1 && typeof row1?.status === "string", "2", JSON.stringify(row1));
    chk("HV-2.2", "unreadCaseTotal = 2 (สำหรับ badge)", (await svc.unreadCaseTotal(ctx)) === 2, "2", String(await svc.unreadCaseTotal(ctx)));

    // ร้านเปิดอ่าน → เคลียร์ badge
    await svc.markCaseRead(ctx, c1.id);
    chk("HV-3.1", "markCaseRead → unread เคสนั้น = 0 + total = 0", await (async () => { const m = (await svc.listMyCasesWithMeta(ctx)) as { id: string; unreadCount: number }[]; return (m.find((r) => r.id === c1.id)?.unreadCount === 0) && (await svc.unreadCaseTotal(ctx)) === 0; })(), "0/0", "?");
    await platformReply(c1.id as string, tid, "ข้อความใหม่หลังอ่าน");
    chk("HV-3.2", "ทีมงานตอบใหม่หลังอ่าน → unread กลับมา = 1", await (async () => { const m = (await svc.listMyCasesWithMeta(ctx)) as { id: string; unreadCount: number }[]; return m.find((r) => r.id === c1.id)?.unreadCount === 1; })(), "1", "?");

    chk("HV-4.1", "addShopMessage แนบไฟล์ได้ + tenant อื่นไม่เห็น (guard)", (await svc.addShopMessage(ctx, c1.id, "u1", "เครื่องรุ่น X", [{ name: "a.pdf", url: "http://x/a.pdf", kind: "file" }])) === true && ((await svc.listMyCasesWithMeta({ tenantId: tid2 })) as unknown[]).length === 1, "true/1", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { for (const m of ["supportMessage", "supportCase"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Help v2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
