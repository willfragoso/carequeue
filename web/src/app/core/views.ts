export type ViewId = "cases" | "systems" | "flow" | "glossary";

export interface ViewMeta {
  crumb: string;
  heading: string;
  summary: string;
  footer: string;
}

export const views: Record<ViewId, ViewMeta> = {
  cases: {
    crumb: "Solicitações",
    heading: "Da entrada à resolução, sem perder o rastro.",
    summary:
      "CareQueue registra solicitações fictícias, guia a triagem e mostra o histórico de cada mudança.",
    footer: "Produto fictício para triagem e acompanhamento.",
  },
  systems: {
    crumb: "Mapa dos sistemas",
    heading: "Os componentes do CareQueue em um mapa.",
    summary:
      "Veja navegador, API, banco, mensageria e worker como blocos separados.",
    footer: "Mapa visual dos componentes do sistema.",
  },
  flow: {
    crumb: "Fluxo",
    heading: "Quando o broker falha, a fila continua.",
    summary:
      "Pare o RabbitMQ, crie uma solicitação e veja a outbox publicar o evento quando o broker voltar.",
    footer: "Persistência primeiro. Entrega em segundo plano.",
  },
  glossary: {
    crumb: "Glossário",
    heading: "Um mapa para aprender os termos do projeto.",
    summary:
      "Cada conceito aparece com uma explicação curta e o motivo de existir na demo.",
    footer: "Aprendizado do zero, sem jargão desnecessário.",
  },
};
