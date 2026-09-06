import { requireTenant } from "@/lib/core/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { getUserPreferences } from "@/lib/modules/kanban/preferences";
import { ShortcutsPreferenceSwitch } from "@/components/kanban/ShortcutsPreferenceSwitch";

// การตั้งค่าส่วนตัว (K1.14) — ค่าที่เป็นของ "คน" ไม่ใช่ของ "ร้าน"
// 🔴 ค่าพวกนี้ตามคนไปทุกร้านที่เขาเป็นสมาชิก (เก็บที่ `User.prefs`) — คนที่ต้องปิดปุ่มลัดเพราะใช้
//    โปรแกรมอ่านหน้าจอ ต้องปิดครั้งเดียวจบ ไม่ใช่ไล่ปิดทีละร้านทีละเครื่อง
export default async function PreferencesPage() {
  const auth = await requireTenant();
  const prefs = await getUserPreferences(auth.user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="การตั้งค่าส่วนตัว"
        desc="ค่าเหล่านี้เป็นของบัญชีคุณคนเดียว — คนอื่นในร้านไม่ได้รับผลกระทบ"
      />
      <Section title="บอร์ดงาน">
        <ShortcutsPreferenceSwitch initial={prefs.kanbanShortcuts} />
      </Section>
    </div>
  );
}
