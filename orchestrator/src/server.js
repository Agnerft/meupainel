import express from "express";
import OpenAI from "openai";
import pg from "pg";
import Redis from "ioredis";
import XLSX from "xlsx";

const app = express();
app.use(express.json({ limit: "20mb" }));

const port = Number(process.env.PORT || 3000);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

const config = {
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  evolutionBaseUrl: process.env.EVOLUTION_BASE_URL || "http://evolution-api:8080",
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || "principal",
  webhookSecret: process.env.ORCHESTRATOR_WEBHOOK_SECRET,
  uiAdminToken: process.env.UI_ADMIN_TOKEN,
  adsTaxRate: Number(process.env.ADS_TAX_RATE || 12.15),
  theBestApiKey: process.env.THE_BEST_API_KEY,
  theBestPerUserApiKeys: parseJsonEnv(process.env.THE_BEST_PER_USER_API_KEYS_JSON, {}),
  theBestTimezoneOffset: Number(process.env.THE_BEST_TIMEZONE_OFFSET || -3),
  theBestMaxPages: Number(process.env.THE_BEST_MAX_PAGES || 120),
};

const THE_BEST_API_URL = "https://api.painel.best/user/logs/";
const THE_BEST_ACTIONS = ["new", "extend", "trial-conversion"];
const DEFAULT_ADS_MAPPINGS = [
  { nome_campanha: "ADS1 - KRONE (3545)", login_the_best: "Jonathan01" },
  { nome_campanha: "ADS8 - ALLAN (5666)", login_the_best: "revendaallan" },
  { nome_campanha: "ADS9 - DOUGLAS SANDI (9023)", login_the_best: "sandi01" },
  { nome_campanha: "ADS11 - LUCAS MAYCA (7908)", login_the_best: "lucasmayca" },
  { nome_campanha: "ADS13 - IGOR (1755)", login_the_best: "igor01" },
  { nome_campanha: "ADS15 - ANGELO (2061)", login_the_best: "" },
  { nome_campanha: "ADS17 - RAFA NATV (1757)", login_the_best: "" },
  { nome_campanha: "ADS27 - ALEXANDRE JR (8841)", login_the_best: "Alexandre01" },
  { nome_campanha: "ADS29 - GUILHERME JR (9889)", login_the_best: "Guimendes" },
  { nome_campanha: "ADS31 - DAVID JR (1276)", login_the_best: "David01" },
  { nome_campanha: "ADS32 - WILLIAM JR (6684)", login_the_best: "Williamfarias" },
  { nome_campanha: "ADS34 - EVERALDO JR (8094)", login_the_best: "Junior" },
  { nome_campanha: "ADS18 - EMERSON (1714)", login_the_best: "tdsfga" },
  { nome_campanha: "ADS19 - ERICK (1910)", login_the_best: "tdsmalware" },
  { nome_campanha: "ADS20 - HERON (1181)", login_the_best: "tdsdrvendasnights" },
  { nome_campanha: "ADS21 - IGOREKEISY (1421)", login_the_best: "tdsbigseven" },
  { nome_campanha: "ADS22 - JACQUES (5590)", login_the_best: "tdshechosen" },
  { nome_campanha: "ADS23 - JOAO (7378)", login_the_best: "tdspaqueta20vender" },
  { nome_campanha: "ADS24 - JULIO (1718)", login_the_best: "tdstheflash" },
  { nome_campanha: "ADS25 - ROBSON (7088)", login_the_best: "tdsrobson" },
  { nome_campanha: "ADS26 - ROGERIO (1719)", login_the_best: "tdssmallville" },
  { nome_campanha: "ADS37 - JACKSON (0083)", login_the_best: "tdsmessithebest" },
];

app.get("/health", async (_req, res) => {
  await db.query("SELECT 1");
  await redis.ping();
  res.json({ ok: true });
});

await ensureSchema();

function requireAdmin(req, res, next) {
  const token = req.header("x-admin-token");
  if (config.uiAdminToken && token !== config.uiAdminToken) {
    return res.status(401).json({ error: "invalid admin token" });
  }
  next();
}

app.get("/admin/summary", requireAdmin, async (_req, res) => {
  const [totals, recent, services] = await Promise.all([
    db.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
        count(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
        count(DISTINCT remote_jid)::int AS contacts
      FROM whatsapp_messages
    `),
    db.query(`
      SELECT instance_name, remote_jid, sender_name, direction, body, created_at
      FROM whatsapp_messages
      ORDER BY created_at DESC
      LIMIT 30
    `),
    checkServices(),
  ]);

  res.json({
    totals: totals.rows[0],
    recentMessages: recent.rows,
    services,
  });
});

app.post("/admin/test-reply", requireAdmin, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  const reply = await generateReply({
    senderName: req.body?.senderName || "Teste do painel",
    text,
  });

  res.json({ reply });
});

app.get("/admin/ads/groups", requireAdmin, async (req, res) => {
  const prefix = String(req.query.prefix || "ADS").trim();
  const groups = await findEvolutionGroups(prefix);
  res.json({ groups });
});

app.post("/admin/ads/import-file", requireAdmin, async (req, res) => {
  try {
    const filename = String(req.body?.filename || "");
    const base64 = String(req.body?.base64 || "");
    const pix = String(req.body?.pix || "").trim();
    if (!base64) return res.status(400).json({ error: "base64 is required" });

    const buffer = Buffer.from(base64, "base64");
    if (/\.(xlsx?|csv)$/i.test(filename)) {
      const result = await parseAdsWorkbook(buffer, { filename, pix });
      return res.json(result);
    }

    return res.json({
      text: buffer.toString("utf8"),
      entries: 0,
      source: "text",
    });
  } catch (error) {
    console.error("ads import failed", error);
    return res.status(502).json({ error: "ads import failed", detail: String(error.message || error) });
  }
});

app.post("/admin/ads/preview", requireAdmin, async (req, res) => {
  const rawInput = String(req.body?.text || "").trim();
  if (!rawInput) return res.status(400).json({ error: "text is required" });

  const groups = await findEvolutionGroups("ADS");
  const mappings = mergeAdsMappings(DEFAULT_ADS_MAPPINGS, extractAdsMappings(rawInput));
  const statsDate = getAdsStatsDate(rawInput);
  const { statsMap, statsError } = await getTheBestStatsMapSafe(statsDate);
  const entries = buildAdsPreviewEntries(rawInput, groups, mappings, statsMap);
  const first = entries[0];

  res.json({
    parsed: first?.parsed,
    message: first?.message,
    match: first?.match,
    entries,
    groups: groups.slice(0, 60),
    statsDate,
    statsError,
  });
});

app.post("/admin/ads/send", requireAdmin, async (req, res) => {
  try {
    const rawInput = String(req.body?.text || "").trim();
    const overrides = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!rawInput) return res.status(400).json({ error: "text is required" });

    const groups = await findEvolutionGroups("ADS");
    if (!parseAdsEntries(rawInput).length) {
      return res.status(400).json({ error: "no ADS entries found" });
    }

    const state = await fetchEvolutionState(config.evolutionInstanceName);
    if (state?.instance?.state !== "open") {
      return res.status(409).json({ error: "whatsapp disconnected", state: state?.instance?.state || "unknown" });
    }

    const sent = [];
    const missing = [];
    const mappings = mergeAdsMappings(DEFAULT_ADS_MAPPINGS, extractAdsMappings(rawInput));
    const { statsMap } = await getTheBestStatsMapSafe(getAdsStatsDate(rawInput));
    const entries = buildAdsPreviewEntries(rawInput, groups, mappings, statsMap);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const parsed = entry.parsed;
      const override = overrides?.[index];
      if (override?.skip) continue;
      const match = override?.groupJid
        ? { remoteJid: override.groupJid, name: override.groupName || override.groupJid, score: 1 }
        : entry.match;

      if (!match?.remoteJid) {
        missing.push({ index, parsed });
        continue;
      }

      const message = entry.message;
      await sendEvolutionText(config.evolutionInstanceName, match.remoteJid, message);
      const saved = await saveAdsDispatch({
        parsed,
        rawInput: entry.rawInput,
        match,
        message,
        status: "sent",
      });
      sent.push({ id: saved.id, match, message, theBest: entry.theBest || null });
    }

    if (missing.length) {
      return res.status(400).json({ error: "some groups not found", sent, missing, groups: groups.slice(0, 60) });
    }

    return res.json({ ok: true, sent });
  } catch (error) {
    console.error("ads send failed", error);
    return res.status(502).json({ error: "ads send failed", detail: String(error.message || error) });
  }
});

app.get("/connect-whatsapp", async (_req, res) => {
  try {
    const qr = await fetchEvolutionQr(config.evolutionInstanceName);
    const state = await fetchEvolutionState(config.evolutionInstanceName);
    const image = qr?.base64 || qr?.qrcode?.base64;
    const status = state?.instance?.state || "connecting";

    res.type("html").send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="25" />
  <title>Conectar WhatsApp</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7f8; color: #182026; font-family: Arial, sans-serif; }
    main { width: min(94vw, 520px); background: #fff; border: 1px solid #d9e0e4; border-radius: 8px; padding: 24px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 6px 0; color: #60707b; line-height: 1.45; }
    img { width: min(82vw, 360px); height: auto; margin: 20px auto 12px; display: block; border: 1px solid #d9e0e4; border-radius: 8px; padding: 10px; background: #fff; }
    .status { display: inline-block; margin-top: 10px; padding: 8px 12px; border-radius: 999px; background: #ecfdf3; color: #067647; font-weight: 700; }
    .warn { background: #fff7ed; color: #a16207; }
    a { color: #0f766e; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Conectar WhatsApp</h1>
    <p>Instancia: <strong>${config.evolutionInstanceName}</strong></p>
    <p>Abra o WhatsApp no celular, va em <strong>Aparelhos conectados</strong> e escaneie o QR.</p>
    ${image ? `<img src="${image}" alt="QR Code para conectar WhatsApp" />` : "<p>Nao recebi QR agora. Atualize a pagina em alguns segundos.</p>"}
    <div class="status ${status === "open" ? "" : "warn"}">Status: ${status}</div>
    <p><a href="/connect-whatsapp">Gerar/atualizar QR</a></p>
  </main>
</body>
</html>`);
  } catch (error) {
    res.status(500).type("html").send(`<pre>${String(error.message || error)}</pre>`);
  }
});

async function fetchEvolutionQr(instanceName) {
  const response = await fetch(`${config.evolutionBaseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
    headers: { apikey: config.evolutionApiKey },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution QR failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function fetchEvolutionState(instanceName) {
  const response = await fetch(`${config.evolutionBaseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
    headers: { apikey: config.evolutionApiKey },
  });

  if (!response.ok) return null;
  return response.json();
}

async function checkServices() {
  const services = {
    database: false,
    redis: false,
    evolution: false,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  };

  try {
    await db.query("SELECT 1");
    services.database = true;
  } catch {}

  try {
    await redis.ping();
    services.redis = true;
  } catch {}

  try {
    const response = await fetch(`${config.evolutionBaseUrl}/`, {
      headers: { apikey: config.evolutionApiKey },
    });
    services.evolution = response.status < 500;
  } catch {}

  return services;
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ads_dispatches (
      id BIGSERIAL PRIMARY KEY,
      group_name TEXT,
      group_jid TEXT,
      label TEXT,
      raw_value NUMERIC(12, 2),
      currency TEXT NOT NULL DEFAULT 'BRL',
      tax_rate NUMERIC(8, 4) NOT NULL DEFAULT 12.15,
      taxed_value NUMERIC(12, 2),
      customer_name TEXT,
      pix TEXT,
      message_body TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      raw_input TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ads_dispatches_group_jid
      ON ads_dispatches(group_jid)
  `);
}

app.post("/webhooks/evolution", async (req, res) => {
  const providedSecret = req.header("x-orchestrator-secret") || req.query.secret;
  if (config.webhookSecret && !String(providedSecret || "").startsWith(config.webhookSecret)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }

  res.status(202).json({ ok: true });

  try {
    const event = normalizeEvolutionMessage(req.body);
    if (!event?.text || event.fromMe) return;

    await saveMessage(event, req.body);

    const lockKey = `reply-lock:${event.remoteJid}`;
    const lock = await redis.set(lockKey, "1", "EX", 8, "NX");
    if (!lock) return;

    const reply = await generateReply(event);
    if (reply) {
      await sendWhatsAppText(event.instanceName, event.remoteJid, reply);
      await saveOutboundMessage(event, reply);
    }
  } catch (error) {
    console.error("webhook processing failed", error);
  }
});

function normalizeEvolutionMessage(payload) {
  const data = payload?.data || payload;
  const message = data?.message || {};
  const key = data?.key || message?.key || {};
  const text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    data?.text ||
    data?.messageText;

  return {
    instanceName: payload?.instance || data?.instance || data?.instanceName,
    remoteJid: key?.remoteJid || data?.remoteJid || data?.from,
    fromMe: Boolean(key?.fromMe || data?.fromMe),
    senderName: data?.pushName || data?.senderName || data?.name,
    text,
  };
}

async function saveMessage(event, rawPayload) {
  await db.query(
    `INSERT INTO whatsapp_messages
      (instance_name, remote_jid, sender_name, direction, body, raw_payload)
     VALUES ($1, $2, $3, 'inbound', $4, $5)`,
    [event.instanceName, event.remoteJid, event.senderName, event.text, rawPayload],
  );
}

async function saveOutboundMessage(event, body) {
  await db.query(
    `INSERT INTO whatsapp_messages
      (instance_name, remote_jid, sender_name, direction, body, raw_payload)
     VALUES ($1, $2, $3, 'outbound', $4, '{}'::jsonb)`,
    [event.instanceName, event.remoteJid, "bot", body],
  );
}

async function generateReply(event) {
  const response = await openai.chat.completions.create({
    model: config.model,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Voce e um atendente inicial de WhatsApp. Responda em portugues do Brasil, de forma curta, educada e objetiva. Quando nao souber, diga que vai encaminhar para um humano.",
      },
      {
        role: "user",
        content: `Cliente: ${event.senderName || "sem nome"}\nMensagem: ${event.text}`,
      },
    ],
  });

  return response.choices?.[0]?.message?.content?.trim();
}

async function sendWhatsAppText(instanceName, remoteJid, text) {
  if (!instanceName || !remoteJid) return;

  return sendEvolutionText(instanceName, remoteJid, text);
}

async function sendEvolutionText(instanceName, remoteJid, text) {
  if (!instanceName || !remoteJid || !text) return;

  const url = `${config.evolutionBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const number = remoteJid.endsWith("@s.whatsapp.net")
    ? remoteJid.replace("@s.whatsapp.net", "")
    : remoteJid;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({
      number,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution sendText failed: ${response.status} ${body}`);
  }
}

async function findEvolutionGroups(prefix = "ADS") {
  const response = await fetch(`${config.evolutionBaseUrl}/chat/findChats/${encodeURIComponent(config.evolutionInstanceName)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: config.evolutionApiKey,
    },
    body: "{}",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution findChats failed: ${response.status} ${body}`);
  }

  const chats = await response.json();
  const normalizedPrefix = normalizeText(prefix);
  return chats
    .map((chat) => ({
      name: chat.name || chat.pushName || "",
      remoteJid: chat.remoteJid,
      updatedAt: chat.updatedAt,
      profilePicUrl: chat.profilePicUrl,
      kind: inferChatKind(chat.remoteJid),
    }))
    .filter((chat) => chat.kind === "grupo")
    .filter((chat) => normalizeText(chat.name).startsWith(normalizedPrefix))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function inferChatKind(remoteJid = "") {
  if (remoteJid.endsWith("@g.us")) return "grupo";
  if (remoteJid.endsWith("@newsletter")) return "canal";
  if (remoteJid.endsWith("@s.whatsapp.net")) return "privado";
  return "outro";
}

function parseAdsInput(rawInput) {
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const first = lines[0] || "";
  const valueLine = lines.find((line) => /^valor\s*:/i.test(line)) || "";
  const dateLine = lines.find((line) => /^data\s*:/i.test(line)) || "";
  const nameLine = lines.find((line) => /^nome\s*:/i.test(line)) || "";
  const pixLine = lines.find((line) => /^pix\s*:/i.test(line)) || "";
  const currency = /\bUS\$|\bUSD/i.test(valueLine) ? "USD" : "BRL";
  const rawValue = parseMoney(valueLine);
  const taxedValue = roundCurrencyUp(rawValue * (1 + config.adsTaxRate / 100));
  const label = first.replace(/\s+/g, " ").trim();
  const customerName = nameLine.replace(/^nome\s*:\s*/i, "").trim();
  const pix = pixLine.replace(/^pix\s*:\s*/i, "").trim();
  const pixDetails = parsePixDetails(pix);

  return {
    label,
    date: normalizeDateCell(dateLine.replace(/^data\s*:\s*/i, "")),
    rawValue,
    currency,
    taxRate: config.adsTaxRate,
    taxedValue,
    customerName: normalizeBlank(customerName) || pixDetails.name || "",
    pix: pixDetails.pix || pix,
  };
}

function parseAdsEntries(rawInput) {
  const lines = String(rawInput || "").split(/\r?\n/);
  const entries = [];
  let current = [];

  for (const line of lines) {
    if (/^\s*ADS/i.test(line) && current.some((part) => part.trim())) {
      entries.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.some((part) => part.trim())) entries.push(current.join("\n").trim());
  return entries.filter((entry) => /^\s*ADS/i.test(entry));
}

function buildAdsPreviewEntries(rawInput, groups, mappings, statsMap) {
  const normalEntries = [];
  const jrItems = [];

  for (const rawEntry of parseAdsEntries(rawInput)) {
    const parsed = parseAdsInput(rawEntry);
    const mapping = findAdsMapping(parsed.label, mappings);
    const theBest = buildTheBestSummary(mapping, statsMap);
    if (isJrCampaign(parsed.label)) {
      jrItems.push({ parsed, rawInput: rawEntry, theBest });
      continue;
    }

    const match = findBestAdsGroup(parsed.label, groups);
    normalEntries.push({
      parsed,
      message: buildAdsMessage(parsed, theBest),
      match,
      theBest,
      rawInput: rawEntry,
    });
  }

  if (!jrItems.length) return normalEntries;

  const jrDate = getAdsStatsDate(jrItems.map((item) => item.rawInput).join("\n\n"));
  const parsed = buildJrParsed(jrItems, jrDate);
  const jrEntry = {
    parsed,
    message: buildJrAdsMessage(jrItems, jrDate),
    match: findJuniorAdsGroup(groups),
    theBest: null,
    rawInput: jrItems.map((item) => item.rawInput).join("\n\n"),
    items: jrItems.map((item) => item.parsed),
  };

  return [jrEntry, ...normalEntries];
}

function isJrCampaign(label) {
  return /\bJR\b/i.test(normalizeText(label));
}

function buildJrParsed(jrItems, date) {
  const first = jrItems[0]?.parsed || {};
  const rawValue = sumCurrencyValues(jrItems.map((item) => item.parsed.rawValue));
  const taxedValue = roundCurrencyUp(rawValue * (1 + config.adsTaxRate / 100));

  return {
    label: `JR - ${formatShortDate(date)}`,
    rawValue,
    currency: first.currency || "BRL",
    taxRate: config.adsTaxRate,
    taxedValue,
    customerName: first.customerName || "",
    pix: first.pix || "",
  };
}

function buildJrAdsMessage(jrItems, date) {
  const totalRaw = sumCurrencyValues(jrItems.map((item) => item.parsed.rawValue));
  const totalTaxed = roundCurrencyUp(totalRaw * (1 + config.adsTaxRate / 100));
  const currency = jrItems[0]?.parsed?.currency || "BRL";
  const label = `JR - ${formatShortDate(date)}`;
  const lines = [buildAdsIntro(label, date), "", label, ""];

  for (const item of jrItems) {
    lines.push(
      item.parsed.label,
      `Valor: ${formatMoney(item.parsed.rawValue, item.parsed.currency)}`,
      `Com imposto (${item.parsed.taxRate.toFixed(2).replace(".", ",")}%): ${formatMoney(item.parsed.taxedValue, item.parsed.currency)}`,
      `Nome: ${item.parsed.customerName || "-"}`,
      `Pix: ${item.parsed.pix || "-"}`,
    );
    pushTheBestLines(lines, item.theBest);
    lines.push("");
  }

  lines.push(`Total JR (com imposto): ${formatMoney(totalTaxed, currency)}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function sumCurrencyValues(values) {
  const cents = values.reduce((sum, value) => sum + Math.round(Number(value || 0) * 100), 0);
  return cents / 100;
}

function findJuniorAdsGroup(groups) {
  const exact = groups.find((group) => {
    const name = normalizeText(group.name);
    const digits = extractDigits(group.name);
    return name.includes("ADS") && name.includes("JUNIOR") && digits.includes("4094") && digits.includes("6980");
  });
  if (exact) return { ...exact, score: 100 };

  const fallback = groups.find((group) => {
    const name = normalizeText(group.name);
    return name.includes("ADS") && name.includes("JUNIOR");
  });
  return fallback ? { ...fallback, score: 80 } : null;
}

function formatShortDate(date) {
  const normalized = normalizeDateCell(date) || getTheBestDate();
  const [, , month, day] = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  return day && month ? `${day}/${month}` : normalized;
}

async function parseAdsWorkbook(buffer, options = {}) {
  const pixDetails = parsePixDetails(options.pix || "");
  const source = /\.csv$/i.test(options.filename || "") ? "csv" : "xlsx";
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { text: "", entries: 0, source };

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (!rows.length) return { text: "", entries: 0, source };

  const headers = Object.keys(rows[0]);
  const campaignKey = findHeader(headers, ["nome da campanha", "campaign name", "campanha"]);
  const spentKey = findHeader(headers, ["valor usado", "amount spent", "spent"]);
  const budgetKey = findHeader(headers, [
    "orcamento do conjunto de anuncios",
    "or amento do conjunto",
    "ora amento do conjunto",
    "ad set budget",
    "budget",
  ]);
  const dateKey = findHeader(headers, ["inicio dos relatorios", "início dos relatórios", "reporting starts"]);

  const sourceCurrency = detectMoneyHeaderCurrency(spentKey) || detectMoneyHeaderCurrency(budgetKey) || "USD";
  const exchange = sourceCurrency === "USD" ? await getUsdToBrlRate() : null;

  if (!campaignKey) {
    throw new Error("Coluna de campanha nao encontrada na planilha");
  }
  if (!spentKey && !budgetKey) {
    throw new Error("Coluna Valor usado ou Orcamento nao encontrada na planilha");
  }

  const grouped = new Map();
  for (const row of rows) {
    const label = normalizeCampaignLabel(row[campaignKey]);
    if (!normalizeText(label).startsWith("ADS")) continue;

    const spent = parseNumberCell(row[spentKey]);
    const budget = parseNumberCell(row[budgetKey]);
    const sourceValue = spentKey ? spent : budget;
    const value = roundCurrencyUp(sourceCurrency === "USD" ? sourceValue * exchange.rate : sourceValue);
    const currency = "BRL";
    if (value <= 0) continue;

    const key = normalizeText(label);
    const current = grouped.get(key) || {
      label,
      value: 0,
      currency,
      rows: 0,
      date: normalizeDateCell(row[dateKey]),
    };
    current.value += value;
    current.currency = current.currency === "BRL" || currency === "BRL" ? "BRL" : currency;
    current.rows += 1;
    if (!current.date) current.date = normalizeDateCell(row[dateKey]);
    grouped.set(key, current);
  }

  const sortedEntries = [...grouped.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  const entries = interleaveHalves(sortedEntries).map((item) => [
      item.label,
      `Data: ${item.date || getTheBestDate()}`,
      `Valor: ${item.currency === "USD" ? "US$" : "R$"} ${formatDecimal(item.value)}`,
      `Nome: ${pixDetails.name || "-"}`,
      `Pix: ${pixDetails.pix || "-"}`,
    ].join("\n"));

  return {
    text: entries.join("\n\n"),
    entries: entries.length,
    source,
    valueColumn: spentKey || budgetKey,
    budgetColumn: budgetKey,
    sourceCurrency,
    exchangeRate: exchange?.rate || null,
    exchangeUpdatedAt: exchange?.updatedAt || null,
    exchangeSource: exchange?.source || null,
  };
}

function interleaveHalves(items) {
  const midpoint = Math.ceil(items.length / 2);
  const firstHalf = items.slice(0, midpoint);
  const secondHalf = items.slice(midpoint);
  const result = [];

  for (let index = 0; index < midpoint; index += 1) {
    if (firstHalf[index]) result.push(firstHalf[index]);
    if (secondHalf[index]) result.push(secondHalf[index]);
  }

  return result;
}

function parsePixDetails(value) {
  const text = String(value || "").trim();
  if (!text) return { name: "", pix: "" };

  const nameMatch = text.match(/(?:^|\b)nome\s*:\s*(.+?)(?=\s+(?:chave\s*)?pix\s*:|$)/i);
  const pixMatch = text.match(/(?:chave\s*)?pix\s*:\s*(.+)$/i);

  return {
    name: normalizeBlank(nameMatch?.[1]),
    pix: normalizeBlank(pixMatch?.[1]) || text,
  };
}

function normalizeBlank(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function findHeader(headers, candidates) {
  return headers.find((header) => {
    const normalizedVariants = [header, repairMojibake(header)].map((value) => normalizeText(value));
    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeText(candidate);
      return normalizedVariants.some((normalized) =>
        normalized.includes(normalizedCandidate) || isKnownMojibakeHeaderMatch(normalized, normalizedCandidate)
      );
    });
  });
}

function isKnownMojibakeHeaderMatch(normalizedHeader, normalizedCandidate) {
  if (normalizedCandidate === "INICIO DOS RELATORIOS") {
    return normalizedHeader.includes("INA CIO DOS RELATA RIOS");
  }
  if (normalizedCandidate === "ORCAMENTO DO CONJUNTO DE ANUNCIOS") {
    return normalizedHeader.includes("ORA AMENTO DO CONJUNTO");
  }
  return false;
}

function repairMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂ]/.test(text)) return text;
  return Buffer.from(text, "latin1").toString("utf8");
}

function normalizeCampaignLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\(/g, " (")
    .trim();
}

function parseNumberCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = parseMoney(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectMoneyHeaderCurrency(header) {
  const normalized = normalizeText(header);
  if (/\bBRL\b|\bR\b/.test(normalized)) return "BRL";
  if (/\bUSD\b|\bUS\b/.test(normalized)) return "USD";
  return "";
}

function normalizeDateCell(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(Math.round(value));
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = String(value).trim();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;

  const br = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

  return null;
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function getUsdToBrlRate() {
  const cacheKey = "exchange:USD-BRL:latest";
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const exchange = await fetchUsdToBrlFromProviders();
  await redis.set(cacheKey, JSON.stringify(exchange), "EX", 1800);
  return exchange;
}

async function fetchUsdToBrlFromProviders() {
  const errors = [];

  for (const provider of [fetchAwesomeUsdToBrl, fetchDolarApiUsdToBrl]) {
    try {
      const exchange = await provider();
      if (exchange?.rate > 0) return exchange;
    } catch (error) {
      errors.push(String(error.message || error));
    }
  }

  throw new Error(`Falha ao buscar cotacao USD-BRL atual: ${errors.join(" | ")}`);
}

async function fetchAwesomeUsdToBrl() {
  const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
    headers: {
      Accept: "application/json",
      "User-Agent": "MegaApp-ADS/1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AwesomeAPI ${response.status}: ${body}`);
  }

  const data = await response.json();
  const quote = data?.USDBRL;
  const rate = Number(quote?.bid || quote?.ask);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("AwesomeAPI retornou cotacao invalida");
  }

  return {
    rate,
    updatedAt: quote?.create_date || null,
    source: "AwesomeAPI USD-BRL",
  };
}

async function fetchDolarApiUsdToBrl() {
  const response = await fetch("https://br.dolarapi.com/v1/cotacoes/usd", {
    headers: {
      Accept: "application/json",
      "User-Agent": "MegaApp-ADS/1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DolarApi ${response.status}: ${body}`);
  }

  const data = await response.json();
  const quote = Array.isArray(data) ? data[0] : data;
  const rate = Number(quote?.venda || quote?.compra);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("DolarApi retornou cotacao invalida");
  }

  return {
    rate,
    updatedAt: quote?.dataAtualizacao || null,
    source: "DolarApi USD-BRL",
  };
}

function extractAdsMappings(rawInput) {
  const mappings = [];
  const text = String(rawInput || "");
  const arrayMatches = text.match(/\[[\s\S]*?\]/g) || [];

  for (const candidate of arrayMatches) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (item?.nome_campanha && Object.hasOwn(item, "login_the_best")) {
          mappings.push({
            nome_campanha: String(item.nome_campanha),
            login_the_best: String(item.login_the_best || ""),
          });
        }
      }
    } catch {}
  }

  return mappings;
}

function mergeAdsMappings(defaults, overrides) {
  const byCampaign = new Map();
  for (const item of [...defaults, ...overrides]) {
    if (!item?.nome_campanha) continue;
    byCampaign.set(normalizeText(item.nome_campanha), item);
  }
  return [...byCampaign.values()];
}

function parseMoney(value) {
  const match = String(value).match(/[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return 0;

  const token = match[0];
  const lastComma = token.lastIndexOf(",");
  const lastDot = token.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const normalized = token
    .replace(new RegExp(`\\${decimalSeparator === "," ? "." : ","}`, "g"), "")
    .replace(decimalSeparator, ".");
  return Number(normalized) || 0;
}

function roundCurrencyUp(value) {
  return Math.ceil((Number(value) - Number.EPSILON) * 100) / 100;
}

function formatMoney(value, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}

function buildAdsMessage(parsed, theBest = null) {
  const lines = [
    buildAdsIntro(parsed.label, parsed.date),
    "",
    parsed.label,
    `Valor: ${formatMoney(parsed.rawValue, parsed.currency)}`,
    `Com imposto (${parsed.taxRate.toFixed(2).replace(".", ",")}%): ${formatMoney(parsed.taxedValue, parsed.currency)}`,
    `Nome: ${parsed.customerName || "-"}`,
    `Pix: ${parsed.pix || "-"}`,
  ];

  if (theBest?.login) {
    lines.push("");
    pushTheBestLines(lines, theBest);
  }

  return lines.join("\n");
}

function pushTheBestLines(lines, theBest) {
  if (!theBest?.login) return;
  lines.push(
    `The Best (${theBest.login}):`,
    `Vendas: ${theBest.sales}`,
    `Testes: ${theBest.tests}`,
  );
}

function buildAdsIntro(label, date) {
  const greeting = getTurnGreeting();
  const dayText = formatAdsIntroDate(date);
  const variants = [
    `${greeting}, tudo bem? Segue o ADS do dia ${dayText}.`,
    `${greeting}! Tudo certo? Estou enviando o ADS do dia ${dayText}.`,
    `${greeting}, beleza? Segue o ADS referente ao dia ${dayText}.`,
    `${greeting}! Passando aqui o ADS do dia ${dayText}.`,
    `${greeting}, tudo bem por ai? Segue o ADS de ${dayText}.`,
  ];
  return variants[pickStableIndex(`${label}|${date || getTheBestDate()}|${getTheBestDate()}`, variants.length)];
}

function getTurnGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatAdsIntroDate(date) {
  const normalized = normalizeDateCell(date) || getTheBestDate();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : normalized;
}

function pickStableIndex(seed, length) {
  let hash = 0;
  for (const char of String(seed || "")) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % Math.max(length, 1);
}

function findBestAdsGroup(label, groups) {
  const labelNorm = normalizeText(label);
  const labelPhones = extractDigits(label);
  let best = null;

  for (const group of groups) {
    const nameNorm = normalizeText(group.name);
    const groupPhones = extractDigits(group.name);
    let score = 0;

    if (nameNorm === labelNorm) score += 100;
    if (nameNorm.length > 6 && labelNorm.length > 6 && (nameNorm.includes(labelNorm) || labelNorm.includes(nameNorm))) {
      score += 60;
    }
    for (const digits of labelPhones) {
      if (digits.length >= 4 && groupPhones.includes(digits)) score += 30;
    }
    for (const token of labelNorm.split(" ").filter((part) => part.length >= 3)) {
      if (nameNorm.includes(token)) score += 5;
    }

    if (!best || score > best.score) best = { ...group, score };
  }

  return best?.score >= 30 ? best : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function extractDigits(value) {
  return String(value || "").match(/\d+/g) || [];
}

function findAdsMapping(label, mappings) {
  const labelNorm = normalizeText(label);
  const labelDigits = extractDigits(label).filter((digits) => digits.length >= 4);
  let best = null;

  for (const mapping of mappings) {
    if (!mapping.login_the_best) continue;
    const campaignNorm = normalizeText(mapping.nome_campanha);
    const campaignDigits = extractDigits(mapping.nome_campanha).filter((digits) => digits.length >= 4);
    let score = 0;

    if (campaignNorm === labelNorm) score += 100;
    if (campaignNorm.includes(labelNorm) || labelNorm.includes(campaignNorm)) score += 50;
    for (const digits of labelDigits) {
      if (campaignDigits.includes(digits)) score += 40;
    }
    for (const token of labelNorm.split(" ").filter((part) => part.length >= 3)) {
      if (campaignNorm.includes(token)) score += 5;
    }

    if (!best || score > best.score) best = { ...mapping, score };
  }

  return best?.score >= 30 ? best : null;
}

function buildTheBestSummary(mapping, statsMap) {
  const login = mapping?.login_the_best?.trim();
  if (!login) return null;

  const stats = statsMap.get(login.toLowerCase()) || { sales: 0, renewals: 0, tests: 0 };
  return {
    login,
    campaign: mapping.nome_campanha,
    sales: stats.sales || 0,
    renewals: stats.renewals || 0,
    tests: stats.tests || 0,
  };
}

function getTheBestDate() {
  const now = new Date(Date.now() + config.theBestTimezoneOffset * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function getAdsStatsDate(rawInput) {
  const dateLine = String(rawInput || "").match(/^Data\s*:\s*(.+)$/im)?.[1];
  return normalizeDateCell(dateLine) || getTheBestDate();
}

async function getTheBestStatsMap(date) {
  const empty = new Map();
  if (!config.theBestApiKey) return empty;

  const cacheKey = `thebest:stats:${date}`;
  const cached = await redis.get(cacheKey);
  if (cached) return statsObjectToMap(JSON.parse(cached));

  const stats = {};
  await mergeTheBestStats(stats, await fetchTheBestStatsForKey(config.theBestApiKey, date));

  for (const [login, apiKey] of Object.entries(config.theBestPerUserApiKeys || {})) {
    if (!apiKey) continue;
    const perUserStats = await fetchTheBestStatsForKey(apiKey, date);
    const lookup = perUserStats[login.toLowerCase()];
    if (lookup) stats[login.toLowerCase()] = lookup;
  }

  await redis.set(cacheKey, JSON.stringify(stats), "EX", 600);
  return statsObjectToMap(stats);
}

async function getTheBestStatsMapSafe(date) {
  try {
    return { statsMap: await getTheBestStatsMap(date), statsError: null };
  } catch (error) {
    console.error("the best stats failed", error);
    return { statsMap: new Map(), statsError: String(error.message || error) };
  }
}

async function fetchTheBestStatsForKey(apiKey, date) {
  const stats = {};

  for (const action of THE_BEST_ACTIONS) {
    let page = 1;
    let stop = false;

    while (!stop && page <= config.theBestMaxPages) {
      const url = `${THE_BEST_API_URL}?action=${encodeURIComponent(action)}&page=${page}`;
      const response = await fetch(url, {
        headers: {
          "Api-Key": apiKey,
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`The Best failed: ${response.status} ${body}`);
      }

      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) break;

      for (const item of results) {
        const itemDate = getTheBestItemDate(item.created_at);
        if (!itemDate) continue;

        if (itemDate === date) {
          const user = String(item.user_username || "unknown").toLowerCase();
          stats[user] ||= { sales: 0, renewals: 0, tests: 0 };
          if (action === "trial-conversion") stats[user].sales += 1;
          if (action === "extend") stats[user].renewals += 1;
          if (action === "new") stats[user].tests += 1;
        } else if (itemDate < date) {
          stop = true;
          break;
        }
      }

      if (stop || !data.next_page) break;
      page += 1;
    }
  }

  return stats;
}

async function mergeTheBestStats(target, source) {
  for (const [user, stats] of Object.entries(source)) {
    target[user] ||= { sales: 0, renewals: 0, tests: 0 };
    target[user].sales += stats.sales || 0;
    target[user].renewals += stats.renewals || 0;
    target[user].tests += stats.tests || 0;
  }
}

function getTheBestItemDate(createdAt) {
  if (!createdAt) return null;
  const timestamp = Number(createdAt) * 1000;
  if (!Number.isFinite(timestamp)) return null;
  const local = new Date(timestamp + config.theBestTimezoneOffset * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function statsObjectToMap(value) {
  return new Map(Object.entries(value || {}));
}

function parseJsonEnv(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function saveAdsDispatch({ parsed, rawInput, match, message, status }) {
  const result = await db.query(
    `INSERT INTO ads_dispatches
      (group_name, group_jid, label, raw_value, currency, tax_rate, taxed_value,
       customer_name, pix, message_body, status, raw_input, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     RETURNING id`,
    [
      match.name,
      match.remoteJid,
      parsed.label,
      parsed.rawValue,
      parsed.currency,
      parsed.taxRate,
      parsed.taxedValue,
      parsed.customerName,
      parsed.pix,
      message,
      status,
      rawInput,
    ],
  );

  return result.rows[0];
}

app.listen(port, () => {
  console.log(`orchestrator listening on ${port}`);
});
