// ─────────────────────────────────────────────────────────────
// platform/hotel-mail.ts — อีเมลแจ้งผู้เข้าพักโรงแรม 5 แบบ (TH/EN) · SVC H.8 · ใบสั่ง svc-brief-h.8.md §0 (Q9) · §2.6 · §9.4 · §10.4–§10.5
//
//   hold      ถือห้องไว้แล้ว (+ ลิงก์จ่ายมัดจำ · เวลาหมดอายุ) — หรือ "รอโรงแรมยืนยัน" เมื่อโหมด MANUAL_APPROVE
//   confirmed ยืนยันการจอง (+ ไฟล์ปฏิทิน .ics แนบ)
//   reminder  เตือนก่อนเข้าพัก 1 วัน (งาน hotel-guest-reminder · เฉพาะ CONFIRMED ที่เข้าพรุ่งนี้ร้าน · ส่งครั้งเดียวต่อการจอง)
//   cancelled ยกเลิกแล้ว (+ ยอดคืน)
//   expired   หมดเวลาถือห้อง (+ ลิงก์จองใหม่)
// 🔴 ส่งผ่าน core/email.sendEmailRich (fromName = ชื่อโรงแรม · Idempotency-Key hotel-mail-<kind>-<reservationId>) · ไม่มีกุญแจผู้ให้บริการ = log "[email:dev] rich"
// 🔴 ไม่มี guestEmail ⇒ ไม่ส่ง · notify.channel = LINE อย่างเดียว ⇒ ไม่ส่งอีเมล · ส่งล้ม = ok:false ไม่ throw ไม่กระทบสถานะการจอง
// 🔴 SVC H.8 r2 (ผู้ตรวจ A-14): การจองจาก OTA ไม่ส่งเลย (OTA ส่งเอง) · ช่องทางอื่นที่ไม่ใช่เว็บ/LINE (โทร/walk-in) ส่งได้แต่บอก «ติดต่อโรงแรมเพื่อยกเลิก/แก้ไข» (ไม่มีลิงก์ยกเลิกเอง)
// 🔴 ไม่มีเลขบัตร/เอกสารเดินทางในอีเมล · หัวเรื่องไม่มีชื่อ/เบอร์แขก · ภาษา = locale ที่ส่ง → policySnapshot.locale ตอนจอง → ไทย
// ─────────────────────────────────────────────────────────────
import { bkkParts, bkkYmd, parseHM } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { sendEmailRich, type RichEmailAttachment } from "@/lib/core/email";
import * as hotel from "@/lib/modules/hotel";

export const GUEST_MAIL_KINDS = ["hold", "confirmed", "reminder", "cancelled", "expired"] as const;
export type GuestMailKind = (typeof GUEST_MAIL_KINDS)[number];
export type GuestMailDeps = { fetch?: typeof fetch };
export type NotifyGuestResult =
  | { ok: true; sent: true; providerId?: string }
  | { ok: false; sent: false; code: "BAD_KIND" | "NOT_FOUND" | "NO_EMAIL" | "CHANNEL_OFF" | "SEND_FAILED" | "OTA_SOURCE"; reason: string };

type L = "th" | "en";
const THAI = /[\u0E00-\u0E7F]/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isKind = (k: unknown): k is GuestMailKind => typeof k === "string" && (GUEST_MAIL_KINDS as readonly string[]).includes(k);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const no = (code: Extract<NotifyGuestResult, { ok: false }>["code"], reason: string): NotifyGuestResult => ({ ok: false, sent: false, code, reason });

function appOrigin(): string {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเพี้ยน */
    }
  }
  return "https://shark.in.th";
}

const money = (satang: number, l: L) => `${l === "en" ? "THB " : "฿"}${(satang / 100).toLocaleString(l === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (ymd: string, l: L) =>
  new Date(`${ymd}T00:00:00.000Z`).toLocaleDateString(l === "en" ? "en-GB" : "th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeLabel = (d: Date, l: L) => d.toLocaleString(l === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

type Facts = NonNullable<Awaited<ReturnType<typeof hotel.guestMailFacts>>>;
type Ctx = { f: Facts; l: L; checkInTime: string; checkOutTime: string; base: string };

/** เนื้อหาแต่ละแบบ (หัวเรื่อง + ย่อหน้า + ปุ่ม) — ภาษาอังกฤษไม่มีอักษรไทย ยกเว้นชื่อโรงแรม */
function content(kind: GuestMailKind, c: Ctx): { subject: string; lead: string; extra: string[]; cta: { label: string; href: string } | null } {
  const { f, l } = c;
  const status = f.publicToken ? `${c.base}/r/${f.publicToken}` : c.base;
  const pay = f.publicToken ? `${c.base}/pay/${f.publicToken}` : c.base;
  const approval = f.bookingMode === "MANUAL_APPROVE";
  if (l === "en") {
    switch (kind) {
      case "hold":
        return approval
          ? { subject: `Booking request received ${f.code}`, lead: "We have received your booking request. The hotel will confirm it shortly.", extra: [], cta: { label: "View booking", href: status } }
          : {
              subject: `Room on hold ${f.code} — please pay the deposit`,
              lead: "Your room is on hold. Please pay the deposit to confirm your booking.",
              extra: [`Deposit due now: ${money(f.depositSatang, l)}`, ...(f.holdExpiresAt ? [`Hold expires: ${timeLabel(f.holdExpiresAt, l)}`] : [])],
              cta: { label: "Pay deposit", href: pay },
            };
      case "confirmed":
        return { subject: `Booking confirmed ${f.code}`, lead: "Your booking is confirmed. A calendar file is attached.", extra: [f.depositPaid ? `Deposit received: ${money(f.depositSatang, l)}` : "Deposit: pay at the hotel"], cta: { label: "View booking", href: status } };
      case "reminder":
        return { subject: `See you tomorrow ${f.code}`, lead: `Your stay starts tomorrow. Check-in from ${c.checkInTime}.`, extra: [], cta: { label: "View booking", href: status } };
      case "cancelled":
        return { subject: `Booking cancelled ${f.code}`, lead: "Your booking has been cancelled.", extra: [f.refundedSatang > 0 ? `Refund: ${money(f.refundedSatang, l)}` : "No refund is due for this booking."], cta: null };
      case "expired":
        return { subject: `Room hold expired ${f.code}`, lead: "The hold on your room has expired because the deposit was not received in time.", extra: [], cta: { label: "Book again", href: c.base } };
    }
  }
  switch (kind) {
    case "hold":
      return approval
        ? { subject: `ได้รับคำขอจองแล้ว ${f.code}`, lead: "เราได้รับคำขอจองของคุณแล้ว โรงแรมจะยืนยันการจองให้เร็วที่สุด", extra: [], cta: { label: "ดูการจอง", href: status } }
        : {
            subject: `ถือห้องไว้ให้แล้ว ${f.code} — กรุณาชำระมัดจำ`,
            lead: "โรงแรมถือห้องไว้ให้แล้ว ชำระมัดจำเพื่อยืนยันการจอง",
            extra: [`มัดจำที่ต้องชำระตอนนี้ ${money(f.depositSatang, l)}`, ...(f.holdExpiresAt ? [`ถือห้องถึง ${timeLabel(f.holdExpiresAt, l)} น.`] : [])],
            cta: { label: "ชำระมัดจำ", href: pay },
          };
    case "confirmed":
      return { subject: `ยืนยันการจองแล้ว ${f.code}`, lead: "การจองของคุณได้รับการยืนยันแล้ว แนบไฟล์ปฏิทินไว้ในอีเมลนี้", extra: [f.depositPaid ? `ได้รับมัดจำแล้ว ${money(f.depositSatang, l)}` : "มัดจำ: ชำระที่โรงแรม"], cta: { label: "ดูการจอง", href: status } };
    case "reminder":
      return { subject: `พรุ่งนี้พบกัน ${f.code}`, lead: `ใกล้ถึงวันเข้าพักแล้ว เช็กอินได้ตั้งแต่ ${c.checkInTime} น.`, extra: [], cta: { label: "ดูการจอง", href: status } };
    case "cancelled":
      return { subject: `ยกเลิกการจองแล้ว ${f.code}`, lead: "การจองของคุณถูกยกเลิกแล้ว", extra: [f.refundedSatang > 0 ? `ยอดคืน ${money(f.refundedSatang, l)}` : "การจองนี้ไม่มียอดเงินคืน"], cta: null };
    case "expired":
      return { subject: `หมดเวลาถือห้อง ${f.code}`, lead: "หมดเวลาถือห้องแล้วเพราะยังไม่ได้รับมัดจำตามเวลา", extra: [], cta: { label: "จองใหม่", href: c.base } };
  }
}

function htmlOf(kind: GuestMailKind, c: Ctx, x: ReturnType<typeof content>): string {
  const { f, l } = c;
  const rows: [string, string][] = [
    [l === "en" ? "Booking code" : "รหัสการจอง", f.code],
    ...(l === "th" || !THAI.test(f.roomTypeName) ? [[l === "en" ? "Room" : "ห้อง", `${f.roomTypeName}${f.rooms > 1 ? ` × ${f.rooms}` : ""}`] as [string, string]] : f.rooms > 1 ? [["Rooms", String(f.rooms)] as [string, string]] : []),
    [l === "en" ? "Check-in" : "เช็กอิน", `${dateLabel(f.checkIn, l)} · ${c.checkInTime}`],
    [l === "en" ? "Check-out" : "เช็กเอาต์", `${dateLabel(f.checkOut, l)} · ${c.checkOutTime}`],
    [l === "en" ? "Guests" : "ผู้เข้าพัก", l === "en" ? `${f.adults} adult${f.adults > 1 ? "s" : ""}` : `ผู้ใหญ่ ${f.adults} คน`],
    [l === "en" ? "Room total" : "ค่าห้องรวม", money(f.totalSatang, l)],
  ];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join("");
  const extra = x.extra.map((e) => `<p style="margin:8px 0">${esc(e)}</p>`).join("");
  const cta = x.cta ? `<p style="margin:20px 0"><a href="${esc(x.cta.href)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">${esc(x.cta.label)}</a></p>` : "";
  const foot = l === "en" ? "This email was sent by the hotel through SHARK. Reply to contact the hotel." : "อีเมลนี้ส่งจากโรงแรมผ่านระบบ SHARK";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,'Noto Sans Thai',sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px" data-kind="${kind}">
<div style="font-size:18px;font-weight:700">${esc(f.unitName)}</div>
<p style="margin:16px 0 8px">${esc(x.lead)}</p>
<table style="border-collapse:collapse;font-size:14px">${table}</table>
${extra}${cta}
<p style="color:#888;font-size:12px;margin-top:24px">${esc(foot)}</p>
</body></html>`;
}

/** ไฟล์ปฏิทิน (all-day ช่วงเข้าพัก) — text/calendar */
function icsOf(f: Facts): RichEmailAttachment {
  const d = (ymd: string) => ymd.replace(/-/g, "");
  const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, " ");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SHARK//Hotel booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${f.code}-${f.id}@shark.in.th`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d(f.checkIn)}`,
    `DTEND;VALUE=DATE:${d(f.checkOut)}`,
    `SUMMARY:${icsEsc(`${f.unitName} (${f.code})`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return { filename: `booking-${f.code}.ics`, content: new Uint8Array(Buffer.from(body, "utf8")), contentType: "text/calendar" };
}

/**
 * ส่งอีเมลแจ้งผู้เข้าพัก 1 ฉบับ — kind ∈ GUEST_MAIL_KINDS · reservationId = id การจอง · locale ไม่ส่ง = ภาษาที่จองไว้
 * deps.fetch ฉีดได้ (ข้อสอบ) · ไม่ throw
 */
export async function notifyGuest(kind: string, reservationId: string, locale?: string | null, deps?: GuestMailDeps): Promise<NotifyGuestResult> {
  try {
    if (!isKind(kind)) return no("BAD_KIND", "ไม่รู้จักชนิดอีเมลนี้");
    const f = await hotel.guestMailFacts(reservationId);
    if (!f) return no("NOT_FOUND", "ไม่พบการจองนี้");
    if (f.source === "OTA") return no("OTA_SOURCE", "การจองจาก OTA — ช่องทางที่จองเป็นผู้แจ้งผู้เข้าพัก");
    const to = (f.guestEmail ?? "").trim();
    if (!to) return no("NO_EMAIL", "การจองนี้ไม่มีอีเมลผู้เข้าพัก");
    const st = await resolveSettings({ tenantId: f.tenantId }, ["rooms.hotel.notify.channel", "rooms.hotel.checkInTime", "rooms.hotel.checkOutTime"], { unitId: f.unitId });
    if (st["rooms.hotel.notify.channel"]?.value === "LINE") return no("CHANNEL_OFF", "ร้านตั้งให้แจ้งผู้เข้าพักทาง LINE อย่างเดียว");
    const l: L = locale === "en" || locale === "th" ? locale : f.locale === "en" ? "en" : "th";
    const s = (k: string, d: string) => (typeof st[k]?.value === "string" ? (st[k]?.value as string) : d);
    const c: Ctx = { f, l, checkInTime: s("rooms.hotel.checkInTime", "14:00"), checkOutTime: s("rooms.hotel.checkOutTime", "12:00"), base: `${appOrigin()}/s/${encodeURIComponent(f.tenantSlug)}/${encodeURIComponent(f.unitSlug)}/hotel` };
    const x0 = content(kind, c);
    // ช่องทางที่ไม่ใช่เว็บ/LINE: ยกเลิกเองทางเว็บไม่ได้ ⇒ บอกให้ติดต่อโรงแรม (ไม่มีลิงก์/ปุ่มยกเลิก)
    const selfService = f.source === "WEB" || f.source === "LINE";
    const x = selfService || kind === "cancelled" || kind === "expired" ? x0 : { ...x0, extra: [...x0.extra, l === "en" ? "To cancel or change this booking, please contact the hotel." : "ต้องการยกเลิกหรือแก้ไขการจอง กรุณาติดต่อโรงแรม"] };
    const r = await sendEmailRich(
      {
        fromName: f.unitName.replace(/[\r\n"<>]/g, " ").slice(0, 80),
        to: [to],
        subject: x.subject,
        html: htmlOf(kind, c, x),
        ...(kind === "confirmed" ? { attachments: [icsOf(f)] } : {}),
        idempotencyKey: `hotel-mail-${kind}-${f.id}`,
      },
      deps?.fetch ? { fetch: deps.fetch } : undefined,
    );
    if (!r.ok) return no("SEND_FAILED", "ส่งอีเมลไม่สำเร็จ");
    return { ok: true, sent: true, ...(r.providerId ? { providerId: r.providerId } : {}) };
  } catch (e) {
    console.warn(`[hotel.mail] ส่งอีเมลแจ้งผู้เข้าพักไม่สำเร็จ (${e instanceof Error ? e.name : "Error"})`);
    return no("SEND_FAILED", "ส่งอีเมลไม่สำเร็จ");
  }
}

/** event ของการจอง (H.3) → แบบอีเมล · created HOLD = hold · created CONFIRMED = confirmed */
const KIND_OF_EVENT: Record<string, (status: unknown) => GuestMailKind | null> = {
  "hotel.booking.created": (s) => (s === "HOLD" ? "hold" : s === "CONFIRMED" ? "confirmed" : null),
  "hotel.booking.confirmed": () => "confirmed",
  "hotel.booking.cancelled": () => "cancelled",
  "hotel.booking.hold_expired": () => "expired",
};

/**
 * consumer ของ hotel.booking.created/confirmed/cancelled/hold_expired (outbox-consumers · lazy import) — ส่งเฉพาะหัวกลุ่ม (กลุ่มหลายห้อง = อีเมลเดียว)
 * อีเมลเป็น "ของแถม": ไม่ throw (ล้ม = log) ⇒ ไม่ทำให้ event ค้าง/วนซ้ำ
 */
export async function onHotelBookingEvent(evt: { tenantId: string; type?: string; payload: unknown }): Promise<void> {
  try {
    const p = isRec(evt?.payload) ? evt.payload : null;
    const id = typeof p?.reservationId === "string" ? p.reservationId : "";
    const pick = KIND_OF_EVENT[String(evt?.type ?? "")];
    const kind = pick ? pick(p?.status) : null;
    if (!id || !kind || p?.tenantId !== undefined && p.tenantId !== evt.tenantId) return;
    const f = await hotel.guestMailFacts(id);
    if (!f || f.tenantId !== evt.tenantId || !f.isGroupHead || !f.guestEmail || f.source === "OTA") return;
    await notifyGuest(kind, id);
  } catch (e) {
    console.warn(`[hotel.mail] consumer (${e instanceof Error ? e.name : "Error"})`);
  }
}

/**
 * งานเตือนก่อนเข้าพัก 1 วัน (minute-job "hotel-guest-reminder" รายชั่วโมง) — CONFIRMED ที่เข้าพักพรุ่งนี้ (เวลาไทย) และมีอีเมล
 * ส่งเมื่อถึงเวลา rooms.hotel.storefront.reminderHour ของสาขา (ค่าเริ่ม 10:00) · ส่งครั้งเดียวต่อการจอง (จองสิทธิ์ส่งด้วยถัง rate limit=1 คำสั่ง SQL เดียว · X5)
 */
export async function runGuestReminders(now: Date = new Date()): Promise<{ due: number; sent: number }> {
  const tomorrow = hotel.addDaysYmd(bkkYmd(now), 1);
  const rows = await hotel.arrivalsWithEmailOn(tomorrow);
  const hourOf = new Map<string, string>();
  const p = bkkParts(now);
  const nowMin = p.h * 60 + p.mi;
  let sent = 0;
  for (const r of rows) {
    const k = `${r.tenantId}|${r.unitId}`;
    if (!hourOf.has(k)) {
      const st = await resolveSettings({ tenantId: r.tenantId }, ["rooms.hotel.storefront.reminderHour"], { unitId: r.unitId });
      const v = st["rooms.hotel.storefront.reminderHour"]?.value;
      hourOf.set(k, typeof v === "string" ? v : "10:00");
    }
    const at = parseHM(hourOf.get(k) ?? "10:00");
    if (nowMin < at.h * 60 + at.m) continue;
    const claim = await checkRateLimitDb(`hw:mail:reminder:${r.id}`, { limit: 1, windowMs: 3 * 86_400_000 }, now.getTime());
    if (!claim.ok) continue;
    const res = await notifyGuest("reminder", r.id);
    if (res.ok) sent++;
  }
  return { due: rows.length, sent };
}
