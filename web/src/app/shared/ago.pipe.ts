import {
  inject,
  Injectable,
  Pipe,
  signal,
  type PipeTransform,
} from "@angular/core";

/** A coarse clock so relative times stay fresh without every row running a timer. */
@Injectable({ providedIn: "root" })
export class Clock {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 30_000);
  }
}

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

/** "agora", "há 5 min", "há 3 h", "ontem" … and a short date beyond a week. */
export function formatAgo(value: string, now: number): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "agora";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400)
    return relative.format(Math.round(seconds / 86_400), "day");
  return absolute.format(new Date(value));
}

@Pipe({ name: "cqAgo", pure: false })
export class AgoPipe implements PipeTransform {
  private readonly clock = inject(Clock);

  transform(value: string): string {
    return formatAgo(value, this.clock.now());
  }
}
