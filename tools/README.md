# tools

`soften.py` builds the Pressroom fonts used by `app/paper.html` (The Reader). It takes Newsreader (SIL Open Font License, from github.com/google/fonts/tree/main/ofl/newsreader)
and swells, rounds and roughens the letter outlines like ink on newsprint, and adds a few random pinholes. Needs `pip install fonttools skia-pathops brotli`.

    python3 soften.py Newsreader[opsz,wght].ttf out.woff2 400 14 medium Pressroom Regular

Arguments: source font, output, weight, optical size, strength (soft, medium, heavy), family name, style name. The licence is in `app/fonts/OFL.txt`.
