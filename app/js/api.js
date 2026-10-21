import { getToken, dropToken } from "./auth.js";
const BASE = "https://health.googleapis.com/v4/users/me/dataTypes/";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A rejected token means signed out: stop everything at once instead of failing every data type one by one.
const signedOutError = () => Object.assign(new Error("signed out"), { auth: true });
async function request(url, attempt = 0) {
  let tok; try { tok = await getToken(); } catch (e) { throw signedOutError(); }
  const r = await fetch(url, { headers: { Authorization: "Bearer " + tok } });
  if (r.status === 429 && attempt < 5) { await sleep(2000 * 2 ** attempt); return request(url, attempt + 1); }
  if (r.status === 401) { dropToken(); throw signedOutError(); }
  if (!r.ok) throw new Error(`${url.split("/dataTypes/")[1].split("/")[0]}: HTTP ${r.status}`);
  return r.json();
}

// Pages through a data type. Results arrive newest first, so `stop(point)` lets callers end early
// once they reach data older than they need.
export async function fetchPoints(type, { filter, pageSize = 100, stop, maxPages = 400 } = {}) {
  const out = []; let pageToken = "";
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ page_size: pageSize });
    if (filter) q.set("filter", filter);
    if (pageToken) q.set("page_token", pageToken);
    const j = await request(`${BASE}${type}/dataPoints?${q}`);
    for (const p of j.dataPoints || []) { if (stop && stop(p)) return out; out.push(p); }
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
