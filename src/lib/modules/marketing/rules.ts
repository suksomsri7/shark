// Marketing — สมอง (FREEZE) · segment = เงื่อนไข filter ลูกค้า (pure)
export type Segment = { tier?: string; minSpentSatang?: number; inactiveDays?: number };
export type Cust = { tier: string; totalSpentSatang: number; lastVisitAt: Date | null };
export function matchesSegment(c: Cust, seg: Segment, now: Date): boolean {
  if (seg.tier && c.tier !== seg.tier) return false;
  if (seg.minSpentSatang != null && c.totalSpentSatang < seg.minSpentSatang) return false;
  if (seg.inactiveDays != null) {
    if (!c.lastVisitAt) return true;
    const days = (now.getTime() - c.lastVisitAt.getTime()) / 86400000;
    if (days < seg.inactiveDays) return false;
  }
  return true;
}
