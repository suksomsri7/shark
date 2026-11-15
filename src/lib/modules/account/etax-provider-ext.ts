// etax-provider-ext.ts — ACC T5.4 (เลน 2) ▸ จุดต่อขยาย "e-Tax Invoice แบบลงลายมือชื่ออิเล็กทรอนิกส์ผ่านผู้ให้บริการ" — ปิดไว้จนกว่าจะมีคีย์
//
//   skill common-vat-invoice §10 [V]: แบบ บ.อ.01 · ลงลายมือชื่อด้วยใบรับรองอิเล็กทรอนิกส์ · ส่งข้อมูลภายในวันที่ 15 ของเดือนถัดไป · มอบผู้ให้บริการทำแทนได้
//   มาตรฐาน XML ยังไม่ได้เปิด [S] ⇒ ไม่มีพฤติกรรมปลอม: ทะเบียนผู้ให้บริการเดิม (platform/etax/provider.ts) ทุกตัวตอบ NOT_CONFIGURED
//   เปิดใช้ได้เมื่อ: เจ้าของเลือกผู้ให้บริการ + ส่งคีย์ + ยืนยันรูป XML/ลายเซ็นกับผู้ให้บริการ (งานถัดไป)
import { ETAX_PROVIDERS } from "@/lib/platform/etax/provider";

export type ProviderExtensionView = {
  available: false;
  reasonTh: string;
  providers: { code: string; label: string; ready: false; requiredFields: string[] }[];
};

export function getProviderExtension(): ProviderExtensionView {
  return {
    available: false,
    reasonTh: "ต้องมีคีย์ผู้ให้บริการ — e-Tax Invoice แบบลงลายมือชื่ออิเล็กทรอนิกส์ผ่านผู้ให้บริการยังไม่เปิด (ต้องยื่นแบบ บ.อ.01 ลงลายมือชื่ออิเล็กทรอนิกส์ และส่งข้อมูลภายในวันที่ 15 ของเดือนถัดไป)",
    providers: Object.values(ETAX_PROVIDERS).map((p) => ({ code: p.code, label: p.label, ready: false as const, requiredFields: p.requiredFields.map((f) => f.label) })),
  };
}
