// sms.ts — ทางออก SMS ของทั้งระบบ (M3.2 · พิมพ์เขียว §5.9 ช่องทางที่ 3)
//
// 🔴 วันนี้ร้านยังไม่มีเกตเวย์ SMS ⇒ ไฟล์นี้คือ **สัญญา (interface)** ไม่ใช่ตัวส่งจริง
//    `getSmsProvider()` คืน `null` เมื่อยังไม่ตั้ง env ⇒ ผู้เรียก (แคมเปญ/แจ้งเตือน) ต้องถือว่า
//    "ช่องทาง SMS ปิดอยู่" แล้วข้ามไปช่องถัดไป — **ห้ามแกล้งทำเป็นส่งสำเร็จ**
//    (บทเรียน push 29 ส.ค.: ตัวเลขที่โกหกแพงกว่าไม่มีตัวเลข เพราะมันปิดทางสงสัย)
//
// 🔴 ไม่ import `@/lib/env` — ไฟล์นี้ถูกอ่านโดยทะเบียน/สคริปต์ที่รันโดยไม่มี env ครบ (fitness 2 โหมด)
//    ⇒ อ่าน `process.env` ตรง ๆ แล้ว fail-closed
//
// เสียบผู้ให้บริการจริงทีหลัง = เพิ่ม 1 บล็อกใน `resolveProvider()` ไม่ต้องแตะผู้เรียกเลย

/** ข้อความ 1 ฉบับ (ข้อความล้วน — SMS ไม่มี HTML) */
export type SmsMessage = {
  /** เบอร์ปลายทางรูปแบบไทย (0xxxxxxxxx) หรือสากล (+66xxxxxxxxx) */
  to: string;
  text: string;
};

export type SmsSendResult = { ok: boolean; error?: string; externalId?: string };

/** ผู้ให้บริการ SMS 1 ราย — ทุกรายต้องทำ interface เดียวกัน */
export type SmsProvider = {
  /** ชื่อที่โชว์ในบันทึก/หน้าตั้งค่า (ไม่ใช่ความลับ) */
  readonly name: string;
  /** ส่ง 1 ฉบับ — ห้าม throw: ล้มแล้วคืน `{ ok:false, error }` ให้ผู้เรียกบันทึกเหตุผลได้ */
  send(msg: SmsMessage): Promise<SmsSendResult>;
};

/**
 * ค่าส่งต่อข้อความ (สตางค์) — ใช้คิด "ต้นทุนสูงสุด" ของแคมเปญ (§4.3)
 * LINE / อีเมล / push = 0 เพราะอยู่ในค่าบริการที่ร้านจ่ายอยู่แล้ว · SMS จ่ายต่อข้อความจริง
 */
export const SMS_COST_SATANG = 60;

/** เบอร์ไทย → รูปแบบสากล (+66…) · เบอร์ที่อ่านไม่ออก = null (ผู้เรียกข้ามคนนั้น) */
export function toE164Thai(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 10 ? digits : null;
  if (digits.startsWith("66")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+66${digits.slice(1)}`;
  return null;
}

// ───────────────────────── ตัวจริง (ยังไม่มีใครเสียบ) ─────────────────────────

// 🔴 โหมด mock (S1.19) — เฉพาะเมื่อตั้ง `SMS_PROVIDER=mock` ตรง ๆ เท่านั้น (dev/QC ที่ยังไม่มีเกตเวย์)
//    "ส่ง" = เขียนข้อความลง OpsEvent (logOps INFO "sms-mock") แล้วคืน ok — ไม่ออกนอกเครื่อง
//    ข้อความอาจมีรหัส OTP ⇒ `APP_ENV=production` เมิน mock เสมอ (R-S1.19c) · ฝั่งจริงต้องตั้ง SMS_PROVIDER/SMS_API_KEY/SMS_ENDPOINT
const mockProvider: SmsProvider = {
  name: "mock",
  async send(msg: SmsMessage): Promise<SmsSendResult> {
    // lazy import — ops.ts ดึง prisma มา · ไฟล์นี้ถูกอ่านโดยสคริปต์ที่ไม่มีฐาน (fitness 2 โหมด) ⇒ โหลดเฉพาะตอนส่ง
    const { logOps } = await import("./ops");
    await logOps("INFO", "sms-mock", "SMS (mock)", { detail: JSON.stringify({ to: msg.to, text: msg.text }) });
    return { ok: true, externalId: `mock-${Date.now()}` };
  },
};

function resolveProvider(): SmsProvider | null {
  const kind = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  // ก่อนตรวจคีย์/endpoint (mock ไม่ต้องมี) · production เมิน mock เสมอ (R-S1.19c) ⇒ null = ช่องทาง SMS ปิด
  if (kind === "mock") return process.env.APP_ENV === "production" ? null : mockProvider;
  const apiKey = (process.env.SMS_API_KEY ?? "").trim();
  const sender = (process.env.SMS_SENDER ?? "SHARK").trim();
  if (!kind || !apiKey) return null;

  // ผู้ให้บริการไทยส่วนใหญ่รับ POST JSON { to, text, sender } + Bearer key
  // (รูปแบบเดียวกับ Thaibulksms/SMSMKT/8x8) ⇒ ตัวห่อกลางตัวเดียวพอจนกว่าจะเจอรายที่ต่างจริง
  const endpoint = (process.env.SMS_ENDPOINT ?? "").trim();
  if (!endpoint) return null;

  return {
    name: kind,
    async send(msg: SmsMessage): Promise<SmsSendResult> {
      const to = toE164Thai(msg.to);
      if (!to) return { ok: false, error: "เบอร์โทรไม่อยู่ในรูปแบบที่ส่ง SMS ได้" };
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ to, text: msg.text, sender }),
        });
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `เกตเวย์ SMS ตอบ ${res.status}: ${body.slice(0, 160)}` };
        }
        const json = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
        return { ok: true, externalId: json.id ?? json.messageId };
      } catch (e) {
        return { ok: false, error: `ส่ง SMS ไม่สำเร็จ: ${String(e).slice(0, 160)}` };
      }
    },
  };
}

let cached: SmsProvider | null | undefined;

/**
 * ผู้ให้บริการ SMS ที่ร้านนี้ใช้อยู่ — `null` = ยังไม่ได้ตั้งค่า ⇒ **ช่องทาง SMS ปิด**
 * 🔴 ผู้เรียกต้องเช็ค null ทุกครั้ง ห้ามสมมติว่ามีเสมอ
 */
export function getSmsProvider(): SmsProvider | null {
  if (cached === undefined) cached = resolveProvider();
  return cached;
}

/** ล้างแคชผู้ให้บริการ — ข้อสอบเท่านั้น (ตั้ง env แล้วเรียกเพื่อให้อ่าน env ใหม่) */
export function __resetSmsProviderCacheForTests(): void {
  cached = undefined;
}

/** เปิดใช้ SMS ได้ไหม (หน้าจอเอาไปทำให้แท็บ SMS เป็นสีจาง + บอกเหตุผล) */
export function smsEnabled(): boolean {
  return getSmsProvider() !== null;
}

/** ส่ง 1 ฉบับผ่านผู้ให้บริการที่ตั้งไว้ — ไม่มีผู้ให้บริการ = คืนเหตุผลไทย ไม่ throw */
export async function sendSms(msg: SmsMessage): Promise<SmsSendResult> {
  const provider = getSmsProvider();
  if (!provider) return { ok: false, error: "ร้านยังไม่ได้เชื่อมเกตเวย์ SMS — ตั้งค่าก่อนจึงจะส่งทาง SMS ได้" };
  return provider.send(msg);
}
