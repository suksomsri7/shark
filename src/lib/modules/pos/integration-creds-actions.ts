"use server";
// integration-creds-actions.ts — server action ของการ์ด credentials (P3-SKEL K2) · เปลือกบาง: session → ctx/actor → integration-creds.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ integration-creds.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ร้าน + บทบาทมาจาก membership ของ SESSION เท่านั้น · systemId/unitId ถูกตรวจซ้ำในตัวโมดูล
// 🔴 ไม่ log ค่าที่ส่งมา (ค่าลับ) — log ได้แค่ชื่อ error

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import {
  readIntegrationCredentials,
  saveIntegrationCredentials,
  testIntegrationConnection,
  type PosIntegrationResult,
  type PosIntegrationTestResult,
} from "./integration-creds";

type Args = { systemId: string; unitId: string; input: unknown };

/** ด่านหยาบระดับโมดูล (ไม่มีสาขา) — มีสิทธิ์ตั้งค่าการเชื่อมต่ออย่างใดอย่างหนึ่ง · ด่านละเอียด (ชนิด · สาขา · OWNER-only ตอนบันทึก) อยู่ในโมดูล */
function gateOk(m: ReturnType<typeof posMembership>): boolean {
  for (const action of ["pos.channel.manage", "pos.settings.payment", "pos.settings.manage"]) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      // ลองสิทธิ์ถัดไป
    }
  }
  return false;
}

async function run<T>(where: string, args: Args, fn: (ctx: { tenantId: string; systemId: string; unitId: string }, actor: { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> }, input: unknown) => Promise<T>): Promise<T | { ok: false; code: "UNKNOWN"; message: string; messageKey: string }> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!gateOk(m)) return { ok: false, code: "PERMISSION_DENIED", message: "ไม่มีสิทธิ์จัดการการเชื่อมต่อนี้", messageKey: "platform.errors.permissionDenied" } as T;
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    const unitId = args && typeof args.unitId === "string" ? args.unitId : "";
    return await fn({ tenantId: auth.active.tenantId, systemId, unitId }, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, args?.input);
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pos/integration-creds-actions] ${where}`, e instanceof Error ? e.name : "error");
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง", messageKey: "platform.errors.unknown" };
  }
}

/** อ่าน credentials แบบปิดบัง (การ์ดในลิ้นชักช่องทาง / ตั้งค่ารับเงิน / e-Tax) */
export async function readIntegrationCredentialsAction(args: Args): Promise<PosIntegrationResult> {
  return run("read", args, (c, a, i) => readIntegrationCredentials(c, a, i));
}

/** บันทึก credentials — เจ้าของร้านเท่านั้น (ตรวจในโมดูล) */
export async function saveIntegrationCredentialsAction(args: Args): Promise<PosIntegrationResult> {
  return run("save", args, (c, a, i) => saveIntegrationCredentials(c, a, i));
}

/** ทดสอบการเชื่อม — โครง: ไม่ยิงเครือข่าย (NOT_CONFIGURED / ADAPTER_PENDING) */
export async function testIntegrationConnectionAction(args: Args): Promise<PosIntegrationTestResult> {
  return run("test", args, (c, a, i) => testIntegrationConnection(c, a, i));
}
