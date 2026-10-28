use anyhow::Result;
use serde_json::{json, Value};

use crate::{
    config::{backend, Aria2Info},
    logging,
    utils::logging::Type,
};

pub fn ensure_prefix(name: &str) -> String {
    if name.starts_with("aria2.") || name.starts_with("system.") {
        name.to_string()
    } else {
        format!("aria2.{}", name)
    }
}

pub async fn call(name: &str, data: &[Value]) -> Result<Value> {
    let info = backend::current()?;
    call_with_info(&info, name, data).await
}

fn rpc_params(name: &str, data: &[Value], secret: &str) -> Vec<Value> {
    let mut params = Vec::new();
    if !secret.is_empty() && ensure_prefix(name).starts_with("aria2.") {
        params.push(json!(format!("token:{secret}")));
    }
    params.extend_from_slice(data);
    params
}

pub async fn call_with_info(info: &Aria2Info, name: &str, data: &[Value]) -> Result<Value> {
    let url = &info.http_url;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(2))
        .build()?;

    let id = uuid::Uuid::new_v4().to_string();

    let json_rpc_message = json!({
        "jsonrpc": "2.0",
        "method":ensure_prefix(name),
        "id": id,
        "params": rpc_params(name, data, &info.secret)
    });

    logging!(info, Type::Engine, true, "aria2c call: {}", name);

    let res = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(json_rpc_message.to_string())
        .send()
        .await
        .map_err(|_| anyhow::anyhow!("Unable to connect to aria2 RPC"))?
        .error_for_status()
        .map_err(|_| anyhow::anyhow!("aria2 RPC returned an HTTP error"))?
        .json::<Value>()
        .await
        .map_err(|_| anyhow::anyhow!("Invalid aria2 RPC response"))?;

    logging!(info, Type::Engine, true, "aria2c call completed: {}", name);

    if res.get("error").is_some() {
        anyhow::bail!("aria2 RPC rejected the request");
    }

    if res.get("result").is_none() {
        anyhow::bail!("Invalid aria2 RPC response");
    }
    if name == "getVersion" && res["result"]["version"].as_str().is_none() {
        anyhow::bail!("Invalid aria2 version response");
    }
    Ok(res)
}

pub async fn change_global_option(data: &[Value]) -> Result<Value> {
    call("changeGlobalOption", data).await
}

pub async fn unpause_all() -> Result<Value> {
    call("unpauseAll", [].clone().as_ref()).await
}

#[cfg(test)]
mod tests {
    use super::rpc_params;
    use serde_json::json;

    #[test]
    fn rpc_authentication_params() {
        let options = json!({"dir": "Downloads"});
        assert_eq!(
            rpc_params("changeGlobalOption", &[options.clone()], "secret"),
            vec![json!("token:secret"), options.clone()]
        );
        assert_eq!(
            rpc_params("changeGlobalOption", &[options.clone()], ""),
            vec![options]
        );
        assert!(rpc_params("system.listMethods", &[], "secret").is_empty());
    }
}
