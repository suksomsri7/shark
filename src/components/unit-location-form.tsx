"use client";

// ฟอร์มตั้งค่าที่อยู่/แผนที่ของสาขา (WO-CV14 ข) — โครงเดียวกับ `branding-form.tsx`
//
// 🔴 ตรวจค่าด้วย `parseUnitLocationInput` ตัวเดียวกับที่เซิร์ฟเวอร์ใช้ — ไม่เขียนกติกาที่สอง
//    (ที่นี่ทำหน้าที่ "บอกให้เร็ว" ขณะพิมพ์ · ด่านจริงยังอยู่ที่ server action เสมอ)
// 🔴 แจ้งผลแบบ inline ใต้ฟอร์ม ห้าม alert() — กล่องเด้งขวางงานและอ่านย้อนไม่ได้

import { useActionState, useState } from "react";
import {
  saveUnitLocationAction,
  type SaveUnitLocationState,
} from "@/app/app/settings/units/[unitId]/actions";
import {
  UNIT_ADDRESS_MAX,
  parseUnitLocationInput,
  shopMapLink,
} from "@/lib/units/location-fields";
import { FormField } from "@/components/ui/FormField";

const initial: SaveUnitLocationState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

export function UnitLocationForm({
  unitId,
  unitName,
  defaultAddress,
  defaultMapUrl,
  defaultLat,
  defaultLng,
}: {
  unitId: string;
  unitName: string;
  defaultAddress: string;
  defaultMapUrl: string;
  defaultLat: string;
  defaultLng: string;
}) {
  const [state, action, pending] = useActionState(saveUnitLocationAction, initial);
  const [address, setAddress] = useState(defaultAddress);
  const [mapUrl, setMapUrl] = useState(defaultMapUrl);
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);

  const parsed = parseUnitLocationInput({ address, mapUrl, lat, lng });
  const preview = parsed.ok ? shopMapLink(parsed.value) : "";

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="unitId" value={unitId} />

        <FormField label="ที่อยู่ร้าน" hint={`ไม่เกิน ${UNIT_ADDRESS_MAX} ตัวอักษร · เว้นว่างได้`}>
          <textarea
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            maxLength={UNIT_ADDRESS_MAX}
            placeholder="เช่น 123 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพฯ 10500"
            className={inputCls}
          />
        </FormField>

        <FormField
          label="ลิงก์แผนที่"
          hint="วางลิงก์ที่กด “แชร์” มาจาก Google Maps · ต้องขึ้นต้นด้วย https:// · เว้นว่างได้"
        >
          <input
            name="mapUrl"
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            inputMode="url"
            placeholder="https://maps.app.goo.gl/..."
            className={inputCls}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="ละติจูด" hint="-90 ถึง 90">
            <input
              name="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="13.7563"
              className={inputCls}
            />
          </FormField>
          <FormField label="ลองจิจูด" hint="-180 ถึง 180">
            <input
              name="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              placeholder="100.5018"
              className={inputCls}
            />
          </FormField>
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">
          พิกัดกรอกคู่กันเสมอ — จะเว้นว่างทั้งคู่แล้วใช้ที่อยู่หรือลิงก์แผนที่แทนก็ได้
        </p>

        {/* ตรวจสด ๆ ขณะพิมพ์ — inline ใต้ฟอร์ม ไม่ใช่กล่องเด้ง */}
        {!parsed.ok && <p className="text-sm text-[color:var(--color-danger)]">{parsed.error}</p>}
        {state.status === "error" && (
          <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
        )}
        {state.status === "ok" && <p className="text-sm font-medium">บันทึกที่อยู่สาขาเรียบร้อย ✓</p>}

        <button
          type="submit"
          disabled={pending || !parsed.ok}
          className="btn btn-primary disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>

      <div className="card flex flex-col gap-2">
        <h2 className="text-sm font-medium">ตัวอย่างที่ลูกค้าจะได้รับ</h2>
        {preview === "" ? (
          <p className="text-xs text-[color:var(--color-muted)]">
            ยังไม่ได้ตั้งที่อยู่หรือพิกัด — ตอนนี้ปุ่ม “แผนที่ร้าน” ในกล่องแชทจะบอกทีมว่ายังส่งให้ลูกค้าไม่ได้
          </p>
        ) : (
          <>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-[color:var(--color-surface-2)] p-3 text-xs">
              {[unitName, address.trim(), preview].filter((l) => l !== "").join("\n")}
            </pre>
            <p className="text-xs text-[color:var(--color-muted)]">
              ลำดับที่ระบบเลือกใช้: ลิงก์แผนที่ → พิกัด → ที่อยู่
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default UnitLocationForm;
