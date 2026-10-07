export interface GlossaryTerm {
  term: string;
  plain: string;
  context: string;
}
export const glossaryTerms: GlossaryTerm[] = [
  {
    term: "API",
    plain:
      "Uma porta de entrada para outros programas pedirem algo ao sistema.",
    context:
      "No CareQueue, a API recebe comandos como criar uma solicitação ou mudar seu status.",
  },
  {
    term: "Backend",
    plain:
      "A parte do sistema que roda no servidor e cuida das regras, dados e integrações.",
    context:
      "Este projeto mostra o backend por trás de uma fila fictícia de atendimento.",
  },
  {
    term: "Frontend",
    plain: "A tela que a pessoa usa no navegador para interagir com o sistema.",
    context:
      "Aqui ele serve para criar solicitações, ver a arquitetura e testar falhas.",
  },
  {
    term: "PostgreSQL",
    plain: "Um banco de dados relacional usado para guardar informações.",
    context:
      "Ele guarda solicitações, histórico, eventos pendentes e notificações simuladas.",
  },
  {
    term: "RabbitMQ",
    plain:
      "Um sistema de filas que entrega mensagens entre partes diferentes da aplicação.",
    context:
      "Ele leva o evento CaseCreated.v1 até o worker, sem bloquear a criação da solicitação.",
  },
  {
    term: "Broker",
    plain: "Outro nome para o sistema que recebe, guarda e entrega mensagens.",
    context:
      "Neste projeto, o broker é o RabbitMQ. Se ele cair, a API ainda salva a solicitação.",
  },
  {
    term: "Fila",
    plain:
      "Uma linha de mensagens aguardando processamento, parecida com uma fila de atendimento.",
    context:
      "O worker consome mensagens da fila para criar notificações simuladas.",
  },
  {
    term: "Mensagem",
    plain:
      "Um pacote pequeno de informação enviado de uma parte do sistema para outra.",
    context: "O evento CaseCreated.v1 vira uma mensagem publicada no RabbitMQ.",
  },
  {
    term: "Evento",
    plain: "Um registro dizendo que algo importante aconteceu no sistema.",
    context:
      "Quando uma solicitação é criada, o sistema registra o evento CaseCreated.v1.",
  },
  {
    term: "Outbox",
    plain:
      "Uma tabela no banco que guarda eventos que ainda precisam ser publicados.",
    context:
      "Ela evita perder o evento quando a solicitação foi salva, mas o RabbitMQ está fora.",
  },
  {
    term: "Publisher",
    plain:
      "O processo responsável por publicar mensagens em uma fila ou broker.",
    context: "Ele lê a outbox e envia os eventos pendentes para o RabbitMQ.",
  },
  {
    term: "Publisher confirm",
    plain:
      "Uma confirmação do broker dizendo que recebeu a mensagem publicada.",
    context: "O evento só é marcado como publicado depois dessa confirmação.",
  },
  {
    term: "Worker",
    plain:
      "Um processo que trabalha em segundo plano, sem depender de uma tela aberta.",
    context:
      "Ele consome o evento e grava uma notificação simulada no PostgreSQL.",
  },
  {
    term: "Idempotência",
    plain: "A propriedade de repetir uma ação sem duplicar o resultado final.",
    context:
      "Se o mesmo evento chegar duas vezes, o worker não cria duas notificações.",
  },
  {
    term: "At least once",
    plain: "Uma garantia de entrega em que a mensagem chega uma ou mais vezes.",
    context:
      "O sistema aceita repetição de mensagem e se protege com idempotência.",
  },
  {
    term: "Exactly once",
    plain:
      "A promessa de que algo acontece exatamente uma vez. É difícil garantir em sistemas distribuídos.",
    context:
      "O CareQueue não promete exactly once; ele usa at least once com consumidor idempotente.",
  },
  {
    term: "Retry",
    plain: "Uma nova tentativa automática depois de uma falha temporária.",
    context:
      "Se o worker falhar, a mensagem pode tentar novamente algumas vezes.",
  },
  {
    term: "Dead-letter queue",
    plain:
      "Uma fila para mensagens que falharam várias vezes e precisam de investigação.",
    context:
      "Depois do limite de retries, a mensagem vai para a DLQ em vez de ficar em ciclo infinito.",
  },
  {
    term: "DLQ",
    plain: "Abreviação de dead-letter queue.",
    context:
      "Na tela de Arquitetura, ela mostra mensagens que não conseguiram ser processadas.",
  },
  {
    term: "correlationId",
    plain:
      "Um identificador usado para seguir a mesma solicitação em logs e processos diferentes.",
    context:
      "Ele ajuda a ligar a chamada HTTP, o evento publicado e o processamento no worker.",
  },
  {
    term: "eventId",
    plain: "Um identificador único de um evento.",
    context:
      "Ele é usado como chave para impedir que uma entrega repetida duplique a notificação.",
  },
  {
    term: "Transação",
    plain: "Um grupo de mudanças no banco que entra inteiro ou não entra nada.",
    context:
      "A solicitação, o histórico inicial e o evento da outbox são gravados juntos.",
  },
  {
    term: "Docker Compose",
    plain:
      "Uma forma de subir vários serviços locais com um único arquivo de configuração.",
    context:
      "Ele inicia API, frontend, PostgreSQL, RabbitMQ, publisher e worker para a demo.",
  },
  {
    term: "CI",
    plain:
      "Um robô que roda testes e verificações automaticamente quando há mudança no código.",
    context:
      "O GitHub Actions executa lint, typecheck, testes, integração e E2E.",
  },
  {
    term: "PR",
    plain:
      "Pull request: uma proposta de mudança no código para revisão antes de entrar na branch principal.",
    context:
      "O projeto foi evoluído em PRs para mostrar histórico real de desenvolvimento.",
  },
  {
    term: "Branch",
    plain: "Uma linha separada de trabalho no Git.",
    context:
      "Mudanças novas são feitas em branches e depois entram na main por PR.",
  },
  {
    term: "main",
    plain:
      "A branch principal do repositório, onde fica a versão estável do projeto.",
    context:
      "Ela está protegida para exigir PR e checks antes de aceitar mudanças.",
  },
];
