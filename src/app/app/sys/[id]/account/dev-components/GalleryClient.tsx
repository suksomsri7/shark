"use client";

// ส่วนที่ต้องมี client state จริง (เปิด modal/slide-over ค้างไว้ให้ถ่ายภาพ, ปุ่มยิง toast, picker ที่ต้องมีฟังก์ชัน search)
// แยกจาก page.tsx (server) เพราะฟังก์ชัน (search/onClose) ส่งข้าม server→client ไม่ได้ — ต้องสร้าง "ในไฟล์ client" นี้เอง
import { useEffect, useState } from "react";
import { ContactPicker, type ContactSearchResult } from "@/components/account-v2/ContactPicker";
import { ProductPicker, type ProductSearchResult } from "@/components/account-v2/ProductPicker";
import { Modal } from "@/components/account-v2/Modal";
import { SlideOver } from "@/components/account-v2/SlideOver";
import { ToastProvider, useToast } from "@/components/account-v2/Toast";

const FIXTURE_CONTACTS: ContactSearchResult[] = [
  { id: "c1", name: "คุณณัฐพล รุ่งเรือง", sub: "C00016 · 081-234-5678", meta: { member: true, overdueSatang: 2490000 } },
  { id: "c2", name: "บจก. อันดามัน ทราเวล", sub: "C00020 · 076-311-220", meta: { overdueSatang: 8640000 } },
  { id: "c3", name: "โรงแรมสิมิลันวิว", sub: "C00031 · 076-455-100", meta: { member: true } },
];

const FIXTURE_PRODUCTS: ProductSearchResult[] = [
  { id: "p1", name: "ทริปสิมิลัน 3 วัน 2 คืน", sub: "รายได้ค่าทริปดำน้ำ", meta: { priceSatang: 990000, unit: "คน" } },
  { id: "p2", name: "ค่าเช่าอุปกรณ์ดำน้ำ", sub: "รายได้ค่าเช่าอุปกรณ์", meta: { priceSatang: 120000, unit: "วัน" } },
  { id: "p3", name: "เสื้อ SIAM DIVE", sub: "รายได้ขายสินค้า", meta: { priceSatang: 107103, unit: "ตัว" } },
];

async function demoSearchContacts(q: string) {
  return FIXTURE_CONTACTS.filter((c) => c.name.includes(q) || !q);
}
async function demoSearchProducts(q: string) {
  return FIXTURE_PRODUCTS.filter((p) => p.name.includes(q) || !q);
}

export function ContactPickerGallery() {
  return (
    <ContactPicker
      placeholder="พิมพ์ค้นหาชื่อ/เลขที่/เลขภาษี/เบอร์"
      search={demoSearchContacts}
      defaultOpen
      initialResults={FIXTURE_CONTACTS}
      onCreate={() => {}}
      testId="gal-contact-picker"
    />
  );
}

export function ProductPickerGallery() {
  return (
    <ProductPicker
      placeholder="พิมพ์ค้นหาสินค้า/บริการ"
      search={demoSearchProducts}
      defaultOpen
      initialResults={FIXTURE_PRODUCTS}
      onCreate={() => {}}
      testId="gal-product-picker"
    />
  );
}

export function ModalGallery() {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <button type="button" className="btn-sm" onClick={() => setOpen(true)}>
          เปิด modal อีกครั้ง
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="เพิ่มผู้ติดต่อ"
        testId="gal-modal"
        actions={
          <>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm">
              + เพิ่ม
            </button>
          </>
        }
      >
        <p className="text-sm text-[color:var(--color-muted)]">
          ตัวอย่างเนื้อหา modal ขนาด md — ใช้โครงเดียวกับ g5-contact-modal.png (หัว + ✕ + เนื้อหาเลื่อนได้ + ปุ่มท้าย)
        </p>
      </Modal>
    </>
  );
}

export function SlideOverGallery() {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <button type="button" className="btn-sm" onClick={() => setOpen(true)}>
          เปิดแผงอีกครั้ง
        </button>
      )}
      <SlideOver open={open} onClose={() => setOpen(false)} title="คุณณัฐพล รุ่งเรือง · C00016" testId="gal-slide-over">
        <p className="text-sm text-[color:var(--color-muted)]">
          ตัวอย่างแผงโปรไฟล์ 360° เลื่อนเข้าจากขวา (desktop) / bottom-sheet เต็มจอ (มือถือ)
        </p>
      </SlideOver>
    </>
  );
}

function ToastFirer() {
  const toast = useToast();
  useEffect(() => {
    toast.error("โปรดกรอกช่องที่ไฮไลต์");
  }, [toast]);
  return (
    <div className="flex gap-2">
      <button type="button" className="btn-sm" onClick={() => toast.success("บันทึกสำเร็จ")}>
        ยิง toast สำเร็จ
      </button>
      <button type="button" className="btn-sm" onClick={() => toast.error("โปรดกรอกช่องที่ไฮไลต์")}>
        ยิง toast error
      </button>
    </div>
  );
}

export function ToastGallery() {
  return (
    <ToastProvider testId="gal-toast">
      <ToastFirer />
    </ToastProvider>
  );
}
