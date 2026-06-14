// Options page: toggles the floating popup and the online NLM enhancement
// (the latter requests its host permission only when turned on; offline-first).

const NLM_ORIGIN = 'https://clinicaltables.nlm.nih.gov/*';
const autoPopup = document.getElementById('autoPopup') as HTMLInputElement;
const checkbox = document.getElementById('onlineEnhance') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function init(): Promise<void> {
  const { autoPopup: ap, onlineEnhance } = await chrome.storage.sync.get({
    autoPopup: true,
    onlineEnhance: false,
  });
  autoPopup.checked = ap;
  checkbox.checked = onlineEnhance;
}

autoPopup.addEventListener('change', async () => {
  await chrome.storage.sync.set({ autoPopup: autoPopup.checked });
  setStatus(
    autoPopup.checked ? '已開啟懸浮視窗。' : '已關閉懸浮視窗 —— 請改用右鍵選單「查 ICD-10」查詢。',
  );
});

checkbox.addEventListener('change', async () => {
  if (checkbox.checked) {
    const granted = await chrome.permissions.request({ origins: [NLM_ORIGIN] });
    if (!granted) {
      checkbox.checked = false;
      setStatus('權限被拒 —— 線上增強維持關閉。');
      return;
    }
  }
  await chrome.storage.sync.set({ onlineEnhance: checkbox.checked });
  setStatus(checkbox.checked ? '已開啟線上增強。' : '僅離線。');
});

void init();
