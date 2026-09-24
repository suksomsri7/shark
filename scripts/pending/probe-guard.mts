// positive control: ด่านต้อง "ไม่" ขวางเมื่อรันจากทรีหลัก
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const g = (await import("../qc-owner-guard.mts" as string)) as { assertMayReseed: (s: string) => void };
g.assertMayReseed("seed-member-qc.mts");
console.log("✅ GUARD SILENT in main tree — host", host, "cwd", process.cwd());
