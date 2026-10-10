"use client";

// field-errors.tsx — แบบแผนเดียวของ "ตรวจช่องแล้วบอกใต้ช่อง" ในฟอร์ม CRM (C4.3-fix part 2 · มติ D-b1 STRICT)
//   กติกาเจ้าของ: validation แบบ inline เท่านั้น — ไม่ alert · ไม่ bubble ของเบราว์เซอร์ (`required`) · ไม่ปิดปุ่มเงียบ ๆ ·
//   ไม่ใช่กล่องเดียวท้ายฟอร์ม ⇒ ช่องที่ผิดทุกช่องมีข้อความไทยของตัวเองอยู่ใต้ช่อง + โฟกัสย้ายไปช่องแรกที่ผิด
//   วิธีใช้:
//     const fe = useFieldErrors(["name", "key"] as const);
//     ช่องกรอก: กระจาย fe.field("name") ลงในแท็กของช่อง · ใต้ช่อง: FieldError id=fe.errorId("name") message=fe.errors.name
//     if (fe.show({ name: !name.trim() ? "ตั้งชื่อก่อน" : undefined })) return;   // true = มีช่องผิด (โฟกัสย้ายแล้ว)
//     ผลจากเซิร์ฟเวอร์ `{ ok:false, error, fieldErrors }` → fe.show(r.fieldErrors ?? {}) · ที่เหลือ (ไม่มีช่อง) ใช้กล่องเดิมของฟอร์ม
//   🔴 aria-describedby ชี้ไปที่ข้อความ "เฉพาะตอนที่มี error" — ไม่เอาคำใบ้ถาวรมาผูก (โปรแกรมอ่านจอ/ข้อสอบจะเข้าใจว่าผิดตลอด)

import { useRef, useState, useId, type CSSProperties } from "react";

export type FieldErrors<K extends string = string> = Partial<Record<K, string | undefined>>;

/** ช่องแรก (ตามลำดับบนจอ) ที่มีข้อความ */
export function firstInvalid<K extends string>(order: readonly K[], errs: FieldErrors<K>): K | null {
  for (const k of order) if (errs[k]) return k;
  return null;
}

/** มีข้อความสักช่องไหม */
export const hasFieldErrors = (errs: FieldErrors | null | undefined): boolean => !!errs && Object.values(errs).some(Boolean);

/**
 * โฟกัสช่อง — ลองซ้ำสั้น ๆ เพราะตอนที่ผลจากเซิร์ฟเวอร์กลับมา ช่องอาจยังถูก `disabled={pending}` อยู่ หรือยังไม่ mount
 * (ชีต/กล่องที่เพิ่งเปิด) · เลื่อนให้ช่องอยู่กลางจอด้วย (มือถือ 390 px: ช่องอาจอยู่ใต้แป้นพิมพ์/นอกจอ)
 */
export function focusWhenReady(get: () => HTMLElement | null, tries = 20): void {
  const attempt = (left: number) => {
    const el = get();
    if (el && !(el as HTMLInputElement).disabled && el.isConnected) {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) {
        el.scrollIntoView?.({ block: "center", behavior: "auto" });
        return;
      }
    }
    if (left > 0) setTimeout(() => attempt(left - 1), 50);
  };
  // หลัง commit ของ setState รอบนี้ (ข้อความใต้ช่องดันเลย์เอาต์แล้ว)
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => attempt(tries));
  else attempt(tries);
}

export function useFieldErrors<K extends string>(order: readonly K[]) {
  const uid = useId();
  const refs = useRef<Partial<Record<K, HTMLElement | null>>>({});
  const [errors, setErrors] = useState<FieldErrors<K>>({});

  const errorId = (k: K) => `${uid}-${k}-err`;
  const focus = (k: K) => focusWhenReady(() => refs.current[k] ?? null);

  /** แทนชุดข้อความทั้งหมด แล้วโฟกัสช่องแรกที่ผิด · คืน true ถ้ามีช่องผิด */
  const show = (errs: FieldErrors<K> | null | undefined): boolean => {
    const clean: FieldErrors<K> = {};
    for (const k of order) if (errs?.[k]) clean[k] = errs[k];
    setErrors(clean);
    const k = firstInvalid(order, clean);
    if (k) focus(k);
    return k !== null;
  };
  /** ตั้งข้อความของช่องเดียวโดยไม่ย้ายโฟกัส (ตรวจตอน blur) */
  const set = (k: K, message: string) => setErrors((e) => (e[k] === message ? e : { ...e, [k]: message }));
  /** ลบข้อความของช่องเดียว (เรียกตอนผู้ใช้แก้ช่องนั้น) */
  const clear = (k: K) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const reset = () => setErrors({});
  /** props ของช่องกรอก: ref (ไว้โฟกัส) + aria-invalid + aria-describedby → ข้อความใต้ช่อง */
  const field = (k: K) => ({
    ref: (el: HTMLElement | null) => {
      refs.current[k] = el;
    },
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": errors[k] ? errorId(k) : undefined,
  });
  /** ลงทะเบียนตัวที่จะโฟกัสแทน (เช่นช่องค้นหาของตัวเลือกที่ไม่รับ ref) */
  const bind = (k: K, el: HTMLElement | null) => {
    refs.current[k] = el;
  };

  return { errors, show, set, clear, reset, field, bind, errorId, focus };
}

/** ชนิดของผลลัพธ์ hook — ส่งต่อให้คอมโพเนนต์ช่องกรอกย่อย (เช่น StepFields) ผูกข้อความ/โฟกัสกับช่องของมันเอง */
export type FieldErrorsApi<K extends string> = ReturnType<typeof useFieldErrors<K>>;

/** ข้อความ error ใต้ช่อง — ตัวเล็ก สีแดงของธีม · ไม่แสดงอะไรถ้าไม่มีข้อความ */
export function FieldError({ id, message, testid, className, style }: { id: string; message?: string | null; testid?: string; className?: string; style?: CSSProperties }) {
  if (!message) return null;
  return (
    <span id={id} className={`block text-xs text-[color:var(--color-danger)] ${className ?? ""}`} style={style} data-testid={testid}>
      {message}
    </span>
  );
}
