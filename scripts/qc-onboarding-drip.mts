// QC — Onboarding drip (WO-0072) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/platform/onboarding-drip.ts:
//   onboardingChecklist(ctx: {tenantId}) → [{ key, label, done }] — ครบ 6 ข้อตามลำดับนี้ (label ไทย):
//     hasSystem (AppSystem ≥1) · hasUnit (BusinessUnit ≥1) · hasProduct (InvItem|MenuItem|ShopProduct ≥1)
//     hasPromptpay (PaymentProfile.promptpayId ไม่ null) · hasTeam (Membership ของ tenant ≥2 หรือ HrEmployee ≥1)
//     triedAi (AiConversation ≥1)
//     · คำนวณจากข้อมูลจริงล้วน (ไม่มีตารางใหม่) · ตารางไหนไม่มีข้อมูล = false ห้าม throw
//   sweepOnboardingDrip(now?: Date) → number — tenant ACTIVE อายุ ≤ 14 วัน (createdAt) ที่ checklist ยังไม่ครบ (cap 100):
//     → AppNotification { title: "ขั้นถัดไปของร้านคุณ", body: ข้อความไทยชวนทำ "ข้อแรกที่ยังไม่เสร็จ" }
//     · 1 ฉบับ/วัน (เวลาไทย): มี noti title นี้ของวันเดียวกันแล้ว → ข้าม · tenant เก่ากว่า 14 วัน → ไม่ส่ง
//     · checklist ครบทุกข้อ → ไม่ส่ง · ร้านพัง catch แล้วไปต่อ
//   cron: runDailyCron เพิ่ม field onboardingDripped (try/catch -1 · field เดิมห้ามหาย —
//     ตอนนี้: subsExpired proposalsExpired outboxDrained tenantsPurged weeklyReports lotsExpiring webhooksRetried periodsClosed)
//   UI: การ์ด "เริ่มต้นร้านให้ครบ" บนหน้า /app (dashboard) แสดง checklist (ติ๊กอัตโนมัติ) เฉพาะเมื่อยังไม่ครบ + ลิงก์แต่ละข้อ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tidOld = "";
try {
  const ob = (await import("@/lib/platform/onboarding-drip" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!ob) { chk("OB-0", "มี platform/onboarding-drip.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC OB", slug: `qc-ob-${Date.now()}` } }); tid = t.id;
    const c0 = (await ob.onboardingChecklist({ tenantId: tid })) as { key: string; label: string; done: boolean }[];
    chk("OB-1.1", "ร้านเปล่า: ครบ 6 ข้อ label ไทย done=false หมด", c0.length === 6 && c0.every((x) => /[ก-๙]/.test(x.label) && x.done === false) && ["hasSystem", "hasUnit", "hasProduct", "hasPromptpay", "hasTeam", "triedAi"].every((k) => c0.some((x) => x.key === k)), "6×false", JSON.stringify(c0.map((x) => `${x.key}:${x.done}`)));
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ส", slug: `ob-${Date.now()}` } });
    await prisma.invItem.create({ data: { tenantId: tid, systemId: inv.id, sku: "OB-1", name: "ของ" } });
    await prisma.paymentProfile.create({ data: { tenantId: tid, promptpayId: "0811112222" } });
    const c1 = (await ob.onboardingChecklist({ tenantId: tid })) as { key: string; done: boolean }[];
    const doneOf = (k: string) => c1.find((x) => x.key === k)?.done;
    chk("OB-1.2", "เปิดระบบ+สาขา+สินค้า+PromptPay → 4 ข้อ done · team/ai ยัง false", doneOf("hasSystem") === true && doneOf("hasUnit") === true && doneOf("hasProduct") === true && doneOf("hasPromptpay") === true && doneOf("hasTeam") === false && doneOf("triedAi") === false, "4 done", JSON.stringify(c1.map((x) => `${x.key}:${x.done}`)));

    const n1 = await ob.sweepOnboardingDrip();
    const notiCount = () => prisma.appNotification.count({ where: { tenantId: tid, title: "ขั้นถัดไปของร้านคุณ" } });
    chk("OB-2.1", "sweep → noti 1 (body ชวนทำข้อแรกที่ค้าง = ทีม/พนักงาน)", n1 >= 1 && (await notiCount()) === 1, "1", `${n1}/${await notiCount()}`);
    await ob.sweepOnboardingDrip();
    chk("OB-2.2", "sweep ซ้ำวันเดียวกัน → ไม่ส่งซ้ำ (ยัง 1)", (await notiCount()) === 1, "1", String(await notiCount()));

    const tOld = await prisma.tenant.create({ data: { name: "QC OB OLD", slug: `qc-obold-${Date.now()}` } }); tidOld = tOld.id;
    await prisma.tenant.update({ where: { id: tidOld }, data: { createdAt: new Date(Date.now() - 30 * 86400000) } });
    await ob.sweepOnboardingDrip();
    chk("OB-2.3", "tenant อายุ 30 วัน → ไม่ส่ง drip", (await prisma.appNotification.count({ where: { tenantId: tidOld } })) === 0, "0", "?");

    const cron = (await import("@/lib/platform/cron")) as unknown as { runDailyCron: (now?: Date) => Promise<Record<string, number>> };
    const res = await cron.runDailyCron();
    chk("OB-3.1", "runDailyCron มี onboardingDripped + field เดิมครบ 8", typeof res.onboardingDripped === "number" && ["subsExpired", "proposalsExpired", "outboxDrained", "tenantsPurged", "weeklyReports", "lotsExpiring", "webhooksRetried", "periodsClosed"].every((k) => typeof res[k] === "number"), "ครบ", JSON.stringify(Object.keys(res)));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tidOld].filter(Boolean)) {
    for (const m of ["appNotification", "invItem", "paymentProfile", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Onboarding Drip =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
