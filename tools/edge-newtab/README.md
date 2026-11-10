# Dashboard as the Edge new tab

Edge has no setting for a custom new tab page, so this tiny extension does it (it only redirects; it reads nothing).

1. Open `edge://extensions`
2. Turn on **Developer mode** (bottom left)
3. **Load unpacked**, choose this folder (`tools/edge-newtab`)
4. Open a new tab. If Edge asks "Keep changes?", choose **Keep it**.

Keep this folder where it is: Edge reads the files from here. To change the address, edit `newtab.js`, then press the reload arrow on the extension card.

No extension: Settings > Start, home, and new tabs > **Home button** shows a house icon that opens your page; and **When Edge starts** > "Open these pages" opens it on launch (not on every new tab).
