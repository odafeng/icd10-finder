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
    autoPopup.checked
      ? 'Floating popup on.'
      : 'Floating popup off — use right-click → "Find ICD-10 for …".',
  );
});

checkbox.addEventListener('change', async () => {
  if (checkbox.checked) {
    const granted = await chrome.permissions.request({ origins: [NLM_ORIGIN] });
    if (!granted) {
      checkbox.checked = false;
      setStatus('Permission denied — online enhancement stays off.');
      return;
    }
  }
  await chrome.storage.sync.set({ onlineEnhance: checkbox.checked });
  setStatus(checkbox.checked ? 'Online enhancement on.' : 'Offline only.');
});

void init();
