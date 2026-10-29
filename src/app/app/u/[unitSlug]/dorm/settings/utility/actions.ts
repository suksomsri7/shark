"use server";
// SVC D.7 ▸ action หน้า "ค่าน้ำไฟ · กฎหมาย · VAT" (ภาพ หอ 10) — สัญญา ledger/svc-briefs/svc-brief-d.7.md §5
//   ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับ tenantId/userId จาก input) · ทุกตัว requireUnit + หน่วยต้องเป็น DORM
//   ใส่บิล: ด่าน dorm.bill.run · ยอมรับคำเตือน/เปลี่ยนโหมด: ด่านเจ้าของอยู่ใน service (Membership สด)
//   เงินในฟอร์มกรอกเป็นบาท → แปลงเป็นสตางค์ด้วยข้อความ/จำนวนเต็ม (ไม่ใช้ทศนิยม) · รูป/หลักฐานรับเป็น dataURL ≤ 5 MB
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { acceptUtilityLegalWarn, dormAccess, parseBahtToSatang, recordAuthorityBill, setDormLegalMode } from "@/lib/modules/dorm";

const FILE_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_URL = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/;
const EVIDENCE_URL = /^data:(image\/(?:jpeg|png|webp|heic|heif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;
const MAX_EVIDENCE_FILES = 3;

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
const NO_ACCESS = refuse("FORBIDDEN", "ไม่มีสิทธิ์ทำรายการนี้ของหอนี้");

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  return {
    unitId: unit.id,
    membership,
    actor: { ...membership, userId: auth.active.userId },
    ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId },
  };
}

function fileOf(v: unknown, re: RegExp): { data: Uint8Array; contentType: string } | null {
  if (!isRec(v) || typeof v.dataUrl !== "string") return null;
  const m = re.exec(v.dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > FILE_MAX_BYTES) return null;
  return { data: new Uint8Array(bytes), contentType: m[1] };
}

/** หน่วยรวม: จำนวนเต็มบวก · ว่าง ⇒ undefined (ให้ระบบใช้มิเตอร์รวม) */
function unitsOf(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const t = typeof v === "string" ? v.replace(/[,\s]/g, "") : typeof v === "number" ? String(v) : "";
  if (!/^\d{1,9}$/.test(t)) return null;
  return parseInt(t, 10);
}
const kindOf = (v: unknown): "ELEC" | "WATER" | null => (v === "ELEC" || v === "WATER" ? v : null);
const buildingOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function recordAuthorityBillAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g || !evaluate(g.membership, { module: "dorm", action: "dorm.bill.run", unitId: g.unitId })) return NO_ACCESS;
  if (!isRec(input) || typeof input.periodKey !== "string") return BAD_INPUT;
  const kind = kindOf(input.kind);
  const billSatang = parseBahtToSatang(input.amount);
  const units = unitsOf(input.units);
  if (!kind || billSatang === null || units === null) return refuse("INVALID_INPUT", "กรอกยอดบิลเป็นบาท (ทศนิยมไม่เกิน 2 ตำแหน่ง) และหน่วยเป็นจำนวนเต็ม");
  if (input.photo !== undefined && input.photo !== null && !fileOf(input.photo, PHOTO_URL)) return refuse("INVALID_INPUT", "รูปบิลต้องเป็นไฟล์ภาพไม่เกิน 5 MB");
  const res = await recordAuthorityBill(g.ctx, {
    unitId: g.unitId,
    kind,
    periodKey: input.periodKey,
    buildingId: buildingOf(input.buildingId),
    billSatang,
    ...(units === undefined ? {} : { units }),
    photo: fileOf(input.photo, PHOTO_URL),
  });
  if (res.ok) refresh();
  return res;
}

export async function acceptUtilityLegalAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g || !dormAccess(g.membership, g.unitId).board) return NO_ACCESS;
  if (!isRec(input) || typeof input.periodKey !== "string" || typeof input.reason !== "string") return BAD_INPUT;
  const kind = kindOf(input.kind);
  if (!kind) return BAD_INPUT;
  const res = await acceptUtilityLegalWarn(g.ctx, {
    unitId: g.unitId,
    periodKey: input.periodKey,
    kind,
    buildingId: buildingOf(input.buildingId),
    reason: input.reason,
    // fingerprint ที่เจ้าของเห็นบนจอ — เปลี่ยนแล้ว ⇒ STALE (ยอมรับเฉพาะสิ่งที่เห็น)
    fingerprint: typeof input.fingerprint === "string" ? input.fingerprint : null,
  });
  if (res.ok) refresh();
  return res;
}

export async function setDormLegalModeAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.mode !== "string") return BAD_INPUT;
  if (g.actor.role !== "OWNER") return refuse("OWNER_ONLY", "โหมดตามกฎหมายเปลี่ยนได้เฉพาะเจ้าของกิจการ");
  const mode = input.mode === "STRICT" || input.mode === "WARN" || input.mode === "OUT_OF_SCOPE" ? input.mode : null;
  if (!mode) return BAD_INPUT;
  // หลักฐานใหม่ (ถ้ามี) ส่งให้ service อัปเป็นไฟล์ส่วนตัว "หลัง" ผ่านตรวจเจ้าของ/เหตุผล/ขอบเขตแล้ว (H9) · ไม่แนบ ⇒ ใช้หลักฐานเดิมที่ตั้งไว้
  const uploads: { data: Uint8Array; contentType: string }[] = [];
  if (mode === "OUT_OF_SCOPE" && Array.isArray(input.evidence) && input.evidence.length > 0) {
    if (input.evidence.length > MAX_EVIDENCE_FILES) return refuse("INVALID_INPUT", `แนบหลักฐานได้ครั้งละไม่เกิน ${MAX_EVIDENCE_FILES} ไฟล์`);
    for (const raw of input.evidence) {
      const f = fileOf(raw, EVIDENCE_URL);
      if (!f) return refuse("INVALID_INPUT", "หลักฐานต้องเป็นรูปภาพหรือ PDF ไม่เกิน 5 MB");
      uploads.push(f);
    }
  }
  const res = await setDormLegalMode(
    g.actor,
    { tenantId: g.ctx.tenantId },
    { unitId: g.unitId, mode, reason: typeof input.reason === "string" ? input.reason : null },
    uploads.length ? { evidenceUploads: uploads } : undefined,
  );
  if (res.ok) refresh();
  return res;
}
