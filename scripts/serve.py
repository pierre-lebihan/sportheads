"""Serve the built site locally, allowing simultaneous browser module requests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from socketserver import TCPServer

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8766)
parser.add_argument('--directory', default='_site')
args = parser.parse_args()

class Server(ThreadingHTTPServer):
    request_queue_size = 128

    def server_bind(self):
        # This loopback-only server does not need a reverse DNS lookup, which
        # can block startup on developer machines with unavailable local DNS.
        TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]

with Server(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=args.directory)) as server:
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    server.serve_forever()
