import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { env } from "./env";
import { formatDate, formatLimit, formatPrice, keyName } from "./format";
import type { LicenseSnapshot } from "./types";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.06, 0.06, 0.08);
const MUTED = rgb(0.42, 0.42, 0.48);
const ACCENT = rgb(0.486, 0.424, 1);
const RULE = rgb(0.88, 0.88, 0.9);

let fonts: { regular: Uint8Array; bold: Uint8Array } | null = null;
async function loadFonts() {
  if (!fonts) {
    const dir = path.join(process.cwd(), "src", "assets", "fonts");
    const [regular, bold] = await Promise.all([readFile(path.join(dir, "Inter-400.ttf")), readFile(path.join(dir, "Inter-700.ttf"))]);
    fonts = { regular, bold };
  }
  return fonts;
}

export interface LicensePdfInput {
  licenseNumber: string;
  purchasedAt: string;
  snapshot: LicenseSnapshot;
  buyerName: string;
  buyerEmail: string;
  orderNumber?: number | null;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private regular: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }
  ensure(space: number) {
    if (this.y - space < MARGIN + 30) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }
  wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? A4[0] - MARGIN - x;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(size * 1.5);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.5;
    }
    this.y -= opts.gap ?? 4;
  }
  rule(gap = 14) {
    this.ensure(gap * 2);
    this.y -= gap / 2;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.7, color: RULE });
    this.y -= gap / 2 + 4;
  }
  heading(text: string) {
    this.ensure(40);
    this.y -= 6;
    this.text(text.toUpperCase(), { size: 8.5, bold: true, color: ACCENT, gap: 6 });
  }
  rows(rows: [string, string][]) {
    for (const [k, v] of rows) {
      this.ensure(18);
      this.page.drawText(k, { x: MARGIN, y: this.y - 10, size: 10, font: this.regular, color: MUTED });
      const lines = this.wrap(v, this.bold, 10, 300);
      lines.forEach((line, i) => {
        this.page.drawText(line, { x: MARGIN + 180, y: this.y - 10 - i * 14, size: 10, font: this.bold, color: INK });
      });
      this.y -= Math.max(18, lines.length * 14 + 4);
    }
  }
}

export async function buildLicensePdf(input: LicensePdfInput): Promise<Uint8Array> {
  const { snapshot: s } = input;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = await loadFonts();
  const regular = await doc.embedFont(f.regular, { subset: true });
  const bold = await doc.embedFont(f.bold, { subset: true });
  doc.setTitle(`${s.license_name} — ${s.beat_title}`);
  doc.setAuthor(env.siteName);
  doc.setSubject(`License ${input.licenseNumber}`);
  doc.setCreator(env.siteName);

  const w = new Writer(doc, regular, bold);
  const exclusive = s.license_type === "exclusive";
  const free = s.license_type === "free";

  // Header
  w.page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: ACCENT });
  w.text(env.siteName.split("").join(" "), { size: 9, bold: true, color: MUTED, gap: 18 });
  w.text("License Agreement", { size: 26, bold: true, gap: 2 });
  w.text(`${s.license_name} · ${exclusive ? "Exclusive rights" : free ? "Free, non-commercial" : "Non-exclusive license"}`, { size: 11, color: MUTED, gap: 14 });
  w.rows([
    ["License number", input.licenseNumber],
    ["Effective date", formatDate(input.purchasedAt)],
    ...(input.orderNumber ? ([["Order", `#${input.orderNumber}`]] as [string, string][]) : []),
  ]);
  w.rule();

  w.heading("Parties");
  w.rows([
    ["Licensor (Producer)", `${s.producer_name} (@${s.producer_username})`],
    ["Licensee (Artist)", `${input.buyerName} — ${input.buyerEmail}`],
  ]);

  w.heading("Composition");
  w.rows([
    ["Title", `"${s.beat_title}"`],
    ["Tempo / key", `${s.bpm} BPM · ${keyName(s.key_note, s.key_mode, "long")}`],
    ["Files delivered", free ? "Tagged MP3" : [s.includes_mp3 && "MP3", s.includes_wav && "WAV", s.includes_stems && "Stems / trackouts"].filter(Boolean).join(", ")],
    ["Fee paid", s.price === 0 ? "Free" : formatPrice(s.price, s.currency, { exact: true })],
  ]);
  w.rule();

  w.heading("Grant of rights");
  w.text(
    exclusive
      ? `The Licensor grants the Licensee the exclusive right to use the instrumental "${s.beat_title}" (the "Beat") to create, record, distribute, perform and monetise new musical works. From the effective date the Licensor will not sell further licenses for the Beat, and the Beat is removed from sale. Non-exclusive licenses sold before the effective date remain valid for their holders.`
      : free
        ? `The Licensor grants the Licensee a free, non-exclusive, non-transferable license to use the tagged version of "${s.beat_title}" (the "Beat") for non-commercial purposes only, such as demos and non-monetised online uploads.`
        : `The Licensor grants the Licensee a non-exclusive, non-transferable, worldwide license to use the instrumental "${s.beat_title}" (the "Beat") to create one new musical work (the "Song"), subject to the usage limits below. The Licensor retains ownership of the Beat and may continue to license it to others.`,
    { size: 10, gap: 8 },
  );

  w.heading("Usage limits");
  w.rows([
    ["Distribution", s.distribution_limit == null ? "Unlimited copies" : formatLimit(s.distribution_limit, "copies")],
    ["Audio streams", s.streams_limit == null ? "Unlimited" : s.streams_limit === 0 ? "Not permitted" : s.streams_limit.toLocaleString("en")],
    ["Music videos", s.music_videos == null ? "Unlimited" : s.music_videos === 0 ? "Not permitted" : String(s.music_videos)],
    ["Radio broadcasting", s.radio_stations == null ? "Unlimited stations" : s.radio_stations === 0 ? "Not permitted" : `${s.radio_stations} station(s)`],
    ["Live performances", s.allow_live_performances ? "Permitted" : "Not permitted"],
    ["Commercial use", s.allow_for_profit ? "For-profit use permitted" : "Non-profit use only"],
  ]);
  w.rule();

  w.heading("Credit");
  w.text(`The Licensee must credit the Licensor in all releases and metadata as: "Produced by ${s.producer_name}".`, { size: 10, gap: 8 });

  w.heading("Restrictions");
  w.text(
    "The Licensee may not resell, sublicense, lease or redistribute the Beat as an instrumental, register the Beat itself with content-identification systems (e.g. YouTube Content ID) as their own, or claim authorship of the underlying composition. Limits apply per Song. Exceeding them requires upgrading the license.",
    { size: 10, gap: 8 },
  );

  if (s.terms) {
    w.heading("Additional terms from the producer");
    w.text(s.terms, { size: 10, gap: 8 });
  }

  w.rule(20);
  w.text(
    `This agreement was issued electronically by ${env.siteName} on behalf of the Licensor at the time of purchase and is binding without signature. Verify this license at ${env.siteUrl}/account/library using license number ${input.licenseNumber}.`,
    { size: 8.5, color: MUTED },
  );

  return doc.save();
}
