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

export async function loginUser(username, password) {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '登录失败');
    setLoggedInUser(data.user);
    return data.user;
}
