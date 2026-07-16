"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createCampaign, sendCampaign, type Ctx } from "./service";
import type { Segment } from "./rules";

// ตรวจสิทธิ์โมดูล Marketing (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// convention action = "marketing.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์นี้เรียก assertCan)
function assertMarketingCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "marketing", action },
  );
}

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// baht(string) → satang(int) · ค่าว่าง/ไม่ถูกต้อง = undefined (ไม่ใส่ในเซกเมนต์)
const bahtToSatang = (v: FormDataEntryValue | null): number | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
};

const posIntOrUndef = (v: FormDataEntryValue | null): number | undefined => {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
};

// ประกอบเซกเมนต์จาก form — เฉพาะเงื่อนไขที่กรอก (ไม่กรอก = ไม่กรอง)
function segmentFromForm(formData: FormData): Segment {
  const seg: Segment = {};
  const tier = String(formData.get("tier") ?? "").trim();
  if (tier) seg.tier = tier;
  const minSpent = bahtToSatang(formData.get("minSpentBaht"));
  if (minSpent != null) seg.minSpentSatang = minSpent;
  const inactive = posIntOrUndef(formData.get("inactiveDays"));
  if (inactive != null) seg.inactiveDays = inactive;
  return seg;
}

// ── สร้างแคมเปญ (DRAFT) ──
export async function createCampaignAction(formData: FormData) {
  const auth = await requireTenant();
  assertMarketingCan(auth, "marketing.campaign.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const memberSystemId = String(formData.get("memberSystemId") ?? "").trim();
  if (!systemId || !name || !memberSystemId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createCampaign(ctx, {
    name,
    channel: String(formData.get("channel") ?? "LINE"),
    message: String(formData.get("message") ?? ""),
    segment: segmentFromForm(formData),
    couponCode: String(formData.get("couponCode") ?? "").trim() || null,
    memberSystemId,
  });
  revalidate(systemId);
}

// ── ส่งแคมเปญ (DRAFT→SENT · v1 บันทึกผู้รับ ยังไม่ต่อ LINE จริง) ──
export async function sendCampaignAction(formData: FormData) {
  const auth = await requireTenant();
  assertMarketingCan(auth, "marketing.campaign.send");
  const systemId = String(formData.get("systemId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!systemId || !campaignId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await sendCampaign(ctx, campaignId);
  revalidate(systemId);
}
