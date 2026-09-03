// ตัวช่วยสร้างลิงก์ query-string สำหรับหน้ารายการ V2 (แท็บ/sort/หน้า) — pure function ทดสอบได้โดยไม่ต้องมี DOM
// กติกา: เปลี่ยนคีย์เดียว ต้อง "รักษา" query อื่นทั้งหมดไว้เสมอ (ค้นหา/ช่วงวันที่/ผู้ติดต่อ ฯลฯ)

export type QueryLike = Record<string, string | string[] | undefined> | URLSearchParams;

function toParams(input: QueryLike): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const vv of v) p.append(k, vv);
    } else {
      p.set(k, v);
    }
  }
  return p;
}

/** สร้าง href ใหม่โดยตั้งค่าคีย์ที่ระบุ (undefined = ลบคีย์นั้นออก) เก็บที่เหลือไว้ทั้งหมด */
export function buildHref(pathname: string, current: QueryLike, patch: Record<string, string | undefined>): string {
  const p = toParams(current);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** ลิงก์แท็บสถานะ — เปลี่ยน ?tab= แล้วรีเซ็ตหน้ากลับ 1 เสมอ (เปลี่ยนแท็บ = ชุดข้อมูลใหม่) */
export function buildTabHref(pathname: string, current: QueryLike, tabKey: string): string {
  return buildHref(pathname, current, { tab: tabKey, page: undefined });
}

/** ลิงก์หัวคอลัมน์ที่ sort ได้ — คลิกซ้ำ = สลับทิศทาง (เก็บใน key แยก `dir`) */
export function buildSortHref(
  pathname: string,
  current: QueryLike,
  sortKey: string,
  opts?: { currentSort?: string; currentDir?: "asc" | "desc" },
): string {
  const nextDir = opts?.currentSort === sortKey && opts?.currentDir === "desc" ? "asc" : "desc";
  return buildHref(pathname, current, { sort: sortKey, dir: nextDir, page: undefined });
}

/** ลิงก์เปลี่ยนหน้า/ขนาดหน้า */
export function buildPageHref(pathname: string, current: QueryLike, page: number): string {
  return buildHref(pathname, current, { page: String(page) });
}
export function buildPageSizeHref(pathname: string, current: QueryLike, pageSize: number): string {
  return buildHref(pathname, current, { pageSize: String(pageSize), page: undefined });
}
