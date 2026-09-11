"use client";

// ReferralMemberCard.tsx — การ์ด "แนะนำเพื่อน" ของสมาชิก 1 คน (M3.5 · ภาพ 08 ขวาล่าง · หน้า 360 ?tab=referrals)
// โค้ด (คัดลอกได้) · ปุ่มคัดลอกลิงก์แชร์ LINE · แนะนำแล้ว/สำเร็จ/แต้มที่ได้ · ต้นไม้ผู้ที่ถูกแนะนำ
// 🔴 client component เพราะมีปุ่มคัดลอก — รับข้อมูลที่หน้าโหลดมาแล้ว ชนิดจาก `referrals-shared.ts` เท่านั้น
import { useState } from "react";
import type { ReferralMemberView, ReferralStatusValue } from "@/lib/modules/member/referrals-shared";
import { MemberIcon } from "./MemberIcon";

const money = (satang: number): string => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;

function treeChip(status: ReferralStatusValue, firstPurchaseSatang: number | null): { text: string; tone: "ok" | "wait" | "bad" } {
  if (status === "CONVERTED" || status === "REWARDED") {
    return { text: firstPurchaseSatang !== null ? `สำเร็จ · ${money(firstPurchaseSatang)}` : "สำเร็จ", tone: "ok" };
  }
  if (status === "REJECTED") return { text: "ถูกปฏิเสธ", tone: "bad" };
  return { text: firstPurchaseSatang !== null ? "รอเงื่อนไข" : "รอซื้อครั้งแรก", tone: "wait" };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ReferralMemberCard({ data }: { data: ReferralMemberView }) {
  const [copied, setCopied] = useState<"" | "code" | "link" | "fail">("");
  const flash = (k: "code" | "link" | "fail") => {
    setCopied(k);
    setTimeout(() => setCopied(""), 1800);
  };
  const stats: { label: string; value: string }[] = [
    { label: "แนะนำแล้ว", value: data.referred.toLocaleString("th-TH") },
    { label: "สำเร็จ", value: data.converted.toLocaleString("th-TH") },
    { label: "แต้มที่ได้", value: data.pointsEarned.toLocaleString("th-TH") },
  ];
  return (
    <section data-testid="member-referral-card" className="card flex min-w-0 flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <MemberIcon name="users" size="sm" /> แนะนำเพื่อน
      </h2>

      <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
        <b data-testid="member-referral-code" className="min-w-0 flex-1 truncate tracking-wide">
          {data.code}
        </b>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          aria-label="คัดลอกโค้ดแนะนำ"
          onClick={async () => flash((await copyText(data.code)) ? "code" : "fail")}
        >
          <MemberIcon name="doc" size="sm" />
          {copied === "code" ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>

      <button
        type="button"
        data-testid="member-referral-share"
        className="btn btn-ghost flex w-full items-center justify-center gap-2 text-sm"
        onClick={async () => flash((await copyText(data.shareText)) ? "link" : "fail")}
      >
        <MemberIcon name="chat" size="sm" />
        {copied === "link" ? "คัดลอกข้อความแชร์แล้ว" : "คัดลอกลิงก์แชร์ LINE"}
      </button>
      {copied === "fail" && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>
          เบราว์เซอร์นี้ยังคัดลอกอัตโนมัติไม่ได้ — กดค้างที่ลิงก์ {data.link} เพื่อคัดลอกเอง
        </span>
      )}

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5" style={{ borderColor: "var(--color-line)" }}>
            <span className="text-lg font-semibold">{s.value}</span>
            <span className="truncate text-xs" style={{ color: "var(--color-muted)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div data-testid="member-referral-tree" className="flex flex-col">
        {data.tree.length === 0 ? (
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ยังไม่มีเพื่อนสมัครด้วยโค้ดนี้ — แชร์ลิงก์ให้เพื่อนได้เลย
          </span>
        ) : (
          data.tree.map((t) => {
            const chip = treeChip(t.status, t.firstPurchaseSatang);
            const color = chip.tone === "ok" ? "var(--color-tag-green)" : chip.tone === "bad" ? "var(--color-danger)" : "var(--color-muted)";
            return (
              <div key={t.refereeId} className="flex min-w-0 items-center gap-2 border-t py-2" style={{ borderColor: "var(--color-line)" }}>
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  {t.name.trim().slice(0, 1) || "?"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                <span className="shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs" style={{ color, borderColor: "var(--color-line)" }}>
                  {chip.text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/** เนื้อหาแท็บ "แนะนำเพื่อน" ของหน้า 360 (ส่งเข้า `Member360View` ผ่านช่อง `tabPanel`) */
export function ReferralMemberTab({ data }: { data: ReferralMemberView | null }) {
  return (
    <div data-testid="member-referrals-tab" className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,440px)]">
      {data ? (
        <ReferralMemberCard data={data} />
      ) : (
        <div className="card p-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>
          ยังดูข้อมูลแนะนำเพื่อนของสมาชิกคนนี้ไม่ได้ตอนนี้ (สมาชิกอยู่นอกสาขาที่คุณดูแล) — ดูได้จากหน้ารวม “แนะนำเพื่อน”
        </div>
      )}
    </div>
  );
}

export default ReferralMemberCard;
