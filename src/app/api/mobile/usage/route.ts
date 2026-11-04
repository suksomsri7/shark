// GET /api/mobile/usage + Bearer + X-Tenant-Id → สถานะเครดิตผู้ช่วย AI ของกิจการนั้น
//
// ⚠️ **รูปร่าง response ต้องคงเดิม** — QuotaBar ใน build #19 บนเครื่องผู้ใช้อ่านฟิลด์ชุดนี้อยู่
//    เปลี่ยนชื่อฟิลด์ = แถบในแอปพัง จนกว่าจะยิง OTA ทับ
//    เนื้อในเปลี่ยนจาก "โควตาต่อรอบ" เป็น "กระเป๋าเครดิต": used/limit = ไมโครดอลลาร์ที่ใช้ไป/ก้อนอ้างอิง
//    ก้อนอ้างอิง = ยอดที่เติมครั้งล่าสุด (หรือเครดิตต้อนรับ) → pct = ใช้ไปกี่ % ของก้อนนั้น
// SEC S1.13 (R-K7 · §B.6) ▸ **GET ไม่เขียน**: อ่านกระเป๋าด้วย `walletPeek` (ไม่เปิดกระเป๋า · ไม่แจก GRANT) · blocked ตาม `canSpendPeek` (รวมเพดาน assist ของวัน · R-S1.13i)
//   ไม่มีกระเป๋า: ร้านเดิม = แสดงเหมือนเพิ่งได้เครดิตต้อนรับ (ค่าเดียวกับที่จะได้ตอนเปิดกระเป๋าจริง) · ร้านใหม่ = used 0 · limit 1 · pct 0 · balanceMicro 0
//   + ฟิลด์ใหม่ `jobs` = สถานะโควตางานเลขาของเดือน (build เก่าเมิน) ◂
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { prisma } from "@/lib/core/db";
import { canSpendPeek, getsWelcomeGrant, walletPeek, welcomeGrantMicro } from "@/lib/ai/credit";
import { quotaStatus } from "@/lib/ai/secretary/quota";
import { mobileDenied, AI_CHAT } from "@/lib/mobile/guard";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const denied = mobileDenied(g, AI_CHAT); // C5.5-authz-sweep: same key as the web door (lib/ai/actions.ts loadAiQuotaAction — the chat quota bar)
  if (denied) return denied;

  const tenantId = g.ctx.tenantId;
  const [wallet, open, jobs] = await Promise.all([walletPeek(tenantId), canSpendPeek(tenantId), quotaStatus(tenantId)]);
  // ยังไม่มีกระเป๋า: ร้านเดิมจะได้เครดิตต้อนรับตอนใช้จริง ⇒ แสดงค่านั้น (ไม่สร้างแถว) · ร้านใหม่ = กระเป๋าว่าง (แพ็กฟรี)
  let virtualGrant = 0;
  if (!wallet && (await getsWelcomeGrant(tenantId))) virtualGrant = welcomeGrantMicro(); // R-S1.13i: กติกาเครดิตต้อนรับเดียวกับตอนเปิดกระเป๋าจริง
  const balanceMicro = wallet ? wallet.balanceMicro : virtualGrant;
  // ก้อนอ้างอิงล่าสุดที่เงินเข้ากระเป๋า — ใช้เป็นตัวหารของ % ที่แถบในแอปวาด
  const lastIn = wallet
    ? await prisma.aiCreditTxn.findFirst({
        where: { tenantId, kind: { in: ["GRANT", "TOPUP"] } },
        orderBy: { createdAt: "desc" },
        select: { amountMicro: true },
      })
    : null;
  const limit = Math.max(1, lastIn?.amountMicro ?? (virtualGrant || 1));
  const balance = Math.max(0, balanceMicro);
  // กระเป๋าแพ็กฟรี (ไม่มี GRANT/TOPUP และ grantedAt null) = บัญชีต้นทุน ไม่ใช่ก้อนเงินของร้าน ⇒ used 0 (แถบไม่ขึ้น 100%)
  const used = wallet && (lastIn || wallet.grantedAt !== null) ? Math.max(0, limit - balance) : 0;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const empty = balanceMicro <= 0;
  // ลดชั้น (< $0.50) เฉพาะร้านที่ได้เครดิตต้อนรับ — ร้านในแพ็กฟรี (grantedAt null) ไม่ลดชั้น (เหมือน service.ts)
  const granted = wallet ? wallet.grantedAt !== null : virtualGrant > 0;

  return Response.json(
    {
      scope: "credit",
      used,
      limit,
      pct,
      warn: pct >= 80,
      degraded: granted && !empty && balance < 500_000, // < $0.50 = โหมดประหยัด (haiku) เพื่อยืดเครดิตก้อนสุดท้าย
      blocked: open ? null : "credit",
      resetAt: new Date().toISOString(), // เครดิตไม่มีรอบรีเซ็ต — คงฟิลด์ไว้เพื่อความเข้ากันได้กับ build #19
      balanceMicro, // ฟิลด์ใหม่ (build เก่าไม่รู้จัก = เมิน)
      jobs, // SEC S1.13 ▸ QuotaStatus ของเดือน (งาน · % · วันรีเซ็ต) — build เก่าเมิน ◂
    },
    { status: 200 },
  );
}
