import { ChangeDetectionStrategy, Component } from "@angular/core";
import { glossaryTerms } from "./glossary-terms";

@Component({
  selector: "cq-glossary-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel glossary-panel">
      <div class="panel-kicker">GLOSSÁRIO PARA COMEÇAR</div>
      <h2>Termos técnicos em linguagem simples.</h2>
      <p>
        Use esta tela como cola rápida enquanto explora Solicitações, Mapa e
        Fluxo. As explicações focam no papel de cada termo dentro do CareQueue.
      </p>
      <div class="glossary-grid">
        @for (item of terms; track item.term) {
          <article class="glossary-card">
            <h3>{{ item.term }}</h3>
            <p>{{ item.plain }}</p>
            <small>{{ item.context }}</small>
          </article>
        }
      </div>
    </section>
  `,
})
export class GlossaryPage {
  protected readonly terms = glossaryTerms;
}
