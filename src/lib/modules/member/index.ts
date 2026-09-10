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
