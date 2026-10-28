import { ContentCopy, Visibility, VisibilityOff } from "@mui/icons-material";
import AddIcon from "@mui/icons-material/Add";
import {
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useBoolean, useLockFn } from "ahooks";
import {
  Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { mutate } from "swr";

import { BaseDialog, DialogRef } from "@/components/BaseDialog";
import { Notice } from "@/components/Notice";
import { useAria2Info } from "@/hooks/aria2";
import { withBackendReconnect } from "@/services/backend_switch";
import {
  getAria2Info,
  getMotrixConfig,
  getMotrixProfiles,
  saveMotrixProfiles,
  switchMotrixProfile,
  testAria2Backend,
} from "@/services/cmd";

interface ProfileForm {
  name: string;
  scheme: "http" | "https";
  host: string;
  port: string;
  path: string;
  secret: string;
}

const EMBEDDED_ID = "embedded";

const DEFAULT_FORM: ProfileForm = {
  name: "",
  scheme: "http",
  host: "127.0.0.1",
  port: "6800",
  path: "/jsonrpc",
  secret: "",
};

function profileToForm(p: Aria2Profile): ProfileForm {
  return {
    name: p.name,
    scheme: p.scheme as "http" | "https",
    host: p.host,
    port: String(p.port),
    path: p.path,
    secret: p.secret,
  };
}

function formToProfile(id: string, f: ProfileForm): Aria2Profile {
  return {
    id,
    name: f.name.trim(),
    scheme: f.scheme,
    host: f.host.trim(),
    port: Number(f.port),
    path: f.path.trim(),
    secret: f.secret,
  };
}

function formatExternalUrl(p: Aria2Profile): string {
  const needsBrackets = p.host.includes(":");
  const hostPart = needsBrackets ? `[${p.host}]` : p.host;
  return `${p.scheme}://${hostPart}:${p.port}${p.path}`;
}

function ExternalControllerDialog(props: { ref: Ref<DialogRef> }) {
  const { t } = useTranslation();
  const [open, { setFalse, setTrue }] = useBoolean();

  const [profiles, setProfiles] = useState<Aria2Profile[]>([]);
  const [activeId, setActiveId] = useState<string>(EMBEDDED_ID);
  const [selectedId, setSelectedId] = useState<string>(EMBEDDED_ID);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { aria2Info, patchInfo } = useAria2Info();

  const [embeddedPort, setEmbeddedPort] = useState("");
  const [embeddedSecret, setEmbeddedSecret] = useState("");
  const [showEmbeddedSecret, setShowEmbeddedSecret] = useState(false);
  const [embeddedDirty, setEmbeddedDirty] = useState(false);

  const draftRef = useRef<ProfileForm | null>(null);

  const { control, handleSubmit, reset, getValues } = useForm<ProfileForm>({
    defaultValues: DEFAULT_FORM,
  });

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const isEditing = editingId !== null;
  const selectedIsEmbedded = selectedId === EMBEDDED_ID;
  const selectedIsActive = selectedId === activeId;

  async function loadProfiles() {
    setLoadError(null);
    try {
      const [list, config] = await Promise.all([
        getMotrixProfiles(),
        getMotrixConfig(),
      ]);
      setProfiles(list ?? []);
      const aid = config?.aria2_active_profile_id ?? EMBEDDED_ID;
      setActiveId(aid);
      if (draftRef.current === null) {
        setSelectedId(aid);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (open) {
      draftRef.current = null;
      loadProfiles();
      setEditingId(null);
      setShowSecret(false);
      setEmbeddedDirty(false);
    }
  }, [open]);

  useEffect(() => {
    if (aria2Info) {
      setEmbeddedPort(String(aria2Info.port));
      setEmbeddedSecret(aria2Info.secret ?? "");
    }
  }, [aria2Info]);

  useEffect(() => {
    if (!isEditing) {
      if (selectedProfile) {
        reset(profileToForm(selectedProfile));
      } else {
        reset(DEFAULT_FORM);
      }
    }
  }, [selectedId, isEditing, selectedProfile, reset]);

  useImperativeHandle(props.ref, () => ({
    open: setTrue,
    close: onClose,
  }));

  function onClose() {
    if (busy) return;
    setFalse();
    setEditingId(null);
    draftRef.current = null;
    setShowSecret(false);
  }

  function handleTabChange(_: React.SyntheticEvent, newId: string) {
    if (busy) return;
    if (isEditing) {
      draftRef.current = getValues();
    }
    setSelectedId(newId);
    setEditingId(null);
  }

  function startCreate() {
    const tempId = `profile-${Date.now()}`;
    setEditingId(tempId);
    draftRef.current = null;
    reset(DEFAULT_FORM);
  }

  function startEdit() {
    if (!selectedProfile) return;
    setEditingId(selectedProfile.id);
    reset(profileToForm(selectedProfile));
  }

  function cancelEdit() {
    setEditingId(null);
    if (selectedProfile) {
      reset(profileToForm(selectedProfile));
    } else {
      reset(DEFAULT_FORM);
    }
    draftRef.current = null;
  }

  const onSaveProfile = useLockFn(
    handleSubmit(async (form: ProfileForm) => {
      if (!editingId) return;
      setBusy(true);
      try {
        const profile = formToProfile(editingId, form);
        const existing = profiles.find((p) => p.id === editingId);
        const newList = existing
          ? profiles.map((p) => (p.id === editingId ? profile : p))
          : [...profiles, profile];
        const saved = await saveMotrixProfiles(newList);
        setProfiles(saved);
        setSelectedId(editingId);
        setEditingId(null);
        draftRef.current = null;
        await mutate("getMotrixConfig");
        Notice.success(t("profiles.Saved"), 1500);
      } catch (error) {
        Notice.error(
          error instanceof Error ? error.message : String(error),
          4000,
        );
      } finally {
        setBusy(false);
      }
    }),
  );

  const onTest = useLockFn(
    handleSubmit(async (form: ProfileForm) => {
      setBusy(true);
      try {
        await testAria2Backend({
          aria2_backend: "external",
          aria2_server: form.host.trim(),
          aria2_port: Number(form.port),
          aria2_secret: form.secret,
          aria2_scheme: form.scheme,
          aria2_path: form.path.trim(),
        });
        Notice.success(t("backend.Connected"), 1500);
      } catch {
        Notice.error(t("backend.Failed"), 4000);
      } finally {
        setBusy(false);
      }
    }),
  );

  const onApply = useLockFn(async () => {
    if (selectedIsActive) return;
    setBusy(true);
    try {
      await withBackendReconnect(() => switchMotrixProfile(selectedId));
      setActiveId(selectedId);
      await mutate("getMotrixConfig");
      Notice.success(t("profiles.Applied"), 1500);
    } catch (error) {
      Notice.error(
        error instanceof Error ? error.message : String(error),
        4000,
      );
    } finally {
      setBusy(false);
    }
  });

  const onDelete = useLockFn(async () => {
    if (selectedIsEmbedded || selectedIsActive || !selectedProfile) return;
    setBusy(true);
    try {
      const newList = profiles.filter((p) => p.id !== selectedId);
      const saved = await saveMotrixProfiles(newList);
      setProfiles(saved);
      setSelectedId(activeId);
      await mutate("getMotrixConfig");
      Notice.success(t("profiles.Deleted"), 1500);
    } catch (error) {
      Notice.error(
        error instanceof Error ? error.message : String(error),
        4000,
      );
    } finally {
      setBusy(false);
    }
  });

  const onCopy = useLockFn(async () => {
    try {
      let url = "";
      if (activeId === EMBEDDED_ID) {
        const info = await getAria2Info();
        url = info.http_url;
      } else {
        const active = profiles.find((p) => p.id === activeId);
        if (active) {
          url = formatExternalUrl(active);
        }
      }
      if (url) {
        await writeText(url);
        Notice.success(t("setting.RpcAddressCopied"), 1000);
      }
    } catch (error) {
      Notice.error(
        error instanceof Error ? error.message : String(error),
        4000,
      );
    }
  });

  const onSaveEmbedded = useLockFn(async () => {
    const port = Number(embeddedPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      Notice.error(t("setting.RpcPortInvalid"), 3000);
      return;
    }
    if (/[\r\n\0]/.test(embeddedSecret) || embeddedSecret !== embeddedSecret.trim()) {
      Notice.error(t("setting.RpcSecretInvalid"), 3000);
      return;
    }
    setBusy(true);
    try {
      await patchInfo({ port, secret: embeddedSecret });
      setEmbeddedDirty(false);
      await mutate("getMotrixConfig");
      Notice.success(t("setting.ExternalControllerAddressModified"), 1500);
    } catch (error) {
      Notice.error(
        error instanceof Error ? error.message : String(error),
        4000,
      );
    } finally {
      setBusy(false);
    }
  });

  const activeLabel =
    activeId === EMBEDDED_ID
      ? t("backend.Embedded")
      : (profiles.find((p) => p.id === activeId)?.name ?? activeId);

  const tabValue = isEditing ? editingId : selectedId;

  return (
    <BaseDialog
      open={open}
      title={t("setting.ExternalController")}
      contentSx={{ width: 480, maxWidth: "100%", boxSizing: "border-box", p: 0 }}
      disableOk
      cancelBtn={t("common.Cancel")}
      onClose={onClose}
      onCancel={onClose}
    >
      <Stack spacing={0}>
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              {t("profiles.Active")}:
            </Typography>
            <Typography variant="body2" component="strong">
              {activeLabel}
            </Typography>
            <IconButton
              size="small"
              aria-label={t("setting.CopyRpcAddress")}
              onClick={onCopy}
            >
              <ContentCopy fontSize="inherit" />
            </IconButton>
          </Stack>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: "divider", mt: 1 }}>
          <Tabs
            value={tabValue ?? EMBEDDED_ID}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="RPC profiles"
          >
            <Tab
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>{t("backend.Embedded")}</span>
                  {activeId === EMBEDDED_ID && (
                    <Chip
                      label={t("profiles.ActiveTag")}
                      size="small"
                      color="primary"
                      sx={{ height: 16, fontSize: "0.6rem" }}
                    />
                  )}
                </Stack>
              }
              aria-label={t("backend.Embedded")}
              value={EMBEDDED_ID}
              disabled={busy}
            />
            {profiles.map((p) => (
              <Tab
                key={p.id}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{p.name}</span>
                    {p.id === activeId && (
                      <Chip
                        label={t("profiles.ActiveTag")}
                        size="small"
                        color="primary"
                        sx={{ height: 16, fontSize: "0.6rem" }}
                      />
                    )}
                  </Stack>
                }
                aria-label={p.name}
                value={p.id}
                disabled={busy}
              />
            ))}
            {isEditing && !profiles.find((p) => p.id === editingId) && (
              <Tab
                label={t("profiles.New")}
                value={editingId}
                disabled={busy}
              />
            )}
            <Tab
              label={
                <Badge color="primary" badgeContent={null}>
                  <AddIcon fontSize="small" />
                </Badge>
              }
              value="__add__"
              disabled={busy || isEditing}
              onClick={(e) => {
                e.preventDefault();
                startCreate();
              }}
              sx={{ minWidth: 48 }}
            />
          </Tabs>
        </Box>

        <Box sx={{ px: 2, pt: 2, pb: 2 }}>
          {loadError && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {loadError}
            </Typography>
          )}

          {selectedIsEmbedded && !isEditing ? (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                {t("profiles.EmbeddedHint")}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  label={t("backend.Port")}
                  value={embeddedPort}
                  size="small"
                  type="number"
                  disabled={busy}
                  onChange={(e) => {
                    setEmbeddedPort(e.target.value);
                    setEmbeddedDirty(true);
                  }}
                  slotProps={{ htmlInput: { min: 1, max: 65535, step: 1 } }}
                  sx={{ width: 120 }}
                />
                <TextField
                  label={t("setting.RpcSecret")}
                  value={embeddedSecret}
                  size="small"
                  type={showEmbeddedSecret ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={busy}
                  onChange={(e) => {
                    setEmbeddedSecret(e.target.value);
                    setEmbeddedDirty(true);
                  }}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={t(
                              showEmbeddedSecret
                                ? "setting.HideRpcSecret"
                                : "setting.ShowRpcSecret",
                            )}
                            onClick={() => setShowEmbeddedSecret((v) => !v)}
                            edge="end"
                          >
                            {showEmbeddedSecret ? (
                              <VisibilityOff fontSize="small" />
                            ) : (
                              <Visibility fontSize="small" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {t("setting.RpcRestartHint")}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="contained"
                  disabled={busy || !embeddedDirty}
                  onClick={onSaveEmbedded}
                >
                  {t("common.Save")}
                </Button>
                {activeId !== EMBEDDED_ID && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={onApply}
                  >
                    {t("profiles.Apply")}
                  </Button>
                )}
              </Stack>
            </Stack>
          ) : !selectedIsEmbedded || isEditing ? (
            <Stack spacing={1.5}>
              {selectedIsActive && !isEditing && (
                <Typography variant="caption" color="text.secondary">
                  {t("profiles.CannotEditActive")}
                </Typography>
              )}
              <Controller
                name="name"
                control={control}
                rules={{
                  validate: (v) =>
                    v.trim().length > 0 || t("profiles.NameRequired"),
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label={t("profiles.Name")}
                    size="small"
                    disabled={busy || !isEditing}
                    error={!!error}
                    helperText={error?.message}
                  />
                )}
              />
              <Stack direction="row" spacing={1}>
                <Controller
                  name="scheme"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      size="small"
                      disabled={busy || !isEditing}
                      sx={{ width: 100 }}
                    >
                      <MenuItem value="http">HTTP</MenuItem>
                      <MenuItem value="https">HTTPS</MenuItem>
                    </Select>
                  )}
                />
                <Controller
                  name="host"
                  control={control}
                  rules={{
                    validate: (v) =>
                      v.trim().length > 0 || t("backend.Invalid"),
                  }}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      label={t("backend.Host")}
                      size="small"
                      disabled={busy || !isEditing}
                      error={!!error}
                      helperText={error?.message}
                      sx={{ flex: 1 }}
                    />
                  )}
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Controller
                  name="port"
                  control={control}
                  rules={{
                    validate: (v) =>
                      (/^\d+$/.test(v) &&
                        Number(v) >= 1 &&
                        Number(v) <= 65535) ||
                      t("setting.RpcPortInvalid"),
                  }}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      label={t("backend.Port")}
                      type="number"
                      size="small"
                      disabled={busy || !isEditing}
                      error={!!error}
                      helperText={error?.message}
                      slotProps={{
                        htmlInput: { min: 1, max: 65535, step: 1 },
                      }}
                      sx={{ width: 120 }}
                    />
                  )}
                />
                <Controller
                  name="path"
                  control={control}
                  rules={{
                    validate: (v) =>
                      v.trim().startsWith("/") || t("backend.Invalid"),
                  }}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      label={t("backend.Path")}
                      size="small"
                      disabled={busy || !isEditing}
                      error={!!error}
                      helperText={error?.message}
                      sx={{ flex: 1 }}
                    />
                  )}
                />
              </Stack>
              <Controller
                name="secret"
                control={control}
                rules={{
                  validate: (v) =>
                    (!/[\r\n\0]/.test(v) && v.trim() === v) ||
                    t("setting.RpcSecretInvalid"),
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label={t("setting.RpcSecret")}
                    type={showSecret ? "text" : "password"}
                    autoComplete="new-password"
                    size="small"
                    disabled={busy || !isEditing}
                    error={!!error}
                    helperText={error?.message}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={t(
                                showSecret
                                  ? "setting.HideRpcSecret"
                                  : "setting.ShowRpcSecret",
                              )}
                              onClick={() => setShowSecret((v) => !v)}
                              edge="end"
                            >
                              {showSecret ? (
                                <VisibilityOff fontSize="small" />
                              ) : (
                                <Visibility fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              />

              {isEditing ? (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={onTest}
                  >
                    {t("backend.Test")}
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" disabled={busy} onClick={cancelEdit}>
                    {t("common.Cancel")}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={onSaveProfile}
                  >
                    {t("profiles.SaveProfile")}
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={onTest}
                  >
                    {t("backend.Test")}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy || selectedIsActive}
                    onClick={startEdit}
                    title={
                      selectedIsActive
                        ? t("profiles.CannotEditActive")
                        : undefined
                    }
                  >
                    {t("profiles.Edit")}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={busy || selectedIsActive}
                    title={
                      selectedIsActive
                        ? t("profiles.CannotDeleteActive")
                        : undefined
                    }
                    onClick={onDelete}
                  >
                    {t("profiles.Delete")}
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy || selectedIsActive}
                    onClick={onApply}
                  >
                    {t("profiles.Apply")}
                  </Button>
                </Stack>
              )}
            </Stack>
          ) : null}
        </Box>
      </Stack>
    </BaseDialog>
  );
}

export default ExternalControllerDialog;
