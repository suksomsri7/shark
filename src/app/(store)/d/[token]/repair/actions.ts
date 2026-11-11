"use server";
// SVC D.16 ▸ action สาธารณะของหน้าแจ้งซ่อมผู้เช่า (แจ้งซ่อม · ให้คะแนน) — ด่านจริงอยู่ใน facade หอ (rate ต่อ IP → ลายเซ็น → สัญญา live → งานของสัญญานี้)
//   🔴 ไม่รับร้าน/หน่วย/สัญญาจากคำขอ (มาจาก token เท่านั้น) · clientKey = IP ลำดับเดียวกับ D.9 · ไฟล์รูปอ่านไบต์หลังผ่านด่านขนาด (read) ·
//      ไฟล์ "use server": export async function เท่านั้น
import { headers } from "next/headers";
import { ratePortalRepair, submitPortalRepair } from "@/lib/modules/dorm";
import { portalClientKey } from "@/lib/platform/dorm-portal";

const BAD_INPUT = { ok: false as const, code: "INVALID_INPUT" as const, reason: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
const MAX_FILES = 8;

const text = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function submitRepairAction(token: string, prev: unknown, fd: FormData) {
  void prev;
  if (!(fd instanceof FormData)) return BAD_INPUT;
  const clientKey = portalClientKey(await headers(), ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]); // ลำดับเดียวกับหน้า (PORTAL_IP_HEADERS)
  const photos = fd
    .getAll("photos")
    .filter((f): f is File => typeof f !== "string" && f.size > 0)
    .slice(0, MAX_FILES)
    .map((file) => ({ size: file.size, contentType: file.type || "application/octet-stream", read: () => file.arrayBuffer().then((b) => new Uint8Array(b)) }));
  const pt = text(fd, "preferredTime");
  return submitPortalRepair(
    typeof token === "string" ? token : "",
    {
      category: text(fd, "category"),
      text: text(fd, "text"),
      allowEntry: fd.get("allowEntry") !== null,
      preferredTime: pt.trim() ? pt : null,
      photos,
      idempotencyKey: text(fd, "idempotencyKey"),
    },
    { clientKey },
  );
}

export async function rateRepairAction(token: string, prev: unknown, fd: FormData) {
  void prev;
  if (!(fd instanceof FormData)) return BAD_INPUT;
  const clientKey = portalClientKey(await headers(), ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"]);
  const note = text(fd, "note");
  return ratePortalRepair(
    typeof token === "string" ? token : "",
    { repairId: text(fd, "repairId"), rating: Number(text(fd, "rating")), note: note.trim() ? note : null },
    { clientKey },
  );
}
