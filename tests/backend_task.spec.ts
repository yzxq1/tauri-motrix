import { Notice } from "@/components/Notice";
import { DOWNLOAD_ENGINE } from "@/constant/task";
import {
  removeDownloadResultTaskApi,
  removeTaskApi,
} from "@/services/aria2c_api";
import {
  invalidateBackend,
  setExternalBackend,
} from "@/services/backend_state";
import { showDialog } from "@/services/dialog";
import { type DownloadTask, fromVortex } from "@/services/download";
import { deleteTasks, type TaskDeletionReport } from "@/services/task_deletion";
import { useTaskStore } from "@/store/task";

jest.mock("@/components/Notice", () => ({
  Notice: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/services/dialog", () => ({ showDialog: jest.fn() }));
jest.mock("@/services/task_deletion", () => ({
  deleteTasks: jest.fn(),
  resolveTaskDeletion: jest.fn(),
}));
jest.mock("@/services/aria2c_api", () => ({
  removeTaskApi: jest.fn(),
  removeDownloadResultTaskApi: jest.fn(),
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));

const vortex = fromVortex({
  id: "vortex-1",
  revision: 1,
  state: "paused",
  url: "https://example.test/file",
  path: "C:/Downloads/native",
  total: 10,
  completed: 0,
  speed: 0,
  connections: 0,
  error: null,
});

const remoteActive: DownloadTask = {
  ...vortex,
  gid: "aria-active",
  remote: true,
  status: "active",
  ref: { engine: DOWNLOAD_ENGINE.Aria2, id: "aria-active" },
};

const remoteComplete: DownloadTask = {
  ...vortex,
  gid: "aria-done",
  remote: true,
  status: "complete",
  ref: { engine: DOWNLOAD_ENGINE.Aria2, id: "aria-done" },
};

const fetchTasks = jest.fn().mockResolvedValue(undefined);
const dialogs = jest.mocked(showDialog);
const remove = jest.mocked(removeTaskApi);
const removeResult = jest.mocked(removeDownloadResultTaskApi);
const deleteFn = jest.mocked(deleteTasks);

function report(task: DownloadTask): TaskDeletionReport {
  return {
    tasks: [
      { task: task.ref!, removed: true, stage: null, error: null, files: [] },
    ],
    retryToken: null,
    sessionError: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setExternalBackend(true);
  useTaskStore.setState({
    tasks: [remoteActive, remoteComplete, vortex],
    selectedTaskIds: [remoteActive.gid, remoteComplete.gid, vortex.gid],
    deletingTaskIds: [],
    fetchTasks,
  });
});

afterEach(() => {
  setExternalBackend(false);
});

describe("External backend task deletion", () => {
  it("does not remove a task after the confirmation crosses a backend switch", async () => {
    dialogs.mockImplementationOnce(async () => {
      invalidateBackend();
      return { action: "remove", checked: false };
    });
    await useTaskStore.getState().handleTaskDelete(remoteActive.gid);
    expect(remove).not.toHaveBeenCalled();
    expect(removeResult).not.toHaveBeenCalled();
    expect(deleteFn).not.toHaveBeenCalled();
    expect(Notice.error).toHaveBeenCalled();
  });
  it("calls removeTaskApi for active remote aria2 tasks", async () => {
    dialogs.mockResolvedValueOnce({ action: "remove", checked: false });
    remove.mockResolvedValue("OK");
    removeResult.mockResolvedValue("OK");
    deleteFn.mockResolvedValue(report(vortex));
    await useTaskStore.getState().handleTaskDelete(remoteActive.gid);
    expect(remove).toHaveBeenCalledWith(remoteActive.gid);
    expect(removeResult).not.toHaveBeenCalled();
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("calls removeDownloadResultTaskApi for completed remote aria2 tasks", async () => {
    dialogs.mockResolvedValueOnce({ action: "remove", checked: false });
    remove.mockResolvedValue("OK");
    removeResult.mockResolvedValue("OK");
    deleteFn.mockResolvedValue(report(vortex));
    await useTaskStore.getState().handleTaskDelete(remoteComplete.gid);
    expect(removeResult).toHaveBeenCalledWith(remoteComplete.gid);
    expect(remove).not.toHaveBeenCalled();
  });

  it("routes vortex tasks through deleteTasks even in external mode", async () => {
    dialogs.mockResolvedValueOnce({ action: "remove", checked: false });
    deleteFn.mockResolvedValue(report(vortex));
    await useTaskStore.getState().handleTaskDelete(vortex.gid);
    expect(deleteFn).toHaveBeenCalledWith([vortex.ref], false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("throws and shows error when delete-with-files is requested for remote aria2 tasks", async () => {
    dialogs.mockResolvedValueOnce({ action: "remove", checked: true });
    useTaskStore.setState({ selectedTaskIds: [remoteActive.gid] });
    await useTaskStore.getState().handleTaskDelete(remoteActive.gid);
    expect(Notice.error).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("openTaskFile with external backend", () => {
  it("shows RemoteFiles error for remote aria2 tasks", async () => {
    useTaskStore.setState({ tasks: [remoteActive] });
    await useTaskStore.getState().openTaskFile(remoteActive.gid);
    expect(Notice.error).toHaveBeenCalledWith("backend.RemoteFiles");
  });
});
