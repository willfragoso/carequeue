import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { filter } from "rxjs";
import { WorkspaceStore } from "./core/workspace-store";
import { views, type ViewId } from "./core/views";
import { NewCaseDialog } from "./features/cases/new-case-dialog";
import { Metrics } from "./features/flow/metrics";
import { ErrorNotice } from "./shared/error-notice";
import { Icon } from "./shared/icon";

@Component({
  selector: "cq-root",
  imports: [
    ErrorNotice,
    Icon,
    Metrics,
    NewCaseDialog,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./app.html",
})
export class App {
  protected readonly store = inject(WorkspaceStore);
  private readonly router = inject(Router);
  protected readonly meta = computed(() => views[this.store.view()]);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) route = route.firstChild;
        const view = route.data["view"] as ViewId | undefined;
        if (view) this.store.view.set(view);
      });
  }
}
