import { computed, effect, Injectable, signal, untracked } from "@angular/core";
import type {
  Case,
  CaseList,
  CaseSummary,
  Data,
  Operations,
  Status,
} from "./models";
import { remote } from "./remote";
import type { ViewId } from "./views";

export const pageSizes = [10, 20, 50] as const;

/** State shared by every view: the selected case, list filter/paging and polled lists. */
@Injectable({ providedIn: "root" })
export class WorkspaceStore {
  readonly view = signal<ViewId>("cases");
  readonly filter = signal<Status | "">("");
  readonly pageSize = signal<number>(pageSizes[0]);
  readonly cursor = signal<string | null>(null);
  readonly previous = signal<(string | null)[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly showNew = signal(false);
  readonly notice = signal("");

  readonly operations = remote<Data<Operations>>(() =>
    this.view() === "flow" ? "/api/operations" : null,
  );
  readonly summary = remote<Data<CaseSummary>>(() => "/api/cases/summary");
  readonly cases = remote<CaseList>(() => {
    const query = new URLSearchParams({
      pagination: "cursor",
      pageSize: String(this.pageSize()),
    });
    if (this.filter()) query.set("status", this.filter());
    const cursor = this.cursor();
    if (cursor) query.set("cursor", cursor);
    return "/api/cases?" + query.toString();
  });

  readonly snapshot = computed(() =>
    this.operations.error() ? null : (this.operations.data()?.data ?? null),
  );
  readonly productAvailable = computed(() => !this.cases.error());

  /** Cases matching the current filter, or null while the summary is unknown. */
  readonly total = computed(() => {
    const summary = this.summary.data()?.data;
    if (!summary) return null;
    const filter = this.filter();
    return filter ? summary.byStatus[filter] : summary.total;
  });
  readonly pageIndex = computed(() => this.previous().length);
  readonly pageCount = computed(() => {
    const total = this.total();
    return total === null
      ? null
      : Math.max(1, Math.ceil(total / this.pageSize()));
  });
  readonly rangeStart = computed(() =>
    this.rows().length ? this.pageIndex() * this.pageSize() + 1 : 0,
  );
  readonly rangeEnd = computed(
    () => this.rangeStart() + this.rows().length - 1,
  );
  readonly rows = computed(() => this.cases.data()?.data ?? []);
  readonly hasPrevious = computed(() => this.previous().length > 0);
  readonly hasNext = computed(() => !!this.cases.data()?.pagination.nextCursor);

  private autoSelected = false;

  constructor() {
    // On wide screens the details panel sits beside the list, so show something in it.
    effect(() => {
      const first = this.rows()[0];
      if (!first || this.autoSelected) return;
      untracked(() => {
        this.autoSelected = true;
        const wide =
          typeof matchMedia === "function" &&
          matchMedia("(min-width: 1151px)").matches;
        if (wide && !this.selectedId()) this.selectedId.set(first.id);
      });
    });
  }

  select(id: string) {
    this.selectedId.set(id);
  }

  setFilter(status: Status | "") {
    this.filter.set(status);
    this.resetPaging();
  }

  setPageSize(size: number) {
    this.pageSize.set(size);
    this.resetPaging();
  }

  firstPage() {
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
    if (!pages.length) return;
    this.cursor.set(pages.at(-1) ?? null);
    this.previous.set(pages.slice(0, -1));
  }

  caseCreated(created: Case) {
    this.selectedId.set(created.id);
    this.setFilter("");
    this.refreshLists();
    this.notice.set(
      "Solicitação criada. A entrega da notificação será acompanhada automaticamente.",
    );
  }

  caseChanged() {
    this.refreshLists();
  }

  private refreshLists() {
    this.cases.refresh();
    this.summary.refresh();
    this.operations.refresh();
  }

  private resetPaging() {
    this.cursor.set(null);
    this.previous.set([]);
  }
}
