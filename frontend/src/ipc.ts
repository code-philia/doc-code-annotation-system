/**
 * Basic Electron IPC interface for this app.
 */

export interface LocalFunctionality {
    wordDocumentResolve: (content: ArrayBuffer) => Promise<string | undefined>;
    retrieveLocalResource: (localResourceUrl: string, ...paths: string[]) => Promise<Uint8Array | undefined>;
}

declare global {
    interface Window {
        localFunctionality: LocalFunctionality;
    }
}
