export type HouseholdSettings = {
  id: string;
  opening_month: string;
  opening_budget_carry_yen: number;
  created_at?: string;
  updated_at?: string;
};

export type HouseholdRule = {
  id: string;
  effective_month: string;
  kenji_percent: number;
  asami_percent: number;
  budget_limit_yen: number;
  created_at?: string;
  updated_at?: string;
};

export type HouseholdPeriodStatus = "draft" | "confirmed";

export type HouseholdPeriod = {
  id: string;
  period_month: string;
  status: HouseholdPeriodStatus;
  kenji_paid_yen: number;
  asami_debit_yen: number;
  asami_cash_yen: number;
  rule_id_snapshot: string | null;
  budget_limit_yen_snapshot: number | null;
  kenji_percent_snapshot: number | null;
  asami_percent_snapshot: number | null;
  total_paid_yen: number | null;
  kenji_target_yen: number | null;
  asami_target_yen: number | null;
  unsettled_delta_yen: number | null;
  budget_delta_yen: number | null;
  budget_carry_balance_yen: number | null;
  confirmed_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SettlementDirection = "asami_to_kenji" | "kenji_to_asami";

export type HouseholdSettlement = {
  id: string;
  settlement_date: string;
  direction: SettlementDirection;
  amount_yen: number;
  balance_before_yen: number;
  balance_after_yen: number;
  created_at?: string;
};

export type DraftCalculation = {
  asamiPaid: number;
  totalPaid: number;
  kenjiTarget: number;
  asamiTarget: number;
  unsettledDelta: number;
  budgetDelta: number;
  budgetCarryAfter: number;
};

export function monthStart(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function nextMonth(month: string) {
  const [year, rawMonth] = month.slice(0, 7).split("-").map(Number);
  const d = new Date(year, rawMonth, 1);
  return monthStart(d);
}

export function monthLabel(month: string) {
  const [year, rawMonth] = month.slice(0, 7).split("-");
  return `${year}年${Number(rawMonth)}月`;
}

export function formatYen(value: number | null | undefined) {
  return `${Math.round(value || 0).toLocaleString("ja-JP")}円`;
}

export function applicableRule(rules: HouseholdRule[], month: string) {
  return [...rules]
    .filter((rule) => rule.effective_month <= month)
    .sort((a, b) => b.effective_month.localeCompare(a.effective_month))[0] || null;
}

export function previousBudgetCarry(
  periods: HouseholdPeriod[],
  settings: HouseholdSettings | null,
  month: string,
) {
  const previous = [...periods]
    .filter(
      (period) =>
        period.status === "confirmed" &&
        period.period_month < month &&
        period.budget_carry_balance_yen !== null,
    )
    .sort((a, b) => b.period_month.localeCompare(a.period_month))[0];

  return previous?.budget_carry_balance_yen ?? settings?.opening_budget_carry_yen ?? 0;
}

export function calculateDraft(
  period: Pick<HouseholdPeriod, "kenji_paid_yen" | "asami_debit_yen" | "asami_cash_yen">,
  rule: HouseholdRule,
  previousCarry: number,
): DraftCalculation {
  const asamiPaid = period.asami_debit_yen + period.asami_cash_yen;
  const totalPaid = period.kenji_paid_yen + asamiPaid;
  const kenjiTarget = Math.round((totalPaid * Number(rule.kenji_percent)) / 100);
  const asamiTarget = totalPaid - kenjiTarget;
  const unsettledDelta = period.kenji_paid_yen - kenjiTarget;
  const budgetDelta = rule.budget_limit_yen - totalPaid;
  return {
    asamiPaid,
    totalPaid,
    kenjiTarget,
    asamiTarget,
    unsettledDelta,
    budgetDelta,
    budgetCarryAfter: previousCarry + budgetDelta,
  };
}

export function settlementEffect(settlement: HouseholdSettlement) {
  return settlement.direction === "asami_to_kenji"
    ? settlement.amount_yen
    : -settlement.amount_yen;
}

export function currentUnsettledBalance(
  periods: HouseholdPeriod[],
  settlements: HouseholdSettlement[],
) {
  const confirmedDelta = periods
    .filter((period) => period.status === "confirmed")
    .reduce((sum, period) => sum + (period.unsettled_delta_yen || 0), 0);
  const settled = settlements.reduce((sum, item) => sum + settlementEffect(item), 0);
  return confirmedDelta - settled;
}

export function balanceDescription(balance: number) {
  if (balance > 0) {
    return {
      direction: "あさみ → けんじ",
      payer: "あさみ",
      receiver: "けんじ",
      overpayer: "けんじ",
      amount: balance,
    };
  }
  if (balance < 0) {
    return {
      direction: "けんじ → あさみ",
      payer: "けんじ",
      receiver: "あさみ",
      overpayer: "あさみ",
      amount: Math.abs(balance),
    };
  }
  return {
    direction: "精算なし",
    payer: "",
    receiver: "",
    overpayer: "",
    amount: 0,
  };
}
