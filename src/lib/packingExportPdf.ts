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

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
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
  const addrLines = doc.splitTextToSize(COMPANY_ADDRESS, pageW - 40);
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
    styles: { fontSize: 7, cellPadding: 1.4, valign: "middle" },
    headStyles: {
      fillColor: [255, 243, 180],
      textColor: 20,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { cellWidth: 34, halign: "left" },
    },
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

  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Summary", 14, y);
  y += 5;

  const totalPackages = columnTotals.reduce((a, b) => a + b, 0);
  const summaryBody: (string | number)[][] = [
    [totalPackages, "Package/s of", "All line items (see table)"],
    ...productKeys
      .map((k, i) => {
        const n = columnTotals[i] ?? 0;
        if (n <= 0) return null;
        return [n, "Package/s of", `${n} × ${productColumnLabel(k)}`];
      })
      .filter((r): r is (string | number)[] => r != null),
  ];

  autoTable(doc, {
    startY: y,
    head: [["Total Package", "UOM", "Description"]],
    body: summaryBody,
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: [220, 220, 220], fontStyle: "bold" },
  });

  return doc.output("blob");
}
