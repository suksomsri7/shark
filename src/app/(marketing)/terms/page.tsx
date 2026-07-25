// ข้อกำหนดการใช้บริการ (public) — ใช้ยื่น Facebook/TikTok/App Store review
export const metadata = { title: "ข้อกำหนดการใช้บริการ — SHARK" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">ข้อกำหนดการใช้บริการ</h1>
      <p className="text-sm text-[color:var(--color-muted)]">SHARK (shark.in.th) — อัปเดตล่าสุด 25 กรกฎาคม 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">1. บริการของเรา</h2>
        <p className="text-sm leading-6">
          SHARK คือระบบบริหารจัดการกิจการสำหรับธุรกิจขนาดเล็กถึงกลาง (ขายหน้าร้าน สมาชิก จองคิว คลังสินค้า
          บัญชี และผู้ช่วย AI) ให้บริการผ่านเว็บไซต์ shark.in.th และแอปพลิเคชันมือถือ
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">2. บัญชีและความรับผิดชอบ</h2>
        <ul className="list-disc pl-6 text-sm leading-6">
          <li>คุณต้องให้ข้อมูลที่ถูกต้องในการสมัครและรักษาความปลอดภัยของบัญชีตนเอง</li>
          <li>ข้อมูลกิจการที่คุณบันทึกเป็นของกิจการคุณ — คุณรับผิดชอบความถูกต้องของข้อมูลนั้น</li>
          <li>ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">3. ผู้ช่วย AI</h2>
        <p className="text-sm leading-6">
          คำตอบและข้อเสนอของผู้ช่วย AI เป็นเครื่องมือช่วยตัดสินใจ — การทำรายการสำคัญทุกครั้งต้องได้รับ
          การยืนยันจากผู้ใช้ก่อนเสมอ และผู้ใช้เป็นผู้รับผิดชอบการตัดสินใจสุดท้าย
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">4. ข้อมูลส่วนบุคคล</h2>
        <p className="text-sm leading-6">
          การเก็บและใช้ข้อมูลเป็นไปตาม <a href="/privacy" className="underline">นโยบายความเป็นส่วนตัว</a> ของเรา
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">5. การยกเลิกบริการ</h2>
        <p className="text-sm leading-6">
          คุณยกเลิกและลบบัญชี/ข้อมูลได้เองทุกเมื่อที่เมนู ตั้งค่า → ความเป็นส่วนตัว
          (ดูวิธีที่ <a href="/data-deletion" className="underline">การลบข้อมูลผู้ใช้</a>)
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ติดต่อเรา</h2>
        <p className="text-sm leading-6">support@shark.in.th</p>
      </section>
    </main>
  );
}
