import { computed, Injectable, signal } from "@angular/core";
import type { Case, CaseList, Data, Operations } from "./models";
import { remote } from "./remote";
import type { ViewId } from "./views";

/** State shared by every view: the selected case, list filter/cursor and polled lists. */
@Injectable({ providedIn: "root" })
export class WorkspaceStore {
  readonly view = signal<ViewId>("cases");
  readonly filter = signal("");
  readonly cursor = signal<string | null>(null);
  readonly previous = signal<(string | null)[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly showNew = signal(false);
  readonly notice = signal("");

  readonly operations = remote<Data<Operations>>(() =>
    this.view() === "flow" ? "/api/operations" : null,
  );
  readonly cases = remote<CaseList>(() => {
    const query = new URLSearchParams({ pagination: "cursor", pageSize: "10" });
    if (this.filter()) query.set("status", this.filter());
    const cursor = this.cursor();
    if (cursor) query.set("cursor", cursor);
    return "/api/cases?" + query.toString();
  });

  readonly snapshot = computed(() =>
    this.operations.error() ? null : (this.operations.data()?.data ?? null),
  );
  readonly productAvailable = computed(() => !this.cases.error());

  select(id: string) {
    this.selectedId.set(id);
  }

  setFilter(status: string) {
    this.filter.set(status);
    this.resetPaging();
  }

  nextPage() {
    const next = this.cases.data()?.pagination.nextCursor;
    if (!next) return;
    this.previous.update((pages) => [...pages, this.cursor()]);
    this.cursor.set(next);
  }

  previousPage() {
    const pages = this.previous();
    this.cursor.set(pages.at(-1) ?? null);
    this.previous.set(pages.slice(0, -1));
  }

  caseCreated(created: Case) {
    this.selectedId.set(created.id);
    this.setFilter("");
    this.cases.refresh();
    this.operations.refresh();
    this.notice.set(
      "Solicitação criada. A entrega da notificação será acompanhada automaticamente.",
    );
  }

  caseChanged() {
    this.cases.refresh();
    this.operations.refresh();
  }

  private resetPaging() {
    this.cursor.set(null);
    this.previous.set([]);
  }
}
