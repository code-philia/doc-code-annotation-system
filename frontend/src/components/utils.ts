import ColorConvert from 'color-convert';

// https://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container
export function getCaretCharacterOffsetWithin(element: Element, atStart = true): number | null {
  let caretOffset: number | null = null;

  let sel: Selection | null;
  if (sel = document.getSelection()) {
    if (sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      const endContainer = atStart ? range.startContainer : range.endContainer;
      const endOffset = atStart ? range.startOffset : range.endOffset;

      var preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(endContainer, endOffset);
      caretOffset = preCaretRange.toString().length;
    }
  }

  return caretOffset;
}

// Random color generation algorithm
//https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript

function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
  return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}

function sfc32(a: number, b: number, c: number, d: number) {
  return function() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}

const [a, b, c, d] = cyrb128('picker');
const randFp = sfc32(a, b, c, d);

let randomCounter = 0;
const cachedRandomColors: string[] = [];  // '#FFFFFF' format colors

function randomColor() {
  randomCounter += 1;

  const h = 360 * randFp();
  const s = 80;
  const l = 40;

  const newColor = '#' + ColorConvert.hsl.hex([h, s, l]);
  cachedRandomColors.push(newColor);

  return newColor;
}

function notInIterable<T>(value: T, existingIterable: Iterable<string>) {
  let notIn = true;

  for (const x of existingIterable) {
    if (value === x) {
      notIn = false;
      break;
    }
  }

  return notIn;
}

export function getRandomColor(getExistingColorIterable: () => Iterable<string>) {
  let it: Iterable<string> | undefined;

  for (const c of cachedRandomColors) {
    it = getExistingColorIterable();
    let notUsed = notInIterable(c, it);

    if (notUsed) {
      return c;
    }
  }

  let newColor: string | undefined;
  do {
    it = getExistingColorIterable();
    newColor = randomColor();
  } while (!notInIterable(newColor, it));

  return newColor;
}

export function computeLighterColor(cssHexColor: string, coef: number = 0.2) {
  coef = Math.max(0, Math.min(1, coef));

  const hsl: [number, number, number] = ColorConvert.hex.hsl(cssHexColor);

  hsl[2] = 100 - (100 - hsl[2]) * 0.03;

  return '#' + ColorConvert.hsl.hex(hsl);
}
