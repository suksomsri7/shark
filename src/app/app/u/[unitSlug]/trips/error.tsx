"use client";
// TRIPS T1.1 ▸ ขอบเขตข้อผิดพลาดของหน้าใต้ /trips (Next 16.2: error boundary ต้องเป็น Client Component · unstable_retry = โหลดส่วนนี้ใหม่จากเซิร์ฟเวอร์)
//   ข้อผิดพลาดใน layout.tsx ของ segment นี้ไม่มาถึงไฟล์นี้ (error.md) ⇒ layout ครอบส่วนที่โหลดข้อมูลด้วย <TripsCatch> ซึ่งใช้หน้าตาเดียวกัน
//   หน้าตาอยู่ที่ TripsErrorView (data-testid "trips-error" · ข้อความไม่โทษผู้ใช้)
import TripsErrorView from "@/components/trips/TripsErrorView";

export default function TripsError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <TripsErrorView digest={error.digest} retry={unstable_retry} />;
}
