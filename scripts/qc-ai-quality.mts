// QC — AI Quality Dashboard (self-improving item 2): แผงวัดคุณภาพ AI ระดับแพลตฟอร์ม · Fable oracle
// สัญญา src/lib/platform/ai-quality.ts (platform scope — อ่านผ่าน base prisma ข้ามทุกร้าน):
//   platformFeedbackSummary() → { up, down, total, ratePct, recentDown: [{userText, note}] } (รวมทุก tenant)
//   platformEvalScore() → { total, passed, pct } (จาก scoreEvalWithHeuristic ของ ai/eval.ts)
// สัญญา หน้า src/app/backoffice/ai-quality/page.tsx: มีจริง + guard requireBackoffice
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { readFileSync, existsSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const tids: string[] = [];
try {
  const q = (await import("@/lib/platform/ai-quality" as string).catch(() => null)) as { [k: string]: (...a: any[]) => any } | null;
  if (!q) { chk("QU-0", "มี platform/ai-quality.ts", false); }
  else {
    // สร้าง feedback ใน 2 ร้าน — ตรวจว่า summary รวมข้ามร้าน
    for (const i of [1, 2]) {
      const t = await prisma.tenant.create({ data: { name: `QC QU ${i}`, slug: `qc-qu-${i}-${Date.now()}` } });
      tids.push(t.id);
      await prisma.aiFeedback.create({ data: { tenantId: t.id, userText: `ถาม ${i}`, replyText: "ตอบ", rating: "UP" } });
      await prisma.aiFeedback.create({ data: { tenantId: t.id, userText: `ถามพลาด ${i}`, replyText: "ตอบผิด", rating: "DOWN", note: `เหตุ ${i}` } });
    }
    const s = await q.platformFeedbackSummary();
    chk("QU-1.1", "platformFeedbackSummary รวมข้ามร้าน (up≥2 down≥2 total≥4)", s.up >= 2 && s.down >= 2 && s.total >= 4 && typeof s.ratePct === "number");
    chk("QU-1.2", "recentDown มีตัวอย่าง 👎", Array.isArray(s.recentDown) && s.recentDown.length >= 2 && "userText" in s.recentDown[0]);
    const ev = await q.platformEvalScore();
    chk("QU-2.1", "platformEvalScore คืน passed/total/pct", ev.total > 0 && ev.passed >= 0 && ev.passed <= ev.total && typeof ev.pct === "number");
    const page = "src/app/backoffice/ai-quality/page.tsx";
    chk("QU-3.1", "มีหน้า backoffice/ai-quality", existsSync(page), "MAJOR");
    if (existsSync(page)) chk("QU-3.2", "หน้า ai-quality guard ด้วย requireBackoffice", /requireBackoffice/.test(readFileSync(page, "utf8")), "MAJOR");
    else chk("QU-3.2", "หน้า ai-quality guard requireBackoffice", false, "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
finally {
  for (const id of tids) { try { await prisma.aiFeedback.deleteMany({ where: { tenantId: id } }); await prisma.tenant.delete({ where: { id } }); } catch {} }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Quality =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
