use crate::{config::IMotrixProfile, feat, wrap_err};

use super::CmdResult;

/// Return the full profile list. The synthetic "embedded" entry is NOT included
/// here because it has no persisted state; the front-end synthesises it itself.
#[tauri::command]
pub fn get_motrix_profiles() -> CmdResult<Vec<IMotrixProfile>> {
    Ok(crate::config::Config::motrix()
        .data()
        .aria2_profiles
        .clone()
        .unwrap_or_default())
}

/// Persist the profile list (offline save – does not reconnect).
#[tauri::command]
pub async fn save_motrix_profiles(profiles: Vec<IMotrixProfile>) -> CmdResult<Vec<IMotrixProfile>> {
    wrap_err!(feat::save_profiles(profiles).await)
}

/// Switch to a different active profile and reconnect.
#[tauri::command]
pub async fn switch_motrix_profile(profile_id: String) -> CmdResult<()> {
    wrap_err!(feat::switch_profile(profile_id).await)
}
