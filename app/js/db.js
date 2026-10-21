// IndexedDB cache: one row per local date, plus a small meta store.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open("health-dashboard", 1);
  r.onupgradeneeded = () => { r.result.createObjectStore("days", { keyPath: "date" }); r.result.createObjectStore("meta"); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const run = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
export const allDays = () => run("days", "readonly", s => s.getAll());
export const putDays = rows => run("days", "readwrite", s => { for (const r of rows) s.put(r); return {}; });
export const getMeta = k => run("meta", "readonly", s => s.get(k));
export const setMeta = (k, v) => run("meta", "readwrite", s => s.put(v, k));
