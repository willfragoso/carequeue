export type ViewId = "cases" | "systems" | "flow" | "glossary";

export interface ViewMeta {
  heading: string;
  summary: string;
  footer: string;
}

export const views: Record<ViewId, ViewMeta> = {
  cases: {
    heading: "Solicitações",
    summary:
      "Acompanhe cada solicitação da entrada à resolução, com o histórico de todas as mudanças.",
    footer: "Fila de atendimento com triagem e histórico.",
  },
  systems: {
    heading: "Mapa dos sistemas",
    summary:
      "Navegador, API, banco, mensageria e worker: o que cada parte faz e como elas se conectam.",
    footer: "Mapa visual dos componentes do sistema.",
  },
  flow: {
    heading: "Fluxo de entrega",
    summary:
      "Quando o broker falha, a fila continua: pare o RabbitMQ, crie uma solicitação e veja a outbox publicar o evento na volta.",
    footer: "Persistência primeiro. Entrega em segundo plano.",
  },
  glossary: {
    heading: "Glossário",
    summary:
      "Os termos técnicos do projeto em linguagem simples, com o papel de cada um aqui.",
    footer: "Aprendizado do zero, sem jargão desnecessário.",
  },
};
