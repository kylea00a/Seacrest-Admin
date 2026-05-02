import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

import type { MergedDeliveryGroup } from "@/data/admin/deliveryGrouping";

const COMPANY_NAME = "SEACREST WELLNESS ENTERPRISE, INC.";
const COMPANY_ADDRESS =
  "Unit 215 2nd Floor Vel-Ounao Commercial Bldg., MC Briones Street Maguikay 6014 City of Mandaue Cebu Philippines";

export function productColumnLabel(productKey: string): string {
  if (productKey === "Radiance Coffee") return "SeaSkin Radiance";
  if (productKey === "Seahealth Coffee") return "SeaHealth Coffee";
  if (productKey === "Supreme") return "SeaSkin Supreme";
  return productKey;
}

function fmtLongDateRange(startYmd: string, endYmd: string): string {
  try {
    if (startYmd === endYmd) return format(parseISO(startYmd), "MMM d, yyyy");
    return `${format(parseISO(startYmd), "MMM d, yyyy")} – ${format(parseISO(endYmd), "MMM d, yyyy")}`;
  } catch {
    return `${startYmd} – ${endYmd}`;
  }
}

/** Fallback abbreviation when settings map has no entry (short readable token). */
export function productAbbrevFallback(productKey: string): string {
  const full = productColumnLabel(productKey);
  if (full.startsWith("Chips")) {
    const m = full.match(/\(([^)]+)\)/);
    return m ? m[1]!.trim() : full.replace(/^Chips\s*-?\s*/i, "").trim() || full;
  }
  return full.replace(/^SeaSkin\s+/i, "").trim() || full;
}

function abbrevForProduct(
  productKey: string,
  abbreviations: Record<string, string> | undefined,
): string {
  const custom = abbreviations?.[productKey]?.trim();
  if (custom) return custom;
  return productAbbrevFallback(productKey);
}

/**
 * Canonical contents line for one order, e.g. `2 BBQ`, `1 FV`, `2 S / 2 L`
 * (follows table column / product key order).
 */
export function packingContentsSignature(
  g: MergedDeliveryGroup,
  productKeys: string[],
  abbreviations: Record<string, string> | undefined,
): string {
  const parts: string[] = [];
  for (const k of productKeys) {
    const n = g.productTotals[k] ?? 0;
    if (n <= 0) continue;
    parts.push(`${n} ${abbrevForProduct(k, abbreviations)}`);
  }
  return parts.join(" / ");
}

/** Aggregate identical package mixes across orders → rows for PDF summary table. */
export function aggregatePackingSummaryRows(
  groups: MergedDeliveryGroup[],
  productKeys: string[],
  abbreviations: Record<string, string> | undefined,
): (string | number)[][] {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const sig = packingContentsSignature(g, productKeys, abbreviations);
    if (!sig) continue;
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  const rows: (string | number)[][] = [];
  const entries = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [sig, n] of entries) {
    rows.push([n, "Package/s of", sig]);
  }
  return rows;
}

export type PackingPdfOpts = {
  startDateYmd: string;
  endDateYmd: string;
  courierLabel: string;
  productKeys: string[];
  groups: MergedDeliveryGroup[];
  /** Resolved tracking per group key (manual saved or J&T import match). */
  trackingByGroupKey: Record<string, string>;
  /** Settings: product name → packing abbreviation (optional). */
  productAbbreviations?: Record<string, string>;
};

export function buildPackingExportPdfBlob(opts: PackingPdfOpts): Blob {
  const {
    startDateYmd,
    endDateYmd,
    courierLabel,
    productKeys,
    groups,
    trackingByGroupKey,
    productAbbreviations,
  } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const dateStr = fmtLongDateRange(startDateYmd, endDateYmd);
  const margin = 10;
  const tableInnerW = pageW - margin * 2;

  /** Header: company title + address first; date & courier left-aligned below address (no overlap with title). */
  const leftX = margin;
  let cy = 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(COMPANY_NAME, pageW / 2, cy, { align: "center" });
  cy += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const addrLines = doc.splitTextToSize(COMPANY_ADDRESS, pageW - margin * 2);
  const lineHeight = 4.2;
  for (let i = 0; i < addrLines.length; i++) {
    doc.text(String(addrLines[i]), pageW / 2, cy, { align: "center" });
    cy += lineHeight;
  }
  cy += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Date: ${dateStr}`, leftX, cy);
  cy += 6;
  doc.text(`Courier: ${courierLabel}`, leftX, cy);
  cy += 6;
  const tableStartY = cy + 2;

  const labels = productKeys.map(productColumnLabel);

  const columnTotals = productKeys.map((k) =>
    groups.reduce((acc, g) => acc + (g.productTotals[k] ?? 0), 0),
  );

  const body: (string | number)[][] = [];

  body.push(["", "Totals", ...columnTotals, ""]);

  groups.forEach((g, i) => {
    const row: (string | number)[] = [
      i + 1,
      g.shippingFullName,
      ...productKeys.map((k) => {
        const n = g.productTotals[k] ?? 0;
        return n > 0 ? n : "";
      }),
      trackingByGroupKey[g.key] ?? "",
    ];
    body.push(row);
  });

  const head = [["No.", "Receiver", ...labels, "Tracking Number"]];

  const colNo = 8;
  const colRecv = 28;
  const colTrack = 26;
  const nP = productKeys.length;
  const prodW = nP > 0 ? Math.max(6, (tableInnerW - colNo - colRecv - colTrack) / nP) : 0;

  const columnStyles: Record<number, { cellWidth: number; halign?: "center" | "left" | "right" }> = {
    0: { cellWidth: colNo, halign: "center" },
    1: { cellWidth: colRecv, halign: "left" },
  };
  for (let i = 0; i < nP; i++) {
    columnStyles[2 + i] = { cellWidth: prodW, halign: "center" };
  }
  columnStyles[2 + nP] = { cellWidth: colTrack, halign: "left" };

  autoTable(doc, {
    startY: tableStartY,
    head,
    body,
    styles: {
      fontSize: 6,
      cellPadding: 1,
      valign: "middle",
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [220, 220, 220],
    },
    headStyles: {
      fillColor: [255, 243, 180],
      textColor: 20,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles,
    margin: { left: margin, right: margin },
    tableWidth: tableInnerW,
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 0) {
        data.cell.styles.fillColor = [240, 240, 240];
        data.cell.styles.fontStyle = "bold";
        if (data.column.index >= 2 && data.column.index < 2 + productKeys.length) {
          data.cell.styles.halign = "center";
        }
      }
    },
  });

  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  let summaryY = lastY + 8;

  if (summaryY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    summaryY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Summary", margin, summaryY);
  summaryY += 5;

  const summaryRows = aggregatePackingSummaryRows(groups, productKeys, productAbbreviations);
  const summaryBody: (string | number)[][] =
    summaryRows.length > 0 ? summaryRows : [["—", "—", "No products in export"]];

  autoTable(doc, {
    startY: summaryY,
    head: [["Total Package", "UOM", "Description"]],
    body: summaryBody,
    styles: {
      fontSize: 8,
      cellPadding: 1.2,
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [220, 220, 220],
    },
    headStyles: { fillColor: [220, 220, 220], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
    tableWidth: tableInnerW,
  });

  return doc.output("blob");
}
