# Heartbeat Configuration
运行机制状态

# State
- **Type**: 事件触发型 (Event-Driven)
- **Status**: 休眠/监听

# Description
当前 `pre-meeting agent` 为下游执行节点。不需要主动定时轮询外部 API。
它的生命周期由接收到 `Main Agent` 或消息队列的派发指令（Payload）时瞬间激活，任务执行完毕并返回简报结果后，立即销毁当前上下文并重新进入休眠状态。