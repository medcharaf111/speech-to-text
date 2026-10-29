// Speaker session token issued by POST /api/admin/login. Format: "<expiryMs>.<signature>".
const TOKEN_KEY = "adminToken";
const LEGACY_FLAG = "adminAuthenticated";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(LEGACY_FLAG);
  } catch {
    // storage unavailable (private mode); the session just won't persist across reloads
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_FLAG);
  } catch {
    // ignore
  }
}

export function tokenExpiry(token = getToken()) {
  const exp = Number((token || "").split(".")[0]);
  return Number.isFinite(exp) ? exp : 0;
}

export function isAuthenticated() {
  return tokenExpiry() > Date.now();
}
