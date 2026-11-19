// trips-main-merge.mts — ที่เดียวของ "commit ฝั่ง main ที่ RUN TRIPS รวมเข้ามา" สำหรับข้อขอบเขตของข้อสอบ TRIPS (ORACLE-EDIT ผู้คุม 19 พ.ย. 2569: รวม main)
//   เจ้าของสั่ง merge origin/main เข้า session/trips ที่ 6c708ece6 (19 พ.ย.) — พ่อแม่ฝั่ง main = TRIPS_MAIN_MERGE_SHA
//   กติกา: path ที่เนื้อหาตรงกับ commit ฝั่ง main นี้ (และไม่ใช่ไฟล์ untracked) ไม่นับว่า TRIPS แตะ · โฟลเดอร์ migration / ไฟล์ schema ที่มีตรงกันบน main ไม่ใช่ของ TRIPS
//   การแก้ฝั่ง TRIPS ในพื้นที่เดียวกัน (เนื้อหาต่างจาก main หรือไฟล์ใหม่ที่ main ไม่มี) ยังนับ ⇒ ข้อยังแดงตามเจตนาเดิม
//   แทนค่าเดิม 6b991f34d (merge main รอบโรงแรม 12 พ.ย.) — main ฝั่งใหม่มีงานนั้นอยู่แล้ว ไฟล์ที่ตรงกับ main เดิมและไม่ถูกแก้ต่อจึงตรงกับ main ใหม่ด้วย
// 🔴 ไม่ import อะไรนอก node: (ใช้ได้จากทุกข้อสอบ · fitness)
import { execFileSync } from "node:child_process";

/** commit ฝั่ง main ของ merge 6c708ece6 (session/trips · 19 พ.ย. 2569) = `git rev-parse 6c708ece6^2` */
export const TRIPS_MAIN_MERGE_SHA = "73eb1f0ccfc8ff4c773182af341e72b5d28beb2b";

const gitOut = (root: string, args: string[]): string | null => {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

/** merge commit เอง (session/trips · 19 พ.ย.) และพ่อแม่ฝั่ง TRIPS ก่อนรวม = `git rev-parse 6c708ece6^1` */
export const TRIPS_MAIN_MERGE_COMMIT = "6c708ece6565072fb23da0f0944d2a130cf35601";
export const TRIPS_PRE_MERGE_SHA = "9f91b58219b613180bddb83299fa719743b5e59b";

/**
 * ความต่างของ path เทียบ `base` มาจาก main เท่านั้น (ไฟล์ที่ทั้ง main และ TRIPS เคยแก้ เช่น core.prisma: TRIPS แก้ก่อน `base` แล้ว main แก้ต่อ):
 * ฝั่ง TRIPS ก่อนรวม (TRIPS_PRE_MERGE_SHA) ตรงกับ `base` · worktree ตรงกับ merge commit · ไม่มี untracked — แก้ฝั่ง TRIPS ก่อนหรือหลังรวม ⇒ false (ยังนับ)
 */
export function changedOnlyByMainMerge(root: string, base: string, path: string): boolean {
  const pre = gitOut(root, ["diff", "--name-only", base, TRIPS_PRE_MERGE_SHA, "--", path]);
  const post = gitOut(root, ["diff", "--name-only", TRIPS_MAIN_MERGE_COMMIT, "--", path]);
  const untracked = gitOut(root, ["ls-files", "--others", "--exclude-standard", "--", path]);
  return pre !== null && post !== null && untracked !== null && pre.trim() === "" && post.trim() === "" && untracked.trim() === "";
}

/**
 * path (ไฟล์หรือโฟลเดอร์) มาจาก main ที่รวมเข้ามา: มีอยู่ใน TRIPS_MAIN_MERGE_SHA · เนื้อหาใน worktree ตรงกัน · ไม่มีไฟล์ untracked ใต้ path
 * `ignoreWs` = เทียบแบบ -w --ignore-blank-lines (ตามข้อเดิมที่ใช้แบบนั้น) · git อ่านไม่ได้ ⇒ false (นับว่า TRIPS แตะ — ปิดเมื่อพัง)
 */
export function fromMainMerge(root: string, path: string, opts: { ignoreWs?: boolean } = {}): boolean {
  const inMain = gitOut(root, ["ls-tree", "--name-only", TRIPS_MAIN_MERGE_SHA, "--", path.replace(/\/+$/, "")]);
  if (inMain === null || inMain.trim() === "") return false;
  const diff = gitOut(root, ["diff", ...(opts.ignoreWs ? ["-w", "--ignore-blank-lines"] : []), "--name-only", TRIPS_MAIN_MERGE_SHA, "--", path]);
  if (diff === null || diff.trim() !== "") return false;
  const untracked = gitOut(root, ["ls-files", "--others", "--exclude-standard", "--", path]);
  return untracked !== null && untracked.trim() === "";
}
