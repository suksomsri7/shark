// /api/mobile/crm/call-log — แผ่น "บันทึกสาย — วางสายแล้ว" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ข)
//   GET  ?contactId=&dealId=[&systemId=] → { contact{ id, name }, deal{ id, title }|null, outcomes (ทะเบียนผลสาย CALL), directions }
//   POST { contactId, dealId?, direction, outcome, durationSec, body?, nextTask?{ title, dueAt, type? }, idempotencyKey }
//        → `calls.logCall` (ใบ C2.4 — ผู้บันทึกสายตัวเดียวของระบบ) → 201 { activityId } · key เดิมซ้ำ/พร้อมกัน = แถวเดียว id เดิม (200)
//        key เดิม + เนื้อคำขอต่าง = ได้ id เดิม ไม่แก้แถว (แอปออก key ใหม่ทุกครั้งที่เปิดแผ่น)
// 🔴 ผู้ติดต่อ/ดีลที่มองไม่เห็น = 404 และไม่มีอะไรถูกเขียน (logCall ตัดสินการมองเห็นก่อนเขียน)
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, mobileCrmBadRequest, runMobileCrm } from "@/lib/mobile/crm-routes";
import { calls, mobile as crmMobile } from "@/lib/modules/crm";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  return runMobileCrm(req, g, (s) =>
    crmMobile.callPrompt(s.ctx, s.actor, { contactId: s.url.searchParams.get("contactId"), dealId: s.url.searchParams.get("dealId") }),
  );
}

const MAX_CALL_SEC = 24 * 60 * 60;
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  return runMobileCrm(req, g, async (s) => {
    const b = s.body;
    const key = crmMobile.cleanIdempotencyKey(b.idempotencyKey);
    if (!key) return mobileCrmBadRequest("คำขอบันทึกสายต้องมีรหัสกันกดซ้ำ — ปิดแผ่นแล้วเปิดบันทึกสายใหม่อีกครั้ง");
    const contactId = txt(b.contactId);
    if (!contactId) return mobileCrmBadRequest("ยังไม่ได้ระบุผู้ติดต่อของสายนี้ — เปิดบันทึกสายจากการ์ดดีลอีกครั้ง");
    const sec = b.durationSec === undefined || b.durationSec === null || b.durationSec === "" ? null : Number(b.durationSec);
    if (sec !== null && (!Number.isFinite(sec) || sec < 0 || sec > MAX_CALL_SEC)) return mobileCrmBadRequest("ระยะเวลาสายอ่านไม่ออก — ใส่เป็นนาที:วินาที เช่น 04:32");
    const durationSec = sec === null ? null : Math.round(sec);
    const nt = b.nextTask && typeof b.nextTask === "object" && !Array.isArray(b.nextTask) ? (b.nextTask as Record<string, unknown>) : null;
    const nextTitle = nt ? txt(nt.title) : null;
    const input = {
      contactId,
      dealId: txt(b.dealId),
      direction: String(b.direction ?? ""),
      outcome: String(b.outcome ?? ""),
      durationSec,
      startAt: new Date(Date.now() - (durationSec ?? 0) * 1000),
      body: txt(b.body),
      ...(nt && nextTitle ? { nextTask: { title: nextTitle, type: txt(nt.type) ?? "TASK", dueAt: txt(nt.dueAt) } } : {}),
    };
    // กันซ้ำ: sourceRef ของ key นี้ไหลเข้า logCall → logActivity (lock + หาแถวเดิม + insert ใน tx เดียว)
    const out = await crmMobile.callOnce(s.ctx, key, (sourceRef) => calls.logCall(s.ctx, s.actor, input, undefined, { sourceRef }));
    return Response.json({ activityId: out.activityId, replayed: out.replayed }, { status: out.replayed ? 200 : 201 });
  }, { readBody: true });
}
