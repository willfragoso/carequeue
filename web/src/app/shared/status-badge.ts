import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { labels, type Status } from "../core/models";

@Component({
  selector: "cq-status-badge",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge status-' + status()"
    ><i></i>{{ labels[status()] }}</span
  >`,
})
export class StatusBadge {
  readonly status = input.required<Status>();
  protected readonly labels = labels;
}
