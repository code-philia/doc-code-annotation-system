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

// [Document (Now regularized as Markdown only) ↔ HTML ↔ Selection]
// mapping and highlighting

export interface ColorSetUp {
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
        this.renderedDocument = this.sourceDocument;
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

    const startOffset = findOffsetFromPosition(limitedRange.startContainer, limitedRange.startOffset, rootElement);
    const endOffset = findOffsetFromPosition(limitedRange.endContainer, limitedRange.endOffset, rootElement);

    if (startOffset === null || endOffset === null) {
      return [0, 0];
    }

    return [startOffset, endOffset];
  }

  getTargetDocumentRange(rootElement: HTMLElement, start: number, end: number): Range | null {
    const startPosition = findPositionFromOffset(start, rootElement);
    const endPosition = findPositionFromOffset(end, rootElement);

    if (startPosition === null || endPosition === null) {
      return null;
    }

    const range = new Range();
    range.setStart(startPosition[0], startPosition[1]);
    range.setEnd(endPosition[0], endPosition[1]);

    return range;
  }

  colorOne(rootElement: HTMLElement, coloredRange: ColorSetUp) {
    const coloredStyle = {
      cursor: 'pointer',
      backgroundColor: coloredRange.lighterColor,
      borderBottom: `2px solid ${coloredRange.color}`,
      backgroundClip: "border-box"
    };

    for (const range of coloredRange.ranges) {
      // line the borders
      const htmlRange = this.getTargetDocumentRange(rootElement, range.start, range.end);
      if (htmlRange === null) {
        return;
      }

      const lca = htmlRange.commonAncestorContainer;

      const leftBorderParents: Node[] = [];
      const rightBorderParents: Node[] = [];

      let node: Node | null
      for (node = htmlRange.startContainer; node && node !== lca; node = node.parentNode) {
        leftBorderParents.push(node);
      }
      for (node = htmlRange.endContainer; node && node !== lca; node = node.parentNode) {
        rightBorderParents.push(node);
      }

      const getStartChildAtDepth = (d: number) => leftBorderParents.at(-d);
      const getEndChildAtDepth = (d: number) => rightBorderParents.at(-d);

      const addColoredStyle = (element: HTMLElement) => {
        for (const attr in coloredStyle) {
          element.style[attr as Exclude<keyof CSSStyleDeclaration, 'length' | 'parentRule'>] = coloredStyle[attr as keyof typeof coloredStyle] as any;
        }
      }

      const addHandler = (element: HTMLElement) => {
        const handleClick = coloredRange.handleClick;
        if (handleClick)
          element.onclick = (e) => handleClick(e, range);
      }

      const doColor = (element: HTMLElement) => {
        addColoredStyle(element);
        addHandler(element);
      }

      const colorText = (text: Text) => {
        const fullText = text.textContent!;

        let startOffset = 0;
        let endOffset = undefined;

        let textBefore: Node | undefined;
        let coloredText: HTMLElement | undefined;
        let textAfter: Node | undefined;

        if (text === htmlRange.startContainer && htmlRange.startOffset > 0) {
          textBefore = document.createTextNode(fullText.slice(0, htmlRange.startOffset));
          startOffset = htmlRange.startOffset;
        }

        if (text === htmlRange.endContainer && htmlRange.endOffset < (text.textContent?.length ?? 0)) {
          textAfter = document.createTextNode(fullText.slice(htmlRange.endOffset));
          endOffset = htmlRange.endOffset;
        }

        coloredText = document.createElement('span');
        coloredText.textContent = fullText.slice(startOffset, endOffset);
        doColor(coloredText);

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
      }

      const colorNode = (currentNode: Node, depth: number, trimStart: boolean, trimEnd: boolean) => {
        const startChild = trimStart ? getStartChildAtDepth(depth) : undefined;
        const endChild = trimEnd ? getEndChildAtDepth(depth) : undefined;

        depth += 1;

        // FIXME core logic, is nesting too much here
        if (
          currentNode instanceof Text
          && currentNode.textContent !== null
          && currentNode.textContent.trim() !== ''
        ) {
          // parent.replaceChildren();   // NOTE While doing this, the range/selection that covers here will immediately be inactivated!
          colorText(currentNode);
        } else if (currentNode instanceof HTMLElement) {   // FIXME splitting doesn't work here now
          if (startChild === undefined && endChild === undefined) {
            doColor(currentNode);
          } else {
            // find start child node
            const children = currentNode.childNodes;
            let i = 0;
            for (; startChild && i < children.length && children[i] !== startChild; i++);

            const startIndex = i;

            // color them, until the end child node
            while (i < children.length) {
              if (i === startIndex && trimStart) {
                colorNode(children[i], depth, true, false);
              } else if (children[i] === endChild && trimEnd) {
                colorNode(children[i], depth, false, true);
                break;
              } else {
                colorNode(children[i], depth, false, false);
              }
              i++;
            };
          }
        }
      }

      colorNode(lca, 1, true, true);   // from borderChild.at(-1)
    }
  }

  colorAll(rootElement: HTMLElement, coloredRanges: ColorSetUp[]) {
    for (const range of coloredRanges) {
      this.colorOne(rootElement, range);
    }
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

export function tableRowHandler(state: State, node: any, parent: Parents | undefined) {
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

export function text(state: State, node: any) {
  const result: any = {
    type: 'element',
    tagName: 'span',
    children: [{
      type: 'text',
      value: trimLines(String(node.value)),
    }]
  }

  const properties: any = {}
  properties['parse-start'] = node.position.start.offset
  properties['parse-end'] = node.position.end.offset
  result.properties = properties

  state.patch(node, result)
  return state.applyData(node, result)
}

export function inlineCode(state: State, node: any) {
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

// new handlers to record specific parse-start and parse-end
customHandlers.tableRow = tableRowHandler;
customHandlers.text = text;               // NOTE: Wrapping text node again is the simplest way to handle: '| xxx' in source document could be parsed to 'xxx'
customHandlers.inlineCode = inlineCode;   // NOTE: Wrapping code node again is the simplest way to handle: '`xxx`' in source document could be parsed to 'xxx'

export async function convertMarkdownWithMathToHTML(markdownText: string) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, {
      handlers: customHandlers
    } as any)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(markdownText)

  return file.toString();
}

// find the first ancestor node with 'parse-start' attribute until `rootElement`
export function findOffsetFromPosition(container: Node, offset: number, rootElement: Element): number | null {
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
        const _offset = getCaretCharacterOffsetWithin(container, offset, node);
        return _offset === null ? null : j - ((node.textContent?.length ?? 0) - _offset);   // NOTE <td> parse-start will start from '| xxx' in source document
      }
    }

    if (node === rootElement) {
      const _offset = getCaretCharacterOffsetWithin(container, offset, rootElement);
      return _offset;
    }
  }

  return null;
}

export function findPositionFromOffset(offset: number, rootElement: Element): [Node, number] | null {
  const findPositionIn = (nodeStartOffset: number, node: Node): [Node, number] | null => {
    let length: number | undefined;
    let parsedStartOffset: number | undefined;
    let parsedEndOffset: number | undefined;

    // determine offset from the node itself, else from its previous or next sibling
    if (node instanceof HTMLElement) {
      parsedStartOffset = parseInt(node.getAttribute('parse-start') ?? 'nan');
      parsedEndOffset = parseInt(node.getAttribute('parse-end') ?? 'nan');

      if (Number.isNaN(parsedStartOffset)) {
        parsedStartOffset = undefined;
      }

      if (Number.isNaN(parsedEndOffset)) {
        parsedEndOffset = undefined;
      }
    }

    let sibling: Node | null;
    if (parsedStartOffset === undefined && (sibling = node.previousSibling) && (sibling instanceof HTMLElement)) {
      parsedStartOffset = parseInt(sibling.getAttribute('parse-end') ?? 'nan');

      if (Number.isNaN(parsedStartOffset)) {
        parsedStartOffset = undefined;
      }
    }
    if (parsedEndOffset === undefined && (sibling = node.nextSibling) && (sibling instanceof HTMLElement)) {
      parsedEndOffset = parseInt(sibling.getAttribute('parse-start') ?? 'nan');

      if (Number.isNaN(parsedEndOffset)) {
        parsedEndOffset = undefined;
      }
    }

    if (parsedStartOffset === undefined) {
      parsedStartOffset = nodeStartOffset;
    }

    if (node instanceof Text) {
      length = node.textContent?.length ?? 0;
      if (!   // Except if we accurately know it is out of range
        (
          (parsedStartOffset !== undefined && offset < parsedStartOffset)
          || (parsedEndOffset !== undefined && offset > parsedEndOffset)
        )
      ) {
        if (offset - parsedStartOffset <= (node.textContent?.length ?? 0)) {
          return [node, offset - parsedStartOffset];    // NOTE: '| xxx' in source document could be parsed to 'xxx', so the length is difficult to determine. In a same way as above, we calculate the offset from behind
        }
      }
    } else if (node instanceof HTMLElement) {
      parsedStartOffset = parseInt(node.getAttribute('parse-start') ?? 'nan');
      parsedEndOffset = parseInt(node.getAttribute('parse-end') ?? 'nan');
      if (!isNaN(parsedStartOffset) && !isNaN(parsedEndOffset)) {
        length = parsedEndOffset - parsedStartOffset;
      }
      if (node.childNodes.length > 0) {
        if (parsedStartOffset <= offset && offset <= parsedEndOffset) {       // accurate offset
          return findPositionIn(parsedStartOffset, node.childNodes[0]);
        }
        if (!(length !== undefined && offset - nodeStartOffset > length)) {   // inaccurate accumulative offset
          return findPositionIn(nodeStartOffset, node.childNodes[0]);
        }
      }
    }

    // if no length defined or offset is out of length, go to the next sibling
    let _node: Node | null = node;   // node to find the next sibling, going up the tree
    for (; _node && _node !== rootElement && _node.nextSibling === null; _node = _node.parentNode);

    if (_node === rootElement) {
      return null;
    }

    const _sibling = _node?.nextSibling;
    if (_sibling) {
      return findPositionIn(nodeStartOffset + (length ?? 0), _sibling);
    } else {
      return null;
    }
  }

  return findPositionIn(0, rootElement);
}

// Node Operations

function replaceNodeWithTwo(oldNode: Node, newNode1: Node, newNode2: Node) {
  const parent = oldNode.parentNode;

  if (parent) {
    parent.insertBefore(newNode1, oldNode);
    parent.insertBefore(newNode2, oldNode);
    parent.removeChild(oldNode);
  }
}
