/** Shared number and date formatting for the statistics screens. */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

export function formatMatchDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatAvg(value: number): string {
  return value.toFixed(1);
}

export function formatDiff(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
