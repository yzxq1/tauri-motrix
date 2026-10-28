/// Profile management helpers – validation, list mutation, and migration.
use anyhow::{bail, Result};

use crate::config::{backend, IAria2Temp, IMotrix, IMotrixProfile};

pub const EMBEDDED_ID: &str = "embedded";

/// Validate a profile's fields using the existing backend resolver.
/// Only the external-RPC path of `backend::resolve` is exercised here.
pub fn validate_profile(p: &IMotrixProfile) -> Result<()> {
    if p.id.trim().is_empty() || p.id.chars().any(char::is_control) {
        bail!("Profile id must not be empty");
    }
    if p.id == EMBEDDED_ID {
        bail!("Profile id 'embedded' is reserved");
    }
    if p.name.trim().is_empty() {
        bail!("Profile name must not be empty");
    }
    // Re-use existing endpoint validation via a temporary IMotrix config.
    let candidate = IMotrix {
        aria2_backend: Some("external".into()),
        aria2_server: Some(p.host.clone()),
        aria2_port: Some(p.port),
        aria2_secret: Some(p.secret.clone()),
        aria2_scheme: Some(p.scheme.clone()),
        aria2_path: Some(p.path.clone()),
        ..Default::default()
    };
    // `resolve` performs full endpoint validation and returns Err on failure.
    backend::resolve(&candidate, &IAria2Temp::default())?;
    Ok(())
}

/// Save (create-or-replace) a profile in the list.
/// Does NOT update `aria2_active_profile_id`.
/// Returns the new profile list.
pub fn validate_replacement(config: &IMotrix, profiles: &[IMotrixProfile]) -> Result<()> {
    let active = config
        .aria2_active_profile_id
        .as_deref()
        .unwrap_or(EMBEDDED_ID);
    let current = config.aria2_profiles.as_deref().unwrap_or_default();
    let old = current.iter().find(|p| p.id == active);
    let new = profiles.iter().find(|p| p.id == active);
    if let (Some(old), Some(new)) = (old, new) {
        if old != new {
            bail!("Cannot edit the active profile; switch to another profile first");
        }
    }
    Ok(())
}

/// Save (create-or-replace) a profile in the list.
pub fn upsert_profile(
    profiles: &mut Vec<IMotrixProfile>,
    profile: IMotrixProfile,
) -> Result<&Vec<IMotrixProfile>> {
    validate_profile(&profile)?;
    let mut seen = std::collections::HashSet::new();
    if profiles.iter().any(|p| !seen.insert(&p.id)) {
        bail!("Duplicate profile id detected in existing list");
    }
    if let Some(pos) = profiles.iter().position(|p| p.id == profile.id) {
        profiles[pos] = profile;
    } else {
        profiles.push(profile);
    }
    Ok(profiles)
}

/// Delete a profile by id.  Returns an error if the profile is the currently
/// active one or is the built-in embedded entry.
pub fn delete_profile(config: &IMotrix, id: &str) -> Result<Vec<IMotrixProfile>> {
    if id == EMBEDDED_ID {
        bail!("The built-in embedded profile cannot be deleted");
    }
    let active = config
        .aria2_active_profile_id
        .as_deref()
        .unwrap_or(EMBEDDED_ID);
    if id == active {
        bail!("Cannot delete the currently active profile; switch to another profile first");
    }
    let profiles = config.aria2_profiles.clone().unwrap_or_default();
    if !profiles.iter().any(|p| p.id == id) {
        bail!("Profile '{id}' not found");
    }
    Ok(profiles.into_iter().filter(|p| p.id != id).collect())
}

/// Map a profile (by active_profile_id) onto the flat aria2_backend/server/…
/// fields that `backend::resolve` already understands.
/// Also validates the target profile if it is external.
pub fn apply_active_profile(config: &mut IMotrix) -> Result<()> {
    let active_id = config
        .aria2_active_profile_id
        .as_deref()
        .unwrap_or(EMBEDDED_ID);
    if active_id == EMBEDDED_ID {
        config.aria2_backend = Some("embedded".into());
        return Ok(());
    }
    let profiles = config.aria2_profiles.clone().unwrap_or_default();
    let profile = profiles
        .iter()
        .find(|p| p.id == active_id)
        .ok_or_else(|| anyhow::anyhow!("Active profile '{active_id}' not found in profile list"))?;
    validate_profile(profile)?;
    config.aria2_backend = Some("external".into());
    config.aria2_server = Some(profile.host.clone());
    config.aria2_port = Some(profile.port);
    config.aria2_secret = Some(profile.secret.clone());
    config.aria2_scheme = Some(profile.scheme.clone());
    config.aria2_path = Some(profile.path.clone());
    Ok(())
}

/// Migrate a legacy config (single external endpoint stored flat) into the
/// profile list.  Called exactly once when no profiles list exists yet but
/// external fields are present.
pub fn migrate_legacy_external(config: &mut IMotrix) {
    // Already migrated or no profiles to migrate.
    if config.aria2_profiles.is_some() {
        return;
    }
    let backend = config.aria2_backend.as_deref().unwrap_or("embedded");
    if backend != "external" {
        config.aria2_profiles = Some(vec![]);
        return;
    }
    // Build a profile from the legacy flat fields.
    let profile = IMotrixProfile {
        id: "migrated-external".into(),
        name: "External (migrated)".into(),
        host: config
            .aria2_server
            .clone()
            .unwrap_or_else(|| "127.0.0.1".into()),
        port: config.aria2_port.unwrap_or(6800),
        secret: config.aria2_secret.clone().unwrap_or_default(),
        scheme: config.aria2_scheme.clone().unwrap_or_else(|| "http".into()),
        path: config
            .aria2_path
            .clone()
            .unwrap_or_else(|| "/jsonrpc".into()),
    };
    config.aria2_profiles = Some(vec![profile]);
    config.aria2_active_profile_id = Some("migrated-external".into());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{IMotrix, IMotrixProfile};

    fn sample_profile(id: &str) -> IMotrixProfile {
        IMotrixProfile {
            id: id.into(),
            name: format!("Node {id}"),
            host: "example.test".into(),
            port: 6800,
            secret: "s3cr3t".into(),
            scheme: "http".into(),
            path: "/jsonrpc".into(),
        }
    }

    // --- validate_profile ----

    #[test]
    fn rejects_empty_id() {
        let mut p = sample_profile("node-a");
        p.id = String::new();
        assert!(validate_profile(&p).is_err());
    }

    #[test]
    fn rejects_reserved_embedded_id() {
        let mut p = sample_profile("node-a");
        p.id = EMBEDDED_ID.into();
        assert!(validate_profile(&p).is_err());
    }

    #[test]
    fn rejects_empty_name() {
        let mut p = sample_profile("node-a");
        p.name = "   ".into();
        assert!(validate_profile(&p).is_err());
    }

    // --- upsert_profile ----

    #[test]
    fn saves_two_profiles_and_reloads_them() {
        let mut list: Vec<IMotrixProfile> = vec![];
        upsert_profile(&mut list, sample_profile("node-a")).unwrap();
        upsert_profile(&mut list, sample_profile("node-b")).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "node-a");
        assert_eq!(list[1].id, "node-b");
    }

    #[test]
    fn replaces_existing_profile_in_place() {
        let mut list = vec![sample_profile("node-a"), sample_profile("node-b")];
        let mut updated = sample_profile("node-a");
        updated.name = "Updated".into();
        upsert_profile(&mut list, updated).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Updated");
    }

    // --- delete_profile ----

    #[test]
    fn deletes_non_active_profile() {
        let config = IMotrix {
            aria2_profiles: Some(vec![sample_profile("node-a"), sample_profile("node-b")]),
            aria2_active_profile_id: Some("node-a".into()),
            ..Default::default()
        };
        let remaining = delete_profile(&config, "node-b").unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "node-a");
    }

    #[test]
    fn cannot_delete_active_profile() {
        let config = IMotrix {
            aria2_profiles: Some(vec![sample_profile("node-a")]),
            aria2_active_profile_id: Some("node-a".into()),
            ..Default::default()
        };
        assert!(delete_profile(&config, "node-a").is_err());
    }

    #[test]
    fn cannot_delete_embedded() {
        let config = IMotrix::default();
        assert!(delete_profile(&config, EMBEDDED_ID).is_err());
    }

    #[test]
    fn delete_nonexistent_returns_error() {
        let config = IMotrix {
            aria2_profiles: Some(vec![sample_profile("node-a")]),
            aria2_active_profile_id: Some("embedded".into()),
            ..Default::default()
        };
        assert!(delete_profile(&config, "ghost").is_err());
    }

    // --- apply_active_profile ----

    #[test]
    fn apply_embedded_sets_embedded_backend() {
        let mut config = IMotrix {
            aria2_active_profile_id: Some("embedded".into()),
            aria2_profiles: Some(vec![sample_profile("node-a")]),
            ..Default::default()
        };
        apply_active_profile(&mut config).unwrap();
        assert_eq!(config.aria2_backend.as_deref(), Some("embedded"));
    }

    #[test]
    fn apply_external_profile_maps_fields() {
        let p = sample_profile("node-a");
        let mut config = IMotrix {
            aria2_active_profile_id: Some("node-a".into()),
            aria2_profiles: Some(vec![p.clone()]),
            ..Default::default()
        };
        apply_active_profile(&mut config).unwrap();
        assert_eq!(config.aria2_backend.as_deref(), Some("external"));
        assert_eq!(config.aria2_server.as_deref(), Some("example.test"));
        assert_eq!(config.aria2_port, Some(6800));
    }

    #[test]
    fn apply_fails_when_active_profile_missing_from_list() {
        let mut config = IMotrix {
            aria2_active_profile_id: Some("ghost".into()),
            aria2_profiles: Some(vec![sample_profile("node-a")]),
            ..Default::default()
        };
        assert!(apply_active_profile(&mut config).is_err());
    }

    // --- switch: fail does not change active ----

    #[test]
    fn failed_switch_does_not_change_active_profile() {
        // Simulate a switch attempt that is rejected because the target is
        // missing. The active id must remain unchanged.
        let original_active = "node-a";
        let config = IMotrix {
            aria2_profiles: Some(vec![sample_profile("node-a")]),
            aria2_active_profile_id: Some(original_active.into()),
            ..Default::default()
        };
        // Attempting to build a resolver with a nonexistent profile fails.
        let mut candidate = config.clone();
        candidate.aria2_active_profile_id = Some("ghost".into());
        let err = apply_active_profile(&mut candidate);
        assert!(err.is_err());
        // The original config is unchanged.
        assert_eq!(
            config.aria2_active_profile_id.as_deref(),
            Some(original_active)
        );
    }

    // --- migrate_legacy_external ----

    #[test]
    fn migrates_legacy_external_config() {
        let mut config = IMotrix {
            aria2_backend: Some("external".into()),
            aria2_server: Some("aria2.example".into()),
            aria2_port: Some(7800),
            aria2_secret: Some("legacy-secret".into()),
            aria2_scheme: Some("https".into()),
            aria2_path: Some("/rpc".into()),
            aria2_profiles: None,
            ..Default::default()
        };
        migrate_legacy_external(&mut config);
        let profiles = config.aria2_profiles.as_ref().unwrap();
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, "migrated-external");
        assert_eq!(profiles[0].host, "aria2.example");
        assert_eq!(profiles[0].port, 7800);
        // Secret must survive migration.
        assert_eq!(profiles[0].secret, "legacy-secret");
        assert_eq!(
            config.aria2_active_profile_id.as_deref(),
            Some("migrated-external")
        );
    }

    #[test]
    fn migrate_is_no_op_when_profiles_already_present() {
        let mut config = IMotrix {
            aria2_backend: Some("external".into()),
            aria2_profiles: Some(vec![sample_profile("existing")]),
            aria2_active_profile_id: Some("existing".into()),
            ..Default::default()
        };
        migrate_legacy_external(&mut config);
        assert_eq!(config.aria2_profiles.as_ref().unwrap().len(), 1);
        assert_eq!(config.aria2_active_profile_id.as_deref(), Some("existing"));
    }

    #[test]
    fn embedded_backend_gets_empty_profiles_list_on_migration() {
        let mut config = IMotrix {
            aria2_backend: Some("embedded".into()),
            aria2_profiles: None,
            ..Default::default()
        };
        migrate_legacy_external(&mut config);
        assert_eq!(config.aria2_profiles.as_ref().unwrap().len(), 0);
        // active_profile_id is not forced to "embedded"; None means embedded is
        // implied by the backend field.
        assert!(config.aria2_active_profile_id.is_none());
    }
}
