export interface Range {
  start: number;
  end: number;
  content: string;
  documentId?: string;
}

export interface AnnotationCategory {
  name: string;
  documentRanges: Range[];
  codeRanges: Range[];
}

export interface Annotation {
  id: string;
  category: string;
  documentRanges: Range[];
  codeRanges: Range[];
  updateTime: string;
  /** Displayed Color, in CSS Hex format, either starting with '#' or not */
  color?: string;
  lighterColor?: string;
}

export interface DocumentationItem {
  id: string;
  name: string;
  /** Content of the document. All line breaks should be converted to \n to match `range.toString()` in HTML interface. */
  content: string;
  isExpanded: boolean;
}

export interface CodeItem {
  id: string;
  name: string;
  /** Content of the code. All line breaks should be converted to \n to match `range.toString()` in HTML interface. */
  content: string;
  isExpanded: boolean;
}
