import cron from "node-cron";
import { config } from "../config.js";
import { redis } from "../clients.js";

const RANK_API_URL = "https://controle.megaapp.tech/api/rank";
const ADS_GROUP_JID = "120363427125777954@g.us";
const DEVERES_GROUP_JID = "120363407440063836@g.us";
const LOCK_KEY = "lock:ads-rank";
const LOCK_TTL_SECONDS = 10 * 60;

async function sendText(number, text) {
  const response = await fetch(`${config.evolutionBaseUrl}/message/sendText/${encodeURIComponent(config.evolutionInstanceName)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: config.evolutionApiKey },
    body: JSON.stringify({ number, text }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`send ${response.status}: ${body}`);
  return response.status;
}

function formatConversion(testsToday, salesToday) {
  if (!testsToday) return "—";
  return `${((salesToday / testsToday) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  return `${day}/${month}/${year}`;
}

async function buildAdsRankMessage() {
  const response = await fetch(RANK_API_URL);
  if (!response.ok) throw new Error(`ads rank api failed: ${response.status} ${await response.text()}`);
  const data = await response.json();

  const rows = Array.isArray(data.rows) ? [...data.rows].sort((a, b) => a.position - b.position) : [];

  const formatRow = (pos, v, t, c, name) =>
    `${String(pos).padStart(2, " ")} ${String(v).padStart(3, " ")} ${String(t).padStart(3, " ")} ${String(c).padStart(6, " ")} | ${name}`;
  const header = formatRow("#", "V", "T", "C", "Revenda");
  const tableRows = rows.map((row) => {
    const pos = String(row.position).padStart(2, "0");
    const conversion = formatConversion(row.testsToday, row.salesToday);
    return formatRow(pos, row.salesToday, row.testsToday, conversion, row.name);
  });
  const table = ["```", header, ...tableRows, "```"].join("\n");

  const totals = data.totals || {};
  const totalConversion = formatConversion(totals.testsToday, totals.salesToday);

  return [
    `🏆 *Ranking ADS — ${formatDate(data.date)}*`,
    "",
    `*V:* Vendas • *T:* Testes • *C:* Conversão (${totals.testsToday ?? 0} testes, ${totals.salesToday ?? 0} vendas, ${totalConversion})`,
    "",
    table,
  ].join("\n");
}

export async function runAdsRank() {
  const lock = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
  if (!lock) {
    console.log("adsRank skipped: already running or ran recently");
    return;
  }

  try {
    const text = await buildAdsRankMessage();
    const status = await sendText(ADS_GROUP_JID, text);
    console.log(JSON.stringify({ ok: true, group: "ADS", status }));
  } catch (error) {
    try {
      await sendText(DEVERES_GROUP_JID, "Erro ao enviar o ranking ADS no grupo ADS.");
      console.error(JSON.stringify({ ok: false, alertSent: true, error: String(error.message || error) }));
    } catch (alertError) {
      console.error(JSON.stringify({
        ok: false,
        alertSent: false,
        error: String(error.message || error),
        alertError: String(alertError.message || alertError),
      }));
    }
  } finally {
    await redis.del(LOCK_KEY);
  }
}

export function registerAdsRankJob() {
  cron.schedule("0 12,14,16,18,20,22 * * *", () => {
    runAdsRank().catch((error) => console.error("adsRank failed", error));
  }, { timezone: "America/Sao_Paulo" });
}
