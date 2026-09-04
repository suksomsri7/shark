"use client";

// PayLinkButton — WO 5.5 · §0.3 ข้อ 5 / §5.3 ปุ่ม "ส่ง"
// ปุ่มรองบนหัวหน้าเอกสาร: "ลิงก์ชำระเงิน" → โมดัลแสดง QR พร้อมเพย์ + ลิงก์ + วันหมดอายุ + สถานะ
// ภาษาภาพตามโมดัลกลางของ V2 (g5/g8): หัวตัวหนา + ✕ · เนื้อในเป็นการ์ดขอบบาง · ปุ่มดำอยู่แถบล่าง
//
// มีคำขอที่ยังรอชำระอยู่แล้ว → เปิดมาเห็น QR เลย (ไม่ต้องกดสร้างซ้ำ)
// ยังไม่มี → เลือกช่องทางรับเงิน + อายุลิงก์ แล้วกด "สร้างลิงก์"

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { PromptPayQr } from "@/components/PromptPayQr";
import { formatBaht } from "@/lib/ui/money";
import {
  createPaymentRequestAction,
  listReceiveChannelsAction,
} from "@/lib/modules/account/payment-actions";
import type { PaymentRequestView } from "@/lib/modules/account/payment-request";

/** รูปที่ปลอดภัยสำหรับ client (Date → ISO string ตอนส่งข้ามขอบ server/client) */
export type PayLinkView = {
  id: string;
  url: string;
  amountSatang: number;
  method: PaymentRequestView["method"];
  status: PaymentRequestView["status"];
  statusLabel: string;
  qrPayload: string | null;
  providerUrl: string | null;
  financeName: string | null;
  expiresAtText: string;
  note: string | null;
};

const EXPIRY_OPTIONS = [
  { days: 3, label: "3 วัน" },
  { days: 7, label: "7 วัน" },
  { days: 15, label: "15 วัน" },
  { days: 30, label: "30 วัน" },
];

export function PayLinkButton({
  systemId,
  docId,
  docNo,
  disabled,
  disabledHint,
  current,
}: {
  systemId: string;
  docId: string;
  docNo: string | null;
  disabled?: boolean;
  /** เหตุผลไทยเมื่อกดไม่ได้ (ห้ามซ่อนปุ่มเฉย ๆ — ผู้ใช้ต้องรู้ว่าทำไม) */
  disabledHint?: string;
  /** คำขอที่ยังรอชำระของเอกสารนี้ (ถ้ามี) — เปิดโมดัลมาเห็น QR ทันที */
  current: PayLinkView | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PayLinkView | null>(current);
  const [channels, setChannels] = useState<{ id: string; name: string; hasPromptPay: boolean }[] | null>(null);
  const [financeId, setFinanceId] = useState("");
  const [days, setDays] = useState(7);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => setView(current), [current]);

  // โหลดช่องทางรับเงินตอนเปิดโมดัลครั้งแรก (ยังไม่มีคำขอ) — ไม่ดึงตั้งแต่ render หน้าเอกสาร
  useEffect(() => {
    if (!open || view || channels) return;
    let alive = true;
    listReceiveChannelsAction(systemId)
      .then((rows) => {
        if (!alive) return;
        setChannels(rows);
        setFinanceId(rows.find((r) => r.hasPromptPay)?.id ?? rows[0]?.id ?? "");
      })
      .catch(() => alive && setChannels([]));
    return () => {
      alive = false;
    };
  }, [open, view, channels, systemId]);

  if (disabled) {
    return (
      <button type="button" className="btn btn-ghost text-sm" disabled title={disabledHint ?? "เร็ว ๆ นี้"} data-testid="btn-pay-link">
        ลิงก์ชำระเงิน
      </button>
    );
  }

  const create = () => {
    setErr("");
    start(async () => {
      const res = await createPaymentRequestAction(systemId, docId, financeId, days);
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      setView({
        id: res.request.id,
        url: res.request.url,
        amountSatang: res.request.amountSatang,
        method: res.request.method,
        status: res.request.status,
        statusLabel: res.request.statusLabel,
        qrPayload: res.request.qrPayload,
        providerUrl: res.request.providerUrl,
        financeName: res.request.financeName,
        expiresAtText: new Date(res.request.expiresAt).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        }),
        note: res.request.note,
      });
      router.refresh();
    });
  };

  const copy = async () => {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="btn-pay-link">
        ลิงก์ชำระเงิน
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        sheetOnMobile
        testId="pay-link-modal"
        title="ลิงก์ชำระเงิน / QR พร้อมเพย์"
        actions={
          view ? (
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
              ปิด
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={create}
                disabled={pending || !financeId}
                data-testid="pay-link-create"
              >
                {pending ? "กำลังสร้าง…" : "สร้างลิงก์"}
              </button>
            </>
          )
        }
      >
        {err && (
          <p className="mb-3 text-sm text-[color:var(--color-danger)]" data-testid="pay-link-err">
            {err}
          </p>
        )}

        {view ? (
          <div className="flex flex-col items-center gap-4" data-testid="pay-link-ready">
            <div className="text-center">
              <div className="text-xs text-[color:var(--color-muted)]">ยอดที่ต้องชำระ · {docNo ?? "(ร่าง)"}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="pay-link-amount">
                {formatBaht(view.amountSatang, { decimals: true })}
              </div>
            </div>

            {view.qrPayload ? (
              <div data-testid="pay-link-qr">
                <PromptPayQr payload={view.qrPayload} size={200} caption={view.financeName ?? undefined} />
              </div>
            ) : view.providerUrl ? (
              <a
                href={view.providerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary text-sm"
                data-testid="pay-link-provider"
              >
                เปิดหน้าชำระเงินของผู้ให้บริการ
              </a>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">คำขอนี้ปิดแล้ว — สร้างใหม่ได้จากปุ่มนี้อีกครั้ง</p>
            )}

            <div className="w-full rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
              <div className="text-xs text-[color:var(--color-muted)]">ลิงก์สำหรับส่งให้ลูกค้า</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate text-xs" data-testid="pay-link-url">
                  {view.url}
                </code>
                <button type="button" className="btn btn-ghost text-xs" onClick={copy} data-testid="pay-link-copy">
                  {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </div>
            </div>

            <dl className="w-full text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-[color:var(--color-muted)]">สถานะ</dt>
                <dd className="font-medium" data-testid="pay-link-status">
                  {view.statusLabel}
                </dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-[color:var(--color-muted)]">เงินเข้าที่</dt>
                <dd>{view.financeName ?? "—"}</dd>
              </div>
              <div className="flex justify-between py-1">
                <dt className="text-[color:var(--color-muted)]">ใช้ได้ถึง</dt>
                <dd data-testid="pay-link-expires">{view.expiresAtText}</dd>
              </div>
            </dl>

            {view.note && <p className="text-xs text-[color:var(--color-muted)]">{view.note}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[color:var(--color-muted)]">
              สร้างลิงก์+QR พร้อมเพย์ให้ลูกค้าจ่ายเอง — ลูกค้าจ่ายแล้วระบบบันทึกรับชำระและกระทบยอดให้อัตโนมัติ
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">เงินเข้าที่ช่องทาง</span>
              <select
                className="input"
                value={financeId}
                onChange={(e) => setFinanceId(e.target.value)}
                data-testid="pay-link-finance"
              >
                {(channels ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.hasPromptPay ? "" : " (ยังไม่ได้กรอกพร้อมเพย์)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">ลิงก์ใช้ได้นาน</span>
              <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="pay-link-days">
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {channels?.length === 0 && (
              <p className="text-[color:var(--color-danger)]">ยังไม่มีช่องทางที่ตั้งไว้ว่าใช้รับเงิน — เพิ่มที่หน้า “การเงิน” ก่อน</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export default PayLinkButton;
