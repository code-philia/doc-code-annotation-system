/**
 * Basic Electron IPC interface for this app.
 */

export interface ExtendedLocalFunctionality {
  wordDocumentResolve: (content: ArrayBuffer) => Promise<string | undefined>;
  retrieveLocalResource: (localResourceUrl: string, ...paths: string[]) => Promise<Uint8Array | undefined>;
  electronShowOpenDialog: (options: { properties: string[], title: string }) => Promise<{ canceled: boolean; filePaths: string[]; error?: string }>;
  scanDirectory: (folderPath: string, suffix?: string[]) => Promise<{ fileTree?: any[]; error?: string }>;
}

declare global {
  interface Window {
    localFunctionality: ExtendedLocalFunctionality;
  }
}
