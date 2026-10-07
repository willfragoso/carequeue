import {
  HttpErrorResponse,
  type HttpInterceptorFn,
} from "@angular/common/http";
import { catchError, throwError, timeout } from "rxjs";
import { ApiError } from "./api-error";

const REQUEST_TIMEOUT_MS = 7000;

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export function toApiError(error: unknown, correlationId: string): ApiError {
  if (
    error instanceof HttpErrorResponse &&
    error.status > 0 &&
    typeof error.error === "object" &&
    error.error !== null
  ) {
    const body = error.error as ErrorBody;
    return new ApiError(
      body.error?.message ?? "A API não conseguiu concluir a operação.",
      body.error?.code ?? "HTTP_ERROR",
      error.headers.get("x-correlation-id") ?? correlationId,
    );
  }
  return new ApiError(
    "Não foi possível acessar a API. Confira os serviços locais e tente novamente.",
    "CONNECTION_ERROR",
    correlationId,
  );
}

/** Tags every request with a correlation ID, bounds its duration and normalizes failures to ApiError. */
export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const correlationId = crypto.randomUUID();
  return next(
    request.clone({ setHeaders: { "x-correlation-id": correlationId } }),
  ).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    catchError((error: unknown) =>
      throwError(() => toApiError(error, correlationId)),
    ),
  );
};
