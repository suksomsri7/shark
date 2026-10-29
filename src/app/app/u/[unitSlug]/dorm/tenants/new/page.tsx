import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { getLease, leaseAccess } from "@/lib/modules/dorm";
import { roomBoard } from "@/lib/modules/rooms";
import TenantSearch from "@/components/dorm/TenantSearch";
import {
  addLeaseFilesFormAction,
  cancelLeaseFormAction,
  createLeaseFormAction,
  findTenantCandidatesAction,
  moveInFormAction,
  receiveBookingFeeFormAction,
  signLeaseFormAction,
} from "../actions";

// SVC D.5 ▸ ทำสัญญาใหม่ (ไม่มีภาพแบบ) — หาผู้เช่าซ้ำ → สัญญา → รับเงินจอง → รูป/บัตร → ลงชื่อ → เข้าอยู่
//   ด่าน: requireUnit · หน่วย "DORM" · leaseAccess(...).manage ไม่ผ่าน ⇒ 404 · ข้อมูล/การเขียนผ่าน facade `@/lib/modules/dorm` (action ของหน้า)
//   ฟอร์ม HTML ล้วน (ไม่พึ่ง JS ฝั่งเครื่อง) — แต่ละขั้น redirect กลับมาที่หน้านี้พร้อม ?lease=<id> และผล (done/err)
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const STEP_DONE: Record<string, string> = {
  create: "ทำสัญญาร่างแล้ว — ห้องถูกกันไว้ให้ผู้เช่ารายนี้",
  booking: "รับเงินจองแล้ว (หักเข้าเงินประกันวันเข้าอยู่)",
  files: "แนบไฟล์แล้ว",
  sign: "ลงชื่อสัญญาแล้ว",
  movein: "เข้าอยู่แล้ว — รับเงินประกันครบ",
  cancel: "ยกเลิกสัญญาแล้ว — ห้องว่างให้ทำสัญญาใหม่",
};
const baht = (s: number) => `฿${Math.floor(s / 100).toLocaleString("en-US")}${s % 100 ? `.${String(s % 100).padStart(2, "0")}` : ""}`;
const field = "min-h-11 w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const btn = "min-h-11 rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)]";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5";

export default async function DormNewLeasePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!leaseAccess(membership, unit.id).manage) notFound();

  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const leaseId = one(sp.lease);
  const lease = leaseId ? await getLease(ctx, { unitId: unit.id, leaseId }) : null;
  const done = one(sp.done);
  const err = one(sp.err);
  const msg = one(sp.msg);
  const rooms = lease ? [] : (await roomBoard({ tenantId: auth.active.tenantId }, { unitId: unit.id, date: bkkYmd(new Date()) })).filter((c) => c.rentMode !== "NIGHTLY");
  const base = `/app/u/${unitSlug}/dorm/tenants`;

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <a href={base} className="text-xs text-[color:var(--color-muted)]">{`← ผู้เช่าและสัญญา · ${unit.name}`}</a>
        <h1 className="text-2xl font-bold">{lease ? `สัญญาห้อง ${lease.roomNumber} · ${lease.tenantName}` : "ทำสัญญาใหม่"}</h1>
      </header>
      {done && STEP_DONE[done] ? <p className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-3 text-sm">{STEP_DONE[done]}</p> : null}
      {err ? <p className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">{msg || "ทำรายการไม่สำเร็จ"}</p> : null}

      {!lease ? (
        <>
          <section className={card}>
            <h2 className="font-semibold">1. หาผู้เช่าเดิม (กันข้อมูลซ้ำ)</h2>
            {/* K4: ค้นด้วย POST (server action) — เบอร์/เลขบัตรไม่ขึ้น URL */}
            <TenantSearch search={findTenantCandidatesAction.bind(null, unitSlug)} formId="create-lease-form" />
          </section>

          <form id="create-lease-form" action={createLeaseFormAction.bind(null, unitSlug)} className={card}>
            <h2 className="font-semibold">2. สัญญา</h2>
            <label className="flex flex-col gap-1 text-sm">
              ห้อง
              <select name="roomId" required className={field}>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>{`${r.number}${r.use === "VACANT" ? "" : " (มีการใช้ห้องอยู่ — ตรวจช่วงวัน)"}`}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <input name="name" placeholder="ชื่อ–สกุลผู้เช่า" className={field} />
              <input name="phone" placeholder="เบอร์โทร" className={field} />
              <input name="idCardNo" placeholder="เลขบัตรประชาชน (ถ้ามี)" inputMode="numeric" autoComplete="off" className={field} />
              <input name="email" type="email" placeholder="อีเมล (ถ้ามี)" className={field} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                วันเริ่มสัญญา
                <input name="startDate" type="date" required defaultValue={bkkYmd(new Date())} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ระยะ (เดือน)
                <input name="months" type="number" min={1} max={360} required defaultValue={12} className={field} />
              </label>
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">เว้นว่าง = ใช้ค่าตั้งของหอ (ค่าห้องตามประเภทห้อง · เงินประกัน/ล่วงหน้า/เงินจองตามจำนวนเดือนที่ตั้ง)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="rentBaht" inputMode="decimal" placeholder="ค่าห้อง/เดือน (บาท)" className={field} />
              <input name="commonFeeBaht" inputMode="decimal" placeholder="ส่วนกลาง/เดือน (บาท)" className={field} />
              <input name="depositBaht" inputMode="decimal" placeholder="เงินประกัน (บาท)" className={field} />
              <input name="advanceRentBaht" inputMode="decimal" placeholder="ค่าเช่าล่วงหน้า (บาท)" className={field} />
              <input name="bookingFeeBaht" inputMode="decimal" placeholder="เงินจอง (บาท)" className={field} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="createNewParty" value="1" />
              ยืนยันสร้างผู้เช่ารายใหม่ (เมื่อระบบแจ้งว่าเบอร์/เลขบัตรตรงกับผู้ติดต่อชื่ออื่น)
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ผู้พักร่วม (บรรทัดละคน · ไม่ต้องใส่เลขบัตร)
              <textarea name="occupants" rows={2} className={`${field} py-2`} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ทะเบียนรถ (บรรทัดละคัน)
              <textarea name="vehicles" rows={2} className={`${field} py-2`} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              เหตุผล (เฉพาะเมื่อระบบเตือนว่าเงินประกัน + ล่วงหน้าเกินเพดานและหอใช้โหมดเตือน)
              <input name="legalAckReason" className={field} />
            </label>
            <button type="submit" className={btn}>ทำสัญญาร่าง (กันห้อง)</button>
          </form>
        </>
      ) : (
        <>
          <section className={card}>
            <h2 className="font-semibold">สรุปสัญญา</h2>
            <p className="text-sm">{`${lease.startDate} ถึง ${lease.endDate} (${lease.months} เดือน) · ค่าห้อง ${baht(lease.rentSatang)} · ประกัน ${baht(lease.depositSatang)} · เงินจอง ${baht(lease.bookingFeeSatang)}`}</p>
            <p className="text-sm">{`สถานะ ${lease.status} · ถือเงินประกันแล้ว ${baht(lease.heldSatang)} · รูปห้องวันเข้า ${lease.files.ROOM_PHOTO}/${lease.moveInPhotosMin} รูป · ${lease.signedAt ? "ลงชื่อแล้ว" : "ยังไม่ลงชื่อ"}`}</p>
            {lease.legal.level === "WARN" ? <p className="text-sm text-[color:var(--color-note-ink)]">{`ข้ามคำเตือนกฎหมาย · สถานะอนุมัติ ${lease.legal.approvalStatus}`}</p> : null}
            <a href={`${base}/${lease.leaseId}/print`} className="text-sm text-[color:var(--color-accent)] underline">เปิดสัญญาสำหรับพิมพ์</a>
          </section>
          {lease.status === "DRAFT" ? (
            <>
              {lease.bookingFeeSatang > 0 ? (
                <form action={receiveBookingFeeFormAction.bind(null, unitSlug)} className={card}>
                  <h2 className="font-semibold">3. รับเงินจอง</h2>
                  <input type="hidden" name="leaseId" value={lease.leaseId} />
                  <select name="channel" className={field} defaultValue="TRANSFER">
                    <option value="TRANSFER">โอน</option>
                    <option value="PROMPTPAY">พร้อมเพย์</option>
                    <option value="CASH">เงินสด</option>
                  </select>
                  <button type="submit" className={btn}>{`รับเงินจอง ${baht(lease.bookingFeeSatang)}`}</button>
                </form>
              ) : null}
              <form action={addLeaseFilesFormAction.bind(null, unitSlug)} className={card} encType="multipart/form-data">
                <h2 className="font-semibold">4. รูปห้องวันเข้า / สำเนาบัตร</h2>
                <input type="hidden" name="leaseId" value={lease.leaseId} />
                <select name="kind" className={field} defaultValue="ROOM_PHOTO">
                  <option value="ROOM_PHOTO">รูปห้องวันเข้า</option>
                  <option value="ID_CARD">สำเนาบัตร</option>
                  <option value="DOCUMENT">เอกสารอื่น</option>
                </select>
                <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" className={field} />
                <button type="submit" className={btn}>แนบไฟล์</button>
              </form>
              {!lease.signedAt ? (
                <form action={signLeaseFormAction.bind(null, unitSlug)} className={card} encType="multipart/form-data">
                  <h2 className="font-semibold">5. ลงชื่อสัญญา</h2>
                  <input type="hidden" name="leaseId" value={lease.leaseId} />
                  <select name="method" className={field} defaultValue="PAPER">
                    <option value="PAPER">แนบสแกนสัญญาที่ลงชื่อแล้ว (PDF/รูป)</option>
                    <option value="ON_SCREEN">รูปลายเซ็น (PNG/JPEG)</option>
                  </select>
                  <input type="file" name="file" required accept="application/pdf,image/png,image/jpeg" className={field} />
                  <button type="submit" className={btn}>บันทึกการลงชื่อ</button>
                </form>
              ) : null}
              <form action={moveInFormAction.bind(null, unitSlug)} className={card}>
                <h2 className="font-semibold">6. เข้าอยู่ (รับเงินประกันส่วนที่เหลือ)</h2>
                <input type="hidden" name="leaseId" value={lease.leaseId} />
                <select name="channel" className={field} defaultValue="TRANSFER">
                  <option value="TRANSFER">โอน</option>
                  <option value="PROMPTPAY">พร้อมเพย์</option>
                  <option value="CASH">เงินสด</option>
                </select>
                <button type="submit" className={btn}>{`ยืนยันเข้าอยู่ · รับประกันอีก ${baht(Math.max(0, lease.depositSatang - lease.heldSatang))}`}</button>
              </form>
              <form action={cancelLeaseFormAction.bind(null, unitSlug)} className={card}>
                <h2 className="font-semibold">ยกเลิกสัญญาร่าง</h2>
                <input type="hidden" name="leaseId" value={lease.leaseId} />
                <input name="reason" required minLength={3} placeholder="เหตุผลที่ยกเลิก" className={field} />
                <button type="submit" className="min-h-11 rounded-xl border border-[color:var(--color-danger)] px-4 text-sm text-[color:var(--color-danger)]">ยกเลิกสัญญา</button>
              </form>
            </>
          ) : (
            <a href={`${base}?lease=${lease.leaseId}`} className={`${btn} inline-flex items-center justify-center`}>กลับไปหน้าผู้เช่าและสัญญา</a>
          )}
        </>
      )}
    </div>
  );
}
