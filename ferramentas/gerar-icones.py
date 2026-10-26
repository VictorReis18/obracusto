"""Gera as imagens do ObraCusto a partir do ICONE.png (logo laranja/vermelho sobre fundo preto):
- icone-*.png e icone.ico: ícone quadrado, fundo preto com cantos arredondados, logo centralizado
- logo.png: só o logo, com o fundo preto transformado em transparente
Rodar sempre que o ICONE.png mudar. Precisa da biblioteca Pillow (pip install pillow).
Uso, na pasta do app: python ferramentas/gerar-icones.py ICONE.png img [pasta extra de bibliotecas]
"""
import os
import sys

if len(sys.argv) > 3:
    sys.path.insert(0, sys.argv[3])
from PIL import Image, ImageChops, ImageDraw

orig = Image.open(sys.argv[1]).convert("RGB")
saida = sys.argv[2]
os.makedirs(saida, exist_ok=True)

r, g, b = orig.split()
maior = ImageChops.lighter(ImageChops.lighter(r, g), b)  # maior canal de cada pixel

# Área ocupada pelo logo (ignora o ruído quase preto do fundo)
caixa = maior.point(lambda v: 255 if v > 40 else 0).getbbox()
print("logo ocupa:", caixa)
x0, y0, x1, y1 = caixa
bw, bh = x1 - x0, y1 - y0
logo_rgb = orig.crop(caixa)

# ---------- ícone quadrado ----------
lado = int(max(bw, bh) * 1.18)  # ~9% de margem de cada lado
quadro = Image.new("RGB", (lado, lado), (0, 0, 0))
quadro.paste(logo_rgb, ((lado - bw) // 2, (lado - bh) // 2))

# cantos arredondados suaves (desenha a máscara 4x maior e reduz)
esc = 4
mascara = Image.new("L", (lado * esc, lado * esc), 0)
ImageDraw.Draw(mascara).rounded_rectangle((0, 0, lado * esc - 1, lado * esc - 1), radius=int(lado * 0.22 * esc), fill=255)
mascara = mascara.resize((lado, lado), Image.LANCZOS)
icone = quadro.convert("RGBA")
icone.putalpha(mascara)

for t in (32, 64, 128, 192, 256, 512):
    icone.resize((t, t), Image.LANCZOS).save(os.path.join(saida, f"icone-{t}.png"), optimize=True)
icone.resize((256, 256), Image.LANCZOS).save(
    os.path.join(saida, "icone.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

# ---------- logo sem fundo ----------
# O logo é laranja/vermelho bem saturado (canal mais forte perto de 245). Nas bordas suavizadas o pixel é
# "cor × cobertura" sobre o preto, então a transparência sai do canal mais forte e a cor é recuperada dividindo.
margem = 8
caixa_m = (max(0, x0 - margem), max(0, y0 - margem), min(orig.width, x1 + margem), min(orig.height, y1 + margem))
corte = orig.crop(caixa_m)
cr, cg, cb = corte.split()
forte = ImageChops.lighter(ImageChops.lighter(cr, cg), cb)
alfa = forte.point(lambda v: 0 if v < 18 else min(255, (v - 18) * 255 // (240 - 18)))
px_in = corte.load()
px_a = alfa.load()
logo = Image.new("RGBA", corte.size)
px_out = logo.load()
for y in range(corte.height):
    for x in range(corte.width):
        a = px_a[x, y]
        if a == 0:
            px_out[x, y] = (0, 0, 0, 0)
            continue
        fator = 255 / max(a, 1)
        rr, gg, bb = px_in[x, y]
        px_out[x, y] = (min(255, int(rr * fator)), min(255, int(gg * fator)), min(255, int(bb * fator)), a)
altura = 160
logo.resize((round(logo.width * altura / logo.height), altura), Image.LANCZOS).save(os.path.join(saida, "logo.png"), optimize=True)

for f in sorted(os.listdir(saida)):
    print(f, os.path.getsize(os.path.join(saida, f)), "bytes")
