// QC — ระบบสมาชิก v2 WO M3.2: campaigns v2 — segment (M3.1) · ช่องทาง 4 (LINE ผ่าน chat facade · อีเมล core/email · SMS provider interface · push MemberPushDevice) · variant A/B + holdout hash คงที่ · แนบ voucher (issue ต่อคน origin CAMPAIGN idempotent) / คูปองรายคน · consent ณ เวลาส่ง · track open/use (consumer voucher.used / pos.sale.paid ≤ 30 วัน) · stats ROI/uplift ต่อ variant · เพดาน/วัน · cancel · UI ภาพ 21 + 07 ล่าง
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.2 · พิมพ์เขียว §4.1 (MktCampaign/MktRecipient +cols) §4.3 (CampaignVariantStat) §5.9 §7.1 (campaign.sent) §11.6 (แคมเปญ: ส่งซ้ำคนเดิมไม่ได้ · holdout สุ่มคงที่ · ยกเลิกกลางทาง = หยุดคิว ที่ส่งแล้วไม่ถอน · เคารพ consent ณ เวลาส่ง · เพดาน 5,000 ข้อความ/วัน) §11.9 · MEMBER-API §2.13 (campaigns.*) · ภาพ 21 · 07 (ล่าง)
// requires: member-seed
//
// สัญญา (migration `member_v2_g2` · src/lib/modules/marketing/{campaigns.ts (v2), index.ts (facade), campaigns-actions.ts} · หน้า /member/campaigns · /member/campaigns/new · /member/campaigns/[campaignId] · fitness F2: marketing→member/voucher/coupon/chat (Fable เพิ่มให้แล้ว) · chat/index.ts facade ใหม่ export pushToContact)
//   schema: MktCampaign +{channels String[] · content Json {line?, email?{subject,body}, sms?, push?{title,body}} · memberSystemId? · scheduledBy?} · MktRecipient +{channel String? · status ("PENDING"|"SENT"|"FAILED"|"SKIPPED"|"HOLDOUT") · error? · voucherId? · saleId?} · CampaignVariantStat {campaignId variant sent opened used saleSatang BigInt costSatang} unique(campaignId,variant) · MemberPushDevice {tenantId customerId token platform lastSeenAt} unique(token) index(customerId) · เพิ่ม channel "PUSH" ใน MktChannel (additive)
//   ctx = { tenantId, systemId (= ระบบ MARKETING ของร้าน · ไม่มี → สร้างเมื่อเปิดใช้), memberSystemId, actorUserId } · actor = MemberActor · สิทธิ์ member.promo.manage (สร้าง/ส่ง/ยกเลิก) · promo.read (อ่าน/สถิติ)
//   createCampaignV2(ctx, actor, { name, segmentId | definition, channels[], content, variantB?: content, holdoutPct(0–50), attachVoucherTemplateId?, couponCode?, scheduledAt? }) → { id } · updateCampaignV2 · getCampaign · listCampaignsV2(ctx) (สถานะ · ส่ง/เปิด/ใช้/ยอด/ต้นทุน/ROI ต่อแถว — ภาพ 07 ล่าง)
//   previewCampaign(ctx, actor, id) → { audience, willSend, holdout, byChannel: { LINE, EMAIL, SMS, PUSH, none }, maxCostSatang (= willSend × มูลค่า voucher/คูปอง + ค่าส่งต่อข้อความ), expectedUsePct (ค่ากลางจากแคมเปญก่อน · ไม่มี = 25) } — อ่านอย่างเดียว · ผลเท่าเดิมเมื่อเรียกซ้ำ
//   holdout/variant: hashPct(campaignId, customerId) = (sha256(`${campaignId}:${customerId}`) 4 ไบต์แรก mod 10000)/100 → < holdoutPct = HOLDOUT · variant = variantB ? (sha256(`${campaignId}:v:${customerId}`) ไบต์แรก % 2 ? "B" : "A") : "A" — deterministic · ไม่มี Math.random
//   sendCampaignV2(ctx, actor, id, { now?, deps?: { line?, email?, sms?, push? } }) → { sent, failed, skipped, holdout, status } — ขั้นตอน: สมาชิกใน segment (member facade) → ต่อคน: holdout → MktRecipient HOLDOUT (ไม่ส่ง · ไม่ออก voucher) · เลือกช่องทางแรกใน channels[] ที่ **ยินยอม ณ เวลาส่ง** (privacy.getConsents) และมีที่ส่ง (LINE = MemberChannelIdentity LINE + ChatContact · EMAIL = email · SMS = phone + provider · PUSH = MemberPushDevice) · ไม่มีช่องทาง → SKIPPED reason ไทย · แนบ voucher → voucher.issue origin CAMPAIGN originRef {campaignId} (idempotent ต่อ customer+campaign · ไม่ออกให้ HOLDOUT/SKIPPED) · แทนตัวแปร {ชื่อ} {ระดับ} {voucher} {รหัสสมาชิก} · ส่งผ่าน deps (ปริยาย: LINE chat.pushToContact · EMAIL core/email.sendEmail · SMS core/sms provider (ไม่มี → ช่องปิด) · PUSH core/push) → SENT/FAILED {error}
//     กติกา: ผู้รับคนเดิมในแคมเปญเดียวไม่ถูกสร้าง/ส่งซ้ำ (unique campaignId+customerId) · ส่งซ้ำ = ทำต่อเฉพาะ PENDING/FAILED · เพดาน messagesPerDay (Tenant.limits.member.messagesPerDay ?? MEMBER_LIMITS 5,000) นับ SENT วันไทยนี้ทุกแคมเปญ · willSend เกินที่เหลือ → throw ไทย LIMIT ก่อนส่ง · scheduledAt อนาคต → status SCHEDULED (cron รายชั่วโมง `campaignsDue` ส่งเมื่อถึงเวลา) · event campaign.sent {campaignId, sent, holdout, variants}
//   cancelCampaign(ctx, actor, id) → SCHEDULED → CANCELLED · กำลังส่ง/ส่งแล้ว → PENDING ที่เหลือ → SKIPPED "ยกเลิก" · SENT/FAILED คงเดิม · status CANCELLED
//   trackOpen(tenantId, recipientId | token) → openedAt (ครั้งแรกเท่านั้น) · GET /api/m/track/o/<token>.gif (pixel อีเมล) · trackUse: consumer voucher.used (originRef.campaignId) → recipient.usedAt/saleId/saleSatang · consumer pos.sale.paid (member-bridges) → recipient ของลูกค้าที่ SENT ภายใน 30 วันหลัง sentAt และยัง usedAt null → usedAt + saleSatang (บิลแรกเท่านั้น)
//   campaignStats(ctx, actor, id) → { variants: [{ variant "A"|"B"|"HOLDOUT", sent, opened, used, usePct, saleSatang, costSatang, roi }], uplift: { usePct: A/B รวม − HOLDOUT, saleSatangPerHead }, total } · roi = (saleSatang − costSatang) / max(costSatang,1) · costSatang = Σ มูลค่า voucher ที่ถูกใช้ + ค่าส่ง (LINE 0 · EMAIL 0 · SMS 60 สตางค์/ข้อความ · PUSH 0) · CampaignVariantStat upsert ทุกครั้งที่ stats/consumer เปลี่ยน · MktCampaign.stats Json สรุป
//   UI: /member/campaigns (ตาราง: ชื่อ · segment · ช่องทาง · สถานะชิป · ส่ง/เปิด/ใช้/ยอด/ต้นทุน/ROI · ปุ่มสร้าง) · /member/campaigns/new (ภาพ 21: ขั้น 1 กลุ่มเป้าหมาย = เลือก segment ที่บันทึก หรือ builder inline (คอมโพเนนต์ M3.1) + กล่องฟ้า n คน · ขั้น 2 ช่องทาง+ข้อความ แท็บ LINE/อีเมล/SMS/push · ตัวแปร · ปุ่ม 'ให้ AI ร่าง' (stub → M3.10) · แนบ voucher (select template) · คูปองโค้ด · toggle 'ทดสอบข้อความ B (A/B 50/50)' · ขั้น 3 กำหนดส่ง ตั้งเวลา · toggle holdout % · ขวา: ตัวอย่างหน้าจอ LINE (ข้อความจริง + การ์ด voucher) · ประมาณการ (จะส่งจริง · หัก holdout · ต้นทุนสูงสุด · คาดใช้สิทธิ์ %) · ปุ่ม 'ทดสอบส่งหาตัวเอง' · หัว: บันทึกร่าง / ส่งแคมเปญ) · /member/campaigns/[id] (สถิติต่อ variant + holdout + uplift + รายชื่อผู้รับ/สถานะ)
//   testid: campaigns-page campaigns-table campaign-row-<id> campaigns-add campaign-new campaign-step-segment campaign-step-message campaign-step-schedule campaign-segment-pick campaign-count campaign-channel-tabs campaign-message campaign-voucher campaign-ab-toggle campaign-holdout campaign-preview-line campaign-estimate campaign-test-send campaign-save-draft campaign-send campaign-detail campaign-stats campaign-recipients
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_g2$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/marketing/campaigns.ts") || !existsSync("src/app/app/sys/[id]/member/campaigns/new/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_g2 · marketing/campaigns.ts · member/campaigns/new)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const cols = async (t: string) => new Set((await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='${t}'`)).map((c) => c.column_name));
const P = prisma as Any;
let tid = ""; let SYS = ""; let MK = "";
const tag = Date.now().toString(36);
const before = { vouchers: new Set<string>(), templates: new Set<string>() };
const made = { campaigns: [] as string[], segments: [] as string[], devices: [] as string[], sales: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  for (const v of await P.voucher.findMany({ where: { tenantId: tid }, select: { id: true } })) before.vouchers.add(v.id);
  for (const t of await P.voucherTemplate.findMany({ where: { tenantId: tid }, select: { id: true } })) before.templates.add(t.id);
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const MKT = (await import("@/lib/modules/marketing" as string)) as Record<string, (...a: Any[]) => Any>;
  const S = (await import("@/lib/modules/member/segments" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const V = (await import("@/lib/modules/voucher" as string)) as Record<string, (...a: Any[]) => Any>;
  const sys = (await import("@/lib/modules/system/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const pook = await actorOf(E.users.staff.pook.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  let mkSys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "MARKETING" as Any } });
  if (!mkSys) { mkSys = await sys.createSystem(tid, "MARKETING", "แคมเปญ (MB QC)"); for (const u of [E.units.patong, E.units.kata]) await sys.linkUnit(tid, mkSys!.id, u); }
  MK = mkSys!.id;
  const ctx = { tenantId: tid, systemId: MK, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const mctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async () => { await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 }); };
  const recips = (id: string) => P.mktRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" } });
  const camp = (id: string) => P.mktCampaign.findUnique({ where: { id } });
  const tenant0 = await prisma.tenant.findUnique({ where: { id: tid }, select: { limits: true } });
  restore.push(() => prisma.tenant.update({ where: { id: tid }, data: { limits: tenant0?.limits ?? {} } }));
  // segment: สมาชิกป่าตอง (40 คน) — ยินยอม LINE = i คู่? ใช้ของจริงจาก seed
  const seg = await S.saveSegment(mctx, owner, { name: `ป่าตอง ${tag}`, definition: { groups: [{ conditions: [{ field: "unit", op: "in", value: [E.units.patong] }] }] }, scope: "TEAM" });
  made.segments.push(seg.id);
  const patong = await prisma.customer.findMany({ where: { memberSystemId: SYS, homeUnitId: E.units.patong, status: { not: "MERGED" as Any } }, select: { id: true, email: true, phone: true } });
  const consentLine = new Set((await P.memberConsent.findMany({ where: { tenantId: tid, channel: "LINE", granted: true, customerId: { in: patong.map((c) => c.id) } }, select: { customerId: true } })).map((r: Any) => r.customerId));
  const lineIdent = new Set((await P.memberChannelIdentity.findMany({ where: { tenantId: tid, channel: "LINE", customerId: { in: patong.map((c) => c.id) } }, select: { customerId: true } })).map((r: Any) => r.customerId));
  const T300 = await V.createTemplate(mctx, owner, { name: `แคมเปญ ฿300 ${tag}`, kind: "FIXED", value: 30_000, config: { stackWithCoupon: true, unitIds: [] }, validDays: 30, origin: "CAMPAIGN" });
  const mkDeps = () => { const calls = { line: [] as Any[], email: [] as Any[], sms: [] as Any[], push: [] as Any[] }; const ok = async () => ({ ok: true }); return { calls, deps: { line: async (r: Any) => { calls.line.push(r); return ok(); }, email: async (r: Any) => { calls.email.push(r); return ok(); }, sms: async (r: Any) => { calls.sms.push(r); return ok(); }, push: async (r: Any) => { calls.push.push(r); return ok(); } } }; };
  const content = { line: "สวัสดีค่ะคุณ {ชื่อ} สมาชิกระดับ {ระดับ} รับ voucher {voucher} ไปใช้ได้เลย", email: { subject: "สิทธิพิเศษสำหรับคุณ {ชื่อ}", body: "voucher {voucher}" }, sms: "SHARK: voucher {voucher}", push: { title: "สิทธิพิเศษ", body: "voucher {voucher}" } };

  // ═══ S1 schema ═══
  const mc = await cols("MktCampaign"); const mr = await cols("MktRecipient"); const cv = await cols("CampaignVariantStat"); const pd = await cols("MemberPushDevice");
  const chEnum = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='MktChannel'`)).map((e) => e.enumlabel);
  chk("M3.2-S1.1", "migration member_v2_g2: MktCampaign +{channels content memberSystemId} · MktRecipient +{channel status error voucherId saleId} · CampaignVariantStat {campaignId variant sent opened used saleSatang costSatang} · MemberPushDevice {customerId token platform lastSeenAt} · MktChannel +PUSH · ระบบ MARKETING ของร้าน QC มี",
    ["channels", "content", "memberSystemId"].every((c) => mc.has(c)) && ["channel", "status", "error", "voucherId", "saleId"].every((c) => mr.has(c)) && ["campaignId", "variant", "sent", "opened", "used", "saleSatang", "costSatang"].every((c) => cv.has(c)) && ["customerId", "token", "platform", "lastSeenAt"].every((c) => pd.has(c)) && chEnum.includes("PUSH") && !!MK,
    "ครบ", `mc=${["channels", "content"].map((c) => mc.has(c)).join("/")} mr=${["status", "voucherId"].map((c) => mr.has(c)).join("/")} cv=${[...cv].length} pd=${[...pd].length} enum=${chEnum.join(",")}`);

  // ═══ S2 split / preview ═══
  const c1 = await MKT.createCampaignV2(ctx, owner, { name: `LINE ป่าตอง ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 50, attachVoucherTemplateId: T300.id });
  made.campaigns.push(c1.id);
  const pv1 = await MKT.previewCampaign(ctx, owner, c1.id); const pv2 = await MKT.previewCampaign(ctx, owner, c1.id);
  const expSendable = patong.filter((c) => consentLine.has(c.id) && lineIdent.has(c.id)).length;
  chk("M3.2-S2.1", `previewCampaign: audience ${patong.length} · willSend + holdout + byChannel.none = audience · byChannel.LINE ≤ ${expSendable} (ยินยอม LINE + มี LINE identity) · maxCostSatang = willSend × 30000 · expectedUsePct ตัวเลข · เรียกซ้ำผลเท่าเดิม`,
    pv1?.audience === patong.length && pv1.willSend + pv1.holdout + (pv1.byChannel?.none ?? 0) === patong.length && pv1.byChannel?.LINE <= expSendable && pv1.holdout > 0 && pv1.maxCostSatang === pv1.willSend * 30_000 && typeof pv1.expectedUsePct === "number" && JSON.stringify(pv1) === JSON.stringify(pv2),
    "ครบ + deterministic", `pv=${JSON.stringify(pv1)} expLine=${expSendable}`);

  const hashPct = (cid: string) => (parseInt(sha256(`${c1.id}:${cid}`).slice(0, 8), 16) % 10000) / 100;
  const expHold = patong.filter((c) => hashPct(c.id) < 50).map((c) => c.id).sort();
  const d1 = mkDeps();
  const s1 = await MKT.sendCampaignV2(ctx, owner, c1.id, { deps: d1.deps });
  const r1 = await recips(c1.id);
  const holdIds = r1.filter((r: Any) => r.status === "HOLDOUT").map((r: Any) => r.customerId).sort();
  chk("M3.2-S2.2", `holdout 50% deterministic: ผู้รับ HOLDOUT = ชุดที่ hashPct(campaignId:customerId) < 50 เป๊ะ (${expHold.length} คน · ระหว่าง 10–30) · HOLDOUT ไม่ถูกส่ง (deps.line ไม่ถูกเรียก) · ไม่ได้ voucher · ผลส่ง {holdout ${expHold.length}}`,
    JSON.stringify(holdIds) === JSON.stringify(expHold) && expHold.length >= 10 && expHold.length <= 30 && s1?.holdout === expHold.length && !d1.calls.line.some((c) => expHold.includes(c.customerId)) && (await P.voucher.count({ where: { customerId: { in: expHold }, origin: "CAMPAIGN", originRef: { path: ["campaignId"], equals: c1.id } } })) === 0,
    `${expHold.length}`, `hold=${holdIds.length} match=${JSON.stringify(holdIds) === JSON.stringify(expHold)} s1=${JSON.stringify(s1)} lineCallsHold=${d1.calls.line.filter((c) => expHold.includes(c.customerId)).length}`);

  const c2 = await MKT.createCampaignV2(ctx, owner, { name: `A/B ${tag}`, segmentId: seg.id, channels: ["LINE", "EMAIL"], content, variantB: { ...content, line: "ข้อความ B {ชื่อ} {voucher}" }, holdoutPct: 0 });
  made.campaigns.push(c2.id);
  const d2 = mkDeps();
  await MKT.sendCampaignV2(ctx, owner, c2.id, { deps: d2.deps });
  const r2 = await recips(c2.id);
  const vA = r2.filter((r: Any) => r.variant === "A").length; const vB = r2.filter((r: Any) => r.variant === "B").length;
  const expB = patong.filter((c) => parseInt(sha256(`${c2.id}:v:${c.id}`).slice(0, 2), 16) % 2 === 1).map((c) => c.id).sort();
  const actB = r2.filter((r: Any) => r.variant === "B").map((r: Any) => r.customerId).sort();
  const sentB = d2.calls.line.filter((c) => expB.includes(c.customerId));
  chk("M3.2-S2.3", `A/B: ผู้รับทุกคนมี variant A หรือ B (${vA}/${vB} · ทั้งคู่ > 0) · ชุด B = hash(campaignId:v:customerId) ไบต์แรกคี่ เป๊ะ · ข้อความที่ส่งให้ B คือเนื้อหา B ('ข้อความ B') · holdout 0 → ไม่มี HOLDOUT`,
    vA + vB === r2.length && vA > 0 && vB > 0 && JSON.stringify(actB) === JSON.stringify(expB) && sentB.length > 0 && sentB.every((c) => /ข้อความ B/.test(c.body ?? c.text ?? c.message ?? "")) && !r2.some((r: Any) => r.status === "HOLDOUT"),
    "A/B deterministic", `A=${vA} B=${vB} match=${JSON.stringify(actB) === JSON.stringify(expB)} sentB=${sentB.length}/${sentB.filter((c) => /ข้อความ B/.test(c.body ?? c.text ?? c.message ?? "")).length} sample=${JSON.stringify(sentB[0]).slice(0, 120)}`);

  const c3 = await MKT.createCampaignV2(ctx, owner, { name: `ไม่มี B ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 });
  made.campaigns.push(c3.id);
  const pv3a = await MKT.previewCampaign(ctx, owner, c3.id); const pv3b = await MKT.previewCampaign(ctx, owner, c3.id);
  const d3 = mkDeps(); await MKT.sendCampaignV2(ctx, owner, c3.id, { deps: d3.deps });
  const r3 = await recips(c3.id);
  chk("M3.2-S2.4", "ไม่มี variantB → ทุกคน variant A · ไม่มี Math.random ใน campaigns.ts · preview ก่อนส่ง = จำนวนหลังส่ง (willSend = SENT + FAILED)", r3.every((r: Any) => r.variant === "A") && !/Math\.random/.test(read("src/lib/modules/marketing/campaigns.ts")) && pv3a.willSend === pv3b.willSend && pv3a.willSend === r3.filter((r: Any) => r.status === "SENT" || r.status === "FAILED").length, "A ล้วน", `A=${r3.filter((r: Any) => r.variant === "A").length}/${r3.length} rnd=${/Math\.random/.test(read("src/lib/modules/marketing/campaigns.ts"))} pv=${pv3a?.willSend} sent=${r3.filter((r: Any) => r.status === "SENT" || r.status === "FAILED").length}`);

  // ═══ S3 consent ณ เวลาส่ง ═══
  const sentLine1 = r1.filter((r: Any) => r.status === "SENT" && r.channel === "LINE").map((r: Any) => r.customerId);
  const skipped1 = r1.filter((r: Any) => r.status === "SKIPPED");
  chk("M3.2-S3.1", "ช่องทาง LINE อย่างเดียว: ผู้รับ SENT ทุกคนยินยอม LINE + มี LINE identity · คนที่ไม่ยินยอม/ไม่มี LINE (นอก holdout) → SKIPPED reason ไทย · SENT + SKIPPED + HOLDOUT + FAILED = audience",
    sentLine1.length > 0 && sentLine1.every((id: string) => consentLine.has(id) && lineIdent.has(id)) && skipped1.every((r: Any) => /[ก-๙]/.test(r.error ?? "")) && skipped1.length === patong.filter((c) => !expHold.includes(c.id) && !(consentLine.has(c.id) && lineIdent.has(c.id))).length && r1.length === patong.length,
    "consent ครบ", `sent=${sentLine1.length} skipped=${skipped1.length}/${patong.filter((c) => !expHold.includes(c.id) && !(consentLine.has(c.id) && lineIdent.has(c.id))).length} total=${r1.length}/${patong.length} err=${skipped1[0]?.error}`);

  const target = patong.find((c) => consentLine.has(c.id) && lineIdent.has(c.id) && !expHold.includes(c.id))!;
  const cons0 = (await PV.getConsents(mctx, target.id)).find((c: Any) => c.channel === "LINE")?.granted;
  await PV.setConsent(mctx, owner, target.id, { channel: "LINE", granted: false, source: "STAFF" });
  restore.push(() => PV.setConsent(mctx, owner, target.id, { channel: "LINE", granted: !!cons0, source: "STAFF" }));
  const c4 = await MKT.createCampaignV2(ctx, owner, { name: `consent ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 });
  made.campaigns.push(c4.id);
  const d4 = mkDeps(); await MKT.sendCampaignV2(ctx, owner, c4.id, { deps: d4.deps });
  const rt = (await recips(c4.id)).find((r: Any) => r.customerId === target.id);
  chk("M3.2-S3.2", "ถอนยินยอม LINE ของสมาชิกที่เคยส่งได้ก่อนส่งแคมเปญใหม่ → คนนั้น SKIPPED (reason ไทย) ไม่ถูกส่ง (consent ณ เวลาส่ง ไม่ใช่ตอนสร้าง)", rt?.status === "SKIPPED" && /[ก-๙]/.test(rt.error ?? "") && !d4.calls.line.some((c) => c.customerId === target.id), "SKIPPED", `st=${rt?.status} err=${rt?.error} called=${d4.calls.line.some((c) => c.customerId === target.id)}`);

  const emailOnly = patong.find((c) => !consentLine.has(c.id) && !!c.email)!;
  await PV.setConsent(mctx, owner, emailOnly.id, { channel: "EMAIL", granted: true, source: "STAFF" });
  restore.push(() => P.memberConsent.deleteMany({ where: { customerId: emailOnly.id, channel: "EMAIL" } }));
  const noneAt = patong.find((c) => !consentLine.has(c.id) && c.id !== emailOnly.id)!;
  const c5 = await MKT.createCampaignV2(ctx, owner, { name: `fallback ${tag}`, segmentId: seg.id, channels: ["LINE", "EMAIL", "SMS", "PUSH"], content, holdoutPct: 0 });
  made.campaigns.push(c5.id);
  const d5 = mkDeps(); await MKT.sendCampaignV2(ctx, owner, c5.id, { deps: d5.deps });
  const r5 = await recips(c5.id);
  const rEmail = r5.find((r: Any) => r.customerId === emailOnly.id); const rNone = r5.find((r: Any) => r.customerId === noneAt.id);
  chk("M3.2-S3.3", "หลายช่องทาง [LINE, EMAIL, SMS, PUSH]: คนไม่มี LINE แต่ยินยอมอีเมล → SENT channel EMAIL (deps.email ถูกเรียกด้วยอีเมลของเขา) · คนไม่ยินยอมช่องไหนเลย → SKIPPED · SMS ไม่มี provider/ไม่ยินยอม → ไม่ถูกเรียก",
    rEmail?.status === "SENT" && rEmail.channel === "EMAIL" && d5.calls.email.some((c) => c.customerId === emailOnly.id && (c.to === emailOnly.email || c.email === emailOnly.email)) && rNone?.status === "SKIPPED" && !d5.calls.sms.some((c) => c.customerId === noneAt.id), "fallback อีเมล", `email=${rEmail?.status}/${rEmail?.channel}/${d5.calls.email.length} none=${rNone?.status} sms=${d5.calls.sms.length}`);

  // ═══ S4 voucher แนบ ═══
  const sentIds1 = r1.filter((r: Any) => r.status === "SENT").map((r: Any) => r.customerId);
  const vouchers1 = await P.voucher.findMany({ where: { tenantId: tid, origin: "CAMPAIGN", originRef: { path: ["campaignId"], equals: c1.id } } });
  const sentMsg = d1.calls.line.find((c) => sentIds1.includes(c.customerId));
  const vOfSent = vouchers1.find((v: Any) => v.customerId === sentMsg?.customerId);
  chk("M3.2-S4.1", `แนบ voucher ฿300: ผู้รับ SENT ทุกคนได้ voucher origin CAMPAIGN originRef.campaignId (${sentIds1.length} ใบ) · MktRecipient.voucherId ชี้ใบนั้น · ข้อความที่ส่งแทน {voucher} ด้วยรหัส V- ของคนนั้น และ {ชื่อ} ไม่เหลือ · SKIPPED/HOLDOUT ไม่ได้ใบ`,
    vouchers1.length === sentIds1.length && sentIds1.every((id: string) => vouchers1.some((v: Any) => v.customerId === id)) && r1.filter((r: Any) => r.status === "SENT").every((r: Any) => !!r.voucherId && vouchers1.some((v: Any) => v.id === r.voucherId)) && !!vOfSent && new RegExp(vOfSent.code).test(sentMsg?.body ?? sentMsg?.text ?? sentMsg?.message ?? "") && !/\{ชื่อ\}|\{voucher\}/.test(sentMsg?.body ?? sentMsg?.text ?? sentMsg?.message ?? "") && !vouchers1.some((v: Any) => !sentIds1.includes(v.customerId)),
    `${sentIds1.length} ใบ`, `v=${vouchers1.length} msg=${JSON.stringify(sentMsg).slice(0, 160)} code=${vOfSent?.code}`);

  const d1b = mkDeps();
  const s1b = await MKT.sendCampaignV2(ctx, owner, c1.id, { deps: d1b.deps });
  const vouchers1b = await P.voucher.count({ where: { tenantId: tid, origin: "CAMPAIGN", originRef: { path: ["campaignId"], equals: c1.id } } });
  chk("M3.2-S4.2", "ส่งซ้ำแคมเปญเดิม: ไม่ส่งซ้ำคนที่ SENT (deps.line 0 ครั้ง) · voucher ไม่ออกซ้ำ (จำนวนเท่าเดิม) · ผู้รับไม่ถูกสร้างซ้ำ (unique campaign+customer) · ผล {sent 0}", d1b.calls.line.length === 0 && vouchers1b === vouchers1.length && (await recips(c1.id)).length === patong.length && s1b?.sent === 0, "idempotent", `calls=${d1b.calls.line.length} v=${vouchers1b}/${vouchers1.length} n=${(await recips(c1.id)).length} s=${JSON.stringify(s1b)}`);

  // ═══ S5 track open / use ═══
  const rSent = r1.find((r: Any) => r.status === "SENT");
  const o1 = await MKT.trackOpen(tid, rSent.id); const o2 = await MKT.trackOpen(tid, rSent.id);
  const rOpened = await P.mktRecipient.findUnique({ where: { id: rSent.id } });
  chk("M3.2-S5.1", "trackOpen(recipient) → openedAt ตั้งครั้งแรก · ครั้งที่ 2 ไม่เปลี่ยน (เวลาเดิม) · route /api/m/track/o/[token] (pixel gif) มีจริง", o1?.opened === true && !!rOpened?.openedAt && o2?.opened === false && existsSync("src/app/api/m/track/o/[token]/route.ts"), "openedAt ครั้งเดียว", `o1=${JSON.stringify(o1)} o2=${JSON.stringify(o2)} route=${existsSync("src/app/api/m/track/o/[token]/route.ts")}`);

  const vUse = vouchers1.find((v: Any) => v.customerId === rSent.customerId);
  await V.redeem(mctx, { voucherId: vUse.id, customerId: rSent.customerId, saleId: `qc32-sale-${tag}`, discountSatang: 30_000 });
  await drain();
  const rUsed = await P.mktRecipient.findUnique({ where: { id: rSent.id } });
  chk("M3.2-S5.2", "voucher ของแคมเปญถูกใช้ (voucher.used originRef.campaignId) → consumer → recipient.usedAt + saleId · CampaignVariantStat.used +1", !!rUsed?.usedAt && rUsed.saleId === `qc32-sale-${tag}` && ((await P.campaignVariantStat.findFirst({ where: { campaignId: c1.id, variant: rUsed.variant ?? "A" } }))?.used ?? 0) >= 1, "usedAt", `used=${rUsed?.usedAt} sale=${rUsed?.saleId} stat=${JSON.stringify(await P.campaignVariantStat.findFirst({ where: { campaignId: c1.id, variant: rUsed?.variant ?? "A" } }))}`);

  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const rSent2 = r1.filter((r: Any) => r.status === "SENT" && r.id !== rSent.id);
  const rA = rSent2[0]; const rOld = rSent2[1];
  await P.mktRecipient.update({ where: { id: rOld.id }, data: { sentAt: new Date(Date.now() - 40 * 86_400_000) } });
  const saleA = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberSystemId: SYS, memberId: rA.customerId, idempotencyKey: `qc32-${tag}-a`, lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 150_000 }], payMethods: [{ type: "CASH", amountSatang: 150_000 }] }).catch(async () => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberId: rA.customerId, idempotencyKey: `qc32-${tag}-a`, lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 150_000 }], payMethods: [{ type: "CASH", amountSatang: 135_000 }] }));
  made.sales.push(saleA.saleId);
  const saleOld = await pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberSystemId: SYS, memberId: rOld.customerId, idempotencyKey: `qc32-${tag}-old`, lines: [{ name: "เติมอากาศ", qty: 1, unitPriceSatang: 20_000 }], payMethods: [{ type: "CASH", amountSatang: 20_000 }] }).catch(async () => pos.createSale({ tenantId: tid, unitId: E.units.patong, systemId: scope.systems.POS, pointSystemId: scope.systems.POINT, memberId: rOld.customerId, idempotencyKey: `qc32-${tag}-old`, lines: [{ name: "เติมอากาศ", qty: 1, unitPriceSatang: 20_000 }], payMethods: [{ type: "CASH", amountSatang: 18_000 }] }));
  made.sales.push(saleOld.saleId);
  await drain();
  const rA2 = await P.mktRecipient.findUnique({ where: { id: rA.id } }); const rOld2 = await P.mktRecipient.findUnique({ where: { id: rOld.id } });
  chk("M3.2-S5.3", "pos.sale.paid ของผู้รับ SENT ภายใน 30 วัน → usedAt + saleId + saleSatang = ยอดบิล (บิลแรกเท่านั้น) · ผู้รับที่ sentAt เก่ากว่า 30 วัน → ไม่นับ (usedAt null)", !!rA2?.usedAt && rA2.saleId === saleA.saleId && Number(rA2.saleSatang) === saleA.grandTotalSatang && rOld2?.usedAt === null, "นับใน 30 วัน", `a=${rA2?.usedAt}/${rA2?.saleId === saleA?.saleId}/${rA2?.saleSatang} old=${rOld2?.usedAt}`);

  // ═══ S6 เพดาน ═══
  await prisma.tenant.update({ where: { id: tid }, data: { limits: { ...((tenant0?.limits as Any) ?? {}), member: { ...(((tenant0?.limits as Any) ?? {}).member ?? {}), messagesPerDay: 3 } } } });
  const c6 = await MKT.createCampaignV2(ctx, owner, { name: `เพดาน ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 });
  made.campaigns.push(c6.id);
  const pv6 = await MKT.previewCampaign(ctx, owner, c6.id);
  const eCap = await fails(() => MKT.sendCampaignV2(ctx, owner, c6.id, { deps: mkDeps().deps }));
  chk("M3.2-S6.1", "เพดาน Tenant.limits.member.messagesPerDay = 3 (วันนี้ส่งไปแล้วหลายสิบ) → preview บอก remainingToday/overCap · send → throw ไทย LIMIT ไม่สร้าง recipient", typeof pv6?.remainingToday === "number" && pv6.remainingToday <= 3 && pv6.overCap === true && thai(eCap) && /LIMIT/.test(eCap?.message ?? "") && (await recips(c6.id)).length === 0, "throw LIMIT", `pv=${JSON.stringify({ rem: pv6?.remainingToday, over: pv6?.overCap })} e=${eCap?.message?.slice(0, 60)} n=${(await recips(c6.id)).length}`);
  await prisma.tenant.update({ where: { id: tid }, data: { limits: tenant0?.limits ?? {} } });
  const eHold = await fails(() => MKT.createCampaignV2(ctx, owner, { name: "x", segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 80 }));
  const eNoCh = await fails(() => MKT.createCampaignV2(ctx, owner, { name: "x", segmentId: seg.id, channels: [], content, holdoutPct: 0 }));
  const eThana = await fails(() => MKT.createCampaignV2(ctx, thana, { name: "x", segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 }));
  const cPook = await MKT.createCampaignV2(ctx, pook, { name: `ปุ๊ก ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 });
  made.campaigns.push(cPook.id);
  chk("M3.2-S6.2", "ตรวจ input: holdoutPct 80 (> 50) → throw ไทย · channels ว่าง → throw · thana (ไม่มี promo.manage) → throw · ปุ๊ก (marketing.campaign.create) สร้างได้ · เพดาน campaignsPerMonth อ้างในโค้ด", thai(eHold) && thai(eNoCh) && !!eThana && !!cPook?.id && /campaignsPerMonth/.test(read("src/lib/modules/marketing/campaigns.ts")), "ตรวจครบ", `hold=${thai(eHold)} ch=${thai(eNoCh)} thana=${!!eThana} pook=${!!cPook?.id}`);

  // ═══ S7 cancel ═══
  const c7 = await MKT.createCampaignV2(ctx, owner, { name: `ตั้งเวลา ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0, scheduledAt: new Date(Date.now() + 2 * 3600_000) });
  made.campaigns.push(c7.id);
  const sch = await MKT.sendCampaignV2(ctx, owner, c7.id, { deps: mkDeps().deps });
  const cn = await MKT.cancelCampaign(ctx, owner, c7.id);
  const cron = read("src/lib/platform/cron.ts");
  const dueRes = await MKT.sendDueCampaigns?.({ now: new Date(Date.now() + 3 * 3600_000) }).catch(() => null);
  chk("M3.2-S7.1", "ตั้งเวลา 2 ชม. ข้างหน้า: send → status SCHEDULED ไม่ส่ง (0 recipient) · cancel → CANCELLED · cron รายชั่วโมง sendDueCampaigns ข้ามที่ CANCELLED (ยัง 0 recipient) · cron.ts มี step campaignsDue", sch?.status === "SCHEDULED" && (await recips(c7.id)).length === 0 && cn?.status === "CANCELLED" && (await camp(c7.id))?.status === "CANCELLED" && (await recips(c7.id)).length === 0 && /campaignsDue|sendDueCampaigns/.test(cron), "SCHEDULED → CANCELLED", `sch=${JSON.stringify(sch)} cn=${JSON.stringify(cn)} n=${(await recips(c7.id)).length} due=${JSON.stringify(dueRes)} cron=${/campaignsDue|sendDueCampaigns/.test(cron)}`);

  const c8 = await MKT.createCampaignV2(ctx, owner, { name: `ล้มกลางทาง ${tag}`, segmentId: seg.id, channels: ["LINE"], content, holdoutPct: 0 });
  made.campaigns.push(c8.id);
  let n8 = 0;
  const d8 = { line: async (r: Any) => { n8 += 1; if (n8 > 2) throw new Error("STOP-QC"); return { ok: true }; } };
  const s8 = await MKT.sendCampaignV2(ctx, owner, c8.id, { deps: d8 }).catch((e: Error) => ({ error: e.message }));
  const r8 = await recips(c8.id);
  const cn8 = await MKT.cancelCampaign(ctx, owner, c8.id);
  const r8b = await recips(c8.id);
  chk("M3.2-S7.2", "ส่งแล้ว provider ล้มตั้งแต่คนที่ 3: 2 คนแรก SENT · ที่เหลือ FAILED/PENDING (ไม่ throw ทั้งก้อน · ผล {failed}) · cancel → PENDING/FAILED ที่เหลือ → SKIPPED 'ยกเลิก' · 2 คนที่ SENT คงเดิม · status CANCELLED", r8.filter((r: Any) => r.status === "SENT").length === 2 && !("error" in (s8 ?? {})) && (s8?.failed ?? 0) + (r8.filter((r: Any) => r.status === "PENDING").length) >= 1 && cn8?.status === "CANCELLED" && r8b.filter((r: Any) => r.status === "SENT").length === 2 && !r8b.some((r: Any) => r.status === "PENDING" || r.status === "FAILED") && r8b.filter((r: Any) => r.status === "SKIPPED").every((r: Any) => /ยกเลิก/.test(r.error ?? "")), "หยุดคิว ไม่ถอนที่ส่งแล้ว", `s8=${JSON.stringify(s8)} sent=${r8.filter((r: Any) => r.status === "SENT").length} after=${JSON.stringify(r8b.reduce((a: Any, r: Any) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}))}`);

  // ═══ S8 stats ═══
  const st = await MKT.campaignStats(ctx, owner, c1.id);
  const rr = await recips(c1.id);
  const cnt = (f: (r: Any) => boolean) => rr.filter(f).length;
  const vA1 = st?.variants?.find((v: Any) => v.variant === "A"); const vH = st?.variants?.find((v: Any) => v.variant === "HOLDOUT");
  chk("M3.2-S8.1", "campaignStats c1: variant A {sent = SENT, opened = openedAt≠null, used = usedAt≠null, saleSatang = Σ saleSatang} · HOLDOUT {sent 0, used = ผู้รับ holdout ที่ซื้อใน 30 วัน} · total.audience = ผู้รับทั้งหมด", vA1?.sent === cnt((r) => r.variant === "A" && r.status === "SENT") && vA1.opened === cnt((r) => r.variant === "A" && !!r.openedAt) && vA1.used === cnt((r) => r.variant === "A" && !!r.usedAt) && Number(vA1.saleSatang) === rr.filter((r: Any) => r.variant === "A" && r.saleSatang).reduce((n: number, r: Any) => n + Number(r.saleSatang), 0) && vH?.sent === 0 && st.total?.audience === rr.length, "นับตรง", `A=${JSON.stringify(vA1)} H=${JSON.stringify(vH)} exp=${JSON.stringify({ sent: cnt((r) => r.variant === "A" && r.status === "SENT"), opened: cnt((r) => r.variant === "A" && !!r.openedAt), used: cnt((r) => r.variant === "A" && !!r.usedAt) })}`);
  const usedVoucherSatang = (await P.voucher.findMany({ where: { tenantId: tid, origin: "CAMPAIGN", originRef: { path: ["campaignId"], equals: c1.id }, status: "USED" } })).reduce((n: number, v: Any) => n + v.value, 0);
  chk("M3.2-S8.2", "สูตร: costSatang(A) = Σ มูลค่า voucher ที่ USED (30000) + ค่าส่ง LINE 0 · roi = (saleSatang − costSatang)/max(costSatang,1) · usePct = used/sent×100 · uplift.usePct = usePct(A+B) − usePct(HOLDOUT)", vA1?.costSatang === usedVoucherSatang && Math.abs(vA1.roi - (Number(vA1.saleSatang) - vA1.costSatang) / Math.max(vA1.costSatang, 1)) < 0.001 && Math.abs(vA1.usePct - (vA1.sent ? (vA1.used / vA1.sent) * 100 : 0)) < 0.01 && typeof st.uplift?.usePct === "number" && Math.abs(st.uplift.usePct - (vA1.usePct - (vH?.usePct ?? 0))) < 0.01, "สูตรตรง", `cost=${vA1?.costSatang}/${usedVoucherSatang} roi=${vA1?.roi} use=${vA1?.usePct} uplift=${JSON.stringify(st?.uplift)}`);
  const cvs = await P.campaignVariantStat.findMany({ where: { campaignId: c1.id } });
  const list = await MKT.listCampaignsV2(ctx, owner);
  const rowC1 = list?.find((c: Any) => c.id === c1.id);
  chk("M3.2-S8.3", "CampaignVariantStat มีแถว A และ HOLDOUT ของ c1 (ค่าตรง stats) · MktCampaign.stats Json สรุป {sent, opened, used, saleSatang, roi} · listCampaignsV2 แถว c1 มี sent/opened/used/saleSatang/costSatang/roi/status", cvs.some((s: Any) => s.variant === "A" && s.sent === vA1?.sent && s.used === vA1?.used) && cvs.some((s: Any) => s.variant === "HOLDOUT") && !!(await camp(c1.id))?.stats?.sent !== undefined && rowC1 && ["sent", "opened", "used", "saleSatang", "costSatang", "roi", "status"].every((k) => k in rowC1), "แถว stat + list", `cvs=${JSON.stringify(cvs.map((s: Any) => [s.variant, s.sent, s.used]))} stats=${JSON.stringify((await camp(c1.id))?.stats)} row=${JSON.stringify(rowC1).slice(0, 160)}`);

  // ═══ S9 UI / ภาพ ═══
  const pages = { list: read("src/app/app/sys/[id]/member/campaigns/page.tsx"), neu: read("src/app/app/sys/[id]/member/campaigns/new/page.tsx"), detail: read("src/app/app/sys/[id]/member/campaigns/[campaignId]/page.tsx") };
  const act = read("src/lib/modules/marketing/campaigns-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /campaign/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["campaigns-page", "campaigns-table", "campaign-row-", "campaigns-add", "campaign-new", "campaign-step-segment", "campaign-step-message", "campaign-step-schedule", "campaign-segment-pick", "campaign-count", "campaign-channel-tabs", "campaign-message", "campaign-voucher", "campaign-ab-toggle", "campaign-holdout", "campaign-preview-line", "campaign-estimate", "campaign-test-send", "campaign-save-draft", "campaign-send", "campaign-detail", "campaign-stats", "campaign-recipients"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["กลุ่มเป้าหมาย", "Segment builder", "ช่องทางและข้อความ", "LINE", "อีเมล", "SMS", "push", "ให้ AI ร่าง", "voucher", "คูปองโค้ด", "ทดสอบข้อความ B (A/B 50/50)", "กำหนดส่ง", "ตั้งเวลา", "กันกลุ่มเทียบ (holdout)", "ตัวอย่างหน้าจอ LINE", "ประมาณการ", "จะส่งจริง", "หัก holdout", "ต้นทุนสูงสุด", "คาดใช้สิทธิ์จริง", "ทดสอบส่งหาตัวเอง", "บันทึกร่าง", "ส่งแคมเปญ", "ส่งเดือนนี้", "ใช้สิทธิ์", "ยอดที่เกิด", "ต้นทุน", "ROI"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const facade = read("src/lib/modules/marketing/index.ts"); const cmp = read("src/lib/modules/marketing/campaigns.ts");
  chk("M3.2-S9.1", "หน้า campaigns · new · [campaignId] requireTenant + สิทธิ์ · actions 'use server' gate promo.manage · testid 23 · ป้ายภาพ 21/07 ครบ · nav campaigns → ready · facade export createCampaignV2/updateCampaignV2/getCampaign/listCampaignsV2/previewCampaign/sendCampaignV2/sendDueCampaigns/cancelCampaign/campaignStats/trackOpen/trackUseFromVoucher/trackUseFromSale · campaigns.ts import ข้ามโมดูลผ่าน facade เท่านั้น · ไม่มี any/อีโมจิ/hex",
    Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /["']use server["']/.test(act) && /promo\.manage/.test(act) && missingT.length === 0 && missingL.length === 0 && /key:\s*"campaigns"[^\n]*status:\s*"ready"/.test(read("src/lib/modules/member/nav.ts")) && ["createCampaignV2", "updateCampaignV2", "getCampaign", "listCampaignsV2", "previewCampaign", "sendCampaignV2", "sendDueCampaigns", "cancelCampaign", "campaignStats", "trackOpen", "trackUseFromVoucher", "trackUseFromSale"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && !/@\/lib\/modules\/(member|voucher|coupon|chat|point)\/(?!index)[a-z-]+"/.test(cmp) && !/:\s*any\b/.test(cmp + act) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")),
    "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"} facade-missing=${["createCampaignV2", "previewCampaign", "sendCampaignV2", "campaignStats", "trackOpen"].filter((f) => !new RegExp(`\\b${f}\\b`).test(facade)).join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.2`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.2-S9.2", "ภาพ 21: campaign-new-owner desktop+mobile 200 ไม่ล้น (3 ขั้น + แผงขวา) · campaigns-owner 200", ok("owner", "campaign-new-owner", "desktop") && ok("owner", "campaign-new-owner", "mobile") && ok("owner", "campaigns-owner", "desktop"), "200 ×3", `${r("owner", "campaign-new-owner", "desktop")?.status}/${r("owner", "campaign-new-owner", "mobile")?.status}/${r("owner", "campaigns-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "campaign-new-owner", "desktop")?.missing)}`);
  chk("M3.2-S9.3", "ภาพ 07 ล่าง/รายละเอียด: campaign-detail-owner 200 (สถิติ variant + holdout + uplift + ผู้รับ) · thana 200 อ่านอย่างเดียว · noperm 404", ok("owner", "campaign-detail-owner", "desktop") && ok("thana", "campaigns-thana", "desktop") && r("noperm", "campaigns-noperm", "desktop")?.status === 404, "200/200/404", `${r("owner", "campaign-detail-owner", "desktop")?.status}/${r("thana", "campaigns-thana", "desktop")?.status}/${r("noperm", "campaigns-noperm", "desktop")?.status}`);
  chk("M3.2-S9.4", "🔴 parity ภาพ 21 + 07 (ล่าง) — Fable ตรวจด้วยตา · wo-notes/member-M3.2.md มี 'PARITY: ผ่าน'", /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M3.2.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");

  // ═══ S10 events / consumer / fitness ═══
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  const obS = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "campaign.sent", payload: { path: ["campaignId"], equals: c1.id } } });
  chk("M3.2-S10.1", "event campaign.sent {campaignId, sent, holdout, variants} หลังส่ง c1 · ลง 3 ทะเบียน · drain แล้ว DONE", !!obS && obS.payload.sent === sentIds1.length && obS.payload.holdout === expHold.length && in3("campaign.sent") && obS.status === "DONE", "campaign.sent", `ob=${JSON.stringify(obS?.payload)} reg=${in3("campaign.sent")} st=${obS?.status}`);
  const bridges = read("src/lib/member-bridges.ts");
  chk("M3.2-S10.2", "consumer: voucher.used → marketing.trackUseFromVoucher (outbox-consumers หรือ member-bridges) · pos.sale.paid → marketing.trackUseFromSale ใน member-bridges (ครอบ try/catch) · ไม่มี event voucher./pos.sale. ค้าง", /trackUseFromVoucher/.test(consumers + bridges) && /trackUseFromSale/.test(bridges) && (await P.outboxEvent.count({ where: { tenantId: tid, type: { in: ["voucher.used", "pos.sale.paid"] }, status: { not: "DONE" } } })) === 0, "wired", `v=${/trackUseFromVoucher/.test(consumers + bridges)} s=${/trackUseFromSale/.test(bridges)} stuck=${await P.outboxEvent.count({ where: { tenantId: tid, type: { in: ["voucher.used", "pos.sale.paid"] }, status: { not: "DONE" } } })}`);
  const fit = read("scripts/fitness.mts"); const chatFacade = read("src/lib/modules/chat/index.ts"); const smsSrc = read("src/lib/core/sms.ts");
  chk("M3.2-S10.3", "fitness F2 มี marketing→member/voucher/coupon/chat · chat/index.ts facade export pushToContact · core/sms.ts provider interface (ไม่มี env = null provider) · marketing/segments.ts ยังผ่าน facade member", ["marketing→member", "marketing→voucher", "marketing→coupon", "marketing→chat"].every((e) => fit.includes(`"${e}"`)) && /pushToContact/.test(chatFacade) && smsSrc.length > 0 && /provider|Provider/.test(smsSrc) && /@\/lib\/modules\/member"/.test(read("src/lib/modules/marketing/segments.ts")), "ครบ", `edges=${["marketing→member", "marketing→voucher", "marketing→coupon", "marketing→chat"].map((e) => fit.includes(`"${e}"`)).join("/")} chat=${/pushToContact/.test(chatFacade)} sms=${smsSrc.length > 0}`);
} catch (e) {
  console.error("💥", e);
  chk("M3.2-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.campaigns.length) { await d(() => P.campaignVariantStat.deleteMany({ where: { campaignId: { in: made.campaigns } } })); await d(() => P.mktRecipient.deleteMany({ where: { campaignId: { in: made.campaigns } } })); await d(() => P.mktCampaign.deleteMany({ where: { id: { in: made.campaigns } } })); }
  if (made.segments.length) await d(() => P.memberSegment.deleteMany({ where: { id: { in: made.segments } } }));
  if (made.sales.length) {
    const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, refId: { in: made.sales } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
    await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }));
    for (const l of leds) await d(() => P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }));
    await d(() => P.accountJournalLine.deleteMany({ where: { entry: { refType: "PosSale", refId: { in: made.sales } } } })); await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } })); await d(() => P.accountDocument.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    const sold = await prisma.posSale.findMany({ where: { id: { in: made.sales } }, select: { memberId: true, grandTotalSatang: true } }).catch(() => [] as Any[]);
    for (const s of sold) if (s.memberId) await d(() => prisma.customer.update({ where: { id: s.memberId! }, data: { totalSpentSatang: { decrement: s.grandTotalSatang } } }));
    await d(() => P.stampEvent.deleteMany({ where: { refType: "SALE", refId: { in: made.sales } } }));
    await d(() => P.posPayment.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } }));
  }
  await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, module: "voucher", refId: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucher.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.vouchers] } } }));
  await d(() => P.voucherTemplate.deleteMany({ where: { tenantId: tid, id: { notIn: [...before.templates] } } }));
  for (const t of ["campaign.", "voucher.", "pos.sale.", "point.", "stamp.", "member."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
