import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from "@angular/common/http";
import {
  provideBrowserGlobalErrorListeners,
  type ApplicationConfig,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { apiInterceptor } from "./core/api.interceptor";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    provideRouter(routes),
  ],
};
