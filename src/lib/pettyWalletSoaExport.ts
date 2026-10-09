import ExcelJS from "exceljs";

export type PettyWalletSoaExportRow = {
  date: string;
  description: string;
  category?: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export async function buildPettyWalletSoaWorkbookBuffer(
  rows: PettyWalletSoaExportRow[],
  rangeLabel: string,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Petty Wallet SOA", { views: [{ showGridLines: true }] });

  ws.getCell("A1").value = `Petty Wallet SOA — ${rangeLabel}`;
  ws.getCell("A1").font = { bold: true, size: 12 };

  const headers = ["Date", "Description", "Category", "Debit", "Credit", "Balance"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.font = { bold: true };
  });

  rows.forEach((r, idx) => {
    const row = 4 + idx;
    ws.getCell(row, 1).value = r.date;
    ws.getCell(row, 2).value = r.description;
    ws.getCell(row, 3).value = r.category ?? "";
    ws.getCell(row, 4).value = r.debit || "";
    ws.getCell(row, 5).value = r.credit || "";
    ws.getCell(row, 6).value = r.runningBalance;
    for (const col of [4, 5, 6]) {
      const cell = ws.getCell(row, col);
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    }
  });

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 14;
  ws.views = [{ state: "frozen", ySplit: 3, showGridLines: true }];

  return wb.xlsx.writeBuffer();
}
