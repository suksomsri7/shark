// dbd.ts — ตัวเชื่อม "ค้นหานิติบุคคล" กับ OpenAPI ของกรมพัฒนาธุรกิจการค้า (DBD)
// WO 3.3 · DESIGN-SPEC-V2 §7.2: ปุ่ม "ค้นหา" ข้างเลขทะเบียน 13 หลัก → เติมชื่อ/ที่อยู่ให้อัตโนมัติ
//
// 🔑 สถานะจริง (4 ก.ย. 2026): เจ้าของยังไม่ได้สมัคร API key (`DBD_API_KEY` ยังว่างทั้ง dev/prod)
//    ⇒ ไฟล์นี้ถูกออกแบบให้ "ไม่มีกุญแจก็ต้องไม่พัง": คืน { ok:false, reason } เสมอ และ UI เอา
//      `reason` ไปโชว์ใต้ปุ่มที่ถูกทำให้จาง (ไม่ใช่ error แดง ไม่ใช่ปุ่มที่กดแล้วเงียบ)
//
// กติกาของไฟล์นี้:
//   1) **ห้าม log ข้อมูลลูกค้า** — ไม่พิมพ์เลขทะเบียน/ชื่อ/ที่อยู่ลง console ไม่ว่ากรณีใด
//   2) timeout 5 วินาที (AbortController) — API ภายนอกช้าห้ามแขวนคำขอของผู้ใช้
//   3) ไม่มี dependency ใหม่ — ใช้ fetch ของ runtime
//   4) ทดสอบได้โดยไม่ต่อเน็ต: ทุกฟังก์ชันรับ `fetchImpl` ฉีดเข้ามาได้ (qc-acc-v2-contact-modal.mts ใช้)

/** ผลการค้นหา — ok=false เสมอเมื่อไม่มีกุญแจ/ยิงไม่ผ่าน (ไม่โยน exception ให้ผู้เรียก) */
export type DbdLookupResult =
  | {
      ok: true;
      taxId: string;
      /** ชื่อนิติบุคคลภาษาไทยตามทะเบียน */
      name: string;
      nameEn: string | null;
      /** ที่อยู่แยกช่องเท่าที่ API ให้มา — เติมลงช่องของ modal §7.2 ได้ตรง ๆ */
      address: {
        addressLine: string | null;
        subdistrict: string | null;
        district: string | null;
        province: string | null;
        postcode: string | null;
      };
      /** สถานะนิติบุคคล (ยังดำเนินกิจการ/เลิก…) ถ้า API ให้มา */
      status: string | null;
    }
  | { ok: false; reason: string };

/** เหตุผลมาตรฐาน (ภาษาคน — เอาไปโชว์ใต้ปุ่มได้เลย ตาม BLUEPRINT §0.3 ข้อ 9) */
export const DBD_REASON = {
  noKey: "ยังไม่ได้เชื่อมบริการตรวจนิติบุคคลของกรมพัฒน์ฯ (ต้องใส่กุญแจ DBD_API_KEY ก่อน)",
  badTaxId: "เลขทะเบียนต้องเป็นตัวเลข 13 หลัก",
  timeout: "กรมพัฒน์ฯ ไม่ตอบภายใน 5 วินาที — ลองใหม่อีกครั้ง หรือกรอกเอง",
  notFound: "ไม่พบนิติบุคคลตามเลขทะเบียนนี้ในฐานข้อมูลกรมพัฒน์ฯ",
  unavailable: "ตอนนี้ติดต่อกรมพัฒน์ฯ ไม่ได้ — กรอกข้อมูลเองไปก่อนได้",
} as const;

const DEFAULT_ENDPOINT = "https://openapi.dbd.go.th/api/v1/juristic_person";
const TIMEOUT_MS = 5000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** มีกุญแจให้ใช้ไหม — UI เรียกตัวนี้เพื่อรู้ว่าจะทำปุ่ม "ค้นหา" จางหรือไม่ (ไม่ต้องยิง API ก่อน) */
export function isDbdConfigured(): boolean {
  return !!(process.env.DBD_API_KEY ?? "").trim();
}

/**
 * ค้นหานิติบุคคลจากเลขทะเบียน 13 หลัก
 * - ไม่มีกุญแจ / เลขผิดรูปแบบ / API ล้ม / เกิน 5 วิ → { ok:false, reason } (ไม่ throw)
 * - `fetchImpl` มีไว้ให้ข้อสอบฉีด fetch ปลอมเข้ามา (ไม่มีเน็ตใน CI)
 */
export async function lookupJuristic(
  taxIdRaw: string,
  opts?: { fetchImpl?: FetchLike; apiKey?: string; endpoint?: string; timeoutMs?: number },
): Promise<DbdLookupResult> {
  const taxId = (taxIdRaw ?? "").replace(/\D/g, "");
  if (!/^\d{13}$/.test(taxId)) return { ok: false, reason: DBD_REASON.badTaxId };

  const apiKey = (opts?.apiKey ?? process.env.DBD_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, reason: DBD_REASON.noKey };

  const endpoint = opts?.endpoint ?? process.env.DBD_API_URL ?? DEFAULT_ENDPOINT;
  const doFetch: FetchLike = opts?.fetchImpl ?? ((u, i) => fetch(u, i));
  const timeoutMs = opts?.timeoutMs ?? TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(`${endpoint}/${taxId}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Token ${apiKey}` },
      signal: controller.signal,
    });
  } catch (e) {
    // 🔴 ห้ามใส่ taxId/ชื่อ ลง log — พิมพ์แค่ชนิด error
    const name = e instanceof Error ? e.name : "unknown";
    console.warn(`[account/dbd] เรียกกรมพัฒน์ฯ ไม่สำเร็จ (${name})`);
    return { ok: false, reason: name === "AbortError" ? DBD_REASON.timeout : DBD_REASON.unavailable };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) return { ok: false, reason: DBD_REASON.notFound };
  if (!res.ok) {
    console.warn(`[account/dbd] กรมพัฒน์ฯ ตอบ HTTP ${res.status}`);
    return { ok: false, reason: DBD_REASON.unavailable };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: DBD_REASON.unavailable };
  }
  const parsed = parseDbdPayload(json, taxId);
  return parsed ?? { ok: false, reason: DBD_REASON.notFound };
}

// ─────────────────────────────────────────────────────────────────────────────
// ตัวแกะคำตอบ
//
// 🔴 ทำไมต้องเดินทั้งก้อน JSON แทนอ่านตาม path ตายตัว: คำตอบจริงของ DBD ห่อด้วย namespace
//    (`cd:OrganizationJuristicPerson` › `cd:OrganizationJuristicNameTH` …) และเคยเปลี่ยนโครง
//    ระหว่างรุ่น · ยังไม่มีกุญแจให้ยิงของจริงยืนยัน (เจ้าของยังไม่สมัคร) ⇒ อ่านแบบทนโครงสร้าง:
//    เดินหาคีย์ที่ "ลงท้ายด้วยชื่อที่รู้จัก" แล้วเอาค่าที่เป็นสตริงตัวแรก
//    ถ้าวันหนึ่งได้กุญแจจริงแล้วโครงไม่ตรง → แก้แค่ KEYS ด้านล่าง ไม่ต้องแก้ตรรกะ
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  nameTh: ["organizationjuristicnameth", "juristicnameth", "nameth", "name_th"],
  nameEn: ["organizationjuristicnameen", "juristicnameen", "nameen", "name_en"],
  status: ["organizationjuristicstatus", "juristicstatus", "status_text", "statusth"],
  addressLine: ["addressline", "address_line", "fulladdress", "address"],
  building: ["buildingname"],
  roomNo: ["roomno"],
  floorNo: ["floorno"],
  houseNo: ["houseno", "addressno"],
  villageNo: ["villageno", "moo"],
  soi: ["soi", "lane"],
  street: ["street", "road", "thanon"],
  subdistrict: ["citysubdivisiontexten", "citysubdivisiontext", "subdistrict", "tambon"],
  district: ["citytext", "citynameth", "district", "amphur", "amphoe"],
  province: ["countrysubdivisiontext", "province", "changwat"],
  postcode: ["postcode", "postalcode", "zipcode"],
} as const;

/** เก็บทุกคู่ (คีย์ตัวเล็กไม่มี namespace → ค่าสตริงแรกที่เจอ) จาก JSON ซ้อนกี่ชั้นก็ได้ */
function flattenStrings(node: unknown, out = new Map<string, string>(), depth = 0): Map<string, string> {
  if (depth > 12 || node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const v of node) flattenStrings(v, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  for (const [rawKey, value] of Object.entries(node as Record<string, unknown>)) {
    const key = rawKey.replace(/^.*:/, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (typeof value === "string") {
      const v = value.trim();
      if (v && !out.has(key)) out.set(key, v);
    } else if (typeof value === "number") {
      if (!out.has(key)) out.set(key, String(value));
    } else {
      flattenStrings(value, out, depth + 1);
    }
  }
  return out;
}

function pick(flat: Map<string, string>, names: readonly string[]): string | null {
  for (const n of names) {
    const v = flat.get(n);
    if (v) return v;
  }
  return null;
}

/** exported เพื่อให้ข้อสอบยิงคำตอบตัวอย่างเข้ามาตรวจได้โดยไม่ต้องผ่าน fetch */
export function parseDbdPayload(json: unknown, taxId: string): DbdLookupResult | null {
  const flat = flattenStrings(json);
  const name = pick(flat, KEYS.nameTh);
  if (!name) return null;

  // ที่อยู่: ถ้ามีช่อง "ที่อยู่เต็ม" ใช้เลย · ไม่มีก็ประกอบจากชิ้นส่วน (บ้านเลขที่ · หมู่ · ซอย · ถนน)
  const line =
    pick(flat, KEYS.addressLine) ??
    [
      pick(flat, KEYS.houseNo),
      pick(flat, KEYS.roomNo) ? `ห้อง ${pick(flat, KEYS.roomNo)}` : null,
      pick(flat, KEYS.floorNo) ? `ชั้น ${pick(flat, KEYS.floorNo)}` : null,
      pick(flat, KEYS.building),
      pick(flat, KEYS.villageNo) ? `หมู่ ${pick(flat, KEYS.villageNo)}` : null,
      pick(flat, KEYS.soi) ? `ซ.${pick(flat, KEYS.soi)}` : null,
      pick(flat, KEYS.street) ? `ถ.${pick(flat, KEYS.street)}` : null,
    ]
      .filter(Boolean)
      .join(" ");

  return {
    ok: true,
    taxId,
    name,
    nameEn: pick(flat, KEYS.nameEn),
    address: {
      addressLine: line || null,
      subdistrict: pick(flat, KEYS.subdistrict),
      district: pick(flat, KEYS.district),
      province: pick(flat, KEYS.province),
      postcode: pick(flat, KEYS.postcode),
    },
    status: pick(flat, KEYS.status),
  };
}
