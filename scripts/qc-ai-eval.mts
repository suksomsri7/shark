// QC — AI Eval (self-improving item 1): ชุดข้อสอบ AI วัดว่าเลือกเครื่องมือถูกไหม · Fable oracle
// สัญญา src/lib/ai/eval.ts (ไม่แตะ DB — วัด tool selection ด้วย provider ฉีดได้):
//   GOLDEN_CASES: { prompt: string; expectTool: string }[] (≥8 เคส — คำสั่ง→เครื่องมือที่ควรเลือก เช่น "ยอดขายวันนี้"→sales_summary, "เพิ่มสินค้า..."→inventory_create_item)
//   runEval(deps: { pickTool: (prompt: string) => string | null }) → { total, passed, byCase: [{prompt, expect, got, ok}] }
//     · pickTool ฉีดได้ (mock) — เทียบ got กับ expectTool · คะแนน = passed/total
//   evalToolFromRegistry(prompt) → string|null — heuristic match prompt → tool name (fallback null) เอาไว้เดินจริงกับ toolRegistry (ไม่ต้องยิง LLM ตอนสอบ)
try { process.loadEnvFile(".env"); } catch {}
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
try {
  const ev = (await import("@/lib/ai/eval" as string).catch(() => null)) as { GOLDEN_CASES: { prompt: string; expectTool: string }[]; runEval: (d: any) => any } | null;
  if (!ev) { chk("EV-0", "มี ai/eval.ts", false); }
  else {
    chk("EV-1.1", "GOLDEN_CASES ≥8 เคส มี prompt+expectTool", Array.isArray(ev.GOLDEN_CASES) && ev.GOLDEN_CASES.length >= 8 && ev.GOLDEN_CASES.every((c) => !!c.prompt && !!c.expectTool));
    // ฉีด pickTool ที่ตอบถูกทุกข้อ → 100%
    const perfect = ev.runEval({ pickTool: (p: string) => ev.GOLDEN_CASES.find((c) => c.prompt === p)?.expectTool ?? null });
    chk("EV-2.1", "runEval: pickTool สมบูรณ์ → passed==total + byCase ครบ", perfect.total === ev.GOLDEN_CASES.length && perfect.passed === perfect.total && perfect.byCase.length === perfect.total);
    // ฉีด pickTool ที่ผิดทุกข้อ → 0
    const zero = ev.runEval({ pickTool: () => "ผิดเสมอ" });
    chk("EV-2.2", "runEval: pickTool ผิดหมด → passed 0 + byCase.ok=false", zero.passed === 0 && zero.byCase.every((b: any) => b.ok === false));
    // heuristic evalToolFromRegistry มีจริง
    const ev2 = ev as unknown as { evalToolFromRegistry?: (p: string) => string | null };
    chk("EV-3.1", "มี evalToolFromRegistry (เดินจริงไม่ต้องยิง LLM)", typeof ev2.evalToolFromRegistry === "function", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Eval =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
