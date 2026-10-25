# Static server for dev/preview.html with caching disabled.
#   python3 dev/serve.py   →   http://127.0.0.1:5180/dev/preview.html
import http.server, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', 5180))),
    functools.partial(NoCache, directory=root)).serve_forever()
