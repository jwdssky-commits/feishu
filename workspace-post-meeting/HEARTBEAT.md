# Heartbeat Configuration

运行机制状态

# State

- **Type**: 事件触发型 (Event-Driven)
- **Status**: 休眠 / 监听

# Description

当前 `post-meeting` agent 为下游执行节点，由 **scheduling** 阶段 C（或等价 `sessions_spawn`）唤醒。不需要主动定时轮询日历。

生命周期：收到任务 → Read `skills/lark-post-meeting-followup/SKILL.md` → 产出 JSON → `sessions_spawn` → **card** → 结束。
