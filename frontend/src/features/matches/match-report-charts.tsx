import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  eventBreakdownSlices,
  scoreProgressionPoints,
  teamComparisonRows,
} from "./match-report-model";
import type { MatchLogEvent } from "./types";

const TICK = { fill: "#8e9ba8", fontSize: 10 };

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
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#1c2b36" vertical={false} />
            <XAxis dataKey="category" axisLine={false} tickLine={false} tick={TICK} />
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
  const ticks = [0, 45, endMinute].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
          Score progression
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
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
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
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} />
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
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function EventBreakdownChart({ events }: { events: MatchLogEvent[] }) {
  const { slices, total, all } = eventBreakdownSlices(events);
  return (
    <section>
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e9ba8]">
        Event breakdown
      </h2>
      {total === 0 ? (
        <p className="text-sm text-[#8e9ba8]">No events logged.</p>
      ) : (
        <div className="flex items-center gap-4">
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
          <ul className="min-w-0 flex-1 space-y-2">
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
        </div>
      )}
    </section>
  );
}
