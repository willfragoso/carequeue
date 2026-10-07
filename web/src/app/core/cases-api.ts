import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type { paths } from "./api.gen";
import type { Case, Data, Status } from "./models";

type CreateCase =
  paths["/api/cases"]["post"]["requestBody"]["content"]["application/json"];

@Injectable({ providedIn: "root" })
export class CasesApi {
  private readonly http = inject(HttpClient);

  create(input: CreateCase) {
    return firstValueFrom(this.http.post<Data<Case>>("/api/cases", input));
  }

  changeStatus(id: string, status: Status) {
    return firstValueFrom(
      this.http.patch<Data<Case>>("/api/cases/" + id + "/status", { status }),
    );
  }
}
