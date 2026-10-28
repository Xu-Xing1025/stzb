# 开发交接摘要

更新：2026-10-28。另一台电脑上的 Codex 先读本文即可了解项目，不需要加载完整聊天。

## 用户目标与确定决定

用户是《率土之滨》玩家，想做 Windows 本地优先的智能配将平台：在电脑模拟器中自行登录账号，软件扫描武将、战法、宝物和赛季，自动翻页识别，允许手动纠错，然后基于实际资源推荐单队/多队阵容。后续可扩展多人平台。

- 模拟器优先 MuMu；当前打不开，扫描步骤先暂停，先完成独立功能。
- 用户明确要求 MySQL，不使用 SQLite。当前技术为 Node.js（本机24）+ mysql2 + 原生 HTML/CSS/JS，没有 React、FastAPI 项目。
- 大模型选 OpenAI 或其他兼容服务，已实现 Chat Completions 适配，但没有真实服务地址、模型ID和密钥的联调结果。
- 没有确认可用的官方账号 API。抓包、藏宝阁只是讨论过的候选，未实现、未验证；当前确定主路线为画面扫描和人工维护。
- 用户用两台电脑开发，代码和精简交接文档通过 Git 同步。仓库：`https://github.com/Xu-Xing1025/stzb.git`，分支 `main`。

## 已实现、已验证

- 角色及赛季维护，武将/战法/宝物增删改、核对标记，按角色隔离。
- MySQL 持久化；资源修改记录、revision 并发冲突检查。
- JSON 导出角色资源；导入创建独立角色副本，不覆盖现有数据。
- 模型连接设置（密钥不回显）、连接测试、1—5队建议、超时/取消、全局单次调用、不自动重试。
- 配将只发送当前角色已核对资源，保存资源快照、模型标识、用量及结果到 MySQL。
- 校验 JSON 结构、站位、资源ID/类型、武将和宝物重复、战法可用数量；缺少战法数量按1次保守检查。
- 7项单元测试及真实 MySQL + 本地模拟模型服务集成测试通过。网页已检查模型设置与配将入口加载；没有完整浏览器自动化回归。

数据库表：`roles`、`resources`、`resource_changes`、`recommendations`。初始化目前为 CREATE IF NOT EXISTS，没有正式迁移系统。

## 未实现、不要误报完成

- MuMu 成功连接、单帧采集、自动翻页、OCR、扫描差异合并和完整性核对。
- 已审核、带版本/来源的游戏资料库；完整赛季/COST/机制限制、武将变体关联、技能冲突检查。
- 实际模型服务联调、配将实战强度验证、战报评估、胜率模拟。
- Windows 安装包、正式数据库迁移、整库备份恢复、凭据管理器及多人云端。

当前推荐只能称“模型建议 + 基础资源校验”，不能称已验证最强阵容。手动输入的加点/词条等目前为灵活属性，不是完整游戏 schema。

## 新电脑启动

前提：Node.js 22或以上、本机 MySQL（本机验证版本为8.0）。无须模拟器或 Python 即可运行现有资源管理和模型功能。

```powershell
git clone https://github.com/Xu-Xing1025/stzb.git
cd stzb
npm.cmd ci --ignore-scripts
Copy-Item config/local.example.json config/local.json
# 编辑 config/local.json，填写这台电脑的 MySQL 凭据。
npm.cmd run db:init
npm.cmd start
```

浏览器：`http://127.0.0.1:8765`，也可双击 `start.cmd`。已有仓库先保存本地修改再 `git pull --ff-only`，有分歧时检查历史后整合，勿强推。

- 独立库名默认 `stzb_assistant`；不要修改其他数据库。密码不写入交接文档，另一台电脑重新配置。
- 模型配置在页面下方设置，写入 `config/model.local.json`，或使用 `STZB_MODEL_API_KEY` 环境变量。模型ID必须根据服务商实际权限填写。文件密钥目前为本地明文。
- 模型接口为基础地址追加 `/chat/completions`；token 参数和 JSON 模式可配置，不是 Responses API 适配器。
- Git 仅同步代码、说明和配置模板，**不自动同步 MySQL 数据或密钥**。账号资源跨机用页面 JSON 导入导出；导入产生新角色ID，不含审计/配将历史。整库迁移需另行备份恢复，不把转储提交仓库。

## 代码入口与验证

| 路径 | 内容 |
| --- | --- |
| services/api/server.mjs | 本地 HTTP API、角色/资源/配将接口 |
| services/api/database.mjs | MySQL 连接和建表 |
| services/api/model.mjs | 模型配置、调用、提示词和输出校验 |
| services/api/validation.mjs | 资源及导入输入校验 |
| apps/web/ | 原生管理页面与模型界面 |
| scripts/verify-mysql.mjs | 本地集成验证，使用模拟服务、无付费调用 |
| tests/ | 单元测试 |
| docs/MODEL.md | 模型参数、发送范围和已知限制 |

```powershell
npm.cmd test
node scripts/verify-mysql.mjs
```

## 下一步建议

1. 在新电脑完成安装、配置和测试，确认现有页面正常，保留用户已录入数据。
2. 用户在本地填写真实模型参数后，验证一次连接和小规模配将；密钥不发聊天、不写日志。
3. 优先补带来源和版本的游戏资料、资源字段及规则，减少凭模型记忆推荐。
4. MuMu 恢复后，经用户明确要求继续，再验证指定实例连接和单帧画面，之后才做扫描。

## 原电脑模拟器背景（不是新电脑配置）

原项目目录 `D:\率土之滨`；MuMu 安装于 `D:\Program Files\YXShuaiTu-12.0`，配置显示版本4.1.42.3773，自带 `shell\adb.exe`。实例静态配置地址127.0.0.1:16384，实测拒绝连接。曾发现另一台ADB设备，未操作；用户要求暂停后停止模拟器工作。不要把此地址直接用于新电脑，也不要误选其他设备。

完整历史保留在 `docs/history/`，仅需追溯细节时查阅；历史中的 SQLite/Python/FastAPI 早期方案和旧进度以本文及当前代码为准。后续任务结束后简要更新本文即可。
