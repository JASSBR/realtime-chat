const API_BASE = '/api';

async function fetchItems() {
  const res = await fetch(`${API_BASE}/items`);
  return res.json();
}

async function createItem(data) {
  const res = await fetch(`${API_BASE}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function deleteItem(id) {
  await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('App initialized');
  const items = await fetchItems();
  console.log('Items:', items);
});
