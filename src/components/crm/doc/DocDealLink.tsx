// DocDealLink.tsx — บล็อก "ดีล" บนหน้าเอกสารบัญชี (ใบ C2.7 · เส้น account→crm เดิม) — แสดงผลล้วน (server · ไม่มี hook)
// ข้อมูลมาจาก `crm/doc-block.tsx` (ผ่านการมองเห็นของ CRM แล้ว · ระบบ uiVersion 1 ไม่มีทางมาถึงที่นี่)
// 🔴 ไม่มียอดเงิน/ชื่อลูกค้าในบล็อกนี้ — หน้าเอกสารมีของตัวเองตามสิทธิ์ของโมดูลบัญชีอยู่แล้ว
import Link from "next/link";

export function DocDealLink({ title, path }: { title: string; path: string }) {
  return (
    <section className="card flex min-w-0 flex-col gap-1 p-4">
      <h2 className="text-sm font-semibold">ดีล</h2>
      <Link href={path} data-testid="acc-doc-crm-deal" className="min-w-0 truncate text-sm text-[color:var(--color-accent)] underline">
        {title}
      </Link>
      <span className="text-xs text-[color:var(--color-muted)]">เอกสารใบนี้ผูกอยู่กับดีลใน CRM</span>
    </section>
  );
}
