import { HttpClient } from "@angular/common/http";
import { effect, inject, signal, untracked, type Signal } from "@angular/core";
import type { Subscription } from "rxjs";
import type { ApiError } from "./api-error";

export interface Remote<T> {
  readonly data: Signal<T | null>;
  readonly error: Signal<ApiError | null>;
  readonly loading: Signal<boolean>;
  /** Restarts the request now without clearing the data already shown. */
  refresh(): void;
}

/**
 * Polls a GET endpoint while `path()` is non-null. Changing the path clears the
 * previous result; a null path stops polling. Must run in an injection context.
 */
export function remote<T>(
  path: () => string | null,
  interval = 3000,
): Remote<T> {
  const http = inject(HttpClient);
  const data = signal<T | null>(null);
  const error = signal<ApiError | null>(null);
  const loading = signal(false);
  const generation = signal(0);
  let current: string | null | undefined;

  effect((onCleanup) => {
    const url = path();
    generation();
    untracked(() => {
      if (url !== current) {
        current = url;
        data.set(null);
        error.set(null);
        loading.set(url !== null);
      }
    });
    if (url === null) return;

    let inFlight = false;
    let request: Subscription | undefined;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      request = http.get<T>(url).subscribe({
        next: (body) => {
          inFlight = false;
          data.set(body);
          error.set(null);
          loading.set(false);
        },
        error: (failure: ApiError) => {
          inFlight = false;
          error.set(failure);
          loading.set(false);
        },
      });
    };
    load();
    const timer = setInterval(load, interval);
    onCleanup(() => {
      clearInterval(timer);
      request?.unsubscribe();
    });
  });

  return {
    data: data.asReadonly(),
    error: error.asReadonly(),
    loading: loading.asReadonly(),
    refresh: () => generation.update((value) => value + 1),
  };
}
