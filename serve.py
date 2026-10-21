# Local server for the dashboard: static files (no-store) plus two tiny endpoints that read and write one file each, so
# the Stickynote (/api/tasks) and the gym log (/api/gymlog) live on disk, not only in the browser.
# usage: python3 serve.py PORT APP_DIR STICKYNOTE_FILE [GYMLOG_FILE]
import http.server, sys, os, functools, tempfile
port, root, tasks = int(sys.argv[1]), sys.argv[2], os.path.abspath(sys.argv[3])
gym = os.path.abspath(sys.argv[4]) if len(sys.argv) > 4 else os.path.join(os.path.dirname(tasks), "gym-log.json")
ROUTES = {"/api/tasks": tasks, "/api/gymlog": gym}
ORIGINS = {f"http://localhost:{port}", f"http://127.0.0.1:{port}"}
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a): pass
    def _ok_origin(self):  # only this page may touch the file (blocks other sites from writing to localhost)
        o = self.headers.get("Origin")
        return o is None or o in ORIGINS
    def _route(self): return ROUTES.get(self.path.split("?")[0])
    def _reply(self, code, body=b"", path=""):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Path", path)
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        f = self._route()
        if not f: return super().do_GET()
        if not self._ok_origin(): return self._reply(403)
        if not os.path.exists(f): return self._reply(404, path=f)
        with open(f, "rb") as fh: self._reply(200, fh.read(), f)
    def do_PUT(self):
        f = self._route()
        if not f: return self._reply(404)
        n = int(self.headers.get("Content-Length", 0))
        if not self._ok_origin() or n > 2_000_000: return self._reply(403)
        data = self.rfile.read(n)
        os.makedirs(os.path.dirname(f), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(f), prefix=".tmp-")
        with os.fdopen(fd, "wb") as fh: fh.write(data)
        os.replace(tmp, f)  # atomic: the file is never half-written
        self._reply(204, path=f)
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=root)).serve_forever()
