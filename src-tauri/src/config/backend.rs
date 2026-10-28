use super::{Aria2Info, Config, IAria2Temp, IMotrix};
use anyhow::{bail, Result};

pub fn is_external(config: &IMotrix) -> bool {
    config.aria2_backend.as_deref() == Some("external")
}

pub fn current() -> Result<Aria2Info> {
    resolve(&Config::motrix().data(), &Config::aria2().data())
}

pub fn resolve(config: &IMotrix, local: &IAria2Temp) -> Result<Aria2Info> {
    if !matches!(
        config.aria2_backend.as_deref(),
        None | Some("embedded") | Some("external")
    ) {
        bail!("Invalid aria2 backend");
    }
    if !is_external(config) {
        return Ok(local.get_client_info());
    }
    let host = config.aria2_server.as_deref().unwrap_or("127.0.0.1");
    let scheme = config.aria2_scheme.as_deref().unwrap_or("http");
    let path = config.aria2_path.as_deref().unwrap_or("/jsonrpc");
    let port = config.aria2_port.unwrap_or(16801);
    let secret = config.aria2_secret.clone().unwrap_or_default();
    if !matches!(scheme, "http" | "https")
        || port == 0
        || host.is_empty()
        || host.contains(['/', '\\', '@', '?', '#'])
        || host.chars().any(|c| c.is_whitespace() || c.is_control())
        || !path.starts_with('/')
        || path.starts_with("//")
        || path.contains(['?', '#', '\\'])
        || path.chars().any(char::is_control)
        || secret.contains(['\r', '\n', '\0'])
    {
        bail!("Invalid external RPC endpoint");
    }
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let authority = if host.contains(':') {
        let address: std::net::Ipv6Addr = host
            .parse()
            .map_err(|_| anyhow::anyhow!("Invalid IPv6 host"))?;
        format!("[{address}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    let url = reqwest::Url::parse(&format!("{scheme}://{authority}{path}"))
        .map_err(|_| anyhow::anyhow!("Invalid external RPC endpoint"))?;
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        bail!("Invalid external RPC host");
    }
    let mut ws = url.clone();
    ws.set_scheme(if scheme == "https" { "wss" } else { "ws" })
        .map_err(|_| anyhow::anyhow!("Invalid RPC scheme"))?;
    Ok(Aria2Info {
        port,
        server: authority,
        secret,
        http_url: url.to_string(),
        ws_url: ws.to_string(),
        external: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_resolution_has_no_global_configuration_dependency() {
        let local = IAria2Temp::default();
        assert_eq!(
            resolve(&IMotrix::default(), &local).unwrap(),
            local.get_client_info()
        );
    }

    #[test]
    fn external_ipv6_tls_and_path_are_shared_by_both_transports() {
        let config = IMotrix {
            aria2_backend: Some("external".into()),
            aria2_server: Some("::1".into()),
            aria2_port: Some(6800),
            aria2_scheme: Some("https".into()),
            aria2_path: Some("/proxy/rpc".into()),
            ..Default::default()
        };
        let info = resolve(&config, &IAria2Temp::default()).unwrap();
        assert_eq!(info.http_url, "https://[::1]:6800/proxy/rpc");
        assert_eq!(info.ws_url, "wss://[::1]:6800/proxy/rpc");
    }

    #[test]
    fn external_resolution_preserves_local_settings_and_redacts_debug() {
        let mut local = IAria2Temp::default();
        local.patch_rpc(6800, "local-secret".into()).unwrap();
        let before = local.get_client_info();
        let config = IMotrix {
            aria2_backend: Some("external".into()),
            aria2_server: Some("example.test".into()),
            aria2_secret: Some("private-external-secret".into()),
            aria2_port: Some(9000),
            ..Default::default()
        };
        let info = resolve(&config, &local).unwrap();
        assert_eq!(info.http_url, "http://example.test:9000/jsonrpc");
        assert_eq!(info.secret, "private-external-secret");
        assert_eq!(local.get_client_info(), before);
        assert!(!format!("{config:?}").contains("private-external-secret"));
    }

    #[test]
    fn rejects_credentials_urls_ports_and_unsafe_paths() {
        let mut config = IMotrix {
            aria2_backend: Some("external".into()),
            ..Default::default()
        };
        for host in [
            "",
            "a@host",
            "https://host",
            "host:123",
            "host/path",
            "host name",
        ] {
            config.aria2_server = Some(host.into());
            assert!(resolve(&config, &IAria2Temp::default()).is_err());
        }
        config.aria2_server = Some("localhost".into());
        config.aria2_port = Some(0);
        assert!(resolve(&config, &IAria2Temp::default()).is_err());
        config.aria2_port = Some(6800);
        for path in ["rpc", "//host/rpc", "/rpc?token=secret", "/rpc#fragment"] {
            config.aria2_path = Some(path.into());
            assert!(resolve(&config, &IAria2Temp::default()).is_err());
        }
    }
}
