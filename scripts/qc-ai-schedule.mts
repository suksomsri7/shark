// QC — AI Scheduled Tasks (agentic-3): งานประจำ AI ทำเองตามเวลา · Fable oracle
// สัญญา src/lib/ai/scheduled.ts:
//   createTask(ctx, {instruction, hourBkk}) → {id} — instruction ว่าง/hour นอก 0-23 → throw ไทย · cap 10 ต่อร้าน
//   listTasks(ctx) · setTaskActive(ctx, id, active) · deleteTask(ctx, id)
//   runScheduledTasks(now?: Date, deps?: {provider?}) → number — ทุก task active ที่ hourBkk == ชั่วโมงไทยปัจจุบัน และ lastRunDay != วันนี้ (BKK):
//     รัน agent (sendMessage-like ด้วย instruction · provider ฉีดได้) → ผลเป็น AppNotification { title: "งานประจำจากผู้ช่วย AI", body: instruction+ผล }
//     · เซ็ต lastRunDay = วันนี้ (รันซ้ำชั่วโมงเดิม → ข้าม) · task พัง catch ไปต่อ · ไม่มี provider → ข้าม (ไม่ throw)
//   tool "schedule_task" (action → proposal NORMAL — สร้างงานประจำต้องยืนยัน) + kind ai_schedule_task ใน proposals
//   /api/cron/hourly (route ใหม่ · isCronAuthorized) → runScheduledTasks + vercel.json cron รายชั่วโมง (Fable ใส่แล้ว)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
class Scripted { async chat() { return { text: "สรุป: วันนี้ขายได้ 500 บาท สต็อกครบ", tokensIn: 1, tokensOut: 1, model: "scripted" }; } }
let tid = "";
try {
  const sc = (await import("@/lib/ai/scheduled" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[] };
  if (!sc) { chk("SC-0", "มี ai/scheduled.ts", false); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC SCHED", slug: `qc-sc-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    let th = false; try { await sc.createTask(ctx, { instruction: "", hourBkk: 18 }); } catch { th = true; }
    let th2 = false; try { await sc.createTask(ctx, { instruction: "x", hourBkk: 25 }); } catch { th2 = true; }
    chk("SC-1.1", "instruction ว่าง / hour นอกช่วง → throw", th && th2);
    const task = await sc.createTask(ctx, { instruction: "สรุปยอดขายวันนี้และสต็อกใกล้หมด", hourBkk: 18 });
    chk("SC-1.2", "สร้างงานประจำ (18:00) สำเร็จ", !!task.id && (await prisma.aiScheduledTask.count({ where: { tenantId: tid } })) === 1);
    chk("SC-2.1", "tool schedule_task ลงทะเบียน", tools.toolRegistry().some((x) => x.def.name === "schedule_task"));
    // รันตรงชั่วโมง (18:00 ไทย = 11:00 UTC)
    const at18 = new Date("2026-07-18T11:00:00Z");
    const n1 = await sc.runScheduledTasks(at18, { provider: new Scripted() });
    const noti = await prisma.appNotification.findFirst({ where: { tenantId: tid, title: "งานประจำจากผู้ช่วย AI" } });
    chk("SC-3.1", "ตรงชั่วโมง → รัน + noti มีผลสรุปจาก AI", n1 >= 1 && !!noti && noti.body.includes("500"));
    const n2 = await sc.runScheduledTasks(at18, { provider: new Scripted() });
    chk("SC-3.2", "รันซ้ำวันเดิม → ข้าม (lastRunDay)", n2 === 0 && (await prisma.appNotification.count({ where: { tenantId: tid, title: "งานประจำจากผู้ช่วย AI" } })) === 1);
    const n3 = await sc.runScheduledTasks(new Date("2026-07-18T12:00:00Z"), { provider: new Scripted() });
    chk("SC-3.3", "ผิดชั่วโมง (19:00) → ไม่รัน", n3 === 0);
    await sc.setTaskActive(ctx, task.id, false);
    const n4 = await sc.runScheduledTasks(new Date("2026-07-19T11:00:00Z"), { provider: new Scripted() });
    chk("SC-3.4", "ปิด task → ไม่รันแม้ตรงเวลา", n4 === 0);
    const routeSrc = (await import("node:fs")).readFileSync("src/app/api/cron/hourly/route.ts", "utf8");
    chk("SC-4.1", "route /api/cron/hourly มี isCronAuthorized + runScheduledTasks", routeSrc.includes("isCronAuthorized") && routeSrc.includes("runScheduledTasks"));
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiScheduledTask", "aiMessage", "aiConversation", "aiUsage", "appNotification"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Schedule =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
