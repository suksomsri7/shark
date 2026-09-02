// ที่อยู่/แผนที่ของสาขา — **ส่วนที่ไม่แตะฐานข้อมูล** (WO-CV14 ข)
//
// 🔴 แยกไฟล์เพราะฟอร์มฝั่ง `"use client"` ต้องใช้ `shopMapLink` เพื่อโชว์ "ตัวอย่างลิงก์ที่ลูกค้า
//    จะได้รับ" แบบสด ๆ ขณะพิมพ์ — แต่ `location.ts` import `tenantDb` (ลาก PrismaClient ติดมา)
//    ⇒ import ตรงจากคอมโพเนนต์ client ไม่ได้ · เหตุผลเดียวกับ `storage/upload-accept.ts`
// 🔴 ตรรกะการตรวจค่าอยู่ที่นี่ที่เดียว — ฝั่งเซิร์ฟเวอร์ (`saveUnitLocation`) เรียกตัวเดียวกันนี้
//    หน้าจอจึงเป็นแค่ "บอกให้เร็ว" ไม่ใช่ด่านที่สอง (ด่านจริงยังอยู่ฝั่งเซิร์ฟเวอร์เสมอ)

/** ที่อยู่/แผนที่ของสาขาในรูปที่หน้าจอกับปุ่มแชทใช้ร่วมกัน (ค่าว่าง = ยังไม่ได้ตั้ง) */
export type UnitLocation = {
  address: string;
  mapUrl: string;
  lat: number | null;
  lng: number | null;
};

export const EMPTY_UNIT_LOCATION: UnitLocation = { address: "", mapUrl: "", lat: null, lng: null };

/** ที่อยู่ยาวสุดที่ยอมให้กรอก — ยาวกว่านี้คือคนวางข้อความอื่นผิดช่อง ไม่ใช่ที่อยู่ */
export const UNIT_ADDRESS_MAX = 500;

export function settingsObject(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? { ...(settings as Record<string, unknown>) }
    : {};
}

/**
 * อ่านค่าที่ตั้งไว้จาก `BusinessUnit.settings`
 * 🔴 ยอมรับเฉพาะค่าที่ชนิดถูกต้องจริง — `lat: "13.7"` (สตริง) ที่หลุดเข้ามาจากยุคก่อน
 *    ต้องถือว่า "ยังไม่ได้ตั้ง" ไม่ใช่แปลงให้เอง เพราะพิกัดที่เดาผิด = ลูกค้าขับรถไปผิดที่
 */
export function readUnitLocation(settings: unknown): UnitLocation {
  const s = settingsObject(settings);
  return {
    address: typeof s.address === "string" ? s.address.trim() : "",
    mapUrl: typeof s.mapUrl === "string" ? s.mapUrl.trim() : "",
    lat: typeof s.lat === "number" && Number.isFinite(s.lat) ? s.lat : null,
    lng: typeof s.lng === "number" && Number.isFinite(s.lng) ? s.lng : null,
  };
}

/**
 * ลิงก์แผนที่ที่ลูกค้าจะได้รับ — ลำดับ `mapUrl` > พิกัด > ที่อยู่ · ไม่มีอะไรเลย = `""`
 *
 * 🔴 ต้องตรงกับ `shopLocationAction` (chat/room-actions.ts) เป๊ะ ๆ — หน้าตั้งค่าโชว์ "ตัวอย่าง
 *    ลิงก์ที่ลูกค้าจะได้รับ" ถ้าสองฝั่งคิดคนละแบบ ตัวอย่างบนหน้าจอจะกลายเป็นคำโกหก
 *    (ข้อสอบ UL-5.1/UL-5.4 คุมทั้งค่าที่คืนและตรรกะฝั่งแชทไว้พร้อมกัน)
 * 🔴 ห้ามเดา/ห้ามใส่พิกัดตัวอย่างเมื่อยังไม่ได้ตั้ง
 */
export function shopMapLink(loc: UnitLocation): string {
  if (loc.mapUrl !== "") return loc.mapUrl;
  if (loc.lat !== null && loc.lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
  }
  if (loc.address !== "") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}`;
  }
  return "";
}

export type UnitLocationInput = {
  address?: unknown;
  mapUrl?: unknown;
  lat?: unknown;
  lng?: unknown;
};

export type ParseResult = { ok: true; value: UnitLocation } | { ok: false; error: string };

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * ตรวจค่าที่กรอกมา **ก่อน** แตะฐานข้อมูล — ไม่ผ่าน = คืนข้อความไทยที่บอกว่าต้องกรอกยังไง
 * (ห้ามเขียนแบบโทษผู้ใช้ · หน้าจอเอาไปแสดง inline ใต้ฟอร์ม ไม่ใช่ alert)
 */
export function parseUnitLocationInput(input: UnitLocationInput): ParseResult {
  const address = str(input.address);
  if (address.length > UNIT_ADDRESS_MAX) {
    return { ok: false, error: `ที่อยู่ยาวได้ไม่เกิน ${UNIT_ADDRESS_MAX} ตัวอักษร — ตัดให้สั้นลงแล้วบันทึกอีกครั้งได้เลย` };
  }

  const mapUrl = str(input.mapUrl);
  if (mapUrl !== "" && !isHttpsUrl(mapUrl)) {
    return {
      ok: false,
      error: "ลิงก์แผนที่ต้องขึ้นต้นด้วย https:// (เช่นลิงก์ที่กด “แชร์” มาจาก Google Maps) — วางลิงก์เต็ม ๆ แล้วบันทึกได้เลย",
    };
  }

  const latRaw = str(input.lat);
  const lngRaw = str(input.lng);
  if ((latRaw === "") !== (lngRaw === "")) {
    return {
      ok: false,
      error: "พิกัดต้องมีทั้งละติจูดและลองจิจูด — กรอกให้ครบทั้งคู่ หรือเว้นว่างทั้งคู่แล้วใช้ที่อยู่/ลิงก์แผนที่แทนก็ได้",
    };
  }

  let lat: number | null = null;
  let lng: number | null = null;
  if (latRaw !== "") {
    lat = Number(latRaw);
    lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: "พิกัดต้องเป็นตัวเลข เช่น 13.7563 และ 100.5018 — คัดลอกจาก Google Maps มาวางได้เลย" };
    }
    if (lat < -90 || lat > 90) {
      return { ok: false, error: "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 — ลองสลับกับช่องลองจิจูดดูอีกครั้ง" };
    }
    if (lng < -180 || lng > 180) {
      return { ok: false, error: "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180 — ลองสลับกับช่องละติจูดดูอีกครั้ง" };
    }
  }

  return { ok: true, value: { address, mapUrl, lat, lng } };
}

// https เท่านั้น (กัน javascript:/data:/http:) — ลิงก์นี้ถูกส่งให้ลูกค้ากดต่อ
function isHttpsUrl(u: string): boolean {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}
