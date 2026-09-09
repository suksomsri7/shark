// activity-text.ts — แปลงกิจกรรม 1 รายการเป็น "ประโยคไทย" (K1.10)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma / ไม่แตะ session / ไม่ import ไฟล์อื่นในโมดูลนอกจาก `types.ts`
//    เหตุผล: `Timeline.tsx` เป็น client component ⇒ import `activity.ts` (ซึ่งแตะ prisma) ไม่ได้
//    `activity.ts` re-export ตัวนี้ออกไปให้ฝั่ง server ใช้ชื่อเดียวกันตามสัญญา §K1.10
// 🔴 วันเวลาคำนวณเองทั้งหมด ไม่พึ่ง `toLocaleDateString("th-TH")` — ICU ฝั่ง Node กับ Chromium
//    ให้สตริงต่างกัน ⇒ hydration error (บทเรียน K1.5 · `Card.tsx` ใช้วิธีเดียวกัน แต่ไฟล์นั้นเป็น
//    "use client" จึง import ข้ามมาที่นี่ไม่ได้ — ตัวเลข offset/ชื่อเดือนจึงซ้ำกัน 2 ที่โดยตั้งใจ)

import type { KanbanActivityDto } from "./types";
// K3.1 — ป้ายชนิดของการเชื่อม (ไฟล์บริสุทธิ์ ไม่แตะ prisma — ฝั่ง client เรียกไฟล์นี้ได้)
import { linkTypeTh } from "./link-labels";

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST)
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "10 ก.ย. 17:00" (เวลาไทย) — ใช้ในประโยคกิจกรรม ไม่ใช่หัวข้อ จึงไม่ใส่ปี */
export function thaiDayTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms + BKK_OFFSET_MS);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const day = `${d.getUTCDate()} ${TH_MONTH[d.getUTCMonth()]}`;
  return hh === 0 && mm === 0 ? day : `${day} ${pad2(hh)}:${pad2(mm)}`;
}

/**
 * "เมื่อครู่ · 5 นาทีที่แล้ว · 3 ชั่วโมงที่แล้ว · เมื่อวาน · 12 ก.ย. 09:30"
 * 🔴 `nowMs` ต้องมาจาก server (`BoardViewDto.now`) — ใช้ `Date.now()` ฝั่ง client ตรง ๆ ทำให้ HTML
 *    ของ server กับ client ต่างกัน = hydration error (แพตเทิร์นเดียวกับป้ายกำหนดส่งของ K1.5)
 */
export function relativeThaiTime(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const diff = nowMs - ms;
  if (diff < 45_000) return "เมื่อครู่";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const dayNow = Math.floor((nowMs + BKK_OFFSET_MS) / 86_400_000);
  const dayThen = Math.floor((ms + BKK_OFFSET_MS) / 86_400_000);
  if (dayNow - dayThen === 1) return "เมื่อวาน";
  if (dayNow - dayThen < 7) return `${dayNow - dayThen} วันที่แล้ว`;
  return thaiDayTime(iso);
}

/** ชื่อไทยของฟิลด์การ์ด/บอร์ด (ใช้กับ `data.fields` ของชนิด *_UPDATED) */
const FIELD_TH: Record<string, string> = {
  title: "ชื่อ",
  name: "ชื่อ",
  description: "รายละเอียด",
  dueAt: "กำหนดส่ง",
  startAt: "วันเริ่ม",
  reminderMinutesBefore: "เตือนล่วงหน้า",
  assigneeUserId: "ผู้รับผิดชอบ",
  labels: "ป้ายกำกับ",
  visibility: "การมองเห็น",
  isDoneColumn: "ธงคอลัมน์เสร็จ",
  wipLimit: "เพดานงานพร้อมกัน",
  status: "สถานะ",
  color: "สี",
  unitId: "สาขา",
};

const ROLE_TH: Record<string, string> = { VIEWER: "ผู้ดู", EDITOR: "ผู้แก้ไข", ADMIN: "ผู้ดูแล" };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function list(values: readonly string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.join(" · ");
}

function fieldsTh(data: Record<string, unknown>): string | null {
  const raw = data.fields;
  if (!Array.isArray(raw)) return null;
  const names = raw.filter((f): f is string => typeof f === "string").map((f) => FIELD_TH[f] ?? f);
  return names.length > 0 ? names.join(" · ") : null;
}

/**
 * ประโยคไทยของกิจกรรม 1 รายการ (ไม่รวมชื่อคนทำ/เวลา — จอวางเอง)
 * ของที่ถูกลบไปแล้ว (คอลัมน์/ป้าย/คน) จะไม่มีชื่อใน `names` ⇒ ประโยคเลี่ยงไปพูดแบบไม่ระบุชื่อ
 * แทนที่จะโชว์ id ดิบให้ผู้ใช้เห็น
 */
export function describeActivity(item: Pick<KanbanActivityDto, "type" | "data" | "names">): string {
  const { data, names } = item;
  switch (item.type) {
    case "BOARD_CREATED":
      return "สร้างบอร์ดนี้";
    case "BOARD_UPDATED": {
      if (data.status === "ACTIVE") return "กู้บอร์ดคืนจากคลัง";
      const f = fieldsTh(data);
      return f ? `แก้ไขบอร์ด — ${f}` : "แก้ไขบอร์ด";
    }
    case "BOARD_ARCHIVED":
      return "เก็บบอร์ดนี้เข้าคลัง";
    case "MEMBER_ADDED": {
      const who = list(names.users) ?? "สมาชิกใหม่";
      const role = ROLE_TH[String(data.role ?? "")] ?? null;
      const reason = data.reason === "mention" ? " (จากการกล่าวถึงในความเห็น)" : "";
      return `เพิ่ม ${who} เข้าบอร์ด${role ? ` เป็น${role}` : ""}${reason}`;
    }
    case "MEMBER_ROLE_CHANGED": {
      const who = list(names.users) ?? "สมาชิก";
      const to = ROLE_TH[String(data.to ?? "")] ?? null;
      return to ? `เปลี่ยนบทบาทของ ${who} เป็น${to}` : `เปลี่ยนบทบาทของ ${who}`;
    }
    case "MEMBER_REMOVED": {
      const who = list(names.users) ?? "สมาชิก";
      return data.self === true ? `${who} ออกจากบอร์ดนี้` : `ถอด ${who} ออกจากบอร์ด`;
    }
    case "COLUMN_CREATED":
      return `เพิ่มคอลัมน์ ${names.column ?? str(data.name) ?? "ใหม่"}`;
    case "COLUMN_UPDATED": {
      const col = names.column ?? str(data.name);
      // K1.14 — กู้คืนคอลัมน์จากคลังใช้ชนิดเดียวกับ "แก้ไขคอลัมน์" + ธง `restored` (ไม่เพิ่มค่าเอนัม)
      if (data.restored === true) return col ? `กู้คืนคอลัมน์ ${col} จากคลัง` : "กู้คืนคอลัมน์จากคลัง";
      const from = str(data.from);
      if (from && col && from !== col) return `เปลี่ยนชื่อคอลัมน์ ${from} เป็น ${col}`;
      const f = fieldsTh(data);
      return col ? `แก้ไขคอลัมน์ ${col}${f ? ` — ${f}` : ""}` : `แก้ไขคอลัมน์${f ? ` — ${f}` : ""}`;
    }
    case "COLUMN_MOVED":
      return `ย้ายตำแหน่งคอลัมน์ ${names.column ?? "หนึ่งคอลัมน์"}`;
    case "COLUMN_ARCHIVED":
      return `เก็บคอลัมน์ ${names.column ?? str(data.name) ?? ""} เข้าคลัง`.replace("  ", " ").trim();
    case "CARD_CREATED": {
      const col = names.column ?? names.toColumn;
      return col ? `สร้างการ์ดนี้ในคอลัมน์ ${col}` : "สร้างการ์ดนี้";
    }
    case "CARD_UPDATED": {
      const f = fieldsTh(data);
      return f ? `แก้ไข ${f}` : "แก้ไขการ์ด";
    }
    case "CARD_MOVED": {
      const from = names.fromColumn;
      const to = names.toColumn;
      if (from && to) return `ย้ายจาก ${from} ไป ${to}`;
      if (to) return `ย้ายไปคอลัมน์ ${to}`;
      return "ย้ายการ์ดข้ามคอลัมน์";
    }
    case "CARD_ASSIGNED":
      return `มอบหมายให้ ${list(names.users) ?? "ผู้รับผิดชอบใหม่"}`;
    case "CARD_UNASSIGNED":
      return `ปลด ${list(names.users) ?? "ผู้รับผิดชอบ"} ออกจากการ์ด`;
    case "CARD_DUE_SET": {
      const due = str(data.dueAt);
      return due ? `ตั้งกำหนดส่ง ${thaiDayTime(due)}` : "ล้างกำหนดส่ง";
    }
    case "CARD_LABELED":
      return `ติดป้าย ${list(names.labels) ?? "กำกับ"}`;
    case "CARD_UNLABELED":
      return `เอาป้าย ${list(names.labels) ?? "กำกับ"} ออก`;
    case "CARD_ARCHIVED":
      return "เก็บการ์ดนี้เข้าคลัง";
    case "CARD_RESTORED":
      return "กู้การ์ดนี้คืนจากคลัง";
    case "CARD_COMPLETED":
      return `ปิดงานนี้แล้ว${names.toColumn ? ` (คอลัมน์ ${names.toColumn})` : ""}`;
    case "CHECKLIST_ITEM_DONE":
      return `ติ๊กเช็คลิสต์ “${str(data.text) ?? "หนึ่งรายการ"}”`;
    case "COMMENT_ADDED":
      return "เขียนความเห็น";
    case "ATTACHMENT_ADDED":
      return `แนบไฟล์ ${str(data.name) ?? ""}`.trim();
    // K3.1 — ประวัติพูดถึง "ชนิด" ของสิ่งที่ผูก ไม่ใช่ชื่อของมัน (ชื่ออาจเป็นข้อมูลที่คนอ่านประวัติไม่มีสิทธิ์เห็น)
    case "LINK_ADDED":
      return `เชื่อมการ์ดกับ${linkTypeTh(data.linkType)}`;
    case "LINK_REMOVED":
      return `ถอดการเชื่อมกับ${linkTypeTh(data.linkType)}`;
    // K3.5 — ผู้ช่วย AI: ประโยคต้องบอกว่า "คนสั่ง AI ให้ทำ" ไม่ใช่ "คนทำเอง" (§8.3 ห้ามปลอมเป็นคน)
    case "AI_SUGGESTED": {
      if (data.kind === "checklist") {
        const n = typeof data.count === "number" ? data.count : null;
        return `เพิ่มเช็คลิสต์จากข้อเสนอของผู้ช่วย AI${n ? ` (${n} รายการ)` : ""}`;
      }
      if (data.kind === "summary") return "ให้ผู้ช่วย AI สรุปการ์ดนี้";
      return "ใช้ผู้ช่วย AI กับการ์ดนี้";
    }
    default:
      return "มีการเปลี่ยนแปลง";
  }
}

/** ไอคอน (ชื่อในสไปรต์ `KanbanIcon`) ของกิจกรรมแต่ละชนิด — จอใช้วางหน้าประโยค */
export function activityIconName(type: KanbanActivityDto["type"]): string {
  if (type.startsWith("MEMBER_")) return "users";
  if (type.startsWith("COLUMN_")) return "list";
  if (type === "CARD_MOVED") return "swap";
  if (type === "CARD_COMPLETED") return "check";
  if (type === "CARD_DUE_SET") return "cal";
  if (type === "CARD_LABELED" || type === "CARD_UNLABELED") return "tag";
  if (type === "CARD_ASSIGNED" || type === "CARD_UNASSIGNED") return "users";
  if (type === "CHECKLIST_ITEM_DONE") return "cklist";
  if (type === "COMMENT_ADDED") return "chat";
  if (type === "ATTACHMENT_ADDED") return "clip";
  if (type === "CARD_ARCHIVED" || type === "BOARD_ARCHIVED") return "box";
  if (type === "LINK_ADDED" || type === "LINK_REMOVED") return "link";
  // K3.5 — "spark" คือไอคอนของผู้ช่วย AI อยู่แล้ว (ตรงกับปุ่มในแถบขวาตามภาพ 03)
  return "spark";
}
