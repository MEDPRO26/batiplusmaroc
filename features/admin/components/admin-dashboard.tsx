"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AdminPage } from "@/features/admin/components/admin-shell";

type RangeId = "30d" | "year";
type SpendPeriodId = "7d" | "30d" | "90d";
type ChannelId = "googleAds" | "meta" | "xAds" | "linkedin" | "email";
type PanelId = "channels" | "campaigns" | "landingPages";

type Snapshot = {
  kpis: {
    spend: number;
    impressions: number;
    conversions: number;
    cpc: number;
    deltas: [number, number, number, number];
  };
  funnel: {
    total: number;
    delta: number;
    stages: [number, number, number, number];
  };
  spendTotal: number;
  spendDelta: number;
  spendMix: {
    paidSearch: number;
    paidSocial: number;
    email: number;
    affiliates: number;
  };
  channels: Record<ChannelId, { spend: number; sessions: number }>;
  adSpendTotal: number;
  adSpendDelta: number;
  roas: number;
  bars: number[];
  visitorsTotal: number;
  visitorsDelta: number;
  series: { organic: number[]; paid: number[]; social: number[] };
  seriesTotals: { organic: number; paid: number; social: number };
};

const CHANNELS: ChannelId[] = [
  "googleAds",
  "meta",
  "xAds",
  "linkedin",
  "email",
];
const SNAPSHOTS: Record<RangeId, Snapshot> = {
  "30d": {
    kpis: {
      spend: 24380,
      impressions: 1_940_000,
      conversions: 1286,
      cpc: 1.24,
      deltas: [8.4, 10, 5.2, -31],
    },
    funnel: { total: 96400, delta: 5.1, stages: [96400, 38500, 14300, 5200] },
    spendTotal: 24880,
    spendDelta: 8.4,
    spendMix: {
      paidSearch: 11400,
      paidSocial: 7620,
      email: 3180,
      affiliates: 2680,
    },
    channels: {
      googleAds: { spend: 11400, sessions: 26 },
      meta: { spend: 7620, sessions: 23 },
      xAds: { spend: 2400, sessions: 14 },
      linkedin: { spend: 2000, sessions: 8 },
      email: { spend: 1460, sessions: 7 },
    },
    adSpendTotal: 217700,
    adSpendDelta: 9.4,
    roas: 3.6,
    bars: [0.42, 0.5, 0.46, 0.58, 0.66, 0.54, 0.62, 0.71, 0.78, 0.69, 0.84, 1],
    visitorsTotal: 134400,
    visitorsDelta: 16.8,
    series: {
      organic: [
        0.22, 0.24, 0.26, 0.28, 0.3, 0.33, 0.36, 0.4, 0.44, 0.5, 0.58, 0.66,
      ],
      paid: [
        0.12, 0.14, 0.15, 0.16, 0.18, 0.2, 0.22, 0.24, 0.28, 0.32, 0.36, 0.4,
      ],
      social: [
        0.06, 0.07, 0.08, 0.08, 0.09, 0.1, 0.11, 0.12, 0.14, 0.16, 0.18, 0.2,
      ],
    },
    seriesTotals: { organic: 74500, paid: 38500, social: 21400 },
  },
  year: {
    kpis: {
      spend: 217700,
      impressions: 18_400_000,
      conversions: 12480,
      cpc: 1.41,
      deltas: [9.4, 16.8, 11, -12],
    },
    funnel: {
      total: 812000,
      delta: 12.4,
      stages: [812000, 246000, 91000, 28400],
    },
    spendTotal: 217700,
    spendDelta: 9.4,
    spendMix: {
      paidSearch: 100100,
      paidSocial: 65400,
      email: 28400,
      affiliates: 23800,
    },
    channels: {
      googleAds: { spend: 86400, sessions: 29 },
      meta: { spend: 61200, sessions: 22 },
      xAds: { spend: 28400, sessions: 12 },
      linkedin: { spend: 22100, sessions: 9 },
      email: { spend: 19600, sessions: 8 },
    },
    adSpendTotal: 217700,
    adSpendDelta: 9.4,
    roas: 3.6,
    bars: [0.38, 0.44, 0.41, 0.52, 0.6, 0.49, 0.57, 0.66, 0.74, 0.63, 0.8, 1],
    visitorsTotal: 1_284_000,
    visitorsDelta: 18.2,
    series: {
      organic: [
        0.2, 0.22, 0.24, 0.27, 0.3, 0.34, 0.38, 0.43, 0.48, 0.54, 0.61, 0.7,
      ],
      paid: [
        0.1, 0.12, 0.13, 0.15, 0.17, 0.19, 0.21, 0.24, 0.27, 0.31, 0.35, 0.39,
      ],
      social: [
        0.05, 0.06, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.13, 0.15, 0.17, 0.19,
      ],
    },
    seriesTotals: { organic: 742000, paid: 356000, social: 186000 },
  },
};

const SPEND_PERIODS: Record<
  SpendPeriodId,
  {
    total: number;
    delta: number;
    mix: {
      paidSearch: number;
      paidSocial: number;
      email: number;
      affiliates: number;
    };
  }
> = {
  "7d": {
    total: 6120,
    delta: 4.2,
    mix: { paidSearch: 2820, paidSocial: 1860, email: 820, affiliates: 620 },
  },
  "30d": {
    total: 24880,
    delta: 8.4,
    mix: { paidSearch: 11400, paidSocial: 7620, email: 3180, affiliates: 2680 },
  },
  "90d": {
    total: 71240,
    delta: 11.2,
    mix: {
      paidSearch: 32800,
      paidSocial: 21400,
      email: 9600,
      affiliates: 7440,
    },
  },
};

const PRESS =
  "cursor-pointer transition-[scale,background-color,color,border-color,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]";

export function AdminDashboard() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const [overviewRange, setOverviewRange] = useState<RangeId>("30d");
  const [spendRange, setSpendRange] = useState<RangeId>("year");
  const [visitorRange, setVisitorRange] = useState<RangeId>("year");
  const [panel, setPanel] = useState<PanelId>("channels");
  const [visible, setVisible] = useState<Record<ChannelId, boolean>>({
    googleAds: true,
    meta: true,
    xAds: true,
    linkedin: true,
    email: true,
  });
  const [campaigns, setCampaigns] = useState<
    { id: string; name: string; sessions: number }[]
  >([]);

  const overview = SNAPSHOTS[overviewRange];
  const spend = SNAPSHOTS[spendRange];
  const visitors = SNAPSHOTS[visitorRange];
  const money = (value: number, digits = 0) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  const compact = (value: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const months = Array.from({ length: 12 }, (_, index) =>
    new Date(2026, index, 1)
      .toLocaleDateString(locale, { month: "short" })
      .replace(".", ""),
  );
  const visibleChannels = CHANNELS.filter((id) => visible[id]);

  return (
    <>
      <AdminPage
        breadcrumb={t("title")}
        headerActions={
          <>
            <div className="relative">
              <button
                aria-expanded={filtersOpen}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e6e9ee] bg-white px-4 text-sm font-semibold ${PRESS}`}
                onClick={() => setFiltersOpen((open) => !open)}
                type="button"
              >
                <FilterIcon />
                {t("filters")}
              </button>
              {filtersOpen ? (
                <FilterPanel
                  onClose={() => setFiltersOpen(false)}
                  overviewRange={overviewRange}
                  setOverviewRange={setOverviewRange}
                  setVisible={setVisible}
                  visible={visible}
                />
              ) : null}
            </div>
            <button
              className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.28)] ${PRESS}`}
              onClick={() => setCampaignOpen(true)}
              type="button"
            >
              <PlusIcon />
              {t("newCampaign")}
            </button>
          </>
        }
        notice={notice}
        title={t("title")}
      >
        <p className="max-w-2xl text-sm leading-6 text-[#626970]">
          {t("sampleNote")}
        </p>

        <section
          aria-label={t("title")}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            delta={overview.kpis.deltas[0]}
            icon={<SpendIcon />}
            label={t("spend")}
            value={money(overview.kpis.spend)}
          />
          <KpiCard
            delta={overview.kpis.deltas[1]}
            icon={<EyeIcon />}
            label={t("impressions")}
            value={compact(overview.kpis.impressions)}
          />
          <KpiCard
            delta={overview.kpis.deltas[2]}
            icon={<CheckIcon />}
            label={t("conversions")}
            value={overview.kpis.conversions.toLocaleString(locale)}
          />
          <KpiCard
            delta={overview.kpis.deltas[3]}
            icon={<ClickIcon />}
            label={t("cpc")}
            value={money(overview.kpis.cpc, 2)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.9fr_0.95fr]">
          <Card>
            <CardHeader
              delta={overview.funnel.delta}
              range={overviewRange}
              setRange={setOverviewRange}
              title={t("funnelTitle")}
            />
            <p className="mt-3 text-[1.7rem] font-semibold tracking-[-0.03em] tabular-nums">
              {compact(overview.funnel.total)}
            </p>
            <Funnel stages={overview.funnel.stages} />
            <Legend
              items={[
                {
                  color: "#c6f04a",
                  label: t("visits"),
                  value: compact(overview.funnel.stages[0]),
                },
                {
                  color: "#3d6bff",
                  label: t("signups"),
                  value: compact(overview.funnel.stages[1]),
                },
                {
                  color: "#7a6cf0",
                  label: t("trials"),
                  value: compact(overview.funnel.stages[2]),
                },
                {
                  color: "#9d2458",
                  label: t("customers"),
                  value: compact(overview.funnel.stages[3]),
                },
              ]}
            />
          </Card>

          <SpendByChannelCard />

          <Card className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div
                className="flex flex-wrap gap-1"
                role="tablist"
                aria-label={t("sessions")}
              >
                {(["channels", "campaigns", "landingPages"] as PanelId[]).map(
                  (id) => (
                    <button
                      aria-selected={panel === id}
                      className={`min-h-11 rounded-full px-3 text-sm font-semibold ${PRESS} ${
                        panel === id
                          ? "bg-[#f3f5f7] text-[#17191d]"
                          : "text-[#8b919a]"
                      }`}
                      key={id}
                      onClick={() => setPanel(id)}
                      role="tab"
                      type="button"
                    >
                      {t(id)}
                    </button>
                  ),
                )}
              </div>
              <span className="pt-3 text-[0.68rem] font-semibold tracking-[0.08em] text-[#a0a6ae] uppercase">
                {t("sessions")}
              </span>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-3" role="tabpanel">
              <SessionList
                campaigns={campaigns}
                channels={visibleChannels.map((id) => ({
                  id,
                  label: t(id === "email" ? "email" : id),
                  sessions: overview.channels[id].sessions,
                }))}
                panel={panel}
              />
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[#8b919a]">{t("adSpend")}</p>
                <p className="mt-1 text-sm font-medium text-[#626970]">
                  {t("roas", {
                    value: `${spend.roas.toLocaleString(locale)}×`,
                  })}
                </p>
              </div>
              <RangeSelect range={spendRange} setRange={setSpendRange} />
            </div>
            <p className="mt-3 flex items-center gap-2 text-[1.7rem] font-semibold tracking-[-0.03em] tabular-nums">
              {money(spend.adSpendTotal)}
              <Delta value={spend.adSpendDelta} />
            </p>
            <BarChart
              label={t("chartSummarySpend", {
                total: money(spend.adSpendTotal),
              })}
              months={months}
              values={spend.bars.map((share) =>
                Math.round(share * spend.adSpendTotal * 0.16),
              )}
            />
            <FooterStats
              items={[
                {
                  swatch: "#c6f04a",
                  label: t("adSpendTotal"),
                  value: money(spend.adSpendTotal),
                },
                {
                  swatch: "#17191d",
                  label: t("roasAverage"),
                  value: `${spend.roas.toLocaleString(locale)}×`,
                },
              ]}
            />
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-[#8b919a]">{t("visitors")}</p>
              <RangeSelect range={visitorRange} setRange={setVisitorRange} />
            </div>
            <p className="mt-3 flex items-center gap-2 text-[1.7rem] font-semibold tracking-[-0.03em] tabular-nums">
              {visitors.visitorsTotal.toLocaleString(locale)}
              <Delta value={visitors.visitorsDelta} />
            </p>
            <AreaChart
              label={t("chartSummaryVisitors", {
                total: visitors.visitorsTotal.toLocaleString(locale),
              })}
              months={months}
              series={visitors.series}
            />
            <FooterStats
              items={[
                {
                  swatch: "#b6e86a",
                  label: t("organic"),
                  value: visitors.seriesTotals.organic.toLocaleString(locale),
                },
                {
                  swatch: "#7eb6ff",
                  label: t("paid"),
                  value: visitors.seriesTotals.paid.toLocaleString(locale),
                },
                {
                  swatch: "#b9a6ff",
                  label: t("social"),
                  value: visitors.seriesTotals.social.toLocaleString(locale),
                },
              ]}
            />
          </Card>
        </section>
      </AdminPage>
      {campaignOpen ? (
        <CampaignDialog
          onClose={() => setCampaignOpen(false)}
          onCreate={(name) => {
            setCampaigns((current) => [
              { id: `${name}-${current.length}`, name, sessions: 4 },
              ...current,
            ]);
            setPanel("campaigns");
            setNotice(t("campaignCreated"));
            setCampaignOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  delta,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  delta: number;
}) {
  return (
    <article className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[12px] bg-[#f4f6f8] text-[#626970]">
          {icon}
        </span>
        <h2 className="text-sm font-medium text-[#8b919a]">{label}</h2>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[1.65rem] font-semibold tracking-[-0.03em] tabular-nums">
        {value}
        <Delta value={delta} />
      </p>
    </article>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function CardHeader({
  title,
  delta,
  range,
  setRange,
}: {
  title: string;
  delta: number;
  range: RangeId;
  setRange: (range: RangeId) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#626970]">
        {title}
        <Delta value={delta} />
      </h2>
      <RangeSelect range={range} setRange={setRange} />
    </div>
  );
}

function Delta({ value }: { value: number }) {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const up = value >= 0;
  const amount = `${Math.abs(value).toLocaleString(locale)}%`;
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums ${
        up ? "bg-[#e7f8ee] text-[#157a3e]" : "bg-[#fdecec] text-[#b42318]"
      }`}
    >
      {up ? <ArrowUp /> : <ArrowDown />}
      <span className="sr-only">
        {t(up ? "deltaUp" : "deltaDown", { value: amount })}
      </span>
      <span aria-hidden="true">
        {up ? "+" : "−"}
        {amount}
      </span>
    </span>
  );
}

function RangeSelect({
  range,
  setRange,
}: {
  range: RangeId;
  setRange: (range: RangeId) => void;
}) {
  const t = useTranslations("adminDashboard");
  return (
    <label className="relative inline-flex min-h-11 items-center">
      <span className="sr-only">{t("rangeLabel")}</span>
      <select
        className={`h-11 appearance-none rounded-full bg-[#f4f6f8] pr-8 pl-3 text-xs font-semibold text-[#626970] ${PRESS}`}
        onChange={(event) => setRange(event.target.value as RangeId)}
        value={range}
      >
        <option value="30d">{t("range30")}</option>
        <option value="year">{t("rangeYear")}</option>
      </select>
      <Chevron className="pointer-events-none absolute right-2 text-[#8b919a]" />
    </label>
  );
}

function Funnel({ stages }: { stages: [number, number, number, number] }) {
  const t = useTranslations("adminDashboard");
  const colors = ["#c6f04a", "#2f6bff", "#6d5ce8", "#9d2458"];
  const text = ["#173000", "#ffffff", "#ffffff", "#ffffff"];
  const labels = [t("visits"), t("signups"), t("trials"), t("customers")];
  const weights = [1.6, 1.15, 0.78, 0.5];
  return (
    <div className="mt-5 flex h-[74px] items-center gap-1.5">
      {stages.map((value, index) => {
        const share = Math.round((value / stages[0]) * 100);
        return (
          <div
            className="flex h-14 min-w-11 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
            key={labels[index]}
            style={{
              flexGrow: weights[index],
              background: colors[index],
              color: text[index],
            }}
            title={`${labels[index]} ${share}%`}
          >
            <span className="sr-only">{labels[index]} </span>
            {share}%
          </div>
        );
      })}
    </div>
  );
}

function SpendByChannelCard() {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const [period, setPeriod] = useState<SpendPeriodId>("30d");
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = SPEND_PERIODS[period];
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 0,
    }).format(value);

  const segments = [
    {
      id: "paidSearch",
      color: "#c6f04a",
      label: t("paidSearch"),
      spend: snapshot.mix.paidSearch,
    },
    {
      id: "paidSocial",
      color: "#3b82f6",
      label: t("paidSocial"),
      spend: snapshot.mix.paidSocial,
    },
    {
      id: "email",
      color: "#a78bfa",
      label: t("emailChannel"),
      spend: snapshot.mix.email,
    },
    {
      id: "affiliates",
      color: "#f472b6",
      label: t("affiliates"),
      spend: snapshot.mix.affiliates,
    },
  ];
  const active = segments.find((segment) => segment.id === activeId) ?? null;
  const title = active?.label ?? t("spendByChannel");
  const amount = active ? active.spend : snapshot.total;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-[#8b919a]">{title}</h2>
        <SpendPeriodMenu period={period} setPeriod={setPeriod} />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[1.7rem] font-semibold tracking-[-0.03em] tabular-nums">
        {money(amount)}
        {active ? null : <Delta value={snapshot.delta} />}
      </p>
      <SpendGauge
        activeId={activeId}
        onActiveChange={setActiveId}
        segments={segments}
        total={snapshot.total}
      />
    </Card>
  );
}

function SpendPeriodMenu({
  period,
  setPeriod,
}: {
  period: SpendPeriodId;
  setPeriod: (period: SpendPeriodId) => void;
}) {
  const t = useTranslations("adminDashboard");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options: { id: SpendPeriodId; label: string }[] = [
    { id: "7d", label: t("range7") },
    { id: "30d", label: t("range30") },
    { id: "90d", label: t("range90") },
  ];
  const current =
    options.find((option) => option.id === period)?.label ?? t("range30");

  useDismiss(rootRef, () => setOpen(false));

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("rangeLabel")}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e6e9ee] bg-white px-3 text-xs font-semibold text-[#626970] ${PRESS}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <CalendarIcon />
        <span>{current}</span>
        <Chevron className={open ? "rotate-180" : ""} />
      </button>
      {open ? (
        <ul
          className="absolute right-0 z-20 mt-2 min-w-[11.5rem] overflow-hidden rounded-[14px] border border-[#e7eaee] bg-white p-1 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"
          role="listbox"
        >
          {options.map((option) => {
            const selected = option.id === period;
            return (
              <li key={option.id} role="option" aria-selected={selected}>
                <button
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-sm ${PRESS} ${
                    selected
                      ? "bg-[#f4f6f8] font-semibold text-[#17191d]"
                      : "font-medium text-[#626970] hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => {
                    setPeriod(option.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <CheckMarkIcon />
                  ) : (
                    <span className="size-4" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SpendGauge({
  segments,
  total,
  activeId,
  onActiveChange,
}: {
  segments: { id: string; label: string; spend: number; color: string }[];
  total: number;
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
}) {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 0,
    }).format(value);

  const defaultSegment = segments[0] ?? null;
  const active =
    segments.find((segment) => segment.id === activeId) ?? defaultSegment;
  const share =
    total > 0 && active ? Math.round((active.spend / total) * 100) : 0;
  const cx = 120;
  const cy = 118;
  const radius = 78;
  const baseStroke = 16;
  const activeStroke = 22;
  const gap = 0.05;
  const startAngle = Math.PI;
  const endAngle = 0;
  const span = startAngle - endAngle;
  const positive = segments.filter((segment) => segment.spend > 0);
  const gapTotal = gap * Math.max(positive.length - 1, 0);
  const usable = Math.max(span - gapTotal, 0.001);

  const arcs = positive.map((segment, index) => {
    const portion = (segment.spend / Math.max(total, 1)) * usable;
    const priorSpend = positive
      .slice(0, index)
      .reduce((sum, item) => sum + item.spend, 0);
    const from =
      startAngle - (priorSpend / Math.max(total, 1)) * usable - gap * index;
    const to = from - portion;
    return { ...segment, from, to };
  });

  const track = describeArc(cx, cy, radius, startAngle, endAngle);
  const hovering = activeId !== null;

  return (
    <div className="mt-4" onMouseLeave={() => onActiveChange(null)}>
      <div className="relative mx-auto w-full max-w-[280px]">
        <svg className="h-auto w-full" role="img" viewBox="0 0 240 140">
          <title>{t("spendByChannel")}</title>
          <path
            d={track}
            fill="none"
            stroke="#eef1f4"
            strokeLinecap="round"
            strokeWidth={baseStroke}
          />
          {arcs.map((arc) => {
            const isActive = activeId === arc.id;
            const dimmed = hovering && !isActive;
            return (
              <g key={arc.id}>
                <path
                  d={describeArc(cx, cy, radius, arc.from, arc.to)}
                  fill="none"
                  opacity={dimmed ? 0.35 : 1}
                  stroke={arc.color}
                  strokeLinecap="round"
                  strokeWidth={isActive ? activeStroke : baseStroke}
                  style={{
                    transition:
                      "stroke-width 150ms cubic-bezier(0.2, 0, 0, 1), opacity 150ms cubic-bezier(0.2, 0, 0, 1)",
                    filter: isActive
                      ? "drop-shadow(0 6px 10px rgba(23, 25, 29, 0.18))"
                      : undefined,
                  }}
                />
                <path
                  className="cursor-pointer"
                  d={describeArc(cx, cy, radius, arc.from, arc.to)}
                  fill="none"
                  onFocus={() => onActiveChange(arc.id)}
                  onBlur={() => onActiveChange(null)}
                  onMouseEnter={() => onActiveChange(arc.id)}
                  stroke="transparent"
                  strokeLinecap="round"
                  strokeWidth={36}
                  tabIndex={0}
                >
                  <title>{`${arc.label}: ${Math.round((arc.spend / Math.max(total, 1)) * 100)}%`}</title>
                </path>
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
          <p className="text-[1.85rem] font-semibold tracking-[-0.03em] tabular-nums">
            {share}%
          </p>
          <p className="text-xs text-[#8b919a]">
            {active?.label ?? t("paidSearchShare")}
          </p>
        </div>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {segments.map((segment) => {
          const isActive = activeId === segment.id;
          const dimmed = hovering && !isActive;
          return (
            <li key={segment.id}>
              <button
                className={`min-w-0 w-full rounded-[10px] p-1 text-left transition-[opacity,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] ${PRESS} ${
                  dimmed ? "opacity-40" : "opacity-100"
                }`}
                onFocus={() => onActiveChange(segment.id)}
                onMouseEnter={() => onActiveChange(segment.id)}
                type="button"
              >
                <span
                  className={`flex items-center gap-2 ${isActive || !hovering ? "text-[#626970]" : "text-[#8b919a]"}`}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[4px]"
                    style={{ background: segment.color }}
                  />
                  <span
                    className={`truncate ${isActive ? "font-semibold text-[#17191d]" : ""}`}
                  >
                    {segment.label}
                  </span>
                </span>
                <span
                  className={`mt-1 block pl-[18px] tabular-nums ${
                    isActive || !hovering
                      ? "font-semibold text-[#17191d]"
                      : "font-medium text-[#8b919a]"
                  }`}
                >
                  {money(segment.spend)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
) {
  const start = polar(cx, cy, radius, from);
  const end = polar(cx, cy, radius, to);
  const largeArc = from - to > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  };
}

function SessionList({
  panel,
  channels,
  campaigns,
}: {
  panel: PanelId;
  channels: { id: string; label: string; sessions: number }[];
  campaigns: { id: string; name: string; sessions: number }[];
}) {
  const t = useTranslations("adminDashboard");
  const rows =
    panel === "channels"
      ? channels.map((channel) => ({
          id: channel.id,
          label: channel.label,
          sessions: channel.sessions,
        }))
      : panel === "campaigns"
        ? [
            ...campaigns.map((campaign) => ({
              id: campaign.id,
              label: campaign.name,
              sessions: campaign.sessions,
            })),
            ...channels
              .slice(0, 4)
              .map((channel) => ({
                id: `base-${channel.id}`,
                label: channel.label,
                sessions: Math.max(channel.sessions - 4, 3),
              })),
          ]
        : [
            { id: "home", label: t("landingHome"), sessions: 41 },
            { id: "companies", label: t("landingCompanies"), sessions: 27 },
            { id: "project", label: t("landingProject"), sessions: 18 },
            { id: "sign-in", label: t("landingSignIn"), sessions: 9 },
            { id: "journal", label: t("landingJournal"), sessions: 5 },
          ];

  if (rows.length === 0) {
    return <p className="py-8 text-sm text-[#8b919a]">{t("noNavResults")}</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <ChannelMark label={row.label} />
              <span className="truncate font-medium">{row.label}</span>
            </span>
            <span className="tabular-nums text-[#626970]">{row.sessions}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f2f5]">
            <div
              className="h-full rounded-full bg-[#d7dee8]"
              style={{ width: `${Math.min(row.sessions, 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BarChart({
  values,
  months,
  label,
}: {
  values: number[];
  months: string[];
  label: string;
}) {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const max = Math.max(...values, 1);
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  return (
    <figure className="mt-4">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex gap-3">
        <div className="flex h-48 flex-col justify-between pt-6 text-[0.68rem] text-[#a0a6ae] tabular-nums">
          <span>{money(max)}</span>
          <span>{money(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-48 items-end gap-1.5 border-b border-[#eef1f4] pt-6 sm:gap-2">
            {values.map((value, index) => (
              <div
                className="flex h-full min-w-0 flex-1 items-end"
                key={months[index]}
              >
                <button
                  aria-label={t("barLabel", {
                    month: months[index] ?? "",
                    value: money(value),
                  })}
                  className={`relative w-full rounded-t-[8px] bg-[#c6f04a] hover:bg-[#b4e22d] ${PRESS}`}
                  style={{ height: `${Math.max((value / max) * 100, 8)}%` }}
                  type="button"
                >
                  {index === values.length - 1 ? (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.68rem] font-semibold text-[#626970] tabular-nums">
                      {money(value)}
                    </span>
                  ) : null}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {months.map((month) => (
              <span
                className="min-w-0 flex-1 truncate text-center text-[0.65rem] text-[#a0a6ae]"
                key={month}
              >
                {month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function AreaChart({
  series,
  months,
  label,
}: {
  series: { organic: number[]; paid: number[]; social: number[] };
  months: string[];
  label: string;
}) {
  const width = 640;
  const height = 210;
  const build = (values: number[], color: string) => {
    const points = values.map((value, index) => ({
      x: (index / (values.length - 1)) * width,
      y: height - value * (height - 24) - 12,
    }));
    const first = points[0] ?? { x: 0, y: height };
    let line = `M ${first.x} ${first.y}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1] ?? first;
      const current = points[index] ?? previous;
      const control = (previous.x + current.x) / 2;
      line += ` C ${control} ${previous.y}, ${control} ${current.y}, ${current.x} ${current.y}`;
    }
    return {
      stroke: color,
      line,
      d: `${line} L ${width},${height} L 0,${height} Z`,
    };
  };
  const layers = [
    build(
      series.organic.map(
        (value, index) =>
          value + (series.paid[index] ?? 0) + (series.social[index] ?? 0),
      ),
      "#b9a6ff",
    ),
    build(
      series.organic.map((value, index) => value + (series.paid[index] ?? 0)),
      "#9cccff",
    ),
    build(series.organic, "#c6f04a"),
  ];
  return (
    <figure className="mt-4">
      <figcaption className="sr-only">{label}</figcaption>
      <svg
        aria-hidden="true"
        className="h-52 w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {layers.map((layer) => (
          <g key={layer.stroke}>
            <path d={layer.d} fill={layer.stroke} opacity="0.35" />
            <path
              d={layer.line}
              fill="none"
              stroke={layer.stroke}
              strokeWidth="3"
            />
          </g>
        ))}
      </svg>
      <div className="mt-2 flex gap-1.5">
        {months.map((month, index) => (
          <span
            className={`min-w-0 flex-1 truncate text-center text-[0.65rem] text-[#a0a6ae] ${index % 2 === 1 ? "hidden sm:block" : ""}`}
            key={month}
          >
            {month}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Legend({
  items,
}: {
  items: { color: string; label: string; value: string }[];
}) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {items.map((item) => (
        <li key={item.label}>
          <span className="flex items-center gap-2 text-[#8b919a]">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: item.color }}
            />
            {item.label}
          </span>
          <span className="mt-1 block font-semibold tabular-nums">
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FooterStats({
  items,
}: {
  items: { swatch: string; label: string; value: string }[];
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#f0f2f5] pt-4 text-sm">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.label}>
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: item.swatch }}
          />
          <span className="text-[#8b919a]">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function FilterPanel({
  visible,
  setVisible,
  overviewRange,
  setOverviewRange,
  onClose,
}: {
  visible: Record<ChannelId, boolean>;
  setVisible: (value: Record<ChannelId, boolean>) => void;
  overviewRange: RangeId;
  setOverviewRange: (range: RangeId) => void;
  onClose: () => void;
}) {
  const t = useTranslations("adminDashboard");
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div
      className="absolute right-0 z-20 mt-2 w-72 rounded-[16px] border border-[#e7eaee] bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.12)]"
      ref={ref}
    >
      <p className="text-sm font-semibold">{t("filtersTitle")}</p>
      <div className="mt-3">
        <RangeSelect range={overviewRange} setRange={setOverviewRange} />
      </div>
      <ul className="mt-3 space-y-1">
        {CHANNELS.map((id) => (
          <li key={id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-2 text-sm hover:bg-[#f4f6f8]">
              <input
                checked={visible[id]}
                className="size-4 accent-[#2f6bff]"
                onChange={(event) =>
                  setVisible({ ...visible, [id]: event.target.checked })
                }
                type="checkbox"
              />
              {t(id === "email" ? "email" : id)}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const t = useTranslations("adminDashboard");
  const titleId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelId>("googleAds");
  const [error, setError] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-[20px] bg-white p-5 shadow-[0_24px_48px_rgba(16,24,40,0.18)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold" id={titleId}>
            {t("dialogTitle")}
          </h2>
          <button
            aria-label={t("close")}
            className={`inline-flex size-11 items-center justify-center rounded-full ${PRESS}`}
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name.trim();
            if (next.length < 2) {
              setError(t("campaignRequired"));
              inputRef.current?.focus();
              return;
            }
            onCreate(`${next} · ${t(channel === "email" ? "email" : channel)}`);
          }}
        >
          <label
            className="block text-sm font-medium"
            htmlFor={`${titleId}-name`}
          >
            {t("campaignName")}
          </label>
          <input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full rounded-[12px] border border-[#e6e9ee] px-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
            id={`${titleId}-name`}
            onChange={(event) => setName(event.target.value)}
            ref={inputRef}
            value={name}
          />
          {error ? (
            <p className="text-sm text-[#b42318]" id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <label
            className="block text-sm font-medium"
            htmlFor={`${titleId}-channel`}
          >
            {t("campaignChannel")}
          </label>
          <select
            className="h-11 w-full rounded-[12px] border border-[#e6e9ee] px-3 text-base"
            id={`${titleId}-channel`}
            onChange={(event) => setChannel(event.target.value as ChannelId)}
            value={channel}
          >
            {CHANNELS.map((id) => (
              <option key={id} value={id}>
                {t(id === "email" ? "email" : id)}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold ${PRESS}`}
              onClick={onClose}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              className={`min-h-11 rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white ${PRESS}`}
              type="submit"
            >
              {t("createCampaign")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function useDismiss(ref: { current: HTMLElement | null }, onClose: () => void) {
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, ref]);
}

function ChannelMark({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-[8px] bg-[#f4f6f8] text-[0.68rem] font-semibold text-[#626970]"
    >
      {label.slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}

function Glyph({
  children,
  className = "size-[18px]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function stroke() {
  return {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.75,
  };
}

function CloseIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="m7 7 10 10M17 7 7 17" />
    </Glyph>
  );
}
function FilterIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="M4 6h16l-6 7v5l-4-2v-3L4 6Z" />
    </Glyph>
  );
}
function PlusIcon() {
  return (
    <Glyph className="size-4">
      <path {...stroke()} d="M12 6v12M6 12h12" />
    </Glyph>
  );
}
function Chevron({ className }: { className?: string }) {
  return (
    <Glyph className={`size-4 ${className ?? ""}`}>
      <path {...stroke()} d="m8 10 4 4 4-4" />
    </Glyph>
  );
}
function CheckMarkIcon() {
  return (
    <Glyph className="size-4 text-[#17191d]">
      <path {...stroke()} d="m6 12 4 4 8-8" />
    </Glyph>
  );
}
function CalendarIcon() {
  return (
    <Glyph className="size-3.5">
      <path
        {...stroke()}
        d="M7 4v2M17 4v2M5 9h14M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
      />
    </Glyph>
  );
}
function ArrowUp() {
  return (
    <Glyph className="size-3">
      <path {...stroke()} d="M6 14 12 8l6 6" />
    </Glyph>
  );
}
function ArrowDown() {
  return (
    <Glyph className="size-3">
      <path {...stroke()} d="m6 10 6 6 6-6" />
    </Glyph>
  );
}
function SpendIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="M5 17V7M10 17V11M15 17V9M20 17V5" />
    </Glyph>
  );
}
function EyeIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <circle {...stroke()} cx="12" cy="12" r="2.5" />
    </Glyph>
  );
}
function CheckIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="m6 12 4 4 8-8" />
    </Glyph>
  );
}
function ClickIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="m8 16 2.5-6.5L17 12l-4.5 1.2L11 17.5 8 16Z" />
    </Glyph>
  );
}
