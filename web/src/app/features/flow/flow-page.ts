import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import type { Data, Delivery } from "../../core/models";
import { remote } from "../../core/remote";
import { WorkspaceStore } from "../../core/workspace-store";
import { CaseDetails } from "../cases/case-details";
import { ArchitectureCanvas } from "./architecture-canvas";

@Component({
  selector: "cq-flow-page",
  imports: [ArchitectureCanvas, CaseDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./flow-page.html",
})
export class FlowPage {
  protected readonly store = inject(WorkspaceStore);
  protected readonly delivery = remote<Data<Delivery[]>>(() => {
    const id = this.store.selectedId();
    return id ? "/api/cases/" + id + "/delivery" : null;
  });
}
