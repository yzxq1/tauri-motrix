use std::collections::HashMap;

use anyhow::Result;
use serde_json::json;
use tokio::sync::Mutex;

use crate::{
    config::{Aria2Info, Config, IMotrix},
    core::sys_opt,
    feat, service,
};

static ARIA2_CONFIG_UPDATE: Mutex<()> = Mutex::const_new(());
pub(crate) static MOTRIX_CONFIG_UPDATE: Mutex<()> = Mutex::const_new(());

// Define update flags as bitflags for better performance
#[derive(Clone, Copy)]
enum UpdateFlags {
    None = 0,
    // RestartCore = 1 << 0,
    // Aria2Config = 1 << 1,
    // MotrixConfig = 1 << 2,
    Launch = 1 << 3,
    TrayMenu = 1 << 4,
}

/// expose outside for motrix config
pub async fn patch_motrix(mut data: IMotrix) -> Result<()> {
    let _update = MOTRIX_CONFIG_UPDATE.lock().await;
    let shortcuts_changed =
        data.global_shortcut_show_window.is_some() || data.global_shortcut_new_download.is_some();
    if shortcuts_changed {
        service::shortcuts::normalize_patch(&mut data, &Config::motrix().data())?;
    }
    if data
        .aria2_backend
        .as_deref()
        .is_some_and(|e| !matches!(e, "embedded" | "external"))
        || data
            .http_engine
            .as_deref()
            .is_some_and(|e| !matches!(e, "aria2c" | "vortex"))
        || data
            .vortex_max_tasks
            .is_some_and(|n| !(1..=32).contains(&n))
        || data
            .vortex_connections
            .is_some_and(|n| !(1..=16).contains(&n))
    {
        anyhow::bail!("Invalid download engine configuration");
    }
    let backend_changed = data.aria2_backend.is_some()
        || data.aria2_server.is_some()
        || data.aria2_port.is_some()
        || data.aria2_secret.is_some()
        || data.aria2_scheme.is_some()
        || data.aria2_path.is_some();
    if backend_changed {
        let patch = serde_json::to_value(&data)?;
        if patch.as_object().is_some_and(|fields| {
            fields.iter().any(|(key, value)| {
                !value.is_null()
                    && !matches!(
                        key.as_str(),
                        "aria2_backend"
                            | "aria2_server"
                            | "aria2_port"
                            | "aria2_secret"
                            | "aria2_scheme"
                            | "aria2_path"
                    )
            })
        }) {
            anyhow::bail!("Save backend settings separately from other application settings");
        }
        let _aria2 = ARIA2_CONFIG_UPDATE.lock().await;
        let mut next = Config::motrix().data().clone();
        next.patch_config(data.clone());
        crate::core::CoreManager::global()
            .reconfigure_backend(&next)
            .await?;
        let _ = feat::run_upnp_mapping();
        return Ok(());
    }
    Config::motrix().draft().patch_config(data.clone());
    let language = data.language;
    let auto_launch = data.enable_auto_launch;
    let enable_upnp = data.enable_upnp;
    let bt_listen_port = data.bt_listen_port;
    let dht_listen_port = data.dht_listen_port;

    let upnp_changed =
        enable_upnp.is_some() || bt_listen_port.is_some() || dht_listen_port.is_some();
    let updated_motrix = Config::motrix().draft().clone();
    let persist = || {
        if upnp_changed {
            feat::create_upnp_mappings(&updated_motrix)?;
        }
        let mut flag_signal: i32 = UpdateFlags::None as i32;

        if language.is_some() {
            flag_signal |= UpdateFlags::TrayMenu as i32;
        }

        if auto_launch.is_some() {
            flag_signal |= UpdateFlags::Launch as i32;
        }

        // ------
        // Process updates based on flags
        if (flag_signal & (UpdateFlags::Launch as i32)) != 0 {
            sys_opt::SysOpt::global().update_launch()?;
        }

        if (flag_signal & (UpdateFlags::TrayMenu as i32)) != 0 {
            service::tray::update_tray_menu()?;
        }

        updated_motrix.save_file()?;
        Ok(())
    };
    let res = if shortcuts_changed {
        service::shortcuts::update(&updated_motrix, persist)
    } else {
        persist()
    };

    match res {
        Ok(()) => {
            Config::motrix().apply();
            if upnp_changed {
                if let Err(error) = feat::run_upnp_mapping() {
                    log::error!(target: "app", "Failed to submit UPnP configuration: {error}");
                }
            }
            Ok(())
        }
        Err(err) => {
            Config::motrix().discard();
            Err(err)
        }
    }
}

pub async fn patch_aria2(data: HashMap<String, String>) -> Result<()> {
    let _motrix = MOTRIX_CONFIG_UPDATE.lock().await;
    let _update = ARIA2_CONFIG_UPDATE.lock().await;
    if crate::config::backend::is_external(&Config::motrix().data()) {
        anyhow::bail!("Local aria2 settings are unavailable for an external backend");
    }
    if data.contains_key("rpc-listen-port") || data.contains_key("rpc-secret") {
        anyhow::bail!("Use RPC settings to change the RPC port or secret");
    }
    Config::aria2().draft().patch_config(data.clone());

    // TODO: check conf

    let res = async {
        service::aria2c::change_global_option(&[json!(data)]).await?;
        Config::aria2().draft().save_file()?;
        <Result<()>>::Ok(())
    }
    .await;

    match res {
        Ok(()) => {
            Config::aria2().apply();

            Ok(())
        }
        Err(err) => {
            Config::aria2().discard();
            Err(err)
        }
    }
}

pub async fn patch_aria2_rpc(port: u16, secret: String) -> Result<Aria2Info> {
    let _update = ARIA2_CONFIG_UPDATE.lock().await;
    if Config::motrix().data().aria2_backend.as_deref() == Some("external") {
        anyhow::bail!("Use backend settings to update external RPC credentials");
    }

    let mut config = Config::aria2().data().clone();
    let previous = config.get_client_info();
    config.patch_rpc(port, secret)?;
    let info = config.get_client_info();
    if info != previous {
        crate::core::CoreManager::global()
            .reconfigure_aria2(&config)
            .await?;
        *Config::aria2().draft() = config;
        Config::aria2().apply();
    }
    Ok(info)
}
