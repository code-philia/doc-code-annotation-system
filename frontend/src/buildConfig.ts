declare global {
    interface Window {
        __BUILD_TYPE__: string | undefined
    }
}

// This will be predefined in preload.js in Electron build
window.__BUILD_TYPE__ ??= 'page';

export const BUILD_TYPE = window.__BUILD_TYPE__ ;
