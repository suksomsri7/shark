// home.tsx — หน้าแรกของระบบ CRM เมื่อเปิด CRM ใหม่แล้ว (uiVersion 2) · ใบ C1.11 (RESOLUTIONS R-A "หน้าแรก v2 ขั้นต่ำ" · ภาพ 13(ก))
//
// ฝังใน `/app/sys/[id]` (หน้า "ระบบ" รวม) แทน CrmHub เมื่อ `settings.crm.uiVersion = 2` — uiVersion 1 ยังเป็น CrmHub เดิมทุกตัวอักษร
// ไฟล์นี้ = ตัวโหลดข้อมูล (ฝั่งโมดูล) · หน้าตาอยู่ที่ `src/components/crm/home/CrmHomeView.tsx` (แสดงผลล้วน · testid ครบ)
// เนื้อหา: เมนู CRM (แถบแท็บจากทะเบียน nav.ts) · ตัวเลือกเทมเพลตกิจการ (ครั้งแรก · เฉพาะคนที่ตั้งค่า CRM ได้) · "ดีลของฉัน" ·
//   "งานของฉันวันนี้" · **"ดีลที่ต้องดู"** (ใบ C2.10 · ภาพ 01)
// 🔴 หน้า GET ไม่เขียนอะไร (ไม่สร้าง pipeline ค่าเริ่มต้น — ต่างจาก CrmHub v1) · ทุกแถวผ่านการมองเห็น (brief.ts#homeFor)
//
// CRM C2.10 ▸ บล็อก "ดีลที่ต้องดู" ของภาพ 01 ถูกวาด **ที่นี่** แล้วส่งเข้า `CrmHomeView` เป็นช่อง (slot) ข้าง
//   "งานของฉันวันนี้" (ภาพ 01 วางสองการ์ดคู่กัน) — ที่นี่เพราะ `data-testid` ของบล็อกนี้ต้องเป็นสตริงตรง ๆ ที่อ่านได้
//   จากไฟล์เดียวกับที่โหลดข้อมูล (ทะเบียนปุ่ม `scripts/crm-ui-inventory.json` + ด่าน F14.1/F14.2 อ่านค่าจากโค้ด
//   ไม่ใช่จาก props ที่วิ่งข้ามไฟล์) · ไม่มีชื่อ/เบอร์/อีเมลของลูกค้าในบล็อกนี้ — ชื่อดีล · ชื่อบริษัท · มูลค่า · จำนวนวันที่นิ่ง
import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { toMemberActor } from "@/lib/modules/member";
import { CrmHomeView } from "@/components/crm/home/CrmHomeView";
import { prisma } from "./db";
import { crmCan } from "./access";
import { homeFor } from "./brief";
import { crmNavItems } from "./nav";
import { crmBusinessTemplateOf, crmStaleDaysDefaultOf } from "./settings";
import { CRM_STALE_DAYS_DEFAULT } from "./notifications-shared";
import { applyBusinessTemplateAction, skipBusinessTemplateAction } from "./templates-actions";

const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

// CRM C2.10 ▸ (รอบแก้ ข้อ 9 — PARITY ภาพ 01 บรรทัด 77–85) ป้าย "นิ่ง N วัน" มี **3 สถานะ** เหมือน `.due late|soon`
//   ของแบบ: แดง = นิ่ง ≥ 2× เกณฑ์ของขั้น (ปล่อยไว้นานเป็นสองเท่า = เลือดไหล) · เหลือง = เกินเกณฑ์แต่ยังไม่ถึง 2× ·
//   เทา = ยังไม่ถึงเกณฑ์ (เกิดได้เมื่อขั้นถูกแก้เกณฑ์ให้นานขึ้นหลังปัก `stalledAt`) · ใช้โทเคนสีเดียวกับป้ายกำหนดส่ง
//   ของบอร์ดงาน (`--color-tag-*` / `--color-due-*-bg`) — ห้ามพิมพ์ hex ในคอมโพเนนต์ ◂
const STALE_TONE = {
  red: { color: "var(--color-tag-red)", borderColor: "var(--color-tag-red)", background: "var(--color-due-late-bg)" },
  amber: { color: "var(--color-tag-amber)", borderColor: "var(--color-tag-amber)", background: "var(--color-due-soon-bg)" },
  gray: { color: "var(--color-muted)", borderColor: "var(--color-line)", background: "var(--color-surface)" },
} as const;

/** โทนของป้ายตามจำนวนวันที่นิ่งเทียบเกณฑ์ของขั้นนั้น */
function staleTone(stalledDays: number, threshold: number): keyof typeof STALE_TONE {
  if (stalledDays >= threshold * 2) return "red";
  if (stalledDays >= threshold) return "amber";
  return "gray";
}

/** ไอคอน ⚠ ของหัวการ์ด (ภาพ 01 `#i-warn`) — inline เพราะโมดูล CRM ยังไม่มีชุดไอคอนของตัวเอง */
function WarnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 2.5 20h19Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

const dueLabel = (iso: string | null, overdue: boolean) => {
  if (!iso) return "";
  const t = new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  return overdue ? `เลยกำหนด · ${t}` : t;
};

export async function CrmHomeV2({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, settings: true } });
  if (!sys) return null;
  const data = await homeFor({ tenantId, systemId, actorUserId: auth.user.id }, actor);
  const canPick = !crmBusinessTemplateOf(sys.settings) && crmCan(actor, "crm.settings.manage");
  // N-9: ข้อมูลเทมเพลต 16 ชุดโหลดเฉพาะตอนต้องแสดงตัวเลือก (ข้อมูลล้วน — ไม่ลากตัว apply/บริการวัตถุ)
  const templates = canPick ? (await import("./templates/business")).BUSINESS_TEMPLATE_LIST.map((t) => ({ key: t.key, label: t.label, description: t.description })) : [];
  // CRM C2.10 ▸ เกณฑ์ปริยายของร้าน (`settings.crm.staleDaysDefault` · ปริยาย 14) — ใช้เมื่อขั้นนั้นไม่ได้ตั้งเกณฑ์เอง ◂
  const staleDefault = crmStaleDaysDefaultOf(sys.settings, CRM_STALE_DAYS_DEFAULT);
  return (
    <CrmHomeView
      systemId={systemId}
      navItems={crmNavItems(systemId)}
      picker={canPick ? { templates, apply: applyBusinessTemplateAction, skip: skipBusinessTemplateAction } : null}
      deals={data.deals.map((d) => ({
        id: d.id,
        title: d.title,
        valueSatang: d.valueSatang,
        stageId: d.stageId,
        stageName: d.stageName,
        companyName: d.companyName,
        staleLabel: d.stalledDays !== null ? `นิ่ง ${d.stalledDays} วัน` : null,
      }))}
      stages={data.stages}
      tasks={data.tasks.map((t) => ({ id: t.id, title: t.title, dueLabel: dueLabel(t.dueAt, t.overdue), overdue: t.overdue }))}
      stale={
        <section className="card flex min-w-0 flex-col gap-3 p-4">
          {/* ภาพ 01: หัวการ์ด = ⚠ + "ดีลที่ต้องดู" + คำขยาย "นิ่งเกินกำหนด" · ท้ายหัว = ลิงก์ไปรายการดีลที่กรองเฉพาะดีลนิ่ง (ตัวกรอง stale=1 ของ C1.5) */}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <WarnIcon />
              <span className="truncate">ดีลที่ต้องดู</span>
              <span className="shrink-0 text-xs font-normal text-[color:var(--color-muted)]">นิ่งเกินกำหนด</span>
            </h2>
            <Link
              href={`/app/sys/${systemId}/crm/deals?stale=1`}
              className="shrink-0 text-sm text-[color:var(--color-accent)]"
              data-testid="crm-home-stale-all"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          {data.stale.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]" data-testid="crm-home-stale-list">
              ยังไม่มีดีลที่นิ่งเกินกำหนด — ดีมาก ทีมตามงานทันทุกใบ
            </p>
          ) : (
            <ul className="flex min-w-0 flex-col divide-y" data-testid="crm-home-stale-list">
              {data.stale.map((d) => (
                <li key={d.id} className="flex min-w-0 items-center gap-3 py-2">
                  <span
                    className="shrink-0 rounded-lg border px-2 py-0.5 text-xs tabular-nums"
                    style={STALE_TONE[staleTone(d.stalledDays, d.stageStaleDays ?? staleDefault)]}
                  >
                    นิ่ง {d.stalledDays} วัน
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/app/sys/${systemId}/crm/deals/${d.id}`}
                      className="block truncate text-sm"
                      data-testid={`crm-home-stale-row-${d.id}`}
                    >
                      {d.title}
                    </Link>
                    {/* ภาพ 01 บรรทัดรอง = "บริษัท · ฿มูลค่า" (ไม่มีชื่อขั้น — ขั้นอยู่บนบอร์ด ไม่ใช่บนการ์ดสรุป) */}
                    <span className="block truncate text-xs text-[color:var(--color-muted)]">
                      {[d.companyName, baht(d.valueSatang)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {/* ภาพ 01: ปุ่ม "ดู" ท้ายแถว (ปุ่มโปร่ง เล็ก) — ทางเข้าเดียวกับชื่อดีล ให้นิ้วมีเป้าที่ใหญ่พอบนมือถือ */}
                  <Link
                    href={`/app/sys/${systemId}/crm/deals/${d.id}`}
                    className="shrink-0 rounded-lg border px-2 py-1 text-xs"
                    data-testid={`crm-home-stale-row-view-${d.id}`}
                  >
                    ดู
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      }
    />
  );
}
