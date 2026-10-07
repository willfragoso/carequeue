import { Pipe, type PipeTransform } from "@angular/core";

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

@Pipe({ name: "cqTime" })
export class TimePipe implements PipeTransform {
  transform(value: string): string {
    return formatter.format(new Date(value));
  }
}
