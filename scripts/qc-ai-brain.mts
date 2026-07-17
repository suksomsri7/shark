// QC — AI Brain: routing 2 ชั้น + prompt caching + เก็บ dataset (ลด token + ฐาน self-host) · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// [1] ROUTING 2 ชั้น — src/lib/ai/provider.ts export pickModel(text: string, hasImages: boolean): string
//   · มีรูป → SMART (sonnet) เสมอ (vision) · คำสั่งทำงาน (สร้าง/เพิ่ม/ลบ/ยกเลิก/จอง/ขาย/อนุมัติ/บันทึก/ปรับ/โอน/รับ/ชำระ) หรือยาว >120 ตัว → SMART
//   · คำถามสั้น/อ่านข้อมูล (ยอดขาย/มีกี่/ดู/เท่าไหร่) → FAST (haiku) · env override: SHARK_AI_MODEL บังคับตัวเดียว (ถ้าตั้ง = ใช้ตัวนั้นเสมอ ไม่ route)
//   · resolveProvider(tier?: "fast"|"smart") — คืน provider ตาม tier (ไม่ส่ง = smart)
// [2] PROMPT CACHING — provider มี buildRequestBody(model, oaMessages, tools, opts?: {cacheSystem?: boolean}) (pure, export ได้):
//   · cacheSystem=true → system message content เป็น array [{type:"text", text, cache_control:{type:"ephemeral"}}] (Anthropic caching ผ่าน OpenRouter)
//   · chat() ส่ง cacheSystem=true เสมอ (system+tool schema ซ้ำทุกครั้ง → cache ลด token)
// [3] DATASET — src/lib/ai/dataset.ts:
//   anonymize(text): string — แทนเบอร์ (0\d{8,9}) → "<PHONE>" · อีเมล → "<EMAIL>" · (ตัวเลขยอดคงไว้)
//   recordSample(ctx, {userText, toolCalls, replyText, model}) — เก็บ AiTrainingSample เฉพาะเมื่อ SHARK_AI_COLLECT=1 · anonymize userText+replyText+args ก่อนเก็บ · ปิด env = ไม่เก็บ (ไม่ throw)
//   sendMessage เรียก recordSample หลังตอบเสร็จ (best-effort ไม่ให้พังการตอบ)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
let tid = "";
try {
  const prov = (await import("@/lib/ai/provider" as string)) as unknown as { pickModel: (t: string, img: boolean) => string; buildRequestBody?: (m: string, oa: any[], tools: any, o?: any) => any };
  // [1] routing
  const smartAction = prov.pickModel("ช่วยเปิดบิลขายกาแฟ 2 แก้ว", false);
  const smartImg = prov.pickModel("ดูรูปนี้", true);
  const fastRead = prov.pickModel("ยอดขายวันนี้เท่าไหร่", false);
  chk("BR-1.1", "คำสั่งทำงาน → SMART (sonnet)", /sonnet/.test(smartAction));
  chk("BR-1.2", "มีรูป → SMART เสมอ (vision)", /sonnet/.test(smartImg));
  chk("BR-1.3", "คำถามอ่านสั้น → FAST (haiku)", /haiku/.test(fastRead));
  chk("BR-1.4", "env SHARK_AI_MODEL บังคับ = ใช้ตัวนั้นเสมอ", await (async () => { const old = process.env.SHARK_AI_MODEL; process.env.SHARK_AI_MODEL = "anthropic/claude-sonnet-5"; const forced = prov.pickModel("ยอดขายวันนี้", false); if (old === undefined) delete process.env.SHARK_AI_MODEL; else process.env.SHARK_AI_MODEL = old; return forced === "anthropic/claude-sonnet-5"; })());

  // [2] caching (ต้องมี buildRequestBody + cache_control)
  const provSrc = (await import("node:fs")).readFileSync("src/lib/ai/provider.ts", "utf8");
  chk("BR-2.1", "provider ใส่ cache_control (prompt caching)", /cache_control/.test(provSrc) && /ephemeral/.test(provSrc));

  // [3] dataset
  const ds = (await import("@/lib/ai/dataset" as string)) as unknown as { anonymize: (s: string) => string; recordSample: (c: any, i: any) => Promise<any> };
  chk("BR-3.1", "anonymize แทนเบอร์/อีเมล (ตัวเลขยอดคงไว้)", ds.anonymize("โทร 0812345678 อีเมล a@b.com ยอด 500 บาท").includes("<PHONE>") && ds.anonymize("a@b.com").includes("<EMAIL>") && ds.anonymize("ยอด 500 บาท").includes("500"));
  const t = await prisma.tenant.create({ data: { name: "QC BRAIN", slug: `qc-brain-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };
  process.env.SHARK_AI_COLLECT = "1";
  await ds.recordSample(ctx, { userText: "จองห้องให้คุณสมชาย เบอร์ 0899999999", toolCalls: [{ name: "hotel_create_reservation", args: { guestPhone: "0899999999" } }], replyText: "จองแล้ว", model: "sonnet" });
  const row = await prisma.aiTrainingSample.findFirst({ where: { tenantId: tid } });
  chk("BR-3.2", "recordSample เก็บ (SHARK_AI_COLLECT=1) + anonymize เบอร์ใน userText+args", !!row && row.userText.includes("<PHONE>") && !row.userText.includes("0899999999") && !JSON.stringify(row.toolCallsJson).includes("0899999999"));
  delete process.env.SHARK_AI_COLLECT;
  await ds.recordSample(ctx, { userText: "test", toolCalls: [], replyText: "x", model: "haiku" });
  chk("BR-3.3", "ปิด env → ไม่เก็บเพิ่ม (ยัง 1 แถว)", (await prisma.aiTrainingSample.count({ where: { tenantId: tid } })) === 1);
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { await d(() => prisma.aiTrainingSample.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Brain =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
