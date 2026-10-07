import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ApiError } from "../../core/api-error";
import type { Operations } from "../../core/models";

@Component({
  selector: "cq-metrics",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./metrics.html",
})
export class Metrics {
  readonly data = input<Operations | null>(null);
  readonly error = input<ApiError | null>(null);

  protected readonly snapshot = computed(() =>
    this.error() ? null : this.data(),
  );
  protected readonly oldestPendingSeconds = computed(() => {
    const seconds = this.snapshot()?.outbox.oldestPendingSeconds;
    return seconds == null ? null : Math.floor(seconds);
  });
}
