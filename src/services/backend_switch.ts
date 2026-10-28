import { mutate } from "swr";

import { getAria2 } from "@/services/aria2c_api";
import { invalidateBackend } from "@/services/backend_state";
import { useAria2StateStore } from "@/store/aria2_state";
import { usePollingStore } from "@/store/polling";
import { useTaskStore } from "@/store/task";

export async function withBackendReconnect<T>(
  apply: () => Promise<T>,
): Promise<T> {
  const polling = usePollingStore.getState();
  const wasPolling = polling.timer !== undefined;
  polling.stop();
  invalidateBackend();
  useTaskStore.setState({
    tasks: [],
    selectedTaskIds: [],
    deletingTaskIds: [],
  });
  useAria2StateStore.setState({
    globalStat: {
      downloadSpeed: "0",
      uploadSpeed: "0",
      numActive: "0",
      numWaiting: "0",
      numStopped: "0",
    },
  });
  try {
    return await apply();
  } finally {
    try {
      await getAria2(true);
      await useTaskStore.getState().registerEvent();
      await mutate(
        (key) => typeof key === "string" && /aria2|task|version/i.test(key),
        undefined,
        { revalidate: true },
      );
    } finally {
      if (wasPolling) usePollingStore.getState().polling();
    }
  }
}
