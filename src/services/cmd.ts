import { invoke } from "@tauri-apps/api/core";

import { APP_LOG_LEVEL } from "@/constant/log";

export function getAria2Info() {
  return invoke<Aria2Info>("get_aria2_info");
}

export const patchAria2Rpc = (data: Pick<Aria2Info, "port" | "secret">) =>
  invoke<Aria2Info>("patch_aria2_rpc", data);

export const getAria2Config = () =>
  invoke<Aria2Config | null>("get_aria2_config");

export const getMotrixConfig = () =>
  invoke<MotrixConfig | null>("get_motrix_config");

export const openLogsDir = () => invoke<void>("open_logs_dir");

export const openAppDir = () => invoke<void>("open_app_dir");

export const openCoreDir = () => invoke<void>("open_core_dir");

export const exitApp = () => invoke<void>("exit_app");

export const testAria2Backend = (data: Partial<MotrixConfig>) =>
  invoke<void>("test_aria2_backend", { data });

export const patchMotrixConfig = async (data: Partial<MotrixConfig>) => {
  const apply = () => invoke<null>("patch_motrix_config", { data });
  if (
    Object.keys(data).some((key) =>
      [
        "aria2_backend",
        "aria2_server",
        "aria2_port",
        "aria2_secret",
        "aria2_scheme",
        "aria2_path",
      ].includes(key),
    )
  ) {
    const { withBackendReconnect } = await import("@/services/backend_switch");
    return withBackendReconnect(apply);
  }
  return apply();
};

export const patchAria2Config = (data: Partial<Aria2Config>) =>
  invoke<null>("patch_aria2_config", { data });

export const getAutoLaunchStatus = () =>
  invoke<boolean>("get_auto_launch_status");

export const appLog = (
  level: APP_LOG_LEVEL,
  message: string,
  location?: string,
) => invoke<null>("app_log", { level, message, location });

export const stopEngine = () => invoke("stop_engine");

export const readFileAsBase64 = (path: string) =>
  invoke<string>("read_file_as_base64", { path });
