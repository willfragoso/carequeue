import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import type { Case, CaseList, Status } from "./models";
import { WorkspaceStore } from "./workspace-store";

const created: Case = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Synthetic",
  description: "Synthetic",
  status: "OPEN",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page(nextCursor: string | null, rows = 0): CaseList {
  return {
    data: Array.from({ length: rows }, (_, index) => ({
      ...created,
      id: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
    })),
    pagination: { mode: "cursor", pageSize: 10, nextCursor },
  };
}

function summary(
  total: number,
  byStatus: Partial<Record<Status, number>> = {},
) {
  return {
    data: {
      total,
      byStatus: { OPEN: 0, TRIAGE: 0, ASSIGNED: 0, RESOLVED: 0, ...byStatus },
    },
  };
}

describe("WorkspaceStore", () => {
  let store: WorkspaceStore;
  let controller: HttpTestingController;

  const casesRequest = (query: string) =>
    controller.expectOne("/api/cases?pagination=cursor&pageSize=10" + query);

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(WorkspaceStore);
    controller = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it("walks forward and back through cursor pages", () => {
    casesRequest("").flush(page("c1"));
    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c1").flush(page("c2"));
    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c2").flush(page(null));
    expect(store.previous()).toEqual([null, "c1"]);

    store.previousPage();
    TestBed.tick();
    expect(store.cursor()).toBe("c1");
    casesRequest("&cursor=c1").flush(page("c2"));
    store.previousPage();
    TestBed.tick();
    expect(store.cursor()).toBeNull();
    expect(store.previous()).toEqual([]);
    casesRequest("").flush(page("c1"));
  });

  it("ignores nextPage when there is no next cursor", () => {
    casesRequest("").flush(page(null));
    store.nextPage();
    expect(store.cursor()).toBeNull();
    expect(store.previous()).toEqual([]);
  });

  it("resets paging when the status filter changes", () => {
    casesRequest("").flush(page("c1"));
    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c1").flush(page(null));

    store.setFilter("TRIAGE");
    TestBed.tick();
    expect(store.cursor()).toBeNull();
    expect(store.previous()).toEqual([]);
    casesRequest("&status=TRIAGE").flush(page(null));
  });

  it("selects the new case, clears the filter and announces it", () => {
    casesRequest("").flush(page(null));
    store.setFilter("RESOLVED");
    TestBed.tick();
    casesRequest("&status=RESOLVED").flush(page(null));

    store.caseCreated(created);
    TestBed.tick();
    expect(store.selectedId()).toBe(created.id);
    expect(store.filter()).toBe("");
    expect(store.notice()).toContain("Solicitação criada");
    casesRequest("").flush(page(null));
  });

  it("polls operations only while the flow view is open", () => {
    casesRequest("").flush(page(null));
    controller.expectNone("/api/operations");

    store.view.set("flow");
    TestBed.tick();
    controller.expectOne("/api/operations");
  });

  it("derives the visible range and page count from the summary", () => {
    controller.expectOne("/api/cases/summary").flush(summary(23, { OPEN: 4 }));
    casesRequest("").flush(page("c1", 10));
    expect(store.total()).toBe(23);
    expect(store.pageCount()).toBe(3);
    expect([store.rangeStart(), store.rangeEnd()]).toEqual([1, 10]);

    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c1").flush(page("c2", 10));
    expect([store.pageIndex(), store.rangeStart(), store.rangeEnd()]).toEqual([
      1, 11, 20,
    ]);

    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c2").flush(page(null, 3));
    expect([store.rangeStart(), store.rangeEnd()]).toEqual([21, 23]);
    expect(store.hasNext()).toBe(false);
    expect(store.hasPrevious()).toBe(true);
  });

  it("counts only the filtered status and reports no range when empty", () => {
    controller
      .expectOne("/api/cases/summary")
      .flush(summary(23, { TRIAGE: 3 }));
    casesRequest("").flush(page(null, 10));
    store.setFilter("TRIAGE");
    TestBed.tick();
    expect(store.total()).toBe(3);
    expect(store.pageCount()).toBe(1);
    casesRequest("&status=TRIAGE").flush(page(null, 0));
    expect([store.rangeStart(), store.rangeEnd()]).toEqual([0, -1]);
  });

  it("changes the page size and starts over", () => {
    controller.expectOne("/api/cases/summary").flush(summary(40));
    casesRequest("").flush(page("c1", 10));
    store.nextPage();
    TestBed.tick();
    casesRequest("&cursor=c1").flush(page("c2", 10));

    store.setPageSize(20);
    TestBed.tick();
    expect(store.cursor()).toBeNull();
    expect(store.previous()).toEqual([]);
    expect(store.pageCount()).toBe(2);
    controller
      .expectOne("/api/cases?pagination=cursor&pageSize=20")
      .flush(page("c9", 20));
  });

  it("selects the first case on wide screens only, and only once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    casesRequest("").flush(page(null, 2));
    TestBed.tick();
    expect(store.selectedId()).toBe(store.rows()[0].id);

    store.select(store.rows()[1].id);
    store.setFilter("OPEN");
    TestBed.tick();
    casesRequest("&status=OPEN").flush(page(null, 2));
    TestBed.tick();
    expect(store.selectedId()).toBe(store.rows()[1].id);
    vi.unstubAllGlobals();
  });

  it("leaves nothing selected on narrow screens", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    casesRequest("").flush(page(null, 2));
    TestBed.tick();
    expect(store.selectedId()).toBeNull();
    vi.unstubAllGlobals();
  });
});
