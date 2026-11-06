// QC — SECRETARY S3a.1-R2 · แก้ผลเส้นโมเดลจริง (RESOLUTIONS §Z.6 R-Z41…R-Z45) — ไม่เรียกโมเดลจริง (SHARK_AI_MOCK · ตรวจด้วยเครื่องมือ/ฟังก์ชันตรง)
// สัญญา: ledger/secretary-briefs/sec-brief-S3a.1-R2.md · FINDING F1–F6 ใน ledger/wo-notes/sec-s3a1-r.md
//
// กลุ่มข้อ:
//   T1 today_appointments/upcoming_schedule คืน id · includeCancelled รวม CANCELLED/NO_SHOW พร้อมมัดจำ · ปริยายไม่รวม (R-Z41)
//   T2 pos_create_sale memberId ⇒ บิลผูกสมาชิก ⇒ ระบายคิวของร้านทดสอบ ⇒ แต้ม > 0 ตามอัตราร้าน · ไม่ส่ง = ไม่ผูก · customer_search มี id (R-Z42)
//   T3 pickModel("ร่างใบเสนอราคาให้…") = smart · "ยอดขายวันนี้" = fast (R-Z43)
//   T4 costMicroUsd แยกราคาแคช · parseAnthropicReply แยกแคช · chargeUsage หักตามจริง (R-Z44)
//   T5 chat.send kind=quote ไม่มี documentId: ไม่มีใบ ⇒ ล้มไทย+คง PENDING · มีใบ EXECUTED ในห้อง ⇒ ข้อความมีเลขที่+ลิงก์ · ใบของห้องอื่น ⇒ ไม่หยิบ (R-Z45)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-s3a1-r2.mts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a1-r2";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const STARTED = existsSync(join(ROOT, "src/lib/ai/secretary/job-gen.ts"));
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่เริ่มใบ และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-s3a1-r2");
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_MODEL; // T3 ตรวจ routing ของผลิตภัณฑ์ (ไม่บังคับโมเดล)
type Res = "PASS" | "FAIL";
const cks: { id: string; res: Res; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "") => { cks.push({ id, res: ok ? "PASS" : "FAIL", why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const parse = (s: string) => { try { return JSON.parse(s) as AnyMod; } catch { return { raw: s } as AnyMod; } };

const { prisma } = await import("@/lib/core/db");
const tools = (await import("@/lib/ai/tools")) as AnyMod;
const proposals = (await import("@/lib/ai/proposals")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms")) as AnyMod;
const provider = (await import("@/lib/ai/provider")) as AnyMod;
const pricing = (await import("@/lib/ai/pricing")) as AnyMod;
const credit = (await import("@/lib/ai/credit")) as AnyMod;
const sys = (await import("@/lib/modules/system/service")) as AnyMod;
const { dayKeyBangkok } = (await import("@/lib/ai/rules")) as AnyMod;

const STAMP = Date.now().toString(36);
const SLUG = `qc-sec-r2-${STAMP}`;
const U = { owner: `qcr2-owner-${STAMP}` };
let tid = "";

/** ลบทั้งร้าน (ทุกตารางที่มี tenantId · ตรวจ slug ก่อน) — แบบ qc-sec-real */
async function wipeTenant(): Promise<number> {
  if (!tid) return 0;
  const s = (await prisma.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as AnyMod[];
  if (s.length && s[0].slug !== SLUG) throw new Error("slug ไม่ตรง — ไม่ลบ");
  const tables = ((await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as AnyMod[]).map((r) => String(r.t));
  await prisma.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => 0);
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid); } catch { next.push(tb); } }
    pending = next;
  }
  await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, SLUG).catch(() => 0);
  let left = 0;
  for (const tb of tables) { try { left += Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as AnyMod[])[0]?.n ?? 0); } catch { /* */ } }
  return left;
}
async function cleanup(): Promise<number> {
  let left = 0;
  try { left = await wipeTenant(); } catch (e) { console.log(`  ⚠️ wipe: ${errMsg(e)}`); left = -1; }
  for (const m of ["session", "aiSecretary", "aiNotifyPref", "pushDevice"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { userId: { startsWith: "qcr2-" } } }); } catch { /* */ } }
  try { await (prisma as AnyMod).aiMemory.deleteMany({ where: { id: { startsWith: "u~qcr2-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcr2-" } } }); } catch { /* */ }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-r2-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  return left;
}

const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const actor = () => ({ kind: "member" as const, tenantId: tid, userId: U.owner, membership: OWNER_M });
const ctxOf = (conversationId?: string) => ({ tenantId: tid, actor: actor(), ...(conversationId ? { conversationId } : {}) });

let residue = 0;
try {
  const t = await prisma.tenant.create({ data: { name: "QC SEC R2", slug: SLUG } }); tid = t.id;
  await prisma.user.create({ data: { id: U.owner, email: `${U.owner}@example.com`, name: "คุณเจ้าของ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  const conv0 = await prisma.aiConversation.create({ data: { tenantId: tid, title: "QC R2" } as never });

  // ───────── T1 ─────────
  console.log("── T1: นัดหมาย id + includeCancelled ──");
  {
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขานัด", slug: `bk-${STAMP}` } as never });
    const pos = await sys.createSystem(tid, "POS", "ขายหน้าร้าน"); await sys.linkUnit(tid, pos.id, unit.id);
    const bk = await sys.createSystem(tid, "BOOKING", "จองคิว"); await sys.linkUnit(tid, bk.id, unit.id);
    const service = await prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "นวดหน้า", durationMin: 60, bufferMin: 0, priceSatang: 120000 } as never });
    const staff = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างนิด" } as never });
    const today = dayKeyBangkok(new Date());
    const todayAt = new Date(`${today}T12:00:00+07:00`);
    const tomorrowAt = new Date(Math.max(Date.now() + 86_400_000, todayAt.getTime() + 86_400_000));
    const mk = async (name: string, startAt: Date, deposit: number) => prisma.appointment.create({ data: { tenantId: tid, unitId: unit.id, staffId: staff.id, serviceId: service.id, startAt, endAt: new Date(startAt.getTime() + 3_600_000), status: "CONFIRMED", customerName: name, customerPhone: "0855550000", depositSatang: deposit, priceSatang: 120000 } as never });
    const a1 = await mk("ลูกค้าวันนี้", todayAt, 0);
    const a2 = await mk("ลูกค้าไม่มา", todayAt, 50000);
    const a3 = await mk("ลูกค้ายกเลิกพรุ่งนี้", tomorrowAt, 50000);
    const a4 = await mk("ลูกค้าพรุ่งนี้", tomorrowAt, 0);
    const bsvc = (await import("@/lib/modules/booking/service")) as AnyMod;
    const d2 = await bsvc.recordDeposit({ tenantId: tid, unitId: unit.id }, a2.id).catch((e: unknown) => ({ ok: false, reason: errMsg(e) }));
    const d3 = await bsvc.recordDeposit({ tenantId: tid, unitId: unit.id }, a3.id).catch((e: unknown) => ({ ok: false, reason: errMsg(e) }));
    await prisma.appointment.update({ where: { id: a2.id }, data: { status: "NO_SHOW" } as never });
    await prisma.appointment.update({ where: { id: a3.id }, data: { status: "CANCELLED" } as never });
    const tDef = parse(await tools.runTool(ctxOf(conv0.id), "today_appointments", {}));
    const tAll = parse(await tools.runTool(ctxOf(conv0.id), "today_appointments", { includeCancelled: true }));
    const rowsDef = (tDef.นัดวันนี้ ?? []) as AnyMod[], rowsAll = (tAll.นัดวันนี้ ?? []) as AnyMod[];
    const ns = rowsAll.find((r) => r.id === a2.id);
    chk("T1-1", "today_appointments คืน id ทุกแถว · ปริยายไม่รวม NO_SHOW · includeCancelled=true รวม NO_SHOW พร้อม มัดจำ {สถานะ, จำนวนบาท, คืนได้}",
      rowsDef.some((r) => r.id === a1.id) && rowsDef.every((r) => typeof r.id === "string") && !rowsDef.some((r) => r.id === a2.id) &&
      !!ns && !!ns.มัดจำ && thai(ns.มัดจำ.สถานะ) && typeof ns.มัดจำ.จำนวนบาท === "number" && typeof ns.มัดจำ.คืนได้ === "boolean" && rowsAll.some((r) => r.id === a1.id && !r.มัดจำ),
      JSON.stringify({ def: rowsDef.map((r) => r.id === a1.id ? "a1" : r.id === a2.id ? "a2" : r.id), all: rowsAll.map((r) => ({ id: r.id === a2.id ? "a2" : r.id === a1.id ? "a1" : r.id, d: r.มัดจำ })), d2 }).slice(0, 300));
    const uDef = parse(await tools.runTool(ctxOf(conv0.id), "upcoming_schedule", { days: 3 }));
    const uAll = parse(await tools.runTool(ctxOf(conv0.id), "upcoming_schedule", { days: 3, includeCancelled: true }));
    const upDef = (uDef.นัดหมาย ?? []) as AnyMod[], upAll = (uAll.นัดหมาย ?? []) as AnyMod[];
    const cx = upAll.find((r) => r.id === a3.id);
    chk("T1-2", "upcoming_schedule คืน id · ปริยายไม่รวม CANCELLED · includeCancelled=true รวม CANCELLED ที่มัดจำค้างคืน (คืนได้=true · จำนวนบาท 500)",
      upDef.some((r) => r.id === a4.id) && !upDef.some((r) => r.id === a3.id) && !!cx && cx.มัดจำ?.คืนได้ === true && cx.มัดจำ?.จำนวนบาท === 500,
      JSON.stringify({ def: upDef.map((r) => r.id === a4.id ? "a4" : r.id === a3.id ? "a3" : r.id), a3: cx, d3 }).slice(0, 300));
    const refundDesc = String((tools.toolRegistry?.() ?? []).find((x: AnyMod) => x.def?.name === "refund_booking_deposit")?.def?.description ?? "");
    chk("T1-3", "คำอธิบาย refund_booking_deposit ชี้ให้ใช้ today_appointments/upcoming_schedule ด้วย includeCancelled=true", /includeCancelled\s*=\s*true/.test(refundDesc) && /today_appointments/.test(refundDesc), refundDesc.slice(0, 160));
  }

  // ───────── T2 ─────────
  console.log("── T2: pos_create_sale memberId ⇒ แต้มตามอัตราร้าน ──");
  {
    const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขาขาย", slug: `sh-${STAMP}` } as never });
    // ร้านมีสองสาขาแล้ว (T1 · T2) ⇒ ระบุ unitName ในทุกบิล · ระบบ POS เดียวของร้าน (dispatch ใช้ระบบ POS แรกของร้าน) ผูกสาขานี้เพิ่ม
    const pos = (await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "POS" }, orderBy: { createdAt: "asc" } }))!; await sys.linkUnit(tid, pos.id, unit.id);
    const mem = await sys.createSystem(tid, "MEMBER", "สมาชิก"); await sys.linkUnit(tid, mem.id, unit.id);
    const pts = await sys.createSystem(tid, "POINT", "แต้มสะสม"); await sys.linkUnit(tid, pts.id, unit.id);
    await (prisma as AnyMod).pointSettings.upsert({ where: { tenantId: tid }, create: { tenantId: tid, satangPerPoint: 2500 }, update: { satangPerPoint: 2500 } });
    await prisma.posProduct.create({ data: { tenantId: tid, systemId: pos.id, name: "ลาเต้เย็น", basePriceSatang: 8500, kind: "PRODUCT" } as never });
    const cust = await prisma.customer.create({ data: { tenantId: tid, memberSystemId: mem.id, memberCode: `QCR2${STAMP}`.slice(0, 20), name: "คุณมานะ รักดี", phone: "0899180021" } as never });
    const cs = parse(await tools.runTool(ctxOf(conv0.id), "customer_search", { query: "มานะ" }));
    const csRows = (cs.ลูกค้า ?? []) as AnyMod[];
    chk("T2-1", "customer_search คืน id (memberId) ต่อแถว", csRows.some((r) => r.id === cust.id), JSON.stringify(cs).slice(0, 200));
    const sell = async (withMember: boolean) => {
      const out = parse(await tools.runTool(ctxOf(conv0.id), "pos_create_sale", { unitName: "สาขาขาย", lines: [{ name: "ลาเต้เย็น", qty: 2, unitPriceSatang: 8500 }], payType: "CASH", ...(withMember ? { memberId: cust.id } : {}) }));
      if (!out.proposalId) return { out, ex: null as AnyMod | null, sale: null as AnyMod | null };
      const ex = await proposals.executeProposal(OWNER_M, { tenantId: tid }, out.proposalId, { userId: U.owner });
      const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, sourceId: out.proposalId } as never, select: { id: true, memberId: true, status: true, grandTotalSatang: true } as never }) as AnyMod | null;
      return { out, ex, sale };
    };
    const a = await sell(true);
    let points = -1;
    if (a.sale?.id) {
      const hooks = (await import("@/lib/member-hooks")) as AnyMod; hooks.registerMemberHooks?.();
      const mb = (await import("@/lib/member-bridges")) as AnyMod;
      await mb.onPosSalePaid(tid, a.sale.id); // ระบายเฉพาะบิลของร้านทดสอบ (ตัวเดียวกับ consumer pos.sale.paid)
      const bal = (await (prisma as AnyMod).pointBalance.findMany({ where: { tenantId: tid, customerId: cust.id } }).catch(() => [])) as AnyMod[];
      points = bal.reduce((s, b) => s + Number(b.balance ?? 0), 0);
    }
    chk("T2-2", "pos_create_sale(memberId) ผ่าน runTool + executeProposal ⇒ บิล PAID ผูก memberId · แต้มจากสะพานสมาชิก = 170/25 = 6 (> 0 ตามอัตราร้าน) · ข้อความผลบอก 'ผูกสมาชิก'",
      a.ex?.ok === true && a.sale?.memberId === cust.id && a.sale?.status === "PAID" && points === 6 && /ผูกสมาชิก/.test(String(a.ex?.note ?? "")),
      JSON.stringify({ out: a.out.proposalId ? "proposal" : a.out, ex: a.ex, sale: a.sale, points }).slice(0, 300));
    const b = await sell(false);
    chk("T2-3", "ไม่ส่ง memberId ⇒ บิลเหมือนเดิม (ไม่ผูกสมาชิก)", b.ex?.ok === true && !!b.sale && !b.sale.memberId && b.sale.status === "PAID", JSON.stringify({ ex: b.ex, sale: b.sale }).slice(0, 200));
    const bad = parse(await tools.runTool(ctxOf(conv0.id), "pos_create_sale", { unitName: "สาขาขาย", lines: [{ name: "ลาเต้เย็น", qty: 1, unitPriceSatang: 8500 }], payType: "CASH", memberId: "nosuch-member" }));
    const ptDesc = String((tools.toolRegistry?.() ?? []).find((x: AnyMod) => x.def?.name === "point_adjust")?.def?.description ?? "");
    chk("T2-4", "memberId ที่ไม่ใช่สมาชิกของร้าน ⇒ error ไทย (ไม่สร้างข้อเสนอ) · คำอธิบาย point_adjust ห้ามใช้แทนแต้มจากการซื้อ", typeof bad.error === "string" && thai(bad.error) && !bad.proposalId && /แต้มจากการซื้อ/.test(ptDesc), JSON.stringify({ bad, pt: ptDesc.slice(-120) }).slice(0, 260));
  }

  // ───────── T3 ─────────
  console.log("── T3: routing ──");
  {
    const q = provider.pickModel("ร่างใบเสนอราคาให้คุณสมชาย 2 ชุด", false);
    const r = provider.pickModel("คืนมัดจำของคุณสมศรี", false);
    const f = provider.pickModel("ยอดขายวันนี้", false);
    chk("T3-1", "pickModel: 'ร่างใบเสนอราคาให้…' = smart · 'คืนมัดจำ…' = smart · 'ยอดขายวันนี้' = fast (เดิม)", q === provider.SMART_MODEL && r === provider.SMART_MODEL && f === provider.FAST_MODEL, JSON.stringify({ q, r, f }));
  }

  // ───────── T4 ─────────
  console.log("── T4: ราคาแคช ──");
  {
    const mk = Number(process.env.SHARK_AI_PRICE_MARKUP);
    const markup = Number.isFinite(mk) && mk > 0 ? mk : 1;
    // sonnet: in 3 · out 15 · write 3×1.25 = 3.75 · read 3×0.1 = 0.3 (USD/1M)
    const expect = Math.max(1, Math.ceil(((1000 * 3 + 100 * 15 + 40000 * 3.75 + 70000 * 0.3) / 1_000_000) * markup * 1_000_000));
    const got = pricing.costMicroUsd(provider.SMART_MODEL, 1000, 100, { write: 40000, read: 70000 });
    const legacy = pricing.costMicroUsd(provider.SMART_MODEL, 1000, 100);
    const legacyExpect = Math.max(1, Math.ceil(((1000 * 3 + 100 * 15) / 1_000_000) * markup * 1_000_000));
    chk("T4-1", `costMicroUsd(sonnet, 1000, 100, {write 40000, read 70000}) = ${expect} (คำนวณมือ) · ลายเซ็นเดิม (ไม่มีแคช) = ${legacyExpect}`, got === expect && legacy === legacyExpect, JSON.stringify({ got, expect, legacy, legacyExpect }));
    const rep = provider.parseAnthropicReply({ model: "claude-sonnet-5", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 400 } }, "claude-sonnet-5");
    chk("T4-2", "parseAnthropicReply แยกแคช: tokensIn 100 (ไม่ใช่แคช) · cacheWrite 30 · cacheRead 400 · tokensOut 20", rep.tokensIn === 100 && rep.cacheWrite === 30 && rep.cacheRead === 400 && rep.tokensOut === 20, JSON.stringify(rep));
    const charged = await credit.chargeUsage({ tenantId: tid }, { source: "CHAT", model: provider.SMART_MODEL, tokensIn: 1000, tokensOut: 100, cacheWrite: 40000, cacheRead: 70000, note: "qc-r2-cache" });
    const txn = await prisma.aiCreditTxn.findFirst({ where: { tenantId: tid, kind: "USAGE", note: "qc-r2-cache" }, select: { amountMicro: true, tokensIn: true } });
    chk("T4-3", "chargeUsage หักตามราคาแคชจริง: คืน = ค่าคำนวณมือ · AiCreditTxn.amountMicro = −ค่านั้น · tokensIn ของแถว = ขาเข้ารวม 111000", charged === expect && Number(txn?.amountMicro) === -expect && txn?.tokensIn === 111000, JSON.stringify({ charged, txn }));
  }

  // ───────── T5 ─────────
  console.log("── T5: ส่งใบเสนอราคาในเทิร์นเดียว ──");
  {
    const unit = await prisma.businessUnit.findFirst({ where: { tenantId: tid, slug: `sh-${STAMP}` } });
    const acc = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
    const chat = await sys.createSystem(tid, "CHAT", "แชทลูกค้า");
    await (prisma as AnyMod).aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: tid, module: "chat" } }, create: { tenantId: tid, module: "chat", level: "DRAFT", setById: U.owner }, update: { level: "DRAFT" } });
    await (prisma as AnyMod).aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: tid, module: "account" } }, create: { tenantId: tid, module: "account", level: "DRAFT", setById: U.owner }, update: { level: "DRAFT" } }).catch(() => null);
    const cust = await prisma.customer.findFirst({ where: { tenantId: tid, name: "คุณมานะ รักดี" } });
    const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chat.id, channel: "WEBCHAT", externalUserId: `qcr2-web-${STAMP}`, displayName: "คุณมานะ", customerId: cust?.id } as never });
    const cconv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chat.id, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unit?.id ?? null, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
    await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chat.id, conversationId: cconv.id, direction: "IN", type: "TEXT", body: "ขอใบเสนอราคาหน่อยครับ" } as never });
    const room = async (n: string) => {
      const r = await rooms.startRoom({ tenantId: tid, actor: actor() }, { instruction: `ห้อง R2 ${n}`, context: { chatConversationId: cconv.id } });
      if (!r?.ok) throw new Error(`startRoom ${n}: ${JSON.stringify(r).slice(0, 120)}`);
      return r as AnyMod;
    };
    const quoteProposal = async (conversationId: string) => prisma.aiProposal.create({ data: { tenantId: tid, conversationId, kind: "chat.send", risk: "NORMAL", summary: "ส่งใบเสนอราคาถึงลูกค้า", payload: { systemId: chat.id, conversationId: cconv.id, contactId: contact.id, body: "เรียนคุณมานะ แนบใบเสนอราคาตามที่ขอครับ", kind: "quote" }, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) } as never });
    const executedDoc = async (roomRow: AnyMod, docNo: string, token: string) => {
      const doc = await prisma.accountDocument.create({ data: { tenantId: tid, systemId: acc.id, docType: "QUOTATION", status: "AWAITING_ACCEPT", docNo, grandTotal: 963000, publicToken: token } as never });
      const p = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: roomRow.conversationId, kind: "account.documents.create", risk: "NORMAL", summary: "สร้างใบเสนอราคา", payload: {}, status: "EXECUTED", executedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } as never });
      await prisma.aiActionLog.create({ data: { tenantId: tid, roomId: roomRow.roomId, userId: U.owner, approverId: U.owner, module: "account", kind: "account.documents.create", summary: "สร้างใบเสนอราคา", payload: {}, proposalId: p.id, entityType: "account.document", entityId: doc.id } as never });
      return doc;
    };
    // (ก) ไม่มีใบในห้อง ⇒ ล้มไทย + คง PENDING
    const r1 = await room("ไม่มีใบ");
    const p1 = await quoteProposal(r1.conversationId);
    const e1 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p1.id, { userId: U.owner });
    const s1 = await prisma.aiProposal.findUnique({ where: { id: p1.id }, select: { status: true } });
    chk("T5-1", "quote ไม่มี documentId · ห้องยังไม่มีใบที่อนุมัติ ⇒ ok:false ข้อความไทย 'อนุมัติใบเสนอราคาก่อน' · ข้อเสนอคง PENDING", e1?.ok === false && thai(e1?.note) && /อนุมัติใบเสนอราคา/.test(String(e1?.note)) && s1?.status === "PENDING", JSON.stringify({ e1, s1 }).slice(0, 220));
    // (ข) มีใบ EXECUTED ในห้อง ⇒ ข้อความมีเลขที่ + ลิงก์
    const r2 = await room("มีใบ");
    await executedDoc(r2, `QT-R2-${STAMP}`, `qcr2tok${STAMP}`);
    const p2 = await quoteProposal(r2.conversationId);
    const e2 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p2.id, { userId: U.owner });
    const out2 = await prisma.chatMessage.findFirst({ where: { tenantId: tid, conversationId: cconv.id, direction: "OUT", clientMessageId: { contains: p2.id } } as never, select: { body: true } }) ?? await prisma.chatMessage.findFirst({ where: { tenantId: tid, conversationId: cconv.id, direction: "OUT" }, orderBy: { createdAt: "desc" }, select: { body: true } });
    const body2 = String(out2?.body ?? "");
    chk("T5-2", "มีใบ EXECUTED ในห้อง ⇒ อนุมัติ ok · ข้อความ OUT มีเลขที่ใบ + ลิงก์ /r/<token>", e2?.ok === true && body2.includes(`QT-R2-${STAMP}`) && body2.includes(`/r/qcr2tok${STAMP}`), JSON.stringify({ e2, body: body2.slice(0, 200) }));
    // (ค) ใบของห้องอื่น ⇒ ไม่หยิบ
    const r3 = await room("ห้องอื่นมีใบ");
    await executedDoc(r3, `QT-R3-${STAMP}`, `qcr3tok${STAMP}`);
    const r4 = await room("ห้องนี้ไม่มีใบ");
    const p4 = await quoteProposal(r4.conversationId);
    const e4 = await proposals.executeProposal(OWNER_M, { tenantId: tid }, p4.id, { userId: U.owner });
    const s4 = await prisma.aiProposal.findUnique({ where: { id: p4.id }, select: { status: true } });
    const leaked = await prisma.chatMessage.count({ where: { tenantId: tid, conversationId: cconv.id, direction: "OUT", body: { contains: `QT-R3-${STAMP}` } } });
    chk("T5-3", "ใบ EXECUTED ของห้องอื่น ⇒ ไม่หยิบ (ok:false · คง PENDING · ไม่มีข้อความที่อ้างใบของห้องอื่น)", e4?.ok === false && s4?.status === "PENDING" && leaked === 0, JSON.stringify({ e4, s4, leaked }).slice(0, 220));
    const accTools = (tools.toolRegistry?.() ?? []).filter((x: AnyMod) => /document/.test(String(x.def?.name ?? "")) && /create/.test(String(x.def?.name ?? "")));
    const docDesc = accTools.map((x: AnyMod) => String(x.def?.description ?? "")).join(" | ");
    chk("T5-4", "คำอธิบายเครื่องมือสร้างเอกสารบัญชีบอกให้เรียก send_customer_message kind='quote' ในเทิร์นเดียว (ไม่ต้องใส่ documentId)", /send_customer_message/.test(docDesc) && /quote/.test(docDesc), docDesc.slice(0, 200));
  }
} catch (e) {
  const detail = (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e)).slice(0, 400);
  console.log(`  💥 ${detail}`); chk("CRASH", "ข้อสอบรันจบ", false, detail.slice(0, 200));
} finally {
  residue = await cleanup();
}
chk("CLEAN", "ลบร้านทดสอบหมด (residue 0)", residue === 0, String(residue));

const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: [], residue }));
process.exit(failed.length ? 1 : 0);
