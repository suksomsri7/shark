import { env, emailEnabled } from "@/lib/env";

// ส่งอีเมล — dev fallback: log ออก console (ยังไม่มี Resend key)
// เมื่อเสียบ RESEND_API_KEY จะส่งจริงผ่าน Resend (verify domain shark.in.th)
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailEnabled) {
    console.log(
      `\n┌─ [email:dev] ────────────────────────────────\n│ to:      ${to}\n│ subject: ${subject}\n│ ${text.replace(/\n/g, "\n│ ")}\n└──────────────────────────────────────────────\n`,
    );
    return;
  }
  // resilient: ไม่ throw ถ้าส่งพลาด (เช่น domain ยังไม่ verify → ส่งได้เฉพาะเจ้าของบัญชี)
  // login ยังทำงานผ่าน on-screen OTP ใน preview
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[email] Resend ส่งไม่สำเร็จ (${res.status}): ${body}`);
      // เมลคือเส้นเลือด login — ล้มเงียบไม่ได้อีกแล้ว (เคส OTP หายเงียบ 23 ก.ค.) → ลง OpsEvent ให้ตรวจย้อนได้
      const { logOps } = await import("@/lib/core/ops");
      await logOps("ERROR", "email", `Resend ${res.status} ถึง ${to}`, { detail: body.slice(0, 500) });
    }
  } catch (e) {
    console.warn("[email] Resend error:", e);
    const { logOps } = await import("@/lib/core/ops");
    await logOps("ERROR", "email", `Resend exception ถึง ${to}`, { detail: String(e).slice(0, 500) }).catch(() => {});
  }
}
