import type { Update } from "@tauri-apps/plugin-updater";
import { t } from "i18next";
import { create } from "zustand";

import { Notice } from "@/components/Notice";

export const useUpdateStore = create<{
  update: Update | null;
  open: boolean;
}>(() => ({ update: null, open: false }));

export function fetchUpdate(): Promise<Update | null> {
  return Promise.resolve(null);
}

export function checkForUpdates(): Promise<void> {
  Notice.success(t("backend.ManualUpdate"));
  return Promise.resolve();
}
