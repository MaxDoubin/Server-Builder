"""Static server for the single device preview page.

Rooted at this directory so `shot.mjs` can ask for `glb/<name>.glb`, and
serving `.glb` with the type three.js expects rather than octet-stream.

Three paths are served out of the repository rather than out of this
directory, because `view.html` asks for them at the site's own absolute
paths and this directory has none of them:

  /node_modules/  three.js itself, via the page's import map
  /draco/         the Draco decoder, for compressed geometry
  /basis/         the Basis transcoder, for KTX2 textures

Without those the viewer 404s on three.js and renders nothing at all, and
nothing says so: the page simply never signals ready and every screenshot
times out. Three separate attempts at this harness hit it and each one
worked around it with symlinks in a scratch directory, which is why it
kept coming back. Serving them here fixes it for every checkout.
"""
import http.server
import os
import posixpath
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
os.chdir(HERE)

#: URL prefix to the directory in the repository that answers it.
ELSEWHERE = {
    "/node_modules/": os.path.join(REPO, "node_modules"),
    "/draco/": os.path.join(REPO, "client", "public", "draco"),
    "/basis/": os.path.join(REPO, "client", "public", "basis"),
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.glb': 'model/gltf-binary', '.js': 'text/javascript',
                      '.wasm': 'application/wasm'}

    def translate_path(self, path):
        clean = posixpath.normpath(path.split("?", 1)[0].split("#", 1)[0])
        for prefix, root in ELSEWHERE.items():
            if clean.startswith(prefix):
                rest = clean[len(prefix):]
                target = os.path.normpath(os.path.join(root, rest))
                # Refuse to climb out of the directory being served, which a
                # normpath on attacker controlled input can otherwise do.
                if target.startswith(root):
                    return target
        return super().translate_path(path)

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    """Threaded: a viewer page opens the model, three.js, a decoder and a
    transcoder at once, and a single threaded server answers those in series
    while the next page waits, which at a few hundred models is the
    difference between minutes and hours."""

    allow_reuse_address = True
    daemon_threads = True


with Server(('127.0.0.1', int(sys.argv[1] if len(sys.argv) > 1 else 4310)), Handler) as srv:
    srv.serve_forever()
