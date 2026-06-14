// Optional LLM "query expansion": before searching, ask an LLM to turn a
// colloquial/lay disease name into formal ICD-10 terminology, then search those
// too. Opt-in, OFF by default — the hospital deployment runs fully offline
// (keyword + vector) unless a user explicitly configures and enables this.
//
// Two modes, both just HTTP — nothing is bundled, nothing assumes a specific
// machine has a model:
//   - local: an OpenAI-compatible endpoint on that machine (e.g. Ollama). Only
//     works where such a server is installed; a stock hospital PC has none.
//   - cloud: OpenAI / Anthropic / a custom OpenAI-compatible API. Needs network
//     egress and sends the highlighted text off-device (patient-data caveat).

export type LlmMode = 'local' | 'cloud';
export type CloudProvider = 'openai' | 'anthropic' | 'custom';

export interface LlmConfig {
  enabled: boolean;
  mode: LlmMode;
  local: { endpoint: string; model: string };
  cloud: { provider: CloudProvider; endpoint: string; model: string; apiKey: string };
}

export const LLM_DEFAULTS: LlmConfig = {
  enabled: false,
  mode: 'cloud',
  // No preset model — discover via "load models" so we never assume a given
  // machine has a particular local model installed.
  local: { endpoint: 'http://localhost:11434/v1', model: '' },
  cloud: { provider: 'anthropic', endpoint: '', model: '', apiKey: '' },
};

// Curated fallback lists (the live /models fetch is the source of truth and
// keeps these current). Anthropic IDs verified via the claude-api reference.
export const CLOUD_PROVIDERS: Record<
  CloudProvider,
  { label: string; base: string; models: string[] }
> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    base: 'https://api.anthropic.com/v1',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  },
  openai: {
    label: 'OpenAI',
    base: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  custom: { label: '自訂 (OpenAI 相容)', base: '', models: [] },
};

function expansionPrompt(query: string): string {
  return (
    '你是醫療編碼助手。使用者輸入一個可能是口語、俗稱或縮寫的病名/症狀。' +
    '請輸出最多 3 個對應的「正式英文 ICD-10 診斷用語」,用半形逗號分隔。' +
    '只輸出這些詞本身,不要編號、不要解釋、不要任何其他文字。\n輸入:' +
    query
  );
}

function baseFor(cfg: LlmConfig): string {
  if (cfg.mode === 'local') return cfg.local.endpoint.replace(/\/$/, '');
  if (cfg.cloud.provider === 'custom') return cfg.cloud.endpoint.replace(/\/$/, '');
  return CLOUD_PROVIDERS[cfg.cloud.provider].base;
}

function isAnthropic(cfg: LlmConfig): boolean {
  return cfg.mode === 'cloud' && cfg.cloud.provider === 'anthropic';
}

function parseTerms(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 60)
    .slice(0, 3);
}

/** Fetch the live model list from the provider (the "stays current" mechanism). */
export async function listModels(cfg: LlmConfig): Promise<string[]> {
  const base = baseFor(cfg);
  if (!base) return [];
  if (isAnthropic(cfg)) {
    const res = await fetch(`${base}/models`, {
      headers: {
        'x-api-key': cfg.cloud.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string }) => m.id);
  }
  // OpenAI-compatible (OpenAI / custom / local Ollama)
  const key = cfg.mode === 'cloud' ? cfg.cloud.apiKey : '';
  const res = await fetch(`${base}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((m: { id: string }) => m.id);
}

/** Expand a lay query into formal ICD-10 terms via the configured LLM. */
export async function expandQuery(query: string, cfg: LlmConfig): Promise<string[]> {
  if (!cfg.enabled) return [];
  const base = baseFor(cfg);
  const model = cfg.mode === 'local' ? cfg.local.model : cfg.cloud.model;
  if (!base || !model) return [];
  const prompt = expansionPrompt(query);

  if (isAnthropic(cfg)) {
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.cloud.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      // No temperature: newest Claude models reject sampling params.
      body: JSON.stringify({
        model,
        max_tokens: 64,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === 'text')?.text ?? '';
    return parseTerms(text);
  }

  // OpenAI-compatible chat completions (OpenAI / custom / local Ollama)
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.mode === 'cloud' && cfg.cloud.apiKey)
    headers.Authorization = `Bearer ${cfg.cloud.apiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 64,
      temperature: 0,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = await res.json();
  return parseTerms(data?.choices?.[0]?.message?.content ?? '');
}
