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
export { toMemberActor } from "./access";
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
  /** "คนนี้คือสมาชิกคนไหน" จาก partyId / เบอร์ / id ไลน์ — ไม่พบ = null (ไม่สร้างใหม่) */
  linkContact,
  maskPhone,
} from "./profile";

export { canViewSensitive, logAccess } from "./privacy";

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
