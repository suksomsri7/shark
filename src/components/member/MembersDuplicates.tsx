// MembersDuplicates.tsx — ตัวซ้ำ/เปรียบเทียบ/รวมคน 2 ขั้น (M1.6 · ภาพ 11 · ตีกลับรอบ 1)
// testid: members-dup-list members-dup-pair-{id} members-dup-compare members-dup-choice-{key}
//         members-dup-merge members-dup-confirm members-dup-dismiss
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TierChip } from "./TierChip";
import type { DuplicatePairDto, Member360 } from "@/lib/modules/member/profile";
import { compareMembersAction, dismissDuplicateAction, findDuplicatesAction, mergeMembersAction } from "@/lib/modules/member/duplicates-actions";

type CompareRow = { key: string; label: string; targetKeys: string[]; a: string; b: string };

function rowsOf(a: Member360, b: Member360): CompareRow[] {
  const dateOf = (d: Date | null) => (d ? new Date(d).toLocaleDateString("th-TH") : "—");
  return [
    { key: "name", label: "ชื่อ-นามสกุล", targetKeys: ["firstName", "lastName"], a: a.profile.name || "—", b: b.profile.name || "—" },
    { key: "phone", label: "มือถือ", targetKeys: ["phone"], a: a.profile.phone ?? "—", b: b.profile.phone ?? "—" },
    { key: "email", label: "อีเมล", targetKeys: ["email"], a: a.profile.email ?? "—", b: b.profile.email ?? "—" },
    { key: "birthDate", label: "วันเกิด", targetKeys: ["birthDate"], a: dateOf(a.profile.birthDate), b: dateOf(b.profile.birthDate) },
    { key: "tags", label: "แท็ก", targetKeys: ["tags"], a: a.profile.tags.join(", ") || "—", b: b.profile.tags.join(", ") || "—" },
    { key: "source", label: "ที่มา", targetKeys: ["source"], a: a.profile.source ?? "—", b: b.profile.source ?? "—" },
  ];
}

function reasonLabel(reason: string, score: number): string {
  if (reason === "PHONE") return "เบอร์เดียวกัน";
  if (reason === "EMAIL") return "อีเมลเดียวกัน";
  if (reason === "TAX_ID") return "เลขผู้เสียภาษีเดียวกัน";
  return `ชื่อคล้าย ${Math.round(score * 100)}%`;
}

function briefLine(m: DuplicatePairDto["a"]): string {
  return `${m.tier?.name ?? "ไม่มีระดับ"} · ${m.points.toLocaleString("th-TH")} แต้ม`;
}

export function MembersDuplicates({
  systemId,
  pairs,
  canMerge,
  actorRole,
}: {
  systemId: string;
  pairs: DuplicatePairDto[];
  canMerge: boolean;
  /** ใช้ตัดสินข้อความสถานะ "ต้องอนุมัติก่อนรวม" (OWNER รวมได้ทันทีเสมอ · MANAGER เดินสายอนุมัติ — ดู `profile.ts#mergeMembers`) */
  actorRole: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rowsData, setRowsData] = useState(pairs);
  const [activePair, setActivePair] = useState<DuplicatePairDto | null>(null);
  const [compareA, setCompareA] = useState<Member360 | null>(null);
  const [compareB, setCompareB] = useState<Member360 | null>(null);
  const [choices, setChoices] = useState<Record<string, "A" | "B">>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const rescan = () => {
    setScanning(true);
    startTransition(async () => {
      const res = await findDuplicatesAction({ systemId });
      setScanning(false);
      if (res.ok) setRowsData(res.data);
      else setMessage(res.reason);
    });
  };

  const openCompare = (pair: DuplicatePairDto) => {
    setActivePair(pair);
    setCompareA(null);
    setCompareB(null);
    setChoices({});
    setMessage(null);
    setBusy(true);
    startTransition(async () => {
      const res = await compareMembersAction({ systemId, aId: pair.a.id, bId: pair.b.id });
      setBusy(false);
      if (res.ok) {
        setCompareA(res.data.a);
        setCompareB(res.data.b);
      } else {
        setMessage(res.reason);
      }
    });
  };

  const chooseSide = (row: CompareRow, side: "A" | "B") => {
    setChoices((prev) => {
      const next = { ...prev };
      for (const k of row.targetKeys) {
        if (side === "A") delete next[k];
        else next[k] = "B";
      }
      return next;
    });
  };
  const sideOf = (row: CompareRow): "A" | "B" => (row.targetKeys.some((k) => choices[k] === "B") ? "B" : "A");

  const dismiss = (pairId: string) => {
    setBusy(true);
    startTransition(async () => {
      const res = await dismissDuplicateAction({ systemId, pairId });
      setBusy(false);
      if (!res.ok) {
        setMessage(res.reason);
        return;
      }
      setRowsData((prev) => prev.filter((p) => p.id !== pairId));
      setActivePair(null);
      router.refresh();
    });
  };

  const doMerge = () => {
    if (!activePair || confirmText !== "MERGE") return;
    setBusy(true);
    startTransition(async () => {
      const res = await mergeMembersAction({
        systemId,
        keepId: activePair.a.id,
        mergeId: activePair.b.id,
        fieldChoices: choices,
        confirm: "MERGE",
      });
      setBusy(false);
      if (!res.ok) {
        setMessage(res.reason);
        return;
      }
      if ("pending" in res.data && res.data.pending) {
        setConfirmOpen(false);
        setConfirmText("");
        setMessage("รออนุมัติ — ส่งคำขอรวมสมาชิกให้ผู้จัดการ/เจ้าของอนุมัติแล้ว");
        return;
      }
      setConfirmOpen(false);
      setConfirmText("");
      setRowsData((prev) => prev.filter((p) => p.id !== activePair.id));
      setActivePair(null);
      router.refresh();
    });
  };

  const rows = compareA && compareB ? rowsOf(compareA, compareB) : [];
  const approvalStatus = actorRole === "OWNER" ? "รวมได้ทันที (คุณเป็นเจ้าของร้าน)" : "ต้องอนุมัติก่อนรวม (ตามนโยบายอนุมัติ)";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_560px]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            พบจากเบอร์/อีเมล/ชื่อคล้ายกันเกิน 90% — เรียงตามล่าสุดก่อน
          </p>
          <button type="button" className="btn btn-ghost text-sm" onClick={rescan} disabled={scanning}>
            {scanning ? "กำลังสแกน…" : "สแกนหาตัวซ้ำใหม่"}
          </button>
        </div>
        {rowsData.length === 0 ? (
          <div className="card p-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            ไม่มีตัวซ้ำที่ต้องตรวจตอนนี้
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
            <table data-testid="members-dup-list" className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>
                    คู่ที่อาจเป็นคนเดียวกัน
                  </th>
                  <th className="border-b px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>
                    เหตุผล
                  </th>
                  <th className="border-b px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>
                    ข้อมูลย่อ
                  </th>
                  <th className="border-b px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rowsData.map((p) => {
                  const selected = activePair?.id === p.id;
                  return (
                    <tr key={p.id}>
                      <td className="border-b px-3 py-2">
                        <span className="font-semibold">{p.a.name}</span> ↔ <span className="font-semibold">{p.b.name}</span>
                      </td>
                      <td className="border-b px-3 py-2">
                        <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--color-line)" }}>
                          {reasonLabel(p.reason, p.score)}
                        </span>
                      </td>
                      <td className="border-b px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                        {briefLine(p.a)} ↔ {briefLine(p.b)}
                      </td>
                      <td className="border-b px-3 py-2 text-right">
                        <button
                          type="button"
                          data-testid={`members-dup-pair-${p.id}`}
                          className="btn btn-ghost text-sm"
                          style={selected ? { borderColor: "var(--color-accent)", color: "var(--color-accent)" } : undefined}
                          onClick={() => openCompare(p)}
                        >
                          เปรียบเทียบ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t px-3 py-2 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
              แสดง {rowsData.length} จาก {rowsData.length} คู่
            </p>
          </div>
        )}
      </div>

      {activePair && (
        <div data-testid="members-dup-compare" className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">เปรียบเทียบ — เลือกค่าที่จะเก็บ</h3>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setActivePair(null)}>
              ปิด
            </button>
          </div>
          {busy && !compareA && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              กำลังโหลด…
            </p>
          )}
          {compareA && compareB && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">{compareA.profile.name}</div>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
                    <span>{compareA.profile.memberCode}</span>
                    {compareA.tier.current && <TierChip name={compareA.tier.current.name} color={compareA.tier.current.color} />}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {compareA.stats.points.toLocaleString("th-TH")} แต้ม · มา {compareA.stats.visitCount.toLocaleString("th-TH")} ครั้ง
                  </div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="font-semibold">{compareB.profile.name}</div>
                  <div className="flex items-center justify-end gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
                    {compareB.tier.current && <TierChip name={compareB.tier.current.name} color={compareB.tier.current.color} />}
                    <span>{compareB.profile.memberCode}</span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {compareB.stats.points.toLocaleString("th-TH")} แต้ม · มา {compareB.stats.visitCount.toLocaleString("th-TH")} ครั้ง
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                {rows.map((r) => (
                  <div
                    key={r.key}
                    data-testid={`members-dup-choice-${r.key}`}
                    className="grid grid-cols-[96px_1fr_1fr] items-center gap-2 border-t py-2 text-sm first:border-t-0"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {r.label}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`choice-${r.key}`} checked={sideOf(r) === "A"} onChange={() => chooseSide(r, "A")} />
                      <span>{r.a}</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`choice-${r.key}`} checked={sideOf(r) === "B"} onChange={() => chooseSide(r, "B")} />
                      <span>{r.b}</span>
                    </label>
                  </div>
                ))}
              </div>

              <div
                className="rounded-lg border p-3 text-xs"
                style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent)", color: "var(--color-ink)" }}
              >
                <p>
                  ผลการรวม (ประมาณ): แต้มรวม {(compareA.stats.points + compareB.stats.points).toLocaleString("th-TH")} · ห้องแชทที่ผูกอยู่{" "}
                  {compareA.connections.chat + compareB.connections.chat}
                </p>
                <p>
                  ระดับหลังรวม: {compareA.tier.current?.name ?? "ไม่มีระดับ"} (ของ {compareA.profile.name})
                </p>
                <p>เขียนรายการโอนลง ledger ไม่แก้ย้อนแถวเดิม</p>
              </div>

              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                สถานะ: {approvalStatus}
              </p>

              {message && (
                <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                  {message}
                </p>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <button type="button" data-testid="members-dup-dismiss" className="btn btn-ghost text-sm" onClick={() => dismiss(activePair.id)} disabled={busy}>
                  ไม่ใช่คนเดียวกัน
                </button>
                {canMerge && (
                  <button
                    type="button"
                    data-testid="members-dup-merge"
                    className="btn btn-primary text-sm"
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy}
                  >
                    รวมเป็นคนเดียว
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirmOpen && activePair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmOpen(false)}>
          <div
            data-testid="members-dup-confirm"
            className="w-full max-w-sm rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">รวมสมาชิก 2 คนเป็นคนเดียว</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
              ย้อนกลับไม่ได้ — แต้ม/ประวัติ/ตัวตนของ &quot;{activePair.b.name}&quot; จะย้ายไปรวมกับ &quot;{activePair.a.name}&quot; ทั้งหมด
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
              พิมพ์ &quot;MERGE&quot; เพื่อยืนยัน
              <input className="rounded-lg border px-3 py-2 text-sm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setConfirmOpen(false)}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary text-sm" onClick={doMerge} disabled={confirmText !== "MERGE" || busy}>
                ยืนยันรวม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MembersDuplicates;
