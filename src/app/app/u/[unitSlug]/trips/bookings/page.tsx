import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { BOOKING_LIST_CHIPS, BOOKING_LIST_WHENS, DEPARTURE_SELL_CHANNELS, loadBookingDetailVM, loadBookingDocsVM, loadBookingListVM, loadCashDayVM, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import BookingsScreen from "@/components/trips/BookingsScreen";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const pick = <T extends string>(set: readonly T[], v: string | undefined): T | undefined => set.find((x) => x === v);

// TRIPS T1.3 ▸ การจองฝั่งร้าน (ภาพ 18 · ใบสั่ง T1.3 ส่วน a §2) — หน้าบาง: ด่าน → ตัวโหลด → คอมโพเนนต์
//   query: ?q= &p=<สินค้า> &when=upcoming|today|tomorrow|next7|past30|all &date=YYYY-MM-DD &ch=all|direct|agent|<ช่องทาง> &chip=all|day|hold|attention &dep=<รอบ> &b=<การจอง> &view=list|docs &day=YYYY-MM-DD
//   ค่าที่อ่านไม่ได้ ⇒ ทิ้งใช้ค่าปริยาย (ไม่ 404) · b ของหน่วย/ร้านอื่น/ไม่มี ⇒ notFound() · ตัวโหลดใช้นาฬิกาจริง (หน้าไม่ส่งเวลา)
//   การ์ดเงินสด + คิวเอกสารเงินรอออก โหลดเฉพาะผู้มีสิทธิ์รับเงิน (flags.canSeeMoney จากตัวโหลด)
export default async function TripsBookingsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "bookings" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const channels: readonly string[] = DEPARTURE_SELL_CHANNELS;
  const q = one(sp.q)?.slice(0, 100);
  const product = one(sp.p)?.slice(0, 128);
  const when = pick(BOOKING_LIST_WHENS, one(sp.when));
  const dateRaw = one(sp.date);
  const date = dateRaw && YMD_RE.test(dateRaw) ? dateRaw : undefined;
  const chRaw = one(sp.ch);
  const channel = chRaw && (["all", "direct", "agent"].includes(chRaw) || channels.includes(chRaw)) ? chRaw : undefined;
  const chip = pick(BOOKING_LIST_CHIPS, one(sp.chip));
  const dep = one(sp.dep)?.slice(0, 128);

  let list = await loadBookingListVM(ctx, { unitId: unit.id, ...(q ? { q } : {}), ...(product ? { product } : {}), ...(when ? { when } : {}), ...(date ? { date } : {}), ...(channel ? { channel } : {}), ...(chip ? { chip } : {}), ...(dep ? { dep } : {}) });
  if (!list.ok && list.code === "INVALID_INPUT") list = await loadBookingListVM(ctx, { unitId: unit.id });
  if (!list.ok) {
    if (list.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }

  const b = one(sp.b);
  let detail = null;
  let detailFailed = false;
  if (b) {
    const r = await loadBookingDetailVM(ctx, { unitId: unit.id, bookingId: b.slice(0, 128) });
    if (r.ok) detail = r.vm;
    else if (r.code === "FORBIDDEN") return <TripsForbidden />;
    else if (r.code === "NOT_FOUND" || r.code === "INVALID_INPUT" || r.code === "UNIT_NOT_TRIPS") notFound();
    else detailFailed = true;
  }

  const view = one(sp.view) === "docs" && list.vm.flags.canSeeMoney ? "docs" : "list";
  let docs = null;
  let cash = null;
  let day: string | null = null;
  if (list.vm.flags.canSeeMoney) {
    if (view === "docs") {
      const d = await loadBookingDocsVM(ctx, { unitId: unit.id });
      if (d.ok) docs = d.vm;
    }
    const dayRaw = one(sp.day);
    const wanted = dayRaw && YMD_RE.test(dayRaw) ? dayRaw : undefined;
    let c = await loadCashDayVM(ctx, { unitId: unit.id, ...(wanted ? { businessDate: wanted } : {}) });
    if (c.ok && wanted) day = wanted;
    if (!c.ok && c.code === "INVALID_INPUT") c = await loadCashDayVM(ctx, { unitId: unit.id });
    if (c.ok) cash = c.vm;
  }
  return <BookingsScreen unitSlug={unitSlug} list={list.vm} detail={detail} detailFailed={detailFailed} docs={docs} cash={cash} view={view} day={day} channels={channels} />;
}
