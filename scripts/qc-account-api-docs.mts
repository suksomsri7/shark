// QC — API บัญชี WO F1–F3: หน้า /developers/account + /developers/account.md + สกิล Claude `.claude/skills/shark-account-api` + เอกสาร as-built
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §F1–F3
// ตรวจแบบ static + เรียก route handler ตรง (ไม่ต้องมี server) · ไม่แตะ DB
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-docs");
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!(await import("node:fs")).existsSync("src/app/developers/account/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/app/developers/account/page.tsx)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

try {
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const ops = registry.ACCOUNT_OPS as Any[];
  const md = read("docs/api/ACCOUNT-API.md");

  // ═══ F1 หน้า /developers/account ═══
  const pagePath = "src/app/developers/account/page.tsx";
  const page = read(pagePath);
  chk("F1.1", "มี src/app/developers/account/page.tsx ที่ render จาก buildOpenApi/ACCOUNT_OPS (ไม่ใช่ array เขียนมือ)", !!page && /buildOpenApi|ACCOUNT_OPS/.test(page) && !/const ENDPOINTS\s*[:=]/.test(page), "generate", page ? "เขียนมือ/ไม่ generate" : "ไม่มีไฟล์");
  chk("F1.2", "หน้า /developers/account เป็นอังกฤษหลัก + มี recipes ≥ 8 + glossary ไทย + ลิงก์ openapi.json", /openapi\.json/.test(page) && (page.match(/recipe/gi) ?? []).length >= 8 && /[ก-๙]/.test(page), "ครบ", `recipes=${(page.match(/recipe/gi) ?? []).length}`, "MAJOR");
  const mdRoute = (await import("@/app/developers/account.md/route" as string).catch(() => null)) as { GET: (r: Request) => Promise<Response> } | null;
  if (!mdRoute) chk("F1.3", "มี route /developers/account.md", false, "มี", "ไม่มี");
  else {
    const r = await mdRoute.GET(new Request("http://x/developers/account.md"));
    const t = await r.text();
    chk("F1.3", "GET /developers/account.md → 200 text/markdown = docs/api/ACCOUNT-API.md เป๊ะ (แหล่งเดียว)", r.status === 200 && /text\/markdown/.test(r.headers.get("content-type") ?? "") && t === md, "เท่ากัน", `${r.status} ${r.headers.get("content-type")} len=${t.length}/${md.length}`);
  }
  const devIndex = read("src/app/developers/page.tsx");
  chk("F1.4", "/developers เดิมมีลิงก์/หมวด 'Accounting API' ไป /developers/account + อธิบาย scope", /\/developers\/account/.test(devIndex) && /scope/i.test(devIndex), "มี", "ไม่มี", "MAJOR");

  // ═══ F2 สกิล Claude ═══
  const skillDir = ".claude/skills/shark-account-api";
  const skill = read(`${skillDir}/SKILL.md`);
  chk("F2.1", "มี .claude/skills/shark-account-api/SKILL.md พร้อม frontmatter name/description", /^---\n[\s\S]*name:\s*shark-account-api[\s\S]*description:[\s\S]*---/.test(skill), "frontmatter", skill.slice(0, 120));
  chk("F2.2", "SKILL.md ครอบ: base URL · Bearer · X-Shark-System · Idempotency-Key · confirm:true+reason · satang · error codes branching · pagination · webhook", ["https://shark.in.th/api/v1/account", "Authorization: Bearer", "X-Shark-System", "Idempotency-Key", "confirm", "reason", "satang", "error.code", "pageSize", "X-Shark-Signature"].every((k) => skill.includes(k)), "ครบ", ["https://shark.in.th/api/v1/account", "Authorization: Bearer", "X-Shark-System", "Idempotency-Key", "confirm", "reason", "satang", "error.code", "pageSize", "X-Shark-Signature"].filter((k) => !skill.includes(k)).join(","));
  chk("F2.3", "SKILL.md เป็นอังกฤษหลัก (100 บรรทัดแรกไม่มีไทยยกเว้น glossary) + มีส่วน 'When to use' และ 'Safety'", !/[ก-๙]/.test(skill.split("\n").slice(0, 60).join("\n")) && /When to use/i.test(skill) && /Safety/i.test(skill), "EN", "?", "MAJOR");
  const endpointsRef = read(`${skillDir}/references/endpoints.md`);
  const missingOps = ops.filter((o) => !endpointsRef.includes(`${o.method} ${o.path}`));
  chk("F2.4", "references/endpoints.md มีทุก op (METHOD path + scope) — generate จากทะเบียน", !!endpointsRef && missingOps.length === 0 && ops.every((o) => endpointsRef.includes(o.action)), "ครบ", missingOps.map((o) => o.id).join(",").slice(0, 200));
  const recipes = read(`${skillDir}/references/recipes.md`);
  const recipeTitles = ["quotation", "deposit", "expense", "purchase order", "PromptPay", "reconcil", "close", "report"];
  chk("F2.5", "references/recipes.md มี 8 recipes (ขาย QT→IV→RE · มัดจำ · รายจ่าย+WHT · PO→ซื้อ · PromptPay · กระทบยอด · ปิดงวด · อ่านงบ) พร้อม curl จริง", recipeTitles.every((k) => new RegExp(k, "i").test(recipes)) && (recipes.match(/curl /g) ?? []).length >= 8, "8 recipes", recipeTitles.filter((k) => !new RegExp(k, "i").test(recipes)).join(","));
  const stateRef = read(`${skillDir}/references/state-machines.md`);
  chk("F2.6", "references/state-machines.md ครอบ docType หลัก (QUOTATION INVOICE RECEIPT DEPOSIT_RECEIPT PURCHASE_ORDER EXPENSE) + สถานะ", ["QUOTATION", "INVOICE", "DEPOSIT_RECEIPT", "PURCHASE_ORDER", "EXPENSE", "AWAITING_PAYMENT", "PAID", "VOIDED"].every((k) => stateRef.includes(k)), "ครบ", "?", "MAJOR");
  chk("F2.7", "สกิลถูกคัดลอกไป /root/.claude/skills/shark-account-api (ใช้จากทุกโปรเจกต์บน VPS นี้)", existsSync("/root/.claude/skills/shark-account-api/SKILL.md") && read("/root/.claude/skills/shark-account-api/SKILL.md") === skill, "เท่ากัน", "ไม่มี/ต่าง", "MAJOR");
  const genSrc = read("scripts/gen-account-api-docs.mts");
  chk("F2.8", "generator เขียน references/endpoints.md ด้วย (--check ครอบไฟล์นี้) — กันคู่มือใน skill เน่า", /references\/endpoints\.md/.test(genSrc), "มี", "ไม่มี", "MAJOR");

  // ═══ F3 เอกสาร as-built ═══
  const sds = read("docs/sds/07_API.md");
  chk("F3.1", "docs/sds/07_API.md เป็น as-built: อ้าง /api/v1/account + openapi.json + scope + idempotency", /api\/v1\/account/.test(sds) && /openapi\.json/.test(sds) && /scope/i.test(sds) && /Idempotency/i.test(sds), "as-built", "ยังเก่า");
  const mod = read("docs/modules/12-account.md");
  chk("F3.2", "12-account.md §5 ถูกแทนที่/ชี้ไป docs/api/ACCOUNT-API.md (ไม่มี /api/sys/[systemId]/account ที่ไม่มีจริงเป็นสัญญาหลัก)", /docs\/api\/ACCOUNT-API\.md/.test(mod) && !/ทั้งหมดอยู่ใต้ `\/api\/sys\/\[systemId\]\/account/.test(mod), "ชี้ไฟล์จริง", "ยังเก่า", "MAJOR");
  const ai = read("docs/AI_LAYER.md");
  chk("F3.3", "AI_LAYER.md อธิบายสกิล account (tools จากทะเบียน · proposal · REST vs AI lane)", /account/.test(ai) && /proposal/i.test(ai) && /registry|ทะเบียน/.test(ai), "มี", "ไม่มี", "MAJOR");
  const sdsAcc = read("docs/sds/modules/account.md");
  chk("F3.4", "sds/modules/account.md มีหัวข้อ API (as-built) + สกิล AI", /api\/v1\/account/.test(sdsAcc) && /สกิล|skill/i.test(sdsAcc), "มี", "ไม่มี", "MAJOR");
  const handover = readdirSync("ledger").filter((f) => /^HANDOVER-.*ACCOUNT-API/.test(f));
  chk("F3.5", "มี ledger/HANDOVER-*-ACCOUNT-API.md สำหรับเจ้าของ (ไทย · ใช้ยังไง · คีย์ · scope · ตัวอย่าง · ของที่รอเจ้าของ)", handover.length >= 1 && /[ก-๙]/.test(read(`ledger/${handover[0]}`)) && /scope/i.test(read(`ledger/${handover[0]}`)), "มี", handover.join(","));
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API docs/skill (F1–F3) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
