import { api } from './api';
import { fetchCurrentUser, isStaffUser, loginUser } from './userAuth';

export async function restoreAdminSession() {
    const user = await fetchCurrentUser();
    return isStaffUser(user) ? user : null;
}

export async function loginAdminAccount(username, password) {
    const user = await loginUser(username, password);
    if (!isStaffUser(user)) {
        throw new Error('该账号无权进入管理端（需要管理员或培训师）');
    }
    return user;
}

export async function loginAdminPin(pin) {
    const data = await api.post('/api/admin/login', { pin });
    if (data.user) {
        sessionStorage.setItem('safespot_user', JSON.stringify(data.user));
    }
    return data.user;
}

export function isAdminAuthed() {
    try {
        const raw = sessionStorage.getItem('safespot_user');
        const user = raw ? JSON.parse(raw) : null;
        return isStaffUser(user);
    } catch {
        return false;
    }
}
