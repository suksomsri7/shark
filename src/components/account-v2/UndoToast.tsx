"use client";

// UndoToast.tsx — toast "เลิกทำ" 5 นาที (WO 9.4 §0.3 ข้อ 8) — provider ครอบทั้ง shell บัญชี (mount ที่ layout.tsx)
//
// รับ token 2 ทาง:
//   (1) `useUndoToast().show(...)` — เรียกตรงจาก client component ทันทีหลัง action คืนค่า (ไม่มีการนำทางหน้า
//       เช่น ปุ่ม "ทำรายการ" ในตาราง/แผงต่าง ๆ ที่ใช้ startTransition ไม่ redirect)
//   (2) query `?undo=<token>` — action แบบฟอร์มเดิมที่จบด้วย `redirect()` (เช่น "เก็บถาวรผู้ติดต่อ") ต่อท้าย
//       `?undo=` ไว้ที่ปลายทาง redirect แทน · อ่านครั้งเดียวตอนหน้าโหลดเสร็จแล้วล้างออกจาก URL ทันที
//
// กดปุ่ม "เลิกทำ" → เรียก `undoAction(systemId, tokenId)` ตรง ๆ (server action) แล้ว `router.refresh()`
// ให้หน้าปัจจุบันเห็นสภาพที่คืนแล้วทันที — ไม่ปิด toast อัตโนมัติจนกว่าจะกดหรือครบ 8 วินาที (นานพอให้เห็น+กด
// แต่ไม่ผูกกับหน้าต่างเลิกทำจริง 5 นาทีฝั่ง server — ปิด toast แล้ว "เลิกทำ" ผ่านฝั่ง server ยังทำไม่ได้ต่อ
// เพราะไม่มี UI ให้กดอีก แต่ token ฝั่ง DB ยังไม่หมดอายุจนครบ 5 นาทีจริง — ทางเลือกออกแบบที่ตั้งใจ: เรียบง่ายกว่า
// การทำ "กล่องประวัติการเลิกทำ" เต็มรูป)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { undoAction } from "@/lib/modules/account/undo-stack";

type UndoItem = { tokenId: string; systemId: string; message: string };
type UndoApi = { show: (item: UndoItem) => void };

const UndoCtx = createContext<UndoApi | null>(null);

/** เรียกจากปุ่ม/แผงที่เพิ่งทำรายการที่ "เลิกทำได้" (ผลลัพธ์มี `undoToken`) — โชว์ toast ทันที ไม่ต้องรอ redirect */
export function useUndoToast(): UndoApi {
  const ctx = useContext(UndoCtx);
  if (!ctx) throw new Error("useUndoToast ต้องอยู่ภายใน <UndoToast>");
  return ctx;
}

function systemIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/app\/sys\/([^/]+)\/account/);
  return m ? m[1]! : null;
}

export function UndoToast({
  base,
  systemId,
  children,
}: {
  base: string;
  systemId: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [item, setItem] = useState<UndoItem | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: UndoItem) => {
    setItem(next);
    setStatus("idle");
    setNote("");
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setItem(null), 8000);
  }, []);

  // รับ token จาก redirect ของ action แบบฟอร์มเดิม (`?undo=<token>`) — เฝ้า searchParams (ไม่ใช่แค่ mount)
  // เพราะ action ที่มาจาก server component (contacts-ui.tsx/products/page.tsx) เรียก client closure ตรง ๆ
  // ไม่ได้ (RSC serialize ผ่านได้เฉพาะ "use server" action) ⇒ ต้อง redirect กลับหน้าเดิมพร้อม query แทน — การ
  // redirect ซ้ำเส้นทางเดิมไม่ทำให้ UndoToast (mount ที่ layout) remount ใหม่ ต้องเฝ้า query เปลี่ยนแทน mount
  useEffect(() => {
    const token = searchParams.get("undo");
    if (token) {
      show({ tokenId: token, systemId: systemIdFromPath(pathname) ?? systemId, message: "ทำรายการแล้ว" });
      const url = new URL(window.location.href);
      url.searchParams.delete("undo");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- show เป็น useCallback คงที่ · systemId ไม่เปลี่ยนระหว่างหน้า
  }, [searchParams, pathname]);

  const api = useMemo<UndoApi>(() => ({ show }), [show]);

  const runUndo = () => {
    if (!item) return;
    setStatus("pending");
    undoAction(item.systemId, item.tokenId).then((res) => {
      if (res.ok) {
        setStatus("done");
        setNote("เลิกทำแล้ว");
        router.refresh();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setItem(null), 2500);
      } else {
        setStatus("error");
        setNote(res.reason);
      }
    });
  };

  void base; // เผื่ออนาคตอยากประกอบลิงก์กลับ — วันนี้ยังไม่ต้องใช้

  return (
    <UndoCtx.Provider value={api}>
      {children}
      {item && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4"
          data-testid="undo-toast"
        >
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-full px-4 py-3 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
            style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
          >
            <span>{status === "error" || status === "done" ? note : item.message}</span>
            {status !== "done" && status !== "error" && (
              <button
                type="button"
                onClick={runUndo}
                disabled={status === "pending"}
                className="shrink-0 font-semibold underline underline-offset-2"
                data-testid="undo-toast-btn"
              >
                {status === "pending" ? "กำลังเลิกทำ…" : "เลิกทำ"}
              </button>
            )}
          </div>
        </div>
      )}
    </UndoCtx.Provider>
  );
}

export default UndoToast;
