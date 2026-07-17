import { redirect } from "next/navigation";

// ตั้งค่าเดิมถูกแตกเป็น "บริการ" + "พนักงาน" — คงลิงก์เก่าไว้โดย redirect ไปหน้าบริการ
export default async function BookingSetupRedirect({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  redirect(`/app/u/${unitSlug}/booking/services`);
}
