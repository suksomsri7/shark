"use server";
// SVC D.17 ▸ action จอประกาศ — ร้าน/หน่วย/ผู้กระทำมาจาก session + unitSlug ที่ bind ไว้เท่านั้น (ไม่รับรหัสร้าน/หน่วย/ผู้ใช้จากฟอร์ม)
//   ด่านสิทธิ์จริงอยู่ใน facade (หน่วย DORM → Membership สด → dorm.announce → ขอบเขตอาคาร) — ไม่ผ่าน ⇒ NOT_FOUND
//   🔴 ไฟล์ "use server": export async function เท่านั้น
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { createDormAnnouncement, publishDormAnnouncement, type AnnounceAudience } from "@/lib/modules/dorm";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { resendDormAnnouncement } from "@/lib/platform/dorm-announce";

const NO_ACCESS = { ok: false as const, code: "NOT_FOUND" as const, reason: "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ส่งประกาศ" };

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
function text(fd: FormData, k: string, max: number): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
}
function audienceOf(fd: FormData): AnnounceAudience | { kind: string } {
  const kind = text(fd, "audienceKind", 20);
  const targets = fd
    .getAll("target")
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, 501)
    .map((x) => x.slice(0, 120));
  if (kind === "ALL") return { kind: "ALL" };
  if (kind === "BUILDING") return { kind: "BUILDING", buildingIds: targets };
  if (kind === "ROOM") return { kind: "ROOM", roomIds: targets };
  if (kind === "FLOOR") {
    const floors = targets.map((t) => {
      const ix = t.lastIndexOf(":");
      return { buildingId: ix > 0 ? t.slice(0, ix) : "", floorNo: ix > 0 ? Number(t.slice(ix + 1)) : Number.NaN };
    });
    return { kind: "FLOOR", floors };
  }
  return { kind };
}

export async function createAnnouncementAction(unitSlug: string, _prev: unknown, fd: FormData) {
  void _prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await createDormAnnouncement(g.ctx, {
    unitId: g.unitId,
    title: text(fd, "title", 400),
    body: text(fd, "body", 6000),
    audience: audienceOf(fd) as AnnounceAudience,
  });
  revalidatePath(`/app/u/${unitSlug}/dorm/announce`);
  return r;
}

export async function publishAnnouncementAction(unitSlug: string, _prev: unknown, fd: FormData) {
  void _prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await publishDormAnnouncement(g.ctx, { unitId: g.unitId, announcementId: text(fd, "announcementId", 100) });
  if (r.ok && r.published) scheduleDrain();
  revalidatePath(`/app/u/${unitSlug}/dorm/announce`);
  return r;
}

export async function resendAnnouncementAction(unitSlug: string, _prev: unknown, fd: FormData) {
  void _prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await resendDormAnnouncement(g.ctx, { unitId: g.unitId, announcementId: text(fd, "announcementId", 100) });
  revalidatePath(`/app/u/${unitSlug}/dorm/announce`);
  return r;
}
