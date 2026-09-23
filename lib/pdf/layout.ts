import { type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type rgb } from "pdf-lib";
import { COLORS, winAnsi, wrapText } from "./text";

export const A4: [number, number] = [595.28, 841.89];

/** Minimal flowing layout: a cursor that adds pages as content grows. */
export class PageWriter {
  page!: PDFPage;
  y = 0;
  readonly margin = 50;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: { regular: PDFFont; bold: PDFFont; mono: PDFFont },
    private readonly size: [number, number] = A4,
    private readonly onNewPage?: (page: PDFPage, writer: PageWriter) => void,
  ) {
    this.newPage();
  }

  get width() {
    return this.size[0] - this.margin * 2;
  }

  newPage() {
    this.page = this.doc.addPage(this.size);
    this.pages.push(this.page);
    this.y = this.size[1] - this.margin;
    this.onNewPage?.(this.page, this);
  }

  ensure(height: number) {
    if (this.y - height < this.margin + 20) this.newPage();
  }

  space(h: number) {
    this.y -= h;
  }

  heading(text: string, size = 18) {
    this.ensure(size + 12);
    this.page.drawText(winAnsi(text), {
      x: this.margin,
      y: this.y - size,
      size,
      font: this.fonts.bold,
      color: COLORS.ink,
    });
    this.y -= size + 10;
  }

  subheading(text: string) {
    this.ensure(26);
    this.y -= 6;
    this.page.drawText(winAnsi(text), {
      x: this.margin,
      y: this.y - 12,
      size: 12,
      font: this.fonts.bold,
      color: COLORS.primary,
    });
    this.y -= 18;
    this.page.drawLine({
      start: { x: this.margin, y: this.y + 2 },
      end: { x: this.margin + this.width, y: this.y + 2 },
      thickness: 0.6,
      color: COLORS.border,
    });
    this.y -= 6;
  }

  paragraph(
    text: string,
    opts: { size?: number; color?: ReturnType<typeof rgb>; font?: PDFFont; indent?: number } = {},
  ) {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? this.fonts.regular;
    const indent = opts.indent ?? 0;
    for (const line of wrapText(text, font, size, this.width - indent)) {
      this.ensure(size + 4);
      this.page.drawText(line, {
        x: this.margin + indent,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? COLORS.ink,
      });
      this.y -= size + 3.5;
    }
  }

  /** Label/value row with wrapping value column. */
  field(
    label: string,
    value: string,
    opts: { mono?: boolean; labelWidth?: number; indent?: number } = {},
  ) {
    const size = 8.5;
    const indent = opts.indent ?? 0;
    const labelWidth = opts.labelWidth ?? 150;
    const valueFont = opts.mono ? this.fonts.mono : this.fonts.regular;
    const lines = wrapText(value || "—", valueFont, size, this.width - labelWidth - indent);
    this.ensure(lines.length * (size + 3.5) + 2);
    this.page.drawText(winAnsi(label), {
      x: this.margin + indent,
      y: this.y - size,
      size,
      font: this.fonts.bold,
      color: COLORS.muted,
    });
    for (const line of lines) {
      this.page.drawText(line, {
        x: this.margin + indent + labelWidth,
        y: this.y - size,
        size,
        font: valueFont,
        color: COLORS.ink,
      });
      this.y -= size + 3.5;
    }
    this.y -= 1.5;
  }

  image(img: PDFImage, maxW: number, maxH: number, x = this.margin) {
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.ensure(h + 4);
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    return { w, h };
  }

  box(height: number, color = COLORS.soft) {
    this.ensure(height);
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - height,
      width: this.width,
      height,
      color,
      borderColor: COLORS.border,
      borderWidth: 0.6,
    });
  }
}
