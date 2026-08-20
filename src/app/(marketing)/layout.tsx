import { PublicFooter, PublicHeader } from "@/components/public-chrome";

// กรอบของหน้าสาธารณะทั้งกลุ่ม (privacy · terms · support · account-deletion · login · signup)
// 🔴 เจตนา: ผู้ตรวจ App Store/Meta ต้องเดินจากหน้าไหนก็ได้ไปหาหน้ากฎหมาย/ช่องทางติดต่อได้ใน 1 คลิก
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <PublicFooter />
    </div>
  );
}
