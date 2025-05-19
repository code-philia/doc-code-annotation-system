import { RenderedDocument } from "./utils";

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

export interface AnnotationDocumentItem {     // document is not documentation, it could be documentation or code
  /** Annotation task scope unique id of this annotation content. */
  id: string;
  /** Display name of the annotation content. */
  name: string;
  /** Content of the document, a documentation or code file. All line breaks should be converted to \n to match `range.toString()` in HTML interface. Optional for folders. */
  content?: string;
  /** Optional local path, which is only available in Electron build. */
  localPath?: string;
  /** Type of the item, 'file' or 'folder' */
  type: 'file' | 'folder';
  /** Children items, for folder type */
  children?: AnnotationDocumentItem[];
  /** Optional attached resources such as images, which is only available in Electron build. */
  resources?: {
    /** Type of a resource, probably MIME type in practical use. */
    type: string;
    /** Identification used path, for reference from the document. */
    path: string;
    /** Optional data, with format related to `type`. */
    data?: any;
  }[];

  /** If is expanded in UI in runtime. */
  isExpanded?: boolean; // Used for UI expansion state in tree for folders

  /** Render cache. */
  renderedDocument?: RenderedDocument;
  /** Dynamic cache for range reveal in React render. */
  afterRender?: () => void;
  isNewlySelectedInPanel?: boolean; // Added for panel interaction
}
