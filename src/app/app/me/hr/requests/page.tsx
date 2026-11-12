// HR H2.10 ▸ "คำขอ" (mockup 07b): ฟอร์มยื่นลา/OT/เปลี่ยนกะ/แก้เวลา/เบิกล่วงหน้า (?form=) + รายการคำขอของตัวเอง (ยกเลิก/ตอบรับกะ) ·
//   ยื่นแทนคนอื่นจากหน้านี้ไม่ได้ (Q13) · พ้นสภาพ = ดูอย่างเดียว ◂
import { requireTenant } from "@/lib/core/context";
import { thaiDateKey } from "@/lib/ui/date";
import { myCorrectablePunches, myLeaveForm, myRequests, mySelf, myShiftsAhead, selfActorOf } from "@/lib/modules/hr/self";
import { SelfEmpty, SelfRequests } from "@/lib/modules/hr/self-ui";

const FORMS = ["leave", "ot", "swap", "correction", "advance"] as const;
type Form = (typeof FORMS)[number];

export default async function MeHrRequestsPage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const { form: asked } = await searchParams;
  const auth = await requireTenant();
  const a = selfActorOf(auth);
  const [self, requests, leaveForm, shifts, punches] = await Promise.all([mySelf(a), myRequests(a), myLeaveForm(a), myShiftsAhead(a), myCorrectablePunches(a, {})]);
  if (!self.ok || !requests.ok) return <SelfEmpty />;
  const form = FORMS.find((f) => f === asked) ?? null;
  return (
    <SelfRequests
      form={form as Form | null}
      canWrite={self.active}
      data={{
        requests,
        policies: leaveForm.ok ? leaveForm.policies : [],
        balances: leaveForm.ok ? leaveForm.balances : [],
        shifts: shifts.ok ? shifts.items : [],
        punches: punches.ok ? punches.items : [],
        today: thaiDateKey(),
      }}
    />
  );
}
