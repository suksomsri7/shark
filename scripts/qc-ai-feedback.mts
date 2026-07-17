// QC — AI Feedback (self-improving item 3): ปุ่ม 👍👎 ใต้คำตอบ AI · Fable oracle
// สัญญา src/lib/ai/feedback.ts:
//   recordFeedback(ctx {tenantId}, {conversationId?, userText, replyText, rating:"UP"|"DOWN", note?}) → {id}
//     · rating นอก UP/DOWN → throw ไทย · anonymize userText+replyText (เบอร์/อีเมล) ก่อนเก็บ (reuse dataset.anonymize)
//   feedbackStats(ctx) → { up, down, total, downSamples: [{userText, note}] } (down ล่าสุด ≤20 สำหรับวิเคราะห์)
//   action src/lib/ai/actions.ts: sendAiFeedbackAction({conversationId?, userText, replyText, rating, note?})
//   UI AiChat: ปุ่ม 👍👎 ใต้ข้อความ ASSISTANT (กด 👎 = ช่องหมายเหตุ optional) · กดแล้วขอบคุณ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
let tid = ""; let tid2 = "";
try {
  const fb = (await import("@/lib/ai/feedback" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  if (!fb) { chk("FB-0", "มี ai/feedback.ts", false); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC FB", slug: `qc-fb-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    let th = false; try { await fb.recordFeedback(ctx, { userText: "x", replyText: "y", rating: "MAYBE" }); } catch { th = true; }
    chk("FB-1.1", "rating นอก UP/DOWN → throw", th);
    await fb.recordFeedback(ctx, { userText: "ยอดขายวันนี้", replyText: "500 บาท", rating: "UP" });
    const d = await fb.recordFeedback(ctx, { userText: "จองห้องเบอร์ 0899999999", replyText: "ผิด", rating: "DOWN", note: "ควรถามวันเข้าพักก่อน" });
    const row = await prisma.aiFeedback.findUnique({ where: { id: d.id as string } });
    chk("FB-1.2", "เก็บ + anonymize เบอร์ใน userText (👎 มี note)", !!row && row.rating === "DOWN" && row.userText.includes("<PHONE>") && !row.userText.includes("0899999999") && row.note === "ควรถามวันเข้าพักก่อน");
    const st = await fb.feedbackStats(ctx);
    chk("FB-2.1", "feedbackStats: up 1 down 1 total 2 + downSamples มี 1", st.up === 1 && st.down === 1 && st.total === 2 && Array.isArray(st.downSamples) && st.downSamples.length === 1);
    const t2 = await prisma.tenant.create({ data: { name: "QC FB2", slug: `qc-fb2-${Date.now()}` } }); tid2 = t2.id;
    chk("FB-3.1", "tenant อื่นไม่เห็น feedback (guard)", (await fb.feedbackStats({ tenantId: tid2 })).total === 0);
    const actSrc = (await import("node:fs")).readFileSync("src/lib/ai/actions.ts", "utf8");
    chk("FB-4.1", "มี sendAiFeedbackAction", /sendAiFeedbackAction/.test(actSrc), "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { await d(() => prisma.aiFeedback.deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Feedback =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
