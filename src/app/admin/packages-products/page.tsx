import PackagesProductsEditor from "../_components/PackagesProductsEditor";

export default function PackagesProductsPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="admin-card">
        <PackagesProductsEditor standalone />
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">Notes</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>Product names should align with your Excel headers so imports map quantities correctly.</div>
          <div>Package prices are matched to order rows to show a clean package name in compiled data.</div>
          <div>Click <span className="text-zinc-300">Save products</span> or <span className="text-zinc-300">Save packages</span> after editing.</div>
        </div>
      </div>
    </div>
  );
}
