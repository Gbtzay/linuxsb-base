# AI 工作台 M12 交付与验证记录

日期：2026-10-02。开发与验收均在最新工作副本 `D:/test/linuxsb-base` 完成，未使用旧工作树的产物作为状态依据。全程在当前会话执行，未派发子代理。

## 交付行为

- 连续追问使用当前对话、相同页面范围最近三组已完成的只读问答。历史经过脱敏，至多 4,000 字符且占用不超过四分之一的材料预算；缓存指纹包含历史，新对话及不同版块、分页和排序不会混用背景。历史中的引用须由本次材料重新验证，旧写操作不构成授权。
- 生成与只读采集可停止。控制器贯通队列、网络退避、fetch、GM、模型与研究分页；立即恢复输入，拒绝迟到结果和旧请求的清理回调。失败或停止后手动重试同一轮，保留原问题并强制重新生成。
- 回答支持 OpenAI Chat Completions 与 Anthropic Messages 文本流。中途按纯文本显示，成功结束后再校验引用并保存。部分回答只留在页面内存，不能进入成功缓存或后续对话；完成后的阶段记录自动收起。
- 规划继续使用完整 JSON。直接返回 JSON 的端点可使用；明确不支持 stream 且尚未收到正文时最多降级一次，也可在设置中关闭流式回答。
- 实际站内写入沿用既有确认、未知结果和只读检查机制，已发送写入期间不显示“停止生成”。

## 当前构建版本

- Hydrogen：0.1.50。
- Oxygen / LTS：1.0.130；Oxygen 收录 24 个模块，LTS 保持原有精简模块，不收录 AI 插件。
- AI 总结：1.3.0；AI 副驾：0.9.0；AI 工作台：0.5.0。
- AI 站内动作 0.1.1 与 AI 写动作 0.1.4 继续使用现有实现。

## 最终验收证据

- `npm test`：退出码 0，673 个测试通过，0 个失败、取消或跳过；最终运行耗时 80.44 秒。基线为 646 个测试，本轮新增 27 个 M12 测试。
- `npm run build`：退出码 0，生成氢、氧、LTS 三份脚本。
- `npm run verify:dist`：退出码 0，三份产物来自当前源码，版本与 24 个 Oxygen 模块对齐。
- `git -c core.autocrlf=input diff --check`：退出码 0，无补丁空白错误；Git 的行尾转换提示沿用当前 Windows 工作副本设置。
- `node scripts/check-ai-workbench-browser.mjs`：退出码 0，Edge 154.0.4258.37 验证增量正文、最终引用、连续追问、新对话隔离、停止释放输入与底层连接、同轮重试。共 5 次本地模拟模型请求，1 次底层请求被取消；完成后阶段面板收起，没有脚本异常或插件错误。

日志和浏览器截图保留在当前副本的忽略文件中：

- [完整测试日志](D:/test/linuxsb-base/.tmp-m12-full-tests.log)
- [浏览器验证脚本](D:/test/linuxsb-base/scripts/check-ai-workbench-browser.mjs)
- [浏览器结果](D:/test/linuxsb-base/.tmp-m12-browser-report.json)
- [生成中的界面](D:/test/linuxsb-base/.tmp-m12-browser-partial.png)
- [完成后的界面](D:/test/linuxsb-base/.tmp-m12-browser-final.png)

## 本会话自查与验证范围

自行审查本轮增量及请求、缓存、引用、页面生命周期和写动作边界，保留开发前已有的未提交功能。测试发现并修正了本地楼层引用缺少主题 ID、研究追加失败丢失此前回答，以及真实流式调用完成后阶段面板仍展开的问题。

双协议解析、GM 累计进度及 abort 在单元测试中验证；浏览器使用本地论坛 fixture 和模拟模型端点验证 fetch 流。未调用付费模型、未发送真实站内写入，未在 Tampermonkey 扩展与真实供应商组合下验收。当前交付为本地代码与分发产物，尚未发布。

协议实现依据 [OpenAI streaming 文档](https://developers.openai.com/api/docs/guides/streaming-responses)、[Anthropic streaming 文档](https://platform.claude.com/docs/en/build-with-claude/streaming) 与 [Tampermonkey GM_xmlhttpRequest 文档](https://www.tampermonkey.net/documentation.php?ext=d2&q=GM_xmlhttpRequest)核对。
