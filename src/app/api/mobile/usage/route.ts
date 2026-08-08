// GET /api/mobile/usage + Bearer + X-Tenant-Id → สถานะเครดิตผู้ช่วย AI ของกิจการนั้น
//
// ⚠️ **รูปร่าง response ต้องคงเดิม** — QuotaBar ใน build #19 บนเครื่องผู้ใช้อ่านฟิลด์ชุดนี้อยู่
//    เปลี่ยนชื่อฟิลด์ = แถบในแอปพัง จนกว่าจะยิง OTA ทับ
//    เนื้อในเปลี่ยนจาก "โควตาต่อรอบ" เป็น "กระเป๋าเครดิต": used/limit = ไมโครดอลลาร์ที่ใช้ไป/ก้อนอ้างอิง
//    ก้อนอ้างอิง = ยอดที่เติมครั้งล่าสุด (หรือเครดิตต้อนรับ) → pct = ใช้ไปกี่ % ของก้อนนั้น
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { prisma } from "@/lib/core/db";
import { ensureWallet } from "@/lib/ai/credit";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);

  const wallet = await ensureWallet(g.ctx.tenantId);
  // ก้อนอ้างอิงล่าสุดที่เงินเข้ากระเป๋า — ใช้เป็นตัวหารของ % ที่แถบในแอปวาด
  const lastIn = await prisma.aiCreditTxn.findFirst({
    where: { tenantId: g.ctx.tenantId, kind: { in: ["GRANT", "TOPUP"] } },
    orderBy: { createdAt: "desc" },
    select: { amountMicro: true },
  });
  const limit = Math.max(1, lastIn?.amountMicro ?? 1);
  const balance = Math.max(0, wallet.balanceMicro);
  const used = Math.max(0, limit - balance);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const empty = wallet.balanceMicro <= 0;

  return Response.json(
    {
      scope: "credit",
      used,
      limit,
      pct,
      warn: pct >= 80,
      degraded: !empty && balance < 500_000, // < $0.50 = โหมดประหยัด (haiku) เพื่อยืดเครดิตก้อนสุดท้าย
      blocked: empty ? "credit" : null,
      resetAt: new Date().toISOString(), // เครดิตไม่มีรอบรีเซ็ต — คงฟิลด์ไว้เพื่อความเข้ากันได้กับ build #19
      balanceMicro: wallet.balanceMicro, // ฟิลด์ใหม่ (build เก่าไม่รู้จัก = เมิน)
    },
    { status: 200 },
  );
}
