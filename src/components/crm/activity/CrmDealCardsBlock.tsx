// การ์ดบอร์ดงานของดีล (ดีล 360 แท็บกิจกรรม · CRM v2 · ใบ C1.6) — คอมโพเนนต์แสดงผลล้วน (ฝั่งเซิร์ฟเวอร์ ไม่มี state)
// ข้อมูลมาจาก `deals.getDeal360().kanbanCards` ที่หน้าอ่านอยู่แล้ว (มติผู้คุมงาน C1.6 S6 — ไม่ query ซ้ำ)
// ไม่มีการ์ด = ไม่แสดงกล่อง

type Card = { cardId: string; cardNo: number | null; title: string; boardName: string; columnName: string; status: "ACTIVE" | "ARCHIVED" };

export function CrmDealCardsBlock({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="card flex flex-col gap-1 p-4" data-testid="deal-360-kanban-cards">
      <h2 className="font-semibold">การ์ดบอร์ดงาน</h2>
      <ul className="flex flex-col divide-y text-sm">
        {cards.map((k) => (
          <li key={k.cardId} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0 break-words">
              {k.cardNo ? `#${k.cardNo} ` : ""}
              {k.title}
            </span>
            <span className="shrink-0 text-xs text-[color:var(--color-muted)]">
              {k.boardName} · {k.status === "ARCHIVED" ? "เก็บเข้าคลังแล้ว" : k.columnName}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
