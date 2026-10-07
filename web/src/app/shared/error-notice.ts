import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ApiError } from "../core/api-error";

@Component({
  selector: "cq-error-notice",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as failure) {
      <div class="error-notice" role="alert">
        <strong>Não foi possível concluir</strong>
        <p>{{ message() }}</p>
        <small
          >{{ failure.code }} · Correlação: {{ failure.correlationId }}</small
        >
      </div>
    }
  `,
})
export class ErrorNotice {
  readonly error = input<ApiError | null>(null);
  protected readonly message = computed(() => {
    const failure = this.error();
    return failure?.code === "INVALID_STATUS_TRANSITION"
      ? "O status mudou ou a transição é inválida. Atualize a solicitação antes de tentar novamente."
      : failure?.message;
  });
}
