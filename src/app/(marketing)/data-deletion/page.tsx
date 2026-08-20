import { permanentRedirect } from "next/navigation";

// URL นี้ลงทะเบียนไว้กับ Meta แล้ว (Data Deletion Instructions URL) → ห้ามลบทิ้ง
// แต่เนื้อหาถูกรวมไปอยู่ที่ /account-deletion ที่เดียว (ครอบทั้ง "ลบร้าน" และ "ลบบัญชีผู้ใช้")
// กันเอกสาร 2 ฉบับเล่าคนละเรื่องแล้วผู้ตรวจจับได้ว่าไม่ตรงกัน
export default function DataDeletionPage() {
  permanentRedirect("/account-deletion");
}
