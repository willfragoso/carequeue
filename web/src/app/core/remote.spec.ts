import { provideHttpClient, withInterceptors } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ApiError } from "./api-error";
import { apiInterceptor } from "./api.interceptor";
import { remote } from "./remote";

describe("remote", () => {
  let controller: HttpTestingController;
  const path = signal<string | null>("/api/one");

  beforeEach(() => {
    vi.useFakeTimers();
    path.set("/api/one");
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function create() {
    return TestBed.runInInjectionContext(() =>
      remote<{ n: number }>(path, 3000),
    );
  }

  it("loads data, then polls on the interval", () => {
    const result = create();
    TestBed.tick();
    expect(result.loading()).toBe(true);
    controller.expectOne("/api/one").flush({ n: 1 });
    expect(result.data()).toEqual({ n: 1 });
    expect(result.loading()).toBe(false);

    vi.advanceTimersByTime(3000);
    controller.expectOne("/api/one").flush({ n: 2 });
    expect(result.data()).toEqual({ n: 2 });
  });

  it("does not start a second request while one is in flight", () => {
    create();
    TestBed.tick();
    const pending = controller.expectOne("/api/one");
    vi.advanceTimersByTime(6000);
    controller.expectNone("/api/one");
    pending.flush({ n: 1 });
  });

  it("keeps stale data on refresh but clears it when the path changes", () => {
    const result = create();
    TestBed.tick();
    controller.expectOne("/api/one").flush({ n: 1 });

    result.refresh();
    TestBed.tick();
    expect(result.data()).toEqual({ n: 1 });
    controller.expectOne("/api/one").flush({ n: 1 });

    path.set("/api/two");
    TestBed.tick();
    expect(result.data()).toBeNull();
    expect(result.loading()).toBe(true);
    controller.expectOne("/api/two").flush({ n: 2 });
    expect(result.data()).toEqual({ n: 2 });
  });

  it("stops polling when the path becomes null", () => {
    const result = create();
    TestBed.tick();
    controller.expectOne("/api/one").flush({ n: 1 });

    path.set(null);
    TestBed.tick();
    vi.advanceTimersByTime(9000);
    controller.expectNone(() => true);
    expect(result.data()).toBeNull();
    expect(result.loading()).toBe(false);
  });

  it("exposes failures and recovers on the next poll", () => {
    const result = create();
    TestBed.tick();
    controller
      .expectOne("/api/one")
      .flush({}, { status: 500, statusText: "Server Error" });
    expect(result.error()).toBeInstanceOf(ApiError);
    expect(result.error()?.code).toBe("HTTP_ERROR");
    expect(result.loading()).toBe(false);

    vi.advanceTimersByTime(3000);
    controller.expectOne("/api/one").flush({ n: 3 });
    expect(result.error()).toBeNull();
    expect(result.data()).toEqual({ n: 3 });
  });
});
