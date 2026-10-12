"""Local preview server with correct MIME types (Windows maps .js to text/plain) and no caching."""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".json": "application/json",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # The default backlog of 5 refuses some of a browser's parallel requests on Windows.
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    server = Server(("127.0.0.1", 8765), functools.partial(Handler, directory=ROOT))
    print("Serving", ROOT, "on http://127.0.0.1:8765/", flush=True)
    server.serve_forever()
