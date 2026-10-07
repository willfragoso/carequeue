import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from "@angular/core";
import type { ApiError } from "../../core/api-error";
import { CasesApi } from "../../core/cases-api";
import {
  labels,
  nextStatus,
  statuses,
  type Case,
  type Data,
  type Delivery,
  type History,
  type Notification,
} from "../../core/models";
import { remote } from "../../core/remote";
import { CopyId } from "../../shared/copy-id";
import { ErrorNotice } from "../../shared/error-notice";
import { StatusBadge } from "../../shared/status-badge";
import { TimePipe } from "../../shared/time.pipe";
import { DeliveryFlow } from "../flow/delivery-flow";

@Component({
  selector: "cq-case-details",
  imports: [CopyId, DeliveryFlow, ErrorNotice, StatusBadge, TimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./case-details.html",
})
export class CaseDetails {
  private readonly api = inject(CasesApi);

  readonly id = input.required<string>();
  readonly showDelivery = input(false);
  readonly changed = output<void>();

  protected readonly current = remote<Data<Case>>(
    () => "/api/cases/" + this.id(),
  );
  protected readonly history = remote<Data<History[]>>(
    () => "/api/cases/" + this.id() + "/history",
  );
  protected readonly notifications = remote<Data<Notification[]>>(
    () => "/api/cases/" + this.id() + "/notifications",
  );
  protected readonly delivery = remote<Data<Delivery[]>>(
    () => "/api/cases/" + this.id() + "/delivery",
  );

  protected readonly changing = signal(false);
  protected readonly mutationError = linkedSignal<string, ApiError | null>({
    source: this.id,
    computation: () => null,
  });
  protected readonly tab = linkedSignal<"delivery" | "history">(() => {
    this.id();
    return this.showDelivery() ? "delivery" : "history";
  });

  protected readonly item = computed(() => this.current.data()?.data);
  protected readonly event = computed(() => this.delivery.data()?.data[0]);
  protected readonly next = computed(() => {
    const item = this.item();
    return item ? nextStatus[item.status] : null;
  });

  protected readonly statuses = statuses;
  protected readonly labels = labels;

  protected reached(status: (typeof statuses)[number]) {
    const item = this.item();
    return item
      ? statuses.indexOf(status) <= statuses.indexOf(item.status)
      : false;
  }

  protected async advance() {
    const next = this.next();
    if (!next) return;
    this.changing.set(true);
    this.mutationError.set(null);
    try {
      await this.api.changeStatus(this.id(), next);
      this.current.refresh();
      this.history.refresh();
      this.changed.emit();
    } catch (failure) {
      this.mutationError.set(failure as ApiError);
      this.current.refresh();
    } finally {
      this.changing.set(false);
    }
  }

  protected refreshAll() {
    this.current.refresh();
    this.history.refresh();
    this.delivery.refresh();
    this.notifications.refresh();
  }
}
