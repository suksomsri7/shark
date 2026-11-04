// QC — SECRETARY S1.20 · AnthropicProvider (Messages API · raw fetch) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.20.md · RESOLUTIONS R-K18 · ไม่แตะฐานข้อมูล · ไม่เรียก API จริง (fetch ปลอม)
//
// กลุ่มข้อ:
//   B  pure: ANTHROPIC_MODEL_IDS/toAnthropicModelId · buildAnthropicRequestBody (system/cache · messages · images · tool_use · tool_result รวม · tools input_schema · ไม่มี temperature/thinking) · parseAnthropicReply (text · tool_use · usage รวม cache · refusal/ว่าง throw)
//   P  AnthropicProvider.chat ด้วย fetch ปลอม: url/headers/body · ผลลัพธ์ · error status
//   R  resolveProvider: AI_PROVIDER=anthropic ⇒ Anthropic (fast/smart/forced) · ไม่มีคีย์ ⇒ null · ค่าเริ่มต้น ⇒ OpenRouter เดิม · MOCK ชนะ
//   E  เทียบรูปแบบ OpenRouter ↔ Anthropic จากข้อความชุดเดียวกัน (ชื่อ tool · ข้อความ user · จำนวน turn) · pricing รู้จัก id ตรง · .env.example
//   D  fitness ×2 · ของเดิมใน provider.ts ไม่เปลี่ยน (pickModel/buildRequestBody snapshot)
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s1.20.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.20";
const FORCED = process.env.QC_FORCE === "1";
const SRC = readFileSync(join(ROOT, "src/lib/ai/provider.ts"), "utf8");
if (!FORCED && !/AnthropicProvider/.test(SRC)) {
  console.log(`⏭️  ${LABEL}: provider.ts ยังไม่มี AnthropicProvider (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }

delete process.env.SHARK_AI_MOCK; delete process.env.AI_PROVIDER; delete process.env.SHARK_ANTHROPIC_KEY; delete process.env.SHARK_AI_KEY; delete process.env.SHARK_AI_MODEL;
const prov = (await import("@/lib/ai/provider")) as AnyMod;
const pricing = (await import("@/lib/ai/pricing")) as AnyMod;
const have = typeof prov.AnthropicProvider === "function" && typeof prov.buildAnthropicRequestBody === "function" && typeof prov.parseAnthropicReply === "function" && typeof prov.toAnthropicModelId === "function";

const SYS = "คุณคือผู้ช่วย";
const TOOLS = [{ name: "sales_summary", description: "ยอดขาย", parameters: { type: "object", properties: { days: { type: "number" } } } }, { name: "ask_clarify", description: "ถาม", parameters: { type: "object", properties: {} } }];
const MSGS = [
  { role: "system", content: SYS },
  { role: "user", content: "สรุปยอดขาย" },
  { role: "assistant", content: "", toolCalls: [{ id: "tu_1", name: "sales_summary", args: { days: 7 } }, { id: "tu_2", name: "ask_clarify", args: {} }] },
  { role: "tool", content: "{\"total\":1200}", toolCallId: "tu_1" },
  { role: "tool", content: "{}", toolCallId: "tu_2" },
  { role: "assistant", content: "ยอด 1,200 บาท" },
  { role: "user", content: "ดูรูปนี้", imageUrls: ["data:image/png;base64,AAAA", "https://x.test/a.jpg"] },
];

console.log("── B: pure ──");
if (!have) { for (const i of [1, 2, 3, 4, 5, 6]) skip(`B-${i}`, "pure", "ยังไม่มี export ที่ต้องการ"); for (const i of [1, 2, 3]) skip(`P-${i}`, "provider", "ยังไม่มี"); for (const i of [1, 2, 3, 4]) skip(`R-${i}`, "resolve", "ยังไม่มี"); for (const i of [1, 2]) skip(`E-${i}`, "equiv", "ยังไม่มี"); }
else {
  chk("B-1", "ANTHROPIC_MODEL_IDS: FAST→claude-haiku-4-5 · SMART→claude-sonnet-5 · toAnthropicModelId: slug ตาราง · id ตรงคืนเดิม · slug อื่น ตัด prefix+จุด→ขีด", prov.ANTHROPIC_MODEL_IDS[prov.FAST_MODEL] === "claude-haiku-4-5" && prov.ANTHROPIC_MODEL_IDS[prov.SMART_MODEL] === "claude-sonnet-5" && prov.toAnthropicModelId(prov.FAST_MODEL) === "claude-haiku-4-5" && prov.toAnthropicModelId("claude-opus-5-5") === "claude-opus-5-5" && prov.toAnthropicModelId("anthropic/claude-opus-4.6") === "claude-opus-4-6", `${prov.toAnthropicModelId(prov.FAST_MODEL)} ${prov.toAnthropicModelId("anthropic/claude-opus-4.6")}`);
  const body = prov.buildAnthropicRequestBody("claude-sonnet-5", MSGS, TOOLS, { maxTokens: 777 }) as AnyMod;
  const sys = body.system as AnyMod[];
  chk("B-2", "body: model · max_tokens 777 · system เป็น array 1 block text=ข้อความ system + cache_control ephemeral · ไม่มี role system ใน messages · ไม่มี temperature/top_p/top_k/thinking", body.model === "claude-sonnet-5" && body.max_tokens === 777 && Array.isArray(sys) && sys.length === 1 && sys[0].type === "text" && sys[0].text === SYS && sys[0].cache_control?.type === "ephemeral" && (body.messages as AnyMod[]).every((m) => m.role === "user" || m.role === "assistant") && !("temperature" in body) && !("top_p" in body) && !("top_k" in body) && !("thinking" in body), JSON.stringify(body).slice(0, 240));
  const ms = body.messages as AnyMod[];
  const tuMsg = ms[1], trMsg = ms[2];
  chk("B-3", "messages: [0] user string · [1] assistant blocks tool_use ×2 (id/name/input=args · ไม่มี text block ว่าง) · [2] user tool_result ×2 รวมเป็น message เดียว (tool_use_id ตรง) · [3] assistant string · รวม 5 turn", ms.length === 5 && ms[0].role === "user" && ms[0].content === "สรุปยอดขาย" && tuMsg.role === "assistant" && Array.isArray(tuMsg.content) && tuMsg.content.filter((b: AnyMod) => b.type === "tool_use").length === 2 && tuMsg.content[0].type === "tool_use" && tuMsg.content[0].id === "tu_1" && tuMsg.content[0].name === "sales_summary" && JSON.stringify(tuMsg.content[0].input) === '{"days":7}' && !tuMsg.content.some((b: AnyMod) => b.type === "text") && trMsg.role === "user" && Array.isArray(trMsg.content) && trMsg.content.length === 2 && trMsg.content.every((b: AnyMod) => b.type === "tool_result") && trMsg.content[0].tool_use_id === "tu_1" && trMsg.content[0].content === '{"total":1200}' && ms[3].role === "assistant" && ms[3].content === "ยอด 1,200 บาท", JSON.stringify(ms).slice(0, 300));
  const img = ms[4];
  const blocks = Array.isArray(img?.content) ? (img.content as AnyMod[]) : [];
  chk("B-4", "รูป: user blocks = text + image base64 (media_type image/png · data AAAA) + image url", img?.role === "user" && blocks.length === 3 && blocks[0].type === "text" && blocks[0].text === "ดูรูปนี้" && blocks[1].type === "image" && blocks[1].source?.type === "base64" && blocks[1].source?.media_type === "image/png" && blocks[1].source?.data === "AAAA" && blocks[2].type === "image" && blocks[2].source?.type === "url" && blocks[2].source?.url === "https://x.test/a.jpg", JSON.stringify(img).slice(0, 240));
  const tools = body.tools as AnyMod[];
  const noTools = prov.buildAnthropicRequestBody("claude-haiku-4-5", [{ role: "user", content: "hi" }], undefined) as AnyMod;
  chk("B-5", "tools: name/description/input_schema (= parameters) · cache_control บนตัวสุดท้ายเท่านั้น · ไม่มี tools ⇒ ไม่มีคีย์ tools · ไม่มี system ⇒ ไม่มีคีย์ system · max_tokens ปริยาย 1024", Array.isArray(tools) && tools.length === 2 && tools[0].name === "sales_summary" && JSON.stringify(tools[0].input_schema) === JSON.stringify(TOOLS[0].parameters) && !tools[0].cache_control && tools[1].cache_control?.type === "ephemeral" && !("tools" in noTools) && !("system" in noTools) && noTools.max_tokens === 1024, JSON.stringify({ tools, noTools }).slice(0, 240));
  const reply = prov.parseAnthropicReply({ id: "msg_1", model: "claude-sonnet-5-20260101", stop_reason: "tool_use", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "ขอดูก่อน" }, { type: "tool_use", id: "toolu_1", name: "sales_summary", input: { days: 3 } }], usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 400 } }, "claude-sonnet-5");
  const eEmpty = await throws(() => prov.parseAnthropicReply({ content: [], usage: { input_tokens: 1, output_tokens: 0 } }, "m"));
  const eRef = await throws(() => prov.parseAnthropicReply({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [], usage: { input_tokens: 1, output_tokens: 0 } }, "m"));
  chk("B-6", "parseAnthropicReply: text · toolCalls {id,name,args} · tokensIn = 100+30+400 · tokensOut 20 · model จาก json · ว่าง ⇒ throw 'ตอบว่าง' · refusal ⇒ throw ไทย", reply.text === "ขอดูก่อน" && reply.toolCalls?.length === 1 && reply.toolCalls[0].id === "toolu_1" && reply.toolCalls[0].name === "sales_summary" && JSON.stringify(reply.toolCalls[0].args) === '{"days":3}' && reply.tokensIn === 530 && reply.tokensOut === 20 && reply.model === "claude-sonnet-5-20260101" && !!eEmpty && /ตอบว่าง/.test(eEmpty) && !!eRef && thai(eRef), JSON.stringify({ reply, eEmpty, eRef }).slice(0, 240));

  console.log("── P: AnthropicProvider (fetch ปลอม) ──");
  const calls: { url: string; init: AnyMod }[] = [];
  const fakeFetch = (status = 200, json: unknown = { model: "claude-haiku-4-5", stop_reason: "end_turn", content: [{ type: "text", text: "สวัสดี" }], usage: { input_tokens: 10, output_tokens: 2 } }) => (async (url: string | URL | Request, init?: AnyMod) => { calls.push({ url: String(url), init: init ?? {} }); return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
  const p = new prov.AnthropicProvider("sk-ant-test-key", "claude-haiku-4-5", { fetchImpl: fakeFetch() });
  const r1 = await p.chat(MSGS, { tools: TOOLS, maxTokens: 555 });
  const c = calls[0];
  const hdr = (k: string) => { const h = c.init.headers ?? {}; return typeof h.get === "function" ? h.get(k) : (h[k] ?? h[k.toLowerCase()] ?? h[k.replace(/(^|-)([a-z])/g, (m: string) => m.toUpperCase())]); };
  const sentBody = JSON.parse(c.init.body as string);
  chk("P-1", "chat: POST https://api.anthropic.com/v1/messages · headers x-api-key=คีย์ · anthropic-version มี · content-type json · body = buildAnthropicRequestBody(...) ตรงทุกไบต์", c.url === "https://api.anthropic.com/v1/messages" && c.init.method === "POST" && hdr("x-api-key") === "sk-ant-test-key" && !!hdr("anthropic-version") && String(hdr("content-type")).includes("application/json") && JSON.stringify(sentBody) === JSON.stringify(prov.buildAnthropicRequestBody("claude-haiku-4-5", MSGS, TOOLS, { maxTokens: 555 })), `url=${c.url} ver=${hdr("anthropic-version")} key=${String(hdr("x-api-key")).slice(0, 10)}`);
  chk("P-2", "ผลลัพธ์ = parseAnthropicReply (text สวัสดี · tokensIn 10 · model จาก json) · ไม่มี toolCalls เมื่อไม่มี tool_use", r1.text === "สวัสดี" && r1.tokensIn === 10 && r1.tokensOut === 2 && r1.model === "claude-haiku-4-5" && !r1.toolCalls, JSON.stringify(r1));
  const p4 = new prov.AnthropicProvider("k", "claude-haiku-4-5", { fetchImpl: fakeFetch(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }) });
  const e429 = await throws(() => p4.chat([{ role: "user", content: "x" }]));
  const p5 = new prov.AnthropicProvider("k", "claude-haiku-4-5", { fetchImpl: fakeFetch(200, { model: "m", stop_reason: "end_turn", content: [{ type: "tool_use", id: "t1", name: "ask_clarify", input: {} }], usage: { input_tokens: 1, output_tokens: 1 } }) });
  const r5 = await p5.chat([{ role: "user", content: "x" }], { tools: TOOLS });
  chk("P-3", "HTTP 429 ⇒ throw มี '429' · tool_use อย่างเดียว ⇒ ok toolCalls 1 text ว่าง", !!e429 && /429/.test(e429) && r5.toolCalls?.length === 1 && r5.text === "", `${e429} ${JSON.stringify(r5)}`);

  console.log("── R: resolveProvider ──");
  process.env.AI_PROVIDER = "anthropic"; process.env.SHARK_ANTHROPIC_KEY = "sk-ant-x";
  const rf = prov.resolveProvider("fast"), rs = prov.resolveProvider("smart"), rd = prov.resolveProvider();
  const modelOf = (x: AnyMod) => x?.model ?? x?.["model"];
  chk("R-1", "AI_PROVIDER=anthropic + คีย์ ⇒ AnthropicProvider · fast=claude-haiku-4-5 · smart/ปริยาย=claude-sonnet-5", rf instanceof prov.AnthropicProvider && rs instanceof prov.AnthropicProvider && rd instanceof prov.AnthropicProvider && modelOf(rf) === "claude-haiku-4-5" && modelOf(rs) === "claude-sonnet-5" && modelOf(rd) === "claude-sonnet-5", `${modelOf(rf)} ${modelOf(rs)} ${modelOf(rd)} (model ต้องอ่านได้เป็น property 'model')`);
  process.env.SHARK_AI_MODEL = "anthropic/claude-sonnet-5";
  const rForced = prov.resolveProvider("fast");
  process.env.SHARK_AI_MODEL = "claude-haiku-5-5";
  const rForced2 = prov.resolveProvider("smart");
  delete process.env.SHARK_AI_MODEL;
  chk("R-2", "SHARK_AI_MODEL บังคับ: slug OpenRouter ⇒ map เป็น id ตรง (sonnet) แม้ tier fast · id ตรง ⇒ ใช้เลย (claude-haiku-5-5)", modelOf(rForced) === "claude-sonnet-5" && modelOf(rForced2) === "claude-haiku-5-5", `${modelOf(rForced)} ${modelOf(rForced2)}`);
  delete process.env.SHARK_ANTHROPIC_KEY;
  const rNoKey = prov.resolveProvider("fast");
  process.env.SHARK_AI_KEY = "sk-or-x";
  const rNoKey2 = prov.resolveProvider("fast");
  chk("R-3", "AI_PROVIDER=anthropic แต่ไม่มี SHARK_ANTHROPIC_KEY ⇒ null (ไม่ตกไป OpenRouter แม้มี SHARK_AI_KEY)", rNoKey === null && rNoKey2 === null, `${rNoKey} ${rNoKey2}`);
  delete process.env.AI_PROVIDER;
  const rOr = prov.resolveProvider("fast");
  process.env.AI_PROVIDER = "anthropic"; process.env.SHARK_ANTHROPIC_KEY = "sk-ant-x"; process.env.SHARK_AI_MOCK = "1";
  const rMock = prov.resolveProvider("fast");
  delete process.env.SHARK_AI_MOCK; delete process.env.AI_PROVIDER; delete process.env.SHARK_ANTHROPIC_KEY;
  chk("R-4", "ไม่มี AI_PROVIDER + SHARK_AI_KEY ⇒ OpenRouterProvider เดิม · SHARK_AI_MOCK=1 ชนะทุกอย่าง ⇒ MockProvider · ไม่มีคีย์ใด ⇒ null", rOr instanceof prov.OpenRouterProvider && rMock instanceof prov.MockProvider && (delete process.env.SHARK_AI_KEY, prov.resolveProvider("fast") === null), `${rOr?.constructor?.name} ${rMock?.constructor?.name}`);

  console.log("── E: เทียบรูปแบบ · pricing · env ──");
  const oa = prov.buildRequestBody("x", [{ role: "system", content: SYS }, { role: "user", content: "สรุปยอดขาย" }], TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), { cacheSystem: true }) as AnyMod;
  const an = prov.buildAnthropicRequestBody("y", [{ role: "system", content: SYS }, { role: "user", content: "สรุปยอดขาย" }], TOOLS) as AnyMod;
  const oaTools = (oa.tools as AnyMod[]).map((t) => t.function.name).join(","), anTools = (an.tools as AnyMod[]).map((t) => t.name).join(",");
  const oaSys = (oa.messages as AnyMod[]).find((m) => m.role === "system")?.content?.[0]?.text;
  chk("E-1", "ข้อความชุดเดียวกัน: ชื่อ tools เท่ากัน ลำดับเดียวกัน · ข้อความ system เท่ากัน · user turn เท่ากัน · ทั้งคู่มี cache_control บน system", oaTools === anTools && oaSys === an.system?.[0]?.text && (oa.messages as AnyMod[]).find((m) => m.role === "user")?.content === an.messages?.[0]?.content && !!an.system?.[0]?.cache_control, `${oaTools} | ${anTools}`);
  const envEx = existsSync(join(ROOT, ".env.example")) ? readFileSync(join(ROOT, ".env.example"), "utf8") : "";
  chk("E-2", "pricing: priceOf(claude-haiku-4-5)=haiku · priceOf(claude-sonnet-5)=sonnet · cost เท่ากับ slug OpenRouter · .env.example มี AI_PROVIDER + SHARK_ANTHROPIC_KEY (ว่าง)", pricing.priceOf("claude-haiku-4-5").inPerM === pricing.priceOf(prov.FAST_MODEL).inPerM && pricing.priceOf("claude-sonnet-5").outPerM === pricing.priceOf(prov.SMART_MODEL).outPerM && pricing.costMicroUsd("claude-haiku-4-5", 1000, 1000) === pricing.costMicroUsd(prov.FAST_MODEL, 1000, 1000) && /^AI_PROVIDER=(""|)\s*(#.*)?$/m.test(envEx) && /^SHARK_ANTHROPIC_KEY=(""|)\s*(#.*)?$/m.test(envEx), `env: ${/AI_PROVIDER/.test(envEx)} ${/SHARK_ANTHROPIC_KEY/.test(envEx)}`);
}

console.log("── D: ของเดิมคงเดิม · fitness ──");
{
  // snapshot ของ pickModel/buildRequestBody (คำนวณจาก 3eca6a2b): ผล JSON ของ 3 กรณี
  const snapIn = JSON.stringify([
    prov.pickModel("ยอดขายวันนี้", false), prov.pickModel("สร้างสินค้าใหม่ 3 ตัว", false), prov.pickModel("x", true),
    prov.buildRequestBody("m", [{ role: "system", content: "s" }, { role: "user", content: "u" }], [{ type: "function", function: { name: "a" } }], { cacheSystem: true, maxTokens: 9 }),
    prov.FAST_MODEL, prov.SMART_MODEL,
  ]);
  chk("D-0", "pickModel/buildRequestBody/FAST/SMART เหมือนเดิมทุกไบต์ (snapshot)", sha(snapIn) === "659d1107e746c6058fccd44fe1e0e0cc54ed2fcbee087e9fbaab767d049d2dc8", sha(snapIn));
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  chk("D-3", "provider.ts ไม่ import @anthropic-ai/sdk (ไม่มี package) · ไม่มี temperature ในไฟล์", !/@anthropic-ai\/sdk/.test(SRC) && !/temperature/.test(SRC), "ตรวจไฟล์", "MAJOR");
}
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
