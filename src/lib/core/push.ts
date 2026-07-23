// push.ts — ส่ง push notification เข้าเครื่องมือถือของ tenant (Expo push · Phase 2)
// 🔴 PushDevice เป็น global axis → เขียน prisma ตรงได้
// best-effort เหมือน email.ts: ห้าม throw · ส่งพลาด → logOps("ERROR","push",...) แล้วคืน sent เท่าที่ได้
//   transport ฉีดได้ (deps.post) เพื่อทดสอบ · default = ยิง Expo push API จริง

import { prisma } from "@/lib/core/db";

type PushMsg = { title: string; body: string; data?: Record<string, unknown> };
type PushDeps = { post?: (payloads: unknown[]) => Promise<unknown[]> };

const CHUNK = 100; // Expo push API รับได้ ≤100/ครั้ง

// ticket จาก Expo — เราสนแค่ status + details.error (DeviceNotRegistered = token ตาย)
type Ticket = { status?: string; details?: { error?: string } };

// default transport — ยิง Expo push API จริง (POST JSON array) → คืน data (array of tickets)
async function expoPost(payloads: unknown[]): Promise<unknown[]> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payloads),
  });
  const json = (await res.json()) as { data?: unknown[] };
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * ส่ง push เข้าทุกเครื่องของ tenant — best-effort ห้าม throw
 * แบ่ง chunk ≤100 · ticket DeviceNotRegistered → ลบ PushDevice ของ token นั้น (จับคู่ตาม index)
 * ไม่มีเครื่อง → {sent:0} · ส่งพลาด/เน็ตพัง → logOps แล้วคืน sent เท่าที่ส่งได้
 */
export async function sendPushToTenant(
  tenantId: string,
  msg: PushMsg,
  deps?: PushDeps,
): Promise<{ sent: number }> {
  const post = deps?.post ?? expoPost;
  let sent = 0;
  try {
    const devices = await prisma.pushDevice.findMany({ where: { tenantId } });
    if (devices.length === 0) return { sent: 0 };

    for (let i = 0; i < devices.length; i += CHUNK) {
      const batch = devices.slice(i, i + CHUNK);
      const payloads = batch.map((d) => ({
        to: d.expoToken,
        title: msg.title,
        body: msg.body,
        data: msg.data,
        sound: "default",
      }));
      try {
        const tickets = (await post(payloads)) as Ticket[];
        const dead: string[] = []; // token ที่ตาย → ลบทิ้ง
        batch.forEach((d, idx) => {
          const t = tickets[idx];
          if (t?.status === "error" && t.details?.error === "DeviceNotRegistered") {
            dead.push(d.expoToken);
          } else {
            sent += 1; // ส่งเข้าเครื่องนี้ได้
          }
        });
        if (dead.length > 0) {
          await prisma.pushDevice.deleteMany({ where: { expoToken: { in: dead } } });
        }
      } catch (e) {
        // chunk นี้ส่งพลาด (เน็ตพัง/Expo ล่ม) → log แล้วไปต่อ chunk ถัดไป
        const { logOps } = await import("@/lib/core/ops");
        await logOps("ERROR", "push", `ส่ง push ล้มเหลว (tenant ${tenantId})`, {
          detail: String(e).slice(0, 500),
          tenantId,
        }).catch(() => {});
      }
    }
  } catch (e) {
    // อ่านเครื่อง/อื่น ๆ พัง → log เงียบ ไม่พา flow หลักพัง
    const { logOps } = await import("@/lib/core/ops");
    await logOps("ERROR", "push", `push พัง (tenant ${tenantId})`, {
      detail: String(e).slice(0, 500),
      tenantId,
    }).catch(() => {});
  }
  return { sent };
}
