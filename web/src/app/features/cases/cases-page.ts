import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { groupLabels, labels, statuses } from "../../core/models";
import { pageSizes, WorkspaceStore } from "../../core/workspace-store";
import { AgoPipe } from "../../shared/ago.pipe";
import { ErrorNotice } from "../../shared/error-notice";
import { Icon } from "../../shared/icon";
import { StatusBadge } from "../../shared/status-badge";
import { TimePipe } from "../../shared/time.pipe";
import { CaseDetails } from "./case-details";

@Component({
  selector: "cq-cases-page",
  imports: [AgoPipe, CaseDetails, ErrorNotice, Icon, StatusBadge, TimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./cases-page.html",
})
export class CasesPage {
  protected readonly store = inject(WorkspaceStore);
  protected readonly statuses = statuses;
  protected readonly labels = labels;
  protected readonly groupLabels = groupLabels;
  protected readonly pageSizes = pageSizes;

  protected size(event: Event) {
    return Number((event.target as HTMLSelectElement).value);
  }
}
