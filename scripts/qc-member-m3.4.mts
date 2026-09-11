// QC — ระบบสมาชิก v2 WO M3.4: รีวิว — MemberReview · requestReview (journey/consumer หลังบริการ · LINE ลิงก์ LIFF token) · submit (ลูกค้า · rating 1–5 · รูป ≤ 3 · แต้มตาม settings · 1 ครั้ง/ref) · reply · hide · escalate ≤ N → kanban.createCardFromExternal (sourceType REVIEW · มอบหมายตาม role) · AI summary/draft (SHARK_AI_MOCK) · inbox UI (ภาพ 23) + settings · แท็บรีวิวใน 360 (ภาพ 08 ขวา) · LIFF หน้าเขียนรีวิว · Google ปิด (D5)
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.4 · พิมพ์เขียว §4.2 (ReviewStatus) §4.3 (MemberReview · ReviewSettings ใน AppSystem.settings.member.review) §5.10 §7.1 (review.received/replied) §8 (AI prompt อังกฤษ ไม่ส่ง PII) §11.7 · MEMBER-API §2.15 · ภาพ 23 · 08 (ขวา)
// requires: member-seed
//
// สัญญา (migration `member_v2_h` · src/lib/modules/member/{reviews.ts, reviews-actions.ts} · facade member/index.ts · หน้า /member/reviews (+ ?settings=1 หรือโมดัลตั้งค่า) · /m/[slug]/review/[token] (LIFF) · แท็บ ?tab=reviews ใน Member360)
//   schema: MemberReview {tenantId systemId customerId unitId? refType? refId? serviceId? staffEmployeeId? rating Int (0 = ยังไม่ส่ง) body? photoFileIds String[] status ReviewStatus replyBody? repliedById? repliedAt? kanbanCardId? requestSentAt? requestTokenHash? submittedAt? hiddenReason? source MemberConsentSource} index(systemId,createdAt) index(customerId) index(systemId,rating) unique(tenantId,refType,refId) · enum ReviewStatus {REQUESTED NEW REPLIED ESCALATED HIDDEN} (เพิ่ม REQUESTED) · KanbanCardSourceType +REVIEW · AppSystem.settings.member.review = { askAfterHours 2, channel "LINE", rewardPoints 50, escalateBelow 2, escalateBoardId null, escalateAssigneeRole "MANAGER", replyTemplate "ขอบคุณสำหรับรีวิวค่ะ" , googleReviewUrl null (ปิด D5) }
//   getReviewSettings(ctx) → ค่าปริยายเมื่อว่าง · setReviewSettings(ctx, actor, partial) → member.settings.manage · rewardPoints ≥ 0 · escalateBelow 1–5 · escalateBoardId ต้องเป็นบอร์ดของร้าน (ไม่ใช่ → throw ไทย)
//   requestReview(ctx, { customerId, refType ("PosSale"|"Appointment"), refId, unitId?, serviceId?, staffEmployeeId?, channel? }, { deps?: { line? } }) → { reviewId, token, url: "/m/<slug>/review/<token>", sent: boolean, alreadyRequested: boolean } · unique ต่อ (refType, refId): เรียกซ้ำ → alreadyRequested true reviewId เดิม ไม่ส่งซ้ำ · token 32+ ตัว เก็บ sha256 · status REQUESTED rating 0 requestSentAt · ส่ง LINE ผ่าน chat facade pushToContact ถ้ามี LINE identity + ยินยอม (deps.line ฉีดได้) → sent true/false · MemberActivity REVIEW_REQUESTED refId reviewId
//   submitReview({ token, rating (1–5), body?, photoFileIds? (≤ 3) }, { now? }) → { reviewId, pointsEarned, escalated } — ไม่ต้อง session (token = capability) · token ไม่มี/ใช้แล้ว → throw ไทย · rating นอก 1–5 → throw · รูป > 3 → throw · status → NEW submittedAt · token ใช้ครั้งเดียว (requestTokenHash ล้าง) · แต้ม = settings.rewardPoints ผ่าน point facade earnWithLot refType "REVIEW" refId reviewId idempotencyKey `review:${reviewId}` (0 = ไม่ให้) · event review.received {customerId, reviewId, rating, refType, refId} · rating ≤ escalateBelow → escalate อัตโนมัติ
//   escalate(ctx, reviewId) → kanban.createCardFromExternal({ boardId: settings.escalateBoardId ?? บอร์ดแรกของร้าน, title "รีวิว n ดาว — <ชื่อ>", description body, sourceType "REVIEW", sourceKey `review:${reviewId}`, assigneeUserIds = ผู้ใช้ role escalateAssigneeRole (unit ของรีวิว หรือทั้งร้าน) , party {name, phone} }) → MemberReview.kanbanCardId + status ESCALATED · ไม่มีบอร์ด → status ESCALATED แต่ kanbanCardId null + AppNotification แจ้งผู้จัดการ · idempotent (sourceKey เดิม = การ์ดเดิม)
//   reply(ctx, actor, reviewId, { body }, { deps? }) → member.review.reply · body ว่าง → throw · status REPLIED (จาก NEW/ESCALATED) replyBody repliedById repliedAt · event review.replied · ส่งข้อความตอบกลับให้ลูกค้าทาง LINE (deps.line) · ตอบซ้ำ = แก้ข้อความ (idempotent ไม่ยิง event ซ้ำถ้า body เดิม)
//   hide(ctx, actor, reviewId, { reason }) → member.review.reply · HIDDEN + hiddenReason · ไม่นับในคะแนนรวม · unhide → กลับ NEW/REPLIED ตามที่มี reply
//   listReviews(ctx, actor, { rating?, serviceId?, staffEmployeeId?, unitId?, unreplied?, take?, cursor? }) → { items[{ id, rating, body, customer{ id, name, memberCode, tier }, service?, staff?, unit?, createdAt, status, replyBody, kanbanCardId, kanbanCardNo }], nextCursor } · ไม่รวม REQUESTED (ยังไม่ส่ง) · HIDDEN แสดงเมื่อขอเท่านั้น · unit scope STAFF
//   reviewStats(ctx, actor, { days = 30 }) → { avg, count, repliedPct, lowCount (≤ escalateBelow), distribution {1..5}, weekDelta, trend: [{ week, avg }] } ไม่นับ HIDDEN/REQUESTED
//   reviewsForMember(ctx, actor, customerId) → รายการของคนนั้น (แท็บ 360) · shopSummaryFor360(ctx) → { avg, count, distribution } (กล่อง 'รีวิวร้าน' ภาพ 08)
//   summarize(ctx, actor, { month? = เดือนไทยนี้ }, { force? }) → { strengths: string, frequent: string, trend: string, cached: boolean, generatedAt } — AI ผ่าน @/lib/ai/provider (prompt อังกฤษ · ส่งเฉพาะ rating/body/service ไม่ส่งชื่อ/เบอร์) · cache ใน AppSystem.settings.member.reviewSummary[month] (รายวัน: generatedAt วันไทยเดียวกัน = cached true ไม่เรียก provider) · SHARK_AI_MOCK=1 → MockProvider · draftReply(ctx, actor, reviewId) → { text } (AI · template ตั้งต้นจาก settings.replyTemplate)
//   consumer/journey: action REQUEST_REVIEW (M3.3) เรียก reviews.requestReview · 360 counters.reviewAvg (M1.5 placeholder null) → ค่าจริง · list.ts MemberKpis.reviewAvg → ค่าจริง
//   UI (ภาพ 23): /member/reviews — KPI 4 (เฉลี่ย 30 วัน + จาก n รีวิว · รีวิว n + สัปดาห์นี้ · ตอบกลับแล้ว % · ≤ 2 ดาว n → การ์ดบอร์ดงาน) · ตัวกรอง (ดาว/บริการ/พนักงาน/สาขา/ยังไม่ตอบ n) · รายการรีวิว (รูป · ดาว · ชื่อ · บริการ·ครู · วันที่ · ข้อความ · ป้าย "เปิดการ์ด #n ในบอร์ด … — ผู้จัดการรับเรื่องแล้ว" · กล่องตอบ + ปุ่ม 'ให้ AI ร่างคำตอบ' + 'ส่งคำตอบ' · ตอบแล้ว — "…") · ขวา: AI สรุปรีวิวเดือนนี้ (จุดแข็ง/ถูกพูดถึงบ่อย/แนวโน้ม) · ตั้งค่า (ขอรีวิวหลัง ทาง LINE · n ชม. · ให้แต้ม · ≤ n ดาว เปิดการ์ดในบอร์ด + มอบหมาย · ≥ 4 ดาว เชิญรีวิว Google toggle ปิด 'เจ้าของเลือกเก็บในระบบ') · ภาพ 08 ขวา: กล่อง 'รีวิวร้าน' (เฉลี่ย · แจกแจง 5/4/2 · 2 รีวิวล่าสุด · ป้ายเปิดการ์ด) ในแท็บ ?tab=reviews · LIFF /m/[slug]/review/[token]: ดาว 5 · ข้อความ · รูป ≤ 3 · ส่ง → ขอบคุณ + แต้มที่ได้
//   testid: reviews-page reviews-kpi reviews-filter reviews-list review-row-<id> review-reply-box review-ai-draft review-reply-send review-escalated-badge reviews-ai-summary reviews-settings reviews-settings-form · member-reviews-tab member-reviews-summary · m-review m-review-stars m-review-submit m-review-thanks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
process.env.SHARK_AI_MOCK = "1";
import { existsSync, readFileSync, readdirSync } from "node:fs";
const migDir = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").find((d) => /_member_v2_h$/.test(d)) : undefined;
if (!migDir || !existsSync("src/lib/modules/member/reviews.ts") || !existsSync("src/app/app/sys/[id]/member/reviews/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (migration member_v2_h · member/reviews.ts · member/reviews/page.tsx)");
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
const enumVals = async (name: string) => (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='${name}'`)).map((e) => e.enumlabel);
const hasIdx = async (t: string, colsIn: string[], unique = false) => { const rows = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='${t}' and indexdef ${unique ? "" : "not "}ilike '%unique%'`); return rows.some((r) => { const body = r.indexdef.slice(r.indexdef.indexOf("(") + 1).replace(/"/g, "").toLowerCase(); return colsIn.every((c) => body.includes(c.toLowerCase())); }); };
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = "";
const tag = Date.now().toString(36);
const made = { reviews: [] as string[], customers: [] as string[], ledgerKeys: [] as string[], cards: [] as string[], boards: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const R = (await import("@/lib/modules/member/reviews" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const sys = (await import("@/lib/modules/system/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const kanban = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const { sha256 } = (await import("@/lib/core/hash" as string)) as Any;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const manager = await actorOf(E.users.manager.userId);
  const thana0 = await actorOf(E.users.staff.thana.userId);
  const thanaReply = { ...thana0, permissions: { ...thana0.permissions, "member.review.reply": true } };
  const kata = await actorOf(E.users.staff.kata.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: E.users.owner.userId as string };
  const bal = (cid: string) => PS.getBalance(PT, cid);
  const rv = (id: string) => P.memberReview.findUnique({ where: { id } });
  const mkDeps = () => { const calls: Any[] = []; return { calls, deps: { line: async (r: Any) => { calls.push(r); return { ok: true }; } } }; };
  const sys0 = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  restore.push(() => prisma.appSystem.update({ where: { id: SYS }, data: { settings: (sys0?.settings ?? {}) as Any } }));
  // บอร์ดงานสำหรับ escalate (ร้าน QC ยังไม่มี KANBAN → สร้าง)
  let kb = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "KANBAN" as Any } });
  if (!kb) { kb = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน (MB QC)"); for (const u of [E.units.patong, E.units.kata]) await sys.linkUnit(tid, kb!.id, u); }
  const board = await kanban.createBoard({ tenantId: tid, systemId: kb!.id, name: `งานร้าน ${tag}`, unitId: null });
  const boardId = (board?.id ?? board?.boardId ?? board) as string;
  made.boards.push(boardId);
  const mkCust = async (nm: string, unit = E.units.patong) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0888${String((Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000).padStart(6, "0")}`, firstName: nm, lastName: "รีวิว", source: "WALK_IN", homeUnitId: unit }); made.customers.push(c.customerId); await PV.setConsent(ctx, owner, c.customerId, { channel: "LINE", granted: true, source: "STAFF" }).catch(() => null); await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: c.customerId, channel: "LINE", externalId: `U-rv-${tag}-${Math.random().toString(36).slice(2, 8)}`, linkedBy: "MANUAL" /* ORACLE-EDIT M3.4-S2.1: linkedBy บังคับ — เดิมล้มเงียบ X/Y ไม่มี LINE ทั้งคู่ */ } }).catch(() => null); return c.customerId as string; };
  const sale = (i: number) => prisma.posSale.findFirst({ where: { tenantId: tid, memberId: m(i).id, status: "PAID" as Any }, orderBy: { createdAt: "asc" } });

  // ═══ S1 schema · settings ═══
  const rc = await cols("MemberReview");
  const st = await enumVals("ReviewStatus"); const src = await enumVals("KanbanCardSourceType");
  const set0 = await R.getReviewSettings(ctx);
  const eBelow = await fails(() => R.setReviewSettings(ctx, owner, { escalateBelow: 9 }));
  const eBoard = await fails(() => R.setReviewSettings(ctx, owner, { escalateBoardId: "no-such-board" }));
  const eThana = await fails(() => R.setReviewSettings(ctx, thanaReply, { rewardPoints: 10 }));
  await R.setReviewSettings(ctx, owner, { rewardPoints: 50, escalateBelow: 2, escalateBoardId: boardId, escalateAssigneeRole: "MANAGER", askAfterHours: 2, channel: "LINE" });
  const set1 = await R.getReviewSettings(ctx);
  chk("M3.4-S1.1", "migration member_v2_h: MemberReview {customerId systemId unitId refType refId serviceId staffEmployeeId rating body photoFileIds status replyBody repliedById repliedAt kanbanCardId requestSentAt requestTokenHash submittedAt hiddenReason source} unique(tenantId,refType,refId) index(systemId,rating) · ReviewStatus 5 (มี REQUESTED) · KanbanCardSourceType +REVIEW · settings ปริยาย {askAfterHours 2, channel LINE, rewardPoints 50, escalateBelow 2, escalateAssigneeRole MANAGER, googleReviewUrl null} · escalateBelow 9 → throw ไทย · บอร์ดไม่มี → throw · thana → throw · set แล้วอ่านกลับ escalateBoardId",
    ["customerId", "systemId", "unitId", "refType", "refId", "serviceId", "staffEmployeeId", "rating", "body", "photoFileIds", "status", "replyBody", "repliedById", "repliedAt", "kanbanCardId", "requestSentAt", "requestTokenHash", "submittedAt", "hiddenReason", "source"].every((c) => rc.has(c)) && (await hasIdx("MemberReview", ["tenantId", "refType", "refId"], true)) && (await hasIdx("MemberReview", ["systemId", "rating"])) && ["REQUESTED", "NEW", "REPLIED", "ESCALATED", "HIDDEN"].every((v) => st.includes(v)) && src.includes("REVIEW") && set0?.askAfterHours === 2 && set0.channel === "LINE" && set0.rewardPoints === 50 && set0.escalateBelow === 2 && set0.escalateAssigneeRole === "MANAGER" && set0.googleReviewUrl === null && thai(eBelow) && thai(eBoard) && !!eThana && set1?.escalateBoardId === boardId,
    "ครบ", `cols=${[...rc].length} st=${st.join(",")} src=${src.includes("REVIEW")} set0=${JSON.stringify(set0)} below=${thai(eBelow)} board=${thai(eBoard)} thana=${!!eThana} set1=${set1?.escalateBoardId === boardId}`);

  // ═══ S2 request → token → submit (1 ครั้ง/ref) ═══
  const X = await mkCust("รีวิวเวอร์");
  const s1 = await sale(3);
  const d1 = mkDeps();
  const rq = await R.requestReview(ctx, { customerId: X, refType: "PosSale", refId: s1!.id, unitId: E.units.patong }, { deps: d1.deps });
  made.reviews.push(rq?.reviewId);
  const row = await rv(rq?.reviewId);
  const act = await P.memberActivity.findFirst({ where: { customerId: X, type: "REVIEW_REQUESTED", refId: rq?.reviewId } });
  chk("M3.4-S2.1", "requestReview(X · PosSale) → {reviewId, token ≥ 32, url /m/<slug>/review/<token>, sent true (LINE ผ่าน deps · X มี LINE+ยินยอม)} · MemberReview status REQUESTED rating 0 requestSentAt requestTokenHash = sha256(token) · MemberActivity REVIEW_REQUESTED",
    !!rq?.reviewId && (rq.token ?? "").length >= 32 && new RegExp(`/m/${mq.MQC.tenantSlug}/review/${rq.token}`).test(rq.url ?? "") && rq.sent === true && d1.calls.length === 1 && row?.status === "REQUESTED" && row.rating === 0 && !!row.requestSentAt && row.requestTokenHash === sha256(rq.token) && !!act,
    "REQUESTED + token", `rq=${JSON.stringify({ id: !!rq?.reviewId, tok: rq?.token?.length, url: rq?.url, sent: rq?.sent })} row=${row?.status}/${row?.rating} hash=${row?.requestTokenHash === sha256(rq?.token)} act=${!!act} line=${d1.calls.length}`);
  const d1b = mkDeps();
  const rq2 = await R.requestReview(ctx, { customerId: X, refType: "PosSale", refId: s1!.id }, { deps: d1b.deps });
  const Y = await mkCust("ไม่มีไลน์");
  await P.memberChannelIdentity.deleteMany({ where: { customerId: Y } });
  const s2 = await sale(4);
  const rqY = await R.requestReview(ctx, { customerId: Y, refType: "PosSale", refId: s2!.id }, { deps: mkDeps().deps });
  made.reviews.push(rqY?.reviewId);
  chk("M3.4-S2.2", "ขอซ้ำ ref เดิม → {alreadyRequested true, reviewId เดิม} ไม่ส่ง LINE ซ้ำ (deps 0) · ลูกค้าไม่มี LINE identity → sent false แต่ยังได้ token (พนักงานส่งลิงก์เองได้)", rq2?.alreadyRequested === true && rq2.reviewId === rq.reviewId && d1b.calls.length === 0 && !!rqY?.reviewId && rqY.sent === false && (rqY.token ?? "").length >= 32, "idempotent", `rq2=${JSON.stringify({ a: rq2?.alreadyRequested, same: rq2?.reviewId === rq?.reviewId })} line=${d1b.calls.length} y=${JSON.stringify({ sent: rqY?.sent, tok: rqY?.token?.length })}`);
  const b0 = await bal(X);
  const eRating = await fails(() => R.submitReview({ token: rq.token, rating: 6, body: "x" }));
  const ePhotos = await fails(() => R.submitReview({ token: rq.token, rating: 5, body: "x", photoFileIds: ["a", "b", "c", "d"] }));
  const eTok = await fails(() => R.submitReview({ token: "no-such-token-000000000000000000", rating: 5 }));
  const sub = await R.submitReview({ token: rq.token, rating: 5, body: "ครูสอนดีมาก อุปกรณ์พร้อม แนะนำเลยครับ", photoFileIds: ["file-1", "file-2"] });
  made.ledgerKeys.push(`review:${rq.reviewId}`);
  const row2 = await rv(rq.reviewId);
  const ob = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "review.received", payload: { path: ["reviewId"], equals: rq.reviewId } } });
  chk("M3.4-S2.3", "submitReview: rating 6 → throw ไทย · รูป 4 → throw · token ไม่มี → throw · ถูกต้อง (5 ดาว + 2 รูป) → {reviewId, pointsEarned 50, escalated false} · status NEW submittedAt body photoFileIds 2 · requestTokenHash ล้าง · event review.received {customerId, reviewId, rating 5, refType, refId}",
    thai(eRating) && thai(ePhotos) && thai(eTok) && sub?.reviewId === rq.reviewId && sub.pointsEarned === 50 && sub.escalated === false && row2?.status === "NEW" && !!row2.submittedAt && row2.rating === 5 && row2.photoFileIds?.length === 2 && !row2.requestTokenHash && !!ob && ob.payload.rating === 5 && ob.payload.refId === s1!.id,
    "NEW + 50 แต้ม", `e=${thai(eRating)}/${thai(ePhotos)}/${thai(eTok)} sub=${JSON.stringify(sub)} row=${row2?.status}/${row2?.rating}/${row2?.photoFileIds?.length}/${!row2?.requestTokenHash} ob=${!!ob}`);
  const eReuse = await fails(() => R.submitReview({ token: rq.token, rating: 4 }));
  const b1 = await bal(X);
  chk("M3.4-S2.4", "token ใช้ซ้ำ → throw ไทย (1 รีวิวต่อ ref) · rating ยัง 5 · แต้ม +50 ครั้งเดียว (ledger EARN refType REVIEW refId reviewId)", thai(eReuse) && (await rv(rq.reviewId))?.rating === 5 && b1 - b0 === 50 && !!(await prisma.pointLedger.findFirst({ where: { customerId: X, refType: "REVIEW" as Any, refId: rq.reviewId } })), "ครั้งเดียว", `reuse=${thai(eReuse)} bal=${b1 - b0}`);

  // ═══ S3 แต้มรีวิวตาม settings ═══
  await R.setReviewSettings(ctx, owner, { rewardPoints: 0 });
  const Z = await mkCust("ไม่ได้แต้ม");
  const s3 = await sale(5);
  const rqZ = await R.requestReview(ctx, { customerId: Z, refType: "PosSale", refId: s3!.id }, { deps: mkDeps().deps });
  made.reviews.push(rqZ?.reviewId);
  const bz0 = await bal(Z);
  const subZ = await R.submitReview({ token: rqZ.token, rating: 4, body: "ดี" });
  chk("M3.4-S3.1", "settings.rewardPoints 0 → submit ได้แต่ pointsEarned 0 · ไม่มี ledger REVIEW", subZ?.pointsEarned === 0 && (await bal(Z)) === bz0 && !(await prisma.pointLedger.findFirst({ where: { customerId: Z, refType: "REVIEW" as Any } })), "0 แต้ม", `sub=${JSON.stringify(subZ)} bal=${await bal(Z)}/${bz0}`);
  await R.setReviewSettings(ctx, owner, { rewardPoints: 30 });
  const W = await mkCust("สามสิบ");
  const s4 = await sale(6);
  const rqW = await R.requestReview(ctx, { customerId: W, refType: "PosSale", refId: s4!.id }, { deps: mkDeps().deps });
  made.reviews.push(rqW?.reviewId); made.ledgerKeys.push(`review:${rqW?.reviewId}`);
  const subW = await R.submitReview({ token: rqW.token, rating: 3, body: "พอใช้" });
  chk("M3.4-S3.2", "settings.rewardPoints 30 → pointsEarned 30 · balance +30 · rating 3 (> escalateBelow 2) ไม่ escalate", subW?.pointsEarned === 30 && (await bal(W)) === 30 && subW.escalated === false && (await rv(rqW.reviewId))?.status === "NEW", "30 แต้ม", `sub=${JSON.stringify(subW)} bal=${await bal(W)}`);

  // ═══ S4 escalate → การ์ด + มอบหมาย ═══
  const L = await mkCust("ผิดหวัง");
  const s5 = await sale(7);
  const rqL = await R.requestReview(ctx, { customerId: L, refType: "PosSale", refId: s5!.id, unitId: E.units.patong }, { deps: mkDeps().deps });
  made.reviews.push(rqL?.reviewId); made.ledgerKeys.push(`review:${rqL?.reviewId}`);
  const subL = await R.submitReview({ token: rqL.token, rating: 2, body: "รอคิวรับอุปกรณ์นานเกินไป พนักงานดูวุ่นมาก" });
  const rowL = await rv(rqL.reviewId);
  const card = rowL?.kanbanCardId ? await P.kanbanCard.findUnique({ where: { id: rowL.kanbanCardId }, include: { assignees: true } }).catch(() => P.kanbanCard.findUnique({ where: { id: rowL.kanbanCardId } })) : null;
  if (rowL?.kanbanCardId) made.cards.push(rowL.kanbanCardId);
  const assigneeIds: string[] = card?.assignees?.map((a: Any) => a.userId) ?? (await P.kanbanCardAssignee?.findMany?.({ where: { cardId: rowL?.kanbanCardId ?? "-" } }).catch(() => []))?.map((a: Any) => a.userId) ?? [];
  chk("M3.4-S4.1", "2 ดาว (≤ escalateBelow 2) → escalated true · status ESCALATED · kanbanCardId → KanbanCard ในบอร์ด escalateBoardId sourceType REVIEW sourceKey review:<id> · title มี 'รีวิว 2 ดาว' + ชื่อ · description = ข้อความรีวิว · มอบหมายผู้จัดการ (role MANAGER · manager ป่าตอง)",
    subL?.escalated === true && rowL?.status === "ESCALATED" && !!card && card.boardId === boardId && card.sourceType === "REVIEW" && card.sourceKey === `review:${rqL.reviewId}` && /รีวิว 2 ดาว/.test(card.title ?? "") && /รอคิว/.test(card.description ?? "") && assigneeIds.includes(manager.userId),
    "การ์ด + มอบหมาย", `sub=${JSON.stringify(subL)} st=${rowL?.status} card=${JSON.stringify({ board: card?.boardId === boardId, src: card?.sourceType, key: card?.sourceKey, title: card?.title })} assignees=${assigneeIds.length}/${assigneeIds.includes(manager.userId)}`);
  const esc2 = await R.escalate(ctx, rqL.reviewId);
  chk("M3.4-S4.2", "escalate ซ้ำ → การ์ดเดิม (sourceKey idempotent · created false) · kanbanCardId เท่าเดิม · ไม่มีการ์ดเพิ่มในบอร์ด", esc2?.cardId === rowL?.kanbanCardId && esc2.created === false && (await P.kanbanCard.count({ where: { boardId, sourceKey: `review:${rqL.reviewId}` } })) === 1, "idempotent", `esc2=${JSON.stringify(esc2)} n=${await P.kanbanCard.count({ where: { boardId, sourceKey: `review:${rqL.reviewId}` } })}`);
  await R.setReviewSettings(ctx, owner, { escalateBoardId: null });
  await P.kanbanBoard.updateMany({ where: { tenantId: tid, id: boardId }, data: { status: "ARCHIVED" } }).catch(() => null);
  const nBefore = await P.appNotification.count({ where: { tenantId: tid } });
  const L2 = await mkCust("ผิดหวังสอง", E.units.kata);
  const s6 = await sale(45);
  const rqL2 = await R.requestReview(ctx, { customerId: L2, refType: "PosSale", refId: s6!.id, unitId: E.units.kata }, { deps: mkDeps().deps });
  made.reviews.push(rqL2?.reviewId); made.ledgerKeys.push(`review:${rqL2?.reviewId}`);
  const subL2 = await R.submitReview({ token: rqL2.token, rating: 1, body: "แย่มาก" });
  const rowL2 = await rv(rqL2.reviewId);
  await P.kanbanBoard.updateMany({ where: { tenantId: tid, id: boardId }, data: { status: "ACTIVE" } }).catch(() => null);
  await R.setReviewSettings(ctx, owner, { escalateBoardId: boardId });
  chk("M3.4-S4.3", "ไม่มีบอร์ดใช้ได้ (escalateBoardId null + บอร์ดถูกเก็บ) → status ESCALATED kanbanCardId null + AppNotification แจ้งผู้จัดการ +1 (title ไทย) · ไม่ throw ให้ลูกค้า (submit สำเร็จ)", subL2?.escalated === true && rowL2?.status === "ESCALATED" && rowL2.kanbanCardId === null && (await P.appNotification.count({ where: { tenantId: tid } })) === nBefore + 1, "แจ้งแทนการ์ด", `sub=${JSON.stringify(subL2)} st=${rowL2?.status}/${rowL2?.kanbanCardId} notif=${await P.appNotification.count({ where: { tenantId: tid } })}/${nBefore + 1}`);

  // ═══ S5 reply / hide / คะแนนรวม ═══
  const d5 = mkDeps();
  const eEmpty = await fails(() => R.reply(ctx, owner, rqL.reviewId, { body: " " }, { deps: d5.deps }));
  const ePerm = await fails(() => R.reply(ctx, thana0, rqL.reviewId, { body: "x" }, { deps: d5.deps }));
  const rp = await R.reply(ctx, thanaReply, rqL.reviewId, { body: "ต้องขออภัยในความล่าช้าค่ะ ทางร้านได้ปรับระบบคิวแล้ว" }, { deps: d5.deps });
  const rowR = await rv(rqL.reviewId);
  const obR = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "review.replied", payload: { path: ["reviewId"], equals: rqL.reviewId } } });
  const rp2 = await R.reply(ctx, thanaReply, rqL.reviewId, { body: "ต้องขออภัยในความล่าช้าค่ะ ทางร้านได้ปรับระบบคิวแล้ว" }, { deps: d5.deps });
  const nR = await P.outboxEvent.count({ where: { tenantId: tid, type: "review.replied", payload: { path: ["reviewId"], equals: rqL.reviewId } } });
  chk("M3.4-S5.1", "reply: body ว่าง → throw ไทย · thana ไม่มี review.reply → throw · thana (มีสิทธิ์) ตอบรีวิว ESCALATED → REPLIED replyBody repliedById repliedAt · ส่ง LINE ให้ลูกค้า (deps 1) · event review.replied · ตอบซ้ำข้อความเดิม → idempotent (event 1 · LINE ไม่ส่งซ้ำ)", thai(eEmpty) && !!ePerm && rp?.ok === true && rowR?.status === "REPLIED" && rowR.repliedById === thanaReply.userId && !!rowR.repliedAt && d5.calls.length === 1 && !!obR && rp2?.ok === true && nR === 1 && d5.calls.length === 1, "REPLIED ครั้งเดียว", `empty=${thai(eEmpty)} perm=${!!ePerm} rp=${JSON.stringify(rp)} st=${rowR?.status} line=${d5.calls.length} ob=${nR}`);
  const eKata = await fails(() => R.reply(ctx, { ...kata, permissions: { ...kata.permissions, "member.review.reply": true } }, rqL.reviewId, { body: "x" }, { deps: mkDeps().deps }));
  const hd = await R.hide(ctx, owner, rqL2.reviewId, { reason: "สแปม" });
  const rowH = await rv(rqL2.reviewId);
  const st1 = await R.reviewStats(ctx, owner, { days: 30 });
  const expRatings = [5, 4, 3, 2];
  const expAvg = expRatings.reduce((a, b) => a + b, 0) / expRatings.length;
  chk("M3.4-S5.2", "unit scope: พนักงานกะตะ (มีสิทธิ์ตอบ) ตอบรีวิวของสาขาป่าตอง → throw ไม่พบ · hide(รีวิว 1 ดาว) → HIDDEN hiddenReason · reviewStats 30 วัน ไม่นับ HIDDEN/REQUESTED: count 4 (5,4,3,2) avg 3.5 · repliedPct 25 (1/4) · lowCount 1 (≤ 2) · distribution {5:1,4:1,3:1,2:1,1:0}", thai(eKata) && hd?.ok === true && rowH?.status === "HIDDEN" && rowH.hiddenReason === "สแปม" && st1?.count === 4 && Math.abs(st1.avg - expAvg) < 0.01 && st1.repliedPct === 25 && st1.lowCount === 1 && st1.distribution?.[5] === 1 && st1.distribution?.[2] === 1 && st1.distribution?.[1] === 0, "stats ตรง", `kata=${thai(eKata)} hd=${JSON.stringify(hd)} st=${rowH?.status} stats=${JSON.stringify(st1)}`);
  const list = await R.listReviews(ctx, owner, { take: 50 });
  const listLow = await R.listReviews(ctx, owner, { rating: 2, take: 50 });
  const listUn = await R.listReviews(ctx, owner, { unreplied: true, take: 50 });
  const listHidden = await R.listReviews(ctx, owner, { includeHidden: true, take: 50 });
  const listThana = await R.listReviews(ctx, thana0, { take: 50 });
  chk("M3.4-S5.3", "listReviews: ไม่รวม REQUESTED (Y) และ HIDDEN → 4 · items มี customer{name, memberCode} rating body status kanbanCardNo (รีวิว 2 ดาว มี) · rating 2 → 1 · unreplied → 3 · includeHidden → 5 · thana (ป่าตอง) เห็นเฉพาะรีวิว unit ป่าตอง/ไม่ระบุ", list?.items?.length === 4 && list.items.every((r: Any) => !!r.customer?.name && !!r.customer?.memberCode && "status" in r) && list.items.find((r: Any) => r.id === rqL.reviewId)?.kanbanCardNo != null && listLow?.items?.length === 1 && listUn?.items?.length === 3 && listHidden?.items?.length === 5 && listThana?.items?.every((r: Any) => !r.unit || r.unit?.id === E.units.patong), "กรองถูก", `all=${list?.items?.length} low=${listLow?.items?.length} un=${listUn?.items?.length} hidden=${listHidden?.items?.length} thana=${listThana?.items?.length}`);
  const unh = await R.unhide(ctx, owner, rqL2.reviewId);
  const forX = await R.reviewsForMember(ctx, owner, X);
  const sum360 = await R.shopSummaryFor360(ctx);
  const m360 = await M.getMember360(ctx, owner, X);
  const kpi = await M.memberKpis?.(ctx, owner).catch(() => null);
  chk("M3.4-S5.4", "unhide → กลับ ESCALATED (ไม่มี reply) · reviewsForMember(X) = 1 รายการ 5 ดาว · shopSummaryFor360 {avg, count 5, distribution} · getMember360(X).counters.reviewAvg = 5 (ไม่ใช่ null อีกต่อไป) · MemberKpis.reviewAvg เป็นตัวเลข", unh?.ok === true && (await rv(rqL2.reviewId))?.status === "ESCALATED" && forX?.length === 1 && forX[0].rating === 5 && sum360?.count === 5 && typeof sum360.avg === "number" && m360?.counters?.reviewAvg === 5 && (kpi === null || typeof kpi?.reviewAvg === "number"), "ค่าจริงใน 360", `unh=${(await rv(rqL2.reviewId))?.status} forX=${forX?.length} sum=${JSON.stringify(sum360)} c=${m360?.counters?.reviewAvg} kpi=${kpi?.reviewAvg}`);

  // ═══ S6 AI summary cache ═══
  // ORACLE-EDIT M3.4-S6.1: หน้า inbox (ภาพ 23) เรียก summarize ตอนเรนเดอร์ → แคชของวันนี้อาจมีอยู่แล้วจาก harness/รอบก่อน · ล้างก่อนวัด "ครั้งแรก cached false" แล้วคืนค่าเดิมตอนจบ
  {
    const s0 = ((await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {}) as Any;
    const prevCache = s0?.member?.reviewSummary;
    if (prevCache !== undefined) {
      await prisma.appSystem.update({ where: { id: SYS }, data: { settings: { ...s0, member: { ...(s0.member ?? {}), reviewSummary: {} } } } });
      restore.push(async () => { const cur = ((await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {}) as Any; await prisma.appSystem.update({ where: { id: SYS }, data: { settings: { ...cur, member: { ...(cur.member ?? {}), reviewSummary: prevCache } } } }); });
    }
  }
  const sm1 = await R.summarize(ctx, owner, {});
  const sm2 = await R.summarize(ctx, owner, {});
  const sysRow = await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } });
  const cache = (sysRow?.settings as Any)?.member?.reviewSummary;
  chk("M3.4-S6.1", "summarize (SHARK_AI_MOCK=1): ครั้งแรก cached false · {strengths, frequent, trend} เป็นข้อความ · generatedAt · เก็บใน AppSystem.settings.member.reviewSummary[เดือน] · ครั้งที่ 2 วันเดียวกัน → cached true ผลเดิม", sm1?.cached === false && typeof sm1.strengths === "string" && typeof sm1.frequent === "string" && typeof sm1.trend === "string" && !!sm1.generatedAt && !!cache && Object.keys(cache).length >= 1 && sm2?.cached === true && sm2.generatedAt === sm1.generatedAt, "cache รายวัน", `sm1=${JSON.stringify(sm1).slice(0, 160)} sm2=${JSON.stringify({ c: sm2?.cached, same: sm2?.generatedAt === sm1?.generatedAt })} cache=${!!cache}`);
  const rsrc = read("src/lib/modules/member/reviews.ts");
  const draft = await R.draftReply(ctx, owner, rqW.reviewId);
  const sm3 = await R.summarize(ctx, owner, {}, { force: true });
  chk("M3.4-S6.2", "draftReply → {text} ไม่ว่าง (mock 'รับทราบ…') · prompt เป็นอังกฤษ + ไม่ส่งชื่อ/เบอร์ลูกค้า (โค้ดไม่ใส่ customer.name/phone ลง prompt · มี 'English' หรือ prompt ภาษาอังกฤษ) · summarize {force} → cached false ใหม่", typeof draft?.text === "string" && draft.text.length > 0 && !/prompt[^\n]*(phone|firstName|displayName)/i.test(rsrc) && /Summarize|summarize the|You are|Draft a reply|reviews below/i.test(rsrc) && sm3?.cached === false, "AI ปลอดภัย", `draft=${draft?.text?.slice(0, 40)} en=${/Summarize|summarize the|You are|Draft a reply|reviews below/i.test(rsrc)} force=${sm3?.cached}`);

  // ═══ S7 events ═══
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(CONS, { limit: 300 }); await drainOutbox(CONS, { limit: 300 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: { startsWith: "review." }, status: { not: "DONE" } } });
  chk("M3.4-S7.1", "review.received / review.replied (+ review.requested) ลง 3 ทะเบียน + consumer · drain แล้ว DONE ทั้งหมด", in3("review.received") && in3("review.replied") && in3("review.requested") && stuck === 0, "ครบ", `reg=${in3("review.received")}/${in3("review.replied")}/${in3("review.requested")} stuck=${stuck}`);
  const jsrc = read("src/lib/modules/member/journeys.ts"); const bridges = read("src/lib/member-bridges.ts");
  chk("M3.4-S7.2", "journey action REQUEST_REVIEW เรียก reviews.requestReview จริง (ไม่ใช่ stub MemberActivity) · facade member/index.ts export requestReview/submitReview/reply/hide/unhide/escalate/listReviews/reviewStats/reviewsForMember/shopSummaryFor360/summarize/draftReply/getReviewSettings/setReviewSettings · reviews.ts import kanban ผ่าน @/lib/modules/kanban/links เท่านั้น (เส้น member→kanban) · ไม่มี any", /requestReview/.test(jsrc) && ["requestReview", "submitReview", "reply", "hide", "unhide", "escalate", "listReviews", "reviewStats", "reviewsForMember", "shopSummaryFor360", "summarize", "draftReply", "getReviewSettings", "setReviewSettings"].every((f) => new RegExp(`\\b${f}\\b`).test(read("src/lib/modules/member/index.ts"))) && /@\/lib\/modules\/kanban\/links/.test(rsrc) && !/@\/lib\/modules\/(point|chat|pos|booking)\/(?!index)[a-z-]+"/.test(rsrc) && !/:\s*any\b/.test(rsrc), "ต่อครบ", `journey=${/requestReview/.test(jsrc)} kanban=${/@\/lib\/modules\/kanban\/links/.test(rsrc)}`);

  // ═══ S8 UI / ภาพ ═══
  const pages = { inbox: read("src/app/app/sys/[id]/member/reviews/page.tsx"), liff: read("src/app/m/[slug]/review/[token]/page.tsx") };
  const actSrc = read("src/lib/modules/member/reviews-actions.ts");
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /review|Member360/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const all = Object.values(pages).join("\n") + comps;
  const TIDS = ["reviews-page", "reviews-kpi", "reviews-filter", "reviews-list", "review-row-", "review-reply-box", "review-ai-draft", "review-reply-send", "review-escalated-badge", "reviews-ai-summary", "reviews-settings", "reviews-settings-form", "member-reviews-tab", "member-reviews-summary", "m-review", "m-review-stars", "m-review-submit", "m-review-thanks"];
  const missingT = TIDS.filter((t) => !all.includes(t));
  const LABELS = ["เฉลี่ย 30 วัน", "รีวิว", "ตอบกลับแล้ว", "ดาว", "การ์ดบอร์ดงาน", "ยังไม่ตอบ", "รีวิวล่าสุด", "ตอบกลับ", "ให้ AI ร่างคำตอบ", "ส่งคำตอบ", "เปิดการ์ด", "AI สรุปรีวิวเดือนนี้", "จุดแข็ง", "ถูกพูดถึงบ่อย", "แนวโน้ม", "ตั้งค่า", "ขอรีวิวหลัง", "ให้แต้ม", "เปิดการ์ดในบอร์ด", "มอบหมาย", "เชิญรีวิว Google", "เก็บในระบบ", "รีวิวร้าน"];
  const missingL = LABELS.filter((l) => !all.includes(l));
  const nav = read("src/lib/modules/member/nav.ts");
  chk("M3.4-S8.1", "หน้า /member/reviews + LIFF /m/[slug]/review/[token] มีจริง · inbox requireTenant + review.read (read-โดยนัย) · LIFF ไม่ต้อง session (token) · actions 'use server' gate review.reply/settings.manage · testid 18 · ป้ายภาพ 23/08 ครบ · nav มีทางเข้า reviews · ไม่มีอีโมจิ/hex (ดาวใช้ MemberIcon/SVG)", Object.values(pages).every((p) => p.length > 0) && /requireTenant/.test(pages.inbox) && !/requireTenant\(/.test(pages.liff) && /["']use server["']/.test(actSrc) && /review\.reply/.test(actSrc) && missingT.length === 0 && missingL.length === 0 && /reviews/.test(nav) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(all.replace(/\/\/.*$/gm, "")), "ครบ", `pages=${Object.values(pages).map((p) => p.length > 0).join("/")} tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.4`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.4-S8.2", "ภาพ 23: reviews-owner desktop+mobile 200 ไม่ล้น (KPI 4 · ตัวกรอง · รายการ ≥ 3 รวมใบ 2 ดาวที่มีป้ายเปิดการ์ด · AI สรุป · ตั้งค่า) · ภาพ 08 ขวา: member-reviews-owner 200 (แท็บรีวิวใน 360 · กล่องรีวิวร้าน)", ok("owner", "reviews-owner", "desktop") && ok("owner", "reviews-owner", "mobile") && ok("owner", "member-reviews-owner", "desktop"), "200 ×3", `${r("owner", "reviews-owner", "desktop")?.status}/${r("owner", "reviews-owner", "mobile")?.status}/${r("owner", "member-reviews-owner", "desktop")?.status} missing=${JSON.stringify(r("owner", "reviews-owner", "desktop")?.missing)}`);
  chk("M3.4-S8.3", "🔴 parity ภาพ 23 + 08 (ขวา) — Fable ตรวจด้วยตา · wo-notes/member-M3.4.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.4.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");

  // ═══ S9 LIFF ภาพ ═══
  const custKey = `customer:${m(1).memberCode}`;
  chk("M3.4-S9.1", "LIFF: m-review (--user customer:<สมาชิก 1> · token จาก TMP34) mobile 200 (ดาว 5 · ข้อความ · รูป ≤ 3 · ปุ่มส่ง) · m-review-thanks 200 หลังส่ง (ขอบคุณ + แต้มที่ได้)", ok(custKey, "m-review", "mobile") && ok(custKey, "m-review-thanks", "mobile"), "200 ×2", `${r(custKey, "m-review", "mobile")?.status}/${r(custKey, "m-review-thanks", "mobile")?.status} missing=${JSON.stringify(r(custKey, "m-review", "mobile")?.missing)}`);
  chk("M3.4-S9.2", "LIFF token ใช้แล้ว (หลังถ่าย thanks) เปิดซ้ำ → หน้าแจ้ง 'รีวิวไปแล้ว' (m-review-done) ไม่ crash · token มั่ว → 404/ข้อความไทย (m-review-invalid)", ok(custKey, "m-review-done", "mobile") && (r("owner", "m-review-invalid", "mobile")?.status === 404 || ok("owner", "m-review-invalid", "mobile")), "ปลอดภัย", `${r(custKey, "m-review-done", "mobile")?.status} invalid=${r("owner", "m-review-invalid", "mobile")?.status}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.4-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.cards.length) { await d(() => P.kanbanCardAssignee?.deleteMany?.({ where: { cardId: { in: made.cards } } })); await d(() => P.kanbanCardLink?.deleteMany?.({ where: { cardId: { in: made.cards } } })); await d(() => P.kanbanCard.deleteMany({ where: { id: { in: made.cards } } })); }
  if (made.boards.length) { await d(() => P.kanbanCard.deleteMany({ where: { boardId: { in: made.boards } } })); await d(() => P.kanbanColumn.deleteMany({ where: { boardId: { in: made.boards } } })); await d(() => P.kanbanBoard.deleteMany({ where: { id: { in: made.boards } } })); }
  await d(() => P.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 3600_000) }, title: { contains: "รีวิว" } } }));
  if (made.reviews.length) { await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refId: { in: made.reviews } } })); await d(() => P.memberReview.deleteMany({ where: { id: { in: made.reviews.filter(Boolean) } } })); }
  if (made.ledgerKeys.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: tid, idempotencyKey: { in: made.ledgerKeys } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]); await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } })); await d(() => prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberReview", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["review.", "point.", "member.", "kanban."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
