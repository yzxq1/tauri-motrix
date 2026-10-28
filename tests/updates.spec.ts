import { Notice } from "@/components/Notice";
import {
  checkForUpdates,
  fetchUpdate,
  useUpdateStore,
} from "@/services/updates";

jest.mock("@/components/Notice", () => ({
  Notice: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("i18next", () => ({ t: (key: string) => key }));

beforeEach(() => {
  jest.clearAllMocks();
  useUpdateStore.setState({ update: null, open: false });
});

it("fetchUpdate always resolves to null", async () => {
  await expect(fetchUpdate()).resolves.toBeNull();
});

it("checkForUpdates shows the manual-update notice", async () => {
  await checkForUpdates();
  expect(Notice.success).toHaveBeenCalledWith("backend.ManualUpdate");
});

it("checkForUpdates does not open the update dialog", async () => {
  await checkForUpdates();
  expect(useUpdateStore.getState().open).toBe(false);
});

it("checkForUpdates does not error", async () => {
  await checkForUpdates();
  expect(Notice.error).not.toHaveBeenCalled();
});
