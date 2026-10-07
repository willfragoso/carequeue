import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from "@angular/core";
import type { ApiError } from "../../core/api-error";
import { CasesApi } from "../../core/cases-api";
import type { Case } from "../../core/models";
import { ErrorNotice } from "../../shared/error-notice";

@Component({
  selector: "cq-new-case-dialog",
  imports: [ErrorNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./new-case-dialog.html",
})
export class NewCaseDialog {
  private readonly api = inject(CasesApi);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>("dialog");

  readonly closed = output<void>();
  readonly created = output<Case>();

  protected readonly title = signal("");
  protected readonly description = signal("");
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    afterNextRender(() => this.dialog()?.nativeElement.showModal());
  }

  protected text(event: Event) {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected cancel(event: Event) {
    event.preventDefault();
    if (!this.busy()) this.closed.emit();
  }

  protected fillExample() {
    this.title.set(
      "Solicitação sintética " + new Date().toLocaleTimeString("pt-BR"),
    );
    this.description.set(
      "Exemplo fictício para demonstrar triagem e notificação simulada.",
    );
  }

  protected async submit(event: Event) {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.create({
        title: this.title().trim(),
        description: this.description().trim(),
      });
      this.created.emit(result.data);
      this.closed.emit();
    } catch (failure) {
      this.error.set(failure as ApiError);
    } finally {
      this.busy.set(false);
    }
  }
}
