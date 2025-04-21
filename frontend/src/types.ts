import { RenderedDocument } from "components/utils";

export interface DocumentRange {
  start: number;
  end: number;
  content: string;
  documentId?: string;
  coloredElements?: HTMLElement[];
}

export interface Annotation {
  id: string;
  category: string;
  docRanges: DocumentRange[];
  codeRanges: DocumentRange[];
  updateTime: string;
  /** Displayed Color, in CSS Hex format, either starting with '#' or not */
  color?: string;
  lighterColor?: string;
}

export interface AnnotationDocumentItem {     // document is not documentation
  id: string;
  name: string;
  /** Content of the document, a documentation or code file. All line breaks should be converted to \n to match `range.toString()` in HTML interface. */
  content: string;
  isExpanded: boolean;
  localPath?: string;

  /** Render cache */
  renderedDocument?: RenderedDocument;
  /** Dynamic cache for range reveal in React render */
  afterRender?: () => void;
}
