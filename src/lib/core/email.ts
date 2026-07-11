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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend ส่งไม่สำเร็จ: ${res.status} ${await res.text()}`);
  }
}
