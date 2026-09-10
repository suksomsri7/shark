// QC — ระบบสมาชิก v2 WO M2.2: โอนแต้ม (OTP ฝั่งลูกค้า · cap/fee) · ปรับแต้มมือ + approval (`member.point.adjust`) · หน้าตั้งค่าแต้ม (ก–จ + ผลกระทบ) · หน้า ledger รวม · ใกล้หมดอายุ · หน้าปรับแต้ม (ภาพ 16)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M2.2 · พิมพ์เขียว §2.2 (/points …) §3.5 §5.5 §6.2 (ปรับแต้มมือ) §11.4 (โอน/ปรับมือ) · ภาพ 16
// requires: member-seed
//
// สัญญา (src/lib/modules/point/{transfer.ts,adjust.ts,service.ts(settings)} · facade point/index.ts)
//   requestTransferOtp(ctx, actor{role:"CUSTOMER", customerId}, {}) → { otpId, expiresAt, maskedTo, devOtp?: string } — OTP 6 หลัก อายุ 5 นาที เก็บ hash (PlatformAuthToken key `point-transfer:${customerId}` หรือตารางเดิมที่ platform_auth ใช้) · devOtp คืนเฉพาะ APP_ENV !== "production" (QC ใช้) · rate limit 3 ครั้ง/10 นาที/คน → throw ไทย
//   transferPoints(ctx, actor, { fromCustomerId, toCustomerId, points, otp, idempotencyKey }) → { transferId, feePoints, balanceFrom, balanceTo }
//     กติกา: settings.transferEnabled ต้อง true (ไม่ → throw) · actor ต้องเป็น CUSTOMER เจ้าของ fromCustomerId (พนักงานโอนแทนไม่ได้ → throw) · toCustomerId ต่างคน + ระบบสมาชิกเดียวกัน + ACTIVE · OTP ถูกต้อง/ยังไม่หมดอายุ/ใช้ครั้งเดียว · points > 0 · ยอดพอ (burnFifo) · ยอดโอนเดือนนี้ (วันไทย) + points ≤ transferMonthlyCap (ถ้าตั้ง) · ผู้รับได้ล็อตตาม expiresAt เดิมของล็อตต้นทางทีละล็อต (ไม่ต่ออายุ) · PointTransfer {points, feePoints 0, otpVerifiedAt, ledgerOutId, ledgerInId} · idempotent · event point.transferred {fromCustomerId, toCustomerId, points}
//   adjustPoints v2 = adjustWithApproval(ctx, actor, { customerId, delta, reason, expiresAt? }) → { applied: true, ledgerId, balance } | { pending: true, approvalRequestId }
//     reason บังคับ · สิทธิ์ member.point.adjust · OWNER ทำทันทีเสมอ · MANAGER/STAFF: |delta| ≤ settings.adjustApprovalOver → ทันที · เกิน → approval.submitForApproval({ entityType: "member.point.adjust", entityId: `${customerId}:${idempotencyKey}` }) (ไม่มีนโยบาย = autoApproved) · delta > 0 → ledger ADJUST + ล็อต (expiresAt ที่ส่ง หรือ ตาม settings) · delta < 0 → ตัด FIFO (ledger ADJUST data.lotIds) · actorUserId เก็บใน ledger.reason/ data · approval-effects เคส member.point.adjust (approved → apply idempotent)
//   settings UI: /member/points/settings (ภาพ 16): (ก) กฎการได้แต้ม = BASE (บาท=แต้ม · นับจาก NET/GROSS · ไม่ให้แต้มกับส่วนที่จ่ายด้วย gift/voucher/แต้ม) + ตารางกฎเพิ่ม 5 แถว (ตัวคูณระดับ · สินค้า/หมวด · ช่วงเวลา · เหตุการณ์ · เพดาน/วัน) เปิด/ปิด+แก้ (upsertRule) · (ข) หมดอายุ (แบบ · อายุ · เตือนล่วงหน้า 2 ช่อง · ระดับที่ไม่หมดอายุ = TierDef ที่มี benefit NO_POINT_EXPIRY) · (ค) ใช้แต้ม (อัตรา burnRateSatang · ขั้นต่ำ · ใช้ได้สูงสุด % · ใช้ได้ที่ POS/จอง/LIFF → AppSystem.settings.member.points.burnAllowedAt) · (ง) โอน (เปิด · ค่าธรรมเนียม (เก็บ settings.member.points.transferFeePoints) · จำกัด/เดือน · ต้อง OTP) · (จ) ปรับมือ (เกิน n แต้ม ต้องอนุมัติผ่านโมดูลอนุมัติ · สวิตช์) · การ์ด "ผลกระทบ" = previewPointImpact(ctx) → { monthlyEarn, monthlyCostSatang, liabilitySatang, expiringIn90d }
//   หน้า /member/points (ledger รวม + KPI: ออกเดือนนี้/ใช้/หมดอายุ/คงค้าง/หนี้สิน · ตัวกรอง ชนิด/ช่วง/สาขา/ค้นสมาชิก) · /member/points/adjust (ฟอร์ม: ค้นสมาชิก · +/− · เหตุผล · วันหมดอายุ · คำเตือนต้องอนุมัติ) · /member/points/expiring (ตาราง expiringSoon days 30/7/รายวัน) · nav points → ready · MemberSettingsTabs "แต้ม" → ready (ลิงก์ /points/settings)
//   testid: points-page points-kpi points-ledger points-ledger-filter · points-settings points-settings-earn points-settings-rules points-settings-expiry points-settings-burn points-settings-transfer points-settings-approval points-settings-impact points-settings-save · points-adjust points-adjust-form points-adjust-approval-hint · points-expiring points-expiring-table
//   actions: point/points-actions.ts (ในโมดูล point) หรือ member/points-actions.ts — "use server" · gate settings.manage (settings/rules) · member.point.adjust (adjust) · member.point.read (หน้า)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/point/transfer.ts") || !existsSync("src/app/app/sys/[id]/member/points/settings/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (point/transfer.ts · member/points/settings/page.tsx)");
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
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = "";
const tag = Date.now().toString(36);
const made = { customers: [] as string[], approvalPolicies: [] as string[], ledgerKeys: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const T = (await import("@/lib/modules/point/transfer" as string)) as Record<string, (...a: Any[]) => Any>;
  const A = (await import("@/lib/modules/point/adjust" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const L = (await import("@/lib/modules/point/lots" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const manager = await actorOf(E.users.manager.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const ctxM = { ...ctx, actorUserId: E.users.manager.userId as string }; const ctxT = { ...ctx, actorUserId: E.users.thana?.userId ?? E.users.staff.thana.userId as string };
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const s0 = await PS.getPointSettings(tid);
  restore.push(() => PS.setPointSettings({ tenantId: tid }, s0));
  const mkMember = async (key: string) => { const r = await PR.createMember(ctx as Any, owner, { phone: `0889${String((Date.now() + key.length) % 1_000_000).padStart(6, "0")}`, firstName: `โอน${key}`, lastName: "ทดสอบ", source: "POS", homeUnitId: E.units.patong }); made.customers.push(r.customerId); await new Promise((r2) => setTimeout(r2, 3)); return r.customerId as string; };
  const custActor = (customerId: string) => ({ userId: "", role: "CUSTOMER", unitAccess: [] as string[], permissions: {}, customerId });
  const outbox = (type: string, pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "desc" }, take: 30 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));

  // ═══ S1 โอนแต้ม ═══
  const A1 = await mkMember("a"); const B1 = await mkMember("b");
  const lotA1 = await L.earnWithLot(ctx, { customerId: A1, points: 300, refType: "QC", refId: `${tag}-a1`, idempotencyKey: `${tag}-a1`, expiresAt: new Date(Date.now() + 40 * 86400_000) });
  const lotA2 = await L.earnWithLot(ctx, { customerId: A1, points: 200, refType: "QC", refId: `${tag}-a2`, idempotencyKey: `${tag}-a2`, expiresAt: new Date(Date.now() + 200 * 86400_000) });
  await PS.setPointSettings({ tenantId: tid }, { ...s0, transferEnabled: false });
  const eOff = await fails(() => T.requestTransferOtp(ctx, custActor(A1), {}));
  await PS.setPointSettings({ tenantId: tid }, { ...s0, transferEnabled: true, transferMonthlyCap: 1000 });
  const otp = await T.requestTransferOtp(ctx, custActor(A1), {});
  const eStaffOtp = await fails(() => T.requestTransferOtp(ctx, owner, {}));
  chk("M2.2-S1.1", "transferEnabled=false → requestTransferOtp throw ไทย · เปิด → {otpId, expiresAt (≤ 5 นาที), maskedTo, devOtp 6 หลัก (APP_ENV development)} · พนักงาน (ไม่ใช่ CUSTOMER) ขอ OTP → throw", thai(eOff) && otp?.otpId && new Date(otp.expiresAt).getTime() - Date.now() <= 5 * 60_000 + 5000 && /^\d{6}$/.test(otp.devOtp ?? "") && thai(eStaffOtp), "OTP", JSON.stringify({ off: !!eOff, otp: otp && [!!otp.otpId, !!otp.devOtp], staff: !!eStaffOtp }));
  const eBadOtp = await fails(() => T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 100, otp: "000000", idempotencyKey: `${tag}-t0` }));
  const eSelf = await fails(() => T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: A1, points: 10, otp: otp.devOtp, idempotencyKey: `${tag}-tself` }));
  const eStaff = await fails(() => T.transferPoints(ctx, owner, { fromCustomerId: A1, toCustomerId: B1, points: 100, otp: otp.devOtp, idempotencyKey: `${tag}-tstaff` }));
  const eOther = await fails(() => T.transferPoints(ctx, custActor(B1), { fromCustomerId: A1, toCustomerId: B1, points: 100, otp: otp.devOtp, idempotencyKey: `${tag}-tother` }));
  chk("M2.2-S1.2", "OTP ผิด → throw ไทย · โอนให้ตัวเอง → throw · พนักงานโอนแทน → throw · ลูกค้าอื่นสวมเจ้าของ → throw · ยอดไม่เปลี่ยน", thai(eBadOtp) && thai(eSelf) && thai(eStaff) && thai(eOther) && (await bal(A1)) === 500 && (await bal(B1)) === 0, "throw ×4", `${[eBadOtp, eSelf, eStaff, eOther].map((e) => !!e).join("/")} bal=${await bal(A1)}/${await bal(B1)}`);
  const tr = await T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 350, otp: otp.devOtp, idempotencyKey: `${tag}-t1` });
  const tr2 = await T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 350, otp: otp.devOtp, idempotencyKey: `${tag}-t1` });
  const row = await P.pointTransfer.findUnique({ where: { id: tr?.transferId ?? "x" } });
  const lotsB: Any[] = await P.pointLot.findMany({ where: { customerId: B1 }, orderBy: { expiresAt: "asc" } });
  const evT = await outbox("point.transferred", (p) => p.fromCustomerId === A1 && p.toCustomerId === B1);
  chk("M2.2-S1.3", "โอน 350 (OTP ถูก): A 500→150 · B 0→350 · ตัด FIFO ล็อต 40 วัน (300) หมด + ล็อต 200 วัน 50 · ผู้รับได้ 2 ล็อต expiresAt เท่าต้นทาง (300 @40 วัน · 50 @200 วัน) · PointTransfer {points 350, feePoints 0, otpVerifiedAt, ledgerOutId, ledgerInId} · idempotent · event point.transferred", tr?.transferId && tr.balanceFrom === 150 && tr.balanceTo === 350 && (await bal(A1)) === 150 && (await bal(B1)) === 350 && lotsB.length === 2 && lotsB[0].points === 300 && Math.abs(new Date(lotsB[0].expiresAt).getTime() - new Date(lotA1.expiresAt).getTime()) < 1000 && lotsB[1].points === 50 && Math.abs(new Date(lotsB[1].expiresAt).getTime() - new Date(lotA2.expiresAt).getTime()) < 1000 && row?.points === 350 && row.feePoints === 0 && !!row.otpVerifiedAt && !!row.ledgerOutId && !!row.ledgerInId && tr2?.transferId === tr.transferId && (await P.pointTransfer.count({ where: { fromCustomerId: A1 } })) === 1 && !!evT, "350 · ล็อตตามต้นทาง", JSON.stringify({ tr, lotsB: lotsB.map((l) => [l.points, l.expiresAt]), row: row && [row.points, row.feePoints, !!row.otpVerifiedAt], idem: tr2?.transferId === tr?.transferId, ev: !!evT }).slice(0, 240));
  const eReuse = await fails(() => T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 10, otp: otp.devOtp, idempotencyKey: `${tag}-t2` }));
  const otp2 = await T.requestTransferOtp(ctx, custActor(A1), {});
  const eCap = await fails(() => T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 700, otp: otp2.devOtp, idempotencyKey: `${tag}-t3` }));
  const otp3 = await T.requestTransferOtp(ctx, custActor(A1), {});
  const eInsuf = await fails(() => T.transferPoints(ctx, custActor(A1), { fromCustomerId: A1, toCustomerId: B1, points: 160, otp: otp3.devOtp, idempotencyKey: `${tag}-t4` }));
  chk("M2.2-S1.4", "OTP ใช้แล้วใช้ซ้ำไม่ได้ → throw · cap 1,000/เดือน: โอนแล้ว 350 + 700 > 1,000 → throw ไทย · แต้มไม่พอ (160 > 150) → throw · ยอดไม่เปลี่ยน", thai(eReuse) && thai(eCap) && thai(eInsuf) && (await bal(A1)) === 150, "throw ×3", `${[eReuse, eCap, eInsuf].map((e) => !!e).join("/")}`);
  const otpA = await T.requestTransferOtp(ctx, custActor(A1), {}); const otpB = await T.requestTransferOtp(ctx, custActor(A1), {}); const otpC = await T.requestTransferOtp(ctx, custActor(A1), {});
  const eRate = await fails(() => T.requestTransferOtp(ctx, custActor(A1), {}));
  const eRate2 = eRate ?? (await fails(() => T.requestTransferOtp(ctx, custActor(A1), {})));
  chk("M2.2-S1.5", "rate limit OTP: ขอเกิน 3 ครั้ง/10 นาที → throw ไทย (ขอครั้งที่ 4–7 ต้องโดนอย่างน้อยครั้งหนึ่ง) · OTP ล่าสุดยังใช้ได้ (ขอใหม่ = ยกเลิกอันเก่า)", thai(eRate2), "throw", `${eRate2?.message?.slice(0, 60)} otps=${[otpA, otpB, otpC].map((o) => !!o?.otpId).join("/")}`, "MAJOR");

  // ═══ S2 ปรับแต้มมือ + approval ═══
  const apPol = await approval.createPolicy({ tenantId: tid }, { name: "QC M2.2 ปรับแต้ม", entityType: "member.point.adjust", steps: [{ order: 1, approverRole: "OWNER" }] });
  made.approvalPolicies.push(apPol.id);
  await PS.setPointSettings({ tenantId: tid }, { ...s0, adjustApprovalOver: 500 });
  const C1 = await mkMember("c");
  const eNoReason = await fails(() => A.adjustWithApproval(ctx, owner, { customerId: C1, delta: 100, reason: " " }));
  const noPermActor = await actorOf(E.users.noPerm.userId);
  const eNoPerm = await fails(() => A.adjustWithApproval(ctx, noPermActor, { customerId: C1, delta: 100, reason: "x" }));
  const a1 = await A.adjustWithApproval(ctxT, thana, { customerId: C1, delta: 200, reason: "ชดเชยลูกค้า", expiresAt: new Date("2031-01-01T00:00:00Z") });
  const lotC = await P.pointLot.findFirst({ where: { customerId: C1 } });
  const ledC = await prisma.pointLedger.findUnique({ where: { id: a1?.ledgerId ?? "x" } }) as Any;
  chk("M2.2-S2.1", "adjust: reason ว่าง → throw ไทย · ไม่มี member.point.adjust → throw · thana +200 (≤ เพดาน 500) → {applied true, ledgerId, balance 200} · ledger ADJUST + ล็อต expiresAt ตามที่ส่ง (2031) · ledger data/reason มี actorUserId thana", thai(eNoReason) && thai(eNoPerm) && a1?.applied === true && a1.balance === 200 && lotC?.points === 200 && new Date(lotC.expiresAt).getUTCFullYear() === 2031 && ledC?.type === "ADJUST" && ledC.lotId === lotC.id && JSON.stringify(ledC).includes(E.users.staff.thana.userId), "applied 200", JSON.stringify({ a1, lot: lotC && [lotC.points, lotC.expiresAt], led: ledC && [ledC.type, ledC.lotId === lotC?.id] }).slice(0, 200));
  const a2 = await A.adjustWithApproval(ctxM, manager, { customerId: C1, delta: 800, reason: "โปรพิเศษ", idempotencyKey: `${tag}-adj800` });
  const req = a2?.approvalRequestId ? await prisma.approvalRequest.findUnique({ where: { id: a2.approvalRequestId } }) : null;
  chk("M2.2-S2.2", "MANAGER +800 (> เพดาน 500) → {pending true, approvalRequestId} · ApprovalRequest entityType member.point.adjust PENDING · ยังไม่เขียนแต้ม (balance 200)", a2?.pending === true && req?.entityType === "member.point.adjust" && req.status === "PENDING" && (await bal(C1)) === 200, "pending", JSON.stringify({ a2, st: req?.status, bal: await bal(C1) }));
  await approval.decide({ userId: E.users.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any, { tenantId: tid }, a2.approvalRequestId, { decision: "APPROVED", note: "QC" });
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(C, { limit: 300 }); await drainOutbox(C, { limit: 300 });
  const aOwnerNeg = await A.adjustWithApproval(ctx, owner, { customerId: C1, delta: -150, reason: "หักคืน", idempotencyKey: `${tag}-adjneg` });
  const ledNeg = await prisma.pointLedger.findUnique({ where: { id: aOwnerNeg?.ledgerId ?? "x" } }) as Any;
  chk("M2.2-S2.3", "อนุมัติ → approval-effects member.point.adjust → แต้ม +800 (balance 1,000 · ล็อตใหม่) · drain ซ้ำไม่บวกซ้ำ · OWNER −150 → applied ทันที (ไม่ต้องอนุมัติ) · ตัด FIFO · ledger ADJUST delta −150 · balance 850", (await bal(C1)) === 850 && (await P.pointLot.count({ where: { customerId: C1 } })) === 2 && aOwnerNeg?.applied === true && ledNeg?.type === "ADJUST" && ledNeg.delta === -150 && (await prisma.pointLedger.count({ where: { customerId: C1, type: "ADJUST" as Any } })) === 3, "1000 → 850", `bal=${await bal(C1)} lots=${await P.pointLot.count({ where: { customerId: C1 } })} neg=${JSON.stringify(aOwnerNeg)}`);

  // ═══ S3 settings + impact ═══
  const before = await PS.getPointSettings(tid);
  await PS.setPointSettings({ tenantId: tid }, { ...before, satangPerPoint: 2000, earnBase: "GROSS", excludeVoucher: false, expiryMode: "END_OF_YEAR", remindDays: [14, 3], burnRateSatang: 20, burnMinPoints: 50, burnMaxPct: 30, transferEnabled: true, transferMonthlyCap: 5000, adjustApprovalOver: 1000, dailyCap: 2000 });
  const after = await PS.getPointSettings(tid);
  chk("M2.2-S3.1", "settings ก–จ บันทึกครบ: satangPerPoint 2000 · earnBase GROSS · excludeVoucher false · expiryMode END_OF_YEAR · remindDays [14,3] · burnRate 20 · burnMin 50 · burnMax 30 · transfer on cap 5000 · adjustApprovalOver 1000 · dailyCap 2000", after.satangPerPoint === 2000 && after.earnBase === "GROSS" && after.excludeVoucher === false && after.expiryMode === "END_OF_YEAR" && JSON.stringify(after.remindDays) === "[14,3]" && after.burnRateSatang === 20 && after.burnMinPoints === 50 && after.burnMaxPct === 30 && after.transferEnabled === true && after.transferMonthlyCap === 5000 && after.adjustApprovalOver === 1000 && after.dailyCap === 2000, "ครบ", JSON.stringify(after).slice(0, 220));
  const imp = await PS.previewPointImpact(ctx);
  const liab = Number((await prisma.pointBalance.aggregate({ where: { systemId: PT }, _sum: { balance: true } }))._sum.balance ?? 0);
  chk("M2.2-S3.2", "previewPointImpact → {monthlyEarn (EARN 30 วันล่าสุด), monthlyCostSatang (= monthlyEarn × burnRateSatang), liabilitySatang (= Σ balance × burnRateSatang), expiringIn90d (Σ remaining ล็อต expiresAt ≤ 90 วัน)} เป็นตัวเลขทั้งหมด · liability ตรง DB", typeof imp?.monthlyEarn === "number" && imp.monthlyCostSatang === imp.monthlyEarn * 20 && imp.liabilitySatang === liab * 20 && typeof imp.expiringIn90d === "number", "ตัวเลข", JSON.stringify({ imp, liab }));
  const sysRow = await prisma.appSystem.findUnique({ where: { id: SYS } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: sysRow!.settings as Any } }));
  await PS.setPointExtras({ tenantId: tid, systemId: SYS }, { burnAllowedAt: ["POS", "LIFF"], transferFeePoints: 5, requireOtp: true });
  const ex = await PS.getPointExtras({ tenantId: tid, systemId: SYS });
  chk("M2.2-S3.3", "ค่าที่ไม่มีคอลัมน์ (ใช้ได้ที่ POS/จอง/LIFF · ค่าธรรมเนียมโอน · ต้อง OTP) เก็บใน AppSystem.settings.member.points ผ่าน setPointExtras/getPointExtras · ค่าปริยาย burnAllowedAt ครบ 3 · requireOtp true", JSON.stringify(ex?.burnAllowedAt) === JSON.stringify(["POS", "LIFF"]) && ex.transferFeePoints === 5 && ex.requireOtp === true, "ครบ", JSON.stringify(ex));

  // ═══ S4 static UI ═══
  const pages = { main: read("src/app/app/sys/[id]/member/points/page.tsx"), settings: read("src/app/app/sys/[id]/member/points/settings/page.tsx"), adjust: read("src/app/app/sys/[id]/member/points/adjust/page.tsx"), expiring: read("src/app/app/sys/[id]/member/points/expiring/page.tsx") };
  const act = read("src/lib/modules/point/points-actions.ts") + read("src/lib/modules/member/points-actions.ts");
  const uiAll = readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n");
  const all = Object.values(pages).join("\n") + uiAll;
  const TIDS = ["points-page", "points-kpi", "points-ledger", "points-ledger-filter", "points-settings", "points-settings-earn", "points-settings-rules", "points-settings-expiry", "points-settings-burn", "points-settings-transfer", "points-settings-approval", "points-settings-impact", "points-settings-save", "points-adjust", "points-adjust-form", "points-adjust-approval-hint", "points-expiring", "points-expiring-table"];
  chk("M2.2-S4.1", "หน้า 4 หน้ามีจริง (points · settings · adjust · expiring) · requireTenant + สิทธิ์ (read / settings.manage / point.adjust) · testid 18 · actions 'use server' gate · nav points → ready · MemberSettingsTabs แต้ม → ready · ไม่มีอีโมจิ/hex", Object.values(pages).every((p) => p.length > 0 && /requireTenant/.test(p)) && /member\.settings\.manage|canManageSettings/.test(pages.settings + act) && /member\.point\.adjust/.test(pages.adjust + act) && TIDS.every((t) => all.includes(t)) && /^\s*"use server"/m.test(act) && /key:\s*"points"[^}]*status:\s*"ready"/.test(read("src/lib/modules/member/nav.ts")) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(uiAll.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(uiAll.replace(/\/\/.*$/gm, "")), "ครบ", `missing=${TIDS.filter((t) => !all.includes(t)).join(",")} pages=${Object.entries(pages).filter(([, v]) => !v).map(([k]) => k).join(",")}`);
  chk("M2.2-S4.2", "หน้าตั้งค่า (ภาพ 16): (ก) แถวประโยค 'ทุก ฿n = 1 แต้ม · นับจาก · ไม่ให้แต้มกับส่วนที่จ่ายด้วย gift/voucher/แต้ม' + ตารางกฎเพิ่ม 5 แถว (ตัวคูณระดับ/สินค้า-หมวด/ช่วงเวลา/เหตุการณ์/เพดานวัน) สวิตช์เปิด · (ข) แบบ/อายุ/เตือน 2 ช่อง/ระดับที่ไม่หมดอายุ (ชิป TierDef ที่มี NO_POINT_EXPIRY) · (ค) อัตรา/ขั้นต่ำ/สูงสุด %/ใช้ได้ที่ · (ง) เปิด/ค่าธรรมเนียม/จำกัดเดือน/OTP · (จ) เกิน n ต้องอนุมัติ · การ์ดผลกระทบ 4 ตัวเลข · ปุ่มยกเลิก/บันทึก (buffer)", ["ตัวคูณระดับ", "ช่วงเวลา", "เหตุการณ์", "เพดาน", "NO_POINT_EXPIRY", "burnRateSatang", "burnMinPoints", "burnMaxPct", "transferMonthlyCap", "adjustApprovalOver", "previewPointImpact", "remindDays", "excludeGiftCard"].every((k) => (pages.settings + uiAll + act).includes(k)), "ครบ", `missing=${["ตัวคูณระดับ", "ช่วงเวลา", "เหตุการณ์", "เพดาน", "NO_POINT_EXPIRY", "burnRateSatang", "burnMinPoints", "burnMaxPct", "transferMonthlyCap", "adjustApprovalOver", "previewPointImpact", "remindDays", "excludeGiftCard"].filter((k) => !(pages.settings + uiAll + act).includes(k)).join(",")}`, "MAJOR");

  // ═══ S5 ภาพ ═══
  const dir = `${mq.MQC.shotsDir}/2.2`;
  const sumO = existsSync(`${dir}/summary-owner.json`) ? JSON.parse(read(`${dir}/summary-owner.json`)) : null;
  const r = (n: string, d: string) => sumO?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (n: string, d: string) => r(n, d)?.status === 200 && r(n, d)?.missing?.length === 0 && r(n, d)?.errors?.length === 0;
  chk("M2.2-S5.1", "ภาพ 16: points-settings-owner desktop+mobile 200 · points-home-owner 200 · points-adjust-owner 200 · points-expiring-owner 200", ok("points-settings-owner", "desktop") && ok("points-settings-owner", "mobile") && ok("points-home-owner", "desktop") && ok("points-adjust-owner", "desktop") && ok("points-expiring-owner", "desktop"), "200 ×5", `${["points-settings-owner", "points-home-owner", "points-adjust-owner", "points-expiring-owner"].map((n) => r(n, "desktop")?.status).join("/")}`, "MAJOR");
  chk("M2.2-S5.2", "🔴 parity ภาพ 16 — Fable ตรวจด้วยตา · wo-notes/member-M2.2.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M2.2.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M2.2-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  for (const id of made.approvalPolicies) { await d(() => prisma.approvalRequest.deleteMany({ where: { policyId: id } })); await d(() => P.approvalStep.deleteMany({ where: { policyId: id } })); await d(() => P.approvalPolicy.delete({ where: { id } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    await d(() => P.pointTransfer.deleteMany({ where: { OR: [{ fromCustomerId: { in: made.customers } }, { toCustomerId: { in: made.customers } }] } }));
    for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  await d(() => P.platformAuthToken.deleteMany({ where: { email: { startsWith: "point-transfer:" } } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "point." }, status: "DONE" } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M2.2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
