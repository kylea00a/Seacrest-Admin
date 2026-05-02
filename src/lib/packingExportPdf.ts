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

/** Short label for summary text (e.g. Soap, Lotion). */
function productShortLabel(productKey: string): string {
  const full = productColumnLabel(productKey);
  if (full.startsWith("Chips")) {
    const m = full.match(/\(([^)]+)\)/);
    return m ? m[1]!.trim() : full.replace(/^Chips\s*-?\s*/i, "").trim() || full;
  }
  return full.replace(/^SeaSkin\s+/i, "").trim() || full;
}

/** One order line: total pieces + human-readable breakdown. */
function orderSummaryParts(
  g: MergedDeliveryGroup,
  productKeys: string[],
): { totalPieces: number; phrase: string } {
  const segments: string[] = [];
  let totalPieces = 0;
  for (const k of productKeys) {
    const n = g.productTotals[k] ?? 0;
    if (n <= 0) continue;
    totalPieces += n;
    const short = productShortLabel(k);
    segments.push(`${n} ${short}`);
  }
  if (segments.length === 0) {
    return { totalPieces: 0, phrase: "—" };
  }
  if (segments.length === 1) {
    return { totalPieces, phrase: segments[0]! };
  }
  // e.g. "4 Soap and 2 Lotion" or "2 Soap, 1 Lotion and 3 Chips (BBQ)"
  const last = segments.pop()!;
  const phrase =
    segments.length === 0 ? last : `${segments.join(", ")} and ${last}`;
  return { totalPieces, phrase };
}

export type PackingPdfOpts = {
  startDateYmd: string;
  endDateYmd: string;
  courierLabel: string;
  productKeys: string[];
  groups: MergedDeliveryGroup[];
  /** Resolved tracking per group key (manual saved or J&T import match). */
  trackingByGroupKey: Record<string, string>;
};

export function buildPackingExportPdfBlob(opts: PackingPdfOpts): Blob {
  const { startDateYmd, endDateYmd, courierLabel, productKeys, groups, trackingByGroupKey } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const dateStr = fmtLongDateRange(startDateYmd, endDateYmd);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Date: ${dateStr}`, 14, 14);
  doc.setFontSize(11);
  doc.text(`Courier: ${courierLabel}`, 14, 20);

  doc.setFontSize(12);
  doc.text(COMPANY_NAME, pageW / 2, 14, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(COMPANY_ADDRESS, pageW - 28);
  doc.text(addrLines, pageW / 2, 20, { align: "center" });

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

  autoTable(doc, {
    startY: 32,
    head,
    body,
    styles: { fontSize: 6, cellPadding: 1, valign: "middle", overflow: "linebreak" },
    headStyles: {
      fillColor: [255, 243, 180],
      textColor: 20,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 9 },
      1: { cellWidth: 26, halign: "left" },
    },
    margin: { left: 10, right: 10 },
    tableWidth: pageW - 20,
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
  let y = lastY + 8;

  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Summary (by order)", 14, y);
  y += 5;

  /** One row per delivery group: total pieces + breakdown like sample (5 packages … / 2 packages …). */
  const summaryBody: (string | number)[][] = groups.map((g) => {
    const { totalPieces, phrase } = orderSummaryParts(g, productKeys);
    const desc = `${g.shippingFullName}: ${phrase}`;
    return [totalPieces || "—", "Package/s of", desc];
  });

  autoTable(doc, {
    startY: y,
    head: [["Total Package", "UOM", "Description"]],
    body: summaryBody,
    styles: { fontSize: 8, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [220, 220, 220], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
    },
    margin: { left: 10, right: 10 },
    tableWidth: pageW - 20,
  });

  return doc.output("blob");
}
