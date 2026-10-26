"""Servidor local do ObraCusto.

Serve a pasta do app em http://localhost:8765 (endereço autorizado no Google Cloud para o login)
e abre o navegador. Roda sem janela (pythonw), chamado pelo atalho "ObraCusto" ou pelo "Abrir ObraCusto.bat".
Só atende este computador (127.0.0.1). Se já estiver rodando, apenas abre o navegador.

Encerra sozinho: enquanto o app está aberto, ele chama /__vivo a cada 30 segundos; sem nenhum
sinal por 3 minutos (todas as janelas do app fechadas), o servidor se encerra.
Para encerrar na hora: "Fechar ObraCusto.bat".
"""
import functools
import http.server
import os
import threading
import time
import webbrowser

PORTA = 8765
ENDERECO = f"http://localhost:{PORTA}/"
PASTA = os.path.dirname(os.path.abspath(__file__))
LIMITE_SEM_SINAL = 180   # segundos sem notícia do app até encerrar
VERIFICAR_A_CADA = 15    # segundos entre uma verificação e outra


class Manipulador(http.server.SimpleHTTPRequestHandler):
    # Tipos fixos: em alguns Windows o registro associa .js a text/plain
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
    }

    def do_GET(self):
        # Qualquer acesso conta como sinal de que o app está em uso
        self.server.ultimo_sinal = time.monotonic()
        if self.path.split("?")[0] == "/__vivo":
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        # Sempre confere se o arquivo mudou, para o app nunca abrir uma versão antiga
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        # Sem janela não há onde mostrar o log de cada acesso
        pass


class Servidor(http.server.ThreadingHTTPServer):
    # No Windows, reaproveitar o endereço deixaria dois servidores na mesma porta
    allow_reuse_address = False


def vigiar(servidor):
    """Encerra o servidor quando o app fica LIMITE_SEM_SINAL segundos sem dar sinal."""
    anterior = time.monotonic()
    while True:
        time.sleep(VERIFICAR_A_CADA)
        agora = time.monotonic()
        if agora - anterior > VERIFICAR_A_CADA * 4:
            # O computador estava suspenso: dá tempo para o app voltar a dar sinal antes de decidir
            servidor.ultimo_sinal = agora
        anterior = agora
        if agora - servidor.ultimo_sinal > LIMITE_SEM_SINAL:
            servidor.shutdown()
            return


def main():
    try:
        servidor = Servidor(("127.0.0.1", PORTA), functools.partial(Manipulador, directory=PASTA))
    except OSError:
        # Porta ocupada: o app já está aberto
        webbrowser.open(ENDERECO)
        return
    servidor.ultimo_sinal = time.monotonic()
    threading.Thread(target=vigiar, args=(servidor,), daemon=True).start()
    webbrowser.open(ENDERECO)
    servidor.serve_forever()
    servidor.server_close()


if __name__ == "__main__":
    main()
