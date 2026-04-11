async function triggerSync() {
  const btn = document.querySelector('nav .btn-primary');
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  try {
    await fetch('/api/sync/trigger', { method: 'POST' });
    setTimeout(() => { window.location.reload(); }, 3000);
  } catch (e) {
    if (btn) { btn.textContent = 'Sync Now'; btn.disabled = false; }
  }
}

async function openCorrect(id, currentLabel, currentCategory) {
  const label = prompt('New label (expense, income, ignore):', currentLabel);
  if (!label) return;
  const category = prompt('Category (leave blank to keep current):', currentCategory) || currentCategory;
  await fetch('/api/transactions/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, category })
  });
  window.location.reload();
}
