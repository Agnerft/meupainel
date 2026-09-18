export function parseJsonEnv(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const config = {
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  audioTranscriptionModel: process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
  evolutionBaseUrl: process.env.EVOLUTION_BASE_URL || "http://evolution-api:8080",
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || "principal",
  webhookSecret: process.env.ORCHESTRATOR_WEBHOOK_SECRET,
  uiAdminToken: process.env.UI_ADMIN_TOKEN,
  uiAdminUser: process.env.UI_ADMIN_USER || "agner",
  uiAdminPassword: process.env.UI_ADMIN_PASSWORD,
  adsTaxRate: Number(process.env.ADS_TAX_RATE || 12.15),
  theBestApiKey: process.env.THE_BEST_API_KEY,
  theBestPerUserApiKeys: parseJsonEnv(process.env.THE_BEST_PER_USER_API_KEYS_JSON, {}),
  theBestRequestTimeoutMs: Number(process.env.THE_BEST_REQUEST_TIMEOUT_MS || 90000),
  theBestTimezoneOffset: Number(process.env.THE_BEST_TIMEZONE_OFFSET || -3),
  theBestMaxPages: Number(process.env.THE_BEST_MAX_PAGES || 120),
  tdsCreditAlertThreshold: Number(process.env.TDS_CREDIT_ALERT_THRESHOLD || 30),
  tdsCreditCriticalAlertThreshold: Number(process.env.TDS_CREDIT_CRITICAL_ALERT_THRESHOLD || 15),
  tdsCreditAlertIntervalMs: Number(process.env.TDS_CREDIT_ALERT_INTERVAL_MS || 5 * 60 * 1000),
  tdsDailyRenewalReportUsername: process.env.TDS_DAILY_RENEWAL_REPORT_USERNAME || "tdscr7milgols",
  tdsDailyRenewalReportStartTime: process.env.TDS_DAILY_RENEWAL_REPORT_START_TIME || "08:00",
  tdsDailyRenewalReportEndTime: process.env.TDS_DAILY_RENEWAL_REPORT_END_TIME || "23:40",
  tdsDailyRenewalReportIntervalMs: Number(process.env.TDS_DAILY_RENEWAL_REPORT_INTERVAL_MS || 60 * 1000),
};

export const THE_BEST_API_URL = "https://api.painel.best/user/logs/";
export const THE_BEST_BASE_URL = "https://api.painel.best";
export const THE_BEST_ACTIONS = ["new", "extend", "trial-conversion"];
export const REMINDER_STATE_TTL_SECONDS = 6 * 60 * 60;
export const REMINDER_CHECK_INTERVAL_MS = 15 * 1000;
export const RESELLER_MENU_TTL_SECONDS = 10 * 60;
export const MONITOR_FOLLOWUP_DELAY_MS = 60 * 1000;
export const MONITOR_FOLLOWUP_TTL_SECONDS = 5 * 60;
export const MONITOR_FOLLOWUP_BODY = "__monitor_followup_question__";
export const MONITOR_FOLLOWUP_MESSAGE = [
  "Quer algo mais?",
  "",
  "1 - Sim",
  "2 - Nao",
].join("\n");
export const ONLY_REPLY_GROUP_NAME = "DEVERES";
export const TDS_CREDIT_ALERT_KEY_PREFIX = "tds-credit-alert";
export const TDS_DAILY_RENEWAL_REPORT_KEY_PREFIX = "tds-daily-renewal-report";
export const DAILY_REPORT_REDIS_TTL_SECONDS = 3 * 24 * 60 * 60;
export const ADMIN_COOKIE_NAME = "mega_admin";
export const MAX_ADS_IMPORT_BYTES = 12 * 1024 * 1024;
export const MAX_ADS_IMPORT_ROWS = 5000;
export const RESELLER_MENU_AMOUNTS = [5, 10, 15, 20];
export const EXTERNAL_ADS_CAMPAIGNS = [
  { key: "angelo", label: "ADS15 - ANGELO (2061)", aliases: ["ANGELO", "ADS15", "2061"] },
  { key: "rafa", label: "ADS17 - RAFA NATV (1757)", aliases: ["RAFA", "NATV", "ADS17", "1757"] },
];
export const DEFAULT_ADS_MAPPINGS = [
  { nome_campanha: "ADS1 - KRONE (3545)", login_the_best: "Jonathan01" },
  { nome_campanha: "ADS8 - ALLAN (5666)", login_the_best: "revendaallan" },
  { nome_campanha: "ADS9 - DOUGLAS SANDI (9023)", login_the_best: "sandi01" },
  { nome_campanha: "ADS11 - LUCAS MAYCA (7908)", login_the_best: "lucasmayca" },
  { nome_campanha: "ADS13 - IGOR (1755)", login_the_best: "igor01" },
  { nome_campanha: "ADS15 - ANGELO (2061)", login_the_best: "angelo" },
  { nome_campanha: "ADS17 - RAFA NATV (1757)", login_the_best: "rafa" },
  { nome_campanha: "ADS27 - ALEXANDRE JR (8841)", login_the_best: "Alexandre01" },
  { nome_campanha: "ADS29 - GUILHERME JR (9889)", login_the_best: "Guimendes" },
  { nome_campanha: "ADS31 - DAVID JR (1276)", login_the_best: "David01" },
  { nome_campanha: "ADS32 - WILLIAM JR (6684)", login_the_best: "Williamfarias" },
  { nome_campanha: "ADS34 - EVERALDO JR (8094)", login_the_best: "Junior" },
  { nome_campanha: "ADS18 - EMERSON (1714)", login_the_best: "tdsfga" },
  { nome_campanha: "ADS19 - ERICK (1910)", login_the_best: "tdsmalware" },
  { nome_campanha: "ADS20 - HERON (1181)", login_the_best: "tdsdrvendasnights" },
  { nome_campanha: "ADS21 - IGOREKEISY (1421)", login_the_best: "tdsbigseven" },
  { nome_campanha: "ADS22 - JACQUES (5590)", login_the_best: "tdsthechosen" },
  { nome_campanha: "ADS23 - JOAO (7378)", login_the_best: "tdspaqueta20vender" },
  { nome_campanha: "ADS24 - JULIO (1718)", login_the_best: "tdstheflash" },
  { nome_campanha: "ADS25 - ROBSON (7088)", login_the_best: "tdsrobson" },
  { nome_campanha: "ADS26 - ROGERIO (1719)", login_the_best: "tdssmallville" },
  { nome_campanha: "ADS37 - JACKSON (0083)", login_the_best: "tdsmessithebest" },
];
