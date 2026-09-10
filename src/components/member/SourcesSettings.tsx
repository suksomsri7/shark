// SourcesSettings.tsx — หน้า "ช่องทางที่มาของสมาชิก" (M1.8 · ภาพ ledger/design-member/13-acquisition-channels.png)
//
// 4 บล็อกตามภาพ:
//   (ก) KPI 4 ช่อง        (ข) แท่งต่อช่องทาง — first touch เทียบ last touch
//   (ค) ตารางแคมเปญ/ลิงก์ที่มา (คลิก · สมัคร · ซื้อครั้งแรก · อัตราแปลง · ต้นทุน/สมาชิก · เปิดปิด)
//   (ง) การ์ดขวา: ลิงก์ + QR ของลิงก์ที่เลือก (คัดลอก/ดาวน์โหลด) + กฎ attribution
//
// 🔴 ป้ายช่องทางมาจากทะเบียนป้ายกลาง `memberSourceLabel()` — ห้ามพิมพ์ชื่อช่องทางเองที่นี่
// 🔴 ทุกการบันทึกเรียก server action ใน `sources-actions.ts` (ด่าน `member.settings.manage`)
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatBaht } from "@/lib/ui/money";
import { memberSourceLabel, MEMBER_SOURCE_LABELS } from "@/lib/modules/member/member-source-labels";
import type { SourceLinkDto, SourceReportRow } from "@/lib/modules/member/sources";
import { createLinkAction, toggleLinkAction } from "@/lib/modules/member/sources-actions";

const TARGET_LABELS: { value: string; label: string }[] = [
  { value: "LIFF_JOIN", label: "ฟอร์มสมัคร LIFF" },
  { value: "WEB_FORM", label: "ฟอร์มบนเว็บไซต์" },
  { value: "CHAT", label: "ทักแชทร้าน" },
];

const SOURCE_OPTIONS = Object.entries(MEMBER_SOURCE_LABELS).map(([value, label]) => ({ value, label }));

function thaiInt(n: number): string {
  return n.toLocaleString("th-TH");
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" style={{ minWidth: 0 }}>
      <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span className="text-xl font-semibold" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
      {hint && (
        <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && (
        <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
          {sub}
        </span>
      )}
      <span className="flex-1" />
      {right}
    </div>
  );
}

export type SourcesSettingsProps = {
  systemId: string;
  /** ช่วงเวลาที่รายงานนี้ครอบ (วัน) — โชว์ให้ผู้ใช้รู้ว่ากำลังดูอะไรอยู่ */
  periodDays: number;
  rows: SourceReportRow[];
  links: SourceLinkDto[];
  /** QR ของแต่ละลิงก์ (data URL) — สร้างที่ฝั่งเซิร์ฟเวอร์ตอนเรนเดอร์หน้า */
  qr: Record<string, string>;
  kpi: {
    newMembers: number;
    topLabel: string;
    topPct: string;
    costPerSignupSatang: number;
    avgSpentSatang: number;
  };
  units: { id: string; name: string }[];
};

/** ช่วงเวลาที่เลือกดูได้ (ภาพ 13 มี dropdown มุมขวาบน) — ผูกกับ `?days=` ของหน้า */
export const PERIOD_CHOICES = [30, 90, 180, 365] as const;

export function SourcesSettings(props: SourcesSettingsProps) {
  const { systemId, rows, kpi, units, periodDays } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState<SourceLinkDto[]>(props.links);
  const [qr, setQr] = useState<Record<string, string>>(props.qr);
  const [selectedId, setSelectedId] = useState<string | null>(props.links[0]?.id ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selected = links.find((l) => l.id === selectedId) ?? links[0] ?? null;
  const maxTouch = useMemo(() => Math.max(1, ...rows.map((r) => Math.max(r.firstTouch, r.lastTouch))), [rows]);

  const onToggle = async (link: SourceLinkDto) => {
    setBusyId(link.id);
    const res = await toggleLinkAction({ systemId, id: link.id, active: !link.active });
    setBusyId(null);
    if (!res.ok) {
      setNotice(res.reason);
      return;
    }
    setLinks((prev) => prev.map((l) => (l.id === link.id ? res.data.link : l)));
    setNotice(res.data.link.active ? `เปิดใช้ลิงก์ "${link.name}" แล้ว` : `ปิดลิงก์ "${link.name}" แล้ว — ลิงก์เดิมจะไม่นับที่มาให้อีก`);
  };

  const onCreated = (link: SourceLinkDto, qrDataUrl: string) => {
    setLinks((prev) => [link, ...prev]);
    setQr((prev) => ({ ...prev, [link.id]: qrDataUrl }));
    setSelectedId(link.id);
    setModalOpen(false);
    setNotice(`สร้างลิงก์ "${link.name}" แล้ว — คัดลอกลิงก์หรือดาวน์โหลด QR ไปใช้ได้เลย`);
  };

  return (
    <div data-testid="sources-page" className="flex flex-col gap-4">
      {notice && (
        <div className="card p-3 text-sm" style={{ borderColor: "var(--color-accent)", color: "var(--color-ink)" }} role="status">
          {notice}
        </div>
      )}

      {/* ตัวเลือกช่วงเวลา (ภาพ 13) — เปลี่ยนแล้ว KPI/กราฟ/ตารางคิดใหม่ทั้งหน้าตาม `?days=` */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">ภาพรวมช่องทางที่มา</span>
        <span className="flex-1" />
        <select
          data-testid="sources-period"
          aria-label="ช่วงเวลาที่ดู"
          className="input"
          style={{ width: "auto", fontSize: 12.5 }}
          value={String(periodDays)}
          disabled={pending}
          onChange={(e) => {
            const days = e.target.value;
            startTransition(() => router.push(`${pathname}?days=${days}`));
          }}
        >
          {PERIOD_CHOICES.map((d) => (
            <option key={d} value={d}>
              {thaiInt(d)} วันล่าสุด
            </option>
          ))}
        </select>
      </div>

      <div data-testid="sources-kpi" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Tile label={`สมาชิกใหม่ ${thaiInt(periodDays)} วัน`} value={thaiInt(kpi.newMembers)} hint="สมัครในช่วงนี้ · แยกตามช่องทางแรกที่รู้จัก" />
        <Tile label="ช่องทางอันดับ 1" value={kpi.topLabel} hint={`${kpi.topPct} ของสมาชิกใหม่`} />
        <Tile
          label="ต้นทุนต่อสมาชิกใหม่"
          value={kpi.costPerSignupSatang ? formatBaht(kpi.costPerSignupSatang) : "—"}
          hint="เฉพาะช่องทางที่กรอกค่าใช้จ่ายไว้"
        />
        <Tile label="ใช้จ่ายเฉลี่ยต่อคน" value={kpi.avgSpentSatang ? formatBaht(kpi.avgSpentSatang) : "—"} hint="ทุกช่องทางรวมกัน" />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* (ข) แท่งต่อช่องทาง — first touch เทียบ last touch */}
          <section data-testid="sources-chart" className="card p-4">
            <CardTitle title="สมาชิกใหม่ต่อช่องทาง" sub="แท่งบน = ครั้งแรกที่รู้จัก · แท่งล่าง = ครั้งล่าสุด" />
            {rows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                ยังไม่มีสมาชิกใหม่ในช่วงนี้ — เมื่อมีคนสมัคร ระบบจะสรุปช่องทางที่มาให้ที่นี่
              </p>
            ) : (
              <div className="flex flex-col gap-3.5 sm:gap-2.5">
                {/* มือถือ (<640px) ซ้อน 3 บรรทัด: ชื่อ+จำนวน / แท่งเต็มกว้าง / ล่าสุด·ซ้ำ·ยอดเฉลี่ย
                    เดสก์ท็อปกลับเป็นแถวเดียวด้วย `sm:contents` — บังคับแถวเดียวบนจอแคบ = ตัวเลขเงินทะลุการ์ด (ตีกลับรอบ 1) */}
                {rows.map((r) => (
                  <div
                    key={`${r.source}-${r.sourceChannel ?? ""}`}
                    className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                    style={{ fontSize: 12.5 }}
                  >
                    <div className="flex min-w-0 items-center gap-2 sm:w-28 sm:shrink-0">
                      <span className="min-w-0 flex-1 truncate" title={memberSourceLabel(r.source)}>
                        {memberSourceLabel(r.source)}
                      </span>
                      <span className="shrink-0 font-semibold sm:hidden">{thaiInt(r.firstTouch)}</span>
                    </div>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        title={`ครั้งแรกที่รู้จัก ${thaiInt(r.firstTouch)}`}
                        style={{
                          display: "block",
                          height: 9,
                          borderRadius: 999,
                          width: `${Math.max(2, Math.round((r.firstTouch / maxTouch) * 100))}%`,
                          background: "var(--color-accent)",
                        }}
                      />
                      <span
                        title={`ครั้งล่าสุด ${thaiInt(r.lastTouch)}`}
                        style={{
                          display: "block",
                          height: 5,
                          borderRadius: 999,
                          width: `${Math.max(1, Math.round((r.lastTouch / maxTouch) * 100))}%`,
                          background: "var(--color-line)",
                        }}
                      />
                    </span>
                    <span className="hidden w-10 shrink-0 text-right font-semibold sm:block">{thaiInt(r.firstTouch)}</span>
                    <div
                      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] sm:contents sm:text-[12.5px]"
                      style={{ color: "var(--color-muted)" }}
                    >
                      <span className="truncate sm:w-16 sm:shrink-0 sm:text-right">ล่าสุด {thaiInt(r.lastTouch)}</span>
                      <span className="truncate sm:w-16 sm:shrink-0 sm:text-right">{pct(r.repeatBuyers, r.buyers)} ซ้ำ</span>
                      <span className="truncate sm:w-20 sm:shrink-0 sm:text-right">
                        {r.avgSpentSatang ? formatBaht(r.avgSpentSatang) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* (ค) ตารางแคมเปญ/ลิงก์ที่มา */}
          <section data-testid="sources-links" className="card p-4">
            <CardTitle
              title="แคมเปญ / ลิงก์ที่มา"
              // ตัวนับของลิงก์เป็นยอดสะสมบนแถว (ยังไม่มีตารางเหตุการณ์รายวันให้ตัดตามช่วง) — บอกผู้ใช้ตรง ๆ
              sub="ยอดสะสมตั้งแต่สร้างลิงก์"
              right={
                <button
                  type="button"
                  data-testid="sources-link-new"
                  className="btn btn-primary text-sm"
                  onClick={() => setModalOpen(true)}
                >
                  สร้างลิงก์ + QR
                </button>
              }
            />
            {links.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                ยังไม่มีลิงก์ที่มา — สร้างอันแรกเพื่อรู้ว่าโปสเตอร์/โฆษณาชิ้นไหนพาสมาชิกเข้ามาได้จริง
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "var(--color-muted)", textAlign: "left" }}>
                      <th className="py-1.5 pr-2 font-normal">ชื่อ</th>
                      <th className="py-1.5 pr-2 font-normal">ช่องทาง</th>
                      <th className="py-1.5 pr-2 font-normal">รหัส / QR</th>
                      <th className="py-1.5 pr-2 text-right font-normal">คลิก</th>
                      <th className="py-1.5 pr-2 text-right font-normal">สมาชิกใหม่</th>
                      <th className="py-1.5 pr-2 text-right font-normal">ซื้อครั้งแรก</th>
                      <th className="py-1.5 pr-2 text-right font-normal">อัตราแปลง</th>
                      <th className="py-1.5 pr-2 text-right font-normal">ต้นทุน/สมาชิก</th>
                      <th className="py-1.5 text-right font-normal">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => setSelectedId(l.id)}
                        style={{
                          borderTop: "1px solid var(--color-line)",
                          cursor: "pointer",
                          background: selected?.id === l.id ? "var(--color-surface-2)" : undefined,
                          opacity: l.active ? 1 : 0.55,
                        }}
                      >
                        <td className="py-2 pr-2">{l.name}</td>
                        <td className="py-2 pr-2" style={{ color: "var(--color-muted)" }}>
                          {memberSourceLabel(l.source)}
                        </td>
                        <td className="py-2 pr-2" style={{ color: "var(--color-muted)" }}>
                          {l.code}
                        </td>
                        <td className="py-2 pr-2 text-right">{thaiInt(l.hits)}</td>
                        <td className="py-2 pr-2 text-right">{thaiInt(l.signups)}</td>
                        <td className="py-2 pr-2 text-right">{thaiInt(l.firstPurchases)}</td>
                        <td className="py-2 pr-2 text-right">{pct(l.firstPurchases, l.signups)}</td>
                        <td className="py-2 pr-2 text-right">
                          {l.costSatang && l.signups ? formatBaht(Math.round(l.costSatang / l.signups)) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 12 }}
                            disabled={busyId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onToggle(l);
                            }}
                          >
                            {l.active ? "เปิดอยู่" : "ปิดอยู่"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* (ง) ลิงก์ + QR ของลิงก์ที่เลือก */}
        <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:flex-none">
          <section className="card p-4">
            <CardTitle title="ลิงก์ / QR ที่มา" />
            {selected ? (
              <div className="flex flex-col gap-2.5">
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{selected.name}</div>
                <div
                  className="truncate rounded-lg px-2.5 py-2"
                  style={{ fontSize: 12, border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
                  title={selected.url}
                >
                  {selected.url}
                </div>
                {qr[selected.id] && (
                  <img
                    data-testid="sources-link-qr"
                    src={qr[selected.id]}
                    alt={`QR ของลิงก์ ${selected.name}`}
                    width={140}
                    height={140}
                    style={{ width: 140, height: 140, margin: "6px auto", imageRendering: "pixelated" }}
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost flex-1 text-sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(selected.url);
                      setNotice("คัดลอกลิงก์แล้ว");
                    }}
                  >
                    คัดลอกลิงก์
                  </button>
                  <a
                    className="btn btn-ghost flex-1 text-center text-sm"
                    href={qr[selected.id] ?? "#"}
                    download={`qr-${selected.code}.png`}
                  >
                    ดาวน์โหลด QR
                  </a>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                  คลิก {thaiInt(selected.hits)} · สมัคร {thaiInt(selected.signups)} · ซื้อครั้งแรก {thaiInt(selected.firstPurchases)}
                  {selected.costSatang ? ` · ค่าใช้จ่าย ${formatBaht(selected.costSatang)}` : ""}
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                เลือกลิงก์จากตารางเพื่อดู QR และคัดลอกลิงก์
              </p>
            )}
          </section>

          <section className="card p-4" style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
            <CardTitle title="กฎการนับที่มา" />
            <p className="mb-1.5">
              <b style={{ color: "var(--color-ink)" }}>ครั้งแรกที่รู้จัก (first touch)</b> เป็นตัวตัดสินช่องทางที่มาหลัก และเขียนครั้งเดียวไม่ทับ
            </p>
            <p>
              ระบบเก็บ <b style={{ color: "var(--color-ink)" }}>ครั้งล่าสุด (last touch)</b> ไว้ด้วย ใช้เทียบผลแคมเปญภายหลังได้
            </p>
          </section>
        </div>
      </div>

      {modalOpen && (
        <NewLinkModal systemId={systemId} units={units} onClose={() => setModalOpen(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

function NewLinkModal({
  systemId,
  units,
  onClose,
  onCreated,
}: {
  systemId: string;
  units: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (link: SourceLinkDto, qrDataUrl: string) => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState("CAMPAIGN");
  const [target, setTarget] = useState("LIFF_JOIN");
  const [unitId, setUnitId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [code, setCode] = useState("");
  const [costBaht, setCostBaht] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("ตั้งชื่อลิงก์ก่อน เช่น \"QR หน้าร้านป่าตอง\" — ชื่อนี้ใช้ดูในรายงาน");
      return;
    }
    const baht = costBaht.trim() ? Number(costBaht.trim()) : 0;
    if (!Number.isFinite(baht) || baht < 0) {
      setError("ค่าใช้จ่ายต้องเป็นตัวเลขบาทที่ไม่ติดลบ");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createLinkAction({
      systemId,
      name: trimmed,
      source,
      target,
      code: code.trim() || null,
      unitId: unitId || null,
      campaignId: campaignId.trim() || null,
      costSatang: Math.round(baht * 100),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onCreated(res.data.link, res.data.qrDataUrl);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(10,10,10,.35)" }}>
      <span className="fixed inset-0" onClick={onClose} aria-hidden />
      <div
        data-testid="sources-link-new-modal"
        role="dialog"
        aria-modal="true"
        aria-label="สร้างลิงก์และ QR ที่มาใหม่"
        className="relative flex w-full max-w-[420px] flex-col gap-3 rounded-xl p-5"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.28)" }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>สร้างลิงก์ / QR ที่มาใหม่</h2>
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
          ลิงก์นี้พาลูกค้าไปหน้าสมัคร และบันทึกให้เองว่าคนนี้มาจากช่องทางไหน
        </p>
        <label className="flex flex-col gap-1" style={{ fontSize: 12.5 }}>
          ชื่อ
          <input
            autoFocus
            data-testid="sources-link-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="เช่น QR หน้าร้านป่าตอง"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            ช่องทาง
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            ปลายทาง
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              {TARGET_LABELS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            สาขา
            <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">ทุกสาขา</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            แคมเปญ
            <input className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="เช่น fb-oct" />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            ค่าใช้จ่าย (บาท)
            <input className="input" inputMode="decimal" value={costBaht} onChange={(e) => setCostBaht(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-1 flex-col gap-1" style={{ fontSize: 12.5 }}>
            รหัสลิงก์ (ไม่บังคับ)
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ปล่อยว่าง = สุ่มให้" />
          </label>
        </div>
        {error && (
          <p data-testid="sources-link-new-error" style={{ fontSize: 12, color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={() => void submit()} disabled={busy}>
            {busy ? "กำลังสร้าง..." : "สร้างลิงก์ + QR"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SourcesSettings;
