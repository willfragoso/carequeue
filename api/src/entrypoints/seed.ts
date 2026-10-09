import { randomUUID } from "node:crypto";
import { changeStatus, createCase } from "../cases/cases.js";
import type { Status } from "../cases/domain.js";
import { pool } from "../platform/db.js";
import { logger } from "../platform/logger.js";

// Fills an empty database with a realistic support queue so the console is easy to
// understand. Usage: node dist/src/entrypoints/seed.js [--reset]
// Without --reset it refuses to touch a database that already has cases.

const minute = 60_000;
const hour = 60 * minute;

interface Seed {
  title: string;
  description: string;
  status: Status;
  /** How long ago the case was opened. */
  openedAgo: number;
  /** Delay before each transition (TRIAGE, ASSIGNED, RESOLVED), in order. */
  steps: number[];
}

const queue: Seed[] = [
  {
    title: "Erro ao gerar segunda via de boleto",
    description:
      "Ao clicar em “Segunda via” na fatura de setembro, o portal exibe “Erro 500” e o PDF não é gerado. O problema acontece no Chrome e no Firefox.",
    status: "OPEN",
    openedAgo: 12 * minute,
    steps: [],
  },
  {
    title: "Não recebo o e-mail de confirmação do cadastro",
    description:
      "Criei a conta há 20 minutos e o e-mail de confirmação não chegou, nem na caixa de spam. Já tentei reenviar duas vezes pela tela de login.",
    status: "OPEN",
    openedAgo: 47 * minute,
    steps: [],
  },
  {
    title: "Cobrança duplicada na fatura de outubro",
    description:
      "O mesmo valor de assinatura foi cobrado duas vezes em 03/10. Anexei os dois lançamentos do extrato. Preciso do estorno de uma das cobranças.",
    status: "OPEN",
    openedAgo: 3 * hour + 10 * minute,
    steps: [],
  },
  {
    title: "Solicitação de nota fiscal do mês anterior",
    description:
      "O financeiro da minha empresa precisa da nota fiscal de setembro para fechar a contabilidade. Ela não aparece na área de documentos.",
    status: "OPEN",
    openedAgo: 5 * hour + 40 * minute,
    steps: [],
  },
  {
    title: "Falha no login com autenticação em dois fatores",
    description:
      "O código do aplicativo autenticador é recusado como inválido, mesmo com o horário do celular sincronizado. Sem acesso à conta desde ontem.",
    status: "TRIAGE",
    openedAgo: 1 * hour + 30 * minute,
    steps: [18 * minute],
  },
  {
    title: "Lentidão ao carregar o painel de relatórios",
    description:
      "O painel leva mais de 40 segundos para abrir quando o período selecionado passa de 30 dias. Com períodos menores funciona normalmente.",
    status: "TRIAGE",
    openedAgo: 26 * hour,
    steps: [2 * hour],
  },
  {
    title: "Alteração do endereço de entrega de um pedido",
    description:
      "Fiz o pedido com o endereço antigo e ele ainda não foi despachado. Preciso trocar para a rua nova antes do envio.",
    status: "TRIAGE",
    openedAgo: 30 * hour,
    steps: [95 * minute],
  },
  {
    title: "Integração com a API de pagamentos retornando timeout",
    description:
      "Desde as 14h, cerca de 15% das requisições de cobrança para a API de pagamentos expiram após 30 s. Os logs mostram o mesmo padrão em todos os pods.",
    status: "ASSIGNED",
    openedAgo: 8 * hour,
    steps: [25 * minute, 40 * minute],
  },
  {
    title: "Aplicativo fecha ao abrir o extrato",
    description:
      "No Android 14, o app encerra sozinho ao abrir a tela de extrato. Acontece desde a atualização de ontem e a reinstalação não resolveu.",
    status: "ASSIGNED",
    openedAgo: 2 * 24 * hour,
    steps: [3 * hour, 5 * hour],
  },
  {
    title: "Pedido de acesso para novo colaborador do financeiro",
    description:
      "A pessoa que entrou na equipe esta semana precisa de acesso de leitura aos relatórios financeiros. A aprovação da gerente já foi dada por e-mail.",
    status: "ASSIGNED",
    openedAgo: 2 * 24 * hour + 6 * hour,
    steps: [90 * minute, 4 * hour],
  },
  {
    title: "Pedido de reembolso por produto com defeito",
    description:
      "O produto chegou com a tela trincada e a embalagem intacta. Tenho as fotos e a nota fiscal. Prefiro o reembolso à troca.",
    status: "RESOLVED",
    openedAgo: 3 * 24 * hour,
    steps: [40 * minute, 2 * hour, 22 * hour],
  },
  {
    title: "Atualização do telefone no cadastro",
    description:
      "Troquei de número e não consigo alterar o telefone pela área do cliente, pois o campo está bloqueado para edição.",
    status: "RESOLVED",
    openedAgo: 3 * 24 * hour + 5 * hour,
    steps: [30 * minute, 90 * minute, 5 * hour],
  },
  {
    title: "Dúvida sobre o reajuste da mensalidade",
    description:
      "Recebi um aviso de reajuste de 8% sem explicação do critério. Gostaria de entender como o percentual foi calculado e a partir de quando vale.",
    status: "RESOLVED",
    openedAgo: 4 * 24 * hour,
    steps: [1 * hour, 3 * hour, 26 * hour],
  },
  {
    title: "Divergência no valor do frete",
    description:
      "O frete mostrado no carrinho era de R$ 18,90, mas o valor cobrado no fechamento foi R$ 27,40. Print do carrinho em anexo.",
    status: "RESOLVED",
    openedAgo: 4 * 24 * hour + 7 * hour,
    steps: [20 * minute, 70 * minute, 7 * hour],
  },
  {
    title: "Cancelamento de plano anual",
    description:
      "Quero cancelar o plano anual contratado há 5 dias, dentro do prazo de arrependimento, e receber o valor integral de volta.",
    status: "RESOLVED",
    openedAgo: 5 * 24 * hour,
    steps: [25 * minute, 2 * hour, 18 * hour],
  },
  {
    title: "Exportação de dados em CSV vem com acentos quebrados",
    description:
      "Ao abrir o arquivo exportado no Excel, palavras com acento aparecem como “Ã§” e “Ã£”. A planilha antiga abria normalmente.",
    status: "RESOLVED",
    openedAgo: 5 * 24 * hour + 9 * hour,
    steps: [50 * minute, 4 * hour, 30 * hour],
  },
];

const path: Status[] = ["OPEN", "TRIAGE", "ASSIGNED", "RESOLVED"];

async function seedCase(item: Seed, now: number) {
  const openedAt = now - item.openedAgo;
  const created = await createCase(
    { title: item.title, description: item.description },
    randomUUID(),
  );
  const target = path.indexOf(item.status);
  for (let index = 1; index <= target; index++)
    await changeStatus(created.id, path[index], randomUUID());

  // The API stamps everything with "now"; backdate it so the queue looks lived-in.
  const moments = [openedAt];
  for (const step of item.steps)
    moments.push(moments[moments.length - 1] + step);
  const at = (value: number) => new Date(value);
  const last = moments[moments.length - 1];

  await pool.query(
    "UPDATE cases SET created_at=$2, updated_at=$3 WHERE id=$1",
    [created.id, at(openedAt), at(last)],
  );
  const history = await pool.query(
    "SELECT id FROM case_history WHERE case_id=$1 ORDER BY id",
    [created.id],
  );
  for (const [index, row] of history.rows.entries())
    await pool.query("UPDATE case_history SET created_at=$2 WHERE id=$1", [
      row.id,
      at(moments[index]),
    ]);

  // Pretend the event already went through the broker and the worker. A running
  // publisher/worker may already have handled it, so overwrite instead of failing.
  const published = openedAt + 400;
  const event = await pool.query(
    "UPDATE outbox SET created_at=$2, published_at=$3 WHERE envelope->'payload'->>'caseId'=$1 RETURNING event_id AS \"eventId\"",
    [created.id, at(openedAt), at(published)],
  );
  await pool.query(
    "INSERT INTO notifications(id,event_id,case_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO UPDATE SET created_at=EXCLUDED.created_at",
    [randomUUID(), event.rows[0].eventId, created.id, at(published + 900)],
  );
}

try {
  const reset = process.argv.includes("--reset");
  const existing = await pool.query("SELECT count(*)::int AS count FROM cases");
  if (existing.rows[0].count > 0 && !reset) {
    logger.error({
      step: "seed_refused",
      cases: existing.rows[0].count,
      hint: "the database already has cases; pass --reset to replace them",
    });
    process.exitCode = 1;
  } else {
    if (reset)
      await pool.query(
        "TRUNCATE notifications,outbox,case_history,cases RESTART IDENTITY CASCADE",
      );
    const now = Date.now();
    for (const item of queue) await seedCase(item, now);
    logger.info({ step: "seed_complete", cases: queue.length, reset });
  }
} catch (error) {
  logger.error({ step: "seed_failure", error: String(error) });
  process.exitCode = 1;
} finally {
  await pool.end();
}
