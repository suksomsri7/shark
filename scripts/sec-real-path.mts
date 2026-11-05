// sec-real-path.mts — เส้นทางจริง 3 เส้นของเลขา AI ด้วยโมเดลจริง (ใบ S1.14 · R-K16 · แผน §1.5) — **รายงาน ไม่ใช่ oracle** (ไม่ assert ว่าโมเดลเลือก kind ถูก)
//
// 🔴 ผู้คุมเป็นคนรัน (ด้วยคีย์ของเจ้าของ `SHARK_ANTHROPIC_KEY` · `AI_PROVIDER=anthropic` · ห้ามใช้คีย์โปรเจกต์อื่น) · ฐาน QC เลขาเท่านั้น
//    builder รันได้เฉพาะ `SHARK_AI_MOCK=1` (พิสูจน์ว่าสคริปต์เดินครบ + ลบข้อมูลทดสอบหมด) — ไม่เรียกโมเดลจริง
// ทุกเส้นเดินผ่าน route จริงของแอป (`/api/mobile/secretary/**` เรียก handler ตรง): POST rooms → worker (after() นอกคำขอ = รอจนจบ)
//   → ไม่มีข้อเสนอ = ส่งต่อ 1 ครั้ง "ยืนยัน ทำตามนั้นเลย" → GET proposals → OWNER อนุมัติทุกใบ (approve route = executeProposal · confirm2x)
// ต้นทุนต่อห้อง = Σ|AiCreditTxn.amountMicro| (USAGE · conversationId ของห้อง) × บาท/ดอลลาร์ (`thbPerUsd` · env SHARK_THB_PER_USD) เทียบ 3.58 บาท/ห้อง
//   เกิน +30% ⇒ JSON_SUMMARY `costOver: true` (ผู้คุมถามเจ้าของ) · ข้อมูลทดสอบลบใน finally
//
// รัน (ผู้คุม):  bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env AI_PROVIDER=anthropic SMS_PROVIDER=mock pnpm exec tsx scripts/sec-real-path.mts
//   (SHARK_ANTHROPIC_KEY ต้องมีใน env ของผู้รัน) · ทดสอบแห้ง: ... env SHARK_AI_MOCK=1 SMS_PROVIDER=mock pnpm exec tsx scripts/sec-real-path.mts
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const LABEL = "sec-real-path";
const MOCK = process.env.SHARK_AI_MOCK === "1";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); }
  }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
  if (!MOCK && (process.env.AI_PROVIDER !== "anthropic" || !(process.env.SHARK_ANTHROPIC_KEY ?? "").trim())) {
    console.error(`🔴 ${LABEL}: ต้องตั้ง AI_PROVIDER=anthropic + SHARK_ANTHROPIC_KEY (คีย์ของเจ้าของ) — หรือ SHARK_AI_MOCK=1 สำหรับทดสอบแห้ง`);
    process.exit(2);
  }
}

type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const { prisma } = await import("@/lib/core/db");
const { issueMobileToken } = await import("@/lib/mobile/auth");
const { runRoomJobs } = await import("@/lib/ai/secretary/worker");
const { thbPerUsd } = await import("@/lib/ai/topup");
const sys = await import("@/lib/modules/system/service");

const COST_TARGET_THB = 3.58;
const COST_OVER_PCT = 30;
const STAMP = Date.now().toString(36);
const OWNER_ID = `secrp-owner-${STAMP}`;
const PATHS = [
  { id: "quote_line", instruction: "ออกใบเสนอราคาให้ลูกค้า A 3 รายการ (ค่าบริการติดตั้ง 1,500 บาท · ค่าอุปกรณ์ 2,000 บาท · ค่าเดินทาง 300 บาท) แล้วส่งไปทาง LINE", expect: ["account.documents.create", "chat.send"] },
  { id: "quiet_followup", instruction: "ลูกค้าที่เงียบไป 30 วันมีใคร ช่วยร่างข้อความตามและสร้างการ์ดติดตาม", expect: ["kanban.cards.create"] },
  { id: "refund_deposit", instruction: "คืนมัดจำนัดหมายของลูกค้า B", expect: ["booking_refund_deposit"] },
] as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const fixtures: { name: string; ok: boolean; note?: string }[] = [];
async function fx<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try { const v = await fn(); fixtures.push({ name, ok: true }); return v; } catch (e) { fixtures.push({ name, ok: false, note: errMsg(e) }); console.log(`  ⚠️ fixture ${name}: ${errMsg(e)}`); return null; }
}
const route = async (p: string) => (await import(`@/app/api/mobile/secretary/${p}/route`)) as unknown as Record<string, Handler>;
let tid = "";
let H: Record<string, string> = {};
async function call(p: string, method: string, body?: unknown, params: Record<string, string> = {}) {
  const m = await route(p);
  const r = await m[method]!(new Request(`http://real.local/api/mobile/secretary/${p}`, { method, headers: { "content-type": "application/json", ...H }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve(params) });
  let json: Record<string, unknown> = {};
  try { json = (await r.json()) as Record<string, unknown>; } catch { /* */ }
  return { status: r.status, body: json };
}

/** worker ของห้องจนงานจบ (คิวกลางอาจมีงานอื่น) — ≤ 6 รอบ */
async function drain(roomId: string) {
  for (let i = 0; i < 6; i++) {
    const open = await prisma.aiRoomJob.count({ where: { tenantId: tid, roomId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (open === 0) return;
    await runRoomJobs({ limit: 5 });
  }
}

const MODELS = [
  "aiActionLog", "aiLesson", "aiTrainingSample", "aiFeedback", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiMemory",
  "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiSystemAccess", "aiApprovalRule", "aiScheduledTask", "aiNotifyPref", "appNotification",
  "chatMessage", "chatConversationHelper", "chatAiSuggestion", "chatConversation", "chatContact", "chatSetting",
  "kanbanCard", "kanbanColumn", "kanbanBoardMember", "kanbanBoard", "crmActivity", "crmDeal", "crmContact",
  "accountDocumentLine", "accountPayment", "accountDocument", "accountContact", "posSaleLine", "posSale",
  "appointment", "bookingService", "bookingStaff", "customer", "auditLog", "outboxEvent", "supportMessage", "supportCase", "appSystemUnit", "appSystem", "membership", "businessUnit",
];
async function cleanup() {
  if (!tid) return;
  for (let pass = 0; pass < 2; pass++) {
    for (const m of MODELS) { try { await (prisma as AnyMod)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* ลำดับ FK — รอบถัดไป */ } }
  }
  try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "secrp-" } } }); } catch (e) { console.log(`  ⚠️ cleanup user: ${errMsg(e)}`); }
  try { await prisma.chatRateBucket.deleteMany({ where: { OR: [{ key: { contains: STAMP } }, { key: { contains: tid } }] } }); } catch { /* ถังเพดานอัตราของรอบนี้ */ }
}

type PathReport = { id: string; roomId: string | null; status: number; jobs: string[]; followUp: boolean; proposals: { kind: string; summary: string; approved: boolean; note: string }[]; plans: { title: string; approved: boolean; note: string }[]; expected: readonly string[]; matched: string[]; costThb: number; tokensIn: number; tokensOut: number; ms: number; error?: string };
const reports: PathReport[] = [];
let residue = -1;

try {
  console.log(`── ${LABEL} (${MOCK ? "MOCK — ทดสอบแห้ง" : "โมเดลจริง"}) ──`);
  // ── ร้านทดสอบ: POS + บัญชี + CRM + จองคิว + บอร์ดงาน + แชท WEBCHAT ──
  const t = await prisma.tenant.create({ data: { name: "ร้านทดสอบเลขา (เส้นทางจริง)", slug: `sec-real-path-${STAMP}` } });
  tid = t.id;
  await prisma.user.create({ data: { id: OWNER_ID, email: `${OWNER_ID}@example.com`, name: "เจ้าของทดสอบ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: OWNER_ID, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  H = { authorization: `Bearer ${(await issueMobileToken(OWNER_ID)).token}`, "x-tenant-id": tid };
  const unit = await fx("unit", () => prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาหลัก", slug: `main-${STAMP}` } as never }));
  const S: Record<string, string> = {};
  for (const [type, name] of [["POS", "ขายหน้าร้าน"], ["ACCOUNT", "บัญชี"], ["CRM", "ลูกค้าสัมพันธ์"], ["KANBAN", "บอร์ดงาน"], ["CHAT", "แชทลูกค้า"], ["BOOKING", "จองคิว"], ["MEMBER", "สมาชิก"]] as const) {
    const s = await fx(`system ${type}`, () => sys.createSystemAutoLink(tid, type, name));
    if (s) S[type] = s.id;
  }
  await fx("chat DRAFT", () => (prisma as AnyMod).aiSystemAccess.create({ data: { tenantId: tid, module: "chat", level: "DRAFT", setById: OWNER_ID } })); // ค่าเริ่มต้น chat = READ (ส่งลูกค้าไม่ได้)
  // ลูกค้า A — สมาชิก + CRM + ห้องแชท WEBCHAT ที่ผูกแล้ว (ส่งถึงลูกค้าได้เฉพาะที่ผูก · R-K15)
  const custA = S.MEMBER ? await fx("customer A", () => prisma.customer.create({ data: { tenantId: tid, memberSystemId: S.MEMBER, name: "ลูกค้า A (ทดสอบ)" } as never })) : null;
  if (S.CRM) await fx("crm contact A", () => prisma.crmContact.create({ data: { tenantId: tid, systemId: S.CRM, name: "ลูกค้า A (ทดสอบ)", lifecycleStage: "CUSTOMER", ...(custA ? { memberCustomerId: custA.id } : {}) } as never }));
  if (S.CHAT && custA) {
    await fx("chat setting", () => prisma.chatSetting.create({ data: { tenantId: tid, systemId: S.CHAT } as never }));
    const contact = await fx("chat contact A", () => prisma.chatContact.create({ data: { tenantId: tid, systemId: S.CHAT, channel: "WEBCHAT", externalUserId: `secrp-a-${STAMP}`, displayName: "ลูกค้า A (ทดสอบ)", customerId: custA.id } as never }));
    if (contact) await fx("chat conversation A", () => prisma.chatConversation.create({ data: { tenantId: tid, systemId: S.CHAT, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", ...(unit ? { unitId: unit.id } : {}) } as never }));
  }
  // ลูกค้าเงียบ 30+ วัน 2 ราย (CRM)
  const old = new Date(Date.now() - 45 * 86_400_000);
  if (S.CRM) for (const n of ["ลูกค้าเงียบ 1 (ทดสอบ)", "ลูกค้าเงียบ 2 (ทดสอบ)"]) await fx(`crm quiet ${n}`, () => prisma.crmContact.create({ data: { tenantId: tid, systemId: S.CRM, name: n, lifecycleStage: "CUSTOMER", createdAt: old, lastActivityAt: old } as never }));
  // บอร์ดงานสำหรับการ์ดติดตาม
  if (S.KANBAN) {
    const board = await fx("kanban board", () => prisma.kanbanBoard.create({ data: { tenantId: tid, systemId: S.KANBAN, name: "ติดตามลูกค้า" } as never }));
    if (board) for (const [i, n] of ["ต้องทำ", "กำลังทำ", "เสร็จ"].entries()) await fx(`kanban column ${n}`, () => prisma.kanbanColumn.create({ data: { tenantId: tid, systemId: S.KANBAN, boardId: board.id, name: n, sortOrder: i } as never }));
  }
  // ลูกค้า B — นัดที่ถูกยกเลิกแล้ว มัดจำ 300 บาทรับแล้ว (REFUND_DUE)
  if (unit) {
    const svc = await fx("booking service", () => prisma.bookingService.create({ data: { tenantId: tid, unitId: unit.id, name: "บริการทดสอบ", durationMin: 60, priceSatang: 100_000, depositSatang: 30_000 } as never }));
    const staff = await fx("booking staff", () => prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างทดสอบ" } as never }));
    if (svc && staff) {
      const startAt = new Date(Date.now() + 3 * 86_400_000);
      await fx("appointment B", () => prisma.appointment.create({ data: { tenantId: tid, unitId: unit.id, staffId: staff.id, serviceId: svc.id, startAt, endAt: new Date(startAt.getTime() + 3_600_000), status: "CANCELLED", customerName: "ลูกค้า B (ทดสอบ)", customerPhone: "0800000000", depositSatang: 30_000, depositPaidAt: new Date(), priceSatang: 100_000 } as never }));
    }
  }

  // ── 3 เส้น ──
  for (const p of PATHS) {
    const t0 = Date.now();
    const rep: PathReport = { id: p.id, roomId: null, status: 0, jobs: [], followUp: false, proposals: [], plans: [], expected: p.expect, matched: [], costThb: 0, tokensIn: 0, tokensOut: 0, ms: 0 };
    reports.push(rep);
    console.log(`\n▶ ${p.id}: ${p.instruction}`);
    try {
      const r = await call("rooms", "POST", { instruction: p.instruction });
      rep.status = r.status;
      const roomId = typeof r.body.roomId === "string" ? r.body.roomId : null;
      rep.roomId = roomId;
      if (!roomId) { rep.error = `POST rooms ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`; continue; }
      await drain(roomId);
      let pend = await call("rooms/[id]/proposals", "GET", undefined, { id: roomId });
      let items = (pend.body.items ?? []) as AnyMod[];
      if (items.length === 0) {
        rep.followUp = true;
        await call("rooms/[id]/send", "POST", { text: "ยืนยัน ทำตามนั้นเลย เสนอรายการให้ผมอนุมัติ", clientMessageId: `secrp-${p.id}-${STAMP}` }, { id: roomId });
        await drain(roomId);
        pend = await call("rooms/[id]/proposals", "GET", undefined, { id: roomId });
        items = (pend.body.items ?? []) as AnyMod[];
      }
      for (const it of items) {
        if (it.type === "plan") {
          const a = await call("plans/[id]/approve", "POST", { confirm2x: true }, { id: String(it.id) });
          rep.plans.push({ title: String(it.title), approved: a.body.ok === true, note: String(a.body.note ?? (a.body.results ? JSON.stringify(a.body.results).slice(0, 160) : "")) });
          for (const s of (it.steps ?? []) as AnyMod[]) rep.matched.push(String(s.kind));
        } else {
          const a = await call("proposals/[id]/approve", "POST", { confirm2x: true }, { id: String(it.id) });
          rep.proposals.push({ kind: String(it.kind), summary: String(it.summary).slice(0, 120), approved: a.body.ok === true, note: String(a.body.note ?? a.body.message ?? "").slice(0, 160) });
          rep.matched.push(String(it.kind));
        }
      }
      const room = await prisma.aiRoom.findFirst({ where: { id: roomId, tenantId: tid }, select: { conversationId: true } });
      const jobs = await prisma.aiRoomJob.findMany({ where: { tenantId: tid, roomId }, select: { status: true, error: true } });
      rep.jobs = jobs.map((j) => (j.error ? `${j.status}: ${j.error}` : j.status));
      if (room) {
        const txns = await prisma.aiCreditTxn.findMany({ where: { tenantId: tid, conversationId: room.conversationId, kind: "USAGE" }, select: { amountMicro: true, tokensIn: true, tokensOut: true } });
        const micro = txns.reduce((s, x) => s + Math.abs(x.amountMicro), 0);
        rep.costThb = Math.round((micro / 1e6) * thbPerUsd() * 100) / 100;
        rep.tokensIn = txns.reduce((s, x) => s + x.tokensIn, 0);
        rep.tokensOut = txns.reduce((s, x) => s + x.tokensOut, 0);
      }
    } catch (e) {
      rep.error = errMsg(e);
    } finally {
      rep.ms = Date.now() - t0;
      console.log(`  ห้อง ${rep.roomId ?? "-"} · งาน ${rep.jobs.join(" | ") || "-"} · ข้อเสนอ ${rep.proposals.map((x) => `${x.kind}${x.approved ? "✓" : "✗"}`).join(", ") || "-"} · แผน ${rep.plans.length} · ต้นทุน ${rep.costThb} บาท · ${rep.ms} ms${rep.error ? ` · ⚠️ ${rep.error}` : ""}`);
      for (const x of rep.proposals) if (!x.approved) console.log(`    ✗ ${x.kind}: ${x.note}`);
    }
  }
} catch (e) {
  console.error(`🔴 ${LABEL}: ${errMsg(e)}`);
} finally {
  await cleanup();
  residue = tid ? await prisma.aiRoom.count({ where: { tenantId: tid } }).catch(() => -1) + (await prisma.tenant.count({ where: { id: tid } }).catch(() => 1)) : 0;
}
const maxCost = Math.max(0, ...reports.map((r) => r.costThb));
const avgCost = reports.length ? Math.round((reports.reduce((s, r) => s + r.costThb, 0) / reports.length) * 100) / 100 : 0;
const costOver = !MOCK && reports.some((r) => r.costThb > COST_TARGET_THB * (1 + COST_OVER_PCT / 100));
console.log(`\n${LABEL}: ${reports.length} เส้น · ต้นทุนเฉลี่ย ${avgCost} บาท/ห้อง (เป้า ${COST_TARGET_THB} · เกิน +${COST_OVER_PCT}% = ธง) · สูงสุด ${maxCost} · residue ${residue}`);
console.log("JSON_SUMMARY " + JSON.stringify({
  mock: MOCK,
  paths: reports.map((r) => ({ id: r.id, room: !!r.roomId, status: r.status, followUp: r.followUp, kinds: r.matched, expected: r.expected, approved: r.proposals.filter((x) => x.approved).length + r.plans.filter((x) => x.approved).length, proposals: r.proposals.length + r.plans.length, costThb: r.costThb, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ms: r.ms, error: r.error ?? null })),
  avgCostThb: avgCost,
  targetThb: COST_TARGET_THB,
  costOver,
  fixturesFailed: fixtures.filter((f) => !f.ok).map((f) => `${f.name}: ${f.note}`),
  residue,
}));
await prisma.$disconnect();
process.exit(residue === 0 && reports.length === PATHS.length && reports.every((r) => !!r.roomId) ? 0 : 1);
