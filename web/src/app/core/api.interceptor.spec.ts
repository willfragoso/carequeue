import { HttpClient } from "@angular/common/http";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ApiError } from "./api-error";
import { apiInterceptor } from "./api.interceptor";

describe("apiInterceptor", () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it("sends a correlation ID with every request", () => {
    http.get("/api/cases").subscribe();
    const request = controller.expectOne("/api/cases");
    expect(request.request.headers.get("x-correlation-id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    request.flush({});
  });

  it("turns API errors into ApiError using the server correlation ID", () => {
    let failure: ApiError | undefined;
    http.post("/api/cases", {}).subscribe({ error: (e) => (failure = e) });
    controller.expectOne("/api/cases").flush(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input" } },
      {
        status: 400,
        statusText: "Bad Request",
        headers: { "x-correlation-id": "server-id" },
      },
    );
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      correlationId: "server-id",
    });
  });

  it("falls back to the request correlation ID and a generic message", () => {
    let failure: ApiError | undefined;
    http.get("/api/cases").subscribe({ error: (e) => (failure = e) });
    const request = controller.expectOne("/api/cases");
    const sent = request.request.headers.get("x-correlation-id");
    request.flush({}, { status: 500, statusText: "Server Error" });
    expect(failure).toMatchObject({ code: "HTTP_ERROR", correlationId: sent });
    expect(failure?.message).toContain("A API não conseguiu");
  });

  it("reports unreachable or non-JSON responses as CONNECTION_ERROR", () => {
    const failures: ApiError[] = [];
    http.get("/api/a").subscribe({ error: (e) => failures.push(e) });
    http.get("/api/b").subscribe({ error: (e) => failures.push(e) });
    controller
      .expectOne("/api/a")
      .error(new ProgressEvent("error"), { status: 0 });
    controller.expectOne("/api/b").flush("<html>Bad gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
    });
    expect(failures.map((failure) => failure.code)).toEqual([
      "CONNECTION_ERROR",
      "CONNECTION_ERROR",
    ]);
  });
});
