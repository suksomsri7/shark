// templates/business/index.ts — ทะเบียนเทมเพลตกิจการ 16 ชุด (ลำดับ = แถวของพิมพ์เขียว §10) · ข้อมูลล้วน
import type { BusinessTemplate } from "./types";
import { DIVE_TEMPLATE } from "./dive";
import { CLINIC_TEMPLATE } from "./clinic";
import { RESTAURANT_TEMPLATE } from "./restaurant";
import { FITNESS_TEMPLATE } from "./fitness";
import { HOTEL_TEMPLATE } from "./hotel";
import { RETAIL_TEMPLATE } from "./retail";
import { REALESTATE_TEMPLATE } from "./realestate";
import { AUTO_TEMPLATE } from "./auto";
import { SCHOOL_TEMPLATE } from "./school";
import { SERVICE_TEMPLATE } from "./service";
import { INSURANCE_TEMPLATE } from "./insurance";
import { PET_TEMPLATE } from "./pet";
import { SAAS_TEMPLATE } from "./saas";
import { EVENT_TEMPLATE } from "./event";
import { B2B_TEMPLATE } from "./b2b";
import { GENERAL_TEMPLATE } from "./general";

export type * from "./types";

export const BUSINESS_TEMPLATE_LIST: readonly BusinessTemplate[] = Object.freeze([
  DIVE_TEMPLATE,
  CLINIC_TEMPLATE,
  RESTAURANT_TEMPLATE,
  FITNESS_TEMPLATE,
  HOTEL_TEMPLATE,
  RETAIL_TEMPLATE,
  REALESTATE_TEMPLATE,
  AUTO_TEMPLATE,
  SCHOOL_TEMPLATE,
  SERVICE_TEMPLATE,
  INSURANCE_TEMPLATE,
  PET_TEMPLATE,
  SAAS_TEMPLATE,
  EVENT_TEMPLATE,
  B2B_TEMPLATE,
  GENERAL_TEMPLATE,
]);
