// pdfkit.d.ts — ชนิดขั้นต่ำของ pdfkit 0.20 ที่ ACC T5.4 (etax-pdf.ts) ใช้ · แพ็กเกจไม่มีชนิดในตัว และไม่เพิ่ม @types/pdfkit (ลด dependency)
//   ประกาศเฉพาะเมธอดที่เรียกจริง — เพิ่มเมธอดใหม่ต้องเพิ่มที่นี่
declare namespace PDFKit {
  type PDFDocumentOptions = {
    size?: string | [number, number];
    margin?: number;
    autoFirstPage?: boolean;
    compress?: boolean;
    pdfVersion?: string;
    subset?: string;
    lang?: string;
    displayTitle?: boolean;
    font?: string;
    bufferPages?: boolean;
    info?: Record<string, string | Date>;
  };
  type TextOptions = { width?: number; align?: "left" | "right" | "center" | "justify"; lineBreak?: boolean };
  interface PDFDocument {
    addPage(o?: { size?: string; margin?: number }): PDFDocument;
    registerFont(name: string, src: string): PDFDocument;
    font(name: string): PDFDocument;
    fontSize(n: number): PDFDocument;
    fillColor(c: string): PDFDocument;
    strokeColor(c: string): PDFDocument;
    lineWidth(n: number): PDFDocument;
    text(t: string, x?: number, y?: number, o?: TextOptions): PDFDocument;
    widthOfString(t: string): number;
    moveTo(x: number, y: number): PDFDocument;
    lineTo(x: number, y: number): PDFDocument;
    stroke(): PDFDocument;
    rect(x: number, y: number, w: number, h: number): PDFDocument;
    fill(): PDFDocument;
    bufferedPageRange(): { start: number; count: number };
    switchToPage(n: number): PDFDocument;
    on(ev: "data", cb: (c: Buffer) => void): PDFDocument;
    on(ev: "end", cb: () => void): PDFDocument;
    on(ev: "error", cb: (e: unknown) => void): PDFDocument;
    end(): void;
  }
}
declare module "pdfkit" {
  const PDFDocument: new (o?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
  export default PDFDocument;
}
