import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { useRemote } from "./useRemote";
import {
  labels,
  nextStatus,
  statuses,
  type Case,
  type CaseList,
  type Data,
  type History,
  type Notification,
  type Delivery,
  type Operations,
  type Status,
} from "./types";

function time(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
function ErrorNotice({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const message =
    error.code === "INVALID_STATUS_TRANSITION"
      ? "O status mudou ou a transição é inválida. Atualize a solicitação antes de tentar novamente."
      : error.message;
  return (
    <div className="error-notice" role="alert">
      <strong>Não foi possível concluir</strong>
      <p>{message}</p>
      <small>
        {error.code} · Correlação: {error.correlationId}
      </small>
    </div>
  );
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={"badge status-" + status}>
      <i />
      {labels[status]}
    </span>
  );
}
function CopyId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="identifier">
      <span>{label}</span>
      <div>
        <code>{value}</code>
        <button
          type="button"
          className="copy-button"
          aria-label={"Copiar " + label}
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
function Metrics({
  data,
  error,
}: {
  data: Operations | null;
  error: ApiError | null;
}) {
  const available = Boolean(data && !error);
  return (
    <div className="metrics">
      <article>
        <span>Solicitações registradas</span>
        <strong>{available ? data!.cases : "—"}</strong>
        <small>Persistidas no PostgreSQL</small>
      </article>
      <article>
        <span>Eventos pendentes</span>
        <strong className={data?.outbox.pending ? "text-amber" : ""}>
          {available ? data!.outbox.pending : "—"}
        </strong>
        <small>
          {available && data!.outbox.oldestPendingSeconds !== null
            ? "Mais antigo há " +
              Math.floor(data!.outbox.oldestPendingSeconds) +
              " s"
            : "Aguardando publicação"}
        </small>
      </article>
      <article>
        <span>RabbitMQ</span>
        <strong className="metric-status">
          <i
            className={
              available && data!.broker.status === "available"
                ? "dot green"
                : "dot amber"
            }
          />
          {available
            ? data!.broker.status === "available"
              ? "Conectado"
              : "Indisponível"
            : "Sem leitura"}
        </strong>
        <small>
          {available && data!.broker.consumers !== null
            ? data!.broker.consumers + " consumidor(es) ativo(s)"
            : "A API pode persistir sem o broker"}
        </small>
      </article>
      <article>
        <span>Notificações salvas</span>
        <strong>{available ? data!.notifications : "—"}</strong>
        <small>Um efeito por eventId</small>
      </article>
    </div>
  );
}
function NewCaseDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: Case) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<Data<Case>>("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
        }),
      });
      onCreated(result.body.data);
      onClose();
    } catch (error) {
      setError(error as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="new-case-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">DADOS SINTÉTICOS</span>
          <h2>Nova solicitação</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Fechar formulário"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p>Crie um atendimento fictício e acompanhe cada etapa da entrega.</p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label>
          Título
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex.: Acompanhamento fictício A"
            disabled={busy}
          />
        </label>
        <label>
          Descrição
          <textarea
            required
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descreva apenas uma situação inventada."
            disabled={busy}
          />
        </label>
        <div className="synthetic-note">
          Use somente informações inventadas. Nenhum contato externo será feito.
        </div>
        <ErrorNotice error={error} />
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setTitle(
                "Solicitação sintética " +
                  new Date().toLocaleTimeString("pt-BR"),
              );
              setDescription(
                "Exemplo fictício para demonstrar triagem e notificação simulada.",
              );
            }}
          >
            Preencher exemplo
          </button>
          <button
            className="primary"
            disabled={busy || !title.trim() || !description.trim()}
          >
            {busy ? "Salvando…" : "Criar solicitação"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
function DeliveryFlow({ event }: { event: Delivery | undefined }) {
  const stage = event?.notificationSavedAt
    ? 3
    : event?.publishedAt
      ? 2
      : event
        ? 1
        : 0;
  return (
    <div className="delivery-flow" aria-label="Progresso da entrega">
      {[
        {
          label: "Persistida",
          detail: "Solicitação + outbox",
          at: event?.createdAt,
        },
        {
          label: "Publicada",
          detail: "Broker confirmou",
          at: event?.publishedAt,
        },
        {
          label: "Notificada",
          detail: "Efeito salvo",
          at: event?.notificationSavedAt,
        },
      ].map((step, index) => (
        <div
          key={step.label}
          className={stage > index ? "flow-step complete" : "flow-step"}
        >
          <span className="flow-number">{stage > index ? "✓" : index + 1}</span>
          <strong>{step.label}</strong>
          <small>{step.at ? time(step.at) : step.detail}</small>
        </div>
      ))}
    </div>
  );
}
const architectureSteps = [
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
const glossaryTerms = [
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
function ArchitectureCanvas() {
  return (
    <section className="panel architecture-panel">
      <div className="panel-kicker">DIAGRAMA DO FLUXO</div>
      <h2>Como uma solicitação vira uma notificação confiável.</h2>
      <div className="architecture-canvas" aria-label="Arquitetura CareQueue">
        {architectureSteps.map((step, index) => (
          <article key={step.number} className="architecture-node">
            <span className="architecture-number">{step.number}</span>
            <strong>{step.label}</strong>
            <small>{step.title}</small>
            <p>{step.detail}</p>
            {index < architectureSteps.length - 1 && (
              <span className="architecture-arrow" aria-hidden="true">
                →
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function SystemsMap() {
  return (
    <section className="panel systems-map-panel">
      <div className="panel-kicker">MAPA DOS SISTEMAS</div>
      <h2>Componentes que executam a demonstração.</h2>
      <div
        className="systems-board"
        aria-label="Diagrama dos sistemas CareQueue"
      >
        <svg
          className="systems-lines"
          viewBox="0 0 1000 430"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrowhead"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
            >
              <path d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>
          <path d="M220 218 H350" />
          <path d="M553 170 H678" />
          <path d="M553 250 H678" />
          <path d="M827 166 H895" />
          <path d="M827 316 H895" />
          <path d="M752 366 V430 H448" />
          <path d="M445 368 V430 H130 V282" />
        </svg>
        <div className="systems-zone zone-client">
          <span>Usuário</span>
          <article className="system-card accent-teal">
            <b>React console</b>
            <small>Solicitações, arquitetura e glossário no navegador.</small>
          </article>
        </div>
        <div className="systems-zone zone-api">
          <span>Aplicação Node.js</span>
          <article className="system-card accent-blue">
            <b>Express API</b>
            <small>Validação HTTP, regras de status e correlationId.</small>
          </article>
          <article className="system-card accent-purple">
            <b>Outbox publisher</b>
            <small>Lê eventos pendentes e publica com confirmação.</small>
          </article>
          <article className="system-card accent-orange">
            <b>Worker</b>
            <small>Consome eventos e salva a notificação simulada.</small>
          </article>
        </div>
        <div className="systems-zone zone-data">
          <span>Persistência</span>
          <article className="system-card accent-green">
            <b>PostgreSQL</b>
            <small>Cases, histórico, outbox e notificações.</small>
          </article>
        </div>
        <div className="systems-zone zone-broker">
          <span>Mensageria</span>
          <article className="system-card accent-amber">
            <b>RabbitMQ</b>
            <small>Fila principal, retries limitados e DLQ.</small>
          </article>
        </div>
        <ol className="systems-legend" aria-label="Legenda do mapa">
          <li>
            <span>1</span> Console chama a API.
          </li>
          <li>
            <span>2</span> API grava dados e evento na mesma transação.
          </li>
          <li>
            <span>3</span> Publisher envia o evento para o broker.
          </li>
          <li>
            <span>4</span> Worker processa com idempotência.
          </li>
        </ol>
      </div>
    </section>
  );
}
function Glossary() {
  return (
    <section className="panel glossary-panel">
      <div className="panel-kicker">GLOSSÁRIO PARA COMEÇAR</div>
      <h2>Termos técnicos em linguagem simples.</h2>
      <p>
        Use esta tela como cola rápida enquanto explora Solicitações e
        Arquitetura. As explicações focam no papel de cada termo dentro do
        CareQueue.
      </p>
      <div className="glossary-grid">
        {glossaryTerms.map((item) => (
          <article key={item.term} className="glossary-card">
            <h3>{item.term}</h3>
            <p>{item.plain}</p>
            <small>{item.context}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
function CaseDetails({
  id,
  onChange,
  showDelivery = false,
}: {
  id: string;
  onChange: () => void;
  showDelivery?: boolean;
}) {
  const current = useRemote<Data<Case>>("/api/cases/" + id);
  const history = useRemote<Data<History[]>>("/api/cases/" + id + "/history");
  const notifications = useRemote<Data<Notification[]>>(
    "/api/cases/" + id + "/notifications",
  );
  const delivery = useRemote<Data<Delivery[]>>(
    "/api/cases/" + id + "/delivery",
  );
  const [changing, setChanging] = useState(false);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<"delivery" | "history">(
    showDelivery ? "delivery" : "history",
  );
  const item = current.data?.data;
  const event = delivery.data?.data[0];
  async function advance() {
    if (!item || !nextStatus[item.status]) return;
    setChanging(true);
    setMutationError(null);
    try {
      await api<Data<Case>>("/api/cases/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus[item.status] }),
      });
      current.refresh();
      history.refresh();
      onChange();
    } catch (error) {
      setMutationError(error as ApiError);
      current.refresh();
    } finally {
      setChanging(false);
    }
  }
  if (!item)
    return (
      <aside className="panel detail-panel">
        <ErrorNotice error={current.error} />
        <p className="empty-state">
          {current.loading
            ? "Carregando solicitação…"
            : "A solicitação não está disponível."}
        </p>
      </aside>
    );
  return (
    <aside className="panel detail-panel" aria-label="Detalhes da solicitação">
      <div className="panel-kicker">SOLICITAÇÃO SELECIONADA</div>
      <div className="detail-title">
        <h2>{item.title}</h2>
        <StatusBadge status={item.status} />
      </div>
      <p className="description">{item.description}</p>
      <div className="status-track">
        {statuses.map((status) => (
          <span
            key={status}
            className={
              statuses.indexOf(status) <= statuses.indexOf(item.status)
                ? "reached"
                : ""
            }
          >
            {labels[status]}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="primary advance-button"
        disabled={
          changing || !nextStatus[item.status] || Boolean(current.error)
        }
        onClick={() => {
          void advance();
        }}
      >
        {changing
          ? "Atualizando…"
          : nextStatus[item.status]
            ? "Avançar para " + labels[nextStatus[item.status]!].toLowerCase()
            : "Solicitação resolvida"}
        <span aria-hidden="true">→</span>
      </button>
      <ErrorNotice error={mutationError ?? current.error} />
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Informações da solicitação"
      >
        {showDelivery && (
          <button
            role="tab"
            aria-selected={tab === "delivery"}
            onClick={() => setTab("delivery")}
          >
            Entrega do evento
          </button>
        )}
        <button
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          Histórico <span>{history.data?.data.length ?? "—"}</span>
        </button>
      </div>
      {showDelivery && tab === "delivery" ? (
        <section role="tabpanel" aria-label="Entrega do evento">
          <DeliveryFlow event={event} />
          <ErrorNotice error={delivery.error ?? notifications.error} />
          {!event && !delivery.loading && !delivery.error && (
            <p className="quiet">Nenhum evento registrado.</p>
          )}
          {event && (
            <>
              <div
                className={
                  "notification-box " +
                  (event.notificationSavedAt ? "delivered" : "pending")
                }
              >
                <span className="notification-icon" aria-hidden="true">
                  {event.notificationSavedAt ? "✓" : "↻"}
                </span>
                <div>
                  <strong>
                    {event.notificationSavedAt
                      ? "Notificação simulada salva"
                      : event.publishedAt
                        ? "Aguardando o worker"
                        : "Evento aguardando publicação"}
                  </strong>
                  <p>
                    {event.notificationSavedAt
                      ? (notifications.data?.data.length ?? 1) +
                        " notificação(ões) · efeito protegido por eventId"
                      : "A solicitação já está persistida. A entrega continua em segundo plano."}
                  </p>
                </div>
              </div>
              <CopyId label="eventId" value={event.eventId} />
              <CopyId label="correlationId" value={event.correlationId} />
            </>
          )}
        </section>
      ) : (
        <section role="tabpanel" aria-label="Histórico de status">
          <ErrorNotice error={history.error} />
          <ol className="history-list">
            {history.data?.data.map((entry) => (
              <li key={entry.id}>
                <i />
                <div>
                  <strong>
                    {entry.fromStatus ? labels[entry.fromStatus] + " → " : ""}
                    {labels[entry.toStatus]}
                  </strong>
                  <time>{time(entry.createdAt)}</time>
                  <code>{entry.correlationId}</code>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="detail-footer">
        <span>Atualização automática a cada 3 s</span>
        <button
          className="text-button"
          onClick={() => {
            current.refresh();
            history.refresh();
            delivery.refresh();
            notifications.refresh();
          }}
        >
          Atualizar
        </button>
      </div>
    </aside>
  );
}
function SystemsMapPage() {
  return (
    <div className="systems-map-page">
      <SystemsMap />
    </div>
  );
}
function FlowPage({
  operations,
  selectedId,
  onNew,
}: {
  operations: Operations | null;
  selectedId: string | null;
  onNew: () => void;
}) {
  const event = useRemote<Data<Delivery[]>>(
    selectedId ? "/api/cases/" + selectedId + "/delivery" : null,
  );
  return (
    <div className="flow-layout">
      <div className="reliability-grid">
        <div className="flow-column">
          <ArchitectureCanvas />
          <section className="panel demo-guide">
            <div className="panel-kicker">DEMONSTRAÇÃO GUIADA</div>
            <h2>Veja a fila se recuperar.</h2>
            <p className="quiet">
              Pare o broker, crie uma solicitação e acompanhe a outbox publicar
              o evento quando o RabbitMQ voltar.
            </p>
            <ol className="guide-list">
              <li>
                <span>01</span>
                <div>
                  <h3>Interrompa o RabbitMQ</h3>
                  <p>No terminal do projeto:</p>
                  <code>docker compose stop rabbitmq</code>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Crie uma solicitação sintética</h3>
                  <p>A API persiste os dados e o evento na mesma transação.</p>
                  <button className="secondary" onClick={onNew}>
                    Criar durante a demonstração
                  </button>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Restaure o broker</h3>
                  <code>docker compose start rabbitmq</code>
                  <p>Acompanhe a notificação surgir no painel de detalhes.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <h3>Repita a entrega</h3>
                  <p>
                    Use o eventId da solicitação selecionada. A quantidade de
                    notificações deve permanecer em um.
                  </p>
                  <code className="wrap-code">
                    {event.data?.data[0]
                      ? "docker compose exec publisher node dist/src/replay.js " +
                        event.data.data[0].eventId
                      : "Selecione uma solicitação para obter o eventId."}
                  </code>
                </div>
              </li>
            </ol>
          </section>
        </div>
        <div className="architecture-side">
          <section className="panel queue-panel">
            <div className="panel-kicker">LEITURA DO BROKER</div>
            <h2>Filas, sem efeitos externos.</h2>
            <dl>
              <div>
                <dt>Prontas para consumo</dt>
                <dd>{operations?.broker.ready ?? "—"}</dd>
              </div>
              <div>
                <dt>Aguardando retry</dt>
                <dd>{operations?.broker.retryReady ?? "—"}</dd>
              </div>
              <div>
                <dt>Dead-letter queue</dt>
                <dd>{operations?.broker.deadLetters ?? "—"}</dd>
              </div>
            </dl>
            <p className="quiet">
              Contagens instantâneas de mensagens prontas. Entregas em
              processamento não estão incluídas.
            </p>
            <div className="delivery-contract">
              <strong>At least once</strong>
              <p>
                Uma mensagem pode chegar novamente. O consumidor idempotente
                protege a gravação da notificação.
              </p>
            </div>
          </section>
          {selectedId ? (
            <CaseDetails
              key={selectedId}
              id={selectedId}
              onChange={() => {}}
              showDelivery
            />
          ) : (
            <section className="panel selection-empty">
              <span className="empty-icon">↗</span>
              <h2>Selecione uma solicitação</h2>
              <p>
                Na aba Solicitações, escolha um item para acompanhar a entrega
                técnica durante a demonstração.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
export function App() {
  const [view, setView] = useState<"cases" | "systems" | "flow" | "glossary">(
    "cases",
  );
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState("");
  const operations = useRemote<Data<Operations>>(
    view === "flow" ? "/api/operations" : null,
  );
  const query = new URLSearchParams({ pagination: "cursor", pageSize: "10" });
  if (filter) query.set("status", filter);
  if (cursor) query.set("cursor", cursor);
  const cases = useRemote<CaseList>("/api/cases?" + query.toString());
  const snapshot = operations.error ? null : (operations.data?.data ?? null);
  const productAvailable = !cases.error;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CareQueue início">
          <span className="brand-mark">
            C<span />
          </span>
          <div>
            CareQueue<small>FILA DE ATENDIMENTO</small>
          </div>
        </a>
        <div className="workspace-tag">
          <span className="dot green" />
          Ambiente local
        </div>
        <nav aria-label="Navegação principal">
          <span className="nav-label">WORKSPACE</span>
          <button
            className={view === "cases" ? "active" : ""}
            onClick={() => setView("cases")}
          >
            <span aria-hidden="true">▤</span>Solicitações
            <span className="nav-count">{cases.data?.data.length ?? "—"}</span>
          </button>
          <button
            className={view === "systems" ? "active" : ""}
            onClick={() => setView("systems")}
          >
            <span aria-hidden="true">▧</span>Mapa
          </button>
          <button
            className={view === "flow" ? "active" : ""}
            onClick={() => setView("flow")}
          >
            <span aria-hidden="true">⇄</span>Fluxo
          </button>
          <button
            className={view === "glossary" ? "active" : ""}
            onClick={() => setView("glossary")}
          >
            <span aria-hidden="true">?</span>Glossário
          </button>
        </nav>
        <div className="sidebar-note">
          <span>◈</span>
          <strong>Somente dados sintéticos</strong>
          <p>
            Uma fila fictícia para aceitar solicitações, acompanhar triagem e
            demonstrar entrega confiável.
          </p>
        </div>
        <div className="sidebar-footer">
          PRODUTO FICTÍCIO<span>Node.js · PostgreSQL · RabbitMQ</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <b>/</b>{" "}
            {view === "cases"
              ? "Solicitações"
              : view === "systems"
                ? "Mapa dos sistemas"
                : view === "flow"
                  ? "Fluxo"
                  : "Glossário"}
          </span>
          <div className="topbar-status">
            <i className={productAvailable ? "dot green" : "dot amber"} />
            {productAvailable ? "API disponível" : "API sem leitura"}
            <span className="demo-badge">DEMO</span>
          </div>
        </header>
        <div className="main-content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">TRIAGEM & ACOMPANHAMENTO</span>
              <h1>
                {view === "cases"
                  ? "Da entrada à resolução, sem perder o rastro."
                  : view === "systems"
                    ? "Os componentes do CareQueue em um mapa."
                    : view === "flow"
                      ? "Quando o broker falha, a fila continua."
                      : "Um mapa para aprender os termos do projeto."}
              </h1>
              <p>
                {view === "cases"
                  ? "CareQueue registra solicitações fictícias, guia a triagem e mostra o histórico de cada mudança."
                  : view === "systems"
                    ? "Veja navegador, API, banco, mensageria e worker como blocos separados."
                    : view === "flow"
                      ? "Pare o RabbitMQ, crie uma solicitação e veja a outbox publicar o evento quando o broker voltar."
                      : "Cada conceito aparece com uma explicação curta e o motivo de existir na demo."}
              </p>
            </div>
            <button
              className="primary new-button"
              onClick={() => setShowNew(true)}
            >
              <span aria-hidden="true">＋</span>Nova solicitação
            </button>
          </section>
          {view === "flow" && (
            <>
              <Metrics data={snapshot} error={operations.error} />
              <ErrorNotice error={operations.error} />
            </>
          )}
          {notice && (
            <div className="success-notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Dispensar mensagem"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {view === "cases" ? (
            <div className="cases-grid">
              <section className="panel cases-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Solicitações</h2>
                    <p>A operação em andamento, com status e histórico.</p>
                  </div>
                  <label className="filter-label">
                    Status
                    <select
                      aria-label="Filtrar por status"
                      value={filter}
                      onChange={(event) => {
                        setFilter(event.target.value);
                        setCursor(null);
                        setPrevious([]);
                      }}
                    >
                      <option value="">Todos os status</option>
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {labels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ErrorNotice error={cases.error} />
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Solicitação</th>
                        <th>Status</th>
                        <th>Criada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.data?.data.map((item) => (
                        <tr
                          key={item.id}
                          className={selectedId === item.id ? "selected" : ""}
                        >
                          <td>
                            <button
                              className="case-link"
                              aria-pressed={selectedId === item.id}
                              onClick={() => setSelectedId(item.id)}
                            >
                              {item.title}
                              <small>{item.id.slice(0, 8).toUpperCase()}</small>
                            </button>
                          </td>
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
                          <td>
                            <time>{time(item.createdAt)}</time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {cases.loading ? (
                  <p className="empty-state">Carregando solicitações…</p>
                ) : cases.data?.data.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">＋</span>
                    <h3>
                      {filter
                        ? "Nenhuma solicitação neste status"
                        : "A operação começa com uma solicitação"}
                    </h3>
                    <p>Crie um exemplo sintético para explorar o fluxo.</p>
                    <button
                      className="secondary"
                      onClick={() => setShowNew(true)}
                    >
                      Criar primeiro exemplo
                    </button>
                  </div>
                ) : null}
                <div className="table-footer">
                  <span>
                    {cases.data?.data.length ?? 0} nesta página · atualização a
                    cada 3 s
                  </span>
                  <div>
                    <button
                      className="pagination-button"
                      aria-label="Página anterior"
                      disabled={!previous.length || cases.loading}
                      onClick={() => {
                        setCursor(previous.at(-1) ?? null);
                        setPrevious(previous.slice(0, -1));
                      }}
                    >
                      ←
                    </button>
                    <button
                      className="pagination-button"
                      aria-label="Próxima página"
                      disabled={
                        !cases.data?.pagination.nextCursor || cases.loading
                      }
                      onClick={() => {
                        setPrevious([...previous, cursor]);
                        setCursor(cases.data!.pagination.nextCursor);
                      }}
                    >
                      →
                    </button>
                  </div>
                </div>
              </section>
              {selectedId ? (
                <CaseDetails
                  key={selectedId}
                  id={selectedId}
                  onChange={() => {
                    cases.refresh();
                    operations.refresh();
                  }}
                />
              ) : (
                <aside className="panel selection-empty">
                  <span className="empty-icon">↗</span>
                  <span className="eyebrow">FLUXO DO PRODUTO</span>
                  <h2>Selecione uma solicitação para trabalhar nela.</h2>
                  <p>
                    Veja o histórico e avance o status conforme a solicitação
                    passa pela triagem.
                  </p>
                  <div className="mini-flow">
                    <span>Aberta</span>
                    <i>→</i>
                    <span>Triagem</span>
                    <i>→</i>
                    <span>Resolvida</span>
                  </div>
                  <small>A arquitetura fica na aba dedicada.</small>
                </aside>
              )}
            </div>
          ) : view === "systems" ? (
            <SystemsMapPage />
          ) : view === "flow" ? (
            <FlowPage
              operations={snapshot}
              selectedId={selectedId}
              onNew={() => setShowNew(true)}
            />
          ) : (
            <Glossary />
          )}
          <footer className="page-footer">
            <span>CareQueue · demonstração com dados sintéticos</span>
            <span>
              {view === "cases"
                ? "Produto fictício para triagem e acompanhamento."
                : view === "systems"
                  ? "Mapa visual dos componentes do sistema."
                  : view === "flow"
                    ? "Persistência primeiro. Entrega em segundo plano."
                    : "Aprendizado do zero, sem jargão desnecessário."}
            </span>
          </footer>
        </div>
      </main>
      {showNew && (
        <NewCaseDialog
          onClose={() => setShowNew(false)}
          onCreated={(created) => {
            setSelectedId(created.id);
            setFilter("");
            setCursor(null);
            setPrevious([]);
            cases.refresh();
            operations.refresh();
            setNotice(
              "Solicitação criada. A entrega da notificação será acompanhada automaticamente.",
            );
          }}
        />
      )}
    </div>
  );
}
