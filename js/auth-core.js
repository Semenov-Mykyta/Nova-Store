const SUPABASE_URL = "https://vpznvbxgklqovibmoheq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwem52Ynhna2xxb3ZpYm1vaGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDAyNTMsImV4cCI6MjA5NTcxNjI1M30.FgCN1knqpyi-2bb9U8tvSqC1mpGT15IyMyrM7BGJQRY";

const AUTH_CACHE_KEY = "novastore_auth_cache";
const AUTH_CACHE_TTL = 5 * 60 * 1000;

function createSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (typeof supabase === "undefined") return null;

    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
}

function readAuthCache() {
    try {
        const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
        if (!raw) return undefined;

        const cached = JSON.parse(raw);
        if (!cached || Date.now() - cached.createdAt > AUTH_CACHE_TTL) return undefined;

        // Can be either a user object or null. Null is also cached so logged-out
        // pages do not call Supabase again and again.
        return Object.prototype.hasOwnProperty.call(cached, "user") ? cached.user : undefined;
    } catch {
        return undefined;
    }
}

function writeAuthCache(user) {
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
        createdAt: Date.now(),
        user: user ? { id: user.id, email: user.email } : null
    }));
}

function clearAuthCache() {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
}

async function getCurrentUser(options = {}) {
    const { forceRefresh = false } = options;

    if (!forceRefresh) {
        const cachedUser = readAuthCache();
        if (cachedUser !== undefined) return cachedUser;
    }

    const client = createSupabaseClient();
    if (!client) return null;

    try {
        const { data: sessionData, error } = await client.auth.getSession();
        if (error) throw error;

        const sessionUser = sessionData?.session?.user || null;

        if (sessionUser) {
            writeAuthCache(sessionUser);
            return { id: sessionUser.id, email: sessionUser.email };
        }

        writeAuthCache(null);
        return null;
    } catch (err) {
        console.warn("Could not read Supabase session:", err);
        return null;
    }
}

async function requireAuth(redirectToLogin = true) {
    const user = await getCurrentUser();
    if (user) return user;

    if (redirectToLogin) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?next=${next}`;
    }

    return null;
}

function initAuthStateListener() {
    const client = createSupabaseClient();
    if (!client || window.__novaAuthListenerReady) return;

    window.__novaAuthListenerReady = true;
    client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
            writeAuthCache(session.user);
        } else {
            clearAuthCache();
        }
        window.dispatchEvent(new CustomEvent("nova:auth-changed", {
            detail: { user: session?.user || null }
        }));
    });
}

window.NovaAuth = {
    createSupabaseClient,
    getCurrentUser,
    requireAuth,
    clearAuthCache,
    initAuthStateListener
};

document.addEventListener("DOMContentLoaded", () => {
    createSupabaseClient();
    initAuthStateListener();
});
