// CONTROLLER-RUN · real provider · never in qc:all
// AI TEAM (SHARK HUB v2) WO T0.1 — วัดต้นทุนจริงต่องาน (cost probe) · สัญญา = หัวไฟล์ scripts/qc-ai-t0.1.mts ข้อ [1]–[5]
//
// ไฟล์นี้ "ไม่ทำอะไรเลยและออก 0" ถ้าไม่ได้ตั้ง AI_COST_PROBE=1 (qc:all ค้นไฟล์ scripts เองได้ — ต้องไม่มีวันเผลอวัดจริง)
//
// รัน (ผู้คุมงานเท่านั้น · ฐานข้อมูล QC4 · ผ่าน wrapper เสมอ):
//   จริง:  bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env AI_COST_PROBE=1 COST_CAP_USD=3 pnpm exec tsx scripts/ai-team-cost-probe.mts
//   ซ้อม:  … env AI_COST_PROBE=1 SHARK_AI_MOCK=1 PROBE_OUT=<ไฟล์นอก ledger> pnpm exec tsx scripts/ai-team-cost-probe.mts
//
// ENV   AI_COST_PROBE=1 (บังคับ) · COST_CAP_USD (ค่าเริ่ม 3) · PROBE_ROUNDS (ค่าเริ่ม 3) · PROBE_OUT (ค่าเริ่ม ledger/AI-TEAM-COST-2026-10.md)
//       · PROBE_TENANT at1|at2|atx (ค่าเริ่ม at1)
// EXIT  0 = จบ (รวมกรณีหยุดเพราะชนเพดาน) · 2 = ปฏิเสธ / มีรอบที่ล้ม / เก็บกวาดไม่ครบ (ยังเก็บกวาด + คืนเงิน + เขียนไฟล์เท่าที่วัดได้)
//       · 4 = ไม่ใช่ QC4 (จากตัวโหลด env)
//
// กติกาที่ไฟล์นี้ถือ:
//   • ทุกเทิร์นผ่านทางปกติ: `sendMessage` (9 ชนิด) และ `createConversation` + `sendMobileChat` (ชนิดที่ 1 — ได้แถว AUTO_TITLE ด้วย)
//     ไม่ฉีดผู้ให้บริการ ไม่เปลี่ยน source ไม่คิดเงินเอง ไม่แตะกระเป๋า/สมุดเครดิตเอง นอกจาก "คืนเงิน" ผ่าน `topUp` (ADJUST) ครั้งเดียวตอนจบ
//   • ไม่เคย "ตั้งค่า" สวิตช์ SHARK_AI_* ของผู้เรียก (อ่าน SHARK_AI_MOCK อย่างเดียวเพื่อเขียน provider mock|real) · ปิดการเก็บ dataset
//   • ไม่พิมพ์คีย์ / ที่อยู่เครือข่าย / ชื่อเครื่องของผู้ให้บริการ — ข้อความ error ถูกขัดก่อนพิมพ์เสมอ (X10)
//   • เพดานเงินตรวจ "ก่อนเริ่ม" ทุกรอบ จากยอดที่อ่านจากสมุดเครดิตจริง
//   • เก็บกวาดเฟสเดียวใน finally: รอบล้ม / โดนสัญญาณหยุด ก็ยังลบห้อง คืนตาข่ายรายวัน คืนเงิน และเขียนไฟล์ผลเท่าที่วัดได้
//   • แถวในสมุดเครดิต (AiCreditTxn) ไม่ถูกลบเด็ดขาด — เป็นหลักฐานที่ข้อสอบ S2 ตรวจย้อนหลัง
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ═══ ด่านที่ 1 — ไม่มีสวิตช์ = ออกทันที ก่อนโหลด env / ก่อนเปิดการเชื่อมต่อใด ๆ ═══
if (process.env.AI_COST_PROBE !== "1") process.exit(0);

const NEEDS_OUT = "SHARK_AI_MOCK=1 needs PROBE_OUT (a mock result must never land in the real ledger file)";
const DEFAULT_OUT = "ledger/AI-TEAM-COST-2026-10.md";
function refuse(why: string): never {
  console.error(`ai-team-cost-probe: refused — ${why}`);
  process.exit(2);
}
// ═══ ด่านที่ 2 — ผลจากโมเดลจำลองห้ามลงไฟล์ ledger จริง ═══
if (process.env.SHARK_AI_MOCK === "1" && !process.env.PROBE_OUT) refuse(NEEDS_OUT);

const numberEnv = (name: string, fallback: number, ok: (n: number) => boolean): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !ok(n)) return refuse(`${name} is not a usable number`);
  return n;
};
const capUsd = numberEnv("COST_CAP_USD", 3, (n) => n > 0);
const capMicro = Math.round(capUsd * 1_000_000);
const rounds = numberEnv("PROBE_ROUNDS", 3, (n) => Number.isInteger(n) && n >= 1);
const OUT = process.env.PROBE_OUT && process.env.PROBE_OUT.trim() ? process.env.PROBE_OUT : DEFAULT_OUT;
const tenantKeyRaw = (process.env.PROBE_TENANT ?? "at1").trim() || "at1";
if (tenantKeyRaw !== "at1" && tenantKeyRaw !== "at2" && tenantKeyRaw !== "atx") refuse("PROBE_TENANT must be at1, at2 or atx");
const tenantKey = tenantKeyRaw as "at1" | "at2" | "atx";

// เทิร์นของ probe ไม่ใช่ข้อมูลฝึก
process.env.SHARK_AI_COLLECT = "0";

// ─────────────────────────── งาน 10 ชนิด (ลำดับ · หมวด · เส้นทาง = สัญญาข้อ [2]) ───────────────────────────
type Category = "chat" | "quotation" | "summaries" | "content" | "teach";
type TaskType = { key: string; category: Category; path: "mobile" | "service"; prompt: string };

/** คำสั่งจริงแบบที่เจ้าของร้านพิมพ์ (ร้าน seed AT-1 ขายกาแฟ/อุปกรณ์ให้ร้านค้า) — ภาษาไทย · หนึ่งเทิร์นต่อหนึ่งรอบ */
const TYPES: TaskType[] = [
  { key: "chat-short", category: "chat", path: "mobile", prompt: "วันนี้มีอะไรที่ต้องดูเป็นพิเศษไหม" },
  { key: "chat-history", category: "chat", path: "service", prompt: "โอเค งั้นสรุปให้หน่อยว่าตกลงเราจะทำโปรอะไร เริ่มวันไหน และต้องเตรียมอะไรบ้าง ขอเป็นข้อ ๆ สั้น ๆ" },
  {
    key: "quotation",
    category: "quotation",
    path: "service",
    prompt:
      "ทำใบเสนอราคาให้ร้านบ้านสวน 2 รายการ คือ เมล็ดกาแฟคั่วกลาง 20 กิโลกรัม กิโลกรัมละ 420 บาท กับ ชุดดริปเปอร์ 10 ชุด ชุดละ 350 บาท ลดให้ 5% ทั้งใบ ยืนราคา 15 วัน",
  },
  { key: "stalled-deals", category: "summaries", path: "service", prompt: "ดีลไหนเงียบไม่ขยับเกิน 7 วันบ้าง สรุปให้หน่อยว่าแต่ละดีลติดอะไร มูลค่าเท่าไหร่ แล้วควรตามดีลไหนก่อน" },
  { key: "follow-up-silent", category: "summaries", path: "service", prompt: "มีลูกค้าคนไหนทักแชทมาแล้วเรายังไม่ได้ตอบ หรือเงียบหายไปนานบ้าง ช่วยไล่รายชื่อ แล้วร่างข้อความทักกลับให้คนละ 1 ข้อความ" },
  { key: "fb-post", category: "content", path: "service", prompt: "ร่างโพสต์เฟซบุ๊กโปรโมตเมล็ดกาแฟคั่วใหม่ล็อตดอยช้าง ถุง 250 กรัม 290 บาท ซื้อ 3 ถุงส่งฟรี ถึงสิ้นเดือนนี้ ขอโทนอบอุ่นเป็นกันเอง ยาวไม่เกิน 5 บรรทัด มีแฮชแท็ก 3 อัน" },
  {
    key: "review-reply",
    category: "content",
    path: "service",
    prompt: "มีลูกค้ารีวิว 1 ดาวว่า \"สั่งเมล็ดกาแฟไป 5 วันแล้วยังไม่ได้ของ ทักไปก็ไม่มีใครตอบ ผิดหวังมาก\" ช่วยร่างคำตอบรีวิวแบบสุภาพ ไม่แก้ตัว บอกว่าจะแก้ไขอย่างไร และชวนให้กลับมาใหม่",
  },
  { key: "invoice-from-quotation", category: "quotation", path: "service", prompt: "ร้านบ้านสวนตกลงตามใบเสนอราคาใบล่าสุดแล้ว ช่วยออกใบแจ้งหนี้จากใบเสนอราคาใบนั้นให้ที กำหนดชำระ 30 วัน" },
  { key: "daily-summary", category: "summaries", path: "service", prompt: "สรุปภาพรวมวันนี้ให้หน่อย ยอดขาย ใบแจ้งหนี้ที่ยังไม่ได้เงิน งานที่ค้าง ลูกค้าที่รอคำตอบ และเรื่องที่ต้องตัดสินใจก่อนปิดร้าน" },
  {
    key: "teach-back",
    category: "teach",
    path: "service",
    prompt:
      "ร่างข้อความตอบลูกค้าที่ถามเรื่องส่งฟรีเมื่อกี้ยังไม่ผ่านนะ เขียนว่า \"ส่งฟรีทุกออเดอร์\" ซึ่งผิด ของร้านเราส่งฟรีเมื่อยอดเกิน 3,000 บาทเท่านั้น ต่อไปจำไว้เลยว่าต้องบอกเงื่อนไขยอดขั้นต่ำทุกครั้งที่พูดเรื่องส่งฟรี แล้วร่างข้อความใหม่ให้ถูกด้วย",
  },
];

/** ประวัติ 10 ข้อความของชนิด chat-history — แทรกเป็นแถวข้อมูล (ไม่เรียกโมเดล ไม่คิดเงิน) ก่อนเทิร์นที่วัด */
const HISTORY: { role: "USER" | "ASSISTANT"; content: string }[] = [
  { role: "USER", content: "เดือนหน้าอยากทำโปรดึงลูกค้าช่วงบ่าย ช่วงนี้บ่ายสองถึงสี่โมงร้านเงียบมาก" },
  { role: "ASSISTANT", content: "ได้ครับ ช่วงบ่ายเงียบนิยมทำ 3 แบบ คือ ลดราคาเฉพาะช่วงเวลา ซื้อเครื่องดื่มแถมขนม หรือสะสมแต้มคูณสอง อยากเน้นยอดขายหรือเน้นให้ลูกค้ากลับมาซ้ำครับ" },
  { role: "USER", content: "เน้นให้กลับมาซ้ำ ลูกค้าประจำเราเป็นพนักงานออฟฟิศแถวนี้" },
  { role: "ASSISTANT", content: "ถ้าเน้นกลับมาซ้ำ แนะนำแต้มคูณสองช่วง 14.00–16.00 น. วันจันทร์ถึงศุกร์ เพราะไม่ต้องลดราคา และพนักงานออฟฟิศมาได้ทุกวันครับ" },
  { role: "USER", content: "แต้มคูณสองอย่างเดียวกลัวไม่แรงพอ เพิ่มอะไรได้อีก" },
  { role: "ASSISTANT", content: "เพิ่มได้ครับ เช่น ครบ 5 แก้วในช่วงบ่ายภายในเดือนเดียวกัน รับฟรี 1 แก้ว ต้นทุนต่อคนไม่สูงและวัดผลง่าย" },
  { role: "USER", content: "ดี เอาแบบนี้ เริ่มวันที่ 1 เลยได้ไหม" },
  { role: "ASSISTANT", content: "ได้ครับ เริ่มวันที่ 1 ถึงสิ้นเดือน ต้องเตรียมป้ายหน้าร้าน ข้อความแจ้งสมาชิก และบอกพนักงานเรื่องวิธีนับแก้วครับ" },
  { role: "USER", content: "ป้ายให้น้องทำเอง ส่วนข้อความแจ้งสมาชิกค่อยว่ากัน" },
  { role: "ASSISTANT", content: "รับทราบครับ ป้ายหน้าร้านให้ทีมทำเอง ข้อความแจ้งสมาชิกยังไม่ส่ง รอคุณสั่งอีกครั้งครับ" },
];

const CATEGORIES: Category[] = ["chat", "quotation", "summaries", "content", "teach"];
/** สัดส่วนงานที่คาด (ค่าเริ่มของใบสั่ง) — รวม = 1 */
const WEIGHTS: Record<Category, number> = { chat: 0.5, quotation: 0.1, summaries: 0.2, content: 0.1, teach: 0.1 };
const MARGIN = 0.5; // กำไรขั้นต้นขั้นต่ำของแพ็ก (≥ 50 %)
const PACK_PRICES_THB = [490, 1490, 3990];
const REFUND_REF_PREFIX = "qc-ai-t0.1-refund-";
/** กระเป๋าต่ำกว่านี้ บริการลดชั้นโมเดลเอง (service.ts LOW_BALANCE_MICRO) ⇒ ผลวัดเพี้ยน */
const LOW_BALANCE_MICRO = 500_000;
const WINDOW_BELT_MS = 10 * 60_000;

// ─────────────────────────── ตัวช่วย ───────────────────────────
/** ขัดข้อความก่อนพิมพ์/เขียนไฟล์: ตัดที่อยู่เครือข่าย · ชื่อเครื่อง · สิ่งที่หน้าตาเหมือนคีย์ · บรรทัดเดียว · สั้น */
const scrub = (v: unknown, max = 160): string => {
  const raw = v instanceof Error ? `${v.name}: ${v.message}` : String(v);
  const one = raw
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, "<link>")
    .replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(ai|com|net|io|tech|dev|org|app|cloud|th)\b/gi, "<host>")
    .replace(/\b(sk|pk|key|tok)[-_][A-Za-z0-9_-]{6,}/g, "<redacted>")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<redacted>")
    .replace(/\s+/g, " ")
    .trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
};
const say = (line: string) => console.log(line);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
/** nearest rank บนค่าที่เรียงน้อย→มาก: ตำแหน่ง ceil(q·n) − 1 */
const rank = (sortedAsc: number[], q: number) => sortedAsc[Math.max(0, Math.ceil(q * sortedAsc.length) - 1)] ?? 0;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ═══ env + โมดูล (หลังด่านทั้งสองเท่านั้น) ═══
type EnvModule = {
  loadAiTeamQcEnv: () => Promise<{ host: string }>;
  atIds: () => Promise<{ at1: string; at2: string; atx: string; ownerUserId: string; otherOwnerUserId: string }>;
};
const envMod = (await import("./ai-team-qc-env.mts" as string)) as EnvModule;
await envMod.loadAiTeamQcEnv(); // ไม่ใช่ QC4 = ออก 4 ที่นี่ ก่อนเปิดการเชื่อมต่อ
// อ่านสวิตช์โมเดลจำลอง "หลัง" โหลด env: ไฟล์ env ของ QC เปิดมันเองได้ (ผู้เรียกไม่ได้ export) ⇒ ป้าย provider ต้องตรงกับที่บริการใช้จริง
// และด่านที่ 2 ต้องถือซ้ำ (ยังไม่ได้เขียนอะไร ยังไม่ได้เปิดการเชื่อมต่อ)
const MOCK = process.env.SHARK_AI_MOCK === "1";
if (MOCK && !process.env.PROBE_OUT) refuse(NEEDS_OUT);
const ids = await envMod.atIds();

const { Prisma } = await import("@prisma/client");
const { prisma } = await import("@/lib/core/db");
const { sendMessage } = await import("@/lib/ai/service");
const { sendMobileChat } = await import("@/lib/mobile/chat");
const { createConversation } = await import("@/lib/mobile/conversations");
const { aiMemberActor } = await import("@/lib/ai/actor");
const { sightOf } = await import("@/lib/ai/conversation-owner");
const { topUp, balanceOf } = await import("@/lib/ai/credit");
const { thbPerUsd } = await import("@/lib/ai/topup");
const { dayKeyBangkok } = await import("@/lib/ai/rules");

const tenantId = ids[tenantKey];
// AT-X เป็นร้านของเจ้าของอีกคน — at-owner ไม่มี Membership ที่นั่น
const membershipOf = (userId: string) => prisma.membership.findFirst({ where: { tenantId, userId }, select: { role: true, unitAccess: true, permissions: true } });
let actorUserId = ids.ownerUserId;
let membership = await membershipOf(actorUserId);
if (!membership && tenantKey === "atx") {
  actorUserId = ids.otherOwnerUserId;
  membership = await membershipOf(actorUserId);
}
if (!membership) {
  await prisma.$disconnect().catch(() => undefined);
  refuse("the seed owner has no Membership in the probe tenant (run the AI-team seed)");
}
const actor = aiMemberActor(tenantId, actorUserId, membership);
const ctx = { tenantId, actor };
const ownPrefix = sightOf(ctx).own ?? "";
if (!ownPrefix) {
  await prisma.$disconnect().catch(() => undefined);
  refuse("the actor has no conversation prefix");
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.replace(/[^a-z0-9]/g, "q").slice(-12).padStart(8, "q");
const refundRef = `${REFUND_REF_PREFIX}${runId}`;
const startedMs = Date.now();
const startedAt = new Date(startedMs).toISOString();
const windowFrom = new Date(startedMs - WINDOW_BELT_MS);
const rate = thbPerUsd();
const markupRaw = Number(process.env.SHARK_AI_PRICE_MARKUP);
const priceMarkup = Number.isFinite(markupRaw) && markupRaw > 0 ? markupRaw : 1;
const routing = process.env.SHARK_AI_MODEL && process.env.SHARK_AI_MODEL.trim() ? "forced" : "auto";

// ─────────────────────────── ทะเบียนตาราง (จาก schema ของ Prisma — ไม่มี SQL ดิบ) ───────────────────────────
type Where = Record<string, unknown>;
type Delegate = {
  count: (a: { where: Where }) => Promise<number>;
  findMany: (a: { where: Where; select: Record<string, true> }) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: { where: Where }) => Promise<{ count: number }>;
};
const delegates = prisma as unknown as Record<string, Delegate | undefined>;
const delegateOf = (model: string): Delegate | undefined => delegates[lowerFirst(model)];
const MODELS = Prisma.dmmf.datamodel.models.map((m) => ({ name: m.name, fields: new Set(m.fields.map((f) => f.name)) }));
const TENANT_MODELS = MODELS.filter((m) => m.fields.has("tenantId")).map((m) => m.name);
/** สมุดเครดิต: ไม่ลบ ไม่แก้ (กระเป๋าเปลี่ยนผ่าน topUp เท่านั้น) */
const LEDGER_MODELS = new Set(["AiCreditTxn", "AiCreditWallet"]);
/** ตารางที่มี conversationId + tenantId — ลบด้วยรหัสห้องที่ probe สร้างเองเท่านั้น (เฉพาะตารางของชั้น AI + เคสแจ้งทีมงาน) */
const CONV_MODELS = MODELS.filter((m) => m.fields.has("tenantId") && m.fields.has("conversationId") && !LEDGER_MODELS.has(m.name)).map((m) => m.name);
const isAiConvModel = (name: string) => name.startsWith("Ai") || name === "SupportCase";
/**
 * ตารางที่เครื่องมือ "เขียนทันที" ของโมเดลจริงเขียนได้โดยไม่ผูกห้อง (remember_fact · kb_auto_save · support_open_case ก่อนผูกห้อง ·
 * งานประจำ · แจ้งเตือน · dataset) — ลบเฉพาะแถวของร้านนี้ ที่ "รหัสไม่อยู่ในภาพถ่ายก่อนเริ่ม" และ createdAt อยู่ในหน้าต่างของ probe
 */
const WINDOW_MODELS = ["AiMemory", "KbArticle", "AiScheduledTask", "AiTrainingSample", "AppNotification", "SupportCase"].filter((n) => {
  const m = MODELS.find((x) => x.name === n);
  return Boolean(m && m.fields.has("id") && m.fields.has("tenantId") && m.fields.has("createdAt") && delegateOf(n));
});

/** จำนวนแถวของทุกตารางที่มี tenantId ของร้านนี้ (อ่านอย่างเดียว) — ใช้เทียบก่อน/หลัง เพื่อรายงานสิ่งที่ค้าง */
const countAll = async (): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  for (let i = 0; i < TENANT_MODELS.length; i += 10) {
    await Promise.all(
      TENANT_MODELS.slice(i, i + 10).map(async (name) => {
        const d = delegateOf(name);
        if (!d) return;
        try {
          out.set(name, await d.count({ where: { tenantId } }));
        } catch {
          // ตารางที่ฐานนี้ยังไม่มี (schema ของเลนอื่น) = ข้าม
        }
      }),
    );
  }
  return out;
};
const recentLedger = () =>
  prisma.aiCreditTxn.findMany({
    where: { tenantId, createdAt: { gte: windowFrom } },
    select: { id: true, kind: true, source: true, amountMicro: true, model: true, tokensIn: true, tokensOut: true, conversationId: true },
    orderBy: { createdAt: "asc" },
  });

// ─────────────────────────── สถานะของการวัด ───────────────────────────
type Row = {
  n: number;
  type: string;
  round: number;
  conversationId: string;
  model: string;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number | null;
  micro: number;
  wallMs: number;
  txnIds: string[];
};
const rows: Row[] = [];
const convIds: string[] = []; // ห้องที่ probe สร้าง/ได้รับรหัสกลับมาเอง
const dayOfConv = new Map<string, string>();
const historyIds = new Set<string>();
let lastDay = dayKeyBangkok(new Date());
let spentListed = 0;
let stoppedByCap = false;
let interrupted = false;
let failure: { n: number; type: string; round: number; reason: string } | null = null;
const problems: string[] = []; // ปัญหาของการเก็บกวาด / ความไม่ลงรอย (ทำให้ออก 2)

// สัญญาณหยุด (ข้อสอบ kill เมื่อหมดเวลา · ผู้คุมงานกด Ctrl-C): จบเทิร์นที่ค้างอยู่ แล้วไปเก็บกวาด — ไม่ตายกลางทาง
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    interrupted = true;
  });
}

// ภาพถ่ายก่อนเริ่ม
let ready = false;
let walletBefore = 0;
let countsBefore = new Map<string, number>();
const ledgerBefore = new Set<string>();
const ownerConvBefore = new Set<string>();
const windowBefore = new Map<string, Set<string>>();
let memoryBefore: { id: string; content: string; createdAt: Date; updatedAt: Date }[] = [];

const usageOf = (conversationId: string) =>
  prisma.aiCreditTxn.findMany({
    where: { tenantId, kind: "USAGE", conversationId },
    select: { id: true, source: true, amountMicro: true, model: true, tokensIn: true, tokensOut: true },
    orderBy: { createdAt: "asc" },
  });
const rememberConv = (id: string, day: string) => {
  if (!convIds.includes(id)) convIds.push(id);
  dayOfConv.set(id, day);
};

try {
  walletBefore = await balanceOf(tenantId);
  for (const t of await recentLedger()) ledgerBefore.add(t.id);
  for (const c of await prisma.aiConversation.findMany({ where: { tenantId, id: { startsWith: ownPrefix } }, select: { id: true } })) ownerConvBefore.add(c.id);
  for (const name of WINDOW_MODELS) {
    const d = delegateOf(name);
    if (!d) continue;
    windowBefore.set(name, new Set((await d.findMany({ where: { tenantId }, select: { id: true } })).map((r) => String(r.id))));
  }
  memoryBefore = await prisma.aiMemory.findMany({ where: { tenantId }, select: { id: true, content: true, createdAt: true, updatedAt: true } });
  countsBefore = await countAll();

  const low = walletBefore < capMicro + LOW_BALANCE_MICRO;
  say(`ai-team-cost-probe · run ${runId} · provider ${MOCK ? "mock" : "real"} · routing ${routing} · cap ${capMicro} micro · rounds ${rounds} · wallet before: ${low ? "LOW" : "OK"}`);
  if (low && !MOCK) {
    // วัดจริงด้วยกระเป๋าที่จะตกต่ำกว่าเส้นลดชั้น = ตัวเลขใช้ไม่ได้ — ยังไม่ได้เขียนอะไร จึงปฏิเสธตรงนี้
    await prisma.$disconnect().catch(() => undefined);
    refuse("wallet before: LOW — fund the probe tenant first (cap + US$0.50 or more), then run again");
  }
  ready = true;

  const total = TYPES.length * rounds;
  outer: for (let round = 1; round <= rounds; round += 1) {
    for (const t of TYPES) {
      if (interrupted) {
        failure = { n: rows.length + 1, type: t.key, round, reason: "interrupted by a signal" };
        break outer;
      }
      // เพดาน: ตรวจก่อนเริ่มทุกรอบ จากยอดที่อ่านจากสมุดเครดิต
      if (spentListed >= capMicro) {
        stoppedByCap = true;
        break outer;
      }
      const n = rows.length + 1;
      let toolCalls = 0;
      const deps = {
        onToolCall: () => {
          toolCalls += 1;
        },
      };
      let cid = "";
      let failed = "";
      lastDay = dayKeyBangkok(new Date());
      const t0 = Date.now();
      try {
        if (t.path === "mobile") {
          // สิ่งที่แอปทำ: เปิดห้องชื่อว่างก่อน แล้วส่งผ่านทางแชทมือถือ ⇒ ได้แถว AUTO_TITLE
          cid = (await createConversation(ctx)).id;
          rememberConv(cid, lastDay);
          let done = false;
          for await (const ev of sendMobileChat(ctx, { conversationId: cid, text: t.prompt }, deps)) {
            if (ev.type === "done") done = true;
            if (ev.type === "error") failed = scrub(ev.error);
          }
          if (!done && !failed) failed = "the mobile chat ended without an answer";
        } else {
          let existing: string | undefined;
          if (t.key === "chat-history") {
            existing = (await createConversation(ctx, "วางแผนโปรช่วงบ่าย")).id;
            cid = existing;
            rememberConv(cid, lastDay);
            const base = Date.now() - HISTORY.length * 60_000;
            for (const [i, h] of HISTORY.entries()) {
              const m = await prisma.aiMessage.create({
                data: { tenantId, conversationId: existing, role: h.role, content: h.content, createdAt: new Date(base + i * 60_000) },
                select: { id: true },
              });
              historyIds.add(m.id);
            }
          }
          const r = await sendMessage(ctx, { ...(existing ? { conversationId: existing } : {}), text: t.prompt }, deps);
          if (r.ok) {
            cid = r.conversationId;
            rememberConv(cid, lastDay);
          } else failed = `sendMessage returned ${r.error}${r.scope ? `/${r.scope}` : ""}`;
        }
      } catch (e) {
        failed = scrub(e);
      }
      const wallMs = Math.max(1, Date.now() - t0);

      // สิ่งที่ถูกคิดเงินจริงของห้องนี้ (CHAT + AUTO_TITLE) — อ่านจากสมุดเครดิต ไม่คำนวณเอง
      const tx = cid ? await usageOf(cid) : [];
      if (tx.length > 0) {
        const micro = sum(tx.map((x) => -x.amountMicro));
        spentListed += micro;
        rows.push({
          n,
          type: t.key,
          round,
          conversationId: cid,
          model: tx.find((x) => x.source === "CHAT")?.model ?? "",
          toolCalls,
          tokensIn: sum(tx.map((x) => x.tokensIn)),
          tokensOut: sum(tx.map((x) => x.tokensOut)),
          cachedTokens: null, // ชั้นผู้ให้บริการยังไม่รายงานโทเคนที่มาจากแคช
          micro,
          wallMs,
          txnIds: tx.map((x) => x.id),
        });
        say(`  run ${n}/${total} · ${t.key} · round ${round} · tools ${toolCalls} · micro ${micro} · total ${spentListed} · ${wallMs} ms${failed ? " · FAILED" : ""}`);
      }
      if (failed || tx.length === 0) {
        failure = { n, type: t.key, round, reason: failed || "the turn wrote no USAGE row to the credit ledger" };
        break outer; // รอบล้ม = หยุด ไม่เผาเงินต่อ
      }
    }
  }
} catch (e) {
  failure = failure ?? { n: rows.length + 1, type: "-", round: 0, reason: scrub(e) };
}

// ═══════════════════════ เก็บกวาด (เฟสเดียว · ทุกขั้นกันล้มแยกกัน) ═══════════════════════
const deleted: Record<string, number> = {};
let conversationsDeleted = 0;
let refundMicro = 0;
let unlistedMicro = 0;
let walletAfter = walletBefore;
let residue: string[] = [];
const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${scrub(e)}`);
  }
};

if (ready) {
  // (0) ห้องกำพร้า: sendMessage เปิดห้องเองแล้วล้มก่อนคืนรหัส ⇒ ห้องของผู้กระทำนี้ ที่ไม่มีในภาพถ่ายก่อนเริ่มและไม่ใช่ห้องที่รู้จัก
  await step("stray conversations", async () => {
    const now = await prisma.aiConversation.findMany({ where: { tenantId, id: { startsWith: ownPrefix } }, select: { id: true } });
    for (const c of now) if (!ownerConvBefore.has(c.id) && !convIds.includes(c.id)) rememberConv(c.id, lastDay);
  });

  // (1) คืนตาข่ายรายวัน AiUsage: เท่ากับที่เทิร์นของ probe บวกไว้พอดี (1 คำขอ + โทเคนของแถว ASSISTANT ที่ sendMessage เขียนในทรานแซกชันเดียวกัน)
  await step("AiUsage give-back", async () => {
    if (convIds.length === 0) return;
    const answers = await prisma.aiMessage.findMany({
      where: { tenantId, conversationId: { in: convIds }, role: "ASSISTANT" },
      select: { id: true, conversationId: true, tokensIn: true, tokensOut: true },
    });
    const perDay = new Map<string, { requests: number; tokensIn: number; tokensOut: number }>();
    for (const a of answers) {
      if (historyIds.has(a.id)) continue;
      const day = dayOfConv.get(a.conversationId) ?? lastDay;
      const d = perDay.get(day) ?? { requests: 0, tokensIn: 0, tokensOut: 0 };
      d.requests += 1;
      d.tokensIn += a.tokensIn;
      d.tokensOut += a.tokensOut;
      perDay.set(day, d);
    }
    for (const [day, d] of perDay) {
      // คำสั่งเดียว (decrement) · มีเงื่อนไขกันติดลบ · เทิร์นที่คร่อมเที่ยงคืนพอดีอาจถูกนับเป็นวันถัดไป ⇒ ลองวันถัดไปด้วย
      const next = dayKeyBangkok(new Date(new Date(`${day}T12:00:00+07:00`).getTime() + 86_400_000));
      let done = 0;
      for (const key of [day, next]) {
        if (done > 0) break;
        done = (
          await prisma.aiUsage.updateMany({
            where: { tenantId, day: key, requests: { gte: d.requests }, tokensIn: { gte: d.tokensIn }, tokensOut: { gte: d.tokensOut } },
            data: { requests: { decrement: d.requests }, tokensIn: { decrement: d.tokensIn }, tokensOut: { decrement: d.tokensOut } },
          })
        ).count;
      }
      if (done === 0) problems.push(`AiUsage give-back: no row of ${day} could give back ${d.requests} request(s)`);
    }
  });

  // (2) แถวที่ผูกห้องของ probe (ข้อเสนอ · แผน · feedback · เคสแจ้งทีมงาน · ข้อความ) → ตัวห้อง
  for (const name of CONV_MODELS) {
    await step(`delete ${name}`, async () => {
      const d = delegateOf(name);
      if (!d || convIds.length === 0) return;
      const where = { tenantId, conversationId: { in: convIds } };
      if (isAiConvModel(name)) {
        const res = await d.deleteMany({ where });
        if (res.count > 0) deleted[name] = (deleted[name] ?? 0) + res.count;
      } else {
        // ตารางของโมดูลอื่นที่บังเอิญมีคอลัมน์ชื่อเดียวกัน (รหัสคนละชุด) — ไม่ลบ แค่รายงานถ้าเจอ
        const left = await d.count({ where });
        if (left > 0) problems.push(`${name}: ${left} row(s) carry a probe conversation id (not deleted — not an AI-layer table)`);
      }
    });
  }
  await step("delete AiConversation", async () => {
    if (convIds.length === 0) return;
    conversationsDeleted = (await prisma.aiConversation.deleteMany({ where: { tenantId, id: { in: convIds } } })).count;
    if (conversationsDeleted !== convIds.length) problems.push(`AiConversation: deleted ${conversationsDeleted} of ${convIds.length}`);
  });

  // (3) แถวที่เครื่องมือเขียนทันทีของโมเดลจริงสร้างโดยไม่ผูกห้อง — เฉพาะแถวใหม่ของร้านนี้ในหน้าต่างของ probe
  for (const name of WINDOW_MODELS) {
    await step(`delete new ${name}`, async () => {
      const d = delegateOf(name);
      const before = windowBefore.get(name);
      if (!d || !before) return;
      const fresh = (await d.findMany({ where: { tenantId, createdAt: { gte: windowFrom } }, select: { id: true } })).map((r) => String(r.id)).filter((id) => !before.has(id));
      if (fresh.length === 0) return;
      const res = await d.deleteMany({ where: { tenantId, id: { in: fresh }, createdAt: { gte: windowFrom } } });
      if (res.count > 0) deleted[name] = (deleted[name] ?? 0) + res.count;
    });
  }
  // (3b) ความจำที่ forget_fact ลบ / remember_fact เด้งเวลา → คืนตามภาพถ่ายก่อนเริ่ม
  await step("restore AiMemory", async () => {
    const now = new Map((await prisma.aiMemory.findMany({ where: { tenantId }, select: { id: true, updatedAt: true } })).map((m) => [m.id, m.updatedAt.getTime()]));
    const gone = memoryBefore.filter((m) => !now.has(m.id));
    if (gone.length > 0) {
      await prisma.aiMemory.createMany({ data: gone.map((m) => ({ id: m.id, tenantId, content: m.content, createdAt: m.createdAt, updatedAt: m.updatedAt })) });
      deleted["AiMemory(restored)"] = gone.length;
    }
    for (const m of memoryBefore) {
      const at = now.get(m.id);
      if (at !== undefined && at !== m.updatedAt.getTime()) await prisma.aiMemory.updateMany({ where: { tenantId, id: m.id }, data: { updatedAt: m.updatedAt } });
    }
  });

  // (4) คืนเงิน: ทุกแถว USAGE ที่ร้านนี้ได้เพิ่มระหว่างการวัด (รวมแถวที่ไม่ผูกห้อง ถ้าเครื่องมือเรียกโมเดลเอง) — ADJUST ครั้งเดียว ref ผูก runId
  await step("refund", async () => {
    const fresh = (await recentLedger()).filter((t) => !ledgerBefore.has(t.id) && t.kind === "USAGE");
    refundMicro = sum(fresh.map((t) => -t.amountMicro));
    const listed = new Set(rows.flatMap((r) => r.txnIds));
    unlistedMicro = sum(fresh.filter((t) => !listed.has(t.id)).map((t) => -t.amountMicro));
    if (unlistedMicro !== 0) problems.push(`${unlistedMicro} micro of USAGE during the run belongs to no listed row (refunded, but not in the table)`);
    if (refundMicro > 0) {
      const res = await topUp(tenantId, refundMicro, { kind: "ADJUST", source: "ADJUST", ref: refundRef, note: `T0.1 cost probe refund (run ${runId}, ${MOCK ? "mock" : "real"})` });
      if (!res.credited) problems.push("refund: the ADJUST row was not written (ref already used)");
    }
  });
  await step("wallet check", async () => {
    walletAfter = await balanceOf(tenantId);
    if (walletAfter !== walletBefore) problems.push("wallet: balance after the refund differs from the balance before the run");
  });

  // (5) ตรวจสิ่งที่ค้าง: จำนวนแถวของทุกตารางของร้านนี้ ก่อน = หลัง (สมุดเครดิต = แถว USAGE ใหม่ + แถวคืนเงิน · กระเป๋า/ตาข่ายรายวันอาจถูกเปิดแถวใหม่)
  await step("residue check", async () => {
    const after = await countAll();
    const usageRowsNew = (await recentLedger()).filter((t) => !ledgerBefore.has(t.id)).length;
    const out: string[] = [];
    for (const name of new Set([...countsBefore.keys(), ...after.keys()])) {
      const a = countsBefore.get(name) ?? 0;
      const b = after.get(name) ?? 0;
      if (name === "AiCreditTxn") {
        if (b - a !== usageRowsNew) out.push(`AiCreditTxn ${a}→${b} (expected +${usageRowsNew})`);
      } else if (name === "AiCreditWallet" || name === "AiUsage") {
        if (b < a || b - a > 2) out.push(`${name} ${a}→${b}`);
      } else if (a !== b) out.push(`${name} ${a}→${b}`);
    }
    residue = out.sort();
    if (residue.length > 0) problems.push(`residue: ${residue.join(" · ")}`);
  });
}
const finishedAt = new Date().toISOString();

// ═══════════════════════ สถิติ + คณิตแพ็ก (สูตรตามสัญญาข้อ [4]) ═══════════════════════
const perType = TYPES.filter((t) => rows.some((r) => r.type === t.key)).map((t) => {
  const xs = rows.filter((r) => r.type === t.key).map((r) => r.micro).sort((a, b) => a - b);
  return { type: t.key, n: xs.length, p50Micro: rank(xs, 0.5), p95Micro: rank(xs, 0.95), meanMicro: mean(xs) };
});
const categoryOf = (key: string) => TYPES.find((t) => t.key === key)?.category;
const categoryMeanMicro = {} as Record<Category, number>;
let weightedRaw = 0;
for (const c of CATEGORIES) {
  const m = mean(rows.filter((r) => categoryOf(r.type) === c).map((r) => r.micro));
  categoryMeanMicro[c] = m;
  weightedRaw += WEIGHTS[c] * m;
}
const weightedMeanMicro = Math.ceil(weightedRaw - 1e-9);
const tasksOf = (allowanceMicro: number) => (weightedMeanMicro > 0 ? Math.floor(allowanceMicro / weightedMeanMicro) : 0);
const packs = PACK_PRICES_THB.map((priceThb) => {
  const revenueMicro = Math.round((priceThb / rate) * 1_000_000);
  const allowanceMicro = Math.floor(revenueMicro * (1 - MARGIN));
  return { priceThb, revenueMicro, allowanceMicro, approxTasks: tasksOf(allowanceMicro) };
});
// FREE trial (R-A5 "generous trial"): ข้อเสนอ + 2 ทางเลือก — ขนาดต้องต่างกันทั้งสาม
const freeOption = (allowanceMicro: number, note: string) => ({ allowanceMicro, approxTasks: tasksOf(allowanceMicro), note });
const freeA = 100 * weightedMeanMicro;
const freeB = 50 * weightedMeanMicro;
let freeC = Math.floor((packs[0]?.allowanceMicro ?? 0) * 0.2);
while (freeC > 0 && (freeC === freeA || freeC === freeB)) freeC += 1;
const freeTrial = {
  proposed: freeOption(freeA, "about 100 tasks of the expected mix per month: an owner can use the team every working day for a month before deciding to buy (generous trial, R-A5)"),
  alternatives: [
    freeOption(freeB, "about 50 tasks per month (the figure drawn in the mockups): half the platform cost per free shop, but daily use runs out in about two weeks"),
    freeOption(freeC, "one fifth of the allowance of the 490 THB pack: follows the pack price instead of a task count, so the free tier never competes with the smallest paid pack"),
  ],
};
const totals = {
  runs: rows.length,
  tokensIn: sum(rows.map((r) => r.tokensIn)),
  tokensOut: sum(rows.map((r) => r.tokensOut)),
  spentMicro: sum(rows.map((r) => r.micro)),
  spentUsd: sum(rows.map((r) => r.micro)) / 1_000_000,
};
const data = {
  version: 1,
  runId,
  provider: MOCK ? "mock" : "real",
  startedAt,
  finishedAt,
  tenantId,
  actorUserId,
  capUsd,
  capMicro,
  rounds,
  stoppedByCap,
  thbPerUsd: rate,
  margin: MARGIN,
  routing,
  priceMarkup,
  types: TYPES.map(({ key, category, path }) => ({ key, category, path })),
  weights: WEIGHTS,
  rows,
  perType,
  categoryMeanMicro,
  weightedMeanMicro,
  packs,
  freeTrial,
  totals,
  cleanup: {
    conversationsDeleted,
    refundRef,
    refundMicro,
    walletBeforeMicro: walletBefore,
    walletAfterMicro: walletAfter,
    unlistedUsageMicro: unlistedMicro,
    deleted,
    residue,
    problems,
  },
  failure,
};

// ═══════════════════════ ไฟล์ผล (markdown) ═══════════════════════
const f1 = (x: number) => x.toFixed(1);
const usd = (micro: number) => (micro / 1_000_000).toFixed(4);
const thb = (micro: number) => ((micro / 1_000_000) * rate).toFixed(2);
const expected = TYPES.length * rounds;
const status = failure
  ? `FAILED at run ${failure.n} (${failure.type}, round ${failure.round}): ${failure.reason} — the table holds what was measured before it; do not use this file for pricing.`
  : stoppedByCap
    ? `**STOPPED BY CAP** after ${rows.length} of ${expected} runs: the cumulative spend ${totals.spentMicro} micro reached the cap ${capMicro} micro before the next run started. Statistics and pack math below cover the measured runs only.`
    : `All ${rows.length} runs finished under the cap (${totals.spentMicro} of ${capMicro} micro).`;
const freeLine = (label: string, o: { allowanceMicro: number; approxTasks: number; note: string }) =>
  `| ${label} | ${o.allowanceMicro} | ${o.approxTasks} | ${usd(o.allowanceMicro)} | ${thb(o.allowanceMicro)} | ${o.note} |`;
const md = [
  "# AI TEAM — measured cost per task (WO T0.1)",
  "",
  `- provider: **${data.provider}** · run \`${runId}\` · started ${startedAt} · finished ${finishedAt}`,
  `- tenant: seed tenant ${tenantKey.toUpperCase()} · actor: the seed owner · model routing: ${routing === "auto" ? "automatic (the service picks the model per message)" : "FORCED by the environment (not the default routing)"} · price markup ×${priceMarkup}`,
  "- figures are list price from AiCreditTxn; the provider bill can be lower (cache)",
  "- unit: micro = one millionth of a US dollar, as charged to the shop's AI credit wallet. One run = one user turn in a new conversation, sent through the normal chat path.",
  `- ${status}`,
  ...(MOCK ? ["- This file comes from the mock provider: token counts are derived from text length, not from a model. It proves the pipeline, not the prices."] : []),
  "",
  "## 1. Runs",
  "",
  "| # | type | round | model | tool calls | tokensIn | tokensOut | cached | micro | wall ms |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.n} | ${r.type} | ${r.round} | ${r.model} | ${r.toolCalls} | ${r.tokensIn} | ${r.tokensOut} | ${r.cachedTokens ?? "-"} | ${r.micro} | ${r.wallMs} |`),
  "",
  "cached = `-`: the provider layer does not report cached prompt tokens today. tool calls = business tools the model called in the turn.",
  "",
  "## 2. Per type (micro, nearest rank)",
  "",
  "| type | category | path | runs | p50 | p95 | mean |",
  "|---|---|---|---|---|---|---|",
  ...perType.map((p) => {
    const t = TYPES.find((x) => x.key === p.type);
    return `| ${p.type} | ${t?.category ?? ""} | ${t?.path ?? ""} | ${p.n} | ${p.p50Micro} | ${p.p95Micro} | ${f1(p.meanMicro)} |`;
  }),
  "",
  "## 3. Expected mix (weights) and weighted mean",
  "",
  "| category | weight | categoryMeanMicro | types |",
  "|---|---|---|---|",
  ...CATEGORIES.map((c) => `| ${c} | ${WEIGHTS[c]} | ${f1(categoryMeanMicro[c])} | ${TYPES.filter((t) => t.category === c).map((t) => t.key).join(", ")} |`),
  "",
  "categoryMeanMicro[c] = arithmetic mean of micro over all runs whose type belongs to category c.",
  "",
  `weightedMeanMicro = ceil( Σ weights[c] × categoryMeanMicro[c] ) = **${weightedMeanMicro}** micro per task (about ${thb(weightedMeanMicro)} THB at list price).`,
  "",
  "## 4. Pack math",
  "",
  `- revenueMicro = round( priceThb / thbPerUsd × 1000000 ), with thbPerUsd = ${rate}`,
  `- allowanceMicro = floor( revenueMicro × (1 − margin) ), with margin = ${MARGIN} (gross margin of at least 50 % on list price)`,
  "- approxTasks = floor( allowanceMicro / weightedMeanMicro )",
  "",
  "| priceThb | revenueMicro | allowanceMicro | approxTasks |",
  "|---|---|---|---|",
  ...packs.map((p) => `| ${p.priceThb} | ${p.revenueMicro} | ${p.allowanceMicro} | ${p.approxTasks} |`),
  "",
  "## 5. FREE trial allowance (R-A5) — one proposal and two alternatives",
  "",
  "| option | allowanceMicro | approxTasks | USD per shop per month | THB per shop per month | why |",
  "|---|---|---|---|---|---|",
  freeLine("proposed", freeTrial.proposed),
  ...freeTrial.alternatives.map((a, i) => freeLine(`alternative ${i + 1}`, a)),
  "",
  "approxTasks uses the same formula as the packs. The cost columns are what one free shop costs the platform per month at list price if it uses the whole allowance.",
  "",
  "## 6. Totals and cleanup",
  "",
  `- runs ${totals.runs} · tokensIn ${totals.tokensIn} · tokensOut ${totals.tokensOut} · spent ${totals.spentMicro} micro (${totals.spentUsd} USD) · cap ${capMicro} micro`,
  `- conversations deleted: ${conversationsDeleted} · wallet refunded with one ADJUST row \`${refundRef}\` of ${refundMicro} micro · wallet before ${walletBefore} → after ${walletAfter}`,
  `- other rows removed: ${Object.keys(deleted).length ? Object.entries(deleted).map(([k, v]) => `${k} ${v}`).join(" · ") : "none"}`,
  `- rows left in the tenant after cleanup: ${residue.length ? residue.join(" · ") : "none (every tenant table has the row count it had before the run; the credit ledger keeps its rows by design)"}`,
  ...(problems.length ? [`- cleanup problems: ${problems.join(" · ")}`] : []),
  "",
  "## 7. Machine-readable data (read by scripts/qc-ai-t0.1.mts)",
  "",
  "```json probe-data",
  JSON.stringify(data, null, 1),
  "```",
  "",
].join("\n");

let written = false;
try {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, md, "utf8");
  written = true;
} catch (e) {
  problems.push(`result file: ${scrub(e)}`);
}

if (failure) console.error(`ai-team-cost-probe: run ${failure.n} (${failure.type}, round ${failure.round}) failed — ${failure.reason}`);
for (const p of problems) console.error(`ai-team-cost-probe: ${p}`);
say(`  cleanup · conversations ${conversationsDeleted} · refund ${refundMicro} micro · wallet ${walletAfter === walletBefore ? "restored" : "MISMATCH"} · residue ${residue.length ? residue.join(" · ") : "none"} · file ${written ? "written" : "NOT WRITTEN"}`);
say(`PROBE_RESULT ${JSON.stringify({ runs: totals.runs, spentMicro: totals.spentMicro, spentUsd: totals.spentUsd, stoppedByCap, out: OUT, refundRef })}`);
await prisma.$disconnect().catch(() => undefined);
process.exit(failure || problems.length > 0 || !written ? 2 : 0);
