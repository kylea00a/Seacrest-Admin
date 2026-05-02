/** Column titles shared by Packing PDF and Delivery table (matches Excel/import labels). */
export function productColumnLabel(productKey: string): string {
  if (productKey === "Radiance Coffee") return "SeaSkin Radiance";
  if (productKey === "Seahealth Coffee") return "SeaHealth Coffee";
  if (productKey === "Supreme") return "SeaSkin Supreme";
  return productKey;
}
