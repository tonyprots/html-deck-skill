#!/usr/bin/env python3
"""Текстовая выгрузка HTML-деки: по одной секции на блок, для вычитки
humanizer-ru / editorial и для заметок докладчика. С `--lint` — проверки
текста, которые раньше делались глазами и пропускались.

    python3 deck_text.py index.html                  # в stdout
    python3 deck_text.py index.html out.txt          # в файл
    python3 deck_text.py index.html --lint           # проверки, доклад
    python3 deck_text.py index.html --lint --genre analytic

Что ловит `--lint` (код выхода 1, если есть флаги):
- `words`  — слов на контентном слайде больше порога жанра. Порог выведен из
  принятых дек: доклады — медиана ~70, p90 ~105;
  аналитика для руководства — медиана ~115, p90 ~165. Флаг —
  повод резать или делить слайд, а не приговор.
- `swing`  — качели «не X, а Y» и «X, а не Y» (правило в repeat-offenders,
  возвращалось на каждой деке, последний раз «цель, а не задача»).
- `latin`  — латиница на слайде: каждое слово — кандидат в «термин без
  расшифровки». Для доклада перед залом без технического фона проверить
  каждое: объяснено на этом или раньше — оставить, нет — убрать или
  перевести. Печатается списком, флагом не считается.
"""
import html
import re
import sys

LIMITS = {"talk": 90, "analytic": 150}
WORD = re.compile(r"[\wЁё]+(?:[-’'][\wЁё]+)*", re.U)
SWING = [
    re.compile(r"(?<![\wЁё])[Нн]е\s+(?!только\b|всегда\b|сразу\b|просто\b|важно\b)[^,.;:!?\n«»]{1,40}?,\s+а\s+(?!не\b|также\b|потом\b)", re.U),
    re.compile(r"[\wЁё»]+,\s+а\s+не\s+(?!только\b)[\wЁё]+", re.U),
]
LATIN = re.compile(r"(?<![\w/.@-])[A-Za-z][A-Za-z0-9+#.-]*[A-Za-z0-9+#]|(?<![\w/.@-])[A-Za-z](?![\w])")


def sections(src: str):
    return re.findall(r'<section class="slide([^"]*)"[^>]*>(.*?)</section>', src, flags=re.S)


def clean(fragment: str) -> str:
    fragment = re.sub(r"<style.*?</style>", "", fragment, flags=re.S)
    fragment = re.sub(r"<(br|/p|/h\d|/li|/tr|/div)\s*/?>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    lines = [re.sub(r"[ \t]+", " ", html.unescape(l)).strip() for l in fragment.split("\n")]
    # инлайновые теги (<b>, <small>) дают лишний пробел перед знаком препинания
    lines = [re.sub(r" ([,.:;!?%)»])", r"\1", l) for l in lines]
    return "\n".join(l for l in lines if l)


def kind_of(cls: str) -> str:
    return "divider" if "divider" in cls else "cover" if "cover" in cls else "bento" if "bento" in cls else "slide"


def dump(path: str) -> str:
    src = open(path, encoding="utf-8").read()
    out = []
    for i, (cls, body) in enumerate(sections(src)):
        out.append(f"===== {i:02d} [{kind_of(cls)}] =====\n{clean(body)}\n")
    return "\n".join(out)


def lint(path: str, genre: str) -> int:
    src = open(path, encoding="utf-8").read()
    limit, flags, latin_all = LIMITS[genre], 0, {}
    print(f"{'#':>3}  {'вид':<8}{'слов':>5}  заголовок")
    for i, (cls, body) in enumerate(sections(src)):
        text, kind = clean(body), kind_of(cls)
        flat = re.sub(r"\s+", " ", text.replace("\xa0", " "))
        n = len(WORD.findall(flat))
        title = (text.split("\n") or [""])[0][:60]
        over = kind == "slide" and n > limit
        print(f"{i:>3}  {kind:<8}{n:>5}{'  ⚠' if over else '   '} {title}")
        if over:
            flags += 1
            print(f"       words: {n} > {limit} — резать или делить")
        for rx in SWING:
            for m in rx.finditer(flat):
                flags += 1
                print(f"       swing: …{flat[max(0, m.start() - 12):m.end() + 20]}…")
        for w in LATIN.findall(flat):
            if len(w) > 1:
                latin_all.setdefault(w, i)
    if latin_all:
        print("\nЛатиница, слово(первый слайд) — каждое объяснено залу или убрать:")
        print("  " + ", ".join(f"{w}({i})" for w, i in latin_all.items()))
    print(f"\nФлагов: {flags} (порог слов {limit}, жанр {genre})")
    return 1 if flags else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if "--lint" in args:
        genre = args[args.index("--genre") + 1] if "--genre" in args else "talk"
        if genre not in LIMITS:
            sys.exit(f"--genre: {', '.join(LIMITS)}")
        sys.exit(lint(args[0], genre))
    text = dump(args[0])
    if len(args) > 1:
        open(args[1], "w", encoding="utf-8").write(text)
        print(f"{args[1]}: {text.count('=====') // 2} блоков")
    else:
        print(text)
