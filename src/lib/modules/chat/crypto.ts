import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// เข้ารหัส BYOK credentials ของช่องทาง (LINE channel access token/secret) ด้วย AES-256-GCM
// key มาจาก env CHAT_CREDENTIALS_KEY (platform) — derive 32 bytes ด้วย sha256
// เก็บใน DB เป็นสตริง "base64(iv).base64(tag).base64(cipher)" (ใน field Json ของ connection.credentials)
// decrypt เฉพาะใน adapter/service layer — ห้าม return ค่าเต็มออก API (ใช้ mask())

function key(): Buffer {
  const raw = process.env.CHAT_CREDENTIALS_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[chat] ไม่มี env CHAT_CREDENTIALS_KEY สำหรับเข้ารหัส credentials");
    }
    // dev fallback — เตือนแต่ไม่ล้ม (คีย์คงที่ต่อเครื่อง)
    return createHash("sha256").update("chat-dev-fallback-key").digest();
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptCreds(obj: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plain = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptCreds<T = Record<string, unknown>>(payload: unknown): T {
  if (payload && typeof payload === "object") return payload as T; // ยังไม่เข้ารหัส (dev/seed)
  if (typeof payload !== "string" || !payload.includes(".")) return {} as T;
  const [ivB64, tagB64, dataB64] = payload.split(".");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(dec.toString("utf8")) as T;
  } catch {
    return {} as T;
  }
}

// mask ค่าลับก่อนส่งออก API (โชว์ 4 ตัวท้าย)
export function mask(value?: string | null): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
}
