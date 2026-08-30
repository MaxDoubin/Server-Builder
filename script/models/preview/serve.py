"""Static server for the single device preview page.

Rooted at this directory so `shot.mjs` can ask for `glb/<name>.glb`, and
serving `.glb` with the type three.js expects rather than octet-stream.
"""
import http.server
import os
import socketserver
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.glb': 'model/gltf-binary', '.js': 'text/javascript'}

    def log_message(self, *args):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', int(sys.argv[1] if len(sys.argv) > 1 else 4310)), Handler) as srv:
    srv.serve_forever()
