import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Wallet,
  CreditCard,
  QrCode,
  Copy,
  Check,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Info,
  Layers,
} from "lucide-react";
import { DashboardShell, StatusBadge, EmptyState } from "@/components/dashboard/DashboardShell";
import {
  getAccountOverview,
  getWalletFunding,
  createDepositRequest,
} from "@/lib/account.functions";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [{ title: "Wallet & Deposits — NeoSMM" }],
  }),
  component: WalletPage,
});

function WalletPage() {
  const queryClient = useQueryClient();

  const fetchOverview = useServerFn(getAccountOverview);
  const { data: accountData } = useQuery({
    queryKey: ["account-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 15_000,
  });

  const fetchWallet = useServerFn(getWalletFunding);
  const { data: walletData, isLoading: loadingWallet } = useQuery({
    queryKey: ["wallet-funding"],
    queryFn: () => fetchWallet(),
    staleTime: 15_000,
  });

  const submitDeposit = useServerFn(createDepositRequest);

  const profile = accountData?.profile;
  const balance = Number(profile?.balance ?? 0);
  const transactions = accountData?.transactions ?? [];
  const roles = accountData?.roles ?? [];
  const isAdmin = roles.includes("admin");

  const methods = walletData?.methods ?? [];
  const deposits = walletData?.deposits ?? [];

  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [amount, setAmount] = useState<number>(25);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Active method
  const activeMethod = useMemo(() => {
    if (selectedMethodId) {
      const found = methods.find((m) => m.id === selectedMethodId);
      if (found) return found;
    }
    return methods[0] ?? null;
  }, [methods, selectedMethodId]);

  function copyDestination() {
    if (!activeMethod?.destination) return;
    navigator.clipboard.writeText(activeMethod.destination);
    setCopied(true);
    toast.success("Payment address / UPI ID copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }

    setProofFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setProofDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleDepositSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeMethod) {
      toast.error("Please select a payment method.");
      return;
    }

    if (!reference.trim()) {
      toast.error("Please enter the Transaction Hash / UPI UTR reference number.");
      return;
    }

    if (amount < Number(activeMethod.min_amount) || amount > Number(activeMethod.max_amount)) {
      toast.error(
        `Amount must be between $${Number(activeMethod.min_amount)} and $${Number(activeMethod.max_amount)}`,
      );
      return;
    }

    setBusy(true);
    try {
      await submitDeposit({
        data: {
          payment_method_id: activeMethod.id,
          amount: Number(amount),
          payment_reference: reference.trim(),
          customer_notes: notes.trim() || undefined,
          proof_data_url: proofDataUrl || undefined,
        },
      });

      toast.success(
        "Deposit request submitted! Funds will be credited once network confirmations are verified.",
      );
      setReference("");
      setNotes("");
      setProofDataUrl(null);
      setProofFileName(null);
      queryClient.invalidateQueries({ queryKey: ["wallet-funding"] });
      queryClient.invalidateQueries({ queryKey: ["account-overview"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit deposit request.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-input bg-card py-2.5 px-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40";

  return (
    <DashboardShell
      title="Wallet & Balance"
      description="Add funds to your account balance using Cryptocurrency or Instant UPI."
      isAdmin={isAdmin}
    >
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Balance Overview Banner */}
        <div className="panel aurora p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-primary/30">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <ShieldCheck className="size-4" />
              <span>Atomic Balance Guarantee Active</span>
            </div>
            <p className="text-xs text-muted-foreground">Current Available Balance</p>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold text-foreground">
              {formatCurrency(balance)}
            </h2>
          </div>

          <div className="rounded-2xl bg-card/80 backdrop-blur-md p-4 border border-border space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">Pending Deposits:</span>
              <span className="font-bold text-amber-500">
                {deposits.filter((d) => d.status === "pending").length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-muted-foreground">Completed Deposits:</span>
              <span className="font-bold text-emerald-500">
                {deposits.filter((d) => d.status === "approved").length}
              </span>
            </div>
          </div>
        </div>

        {/* Deposit Interface */}
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Method Selection & Destination Details (Left 7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="panel p-6 sm:p-7 space-y-6">
              <h3 className="font-display text-lg font-bold text-foreground">
                1. Select Deposit Method
              </h3>

              {/* Payment Method Selector Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {methods.map((method) => {
                  const isSelected = activeMethod?.id === method.id;
                  const isUpi = method.kind === "upi" || method.code === "upi_pay";
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-card hover:bg-muted/40 hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display font-bold text-sm text-foreground">
                          {method.name}
                        </span>
                        {isUpi ? (
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                            Instant UPI
                          </span>
                        ) : (
                          <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                            Crypto
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">
                        Network: {method.network || "Direct"}
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-1">
                        Min: ${Number(method.min_amount)} | Max: ${Number(method.max_amount)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Method Details Box */}
              {activeMethod && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-5 animate-in fade-in">
                  <div className="space-y-1">
                    <h4 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                      <span>{activeMethod.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        ({activeMethod.network})
                      </span>
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {activeMethod.instructions}
                    </p>
                  </div>

                  {/* If UPI, display QR Code & VPA */}
                  {activeMethod.kind === "upi" || activeMethod.code === "upi_pay" ? (
                    <div className="flex flex-col sm:flex-row items-center gap-5 pt-2 border-t border-primary/20">
                      <div className="shrink-0 bg-white p-2.5 rounded-2xl shadow-md border border-border">
                        <img
                          src="/upi-qr.png"
                          alt="UPI QR Code"
                          className="size-36 object-contain rounded-xl"
                        />
                      </div>

                      <div className="space-y-3 flex-1 text-center sm:text-left">
                        <div>
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            UPI ID (VPA)
                          </span>
                          <div className="mt-1 flex items-center justify-center sm:justify-start gap-2">
                            <code className="rounded-lg bg-card px-3 py-1.5 font-mono text-xs font-bold text-foreground border border-border select-all">
                              {activeMethod.destination || "yuval69goku@fam"}
                            </code>
                            <button
                              type="button"
                              onClick={copyDestination}
                              className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="Copy UPI ID"
                            >
                              {copied ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          <p>
                            <strong>Receiver Name:</strong> Yuval Mittal
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                            Compatible with Google Pay, PhonePe, Paytm, FamPay, BHIM & all UPI apps.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Crypto Deposit Address Box */
                    <div className="space-y-2 pt-2 border-t border-primary/20">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Deposit Address ({activeMethod.network})
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={activeMethod.destination || ""}
                          className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 font-mono text-xs font-semibold text-foreground outline-none select-all"
                        />
                        <button
                          type="button"
                          onClick={copyDestination}
                          className="brand-gradient shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                        >
                          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          <span>{copied ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Deposit Verification Form (Right 5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="panel p-6 sm:p-7 space-y-6">
              <h3 className="font-display text-lg font-bold text-foreground">
                2. Submit Deposit Details
              </h3>

              <form onSubmit={handleDepositSubmit} className="space-y-4">
                {/* Deposit Amount */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Amount Deposited ($ USD equivalent)
                  </label>
                  <input
                    type="number"
                    required
                    min={activeMethod?.min_amount ?? 5}
                    max={activeMethod?.max_amount ?? 50000}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className={field}
                  />
                </div>

                {/* Payment Reference */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    {activeMethod?.kind === "upi" || activeMethod?.code === "upi_pay"
                      ? "12-Digit UPI UTR / Transaction Reference"
                      : "Transaction Hash / TxID"}
                  </label>
                  <input
                    type="text"
                    required
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={
                      activeMethod?.kind === "upi" || activeMethod?.code === "upi_pay"
                        ? "e.g. 412356789012"
                        : "e.g. 0x8f3c... or bc1q..."
                    }
                    className={field}
                  />
                </div>

                {/* Proof Screenshot Upload */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Payment Screenshot (Optional but recommended)
                  </label>
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-4 text-center hover:bg-muted/40 transition-colors">
                    <UploadCloud className="size-6 text-muted-foreground mb-1" />
                    <span className="text-xs font-semibold text-foreground">
                      {proofFileName ? proofFileName : "Click to upload receipt screenshot"}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      PNG, JPEG, WebP, or PDF up to 5MB
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Sender name or additional transfer details..."
                    className={field}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !activeMethod || !reference.trim()}
                  className="brand-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                  <span>Submit Deposit Request</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Deposit History Section */}
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-foreground">Deposit Requests</h3>

          {deposits.length === 0 ? (
            <EmptyState
              title="No deposit requests yet"
              body="When you submit a cryptocurrency or UPI deposit, you can track verification status here."
            />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-3">Request #</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reference / TxID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deposits.map((dep) => (
                    <tr key={dep.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        #{dep.request_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {(dep as any).payment_methods?.name || "Deposit"}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-500">
                        +{formatCurrency(Number(dep.amount))}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] font-mono text-muted-foreground truncate">
                        {dep.payment_reference}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={dep.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(dep.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transactions Ledger */}
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-foreground">Account Transactions</h3>

          {transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              body="Order deductions, deposit credits, and refunds will be logged here in your ledger."
            />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Balance After</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.slice(0, 15).map((tx) => {
                    const isCredit = Number(tx.amount) > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                              isCredit
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="size-3" />
                            ) : (
                              <ArrowUpRight className="size-3" />
                            )}
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium max-w-[280px] truncate">
                          {tx.description}
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            isCredit ? "text-emerald-500" : "text-foreground"
                          }`}
                        >
                          {isCredit ? "+" : ""}
                          {formatCurrency(Number(tx.amount))}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {formatCurrency(Number(tx.balance_after))}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
