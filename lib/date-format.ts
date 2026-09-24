const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function torontoParts(value: string, includeTime: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" as const } : {}),
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const monthIndex = Number(parts.month) - 1;
  if (!parts.year || !parts.day || monthIndex < 0 || monthIndex > 11) return null;
  return { year: parts.year, monthIndex, day: String(Number(parts.day)), hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function formatTorontoDateTime(value: string) {
  const parts = torontoParts(value, true);
  return parts ? `${shortMonths[parts.monthIndex]} ${parts.day}, ${parts.year} at ${parts.hour}:${parts.minute}` : "Date unavailable";
}

export function formatTorontoDate(value: string) {
  const parts = torontoParts(value, false);
  return parts ? `${longMonths[parts.monthIndex]} ${parts.day}, ${parts.year}` : "Date unavailable";
}

export function formatTorontoTime(value: string) {
  const parts = torontoParts(value, true);
  return parts ? `${parts.hour}:${parts.minute}:${parts.second}` : "time unavailable";
}
