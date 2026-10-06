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
function CaseDetails({ id, onChange }: { id: string; onChange: () => void }) {
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
  const [tab, setTab] = useState<"delivery" | "history">("delivery");
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
        <button
          role="tab"
          aria-selected={tab === "delivery"}
          onClick={() => setTab("delivery")}
        >
          Entrega do evento
        </button>
        <button
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          Histórico <span>{history.data?.data.length ?? "—"}</span>
        </button>
      </div>
      {tab === "delivery" ? (
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
function Reliability({
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
    <div className="reliability-grid">
      <section className="panel demo-guide">
        <div className="panel-kicker">DEMONSTRAÇÃO GUIADA</div>
        <h2>Veja a fila se recuperar.</h2>
        <p className="quiet">
          A solicitação deve continuar existindo mesmo quando o broker estiver
          indisponível.
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
      <div>
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
          <CaseDetails key={selectedId} id={selectedId} onChange={() => {}} />
        ) : (
          <section className="panel selection-empty">
            <span className="empty-icon">↗</span>
            <h2>Selecione uma solicitação</h2>
            <p>
              Na aba Solicitações, escolha um item para acompanhar a entrega
              durante a demonstração.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
export function App() {
  const [view, setView] = useState<"cases" | "reliability">("cases");
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState("");
  const operations = useRemote<Data<Operations>>("/api/operations");
  const query = new URLSearchParams({ pagination: "cursor", pageSize: "10" });
  if (filter) query.set("status", filter);
  if (cursor) query.set("cursor", cursor);
  const cases = useRemote<CaseList>("/api/cases?" + query.toString());
  const snapshot = operations.error ? null : (operations.data?.data ?? null);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CareQueue início">
          <span className="brand-mark">
            C<span />
          </span>
          <div>
            CareQueue<small>CONSOLE DE DEMONSTRAÇÃO</small>
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
            <span className="nav-count">{snapshot?.cases ?? "—"}</span>
          </button>
          <button
            className={view === "reliability" ? "active" : ""}
            onClick={() => setView("reliability")}
          >
            <span aria-hidden="true">⇄</span>Confiabilidade
          </button>
        </nav>
        <div className="sidebar-note">
          <span>◈</span>
          <strong>Somente dados sintéticos</strong>
          <p>
            Um fluxo fictício de triagem. Nenhuma mensagem é enviada para
            pessoas ou serviços externos.
          </p>
        </div>
        <div className="sidebar-footer">
          PORTFÓLIO BACKEND<span>Node.js · PostgreSQL · RabbitMQ</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <b>/</b>{" "}
            {view === "cases" ? "Solicitações" : "Confiabilidade"}
          </span>
          <div className="topbar-status">
            <i className={snapshot ? "dot green" : "dot amber"} />
            {snapshot ? "API disponível" : "API sem leitura"}
            <span className="demo-badge">DEMO</span>
          </div>
        </header>
        <div className="main-content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">TRIAGEM & ACOMPANHAMENTO</span>
              <h1>
                {view === "cases"
                  ? "Cada solicitação, uma jornada."
                  : "Confiabilidade que você pode observar."}
              </h1>
              <p>
                {view === "cases"
                  ? "Crie, acompanhe e veja a entrega acontecer, do primeiro registro à notificação."
                  : "Interrompa o broker, acompanhe a recuperação e comprove a idempotência."}
              </p>
            </div>
            <button
              className="primary new-button"
              onClick={() => setShowNew(true)}
            >
              <span aria-hidden="true">＋</span>Nova solicitação
            </button>
          </section>
          <Metrics data={snapshot} error={operations.error} />
          <ErrorNotice error={operations.error} />
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
                    <p>Uma fila organizada, do início ao fim.</p>
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
                        : "A fila começa com uma solicitação"}
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
                  <span className="eyebrow">DO REGISTRO À ENTREGA</span>
                  <h2>Toda etapa deixa um rastro.</h2>
                  <p>
                    Selecione uma solicitação para ver o histórico, avançar a
                    triagem e acompanhar a notificação simulada.
                  </p>
                  <div className="mini-flow">
                    <span>Registro</span>
                    <i>→</i>
                    <span>Evento</span>
                    <i>→</i>
                    <span>Notificação</span>
                  </div>
                  <small>Entrega at least once · consumidor idempotente</small>
                </aside>
              )}
            </div>
          ) : (
            <Reliability
              operations={snapshot}
              selectedId={selectedId}
              onNew={() => setShowNew(true)}
            />
          )}
          <footer className="page-footer">
            <span>CareQueue · demonstração com dados sintéticos</span>
            <span>Persistência primeiro. Entrega em segundo plano.</span>
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
