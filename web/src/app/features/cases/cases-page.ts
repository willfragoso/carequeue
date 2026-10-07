import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { labels, statuses } from "../../core/models";
import { WorkspaceStore } from "../../core/workspace-store";
import { ErrorNotice } from "../../shared/error-notice";
import { StatusBadge } from "../../shared/status-badge";
import { TimePipe } from "../../shared/time.pipe";
import { CaseDetails } from "./case-details";

@Component({
  selector: "cq-cases-page",
  imports: [CaseDetails, ErrorNotice, StatusBadge, TimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./cases-page.html",
})
export class CasesPage {
  protected readonly store = inject(WorkspaceStore);
  protected readonly statuses = statuses;
  protected readonly labels = labels;

  protected value(event: Event) {
    return (event.target as HTMLSelectElement).value;
  }
}
