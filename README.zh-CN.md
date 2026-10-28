# Tauri Motrix — yzxq1 fork

[简体中文](README.zh-CN.md) | [English](README.md)

这是基于上游 Tauri Motrix 的公开 fork，重点增加了多 aria2 RPC 后端管理能力。

## fork 新增功能

### 多 RPC 后端选项卡

打开 **设置 → Aria2 → RPC 设置**：

- **本机内置**：应用自带的 aria2 后端，固定保留，不能删除；
- 点击 `+` 添加新的外部 aria2 RPC 配置；
- 每个配置可以自定义名称；
- 支持 HTTP、HTTPS、IPv6、自定义 RPC 路径和 RPC 密钥；
- 点击“测试连接”只测试，不切换；
- 点击“保存”只保存配置，不改变当前后端；
- 点击“应用切换”后才真正切换后端；
- 非当前使用中的外部配置可以删除；
- 当前使用中的配置不能直接删除或修改，需先切换到其他后端。

### 安全和稳定性改进

- 切换前进行地址校验和 RPC 认证探测；
- 切换失败时保留原来的后端和配置；
- 防止旧 RPC 请求和事件覆盖新后端状态；
- 外部任务禁止在本机打开或删除远程文件；
- 外部任务不写入本地下载历史；
- 外部 aria2 不会被 Motrix 启动或关闭；
- 禁用上游自动更新，避免 fork 修改被覆盖；
- 修复 macOS 点击 Dock 图标无法恢复隐藏/最小化窗口的问题。

## 下载

当前预览版：

[下载 Tauri Motrix 0.2.5 Backend Preview 2](https://github.com/yzxq1/tauri-motrix/releases/tag/backend-preview-0.2.5-2)

该版本提供 Apple Silicon（ARM64）macOS DMG。预览包使用临时签名，未进行 Apple 公证。

## 验证结果

- 前端：68 个测试套件，472 项通过，5 项跳过；
- Rust：77 项通过，0 项失败；
- ARM64 DMG：本机编译、打包并通过严格签名校验；
- M1 未升级，当前版本仅用于本机测试。

## 详细文档

- [外部 aria2 RPC 配置和限制](docs/external-backend.md)
- [GitHub Release](https://github.com/yzxq1/tauri-motrix/releases)
- [上游项目 Tauri Motrix](https://github.com/Taoister39/tauri-motrix)

项目原始许可证和上游版权信息保持不变。
