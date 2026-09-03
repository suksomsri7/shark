"use client";

// breadcrumb-tail.tsx — ให้ "หน้ารายละเอียด" เติมชื่อของสิ่งที่กำลังเปิดต่อท้าย breadcrumb ได้
// (WO 3.4 · g6: "บัญชี › ผู้ติดต่อ › ปิยธิดา อินสุ่ม")
//
// ทำไมต้องมี: `AccountBreadcrumb` อยู่ใน layout และสร้าง crumb จาก `nav.ts` + pathname เท่านั้น
// ⇒ หน้ารายละเอียดทุกหน้าจะจบที่ชื่อเมนู ("ผู้ติดต่อ") ไม่ใช่ชื่อของแถวที่เปิดอยู่
// วิธีแก้ที่เบาที่สุดโดยไม่แตะโครง layout: context เล็ก ๆ ที่หน้ารายละเอียด (client) เซ็ตค่าเข้ามา
// ไม่เซ็ต = breadcrumb ทำงานเหมือนเดิมทุกประการ (หน้าอื่นไม่กระทบ)

import { createContext, useContext, useEffect, useState } from "react";

type Setter = (label: string | null) => void;

const TailValue = createContext<string | null>(null);
const TailSetter = createContext<Setter>(() => {});

export function BreadcrumbTailProvider({ children }: { children: React.ReactNode }) {
  const [tail, setTail] = useState<string | null>(null);
  return (
    <TailSetter.Provider value={setTail}>
      <TailValue.Provider value={tail}>{children}</TailValue.Provider>
    </TailSetter.Provider>
  );
}

/** อ่านค่า crumb ท้ายสุด (ใช้โดย AccountBreadcrumb) */
export function useBreadcrumbTail(): string | null {
  return useContext(TailValue);
}

/** เซ็ต crumb ท้ายสุดจากหน้ารายละเอียด — ล้างเองเมื่อออกจากหน้า */
export function useSetBreadcrumbTail(label: string | null | undefined) {
  const setTail = useContext(TailSetter);
  useEffect(() => {
    setTail(label ?? null);
    return () => setTail(null);
  }, [label, setTail]);
}
