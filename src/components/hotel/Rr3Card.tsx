// SVC H.4 ▸ บัตรทะเบียนผู้พัก (ร.ร.3) — แบบแสดง/พิมพ์ (ช่องตาม RR3_FIELDS ของ guest.ts · แบบท้ายประกาศกระทรวงมหาดไทย · ที่ปรึกษากฎหมายตรวจก่อนใช้จริง J3)
//   เลขเอกสารแสดงเฉพาะ 4 ตัวท้าย (idMasked) · ลายเซ็น/รูปเอกสารผ่านลิงก์ /api/files ที่ผูกผู้ดูและหมดอายุใน 15 นาที
import { ID_TYPE_LABEL, SEX_LABEL, dateLongTh, dateTimeTh, nationalityText, type Rr3View } from "./checkin-shared";

type Props = { card: Rr3View; showImage?: boolean };

/** ผู้ตรวจ PDPA m3: ที่อยู่/อาชีพ/รูปบัตร เฉพาะผู้มีสิทธิ์ลงทะเบียนผู้พัก (showImage) */
const HIDDEN = "ซ่อน (ต้องมีสิทธิ์ลงทะเบียนผู้พัก)";
const ROW = "grid grid-cols-[10rem_1fr] gap-2 border-b border-[color:var(--color-line)] py-1.5 text-sm print:text-[12px]";

export default function Rr3Card({ card: c, showImage = false }: Props) {
  return (
    <article data-rr3-card={c.guestId} className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-base font-bold">บัตรทะเบียนผู้พัก (ร.ร.3)</h2>
          <p className="text-xs text-[color:var(--color-muted)]">
            {c.hotel.licenseName ?? c.hotel.name} · ใบอนุญาตเลขที่ {c.hotel.licenseNo ?? "— (ยังไม่ตั้งค่า)"}
          </p>
        </div>
        <p className="text-sm font-bold">เลขที่ {c.cardNo}</p>
      </header>
      <dl className="flex min-w-0 flex-col">
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">ห้องพักเลขที่</dt>
          <dd>{c.roomNumber ?? "—"}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">วันเวลาที่เข้าพัก</dt>
          <dd>{c.checkedInAt ? dateTimeTh(c.checkedInAt) : dateLongTh(c.checkIn)}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">วันที่ออก (กำหนด)</dt>
          <dd>{dateLongTh(c.checkOut)}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">ชื่อตัว ชื่อสกุล</dt>
          <dd className="font-bold">{c.fullName}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">สัญชาติ</dt>
          <dd>{nationalityText(c.nationality, c.nationalityTh)}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">วันเดือนปีเกิด</dt>
          <dd>{c.dob ? dateLongTh(c.dob) : "—"}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">เพศ · อาชีพ</dt>
          <dd>
            {c.sex ? (SEX_LABEL[c.sex] ?? c.sex) : "—"} · {showImage ? (c.occupation ?? "—") : HIDDEN}
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">เอกสารประจำตัว</dt>
          <dd>
            {c.idType ? (ID_TYPE_LABEL[c.idType] ?? c.idType) : "—"} {c.idMasked}
            {c.purged ? " (ข้อมูลเต็มลบตามระยะเวลาเก็บแล้ว)" : ""}
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">ที่อยู่ปัจจุบัน</dt>
          <dd>{showImage ? (c.address ?? "—") : HIDDEN}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">มาจาก → จะไปที่</dt>
          <dd>
            {c.arrivedFrom ?? "—"} → {c.nextDestination ?? "—"}
          </dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">จำนวนผู้พักร่วม</dt>
          <dd>{c.companions} คน</dd>
        </div>
        <div className={ROW}>
          <dt className="text-[color:var(--color-muted)]">ผู้บันทึก</dt>
          <dd>
            {c.recordedBy.name ?? "—"} · {dateTimeTh(c.recordedAt)}
          </dd>
        </div>
      </dl>
      <section className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-bold">ลายมือชื่อผู้พัก</h3>
        {c.signatureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.signatureUrl} alt="ลายมือชื่อผู้พัก" className="h-24 w-auto max-w-full rounded border border-[color:var(--color-line)] bg-white object-contain" />
        ) : null}
        {!c.signatureUrl && c.signedOnPaper ? <p className="text-sm">ลงชื่อบนกระดาษแล้ว {c.signedAt ? `· ${dateTimeTh(c.signedAt)}` : ""}</p> : null}
        {!c.signatureUrl && !c.signedOnPaper ? <div className="mt-6 h-0 w-64 max-w-full border-t border-[color:var(--color-ink)]" aria-label="ช่องลงชื่อ" /> : null}
        {c.signedByGuestId && c.signedByGuestId !== c.guestId ? <p className="text-xs text-[color:var(--color-muted)]">ผู้พักร่วมในห้อง — ลงชื่อแทนห้องโดยผู้พักหลัก</p> : null}
      </section>
      {showImage && c.idImageUrl ? (
        <section className="flex min-w-0 flex-col gap-1 print:hidden">
          <h3 className="text-sm font-bold">สำเนารูปเอกสาร</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.idImageUrl} alt="สำเนารูปเอกสาร" className="max-h-64 w-auto max-w-full rounded border border-[color:var(--color-line)] object-contain" />
        </section>
      ) : null}
    </article>
  );
}
