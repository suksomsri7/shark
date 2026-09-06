// respond.ts — ซองจดหมายกลางของ REST (WO A3 · แกนย้ายไป `src/lib/api/respond.ts` ตอน K1.15)
//
// 🔴 re-export ล้วน: ห้ามมีตรรกะซ้ำที่นี่ (ซองของบัญชีกับบอร์ดงานต้องเป็นซองเดียวกันเป๊ะ)
export {
  API_ERROR_CODES,
  ApiError,
  ENVELOPE,
  csvResponse,
  fail,
  failBody,
  mapError,
  newRequestId,
  ok,
  okBody,
  paged,
  unwrapEnvelope,
  wantsCsv,
  withExtra,
} from "@/lib/api/respond";
export type {
  ApiEnvelope,
  ApiErrorCode,
  ApiErrorDetail,
  MappedError,
  PagedInfo,
} from "@/lib/api/respond";
