// member/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2 · พิมพ์เขียว §5.11)
//
// 🔴 กติกา: โมดูลอื่น (POS · จอง · แชท · CRM · ฟอร์ม · บอร์ดงาน · AI · REST) เรียกผ่านไฟล์นี้เท่านั้น
//    ห้าม import `member/profile` หรือ `member/service` ตรง — ไฟล์นี้คือสัญญาที่เราจะไม่หักกลางทาง
// 🔴 ไฟล์นี้ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจ (ตรรกะอยู่ที่ profile.ts / service.ts / fields.ts)
// 🔴 ผู้เรียกภายในโมดูลสมาชิกเอง (หน้า/action ของโมดูล) import ไฟล์ย่อยตรงได้ตามปกติ

export type {
  MemberBrief,
  Member360,
  Member360Section,
  Member360Field,
  MemberIdentityDto,
  MemberConsentDto,
  MemberAttributionDto,
  CreateMemberInput,
  CreateMemberResult,
  UpdateMemberInput,
  LinkIdentityInput,
  LinkIdentityResult,
  DuplicatePairDto,
  MergeInput,
  MergeResult,
  MergeHook,
  MemberCtx,
} from "./profile";

export type { MemberActor } from "./access";
// `hasMemberPerm` เปิดผ่าน facade (M2.6) — โมดูลที่ถือของมีมูลค่าของสมาชิก (บัตรกำนัล/voucher)
// ต้องตัดสินคีย์ `member.*` ด้วยกติกาเดียวกับโมดูลสมาชิก (§6.1 · MANAGER ไม่ได้ 4 คีย์ยกเว้นโดยปริยาย)
// ⇒ ห้าม copy ตรรกะไปไว้ที่โมดูลตัวเอง (ด่านที่ก๊อปไว้หลายที่ = วันหนึ่งจะไม่ตรงกันเงียบ ๆ)
export { toMemberActor, hasMemberPerm, canReadMember } from "./access";
export { MemberNotFoundError, MemberForbiddenError, MemberInputError, MemberConflictError } from "./errors";
// M2.4 — โมดูลที่บังคับเพดานของตัวเอง (รางวัล/voucher ฯลฯ) อ่านค่า/สร้าง error เพดานผ่านทะเบียนกลางนี้
// (ทะเบียนเดียว = ข้อความ "ถึงเพดานแพ็กเกจ" คำเดียวกันทั้งระบบ — ห้าม copy ไปประกาศเองที่โมดูลอื่น)
export { MEMBER_LIMITS, memberLimitError } from "./limits";

// ── ระบบสมาชิก v2 (M1.4) ──
export {
  /** สมัครสมาชิกใหม่ (ตรวจซ้ำเบอร์/อีเมลให้เอง — ซ้ำ = คืนคนเดิมพร้อมการ์ดย่อ ไม่สร้างซ้ำ) */
  createMember,
  /** แก้ไขข้อมูลสมาชิก (ฟิลด์ระบบ/ฟิลด์กำหนดเอง · แท็ก · สถานะ · ผู้ดูแล · สาขาหลัก) */
  updateMember,
  setStatus,
  setOwner,
  setTags,
  /** โปรไฟล์ 360° (ซ่อนข้อมูลอ่อนไหวตามนโยบายของร้าน + บันทึกการเปิดดู) */
  getMember360,
  /** ผูก id ช่องทางภายนอกเข้ากับสมาชิก (D18 — แชท/อีคอมเมิร์ซ/LIFF เรียกตัวนี้) */
  linkIdentity,
  listIdentities,
  unlinkIdentity,
  /** คนซ้ำ/รวมคน */
  findDuplicates,
  dismissDuplicate,
  mergeMembers,
  mergeMembersApproved,
  /** hook ให้โมดูลที่ถือของมีมูลค่าย้ายของตัวเองตอนรวมคน (M2.x: voucher/สแตมป์/บัตรกำนัล) */
  onMerge,
  /** การ์ดสมาชิกแบบย่อสำหรับแผงข้างของโมดูลอื่น (กรองตามขอบเขตสาขาของผู้ดู) */
  briefFor,
  /** M2.6 — "id นี้เป็นสมาชิกของระบบนี้ไหม + ชื่ออะไร" (ไม่มีข้อมูลติดต่อ · ใช้ในงานเบื้องหลัง) */
  memberRefs,
  maskPhone,
} from "./profile";

export type { MemberRef } from "./profile";

// ── แชท + สมาชิก (M1.12 · §3.14 §5.11 §9.3) ──
export type {
  LinkContactInput,
  LinkContactResult,
  ChatPanelResult,
  ChatMemberInfo,
  ChatMemberStatsDto,
  ChatMemberCardFieldDto,
  ChatMemberIdentityDto,
  ChatMemberQuickActions,
  ChatMemberHistoryItem,
  RegisterFromChatInput,
  RegisterFromChatResult,
} from "./chat-bridge";

export {
  /** ผูกห้องแชท (ChatContact.id) เข้ากับสมาชิก — อัตโนมัติ (เบอร์→อีเมล→id ช่องทางเดิม) หรือเลือกมือ (MANUAL) */
  linkContact,
  /** DTO ของแผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26) — ผูกแล้ว/candidates/ผูกรวม */
  chatPanelFor,
  /** สมัครสมาชิกใหม่จากห้องแชทโดยตรง แล้วผูกห้องนี้ให้ทันที */
  registerFromChat,
} from "./chat-bridge";

export { canViewSensitive, logAccess } from "./privacy";

// ── กระเป๋าสิทธิ์ (M2.7 · §5.8 §9.1) ──
// 🔴 จุดเดียวที่ POS / จอง / LIFF / REST ถามเรื่อง "สิทธิ์ของลูกค้าคนนี้" ได้ — ห้ามไปเรียก
//    voucher/giftcard/point/stamp/coupon ตรงเองแล้วประกอบลำดับส่วนลดเอง (ลำดับ = สัญญา §9.1
//    ถ้าแต่ละที่คิดเอง วันหนึ่งยอดที่หน้าขายกับยอดใน LIFF จะไม่ตรงกันเงียบ ๆ)
export type {
  WalletCart,
  WalletCartLine,
  WalletChoices,
  WalletGiftCardChoice,
  WalletDto,
  WalletVoucherDto,
  WalletCouponDto,
  QuoteKind,
  QuoteLine,
  QuoteConflict,
  QuoteResult,
  ApplyOnSaleInput,
  ApplyOnSaleResult,
} from "./wallet";

export {
  /** ทุกสิทธิ์ที่สมาชิกคนนี้ถืออยู่ (แต้ม/voucher/คูปอง/บัตรกำนัล/รางวัลรอรับ/สแตมป์/สิทธิ์ระดับ) */
  getWallet,
  /** "ใช้สิทธิ์ชุดนี้กับตะกร้านี้แล้วเหลือเท่าไหร่" — อ่านอย่างเดียว ลำดับตายตัว + เหตุผลไทยเมื่อใช้ไม่ได้ */
  quoteApply,
  /** ตัดสิทธิ์จริงใน transaction ของบิล (POS เรียกตอนปิดบิล) */
  applyOnSale,
  /** บิลถูกยกเลิก → คืนสิทธิ์ทุกชนิด (idempotent) */
  releaseOnVoid,
  /** ลำดับการใช้สิทธิ์ที่หน้าจอเอาไปโชว์เป็นชิปได้ตรง ๆ */
  WALLET_ORDER,
} from "./wallet";

/**
 * M2.6 — จุดตัดเงิน POS ที่ผูกสาขาเดียวกับ "ระบบสมาชิก" นี้ (+ ระบบแต้มถ้ามี)
 * โมดูลที่ต้องเก็บเงินผ่าน POS (บัตรกำนัล · แพ็กเกจสมาชิก) ถามที่นี่ที่เดียว — ไม่ต้องรู้จัก `system/service`
 * null = ร้าน standalone ที่ยังไม่ผูก POS
 */
export { resolvePosForMember } from "./subscription";

// ── ความเป็นส่วนตัว / PDPA (M1.7 · D8 · D17 · D19) ──
export type {
  PolicyVersionDto,
  ConsentDto,
  SensitivePolicyDto,
  SetSensitivePolicyInput,
  HrPositionsSummary,
  AccessLogDto,
  AccessLogFilter,
  PrivacyRequestDto,
  ExportBundle,
} from "./privacy";

export {
  /** นโยบายความเป็นส่วนตัวที่บังคับใช้อยู่ (LIFF/หน้าเว็บลูกค้าเรียกตัวนี้) */
  currentPolicy,
  /** ลูกค้ากดยอมรับนโยบายเวอร์ชันหนึ่ง */
  acceptPolicy,
  /** ความยินยอมรายช่องทางของสมาชิก (D19) */
  getConsents,
  setConsent,
  /** สำเนาข้อมูลทั้งหมดของสมาชิก (PDPA) */
  exportBundle,
  requestExport,
  /** คำขอลบข้อมูล — ผ่านสายอนุมัติกลางเสมอ */
  requestErase,
  /** ผลของการอนุมัติคำขอลบ — เรียกจาก approval-effects เท่านั้น */
  applyEraseApproved,
  /** cron รายวัน: สร้างคำขอลบให้สมาชิกที่ไม่เคลื่อนไหวเกินจำนวนปีที่ร้านตั้งไว้ */
  sweepAutoErase,
} from "./privacy";

// ── ฝั่งลูกค้า `/m/*` (M2.9 · §3.10 §6.3) ──
// 🔴 จุดเดียวที่โมดูลอื่น (POS/แอปพนักงาน/REST) ถามเรื่อง "ตัวตนของลูกค้า" และ "บัตรสมาชิก QR" ได้
//    ห้ามอ่านตาราง CustomerSession/Customer.cardTokenHash เองจากโมดูลอื่นเด็ดขาด
export type { CustomerSessionInfo, CustomerSessionToken } from "./customer-session";
export {
  /** อ่าน session ลูกค้าจาก token ของ cookie `shark_customer` (หมดอายุ/เพิกถอน = null) */
  getCustomerSession,
  /** ออก session ให้ลูกค้า (หลังสมัคร/เครื่องมือดูแลระบบ/QC harness) */
  mintCustomerSession,
  revokeCustomerSession,
  /** cron รายวัน: ลบ OTP/session ที่หมดอายุแล้วทุกร้าน */
  sweepCustomerAuth,
} from "./customer-session";

export type { CardLookupDto, MeCardDto, MeDto } from "./me";
export {
  /** พนักงานสแกน QR บัตรสมาชิก → การ์ดย่อ (หมดอายุ/คนละร้าน = null) */
  resolveCardToken,
  /** บัตรสมาชิกของลูกค้าคนนั้น (ต้องเป็น actor ลูกค้าเจ้าของบัตรเท่านั้น) */
  meCard,
  meGet,
  meUpdate,
} from "./me";

// ── ทางเข้าเดิม (v1) ที่โมดูลอื่นใช้อยู่แล้ว — คงสัญญาไว้ทุกตัว ──
export {
  /** หา/สร้างสมาชิกจากเบอร์→อีเมล (แชท/POS/จอง เรียกอยู่) */
  findOrCreate,
  /** บันทึกกิจกรรมลงไทม์ไลน์ของสมาชิก */
  logActivity,
  /** บันทึกยอดใช้จ่าย + เลื่อนระดับตามเกณฑ์ของร้าน */
  recordSpend,
  /** นับจำนวนครั้งที่มาใช้บริการ */
  recordVisit,
} from "./service";

// ── ระดับสมาชิก (M1.9 · D1) ──
export type {
  TierRef,
  TierDefDto,
  TierBenefitDto,
  TierRulesDto,
  RuleInput,
  RuleCondition,
  RuleField,
  RuleOp,
  TierEvidence,
  EvaluateResult,
  ReviewResult,
  BenefitsDto,
} from "./tiers";

export {
  /** ระดับทั้งหมดของระบบสมาชิก + สิทธิประโยชน์แต่ละระดับ (M2.2 — หน้าตั้งค่าแต้มใช้หาระดับที่มี NO_POINT_EXPIRY) */
  listTierDefs,
  /** สิทธิประโยชน์ที่สมาชิกคนนี้ได้จากระดับของตัวเอง (POS/จอง/แต้ม เรียกตัวนี้ก่อนคิดเงิน) */
  benefitsFor,
  /** ประเมิน + เลื่อนขึ้นทันทีถ้าเข้าเกณฑ์ (เรียกหลังปิดบิล) — ไม่ลดระดับ */
  evaluateAndApply,
  /** รอบทบทวนระดับประจำเดือน (cron รายวันเรียกทุกระบบสมาชิก) */
  runTierReview,
  /** ประเมินอย่างเดียว ไม่เขียนระดับ (หน้า 360 · ทดลองรัน · สกิล AI tier_simulate) */
  evaluateMember,
  /** ผลของการอนุมัติ "ตั้งระดับด้วยมือ" — เรียกจาก approval-effects เท่านั้น */
  applyManualTierApproved,
  /** hook ให้โมดูลที่มีของแจกตอนขึ้นระดับมาต่อท้าย (M2.5 voucher ต้อนรับ) */
  onTierChanged,
} from "./tiers";

// ── ช่องทางที่มา (M1.8 · D10) ──
export type {
  SourceLinkDto,
  CreateLinkInput,
  CreateLinkResult,
  UpdateLinkInput,
  LinkTarget,
  ResolveSourceInput,
  ResolvedSource,
  SourceVia,
  TouchInput,
  TouchDto,
  SourceReport,
  SourceReportRow,
  SourceReportLinkRow,
} from "./sources";

export {
  /** แปล "ทางเข้า" (POS/LIFF/ฟอร์ม/แชท/จอง/นำเข้า/CRM/API/แนะนำเพื่อน/ตลาดออนไลน์/แอป) → ที่มาแบบเดียวกันทั้งระบบ */
  resolveSource,
  /** บันทึกครั้งที่รู้ที่มา — FIRST เขียนครั้งเดียว · LAST ทับทุกครั้ง (§7.2) */
  recordTouch,
  /** ซื้อครั้งแรกของสมาชิก → บวกตัวนับให้ลิงก์ที่พาเข้ามา (consumer `pos.sale.paid` ของ M2.8 เรียกตัวนี้) */
  recordFirstPurchase,
  /** ลูกค้ากดลิงก์/สแกน QR ที่มา (สาธารณะ — เส้นทาง `/m/{slug}?src=` เรียกตัวนี้) */
  hit,
} from "./sources";

// ── กลุ่มลูกค้า / segment (M3.1 · §5.9 · ภาพ 21 ขั้น 1) ──
// 🔴 จุดเดียวที่การตลาด (แคมเปญ M3.2 · journey M3.3) และการออก voucher "เป็นกลุ่ม" (M2.5)
//    ถามว่า "ใครเข้าเงื่อนไขนี้บ้าง" — `marketing/segments.ts` เป็นทางเข้าเดิมของฝั่งการตลาด
//    ที่ re-export ผ่านไฟล์นี้ล้วน (ห้ามให้โมดูลอื่น import `member/segments` ตรง)
export type {
  SegmentOp,
  SegmentFieldKind,
  SegmentFieldOption,
  SegmentFieldDef,
  SegmentCondition,
  SegmentGroup,
  SegmentDefinition,
  SegmentScope,
  SegmentDto,
  CountSegmentResult,
  SampleSegmentOptions,
  SampleSegmentResult,
  SaveSegmentInput,
} from "./segments";

export {
  /** ฟิลด์ทั้งหมดที่ตั้งเงื่อนไขได้ในร้านนี้ (ระบบ + `f.{key}` + ระดับ/แต้ม/ยินยอม/CRM) */
  listSegmentFields,
  /** นิยาม → เงื่อนไขค้นหาสมาชิก (`Prisma.CustomerWhereInput`) */
  evaluateSegment,
  /** กี่คนเข้าเงื่อนไข + ยอดซื้อเฉลี่ย + ตัวอย่าง 5 ชื่อ */
  countSegment,
  /** ไล่รายชื่อคนที่เข้าเงื่อนไขทีละหน้า */
  sampleSegment,
  /** กลุ่มที่บันทึกไว้ */
  listSegments,
  getSegment,
  saveSegment,
  deleteSegment,
  segmentMembers,
  /** บันทึก/ลบกลุ่มได้ไหม (promo.manage หรือคีย์สร้างแคมเปญ — ขั้นที่ 1 ของแคมเปญคือกลุ่มเป้าหมาย) */
  canManageSegments,
  /** ประโยคไทยย่อของนิยาม + ป้ายไทยของตัวดำเนินการ (หน้าจอ/แคมเปญใช้ชุดเดียวกัน) */
  describeDefinition,
  parseDefinition,
  SEGMENT_OPS,
  SEGMENT_OP_LABELS,
} from "./segments";

// ── journey อัตโนมัติ (M3.3 · §5.9 §7.3 §7.5 §11.6 · ภาพ 07 บน · 22) ──
// 🔴 คิว outbox (withAutomation) เรียก `runForEvent` ทุก event ที่เป็นทริกเกอร์ของ journey · cron รายชั่วโมง
//    เรียก `runDueWaits` · cron รายวันเรียก `emitJourneyCronEvents` — ตัวส่งจริง (LINE/อีเมล/SMS/push/บอร์ดงาน)
//    ถูกฉีดจาก composition root `src/lib/member-journey-senders.ts` ผ่าน `deps` (โมดูลสมาชิกไม่รู้จักแชท/บอร์ดงาน)
export type { JourneyEvent, JourneyRunOptions, JourneyDetailView } from "./journeys";
export type {
  JourneyDto,
  JourneyListRow,
  JourneyStatsView,
  JourneyDryRun,
  JourneyDeps,
  JourneySendRequest,
  JourneySendResult,
  JourneyKanbanRequest,
  JourneyKanbanResult,
  SaveJourneyInput,
} from "./journeys-shared";
export {
  createJourney,
  updateJourney,
  toggleJourney,
  deleteJourney,
  duplicateJourney,
  listJourneys,
  getJourney,
  journeyDetail,
  journeyBuilderOptions,
  canManageJourneys,
  /** event 1 ใบ → ทุก journey ที่ฟัง event นี้ (best-effort · ห้ามล้ม consumer หลัก) */
  runForEvent,
  /** cron รายชั่วโมง — ขั้น "รอ n วัน" ที่ถึงเวลาแล้ว */
  runDueWaits,
  /** cron รายวัน — ยิง event วันเกิด/หายไปนาน/ใกล้รอบทบทวนระดับ */
  emitJourneyCronEvents,
  dryRun,
  journeyStats,
  createFromPreset,
  JOURNEY_PRESETS,
} from "./journeys";

// ── รีวิวลูกค้า (M3.4 · §4.2 §4.3 §5.10 §7.1 §11.7 · D5 · ภาพ 23 · 08 ขวา) ──
// 🔴 ตัวส่ง LINE ถูกฉีดผ่าน `deps.line` จาก composition root (`member-journey-senders.ts#reviewSenders`)
//    การ์ดบอร์ดงาน (≤ N ดาว) ผ่านประตูเดียว `kanban/links.createCardFromExternal` (dynamic import ใน reviews.ts)
export type {
  ReviewSettings,
  ReviewRow,
  ReviewListResult,
  ReviewStats,
  ReviewSummary,
  ShopReviewSummary,
  ReviewDeps,
  ReviewSendRequest,
  ReviewSendResult,
  ReviewCardRequest,
  ReviewCardResult,
  ReviewLiffView,
  ReviewSubmitResult,
} from "./reviews-shared";
export type { RequestReviewInput, RequestReviewResult, EscalateResult, ListReviewsOptions } from "./reviews";
export {
  getReviewSettings,
  setReviewSettings,
  /** journey "ขอรีวิว" (M3.3) · พนักงาน · REST — 1 รีวิวต่อบิล/นัด */
  requestReview,
  /** ลูกค้าส่งผ่านลิงก์ LIFF (token = สิทธิ์ · ครั้งเดียว) */
  submitReview,
  reply,
  hide,
  unhide,
  /** ≤ N ดาว → การ์ดบอร์ดงาน (sourceType REVIEW) + มอบหมายตามบทบาท */
  escalate,
  listReviews,
  reviewStats,
  reviewsForMember,
  shopSummaryFor360,
  reviewFilterOptions,
  /** AI สรุปรีวิวรายเดือน (แคชรายวัน) · AI ร่างคำตอบ */
  summarize,
  draftReply,
  reviewLiffView,
} from "./reviews";
// KPI หน้ารวมสมาชิก (M1.5) — M3.4 เติม `reviewAvg` เป็นค่าจริงแล้ว · `memberKpis` = ชื่อที่สัญญา M3.4 เรียก
export type { MemberKpis } from "./list";
export { getMemberKpis, getMemberKpis as memberKpis } from "./list";

// ── แนะนำเพื่อน (M3.5 · D6 §4.3 §5.10 §7.1 §11.7 · ภาพ 24 · 08 ขวา) ──
// 🔴 ชื่อที่ export ออกนอกโมดูลมีคำว่า referral กำกับ (ชื่อสั้นในไฟล์ `reject`/`stats`/`attach` ชนง่าย)
//    คิว `member.created` → `referralOnMemberCreated` · สะพานขาย `member-bridges.ts` → `referralOnSalePaid`
export type {
  ReferralProgramDto,
  SetReferralProgramInput,
  ReferralCodeView,
  AttachResult as ReferralAttachResult,
  EvaluateResult as ReferralEvaluateResult,
  RewardBothResult as ReferralRewardBothResult,
  ReferralRowView,
  ListReferralsResult,
  LeaderboardRow as ReferralLeaderboardRow,
  ReferralStats,
  ReferralMemberView,
} from "./referrals-shared";
export type { AttachInput as ReferralAttachInput, EvaluateInput as ReferralEvaluateInput, ListReferralsOptions } from "./referrals";
export {
  getProgram as getReferralProgram,
  setProgram as setReferralProgram,
  codeFor as referralCodeFor,
  attach as attachReferral,
  evaluateConversion as evaluateReferralConversion,
  rewardBoth as rewardReferralBoth,
  reject as rejectReferral,
  listReferrals,
  leaderboard as referralLeaderboard,
  stats as referralStats,
  referralsForMember,
  referralCounts,
  resolveReferralLanding,
  onMemberCreatedEvent as referralOnMemberCreated,
  onSalePaid as referralOnSalePaid,
} from "./referrals";

// ── เทมเพลตกิจการ (M3.9 · D7 · §10 · ภาพ 03) ──
export type {
  MemberTemplate,
  MemberTemplateField,
  MemberTemplateSection,
  MemberTemplateTier,
  MemberTemplateTierBenefit,
  MemberTemplateTierRule,
  MemberTemplateStamp,
  MemberTemplateJourney,
} from "./templates";
export { TEMPLATES, getTemplate } from "./templates";
export type {
  TemplatePart,
  ApplyTemplateOptions as ApplyTemplateServiceOptions,
  ApplyTemplateResult,
  TemplatePreview,
  TemplatePreviewSection,
  TemplatePreviewField,
  TemplatePreviewTier,
  TemplatePreviewStamp,
  TemplatePreviewJourney,
} from "./templates-service";
export {
  /** ตรวจข้อมูลของเทมเพลต (ไม่แตะฐานข้อมูล) */
  validateTemplate,
  /** เทียบเทมเพลตกับของที่ระบบสมาชิกนี้มีอยู่แล้ว — อ่านอย่างเดียว */
  previewTemplate,
  /** เปิดใช้เทมเพลต — เพิ่มเฉพาะส่วนที่ยังไม่มี (fields/tiers/stamps/journeys) · idempotent */
  applyTemplate as applyMemberTemplate,
} from "./templates-service";

// ── การแจ้งเตือนสมาชิก (M3.6 · §5.10 §8.x · ภาพ 30) ──
// 🔴 ผู้เรียกข้ามโมดูล (cron/composition root) ใช้ namespace นี้แทนการ import ไฟล์ย่อยตรง
//   ตัวส่งจริง (LINE ผ่านแชท) ต้องฉีดผ่าน `deps` เสมอ (ค่าปริยาย `notificationSenders` จาก
//   `src/lib/member-journey-senders.ts`) — โมดูลนี้เองไม่รู้จักแชท (F2)
export * as notifications from "./notifications";

// ── ไทม์ไลน์ประวัติ (M3.7 · §4.3 §8 · ภาพ 08 ซ้าย/กลาง) ──
// 🔴 consumer ทุกโมดูล (ผ่าน composition root `src/lib/member-bridges.ts`) เขียนแถวด้วย `recordOnce`/`recordDaily`
//    เท่านั้น — ห้ามยิง `memberActivity.create` เองจากนอกโมดูล (กันซ้ำ = สัญญาของไฟล์ history.ts)
export type { RecordOnceInput, RecordOnceResult, RecordDailyInput, HistoryOptions, HistoryItem, HistoryResult } from "./history";
export {
  /** เขียนแถวไทม์ไลน์ครั้งเดียวต่อ (customerId, module, type, refId) — ซ้ำ = คืนแถวเดิม */
  recordOnce,
  /** 1 แถวต่อ ref ต่อวันไทย + ตัวนับ (แชท) */
  recordDaily,
  /** เติม data/summary ให้แถวที่มีอยู่ (สะพานขายเติมแต้ม/ตราทีหลัง) */
  patchActivity,
  /** ไทม์ไลน์ + read-through เอกสาร/การ์ด · กรองชนิด/ช่วง/สาขา · นับต่อชนิด · เคอร์เซอร์ */
  listHistory,
  historyUnitOptions,
  bkkDayStart,
} from "./history";
export type { HistoryKindKey, HistoryKindFilter, HistoryCounts } from "./history-kinds";
export { HISTORY_KINDS, kindOf as historyKindOf, channelDisplayName } from "./history-kinds";

// ── รายงานสมาชิก (M3.8 · §5.10 · ภาพ 25) ──
// 🔴 ชื่อที่ export ออกนอกโมดูลมีคำว่า report กำกับ (ชื่อสั้นในไฟล์ `overview`/`tiers`/`points`/`sources` ชนง่าย)
//    cron รายชั่วโมง (`platform/cron.ts` → `memberReportsEmail`) เรียก `runScheduledReports`
export type {
  ReportTab,
  ReportOverview,
  ReportRfm,
  RfmScore,
  RfmSegmentKey,
  ReportTiers,
  ReportTierRow,
  ReportPoints,
  ReportPromotions,
  ReportJourneyRow,
  ReportCampaignRow,
  ReportSources,
  ReportSourceRow,
  ReportCohort,
  ReportSchedule,
  ReportScheduleInput,
} from "./reports-shared";
export { REPORT_TABS, REPORT_TAB_LABELS, RFM_SEGMENTS } from "./reports-shared";
export type { ReportEmailRequest, ReportEmailSender } from "./reports";
export type { JourneyReportRow } from "./journeys";
export {
  overview as reportOverview,
  rfm as reportRfm,
  tiers as reportTiers,
  points as reportPoints,
  promotions as reportPromotions,
  sources as reportSources,
  cohort as reportCohort,
  exportCsv as exportReportCsv,
  getReportSchedule,
  setReportSchedule,
  runScheduledReports,
} from "./reports";

// ── REST ชุดสาม (M3.10) — ช่องเสียบแคมเปญของ REST ระบบสมาชิก ──
// composition root `src/lib/member-api-ports.ts` เสียบตัวจริงของ marketing เข้ามาที่นี่
// (โมดูลสมาชิกไม่ import marketing — F2 อนุญาตทิศเดียว marketing→member)
export { registerMemberCampaignPort } from "./api/campaign-port";
export type { CampaignPortCtx, CampaignPortInput, CampaignTestInput, MemberCampaignPort } from "./api/campaign-port";

// ── แอปพนักงาน (M3.11 · ภาพ 28) — จอสมาชิก 3 จอของ SHARK HUB ผ่าน `/api/mobile/member/*` ──
// route ของแอปเรียกชุดนี้เท่านั้น (ไม่แตะ prisma/ตารางของโมดูล) · ทุกตัวรับ actor ของพนักงานคนนั้น
export type {
  StaffMemberRow,
  StaffStampCard,
  StaffMemberSummary,
  StaffStampInput,
  StaffStampResult,
} from "./staff-app";
export {
  /** ระบบสมาชิกของร้าน (ร้านที่ยังไม่เปิด = MemberNotFoundError) */
  staffMemberCtx,
  /** ค้นชื่อ/เบอร์/รหัสสมาชิก (≤ 20 · ขอบเขตสาขา · เบอร์ปิดบัง) */
  staffSearch,
  /** สแกน QR บัตรสมาชิก `SHARK-MC:<token>` → การ์ดย่อ (หมดอายุ/นอกขอบเขต = null) */
  staffScan,
  /** การ์ดสรุป + ตัวเลข 3 + ประวัติ 3 + ลิงก์หน้าเว็บของปุ่มลัด */
  staffSummary,
  /** ใบสแตมป์ที่ประทับให้คนนี้ได้ (+ ต้อง PIN ไหม · รางวัลเมื่อครบ) */
  staffStampCards,
  /** ประทับ 1 ดวง (ใบที่ตั้ง PIN ต้อง PIN ตรง) → ข้อความแบนเนอร์ */
  staffStamp,
} from "./staff-app";
