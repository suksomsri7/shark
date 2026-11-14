// ส่งออกนัดส่วนตัวไปปฏิทินในเครื่อง (CAL2.11) — เรียกตอนจอปฏิทินได้ focus และหลังแผ่นเพิ่ม/แก้บันทึก (calChanged)
//   ชุดเปิด = items?tab=today + upcoming (นัดส่วนตัว OPEN) · สำเนาที่ไม่อยู่ในชุด = ถามเซิร์ฟเวอร์ทีละตัว (≤ 10/รอบ): ปิด/ยกเลิก/ไม่พบ ⇒ ลบสำเนาในเครื่อง
import { ApiError } from "@/src/api/client";
import { calApi, type CalItemDto } from "@/src/api/calendar";
import { loadDevicePrefs, syncDeviceExports } from "./device-calendar";

let running = false;
export async function runDeviceExportSync(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const p = await loadDevicePrefs();
    if (!p.enabled || !p.exportEvents) return;
    const [a, b] = await Promise.all([calApi.items("today", 100), calApi.items("upcoming", 100)]);
    const open: CalItemDto[] = [...(a.items ?? []), ...(b.items ?? [])].filter((x) => x.kind === "EVENT" && x.status === "OPEN");
    const openIds = new Set(open.map((x) => x.id));
    const closed: string[] = [];
    for (const id of Object.keys(p.map).filter((x) => !openIds.has(x)).slice(0, 10)) {
      try {
        const r = await calApi.item(id);
        if (r.item.status !== "OPEN") closed.push(id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) closed.push(id);
      }
    }
    await syncDeviceExports(open, closed);
  } catch {
    // ออฟไลน์ = รอบหน้า
  } finally {
    running = false;
  }
}
