// อ่านความกว้าง/สูงของรูปจาก header ไม่กี่ไบต์แรก (ไม่ decode ทั้งภาพ · ไม่พึ่ง native lib)
//
// ทำไมต้องมี: สัญญา §3.2 ของ chat API กำหนดให้ไฟล์แนบมี `width`/`height`
// widget/แอปต้องรู้สัดส่วนก่อนรูปโหลดเสร็จ ไม่งั้นข้อความด้านล่างกระตุกทุกครั้งที่รูปมาถึง
// รูปแบบที่อ่านไม่ออก (heic/pdf/doc) → null ทั้งคู่ ตามสัญญา (ฟิลด์เป็น nullable)

export type ImageSize = { width: number; height: number } | null;

function png(b: Uint8Array): ImageSize {
  // 8 ไบต์ signature + chunk IHDR (len 4 + type 4) → width/height เป็น big-endian 4 ไบต์
  if (b.length < 24) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

function gif(b: Uint8Array): ImageSize {
  if (b.length < 10) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) }; // little-endian
}

function jpeg(b: Uint8Array): ImageSize {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2; // ข้าม SOI (FFD8)
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // padding ระหว่าง segment — เดินต่อทีละไบต์
      continue;
    }
    const marker = b[i + 1]!;
    // SOFn ทุกตัวยกเว้น DHT(C4) / JPG(C8) / DAC(CC) — โครง 5 ไบต์แรกเหมือนกันหมด
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    }
    const len = dv.getUint16(i + 2);
    if (len < 2) return null; // segment พัง — หยุด ไม่วนไม่จบ
    i += 2 + len;
  }
  return null;
}

function webp(b: Uint8Array): ImageSize {
  if (b.length < 30) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (fourcc === "VP8X") {
    // canvas size เก็บเป็น 24-bit little-endian (ค่าจริง = ที่เก็บ + 1)
    const w = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    const h = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
    return { width: w, height: h };
  }
  if (fourcc === "VP8 ") {
    return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
  }
  if (fourcc === "VP8L") {
    const bits = dv.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** ขนาดรูปจากไบต์ต้นไฟล์ — อ่านไม่ออก/ไม่ใช่รูป → null (ห้าม throw) */
export function imageSize(data: Uint8Array, mimeType: string): ImageSize {
  try {
    const m = mimeType.trim().toLowerCase();
    const size =
      m === "image/png" ? png(data)
      : m === "image/gif" ? gif(data)
      : m === "image/jpeg" ? jpeg(data)
      : m === "image/webp" ? webp(data)
      : null;
    if (!size) return null;
    // ค่าที่ไม่สมเหตุสมผล = อ่านผิดตำแหน่ง ดีกว่าส่ง 0 ให้ฝั่งหน้าจอไปหารแล้วพัง
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
    if (size.width <= 0 || size.height <= 0) return null;
    return size;
  } catch {
    return null;
  }
}
