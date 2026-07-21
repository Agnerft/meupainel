const tokenInput = document.querySelector("#adminToken");
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
const themeToggle = document.querySelector("#themeToggle");
const adsPixDefault = document.querySelector("#adsPixDefault");
const savePixButton = document.querySelector("#savePixButton");
const sendProgressOverlay = document.querySelector("#sendProgressOverlay");
const sendProgressTitle = document.querySelector("#sendProgressTitle");
const sendProgressPercent = document.querySelector("#sendProgressPercent");
const sendProgressBarFill = document.querySelector("#sendProgressBarFill");
const sendProgressSent = document.querySelector("#sendProgressSent");
const sendProgressRemaining = document.querySelector("#sendProgressRemaining");
const sendProgressTotal = document.querySelector("#sendProgressTotal");
const sendProgressCurrent = document.querySelector("#sendProgressCurrent");
const sendProgressClose = document.querySelector("#sendProgressClose");
const navItems = [...document.querySelectorAll(".navItem[href^='#']")];

let adsPreview = null;

const metrics = {
  total: document.querySelector("#metricTotal"),
  inbound: document.querySelector("#metricInbound"),
  outbound: document.querySelector("#metricOutbound"),
  contacts: document.querySelector("#metricContacts"),
};

tokenInput.value = localStorage.getItem("uiAdminToken") || "";
adsPixDefault.value = localStorage.getItem("adsPixDefault") || "";

saveTokenButton.addEventListener("click", () => {
  localStorage.setItem("uiAdminToken", tokenInput.value.trim());
  loadSummary();
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
themeToggle.addEventListener("click", toggleTheme);
savePixButton.addEventListener("click", savePixDefault);
sendProgressClose.addEventListener("click", () => {
  sendProgressOverlay.hidden = true;
});
adsPixDefault.addEventListener("input", () => {
  localStorage.setItem("adsPixDefault", adsPixDefault.value.trim());
});
window.addEventListener("hashchange", updateActiveNav);

initTheme();
updateActiveNav();

async function api(path, options = {}) {
  const token = localStorage.getItem("uiAdminToken") || tokenInput.value.trim();
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

async function loadSummary() {
  try {
    const data = await api("summary");
    renderMetrics(data.totals || {});
    renderServices(data.services || {});
    renderMessages(data.recentMessages || []);
    lastUpdate.textContent = new Date().toLocaleString("pt-BR");
  } catch (error) {
    lastUpdate.textContent = "Falha ao carregar";
    statusStrip.innerHTML = `<div class="statusItem"><span>Painel</span><strong class="fail">${escapeHtml(error.message)}</strong></div>`;
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

  const total = entries.length ? selectedEntries.length : 1;
  const confirmed = window.confirm(`Enviar ${total} lancamento(s) ADS para os grupos selecionados?`);
  if (!confirmed) return;

  adsSendButton.disabled = true;
  adsStatus.textContent = "Enviando...";

  try {
    const payload = {
      text,
      entries: entries.length
        ? entries
        : [{ groupJid: selected.value, groupName: selected.text.replace(/\s+\(\d+\)$/, "") }],
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
    const token = encodeURIComponent(localStorage.getItem("uiAdminToken") || tokenInput.value.trim());
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
