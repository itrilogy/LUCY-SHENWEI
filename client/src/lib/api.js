async function parseBody(res) {
    const text = await res.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text };
    }
}

export async function apiFetch(path, options = {}) {
    const { headers, body, ...rest } = options;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const isString = typeof body === 'string';

    const finalHeaders = { ...headers };
    if (body && !isFormData && !finalHeaders['Content-Type']) {
        finalHeaders['Content-Type'] = 'application/json';
    }

    const finalBody = body && !isFormData && !isString ? JSON.stringify(body) : body;

    const res = await fetch(path, {
        credentials: 'include',
        ...rest,
        body: finalBody,
        headers: finalHeaders
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
    get: (path, options) => apiFetch(path, { method: 'GET', ...options }),
    post: (path, body, options) => apiFetch(path, { method: 'POST', body, ...options }),
    put: (path, body, options) => apiFetch(path, { method: 'PUT', body, ...options }),
    del: (path, options) => apiFetch(path, { method: 'DELETE', ...options }),
    upload: (path, formData, options) => apiFetch(path, { method: 'POST', body: formData, ...options })
};
