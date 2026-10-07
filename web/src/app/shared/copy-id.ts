import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from "@angular/core";

@Component({
  selector: "cq-copy-id",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="identifier">
      <span>{{ label() }}</span>
      <div>
        <code>{{ value() }}</code>
        <button
          type="button"
          class="copy-button"
          [attr.aria-label]="'Copiar ' + label()"
          (click)="copy()"
        >
          {{ copied() ? "Copiado" : "Copiar" }}
        </button>
      </div>
    </div>
  `,
})
export class CopyId {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  protected readonly copied = signal(false);

  protected copy() {
    navigator.clipboard.writeText(this.value()).then(
      () => this.copied.set(true),
      () => this.copied.set(false),
    );
  }
}
