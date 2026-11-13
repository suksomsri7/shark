// HR H3.6 ▸ แบบยื่นภาษี/ประกันสังคม — ทางเข้าเดียวของชั้น pure (brief R2) · รูปร่าง wo-notes/hr-H3.6-oracle.md §2
//   buildPnd1 (ภ.ง.ด.1 / 1ก · RD Format 2.0) · buildSso110 (สปส.1-10 · Format135) · itemFigures (ตัวเลขจากค่าที่เก็บไว้) · thaiIdOk ·
//   parseRdFile / emitRdFile · taxCertContent / taxCertDocNo (50 ทวิ) · FILING_TEXT / FILING_TEXT_EN / FIELD_LABEL / filingTextFor
//   ไม่มี db/เวลา/สุ่ม — เวลาและข้อมูลมาจากผู้เรียก (service.ts) ◂
export { buildPnd1, thaiIdOk, parseRdFile, emitRdFile, personOrder, rdPersonFields, rdProfileFields, hasBase, validDay, bahtStr } from "./rd";
export type { FilingAddress, FilingEmployer, FilingItem, FilingPerson, FilingWarning, PndInput, PndResult, PndOk, PndNotIncluded, PndCert, RefusalCode, SlashMode } from "./rd";
export { buildSso110, ssoDefaultPaidDate, ssoProfileFields } from "./sso";
export type { SsoInput, SsoResult, SsoOk, SsoNotIncluded } from "./sso";
export { itemFigures, satangOk } from "./figures";
export type { Figures, FigureRow } from "./figures";
export { taxCertContent, taxCertDocNo, payeeNameOf, payeeAddressOf, CERT_ROW1_LABEL } from "./cert";
export type { TaxCertContent, TaxCertInput } from "./cert";
export { FILING_TEXT, FILING_TEXT_EN, FIELD_LABEL, filingTextFor, filingText, fieldLabelOf } from "./texts";
export type { FilingTextKey, FilingLang } from "./texts";
