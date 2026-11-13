// probe-trips-w1.1-hunt-4.mts — W1.1a hunter: page truthfulness vs the accepted services (listAvailability / quoteTripLine) on a temp shop
// post-review round (X4 · H-F4): a day with several departures — the calendar cell must show the seats of the EARLIEST sellable departure (+ "N trips"),
//   every departure row must show its own seats and its own price (quoteTripLine of that departure), the price table must belong to the selected departure
//   (default = first sellable · `?t=<HHMM>` picks another). X7: a pax type without a price hides only its own row (EDGE NOADULT).
import { boot, cleanup, freshIp, insertRow, kind, line, mkDep, mkProd, mkTenant, mkUnit, req, rid, sweepStale, ymdAt, type Prod, type Rec, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-4");
const strip = (s: string) => s.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const after = (r: Resp, testid: string, n = 900) => { const i = r.body.indexOf(`data-testid="${testid}"`); return i < 0 ? null : strip(r.body.slice(r.body.lastIndexOf("<", i), i + n)); };
// label of a day cell: selectable days are links whose full text is in aria-label (X8); non-selectable cells carry it in title
const dayStates = (r: Resp) => new Map([...r.body.matchAll(/data-testid="book-day-(\d{4}-\d{2}-\d{2})" data-state="([A-Z_]+)"([^>]*)>/g)].map((m) => [m[1] as string, { state: m[2] as string, title: (/aria-label="([^"]*)"/.exec(m[3] ?? "")?.[1] ?? /title="([^"]*)"/.exec(m[3] ?? "")?.[1] ?? "").replace(/&amp;/g, "&") }]));
/** text of departure row i of the selected day (up to the next row / end of the list) */
const slotRow = (r: Resp, i: number): string | null => { const a = r.body.indexOf(`data-testid="book-slot-${i}"`); if (a < 0) return null; const b = r.body.indexOf(`data-testid="book-slot-${i + 1}"`, a); const e = b > 0 ? b : r.body.indexOf("</ul>", a); return strip(r.body.slice(r.body.lastIndexOf("<", a), e > 0 ? e : a + 4000)); };
const hhmm = (iso: unknown, off: number) => new Date(Date.parse(String(iso)) + off * 60_000).toISOString().slice(11, 16);
const baht = (satang: number) => (satang / 100).toLocaleString("en-US");

try {
  await sweepStale();
  const TR = (await import("@/lib/modules/trips")) as unknown as Rec;
  const listAvailability = TR.listAvailability as (c: unknown, i: unknown) => Promise<{ ok: boolean; value?: Rec[]; code?: string }>;
  const quoteTripLine = TR.quoteTripLine as (c: unknown, i: unknown) => Promise<{ ok: boolean; value?: Rec; code?: string }>;
  const A = await mkTenant("a", "ACTIVE", "Hunt Truth Shop");
  const zones: [string, string, number][] = [["bkk", "Asia/Bangkok", 420], ["ny", "America/New_York", -300], ["kir", "Pacific/Kiritimati", 840]];
  const now = new Date();
  const H = 3_600_000, D = 24 * H;
  const at = (ymd: string, hm: string, off: number) => new Date(Date.parse(`${ymd}T${hm}:00Z`) - off * 60_000);
  const plus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * D).toISOString().slice(0, 10);

  for (const [tag, tz, off] of zones) {
    console.log(`\n== zone ${tz} (local now ${new Date(now.getTime() + off * 60_000).toISOString().slice(0, 16).replace("T", " ")}) ==`);
    const u = await mkUnit(A.id, tag, { settings: { timezone: tz } });
    const p: Prod = await mkProd(`T${tag}`, A.id, u);
    const today = ymdAt(now, off);
    const label = new Map<string, string>();
    const dep = async (name: string, n: number, hm: string, o: Parameters<typeof mkDep>[3] = {}) => { const ymd = plus(today, n); label.set(ymd, `${label.get(ymd) ? `${label.get(ymd)} + ` : ""}${name}`); return mkDep(p, ymd, at(ymd, hm, off), o); };
    // keep everything inside the current local month when possible (page shows one month); spill handled by fetching both months
    await dep("yesterday", -1, "08:00", { sold: 1 });
    await dep("today-started-1h-ago", 0, new Date(now.getTime() + off * 60_000 - H).toISOString().slice(11, 16), { sold: 1 });
    await dep("today-in-20min", 0, new Date(now.getTime() + off * 60_000 + 20 * 60_000).toISOString().slice(11, 16), { sold: 1 }).catch(() => undefined);
    await dep("sold-out", 2, "08:00", { capacity: 10, sold: 10 });
    await dep("held-out(4 sold+6 held)", 3, "08:00", { capacity: 10, sold: 4, held: 6 });
    await dep("sold2+held3+reserved2 of 10", 4, "08:00", { capacity: 10, sold: 2, held: 3, reserved: 2 });
    await dep("cancelled", 5, "08:00", { status: "CANCELLED" });
    await dep("cutoff-passed", 6, "08:00", { cutoffAt: new Date(now.getTime() - H) });
    const dA = await dep("two: 07:00 left5 base price", 7, "07:00", { capacity: 10, sold: 5 });
    const dB = await dep("13:00 left40 own price 2,000", 7, "13:00", { capacity: 40, sold: 0 });
    await dep("two: 07:00 full", 8, "07:00", { capacity: 10, sold: 10 });
    const dC = await dep("13:00 open own price 2,000", 8, "13:00", { capacity: 40, sold: 1 });
    await dep("left 6", 9, "08:00", { capacity: 10, sold: 4 });
    await dep("left 5", 10, "08:00", { capacity: 10, sold: 5 });
    await dep("left 1", 11, "08:00", { capacity: 10, sold: 9 });
    await dep("oversold (sold 12 of 10)", 12, "08:00", { capacity: 10, sold: 12 }).catch((e) => console.log(`  (oversold row refused by DB: ${String(e).slice(0, 80)})`));
    void dA;
    for (const d of [dB, dC]) await insertRow("TripPrice", { id: rid("prd"), tenantId: A.id, unitId: u, productId: p.id, optionId: null, paxTypeId: p.pt.ADULT, cabinTypeId: null, seasonId: null, departureId: d, currency: "THB", amountMinor: 200_000, weekdayMask: null, priority: 10, updatedAt: new Date() });

    const months = [...new Set([...label.keys()].map((d) => d.slice(0, 7)))].sort();
    const ctx = { tenantId: A.id, unitId: u, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "book-view" }, now: new Date(), locale: "en" };
    for (const month of months) {
      if (month < today.slice(0, 7)) continue;
      const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      const av = await listAvailability(ctx, { productId: p.id, from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` });
      const page = await req(`/book/${A.slug}/t/${p.slug}?lang=en&m=${month}`, { ip: freshIp() });
      if (!av.ok || kind(page) !== "200/PRODUCT") { line(`TRUTH ${tag} ${month}`, "service ok + product page", `service ${av.ok ? "ok" : av.code} · page ${kind(page)}`, false); continue; }
      const cells = dayStates(page);
      const byDay = new Map<string, Rec[]>();
      for (const s of av.value ?? []) { const k = String(s.localDate); byDay.set(k, [...(byDay.get(k) ?? []), s]); }
      for (const ymd of [...label.keys()].filter((d) => d.startsWith(month)).sort()) {
        const slots = byDay.get(ymd) ?? [];
        slots.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
        const sellable = slots.filter((s) => s.saleBlock === null && Number(s.publicLeft) > 0);
        const maxLeft = Math.max(0, ...sellable.map((s) => Number(s.publicLeft)));
        const firstLeft = sellable.length ? Number(sellable[0]?.publicLeft) : 0; // X4: the cell shows the earliest sellable departure
        const cell = cells.get(ymd);
        const pageBookable = cell?.state === "OPEN" || cell?.state === "LOW";
        const shownN = Number(/(\d+)\s+(?:seats|left)/.exec(cell?.title ?? "")?.[1] ?? "-1");
        const svc = ymd < today ? "past" : sellable.length ? `sellable ×${sellable.length}, earliest left ${firstLeft} (best ${maxLeft}), showLeft ${JSON.stringify(sellable.map((s) => s.showLeft))}` : `not sellable ${JSON.stringify(slots.map((s) => `${String(s.status)}/${String(s.saleBlock)}/${String(s.publicLeft)}`))}`;
        const expState = sellable.length ? (sellable[0]?.showLeft ? "LOW" : "OPEN") : null;
        const tripsOk = sellable.length > 1 ? (cell?.title ?? "").includes(`${sellable.length} trips`) : !/\d+ trips/.test(cell?.title ?? "");
        const okFlag = ymd < today ? !pageBookable : pageBookable === sellable.length > 0 && (!pageBookable || (shownN === firstLeft && cell?.state === expState && tripsOk));
        line(`TRUTH ${tag} ${ymd} ${label.get(ymd)}`, `service: ${svc}`, `page: ${cell ? `${cell.state} "${cell.title}"` : "(no cell)"}`, okFlag);
        if (sellable.length && pageBookable) {
          const pr = await req(`/book/${A.slug}/t/${p.slug}?lang=en&m=${month}&d=${ymd}`, { ip: freshIp() });
          const quotes: number[] = [];
          for (const s of sellable) {
            const qv = await quoteTripLine(ctx, { productKind: "TRIP", unitId: u, productId: p.id, slotId: s.slotId, pax: [{ paxTypeId: p.pt.ADULT, qty: 1 }], extras: [] });
            const item = qv.ok ? ((qv.value?.items as Rec[]) ?? []).find((i) => i.kind === "SEAT") : null;
            quotes.push(item ? Number(item.unitMinor) : -1);
          }
          const adult = after(pr, "book-price-ADULT", 700) ?? "(no adult row)";
          const distinct = [...new Set(quotes)];
          // X4: the price table belongs to the selected departure = the first sellable one (not "any of the quotes")
          line(`PRICE ${tag} ${ymd}`, `price table = first sellable departure: ADULT ${baht(quotes[0] ?? -1)} THB (quoteTripLine)${distinct.length > 1 ? ` · other departures quote ${distinct.slice(1).map(baht).join(" / ")}` : ""}`, `"${adult.slice(0, 90)}"`, adult.includes(`${baht(quotes[0] ?? -1)}.00`));
          if (slots.length > 1) {
            // every departure row (all departures of the day, by start time): its own time, its own seats, its own "from" price
            const rowsTxt = slots.map((_, i) => slotRow(pr, i));
            const rowOk = slots.map((s, i) => {
              const txt = rowsTxt[i] ?? "";
              const sell = s.saleBlock === null && Number(s.publicLeft) > 0;
              const k = sellable.indexOf(s);
              return txt.includes(hhmm(s.startsAt, off)) && (sell ? new RegExp(`\\b${Number(s.publicLeft)} seats`).test(txt) && txt.includes(`${baht(quotes[k] ?? -1)}.00`) : !/THB/.test(txt));
            });
            line(`SLOT-ROWS ${tag} ${ymd}`, `each departure row shows its own time · seats · price — service: ${JSON.stringify(slots.map((s) => `${hhmm(s.startsAt, off)} left ${String(s.publicLeft)}${s.saleBlock === null && Number(s.publicLeft) > 0 ? ` ADULT ${baht(quotes[sellable.indexOf(s)] ?? -1)}` : " (not sellable)"}`))}`, `rows: ${JSON.stringify(rowsTxt.map((t) => (t ?? "(no row)").slice(0, 150)))}`, rowOk.every(Boolean));
            const meta = after(pr, "book-meta", 600) ?? "";
            line(`HEADER-SLOT ${tag} ${ymd}`, `header line shows the selected (first sellable) departure ${hhmm(sellable[0]?.startsAt, off)}`, `"${meta.slice(0, 70)}"`, meta.includes(hhmm(sellable[0]?.startsAt, off)));
            if (sellable.length > 1) {
              // pick the last sellable departure with its token: table, header and seats must all move to that departure
              const last = sellable[sellable.length - 1] as Rec; const token = hhmm(last.startsAt, off).replace(":", "");
              const pt = await req(`/book/${A.slug}/t/${p.slug}?lang=en&m=${month}&d=${ymd}&t=${token}`, { ip: freshIp() });
              const adultT = after(pt, "book-price-ADULT", 700) ?? "(no adult row)"; const metaT = after(pt, "book-meta", 600) ?? "";
              line(`SLOT-PICK ${tag} ${ymd} t=${token}`, `price table + header of the ${hhmm(last.startsAt, off)} departure: ADULT ${baht(quotes[quotes.length - 1] ?? -1)}`, `adult "${adultT.slice(0, 60)}" · header "${metaT.slice(0, 50)}"`, adultT.includes(`${baht(quotes[quotes.length - 1] ?? -1)}.00`) && metaT.includes(hhmm(last.startsAt, off)));
              const idsInLinks = [...pt.body.matchAll(/[?&](?:amp;)?t=([A-Za-z0-9_:.-]+)/g)].map((m) => m[1] ?? "").filter((t) => !/^\d{4}(-[2-9])?$/.test(t));
              line(`SLOT-TOKEN-SHAPE ${tag} ${ymd}`, "departure references in links are time tokens (HHMM), never ids", JSON.stringify(idsInLinks.slice(0, 3)), idsInLinks.length === 0);
            }
          }
        }
      }
    }
  }

  // ── price edge products (Bangkok unit) ──
  console.log("\n== price edges ==");
  const uE = await mkUnit(A.id, "edge");
  const today = ymdAt(now, 420);
  const mk = async (key: string, prices: Record<string, number | null>) => { const p = await mkProd(key, A.id, uE, { prices }); const ymd = plus(today, 3); await mkDep(p, ymd, at(ymd, "08:00", 420), { sold: 1 }); return { p, ymd }; };
  for (const [key, prices, expect] of [["ZERO", { ADULT: 0, CHILD: 0, INFANT: 0 }, "what quoteTripLine says"], ["NOPRICE", { ADULT: null, CHILD: null, INFANT: null }, "price unavailable"], ["NOADULT", { ADULT: null, CHILD: 56_700, INFANT: 0 }, "X7: only the adult row is hidden — child 567 still shown, no 'unavailable' note"]] as const) {
    const { p, ymd } = await mk(key, prices);
    const ctx = { tenantId: A.id, unitId: uE, channel: "WEB", actor: { kind: "PUBLIC", clientKey: "book-view" }, now: new Date(), locale: "en" };
    const av = await listAvailability(ctx, { productId: p.id, from: ymd, to: ymd });
    const slot = (av.value ?? [])[0];
    const qv = slot ? await quoteTripLine(ctx, { productKind: "TRIP", unitId: uE, productId: p.id, slotId: slot.slotId, pax: [{ paxTypeId: p.pt.ADULT, qty: 1 }], extras: [] }) : { ok: false, code: "no slot" };
    const r = await req(`/book/${A.slug}/t/${p.slug}?lang=en&d=${ymd}`, { ip: freshIp() });
    const cell = dayStates(r).get(ymd);
    const adult = after(r, "book-price-ADULT", 500);
    const unavailable = after(r, "book-price-unavailable", 300);
    const cta = after(r, "book-cta", 300);
    const svc = qv.ok ? `quote ok ADULT ${baht(Number(((qv.value?.items as Rec[]) ?? []).find((i) => i.kind === "SEAT")?.unitMinor ?? -1))} total ${String((qv.value?.totals as Rec)?.payableSatang)}` : `quote refused (${qv.code})`;
    const child = after(r, "book-price-CHILD", 500);
    // X7: a pax type without a price hides only its own row; the table disappears only when no pax type has a price
    const consistent = qv.ok ? !!adult && !unavailable : key === "NOADULT" ? !adult && !unavailable && !!child && child.includes("567.00") : !adult && !!unavailable;
    line(`EDGE ${key}`, `${expect} · service: ${svc}`, `day ${cell?.state} "${cell?.title}" · adult row: ${adult ? `"${adult.slice(0, 70)}"` : "(none)"} · child row: ${child ? `"${child.slice(0, 50)}"` : "(none)"} · unavailable note: ${unavailable ? `"${unavailable.slice(0, 80)}"` : "(none)"} · cta: "${(cta ?? "").slice(0, 60)}"`, consistent);
    if (!qv.ok) console.log(`  INFO  [EDGE ${key}] calendar still offers the day as ${cell?.state} with seats although quoteTripLine refuses (${qv.code}) — the page says price unavailable (accepted by oracle IS-5/6?)`);
  }
} finally {
  await cleanup();
  try { const dbm = (await import("@/lib/core/db")) as unknown as { prisma?: { $disconnect?: () => Promise<void> } }; await dbm.prisma?.$disconnect?.(); } catch { /* ignore */ }
}
