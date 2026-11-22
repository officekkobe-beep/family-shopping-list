"use client";

import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  History,
  Home,
  Landmark,
  RefreshCw,
  Save,
  Settings,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applicableRule,
  balanceDescription,
  calculateDraft,
  currentUnsettledBalance,
  formatYen,
  monthLabel,
  monthStart,
  nextMonth,
  previousBudgetCarry,
  type HouseholdPeriod,
  type HouseholdRule,
  type HouseholdSettings,
  type HouseholdSettlement,
  type SettlementDirection,
} from "@/lib/household";
import { getSupabaseClient } from "@/lib/supabase";

type Tab = "status" | "history" | "settings";

function todayLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function monthInputValue(month: string) {
  return month.slice(0, 7);
}

function toMonthStart(value: string) {
  return `${value}-01`;
}

export function HouseholdApp({ shareKey }: { shareKey: string }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(shareKey), [shareKey]);
  const [tab, setTab] = useState<Tab>("status");
  const [settings, setSettings] = useState<HouseholdSettings | null>(null);
  const [rules, setRules] = useState<HouseholdRule[]>([]);
  const [periods, setPeriods] = useState<HouseholdPeriod[]>([]);
  const [settlements, setSettlements] = useState<HouseholdSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [kenjiPaid, setKenjiPaid] = useState("0");
  const [asamiDebit, setAsamiDebit] = useState("0");
  const [asamiCash, setAsamiCash] = useState("0");
  const [settlementDate, setSettlementDate] = useState(todayLocal());
  const [settlementAmount, setSettlementAmount] = useState("");
  const [ruleMonth, setRuleMonth] = useState("");
  const [ruleKenji, setRuleKenji] = useState("67");
  const [ruleBudget, setRuleBudget] = useState("250000");
  const [openingCarry, setOpeningCarry] = useState("80618");

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 4200);
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setSyncing(true);
    const [settingsResult, rulesResult, periodsResult, settlementsResult] =
      await Promise.all([
        supabase.from("household_settings").select("*").eq("id", "default").maybeSingle(),
        supabase.from("household_rules").select("*").order("effective_month", { ascending: true }),
        supabase.from("household_periods").select("*").order("period_month", { ascending: true }),
        supabase
          .from("household_settlements")
          .select("*")
          .order("settlement_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    const error =
      settingsResult.error ||
      rulesResult.error ||
      periodsResult.error ||
      settlementsResult.error;

    if (error) {
      showMessage("家計データを取得できませんでした。");
      setLoading(false);
      setSyncing(false);
      return;
    }

    const nextSettings = (settingsResult.data || null) as HouseholdSettings | null;
    const nextRules = (rulesResult.data || []) as HouseholdRule[];
    const nextPeriods = (periodsResult.data || []) as HouseholdPeriod[];
    const nextSettlements = (settlementsResult.data || []) as HouseholdSettlement[];

    setSettings(nextSettings);
    setRules(nextRules);
    setPeriods(nextPeriods);
    setSettlements(nextSettlements);
    setOpeningCarry(String(nextSettings?.opening_budget_carry_yen ?? 0));

    const earliestDraft = nextPeriods.find((period) => period.status === "draft");
    const confirmed = nextPeriods.filter((period) => period.status === "confirmed");
    const latestConfirmed = confirmed.at(-1);
    const suggestedMonth =
      earliestDraft?.period_month ||
      (latestConfirmed ? nextMonth(latestConfirmed.period_month) : monthStart());

    setSelectedMonth((current) => current || suggestedMonth);

    const currentRule = applicableRule(nextRules, suggestedMonth);
    if (currentRule) {
      setRuleKenji(String(currentRule.kenji_percent));
      setRuleBudget(String(currentRule.budget_limit_yen));
    }
    setRuleMonth(monthInputValue(suggestedMonth));

    setLoading(false);
    setSyncing(false);
  }, [showMessage, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!supabase) return;
    const timer = window.setInterval(() => void loadData(), 15000);
    const channel = supabase
      .channel("family-household-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shopping_events" },
        () => void loadData(),
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  const selectedPeriod = periods.find((period) => period.period_month === selectedMonth) || null;

  useEffect(() => {
    if (!selectedPeriod) {
      setKenjiPaid("0");
      setAsamiDebit("0");
      setAsamiCash("0");
      return;
    }
    setKenjiPaid(String(selectedPeriod.kenji_paid_yen));
    setAsamiDebit(String(selectedPeriod.asami_debit_yen));
    setAsamiCash(String(selectedPeriod.asami_cash_yen));
  }, [selectedPeriod]);

  const confirmedPeriods = periods.filter((period) => period.status === "confirmed");
  const latestConfirmed = confirmedPeriods.at(-1) || null;
  const earliestDraft = periods.find((period) => period.status === "draft") || null;
  const lastSettlement = settlements.at(-1) || null;
  const unsettledBalance = currentUnsettledBalance(periods, settlements);
  const unsettled = balanceDescription(unsettledBalance);
  const currentBudgetCarry =
    latestConfirmed?.budget_carry_balance_yen ?? settings?.opening_budget_carry_yen ?? 0;

  const selectedRule = applicableRule(rules, selectedMonth || monthStart());
  const previousCarry = previousBudgetCarry(periods, settings, selectedMonth || monthStart());
  const draftCalc =
    selectedRule && selectedMonth
      ? calculateDraft(
          {
            kenji_paid_yen: numberValue(kenjiPaid),
            asami_debit_yen: numberValue(asamiDebit),
            asami_cash_yen: numberValue(asamiCash),
          },
          selectedRule,
          previousCarry,
        )
      : null;

  const nextUnconfirmedMonth =
    earliestDraft?.period_month ||
    (latestConfirmed ? nextMonth(latestConfirmed.period_month) : monthStart());

  useEffect(() => {
    if (unsettled.amount > 0 && !settlementAmount) {
      setSettlementAmount(String(unsettled.amount));
    }
  }, [settlementAmount, unsettled.amount]);

  const ensureDraft = async (month: string) => {
    if (!supabase) return null;
    const existing = periods.find((period) => period.period_month === month);
    if (existing) {
      setSelectedMonth(month);
      return existing;
    }
    const payload = {
      id: crypto.randomUUID(),
      period_month: month,
      status: "draft",
      kenji_paid_yen: 0,
      asami_debit_yen: 0,
      asami_cash_yen: 0,
    };
    const { data, error } = await supabase
      .from("household_periods")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      showMessage(error.message.includes("duplicate") ? "この月はすでに登録されています。" : "未確定月を作成できませんでした。");
      return null;
    }
    await loadData();
    setSelectedMonth(month);
    return data as HouseholdPeriod;
  };

  const saveDraft = async () => {
    if (!supabase || !selectedMonth) return false;
    if (selectedPeriod?.status === "confirmed") {
      showMessage("確定済みの月は変更できません。");
      return false;
    }
    const period = selectedPeriod || (await ensureDraft(selectedMonth));
    if (!period) return false;

    const { error } = await supabase
      .from("household_periods")
      .update({
        kenji_paid_yen: numberValue(kenjiPaid),
        asami_debit_yen: numberValue(asamiDebit),
        asami_cash_yen: numberValue(asamiCash),
      })
      .eq("id", period.id);

    if (error) {
      showMessage("一時保存できませんでした。");
      return false;
    }
    await loadData();
    showMessage("未確定データを保存しました。");
    return true;
  };

  const confirmPeriod = async () => {
    if (!supabase || !selectedMonth) return;
    const saved = await saveDraft();
    if (!saved) return;
    const { error } = await supabase.rpc("confirm_household_period", {
      p_period_month: selectedMonth,
    });
    if (error) {
      showMessage(error.message || "確定できませんでした。");
      return;
    }
    setShowConfirm(false);
    await loadData();
    showMessage(`${monthLabel(selectedMonth)}を確定しました。`);
  };

  const registerSettlement = async () => {
    if (!supabase || unsettled.amount <= 0) return;
    const amount = numberValue(settlementAmount);
    if (amount <= 0 || amount > unsettled.amount) {
      showMessage("精算金額は未精算残高の範囲内で入力してください。");
      return;
    }
    const direction: SettlementDirection =
      unsettledBalance > 0 ? "asami_to_kenji" : "kenji_to_asami";
    const { error } = await supabase.rpc("register_household_settlement", {
      p_settlement_date: settlementDate,
      p_direction: direction,
      p_amount_yen: amount,
    });
    if (error) {
      showMessage(error.message || "精算を登録できませんでした。");
      return;
    }
    setSettlementAmount("");
    await loadData();
    showMessage("精算を登録しました。");
  };

  const saveRule = async () => {
    if (!supabase || !ruleMonth) return;
    const kenji = Number(ruleKenji);
    const asami = 100 - kenji;
    const budget = numberValue(ruleBudget);
    if (!Number.isFinite(kenji) || kenji < 0 || kenji > 100 || asami < 0) {
      showMessage("負担割合を確認してください。");
      return;
    }
    if (budget <= 0) {
      showMessage("月上限金額を入力してください。");
      return;
    }
    const effectiveMonth = toMonthStart(ruleMonth);
    const { error } = await supabase
      .from("household_rules")
      .upsert(
        {
          effective_month: effectiveMonth,
          kenji_percent: kenji,
          asami_percent: asami,
          budget_limit_yen: budget,
        },
        { onConflict: "effective_month" },
      );
    if (error) {
      showMessage(error.message || "設定を保存できませんでした。");
      return;
    }
    await loadData();
    showMessage("負担割合・月上限を保存しました。");
  };

  const saveOpeningCarry = async () => {
    if (!supabase || !settings) return;
    if (confirmedPeriods.length > 0) {
      showMessage("確定済みデータがあるため開始残高は変更できません。");
      return;
    }
    const { error } = await supabase
      .from("household_settings")
      .update({ opening_budget_carry_yen: numberValue(openingCarry) })
      .eq("id", "default");
    if (error) {
      showMessage("開始残高を保存できませんでした。");
      return;
    }
    await loadData();
    showMessage("予算繰越の開始残高を保存しました。");
  };

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f4] text-[#17211b]">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCw className="animate-spin" size={18} /> 読み込み中
        </div>
      </main>
    );
  }

  const homePath = `/f/${shareKey}`;

  return (
    <div className="min-h-dvh bg-[#f7f8f4] pb-24 text-[#17211b]">
      <header className="sticky top-0 z-20 border-b border-[#d6ddd2] bg-[#f7f8f4]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d6ddd2] bg-white"
              onClick={() => router.push(homePath)}
              aria-label="家族アプリへ戻る"
            >
              <Home size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold text-[#667264]">家族アプリ</p>
              <h1 className="text-xl font-bold">家計</h1>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#667264]">
            {syncing ? "同期中" : "同期済み"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {tab === "status" && (
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2">
              <InfoCard
                label="確定状況"
                value={latestConfirmed ? `${monthLabel(latestConfirmed.period_month)}まで` : "まだ確定なし"}
                sub={earliestDraft ? `${monthLabel(earliestDraft.period_month)}が未確定` : "未確定データなし"}
              />
              <InfoCard
                label="最終精算"
                value={lastSettlement ? lastSettlement.settlement_date.replaceAll("-", "/") : "まだ精算なし"}
                sub={lastSettlement ? `前回 ${formatYen(lastSettlement.amount_yen)}` : "必要なときに精算できます"}
              />
            </section>

            <section className="rounded-2xl border border-[#d6ddd2] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#667264]">現在の未精算残高</p>
                  {unsettled.amount > 0 ? (
                    <>
                      <p className="mt-2 text-lg font-bold">{unsettled.direction}</p>
                      <p className="mt-1 text-4xl font-black tracking-tight">{formatYen(unsettled.amount)}</p>
                      <p className="mt-2 text-sm text-[#667264]">
                        {unsettled.overpayer}が負担割合より{formatYen(unsettled.amount)}多く支払っています。
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-2xl font-bold text-[#1d6f42]">未精算残高なし</p>
                      <p className="mt-2 text-sm text-[#667264]">現在の負担差額はありません。</p>
                    </>
                  )}
                </div>
                <CircleDollarSign className="text-[#1d6f42]" size={28} />
              </div>

              {unsettled.amount > 0 && (
                <div className="mt-5 rounded-xl bg-[#f7f8f4] p-4">
                  <label className="block text-sm font-bold">今回の精算額</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-[#cfd8cb] bg-white px-3 py-3 text-right text-lg font-bold outline-none"
                      inputMode="numeric"
                      value={settlementAmount}
                      onChange={(event) => setSettlementAmount(event.target.value)}
                    />
                    <span className="self-center font-bold">円</span>
                  </div>
                  <label className="mt-3 block text-sm font-bold">精算日</label>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-lg border border-[#cfd8cb] bg-white px-3 py-3"
                    value={settlementDate}
                    onChange={(event) => setSettlementDate(event.target.value)}
                  />
                  <p className="mt-2 text-xs text-[#667264]">
                    一部精算できます。残額は未精算残高として残ります。
                  </p>
                  <button
                    className="mt-3 min-h-12 w-full rounded-xl bg-[#17211b] px-4 font-bold text-white"
                    onClick={registerSettlement}
                  >
                    精算を登録
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#d6ddd2] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#667264]">予算繰越残高</p>
                  <p className="mt-1 text-3xl font-black">{formatYen(currentBudgetCarry)}</p>
                </div>
                <Landmark className="text-[#745a00]" size={28} />
              </div>
              <p className="mt-2 text-sm leading-6 text-[#667264]">
                月上限との差額を積み上げた残高です。未精算残高とは別に管理します。
              </p>
            </section>

            <section className="rounded-2xl border border-[#d6ddd2] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#667264]">次に確認する月</p>
                  <p className="mt-1 text-2xl font-bold">{monthLabel(nextUnconfirmedMonth)}</p>
                </div>
                <CalendarCheck className="text-[#1d6f42]" size={28} />
              </div>

              <button
                className="mt-4 flex min-h-12 w-full items-center justify-between rounded-xl bg-[#1d6f42] px-4 font-bold text-white"
                onClick={async () => {
                  await ensureDraft(nextUnconfirmedMonth);
                  setSelectedMonth(nextUnconfirmedMonth);
                }}
              >
                入力を続ける <ChevronRight size={19} />
              </button>
            </section>

            {selectedMonth && selectedPeriod?.status !== "confirmed" && (
              <DraftEditor
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                kenjiPaid={kenjiPaid}
                setKenjiPaid={setKenjiPaid}
                asamiDebit={asamiDebit}
                setAsamiDebit={setAsamiDebit}
                asamiCash={asamiCash}
                setAsamiCash={setAsamiCash}
                rule={selectedRule}
                calc={draftCalc}
                saveDraft={saveDraft}
                onConfirm={() => setShowConfirm(true)}
              />
            )}
          </div>
        )}

        {tab === "history" && (
          <section className="space-y-3">
            <div className="mb-4">
              <h2 className="text-2xl font-bold">履歴</h2>
              <p className="mt-1 text-sm text-[#667264]">確定済みは閲覧のみです。</p>
            </div>
            {periods.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#bec8ba] bg-white p-8 text-center text-[#667264]">
                まだ月次データがありません。
              </div>
            )}
            {[...periods].reverse().map((period) => {
              const isConfirmed = period.status === "confirmed";
              return (
                <button
                  key={period.id}
                  className="w-full rounded-xl border border-[#d6ddd2] bg-white p-4 text-left"
                  onClick={() => {
                    setSelectedMonth(period.period_month);
                    setTab("status");
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">{monthLabel(period.period_month)}</p>
                      <p className="mt-1 text-sm text-[#667264]">
                        {isConfirmed
                          ? `支出 ${formatYen(period.total_paid_yen)} / 予算差額 ${formatYen(period.budget_delta_yen)}`
                          : "未確定"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        isConfirmed ? "bg-[#dff2e1] text-[#236330]" : "bg-[#fff1c2] text-[#745a00]"
                      }`}
                    >
                      {isConfirmed ? "確定済" : "未確定"}
                    </span>
                  </div>
                </button>
              );
            })}

            <div className="pt-5">
              <h3 className="mb-3 text-lg font-bold">精算履歴</h3>
              {settlements.length === 0 ? (
                <p className="text-sm text-[#667264]">精算履歴はありません。</p>
              ) : (
                <div className="space-y-2">
                  {[...settlements].reverse().map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#d6ddd2] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold">
                            {item.direction === "asami_to_kenji" ? "あさみ → けんじ" : "けんじ → あさみ"}
                          </p>
                          <p className="mt-1 text-sm text-[#667264]">{item.settlement_date}</p>
                        </div>
                        <p className="text-lg font-black">{formatYen(item.amount_yen)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">設定</h2>
              <p className="mt-1 text-sm text-[#667264]">
                新しい設定は未確定月から適用します。確定済みの月は変わりません。
              </p>
            </div>

            <div className="rounded-2xl border border-[#d6ddd2] bg-white p-5">
              <h3 className="text-lg font-bold">負担割合・月上限</h3>
              <label className="mt-4 block text-sm font-bold">適用開始月</label>
              <input
                type="month"
                className="mt-2 w-full rounded-lg border border-[#cfd8cb] px-3 py-3"
                value={ruleMonth}
                onChange={(event) => setRuleMonth(event.target.value)}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-sm font-bold">
                  けんじ %
                  <input
                    className="mt-2 w-full rounded-lg border border-[#cfd8cb] px-3 py-3 text-right"
                    inputMode="decimal"
                    value={ruleKenji}
                    onChange={(event) => setRuleKenji(event.target.value)}
                  />
                </label>
                <label className="text-sm font-bold">
                  あさみ %
                  <input
                    className="mt-2 w-full rounded-lg border border-[#e3e7df] bg-[#f3f5f1] px-3 py-3 text-right"
                    value={String(100 - (Number(ruleKenji) || 0))}
                    readOnly
                  />
                </label>
              </div>
              <label className="mt-3 block text-sm font-bold">月上限金額</label>
              <div className="mt-2 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[#cfd8cb] px-3 py-3 text-right"
                  inputMode="numeric"
                  value={ruleBudget}
                  onChange={(event) => setRuleBudget(event.target.value)}
                />
                <span className="self-center font-bold">円</span>
              </div>
              <button
                className="mt-4 min-h-12 w-full rounded-xl bg-[#17211b] px-4 font-bold text-white"
                onClick={saveRule}
              >
                設定を保存
              </button>
            </div>

            <div className="rounded-2xl border border-[#d6ddd2] bg-white p-5">
              <h3 className="text-lg font-bold">予算繰越の開始残高</h3>
              <p className="mt-1 text-sm text-[#667264]">
                最初の月を確定する前だけ変更できます。
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-[#cfd8cb] px-3 py-3 text-right"
                  inputMode="numeric"
                  value={openingCarry}
                  disabled={confirmedPeriods.length > 0}
                  onChange={(event) => setOpeningCarry(event.target.value)}
                />
                <span className="self-center font-bold">円</span>
              </div>
              <button
                className="mt-4 min-h-12 w-full rounded-xl border border-[#17211b] bg-white px-4 font-bold"
                disabled={confirmedPeriods.length > 0}
                onClick={saveOpeningCarry}
              >
                開始残高を保存
              </button>
            </div>

            <div className="rounded-2xl border border-[#d6ddd2] bg-white p-5">
              <h3 className="text-lg font-bold">設定履歴</h3>
              <div className="mt-3 space-y-2">
                {[...rules].reverse().map((rule) => (
                  <div key={rule.id} className="rounded-xl bg-[#f7f8f4] p-3">
                    <p className="font-bold">{monthLabel(rule.effective_month)}から</p>
                    <p className="mt-1 text-sm text-[#667264]">
                      けんじ {rule.kenji_percent}% / あさみ {rule.asami_percent}% ・ 上限 {formatYen(rule.budget_limit_yen)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#d6ddd2] bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <NavButton active={tab === "status"} label="状況" icon={<WalletCards size={20} />} onClick={() => setTab("status")} />
          <NavButton active={tab === "history"} label="履歴" icon={<History size={20} />} onClick={() => setTab("history")} />
          <NavButton active={tab === "settings"} label="設定" icon={<Settings size={20} />} onClick={() => setTab("settings")} />
        </div>
      </nav>

      {showConfirm && selectedRule && draftCalc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-[#1d6f42]" />
              <h2 className="text-xl font-bold">確定内容を確認</h2>
            </div>
            <div className="mt-4 space-y-2 rounded-xl bg-[#f7f8f4] p-4 text-sm">
              <ConfirmRow label="対象月" value={monthLabel(selectedMonth)} />
              <ConfirmRow label="けんじ支払" value={formatYen(numberValue(kenjiPaid))} />
              <ConfirmRow label="あさみ デビット" value={formatYen(numberValue(asamiDebit))} />
              <ConfirmRow label="あさみ 現金" value={formatYen(numberValue(asamiCash))} />
              <ConfirmRow label="総支出" value={formatYen(draftCalc.totalPaid)} />
              <ConfirmRow label="負担割合" value={`けんじ ${selectedRule.kenji_percent}% / あさみ ${selectedRule.asami_percent}%`} />
              <ConfirmRow label="未精算への増減" value={signedYen(draftCalc.unsettledDelta)} />
              <ConfirmRow label="月上限" value={formatYen(selectedRule.budget_limit_yen)} />
              <ConfirmRow label="予算差額" value={signedYen(draftCalc.budgetDelta)} />
              <ConfirmRow label="確定後の予算繰越" value={formatYen(draftCalc.budgetCarryAfter)} />
            </div>
            <p className="mt-4 rounded-xl bg-[#fff1c2] p-3 text-sm font-semibold leading-6 text-[#624d00]">
              確定後、この月の費用・負担割合・計算結果は変更できません。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="min-h-12 rounded-xl border border-[#cfd8cb] font-bold" onClick={() => setShowConfirm(false)}>
                戻って修正
              </button>
              <button className="min-h-12 rounded-xl bg-[#1d6f42] font-bold text-white" onClick={confirmPeriod}>
                この内容で確定
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-3xl px-4">
          <div className="rounded-xl bg-[#17211b] px-4 py-3 text-white shadow-lg">{message}</div>
        </div>
      )}
    </div>
  );
}

function DraftEditor({
  selectedMonth,
  setSelectedMonth,
  kenjiPaid,
  setKenjiPaid,
  asamiDebit,
  setAsamiDebit,
  asamiCash,
  setAsamiCash,
  rule,
  calc,
  saveDraft,
  onConfirm,
}: {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  kenjiPaid: string;
  setKenjiPaid: (value: string) => void;
  asamiDebit: string;
  setAsamiDebit: (value: string) => void;
  asamiCash: string;
  setAsamiCash: (value: string) => void;
  rule: HouseholdRule | null;
  calc: ReturnType<typeof calculateDraft> | null;
  saveDraft: () => Promise<boolean>;
  onConfirm: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#d6ddd2] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#667264]">未確定</p>
          <h2 className="text-2xl font-bold">{monthLabel(selectedMonth)}</h2>
        </div>
        <input
          type="month"
          className="max-w-36 rounded-lg border border-[#cfd8cb] px-2 py-2 text-sm"
          value={monthInputValue(selectedMonth)}
          onChange={(event) => setSelectedMonth(toMonthStart(event.target.value))}
        />
      </div>

      {rule ? (
        <p className="mt-3 rounded-lg bg-[#f7f8f4] px-3 py-2 text-sm text-[#667264]">
          負担割合：けんじ {rule.kenji_percent}% / あさみ {rule.asami_percent}%　・　月上限 {formatYen(rule.budget_limit_yen)}
        </p>
      ) : (
        <p className="mt-3 rounded-lg bg-[#ffe0dc] px-3 py-2 text-sm font-semibold text-[#8b2c21]">
          この月に適用できる負担割合・月上限がありません。設定から追加してください。
        </p>
      )}

      <MoneyField label="けんじ支払額" value={kenjiPaid} onChange={setKenjiPaid} />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <MoneyField label="あさみ デビット" value={asamiDebit} onChange={setAsamiDebit} compact />
        <MoneyField label="あさみ 現金" value={asamiCash} onChange={setAsamiCash} compact />
      </div>

      {rule && calc && (
        <div className="mt-5 space-y-2 rounded-xl bg-[#f7f8f4] p-4 text-sm">
          <ConfirmRow label="あさみ支払合計" value={formatYen(calc.asamiPaid)} />
          <ConfirmRow label="総支出" value={formatYen(calc.totalPaid)} />
          <ConfirmRow label="けんじ本来負担" value={formatYen(calc.kenjiTarget)} />
          <ConfirmRow label="あさみ本来負担" value={formatYen(calc.asamiTarget)} />
          <ConfirmRow label="未精算への増減" value={signedYen(calc.unsettledDelta)} />
          <ConfirmRow label="当月予算差額" value={signedYen(calc.budgetDelta)} />
          <ConfirmRow label="確定後の予算繰越" value={formatYen(calc.budgetCarryAfter)} />
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#1d6f42] bg-white font-bold text-[#1d6f42]"
          onClick={() => void saveDraft()}
        >
          <Save size={18} /> 一時保存
        </button>
        <button
          className="min-h-12 rounded-xl bg-[#1d6f42] font-bold text-white disabled:opacity-40"
          disabled={!rule}
          onClick={onConfirm}
        >
          確定内容を確認
        </button>
      </div>
    </section>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={`block ${compact ? "" : "mt-4"} text-sm font-bold`}>
      {label}
      <div className="mt-2 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-[#cfd8cb] bg-white px-3 py-3 text-right text-lg font-bold outline-none"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="self-center">円</span>
      </div>
    </label>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[#d6ddd2] bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#667264]">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[#7a8578]">{sub}</p>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#667264]">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}

function signedYen(value: number) {
  if (value > 0) return `+${formatYen(value)}`;
  if (value < 0) return `▲${formatYen(Math.abs(value))}`;
  return "0円";
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${
        active ? "text-[#1d6f42]" : "text-[#667264]"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
