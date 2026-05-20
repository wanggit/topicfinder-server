# WebSocket 辅导对话替代 SSE 流式

**决策**：辅导对话使用 WebSocket，不用 SSE。REST 接口用于查询、批改、OCR、分析等一次性请求。

**为什么**：
- 微信小程序不原生支持 `EventSource`（SSE 客户端）。`wx.request` + `enableChunked` 的手动流式解析在回调模型下脆弱，长连接可能被微信内核中断。
- `wx.connectSocket` 是微信原生 API，稳定可靠，支持二进制帧。
- 辅导对话本质是多轮双向的（学生发语音→AI 流式回复→学生追问），WebSocket 的单连接双向模型比单向 SSE 更匹配这个交互模式。
- 连接生命周期明确：从学生选题开始建立，学习 session 结束断开。

**放弃的替代方案**：
- **SSE via `wx.request` 流式**：微信小程序的 HTTP 请求在进入后台时会被挂起，长时间流式传输不可靠。
- **纯 REST 轮询**：辅导对话需要即时反馈，轮询延迟不可接受。
