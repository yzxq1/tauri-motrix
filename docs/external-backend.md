# External aria2 backend

This fork adds a choice between the bundled aria2 process and an independently managed aria2 RPC service. It does not replace the aria2 binary or migrate downloads between machines.

## Configure

Open **Settings → aria2 → RPC Settings**. The dialog uses tabs:

- **Embedded** is the bundled local aria2 service and cannot be deleted.
- Click **+** to create a named external RPC profile.
- Select a profile tab to edit its saved endpoint.
- Use **Test connection** to probe without switching.
- Use **Save** to persist the profile without changing the active backend.
- Use **Apply and switch** to reconnect Motrix to that profile.
- A non-active external profile can be deleted. The active profile must be switched away before it can be edited or deleted.

Each external profile stores a name, host, port, HTTP or HTTPS scheme, RPC path (normally `/jsonrpc`), and RPC secret. IPv6 hosts are supported. Changes to a profile do not activate until **Apply and switch** is used.

For Docker, publish the RPC port and configure aria2 to listen on the container interface. Use a private network, VPN or authenticated TLS reverse proxy; do not expose unauthenticated RPC to the Internet. Both HTTP JSON-RPC and WebSocket upgrades must reach the same service and path. TLS certificates must be trusted.

## Ownership and switching

- The bundled process uses the existing local aria2 configuration and session.
- A candidate endpoint must answer an authenticated `getVersion` request before it is saved.
- Switching away from the bundled process requests `saveSession` before stopping the managed child. Local downloads pause while that child is stopped and remain in its session.
- External services are never started or shut down by this application. Closing the application or switching away leaves their downloads running.
- Switching back starts the bundled process again. Tasks are not copied between backends.
- The bundled process itself must not be configured as an external service. Run a separate aria2 service for external mode.

## Remote file limitations

Remote paths belong to the server, not the Mac running this interface. Local file opening, local file deletion and local download-history synchronization must not be used for remote tasks. The external backend uses its own download directory. Local aria2 settings and local UPnP mappings do not apply in external mode.

## Project status

This fork is based on Tauri Motrix `0.2.5`. The fork-specific implementation is in `src-tauri/src/config/profiles.rs`, `src-tauri/src/feat/profiles.rs`, `src-tauri/src/cmd/profiles.rs`, and `src/business/setting/ExternalControllerDialog.tsx`. Automated coverage includes profile persistence, migration, validation, tab interactions, switching failures, deletion protections, and stale backend requests.

## Credentials and updates

The RPC secret is stored in the application's local configuration, not in this repository. Protect that configuration and do not share it. Configuration debug output omits credentials.

This fork disables the upstream automatic updater so an upstream release cannot silently replace these changes. Install fork builds manually. Developer builds are not Apple-notarized.
