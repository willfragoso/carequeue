import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import type { Case, CaseList } from "./models";
import { WorkspaceStore } from "./workspace-store";

const created: Case = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Synthetic",
  description: "Synthetic",
  status: "OPEN",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page(nextCursor: string | null): CaseList {
  return { data: [], pagination: { mode: "cursor", pageSize: 10, nextCursor } };
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
});
