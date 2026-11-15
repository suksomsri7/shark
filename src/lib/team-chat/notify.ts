// notify.ts — push ของแชททีม (B27) · ไม่ throw · เรียกนอกทรานแซกชัน (route ใช้ runAfter)
//   ข้อความใหม่: ถึงสมาชิกห้องที่ไม่ปิดเสียง (ผู้เรียกคัดมาแล้ว) · link `/secretary/team/<threadId>` + tenantId (แอปสลับร้านก่อนเปิด)
//   คำเชิญเข้าทีม: ถึงผู้ถูกเชิญ · link `/secretary/staff` (รายชื่อทีม — การ์ด "คุณได้รับคำเชิญ" อยู่บนจอนั้น) · ไม่มี tenantId (ยังไม่ใช่สมาชิก)
//   badge = badgeTotalFor (รวมข้อความทีมที่ยังไม่อ่านแล้ว) · อ่านไม่ได้ = ไม่ใส่
import { sendPushToUser } from "@/lib/core/push";
import { attachmentsOf } from "@/lib/ai/secretary/attachments-shared";

type PushPost = NonNullable<NonNullable<Parameters<typeof sendPushToUser>[2]>["post"]>;
const PREVIEW_MAX = 120;

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
  deps?: { post?: PushPost },
): Promise<number> {
  let sent = 0;
  const preview = teamPreview(args.body, args.attachments);
  const title = args.kind === "GROUP" ? (args.groupName ?? "กลุ่ม") : args.senderName;
  const body = args.kind === "GROUP" ? `${args.senderName}: ${preview}` : preview;
  const { badgeTotalFor } = await import("@/lib/ai/secretary/notify");
  for (const uid of args.recipients.slice(0, 300)) {
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
    } catch {
      /* best-effort */
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
