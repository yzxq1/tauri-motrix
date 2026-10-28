import { Button, MenuItem, Select, Stack, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingItem, SettingList } from "@/client/setting_compose";
import { Android12Switch } from "@/client/styled_compose";
import { DialogRef } from "@/components/BaseDialog";
import { Notice } from "@/components/Notice";
import { LOG_LEVELS } from "@/constant/log";
import { useMotrix } from "@/hooks/motrix";
import { exitApp, openAppDir, openCoreDir, openLogsDir } from "@/services/cmd";
import { checkForUpdates } from "@/services/updates";

import ListenPortsViewer from "./ListenPortsViewer";

function MotrixSetting() {
  const { motrix, patchMotrix } = useMotrix();
  const { t } = useTranslation();

  const listenPortsRef = useRef<DialogRef>(null);
  const [server, setServer] = useState("");
  const [port, setPort] = useState(16801);
  const [secret, setSecret] = useState("");

  useEffect(() => {
    if (motrix) {
      setServer(motrix.aria2_server ?? "127.0.0.1");
      setPort(motrix.aria2_port ?? 16801);
      setSecret(motrix.aria2_secret ?? "");
    }
  }, [motrix]);

  const saveExternalBackend = async () => {
    await patchMotrix({
      aria2_server: server.trim(),
      aria2_port: port,
      aria2_secret: secret,
    });
    Notice.success("aria2 backend saved");
  };

  return (
    <SettingList title={t("setting.Motrix")}>
      <ListenPortsViewer ref={listenPortsRef} />

      <SettingItem label={t("setting.LogLevelInfo")}>
        <Select
          value={motrix?.app_log_level ?? "info"}
          size="small"
          sx={{ width: 100, "> div": { py: "7.5px" } }}
          onChange={async (e) => {
            await patchMotrix({
              app_log_level: e.target.value as MotrixConfig["app_log_level"],
            });

            Notice.success(t("common.SaveSuccess"));
          }}
        >
          {LOG_LEVELS.map(({ label, value }) => (
            <MenuItem value={value}>{label}</MenuItem>
          ))}
        </Select>
      </SettingItem>

      <SettingItem label="aria2 backend">
        <Select
          value={motrix?.aria2_backend ?? "embedded"}
          size="small"
          sx={{ width: 180, "> div": { py: "7.5px" } }}
          onChange={async (e) => {
            await patchMotrix({
              aria2_backend: e.target.value as MotrixConfig["aria2_backend"],
            });
            Notice.success("aria2 backend switched");
          }}
        >
          <MenuItem value="embedded">Bundled / local</MenuItem>
          <MenuItem value="external">External RPC</MenuItem>
        </Select>
      </SettingItem>

      {motrix?.aria2_backend === "external" && (
        <SettingItem label="External aria2 RPC">
          <Stack spacing={1} sx={{ width: 220, py: 1 }}>
            <TextField
              size="small"
              label="Host"
              value={server}
              onChange={(e) => setServer(e.target.value)}
            />
            <TextField
              size="small"
              label="Port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
            <TextField
              size="small"
              label="Secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <Button size="small" variant="contained" onClick={saveExternalBackend}>
              Apply and reconnect
            </Button>
          </Stack>
        </SettingItem>
      )}

      <SettingItem label={t("setting.NewTaskShowDownloading")}>
        <Android12Switch
          checked={!!motrix?.new_task_show_downloading}
          onChange={(e) => {
            patchMotrix({
              new_task_show_downloading: e.target.checked,
            });
          }}
        />
      </SettingItem>

      <SettingItem label={t("setting.TaskCompletedNotify")}>
        <Android12Switch
          checked={!!motrix?.task_completed_notify}
          onChange={(e) => {
            patchMotrix({
              task_completed_notify: e.target.checked,
            });
          }}
        />
      </SettingItem>

      <SettingItem label={t("setting.AutoCheckUpdate")}>
        <Android12Switch
          checked={!!motrix?.auto_check_update}
          onChange={(e) => {
            patchMotrix({
              auto_check_update: e.target.checked,
            });
          }}
        />
      </SettingItem>

      <SettingItem
        label={t("setting.ListenPorts")}
        onClick={() => listenPortsRef.current?.open()}
      />

      <SettingItem label={t("setting.OpenConfDir")} onClick={openAppDir} />
      <SettingItem label={t("setting.OpenCoreDir")} onClick={openCoreDir} />
      <SettingItem label={t("setting.OpenLogsDir")} onClick={openLogsDir} />
      <SettingItem
        label={t("setting.CheckForUpdates")}
        onClick={checkForUpdates}
      />
      <SettingItem label={t("common.Exit")} onClick={exitApp} />
    </SettingList>
  );
}

export default MotrixSetting;
