// page-label.ts — แปลง "หน้าที่ลูกค้ากำลังดู" จาก path ดิบ เป็นชื่อที่ทีมอ่านออก (มติ D1)
//
// 🔴 ทำไมต้องมีไฟล์นี้ (สำรวจข้อมูล prod 1 ก.ย. 2026)
//    `ChatConversation.meta.pageUrl` ที่ฝั่งลูกค้าส่งมาเป็น **path** เช่น `"/new"` ไม่ใช่ชื่อหน้า
//    บางห้องเป็น `null` บางห้องเป็นขยะ (`"qc"`) ⇒ เอามาแปะบนหัวห้องตรง ๆ ไม่ได้
//    และ **ห้ามพึ่ง `pageTitle`** เพราะฝั่งลูกค้าไม่ได้ส่งมา (จะกลายเป็นงานข้ามรีโปโดยไม่จำเป็น)
//
// 🔴 กติกา 3 ข้อของฟังก์ชันนี้ (มติ D1 — ห้ามเปลี่ยนโดยไม่ผ่าน Fable)
//    1. รู้จัก  → ชื่อไทยที่อ่านออก
//    2. ไม่รู้จัก → คืน **path เดิม** (ทีมยังเดาได้ว่าลูกค้าอยู่หน้าไหน ดีกว่าไม่บอกอะไรเลย)
//    3. ไม่มีค่า → `null` ⇒ ผู้เรียก **ซ่อนบรรทัดทิ้ง** ห้ามโชว์ป้ายเปล่า/undefined
//
// ⚠️ ไฟล์นี้เป็น pure ล้วน (ไม่แตะ DB/เน็ต/เวลา) — เรียกได้ทั้งฝั่ง server และ client
//    ⇒ หัวห้อง (client) กับคอลัมน์บริบท (สาย F) ใช้ทะเบียนเดียวกัน ไม่ต้องพิมพ์ชื่อหน้าซ้ำ 2 ที่

/** ภาษาที่เว็บลูกค้าใส่นำหน้า path (`/th/trips/...`) — ตัดทิ้งก่อนเทียบทะเบียน */
const LOCALE_SEGMENTS = new Set(["th", "en", "cn", "zh", "de", "fr", "ru", "ko", "ja"]);

/**
 * ทะเบียนเส้นทาง "ทั้งเส้นตรงตัว" — คีย์คือ path หลังตัดภาษา/สแลชท้าย
 * เพิ่มรายการใหม่ที่นี่ได้เรื่อย ๆ (ราคาถูก) · ที่ไม่อยู่ในนี้ไม่พัง แค่แสดง path ตามข้อ 2
 */
const EXACT: Record<string, string> = {
  "": "หน้าแรก",
  "/": "หน้าแรก",
  "/new": "หน้าแรก",
  "/trips": "รายการทริปดำน้ำ",
  "/liveaboard": "รายการเรือลิเวอร์อะบอร์ด",
  "/liveaboards": "รายการเรือลิเวอร์อะบอร์ด",
  "/daytrip": "รายการทริปวันเดย์",
  "/day-trip": "รายการทริปวันเดย์",
  "/resort": "รายการรีสอร์ตดำน้ำ",
  "/resorts": "รายการรีสอร์ตดำน้ำ",
  "/dive-center": "รายการศูนย์ดำน้ำ",
  "/dive-centers": "รายการศูนย์ดำน้ำ",
  "/course": "คอร์สเรียนดำน้ำ",
  "/courses": "คอร์สเรียนดำน้ำ",
  "/blog": "บทความ",
  "/search": "หน้าค้นหา",
  "/map": "แผนที่จุดดำน้ำ",
  "/maps": "แผนที่จุดดำน้ำ",
  "/plan": "แผนการเดินทางของฉัน",
  "/my-plan": "แผนการเดินทางของฉัน",
  "/booking": "หน้าจอง",
  "/bookings": "ประวัติการจอง",
  "/checkout": "หน้าชำระเงิน",
  "/cart": "ตะกร้า",
  "/contact": "หน้าติดต่อเรา",
  "/about": "หน้าเกี่ยวกับเรา",
  "/faq": "คำถามที่พบบ่อย",
  "/login": "หน้าเข้าสู่ระบบ",
  "/register": "หน้าสมัครสมาชิก",
  "/account": "หน้าบัญชีของฉัน",
  "/profile": "หน้าบัญชีของฉัน",
};

/**
 * ทะเบียนเส้นทางที่มี "ของชิ้นหนึ่ง" ต่อท้าย (`/trips/similan-3d2n`)
 * 🔴 เราไม่รู้จัก **ชื่อ** ของชิ้นนั้น (อยู่คนละระบบ) จึงแสดง slug ที่อ่านง่ายขึ้นแทน
 *    — เดาชื่อเองคือการแต่งข้อมูล ซึ่งแย่กว่าการแสดง slug ตรง ๆ
 */
const PREFIX: { at: string; label: string }[] = [
  { at: "/trips", label: "ทริปดำน้ำ" },
  { at: "/trip", label: "ทริปดำน้ำ" },
  { at: "/liveaboard", label: "เรือลิเวอร์อะบอร์ด" },
  { at: "/liveaboards", label: "เรือลิเวอร์อะบอร์ด" },
  { at: "/daytrip", label: "ทริปวันเดย์" },
  { at: "/day-trip", label: "ทริปวันเดย์" },
  { at: "/resort", label: "รีสอร์ตดำน้ำ" },
  { at: "/resorts", label: "รีสอร์ตดำน้ำ" },
  { at: "/dive-center", label: "ศูนย์ดำน้ำ" },
  { at: "/dive-centers", label: "ศูนย์ดำน้ำ" },
  { at: "/course", label: "คอร์สเรียนดำน้ำ" },
  { at: "/courses", label: "คอร์สเรียนดำน้ำ" },
  { at: "/blog", label: "บทความ" },
  { at: "/dive-site", label: "จุดดำน้ำ" },
  { at: "/dive-sites", label: "จุดดำน้ำ" },
];

/** slug → คำที่อ่านออก (`mv-giamani` → `mv giamani`) · ไม่แปลภาษา ไม่เดาชื่อ */
function humanizeSlug(slug: string): string {
  return decodeSafe(slug).replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
}

/** `%E0%B8%97` → `ท` · ถอดไม่ได้ (encode มาไม่ครบ) ให้คืนของเดิม ไม่ใช่โยน error */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * ชื่อหน้าที่ทีมอ่านออกจาก path ของเว็บลูกค้า
 *
 * @param path ค่าที่มาจาก `ChatConversation.meta.pageUrl` — รับได้ทั้ง path (`/trips/x`)
 *             และ URL เต็ม (`https://…/trips/x?utm=…`) เพราะฝั่งลูกค้าส่งมาทั้ง 2 แบบ
 * @returns ชื่อหน้า · path เดิมเมื่อไม่รู้จัก · `null` เมื่อไม่มีค่า
 */
export function pageLabelFromPath(path: string | null | undefined): string | null {
  if (typeof path !== "string") return null;
  const raw = path.trim();
  if (raw === "") return null;

  // URL เต็ม → เอาเฉพาะ path (query/hash เป็นของระบบติดตาม ไม่ใช่ข้อมูลที่ทีมต้องอ่าน)
  let p = raw;
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return raw; // URL พังก็ยังดีกว่าไม่บอกอะไร — คืนของเดิมตามข้อ 2
    }
  } else {
    const cut = p.search(/[?#]/);
    if (cut >= 0) p = p.slice(0, cut);
  }

  // 🔴 ไม่ใช่ path (ค่าขยะอย่าง `"qc"` ที่เจอบน prod) — คืนตามที่เก็บไว้ ไม่พยายามแปลง
  if (!p.startsWith("/")) return raw;

  // ตัดสแลชท้าย (`/trips/` = `/trips`) แต่คงกรณี `"/"` ไว้
  p = p.replace(/\/+$/, "");
  const segs = p.split("/").filter(Boolean);
  if (segs.length > 0 && LOCALE_SEGMENTS.has(segs[0]!.toLowerCase())) segs.shift();

  const norm = segs.length === 0 ? "/" : `/${segs.join("/")}`;
  const exact = EXACT[norm.toLowerCase()];
  if (exact) return exact;

  if (segs.length >= 2) {
    const head = `/${segs[0]!.toLowerCase()}`;
    const hit = PREFIX.find((r) => r.at === head);
    if (hit) {
      const rest = humanizeSlug(segs.slice(1).join(" "));
      return rest === "" ? hit.label : `${hit.label} · ${rest}`;
    }
  }

  // ไม่รู้จัก → path เดิม (ข้อ 2) · ใช้ค่าที่ normalize แล้วเพื่อไม่ให้ query string รกหัวห้อง
  return norm;
}
