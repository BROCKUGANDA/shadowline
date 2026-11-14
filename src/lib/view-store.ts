/**
 * App-wide client state (Zustand): the active module view + mobile nav.
 * The whole app is a single page with client-side view switching.
 */
import { create } from "zustand";

export type ViewId =
  | "command"
  | "players"
  | "lab"
  | "drills"
  | "mri"
  | "coverage"
  | "translation"
  | "compare"
  | "reports"
  | "research"
  | "health";

interface AppState {
  view: ViewId;
  setView: (view: ViewId) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "command",
  setView: (view) => set({ view, mobileNavOpen: false }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));
