// Options page: floating-popup toggle, online NLM enhancement, and the opt-in
// LLM query-expansion config (local OpenAI-compatible endpoint, or a cloud
// provider). Host permissions for user-entered endpoints are requested at
// save/load time. The LLM API key is stored in storage.local (not synced).

import {
  listModels,
  CLOUD_PROVIDERS,
  LLM_DEFAULTS,
  type LlmConfig,
  type CloudProvider,
} from '../background/llm';

const NLM_ORIGIN = 'https://clinicaltables.nlm.nih.gov/*';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const autoPopup = $<HTMLInputElement>('autoPopup');
const onlineEnhance = $<HTMLInputElement>('onlineEnhance');
const statusEl = $<HTMLParagraphElement>('status');

const llmEnabled = $<HTMLInputElement>('llmEnabled');
const llmFields = $<HTMLDivElement>('llmFields');
const localFields = $<HTMLDivElement>('localFields');
const cloudFields = $<HTMLDivElement>('cloudFields');
const localEndpoint = $<HTMLInputElement>('localEndpoint');
const localModel = $<HTMLSelectElement>('localModel');
const cloudProvider = $<HTMLSelectElement>('cloudProvider');
const customEndpointRow = $<HTMLDivElement>('customEndpointRow');
const cloudEndpoint = $<HTMLInputElement>('cloudEndpoint');
const cloudModel = $<HTMLSelectElement>('cloudModel');
const cloudKey = $<HTMLInputElement>('cloudKey');

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function modeRadios(): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll<HTMLInputElement>('input[name="llmMode"]');
}

function selectedMode(): 'local' | 'cloud' {
  const checked = [...modeRadios()].find((r) => r.checked);
  return checked?.value === 'local' ? 'local' : 'cloud';
}

function fillSelect(select: HTMLSelectElement, models: string[], selected: string): void {
  const options = [...new Set([selected, ...models].filter(Boolean))];
  select.innerHTML = '';
  for (const m of options) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === selected) opt.selected = true;
    select.append(opt);
  }
}

function syncVisibility(): void {
  llmFields.style.display = llmEnabled.checked ? 'block' : 'none';
  const mode = selectedMode();
  localFields.style.display = mode === 'local' ? 'block' : 'none';
  cloudFields.style.display = mode === 'cloud' ? 'block' : 'none';
  customEndpointRow.style.display = cloudProvider.value === 'custom' ? 'block' : 'none';
}

function readForm(): LlmConfig {
  return {
    enabled: llmEnabled.checked,
    mode: selectedMode(),
    local: { endpoint: localEndpoint.value.trim(), model: localModel.value },
    cloud: {
      provider: cloudProvider.value as CloudProvider,
      endpoint: cloudEndpoint.value.trim(),
      model: cloudModel.value,
      apiKey: cloudKey.value,
    },
  };
}

/** Host-permission match pattern for the endpoint the current config will hit. */
function originPattern(cfg: LlmConfig): string | null {
  try {
    if (cfg.mode === 'local') return `${new URL(cfg.local.endpoint).origin}/*`;
    if (cfg.cloud.provider === 'custom') return `${new URL(cfg.cloud.endpoint).origin}/*`;
    return `${new URL(CLOUD_PROVIDERS[cfg.cloud.provider].base).origin}/*`;
  } catch {
    return null;
  }
}

async function ensurePermission(cfg: LlmConfig): Promise<boolean> {
  const pattern = originPattern(cfg);
  if (!pattern) {
    setStatus('端點網址無效。');
    return false;
  }
  return chrome.permissions.request({ origins: [pattern] });
}

async function init(): Promise<void> {
  const sync = await chrome.storage.sync.get({ autoPopup: true, onlineEnhance: false });
  autoPopup.checked = sync.autoPopup;
  onlineEnhance.checked = sync.onlineEnhance;

  const { llm } = await chrome.storage.local.get({ llm: LLM_DEFAULTS });
  const cfg = llm as LlmConfig;
  llmEnabled.checked = cfg.enabled;
  [...modeRadios()].forEach((r) => (r.checked = r.value === cfg.mode));
  localEndpoint.value = cfg.local.endpoint || LLM_DEFAULTS.local.endpoint;
  cloudProvider.value = cfg.cloud.provider;
  cloudEndpoint.value = cfg.cloud.endpoint;
  cloudKey.value = cfg.cloud.apiKey;
  fillSelect(localModel, [], cfg.local.model);
  fillSelect(cloudModel, CLOUD_PROVIDERS[cfg.cloud.provider].models, cfg.cloud.model);
  syncVisibility();
}

autoPopup.addEventListener('change', async () => {
  await chrome.storage.sync.set({ autoPopup: autoPopup.checked });
  setStatus(
    autoPopup.checked ? '已開啟懸浮視窗。' : '已關閉懸浮視窗 —— 請改用右鍵選單「查 ICD-10」查詢。',
  );
});

onlineEnhance.addEventListener('change', async () => {
  if (onlineEnhance.checked) {
    const granted = await chrome.permissions.request({ origins: [NLM_ORIGIN] });
    if (!granted) {
      onlineEnhance.checked = false;
      setStatus('權限被拒 —— 線上增強維持關閉。');
      return;
    }
  }
  await chrome.storage.sync.set({ onlineEnhance: onlineEnhance.checked });
  setStatus(onlineEnhance.checked ? '已開啟線上增強。' : '僅離線。');
});

llmEnabled.addEventListener('change', syncVisibility);
modeRadios().forEach((r) => r.addEventListener('change', syncVisibility));
cloudProvider.addEventListener('change', () => {
  fillSelect(cloudModel, CLOUD_PROVIDERS[cloudProvider.value as CloudProvider].models, '');
  syncVisibility();
});

async function loadModelsInto(select: HTMLSelectElement): Promise<void> {
  const cfg = readForm();
  if (!(await ensurePermission(cfg))) {
    setStatus('需要存取該端點的權限才能載入模型。');
    return;
  }
  setStatus('載入模型中…');
  try {
    const models = await listModels(cfg);
    fillSelect(select, models, select.value);
    setStatus(`載入了 ${models.length} 個模型。`);
  } catch (err) {
    setStatus(`載入模型失敗:${String(err)}`);
  }
}

$<HTMLButtonElement>('loadLocalModels').addEventListener('click', () => loadModelsInto(localModel));
$<HTMLButtonElement>('loadCloudModels').addEventListener('click', () => loadModelsInto(cloudModel));

$<HTMLButtonElement>('saveLlm').addEventListener('click', async () => {
  const cfg = readForm();
  if (cfg.enabled) {
    if (!(await ensurePermission(cfg))) {
      setStatus('需要存取該端點的權限才能啟用。設定未儲存。');
      return;
    }
  }
  await chrome.storage.local.set({ llm: cfg });
  setStatus(cfg.enabled ? 'LLM 設定已儲存並啟用。' : 'LLM 設定已儲存(目前關閉)。');
});

void init();
