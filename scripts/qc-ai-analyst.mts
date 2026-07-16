// QC — AI นักวิเคราะห์ (WO-0046) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/ai/analyst.ts:
//   gatherBusinessSnapshot(ctx: {tenantId}): Promise<Snapshot>  // deterministic — ห้ามใช้ LLM:
//     { salesTodaySatang, salesTodayCount, sales7dSatang, sales7dCount, salesByDay: [{day, totalSatang, count}] (7 วัน BKK),
//       newCustomers7d, lowStockCount, pendingLeaves, activeSystems: string[] }
//     (reuse dashboard/service + query pattern เดิม — ระบบไม่เปิด = 0 ห้าม throw)
//   weeklyAnalysis(ctx, deps?: { provider?: AiProvider }): Promise<string | null>
//     — provider (ฉีดได้ ?? resolveProvider) · null → คืน null เงียบ ๆ
//     — system prompt: นักวิเคราะห์ธุรกิจ · **ตัวเลขทุกตัวต้องมาจาก snapshot (แนบ JSON ใน prompt) ห้ามแต่ง** · ตอบไทย 4 ส่วน: สรุป/แนวโน้ม/จุดเสี่ยง/คำแนะนำ
//     — ผล: สร้าง AppNotification { title: "รายงานธุรกิจประจำสัปดาห์", body: <LLM text> } + คืน text
//   sweepWeeklyAnalysis(now?: Date, deps?): Promise<number>
//     — รันเฉพาะ "วันจันทร์" ตามเวลาไทย (ไม่ใช่จันทร์ → 0 ไม่ทำอะไร)
//     — วนทุก tenant ACTIVE ที่มี AppSystem ≥1 (cap 50/รอบ) → weeklyAnalysis · ตัวไหนพัง catch แล้วไปต่อ · คืนจำนวนที่ส่งสำเร็จ
// cron: runDailyCron เพิ่ม weeklyReports (try/catch -1) — ห้ามลบ field เดิม
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type Msg = { role: string; content: string };
class Scripted {
  captured: Msg[][] = [];
  constructor(private text: string) {}
  async chat(messages: Msg[]): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
    this.captured.push(messages);
    return { text: this.text, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

let tid = "";
try {
  const an = (await import("@/lib/ai/analyst" as string).catch(() => null)) as {
    gatherBusinessSnapshot: (c: { tenantId: string }) => Promise<Record<string, unknown>>;
    weeklyAnalysis: (c: { tenantId: string }, d?: { provider?: unknown }) => Promise<string | null>;
    sweepWeeklyAnalysis: (now?: Date, d?: { provider?: unknown }) => Promise<number>;
  } | null;
  if (!an) { chk("AN-0", "มี src/lib/ai/analyst.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC ANALYST", slug: `qc-an-${Date.now()}` } }); tid = t.id;
    const pos = await sys.createSystem(tid, "POS", "ขาย");
    const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "หลัก", slug: `an-${Date.now()}` } });
    await prisma.posSale.createMany({ data: [
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "an1", status: "PAID", subtotalSatang: 20000, grandTotalSatang: 20000 },
      { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "an2", status: "PAID", subtotalSatang: 30000, grandTotalSatang: 30000, createdAt: new Date(Date.now() - 2 * 86400000) },
    ] });
    await prisma.customer.create({ data: { tenantId: tid, memberSystemId: member.id, name: "ค" } });

    const s = await an.gatherBusinessSnapshot({ tenantId: tid });
    chk("AN-1.1", "snapshot: วันนี้ 200 · 7 วัน 500 บาท", s.salesTodaySatang === 20000 && s.sales7dSatang === 50000 && s.sales7dCount === 2, "20000/50000", JSON.stringify({ t: s.salesTodaySatang, w: s.sales7dSatang }));
    chk("AN-1.2", "snapshot: สมาชิกใหม่ 1 + activeSystems มี POS", s.newCustomers7d === 1 && JSON.stringify(s.activeSystems).includes("POS"), "1+POS", "?");
    chk("AN-1.3", "salesByDay 7 ช่อง", Array.isArray(s.salesByDay) && (s.salesByDay as unknown[]).length === 7, "7", String((s.salesByDay as unknown[])?.length));

    const sp = new Scripted("สรุป: ร้านไปได้ดี ยอด 7 วัน 500 บาท");
    const text = await an.weeklyAnalysis({ tenantId: tid }, { provider: sp });
    chk("AN-2.1", "weeklyAnalysis → ได้ text + AppNotification เกิด", text === "สรุป: ร้านไปได้ดี ยอด 7 วัน 500 บาท" && (await prisma.appNotification.count({ where: { tenantId: tid, title: "รายงานธุรกิจประจำสัปดาห์" } })) === 1, "1 ฉบับ", "?");
    const sysMsg = sp.captured[0]?.map((m) => m.content).join(" ") ?? "";
    chk("AN-2.2", "prompt แนบตัวเลขจริงจาก snapshot (50000)", sysMsg.includes("50000") || sysMsg.includes("500.00") || sysMsg.includes("500 บาท"), "มีเลขจริง", sysMsg.slice(0, 60));
    chk("AN-2.3", "ไม่มี provider (mock ปิด) → null ไม่ throw", await (async () => { delete process.env.SHARK_AI_MOCK; const r = await an.weeklyAnalysis({ tenantId: tid }); process.env.SHARK_AI_MOCK = "1"; return r === null; })(), "null", "?");

    // sweep: อังคาร → 0 · จันทร์ → รัน (2026-07-20 = จันทร์ · 2026-07-21 = อังคาร — เวลาไทย)
    chk("AN-3.1", "ไม่ใช่วันจันทร์ → 0", (await an.sweepWeeklyAnalysis(new Date("2026-07-21T03:00:00+07:00"), { provider: new Scripted("x") })) === 0, "0", "?");
    const n = await an.sweepWeeklyAnalysis(new Date("2026-07-20T03:00:00+07:00"), { provider: new Scripted("รายงานอัตโนมัติ") });
    chk("AN-3.2", "วันจันทร์ → รัน ≥1 (ครอบ tenant ทดสอบ)", n >= 1 && (await prisma.appNotification.count({ where: { tenantId: tid, title: "รายงานธุรกิจประจำสัปดาห์" } })) >= 2, "≥1", String(n));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["appNotification", "aiUsage", "posSale", "customer", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Analyst =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
