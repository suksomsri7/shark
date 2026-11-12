// HR H2.10 ▸ "วันนี้" (mockup 07a): กะวันนี้ + ลงเวลา (GPS) · เพื่อนร่วมกะ · สัปดาห์นี้ · ทางลัดคำขอ · วันลาคงเหลือ — DTO จาก hr/self.ts เท่านั้น ◂
import { requireTenant } from "@/lib/core/context";
import { myBalances, mySelf, myToday, myWeek, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfToday } from "@/lib/modules/hr/self-ui";

export default async function MeHrTodayPage() {
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, today, week, bal] = await Promise.all([mySelf(a), myToday(a), myWeek(a, {}), myBalances(a, {})]);
  if (!self.ok || !today.ok) return <SelfEmpty />;
  return <SelfToday self={self} today={today} week={week.ok ? week : null} balances={bal.ok ? bal.items : []} canWrite={self.active} />;
}
