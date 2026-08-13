async function parseBody(res) {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { error: text }; }
}

export async function apiFetch(path, options = {}) {
    const { headers, ...rest } = options;
    const res = await fetch(path, {
        credentials: 'include',
        ...rest,
        headers: {
            ...(rest.body && !(rest.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
            ...headers
        }
    });
    const data = await parseBody(res);
    if (!res.ok) {
        const err = new Error(data.error || `请求失败 (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    get: (path) => apiFetch(path),
    post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body || {}) }),
    put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
    del: (path) => apiFetch(path, { method: 'DELETE' }),
    upload: (path, formData) => apiFetch(path, { method: 'POST', body: formData })
};
