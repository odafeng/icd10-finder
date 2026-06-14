// Options page: toggles the online NLM enhancement and requests the matching
// host permission only when the user turns it on (offline-first).

const NLM_ORIGIN = 'https://clinicaltables.nlm.nih.gov/*';
const checkbox = document.getElementById('onlineEnhance') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function init(): Promise<void> {
  const { onlineEnhance } = await chrome.storage.sync.get({ onlineEnhance: false });
  checkbox.checked = onlineEnhance;
}

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
