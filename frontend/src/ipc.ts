/**
 * Basic Electron IPC interface for this app.
 */

export interface LocalFunctionality {
    wordDocumentResolve: (content: ArrayBuffer) => Promise<string | undefined>;
}

declare global {
    interface Window {
        localFunctionality: LocalFunctionality;
    }
}
