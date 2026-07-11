"use client";

import { useEffect, useState } from "react";

type Service = { id: string; name: string; durationMin: number; priceSatang: number };
type Staff = { id: string; name: string };
type Slot = { hhmm: string; startMin: number; staffId: string };

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH");

// วันที่ local ถัดไป 14 วัน (Asia/Bangkok)
function nextDays(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600000);
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + i));
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    out.push({ value, label: i === 0 ? `วันนี้ · ${label}` : label });
  }
  return out;
}

export function PublicBooking({
  tenantSlug,
  unitSlug,
  services,
  staff,
}: {
  tenantSlug: string;
  unitSlug: string;
  services: Service[];
  staff: Staff[];
}) {
  const days = nextDays(14);
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string>("any");
  const [date, setDate] = useState<string>(days[0].value);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // โหลด slot เมื่อเลือกบริการ/ช่าง/วัน
  useEffect(() => {
    if (!service) return;
    setSlots(null);
    setSlot(null);
    setLoading(true);
    const q = new URLSearchParams({ serviceId: service.id, staffId, date });
    fetch(`/api/store/${tenantSlug}/${unitSlug}/slots?${q}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [service, staffId, date, tenantSlug, unitSlug]);

  async function submit() {
    if (!service || !slot) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/store/${tenantSlug}/${unitSlug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        staffId,
        date,
        startMin: slot.startMin,
        name,
        phone,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.reason ?? "จองไม่สำเร็จ กรุณาลองใหม่");
      // slot อาจถูกจองไปแล้ว → รีเฟรช
      setSlot(null);
      setSlots(null);
      const q = new URLSearchParams({ serviceId: service.id, staffId, date });
      fetch(`/api/store/${tenantSlug}/${unitSlug}/slots?${q}`)
        .then((r) => r.json())
        .then((dd) => setSlots(dd.slots ?? []));
    }
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center gap-3 py-10 text-center">
        <div className="text-3xl">✅</div>
        <div className="text-lg font-semibold">จองสำเร็จ!</div>
        <div className="text-sm text-[color:var(--color-muted)]">
          {service?.name} · {days.find((d) => d.value === date)?.label} {slot?.hhmm} น.
        </div>
        <div className="text-sm text-[color:var(--color-muted)]">
          คุณ {name} — แล้วพบกันที่ร้านครับ
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="card text-center text-sm text-[color:var(--color-muted)]">
        ร้านยังไม่เปิดรับจองออนไลน์
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. บริการ */}
      <section className="flex flex-col gap-2">
        <div className="text-sm font-medium">1. เลือกบริการ</div>
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setService(s)}
            className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${
              service?.id === s.id
                ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
                : "hover:bg-[color:var(--color-surface-2)]"
            }`}
          >
            <div>
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-[color:var(--color-muted)]">{s.durationMin} นาที</div>
            </div>
            <div className="text-sm">{s.priceSatang > 0 ? `฿${baht(s.priceSatang)}` : "—"}</div>
          </button>
        ))}
      </section>

      {service && (
        <>
          {/* 2. ช่าง */}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">2. เลือกพนักงาน</div>
            <div className="flex flex-wrap gap-2">
              <Chip active={staffId === "any"} onClick={() => setStaffId("any")}>
                ใครก็ได้
              </Chip>
              {staff.map((s) => (
                <Chip key={s.id} active={staffId === s.id} onClick={() => setStaffId(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
          </section>

          {/* 3. วัน */}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">3. เลือกวัน</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDate(d.value)}
                  className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition-colors ${
                    date === d.value
                      ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
                      : "hover:bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </section>

          {/* 4. เวลา */}
          <section className="flex flex-col gap-2">
            <div className="text-sm font-medium">4. เลือกเวลา</div>
            {loading ? (
              <div className="text-sm text-[color:var(--color-muted)]">กำลังโหลด...</div>
            ) : slots && slots.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.startMin}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-lg border py-2 text-sm transition-colors ${
                      slot?.startMin === s.startMin
                        ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                        : "hover:bg-[color:var(--color-surface-2)]"
                    }`}
                  >
                    {s.hhmm}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[color:var(--color-muted)]">วันนี้ไม่มีเวลาว่าง ลองวันอื่น</div>
            )}
          </section>

          {/* 5. ข้อมูล + ยืนยัน */}
          {slot && (
            <section className="flex flex-col gap-3">
              <div className="text-sm font-medium">5. ข้อมูลผู้จอง</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อ"
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="เบอร์โทร"
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
              />
              {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
              <button
                type="button"
                disabled={submitting || name.trim().length < 1 || phone.trim().length < 6}
                onClick={submit}
                className="btn btn-primary disabled:opacity-50"
              >
                {submitting
                  ? "กำลังจอง..."
                  : `ยืนยันจอง ${slot.hhmm} น.`}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)]"
          : "hover:bg-[color:var(--color-surface-2)]"
      }`}
    >
      {children}
    </button>
  );
}
