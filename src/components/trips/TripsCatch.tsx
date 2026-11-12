"use client";
// TRIPS T1.1 ▸ ขอบเขตข้อผิดพลาดที่ครอบเนื้อหาของ trips/layout.tsx (Next 16.2: error.js ของ segment ไม่ครอบ layout ของ segment เดียวกัน
//   — docs 03-file-conventions/error.md) · unstable_catchError ส่ง notFound()/redirect() ผ่านไปตามปกติ (docs 04-functions/catchError.md)
import { unstable_catchError, type ErrorInfo } from "next/error";
import TripsErrorView from "./TripsErrorView";

function TripsCatchFallback(_props: Record<string, unknown>, { error, unstable_retry }: ErrorInfo) {
  const digest = "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
  return <TripsErrorView digest={digest} retry={unstable_retry} />;
}

export default unstable_catchError(TripsCatchFallback);
