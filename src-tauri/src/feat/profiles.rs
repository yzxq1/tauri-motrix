/// High-level profile operations (save list, switch active profile).
use anyhow::Result;

use crate::{
    config::{profiles, Config, IMotrixProfile},
    feat,
};

/// Persist the profile list.  Does NOT change the active profile or reconnect.
/// Validation is performed inside `upsert_profile`.
pub async fn save_profiles(new_profiles: Vec<IMotrixProfile>) -> Result<Vec<IMotrixProfile>> {
    let _guard = feat::MOTRIX_CONFIG_UPDATE.lock().await;
    let mut draft = Config::motrix().data().clone();

    // Validate all profiles before touching the config.
    for p in &new_profiles {
        profiles::validate_profile(p)?;
    }

    // Check unique ids.
    let mut seen = std::collections::HashSet::new();
    for p in &new_profiles {
        if !seen.insert(p.id.clone()) {
            anyhow::bail!("Duplicate profile id: {}", p.id);
        }
    }

    profiles::validate_replacement(&draft, &new_profiles)?;
    draft.aria2_profiles = Some(new_profiles.clone());
    draft.save_file()?;
    *Config::motrix().draft() = draft;
    Config::motrix().apply();
    Ok(new_profiles)
}

/// Switch the active profile and reconnect the backend.
/// On failure, the active profile is NOT changed (atomic).
pub async fn switch_profile(profile_id: String) -> Result<()> {
    let _guard = feat::MOTRIX_CONFIG_UPDATE.lock().await;
    let mut next = Config::motrix().data().clone();
    next.aria2_active_profile_id = Some(profile_id.clone());
    // This may fail if the profile is missing or its endpoint is invalid.
    profiles::apply_active_profile(&mut next)?;
    crate::core::CoreManager::global()
        .reconfigure_backend(&next)
        .await?;
    let _ = feat::run_upnp_mapping();
    Ok(())
}
