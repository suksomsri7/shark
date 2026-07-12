import { formatBaht } from "@/lib/ui/money";
// เงินบาท — ติดลบใช้ minus sign สี ink ปกติ (ไม่ใช่แดง)
export function MoneyText({ satang, decimals }: { satang: number; decimals?: boolean }) {
  return <span className="tabular-nums">{formatBaht(satang, { decimals })}</span>;
}
export default MoneyText;
