// notify.ts — push ของแชททีม (B27) · ไม่ throw · เรียกนอกทรานแซกชัน (route ใช้ runAfter)
//   ข้อความใหม่: ถึงสมาชิกห้องที่ไม่ปิดเสียง (ผู้เรียกคัดมาแล้ว) · link `/secretary/team/<threadId>` + tenantId (แอปสลับร้านก่อนเปิด)
//   คำเชิญเข้าทีม: ถึงผู้ถูกเชิญ · link `/secretary/staff` (รายชื่อทีม — การ์ด "คุณได้รับคำเชิญ" อยู่บนจอนั้น) · ไม่มี tenantId (ยังไม่ใช่สมาชิก)
//   badge = badgeTotalFor (รวมข้อความทีมที่ยังไม่อ่านแล้ว) · อ่านไม่ได้ = ไม่ใส่
//   B27 17 พ.ย. ▸ กันสแปม: ห้องเดียวกันถึงคนเดิมภายใน TEAM_PUSH_WINDOW_MS ⇒ ใบเดียว (ใบถัดไปในหน้าต่าง = ข้าม · badge ตามมากับใบหน้า/เปิดแอป)
//     แบบเดียวกับ notifyUser ของเลขา (แผนที่ต่อโปรเซส · นับจากใบที่ส่งจริง · ส่งไม่ออก = คืนการจอง) ◂
import { sendPushToUser } from "@/lib/core/push";
import { attachmentsOf } from "@/lib/ai/secretary/attachments-shared";

type PushPost = NonNullable<NonNullable<Parameters<typeof sendPushToUser>[2]>["post"]>;
const PREVIEW_MAX = 120;
/** ห้องเดียวกันถึงคนเดิม — ภายในหน้าต่างนี้ส่ง push ใบเดียว */
export const TEAM_PUSH_WINDOW_MS = 30_000;
const PUSH_MAP_MAX = 5_000;

// `${userId}:${threadId}` → เวลาที่ส่งจริงล่าสุด (ms) — ต่อโปรเซส (Map เรียงตามลำดับใส่ = ลำดับเวลา)
const lastTeamPushAt = new Map<string, number>();

function pruneTeamPushMap(nowMs: number): void {
  if (lastTeamPushAt.size < PUSH_MAP_MAX) return;
  for (const [k, at] of lastTeamPushAt) if (Math.abs(nowMs - at) >= TEAM_PUSH_WINDOW_MS) lastTeamPushAt.delete(k);
  if (lastTeamPushAt.size >= PUSH_MAP_MAX) {
    let n = Math.floor(lastTeamPushAt.size / 2);
    for (const k of lastTeamPushAt.keys()) {
      if (n-- <= 0) break;
      lastTeamPushAt.delete(k);
    }
  }
}

/** จองช่องส่ง push ห้องนี้ถึงคนนี้ — false = ส่งไปแล้วในหน้าต่าง (ข้าม) · คืนตัวคืนการจองเมื่อส่งไม่ออก */
function reserveTeamPush(userId: string, threadId: string, nowMs: number): (() => void) | null {
  const key = `${userId}:${threadId}`;
  const prev = lastTeamPushAt.get(key);
  if (prev !== undefined && Math.abs(nowMs - prev) < TEAM_PUSH_WINDOW_MS) return null;
  pruneTeamPushMap(nowMs);
  lastTeamPushAt.delete(key);
  lastTeamPushAt.set(key, nowMs); // จองก่อนส่ง — สองคำขอพร้อมกันได้ใบเดียว
  return () => {
    if (lastTeamPushAt.get(key) !== nowMs) return; // มีใบใหม่กว่าจองทับแล้ว
    lastTeamPushAt.delete(key);
    if (prev !== undefined) lastTeamPushAt.set(key, prev);
  };
}

/** QC เท่านั้น — ล้างแผนที่กันสแปม */
export function resetTeamPushGuard(): void {
  lastTeamPushAt.clear();
}

export function teamPreview(body: string, attachments: unknown): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  const atts = attachmentsOf(attachments);
  if (atts.length === 0) return "";
  return atts.every((a) => a.kind === "image") ? "📷 รูปภาพ" : "📎 ไฟล์";
}

export async function notifyTeamMessage(
  args: {
    tenantId: string;
    threadId: string;
    kind: "DIRECT" | "GROUP";
    groupName: string | null;
    senderName: string;
    body: string;
    attachments: unknown;
    recipients: readonly string[];
  },
  deps?: { post?: PushPost; now?: Date },
): Promise<number> {
  let sent = 0;
  const nowMs = deps?.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now.getTime() : Date.now();
  const preview = teamPreview(args.body, args.attachments);
  const title = args.kind === "GROUP" ? (args.groupName ?? "กลุ่ม") : args.senderName;
  const body = args.kind === "GROUP" ? `${args.senderName}: ${preview}` : preview;
  const { badgeTotalFor } = await import("@/lib/ai/secretary/notify");
  for (const uid of args.recipients.slice(0, 300)) {
    const unreserve = reserveTeamPush(uid, args.threadId, nowMs);
    if (!unreserve) continue; // ห้องนี้เพิ่งแจ้งคนนี้ไป (กันสแปม)
    try {
      let badge: number | undefined;
      try {
        badge = await badgeTotalFor(uid, args.tenantId);
      } catch {
        badge = undefined;
      }
      const r = await sendPushToUser(
        uid,
        { title, body, data: { link: `/secretary/team/${args.threadId}`, tenantId: args.tenantId, threadId: args.threadId }, ...(typeof badge === "number" ? { badge } : {}) },
        deps?.post ? { post: deps.post } : undefined,
      );
      sent += r.sent;
      if (r.sent === 0) unreserve(); // ไม่มีเครื่อง/Expo ไม่รับ — ใบหน้าในหน้าต่างเดิมยังส่งได้
    } catch {
      unreserve(); /* best-effort */
    }
  }
  return sent;
}

export async function notifyTeamInvite(args: { inviteeUserId: string; tenantName: string; inviterName: string }, deps?: { post?: PushPost }): Promise<number> {
  try {
    const r = await sendPushToUser(
      args.inviteeUserId,
      { title: `${args.tenantName} ชวนคุณเข้าทีม`, body: `${args.inviterName} เพิ่มคุณเข้าทีมใน Lekaa — เปิดแอปเพื่อยอมรับคำเชิญ`, data: { link: "/secretary/staff" } },
      deps?.post ? { post: deps.post } : undefined,
    );
    return r.sent;
  } catch {
    return 0;
  }
}
