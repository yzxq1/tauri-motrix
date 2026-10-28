import { Button, MenuItem, Select, Stack, TextField } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingItem, SettingList } from "@/client/setting_compose";
import { Android12Switch } from "@/client/styled_compose";
import { DialogRef } from "@/components/BaseDialog";
import { Notice } from "@/components/Notice";
import { LOG_LEVELS } from "@/constant/log";
import { useMotrix } from "@/hooks/motrix";
import {
  exitApp,
  openAppDir,
  openCoreDir,
  openLogsDir,
  testAria2Backend,
} from "@/services/cmd";
import { checkForUpdates } from "@/services/updates";

import ListenPortsViewer from "./ListenPortsViewer";

function MotrixSetting() {
  const { motrix, patchMotrix } = useMotrix();
  const { t } = useTranslation();

  const listenPortsRef = useRef<DialogRef>(null);
  const [server, setServer] = useState("");
  const [port, setPort] = useState(16801);
  const [secret, setSecret] = useState("");
  const [backend, setBackend] =
    useState<MotrixConfig["aria2_backend"]>("embedded");
  const [scheme, setScheme] = useState<MotrixConfig["aria2_scheme"]>("http");
  const [path, setPath] = useState("/jsonrpc");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const savedBackend = motrix?.aria2_backend ?? "embedded";
  const savedScheme = motrix?.aria2_scheme ?? "http";
  const savedPath = motrix?.aria2_path ?? "/jsonrpc";
  const savedServer = motrix?.aria2_server ?? "127.0.0.1";
  const savedPort = motrix?.aria2_port ?? 16801;
  const savedSecret = motrix?.aria2_secret ?? "";
  useEffect(() => {
    setBackend(savedBackend);
    setScheme(savedScheme);
    setPath(savedPath);
    setServer(savedServer);
    setPort(savedPort);
    setSecret(savedSecret);
  }, [
    savedBackend,
    savedScheme,
    savedPath,
    savedServer,
    savedPort,
    savedSecret,
  ]);

  const saveExternalBackend = async (testOnly = false) => {
    if (busy) return;
    setError("");
    if (
      backend === "external" &&
      (!server.trim() ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        !path.startsWith("/"))
    ) {
      setError(t("backend.Invalid"));
      return;
    }
    setBusy(true);
    try {
      const data = {
        aria2_backend: backend,
        aria2_server: server.trim(),
        aria2_port: port,
        aria2_secret: secret,
        aria2_scheme: scheme,
        aria2_path: path,
      };
      if (testOnly) await testAria2Backend(data);
      else await patchMotrix(data);
      Notice.success(t(testOnly ? "backend.Connected" : "common.SaveSuccess"));
    } catch {
      setError(t("backend.Failed"));
    } finally {
      setBusy(false);
    }
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

      <SettingItem label={t("backend.Title")}>
        <Stack spacing={1} sx={{ width: 280, py: 1 }}>
          <Select
            disabled={busy}
            value={backend}
            size="small"
            onChange={(e) =>
              setBackend(e.target.value as MotrixConfig["aria2_backend"])
            }
          >
            <MenuItem value="embedded">{t("backend.Embedded")}</MenuItem>
            <MenuItem value="external">{t("backend.External")}</MenuItem>
          </Select>
          {backend === "external" && (
            <>
              <Select
                disabled={busy}
                value={scheme}
                size="small"
                onChange={(e) =>
                  setScheme(e.target.value as MotrixConfig["aria2_scheme"])
                }
              >
                <MenuItem value="http">HTTP</MenuItem>
                <MenuItem value="https">HTTPS</MenuItem>
              </Select>
              <TextField
                disabled={busy}
                size="small"
                label={t("backend.Host")}
                value={server}
                onChange={(e) => setServer(e.target.value)}
              />
              <TextField
                disabled={busy}
                size="small"
                label={t("backend.Port")}
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
              <TextField
                disabled={busy}
                size="small"
                label={t("backend.Path")}
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
              <TextField
                disabled={busy}
                size="small"
                label={t("backend.Secret")}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <Button
                disabled={busy}
                onClick={() => void saveExternalBackend(true)}
              >
                {t("backend.Test")}
              </Button>
            </>
          )}
          {error && <div role="alert">{error}</div>}
          <Button
            disabled={busy || !motrix}
            variant="contained"
            onClick={() => void saveExternalBackend()}
          >
            {t(busy ? "backend.Busy" : "backend.Apply")}
          </Button>
        </Stack>
      </SettingItem>

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
