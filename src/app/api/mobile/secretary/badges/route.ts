// GET /api/mobile/secretary/badges — ตัวเลข badge ของ 3 โซนแอปในเส้นเดียว (ใบ S1.14c · R-S2.13b/m5 · docs/api/SECRETARY-API.md)
//   approvals = รายการรออนุมัติที่ฉันกดได้ **ของกิจการนี้เท่านั้น** (`inboxForUser(userId, { tenantId })` นับ canApprove · R-S1.14c-b)
//     — `secretary/inbox/count` (ข้ามกิจการ) คงไว้สำหรับหน้าเลขา "ทุกกิจการ"
//   customers = ผลรวม `unreadFor` ทุกระบบแชทที่เปิดอยู่ของร้าน (ตัวเดียวกับ inbox/unread) · ไม่มีสิทธิ์อ่านแชท = 0
//   team.invites = คำเชิญที่ยังไม่รับและยังไม่หมดอายุของร้าน — เฉพาะ OWNER/MANAGER (STAFF = 0)
//   team.help = ห้องแชทลูกค้าสถานะ OPEN ที่ผู้เรียกถูกเรียกมาช่วย (ChatConversationHelper.userId = ฉัน)
//   team.support = `unreadCaseTotalForUser` (เรื่องที่ทีม SHARK ตอบแล้วยังไม่อ่าน)
//   total = approvals + customers + invites + help + support
// ด่าน = สมาชิกร้าน (gate null) · 60/นาที ต่อ Membership · count/aggregate ล้วน ไม่ดึงรายการ (ยกเว้น approvals ที่ใช้ชุดเดียวกับกล่องรวม · เพดาน 100)
import { tenantDb } from "@/lib/core/db";
import { inboxForUser } from "@/lib/ai/secretary/inbox";
import { unreadCaseTotalForUser } from "@/lib/support/service";
import { READ, can, unreadFor, type InboxCtx } from "../../inbox/_shared";
import { gate, ok, thrown, withRateLimit, withErrors } from "../_shared";

/** เพดานเดียวกับกล่องรวม (TAKE_MAX ของ inbox.ts) */
const INBOX_TAKE = 100;

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const { userId, tenantId, m } = a.c;
  const rl = await withRateLimit(`${tenantId}:${userId}`, "badges", 60);
  if (rl) return rl;
  try {
    const db = tenantDb({ tenantId });
    const ic: InboxCtx = { g: a.c.g, tenantId, userId, m, ua: m.unitAccess };
    const now = new Date();

    const customers = async (): Promise<number> => {
      if (!can(ic, READ)) return 0;
      const systems = await db.appSystem.findMany({ where: { type: "CHAT", active: true }, select: { id: true } });
      let n = 0;
      for (const s of systems) n += await unreadFor(ic, s.id);
      return n;
    };
    const invites = async (): Promise<number> =>
      m.role === "OWNER" || m.role === "MANAGER"
        ? db.staffInvite.count({ where: { tenantId, acceptedAt: null, expiresAt: { gt: now } } })
        : 0;
    const help = (): Promise<number> =>
      db.chatConversationHelper.count({ where: { tenantId, userId, conversation: { tenantId, status: "OPEN" } } });

    const [inbox, cust, inv, hlp, support] = await Promise.all([
      inboxForUser(userId, { tenantId, take: INBOX_TAKE }),
      customers(),
      invites(),
      help(),
      unreadCaseTotalForUser({ tenantId }, userId, m.role),
    ]);
    const approvals = inbox.filter((i) => i.canApprove).length;
    return ok({
      approvals,
      customers: cust,
      team: { invites: inv, help: hlp, support },
      total: approvals + cust + inv + hlp + support,
    });
  } catch (e) {
    return thrown(e, "badges");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/badges GET", GET_);
