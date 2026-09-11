// campaign-port.ts — ช่องเสียบ "แคมเปญ" ของ REST ระบบสมาชิก (M3.10 · op `campaigns.*`)
//
// ปัญหา: แคมเปญ v2 (M3.2) เป็นของโมดูล **marketing** — แต่ op ของมันต้องอยู่ในทะเบียน REST ของระบบสมาชิก
// (`/api/v1/member/campaigns/*` · สกิล AI `members`) ⇒ ถ้า `ops/campaigns.ts` import `@/lib/modules/marketing`
// ตรง ๆ = เกิดเส้น member→marketing ใหม่ใน fitness F2 (ทิศที่อนุญาตวันนี้คือ marketing→member ทางเดียว)
// และเกิดวงจรตอนโหลดไฟล์ marketing ⇄ member
//
// ทางออก (แบบเดียวกับ `member-hooks.ts` / `approval-effects.ts`): โมดูลสมาชิกประกาศ "ช่องเสียบ" ที่นี่
// โดยไม่รู้จัก marketing เลย แล้ว **composition root** `src/lib/member-api-ports.ts` (นอก modules) เป็นคนเสียบ
// ตัวจริงของ marketing เข้ามา · ยังไม่มีใครเสียบ = โหลด root แบบ dynamic ครั้งแรกที่ถูกเรียก (idempotent)
//
// 🔴 ชนิดข้อมูลของ marketing ไม่ข้ามมาที่นี่ (import type ก็นับเป็นเส้น) — ผลลัพธ์เป็น `unknown` ที่ผ่าน
//    `jsonSafe` ที่ชั้น op · ข้อมูลขาเข้าเป็นรูปของสัญญา REST เอง (`CampaignPortInput`)

import { ApiError } from "@/lib/api/respond";
import type { MemberActor } from "../access";

export type CampaignPortCtx = {
  tenantId: string;
  /** ระบบสมาชิกที่คีย์ผูก (แคมเปญเล็งสมาชิกของระบบนี้) */
  memberSystemId: string;
  actorUserId: string | null;
};

/** ข้อมูลแคมเปญตามสัญญา REST (ส่วนที่ PATCH ไม่ส่ง = ใช้ค่าเดิม) */
export type CampaignPortInput = {
  name?: string;
  segmentId?: string | null;
  definition?: unknown;
  channels?: string[];
  content?: unknown;
  variantB?: unknown;
  holdoutPct?: number;
  attachVoucherTemplateId?: string | null;
  couponCode?: string | null;
  scheduledAt?: string | null;
};

export type CampaignTestInput = { channel?: string | null };

export type MemberCampaignPort = {
  list(c: CampaignPortCtx, actor: MemberActor): Promise<unknown>;
  get(c: CampaignPortCtx, actor: MemberActor, id: string): Promise<unknown>;
  create(c: CampaignPortCtx, actor: MemberActor, input: CampaignPortInput): Promise<{ id: string }>;
  update(c: CampaignPortCtx, actor: MemberActor, id: string, input: CampaignPortInput): Promise<{ id: string }>;
  preview(c: CampaignPortCtx, actor: MemberActor, id: string): Promise<unknown>;
  testSend(c: CampaignPortCtx, actor: MemberActor, id: string, input: CampaignTestInput): Promise<unknown>;
  send(c: CampaignPortCtx, actor: MemberActor, id: string): Promise<unknown>;
  cancel(c: CampaignPortCtx, actor: MemberActor, id: string): Promise<unknown>;
  stats(c: CampaignPortCtx, actor: MemberActor, id: string): Promise<unknown>;
};

let port: MemberCampaignPort | null = null;

/** เสียบตัวจริง (เรียกจาก composition root เท่านั้น · เรียกซ้ำ = ทับด้วยตัวเดิม) */
export function registerMemberCampaignPort(p: MemberCampaignPort): void {
  port = p;
}

/** ตัวจริงของแคมเปญ — ยังไม่เสียบ = โหลด composition root ให้เอง 1 ครั้ง */
export async function campaignPort(): Promise<MemberCampaignPort> {
  if (!port) {
    const root = await import("@/lib/member-api-ports");
    root.registerMemberApiPorts();
  }
  if (!port) {
    throw new ApiError(
      503,
      "upstream_unavailable",
      "ระบบแคมเปญยังไม่พร้อมให้บริการในตอนนี้ — ลองใหม่อีกครั้งในอีกสักครู่",
      "The campaign module is not wired into the member API on this server.",
    );
  }
  return port;
}
