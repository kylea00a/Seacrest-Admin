"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { roundWeight2 } from "@/data/admin/productSettings";
import type { AdminPackageItem, AdminProductItem, AdminSettings } from "@/data/admin/types";
import ShippingCouriersEditor from "./ShippingCouriersEditor";

function moneyStr(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n === Math.floor(n) ? String(n) : String(n);
}

/** Allow typing decimals with up to 2 fractional digits (e.g. 1.25). */
const WEIGHT_TYPING_RE = /^\d*\.?\d{0,2}$/;

function WeightInput2dp({
  value,
  onChange,
  className,
  placeholder = "0",
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      if (!Number.isFinite(value) || value === 0) setText("");
      else setText(String(roundWeight2(value)));
    }
  }, [value]);

  return (
    <input
      className={className}
      inputMode="decimal"
      autoComplete="off"
      step="0.01"
      placeholder={placeholder}
      value={text}
      onFocus={() => {
        focused.current = true;
        setText(Number.isFinite(value) && value !== 0 ? String(roundWeight2(value)) : "");
      }}
      onChange={(e) => {
        let t = e.target.value.replace(",", ".");
        if (t === "" || WEIGHT_TYPING_RE.test(t)) {
          setText(t);
          if (t === "" || t === ".") onChange(0);
          else {
            const n = parseFloat(t);
            if (!Number.isNaN(n)) onChange(roundWeight2(n));
          }
        }
      }}
      onBlur={() => {
        focused.current = false;
        const n = parseFloat(text);
        const final = Number.isNaN(n) ? 0 : roundWeight2(n);
        onChange(final);
        setText(final === 0 ? "" : String(final));
      }}
    />
  );
}

export type PackagesProductsEditorProps = {
  /** When false, render a smaller heading for embedding under Settings. */
  standalone?: boolean;
};

export default function PackagesProductsEditor({ standalone = true }: PackagesProductsEditorProps) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftProducts, setDraftProducts] = useState<AdminProductItem[]>([]);
  const [draftPackages, setDraftPackages] = useState<AdminPackageItem[]>([]);

  const [newProduct, setNewProduct] = useState({ name: "", membersPrice: "", srp: "", weight: "" });
  const [newPkg, setNewPkg] = useState({
    name: "",
    code: "",
    packagePrice: "",
    affiliatePrice: "",
    weight: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const json = (await res.json()) as { settings?: AdminSettings; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const s = json.settings ?? null;
      setSettings(s);
      if (s) {
        setDraftProducts(s.products?.length ? [...s.products] : []);
        setDraftPackages(s.packages?.length ? [...s.packages] : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePartial = async (next: Partial<Pick<AdminSettings, "packages" | "products">>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = (await res.json()) as { settings?: AdminSettings; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const s = json.settings ?? null;
      setSettings(s);
      if (s) {
        setDraftProducts(s.products?.length ? [...s.products] : []);
        setDraftPackages(s.packages?.length ? [...s.packages] : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveProducts = async () => {
    const names = new Set<string>();
    for (const p of draftProducts) {
      const n = p.name.trim();
      if (!n) {
        setError("Each product needs a name.");
        return;
      }
      if (names.has(n)) {
        setError(`Duplicate product name: ${n}`);
        return;
      }
      names.add(n);
    }
    await savePartial({ products: draftProducts });
  };

  const savePackages = async () => {
    const codes = new Set<string>();
    for (const p of draftPackages) {
      if (!p.name.trim() || !p.code.trim() || !Number.isFinite(p.packagePrice) || !Number.isFinite(p.affiliatePrice)) {
        setError("Each package needs name, code, package price, and affiliate price.");
        return;
      }
      if (codes.has(p.code)) {
        setError(`Duplicate package code: ${p.code}`);
        return;
      }
      codes.add(p.code);
    }
    await savePartial({ packages: draftPackages });
  };

  const addProductRow = () => {
    const name = newProduct.name.trim();
    if (!name) {
      setError("Enter a product name to add.");
      return;
    }
    if (draftProducts.some((p) => p.name.trim() === name)) {
      setError(`Product "${name}" already exists.`);
      return;
    }
    const membersPrice = Number(newProduct.membersPrice);
    const srp = Number(newProduct.srp);
    const weight = roundWeight2(parseFloat(newProduct.weight) || 0);
    setDraftProducts((prev) => [
      ...prev,
      {
        name,
        membersPrice: Number.isFinite(membersPrice) ? membersPrice : 0,
        srp: Number.isFinite(srp) ? srp : 0,
        weight,
      },
    ]);
    setNewProduct({ name: "", membersPrice: "", srp: "", weight: "" });
    setError(null);
  };

  const updateProduct = (index: number, patch: Partial<AdminProductItem>) => {
    setDraftProducts((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      next[index] = { ...cur, ...patch };
      return next;
    });
  };

  const removeProductAt = (index: number) => {
    setDraftProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const addPackageRow = () => {
    const name = newPkg.name.trim();
    const code =
      newPkg.code.trim() || `${name.replace(/\s+/g, "")}-P${newPkg.packagePrice}`.replace(/^-/, "");
    const packagePrice = Number(newPkg.packagePrice);
    const affiliatePrice = Number(newPkg.affiliatePrice || newPkg.packagePrice);
    const weight = roundWeight2(parseFloat(newPkg.weight) || 0);
    if (!name || !Number.isFinite(packagePrice) || !Number.isFinite(affiliatePrice)) {
      setError("Package name, numeric package price, and numeric affiliate price are required.");
      return;
    }
    if (draftPackages.some((p) => p.code === code)) {
      setError(`Package code "${code}" already exists.`);
      return;
    }
    setDraftPackages((prev) => [
      ...prev,
      {
        name,
        code,
        packagePrice,
        affiliatePrice,
        weight,
      },
    ]);
    setNewPkg({ name: "", code: "", packagePrice: "", affiliatePrice: "", weight: "" });
    setError(null);
  };

  const updatePackage = (index: number, patch: Partial<AdminPackageItem>) => {
    setDraftPackages((prev) => {
      const next = [...prev];
      const cur = next[index];
      if (!cur) return prev;
      next[index] = { ...cur, ...patch };
      return next;
    });
  };

  const removePackageAt = (index: number) => {
    setDraftPackages((prev) => prev.filter((_, i) => i !== index));
  };

  const packageRowOrder = useMemo(() => {
    return draftPackages
      .map((p, i) => ({ i, p }))
      .sort((a, b) => a.p.packagePrice - b.p.packagePrice)
      .map((x) => x.i);
  }, [draftPackages]);

  const titleClass = standalone ? "admin-title" : "text-lg font-semibold tracking-tight text-white";

  return (
    <div className="space-y-6">
      {standalone ? (
        <h1 className={titleClass}>Packages and Products</h1>
      ) : (
        <h2 className={titleClass}>Packages and products</h2>
      )}
      <div className={standalone ? "admin-muted" : "text-sm leading-relaxed text-zinc-400"}>
        {standalone
          ? "Manage packages and products. Product names drive order/import columns; package codes match prices for display."
          : "Same data as the Packages & Products page — one product per row (members price, SRP, weight); packages with name, price, and weight."}
      </div>

      {loading ? <div className="text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error">{error}</div> : null}

      <div className="mt-6 grid gap-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Products</div>
              <div className="mt-1 text-xs text-zinc-400">
                One row per product. Names must match spreadsheet columns where possible.
              </div>
            </div>
            <div className="text-xs text-zinc-400">{draftProducts.length} items</div>
          </div>

          <div className="admin-table-wrap mt-4">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-zinc-950/80 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Members price</th>
                  <th className="px-3 py-2 text-right">SRP</th>
                  <th className="px-3 py-2 text-right">Weight</th>
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {draftProducts.map((p, i) => (
                  <tr key={`${p.name}-${i}`} className="border-b border-white/[0.05]">
                    <td className="px-3 py-2 align-middle">
                      <input
                        value={p.name}
                        onChange={(e) => updateProduct(i, { name: e.target.value })}
                        className="admin-input w-full min-w-[10rem]"
                        placeholder="Name"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        value={moneyStr(p.membersPrice)}
                        onChange={(e) => updateProduct(i, { membersPrice: Number(e.target.value) || 0 })}
                        inputMode="decimal"
                        className="admin-input w-full text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <input
                        value={moneyStr(p.srp)}
                        onChange={(e) => updateProduct(i, { srp: Number(e.target.value) || 0 })}
                        inputMode="decimal"
                        className="admin-input w-full text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <WeightInput2dp
                        value={p.weight}
                        onChange={(n) => updateProduct(i, { weight: n })}
                        className="admin-input w-full text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => removeProductAt(i)}
                        disabled={saving}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <input
              value={newProduct.name}
              onChange={(e) => setNewProduct((x) => ({ ...x, name: e.target.value }))}
              className="admin-input"
              placeholder="New product name"
            />
            <input
              value={newProduct.membersPrice}
              onChange={(e) => setNewProduct((x) => ({ ...x, membersPrice: e.target.value }))}
              inputMode="decimal"
              className="admin-input"
              placeholder="Members price"
            />
            <input
              value={newProduct.srp}
              onChange={(e) => setNewProduct((x) => ({ ...x, srp: e.target.value }))}
              inputMode="decimal"
              className="admin-input"
              placeholder="SRP"
            />
            <input
              value={newProduct.weight}
              onChange={(e) => {
                const t = e.target.value.replace(",", ".");
                if (t === "" || WEIGHT_TYPING_RE.test(t)) setNewProduct((x) => ({ ...x, weight: t }));
              }}
              inputMode="decimal"
              step="0.01"
              className="admin-input"
              placeholder="Weight (e.g. 1.25)"
            />
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
              <button type="button" onClick={addProductRow} disabled={saving} className="admin-btn-primary w-full sm:w-auto">
                Add row
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void saveProducts()} disabled={saving} className="admin-btn-primary">
              Save products
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Packages</div>
              <div className="mt-1 text-xs text-zinc-400">
                Code is used to match package labels (e.g. Standard-P2996). Package price is the total shown in Orders;
                affiliate price is the package-alone portion (Sales Report uses affiliate only).
              </div>
            </div>
            <div className="text-xs text-zinc-400">{draftPackages.length} items</div>
          </div>

          <div className="admin-table-wrap mt-4">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-zinc-950/80 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2">Package name</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2 text-right">Price (package)</th>
                  <th className="px-3 py-2 text-right">Price (affiliate)</th>
                  <th className="px-3 py-2 text-right">Weight</th>
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {packageRowOrder.map((index) => {
                  const p = draftPackages[index];
                  if (!p) return null;
                  return (
                    <tr key={`${index}-${p.code}`} className="border-b border-white/[0.05]">
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={p.name}
                          onChange={(e) => updatePackage(index, { name: e.target.value })}
                          className="admin-input w-full min-w-[8rem]"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={p.code}
                          onChange={(e) => updatePackage(index, { code: e.target.value })}
                          className="admin-input w-full min-w-[8rem]"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={moneyStr(p.packagePrice)}
                          onChange={(e) => updatePackage(index, { packagePrice: Number(e.target.value) || 0 })}
                          inputMode="decimal"
                          className="admin-input w-full text-right"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          value={moneyStr(p.affiliatePrice)}
                          onChange={(e) => updatePackage(index, { affiliatePrice: Number(e.target.value) || 0 })}
                          inputMode="decimal"
                          className="admin-input w-full text-right"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <WeightInput2dp
                          value={p.weight}
                          onChange={(n) => updatePackage(index, { weight: n })}
                          className="admin-input w-full text-right"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => removePackageAt(index)}
                          disabled={saving}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-6">
            <input
              value={newPkg.name}
              onChange={(e) => setNewPkg((x) => ({ ...x, name: e.target.value }))}
              className="admin-input"
              placeholder="Package name"
            />
            <input
              value={newPkg.code}
              onChange={(e) => setNewPkg((x) => ({ ...x, code: e.target.value }))}
              className="admin-input"
              placeholder="Code (optional)"
            />
            <input
              value={newPkg.packagePrice}
              onChange={(e) => setNewPkg((x) => ({ ...x, packagePrice: e.target.value }))}
              inputMode="decimal"
              className="admin-input"
              placeholder="Price (package)"
            />
            <input
              value={newPkg.affiliatePrice}
              onChange={(e) => setNewPkg((x) => ({ ...x, affiliatePrice: e.target.value }))}
              inputMode="decimal"
              className="admin-input"
              placeholder="Price (affiliate)"
            />
            <input
              value={newPkg.weight}
              onChange={(e) => {
                const t = e.target.value.replace(",", ".");
                if (t === "" || WEIGHT_TYPING_RE.test(t)) setNewPkg((x) => ({ ...x, weight: t }));
              }}
              inputMode="decimal"
              step="0.01"
              className="admin-input"
              placeholder="Weight (e.g. 1.25)"
            />
            <div className="flex items-center">
              <button type="button" onClick={addPackageRow} disabled={saving} className="admin-btn-primary w-full sm:w-auto">
                Add package
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void savePackages()} disabled={saving} className="admin-btn-primary">
              Save packages
            </button>
          </div>
        </div>

        {standalone ? <ShippingCouriersEditor /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void load()} className="admin-btn-secondary">
          Reload from disk
        </button>
        {saving ? <span className="text-xs text-zinc-400">Saving…</span> : null}
        {settings?.updatedAt ? (
          <span className="text-xs text-zinc-500">Last saved: {new Date(settings.updatedAt).toLocaleString()}</span>
        ) : null}
      </div>
      <div className="text-xs text-zinc-500">Data file: `data/admin/settings.json`</div>
    </div>
  );
}
