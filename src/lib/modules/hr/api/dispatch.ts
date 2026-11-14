// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST ระบบงานบุคคล (ใบ H4.8)
//
// ตรรกะทั้งหมด (จับคู่ path · ด่านคีย์/ระบบ/เพดาน/สิทธิ์ · กันซ้ำ · ซอง · audit) อยู่ที่แกนกลาง `src/lib/api/dispatch.ts` (แช่แข็ง)
// ที่นี่เพิ่มอย่างเดียว (มติ 14 พ.ย. ข้อ 4): บอก actor ว่าคีย์ "ผูกระบบ HR ที่คำขอนี้ทำงานอยู่" ไหม
//   คีย์กลาง (ไม่ผูกระบบ) ที่ส่ง X-Shark-System มา และคีย์ของระบบอื่น ⇒ actor ไม่มีสิทธิ์ใดเลย ⇒ แกนตอบ 403 scope_missing
//   ไบต์เดียวกับคีย์ผูกระบบที่ไม่มี scope ของ HR — คีย์ที่ไม่ได้ออกจากหน้าตั้งค่า HR (เจ้าของร้าน + ยินยอมข้อมูลเงินเดือน) ใช้กับ HR ไม่ได้เลย
// 🔴 ตรวจคีย์ที่นี่แค่ "อ่านว่าผูกระบบไหน" — การยืนยันตัวตน/หมดอายุ/เพิกถอนยังเป็นของแกน (คำตอบ 401 มาจากแกนเท่านั้น)
import { dispatch as coreDispatch } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import type { ApiModuleConfig } from "@/lib/api/require";
import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { hrApiKeyActor } from "./actor";
import { HR_API_CONFIG } from "./config";
import { HR_OPS } from "./registry";

/** ระบบที่คีย์ใน Authorization ผูกไว้ (null = ไม่ผูก/ไม่มีคีย์/คีย์ใช้ไม่ได้ — แกนตัดสินเองต่อ) */
async function boundSystemOf(req: Request): Promise<string | null> {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  const v = await verifyApiKeyDetailed(raw);
  return v.status === "ok" ? v.key.systemId : null;
}

export async function dispatch(method: ApiMethod, req: Request, params: { path?: string[] }): Promise<Response> {
  const bound = await boundSystemOf(req);
  const cfg: ApiModuleConfig = { ...HR_API_CONFIG, makeActor: (input) => hrApiKeyActor({ ...input, bound: bound !== null && bound === input.systemId }) };
  return coreDispatch(HR_OPS, method, req, params, cfg);
}
