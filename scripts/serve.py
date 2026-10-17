"""Serve the built site locally, allowing simultaneous browser module requests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8766)
parser.add_argument('--directory', default='_site')
args = parser.parse_args()

class Server(ThreadingHTTPServer):
    request_queue_size = 128

with Server(('127.0.0.1', args.port), partial(SimpleHTTPRequestHandler, directory=args.directory)) as server:
    print(f'http://127.0.0.1:{args.port}/', flush=True)
    server.serve_forever()
