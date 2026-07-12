// รูปแบบเงินบาทมาตรฐาน — ใช้แทน const baht=… ที่ก๊อปกันทั่วแอป
export const formatBaht = (satang: number, opts?: { decimals?: boolean }) =>
  (satang < 0 ? "−฿" : "฿") +
  (Math.abs(satang) / 100).toLocaleString(
    "th-TH",
    opts?.decimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined,
  );
