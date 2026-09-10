import { API_BASE_URL } from "../config.js";
import { getToken, getSigningKey, setToken, setSigningKey, clearSession } from "../lib/session.js";
import { startProgress, completeProgress } from "../components/pageLoader.js";

const requestTimestamps = [];
const MIN_REQUEST_INTERVAL = 300;
let refreshTimer = null;

export class RateLimitError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

let requestQueue = 0;
const MAX_CONCURRENT = 20;
const queueWaiters = [];
function enqueueRequest(isPriority = false) {
    return new Promise(resolve => {
        // Priority tasks (AI, Chatbot, Explain) execute immediately without blocking
        if (isPriority) {
            requestQueue++;
            resolve();
            return;
        }
        if (requestQueue < MAX_CONCURRENT) {
            requestQueue++;
            resolve();
            return;
        }
        queueWaiters.push(resolve);
    });
}
function releaseRequest() {
    requestQueue--;
    const next = queueWaiters.shift();
    if (next) {
        requestQueue++;
        next();
    }
}

export function deepNormalizeNFC(val) {
    if (typeof val === "string") return val.normalize("NFC");
    if (Array.isArray(val)) return val.map(deepNormalizeNFC);
    if (val !== null && typeof val === "object") {
        if (val instanceof Date || val instanceof Blob || (typeof FormData !== "undefined" && val instanceof FormData)) return val;
        const res = {};
        for (const k in val) {
            if (Object.prototype.hasOwnProperty.call(val, k)) {
                res[k] = deepNormalizeNFC(val[k]);
            }
        }
        return res;
    }
    return val;
}

const MAX_BURST_REQUESTS = 30;
const MAX_RATE_LIMIT_WAIT_MS = 10000;

async function checkRateLimit() {
    const startWait = Date.now();
    while (true) {
        const now = Date.now();
        while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - 1000) {
            requestTimestamps.shift();
        }
        if (requestTimestamps.length < MAX_BURST_REQUESTS) {
            requestTimestamps.push(now);
            return;
        }
        if (now - startWait > MAX_RATE_LIMIT_WAIT_MS) {
            throw new RateLimitError(429, "Too many requests. Please slow down.");
        }
        const oldest = requestTimestamps[0];
        const waitMs = Math.max(25, 1000 - (now - oldest) + 10);
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}

async function sha256(message) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(message));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function computeSignature(signingKey, method, path, bodyStr, timestamp, nonce) {
    const bodyHash = await sha256(bodyStr || "");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", enc.encode(signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false, ["sign"]
    );
    const msg = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const token = getToken();
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        if (expiresIn <= 0) {
            refreshTokens().then(scheduleRefresh).catch((err) => {
                if (err && err.status === 401) {
                    clearSession();
                    window.location.href = "/login.html";
                }
            });
            return;
        }
        const refreshAt = Math.max(expiresIn - 120000, 5000);
        refreshTimer = setTimeout(async () => {
            try {
                await refreshTokens();
                scheduleRefresh();
            } catch (err) {
                if (err && err.status === 401) {
                    clearSession();
                    window.location.href = "/login.html";
                } else {
                    // Retry in 15s on network disconnect / sleep wake-up without destroying session
                    refreshTimer = setTimeout(scheduleRefresh, 15000);
                }
            }
        }, refreshAt);
    } catch {
        // invalid token format, ignore
    }
}

let refreshPromise = null;

async function refreshTokens() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        try {
            let resp;
            try {
                resp = await fetch(`${API_BASE_URL}/auth/refresh`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                });
            } catch (netErr) {
                throw new ApiError(0, netErr && netErr.message ? netErr.message : "Network error during refresh");
            }
            if (!resp.ok) {
                throw new ApiError(resp.status, "Refresh failed");
            }
            const data = await resp.json();
            if (!data || !data.token) {
                throw new ApiError(500, "Invalid token response");
            }
            setToken(data.token);
            if (data.signingKey) {
                setSigningKey(data.signingKey);
            }
            return data;
        } finally {
            refreshPromise = null;
        }
    })();
    return refreshPromise;
}

export async function ensureSession() {
    const token = getToken();
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.exp * 1000 - Date.now() < 180000) {
            await refreshTokens();
        }
        scheduleRefresh();
        return true;
    } catch (err) {
        if (err && err.status === 401) {
            clearSession();
            return false;
        }
        return true;
    }
}

if (typeof window !== "undefined" && getToken()) {
    scheduleRefresh();
}

async function request(endpoint, options = {}) {
    await ensureSession();
    await checkRateLimit();

    const isAiEndpoint = /^\/(chatbot|recommendations|roadmap\/generate|profile\/generate|survey\/submit)/.test(endpoint);
    const isPriority = options.priority === true || isAiEndpoint;

    await enqueueRequest(isPriority);

    const token = getToken();
    const signingKey = getSigningKey();
    const headers = { ...options.headers };
    const method = options.method || "GET";
    const isFormData = options.body instanceof FormData;

    if (!isFormData) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (token && signingKey) {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomUUID();
        const bodyStr = typeof options.body === "string" ? options.body : "";
        const pathOnly = endpoint.split('?')[0];
        const signature = await computeSignature(signingKey, method, pathOnly, bodyStr, timestamp, nonce);
        headers["X-Timestamp"] = timestamp;
        headers["X-Nonce"] = nonce;
        headers["X-Signature"] = signature;
    }

    startProgress();
    const defaultTimeout = isAiEndpoint ? 60000 : 40000;
    const timeoutMs = options.timeout || defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Strip custom wrapper options so invalid types (e.g. boolean priority) are never passed to native fetch
    const { priority: customPriority, timeout: customTimeout, ...restOptions } = options;
    const validFetchPriority = typeof customPriority === 'string' && ['high', 'low', 'auto'].includes(customPriority)
        ? customPriority
        : (isPriority ? 'high' : undefined);

    try {
        let response;
        try {
            response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...restOptions,
                ...(validFetchPriority ? { priority: validFetchPriority } : {}),
                signal: options.signal || controller.signal,
                headers,
                credentials: "include",
            });
        } catch (err) {
            // Network or fetch-level error – wrap in ApiError for callers to handle uniformly
            throw new ApiError(err && err.name ? err.name : "NetworkError", err && err.message ? err.message : "Network request failed");
        }

        if (response.status === 401 && getToken()) {
            try {
                await refreshTokens();
                scheduleRefresh();
                const newToken = getToken();
                const newSigningKey = getSigningKey();
                headers.Authorization = `Bearer ${newToken}`;
                if (newSigningKey) {
                    const timestamp = Date.now().toString();
                    const nonce = crypto.randomUUID();
                    const bodyStr = typeof options.body === "string" ? options.body : "";
                    const pathOnly = endpoint.split('?')[0];
                    const signature = await computeSignature(newSigningKey, method, pathOnly, bodyStr, timestamp, nonce);
                    headers["X-Timestamp"] = timestamp;
                    headers["X-Nonce"] = nonce;
                    headers["X-Signature"] = signature;
                }
                response = await fetch(`${API_BASE_URL}${endpoint}`, {
                    ...restOptions,
                    ...(validFetchPriority ? { priority: validFetchPriority } : {}),
                    headers,
                    credentials: "include",
                });
            } catch {
                clearSession();
                window.location.href = "/login.html";
                return;
            }
        }

        let data = null;
        try { 
            data = await response.json(); 
            data = deepNormalizeNFC(data);
        } catch { 
            data = null; 
        }

        if (!response.ok) {
            if (response.status === 401 && getToken()) {
                clearSession();
                window.location.href = "/login.html";
                return;
            }
            if (response.status === 403 && data?.message?.includes("complete your profile")) {
                window.location.href = "/complete-profile.html";
                return;
            }
            if (response.status === 403 && data?.code === "STUDENT_NOT_VERIFIED") {
                if (!window.location.pathname.endsWith("/student-verify.html")) {
                    window.location.href = "/student-verify.html";
                }
                const err = new ApiError(403, data?.error || "Please verify your student status first");
                err.code = "STUDENT_NOT_VERIFIED";
                throw err;
            }
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                const msg = data?.error || data?.message || "Too many requests. Please wait before trying again.";
                const err = new ApiError(429, msg);
                err.retryAfter = retryAfter ? parseInt(retryAfter) : null;
                throw err;
            }
            const err = new ApiError(response.status, data?.message || data?.error || "Request failed");
            err.code = data?.code || data?.error;
            err.data = data;
            throw err;
        }

        return data;
    } finally {
        clearTimeout(timeoutId);
        releaseRequest();
        completeProgress();
    }
}

export function get(endpoint, options = {}) {
    return request(endpoint, { ...options });
}

export function post(endpoint, body, options = {}) {
    return request(endpoint, {
        method: "POST",
        body: JSON.stringify(deepNormalizeNFC(body)),
        ...options
    });
}

export function put(endpoint, body, options = {}) {
    return request(endpoint, {
        method: "PUT",
        body: JSON.stringify(deepNormalizeNFC(body)),
        ...options
    });
}

export function patch(endpoint, body, options = {}) {
    return request(endpoint, {
        method: "PATCH",
        body: JSON.stringify(deepNormalizeNFC(body)),
        ...options
    });
}

export function del(endpoint, options = {}) {
    return request(endpoint, {
        method: "DELETE",
        ...options
    });
}

export function uploadFormData(endpoint, formData) {
    const token = getToken();
    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return request(endpoint, {
        method: "POST",
        headers,
        body: formData
    });
}

export function putFormData(endpoint, formData) {
    const token = getToken();
    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return request(endpoint, {
        method: "PUT",
        headers,
        body: formData
    });
}

export async function postStream(endpoint, body, callbacks = {}, options = {}) {
    const { onMessage, onError, onDone } = callbacks;
    await ensureSession();
    await checkRateLimit();

    await enqueueRequest(true);

    const token = getToken();
    const signingKey = getSigningKey();
    const headers = { Accept: "text/event-stream", ...options.headers };
    const method = "POST";
    headers["Content-Type"] = "application/json";

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const bodyStr = JSON.stringify(body);
    if (token && signingKey) {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomUUID();
        const pathOnly = endpoint.split('?')[0];
        const signature = await computeSignature(signingKey, method, pathOnly, bodyStr, timestamp, nonce);
        headers["X-Timestamp"] = timestamp;
        headers["X-Nonce"] = nonce;
        headers["X-Signature"] = signature;
    }

    startProgress();
    const timeoutMs = options.timeout || 90000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers,
            body: bodyStr,
            signal: options.signal || controller.signal,
            credentials: "include",
        });

        if (!response.ok) {
            let errData = null;
            try { errData = await response.json(); } catch {}
            throw new ApiError(response.status, errData?.error || errData?.message || `Stream request failed (${response.status})`);
        }

        if (!response.body) {
            throw new ApiError(500, "ReadableStream not supported in this browser");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                for (const line of trimmed.split("\n")) {
                    if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6).trim();
                        try {
                            const rawData = JSON.parse(jsonStr);
                            const data = deepNormalizeNFC(rawData);
                            if (onMessage) onMessage(data);
                        } catch (parseErr) {
                            console.warn("[SSE] JSON parse warning:", parseErr.message, jsonStr);
                        }
                    }
                }
            }
        }

        if (onDone) onDone();
    } catch (err) {
        if (onError) onError(err);
        else throw err;
    } finally {
        clearTimeout(timeoutId);
        releaseRequest();
        completeProgress();
    }
}

