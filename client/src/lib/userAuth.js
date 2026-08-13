import { api } from './api';

const USER_KEY = 'safespot_user';

export function getLoggedInUser() {
    try {
        const raw = sessionStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function setLoggedInUser(user) {
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_KEY);
}

export function clearLoggedInUser() {
    sessionStorage.removeItem(USER_KEY);
}

export async function fetchCurrentUser() {
    const data = await api.get('/api/auth/me');
    const user = data.user || null;
    setLoggedInUser(user);
    return user;
}

export async function loginUser(username, password) {
    const data = await api.post('/api/auth/login', { username, password });
    setLoggedInUser(data.user);
    return data.user;
}

export async function logoutUser() {
    try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
    clearLoggedInUser();
}

export function isStaffUser(user) {
    return !!user && (user.role === 'admin' || user.role === 'trainer');
}
