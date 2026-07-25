// นโยบายความเป็นส่วนตัว (หน้า public) — ใช้ยื่นขอ permission กับ LINE/Google/Meta ด้วย
// (LINE Email permission ต้องแนบ screenshot หน้าที่อธิบายการใช้อีเมล — หัวข้อ "ข้อมูลที่เราเก็บ")
export const metadata = { title: "นโยบายความเป็นส่วนตัว — SHARK" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">นโยบายความเป็นส่วนตัว</h1>
      <p className="text-sm text-[color:var(--color-muted)]">SHARK (shark.in.th) — อัปเดตล่าสุด 25 กรกฎาคม 2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ข้อมูลที่เราเก็บ</h2>
        <p className="text-sm leading-6">
          เมื่อคุณสมัครหรือเข้าสู่ระบบ SHARK (รวมถึงการเข้าสู่ระบบผ่าน LINE, Google, Apple, Facebook หรือ TikTok)
          เราเก็บ <strong>ที่อยู่อีเมล</strong> และชื่อที่แสดงของคุณ เพื่อใช้ในการ:
        </p>
        <ul className="list-disc pl-6 text-sm leading-6">
          <li>สร้างและยืนยันตัวตนบัญชีผู้ใช้ของคุณ (อีเมลคือรหัสประจำบัญชี)</li>
          <li>ส่งรหัสเข้าสู่ระบบ (OTP) และการแจ้งเตือนที่เกี่ยวข้องกับบัญชีหรือกิจการของคุณ</li>
          <li>เชื่อมบัญชีจากช่องทางเข้าสู่ระบบต่าง ๆ เข้าเป็นบัญชีเดียวกัน</li>
        </ul>
        <p className="text-sm leading-6">
          เราไม่นำอีเมลของคุณไปขาย แลกเปลี่ยน หรือส่งต่อให้บุคคลที่สามเพื่อการโฆษณา
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ข้อมูลกิจการของคุณ</h2>
        <p className="text-sm leading-6">
          ข้อมูลร้าน สินค้า สมาชิก และรายการขายที่คุณบันทึกในระบบ เป็นของกิจการคุณ
          เราใช้เพื่อให้บริการตามฟังก์ชันของระบบเท่านั้น และแยกข้อมูลระหว่างกิจการอย่างเข้มงวด
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">สิทธิ์ของคุณ (PDPA)</h2>
        <p className="text-sm leading-6">
          คุณสามารถดาวน์โหลดข้อมูลทั้งหมดของกิจการ หรือขอลบบัญชีและข้อมูลถาวรได้เองที่เมนู
          ตั้งค่า → ความเป็นส่วนตัว ภายในระบบ (มีระยะพัก 30 วันก่อนลบจริง)
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ติดต่อเรา</h2>
        <p className="text-sm leading-6">คำถามเรื่องข้อมูลส่วนบุคคล: support@shark.in.th</p>
      </section>
    </main>
  );
}
