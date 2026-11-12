// HR H2.10 ▸ "ตาราง": กะที่ประกาศแล้วของตัวเองรายสัปดาห์ · ลาของตัวเอง · วันหยุด (ย้อน 4 / ล่วงหน้า 8 สัปดาห์ — facade ตัดช่วงเอง) ◂
import { requireTenant } from "@/lib/core/context";
import { mySelf, myWeek, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfWeek } from "@/lib/modules/hr/self-ui";

const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default async function MeHrWeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week: asked } = await searchParams;
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, week] = await Promise.all([mySelf(a), myWeek(a, { week: typeof asked === "string" ? asked : undefined })]);
  if (!self.ok || !week.ok) return <SelfEmpty />;
  return <SelfWeek week={week} prev={shift(week.weekStart, -7)} next={shift(week.weekStart, 7)} current="" />;
}
