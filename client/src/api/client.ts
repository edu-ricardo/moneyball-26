const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export async function fetchImports() {
  const res = await fetch(`${API_URL}/imports`);
  if (!res.ok) throw new Error('Failed to fetch imports');
  return res.json();
}

export async function fetchPlayers(importId: number, page: number = 1, limit: number = 50, sortBy: string = 'id', sortOrder: string = 'ASC', filters: any[] = []) {
  const query = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sortBy,
    sortOrder,
    filters: JSON.stringify(filters)
  }).toString();
  
  const res = await fetch(`${API_URL}/players/${importId}?${query}`);
  if (!res.ok) throw new Error('Failed to fetch players');
  return res.json();
}

export async function fetchScatterData(importId: number, filters: any[] = []) {
  const query = new URLSearchParams({
    filters: JSON.stringify(filters)
  }).toString();
  
  const res = await fetch(`${API_URL}/players/${importId}/scatter?${query}`);
  if (!res.ok) throw new Error('Failed to fetch scatter data');
  return res.json();
}

export async function createCalculatedField(importId: number, fieldName: string, formula: string) {
  const res = await fetch(`${API_URL}/imports/${importId}/calculated-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldName, formula })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create calculated field');
  }
  return res.json();
}

export async function deleteCalculatedField(importId: number, fieldName: string) {
  const res = await fetch(`${API_URL}/imports/${importId}/columns/${encodeURIComponent(fieldName)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete field');
  }
  return res.json();
}

export async function createImport(payload: any) {
  const res = await fetch(`${API_URL}/imports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}...`);
  }

  if (!res.ok) throw new Error(data.error || 'Failed to create import');
  return data;
}

export async function deleteImport(importId: number) {
  const res = await fetch(`${API_URL}/imports/${importId}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete import');
  return data;
}
