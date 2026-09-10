import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import {
  busiestInterval,
  cardProgressionMarks,
  eventBreakdownSlices,
  scoreProgressionPoints,
  teamComparisonRows,
  teamEventSplit,
} from "./match-report-chart-stats";
import type { MatchLogEvent } from "./types";

const TICK = { fill: "#8e9ba8", fontSize: 10 };

function ComparisonTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const lines = (payload?.value ?? "").split(" ");
  return (
    <text x={x} y={y + 10} textAnchor="middle" fill="#8e9ba8" fontSize={10}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function TeamComparisonChart({
  events,
  ownName,
  oppName,
  ownColor,
  oppColor,
}: {
  events: MatchLogEvent[];
  ownName: string;
  oppName: string;
  ownColor: string;
  oppColor: string;
}) {
  const rows = teamComparisonRows(events);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
          Team comparison
        </h2>
        <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-[#8e9ba8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: ownColor }} />
            {ownName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: oppColor }} />
            {oppName}
          </span>
        </p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 4, left: -18, bottom: 12 }}>
            <CartesianGrid stroke="#1c2b36" vertical={false} />
            <XAxis
              dataKey="category"
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={<ComparisonTick />}
            />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} />
            <Bar dataKey="own" fill={ownColor} radius={[4, 4, 0, 0]} maxBarSize={26}>
              <LabelList dataKey="own" position="top" fill="#e8ecef" fontSize={11} />
            </Bar>
            <Bar dataKey="opp" fill={oppColor} radius={[4, 4, 0, 0]} maxBarSize={26}>
              <LabelList dataKey="opp" position="top" fill="#e8ecef" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function ScoreProgressionChart({
  events,
  ownName,
  oppName,
  ownColor,
  oppColor,
}: {
  events: MatchLogEvent[];
  ownName: string;
  oppName: string;
  ownColor: string;
  oppColor: string;
}) {
  const { points, endMinute } = scoreProgressionPoints(events);
  const cardMarks = cardProgressionMarks(events);
  const ticks = [0, 45, endMinute].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  const maxScore = Math.max(
    1,
    ...points.map((point) => Math.max(point.own, point.opp)),
  );
  const yTicks = Array.from({ length: maxScore + 1 }, (_, index) => index);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
          Score progression
        </h2>
        <p className="flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-[#8e9ba8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: ownColor }} />
            {ownName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: oppColor }} />
            {oppName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#f5c518]" />
            Yellow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#ff5b5f]" />
            Red
          </span>
        </p>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 12, right: 12, left: -18, bottom: 0 }}
          >
            <CartesianGrid stroke="#1c2b36" vertical={false} />
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, endMinute]}
              ticks={ticks}
              tickFormatter={(value: number) => `${value}'`}
              axisLine={false}
              tickLine={false}
              tick={TICK}
            />
            <YAxis
              domain={[-0.5, maxScore]}
              ticks={yTicks}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={TICK}
            />
            <Line
              type="stepAfter"
              dataKey="own"
              stroke={ownColor}
              strokeWidth={2.25}
              dot={{ r: 3.5, fill: ownColor, stroke: ownColor }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="stepAfter"
              dataKey="opp"
              stroke={oppColor}
              strokeWidth={2.25}
              dot={{ r: 3.5, fill: oppColor, stroke: oppColor }}
              activeDot={{ r: 5 }}
            />
            {cardMarks.length > 0 ? (
              <Scatter
                data={cardMarks}
                dataKey="lane"
                isAnimationActive={false}
                legendType="none"
                shape={(props) => {
                  const { cx, cy, payload } = props as {
                    cx?: number;
                    cy?: number;
                    payload?: { color: string };
                  };
                  if (cx == null || cy == null) {
                    return null;
                  }
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={payload?.color ?? "#f5c518"}
                      stroke="#070d12"
                      strokeWidth={1}
                    />
                  );
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function EventBreakdownChart({
  events,
  ownName,
  oppName,
  ownColor,
  oppColor,
}: {
  events: MatchLogEvent[];
  ownName: string;
  oppName: string;
  ownColor: string;
  oppColor: string;
}) {
  const { slices, total, all } = eventBreakdownSlices(events);
  const split = teamEventSplit(events);
  const busy = busiestInterval(events);
  return (
    <section>
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
        Event breakdown
      </h2>
      {total === 0 ? (
        <p className="text-sm text-[#8e9ba8]">No events logged.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative size-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={2}
                  stroke="#070d12"
                  strokeWidth={2}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-oswald text-2xl leading-none tabular-nums">{total}</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#8e9ba8]">
                Events
              </p>
            </div>
          </div>
          <ul className="min-w-[8rem] space-y-2">
            {all.map((slice) => (
              <li
                key={slice.name}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="inline-flex items-center gap-2 text-[#c5ced6]">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: slice.color }}
                  />
                  {slice.name}
                </span>
                <span className="font-oswald tabular-nums text-white">{slice.value}</span>
              </li>
            ))}
          </ul>
          <div className="min-w-[10rem] flex-1 space-y-4 border-[#1c2b36] sm:border-l sm:pl-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8e9ba8]">
                Team event split
              </p>
              <p className="mt-1 font-oswald text-lg tracking-wide">
                <span className="tabular-nums" style={{ color: ownColor }}>
                  {split.own} {ownName}
                </span>
                <span className="mx-1.5 text-[#8e9ba8]">·</span>
                <span className="tabular-nums" style={{ color: oppColor }}>
                  {split.opp} {oppName}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8e9ba8]">
                Busiest interval
              </p>
              <p className="mt-1 text-sm text-[#e8ecef]">
                Most action: {busy.start}&apos;–{busy.end}&apos; ({busy.count}{" "}
                {busy.count === 1 ? "event" : "events"})
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
