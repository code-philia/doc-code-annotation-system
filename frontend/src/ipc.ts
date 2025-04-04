/**
 * Basic Electron IPC interface for this app.
 */

export interface LocalFunctionality {
    wordDocumentResolve: (buffer: Buffer) => Promise<string | undefined>;
}

declare global {
    interface Window {
        localFunctionality: LocalFunctionality;
    }
}
