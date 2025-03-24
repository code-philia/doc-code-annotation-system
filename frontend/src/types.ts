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
}

export interface DocumentItem {
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