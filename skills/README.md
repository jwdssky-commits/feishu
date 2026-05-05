# ~/.openclaw/skills - 共享技能目录

## 📚 概述

此目录包含所有 OpenClaw Agent 实例共享的技能文件。工作区的 `skills/` 目录通过符号链接指向此处，实现技能的统一管理和复用。

---

## 📁 目录结构

```
~/.openclaw/skills/
├── docbot                          # 自定义技能
├── lark-approval                   # 飞书审批技能
├── lark-attendance                 # 飞书考勤技能
├── lark-base                       # 飞书多维表格技能
├── lark-calendar                   # 飞书日历技能
├── lark-contact                    # 飞书通讯录技能
├── lark-doc                        # 飞书文档技能
├── lark-drive                      # 飞书云盘技能
├── lark-event                      # 飞书活动技能
├── lark-im                         # 飞书即时消息技能
├── lark-mail                       # 飞书邮箱技能
├── lark-minutes                    # 飞书妙记技能
├── lark-okr                        # 飞书 OKR 技能
├── lark-openapi-explorer           # 飞书 API 探索器
├── lark-shared                     # 飞书共享技能
├── lark-sheets                     # 飞书表格技能
├── lark-skill-maker                # 技能制作工具
├── lark-slides                     # 飞书幻灯片技能
├── lark-task                       # 飞书任务技能
├── lark-vc                         # 飞书视频会议技能
├── lark-whiteboard                 # 飞书白板技能
├── lark-wiki                       # 飞书知识库技能
├── lark-workflow-meeting-summary   # 会议总结工作流
└── lark-workflow-standup-report    # 站会报告工作流
```

---

## 🔧 使用方式

### 方式 1：工作区符号链接（推荐）

在工作区的 `skills/` 目录创建符号链接：

```bash
cd /path/to/workspace/skills
ln -s ~/.openclaw/skills/lark-calendar .
ln -s ~/.openclaw/skills/docbot .
```

### 方式 2：Agent 配置中指定

在 Agent 配置中显式指定技能路径：

```yaml
skills:
  - ~/.openclaw/skills/lark-calendar
  - ~/.openclaw/skills/lark-doc
  - ~/.openclaw/skills/docbot
```

### 方式 3：全局加载（所有 Agent）

OpenClaw 会自动加载 `~/.openclaw/skills/` 目录下的所有技能，无需额外配置。

---

## 📋 技能列表

### 飞书官方技能 (23 个)

| 技能名称 | 功能 | 主要命令 |
|----------|------|----------|
| lark-approval | 审批管理 | `lark-cli approval` |
| lark-attendance | 考勤打卡 | `lark-cli attendance` |
| lark-base | 多维表格 | `lark-cli base` |
| lark-calendar | 日历管理 | `lark-cli calendar` |
| lark-contact | 通讯录 | `lark-cli contact` |
| lark-doc | 云文档 | `lark-cli docs` |
| lark-drive | 云盘 | `lark-cli drive` |
| lark-event | 活动 | `lark-cli event` |
| lark-im | 即时消息 | `lark-cli im` |
| lark-mail | 邮箱 | `lark-cli mail` |
| lark-minutes | 妙记 | `lark-cli minutes` |
| lark-okr | OKR | `lark-cli okr` |
| lark-openapi-explorer | API 探索 | `lark-cli openapi` |
| lark-shared | 共享协作 | `lark-cli shared` |
| lark-sheets | 电子表格 | `lark-cli sheets` |
| lark-skill-maker | 技能制作 | `lark-cli skill-maker` |
| lark-slides | 幻灯片 | `lark-cli slides` |
| lark-task | 任务管理 | `lark-cli task` |
| lark-vc | 视频会议 | `lark-cli vc` |
| lark-whiteboard | 白板 | `lark-cli whiteboard` |
| lark-wiki | 知识库 | `lark-cli wiki` |
| lark-workflow-meeting-summary | 会议总结 | 工作流自动触发 |
| lark-workflow-standup-report | 站会报告 | 工作流自动触发 |

### 自定义技能 (1 个)

| 技能名称 | 功能 | 说明 |
|----------|------|------|
| docbot | 文档搜索与总结 | 子 Agent，负责搜索飞书文档并生成摘要 |

---

## 🔄 同步机制

### 工作区 → 共享目录

当在工作区创建新技能时，应复制到共享目录：

```bash
# 1. 在工作区创建技能
mkdir -p /workspace/skills/my-skill
# ... 编写 SKILL.md ...

# 2. 复制到共享目录
cp -r /workspace/skills/my-skill ~/.openclaw/skills/

# 3. 更新工作区为符号链接
rm -rf /workspace/skills/my-skill
ln -s ~/.openclaw/skills/my-skill /workspace/skills/my-skill
```

### 共享目录 → 工作区

当共享技能更新时，所有工作区的符号链接自动生效，无需额外操作。

---

## ⚠️ 注意事项

1. **不要直接编辑符号链接**：编辑技能文件时，直接修改 `~/.openclaw/skills/<skill>/` 下的文件
2. **版本控制**：工作区的 `skills/` 目录应提交符号链接到 git，而不是实际文件
3. **技能依赖**：某些技能可能依赖 `node_modules/` 中的插件，确保工作区已安装
4. **权限共享**：飞书 CLI 的 OAuth token 存储在 `~/.lark-cli/`，所有 Agent 实例共享

---

## 📊 统计信息

- **技能总数**: 24 个
- **飞书官方技能**: 23 个
- **自定义技能**: 1 个 (docbot)
- **最后更新**: 2026-04-27

---

## 🛠️ 维护指南

### 添加新技能

```bash
# 1. 在共享目录创建技能
mkdir -p ~/.openclaw/skills/my-new-skill
# 2. 编写 SKILL.md
# 3. 在工作区创建符号链接
ln -s ~/.openclaw/skills/my-new-skill /workspace/skills/my-new-skill
```

### 删除技能

```bash
# 1. 删除工作区符号链接
rm /workspace/skills/old-skill
# 2. 从共享目录删除（可选）
rm -rf ~/.openclaw/skills/old-skill
```

### 更新技能

直接编辑 `~/.openclaw/skills/<skill>/` 下的文件，所有工作区自动生效。

---

**维护者**: FeishuClaw  
**最后更新**: 2026-04-27
