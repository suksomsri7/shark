// ด่าน "ฐาน QC1 เป็นของทรีหลักเท่านั้น" (ผู้คุมงาน RUN CRM v2 · 24 ก.ย. 2569)
//
// 🔴 เหตุการณ์จริงที่ทำให้ต้องมีไฟล์นี้: สคริปต์ QC ทุกตัว default ไปที่ `.env.qc` = **QC1**
//    (ฐานที่ผู้คุมงานใช้ตรวจรับงาน) · มีแต่ `scripts/qc2.sh` / `scripts/qc3.sh` ที่สลับไป QC2/QC3
//    ⇒ builder ใน worktree อื่นที่ลืมห่อคำสั่ง จะ "reseed QC1" เงียบ ๆ = ลบร้าน QC แล้วสร้างใหม่ด้วย id ใหม่
//    ⇒ ข้อมูล CRM ที่ผูกกับร้านนั้นหายทั้งชุด และชุดตรวจของผู้คุมงานที่กำลังรันอยู่แดงยกแผง
//      ด้วยเหตุผลที่ไม่เกี่ยวกับโค้ดที่กำลังตรวจเลย (เสียไป ~1.5 ชม. ในคืน 23–24 ก.ย.)
//
// กติกา: **สคริปต์ที่ลบ/สร้างข้อมูลใหม่ทั้งชุด รันแตะ QC1 ได้จากทรีหลักเท่านั้น**
//    worktree อื่น (shark-crm-c20 / -c23 / …) ต้องผ่าน qc2.sh/qc3.sh ซึ่งตั้ง QC_BRANCH ให้เอง
import { resolve } from "node:path";

const MAIN_TREE = "/root/projects/shark-crm";
const QC1_HOST_MARK = "ep-plain-art";

/** เรียกทันทีหลัง loadQcEnv() ในสคริปต์ที่ทำลายข้อมูล (seed ทั้งชุด · reset · purge) */
export function assertMayReseed(scriptName: string): void {
  const url = process.env.DATABASE_URL ?? "";
  const onQc1 = url.includes(QC1_HOST_MARK);
  const inMainTree = resolve(process.cwd()) === MAIN_TREE;
  if (!onQc1 || inMainTree) return;
  console.error(
    `\n🔴 ${scriptName}: หยุด — คำสั่งนี้กำลังจะล้างแล้วสร้างข้อมูลใหม่บน **QC1** จาก worktree ${process.cwd()}\n` +
      `   QC1 (${QC1_HOST_MARK}) เป็นฐานที่ผู้คุมงานใช้ตรวจรับงาน · reseed จาก worktree อื่น = ลบงานที่คนอื่นกำลังตรวจอยู่\n` +
      `   ถ้าต้องการ seed ฐานของตัวเอง ให้ห่อคำสั่งให้ครบ:\n` +
      `     bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/${scriptName}   # QC2\n` +
      `     bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/${scriptName}   # QC3\n` +
      `   (ถ้าคุณคือผู้คุมงานและตั้งใจ seed QC1 จริง ๆ ให้รันจาก ${MAIN_TREE})\n`,
  );
  process.exit(5);
}
