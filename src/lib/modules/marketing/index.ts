// marketing/index.ts — facade เดียวที่โมดูลอื่น/สะพานนอกโมดูลได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจที่นี่ (ตรรกะอยู่ที่ `campaigns.ts` / `service.ts`)
// 🔴 ผู้เรียกภายในโมดูลเอง (หน้า/action) import ไฟล์ย่อยตรงได้ตามปกติ
// ผู้เรียกจริงวันนี้: `member-bridges.ts` (บิลที่ปิดแล้ว → ยกความดีให้แคมเปญ) ·
//                    `outbox-consumers.ts` (voucher ถูกใช้) · `platform/cron.ts` (แคมเปญที่ตั้งเวลาไว้)

// ── ชนิดข้อมูลบริสุทธิ์ (หน้าจอ client ใช้ตัวเดียวกันได้ผ่าน `campaigns-shared`) ──
export type {
  CampaignChannel,
  CampaignContent,
  CampaignDto,
  CampaignListRow,
  CampaignPreview,
  CampaignRecipientRow,
  CampaignStatsView,
  CampaignStatus,
  CampaignVariant,
  CampaignVariantStatView,
  RecipientStatus,
  SaveCampaignInput,
} from "./campaigns-shared";

export {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_VARS,
  CHANNEL_SEND_COST_SATANG,
  RECIPIENT_STATUS_LABELS,
  VARIANT_LABELS,
  HOLDOUT_MAX_PCT,
  ATTRIBUTION_DAYS,
  parseContent,
  renderMessage,
  roiOf,
} from "./campaigns-shared";

export type { CampaignCtx, CampaignDeps, SendRequest, SendResult, SendCampaignResult, SendOptions } from "./campaigns";

export {
  /** สร้างแคมเปญ (ร่าง หรือ ตั้งเวลา) — กลุ่มเป้าหมายถูกแช่แข็งไว้ในใบ */
  createCampaignV2,
  updateCampaignV2,
  getCampaign,
  /** หา/เปิดใช้ระบบการตลาดของร้าน แล้วประกอบ ctx (หน้าจอเรียกตัวนี้ก่อนเสมอ) */
  resolveCampaignCtx,
  /** ตารางแคมเปญพร้อมผลลัพธ์ต่อแถว (ส่ง/เปิด/ใช้/ยอด/ต้นทุน/ROI) */
  listCampaignsV2,
  /** "ถ้าส่งตอนนี้จะเป็นยังไง" — อ่านอย่างเดียว เรียกซ้ำได้ผลเดิม */
  previewCampaign,
  /** ส่งจริง (หรือคาไว้ถ้าตั้งเวลาข้างหน้า) — ตัวส่งแต่ละช่องทางฉีดแทนได้ */
  sendCampaignV2,
  /** cron รายชั่วโมง: แคมเปญที่ตั้งเวลาไว้และถึงเวลาแล้วของทุกร้าน */
  sendDueCampaigns,
  /** หยุดคิวที่ยังไม่ถึง (ที่ส่งไปแล้วถอนไม่ได้) */
  cancelCampaign,
  /** สถิติต่อ variant + กลุ่มเทียบ + uplift (คำนวณใหม่จากผู้รับเสมอ) */
  campaignStats,
  listRecipients,
  /** นับ "เปิดอ่าน" จากรูปจุดเดียวในอีเมล (ครั้งแรกครั้งเดียว) */
  trackOpen,
  openToken,
  /** consumer `voucher.used` — voucher ที่แคมเปญแนบไปถูกใช้ */
  trackUseFromVoucher,
  /** consumer `pos.sale.paid` — ลูกค้าซื้อของภายใน 30 วันหลังได้รับแคมเปญ */
  trackUseFromSale,
  canManageCampaigns,
} from "./campaigns";

// ── แคมเปญ v1 (ยังมีหน้าเดิมเรียกอยู่ — คงสัญญาไว้ทุกตัว) ──
export type { Ctx, CreateCampaignInput } from "./service";
export { createCampaign, sendCampaign, listCampaigns, previewAudience } from "./service";

// ── กลุ่มลูกค้า (M3.1) — ทางเข้าเดิมของฝั่งการตลาด (re-export จาก facade สมาชิกล้วน) ──
export {
  listSegmentFields,
  evaluateSegment,
  countSegment,
  sampleSegment,
  listSegments,
  getSegment,
  saveSegment,
  deleteSegment,
  segmentMembers,
  canManageSegments,
  describeDefinition,
  parseDefinition,
} from "./segments";
