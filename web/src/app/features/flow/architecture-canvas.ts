import { ChangeDetectionStrategy, Component } from "@angular/core";
import { architectureSteps } from "./architecture-steps";

@Component({
  selector: "cq-architecture-canvas",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel architecture-panel">
      <div class="panel-kicker">DIAGRAMA DO FLUXO</div>
      <h2>Como uma solicitação vira uma notificação confiável.</h2>
      <div class="architecture-canvas" aria-label="Arquitetura CareQueue">
        @for (step of steps; track step.number; let last = $last) {
          <article class="architecture-node">
            <span class="architecture-number">{{ step.number }}</span>
            <strong>{{ step.label }}</strong>
            <small>{{ step.title }}</small>
            <p>{{ step.detail }}</p>
            @if (!last) {
              <span class="architecture-arrow" aria-hidden="true">→</span>
            }
          </article>
        }
      </div>
    </section>
  `,
})
export class ArchitectureCanvas {
  protected readonly steps = architectureSteps;
}
