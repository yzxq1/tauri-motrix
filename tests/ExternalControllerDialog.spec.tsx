/**
 * Tests for ExternalControllerDialog – multi-profile RPC management (Tabs UI).
 *
 * All IPC calls are mocked via mockIPC; no real aria2 service is needed.
 */
import { mockIPC } from "@tauri-apps/api/mocks";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";

import ExternalControllerDialog from "@/business/setting/ExternalControllerDialog";
import { DialogRef } from "@/components/BaseDialog";
import { Notice } from "@/components/Notice";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/components/Notice", () => ({
  Notice: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/backend_switch", () => ({
  withBackendReconnect: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock("swr", () => ({
  mutate: jest.fn(),
  default: jest.fn(),
}));

// useAria2Info – return stable embedded info
jest.mock("@/hooks/aria2", () => ({
  useAria2Info: () => ({
    aria2Info: { http_url: "http://127.0.0.1:16801/jsonrpc", port: 16801, secret: "" },
    mutateInfo: jest.fn(),
    patchInfo: jest.fn().mockResolvedValue(undefined),
  }),
}));

type IPCHandler = (cmd: string, payload?: Record<string, unknown>) => unknown;

function setupIPC(handler: IPCHandler) {
  mockIPC((cmd, payload) => handler(cmd, payload as Record<string, unknown>));
}

const SAMPLE_PROFILE: Aria2Profile = {
  id: "node-a",
  name: "Node A",
  scheme: "http",
  host: "aria2.local",
  port: 6800,
  path: "/jsonrpc",
  secret: "s3cr3t",
};

const SAMPLE_PROFILE_B: Aria2Profile = {
  id: "node-b",
  name: "Node B",
  scheme: "https",
  host: "aria2b.local",
  port: 7800,
  path: "/rpc",
  secret: "",
};

function openDialog() {
  const ref = createRef<DialogRef>();
  render(<ExternalControllerDialog ref={ref} />);
  act(() => ref.current?.open());
  return ref;
}

async function waitForTab(label: string | RegExp) {
  await waitFor(() => {
    const tab = screen.getByRole("tab", { name: label });
    expect(tab).toBeInTheDocument();
  });
}

async function clickTab(label: string | RegExp) {
  const tab = await screen.findByRole("tab", { name: label });
  fireEvent.click(tab);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---- 1. Embedded tab is shown by default ----
describe("embedded tab is the default selection", () => {
  it("renders the Embedded tab as selected on open", async () => {
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") return [];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "embedded" };
    });

    openDialog();

    await waitFor(() => {
      const tab = screen.getByRole("tab", { name: /backend\.Embedded/i });
      expect(tab).toHaveAttribute("aria-selected", "true");
    });
  });
});

// ---- 2. Save two profiles, both persist ----
describe("profile list: save two profiles and reload", () => {
  it("saves node-a and node-b; notice fires twice", async () => {
    const profiles: Aria2Profile[] = [];
    setupIPC((cmd, payload) => {
      if (cmd === "get_motrix_profiles") return [...profiles];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "embedded" };
      if (cmd === "save_motrix_profiles") {
        const incoming = (payload as { profiles: Aria2Profile[] }).profiles;
        profiles.splice(0, profiles.length, ...incoming);
        return [...profiles];
      }
      if (cmd === "test_aria2_backend") return null;
    });

    openDialog();
    await waitForTab(/backend\.Embedded/i);

    // Add button is the + tab
    const addTab = screen.getByRole("tab", { name: "" });
    fireEvent.click(addTab);

    await waitFor(() =>
      expect(screen.getByLabelText("profiles.Name")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("profiles.Name"), {
      target: { value: "Node A" },
    });
    fireEvent.change(screen.getByLabelText("backend.Host"), {
      target: { value: "aria2.local" },
    });
    fireEvent.click(screen.getByText("profiles.SaveProfile"));

    await waitFor(() =>
      expect(Notice.success).toHaveBeenCalledWith("profiles.Saved", 1500),
    );

    // Add second profile
    const addTab2 = screen.getByRole("tab", { name: "" });
    fireEvent.click(addTab2);

    await waitFor(() =>
      expect(screen.getByLabelText("profiles.Name")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("profiles.Name"), {
      target: { value: "Node B" },
    });
    fireEvent.change(screen.getByLabelText("backend.Host"), {
      target: { value: "aria2b.local" },
    });
    fireEvent.click(screen.getByText("profiles.SaveProfile"));

    await waitFor(() =>
      expect(Notice.success).toHaveBeenCalledTimes(2),
    );

    expect(profiles).toHaveLength(2);
    expect(profiles[0].name).toBe("Node A");
    expect(profiles[1].name).toBe("Node B");
  });
});

// ---- 3. Switch profile via tab ----
describe("switch between profiles via tab click", () => {
  it("switches from embedded to node-a; notice fires", async () => {
    let activeId = "embedded";
    setupIPC((cmd, payload) => {
      if (cmd === "get_motrix_profiles")
        return [SAMPLE_PROFILE, SAMPLE_PROFILE_B];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: activeId };
      if (cmd === "switch_motrix_profile") {
        activeId = (payload as { profileId: string }).profileId;
        return null;
      }
    });

    openDialog();
    await waitForTab(/backend\.Embedded/i);
    await waitForTab("Node A");

    await clickTab("Node A");

    const applyBtn = await screen.findByText("profiles.Apply");
    fireEvent.click(applyBtn);

    await waitFor(() =>
      expect(Notice.success).toHaveBeenCalledWith("profiles.Applied", 1500),
    );
    expect(activeId).toBe("node-a");
  });
});

// ---- 4. Failed switch does not change active ----
describe("failed switch does not change active profile", () => {
  it("keeps embedded active when switch throws", async () => {
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") return [SAMPLE_PROFILE];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "embedded" };
      if (cmd === "switch_motrix_profile")
        throw new Error("Connection refused");
    });

    openDialog();
    await waitForTab(/backend\.Embedded/i);
    await waitForTab("Node A");

    await clickTab("Node A");

    const applyBtn = await screen.findByText("profiles.Apply");
    fireEvent.click(applyBtn);

    await waitFor(() => expect(Notice.error).toHaveBeenCalled());

    const strong = document.querySelector("strong");
    expect(strong?.textContent).toBe("backend.Embedded");
  });
});

// ---- 5. Delete non-active profile ----
describe("delete non-active profile", () => {
  it("removes node-b when node-a is active", async () => {
    const profiles = [SAMPLE_PROFILE, SAMPLE_PROFILE_B];
    setupIPC((cmd, payload) => {
      if (cmd === "get_motrix_profiles") return [...profiles];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "node-a" };
      if (cmd === "save_motrix_profiles") {
        const incoming = (payload as { profiles: Aria2Profile[] }).profiles;
        profiles.splice(0, profiles.length, ...incoming);
        return [...profiles];
      }
    });

    openDialog();
    await waitForTab("Node B");

    await clickTab("Node B");

    const deleteBtn = await screen.findByText("profiles.Delete");
    fireEvent.click(deleteBtn);

    await waitFor(() =>
      expect(Notice.success).toHaveBeenCalledWith("profiles.Deleted", 1500),
    );
    expect(profiles.find((p) => p.id === "node-b")).toBeUndefined();
  });
});

// ---- 6. Cannot delete active profile (button disabled) ----
describe("cannot delete active profile", () => {
  it("delete and edit buttons are disabled when selected profile is active", async () => {
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") return [SAMPLE_PROFILE];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "node-a" };
    });

    openDialog();
    await waitForTab("Node A");

    // node-a is both active and initially selected (loadProfiles sets selectedId = activeId)
    await clickTab("Node A");

    const deleteBtn = await screen.findByText("profiles.Delete");
    expect(deleteBtn).toBeDisabled();

    const editBtn = await screen.findByText("profiles.Edit");
    expect(editBtn).toBeDisabled();
  });
});

// ---- 7. Dialog cancel discards unsaved edits ----
describe("dialog cancel discards unsaved edits", () => {
  it("cancelling edit does not persist name change", async () => {
    const profiles = [SAMPLE_PROFILE];
    setupIPC((cmd, payload) => {
      if (cmd === "get_motrix_profiles") return [...profiles];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "embedded" };
      if (cmd === "save_motrix_profiles") {
        const incoming = (payload as { profiles: Aria2Profile[] }).profiles;
        profiles.splice(0, profiles.length, ...incoming);
        return [...profiles];
      }
    });

    openDialog();
    await waitForTab("Node A");

    await clickTab("Node A");

    const editBtn = await screen.findByText("profiles.Edit");
    fireEvent.click(editBtn);

    const nameInput = screen.getByLabelText("profiles.Name");
    fireEvent.change(nameInput, { target: { value: "Mutated Name" } });
    expect(nameInput).toHaveValue("Mutated Name");

    const cancelBtns = screen.getAllByText("common.Cancel");
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);

    await waitFor(() =>
      expect(screen.queryByDisplayValue("Mutated Name")).not.toBeInTheDocument(),
    );
    expect(Notice.success).not.toHaveBeenCalled();
  });
});

// ---- 8. Load failure shows error ----
describe("load failure shows error and does not silently show empty list", () => {
  it("displays error message when IPC throws on open", async () => {
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") throw new Error("IPC failure");
      if (cmd === "get_motrix_config") throw new Error("IPC failure");
    });

    openDialog();

    await waitFor(() => {
      expect(screen.getByText("IPC failure")).toBeInTheDocument();
    });
  });
});

// ---- 9. Legacy migration ----
describe("legacy config migration", () => {
  it("shows migrated-external profile tab when backend returned it", async () => {
    const migratedProfile: Aria2Profile = {
      id: "migrated-external",
      name: "External (migrated)",
      host: "aria2.example",
      port: 7800,
      scheme: "https",
      path: "/rpc",
      secret: "legacy-secret",
    };
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") return [migratedProfile];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "migrated-external" };
    });

    openDialog();
    await waitForTab("External (migrated)");

    const tab = screen.getByRole("tab", { name: "External (migrated)" });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });
});

// ---- 10. No OK button rendered ----
describe("dialog has no OK button", () => {
  it("does not render a button with text 'common.Ok'", async () => {
    setupIPC((cmd) => {
      if (cmd === "get_motrix_profiles") return [];
      if (cmd === "get_motrix_config")
        return { aria2_active_profile_id: "embedded" };
    });

    openDialog();
    await waitForTab(/backend\.Embedded/i);

    expect(screen.queryByText("common.Ok")).not.toBeInTheDocument();
  });
});
