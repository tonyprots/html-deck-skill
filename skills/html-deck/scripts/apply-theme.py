#!/usr/bin/env python3
"""Накладывает тему на деку из шаблона: токены и логотип.

    python3 apply-theme.py index.html themes/<тема>

Тема — папка с `theme.css` (блок :root с новыми значениями тех же токенов
и, по желанию, @font-face) и, по желанию, `logo.svg`. Шрифты, на которые
`theme.css` ссылается через `url(...)` относительно папки темы (обычно
`../_fonts/*.woff2`), вшиваются в деку data-URI: дека остаётся одним файлом
без внешних загрузок. CSS встаёт отдельным <style id="deck-theme">
после стилей шаблона, поэтому перебивает нейтральные значения. Логотип
встаёт в подвал (`.brand`) и в центр бенто (`.blogo`). Повторный запуск
заменяет тему, а не дублирует.
"""
import base64
import pathlib
import re
import sys


def main(deck: str, theme: str) -> None:
    d, t = pathlib.Path(deck), pathlib.Path(theme)
    src = d.read_text(encoding="utf-8")
    css = (t / "theme.css").read_text(encoding="utf-8")

    def embed(m):
        f = (t / m.group(1)).resolve()
        if not f.exists():
            sys.exit(f"{t / 'theme.css'}: нет файла шрифта {m.group(1)}")
        return f'url(data:font/woff2;base64,{base64.b64encode(f.read_bytes()).decode()})'
    css = re.sub(r'url\(["\']?([^)"\':]+\.woff2)["\']?\)', embed, css)
    block = f'<style id="deck-theme">\n{css}</style>'
    if 'id="deck-theme"' in src:
        src = re.sub(r'<style id="deck-theme">.*?</style>', lambda _: block, src, count=1, flags=re.S)
    else:
        i = src.index("</style>") + len("</style>")
        src = src[:i] + "\n" + block + src[i:]
    logo = t / "logo.svg"
    if logo.exists():
        uri = "data:image/svg+xml;base64," + base64.b64encode(logo.read_bytes()).decode()
        alt = t.name
        src, n = re.subn(r'<(?:img|span) class="brand"[^>]*?(?:/>|>(?:[^<]*</span>)?)',
                         f'<img class="brand" src="{uri}" alt="{alt}">', src, count=1)
        if not n:
            sys.exit("нет элемента .brand — логотип некуда ставить")
        src = re.sub(r'<(?:img|span) class="blogo"[^>]*?(?:/>|>(?:[^<]*</span>)?)',
                     f'<img class="blogo" src="{uri}" alt="{alt}">', src)
    d.write_text(src, encoding="utf-8")
    print(f"{deck}: тема {t.name}" + (", логотип" if logo.exists() else ""))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
