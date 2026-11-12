#!/usr/bin/env python3
"""Подшить в деку пульт с телефона (и, по просьбе, запрет на индексацию).

    python3 add-clicker.py дека.html --noindex -o public/p/дека.html
    python3 add-clicker.py дека.html --relay https://<адрес-ретранслятора>

Идемпотентно: блок пульта живёт между метками и при повторном запуске
заменяется целиком, а не дописывается вторым. Значит, скрипт можно гонять
после каждой пересборки деки.

`--relay` — ЗАПАСНОЙ адрес, на случай деки, открытой не с сайта (с флешки,
из письма). Рабочий адрес пульт берёт из `/p/relay.json` рядом с деками:
функция-ретранслятор переживает пересоздание и меняет адрес, а дека к тому
времени разойдётся копиями. Один файл рядом чинит их все; зашитый адрес
пришлось бы перешивать в каждой.

Сам пульт — `assets/clicker.js` рядом: самодостаточный блок, который не
правит в деке ни разметки, ни стилей, ни обработчиков.
"""

import argparse
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
CLICKER = HERE.parent / 'assets' / 'clicker.js'

OPEN = '<!-- пульт с телефона: начало (собрано add-clicker.py) -->'
SHUT = '<!-- пульт с телефона: конец -->'
BLOCK = re.compile(re.escape(OPEN) + r'.*?' + re.escape(SHUT), re.S)

NOINDEX = '<meta name="robots" content="noindex,nofollow">'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('deck', type=pathlib.Path)
    ap.add_argument('--relay', default='',
                    help='запасной адрес ретранслятора для деки вне сайта')
    ap.add_argument('--noindex', action='store_true',
                    help='дописать запрет индексации, если его ещё нет')
    ap.add_argument('-o', '--out', type=pathlib.Path,
                    help='куда писать (по умолчанию — поверх исходника)')
    a = ap.parse_args()

    if not CLICKER.exists():
        sys.exit('Нет %s — скрипт оторван от своего скилла.' % CLICKER)
    html = a.deck.read_text(encoding='utf-8')

    if '</body>' not in html:
        sys.exit('%s не похож на деку: нет </body>.' % a.deck)
    if not html.count('class="slide'):
        sys.exit('%s не похож на деку: нет ни одного .slide.' % a.deck)

    # Только присваивание. Простая замена по всему файлу подставляла адрес
    # и в комментарии, где `__RELAY__` — имя заглушки, и объяснение начинало
    # ссылаться само на себя.
    js, hits = re.subn(r"(var RELAY = ')__RELAY__(')",
                       lambda m: m.group(1) + a.relay + m.group(2),
                       CLICKER.read_text(encoding='utf-8'), count=1)
    if hits != 1:
        sys.exit('В %s не нашлось строки `var RELAY = \'__RELAY__\'`.' % CLICKER)
    block = OPEN + '\n<script>\n' + js + '</script>\n' + SHUT

    if BLOCK.search(html):
        # Замена, а не дописывание: иначе после пятой пересборки в деке
        # окажется пять пультов, и все пять будут опрашивать ретранслятор.
        html = BLOCK.sub(lambda m: block, html, count=1)
        what = 'обновлён'
    else:
        html = html.replace('</body>', block + '\n</body>', 1)
        what = 'подшит'

    if a.noindex and 'name="robots"' not in html:
        html = re.sub(r'<head([^>]*)>', lambda m: m.group(0) + '\n' + NOINDEX, html, count=1)

    out = a.out or a.deck
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print('%s: пульт %s, слайдов %d, %d КБ'
          % (out, what, html.count('<section class="slide'), len(html.encode()) // 1024))


if __name__ == '__main__':
    main()
