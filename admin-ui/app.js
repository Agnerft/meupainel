const adminUserInput = document.querySelector("#adminUser");
const adminPasswordInput = document.querySelector("#adminPassword");
const saveTokenButton = document.querySelector("#saveTokenButton");
const refreshButton = document.querySelector("#refreshButton");
const testButton = document.querySelector("#testButton");
const testText = document.querySelector("#testText");
const replyBox = document.querySelector("#replyBox");
const messageList = document.querySelector("#messageList");
const statusStrip = document.querySelector("#statusStrip");
const lastUpdate = document.querySelector("#lastUpdate");
const adsText = document.querySelector("#adsText");
const adsPreviewButton = document.querySelector("#adsPreviewButton");
const adsSendButton = document.querySelector("#adsSendButton");
const adsPreviewBox = document.querySelector("#adsPreviewBox");
const adsGroupSelect = document.querySelector("#adsGroupSelect");
const adsStatus = document.querySelector("#adsStatus");
const adsFile = document.querySelector("#adsFile");
const adsBatchList = document.querySelector("#adsBatchList");
const adsGroupFilter = document.querySelector("#adsGroupFilter");
const adsGroupSearchButton = document.querySelector("#adsGroupSearchButton");
const historyDateFilter = document.querySelector("#historyDateFilter");
const historyCampaignFilter = document.querySelector("#historyCampaignFilter");
const historyFilterButton = document.querySelector("#historyFilterButton");
const historyClearButton = document.querySelector("#historyClearButton");
const historyTotals = document.querySelector("#historyTotals");
const dispatchList = document.querySelector("#dispatchList");
const themeToggle = document.querySelector("#themeToggle");
const adsPixDefault = document.querySelector("#adsPixDefault");
const savePixButton = document.querySelector("#savePixButton");
const monitorStatus = document.querySelector("#monitorStatus");
const monitorGroupFilter = document.querySelector("#monitorGroupFilter");
const monitorGroupSearchButton = document.querySelector("#monitorGroupSearchButton");
const monitorGroupSelect = document.querySelector("#monitorGroupSelect");
const monitorEnabled = document.querySelector("#monitorEnabled");
const saveMonitorButton = document.querySelector("#saveMonitorButton");
const sendProgressOverlay = document.querySelector("#sendProgressOverlay");
const sendProgressTitle = document.querySelector("#sendProgressTitle");
const sendProgressPercent = document.querySelector("#sendProgressPercent");
const sendProgressBarFill = document.querySelector("#sendProgressBarFill");
const sendProgressSent = document.querySelector("#sendProgressSent");
const sendProgressRemaining = document.querySelector("#sendProgressRemaining");
const sendProgressTotal = document.querySelector("#sendProgressTotal");
const sendProgressCurrent = document.querySelector("#sendProgressCurrent");
const sendProgressClose = document.querySelector("#sendProgressClose");
const reviewOverlay = document.querySelector("#reviewOverlay");
const reviewStats = document.querySelector("#reviewStats");
const reviewWarnings = document.querySelector("#reviewWarnings");
const reviewTotals = document.querySelector("#reviewTotals");
const reviewConfirmButton = document.querySelector("#reviewConfirmButton");
const reviewCancelButton = document.querySelector("#reviewCancelButton");
const navItems = [...document.querySelectorAll(".navItem[href^='#']")];

let adsPreview = null;
let pendingReviewResolve = null;
const dispatchMessages = new Map();

const metrics = {
  total: document.querySelector("#metricTotal"),
  inbound: document.querySelector("#metricInbound"),
  outbound: document.querySelector("#metricOutbound"),
  contacts: document.querySelector("#metricContacts"),
};

adminUserInput.value = localStorage.getItem("uiAdminUser") || "agner";
adsPixDefault.value = localStorage.getItem("adsPixDefault") || "";

saveTokenButton.addEventListener("click", loginAdmin);
adminPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loginAdmin();
});

refreshButton.addEventListener("click", loadSummary);
testButton.addEventListener("click", testReply);
adsPreviewButton.addEventListener("click", previewAds);
adsSendButton.addEventListener("click", sendAds);
adsFile.addEventListener("change", loadAdsFile);
adsGroupSearchButton.addEventListener("click", loadAdsGroups);
adsGroupFilter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadAdsGroups();
});
monitorGroupSearchButton.addEventListener("click", loadMonitorGroups);
monitorGroupFilter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadMonitorGroups();
});
saveMonitorButton.addEventListener("click", saveMonitorSettings);
historyFilterButton.addEventListener("click", loadAdsHistory);
historyClearButton.addEventListener("click", () => {
  historyDateFilter.value = "";
  historyCampaignFilter.value = "";
  loadAdsHistory();
});
historyCampaignFilter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadAdsHistory();
});
dispatchList.addEventListener("click", copyDispatchMessage);
themeToggle.addEventListener("click", toggleTheme);
savePixButton.addEventListener("click", savePixDefault);
sendProgressClose.addEventListener("click", () => {
  sendProgressOverlay.hidden = true;
});
reviewCancelButton.addEventListener("click", () => resolveReview(false));
reviewConfirmButton.addEventListener("click", () => resolveReview(true));
adsPixDefault.addEventListener("input", () => {
  localStorage.setItem("adsPixDefault", adsPixDefault.value.trim());
});
window.addEventListener("hashchange", updateActiveNav);

initTheme();
updateActiveNav();

async function api(path, options = {}) {
  const token = localStorage.getItem("uiAdminToken") || "";
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`/api/${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
      ...(options.headers || {}),
    },
  }).catch((error) => {
    if (error.name === "AbortError") {
      throw new Error("Tempo limite atingido. Tente gerar a previa novamente.");
    }
    throw error;
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || data.error || `HTTP ${response.status}`);
  }

  return response.json();
}

async function loginAdmin() {
  const username = adminUserInput.value.trim();
  const password = adminPasswordInput.value;
  if (!username || !password) {
    lastUpdate.textContent = "Informe login e senha";
    return;
  }

  saveTokenButton.disabled = true;
  saveTokenButton.textContent = "Entrando...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    localStorage.setItem("uiAdminUser", username);
    localStorage.setItem("uiAdminToken", data.token || "");
    adminPasswordInput.value = "";
    lastUpdate.textContent = "Login realizado";
    loadSummary();
  } catch (error) {
    localStorage.removeItem("uiAdminToken");
    lastUpdate.textContent = `Falha no login: ${error.message}`;
  } finally {
    saveTokenButton.disabled = false;
    saveTokenButton.textContent = "Entrar";
  }
}

async function loadSummary() {
  try {
    const data = await api("summary");
    renderMetrics(data.totals || {});
    renderServices(data.services || {});
    renderMessages(data.recentMessages || []);
    loadMonitorSettings();
    loadAdsHistory();
    lastUpdate.textContent = new Date().toLocaleString("pt-BR");
  } catch (error) {
    lastUpdate.textContent = "Falha ao carregar";
    statusStrip.innerHTML = `<div class="statusItem"><span>Painel</span><strong class="fail">${escapeHtml(error.message)}</strong></div>`;
  }
}

async function loadMonitorSettings() {
  try {
    const data = await api("monitor/settings");
    const settings = data.settings || {};
    monitorEnabled.checked = Boolean(settings.enabled);
    monitorStatus.textContent = settings.enabled
      ? `Monitorando: ${settings.groupName || settings.groupJid}`
      : "Nenhum grupo monitorado.";

    if (settings.groupJid && ![...monitorGroupSelect.options].some((option) => option.value === settings.groupJid)) {
      monitorGroupSelect.appendChild(new Option(settings.groupName || settings.groupJid, settings.groupJid));
    }
    if (settings.groupJid) monitorGroupSelect.value = settings.groupJid;
  } catch (error) {
    monitorStatus.textContent = `Falha ao carregar monitor: ${error.message}`;
  }
}

async function loadMonitorGroups() {
  const prefix = monitorGroupFilter.value.trim();
  monitorStatus.textContent = "Buscando grupos...";

  try {
    const data = await api(`monitor/groups?prefix=${encodeURIComponent(prefix)}`);
    populateMonitorGroupSelect(data.groups || [], monitorGroupSelect.value);
    monitorStatus.textContent = `${data.groups?.length || 0} grupo(s) encontrado(s)`;
  } catch (error) {
    monitorStatus.textContent = `Falha ao buscar grupos: ${error.message}`;
  }
}

function populateMonitorGroupSelect(groups, selectedJid = "") {
  monitorGroupSelect.innerHTML = "";
  for (const group of groups) {
    const option = new Option(group.name, group.remoteJid);
    option.selected = group.remoteJid === selectedJid;
    monitorGroupSelect.appendChild(option);
  }
}

async function saveMonitorSettings() {
  const selected = monitorGroupSelect.selectedOptions[0];
  const groupJid = monitorGroupSelect.value;
  const groupName = selected?.textContent || groupJid;

  saveMonitorButton.disabled = true;
  monitorStatus.textContent = "Salvando grupo...";

  try {
    const data = await api("monitor/settings", {
      method: "POST",
      body: JSON.stringify({
        enabled: monitorEnabled.checked,
        groupJid,
        groupName,
      }),
    });
    const settings = data.settings || {};
    monitorStatus.textContent = settings.enabled
      ? `Monitorando: ${settings.groupName || settings.groupJid}`
      : "Monitor desligado.";
  } catch (error) {
    monitorStatus.textContent = `Falha ao salvar: ${error.message}`;
  } finally {
    saveMonitorButton.disabled = false;
  }
}

async function loadAdsGroups() {
  const prefix = adsGroupFilter.value.trim() || "ADS";
  adsStatus.textContent = "Buscando grupos...";

  try {
    const data = await api(`ads/groups?prefix=${encodeURIComponent(prefix)}`);
    populateGroupSelect(data.groups || []);
    adsStatus.textContent = `${data.groups?.length || 0} grupo(s) encontrado(s)`;
    adsSendButton.disabled = !adsText.value.trim() || !adsGroupSelect.value;
  } catch (error) {
    adsStatus.textContent = "Falha ao buscar grupos";
    adsPreviewBox.textContent = `Falha: ${error.message}`;
  }
}

function populateGroupSelect(groups, selectedJid = "") {
  adsGroupSelect.innerHTML = "";

  for (const group of groups) {
    const option = new Option(group.name, group.remoteJid);
    option.selected = group.remoteJid === selectedJid;
    adsGroupSelect.appendChild(option);
  }
}

function renderMetrics(totals) {
  metrics.total.textContent = totals.total || 0;
  metrics.inbound.textContent = totals.inbound || 0;
  metrics.outbound.textContent = totals.outbound || 0;
  metrics.contacts.textContent = totals.contacts || 0;
}

function renderServices(services) {
  const items = [
    ["Database", services.database],
    ["Redis", services.redis],
    ["Evolution", services.evolution],
    ["OpenAI", services.openaiConfigured],
  ];

  statusStrip.innerHTML = items
    .map(([label, ok]) => {
      const status = ok ? "Online" : "Atencao";
      const klass = ok ? "ok" : "fail";
      return `<div class="statusItem"><span>${label}</span><strong class="${klass}">${status}</strong></div>`;
    })
    .join("");
}

function renderMessages(messages) {
  if (!messages.length) {
    messageList.innerHTML = `
      <div class="message">
        <div><span class="badge">Vazio</span></div>
        <div class="messageBody">
          <div class="messageMeta"><span>Sem historico recente</span></div>
          <div class="messageText">Nenhuma mensagem recebida ainda.</div>
        </div>
      </div>
    `;
    return;
  }

  messageList.innerHTML = messages
    .map((message) => {
      const direction = message.direction === "outbound" ? "outbound" : "inbound";
      const label = direction === "outbound" ? "Saida" : "Entrada";
      const date = message.created_at ? new Date(message.created_at).toLocaleString("pt-BR") : "";
      return `
        <article class="message">
          <div><span class="badge ${direction}">${label}</span></div>
          <div class="messageBody">
            <div class="messageMeta">
              <span>${escapeHtml(message.sender_name || "Sem nome")}</span>
              <span>${escapeHtml(message.remote_jid || "")}</span>
              <span>${escapeHtml(date)}</span>
            </div>
            <div class="messageText">${escapeHtml(message.body || "")}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadAdsHistory() {
  const params = new URLSearchParams();
  if (historyDateFilter.value) params.set("date", historyDateFilter.value);
  if (historyCampaignFilter.value.trim()) params.set("campaign", historyCampaignFilter.value.trim());

  try {
    const data = await api(`ads/history?${params.toString()}`);
    renderAdsHistory(data.dispatches || [], data.totals || {});
  } catch (error) {
    dispatchList.innerHTML = `
      <article class="dispatchItem">
        <div class="dispatchBody">
          <strong>Falha ao carregar historico</strong>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </article>
    `;
  }
}

function renderAdsHistory(dispatches, totals) {
  dispatchMessages.clear();
  historyTotals.innerHTML = `
    <article>
      <span>Total enviado</span>
      <strong>${Number(totals.total_sent || 0).toLocaleString("pt-BR")}</strong>
    </article>
    <article>
      <span>Valor bruto</span>
      <strong>${formatCurrency(totals.total_raw)}</strong>
    </article>
    <article>
      <span>Com imposto</span>
      <strong>${formatCurrency(totals.total_taxed)}</strong>
    </article>
  `;

  if (!dispatches.length) {
    dispatchList.innerHTML = `
      <article class="dispatchItem">
        <div class="dispatchBody">
          <strong>Nenhum disparo encontrado</strong>
          <p>Use outro filtro ou envie uma nova campanha.</p>
        </div>
      </article>
    `;
    return;
  }

  dispatchList.innerHTML = dispatches.map((item) => renderDispatchItem(item)).join("");
}

function renderDispatchItem(item) {
  const sentAt = item.sent_at || item.created_at;
  const date = sentAt ? new Date(sentAt).toLocaleString("pt-BR") : "";
  dispatchMessages.set(String(item.id), item.message_body || "");
  return `
    <article class="dispatchItem">
      <div class="dispatchMeta">
        <span class="badge outbound">Enviado</span>
        <span>${escapeHtml(date)}</span>
        <span>${escapeHtml(item.group_name || item.group_jid || "Sem grupo")}</span>
      </div>
      <div class="dispatchBody">
        <div class="dispatchTitle">
          <strong>${escapeHtml(item.label || "ADS")}</strong>
          <span>${formatCurrency(item.taxed_value)} com imposto</span>
        </div>
        <pre>${escapeHtml(item.message_body || "")}</pre>
        <button class="smallButton copyDispatchButton" type="button" data-id="${escapeHtml(item.id)}">Copiar mensagem</button>
      </div>
    </article>
  `;
}

async function copyDispatchMessage(event) {
  const button = event.target.closest(".copyDispatchButton");
  if (!button) return;

  try {
    await navigator.clipboard.writeText(dispatchMessages.get(button.dataset.id) || "");
    button.textContent = "Copiado";
    setTimeout(() => { button.textContent = "Copiar mensagem"; }, 1600);
  } catch {
    button.textContent = "Falha ao copiar";
    setTimeout(() => { button.textContent = "Copiar mensagem"; }, 1600);
  }
}

async function testReply() {
  const text = testText.value.trim();
  if (!text) return;

  testButton.disabled = true;
  replyBox.textContent = "Gerando...";

  try {
    const data = await api("test-reply", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    replyBox.textContent = data.reply || "Sem resposta.";
  } catch (error) {
    replyBox.textContent = `Falha: ${error.message}`;
  } finally {
    testButton.disabled = false;
  }
}

async function previewAds() {
  const text = adsText.value.trim();
  if (!text) return;

  adsPreviewButton.disabled = true;
  adsSendButton.disabled = true;
  adsStatus.textContent = "Gerando previa...";
  adsPreviewBox.textContent = "Processando...";

  try {
    adsPreview = await api("ads/preview", {
      method: "POST",
      body: JSON.stringify({ text }),
      timeoutMs: 30000,
    });
    renderAdsPreview(adsPreview);
    const entries = adsPreview.entries || [];
    const found = entries.filter((entry) => entry.match?.remoteJid).length;
    adsStatus.textContent = entries.length > 1
      ? `${found}/${entries.length} grupo(s) encontrado(s)`
      : adsPreview.match
        ? "Grupo encontrado"
        : "Escolha um grupo";
    adsSendButton.disabled = !adsGroupSelect.value;
  } catch (error) {
    adsStatus.textContent = "Falha na previa";
    adsPreviewBox.textContent = `Falha: ${error.message}`;
  } finally {
    adsPreviewButton.disabled = false;
  }
}

async function loadAdsFile() {
  const file = adsFile.files?.[0];
  if (!file) return;

  adsStatus.textContent = "Lendo arquivo...";
  adsSendButton.disabled = true;

  try {
    if (/\.(xlsx?|csv)$/i.test(file.name)) {
      const base64 = await fileToBase64(file);
      const data = await api("ads/import-file", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, base64, pix: adsPixDefault.value.trim() }),
        timeoutMs: 60000,
      });
      adsText.value = data.text || "";
      const quote = data.exchangeRate
        ? ` | USD-BRL ${Number(data.exchangeRate).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
        : "";
      adsStatus.textContent = `${data.entries || 0} lancamento(s) importado(s)${quote}`;
      adsPreviewBox.textContent = data.text
        ? "Arquivo convertido. Clique em Gerar previa para conferir os grupos."
        : "Nenhum ADS com valor foi encontrado no arquivo.";
      return;
    }

    adsText.value = await file.text();
    adsStatus.textContent = "Arquivo carregado";
  } catch (error) {
    adsStatus.textContent = "Falha ao ler arquivo";
    adsPreviewBox.textContent = `Falha: ${error.message}`;
  }
}

function renderAdsPreview(data) {
  const groups = data.groups || [];
  const entries = data.entries || [];
  adsGroupSelect.innerHTML = "";
  adsBatchList.innerHTML = "";

  if (data.match?.remoteJid) {
    adsGroupSelect.appendChild(new Option(`${data.match.name} (${data.match.score})`, data.match.remoteJid));
  }

  for (const group of groups) {
    if (group.remoteJid === data.match?.remoteJid) continue;
    adsGroupSelect.appendChild(new Option(group.name, group.remoteJid));
  }

  adsPreviewBox.textContent = entries.length > 1
    ? `${entries.length} envios encontrados. Confira a lista abaixo.`
    : data.message || "Sem mensagem.";

  if (entries.length > 1) {
    adsBatchList.innerHTML = entries.map((entry, index) => renderAdsBatchItem(entry, groups, index)).join("");
    adsSendButton.disabled = !entries.some((entry) => entry.match?.remoteJid);
  } else {
    adsBatchList.innerHTML = `
      <article class="adsBatchItem">
        <label>Aguardando multiplos envios</label>
        <pre>Quando a previa encontrar mais de um lancamento, a fila aparece aqui.</pre>
      </article>
    `;
  }
}

function renderAdsBatchItem(entry, groups, index) {
  const options = ['<option value="">Selecione um grupo</option>'];
  if (entry.match?.remoteJid) {
    options.push(`<option value="${escapeHtml(entry.match.remoteJid)}" selected>${escapeHtml(entry.match.name)} (${entry.match.score})</option>`);
  }

  for (const group of groups) {
    if (group.remoteJid === entry.match?.remoteJid) continue;
    options.push(`<option value="${escapeHtml(group.remoteJid)}">${escapeHtml(group.name)}</option>`);
  }

  return `
    <article class="adsBatchItem" data-index="${index}">
      <label>${escapeHtml(entry.parsed?.label || `ADS ${index + 1}`)}</label>
      <select class="adsBatchGroup">${options.join("")}</select>
      <pre>${escapeHtml(entry.message || "")}</pre>
    </article>
  `;
}

async function sendAds() {
  const text = adsText.value.trim();
  const selected = adsGroupSelect.options[adsGroupSelect.selectedIndex];
  const entries = collectAdsEntries();
  if (!text || (!selected?.value && !entries.length)) return;

  const selectedEntries = entries.filter((entry) => !entry.skip);
  if (entries.length && !selectedEntries.length) {
    adsStatus.textContent = "Escolha pelo menos um grupo";
    return;
  }

  const payloadEntries = entries.length
    ? entries
    : [{ groupJid: selected.value, groupName: selected.text.replace(/\s+\(\d+\)$/, "") }];
  const confirmed = await showSendReview(payloadEntries);
  if (!confirmed) return;

  adsSendButton.disabled = true;
  adsStatus.textContent = "Enviando...";

  try {
    const payload = {
      text,
      entries: payloadEntries,
    };
    const result = await sendAdsWithProgress(payload);
    adsStatus.textContent = "Enviado";
    adsPreviewBox.textContent = `Enviado(s): ${result.sent?.length || 0}`;
    if (!result.sent?.length) {
      adsStatus.textContent = "Nada enviado";
      adsPreviewBox.textContent = "Nenhum lancamento ADS valido foi encontrado para envio.";
    }
    loadSummary();
  } catch (error) {
    adsStatus.textContent = "Falha no envio";
    const hint = error.message === "HTTP 409"
      ? "WhatsApp desconectado. Clique em Conectar WhatsApp e leia o QR novamente."
      : error.message === "HTTP 400"
        ? "Confira se o texto comeca com ADS e se a previa foi gerada."
        : error.message;
    adsPreviewBox.textContent = `Falha: ${hint}\n\n${adsPreviewBox.textContent}`;
  } finally {
    adsSendButton.disabled = false;
  }
}

function showSendReview(payloadEntries) {
  const summary = buildSendReviewSummary(payloadEntries);
  renderSendReview(summary);
  reviewOverlay.hidden = false;

  return new Promise((resolve) => {
    pendingReviewResolve = resolve;
  });
}

function resolveReview(value) {
  reviewOverlay.hidden = true;
  if (pendingReviewResolve) pendingReviewResolve(value);
  pendingReviewResolve = null;
}

function buildSendReviewSummary(payloadEntries) {
  const previewEntries = adsPreview?.entries || [];
  const selected = payloadEntries
    .map((entry, index) => ({ override: entry, preview: previewEntries[index] }))
    .filter((item) => !item.override?.skip);
  const campaignItems = [];

  for (const item of selected) {
    const parsed = item.preview?.parsed || {};
    if (Array.isArray(item.preview?.items) && item.preview.items.length) {
      for (const child of item.preview.items) {
        campaignItems.push({ parsed: child, parent: parsed, theBest: child.theBest || null });
      }
    } else {
      campaignItems.push({ parsed, parent: null, theBest: item.preview?.theBest || null });
    }
  }

  const totalRaw = campaignItems.reduce((sum, item) => sum + Number(item.parsed.rawValue || 0), 0);
  const totalTaxed = campaignItems.reduce((sum, item) => sum + Number(item.parsed.taxedValue || 0), 0);
  const jrGroups = selected.filter((item) => Array.isArray(item.preview?.items) && item.preview.items.length).length;
  const zeroValue = campaignItems.filter((item) => Number(item.parsed.rawValue || 0) <= 0);
  const missingGroups = selected.filter((item) => !item.override?.groupJid);
  const missingTheBest = campaignItems.filter((item) => !item.theBest?.login);

  return {
    selected,
    campaignItems,
    totalRaw,
    totalTaxed,
    sendCount: selected.length,
    campaignCount: campaignItems.length,
    jrGroups,
    zeroValue,
    missingGroups,
    missingTheBest,
  };
}

function renderSendReview(summary) {
  reviewStats.innerHTML = [
    renderReviewStat("Envios", summary.sendCount),
    renderReviewStat("Campanhas", summary.campaignCount),
    renderReviewStat("JR", summary.jrGroups),
    renderReviewStat("Sem grupo", summary.missingGroups.length),
    renderReviewStat("Sem The Best", summary.missingTheBest.length),
    renderReviewStat("Valor zerado", summary.zeroValue.length),
  ].join("");

  reviewTotals.innerHTML = `
    <article>
      <span>Total bruto</span>
      <strong>${formatCurrency(summary.totalRaw)}</strong>
    </article>
    <article>
      <span>Total com imposto</span>
      <strong>${formatCurrency(summary.totalTaxed)}</strong>
    </article>
  `;

  const warnings = [];
  if (summary.missingGroups.length) {
    warnings.push(`Sem grupo: ${summary.missingGroups.map((item) => item.preview?.parsed?.label || "ADS").join(", ")}`);
  }
  if (summary.missingTheBest.length) {
    warnings.push(`Sem The Best: ${summary.missingTheBest.map((item) => item.parsed.label || "ADS").join(", ")}`);
  }
  if (summary.zeroValue.length) {
    warnings.push(`Valor zerado: ${summary.zeroValue.map((item) => item.parsed.label || "ADS").join(", ")}`);
  }

  reviewWarnings.innerHTML = warnings.length
    ? warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")
    : "<p>Tudo pronto para enviar.</p>";
  reviewConfirmButton.disabled = summary.sendCount <= 0 || summary.missingGroups.length > 0 || summary.zeroValue.length > 0;
}

function renderReviewStat(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${Number(value || 0).toLocaleString("pt-BR")}</strong>
    </article>
  `;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

async function sendAdsWithProgress(payload) {
  showSendProgress({
    status: "queued",
    total: payload.entries?.filter((entry) => !entry.skip).length || 1,
    sentCount: 0,
    remainingCount: payload.entries?.filter((entry) => !entry.skip).length || 1,
    currentLabel: "",
    currentGroup: "",
  });

  const started = await api("ads/send-jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });

  return new Promise((resolve, reject) => {
    const token = encodeURIComponent(localStorage.getItem("uiAdminToken") || "");
    const events = new EventSource(`/api/ads/send-jobs/${encodeURIComponent(started.jobId)}/events?token=${token}`);
    events.onmessage = (event) => {
      const data = JSON.parse(event.data);
      showSendProgress(data);
      if (data.status === "done" || data.status === "partial") {
        events.close();
        resolve({ sent: data.sent || [], missing: data.missing || [] });
      }
      if (data.status === "failed") {
        events.close();
        reject(new Error(data.error || "Falha no envio"));
      }
    };
    events.onerror = () => {
      events.close();
      reject(new Error("Falha ao acompanhar o progresso do envio"));
    };
  });
}

function showSendProgress(data) {
  const total = Number(data.total || 0);
  const sent = Number(data.sentCount || 0);
  const remaining = Number(data.remainingCount ?? Math.max(total - sent, 0));
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
  const statusText = {
    queued: "Preparando envio",
    running: "Enviando mensagens",
    done: "Envio concluido",
    partial: "Envio concluido com pendencias",
    failed: "Falha no envio",
  }[data.status] || "Enviando mensagens";

  sendProgressOverlay.hidden = false;
  sendProgressTitle.textContent = statusText;
  sendProgressPercent.textContent = `${percent}%`;
  sendProgressBarFill.style.width = `${percent}%`;
  sendProgressSent.textContent = sent;
  sendProgressRemaining.textContent = remaining;
  sendProgressTotal.textContent = total;
  sendProgressClose.hidden = !["done", "partial", "failed"].includes(data.status);

  if (data.status === "failed") {
    sendProgressCurrent.textContent = data.error || "Nao foi possivel concluir o envio.";
  } else if (data.status === "done") {
    sendProgressCurrent.textContent = "Todas as mensagens selecionadas foram enviadas.";
  } else if (data.status === "partial") {
    sendProgressCurrent.textContent = `${data.missingCount || 0} mensagem(ns) ficaram sem grupo encontrado.`;
  } else if (data.currentLabel || data.currentGroup) {
    sendProgressCurrent.textContent = `Atual: ${data.currentLabel || "-"} -> ${data.currentGroup || "-"}`;
  } else {
    sendProgressCurrent.textContent = "Preparando fila de envio...";
  }
}

function collectAdsEntries() {
  return [...adsBatchList.querySelectorAll(".adsBatchItem")].map((item) => {
    const select = item.querySelector(".adsBatchGroup");
    const selected = select.options[select.selectedIndex];
    if (!selected.value) return { skip: true };
    return {
      groupJid: selected.value,
      groupName: selected.text.replace(/\s+\(\d+\)$/, ""),
    };
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDecimalNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: Number(value || 0) % 1 ? 1 : 0,
    maximumFractionDigits: 2,
  });
}

function initTheme() {
  const saved = localStorage.getItem("adsPanelTheme") || "light";
  document.documentElement.dataset.theme = saved;
  themeToggle.textContent = saved === "dark" ? "Claro" : "Escuro";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("adsPanelTheme", next);
  themeToggle.textContent = next === "dark" ? "Claro" : "Escuro";
}

function savePixDefault() {
  localStorage.setItem("adsPixDefault", adsPixDefault.value.trim());
  adsStatus.textContent = "Pix padrao salvo";
}

function updateActiveNav() {
  const activeHash = window.location.hash || "#ads";
  navItems.forEach((item) => {
    item.classList.toggle("active", item.getAttribute("href") === activeHash);
  });
}

loadSummary();
loadAdsGroups();
