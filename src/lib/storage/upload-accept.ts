// ทะเบียน "ชนิดไฟล์ที่แนบได้" ฝั่งหน้าจอ (WO-CV14 ก) — 🔴 **pure ล้วน ห้าม import อะไรทั้งสิ้น**
//
// ทำไมต้องแยกไฟล์: ทะเบียนจริงอยู่ที่ `src/lib/storage/service.ts` (`ALLOWED_UPLOAD_TYPES`)
// แต่ไฟล์นั้นลาก `@/lib/core/db` (PrismaClient) ติดมาด้วย ⇒ คอมโพเนนต์ `"use client"`
// (composer/inbox-client) import ตรงไม่ได้ จะลาก prisma ลงไปอยู่ในบันเดิลของเบราว์เซอร์
// ⇒ เซิร์ฟเวอร์ส่ง **ตัวทะเบียน** ลงมาเป็น prop แล้วหน้าจอใช้ฟังก์ชันในไฟล์นี้คำนวณต่อ
//
// 🔴 กติกาเหล็กของไฟล์นี้: **ห้ามพิมพ์รายชื่อชนิด/นามสกุลซ้ำ** — ทุกอย่างต้องอนุมานจาก `types`
//    ที่ส่งเข้ามา (ลิสต์ที่สองคือลิสต์ที่จะเพี้ยนจากเซิร์ฟเวอร์ในวันที่ไม่มีใครดู)
//    ข้อยกเว้นเดียวคือ `UPLOAD_TYPE_ALIASES` ซึ่งเป็นเรื่องของ "เบราว์เซอร์เรียกของเดิมด้วยชื่ออื่น"
//    ไม่ใช่การเพิ่มชนิดที่ระบบอนุญาต (ชื่อพ้องที่ไม่มีปลายทางในทะเบียน = ยังถูกปฏิเสธเหมือนเดิม)

/** ทะเบียน mime → นามสกุล (รูปเดียวกับ `ALLOWED_UPLOAD_TYPES` ของ storage/service.ts) */
export type UploadTypeRegistry = Readonly<Record<string, string>>;

/**
 * ชื่อ mime ที่เบราว์เซอร์/OS บางตัวใช้เรียก "ของเดียวกัน" → ชื่อที่อยู่ในทะเบียน
 *
 * 🔴 ของจริงที่เจอบนเครื่องผู้ใช้: ไฟล์ `.wav` ที่มาจาก Windows/โปรแกรมอัดเสียงเก่า มักได้
 *    `audio/wave` หรือ `audio/vnd.wave` (บางเครื่องได้สตริงว่างไปเลย) — ทั้งหมดนี้ไม่มีในทะเบียน
 *    ⇒ ถ้าไม่แปลงชื่อก่อน ผู้ใช้จะเลือกไฟล์ได้แต่โดนปฏิเสธตอนกดส่ง โดยไม่มีทางรู้ว่าทำอะไรผิด
 */
export const UPLOAD_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-pn-wav": "audio/wav",
  "audio/mp3": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "image/jpg": "image/jpeg",
});

/**
 * ตัดพารามิเตอร์ท้าย mime ให้เทียบกับทะเบียนได้ (`audio/webm;codecs=opus` → `audio/webm`)
 * 🔴 ต้องให้ผลตรงกับ `normalizeUploadType()` ของ `storage/service.ts` เป๊ะ ๆ
 *    (ข้อสอบ CM-W.5 เทียบผลของทั้งสองตัวกับ input ชุดเดียวกัน — เพี้ยนเมื่อไหร่แดงทันที)
 */
export function normalizeUploadTypeName(raw: unknown): string {
  return String(raw ?? "").split(";")[0]!.trim().toLowerCase();
}

/** mime นี้ตรงกับชื่อในทะเบียนไหม (ผ่านการแปลงชื่อพ้องแล้ว) — ไม่ตรง = `null` (fail-closed) */
export function canonicalUploadType(raw: unknown, types: UploadTypeRegistry): string | null {
  const t = normalizeUploadTypeName(raw);
  if (t === "") return null;
  if (t in types) return t;
  const alias = UPLOAD_TYPE_ALIASES[t];
  return alias !== undefined && alias in types ? alias : null;
}

/** นามสกุลของชื่อไฟล์ แบบตัวพิมพ์เล็กไม่มีจุด (`เสียง.WAV` → `wav`) · ไม่มีนามสกุล = `""` */
export function fileExtension(fileName: unknown): string {
  const name = String(fileName ?? "");
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).trim().toLowerCase();
}

/**
 * แผนที่กลับ: นามสกุล → mime ที่จะใช้ส่งขึ้นเซิร์ฟเวอร์
 * ชนกันได้ (`audio/wav` กับ `audio/x-wav` ต่างชี้ `wav`) — **ตัวแรกในทะเบียนชนะ**
 * เพราะทะเบียนเรียงจาก "ชื่อมาตรฐาน" ไปหา "ชื่อเก่า/ชื่อพ้อง" อยู่แล้ว
 */
export function mimeByExtension(types: UploadTypeRegistry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [mime, ext] of Object.entries(types)) {
    const e = ext.trim().toLowerCase();
    if (e !== "" && !(e in out)) out[e] = mime;
  }
  return out;
}

/** รายชื่อนามสกุลที่ระบบรับ (เรียงตามทะเบียน ไม่ซ้ำ) — ใช้เขียนข้อความบอกผู้ใช้ ไม่ต้องพิมพ์มือ */
export function uploadExtensions(types: UploadTypeRegistry): string[] {
  return [...new Set(Object.values(types).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/**
 * ค่าของ `<input accept>` — 🔴 **ทั้ง MIME และนามสกุล**
 *
 * ทำไมต้องมีนามสกุลด้วย: หน้าต่างเลือกไฟล์ของ Windows Explorer / GTK (Linux) / Android
 * จับคู่ตัวกรองด้วย **นามสกุล** ไม่ใช่ mime ⇒ `accept` ที่มีแต่ mime ทำให้ `.wav`/`.m4a`
 * เป็นสีเทาเลือกไม่ได้เลย ทั้งที่เซิร์ฟเวอร์รับไฟล์ชนิดนั้นอยู่แล้ว (อาการที่เจ้าของแจ้ง 2 ก.ย.)
 *
 * `filter` ใช้คัดเฉพาะบางกลุ่ม (เช่นช่อง "รูปภาพ"/"ถ่ายรูป" = เฉพาะ `image/*`)
 * — คัดจากทะเบียนเดียวกับที่เซิร์ฟเวอร์ตรวจ ไม่ใช่เหมารวม `image/*` ที่ยอมให้หยิบ TIFF/BMP
 * แล้วผู้ใช้มารู้ว่าไม่ผ่าน **หลัง** อัปเสร็จ
 */
export function buildAcceptAttr(
  types: UploadTypeRegistry,
  filter?: (mime: string) => boolean,
): string {
  const mimes = Object.keys(types).filter((m) => (filter ? filter(m) : true));
  const exts = [...new Set(mimes.map((m) => types[m]!.trim().toLowerCase()).filter(Boolean))];
  return [...mimes, ...exts.map((e) => `.${e}`)].join(",");
}

/**
 * ชนิดไฟล์ที่จะใช้กับไฟล์นี้ — `null` = ระบบยังรับไม่ได้ (ปฏิเสธ **ก่อน** อัป)
 *
 * ลำดับ: mime ที่เบราว์เซอร์บอกมา (ผ่านชื่อพ้อง) → ถ้าไม่ได้ความ ค่อยอนุมานจากนามสกุล
 * 🔴 อนุมานจากนามสกุลเป็นทางเลือกสุดท้ายโดยตั้งใจ — mime ที่เบราว์เซอร์บอกน่าเชื่อกว่า
 *    ส่วนเซิร์ฟเวอร์ยังตรวจซ้ำอีกชั้นเสมอ (ที่นี่คือ "บอกผู้ใช้ให้เร็ว" ไม่ใช่ "ด่านความปลอดภัย")
 */
export function inferUploadType(
  file: { name?: unknown; type?: unknown },
  types: UploadTypeRegistry,
): string | null {
  const byMime = canonicalUploadType(file?.type, types);
  if (byMime !== null) return byMime;
  const ext = fileExtension(file?.name);
  if (ext === "") return null;
  return mimeByExtension(types)[ext] ?? null;
}

/**
 * คืนไฟล์ที่ "มี mime ตรงกับชื่อในทะเบียนเป๊ะ ๆ" ให้ส่งขึ้นเซิร์ฟเวอร์
 *
 * 🔴 เทียบ `file.type` **ดิบ** ไม่ใช่ค่าที่ normalize แล้ว — เพราะด่านฝั่งเซิร์ฟเวอร์
 *    (`chat/actions.ts:uploadReplyFiles`) เทียบ `f.type` ดิบกับทะเบียนตรง ๆ
 *    ⇒ ไฟล์ที่ type มีพารามิเตอร์ห้อย (`audio/webm;codecs=opus`) หรือเป็นชื่อพ้อง
 *    (`audio/wave`) หรือพิมพ์ใหญ่ จะยังถูกปฏิเสธที่เซิร์ฟเวอร์ ทั้งที่หน้าจอบอกว่าผ่านแล้ว
 *    — ความไม่ตรงกันแบบนี้แหละที่ทำให้ผู้ใช้ไม่รู้ว่าต้องทำอะไรต่อ
 * 🔴 ห่อไม่สำเร็จ (สภาพแวดล้อมที่ `new File()` ใช้ไม่ได้) → คืนตัวเดิม ไม่โยน
 *    ให้เซิร์ฟเวอร์เป็นคนบอกเหตุผล ดีกว่ากล่องพิมพ์ค้างเพราะ error ที่ไม่มีใครเห็น
 */
export function withUploadType(file: File, mime: string): File {
  if (file.type === mime) return file;
  try {
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
