# Server di prova del sito: come "python -m http.server", ma dice al browser di non tenere in memoria
# le pagine, così dopo ogni modifica basta ricaricare per vedere la versione nuova.
# Uso: python strumenti/server.py [porta]   (dalla cartella del sito)
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


porta = int(sys.argv[1]) if len(sys.argv) > 1 else 5191
print(f'Sito su http://localhost:{porta}')
ThreadingHTTPServer(('', porta), NoCache).serve_forever()
