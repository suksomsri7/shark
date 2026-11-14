"use server";

// api-key-actions.ts — server action ของการ์ด "คีย์ API ของระบบงานบุคคล" ในหน้าตั้งค่า HR (ใบ H4.8 · brief R3 · มติ Q3 · O1)
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ตรรกะ/กติกาทั้งหมดอยู่ที่ `api/keys.ts` (ทดสอบได้โดยไม่ต้องมี Next)
//    ที่นี่แค่: ร้าน/ผู้ใช้จาก session (requireTenant) → core → revalidate · คำปฏิเสธ "คืน" เสมอ {ok:false, code, message}
// 🔴 คีย์ดิบคืนครั้งเดียว · ไม่ log อะไรนอกจากชนิดของ error
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { issueHrApiKey, listHrApiKeys, revokeHrApiKey } from "./api/keys";

const PATH = (systemId: string) => `/app/sys/${systemId}/hr/settings`;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const UNKNOWN = { ok: false as const, code: "UNKNOWN" as const, message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };

function unexpected(where: string, e: unknown) {
  unstable_rethrow(e);
  console.error(`[hr/api-key-actions] ${where}`, e instanceof Error ? e.name : "Error");
  return UNKNOWN;
}

/** รายการคีย์ของระบบ HR นี้ (เจ้าของร้านเท่านั้น) */
export async function listHrApiKeysAction(input: { systemId: string }) {
  try {
    const auth = await requireTenant();
    return await listHrApiKeys(auth, { systemId: isRecord(input) ? str(input.systemId) : "" });
  } catch (e) {
    return unexpected("list", e);
  }
}

/** ออกคีย์ — {systemId, name, bundle (hr-read|hr-leave|hr-payroll-read), ttlDays (30|90|365|0), payConsent?} */
export async function issueHrApiKeyAction(input: { systemId: string; name: string; bundle: string; ttlDays: number; payConsent?: boolean }) {
  try {
    if (!isRecord(input)) return { ok: false as const, code: "VALIDATION" as const, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
    const auth = await requireTenant();
    const systemId = str(input.systemId);
    const r = await issueHrApiKey(auth, { systemId, name: str(input.name), bundle: str(input.bundle), ttlDays: typeof input.ttlDays === "number" ? input.ttlDays : Number.NaN, payConsent: input.payConsent === true });
    if (r.ok) revalidatePath(PATH(systemId));
    return r;
  } catch (e) {
    return unexpected("issue", e);
  }
}

/** เพิกถอนคีย์ของระบบ HR นี้ */
export async function revokeHrApiKeyAction(input: { systemId: string; keyId: string }) {
  try {
    if (!isRecord(input)) return { ok: false as const, code: "VALIDATION" as const, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
    const auth = await requireTenant();
    const systemId = str(input.systemId);
    const r = await revokeHrApiKey(auth, { systemId, keyId: str(input.keyId) });
    if (r.ok) revalidatePath(PATH(systemId));
    return r;
  } catch (e) {
    return unexpected("revoke", e);
  }
}
