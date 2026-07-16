// HR — สมอง (FREEZE) · contract C-2: availability คือของ HR
export function isAvailable(
  leaves: { fromDate: Date; toDate: Date; status: string }[],
  date: Date,
): boolean {
  const d = date.toISOString().slice(0, 10);
  return !leaves.some(
    (l) => l.status === "APPROVED" && l.fromDate.toISOString().slice(0, 10) <= d && d <= l.toDate.toISOString().slice(0, 10),
  );
}
export function workedMinutes(events: { kind: string; at: Date }[]): number {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  let total = 0;
  let inAt: Date | null = null;
  for (const e of sorted) {
    if (e.kind === "IN") inAt = e.at;
    else if (e.kind === "OUT" && inAt) {
      total += (e.at.getTime() - inAt.getTime()) / 60000;
      inAt = null;
    }
  }
  return Math.round(total);
}
