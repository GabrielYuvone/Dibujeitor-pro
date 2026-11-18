#!/usr/bin/env python3
"""
Genera un módulo TypeScript con los logos embebidos como base64 data URLs.
Así no dependen de /public being served correctly en el preview online.

Lee:
  - public/logointro.png
  - public/logo.svg

Escribe:
  - src/lib/assets/logos.ts  (exporta LOGO_INTRO_PNG y LOGO_SVG como strings)
"""
import base64
from pathlib import Path

ROOT = Path("/home/z/my-project")
PNG_PATH = ROOT / "public" / "logointro.png"
SVG_PATH = ROOT / "public" / "logo.svg"
OUT_PATH = ROOT / "src" / "lib" / "assets" / "logos.ts"


def read_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    png_b64 = read_b64(PNG_PATH)
    svg_b64 = read_b64(SVG_PATH)

    # Wrap long lines so the file is diff-friendly (TS allows string concat).
    def wrap(s: str, width: int = 76) -> str:
        chunks = [s[i : i + width] for i in range(0, len(s), width)]
        return "\n".join(f'    "{c}"' for c in chunks)

    content = f'''// AUTO-GENERADO por scripts/assets/gen_logo_base64.py
// No editar a mano — correr el script para regenerar.
//
// Logos embebidos como base64 data URLs para que funcionen en el preview
// online sin depender de /public siendo servido como static files.

export const LOGO_INTRO_PNG: string =
{wrap(png_b64)};

export const LOGO_SVG: string =
{wrap(svg_b64)};
'''

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  PNG: {len(png_b64)} base64 chars")
    print(f"  SVG: {len(svg_b64)} base64 chars")


if __name__ == "__main__":
    main()
