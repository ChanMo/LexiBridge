# Third-party notices

LexiBridge code: MIT License (see LICENSE).

## Bundled data

### ECDICT

- Source: https://github.com/skywind3000/ECDICT (commit bc015ed)
- Used in: `packs/en-zh-Hans` and `packs/en-zh-Hant` (definitions, phonetics, exam tags; converted to Traditional
  Chinese for `en-zh-Hant`), `engines/en-irregular.js` (inflected forms)
- Modified: selected headwords, shortened definitions, normalized phonetics (see `tools/build_packs.py`)

```
MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### CEFR-J Wordlist Version 1.6

- Source: https://www.cefr-j.org/download.html
- © Tono Laboratory, Tokyo University of Foreign Studies. Free for research, education and commercial use with citation.
- Used in: level lists of `packs/en-zh-Hant`, and words added to the shared word list
- Modified: single-word headwords only, each at its lowest level (see `tools/build_packs.py`)

> The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from https://www.cefr-j.org/download.html on 08/10/2026.
>
> 『CEFR-J Wordlist Version 1.6』東京外国語大学投野由紀夫研究室.（URL: https://www.cefr-j.org/download.html より 2026年10月ダウンロード）

## Build tools (not bundled)

- OpenCC (https://github.com/BYVoid/OpenCC), Apache License 2.0: converts the Simplified Chinese
  definitions to Traditional Chinese (`s2tw`) for `packs/en-zh-Hant`.
- openpyxl, MIT License: reads the CEFR-J Wordlist.
