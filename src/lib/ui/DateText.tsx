import { formatDateTh } from "./date";

// แสดงวันที่ ค.ศ. แบบไทยกลาง — ใช้แทนการเรียก formatDateTh() ตรง ๆ ใน markup (โมดูลบัญชี V2)
export function DateText({ value, withYear, className }: { value: Date | string; withYear?: boolean; className?: string }) {
  return <span className={className}>{formatDateTh(value, { withYear })}</span>;
}

export default DateText;
