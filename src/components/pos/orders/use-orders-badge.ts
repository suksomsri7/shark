"use client";

// use-orders-badge.ts — POS P2.8U ป้ายนับออเดอร์ใหม่บนแท็บ "ออเดอร์ออนไลน์" ของแถบโหมด (มติ 1)
//   = counts.byColumn.new ของ listOrdersAction · ดึงทุก 10 วิ เฉพาะตอนแถบโหมดยัง mount และหน้าต่างมองเห็น (กลับมาที่แท็บ = ดึงทันที)
//   จอออเดอร์ส่งตัวเลขจากการดึงของตัวเอง (ไม่ดึงซ้ำ) · อ่านไม่ได้/ไม่มีสิทธิ์ = null (ไม่แสดงป้าย)
//   fix 1 F4: ดึงเฉพาะเมื่อ matchMedia("(min-width: 768px)") ตรง — แถบโหมดซ่อนด้วย CSS ใต้ md (มือถือไม่มีป้ายให้เห็น)
// 🔴 ไฟล์ "use client": import ได้เฉพาะ *-actions / *-shared

import { useEffect, useState } from "react";
import { listOrdersAction } from "@/lib/modules/pos/order-actions";
import { ORDERS_POLL_MS } from "./orders-ui";

export function useOrdersBadge(systemId: string, unitId: string | undefined, enabled: boolean): number | null {
  const [n, setN] = useState<number | null>(null);
  const [md, setMd] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const on = () => setMd(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!enabled || !unitId || !md) return;
    let alive = true;
    const run = async () => {
      try {
        const r = await listOrdersAction({ systemId, unitId });
        if (alive) setN(r.ok ? r.counts.byColumn.new : null);
      } catch {
        /* ค่าเดิมค้างไว้ */
      }
    };
    void run();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, ORDERS_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [systemId, unitId, enabled, md]);
  return n;
}
