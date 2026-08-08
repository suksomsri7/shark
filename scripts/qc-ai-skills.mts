// QC — สกิล AI (โหลดเครื่องมือตามต้องการ) + manifest สำหรับ AI ภายนอก
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// เหตุผลที่มีระบบนี้ (วัดจริงบน prod 8 ส.ค. 2026):
//   ยัด tool ครบ 63 ตัวทุกคำขอ = 76,703 token = 94.5% ของบิลต่อข้อความ
//   → แยกเป็นสกิล + คำอธิบายแกนกลางเป็นอังกฤษ → "สวัสดี" 81,031 → 6,547 token (12.4 เท่า)
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ทะเบียน   — ทุก tool มีบ้าน พอดี 1 ที่ (ลืมลงทะเบียน = AI เรียกไม่ได้และเงียบสนิท)
// [2] กรองร้าน  — ร้านเห็นเฉพาะสกิลของระบบที่เปิดจริง
// [3] ต้นทุน    — ชุดแกนกลางต้องเล็กจริง ไม่ใช่แค่ "แยกไฟล์แล้วบอกว่าแยก"
// [4] อังกฤษ    — คำอธิบายแกนกลางต้องไม่ใช่ไทย (ไทยกิน token ~3.4 เท่า และอยู่ใน context ทุกคำขอ)
// [5] manifest  — โครง JSON ที่ AI ภายนอกใช้ได้ทันที + เครื่องมือเขียนต้องติดธง write
//
// รัน: pnpm exec tsx scripts/qc-ai-skills.mts
process.env.SHARK_AI_MOCK = "1";
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ env จาก secrets */ }

const { readFileSync } = await import("node:fs");
const sk = await import("@/lib/ai/skills");
const { toolRegistry } = await import("@/lib/ai/tools");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

const reg = toolRegistry();
const allNames = reg.map((t) => t.def.name);

// ─────────── [1] ทะเบียนครบ ───────────
console.log("── ทะเบียน: ทุก tool ต้องมีบ้าน ──");
{
  let ok = true, msg = "ครบ";
  try { sk.assertSkillRegistryComplete(); } catch (e) { ok = false; msg = (e as Error).message.slice(0, 200); }
  chk("SK-1.1", "ทุก tool อยู่ในสกิลหรือแกนกลาง พอดี 1 ที่", ok, "ครบ", msg);

  const covered = new Set<string>([...sk.CORE_TOOLS, ...sk.SKILLS.flatMap((s) => s.tools)]);
  chk("SK-1.2", `จำนวนที่ครอบคลุม = จำนวน tool จริง (${allNames.length})`,
    covered.size === allNames.length, String(allNames.length), String(covered.size));
  chk("SK-1.3", "ทุกสกิลมี tool อย่างน้อย 1 ตัว (ไม่มีสกิลเปล่า)",
    sk.SKILLS.every((s) => s.tools.length > 0), "ไม่มีสกิลเปล่า",
    JSON.stringify(sk.SKILLS.filter((s) => s.tools.length === 0).map((s) => s.id)));
  chk("SK-1.4", "id สกิลไม่ซ้ำ", new Set(sk.SKILLS.map((s) => s.id)).size === sk.SKILLS.length,
    String(sk.SKILLS.length), String(new Set(sk.SKILLS.map((s) => s.id)).size));
}

// ─────────── [2] กรองตามระบบที่ร้านเปิด ───────────
console.log("── กรองร้าน: เห็นเฉพาะสกิลที่ตัวเองใช้ ──");
{
  const barber = sk.skillsForTenant(["BOOKING", "MEMBER"]).map((s) => s.id);
  chk("SK-2.1", "ร้านตัดผม (จอง+สมาชิก) ไม่เห็นสกิลโรงแรม/โรงเรียน/คลินิก",
    !barber.includes("hotel") && !barber.includes("school") && !barber.includes("clinic"),
    "ไม่มี", JSON.stringify(barber));
  chk("SK-2.2", "ร้านตัดผมเห็นสกิลจอง + สมาชิก", barber.includes("booking") && barber.includes("members"),
    "มีทั้งคู่", JSON.stringify(barber));
  chk("SK-2.3", "สกิลที่ไม่ผูกระบบ (สายอนุมัติ/คลังความรู้/อัตโนมัติ/ความจำ) เห็นเสมอแม้ไม่เปิดระบบใดเลย",
    ["approvals", "knowledge", "automation", "memory"].every((id) => sk.skillsForTenant([]).some((s) => s.id === id)),
    "ครบ 4", JSON.stringify(sk.skillsForTenant([]).map((s) => s.id)));
  chk("SK-2.4", "โรงแรมเห็นสกิลโรงแรม", sk.skillsForTenant(["HOTEL"]).some((s) => s.id === "hotel"), "มี", "ไม่มี");
}

// ─────────── [3] ต้นทุนจริง ───────────
console.log("── ต้นทุน: ชุดแกนกลางต้องเล็กจริง ──");
{
  const size = (names: string[]) =>
    names.reduce((n, x) => n + JSON.stringify(reg.find((t) => t.def.name === x)?.def ?? {}).length, 0);
  const core = size([...sk.CORE_TOOLS]);
  const all = size(allNames);
  chk("SK-3.1", "แกนกลางเล็กกว่าทะเบียนเต็มอย่างน้อย 4 เท่า", all >= core * 4,
    `≥ ${core * 4} chars`, `${all} chars (core ${core})`);
  chk("SK-3.2", "แกนกลางมีไม่เกิน 10 ตัว (ทุกตัวติดไปกับทุกคำขอ ต้องคุมให้แน่น)",
    sk.CORE_TOOLS.length <= 10, "≤ 10", String(sk.CORE_TOOLS.length));
  const idx = sk.skillIndexPrompt(sk.skillsForTenant(["POS", "INVENTORY", "MEMBER"]));
  chk("SK-3.3", "สารบัญสกิลสั้น (< 1,500 ตัวอักษร) — อยู่ใน context ทุกคำขอ",
    idx.length < 1500, "< 1500", String(idx.length));
}

// ─────────── [4] ภาษาอังกฤษในส่วนที่ติดไปทุกคำขอ ───────────
console.log("── ภาษา: ส่วนที่ติดทุกคำขอต้องเป็นอังกฤษ ──");
{
  const thai = /[฀-๿]/;
  const coreDefs = [...sk.CORE_TOOLS].map((n) => reg.find((t) => t.def.name === n)!.def);
  const thaiCore = coreDefs.filter((d) => thai.test(d.description)).map((d) => d.name);
  chk("SK-4.1", "คำอธิบาย tool แกนกลางไม่มีภาษาไทย (ไทยกิน token ~3.4 เท่า)",
    thaiCore.length === 0, "ไม่มี", JSON.stringify(thaiCore));
  const thaiSummary = sk.SKILLS.filter((s) => thai.test(s.summary)).map((s) => s.id);
  chk("SK-4.2", "summary ของสกิลเป็นอังกฤษทั้งหมด (โมเดลนอกค่าย Claude อ่านไทยได้แย่กว่า)",
    thaiSummary.length === 0, "ไม่มี", JSON.stringify(thaiSummary));
  chk("SK-4.3", "label ของสกิลยังเป็นไทย (ส่วนที่คนอ่าน ไม่ได้ส่งให้โมเดล)",
    sk.SKILLS.every((s) => thai.test(s.label)), "ไทยครบ",
    JSON.stringify(sk.SKILLS.filter((s) => !thai.test(s.label)).map((s) => s.id)));
}

// ─────────── [5] manifest สำหรับ AI ภายนอก ───────────
console.log("── manifest: AI ภายนอกเสียบใช้ได้ ──");
{
  const src = (p: string) => readFileSync(p, "utf8");
  const list = src("src/app/api/v1/ai/skills/route.ts");
  const detail = src("src/app/api/v1/ai/skills/[id]/route.ts");
  const exec = src("src/app/api/v1/ai/tools/[name]/route.ts");
  chk("SK-5.1", "ทั้ง 3 endpoint ป้องกันด้วย API key (ไม่มีทางเข้าฟรี)",
    [list, detail, exec].every((s) => s.includes("authenticateApiRequest")), "ครบ 3", "ไม่ครบ");
  chk("SK-5.2", "endpoint สกิลกรองตามระบบที่ร้านเปิด (ไม่หลุดสกิลที่ร้านไม่มี)",
    list.includes("skillsForTenant") && detail.includes("skillsForTenant"), "ครบ 2", "ไม่ครบ");
  chk("SK-5.3", "manifest คืนรูปแบบ OpenAI tools (เสียบโมเดลค่ายอื่นได้ไม่ต้องแปลง)",
    detail.includes('type: "function"') && detail.includes("parameters"), "มี", "ไม่มี");
  chk("SK-5.4", "🔴 เครื่องมือเขียนจาก AI ภายนอกต้องไม่ทำทันที — ต้องรอเจ้าของยืนยัน",
    exec.includes("pendingConfirmation") && exec.includes("tool.action"), "มีด่านยืนยัน", "ไม่มี");
  chk("SK-5.5", "tenantId มาจาก API key เท่านั้น ไม่รับจาก body (กันข้ามร้าน)",
    exec.includes("auth.tenantId") && !/body\.tenantId/.test(exec), "จาก key", "รับจาก body");
  chk("SK-5.6", "manifest ติดธง write ให้ผู้เรียกรู้ล่วงหน้าว่าตัวไหนเปลี่ยนข้อมูล",
    detail.includes("write: Boolean(t.action)"), "มี", "ไม่มี");
}

// ─────────── [6] ต่อกับ service จริง ───────────
console.log("── ต่อจริง: service ใช้ทะเบียนนี้ ──");
{
  const svc = readFileSync("src/lib/ai/service.ts", "utf8");
  chk("SK-6.1", "service ส่งเฉพาะแกนกลาง + load_skill ไม่ใช่ toolRegistry ทั้งชุด",
    svc.includes("CORE_TOOLS") && svc.includes("LOAD_SKILL_TOOL") && !svc.includes("toolRegistry().map((t) => t.def)"),
    "ใช้สกิล", "ยังยัดทั้งชุด");
  chk("SK-6.2", "service ฉีดสารบัญสกิลเข้า system prompt", svc.includes("skillIndexPrompt"), "มี", "ไม่มี");
  chk("SK-6.3", "มีด่าน fitness คุมความครบถ้วนของทะเบียน (ไม่ใช่พึ่งความจำคน)",
    readFileSync("scripts/fitness.mts", "utf8").includes("assertSkillRegistryComplete"), "มี F10", "ไม่มี");
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: สกิล AI =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
