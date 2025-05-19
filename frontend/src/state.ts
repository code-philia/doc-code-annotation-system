import { create } from "zustand";

interface CrossViewState {
    /** if one of the annotation items should enable input of its name part after being newly created */
    shouldFocusOnRenameId: string | undefined,
    setShouldFocusOnRenameId: (value: string | undefined) => void
}

export const useCrossViewStateStore = create<CrossViewState>()((set) => ({
    shouldFocusOnRenameId: undefined,
    setShouldFocusOnRenameId: (value) => set((state) => ({ shouldFocusOnRenameId: value }))
}));
