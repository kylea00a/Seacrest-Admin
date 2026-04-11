import ExcelJS from "exceljs";

/** J&T Express bulk upload template column titles (exact). */
export const JNT_TEMPLATE_HEADERS = [
  "Receiver(*)",
  "Receiver Telephone (*)",
  "Receiver Address (*)",
  "Receiver Province (*)",
  "Receiver City (*)",
  "Receiver Region (*)",
  "Express Type (*)",
  "Parcel Name (*)",
  "Weight (kg) (*)",
  "Total parcels(*)",
  "Parcel Value (Insurance Fee) (*)",
  "COD (PHP) (*)",
  "Remarks",
] as const;

export function formatJntReceiverTelephone(contact: string): string {
  const d = (contact ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("63")) return d;
  if (d.startsWith("0") && d.length >= 10) return `63${d.slice(1)}`;
  if (d.length === 10 && d.startsWith("9")) return `63${d}`;
  return d;
}

export type JntExportRow = {
  receiver: string;
  telephone: string;
  address: string;
  province: string;
  city: string;
  region: string;
  weightKg: number;
  totalParcels: number;
};

const HEADER_FILL = "FFFF00";
const BORDER_STYLE: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FF000000" },
};
const ROW_FILL_ODD = "FFF2F6FC";
const ROW_FILL_EVEN = "FFFFFFFF";

export async function buildJntExpressWorkbookBuffer(rows: JntExportRow[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1", { views: [{ showGridLines: true }] });

  ws.columns = JNT_TEMPLATE_HEADERS.map((_, i) => ({
    width: i === 2 ? 42 : i === 1 ? 18 : 14,
  }));

  const headerRow = ws.addRow([...JNT_TEMPLATE_HEADERS]);
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: "FF000000" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: BORDER_STYLE,
      left: BORDER_STYLE,
      bottom: BORDER_STYLE,
      right: BORDER_STYLE,
    };
  });

  rows.forEach((r, idx) => {
    const dataRow = ws.addRow([
      r.receiver,
      formatJntReceiverTelephone(r.telephone),
      r.address,
      r.province,
      r.city,
      r.region,
      "EZ",
      "Seacrest Package",
      r.weightKg,
      r.totalParcels,
      500,
      0,
      "Im Remarks",
    ]);
    const fill = idx % 2 === 0 ? ROW_FILL_ODD : ROW_FILL_EVEN;
    dataRow.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
      cell.border = {
        top: BORDER_STYLE,
        left: BORDER_STYLE,
        bottom: BORDER_STYLE,
        right: BORDER_STYLE,
      };
      const centerCols = new Set([7, 8, 9, 10, 11, 12, 13]);
      cell.alignment = {
        vertical: "middle",
        horizontal: centerCols.has(col) ? "center" : col >= 3 && col <= 6 ? "left" : col <= 2 ? "left" : "center",
        wrapText: col === 3,
      };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  if (buf instanceof ArrayBuffer) return buf;
  return new Uint8Array(buf as Buffer).buffer;
}
