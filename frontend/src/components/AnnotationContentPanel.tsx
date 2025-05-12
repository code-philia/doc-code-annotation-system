import React, { useState, useRef, useEffect, MouseEventHandler, useCallback } from 'react';
import { Card, Button, Upload, message, Modal, Input } from 'antd';
import {
  DownloadOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FileTextOutlined,
  DeleteFilled,
  ClearOutlined,
  PlusOutlined,
  FileOutlined
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import classNames from 'classnames';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import jschardet from 'jschardet';

import * as api from '../services/api';
import { AnnotationDocumentItem, DocumentRange, Annotation } from '../types';
import { ColorSetUp, computeLighterColor, regularizeFileContent, RenderedDocument } from './utils';

interface AnnotationContentPanelProps {
  files: AnnotationDocumentItem[];
  annotations: Annotation[];
  searchAnnotations: (keyword: string) => Annotation[];
  targetType: string;
  targetTypeName: string;
  onSetFiles: (filesOrUpdater: AnnotationDocumentItem[] | ((currentFiles: AnnotationDocumentItem[]) => AnnotationDocumentItem[])) => void; // Allow functional updates
  onUpload?: (result: { id: string; name: string }) => void;
  onAddToAnnotation?: (range: DocumentRange, targetType: string, annotationId?: string, createNew?: boolean) => void;
  onRevealAnnotationRange?: (annotationId: string, targetType: string, rangeIndex: number) => void;
  onRemoveAnnotationRange?: (range: DocumentRange, targetType: string, annotationId: string) => void;
  onRemoveFile?: (fileId: string, targetType: string) => void; // This might need to handle multiple file IDs for folder deletion
  onRemoveFiles?: (fileIds: string[], targetType: string) => void; // New prop for removing multiple files (e.g., from a folder)
}

const AnnotationDocumentPanel: React.FC<AnnotationContentPanelProps> = ({
  files,
  annotations,
  searchAnnotations,
  targetType,
  targetTypeName,
  onSetFiles,
  onUpload,
  onAddToAnnotation,
  onRevealAnnotationRange,
  onRemoveAnnotationRange,
  onRemoveFile, // Keep for single file deletion logic if still used directly
  onRemoveFiles // Use this for folder deletion cleanup
}) => {
  const [selectedRange, setSelectedRange] = useState<DocumentRange | null>(null);
  const [selectionRectangle, setSelectionPosition] = useState<DOMRect | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [renderedDocument, setRenderedDocument] = useState<RenderedDocument | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);

  const editorContentRef = useRef<HTMLDivElement | null>(null);
  const cachedSelectedRange = useRef<Range | null>(null);

  // Helper function to find an item in the tree (assuming it's defined as per summary)
  const findItemById = useCallback((items: AnnotationDocumentItem[], id: string): AnnotationDocumentItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Helper function to update an item in the tree (assuming it's defined as per summary)
  const updateItemInTree = useCallback((currentFiles: AnnotationDocumentItem[], id: string, updates: Partial<AnnotationDocumentItem>): AnnotationDocumentItem[] => {
    return currentFiles.map(item => {
      if (item.id === id) {
        return { ...item, ...updates };
      }
      if (item.children) {
        return { ...item, children: updateItemInTree(item.children, id, updates) };
      }
      return item;
    });
  }, []);

  // Helper function to remove an item from the tree (assuming it's defined as per summary)
  const removeItemFromTree = useCallback((currentFiles: AnnotationDocumentItem[], idToRemove: string): AnnotationDocumentItem[] => {
    return currentFiles.filter(item => {
      if (item.id === idToRemove) {
        return false;
      }
      if (item.children) {
        item.children = removeItemFromTree(item.children, idToRemove);
      }
      return true;
    });
  }, []);

  // Helper to find the first file in the tree (assuming it's defined as per summary)
  const findFirstFile = useCallback((items: AnnotationDocumentItem[]): AnnotationDocumentItem | null => {
    for (const item of items) {
      if (item.type === 'file') return item;
      if (item.type === 'folder' && item.children) {
        const firstFileInChildren = findFirstFile(item.children);
        if (firstFileInChildren) return firstFileInChildren;
      }
    }
    return null;
  }, []);

  // Helper to get all file IDs from the entire tree
  const getAllFileIdsInTree = (items: AnnotationDocumentItem[]): string[] => {
    let ids: string[] = [];
    for (const item of items) {
      if (item.type === 'file') {
        ids.push(item.id);
      }
      if (item.children) {
        ids = ids.concat(getAllFileIdsInTree(item.children));
      }
    }
    return ids;
  };


  // Effect to select the first file when files are loaded or changed
  useEffect(() => {
    if (files.length > 0 && !selectedFileId) {
      const firstFile = findFirstFile(files);
      if (firstFile) {
        setSelectedFileId(firstFile.id);
      }
    } else if (selectedFileId && !findItemById(files, selectedFileId)) {
      // If selected file is removed, select the first available file
      const firstFile = findFirstFile(files);
      setSelectedFileId(firstFile ? firstFile.id : null);
    } else if (files.length === 0) {
      setSelectedFileId(null);
      setRenderedDocument(null);
    }
  }, [files, selectedFileId, findItemById, findFirstFile]);


  // Effect to handle newly selected file from App.tsx (for handleRevealRange)
  useEffect(() => {
    const newlySelectedItem = files.flatMap(f => f.isNewlySelectedInPanel ? [f] : (f.children ? f.children.filter(cf => cf.isNewlySelectedInPanel) : [])).find(i => i); // Simplified search

    if (newlySelectedItem) {
      const itemInTree = findItemById(files, newlySelectedItem.id); // Ensure we use the item from the current tree state
      if (itemInTree) {
        setSelectedFileId(itemInTree.id);
        // If it's a file and content is not loaded, loadContentForFile will be triggered by another useEffect
        // If it's a folder, we might want to expand its parents (not implemented here yet)

        // Remove the flag using functional update to onSetFiles
        // onSetFiles(currentFiles => updateItemInTree(currentFiles, itemInTree.id, { isNewlySelectedInPanel: false }));
        files.splice(0, files.length, ...updateItemInTree(files, itemInTree.id, { isNewlySelectedInPanel: false }));
      }
    }
  }, [files, findItemById, updateItemInTree]);

  const loadContentForFile = useCallback(async (fileId: string, filePath: string) => {
    // No longer directly sets isLoadingContent or renderedDocument here.
    // This will be handled by the useEffect hook observing selectedFileId and files changes.
    try {
      const contentBuffer = await window.localFunctionality.retrieveLocalResource(filePath);
      if (contentBuffer) {
        const encoding = jschardet.detect(Buffer.from(contentBuffer)).encoding ?? 'GB18030';  // 难以检测，所以默认为 GB18030，见 https://github.com/aadsm/jschardet/issues/49
        const content = new TextDecoder(encoding).decode(contentBuffer);
        onSetFiles(prevFiles => updateItemInTree(prevFiles, fileId, { content }));
        // The useEffect for selectedFileId will pick up this change in 'files'
        // and then create the RenderedDocument.
      } else {
        throw new Error('File content is empty or could not be retrieved.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error loading content for ${filePath}:`, errorMessage);
      message.error(`加载文件内容失败: ${errorMessage}`);
      // Store error in the file item itself for potential display
      onSetFiles(prevFiles => updateItemInTree(prevFiles, fileId, { content: `Error loading content: ${errorMessage}` }));
      // The useEffect for selectedFileId will see this error content and can decide how to display it.
    }
  }, [onSetFiles, updateItemInTree]);

  // Effect to manage loading and preparing RenderedDocument based on selectedFileId and files content
  useEffect(() => {
    if (!selectedFileId) {
      setRenderedDocument(null);
      setIsLoadingContent(false);
      return;
    }

    const item = findItemById(files, selectedFileId);

    if (!item || item.type === 'folder') {
      setRenderedDocument(null);
      setIsLoadingContent(false);
      return;
    }

    // At this point, item is a file
    // Always clear old document and set loading when selection changes or content might be loading
    setRenderedDocument(null);
    setIsLoadingContent(true);

    if (item.content !== undefined && !item.content.startsWith('Error loading content:')) {
      // Content is already loaded and not an error message
      const doc = new RenderedDocument(item.content, targetType === 'code' ? 'code' : 'markdown', item.localPath);
      item.renderedDocument = doc;

      setRenderedDocument(doc);
      setIsLoadingContent(false);

      // doc.resolveLocalResources().then(() => {
      //   if (selectedFileId === item.id) { // Check if selection is still current
      //     setRenderedDocument(doc);
      //     setIsLoadingContent(false);
      //   }
      // }).catch(err => {
      //   console.error("Error resolving resources for pre-loaded content:", err);
      //   if (selectedFileId === item.id) {
      //     message.error('资源解析失败');
      //     // Optionally, store this error state in a way the rendering useEffect can display it
      //     // For now, renderedDocument remains null, and isLoadingContent will be set to false.
      //     setIsLoadingContent(false);
      //   }
      // });
    } else if (item.content && item.content.startsWith('Error loading content:')) {
      // Content is an error message from a previous load attempt
      // renderedDocument remains null, display the error via main rendering useEffect
      setIsLoadingContent(false);
    } else if (item.localPath) {
      // Content needs to be fetched. loadContentForFile will update 'files',
      // which will cause this useEffect to re-run. isLoadingContent is already true.
      loadContentForFile(selectedFileId, item.localPath);
    } else {
      // File item, but no content and no path to load it
      message.error('文件内容无法加载 (无内容信息且无本地路径)');
      setIsLoadingContent(false);
      // renderedDocument is already null
    }

  }, [selectedFileId, files, targetType, loadContentForFile, findItemById]);

  const handleFileImport = async (file: UploadFile) => {
    // ... (existing handleFileImport logic, ensure it sets type: 'file')
    // Modified to fit the tree structure, adding as a top-level item
    try {
      if (!(file instanceof File)) {
        message.error('无效的文件');
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        message.error('文件太大，请选择小于10MB的文件');
        return false;
      }
      const contentBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
      });

      let content: string | undefined = '';
      const contentBytesBuffer = Buffer.from(contentBytes);

      if (['.doc', '.docx'].some(suffix => file.name.endsWith(suffix))) {
        if (window.localFunctionality) {
          content = await window.localFunctionality.wordDocumentResolve(new Uint8Array(contentBytesBuffer).buffer);
          if (content === undefined) throw new Error('Failed to resolve Word document');
        } else {
          const response = await fetch('http://localhost:5050/word-resolve', { /* ... */ });
          if (!response.ok) throw new Error('Failed to upload file to the server');
          content = await response.text();
        }
      } else {
        const encoding = jschardet.detect(contentBytesBuffer).encoding ?? 'GB18030';
        content = new TextDecoder(encoding).decode(contentBytesBuffer);
      }

      const result = await api.uploadCode(file); // This might need adjustment if it assumes flat structure
      content = regularizeFileContent(content);

      const newFileItem: AnnotationDocumentItem = {
        id: file.url ?? result.id ?? `file-${Date.now()}-${Math.random()}`, // Ensure unique ID
        name: file.name,
        content: content,
        type: 'file', // Explicitly set type
        localPath: (file as any).path, // For Electron
      };

      onSetFiles(currentFiles => [...currentFiles, newFileItem]);
      onUpload?.(result); // This might also need context if it updates a global list
      message.success(`成功导入文件：${file.name}`);
      if (!selectedFileId) {
        setSelectedFileId(newFileItem.id);
      }
    } catch (error) {
      console.error('Failed to import file:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      message.error(`文件导入失败: ${errorMessage}`);
    }
    return false; // Prevent default upload behavior
  };

  const handleFolderImport = async () => {
    const localFunc = window.localFunctionality;
    if (!localFunc || !localFunc.electronShowOpenDialog || !localFunc.scanDirectory || !localFunc.retrieveLocalResource) {
      message.error('此功能所需的文件系统访问接口不完整，请检查 Electron Preload 脚本。');
      return;
    }

    try {
      const dialogResult = await localFunc.electronShowOpenDialog({ properties: ['openDirectory'], title: '选择文件夹' });
      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return;
      }
      const folderPath = dialogResult.filePaths[0];
      const scanResult = await localFunc.scanDirectory(folderPath, targetType === 'doc' ? ['.md', '.markdown'] : undefined);

      if (scanResult.error) {
        message.error(`扫描文件夹失败: ${scanResult.error}`);
        return;
      }

      if (scanResult.fileTree && scanResult.fileTree.length > 0) {
        message.info('正在加载文件夹内容...', 0); // Display loading message, 0 means it won't auto-close

        // Async function to map raw tree and load file contents
        const mapRawTreeAndLoadContents = async (rawItems: any[]): Promise<AnnotationDocumentItem[]> => {
          return Promise.all(rawItems.map(async (rawItem): Promise<AnnotationDocumentItem> => {
            let fileContent: string | undefined = undefined;
            let childrenItems: AnnotationDocumentItem[] | undefined = undefined;

            if (rawItem.type === 'file' && rawItem.path) {
              try {
                const contentBuffer = await localFunc.retrieveLocalResource(rawItem.path);
                if (contentBuffer) {
                  // Use Buffer for jschardet, similar to handleFileImport and loadContentForFile
                  const buffer = Buffer.from(contentBuffer);
                  const encoding = jschardet.detect(buffer).encoding ?? 'GB18030';
                  fileContent = new TextDecoder(encoding).decode(contentBuffer);
                  fileContent = regularizeFileContent(fileContent);
                } else {
                  fileContent = 'Error loading content: File content is empty or could not be retrieved.';
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                fileContent = `Error loading content: ${errorMessage}`;
                console.error(`Error pre-loading content for ${rawItem.path}:`, errorMessage);
              }
            }

            if (rawItem.type === 'folder' && rawItem.children && rawItem.children.length > 0) {
              childrenItems = await mapRawTreeAndLoadContents(rawItem.children);
            } else if (rawItem.type === 'folder') {
              childrenItems = []; // Ensure empty folders have an empty children array
            }

            return {
              id: rawItem.id || `${rawItem.type}-${rawItem.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // More robust ID
              name: rawItem.name,
              type: rawItem.type,
              localPath: rawItem.path,
              content: fileContent, // Content is now pre-loaded for files
              children: childrenItems,
              isExpanded: false, // Default to collapsed
            };
          }));
        };

        try {
          const newFileTree = await mapRawTreeAndLoadContents(scanResult.fileTree);
          message.destroy(); // Clear loading message
          onSetFiles(newFileTree);
          message.success('文件夹导入并加载完成！');
          const firstFile = findFirstFile(newFileTree);
          if (firstFile) {
            setSelectedFileId(firstFile.id);
          } else {
            setSelectedFileId(null);
          }
        } catch (processingError) {
          message.destroy(); // Clear loading message
          console.error('Error processing folder tree and loading files:', processingError);
          const errMessage = processingError instanceof Error ? processingError.message : String(processingError);
          message.error(`处理文件夹内容时出错: ${errMessage}`);
        }

      } else {
        message.info('选择的文件夹中没有找到 Markdown 文件或文件夹为空。');
        onSetFiles([]);
        setSelectedFileId(null);
      }
    } catch (error) {
      console.error('Folder import process error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      message.error(`导入文件夹时出错: ${errorMessage}`);
    }
  };

  const handleClearAll = () => {
    if (files.length === 0) {
      message.info('文件列表已为空。');
      return;
    }

    Modal.confirm({
      title: '确认清空',
      content: '确定要移除所有文件和文件夹吗？相关的标注也将被移除。此操作不可撤销。',
      okText: '全部清除',
      cancelText: '取消',
      okType: 'danger',
      onOk: () => {
        const allFileIds = getAllFileIdsInTree(files);

        if (onRemoveFiles && allFileIds.length > 0) {
          onRemoveFiles(allFileIds, targetType);
        }

        onSetFiles([]); // This will trigger useEffect to update selectedFileId and renderedDocument
        message.success('所有文件和文件夹已清除。');
      },
    });
  };

  const handleItemSelectInTree = (item: AnnotationDocumentItem) => {
    if (item.type === 'folder') {
      // Toggle expansion
      onSetFiles(currentFiles => updateItemInTree(currentFiles, item.id, { isExpanded: !item.isExpanded }));
      // Optionally, select the folder itself or do nothing for selection
      // setSelectedFileId(item.id); // If you want to "select" folders to show info or clear editor
    } else {
      // Select file
      setSelectedFileId(item.id);
      // Content loading is handled by useEffect watching selectedFileId
    }
  };

  const getAllFileIdsFromSubtree = (itemId: string): string[] => {
    const ids: string[] = [];
    const item = findItemById(files, itemId);

    function collect(currentItem: AnnotationDocumentItem) {
      if (currentItem.type === 'file') {
        ids.push(currentItem.id);
      }
      if (currentItem.children) {
        currentItem.children.forEach(collect);
      }
    }

    if (item) {
      collect(item);
    }
    return ids;
  };

  const handleDeleteFileFromTree = (itemIdToDelete: string) => {
    const itemToDelete = findItemById(files, itemIdToDelete);
    if (!itemToDelete) return;

    const confirmMsg = itemToDelete.type === 'folder'
      ? '确定要删除该文件夹及其所有内容吗？相关的标注也将被移除。'
      : '确定要删除该文件吗？相关的标注也将被移除。';

    Modal.confirm({
      title: '确认删除',
      content: confirmMsg,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        const idsToRemove = getAllFileIdsFromSubtree(itemIdToDelete);

        if (onRemoveFiles && idsToRemove.length > 0) {
          onRemoveFiles(idsToRemove, targetType);
        } else if (onRemoveFile && idsToRemove.length === 1 && itemToDelete.type === 'file') { // Fallback for single file if onRemoveFiles not provided
          onRemoveFile(idsToRemove[0], targetType);
        }

        onSetFiles(currentFiles => removeItemFromTree(currentFiles, itemIdToDelete));

        if (selectedFileId === itemIdToDelete || (itemToDelete.type === 'folder' && selectedFileId && idsToRemove.includes(selectedFileId))) {
          const firstFile = findFirstFile(files.filter(f => f.id !== itemIdToDelete)); // Check remaining files
          setSelectedFileId(firstFile ? firstFile.id : null);
        }
        message.success(`${itemToDelete.type === 'folder' ? '文件夹' : '文件'} "${itemToDelete.name}" 已删除`);
      },
    });
  };

  // Event handlers that were previously reported as missing
  const handleMouseDownOnEditor = () => {
    setSelectedRange(null);
    setSelectionPosition(null);
  };

  const handleCodeSelection = async () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selectedFileId || !renderedDocument) {
      setSelectedRange(null);
      setSelectionPosition(null);
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      if (!editorContentRef.current || !editorContentRef.current.contains(range.startContainer)) {
        return;
      }

      const targetFile = findItemById(files, selectedFileId); // Get current file data
      if (!targetFile || targetFile.type !== 'file' || !targetFile.content) {
        console.error('Cannot find target file or its content for selection');
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectionPosition(rect);

      const editorDiv = editorContentRef.current.querySelector(targetType === 'code' ? 'pre.document-block' : 'div.document-block');
      if (editorDiv && editorDiv instanceof HTMLElement) {
        const [start, end] = renderedDocument.getSourceDocumentRange(editorDiv, range);
        if (end - start > 0) {
          cachedSelectedRange.current = range;
          setSelectedRange({
            start: start,
            end: end,
            content: targetFile.content.slice(start, end), // Use content from state
            documentId: selectedFileId
          });
        } else {
          setSelectedRange(null);
          setSelectionPosition(null);
        }
      } else {
        setSelectedRange(null);
        setSelectionPosition(null);
      }
    } catch (error) {
      console.error('Selection error:', error);
      setSelectedRange(null);
      setSelectionPosition(null);
    }
  };

  const handleAddToAnnotation = (annotationId?: string, createNew = false) => {
    if (!selectedRange) {
      message.warning(`请先选择要标注的${targetTypeName}`);
      return;
    }
    onAddToAnnotation?.({
      start: selectedRange.start,
      end: selectedRange.end,
      content: selectedRange.content,
      documentId: selectedRange.documentId
    }, targetType, annotationId, createNew);
    setSelectedRange(null);
    setSelectionPosition(null); // Clear selection rectangle
    window.getSelection()?.removeAllRanges();
  };

  const handleCreateAndApplyAnnotation = async () => {
    if (!selectedRange) {
      message.warning(`请先选择要标注的${targetTypeName}`);
      return;
    }
    handleAddToAnnotation(undefined, true);
  };

  // Main rendering useEffect for editor content
  useEffect(() => {
    if (!editorContentRef.current) return;
    const editorDiv = editorContentRef.current;

    const currentFileItem = selectedFileId ? findItemById(files, selectedFileId) : null;

    if (!selectedFileId || !currentFileItem) {
      editorDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #aaa;">${files.length > 0 ? '请选择一个文件查看内容。' : '请导入文件或文件夹。'}</div>`;
      return;
    }

    if (currentFileItem.type === 'folder') {
      editorDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #aaa;">这是一个文件夹。请选择一个文件查看内容。</div>`;
      return;
    }

    if (isLoadingContent) {
      editorDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #aaa;">正在加载内容...</div>';
      return;
    }

    if (currentFileItem.content && typeof currentFileItem.content === 'string' && currentFileItem.content.startsWith('Error loading content:')) {
      editorDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #dd0000;">${currentFileItem.content}</div>`;
      return;
    }

    if (!currentFileItem.renderedDocument) {
      editorDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #aaa;">内容加载失败或不可用。</div>';
      return;
    }

    editorDiv.innerHTML = '';

    const contentHostElement = document.createElement(targetType === 'code' ? 'pre' : 'div');
    contentHostElement.className = 'document-block' + (targetType === 'code' ? '' : ' doc-block');
    editorDiv.appendChild(contentHostElement);

    (async () => {
      if (selectedFileId === currentFileItem.id && currentFileItem.renderedDocument) {
        try {
          setIsLoadingContent(true);

          contentHostElement.innerHTML = await currentFileItem.renderedDocument.renderWithLocalResource();
          // Prism.highlightAllUnder(contentHostElement);

          // requestAnimationFrame(() => {

          if (!editorContentRef.current || !editorDiv.contains(contentHostElement) || !selectedFileId || selectedFileId !== currentFileItem.id) return;

          const stillSelectedFile = findItemById(files, selectedFileId);
          if (stillSelectedFile && stillSelectedFile.id === currentFileItem.id && currentFileItem.renderedDocument) {
            const currentTargetRangesType = targetType === 'code' ? 'codeRanges' : 'docRanges';

            const currentColoredRanges: ColorSetUp[] = annotations.flatMap(annotation => {
              const annotationColor = annotation.color || '#CCCCCC'; // Default color if annotation.color is undefined
              const rangesFromAnnotation = annotation[currentTargetRangesType] || [];

              // Filter for valid ranges in the current document that have a string ID
              const validRangesInDocument = rangesFromAnnotation
                .map((range, index) => {
                  (range as DocumentRange & { index?: number; }).index = index;
                  return range;
                })
                .filter((range): range is DocumentRange & { id: string; index: number; } => // Type guard to ensure range.id is string
                  range.documentId === selectedFileId
                );

              if (validRangesInDocument.length === 0) {
                return []; // Return an empty array to be flattened by flatMap
              }

              // For each valid DocumentRange, create a ColorSetUp entry
              return validRangesInDocument.map(docRange => {
                // docRange is a full DocumentRange object with a guaranteed string id.
                return {
                  color: annotationColor,
                  lighterColor: computeLighterColor(annotationColor),
                  id: annotation.id, // This is the Annotation ID
                  ranges: [docRange], // The specific range segment
                  handleClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRevealAnnotationRange?.(annotation.id, targetType, docRange.index);
                  },
                  handleRightClick: (e, docRange) => {
                    // clickedRangeId is docRange.id.
                    // The 'docRange' object (full DocumentRange) is captured in this closure.
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveAnnotationRange?.(docRange, targetType, annotation.id);
                  }
                };
              });
            });

            currentFileItem.renderedDocument.colorAll(contentHostElement, currentColoredRanges);
            cachedSelectedRange.current = null;
          }
        } catch (error) {
          console.error('Rendering error:', error);
          editorDiv.innerHTML = '<div style="color: #dd0000; padding: 20px;">内容渲染失败</div>';
        } finally {
          setIsLoadingContent(false);
        }
      }
    })();
  }, [selectedFileId, targetType, annotations]);

  useEffect(() => {
    if (isLoadingContent) {
      return;
    }

    const currentFileItem = selectedFileId ? findItemById(files, selectedFileId) : null;

    if (currentFileItem && currentFileItem.afterRender) {
      currentFileItem.afterRender();
      currentFileItem.afterRender = undefined;
    }
  }, [files, isLoadingContent]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const panelCard = (editorContentRef.current?.closest('.panel'));
      if (panelCard && !panelCard.contains(event.target as Node)) {
        if (editorContentRef.current && editorContentRef.current.contains(event.target as Node)) {
          // Click is inside editor view but might be on scrollbars etc.
          // This case is tricky, rely on onMouseDownOnEditor for clearing selection within editor.
          return;
        }
        // Click is truly outside the panel that contains the editor.
        setSelectedRange(null);
        setSelectionPosition(null);
        // window.getSelection()?.removeAllRanges(); // Be careful with this, might interfere with other inputs
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!editorContentRef.current) return;
    const editorDiv = editorContentRef.current;
    editorDiv.scrollTop = 0;
  }, [selectedFileId])

  const renderFileTree = (items: AnnotationDocumentItem[], level: number): React.ReactNode => {
    return (
      <ul style={{ listStyleType: 'none', paddingLeft: level > 0 ? '20px' : '0px', margin: 0 }}>
        {items.map(item => (
          <li
            key={item.id}
            title={item.name}
            className={classNames('file-tree-item', { 'selected-file': selectedFileId === item.id })}
            style={{
              padding: '3px 0',
            }}
          >
            <div
              onClick={() => handleItemSelectInTree(item)}
              style={{
                cursor: 'pointer',
                padding: '5px 8px',
                borderRadius: '3px',
                backgroundColor: selectedFileId === item.id ? '#e6f7ff' : 'transparent',
                borderLeft: selectedFileId === item.id ? '3px solid #1890ff' : 'none',
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {item.type === 'folder' ? (
                item.isExpanded ? <FolderOpenOutlined style={{ marginRight: '8px' }} /> : <FolderOutlined style={{ marginRight: '8px' }} />
              ) : (
                <FileTextOutlined style={{ marginRight: '8px' }} />
              )}
              <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.name}
              </span>
              <Button
                icon={<DeleteFilled />}
                type="text"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFileFromTree(item.id);
                }}
                style={{ marginLeft: '8px', flexShrink: 0 }}
              />
            </div>
            {item.type === 'folder' && item.isExpanded && item.children && item.children.length > 0 &&
              renderFileTree(item.children, level + 1)
            }
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Card
      title={targetTypeName}
      extra={
        <div style={{ display: 'flex', gap: '8px' }}>
          <Upload
            beforeUpload={handleFileImport}
            showUploadList={false}
            multiple={true} // Allow selecting multiple files for single import
          >
            <Button icon={<FileOutlined />}></Button>
          </Upload>
          {window.localFunctionality && (
            <Button onClick={handleFolderImport} icon={<FolderOpenOutlined />}>
            </Button>
          )}
          <Button onClick={handleClearAll} icon={<ClearOutlined />} danger>
          </Button>
        </div>
      }
      className={classNames('panel', `panel-${targetType}`)}
      bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0, height: 'calc(100% - 57px)' }}
    >
      <div className="explorer-view">
        {files.length > 0
          ? renderFileTree(files, 0)
          : <div style={{ textAlign: 'center', color: '#aaa', padding: '20px' }}>无文件或文件夹。请点击上方按钮导入。</div>
        }
      </div>
      <div
        className="editor-view"
        ref={editorContentRef}
        style={{ flex: 1, overflowY: 'auto' }}
        onMouseDown={handleMouseDownOnEditor} // Ensured presence
        onMouseUp={handleCodeSelection}   // Ensured presence
      >
        {/* Content rendered by useEffect */}
      </div>
      {selectedRange && selectionRectangle &&
        <FloatingToolbar
          rect={selectionRectangle}
          searchAnnotations={searchAnnotations}
          onAddToAnnotation={handleAddToAnnotation} // Ensured presence
          onCreateAndApplyAnnotation={handleCreateAndApplyAnnotation} // Ensured presence
        />
      }
    </Card>
  );
};

interface FloatingToolbarProps {
  rect: DOMRect;
  searchAnnotations: (keyword: string) => Annotation[];
  onAddToAnnotation: (annotationId?: string) => void;
  onCreateAndApplyAnnotation: () => void;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  rect,
  searchAnnotations,
  onAddToAnnotation,
  onCreateAndApplyAnnotation,
}) => {
  const [searchValue, setSearchValue] = useState<string>('');

  const annotations = searchAnnotations(searchValue);

  const createAnnotationButton = (
    <Button
      size="small"
      type="dashed"
      icon={<PlusOutlined />}
      onClick={onCreateAndApplyAnnotation}
      style={{ width: '28px', flex: 'none' }}
    />
  );

  // 计算工具栏位置，确保在视口内
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const toolbarHeight = (annotations.length ? 80 : 48);
  const toolbarWidth = 400;

  // 计算初始位置（在选区上方）
  let top = rect.top - toolbarHeight - 10;
  let left = rect.left;

  // 如果上方空间不足，则显示在选区下方
  if (top < 10) {
    top = rect.bottom + 10;
  }

  // 确保不超出右边界
  if (left + toolbarWidth > viewportWidth - 10) {
    left = viewportWidth - toolbarWidth - 10;
  }

  // 确保不超出左边界
  if (left < 10) {
    left = 10;
  }

  // 确保不超出底部边界
  if (top + toolbarHeight > viewportHeight - 10) {
    top = viewportHeight - toolbarHeight - 10;
  }

  return (
    <div
      className="floating-toolbar"
      style={{
        top: `${top}px`,
        left: `${left}px`,
      }}
    >
      <div className='floating-toolbar-items'>
        <Input
          type="text"
          placeholder="搜索标注..."
          onChange={(e) => setSearchValue(e.target.value)}
          className="annotation-search"
          style={{
            padding: '4px 8px',
            width: '100%',
            fontSize: '13px',
            borderColor: '#d9d9d9',
            boxShadow: 'unset'
          }}
        />
        {annotations.length === 0 && createAnnotationButton}
      </div>
      {
        annotations.length > 0 &&
        (<div className='floating-toolbar-items'>
          {
            annotations.map((annotation) => (
              <Button
                key={annotation.id}
                size="small"
                type="default"
                onClick={() => onAddToAnnotation(annotation.id)}
                style={{
                  color: annotation.color ?? '#000000',
                  borderColor: annotation.color ?? '#000000',
                  borderStyle: 'solid',
                  backgroundColor: annotation.color ? computeLighterColor(annotation.color) : computeLighterColor('#000000')
                }}
              >
                {annotation.category}
              </Button>
            ))
          }
          {createAnnotationButton}
        </div>)
      }
    </div>
  );
};

export default AnnotationDocumentPanel;
