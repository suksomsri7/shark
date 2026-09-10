// QC — ระบบสมาชิก v2 WO M3.8: รายงานสมาชิก — reports.ts 7 ชุด (overview · rfm · tiers · points (หนี้สินแต้ม) · promotions (ROI + holdout) · sources · cohort) · CSV · ตั้งเวลาส่งอีเมล (cron 06:00 ไทย) · UI ภาพ 25 (แท็บ 7 · KPI 6 · กราฟ div ล้วน · RFM 3×3)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.8 · พิมพ์เขียว §5.10 reports · §8 (บรรทัด 516 หนี้สินแต้ม = balance × ต้นทุน/แต้ม) · ภาพ 25 · สิทธิ์ member.report.view
// requires: member-seed
//
// สัญญา (ไม่มี migration · src/lib/modules/member/{reports.ts, reports-actions.ts} · facade member/index.ts · หน้า /member/reports?tab=overview|rfm|tiers|points|promotions|sources|cohort · cron step `memberReportsEmail` ใน platform/cron.ts)
//   ทุกฟังก์ชันรับ actor → ตรวจ member.report.view (ไม่มี → throw ไทย) · ทุกฟังก์ชันรับ { now? } เพื่อให้ผลนิ่ง (window = [now − n, now] · ไม่นับบิลที่ createdAt > now) · ใช้ aggregate/groupBy (ไม่ N+1)
//   overview(ctx, actor, { months = 12, now? }) → { members: { total, newThisMonth, active90d }, sales: { satang, billCount, perMemberSatang (= satang / จำนวนสมาชิกที่มีบิลในช่วง · ปัดลง), months }, retentionPct (= สมาชิกที่มีบิล ≥ 2 ใบในช่วง ÷ สมาชิกที่มีบิล ≥ 1 ใบ × 100 · ปัด 0 ตำแหน่ง), pointsOutstanding (Σ PointBalance ของสมาชิกในระบบ), promoCostMonthSatang (ต้นทุน voucher ที่ใช้ + แต้มที่ให้จาก journey/campaign เดือนไทยนี้ · ไม่มี = 0), newPerMonth: [{ month "YYYY-MM", count }] ยาว months เรียงเก่า→ใหม่ (เดือนไทย) }
//   rfm(ctx, actor, { days = 365, now? }) → { total (สมาชิกที่มีบิล PAID ในช่วง), segments: [{ key, label ไทย, count, description ไทย }] 9 ตัวเรียงตามภาพ 25 (champions "Champions" · loyal "Loyal" · promising "Promising" · potential "Potential" · need_attention "Need Attention" · new "New" · at_risk "At risk" · hibernating "Hibernating" · lost "Lost") · scores: [{ customerId, recencyDays, frequency, monetarySatang, r, f, m, segment }] }
//     คะแนน 1–5 แบบควินไทล์: เรียงค่าจากน้อยไปมาก (R ใช้ −recencyDays คือยิ่งซื้อล่าสุดยิ่งสูง) · score = min(5, floor(i × 5 / N) + 1) · ค่าเท่ากันได้คะแนนเท่ากัน (ใช้คะแนนสูงสุดของกลุ่มค่าเท่ากัน) ⇒ monotonic
//     จัดกลุ่ม (ตรวจตามลำดับ): r ≤ 1 → (f ≥ 3 ? at_risk : lost) · r = 2 → (f ≥ 3 ? at_risk : hibernating) · r = 3 → (f ≥ 4 ? loyal : need_attention) · r ≥ 4 → (f ≥ 4 && m ≥ 4 ? champions : f ≥ 4 ? loyal : frequency = 1 ? new : m ≥ 3 ? promising : potential)
//   tiers(ctx, actor, { now? }) → { rows: [{ tierDefId, name, count, avgSpend12mSatang, pointsOutstanding }] ทุกระดับ (เรียงตามลำดับระดับ) · total }
//   points(ctx, actor, { months = 6, now? }) → { monthly: [{ month, earned, burned, expired }] (เดือนไทย · เก่า→ใหม่ · จาก PointLedger ของสมาชิกในระบบ · burned/expired เป็นบวก), totals: { earned, burned, expired }, outstanding, burnRateSatang (PointSettings), liabilitySatang = outstanding × burnRateSatang }
//   promotions(ctx, actor, { days = 90, now? }) → { journeys: [{ id, name, entered, used, saleSatang, costSatang, roi, upliftPct }] (จาก journeyStats · AutomationRule scope MEMBER_JOURNEY ของระบบ) , campaigns: [{ id, name, sent, used, saleSatang, costSatang, roi, upliftPct }] (campaignStats · MktCampaign memberSystemId = ระบบ), totals: { costSatang, saleSatang, roi } } · ไม่มีข้อมูล → [] และ 0
//   sources(ctx, actor, { days = 90, now? }) → { rows: [{ source, label ไทย, count, firstPurchases, costPerMemberSatang }] เรียง count desc · total = สมาชิกที่สมัครในช่วง } (ต่อจาก M1.8 sourcesReport)
//   cohort(ctx, actor, { months = 6, now? }) → { rows: [{ month, size, retained: number[] (index k = % ของ cohort ที่มีบิล PAID ในเดือนไทย (สมัคร + k) · เฉพาะเดือนที่ ≤ now · ปัด 0 ตำแหน่ง) }] เรียงเก่า→ใหม่ }
//   exportCsv(ctx, actor, tab, { now? }) → { filename: `member-report-<tab>-<YYYY-MM-DD>.csv`, csv: string (BOM + header ไทย + แถวข้อมูล · คั่น , · ค่าครอบ " เมื่อมี ,/") }
//   getReportSchedule(ctx) → { enabled false, emails: [], hour: 6, tabs: ["overview", "rfm", "points"], lastSentDate: null } (settings.member.reports.schedule) · setReportSchedule(ctx, actor, partial) → member.settings.manage · อีเมลผิดรูป → throw ไทย · hour 0–23 · tabs ⊆ 7 · emails ≤ 5
//   runScheduledReports({ now?, deps?: { email? } }) → { sent, skipped } — ทุกระบบ MEMBER ที่ schedule.enabled และ ชั่วโมงไทยของ now ≥ hour และ lastSentDate ≠ วันไทยของ now → ส่งอีเมล 1 ฉบับ/ระบบ (to = emails · subject ไทยมีชื่อร้าน+วันที่ · text สรุป KPI · attachments CSV ตาม tabs) แล้วบันทึก lastSentDate · เรียกซ้ำวันเดียวกัน → skipped · cron.ts step `memberReportsEmail` เรียกทุกชั่วโมง
//   UI (ภาพ 25): /member/reports — แท็บ 7 (ภาพรวม/RFM/ระดับ/แต้ม/โปรโมชัน/ช่องทางที่มา/Cohort) · KPI 6 (สมาชิกทั้งหมด · ยอดขายสมาชิก 12 เดือน · เฉลี่ย/คน · อัตรารักษาลูกค้า · แต้มคงค้าง · ต้นทุนโปรโมชันเดือนนี้) · กราฟแท่ง "สมาชิกใหม่ต่อเดือน" 12 แท่ง (div) · ตาราง RFM 3×3 (9 ช่อง ชื่อ+จำนวน · สีเฉด token) · การ์ด "ระดับ" · การ์ด "แต้ม" (แท่ง 6 เดือน + ออก/ใช้/หมดอายุ + หนี้สิน) · การ์ด "โปรโมชัน" (ROI ต่อ journey) · ปุ่ม ส่งออก CSV · ตั้งเวลาส่งอีเมลรายงาน (โมดัล: อีเมล · ชั่วโมง · แท็บ · สวิตช์)
//   testid: reports-page reports-tabs reports-tab-<key> reports-kpi reports-chart-new reports-rfm-grid reports-rfm-cell-<key> reports-tiers reports-points reports-points-liability reports-promotions reports-sources reports-cohort reports-export reports-schedule reports-schedule-form
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/reports.ts") || !existsSync("src/app/app/sys/[id]/member/reports/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/reports.ts · member/reports/page.tsx)");
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
const thMonth = (d: Date) => { const t = new Date(d.getTime() + 7 * 3600_000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
const thDate = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
let tid = ""; let SYS = ""; let PT = "";
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const R = (await import("@/lib/modules/member/reports" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thanaNo = { ...thana0, permissions: { ...thana0.permissions, "member.report.view": false } };
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const now = new Date(); // ผลต้องนิ่งเมื่อส่ง now เดียวกัน
  const d365 = new Date(now.getTime() - 365 * 86_400_000);
  const sys0 = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: (sys0?.settings ?? {}) as Any } }));
  // ค่าคาดหวังจาก DB โดยตรง (ทนต่อ reseed)
  const memberIds = (await prisma.customer.findMany({ where: { tenantId: tid, memberSystemId: SYS, status: { not: "MERGED" as Any } }, select: { id: true } })).map((c) => c.id);
  const bills = await prisma.posSale.findMany({ where: { tenantId: tid, status: "PAID" as Any, memberId: { in: memberIds }, createdAt: { gte: d365, lte: now } }, select: { memberId: true, grandTotalSatang: true, netSatang: true, createdAt: true } as Any }) as Any[];
  const amt = (b: Any) => Number(b.netSatang ?? b.grandTotalSatang ?? 0);
  const sumSatang = bills.reduce((s, b) => s + amt(b), 0);
  const perMember = new Map<string, Any[]>(); for (const b of bills) { const arr = perMember.get(b.memberId) ?? []; arr.push(b); perMember.set(b.memberId, arr); }
  const buyers = perMember.size; const repeat = [...perMember.values()].filter((v) => v.length >= 2).length;
  const balances = await P.pointBalance.findMany({ where: { customerId: { in: memberIds } }, select: { balance: true } });
  const outstanding = balances.reduce((s: number, b: Any) => s + Number(b.balance ?? 0), 0);

  // ═══ S1 overview ═══
  const ov = await R.overview(ctx, owner, { months: 12, now });
  chk("M3.8-S1.1", "overview: members.total = สมาชิกในระบบ (60) · sales.satang = Σ บิล PAID 12 เดือน [now−365, now] · billCount ตรง · perMemberSatang = satang ÷ ผู้ซื้อ · retentionPct = ผู้ซื้อ ≥ 2 ใบ ÷ ผู้ซื้อ × 100 · pointsOutstanding = Σ PointBalance · promoCostMonthSatang ≥ 0", ov?.members?.total === memberIds.length && ov.sales?.satang === sumSatang && ov.sales?.billCount === bills.length && ov.sales?.perMemberSatang === Math.floor(sumSatang / Math.max(1, buyers)) && ov.retentionPct === Math.round((repeat / Math.max(1, buyers)) * 100) && ov.pointsOutstanding === outstanding && typeof ov.promoCostMonthSatang === "number" && ov.promoCostMonthSatang >= 0, "ตรง DB", `ov=${JSON.stringify({ t: ov?.members?.total, s: ov?.sales, r: ov?.retentionPct, p: ov?.pointsOutstanding })} exp={t:${memberIds.length}, s:${sumSatang}/${bills.length}/${Math.floor(sumSatang / Math.max(1, buyers))}, r:${Math.round((repeat / Math.max(1, buyers)) * 100)}, p:${outstanding}}`);
  const created = await prisma.customer.findMany({ where: { id: { in: memberIds } }, select: { createdAt: true } });
  const expMonths: string[] = []; for (let k = 11; k >= 0; k -= 1) { const t = new Date(now.getTime() + 7 * 3600_000); expMonths.push(`${new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1)).toISOString().slice(0, 7)}`); }
  const expNew = expMonths.map((mo) => created.filter((c) => thMonth(c.createdAt) === mo).length);
  const ov2 = await R.overview(ctx, owner, { months: 12, now });
  chk("M3.8-S1.2", "newPerMonth 12 เดือนไทย เก่า→ใหม่ · count ต่อเดือน = สมาชิกที่ createdAt ในเดือนนั้น · newThisMonth = เดือนล่าสุด · active90d = ผู้ซื้อ/มี activity 90 วัน (≤ total) · เรียกซ้ำ now เดียวกัน = ผลเท่ากันเป๊ะ", Array.isArray(ov?.newPerMonth) && ov.newPerMonth.length === 12 && ov.newPerMonth.every((r: Any, i: number) => r.month === expMonths[i] && r.count === expNew[i]) && ov.members.newThisMonth === expNew[11] && ov.members.active90d <= ov.members.total && JSON.stringify(ov) === JSON.stringify(ov2), "12 เดือนตรง", `got=${JSON.stringify(ov?.newPerMonth?.map((r: Any) => `${r.month}:${r.count}`))} exp=${JSON.stringify(expMonths.map((m, i) => `${m}:${expNew[i]}`))} same=${JSON.stringify(ov) === JSON.stringify(ov2)}`);

  // ═══ S2 RFM ═══
  const rfm = await R.rfm(ctx, owner, { days: 365, now });
  const segs: Any[] = rfm?.segments ?? []; const scores: Any[] = rfm?.scores ?? [];
  const KEYS = ["champions", "loyal", "promising", "potential", "need_attention", "new", "at_risk", "hibernating", "lost"];
  chk("M3.8-S2.1", "rfm: segments 9 ตัวเรียงตามภาพ 25 · label · Σ count = total = สมาชิกที่มีบิลในช่วง · scores ยาว = total · ทุก score r/f/m ∈ 1..5 · count ต่อ segment = จำนวน scores ที่ segment นั้น", segs.length === 9 && KEYS.every((k, i) => segs[i]?.key === k && !!segs[i]?.label) && segs.reduce((s, x) => s + x.count, 0) === rfm.total && rfm.total === buyers && scores.length === buyers && scores.every((s) => [s.r, s.f, s.m].every((v) => Number.isInteger(v) && v >= 1 && v <= 5)) && KEYS.every((k) => segs.find((s) => s.key === k)?.count === scores.filter((s) => s.segment === k).length), "9 กลุ่มครบ", `keys=${segs.map((s) => s.key).join(",")} sum=${segs.reduce((s, x) => s + x.count, 0)}/${rfm?.total}/${buyers} scores=${scores.length}`);
  const segOf = (s: Any) => s.r <= 1 ? (s.f >= 3 ? "at_risk" : "lost") : s.r === 2 ? (s.f >= 3 ? "at_risk" : "hibernating") : s.r === 3 ? (s.f >= 4 ? "loyal" : "need_attention") : (s.f >= 4 && s.m >= 4 ? "champions" : s.f >= 4 ? "loyal" : s.frequency === 1 ? "new" : s.m >= 3 ? "promising" : "potential");
  const badMap = scores.filter((s) => segOf(s) !== s.segment);
  chk("M3.8-S2.2", "จัดกลุ่มตรงกติกาสัญญาทุกคน (r/f/m/frequency → segment)", scores.length > 0 && badMap.length === 0, "0 ผิด", `ผิด ${badMap.length} เช่น ${JSON.stringify(badMap[0])}`);
  const raw = new Map<string, { rec: number; freq: number; mon: number }>();
  for (const [cid, arr] of perMember) { const last = Math.max(...arr.map((b) => new Date(b.createdAt).getTime())); raw.set(cid, { rec: Math.floor((now.getTime() - last) / 86_400_000), freq: arr.length, mon: arr.reduce((s, b) => s + amt(b), 0) }); }
  let mono = true; let rawOk = true; let bad = "";
  for (const a of scores) { const ra = raw.get(a.customerId); if (!ra) { rawOk = false; bad = `no raw ${a.customerId}`; break; } if (a.recencyDays !== ra.rec || a.frequency !== ra.freq || a.monetarySatang !== ra.mon) { rawOk = false; bad = `raw mismatch ${JSON.stringify({ a, ra })}`; break; } }
  outer: for (const a of scores) for (const b of scores) {
    const A = raw.get(a.customerId)!, B = raw.get(b.customerId)!;
    if (A.rec < B.rec && a.r < b.r) { mono = false; bad = `r: ${a.customerId}(${A.rec}d→${a.r}) vs ${b.customerId}(${B.rec}d→${b.r})`; break outer; }
    if (A.rec === B.rec && a.r !== b.r) { mono = false; bad = `r tie ${a.customerId}/${b.customerId}`; break outer; }
    if (A.freq < B.freq && a.f > b.f) { mono = false; bad = "f"; break outer; }
    if (A.freq === B.freq && a.f !== b.f) { mono = false; bad = "f tie"; break outer; }
    if (A.mon < B.mon && a.m > b.m) { mono = false; bad = "m"; break outer; }
    if (A.mon === B.mon && a.m !== b.m) { mono = false; bad = "m tie"; break outer; }
  }
  chk("M3.8-S2.3", "raw ตรง DB (recencyDays/frequency/monetarySatang) · คะแนน monotonic: ค่าน้อยกว่าไม่ได้คะแนนสูงกว่า · ค่าเท่ากันคะแนนเท่ากัน (seed ทุกคน 2 บิล ⇒ f เท่ากันหมด) · ช่วง r ใช้ครบ ≥ 3 ระดับ", rawOk && mono && new Set(scores.map((s) => s.r)).size >= 3 && new Set(scores.map((s) => s.f)).size === 1, "monotonic", `raw=${rawOk} mono=${mono} bad=${bad} rLevels=${new Set(scores.map((s) => s.r)).size} fLevels=${new Set(scores.map((s) => s.f)).size}`);

  // ═══ S3 tiers ═══
  const tr = await R.tiers(ctx, owner, { now });
  const byTier = await prisma.customer.groupBy({ by: ["tierDefId"], where: { id: { in: memberIds } }, _count: { _all: true } } as Any) as Any[];
  chk("M3.8-S3.1", "tiers: แถวต่อระดับ (≥ 4) · count ต่อ tierDefId ตรง groupBy · Σ = total = 60 · avgSpend12mSatang/pointsOutstanding เป็นตัวเลข ≥ 0 · Σ pointsOutstanding = outstanding รวม", (tr?.rows?.length ?? 0) >= 4 && tr.rows.every((r: Any) => r.count === (byTier.find((g) => g.tierDefId === r.tierDefId)?._count?._all ?? 0) && r.avgSpend12mSatang >= 0 && r.pointsOutstanding >= 0 && !!r.name) && tr.rows.reduce((s: number, r: Any) => s + r.count, 0) === memberIds.length && tr.total === memberIds.length && tr.rows.reduce((s: number, r: Any) => s + r.pointsOutstanding, 0) === outstanding, "ตรง groupBy", `rows=${JSON.stringify(tr?.rows?.map((r: Any) => [r.name, r.count]))} total=${tr?.total}`);

  // ═══ S4 points ═══
  const pt = await R.points(ctx, owner, { months: 6, now });
  const ps = await prisma.pointSettings.findUnique({ where: { tenantId: tid } });
  const led = await prisma.pointLedger.findMany({ where: { tenantId: tid, customerId: { in: memberIds }, createdAt: { lte: now } }, select: { type: true, delta: true, createdAt: true } });
  const mo6: string[] = []; for (let k = 5; k >= 0; k -= 1) { const t = new Date(now.getTime() + 7 * 3600_000); mo6.push(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1)).toISOString().slice(0, 7)); }
  const expM = mo6.map((mo) => { const L = led.filter((l) => thMonth(l.createdAt) === mo); return { month: mo, earned: L.filter((l) => l.delta > 0 && String(l.type) !== "EXPIRE").reduce((s, l) => s + l.delta, 0), burned: -L.filter((l) => l.delta < 0 && String(l.type) !== "EXPIRE").reduce((s, l) => s + l.delta, 0), expired: -L.filter((l) => String(l.type) === "EXPIRE").reduce((s, l) => s + l.delta, 0) }; });
  chk("M3.8-S4.1", "points: monthly 6 เดือนไทย เก่า→ใหม่ (earned = Σ delta>0 ไม่ใช่ EXPIRE · burned = −Σ delta<0 ไม่ใช่ EXPIRE · expired = −Σ EXPIRE) ตรง ledger · totals = Σ monthly · outstanding = Σ balance · burnRateSatang = PointSettings · liabilitySatang = outstanding × burnRateSatang", pt?.monthly?.length === 6 && pt.monthly.every((r: Any, i: number) => r.month === expM[i].month && r.earned === expM[i].earned && r.burned === expM[i].burned && r.expired === expM[i].expired) && pt.totals?.earned === expM.reduce((s, r) => s + r.earned, 0) && pt.totals?.burned === expM.reduce((s, r) => s + r.burned, 0) && pt.outstanding === outstanding && pt.burnRateSatang === (ps?.burnRateSatang ?? 10) && pt.liabilitySatang === outstanding * (ps?.burnRateSatang ?? 10), "หนี้สินตรง", `got=${JSON.stringify(pt?.monthly)} exp=${JSON.stringify(expM)} out=${pt?.outstanding}/${outstanding} rate=${pt?.burnRateSatang} liab=${pt?.liabilitySatang}`);

  // ═══ S5 promotions ═══
  const pm = await R.promotions(ctx, owner, { days: 90, now });
  const nJ = await P.automationRule.count({ where: { tenantId: tid, scope: "MEMBER_JOURNEY", memberSystemId: SYS } }).catch(() => 0);
  const nC = await P.mktCampaign.count({ where: { tenantId: tid, memberSystemId: SYS } }).catch(() => 0);
  chk("M3.8-S5.1", "promotions: journeys.length = AutomationRule MEMBER_JOURNEY ของระบบ · campaigns.length = MktCampaign ของระบบ · แต่ละแถว { id, name, used, saleSatang, costSatang, roi (number|null), upliftPct } · totals.costSatang = Σ cost · totals.saleSatang = Σ sale · totals.roi = sale/cost (cost 0 → null)", pm?.journeys?.length === nJ && pm.campaigns?.length === nC && [...pm.journeys, ...pm.campaigns].every((r: Any) => r.id && r.name && typeof r.used === "number" && typeof r.saleSatang === "number" && typeof r.costSatang === "number" && ("roi" in r) && ("upliftPct" in r)) && pm.totals?.costSatang === [...pm.journeys, ...pm.campaigns].reduce((s: number, r: Any) => s + r.costSatang, 0) && pm.totals?.saleSatang === [...pm.journeys, ...pm.campaigns].reduce((s: number, r: Any) => s + r.saleSatang, 0) && (pm.totals.costSatang === 0 ? pm.totals.roi === null : typeof pm.totals.roi === "number"), "โครงตรง", `j=${pm?.journeys?.length}/${nJ} c=${pm?.campaigns?.length}/${nC} totals=${JSON.stringify(pm?.totals)}`);

  // ═══ S6 sources ═══
  const so = await R.sources(ctx, owner, { days: 90, now });
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const bySrc = await prisma.customer.groupBy({ by: ["source"], where: { id: { in: memberIds }, createdAt: { gte: d90, lte: now } }, _count: { _all: true } } as Any) as Any[];
  chk("M3.8-S6.1", "sources 90 วัน: rows เรียง count desc · count ต่อ source ตรง groupBy(createdAt ในช่วง) · total = Σ · label ไทย · firstPurchases ≤ count · costPerMemberSatang ≥ 0", Array.isArray(so?.rows) && so.rows.every((r: Any, i: number) => (i === 0 || so.rows[i - 1].count >= r.count) && r.count === (bySrc.find((g) => g.source === r.source)?._count?._all ?? 0) && /[ก-๙]/.test(r.label ?? "") && r.firstPurchases <= r.count && r.costPerMemberSatang >= 0) && so.total === bySrc.reduce((s, g) => s + g._count._all, 0) && so.rows.length === bySrc.length, "ตรง groupBy", `rows=${JSON.stringify(so?.rows?.map((r: Any) => [r.source, r.count]))} exp=${JSON.stringify(bySrc.map((g) => [g.source, g._count._all]))} total=${so?.total}`);

  // ═══ S7 cohort ═══
  const co = await R.cohort(ctx, owner, { months: 6, now });
  const allBills = await prisma.posSale.findMany({ where: { tenantId: tid, status: "PAID" as Any, memberId: { in: memberIds }, createdAt: { lte: now } }, select: { memberId: true, createdAt: true } });
  const custs = await prisma.customer.findMany({ where: { id: { in: memberIds } }, select: { id: true, createdAt: true } });
  const cohortOf = (mo: string) => custs.filter((c) => thMonth(c.createdAt) === mo);
  const addMonths = (mo: string, k: number) => { const [y, m] = mo.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); };
  const nowMo = thMonth(now);
  const expCo = mo6.map((mo) => { const ch = cohortOf(mo); const ret: number[] = []; for (let k = 0; addMonths(mo, k) <= nowMo && k < 6; k += 1) { const target = addMonths(mo, k); const n = ch.filter((c) => allBills.some((b) => b.memberId === c.id && thMonth(b.createdAt) === target)).length; ret.push(ch.length ? Math.round((n / ch.length) * 100) : 0); } return { month: mo, size: ch.length, retained: ret }; });
  chk("M3.8-S7.1", "cohort 6 เดือน: rows เก่า→ใหม่ month/size ตรงจำนวนสมาชิกที่สมัครเดือนนั้น · retained[k] = % ที่มีบิลในเดือน (สมัคร+k) เฉพาะเดือน ≤ now · ยาวไม่เกินเดือนที่ผ่านมาแล้ว", co?.rows?.length === 6 && co.rows.every((r: Any, i: number) => r.month === expCo[i].month && r.size === expCo[i].size && JSON.stringify(r.retained) === JSON.stringify(expCo[i].retained)), "ตรง", `got=${JSON.stringify(co?.rows)} exp=${JSON.stringify(expCo)}`);

  // ═══ S8 CSV ═══
  const csvR = await R.exportCsv(ctx, owner, "rfm", { now });
  const csvO = await R.exportCsv(ctx, owner, "overview", { now });
  const eTab = await fails(() => R.exportCsv(ctx, owner, "nope", { now }));
  const linesR = (csvR?.csv ?? "").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  chk("M3.8-S8.1", "exportCsv(rfm): filename member-report-rfm-<วันไทย>.csv · BOM · header ไทย · 9 แถวข้อมูล (key/label/count) · ตัวเลขรวม = total · tab ไม่รู้จัก → throw ไทย", csvR?.filename === `member-report-rfm-${thDate(now)}.csv` && (csvR.csv ?? "").startsWith("﻿") && /[ก-๙]/.test(linesR[0] ?? "") && linesR.length === 10 && KEYS.every((k) => linesR.some((l: string) => l.includes(k) || l.includes(segs.find((s) => s.key === k)?.label ?? "@@"))) && thai(eTab), "CSV 9 แถว", `fn=${csvR?.filename} lines=${linesR.length} head=${linesR[0]?.slice(0, 60)} eTab=${thai(eTab)}`);
  const linesO = (csvO?.csv ?? "").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  chk("M3.8-S8.2", "exportCsv(overview): มี KPI 6 (สมาชิกทั้งหมด · ยอดขาย · เฉลี่ย/คน · อัตรารักษา · แต้มคงค้าง · ต้นทุนโปรโมชัน) + สมาชิกใหม่ต่อเดือน 12 แถว · ค่าที่มี , ถูกครอบด้วย \" · ไม่มี undefined/NaN", linesO.length >= 13 && ["สมาชิกทั้งหมด", "ยอดขาย", "เฉลี่ย", "อัตรารักษา", "แต้มคงค้าง", "ต้นทุนโปรโมชัน"].every((k) => (csvO?.csv ?? "").includes(k)) && expMonths.every((mo) => (csvO?.csv ?? "").includes(mo)) && !/undefined|NaN/.test(csvO?.csv ?? "") && (csvO?.csv ?? "").split("\n").every((l: string) => { const cells = l.match(/"[^"]*"|[^,]+/g) ?? []; return cells.every((c: string) => !c.includes(",") || c.startsWith("\"")); }), "CSV ครบ", `lines=${linesO.length} sample=${linesO.slice(0, 3).join(" | ").slice(0, 160)}`);

  // ═══ S9 schedule ═══
  const sc0 = await R.getReportSchedule(ctx);
  const eMail = await fails(() => R.setReportSchedule(ctx, owner, { emails: ["not-an-email"] }));
  const eHour = await fails(() => R.setReportSchedule(ctx, owner, { hour: 25 }));
  const eTabs = await fails(() => R.setReportSchedule(ctx, owner, { tabs: ["nope"] }));
  const ePerm = await fails(() => R.setReportSchedule(ctx, thana0, { enabled: true }));
  await R.setReportSchedule(ctx, owner, { enabled: true, emails: ["owner@example.com", "acc@example.com"], hour: 6, tabs: ["overview", "rfm"] });
  const sc1 = await R.getReportSchedule(ctx);
  chk("M3.8-S9.1", "schedule ปริยาย {enabled false, emails [], hour 6, tabs [overview, rfm, points], lastSentDate null} · อีเมลผิด/hour 25/tab แปลก → throw ไทย · thana → throw · set แล้วอ่านกลับ", sc0?.enabled === false && Array.isArray(sc0.emails) && sc0.emails.length === 0 && sc0.hour === 6 && JSON.stringify(sc0.tabs) === JSON.stringify(["overview", "rfm", "points"]) && sc0.lastSentDate === null && thai(eMail) && thai(eHour) && thai(eTabs) && !!ePerm && sc1?.enabled === true && sc1.emails.length === 2 && JSON.stringify(sc1.tabs) === JSON.stringify(["overview", "rfm"]), "validation", `sc0=${JSON.stringify(sc0)} e=${thai(eMail)}/${thai(eHour)}/${thai(eTabs)}/${!!ePerm} sc1=${JSON.stringify(sc1)}`);
  const mails: Any[] = []; const emailDep = async (r: Any) => { mails.push(r); return { ok: true }; };
  const at5 = new Date(now.getTime()); at5.setUTCHours(22, 30, 0, 0); at5.setUTCDate(at5.getUTCDate() - 1); // 05:30 ไทย
  const at7 = new Date(now.getTime()); at7.setUTCHours(0, 10, 0, 0); // 07:10 ไทย
  const r1 = await R.runScheduledReports({ now: at5, deps: { email: emailDep } });
  const r2 = await R.runScheduledReports({ now: at7, deps: { email: emailDep } });
  const r3 = await R.runScheduledReports({ now: at7, deps: { email: emailDep } });
  const sc2 = await R.getReportSchedule(ctx);
  const mail = mails.find((x) => (Array.isArray(x.to) ? x.to : [x.to]).includes("owner@example.com"));
  const cronSrc = read("src/lib/platform/cron.ts");
  chk("M3.8-S9.2", "runScheduledReports: 05:30 ไทย (ก่อน hour 6) → ไม่ส่ง · 07:10 → ส่ง 1 ฉบับ (to 2 อีเมล · subject ไทยมีวันที่ · attachments CSV 2 ไฟล์ overview+rfm หรือ text มี KPI) · lastSentDate = วันไทย · เรียกซ้ำวันเดียวกัน → skipped ไม่ส่งซ้ำ · cron.ts มี step memberReportsEmail", (r1?.sent ?? 0) === 0 && (r2?.sent ?? 0) >= 1 && !!mail && /[ก-๙]/.test(mail.subject ?? "") && /\d{4}|\d{1,2}\s/.test(mail.subject ?? "") && ((mail.attachments?.length ?? 0) === 2 || /สมาชิก/.test(mail.text ?? mail.body ?? "")) && sc2?.lastSentDate === thDate(at7) && (r3?.sent ?? 0) === 0 && mails.filter((x) => (Array.isArray(x.to) ? x.to : [x.to]).includes("owner@example.com")).length === 1 && /memberReportsEmail|runScheduledReports/.test(cronSrc), "ส่งครั้งเดียว/วัน", `r1=${JSON.stringify(r1)} r2=${JSON.stringify(r2)} r3=${JSON.stringify(r3)} mail=${JSON.stringify({ to: mail?.to, s: mail?.subject, att: mail?.attachments?.length })} last=${sc2?.lastSentDate}/${thDate(at7)} cron=${/memberReportsEmail|runScheduledReports/.test(cronSrc)}`);

  // ═══ S10 perm · perf · facade ═══
  const ePv = await fails(() => R.overview(ctx, thanaNo, { now }));
  const ePv2 = await fails(() => R.rfm(ctx, thanaNo, { now }));
  const t0 = Date.now(); await R.overview(ctx, owner, { now }); const t1 = Date.now(); await R.rfm(ctx, owner, { now }); const t2 = Date.now(); await R.cohort(ctx, owner, { now }); const t3 = Date.now();
  const rsrc = read("src/lib/modules/member/reports.ts");
  chk("M3.8-S10.1", "ไม่มี member.report.view → overview/rfm throw ไทย · perf 60 คน: overview < 800ms · rfm < 800ms · cohort < 800ms · facade export overview/rfm/tiers/points/promotions/sources/cohort/exportCsv/getReportSchedule/setReportSchedule/runScheduledReports (ชื่อ report* ก็ได้) · reports.ts ใช้ groupBy/aggregate (ไม่วน findMany ต่อสมาชิก) · ไม่มี any", thai(ePv) && thai(ePv2) && t1 - t0 < 800 && t2 - t1 < 800 && t3 - t2 < 800 && ["overview", "rfm", "tiers", "cohort", "exportCsv", "ReportSchedule", "runScheduledReports"].every((f) => new RegExp(f, "i").test(read("src/lib/modules/member/index.ts"))) && /groupBy|aggregate|\$queryRaw/.test(rsrc) && !/:\s*any\b/.test(rsrc), "เร็ว+ปลอดภัย", `perm=${thai(ePv)}/${thai(ePv2)} t=${t1 - t0}/${t2 - t1}/${t3 - t2}ms agg=${/groupBy|aggregate|\$queryRaw/.test(rsrc)}`, "MAJOR");

  // ═══ S11 UI / ภาพ ═══
  const page = read("src/app/app/sys/[id]/member/reports/page.tsx");
  const actSrc = read("src/lib/modules/member/reports-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /report/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = page + comps;
  const TIDS = ["reports-page", "reports-tabs", "reports-tab-", "reports-kpi", "reports-chart-new", "reports-rfm-grid", "reports-rfm-cell-", "reports-tiers", "reports-points", "reports-points-liability", "reports-promotions", "reports-sources", "reports-cohort", "reports-export", "reports-schedule", "reports-schedule-form"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["ภาพรวม", "RFM", "ระดับ", "แต้ม", "โปรโมชัน", "ช่องทางที่มา", "Cohort", "สมาชิกทั้งหมด", "ยอดขายสมาชิก 12 เดือน", "เฉลี่ย/คน", "อัตรารักษาลูกค้า", "แต้มคงค้าง", "ต้นทุนโปรโมชันเดือนนี้", "สมาชิกใหม่ต่อเดือน", "Champions", "Lost", "หนี้สิน", "ส่งออก CSV", "ตั้งเวลาส่งอีเมล"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const nav = read("src/lib/modules/member/nav.ts");
  chk("M3.8-S11.1", "หน้า /member/reports มีจริง requireTenant + report.view · actions 'use server' · testid 16 · ป้ายภาพ 25 ครบ · nav มีทางเข้า reports · กราฟเป็น div (ไม่ import ไลบรารีกราฟ/canvas/svg chart) · ไม่มีอีโมจิ/hex", page.length > 0 && /requireTenant/.test(page) && /member\.report\.view/.test(page + actSrc) && /["']use server["']/.test(actSrc) && missingT.length === 0 && missingL.length === 0 && /reports/.test(nav) && !/recharts|chart\.js|<canvas|d3-/.test(all) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")), "ครบ", `page=${page.length > 0} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.8`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.8-S11.2", "ภาพ 25: reports-owner desktop+mobile 200 ไม่ล้น (แท็บ 7 · KPI 6 · กราฟ 12 แท่ง · RFM 3×3 · การ์ดระดับ/แต้ม/โปรโมชัน) · reports-rfm-owner desktop (tab=rfm) · reports-cohort-owner desktop · reports-schedule-owner (เปิดโมดัลตั้งเวลา) · noperm 404", ok("owner", "reports-owner", "desktop") && ok("owner", "reports-owner", "mobile") && ok("owner", "reports-rfm-owner", "desktop") && ok("owner", "reports-cohort-owner", "desktop") && ok("owner", "reports-schedule-owner", "desktop") && r("noperm", "reports-noperm", "desktop")?.status === 404, "200 ×5 · 404", `${["reports-owner", "reports-rfm-owner", "reports-cohort-owner", "reports-schedule-owner"].map((n) => r("owner", n, "desktop")?.status).join("/")} mobile=${r("owner", "reports-owner", "mobile")?.status}/ovf=${r("owner", "reports-owner", "mobile")?.overflow} noperm=${r("noperm", "reports-noperm", "desktop")?.status} missing=${JSON.stringify(r("owner", "reports-owner", "desktop")?.missing)}`);
  chk("M3.8-S11.3", "🔴 parity ภาพ 25 — Fable ตรวจด้วยตา · wo-notes/member-M3.8.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.8.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.8-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.8: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
