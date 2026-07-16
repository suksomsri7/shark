// QC — บัญชีลึก (WO-0039): aging ลูกหนี้/เจ้าหนี้ + ปิดงวดอัตโนมัติ · Fable oracle, Builder ห้ามแตะ
// (งบกระแสเงินสดทางอ้อมมีแล้วใน reports.ts cashFlow — WO นี้ไม่แตะ)
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// 1) src/lib/modules/account/reports.ts เพิ่ม:
//    agingReport(ctx: {tenantId, systemId}, { direction: "OUT"|"IN", asOf?: Date }) →
//      { rows: [{ contactId: string|null, contactName: string, notDueSatang, d1_30Satang, d31_60Satang, d61_90Satang, d90plusSatang, totalSatang }], grand: {...5 bucket + totalSatang} }
//    · เอกสารที่นับ: AccountDocument direction ตรง · status AWAITING_PAYMENT|PARTIAL · voidedAt null
//      outstanding = grandTotal - paidTotal (>0 เท่านั้น)
//    · bucket จากวันครบกำหนด (dueDate ?? issueDate) เทียบ asOf (default = ตอนนี้):
//      ยังไม่ครบกำหนด → notDue · เกิน 1-30 → d1_30 · 31-60 · 61-90 · >90
//    · จัดกลุ่มต่อ contact (contactId null → รวมแถว "ไม่ระบุคู่ค้า") · เรียง totalSatang มาก→น้อย
//    · export ผ่าน account facade (index.ts) เพื่อให้ UI/ที่อื่นเรียก
// 2) src/lib/modules/account/gl.ts (หรือไฟล์ใหม่ period-sweep.ts ใน account) เพิ่ม:
//    sweepAutoClosePeriods(now?: Date) → number — ปิด "งวดเดือนก่อนหน้า" (เวลาไทย) อัตโนมัติ:
//      วนทุก AppSystem type ACCOUNT ทั้งแพลตฟอร์ม (cap 100): ถ้างวดก่อนหน้ายังไม่ CLOSED → เรียก closePeriod เดิม (Gate C ตรวจ suspense+needsReview)
//      · ปิดสำเร็จ → AppNotification { title: "ปิดงวดบัญชีอัตโนมัติ" body มี periodKey } + นับ
//      · ไม่ผ่าน Gate C → ข้าม (ไม่ throw) + AppNotification { title: "ปิดงวดอัตโนมัติไม่สำเร็จ" body มีเหตุผล } แค่ครั้งแรกของงวดนั้น (กันสแปม: มี noti งวดเดียวกันแล้วไม่ส่งซ้ำ)
//      · ปิดแล้ว (CLOSED) → ข้ามเงียบ · userId ที่ใช้ปิด = "system-auto"
//    cron: runDailyCron เพิ่ม field periodsClosed (try/catch -1 · field เดิมห้ามหาย)
// 3) UI: หน้า aging ในเมนู account (nav.ts) — ตาราง AR/AP สลับได้ + ปุ่มดู · ไทยล้วน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const DAY = 86400000;

let tid = "";
try {
  const rep = (await import("@/lib/modules/account/reports" as string)) as { [k: string]: (...a: any[]) => Promise<any> }; // any จงใจ: oracle ล้ำหน้าโค้ด
  const facade = (await import("@/lib/modules/account" as string)) as { [k: string]: unknown };
  if (typeof rep.agingReport !== "function") { chk("AD-0", "มี agingReport", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC DEEP", slug: `qc-deep-${Date.now()}` } }); tid = t.id;
    const acc = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    const ctx = { tenantId: tid, systemId: acc.id };
    const NOW = new Date();
    const doc = (over: { [k: string]: unknown }) => prisma.accountDocument.create({ data: { tenantId: tid, systemId: acc.id, docType: "INVOICE", direction: "OUT", status: "AWAITING_PAYMENT", issueDate: new Date(NOW.getTime() - 100 * DAY), grandTotal: 100000, paidTotal: 0, ...(over as object) } });
    const c1 = await prisma.accountContact.create({ data: { tenantId: tid, systemId: acc.id, name: "ลูกหนี้ เอ" } });
    await doc({ contactId: c1.id, dueDate: new Date(NOW.getTime() + 10 * DAY) }); // ยังไม่ครบกำหนด
    await doc({ contactId: c1.id, dueDate: new Date(NOW.getTime() - 5 * DAY) }); // 1-30
    await doc({ contactId: c1.id, dueDate: new Date(NOW.getTime() - 45 * DAY), status: "PARTIAL", paidTotal: 40000 }); // 31-60 คงค้าง 600
    await doc({ dueDate: new Date(NOW.getTime() - 120 * DAY) }); // >90 ไม่ระบุคู่ค้า
    await doc({ contactId: c1.id, dueDate: new Date(NOW.getTime() - 200 * DAY), status: "PAID", paidTotal: 100000 }); // จ่ายครบ — ห้ามนับ
    await doc({ contactId: c1.id, dueDate: new Date(NOW.getTime() - 200 * DAY), voidedAt: NOW }); // void — ห้ามนับ
    await doc({ direction: "IN", dueDate: new Date(NOW.getTime() - 70 * DAY) }); // เจ้าหนี้ (61-90)

    const ar = await rep.agingReport(ctx, { direction: "OUT" });
    const rowA = (ar.rows as { contactName: string; notDueSatang: number; d1_30Satang: number; d31_60Satang: number; totalSatang: number }[]).find((r) => r.contactName === "ลูกหนี้ เอ");
    chk("AD-1.1", "AR: ลูกหนี้ เอ notDue 1000 · 1-30 1000 · 31-60 600 · รวม 2600 บาท", rowA?.notDueSatang === 100000 && rowA?.d1_30Satang === 100000 && rowA?.d31_60Satang === 60000 && rowA?.totalSatang === 260000, "100000/100000/60000/260000", JSON.stringify(rowA ?? null).slice(0, 100));
    chk("AD-1.2", "AR: แถวไม่ระบุคู่ค้า >90 = 1000 บาท", (ar.rows as { contactId: string | null; d90plusSatang: number }[]).some((r) => r.contactId === null && r.d90plusSatang === 100000), "100000", "?");
    chk("AD-1.3", "AR grand รวม 3600 บาท (ตัด PAID/void/ทิศ IN)", ar.grand.totalSatang === 360000, "360000", String(ar.grand.totalSatang));
    const ap = await rep.agingReport(ctx, { direction: "IN" });
    chk("AD-1.4", "AP (เจ้าหนี้): 61-90 = 1000 บาท เท่านั้น", ap.grand.totalSatang === 100000 && ap.grand.d61_90Satang === 100000, "100000", String(ap.grand.totalSatang));
    chk("AD-1.5", "facade (account/index) export agingReport", typeof facade.agingReport === "function", "มี", "?", "MAJOR");

    // 2) ปิดงวดอัตโนมัติ
    const glx = (await import("@/lib/modules/account/gl" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
    const sweepMod = (glx && typeof glx.sweepAutoClosePeriods === "function") ? glx : ((await import("@/lib/modules/account/period-sweep" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null);
    if (!sweepMod) { chk("AD-2.0", "มี sweepAutoClosePeriods", false, "มี", "ยังไม่สร้าง"); }
    else {
      const now = new Date("2026-08-05T10:00:00+07:00"); const prevKey = "2026-07";
      const n1 = await sweepMod.sweepAutoClosePeriods(now);
      const p = await prisma.accountPeriod.findFirst({ where: { systemId: acc.id, periodKey: prevKey } });
      chk("AD-2.1", "sweep ปิดงวด 2026-07 (ไม่มีของค้าง Gate C ผ่าน) + noti", n1 >= 1 && p?.status === "CLOSED" && (await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดบัญชีอัตโนมัติ" } })) === 1, "CLOSED+noti", `${n1}/${p?.status}`);
      const n2 = await sweepMod.sweepAutoClosePeriods(now);
      chk("AD-2.2", "sweep ซ้ำ → งวดปิดแล้วข้ามเงียบ (ไม่นับ ไม่ noti เพิ่ม)", (await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดบัญชีอัตโนมัติ" } })) === 1 && n2 === 0, "1/0", `${n2}`);
      // Gate C fail: needsReview entry ในงวดถัดไป
      await prisma.accountPeriod.updateMany({ where: { systemId: acc.id, periodKey: prevKey }, data: { status: "OPEN", closedAt: null } });
      await prisma.accountJournalEntry.create({ data: { tenantId: tid, systemId: acc.id, docNo: "JV-QC-1", book: "GENERAL", journal: "ADJUST", date: new Date("2026-07-15"), periodKey: prevKey, source: "MANUAL", status: "POSTED", needsReview: true } });
      const n3 = await sweepMod.sweepAutoClosePeriods(now);
      chk("AD-2.3", "Gate C ไม่ผ่าน (needsReview) → ไม่ปิด + noti เตือน 1 ฉบับ", n3 === 0 && (await prisma.accountPeriod.findFirst({ where: { systemId: acc.id, periodKey: prevKey } }))?.status === "OPEN" && (await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดอัตโนมัติไม่สำเร็จ" } })) === 1, "OPEN+เตือน 1", `${n3}`);
      await sweepMod.sweepAutoClosePeriods(now);
      chk("AD-2.4", "รันซ้ำตอนยังไม่ผ่าน → ไม่สแปม noti (ยัง 1)", (await prisma.appNotification.count({ where: { tenantId: tid, title: "ปิดงวดอัตโนมัติไม่สำเร็จ" } })) === 1, "1", "?");
      const cron = (await import("@/lib/platform/cron")) as unknown as { runDailyCron: (now?: Date) => Promise<Record<string, number>> };
      const res = await cron.runDailyCron();
      chk("AD-2.5", "runDailyCron มี periodsClosed + field เดิมครบ", typeof res.periodsClosed === "number" && ["subsExpired", "proposalsExpired", "outboxDrained", "tenantsPurged", "weeklyReports", "lotsExpiring", "webhooksRetried"].every((k) => typeof res[k] === "number"), "ครบ", JSON.stringify(Object.keys(res)));
    }
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountPeriod", "accountDocumentPayment", "accountDocument", "accountContact", "accountLedger", "accountSettings", "appNotification", "outboxEvent", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC บัญชีลึก =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
