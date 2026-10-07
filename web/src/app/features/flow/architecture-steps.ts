export interface ArchitectureStep {
  number: string;
  title: string;
  label: string;
  detail: string;
}
export const architectureSteps: ArchitectureStep[] = [
  {
    number: "01",
    title: "API recebe a solicitação",
    label: "Express API",
    detail: "Valida a entrada HTTP, gera o correlationId e inicia a transação.",
  },
  {
    number: "02",
    title: "PostgreSQL confirma o registro",
    label: "Cases + History + Outbox",
    detail:
      "Grava a solicitação, o histórico inicial e o evento CaseCreated.v1 juntos.",
  },
  {
    number: "03",
    title: "Publisher entrega ao broker",
    label: "Outbox relay",
    detail:
      "Lê eventos pendentes e só marca como publicado após publisher confirm.",
  },
  {
    number: "04",
    title: "RabbitMQ desacopla o trabalho",
    label: "RabbitMQ",
    detail:
      "Mantém a mensagem durável e aplica retentativas limitadas antes da DLQ.",
  },
  {
    number: "05",
    title: "Worker salva o efeito",
    label: "Worker",
    detail:
      "Consome at least once, grava a notificação por eventId e só então confirma.",
  },
  {
    number: "06",
    title: "Observabilidade fecha o ciclo",
    label: "Delivery view",
    detail:
      "Mostra eventId, correlationId, status de entrega, retry e dead-letter queue.",
  },
];
