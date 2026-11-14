// zip.ts — เขียนไฟล์ ZIP แบบ STORE (ไม่บีบอัด) ด้วย Node ล้วน (ACC T4.5) · ไม่เพิ่ม dependency
//   ใช้ส่งออก "สมุดบัญชีที่พิมพ์ได้ + ไฟล์แนบ" ก่อนลบร้าน — ไฟล์แนบ (PDF/รูป) บีบอัดแล้วในตัว จึงไม่ต้อง deflate
//   ชื่อไฟล์ UTF-8 (ตั้งบิต 11 ของ general purpose flag) ⇒ ชื่อภาษาไทยเปิดได้ใน Windows/macOS
import { Buffer } from "node:buffer";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export type ZipEntry = { name: string; data: Uint8Array | string; date?: Date };

/** รวมไฟล์เป็น ZIP (STORE) — ชื่อซ้ำจะถูกเติม " (2)" · ขนาดรวมต้อง < 4 GB (ไม่ใช้ ZIP64) */
export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;
  for (const e of entries) {
    let name = e.name.replace(/^\/+/, "").replace(/\\/g, "/");
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      let i = 2;
      const base = dot > name.lastIndexOf("/") ? name.slice(0, dot) : name;
      const ext = dot > name.lastIndexOf("/") ? name.slice(dot) : "";
      while (used.has(`${base} (${i})${ext}`)) i++;
      name = `${base} (${i})${ext}`;
    }
    used.add(name);
    const data = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : Buffer.from(e.data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const { time, date } = dosTime(e.date ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** อ่าน ZIP (STORE) กลับเป็นรายการ — ใช้ตรวจในชุดทดสอบ */
export function readZipStore(buf: Buffer): { name: string; data: Buffer; crcOk: boolean }[] {
  const out: { name: string; data: Buffer; crcOk: boolean }[] = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const crc = buf.readUInt32LE(p + 14);
    const size = buf.readUInt32LE(p + 18);
    const nlen = buf.readUInt16LE(p + 26);
    const xlen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString("utf8");
    const data = buf.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 30 + nlen + xlen + size;
  }
  return out;
}
