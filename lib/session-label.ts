// Only the system-generated timestamp label is derived; custom names and stored history stay intact.
export function displaySessionLabel(label: string, startedAt: Date | null): string {
  if (!startedAt || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} 场$/.test(label)) return label;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(startedAt);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute} 场`;
}
