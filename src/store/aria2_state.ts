import { create } from "zustand";

import { backendGeneration } from "@/services/backend_state";
import * as aria2Api from "@/services/download";
import { usePollingStore } from "@/store/polling";

export interface Aria2StateStore {
  globalStat: aria2Api.Aria2GlobalStat;
  fetchGlobalStat: () => void;
}

const DEFAULT_STAT = {
  downloadSpeed: "0",
  uploadSpeed: "0",
  numActive: "0",
  numWaiting: "0",
  numStopped: "0",
};

export const useAria2StateStore = create<Aria2StateStore>((set) => ({
  globalStat: DEFAULT_STAT,
  async fetchGlobalStat() {
    const generation = backendGeneration();
    const stat = await aria2Api.getGlobalStatApi();
    if (generation !== backendGeneration()) return;
    set({ globalStat: stat });

    usePollingStore.getState().updateInterval(stat);
  },
}));
