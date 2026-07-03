import ExcelJS from "exceljs";
import { format } from "date-fns";

export type InventoryFlowExportRow = {
  date: string;
  missing?: boolean;
  beginning?: Record<string, number>;
  delivery?: Record<string, number>;
  rtsIn?: Record<string, number>;
  adjustment?: Record<string, number>;
  out?: Record<string, number>;
  ending?: Record<string, number>;
};

const SECTIONS = [
  { key: "beginning" as const, label: "BEGINNING INVENTORY" },
  { key: "delivery" as const, label: "DELIVERY" },
  { key: "rtsIn" as const, label: "RTS IN" },
  { key: "adjustment" as const, label: "ADJUSTMENT" },
  { key: "out" as const, label: "OUT" },
  { key: "ending" as const, label: "ENDING" },
];

function sectionMap(row: InventoryFlowExportRow, key: (typeof SECTIONS)[number]["key"]) {
  if (key === "beginning") return row.beginning;
  if (key === "delivery") return row.delivery;
  if (key === "rtsIn") return row.rtsIn;
  if (key === "adjustment") return row.adjustment;
  if (key === "out") return row.out;
  return row.ending;
}

function cellValue(row: InventoryFlowExportRow, key: (typeof SECTIONS)[number]["key"], product: string) {
  if (row.missing) return "—";
  const v = sectionMap(row, key)?.[product];
  if (v == null || v === 0) return "";
  return v;
}

export async function buildInventoryFlowWorkbookBuffer(
  productNames: string[],
  rows: InventoryFlowExportRow[],
  monthLabel: string,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventory Flow", { views: [{ showGridLines: true }] });

  ws.getCell("A1").value = `Inventory Flow — ${monthLabel}`;
  ws.getCell("A1").font = { bold: true, size: 12 };

  const headerRow1 = 3;
  const headerRow2 = 4;
  const dataStartRow = 5;

  ws.getCell(headerRow1, 1).value = "Date";
  ws.getCell(headerRow2, 1).value = "";
  ws.mergeCells(headerRow1, 1, headerRow2, 1);
  ws.getCell(headerRow1, 1).alignment = { vertical: "middle", horizontal: "center" };
  ws.getCell(headerRow1, 1).font = { bold: true };

  let col = 2;
  for (const sec of SECTIONS) {
    const startCol = col;
    for (const p of productNames) {
      ws.getCell(headerRow2, col).value = p;
      ws.getCell(headerRow2, col).font = { bold: true, size: 9 };
      ws.getCell(headerRow2, col).alignment = { horizontal: "center", wrapText: true };
      col++;
    }
    const endCol = col - 1;
    ws.getCell(headerRow1, startCol).value = sec.label;
    ws.getCell(headerRow1, startCol).font = { bold: true };
    ws.getCell(headerRow1, startCol).alignment = { horizontal: "center" };
    if (startCol < endCol) {
      ws.mergeCells(headerRow1, startCol, headerRow1, endCol);
    }
  }

  rows.forEach((row, idx) => {
    const r = dataStartRow + idx;
    const dateLabel = format(new Date(`${row.date}T12:00:00Z`), "MMM d, yyyy");
    ws.getCell(r, 1).value = dateLabel;
    ws.getCell(r, 1).font = { bold: true };

    let c = 2;
    for (const sec of SECTIONS) {
      for (const p of productNames) {
        const val = cellValue(row, sec.key, p);
        const cell = ws.getCell(r, c);
        cell.value = val;
        if (typeof val === "number") {
          cell.numFmt = "0.##";
          cell.alignment = { horizontal: "right" };
        }
        c++;
      }
    }
  });

  ws.getColumn(1).width = 14;
  for (let i = 2; i < col; i++) {
    ws.getColumn(i).width = 10;
  }

  ws.views = [{ state: "frozen", ySplit: headerRow2, xSplit: 1, showGridLines: true }];

  return wb.xlsx.writeBuffer();
}
