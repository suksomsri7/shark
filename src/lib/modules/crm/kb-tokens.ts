// kb-tokens.ts — คลังความรู้ของร้าน (KB) ในงานของ CRM (ใบ C3.4 · addendum ข้อ 10 · มติผู้คุมงาน (3)(4))
//
//   renderKbTokens  — `{{kb:<articleId>}}` ในแม่แบบอีเมล/ร่างอีเมล → เนื้อบทความที่ **เปิดใช้อยู่** ของร้านนี้ (escape เป็น HTML แล้ว)
//                     id ที่ไม่รู้จัก / ปิดใช้ / ของร้านอื่น = "" (ไม่บอกว่ามีอยู่) · `KbArticle` ไม่มีคอลัมน์ slug ⇒ ใช้ id (ใบนี้ไม่มี migration)
//   kbGrounding     — บทความที่เกี่ยวกับ "คำของดีล" (ชื่อดีล + ชื่อสินค้าในดีล) ≤ 3 บทความ ตัดบทละ 1,200 ตัว ใส่ใน prompt ร่างอีเมล/สรุป
//
// 🔴 ไปถึงโมดูล KB ผ่าน facade `@/lib/modules/kb` เท่านั้น (เส้น `crm→kb` ใน ALLOWED_EDGES) · dynamic import = ไม่ลากกราฟ KB ตอนโหลด CRM
// 🔴 การค้นผูกร้านที่ `tenantDb` ของ KB อยู่แล้ว + กรองซ้ำที่นี่ (active + tenantId) — ชั้นที่สองกันวันที่ service KB เปลี่ยน
// 🔴 ไม่มี "use server" / ไม่ import prisma — ไฟล์นี้ถูกเรียกจาก emails.ts · ops/emails.ts · ai-bridges.ts

import { escapeHtmlText } from "./emails-shared";

/** จำนวนบทความสูงสุดที่ใส่ใน prompt หนึ่งครั้ง (addendum ข้อ 10) */
export const KB_GROUNDING_MAX = 3;
/** ความยาวสูงสุดต่อบทความใน prompt (ตัวอักษร) — ไทยกิน token ~4 เท่าของอังกฤษ */
export const KB_ARTICLE_CLIP = 1200;
/** เพดาน token ต่อข้อความหนึ่งก้อน (กันแม่แบบที่ใส่ token ซ้ำหลายร้อยตัว) */
const KB_TOKENS_MAX = 20;

const TOKEN_RE = /\{\{\s*kb:([A-Za-z0-9_-]{1,64})\s*\}\}/g;

type KbFacade = {
  searchKb: (ctx: { tenantId: string }, query: string, take?: number) => Promise<{ id: string; title: string; snippet: string; category: string | null }[]>;
  getArticle: (ctx: { tenantId: string }, id: string) => Promise<{ id: string; tenantId: string; title: string; body: string; active: boolean } | null>;
};

async function kb(): Promise<KbFacade> {
  return (await import("@/lib/modules/kb")) as unknown as KbFacade;
}

/**
 * แทน `{{kb:<articleId>}}` ด้วยเนื้อบทความ (escape HTML — `<img onerror>` ในบทความกลายเป็นข้อความเฉย ๆ) · ไม่พบ = ""
 * AUDIT-CLASS X1: บทความต้องเป็นของร้าน `tenantId` และเปิดใช้อยู่ · AUDIT-CLASS X6: เนื้อถูก escape ครั้งเดียวก่อนหยอด
 */
export async function renderKbTokens(ctx: { tenantId: string }, text: string | null | undefined): Promise<string> {
  const src = String(text ?? "");
  if (!src.includes("{{")) return src;
  const ids = [...new Set([...src.matchAll(TOKEN_RE)].map((m) => m[1]!))].slice(0, KB_TOKENS_MAX);
  if (ids.length === 0) return src;
  const tenantId = String(ctx?.tenantId ?? "");
  const bodies = new Map<string, string>();
  if (tenantId) {
    const K = await kb();
    for (const id of ids) {
      const a = await K.getArticle({ tenantId }, id).catch(() => null);
      if (a && a.tenantId === tenantId && a.active) bodies.set(id, escapeHtmlText(a.body).replace(/\n/g, "<br>"));
    }
  }
  return src.replace(TOKEN_RE, (_w, id: string) => bodies.get(id) ?? "");
}

export type KbGroundingItem = { id: string; title: string; text: string };

/**
 * บทความของร้านที่เกี่ยวกับคำเหล่านี้ (ชื่อดีล + ชื่อสินค้า) — ≤ 3 บทความ ตัดบทละ 1,200 ตัว · อ่านไม่ได้ = [] (ร่างต่อได้โดยไม่มี KB)
 * AUDIT-CLASS X1: เฉพาะบทความเปิดใช้ของร้านนี้ (ตรวจซ้ำหลังค้น) · ไม่มีข้อมูลลูกค้าอยู่ในคำค้น (ชื่อดีล/สินค้าเท่านั้น)
 */
export async function kbGrounding(ctx: { tenantId: string }, words: readonly string[]): Promise<KbGroundingItem[]> {
  const tenantId = String(ctx?.tenantId ?? "");
  const query = words
    .map((w) => String(w ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
  if (!tenantId || !query) return [];
  try {
    const K = await kb();
    const hits = await K.searchKb({ tenantId }, query, KB_GROUNDING_MAX * 2);
    const out: KbGroundingItem[] = [];
    for (const h of hits) {
      if (out.length >= KB_GROUNDING_MAX) break;
      const a = await K.getArticle({ tenantId }, h.id);
      if (!a || a.tenantId !== tenantId || !a.active) continue;
      out.push({ id: a.id, title: a.title.slice(0, 200), text: a.body.replace(/\s+/g, " ").trim().slice(0, KB_ARTICLE_CLIP) });
    }
    return out;
  } catch {
    return [];
  }
}
