import { ModuleTabs } from "@/components/module-tabs";

// ต้นแบบแตกหน้า "ระบบจองคิว/นัดหมาย" — แท็บฟังก์ชันย่อยคร่อมทุกหน้าย่อยของ booking
export default async function BookingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const base = `/app/u/${unitSlug}/booking`;
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <ModuleTabs
        items={[
          { href: base, label: "นัดวันนี้" },
          { href: `${base}/services`, label: "บริการ" },
          { href: `${base}/staff`, label: "พนักงาน" },
          { href: `${base}/hours`, label: "เวลาทำการ" },
        ]}
      />
      {children}
    </div>
  );
}
