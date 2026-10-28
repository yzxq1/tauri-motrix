use std::collections::HashMap;

use anyhow::Result;

use crate::{
    config::{Aria2Info, Config},
    feat, wrap_err,
};

pub type CmdResult<T = ()> = Result<T, String>;

#[tauri::command]
pub async fn test_aria2_backend(data: crate::config::IMotrix) -> CmdResult<()> {
    let mut candidate = Config::motrix().data().clone();
    candidate.patch_config(data);
    let info = crate::config::backend::resolve(&candidate, &Config::aria2().data())
        .map_err(|e| e.to_string())?;
    crate::service::aria2c::call_with_info(&info, "getVersion", &[])
        .await
        .map(|_| ())
        .map_err(|_| "Unable to connect to aria2 RPC; check endpoint, TLS and credentials".into())
}
/// get aria2 config of sidecar
#[tauri::command]
pub async fn get_aria2_info() -> CmdResult<Aria2Info> {
    wrap_err!(crate::config::backend::current())
}

#[tauri::command]
pub async fn get_aria2_config() -> CmdResult<HashMap<String, String>> {
    if crate::config::backend::is_external(&Config::motrix().data()) {
        return Ok(HashMap::new());
    }
    Ok(Config::aria2().latest().clone().0)
}

#[tauri::command]
pub async fn patch_aria2_config(data: HashMap<String, String>) -> CmdResult<()> {
    wrap_err!(feat::patch_aria2(data).await)
}

#[tauri::command]
pub async fn patch_aria2_rpc(port: u16, secret: String) -> CmdResult<Aria2Info> {
    wrap_err!(feat::patch_aria2_rpc(port, secret).await)
}
