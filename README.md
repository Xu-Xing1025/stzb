# 率土配将助手

Windows 本地优先的账号资源管理与智能配将项目。首个模拟器目标为 MuMu。

**另一台电脑 / Codex 接手：先读 [开发交接摘要](docs/HANDOFF.md)。** 根目录 `AGENTS.md` 会引导 Codex 读取当前方向与限制，完整聊天仅作历史参考。

## 当前状态

已实现不依赖模拟器的资源管理初版：角色与赛季维护，武将、战法、宝物增删改，MySQL 保存及 JSON 导入导出。新增 OpenAI 兼容接口配置、连接测试、基于已核对资源的配将建议、基础资源校验和历史快照。真实模型需自行填写服务地址、模型 ID 及密钥；目前只用本地模拟服务验证链路。MuMu 扫描、OCR 和已审核游戏资料库仍待开发。使用方法见 [本地使用说明](docs/LOCAL-USAGE.md) 和 [模型接入说明](docs/MODEL.md)。

## 使用目标

用户自行在 MuMu 登录游戏 → 扫描资源 → 人工核对 → 保存账号资源 → 根据游戏资料和用途生成配将方案 → 程序校验 → 保存结果。

## 开始准备

1. 安装 Node.js 22或以上，并启动本机 MySQL；现有功能不依赖模拟器或 Python。
2. 执行 `npm.cmd ci --ignore-scripts`，复制 `config/local.example.json` 为 `config/local.json`，填写本机 MySQL 凭据。
3. 执行 `npm.cmd run db:init`，再执行 `npm.cmd start`，访问 `http://127.0.0.1:8765`。
4. 在页面手动维护资源。使用模型时在页面填写真实地址、模型ID及密钥，先测试连接。
5. 跨电脑部署、数据转移与开发验证见 [交接摘要](docs/HANDOFF.md)。Git 不同步数据库和真实配置。
6. MuMu 连接保持暂停，恢复后再适配本机 ADB、实例地址和分辨率，不预设新电脑路径。

## 目录

```text
apps/web/             资源维护、扫描核对与配将界面
services/api/         本地 API 与账号管理
services/collector/   MuMu 连接与扫描任务
packages/contracts/  跨模块数据规范
config/              配置模板与本机配置
scripts/             开发环境检查
docs/                实施路线、验收与待确认事项
data/                画面和备份（运行时生成，忽略提交；数据库为 MySQL）
```

## 技术方向

- 前端：原生 HTML/CSS/JavaScript（当前初版）。
- 后端与采集：资源管理为 Node.js + mysql2；Python 采集后续独立接入。
- 存储：单人版 MySQL，核对画面保存在本地文件目录。
- 识别：OCR、页面定位、必要时视觉模型补充；选择具体引擎前先用实机画面验证。
- 配将：带来源与版本的游戏资料 + 候选生成 + 大模型分析 + 确定性约束校验。

当前采用 MySQL，连接配置保存在 config/local.json。依赖以 package-lock.json 锁定。未下载识别模型或连接大模型服务。

## 开发约定

- 账号资源与全游戏图鉴分开存储；所有资源归属明确的账号和角色。
- 扫描观察值与已确认值分开；扫描结果不能直接覆盖人工维护数据。
- 扫描中断或资源缺失不自动删除数据。
- 游戏知识没有资料时标记未知，不由模型编造机制或胜率。
- 本地服务默认仅监听 `127.0.0.1`。
- 不保存游戏密码或验证码；游戏登录由用户完成。
- MuMu 接入先做设备检测与单帧采集，再适配翻页，不能宣称已有完整扫描能力。

详见 [实施计划](docs/IMPLEMENTATION.md) 与 [数据规范](packages/contracts/README.md)。

## 项目历史

- [需求讨论与操作记录](docs/history/README.md)
- [本机 MuMu 检查记录](docs/MUMU-LOCAL.md)
- [Git 初始化与发布记录](docs/GIT-PUBLISH.md)
