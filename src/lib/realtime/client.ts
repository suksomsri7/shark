"use client";

// client.ts — ฝั่งเบราว์เซอร์ของชั้น realtime (WO-CV9)
//
// ═══ 🔴 กติกาที่ไฟล์นี้ต้องรักษา ═══
//  1. **เป็นตัวเร่งเท่านั้น** — จอยัง poll ทุก 5 วิ เหมือนเดิมไม่ว่าตัวนี้จะทำงานหรือไม่
//     ⇒ ต่อไม่ติด / โควตาหมด / เจ้าของยังไม่ตั้งกุญแจ = **เงียบสนิท** ไม่มีข้อความผิดพลาดบนจอ
//     และไม่ลองใหม่ถี่ ๆ (การลองใหม่ที่ถี่เกินคือการยิงเซิร์ฟเวอร์ตัวเองฟรี ๆ)
//  2. **ไม่มีกุญแจอยู่ในไฟล์นี้เลย** — ขอ token อายุสั้นจาก `/api/realtime/token`
//     ซึ่งผ่านด่าน `requireChatRead()` และจำกัดสิทธิ์ไว้แค่ช่องของร้านตัวเอง (subscribe อย่างเดียว)
//  3. **ไม่รู้จัก tenantId** — ชื่อช่องมาจากเซิร์ฟเวอร์ ไม่ได้ประกอบเองบนจอ
//     (ประกอบเองแปลว่าต้องส่ง tenantId ลงมาให้เบราว์เซอร์ ซึ่งไม่มีเหตุผลต้องรู้)
//  4. โหลดไลบรารีของผู้ให้บริการแบบ **dynamic import** — โหมด polling จะไม่โหลดมันเลย
//     (ไม่มีกุญแจ = ผู้ใช้ไม่ต้องดาวน์โหลด JS ที่ไม่มีวันได้ใช้)

import type { Realtime as AblyRealtime } from "ably";
import { EV_CHAT_NEW, EV_CHAT_READ, EV_CHAT_TYPING, EV_KANBAN_BOARD } from "./events";

/** สัญญาณที่ส่งต่อให้หน้าจอ — มีแต่ "ตัวชี้" ไม่มีเนื้อความ (ดู events.ts) */
export type ChatSignal = {
  event: string;
  conversationId?: string;
  userId?: string;
  until?: number;
  at?: number;
};

type TokenAnswer = { mode?: string; channel?: string; token?: unknown };

/** เวลาที่ยอมให้ผู้ให้บริการเงียบก่อนลองใหม่ — ตั้งยาวโดยตั้งใจ (ข้อ 1 ด้านบน) */
const RETRY_MS = 15_000;
const SUSPENDED_RETRY_MS = 60_000;

async function askToken(url: string): Promise<TokenAnswer | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as TokenAnswer;
  } catch {
    return null;
  }
}

/**
 * แกนกลางของการ "ฟังช่องหนึ่งช่อง" — ใช้ร่วมกันทุกโมดูล (แชท K1.x · บอร์ดงาน K1.14)
 *
 * 🔴 เหตุผลที่แยกออกมาแทนที่จะก๊อปทั้งก้อน: ข้อ 1–4 ที่หัวไฟล์ (เงียบเมื่อต่อไม่ติด · ไม่มีกุญแจในไฟล์นี้ ·
 *    ชื่อช่องมาจากเซิร์ฟเวอร์ · dynamic import) เป็นกติกาที่ต้องถือ **ทุกโมดูล** เท่ากัน
 *    ก๊อปโค้ดไป 2 ชุด = วันหนึ่งชุดหนึ่งถูกแก้แล้วอีกชุดค้างกติกาเก่าโดยไม่มีใครรู้
 *
 * @param tokenUrl เส้นทางขอ token (ต้องมีด่านสิทธิ์ของโมดูลนั้นอยู่ปลายทาง)
 * @param events   ชื่อ event ที่จะฟังบนช่อง
 * @param map      แปลงข้อความดิบเป็นสัญญาณของโมดูล (คัดเฉพาะสนามที่โมดูลนั้นรู้จัก)
 */
function subscribeVia<T>(
  tokenUrl: string,
  events: string[],
  map: (name: string, data: Record<string, unknown>) => T,
  onSignal: (signal: T) => void,
): () => void {
  let stopped = false;
  let cleanup: (() => void) | null = null;

  void (async () => {
    if (!tokenUrl || typeof window === "undefined") return;

    const first = await askToken(tokenUrl);
    if (stopped || !first || first.mode !== "realtime" || !first.channel || !first.token) return;
    // เก็บชื่อช่องเป็นตัวแปรของตัวเอง — ชื่อช่องมาจากเซิร์ฟเวอร์เสมอ ไม่ประกอบเองบนจอ
    const channelName = first.channel;

    // โหลดไลบรารีไม่ได้ (เน็ตสะดุด/ถูกบล็อก) = อยู่กับรอบ poll ต่อไป ไม่ต้องบอกใคร
    const Ably = await import("ably").catch(() => null);
    if (stopped || !Ably) return;

    const realtime: AblyRealtime | null = (() => {
      try {
        return new Ably.Realtime({
          // 🔴 ใช้ authCallback ไม่ใช่ authUrl เพราะเส้นทางของเราตอบ 2 แบบ
          //    (`{mode:"polling"}` ตอนเจ้าของยังไม่ตั้งกุญแจ · token ตอนพร้อมใช้)
          //    ซึ่ง authUrl รับไม่ได้ — มันบังคับให้ body ของคำตอบเป็น token ล้วน ๆ เท่านั้น
          authCallback: (_params, cb) => {
            void askToken(tokenUrl).then((ans) => {
              if (ans?.mode === "realtime" && ans.token) cb(null, ans.token as never);
              else cb("realtime ยังไม่พร้อมใช้งาน", null);
            });
          },
          // ลองใหม่แบบช้า ๆ — ตัวนี้พังต้องไม่กลายเป็นภาระของเซิร์ฟเวอร์เราเอง
          disconnectedRetryTimeout: RETRY_MS,
          suspendedRetryTimeout: SUSPENDED_RETRY_MS,
          closeOnUnload: true,
        });
      } catch {
        return null;
      }
    })();
    if (!realtime) return;

    const shutdown = () => {
      try {
        realtime.close();
      } catch {
        /* ปิดไม่ได้ก็ปล่อย — หน้าจอกำลังจะถูกทิ้งอยู่แล้ว */
      }
    };
    if (stopped) {
      shutdown();
      return;
    }

    // ต่อไม่ติดถาวร (token หมดสิทธิ์/ผู้ให้บริการปฏิเสธ) = ปิดทิ้งเงียบ ๆ ไม่วนลองใหม่
    realtime.connection.on("failed", shutdown);

    const channel = realtime.channels.get(channelName);
    const handler = (msg: { name?: string | null; data?: unknown }) => {
      const d = (msg.data ?? {}) as Record<string, unknown>;
      onSignal(map(msg.name ?? "", d));
    };
    // attach ไม่สำเร็จ = เงียบ (จอยังได้ของจากรอบ poll ครบอยู่แล้ว)
    void channel.subscribe(events, handler).catch(() => null);

    cleanup = () => {
      try {
        channel.unsubscribe(handler);
      } catch {
        /* ถอดตัวฟังไม่ได้ก็ปล่อย */
      }
      shutdown();
    };
    if (stopped) cleanup();
  })();

  return () => {
    stopped = true;
    cleanup?.();
    cleanup = null;
  };
}

/**
 * ฟังสัญญาณของระบบแชทหนึ่ง ๆ · คืนฟังก์ชันสำหรับเลิกฟัง
 *
 * เรียกได้เสมอโดยไม่ต้องเช็คโหมดก่อน — โหมด polling จะจบเงียบ ๆ ตั้งแต่คำขอแรก
 */
export function subscribeChat(
  systemId: string,
  onSignal: (signal: ChatSignal) => void,
): () => void {
  if (!systemId) return () => {};
  return subscribeVia(
    `/api/realtime/token?systemId=${encodeURIComponent(systemId)}`,
    [EV_CHAT_NEW, EV_CHAT_TYPING, EV_CHAT_READ],
    (name, d): ChatSignal => ({
      event: name,
      conversationId: typeof d.conversationId === "string" ? d.conversationId : undefined,
      userId: typeof d.userId === "string" ? d.userId : undefined,
      until: typeof d.until === "number" ? d.until : undefined,
      at: typeof d.at === "number" ? d.at : undefined,
    }),
    onSignal,
  );
}

/** สัญญาณของบอร์ดงาน (K1.14) — "ตัวชี้" ล้วน ๆ ไม่มีชื่อ/เนื้อหาการ์ด (ดู modules/kanban/realtime.ts) */
export type BoardLiveSignal = {
  event: string;
  type?: string;
  boardId?: string;
  columnId?: string;
  cardId?: string;
  at?: number;
};

/**
 * ฟังสัญญาณของบอร์ดงาน 1 ใบ · คืนฟังก์ชันสำหรับเลิกฟัง
 * 🔴 เบราว์เซอร์ไม่รู้จัก tenantId — ส่งไปแค่ `boardId` แล้วเซิร์ฟเวอร์ (ที่ผ่านด่านสิทธิ์บอร์ดแล้ว)
 *    เป็นคนประกอบชื่อช่องกลับมาให้ (บอร์ดที่ผู้ใช้มองไม่เห็น = ไม่ได้ token)
 */
export function subscribeBoard(
  boardId: string,
  onSignal: (signal: BoardLiveSignal) => void,
): () => void {
  if (!boardId) return () => {};
  return subscribeVia(
    `/api/realtime/kanban-token?boardId=${encodeURIComponent(boardId)}`,
    [EV_KANBAN_BOARD],
    (name, d): BoardLiveSignal => ({
      event: name,
      type: typeof d.type === "string" ? d.type : undefined,
      boardId: typeof d.boardId === "string" ? d.boardId : undefined,
      columnId: typeof d.columnId === "string" ? d.columnId : undefined,
      cardId: typeof d.cardId === "string" ? d.cardId : undefined,
      at: typeof d.at === "number" ? d.at : undefined,
    }),
    onSignal,
  );
}
