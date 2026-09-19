import cron from "node-cron";
import { config, THE_BEST_BASE_URL } from "../config.js";
import { redis } from "../clients.js";

const LOCK_KEY = "lock:hourly-rank";
const LOCK_TTL_SECONDS = 10 * 60;

const normalize = (value) => String(value || "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const localDate = (value = Date.now()) => {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && String(value).trim() !== ""
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchReadWithRetry(url, options = {}) {
  const retryDelays = [60_000, 120_000, 360_000];
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      lastResponse = await fetch(url, options);
      if (lastResponse.ok || ![429, 500, 502, 503, 504].includes(lastResponse.status)) return lastResponse;
      if (attempt === retryDelays.length) return lastResponse;
      await lastResponse.text();
      await wait(retryDelays[attempt]);
    } catch (error) {
      lastError = error;
      if (attempt === retryDelays.length) throw error;
      await wait(retryDelays[attempt]);
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("request failed after retries");
}

async function getGroups() {
  const response = await fetchReadWithRetry(
    `${config.evolutionBaseUrl}/group/fetchAllGroups/${encodeURIComponent(config.evolutionInstanceName)}?getParticipants=false`,
    { headers: { apikey: config.evolutionApiKey } },
  );
  if (!response.ok) throw new Error(`groups ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data) ? data : (data.groups || data.data || []);
}

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

async function buildRank() {
  const headers = { "Api-Key": config.theBestApiKey, Accept: "application/json", "User-Agent": "MegaApp-ADS/1.0" };
  const today = localDate();
  let response = await fetchReadWithRetry(`${THE_BEST_BASE_URL}/resellers/?page=1&per_page=100`, { headers });
  if (!response.ok) throw new Error(`resellers ${response.status}: ${await response.text()}`);
  const resellerData = await response.json();
  const names = [...new Set([
    ...(resellerData.results || []).map((item) => String(item.username || "")).filter((name) => name.toLowerCase().startsWith("tds")),
    "tdscr7milgols",
    "tdsrevenda",
  ])];
  const stats = new Map(names.map((username) => [username.toLowerCase(), { username, tests: 0, sales: 0, renewals: 0 }]));

  for (const action of ["new", "extend", "trial-conversion"]) {
    let page = 1;
    let stop = false;
    while (!stop && page <= config.theBestMaxPages) {
      response = await fetchReadWithRetry(`${THE_BEST_BASE_URL}/user/logs/?action=${encodeURIComponent(action)}&page=${page}`, { headers });
      if (!response.ok) throw new Error(`logs ${response.status}: ${await response.text()}`);
      const data = await response.json();
      const items = Array.isArray(data.results) ? data.results : [];
      if (!items.length) break;
      for (const item of items) {
        const itemDate = localDate(item.created_at);
        if (itemDate === today) {
          const current = stats.get(String(item.user_username || "").toLowerCase());
          if (current) {
            if (action === "new") current.tests += 1;
            else if (action === "extend") current.renewals += 1;
            else current.sales += 1;
          }
        } else if (itemDate < today) {
          stop = true;
          break;
        }
      }
      if (stop || !data.next_page) break;
      page += 1;
    }
  }

  const rank = [...stats.values()].filter((item) => item.tests + item.sales + item.renewals > 0)
    .sort((a, b) => b.sales - a.sales || b.tests - a.tests || b.renewals - a.renewals || a.username.localeCompare(b.username, "pt-BR", { numeric: true }));

  const pad3 = (value) => String(value).padStart(3, " ");
  const rows = rank.map((item, index) => {
    const pos = String(index + 1).padStart(2, "0");
    return `${pos} ${pad3(item.sales)} ${pad3(item.tests)} ${pad3(item.renewals)} | ${item.username}`;
  });
  const table = ["```", " #   V   T   R | Revenda", ...rows, "```"].join("\n");
  const text = [
    `🏆 *Ranking das revendas — ${today.split("-").reverse().join("/")}*`,
    "",
    "*V:* Vendas • *T:* Testes • *R:* Renovações",
    "",
    table,
  ].join("\n");

  return { count: rank.length, text };
}

export async function runHourlyRank() {
  const lock = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
  if (!lock) {
    console.log("hourlyRank skipped: already running or ran recently");
    return;
  }

  let groups = [];
  try {
    const rank = await buildRank();
    groups = await getGroups();
    const target = groups.find((group) => normalize(group.subject || group.name || group.pushName) === "REV A MEIO")
      || groups.find((group) => normalize(group.subject || group.name || group.pushName).includes("MEIO"));
    if (!target) throw new Error("grupo REV A MEIO nao encontrado");
    const status = await sendText(target.id || target.remoteJid, rank.text);
    console.log(JSON.stringify({ ok: true, group: target.subject || target.name, status, count: rank.count }));
  } catch (error) {
    try {
      if (!groups.length) groups = await getGroups();
      const deveres = groups.find((group) => normalize(group.subject || group.name || group.pushName).includes("DEVERES"));
      if (!deveres) throw new Error("grupo DEVERES nao encontrado");
      await sendText(deveres.id || deveres.remoteJid, "Erro ao enviar o ranking no grupo REV A MEIO.");
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

export function registerHourlyRankJob() {
  cron.schedule("0 10,12,14,16,18,20,22 * * *", () => {
    runHourlyRank().catch((error) => console.error("hourlyRank failed", error));
  }, { timezone: "America/Sao_Paulo" });
}
