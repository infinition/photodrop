"""Exporte les icones de PhotoDrop depuis le modele carre 1024.

Le modele source est public/assets/icon.jpg. Ce script produit les tailles
utiles au build (electron-builder lit build/icon.png), au badge du README
(.github/photodrop.png) et aux icones du web (PWA, apple-touch-icon). Les
formats derives (icns pour macOS, ico pour Windows) sont generes par
electron-builder pendant le packaging, il suffit de lui donner build/icon.png.
"""

import os
import sys

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(RACINE, "public", "assets", "icon.jpg")

CIBLES = {
    "build/icon.png": 1024,
    ".github/photodrop.png": 512,
    "public/assets/icon-512.png": 512,
    "public/assets/icon-192.png": 192,
    "public/assets/icon-180.png": 180,
    "public/assets/icon_256.png": 256,
}


def exporter(source):
    modele = Image.open(source).convert("RGB")
    for relatif, taille in CIBLES.items():
        chemin = os.path.join(RACINE, relatif)
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        img = modele.resize((taille, taille), Image.LANCZOS)
        img.save(chemin)
        print("ecrit %s en %dx%d" % (chemin, img.size[0], img.size[1]))


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else SOURCE
    exporter(source)


if __name__ == "__main__":
    main()
