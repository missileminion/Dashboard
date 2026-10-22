// Google Identity Services token flow. Read-only scopes, no secret.
let client = null, token = null, expiresAt = 0, pending = null;
// The access token lives about an hour. It is kept in this browser's localStorage until it expires so a page refresh doesn't ask you to sign in again.
// It is read-only, short-lived and never leaves this browser except to Google.
const KEY = "ghToken";
try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && o.exp > Date.now() + 60000) { token = o.t; expiresAt = o.exp; } } catch { }

export function hasToken() { return token && Date.now() < expiresAt - 60000; }

function ensureClient() {
  if (client) return client;
  client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID, scope: CONFIG.SCOPES,
    callback: r => {
      const p = pending; pending = null;
      if (r.error) return p && p.reject(new Error(r.error));
      token = r.access_token; expiresAt = Date.now() + r.expires_in * 1000;
      try { localStorage.setItem(KEY, JSON.stringify({ t: token, exp: expiresAt })); } catch { }
      p && p.resolve(token);
    },
    error_callback: e => { const p = pending; pending = null; p && p.reject(new Error(e.type || "popup_error")); }
  });
  return client;
}

// interactive=false asks for a token silently (works once consent was given); true shows the Google pop-up.
export function getToken({ interactive = false } = {}) {
  if (hasToken()) return Promise.resolve(token);
  if (!interactive) return Promise.reject(new Error("sign-in needed"));   // never open Google's window without a tap
  if (pending) return pending.promise;
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  if (typeof google === "undefined") return Promise.reject(new Error("sign-in script not loaded yet"));
  pending = { promise, resolve, reject };
  ensureClient().requestAccessToken({ prompt: interactive ? "" : "none" });
  return promise;
}
export function dropToken() { token = null; expiresAt = 0; try { localStorage.removeItem(KEY); } catch { } }
