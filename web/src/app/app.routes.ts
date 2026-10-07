import type { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "solicitacoes" },
  {
    path: "solicitacoes",
    data: { view: "cases" },
    loadComponent: () =>
      import("./features/cases/cases-page").then((m) => m.CasesPage),
  },
  {
    path: "mapa",
    data: { view: "systems" },
    loadComponent: () =>
      import("./features/systems-map/systems-map-page").then(
        (m) => m.SystemsMapPage,
      ),
  },
  {
    path: "fluxo",
    data: { view: "flow" },
    loadComponent: () =>
      import("./features/flow/flow-page").then((m) => m.FlowPage),
  },
  {
    path: "glossario",
    data: { view: "glossary" },
    loadComponent: () =>
      import("./features/glossary/glossary-page").then((m) => m.GlossaryPage),
  },
  { path: "**", redirectTo: "solicitacoes" },
];
