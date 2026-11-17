"use client";

// page-context.ts (เว็บ · pure + ฮุกเบา) — "หน้าที่ผู้ใช้เปิดอยู่" สำหรับปุ่ม Lekaa ของแอป (Lekaa FAB 15 พ.ย. · แบบ fab6)
//   AppShell (เฉพาะในแอป · UA SharkApp) ส่ง {ev:"page-context", system, systemId, path, title, entity?} ทุกครั้งที่เปลี่ยนหน้า → แอปเก็บไว้
//   ส่งไปกับคำสั่งแรกของแผ่น Lekaa · 🔴 เซิร์ฟเวอร์อ่าน entity ใหม่ด้วยสิทธิ์ของผู้สั่งเสมอ (label ที่นี่เป็นแค่คำใบ้ ไม่ถูกเชื่อ)
// entity จากพาธ (ไม่ต้องแตะหน้า): เอกสารบัญชี · ผู้ติดต่อ/ดีล CRM · สมาชิก · การ์ดบอร์ดงาน (?card=)
// entity ที่พาธบอกไม่ได้ (เช่น นัดที่เปิดในปฏิทินจอง) — หน้าเรียก `usePageEntity({type,id,label})` → CustomEvent "app:page-entity" → AppShell
// ไม่ import โมดูลธุรกิจ (ใช้ได้ทั้ง app-shell และคอมโพเนนต์ของโมดูล)
import { useEffect } from "react";

export type PageEntity = { type: string; id: string; label?: string };
export type PageContextMsg = { ev: "page-context"; system: string | null; systemId: string | null; path: string; title: string; entity?: PageEntity };

/** หน้าเอกสารบัญชีที่ใช้รหัสเอกสารตรง ๆ (`/account/<seg>/<docId>`) */
const ACCOUNT_DOC_SEGS = new Set(["po", "purchase", "purchase-tax-invoice", "asset-po", "asset-buy", "combined-payment", "credit-note-received", "debit-note-received", "deposit-payment", "expense", "print"]);
const ID_RE = /^[A-Za-z0-9_-]{6,80}$/;

/** entity จากพาธ + query (pure) — ไม่รู้จัก = null */
export function entityFromPath(pathname: string, search: string): PageEntity | null {
  const seg = pathname.split("/").filter(Boolean); // ["app","sys",sid,module,...]
  if (seg[0] !== "app" || seg[1] !== "sys" || !seg[2]) return null;
  const [mod, a, b, c] = seg.slice(3);
  const ok = (v: string | undefined): v is string => !!v && ID_RE.test(v) && v !== "new";
  if (mod === "account") {
    if (a === "docs" && b && ok(c)) return { type: "ACCOUNT_DOC", id: c };
    if (a && ACCOUNT_DOC_SEGS.has(a) && ok(b)) return { type: "ACCOUNT_DOC", id: b };
  }
  if (mod === "crm" && a === "contacts" && ok(b)) return { type: "CRM_CONTACT", id: b };
  if (mod === "crm" && a === "deals" && ok(b)) return { type: "CRM_DEAL", id: b };
  if (mod === "member" && a === "members" && ok(b)) return { type: "MEMBER", id: b };
  if (mod === "kanban" && a === "b") {
    const card = /(?:^|[?&])card=([^&]+)/.exec(search)?.[1];
    if (ok(card)) return { type: "KANBAN_CARD", id: card };
  }
  return null;
}

/** รหัสระบบจากพาธ `/app/sys/<id>` (pure) · หน้าสาขา `/app/u/<slug>` = system "unit:<slug>" */
export function systemFromPath(pathname: string): { system: string | null; systemId: string | null } {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "app" && seg[1] === "sys" && seg[2]) return { system: seg[3] ?? null, systemId: seg[2] };
  if (seg[0] === "app" && seg[1] === "u" && seg[2]) return { system: `unit:${seg[2]}${seg[3] ? `/${seg[3]}` : ""}`, systemId: null };
  return { system: null, systemId: null };
}

export const PAGE_ENTITY_EVENT = "app:page-entity";

/** หน้าที่รู้ entity เอง (เช่น นัดที่เปิดอยู่ในปฏิทินจอง) — null = ล้าง · หน้าเลิกแสดง = ล้างเอง */
export function usePageEntity(entity: PageEntity | null) {
  const key = entity ? `${entity.type}:${entity.id}:${entity.label ?? ""}` : "";
  useEffect(() => {
    const send = (detail: PageEntity | null) => {
      window.dispatchEvent(new CustomEvent(PAGE_ENTITY_EVENT, { detail }));
    };
    send(key ? entity : null);
    return () => send(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
