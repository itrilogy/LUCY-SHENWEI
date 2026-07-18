const STORAGE_KEY = 'safespot_admin_token';

export function isAdminAuthed() {
    return sessionStorage.getItem(STORAGE_KEY) === 'local-admin';
}

export function setAdminAuthed(token) {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
}

export function clearAdminAuth() {
    sessionStorage.removeItem(STORAGE_KEY);
}

export async function loginAdmin(pin) {
    const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || '口令验证失败');
    }
    setAdminAuthed(data.token || 'local-admin');
    return data;
}
