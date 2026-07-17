// QC — AI Prompt Tuning (self-improving item 4): วงจรปรับปรุง prompt ระดับแพลตฟอร์ม · Fable oracle
// สัญญา src/lib/platform/ai-tuning.ts (AiPromptTweak = platform axis → เข้าผ่าน src/lib/platform เท่านั้น):
//   proposeTweak({content, rationale}) → {id} status PENDING
//   listPromptTweaks(status?) → AiPromptTweak[] (ไม่ใส่ status = ทั้งหมด)
//   decidePromptTweak(id, decision:"APPROVED"|"REJECTED", byId) → set status+decidedById+decidedAt
//     · ตัดสินซ้ำ (สถานะไม่ใช่ PENDING แล้ว) → throw ไทย
//   approvedPromptTweaksText() → string (รวมเฉพาะ content ของ APPROVED · ไม่มี = "")
// สัญญา src/lib/ai/persona.ts: PersonaContext.promptTweaks?: string · buildSystemPrompt แทรกบล็อกเมื่อมี · pure (ไม่มี = ไม่แทรก)
// สัญญา src/lib/ai/service.ts: เรียก approvedPromptTweaksText ตอนสร้าง system prompt
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { readFileSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const ids: string[] = [];
try {
  const tu = (await import("@/lib/platform/ai-tuning" as string).catch(() => null)) as { [k: string]: (...a: any[]) => any } | null;
  if (!tu) { chk("TU-0", "มี platform/ai-tuning.ts", false); }
  else {
    const p = await tu.proposeTweak({ content: "เวลาลูกค้าถามเรื่องจองห้อง ให้ถามวันเข้าพักก่อนเสมอ", rationale: "จากเคส 👎 ที่ลืมถามวันเข้าพัก" });
    ids.push(p.id);
    const row0 = await prisma.aiPromptTweak.findUnique({ where: { id: p.id as string } });
    chk("TU-1.1", "proposeTweak → บันทึก status PENDING", !!row0 && row0.status === "PENDING");
    const pend = await tu.listPromptTweaks("PENDING");
    chk("TU-1.2", "listPromptTweaks('PENDING') เห็นรายการที่เพิ่งเสนอ", Array.isArray(pend) && pend.some((r: any) => r.id === p.id));

    await tu.decidePromptTweak(p.id, "APPROVED", "qc-admin-1");
    const row1 = await prisma.aiPromptTweak.findUnique({ where: { id: p.id as string } });
    chk("TU-2.1", "decidePromptTweak APPROVED → status+decidedBy+decidedAt", !!row1 && row1.status === "APPROVED" && row1.decidedById === "qc-admin-1" && row1.decidedAt != null);
    let th = false; try { await tu.decidePromptTweak(p.id, "REJECTED", "qc-admin-2"); } catch { th = true; }
    chk("TU-2.2", "ตัดสินซ้ำ (ไม่ใช่ PENDING) → throw ไทย", th);

    const r = await tu.proposeTweak({ content: "ข้อความที่ถูกปฏิเสธ ไม่ควรโผล่", rationale: "rejected case" });
    ids.push(r.id);
    await tu.decidePromptTweak(r.id, "REJECTED", "qc-admin-3");
    const txt = await tu.approvedPromptTweaksText();
    chk("TU-3.1", "approvedPromptTweaksText มีเฉพาะ APPROVED (ไม่มี REJECTED/PENDING)", typeof txt === "string" && txt.includes("ถามวันเข้าพักก่อนเสมอ") && !txt.includes("ไม่ควรโผล่"));

    const persona = (await import("@/lib/ai/persona" as string)) as { buildSystemPrompt: (c: any) => string };
    const base = { tenantName: "ร้านทดสอบ", systems: [] as any[] };
    const withTweak = persona.buildSystemPrompt({ ...base, promptTweaks: "PARAM_TWEAK_MARKER_123" });
    const without = persona.buildSystemPrompt(base);
    chk("TU-4.1", "persona แทรก promptTweaks เมื่อมี + pure เมื่อไม่มี", withTweak.includes("PARAM_TWEAK_MARKER_123") && !without.includes("PARAM_TWEAK_MARKER_123"));

    const svc = readFileSync("src/lib/ai/service.ts", "utf8");
    chk("TU-5.1", "service.ts เรียก approvedPromptTweaksText ตอนสร้าง prompt", /approvedPromptTweaksText/.test(svc), "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
finally {
  for (const id of ids) { try { await prisma.aiPromptTweak.delete({ where: { id } }); } catch {} }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Tuning =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
