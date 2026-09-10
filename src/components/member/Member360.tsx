// Member360.tsx — หน้าสมาชิก 360: หัว+ปุ่ม 5 · ตัวเลข 6 · แท็บ 5 · ส่วนตามเลย์เอาต์ · แถบขวา (M1.5 · ภาพ 02)
import Link from "next/link";
import { StatusChip } from "@/components/ui/StatusChip";
import { TierChip } from "./TierChip";
import type { Member360 } from "@/lib/modules/member";

const TABS: { key: string; label: string }[] = [
  { key: "profile", label: "โปรไฟล์" },
  { key: "wallet", label: "กระเป๋าสิทธิ์" },
  { key: "history", label: "ประวัติ" },
  { key: "reviews", label: "รีวิว" },
  { key: "referrals", label: "แนะนำเพื่อน" },
];

function thaiBaht(satang: number): string {
  return (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

function thaiDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function Member360View({ systemId, member, tab, basePath }: { systemId: string; member: Member360; tab: string; basePath: string }) {
  void systemId;
  const activeTab = TABS.some((t) => t.key === tab) ? tab : "profile";
  const tabHref = (key: string) => `${basePath}?tab=${key}`;

  return (
    <div data-testid="member-360" className="flex flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Header member={member} />
        <Stats member={member} />
        <div data-testid="member-360-tabs" className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              data-testid={`member-360-tab-${t.key}`}
              className="whitespace-nowrap rounded-t-lg px-3 py-2 text-sm"
              style={
                t.key === activeTab
                  ? { borderBottom: "2px solid var(--color-accent)", fontWeight: 600, color: "var(--color-accent)" }
                  : { color: "var(--color-muted)" }
              }
            >
              {t.label}
            </Link>
          ))}
        </div>
        {activeTab === "profile" ? <Sections member={member} /> : <ComingSoon tab={activeTab} />}
      </div>
      <Sidebar member={member} />
    </div>
  );
}

function Header({ member }: { member: Member360 }) {
  const p = member.profile;
  const initial = (p.nickname ?? p.name ?? "?").trim().slice(0, 1) || "?";
  return (
    <div data-testid="member-360-header" className="card flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="flex items-start gap-3">
        <div
          className="grid shrink-0 place-items-center rounded-full text-lg font-semibold"
          style={{ width: 52, height: 52, background: "var(--color-surface-2)", color: "var(--color-ink)" }}
        >
          {initial}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{p.name}</span>
            {p.tier && <TierChip name={p.tier.name} color={p.tier.color} />}
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{p.memberCode}</span>
          </div>
          {p.tags.length > 0 && <div className="flex flex-wrap gap-1">{p.tags.map((t) => <StatusChip key={t} value={t} />)}</div>}
          <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
            สมาชิกตั้งแต่ {thaiDate(p.createdAt)}
            {p.owner ? ` · ผู้ดูแล: ${p.owner.name}` : ""}
            {p.homeUnit ? ` · สาขา${p.homeUnit.name}` : ""}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost text-sm" disabled title="แก้ไขข้อมูลสมาชิก — เร็ว ๆ นี้ (M1.6)">
          แก้ไข
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ให้แต้ม — เร็ว ๆ นี้ (M2.2)">
          ให้แต้ม
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ออก voucher — เร็ว ๆ นี้ (M2.5)">
          ออก voucher
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="ส่งข้อความ — เร็ว ๆ นี้ (M3.2)">
          ส่งข้อความ
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled title="เพิ่มเติม — เร็ว ๆ นี้">
          เพิ่มเติม
        </button>
      </div>
    </div>
  );
}

function Stats({ member }: { member: Member360 }) {
  const s = member.stats;
  const items: { label: string; value: string }[] = [
    { label: "ยอดสะสม 12 เดือน", value: `฿${thaiBaht(s.spent12mSatang)}` },
    { label: "จำนวนครั้ง", value: s.visits12m.toLocaleString("th-TH") },
    { label: "แต้มคงเหลือ", value: s.points.toLocaleString("th-TH") },
    { label: "voucher", value: s.vouchers.toLocaleString("th-TH") },
    { label: "สแตมป์", value: "—" },
    { label: "รีวิวเฉลี่ย", value: s.reviewAvg === null ? "—" : s.reviewAvg.toFixed(1) },
  ];
  return (
    <div data-testid="member-360-stats" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-0.5">
          <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{it.label}</span>
          <span className="text-lg font-semibold">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function ComingSoon({ tab }: { tab: string }) {
  const label = TABS.find((t) => t.key === tab)?.label ?? tab;
  return (
    <div className="card p-8 text-center" style={{ color: "var(--color-muted)" }}>
      แท็บ &quot;{label}&quot; เร็ว ๆ นี้ — อยู่ระหว่างพัฒนาในใบงานถัดไป
    </div>
  );
}

function Sections({ member }: { member: Member360 }) {
  const cols = member.sections;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      {cols.map((sec) =>
        sec.visible ? (
          <div key={sec.id} data-testid={`member-360-section-${sec.key}`} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{sec.label}</span>
              {sec.sensitive && <StatusChip value="sensitive" map={{ sensitive: "ข้อมูลอ่อนไหว" }} tone="danger" />}
            </div>
            {sec.fields.length === 0 ? (
              <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีข้อมูล</span>
            ) : (
              <dl className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: sec.columns >= 2 ? "1fr 1fr" : "1fr" }}>
                {sec.fields.map((f) => (
                  <div key={f.key} className="flex flex-col">
                    <dt style={{ fontSize: 11, color: "var(--color-muted)" }}>{f.label}</dt>
                    <dd style={{ fontSize: 13.5 }}>{f.display || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <div key={sec.id} data-testid="member-360-section-hidden" className="card flex flex-col gap-1 p-4" style={{ opacity: 0.75 }}>
            <span className="font-semibold">{sec.label}</span>
            <StatusChip value="hidden" map={{ hidden: "ซ่อน — ข้อมูลอ่อนไหว เห็นเฉพาะผู้มีสิทธิ์" }} tone="muted" />
          </div>
        ),
      )}
    </div>
  );
}

/** "อีก ฿1,400" / "อีก 3 ครั้ง" ฯลฯ — ตามหน่วยของฟิลด์ที่ progressToNext ใช้ตัดสิน (spent12m = สตางค์) */
function progressHintOf(p: { field: string; current: number; target: number }): string {
  const shortfall = Math.max(0, p.target - p.current);
  if (p.field === "spent12m" || p.field === "spent") {
    return `฿${Math.round(shortfall / 100).toLocaleString("th-TH")}`;
  }
  const UNIT: Record<string, string> = { visits12m: "ครั้ง", visits: "ครั้ง", tierPoints: "แต้ม", memberDays: "วัน", referrals: "คน" };
  return `${Math.round(shortfall).toLocaleString("th-TH")} ${UNIT[p.field] ?? ""}`.trim();
}

function Sidebar({ member }: { member: Member360 }) {
  const c = member.connections;
  const next = member.tier.next;
  const progress = member.tier.progressToNext;
  return (
    <div className="flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0" data-testid="member-360-side">
      <div className="card flex flex-col gap-2 p-4">
        <span className="font-semibold">ผู้ช่วย AI</span>
        <button type="button" className="btn btn-ghost text-left text-sm" disabled title="เร็ว ๆ นี้ — M1.11">
          สรุปลูกค้าคนนี้
        </button>
        <button type="button" className="btn btn-ghost text-left text-sm" disabled title="เร็ว ๆ นี้ — M1.11">
          แนะนำ voucher ที่ควรให้
        </button>
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <span className="font-semibold">การเชื่อมต่อ</span>
        <SideRow label="แชท" value={c.chat} />
        <SideRow label="เอกสารบัญชี" value={c.account} />
        <SideRow label="งานในบอร์ดงาน" value={c.kanbanCards} />
        <SideRow label="ดีล CRM" value={c.crm} />
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <span className="font-semibold">ช่องทางที่ผูก ({member.identities.length})</span>
        {member.identities.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่ได้ผูกช่องทางใด</span>
        ) : (
          member.identities.map((i) => (
            <div key={i.id} className="flex flex-col">
              <span style={{ fontSize: 13 }}>
                {i.channelLabel} — {i.displayName ?? i.externalId}
              </span>
              <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{i.verified ? "ยืนยันแล้ว" : "ยังไม่ยืนยัน"}</span>
            </div>
          ))
        )}
      </div>

      <div className="card flex flex-col gap-2 p-4">
        <span className="font-semibold">ความยินยอม (PDPA)</span>
        {member.consents.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ยังไม่มีข้อมูลความยินยอม</span>
        ) : (
          member.consents.map((c2) => (
            <div key={c2.channel} className="flex items-center justify-between">
              <span style={{ fontSize: 13 }}>{c2.channelLabel}</span>
              <StatusChip value={c2.granted ? "granted" : "revoked"} map={{ granted: "ยินยอม", revoked: "ปฏิเสธ" }} tone={c2.granted ? "strong" : "muted"} />
            </div>
          ))
        )}
      </div>

      <div data-testid="member-360-next-tier" className="card flex flex-col gap-2 p-4">
        <span className="font-semibold">ระดับถัดไป</span>
        {next && progress ? (
          <>
            <span style={{ fontSize: 13 }}>
              อีก <b>{progressHintOf(progress)}</b> → {next.name}
            </span>
            <div style={{ height: 6, borderRadius: 999, background: "var(--color-surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress.pct}%`, background: "var(--color-accent)", borderRadius: 999 }} />
            </div>
          </>
        ) : next ? (
          <span style={{ fontSize: 13 }}>อีกไม่กี่ขั้นถึง {next.name}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--color-muted)" }}>ระดับสูงสุดแล้ว</span>
        )}
      </div>
    </div>
  );
}

function SideRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default Member360View;
