import ExcelJS from "exceljs";
import { productColumnLabel } from "@/lib/productTableLabels";

export type OrdersExportRow = {
  date: string;
  distributorId: string;
  distributorName: string;
  invoiceNumber: string;
  orderDate: string;
  packageName: string;
  packagePrice?: number;
  packageProducts: Record<string, number>;
  subscriptionsCount: number;
  subscriptionProducts: Record<string, number>;
  memberType: string;
  repurchaseProducts: Record<string, number>;
  deliveryMethod: string;
  deliveryCourier: string;
  deliveryFee: number;
  merchantFee: number;
  totalAmount: number;
  paymentMethod: string;
  shippingFullName: string;
  contactNumber: string;
  email: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  zipCode: string;
  status: string;
  productStatus?: string;
  claimDate?: string;
};

function shortProductKey(k: string) {
  return k.replace("Chips - ", "Chips ");
}

function productCell(v: number | undefined) {
  if (v == null || v === 0) return "";
  return v;
}

function moneyCell(v: number | undefined) {
  if (v == null || v === 0) return "";
  return v;
}

export async function buildOrdersWorkbookBuffer(
  productKeys: string[],
  rows: OrdersExportRow[],
  rangeLabel: string,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders", { views: [{ showGridLines: true }] });

  ws.getCell("A1").value = `All Orders — ${rangeLabel}`;
  ws.getCell("A1").font = { bold: true, size: 12 };

  const fixedHeaders = [
    "Date",
    "Distributor ID",
    "Distributor",
    "Invoice #",
    "Order date",
    "Package",
    "Package price",
  ];
  const tailHeaders = [
    "Delivery method",
    "Courier",
    "Delivery fee",
    "Merchant fee",
    "Total amount",
    "Payment method",
    "Shipping full name",
    "Contact #",
    "Email",
    "Shipping full address",
    "Province",
    "City",
    "Region",
    "Zip",
    "Status",
    "Product status",
    "Claim date",
  ];

  const headerRow1 = 3;
  const headerRow2 = 4;
  const dataStartRow = 5;

  let col = 1;
  for (const label of fixedHeaders) {
    ws.getCell(headerRow1, col).value = label;
    ws.getCell(headerRow1, col).font = { bold: true };
    ws.mergeCells(headerRow1, col, headerRow2, col);
    ws.getCell(headerRow1, col).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    col++;
  }

  const pkgStart = col;
  for (const k of productKeys) {
    ws.getCell(headerRow2, col).value = shortProductKey(productColumnLabel(k));
    ws.getCell(headerRow2, col).font = { bold: true, size: 9 };
    ws.getCell(headerRow2, col).alignment = { horizontal: "center", wrapText: true };
    col++;
  }
  ws.getCell(headerRow1, pkgStart).value = "Package products";
  ws.getCell(headerRow1, pkgStart).font = { bold: true };
  ws.getCell(headerRow1, pkgStart).alignment = { horizontal: "center" };
  if (productKeys.length > 1) ws.mergeCells(headerRow1, pkgStart, headerRow1, col - 1);

  ws.getCell(headerRow1, col).value = "# Subs";
  ws.getCell(headerRow1, col).font = { bold: true };
  ws.mergeCells(headerRow1, col, headerRow2, col);
  col++;

  const subStart = col;
  for (const k of productKeys) {
    ws.getCell(headerRow2, col).value = shortProductKey(productColumnLabel(k));
    ws.getCell(headerRow2, col).font = { bold: true, size: 9 };
    ws.getCell(headerRow2, col).alignment = { horizontal: "center", wrapText: true };
    col++;
  }
  ws.getCell(headerRow1, subStart).value = "Subscription products";
  ws.getCell(headerRow1, subStart).font = { bold: true };
  ws.getCell(headerRow1, subStart).alignment = { horizontal: "center" };
  if (productKeys.length > 1) ws.mergeCells(headerRow1, subStart, headerRow1, col - 1);

  ws.getCell(headerRow1, col).value = "Member";
  ws.getCell(headerRow1, col).font = { bold: true };
  ws.mergeCells(headerRow1, col, headerRow2, col);
  col++;

  const repStart = col;
  for (const k of productKeys) {
    ws.getCell(headerRow2, col).value = shortProductKey(productColumnLabel(k));
    ws.getCell(headerRow2, col).font = { bold: true, size: 9 };
    ws.getCell(headerRow2, col).alignment = { horizontal: "center", wrapText: true };
    col++;
  }
  ws.getCell(headerRow1, repStart).value = "Repurchase products";
  ws.getCell(headerRow1, repStart).font = { bold: true };
  ws.getCell(headerRow1, repStart).alignment = { horizontal: "center" };
  if (productKeys.length > 1) ws.mergeCells(headerRow1, repStart, headerRow1, col - 1);

  for (const label of tailHeaders) {
    ws.getCell(headerRow1, col).value = label;
    ws.getCell(headerRow1, col).font = { bold: true };
    ws.mergeCells(headerRow1, col, headerRow2, col);
    ws.getCell(headerRow1, col).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    col++;
  }

  rows.forEach((r, idx) => {
    const rowNum = dataStartRow + idx;
    let c = 1;
    const fixedValues: (string | number)[] = [
      r.date,
      r.distributorId,
      r.distributorName,
      r.invoiceNumber,
      r.orderDate,
      r.packageName,
      moneyCell(r.packagePrice) as string | number,
    ];
    for (const val of fixedValues) {
      const cell = ws.getCell(rowNum, c++);
      cell.value = val;
      if (typeof val === "number") {
        cell.numFmt = "#,##0.##";
        cell.alignment = { horizontal: "right" };
      }
    }

    for (const k of productKeys) {
      const cell = ws.getCell(rowNum, c++);
      const val = productCell(r.packageProducts?.[k]);
      cell.value = val;
      if (typeof val === "number") cell.alignment = { horizontal: "center" };
    }

    ws.getCell(rowNum, c++).value = r.subscriptionsCount ?? 0;

    for (const k of productKeys) {
      const cell = ws.getCell(rowNum, c++);
      const val = productCell(r.subscriptionProducts?.[k]);
      cell.value = val;
      if (typeof val === "number") cell.alignment = { horizontal: "center" };
    }

    ws.getCell(rowNum, c++).value = r.memberType ?? "";

    for (const k of productKeys) {
      const cell = ws.getCell(rowNum, c++);
      const val = productCell(r.repurchaseProducts?.[k]);
      cell.value = val;
      if (typeof val === "number") cell.alignment = { horizontal: "center" };
    }

    const tailValues: (string | number)[] = [
      r.deliveryMethod,
      r.deliveryCourier,
      moneyCell(r.deliveryFee) as string | number,
      moneyCell(r.merchantFee) as string | number,
      moneyCell(r.totalAmount) as string | number,
      r.paymentMethod,
      r.shippingFullName,
      r.contactNumber,
      r.email,
      r.shippingFullAddress,
      r.province,
      r.city,
      r.region,
      r.zipCode,
      r.status,
      r.productStatus ?? "",
      r.claimDate ?? "",
    ];
    for (const val of tailValues) {
      const cell = ws.getCell(rowNum, c++);
      cell.value = val;
      if (typeof val === "number") {
        cell.numFmt = "#,##0.##";
        cell.alignment = { horizontal: "right" };
      }
    }
  });

  ws.getColumn(1).width = 11;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 14;
  ws.getColumn(10).width = 36;
  for (let i = 5; i < col; i++) {
    if (!ws.getColumn(i).width) ws.getColumn(i).width = i <= 7 ? 12 : 10;
  }

  ws.views = [{ state: "frozen", ySplit: headerRow2, xSplit: 4, showGridLines: true }];

  return wb.xlsx.writeBuffer();
}
