import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadMember, toMemberActor } from "@/lib/modules/member/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MemberTabs } from "@/components/member/MemberTabs";
import { MemberIcon } from "@/components/member/MemberIcon";

// หน้ารวมหมวด "โปรโมชัน" ของระบบสมาชิก v2 — `/app/sys/{id}/member/promotions`
//
// หมวดนี้มี 4 เรื่องตามพิมพ์เขียว §2.2: voucher (M2.5 · พร้อมใช้) · คูปอง (M3.2) ·
// บัตรกำนัล (M2.6 · พร้อมใช้) · journey (M3.3)
// 🔴 หน้านี้เป็น "ทางแยก" ล้วน — ตัวเลข/ตารางอยู่ในหน้าย่อยของแต่ละเรื่อง
// 🔴 404-not-403 (§6.4): ระบบไม่ใช่ MEMBER ของร้านนี้ หรือ actor อ่านโมดูลสมาชิกไม่ได้ → notFound()

type Tab = {
  key: string;
  title: string;
  desc: string;
  icon: string;
  href: string | null;
  /** null = ยังไม่มาถึงตามแผน RUN → การ์ดจาง กดไม่ได้ */
  wo?: string;
};

export default async function MemberPromotionsHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "MEMBER" } });
  if (!sys) notFound();

  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) notFound();

  const base = `/app/sys/${id}/member/promotions`;
  const tabs: Tab[] = [
    {
      key: "giftcards",
      title: "Gift Card",
      desc: "บัตรกำนัลมูลค่าเงิน — ขายหน้าร้าน ใช้ที่ POS/จอง/ออนไลน์ โอนและเติมเงินได้",
      icon: "gift",
      href: `${base}/giftcards`,
    },
    {
      key: "vouchers",
      title: "Voucher",
      desc: "ส่วนลดรายใบที่ออกให้ลูกค้าเป็นรายคน — ใช้ได้ครั้งเดียว ออกทีละหลายคนได้",
      icon: "tag",
      href: `${base}/vouchers`,
    },
    {
      key: "coupons",
      title: "คูปอง",
      desc: "รหัสส่วนลดชุดเดียวที่ใครก็ใช้ได้ตามเงื่อนไขที่ตั้งไว้",
      icon: "megaphone",
      href: null,
      wo: "M3.2",
    },
    {
      key: "journeys",
      title: "Journey",
      desc: "เส้นทางอัตโนมัติ เช่น ต้อนรับสมาชิกใหม่ · ชวนกลับมาเมื่อหายไปนาน",
      icon: "bolt",
      // M3.3 — หน้า journey อยู่ที่ /member/journeys (หมวดเดียวกับแคมเปญ · เงื่อนไขใช้ engine กลุ่มลูกค้า)
      href: `/app/sys/${id}/member/journeys`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="โปรโมชัน"
        back={{ href: `/app/sys/${id}`, label: sys.name }}
        desc="ของแจก ของแถม และส่วนลดทุกชนิดที่ให้ลูกค้า อยู่รวมกันที่นี่"
      />
      <MemberTabs systemId={id} actor={actor} />

      <div
        data-testid="promotions-page"
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
      >
        {tabs.map((t) =>
          t.href ? (
            <Link
              key={t.key}
              data-testid={`promotions-tab-${t.key}`}
              href={t.href}
              className="card flex flex-col gap-2 p-4 transition-colors"
              style={{ minWidth: 0 }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <MemberIcon name={t.icon} />
                {t.title}
              </span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t.desc}
              </span>
              <span className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                เปิดหน้านี้
              </span>
            </Link>
          ) : (
            <div
              key={t.key}
              data-testid={`promotions-tab-${t.key}`}
              aria-disabled="true"
              className="card flex flex-col gap-2 p-4"
              style={{ minWidth: 0, opacity: 0.6 }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                <MemberIcon name={t.icon} />
                {t.title}
              </span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t.desc}
              </span>
              <span
                style={{
                  alignSelf: "flex-start",
                  fontSize: 10,
                  lineHeight: "14px",
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                  color: "var(--color-muted)",
                }}
              >
                เร็ว ๆ นี้{t.wo ? ` (${t.wo})` : ""}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
