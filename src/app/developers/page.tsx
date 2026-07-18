import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "คู่มือนักพัฒนา — SHARK API",
  description: "REST API สำหรับดึงข้อมูลร้านของคุณจาก SHARK แบบอ่านอย่างเดียว",
};

const BASE = "https://shark.in.th";

type Endpoint = {
  method: string;
  path: string;
  desc: string;
  sample: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/me",
    desc: "ข้อมูลร้านของคีย์ที่ใช้เรียก (id, ชื่อ, slug)",
    sample: `{ "tenant": { "id": "clx...", "name": "ร้านของฉัน", "slug": "my-shop" } }`,
  },
  {
    method: "GET",
    path: "/api/v1/customers?take=50",
    desc: "รายชื่อสมาชิกในระบบสมาชิกของร้าน (สูงสุด take รายการ, ค่าเริ่มต้น 50, สูงสุด 200)",
    sample: `{ "data": [ { "id": "clx...", "name": "สมชาย", "phone": "0812223333", "tier": "MEMBER" } ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/inventory/items?take=50",
    desc: "รายการสินค้าคงคลัง (ถ้าร้านยังไม่เปิดระบบคลัง จะได้ data ว่าง)",
    sample: `{ "data": [ { "id": "clx...", "sku": "A001", "name": "สินค้า", "onHand": 12 } ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/shop/orders?take=50",
    desc: "คำสั่งซื้อร้านค้าออนไลน์ทุกกิจการของร้าน เรียงจากใหม่ไปเก่า",
    sample: `{ "data": [ { "id": "clx...", "code": "SO-0001", "status": "PAID", "totalSatang": 25000 } ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/sales?take=50",
    desc: "รายการขาย POS ที่ชำระแล้ว (PAID) ทุกระบบ POS ของร้าน เรียงจากใหม่ไปเก่า",
    sample: `{ "data": [ { "id": "clx...", "receiptNo": "R-0001", "grandTotalSatang": 12000, "status": "PAID", "createdAt": "2026-07-18T..." } ] }`,
  },
];

const codeBox = "block overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100";

export default function DevelopersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">คู่มือนักพัฒนา — SHARK API</h1>
        <p className="text-sm text-neutral-600">
          REST API สำหรับดึงข้อมูลร้านของคุณจาก SHARK แบบ <strong>อ่านอย่างเดียว</strong> (read-only)
          เหมาะสำหรับเชื่อมกับระบบบัญชี เว็บไซต์ หรือแอปภายในองค์กร ข้อมูลทุกอย่างเป็น JSON
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1. การยืนยันตัวตน (Authentication)</h2>
        <p className="text-sm text-neutral-700">
          ทุกคำขอต้องแนบ API key ในส่วนหัว <code>Authorization</code> แบบ Bearer token
          สร้างคีย์ได้ที่เมนู <strong>ตั้งค่า → API สำหรับนักพัฒนา</strong> ในแอป
          คีย์จะขึ้นต้นด้วย <code>shark_</code> และแสดงให้เห็นเพียงครั้งเดียวตอนสร้าง —
          หากทำหาย ให้เพิกถอนแล้วสร้างใหม่
        </p>
        <pre className={codeBox}>
          <code>{`Authorization: Bearer shark_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</code>
        </pre>
        <p className="text-sm text-neutral-700">
          ถ้าไม่แนบคีย์ หรือคีย์ผิด/ถูกเพิกถอน จะได้สถานะ <code>401</code> พร้อม JSON{" "}
          <code>{`{ "error": "..." }`}</code>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. ขีดจำกัดการเรียก (Rate limit)</h2>
        <p className="text-sm text-neutral-700">
          แต่ละคีย์เรียกได้สูงสุด <strong>60 ครั้งต่อนาที</strong> หากเกินจะได้สถานะ{" "}
          <code>429</code> พร้อมส่วนหัว <code>Retry-After</code> (จำนวนวินาทีที่ควรรอก่อนลองใหม่)
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">3. ตัวอย่างการเรียก (curl)</h2>
        <pre className={codeBox}>
          <code>{`curl -H "Authorization: Bearer shark_xxxxxxxxxxxx" \\
  ${BASE}/api/v1/me`}</code>
        </pre>
        <p className="text-sm text-neutral-700">ตัวอย่างดึงรายชื่อสมาชิก 20 รายการแรก:</p>
        <pre className={codeBox}>
          <code>{`curl -H "Authorization: Bearer shark_xxxxxxxxxxxx" \\
  "${BASE}/api/v1/customers?take=20"`}</code>
        </pre>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">4. รายการ Endpoint</h2>
        {ENDPOINTS.map((e) => (
          <div key={e.path} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {e.method}
              </span>
              <code className="text-sm font-medium">{e.path}</code>
            </div>
            <p className="text-sm text-neutral-700">{e.desc}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-600">ตัวอย่างผลลัพธ์</summary>
              <pre className={`${codeBox} mt-2`}>
                <code>{e.sample}</code>
              </pre>
            </details>
            <pre className={codeBox}>
              <code>{`curl -H "Authorization: Bearer shark_xxxxxxxxxxxx" \\
  "${BASE}${e.path}"`}</code>
            </pre>
          </div>
        ))}
      </section>

      <footer className="border-t pt-4 text-xs text-neutral-500">
        API เวอร์ชัน v1 · อ่านอย่างเดียว · ข้อมูลทั้งหมดจำกัดเฉพาะร้านที่เป็นเจ้าของคีย์
      </footer>
    </main>
  );
}
