// deposit-blame.ts — POS HF-FU2 ▸ DEP-1 (มติ 5): ตัดสินว่าคำปฏิเสธมัดจำจาก submit โทษแถวไหน (บริสุทธิ์ · ไม่มี import · ไม่มีนาฬิกา/สุ่ม) ◂
//   ผู้เรียก = InterimPayDialog.tsx (บล็อก POS HF-FU2 ▸ DEP-1) · ข้อสอบ = scripts/qc-hf-fu2.mts DP1–DP3
//   • มี depositId (เซิร์ฟเวอร์บอกใบ · register.ts NOT_FOUND / LOCKED / NOT_OWNER) ⇒ เปลี่ยนเฉพาะแถวของใบนั้น:
//       NOT_FOUND / LOCKED ⇒ ถอดแถวนั้น · NOT_OWNER: มัดจำสมาชิก ⇒ ถอด · walk-in ⇒ ถามเลข 4 หลักท้ายของแถวนั้นใหม่ ("again" เมื่อชุดที่ส่งไม่มี 4 หลัก)
//   • ไม่มี depositId (D2: NOT_OWNER ใน tx ของ service.ts ไม่มีใบ — มติ 5 ยอมรับ) หรือไม่มีแถวของใบนั้นในกล่อง ⇒ กติกาเดิมของกล่อง (P2.9bU fix1/fix2) ทุกประการ

export type DepositBlameRow = {
  /** PayRow.id ของกล่อง */
  id: number;
  /** PosDeposit.id ของแถว */
  depositId: string;
  receiptNo: string | null;
  needsLast4: boolean;
  memberLinked: boolean;
  l4Checked: boolean;
};
export type DepositBlameInput = {
  code: string;
  depositId?: string | null;
  rows: DepositBlameRow[];
  /** ชุดที่ลองซ้ำส่งไปโดยไม่มี 4 หลักท้าย/PIN */
  sentStripped: boolean;
  /** ค่าปัจจุบันของ ref notOwnerSet (ชุดแถวที่โดน NOT_OWNER ครั้งก่อน) */
  notOwnerSet: string | null;
};
export type DepositBlameResult = {
  /** แถวที่ถอด (PayRow.id) */
  drop: number[];
  /** แถวที่ต้องใส่ 4 หลักท้ายใหม่ ตามลำดับเดิม (ตัวแรก = แถวที่เปิดแผง) */
  reask: number[];
  reaskNote: "wrong" | "again" | null;
  /** คีย์ข้อความใต้รายการ (depNote) · null = ล้าง */
  note: string | null;
  /** ค่าใหม่ของ ref notOwnerSet */
  notOwnerSet: string | null;
  /** true = ผู้เรียกค้นแถวมัดจำด้วยเลขใบรับ (depDropClosed) ตามเดิม */
  lookup: boolean;
};

export const DEPOSIT_NOTE_KEY = {
  DEPOSIT_NOT_FOUND: "errors.depositNotFound",
  DEPOSIT_CLOSED: "errors.depositClosed",
  DEPOSIT_NOT_OWNER: "errors.depositNotOwner",
  DEPOSIT_LOCKED: "errors.depositLocked",
  AGAIN: "errors.depositNotOwnerAgain",
} as const;

/** ชุดแถว = id เรียงน้อยไปมาก คั่นด้วย "," (เหมือน sig() เดิมของกล่อง) */
export function depositRowSig(ids: readonly number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

/** กติกาเดิมของกล่อง (InterimPayDialog.tsx:756–805 @72669941) — ใช้เมื่อคำปฏิเสธไม่บอกใบ */
function heuristicBlame(i: DepositBlameInput): DepositBlameResult {
  const base: DepositBlameResult = { drop: [], reask: [], reaskNote: null, note: null, notOwnerSet: i.notOwnerSet, lookup: false };
  if (i.code === "DEPOSIT_NOT_FOUND" || i.code === "DEPOSIT_CLOSED") return { ...base, lookup: true, note: DEPOSIT_NOTE_KEY[i.code] };
  if (i.code === "DEPOSIT_LOCKED") return { ...base, drop: i.rows.filter((r) => r.needsLast4).map((r) => r.id), note: DEPOSIT_NOTE_KEY.DEPOSIT_LOCKED };
  if (i.code !== "DEPOSIT_NOT_OWNER") return base;
  const all = i.rows;
  const allSig = depositRowSig(all.map((r) => r.id));
  const l4Rows = all.filter((r) => r.needsLast4);
  const suspects = i.sentStripped ? l4Rows : l4Rows.filter((r) => !r.l4Checked);
  const own = all.filter((r) => r.memberLinked);
  const dropRows = (ids: number[], note: string): DepositBlameResult => ({ ...base, drop: ids, note, notOwnerSet: null });
  const blameL4 = (list: DepositBlameRow[], note: "wrong" | "again"): DepositBlameResult => ({ ...base, reask: list.map((r) => r.id), reaskNote: note, note: null, notOwnerSet: allSig });
  // (fix2 G1) ชุดเดิมซ้ำ + ยังมีแถวสมาชิก ⇒ ถอดเฉพาะแถวสมาชิก · ชุดใหม่ = แถวที่เหลือ
  if (all.length && i.notOwnerSet === allSig && own.length) {
    const ids = own.map((r) => r.id);
    const left = all.filter((r) => !ids.includes(r.id)).map((r) => r.id);
    return { ...dropRows(ids, DEPOSIT_NOTE_KEY.DEPOSIT_NOT_OWNER), notOwnerSet: left.length ? depositRowSig(left) : null };
  }
  if (all.length && i.notOwnerSet === allSig) return dropRows(all.map((r) => r.id), DEPOSIT_NOTE_KEY.AGAIN);
  if (suspects.length) return blameL4(suspects, i.sentStripped ? "again" : "wrong");
  if (own.length) return dropRows(own.map((r) => r.id), DEPOSIT_NOTE_KEY.DEPOSIT_NOT_OWNER);
  if (l4Rows.length) return blameL4(l4Rows, "wrong");
  return dropRows(all.map((r) => r.id), DEPOSIT_NOTE_KEY.DEPOSIT_NOT_OWNER);
}

/** POS HF-FU2 ▸ DEP-1: คำปฏิเสธมัดจำ → แถวที่ถอด/ถามใหม่ (มี depositId = เฉพาะแถวของใบนั้น · ไม่มี = กติกาเดิม) ◂ */
export function depositBlame(input: DepositBlameInput): DepositBlameResult {
  const dep = typeof input.depositId === "string" && input.depositId ? input.depositId : null;
  const named = dep && input.code !== "DEPOSIT_CLOSED" ? input.rows.filter((r) => r.depositId === dep) : [];
  if (!named.length) return heuristicBlame(input);
  const base: DepositBlameResult = { drop: [], reask: [], reaskNote: null, note: null, notOwnerSet: input.notOwnerSet, lookup: false };
  if (input.code === "DEPOSIT_NOT_FOUND" || input.code === "DEPOSIT_LOCKED") {
    return { ...base, drop: named.map((r) => r.id), note: DEPOSIT_NOTE_KEY[input.code], notOwnerSet: null };
  }
  if (input.code !== "DEPOSIT_NOT_OWNER") return heuristicBlame(input);
  const drop = named.filter((r) => r.memberLinked).map((r) => r.id);
  const reask = named.filter((r) => !r.memberLinked).map((r) => r.id);
  return {
    ...base,
    drop,
    reask,
    reaskNote: reask.length ? (input.sentStripped ? "again" : "wrong") : null,
    note: drop.length ? DEPOSIT_NOTE_KEY.DEPOSIT_NOT_OWNER : null,
    // ชุดเปลี่ยน (ถอด) = ล้าง · ถามใหม่ = ชุดปัจจุบัน (เหมือน blameL4 เดิม — ถ้าครั้งหน้าไม่มีใบและชุดเดิมซ้ำ กติกาเดิมถอดได้)
    notOwnerSet: drop.length ? null : depositRowSig(input.rows.map((r) => r.id)),
  };
}
