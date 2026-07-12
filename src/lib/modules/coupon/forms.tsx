"use client";

import { useActionState, useState } from "react";
import {
  createCouponAction,
  testValidateAction,
  type CreateState,
  type ValidateState,
} from "./actions";
import { formatBaht } from "@/lib/ui/money";

const REASON_TH: Record<string, string> = {
  NOT_FOUND: "ไม่พบโค้ดนี้",
  INACTIVE: "คูปองถูกปิดใช้งาน",
  NOT_STARTED: "ยังไม่ถึงเวลาเริ่มใช้",
  EXPIRED: "คูปองหมดอายุแล้ว",
  WRONG_UNIT: "ใช้ไม่ได้กับหน่วยนี้",
  MIN_SPEND: "ยอดซื้อยังไม่ถึงขั้นต่ำ",
  LIMIT_REACHED: "คูปองถูกใช้ครบจำนวนแล้ว",
  MEMBER_REQUIRED: "ต้องระบุสมาชิกก่อนใช้",
  PER_MEMBER_LIMIT: "สมาชิกนี้ใช้ครบสิทธิ์แล้ว",
  RACE_LOST: "คูปองเพิ่งถูกใช้หมดพอดี",
  INPUT: "กรอกโค้ดและยอดเงินให้ครบ",
};

const inputCls = "input";

export function CreateCouponForm({
  systemId,
  units,
}: {
  systemId: string;
  units: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createCouponAction, {
    status: "idle",
  });
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="text-sm font-medium">สร้างคูปองใหม่</div>
      <input type="hidden" name="systemId" value={systemId} />

      <div className="grid grid-cols-2 gap-2">
        <input name="code" required placeholder="โค้ด เช่น SAVE20" className={`${inputCls} uppercase`} />
        <input name="name" placeholder="ชื่อคูปอง (ที่ลูกค้าเห็น)" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
          className={inputCls}
        >
          <option value="PERCENT">ลดเป็น %</option>
          <option value="FIXED">ลดเป็นบาท</option>
        </select>
        {type === "PERCENT" ? (
          <input name="percent" type="number" min={1} max={100} required placeholder="ลดกี่ % (1-100)" className={inputCls} />
        ) : (
          <input name="value" type="number" min={0} step="0.01" required placeholder="ลดกี่บาท" className={inputCls} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input name="minSpend" type="number" min={0} step="0.01" placeholder="ยอดขั้นต่ำ (บาท)" className={inputCls} />
        {type === "PERCENT" && (
          <input name="maxDiscount" type="number" min={0} step="0.01" placeholder="ลดสูงสุด (บาท)" className={inputCls} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input name="usageLimit" type="number" min={0} placeholder="ใช้รวมได้กี่ครั้ง" className={inputCls} />
        <input name="perMemberLimit" type="number" min={0} placeholder="จำกัดต่อคน (ครั้ง)" className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-muted)]">
          เริ่มใช้ได้
          <input name="startAt" type="datetime-local" className={inputCls} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-muted)]">
          หมดอายุ
          <input name="endAt" type="datetime-local" className={inputCls} />
        </label>
      </div>

      {units.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <div className="text-xs text-[color:var(--color-muted)]">ใช้ได้กับหน่วย (ไม่เลือก = ทุกหน่วย)</div>
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <label key={u.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
                <input type="checkbox" name="unitIds" value={u.id} />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-xs font-medium">✅ สร้างคูปองแล้ว</p>}

      <button className="btn btn-ghost text-sm" disabled={pending}>
        {pending ? "กำลังสร้าง…" : "+ สร้างคูปอง"}
      </button>
    </form>
  );
}

export function CouponTester({
  systemId,
  units,
}: {
  systemId: string;
  units: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ValidateState, FormData>(testValidateAction, {
    status: "idle",
  });

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="text-sm font-medium">ทดลองเช็คส่วนลด</div>
      <input type="hidden" name="systemId" value={systemId} />
      <div className="grid grid-cols-2 gap-2">
        <input name="code" required placeholder="โค้ด" className={`${inputCls} uppercase`} />
        <input name="amount" type="number" min={0} step="0.01" required placeholder="ยอดบิล (บาท)" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="memberId" placeholder="รหัสสมาชิก (ถ้ามี)" className={inputCls} />
        {units.length > 0 ? (
          <select name="unitId" className={inputCls}>
            <option value="">ทุกหน่วย</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : (
          <input name="unitId" placeholder="หน่วย (ถ้ามี)" className={inputCls} />
        )}
      </div>

      {state.status === "ok" && (
        <p className="text-sm font-medium">
          ✅ ใช้ได้ · {state.name} — ส่วนลด {formatBaht(state.discountSatang)}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">
          {REASON_TH[state.reason] ?? "ใช้ไม่ได้"}
        </p>
      )}

      <button className="btn btn-ghost text-sm" disabled={pending}>
        {pending ? "กำลังเช็ค…" : "เช็คส่วนลด"}
      </button>
    </form>
  );
}
