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
