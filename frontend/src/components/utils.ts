import ColorConvert from 'color-convert';
import { State } from 'mdast-util-to-hast';
import { Parents } from 'mdast-util-to-hast/lib/handlers/list-item';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';    // NOTE sanitize will remove custom parse-start and parse-end attributes
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { defaultHandlers } from 'remark-rehype';
import { DocumentRange } from 'types';
import { unified } from 'unified';
import { trimLines } from 'trim-lines';
import { CSSProperties } from 'react';

// UUID generation
// FIXME small probability of collision
export function generateUUID() {
  return crypto.randomUUID();
}

// https://stackoverflow.com/questions/4811822/get-a-ranges-start-and-end-offsets-relative-to-its-parent-container
export function getCaretCharacterOffsetWithin(container: Node, offset: number, element: Element, atStart = true): number | null {
  let caretOffset: number | null = null;

  var preCaretRange = new Range();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(container, offset);
  caretOffset = preCaretRange.toString().length;

  return caretOffset;
}

// Random color generation algorithm
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript

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
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
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
const cachedRandomColorRGB: [number, number, number][] = [];  // [r, g, b] format colors

function _randomColor() {
  randomCounter += 1;

  const h = 360 * randFp();
  const s = 60 + 40 * randFp();
  const l = 30 + 20 * randFp();

  return ColorConvert.hsl.rgb([h, s, l]);
}

function randomColor() {
  let distantColor = findAsDistantAsPossible(
    _randomColor,
    ([r1, g1, b1], [r2, g2, b2]) => Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)),
    () => cachedRandomColorRGB.values(),
    70,
    30,
    10
  )

  if (!distantColor) {
    distantColor = [0, 0, 0];
  }

  const newColorHex = '#' + ColorConvert.rgb.hex(distantColor);
  cachedRandomColors.push(newColorHex);
  cachedRandomColorRGB.push(distantColor);

  return newColorHex;
}

function findAsDistantAsPossible<T>(generate: () => T, getDistance: (a: T, b: T) => number, getIterable: () => Iterable<T>, initialDistanceLimit: number, step: number, tries: number) {
  let distance = initialDistanceLimit;

  while (true) {
    for (let i = 0; i < tries; ++i) {
      const x = generate();
      const it = getIterable();

      let ok = true;

      for (const y of it) {
        if (getDistance(x, y) <= distance) {
          ok = false;
          break;
        }
      }

      if (ok) {
        return x;
      }
    }

    if (distance <= 0) {
      break;
    }

    distance = Math.max(distance - step, 0);
  }

  return null;
}

function notInIterable<T>(value: T, existingIterable: Iterable<T>, fallback?: T) {
  let notIn = true;

  if (value === fallback) {
    return notIn;
  }

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

// [Document (Now regularized as Markdown only) ↔ HTML ↔ Selection]
// mapping and highlighting

export interface ColorSetUp {
  /** id for mapping */
  id: string;
  /** Offsets in a source document (a documentation or code source file) to be colored. */
  ranges: DocumentRange[];
  /** CSS-supported color attribute. */
  color: string;
  /** CSS-supported color attribute. */
  lighterColor: string;
  handleClick?: (e: MouseEvent, range: DocumentRange) => any;
}

export class RenderedDocument {
  readonly sourceDocument: string;
  renderedDocument: string | undefined;
  type: 'markdown' | 'code';

  constructor(sourceDocument: string, type: 'markdown' | 'code') {
    this.sourceDocument = sourceDocument;
    this.type = type;
  }

  async render(): Promise<string> {
    if (this.renderedDocument === undefined) {
      if (this.type === 'markdown') {
        this.renderedDocument = await convertMarkdownWithMathToHTML(this.sourceDocument);
      } else {
        const textLines = splitLines(this.sourceDocument, true);

        let innerHTML = '';
        let offset = 0;
        const createWrapperSpan = (line: string) => {
          line = line.match(/.*?(\r|\r?\n|$)/)?.[0] ?? '';

          const wrapperCode = document.createElement('code');   // FIXME line number of more than 3 digits will not be in good style
          wrapperCode.className = 'annotation-skip';

          const wrapperSpan = document.createElement('span');
          wrapperSpan.className = 'parse-wrapper-span';
          wrapperSpan.setAttribute('parse-start', `${offset}`);
          wrapperSpan.setAttribute('parse-end', `${offset += line.length}`);
          wrapperSpan.textContent = line;

          wrapperCode.appendChild(wrapperSpan);
          innerHTML += wrapperCode.outerHTML;

          wrapperSpan.remove();
        }

        textLines.forEach(createWrapperSpan);

        this.renderedDocument = innerHTML;
      }
    }
    return this.renderedDocument;
  }

  getSourceDocumentRange(rootElement: HTMLElement, range: Range): [number, number] {
    const limitedRange = new Range();
    limitedRange.setStartBefore(rootElement);
    limitedRange.setEndAfter(rootElement);

    const comp = (i: number) => range.compareBoundaryPoints(i, limitedRange);

    if (
      comp(Range.END_TO_START) >= 0       // range start is behind element's end
      || comp(Range.START_TO_END) <= 0    // range end is before element's start
    ) {
      return [0, 0];
    }

    if (comp(Range.START_TO_START) > 0) { // range start is behind element start
      limitedRange.setStart(range.startContainer, range.startOffset);
    }

    if (comp(Range.END_TO_END) < 0) {     // range end is before element end
      limitedRange.setEnd(range.endContainer, range.endOffset);
    }

    const startOffset = findOffsetFromPosition(limitedRange.startContainer, limitedRange.startOffset, rootElement, 'start');
    const endOffset = findOffsetFromPosition(limitedRange.endContainer, limitedRange.endOffset, rootElement, 'end');

    if (startOffset === null || endOffset === null) {
      return [0, 0];
    }

    return [startOffset, endOffset];
  }

  getTargetDocumentRange(rootElement: HTMLElement, start: number, end: number): Range | null {
    const startPosition = findPositionFromOffset(start, rootElement, true, false);
    const endPosition = findPositionFromOffset(end, rootElement, false, true);

    const range = new Range();
    if (startPosition === null) {
      range.setStartBefore(rootElement);
    } else {
      range.setStart(startPosition[0], startPosition[1]);
    }

    if (endPosition === null) {
      range.setEndAfter(rootElement);
    } else {
      range.setEnd(endPosition[0], endPosition[1]);
    }

    return range;
  }

  colorOne(rootElement: HTMLElement, coloredRange: ColorSetUp) {
    const coloredStyle: CSSProperties = {
      cursor: 'pointer',
      backgroundColor: coloredRange.lighterColor,
      backgroundClip: 'border-box',
      borderBottomColor: `${coloredRange.color}`,     // for table cells, still need to alter border color
      boxShadow: `0 2px 0 0 ${coloredRange.color}`,   // adding a border without affecting size, https://stackoverflow.com/a/70334638/17760236
      // FIXME some box shadow will not display for adjacent elements like <li>, only <li> is fixed in CSS by adding a margin-bottom
    };

    // const spanColoredStyle: CSSProperties = {
    //   marginBottom: '-2px'
    // };

    const colorRange = (range: DocumentRange) => {
      range.coloredElements = [];

      // line the borders
      const htmlRange = this.getTargetDocumentRange(rootElement, range.start, range.end);
      if (htmlRange === null) {
        return;
      }

      const lca = htmlRange.commonAncestorContainer;

      const leftBorderParents: Node[] = [];
      const rightBorderParents: Node[] = [];
      const leftBorderAtStart: boolean[] = [];
      const rightBorderAtEnd: boolean[] = [];

      let hitsStart = htmlRange.startOffset === 0;
      let hitsEnd = htmlRange.endOffset === getNodeMaxOffset(htmlRange.endContainer);

      let node: Node | null;
      for (node = htmlRange.startContainer; node && node !== lca; node = node.parentNode) {
        leftBorderParents.push(node);
        hitsStart &&= (node === node.parentNode?.firstChild);
        leftBorderAtStart.push(hitsStart);
      }
      for (node = htmlRange.endContainer; node && node !== lca; node = node.parentNode) {
        rightBorderParents.push(node);
        hitsEnd &&= (node === node.parentNode?.lastChild);
        rightBorderAtEnd.push(hitsEnd);
      }

      const getStartChildAtDepth = (d: number) => leftBorderParents.at(-d);
      const getEndChildAtDepth = (d: number) => rightBorderParents.at(-d);
      const getIsLeftBorderAtStartAtDepth = (d: number) => leftBorderAtStart.at(-d);
      const getIsRightBorderAtEndAtDepth = (d: number) => rightBorderAtEnd.at(-d);

      const addColoredStyle = (element: HTMLElement) => {
        // // NOTE This is to keep element size while adding a border to it

        // const isInline = window.getComputedStyle(element).getPropertyValue('display');
        // if (isInline !== 'inline') {
        //   const originalBorderBottomWidth = getStyleInPixel(element, 'border-bottom-width') ?? 0;

        //   let marginReduce = 0;

        //   // In case of margin collapse

        //   let sib: Element | null = null;
        //   for (let e: HTMLElement | null = element; e; e = e.parentElement) {
        //     if ((sib = e.nextElementSibling) && (sib instanceof HTMLElement)) {
        //       break;
        //     }
        //   }

        //   const nextTreeSibling = sib;

        //   if (nextTreeSibling && nextTreeSibling instanceof HTMLElement) {
        //     const siblingMarginTop = getStyleInPixel(nextTreeSibling, 'margin-top') ?? 0;
        //     marginReduce = siblingMarginTop - (2 - originalBorderBottomWidth);
        //     nextTreeSibling.style.marginTop = `${marginReduce}px`

        //     // prevent margin collapsing
        //     let prevSibling: Element | null = nextTreeSibling.previousElementSibling;
        //     if (prevSibling && prevSibling instanceof HTMLElement) {


        //       const originalMarginBottom = getStyleInPixel(prevSibling, 'margin-bottom') ?? 0;
        //       marginReduce = originalMarginBottom - (2 - originalBorderBottomWidth);
        //       prevSibling.style.marginBottom = `${marginReduce}px`
        //     }
        //   } else {
        //     const originalMarginBottom = getStyleInPixel(element, 'margin-bottom') ?? 0;
        //     marginReduce = originalMarginBottom - (2 - originalBorderBottomWidth);
        //     element.style.marginBottom = `${marginReduce}px`;
        //   }
        // }


        element.classList.add('annotation-colored-element');

        for (const attr in coloredStyle) {
          const _attr = attr as Exclude<keyof CSSStyleDeclaration, 'length' | 'parentRule'>;
          element.style[_attr] = coloredStyle[attr as keyof typeof coloredStyle] as any;
        }
        // if (element instanceof HTMLSpanElement) {
        //   for (const attr in spanColoredStyle) {
        //     const _attr = attr as Exclude<keyof CSSStyleDeclaration, 'length' | 'parentRule'>;
        //     element.style[_attr] = spanColoredStyle[attr as keyof typeof coloredStyle] as any;
        //   }
        // }
      }

      const addHandler = (element: HTMLElement) => {
        const handleClick = coloredRange.handleClick;
        if (handleClick)
          element.onclick = (e) => handleClick(e, range);
      }

      const doColor = (element: HTMLElement) => {
        addColoredStyle(element);
        addHandler(element);

        range.coloredElements!.push(element);
      }

      const colorText = (text: Text, documentStartOffset: number) => {
        const textContent = text.textContent!;

        let startOffset = 0;
        let endOffset = textContent.length;

        let textBefore: Node | undefined;
        let coloredText: HTMLElement | undefined;
        let textAfter: Node | undefined;

        if (text === htmlRange.startContainer && htmlRange.startOffset > 0) {
          textBefore = document.createTextNode(textContent.slice(0, htmlRange.startOffset));
          startOffset = htmlRange.startOffset;
        }

        if (text === htmlRange.endContainer && htmlRange.endOffset < getNodeMaxOffset(text)) {
          textAfter = document.createTextNode(textContent.slice(htmlRange.endOffset));
          endOffset = htmlRange.endOffset;
        }

        coloredText = document.createElement('span');
        coloredText.className = 'parse-wrapper-span';
        coloredText.setAttribute('parse-start', `${documentStartOffset + startOffset}`);
        coloredText.setAttribute('parse-end', `${documentStartOffset + endOffset}`);
        coloredText.textContent = textContent.slice(startOffset, endOffset);

        // NOTE while inserting, the original range will immediately be inactivated
        if (textBefore) {
          text.before(textBefore);
        }
        if (coloredText) {
          text.before(coloredText);
        }
        if (textAfter) {
          text.after(textAfter);
        }

        text.remove();

        doColor(coloredText);

        return coloredText;
      }

      const colorNode = (currentNode: Node, depth: number, trimStart: boolean, trimEnd: boolean, documentStartOffset: number) => {
        if (currentNode === htmlRange.startContainer && htmlRange.startOffset >= getNodeMaxOffset(currentNode)) {
          return;
        }
        if (currentNode === htmlRange.endContainer && htmlRange.endOffset === 0) {
          return;
        }

        const startChild = trimStart ? getStartChildAtDepth(depth) : undefined;
        const endChild = trimEnd ? getEndChildAtDepth(depth) : undefined;
        const startChildAtStart = getIsLeftBorderAtStartAtDepth(depth);
        const endChildAtEnd = getIsRightBorderAtEndAtDepth(depth);

        // FIXME core logic, is nesting too much here
        if (
          currentNode instanceof Text
          && currentNode.textContent !== null
          && currentNode.textContent.trim() !== ''
        ) {
          // parent.replaceChildren();   // NOTE While doing this, the range/selection that covers here will immediately be inactivated!
          colorText(currentNode, documentStartOffset);
        } else if (currentNode instanceof HTMLElement) {   // FIXME splitting doesn't work here now
          let shouldColorAll =
            !currentNode.classList.contains('annotation-skip') &&   // if is each line of code, do not color its ::before element (line number)
            (
              !(startChild || endChild) ||                          // if no startChild or endChild is a splitting point of this element
              !(                                                    // if no startChild at start and no endChild at end
                (startChild && !startChildAtStart) ||
                (endChild && !endChildAtEnd)
              )
            );

          if (shouldColorAll) {
            doColor(currentNode);
          } else {
            // find start child node
            const childNodes = [...currentNode.childNodes];   // NOTE currentNode.childNodes may change when coloring!

            let startIndex = 0;
            let endIndex = childNodes.length - 1;

            if (startChild) {
              let i = 0;
              for (; i <= endIndex && childNodes[i] !== startChild; i++);
              if (i <= endIndex) {
                startIndex = i;
              }
            }

            if (endChild) {
              let i = childNodes.length - 1;
              for (; i >= startIndex && childNodes[i] !== endChild; i--);
              if (i >= startIndex) {
                endIndex = i;
              }
            }

            let currentOffset = documentStartOffset;

            for (let j = startIndex; j <= endIndex; j++) {
              const childNode = childNodes[j];
              if (isEmptyTextNode(childNode)) continue;

              // add guard for start and end offset, cause we did not check childNode parsed offsets like code in `findPositionFromOffset`

              let lastOffset: number | null;
              if (lastOffset = getStartOffset(childNode)) {
                currentOffset = lastOffset;
              }
              colorNode(childNode, depth + 1, j === startIndex && trimStart, j === endIndex && trimEnd, currentOffset);

              if (lastOffset = getEndOffset(childNode)) {
                currentOffset = lastOffset;
              } else {
                currentOffset = currentOffset + (childNode.textContent?.length ?? 0);
              }
            };
          }
        }
      }

      const documentStartOffset = getPossibleParsedStartOffset(lca);

      colorNode(lca, 1, true, true, documentStartOffset);   // from borderChild.at(-1)
    };

    const colorTasks: {
      w: number,
      task: () => void
    }[] = [];

    coloredRange.ranges.forEach((range) => colorTasks.push({
      w: range.content.length,
      task: () => colorRange(range)
    }));

    return colorTasks;
  }

  colorAll(rootElement: HTMLElement, coloredRanges: ColorSetUp[]) {
    const colorTasks: {
      w: number,
      task: () => void
    }[] = [];

    coloredRanges.forEach((color, index) => {
      const colorSetUpTasks = this.colorOne(rootElement, color);
      colorTasks.push(...colorSetUpTasks);
    });

    colorTasks.sort((a, b) => b.w - a.w);

    colorTasks.forEach(c => c.task());
  }
}

// record parse 'start' and 'end' through custom handlers
const customHandlers = defaultHandlers;

for (const _handlerType in customHandlers) {
  const handlerType = _handlerType as keyof typeof defaultHandlers;
  const _handler = customHandlers[handlerType];
  const handler = (state: State, node: any, parent: Parents | undefined) => {
    const _element = _handler(state, node, parent);
    if (_element !== undefined && 'properties' in _element) {
      _element.properties = {
        ..._element.properties,
        ['parse-start']: node.position.start.offset,
        ['parse-end']: node.position.end.offset
      }
    }
    return _element;
  }
  customHandlers[handlerType] = handler as any;
}

function tableRowHandler(state: State, node: any, parent: Parents | undefined) {
  const siblings = parent ? parent.children : undefined
  const rowIndex = siblings ? siblings.indexOf(node) : 1
  const tagName = rowIndex === 0 ? 'th' : 'td'
  const align = parent && parent.type === 'table' ? parent.align : undefined
  const length = align ? align.length : node.children.length
  let cellIndex = -1
  /** @type {Array<ElementContent>} */
  const cells = []

  while (++cellIndex < length) {
    const cell = node.children[cellIndex]
    /** @type {Properties} */
    const properties: any = {}
    const alignValue = align ? align[cellIndex] : undefined

    if (alignValue) {
      properties.align = alignValue
    }

    if (cell) {
      properties['parse-start'] = cell.position.start.offset,
        properties['parse-end'] = cell.position.end.offset
    }

    /** @type {Element} */
    let result: any = { type: 'element', tagName, properties, children: [] }

    if (cell) {
      result.children = state.all(cell)
      state.patch(cell, result)
      result = state.applyData(cell, result)
    }

    cells.push(result)
  }

  /** @type {Element} */
  const result = {
    type: 'element',
    tagName: 'tr',
    properties: {},
    children: state.wrap(cells, true)
  }
  state.patch(node, result as any)
  return state.applyData(node, result as any)
}

function text(state: State, node: any) {
  const result: any = {
    type: 'element',
    tagName: 'span',
    properties: {
      className: ['parse-text-wrapper'],
      ['parse-start']: node.position.start.offset,
      ['parse-end']: node.position.end.offset
    },
    children: [{
      type: 'text',
      value: trimLines(String(node.value)),
    }]
  }

  state.patch(node, result)
  return state.applyData(node, result)
}

function inlineCode(state: State, node: any) {
  /** @type {Text} */
  const text: any = {
    type: 'element',
    tagName: 'span',
    properties: {
      ['parse-start']: node.position.start.offset + 1,  // FIXME this is not guaranteed to start and end with '`'?
      ['parse-end']: node.position.end.offset - 1
    },
    children: [{
      type: 'text',
      value: node.value.replace(/\r?\n|\r/g, ' ')
    }]
  }

  state.patch(node, text)

  /** @type {Element} */
  const result: any = {
    type: 'element',
    tagName: 'code',
    properties: {
      ['parse-start']: node.position.start.offset,
      ['parse-end']: node.position.end.offset
    },
    children: [text]
  }
  state.patch(node, result)
  return state.applyData(node, result)
}

export function code(state: State, node: any) {
  const value = node.value ? node.value + '\n' : ''

  const text: any = {
    type: 'element',
    tagName: 'span',
    properties: {
      ['parse-start']: node.position.start.offset + 3,  // Skip ```
      ['parse-end']: node.position.end.offset - 3       // Skip ```
    },
    children: [{
      type: 'text',
      value
    }]
  }

  state.patch(node, text)

  const properties: any = {}
  if (node.lang) {
    properties.className = ['language-' + node.lang]
  }

  properties['parse-start'] = node.position.start.offset
  properties['parse-end'] = node.position.end.offset

  const codeElement: any = {
    type: 'element',
    tagName: 'code',
    properties,
    children: [text]
  }

  if (node.meta) {
    codeElement.data = { meta: node.meta }
  }

  state.patch(node, codeElement)
  const result = state.applyData(node, codeElement)

  const preElement: any = {
    type: 'element',
    tagName: 'pre',
    properties: {
      ['parse-start']: node.position.start.offset,
      ['parse-end']: node.position.end.offset
    },
    children: [result]
  }

  state.patch(node, preElement)

  return preElement
}

// to process inlineMath and Math type nodes
function defaultUnknownHandler(state: State, node: any) {
  const data = node.data || {}
  /** @type {HastElement | HastText} */
  const result: any =
    'value' in node &&
      !(data.hasOwnProperty('hProperties') || data.hasOwnProperty('hChildren'))
      ? { type: 'text', value: node.value }
      : {
        type: 'element',
        tagName: 'div',
        properties: {
          ['parse-start']: node.position.start.offset,
          ['parse-end']: node.position.end.offset
        },
        children: state.all(node)
      }

  // also patch hChildren with parse-start and parse-end
  const hChildren = node.data.hChildren

  if (
    hChildren !== null &&
    hChildren !== undefined
  ) {
    for (const c of hChildren) {
      if (!(c.position)) {
        c.position = node.position
      }
    }
  }

  state.patch(node, result)
  return state.applyData(node, result)
}

// new handlers to record specific parse-start and parse-end
customHandlers.tableRow = tableRowHandler;
customHandlers.text = text;               // NOTE: Wrapping text node again is the simplest way to handle: '| xxx' in source document could be parsed to 'xxx'
customHandlers.inlineCode = inlineCode;   // NOTE: Wrapping code node again is the simplest way to handle: '`xxx`' in source document could be parsed to 'xxx'
customHandlers.code = code;

export async function convertMarkdownWithMathToHTML(markdownText: string) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // .parse(markdownText);
    .use(remarkRehype, {
      handlers: customHandlers,
      unknownHandler: defaultUnknownHandler
    } as any)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(markdownText);

  return file.toString();
}

/**
 * NOTE `findOffsetFromPosition` and `findPositionFromOffset` at start or end
 * will be reduced to the closest position-parsed element (i.e. with `parsed-start` and `parsed-end` position)
 */


// find the first ancestor node with 'parse-start' attribute until `rootElement`

/**
 * Calculate the offset in the source text from an HTML position (the start or end of an HTML range), based on `parse-start` and `parse-end` attributes.
 * @param container     The node of the HTML position.
 * @param offset        The offset from container node of the HTML position.
 * @param rootElement   The rootElement as an outer border to calculate from.
 * @param reduce        To reduce to the border of math element, 'start', 'end', null
 * @returns
 */
export function findOffsetFromPosition(container: Node, offset: number, rootElement: Element, reduce: 'start' | 'end' | null = null): number | null {
  let node: Node | null = container;
  for (; node; node = node.parentNode) {
    let parseStart: string | null;
    let parseEnd: string | null;  // NOTE We use this because <td> parse-start will start from '| xxx' in source document
    if (
      node instanceof HTMLElement
      && (parseStart = node.getAttribute('parse-start')) !== null
      && (parseEnd = node.getAttribute('parse-end')) !== null
    ) {
      let i = parseInt(parseStart);
      let j = parseInt(parseEnd);
      if (!Number.isNaN(i) && !Number.isNaN(j)) {
        // reduce to the start or end of math element
        if (node.classList.contains('parse-math')) {
          if (reduce === 'start') {
            return i;
          }
          if (reduce === 'end') {
            return j;
          }
        }

        const _offset = getCaretCharacterOffsetWithin(container, offset, node);

        if (offset === 0) return i;

        // NOTE <td> parse-start will start from '| xxx' in source document
        // NOTE do not use getTextContentBytesLength here because it is the length as string in sourceDocument
        return _offset === null ? null : j - ((node.textContent?.length ?? 0) - _offset);
      }
    }

    if (node === rootElement) {
      const _offset = getCaretCharacterOffsetWithin(container, offset, rootElement);
      return _offset;
    }
  }

  return null;
}

/**
 * Calculate the HTML position from an offset of the source text, based on `parse-start` and `parse-end` attributes.
 * @param offset The offset in source text.
 * @param rootElement
 * @param reduceStart Option if the position should reduce to the closest non-span element
 * @param reduceEnd Option if the position at the end should reduce to the closest non-span element
 * @returns
 */
export function findPositionFromOffset(offset: number, rootElement: Element, reduceStart: boolean = false, reduceEnd: boolean = false): [Node, number] | null {
  const reduceToAncestor = (node: Node | null, position: number): [Node, number] | null => {
    for (; node
      && (!(node instanceof Element) || isWrapperSpan(node))            // is text or wrapper span
      && (                                                              // is the first or last child node of parent
        (position === 0 && node === node.parentNode?.firstChild)
        || (position !== 0 && node === node.parentNode?.lastChild)
      )
      ; node = node?.parentNode ?? null);

    if (node) {
      if (position === 0) {
        return [node, 0];
      } else {
        return [node, getNodeMaxOffset(node)];
      }
    }

    return null;
  }

  /* 'left' and 'right' indicates the node is on the left or right of offset */
  const findPositionIn = (parentStartOffset: number | null, node: Node): [Node, number] | null | 'left' | 'right' => {
    let parsedStartOffset: number | null;
    let parsedEndOffset: number | null;

    if (node instanceof Text && parentStartOffset !== null) {
      if (0 <= offset - parentStartOffset && offset - parentStartOffset <= getNodeMaxOffset(node)) {
        return [node, offset - parentStartOffset];    // NOTE: '| xxx' in source document could be parsed to 'xxx', but now we wrap each Text Node under such special element with a <span> inside
      }
    } else if (node instanceof HTMLElement) {
      // determine offset from the node itself
      parsedStartOffset = getStartOffset(node);
      parsedEndOffset = getEndOffset(node);

      // else determine offset from its previous or next sibling
      let sibling: Node | null;
      if (parsedStartOffset === null && (sibling = node.previousSibling)) {
        parsedStartOffset = getStartOffset(sibling);
      }
      if (parsedEndOffset === undefined && (sibling = node.nextSibling)) {
        parsedEndOffset = getEndOffset(sibling);
      }

      if (parsedStartOffset !== null && parsedStartOffset > offset) {
        return 'right';
      } else if (parsedEndOffset !== null && offset > parsedEndOffset) {
        return 'left';
      } else if (node.childNodes.length > 0) {
        let resultInChildNodes: [Node, number] | null = null;

        let currentOffset: number | null = parsedStartOffset;
        let lastChildNodeOnLeft: Node | null = null;
        let firstChildNodeOnRight: Node | null = null;

        for (let i = 0; i < node.childNodes.length; ++i) {
          const childNode = node.childNodes[i];
          const result = findPositionIn(currentOffset, childNode);

          if (result === 'left') {
            lastChildNodeOnLeft = childNode;
          } else if (result === 'right') {
            if (firstChildNodeOnRight === null) {
              firstChildNodeOnRight = childNode
            }
          } else if (resultInChildNodes = result) {
            return resultInChildNodes;
          }

          let lastOffset: number | null;
          if (lastOffset = getEndOffset(childNode)) {
            currentOffset = lastOffset;
          } else if (currentOffset !== null && childNode instanceof Text) {
            currentOffset = currentOffset + (childNode.textContent?.length ?? 0);
          } else {
            currentOffset = null;
          }
        }

        if (resultInChildNodes === null) {
          if (reduceStart && parsedStartOffset !== null) {
            if (lastChildNodeOnLeft) {
              return [lastChildNodeOnLeft, getNodeMaxOffset(lastChildNodeOnLeft)];
            } else {
              return [node, 0];
            }
          } else if (reduceEnd && parsedEndOffset !== null) {
            if (firstChildNodeOnRight) {
              return [firstChildNodeOnRight, 0];
            } else {
              return [node, getNodeMaxOffset(node)];
            }
          }
        }
      }
    }

    return null;
  }

  let result = findPositionIn(0, rootElement);

  if (result instanceof Array && (reduceStart || reduceEnd)) {
    const [resultNode, resultOffset] = result;

    if (reduceStart && resultOffset === 0) {
      return reduceToAncestor(resultNode, 0);
    } else if (reduceEnd && resultOffset === getNodeMaxOffset(resultNode)) {
      return reduceToAncestor(resultNode, Number.MAX_SAFE_INTEGER);
    }
  }

  return result instanceof Array ? result : null;
}


// DOM Node Operations

function replaceNodeWithTwo(oldNode: Node, newNode1: Node, newNode2: Node) {
  const parent = oldNode.parentNode;

  if (parent) {
    parent.insertBefore(newNode1, oldNode);
    parent.insertBefore(newNode2, oldNode);
    parent.removeChild(oldNode);
  }
}

function getDepth(node: Node, from: Node = document.documentElement) {
  let i = 0;

  for (; node && node !== from; ++i);

  return i;
}

function getParsedAttribute(node: Node, parsedAttributeName: string): number | null {
  if (!(node instanceof Element)) return null;

  const attributeName = `parse-${parsedAttributeName}`;

  const attribute = parseInt(node.getAttribute(attributeName) ?? 'nan');

  if (isNaN(attribute)) return null;
  return attribute;
}

function getStartOffset(node: Node) {
  return getParsedAttribute(node, 'start');
}

function getEndOffset(node: Node) {
  return getParsedAttribute(node, 'end')
}

function getNodeMaxOffset(node: Node) {
  if (node instanceof Text || node instanceof Comment || node instanceof CDATASection) {
    return node.textContent?.length ?? 0;
  }

  return node.childNodes.length;
}

function isWrapperSpan(node: Node) {
  return node instanceof HTMLSpanElement && node.classList.contains('parse-text-wrapper');
}

function isEmptyTextNode(node: Node) {
  return node instanceof Text && !(node.textContent?.trim());
}

function getPossibleParsedStartOffset(node: Node) {
  let startOffset: number | null = null;
  let currentNode: Node | null = node;

  for (; currentNode; currentNode = currentNode.parentNode) {
    if (startOffset = getStartOffset(currentNode)) {
      return startOffset;
    }

    while (currentNode.previousSibling) {
      currentNode = currentNode.previousSibling;
      if (startOffset = getEndOffset(currentNode)) {
        return startOffset;
      }
    }
  }

  return 0;
}

function getStyleInPixel(element: HTMLElement, styleName: string) {
  const style = window.getComputedStyle(element);
  const value = style.getPropertyValue(styleName);

  let valueInPixel = parseInt(value.split('px')?.[0]);

  if (isNaN(valueInPixel)) {
    return null;
  }
  return valueInPixel
}

// File Utils

export function regularizeFileContent(content: string): string {
  // Use Unix line break
  content = content.replace(/\r?\n|\r/g, '\n');

  // Remove gremlin zero-width whitespaces (U+200b)
  content = content.replace(/\u200b/g, '');

  // Split contiguous inline math `$math1$$math2$`
  content = content.replace(/(?<=\S)\$\$(?=\S)/g, '$ $');

  return content;
}

// Text Utils

export function splitLines(text: string, emptyLastLine: boolean = false): string[] {
  text += '\n';
  const result = text.match(/.*?(\r|\r?\n)/g);

  if (result === null) {
    return [];
  }

  const lastLine = result.pop();
  if (lastLine && (emptyLastLine || lastLine !== '\n')) {
    result.push(lastLine.slice(0, -1));
  }

  return result;
}
