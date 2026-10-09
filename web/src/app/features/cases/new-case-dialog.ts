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
import { Icon } from "../../shared/icon";

const examples = [
  {
    title: "Não consigo redefinir minha senha",
    description:
      "O link de redefinição enviado por e-mail abre uma página em branco. Já tentei em dois navegadores e pelo celular.",
  },
  {
    title: "Boleto com valor diferente do contratado",
    description:
      "O boleto deste mês veio com R$ 189,90, mas o plano contratado custa R$ 149,90. Não há nenhum serviço adicional na conta.",
  },
  {
    title: "Pedido entregue incompleto",
    description:
      "Recebi a caixa com apenas dois dos três itens do pedido. A nota fiscal lista os três. Tenho fotos da embalagem.",
  },
  {
    title: "Aplicativo não sincroniza as notificações",
    description:
      "Desde a última atualização, o app deixou de mostrar novos avisos. Só aparecem depois de abrir manualmente a tela inicial.",
  },
  {
    title: "Solicitação de segunda via de contrato",
    description:
      "Preciso de uma cópia assinada do contrato para apresentar ao setor jurídico. Pode ser em PDF.",
  },
];

@Component({
  selector: "cq-new-case-dialog",
  imports: [ErrorNotice, Icon],
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
    const options = examples.filter((item) => item.title !== this.title());
    const example = options[Math.floor(Math.random() * options.length)];
    this.title.set(example.title);
    this.description.set(example.description);
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
