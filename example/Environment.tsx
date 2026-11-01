export interface ApplicationClock {
  now(): Date;
}
export function fixedClock(instant: string): ApplicationClock {
  const milliseconds = new Date(instant).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("Invalid application clock instant");
  return { now: () => new Date(milliseconds) };
}

export function Environment({
  clock,
  locale,
  timeZone,
}: {
  clock: ApplicationClock;
  locale: string;
  timeZone: string;
}) {
  const instant = clock.now();
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return (
    <main>
      <h1>Fixed application clock</h1>
      <time dateTime={instant.toISOString()}>{formatted}</time>
    </main>
  );
}
