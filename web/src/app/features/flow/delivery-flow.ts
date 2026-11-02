import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { Delivery } from "../../core/models";
import { Icon } from "../../shared/icon";
import { TimePipe } from "../../shared/time.pipe";

@Component({
  selector: "cq-delivery-flow",
  imports: [Icon, TimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="delivery-flow" aria-label="Progresso da entrega">
      @for (step of steps(); track step.label; let index = $index) {
        <div [class]="stage() > index ? 'flow-step complete' : 'flow-step'">
          <span class="flow-number">
            @if (stage() > index) {
              <cq-icon name="check" />
            } @else {
              {{ index + 1 }}
            }
          </span>
          <strong>{{ step.label }}</strong>
          <small>{{ step.at ? (step.at | cqTime) : step.detail }}</small>
        </div>
      }
    </div>
  `,
})
export class DeliveryFlow {
  readonly event = input<Delivery | undefined>();

  protected readonly stage = computed(() => {
    const event = this.event();
    if (event?.notificationSavedAt) return 3;
    if (event?.publishedAt) return 2;
    return event ? 1 : 0;
  });

  protected readonly steps = computed(() => {
    const event = this.event();
    return [
      {
        label: "Persistida",
        detail: "Solicitação + outbox",
        at: event?.createdAt,
      },
      {
        label: "Publicada",
        detail: "Broker confirmou",
        at: event?.publishedAt,
      },
      {
        label: "Notificada",
        detail: "Efeito salvo",
        at: event?.notificationSavedAt,
      },
    ];
  });
}
