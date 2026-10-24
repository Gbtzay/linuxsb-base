# M14：AI 工作台证据新鲜度与回答复核设计

## 状态

设计已确认。M14 按完整交付拆为材料新鲜度、引用惰性复核和回答版本对照三部分；实现阶段继续遵守不使用子代理、不自动提交或推送。

## 目标

M13 让长对话可以通过有限历史和范围摘要继续追问。M14 进一步区分“回答缓存是否仍适用”和“回答中的引用是否仍然可验证”：材料变化时让回答缓存失效并使用新材料生成；引用需要复核时只重新读取引用涉及的本地材料，保留旧回答并展示差异。旧回答、摘要和引用状态都不能替代本轮材料，也不能授权任何站内写操作。

## 范围与非目标

本轮覆盖：

1. 保存安全的材料快照、材料指纹和引用指纹。
2. 缓存命中前区分回答新鲜度和引用新鲜度。
3. 按引用惰性重读主题页/分页，比较引用对应的帖子变化。
4. 工作台保留旧回答版本，提供引用复核、差异查看和用新材料重新生成。
5. 迁移 M12/M13 的历史和缓存；旧记录缺少快照时进入待复核状态，不自动删除或重放。
6. 为取消、路由变化、会话切换、网络失败和写操作隔离补充测试及真实浏览器验收。

本轮不做：

- 不自动修改站内内容，不把复核流程接入任何 write action。
- 不把模型摘要、旧回答或旧引用当成本轮证据。
- 不全量周期性抓取主题，不实现跨主题证据图谱或长对话再次压缩。
- 不恢复短期目标 key、CSRF、原始 URL 或动作参数。

## 核心边界

材料新鲜度和引用新鲜度是两个独立状态：

- **回答缓存新鲜度**由回答请求的语义指纹和当前材料指纹共同决定。当前问题、模型、模式、配置、对话上下文或材料指纹变化时，原回答不能作为当前请求的成功缓存。
- **引用新鲜度**由引用对应的主题、分页、楼层、帖子 ID、作者和正文指纹决定。引用复核可以只更新引用状态，不触发模型回答。
- **旧回答**只能以“上一版本”显示；它可以帮助用户比较，不能作为当前回答的事实依据。
- **本轮材料**仍由本地页面解析和引用映射产生；模型提供的楼层号、URL、正文和状态都必须重新在本地验证。

## 模块与接口

### 1. 基座纯函数模块

新增 `src/ai-evidence.js`，不执行网络请求、不访问 DOM、不保存状态，提供：

```js
buildEvidenceSnapshot(posts, scope, options = {})
// => {
//   version: 1,
//   scope: { kind, routeType, topicId, routeScope },
//   materialFingerprint: string,
//   citations: [{ topicId, postId, floor, page, authorName, excerpt, contentFingerprint }],
// }

diffEvidenceSnapshots(previous, current)
// => {
//   status: 'unchanged' | 'changed' | 'removed' | 'unverifiable',
//   rows: [{ key, status, before, after, reason }],
//   counts: { unchanged, changed, removed, unverifiable },
// }

mergeCitationReview(previousRows, review)
// => normalized citation rows with explicit freshness state
```

快照只保留经现有脱敏规则处理的作者名、短摘录、正整数主题/帖子/楼层/分页和 Unicode 内容指纹。`excerpt` 不作为比较依据，指纹由规范化正文、作者、帖子 ID 和楼层生成。相同主题页的重复引用只生成一条读取目标，稳定排序保证指纹可复现。基座通过 `api.ai.evidence` 暴露函数，插件不直接导入基座源码。

### 2. `ai-copilot` 缓存与复核

回答缓存记录在现有 `meta` 白名单中增加：

```js
{
  semanticFingerprint: '...',
  materialFingerprint: '...',
  evidenceSnapshot: { version: 1, scope: {}, materialFingerprint: '...', citations: [] },
  citationReview: {
    version: 1,
    reviewedAt: 0,
    status: 'fresh' | 'changed' | 'removed' | 'unverifiable',
    counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 },
    rows: []
  }
}
```

`semanticFingerprint` 排除材料正文，但包含问题、模式、模型、配置、对话/摘要来源指纹和协议版本，用于找到同一问题的旧回答。`materialFingerprint` 变化会使成功回答缓存失效；旧记录仍保留作为工作台的上一版本。回答生成失败、停止或网络中断时不覆盖旧记录。

副驾新增只读复核接口：

```js
revalidateCitations({ snapshot, citations, scope, signal })
// => { status, reviewedAt, materialFingerprint, rows, counts }
```

复核先从当前 DOM 满足可验证的引用；其余按 `topicId + page` 去重后使用 `api.net.doc(api.routes.topic(topicId, page))` 读取。每次最多复核 40 条引用、8 个页面，并使用共享字符预算；所有读取均携带 `AbortSignal`，只使用站内 GET/文档解析。页面错误、范围变化、楼层消失和内容不一致分别标为 `unverifiable`、`removed` 或 `changed`，任何失败都不会把引用提升为 `known`。

`run()` 的缓存流程如下：

1. 读取当前范围材料并计算当前快照。
2. 语义指纹和材料指纹都匹配时复用回答，并沿用已验证引用。
3. 语义指纹匹配但材料指纹变化时，不复用旧回答；把旧记录作为上一版本，使用当前材料正常生成新回答。
4. 用户点击“重新校验引用”或引用超过复核期限时，只调用 `revalidateCitations()`；结果不触发模型调用。
5. 当前回答、引用状态、阶段 trace 和缓存写入均检查请求 token 与 `signal`；停止、切换会话/路由、插件卸载后拒绝迟到结果。

### 3. `ai-workbench` 记录与界面

对话 turn 增加受限字段：

```js
{
  freshness: {
    status: 'fresh' | 'material-stale' | 'citation-stale' | 'unverifiable' | 'legacy',
    reviewedAt: 0,
    materialFingerprint: '...',
    counts: { unchanged: 0, changed: 0, removed: 0, unverifiable: 0 }
  },
  revisions: [{
    id: '...',
    answer: '脱敏旧回答',
    citations: [],
    materialFingerprint: '...',
    createdAt: 0,
    reason: 'material-changed' | 'manual-regenerate'
  }]
}
```

`revisions` 最多保存最近 2 个版本，遵守回答字符和会话 1 MiB 上限。旧版本只在当前会话范围内显示，不能进入 `site-action` 的计划、执行、重试或结果检查。

工作台在回答卡上显示：

- `材料新鲜`：当前回答和引用均可复用。
- `材料已变化`：当前回答是新材料生成的，上一版本可展开对照。
- `引用需复核`：提供“重新校验引用”，不自动请求回答模型。
- `引用无法读取`：展示原因和手动重试，不伪造已验证状态。

引用差异按“未变化、内容变化、楼层消失、无法读取”分组，链接仍由本地路由生成。点击“用新材料重新生成”成功后才把新回答设为当前版本；取消或失败时保留旧回答、旧引用和重试入口。复核和生成共享工作台当前请求的取消信号。

## 存储迁移与隐私

- 旧 turn 没有 `freshness` 或 `evidenceSnapshot` 时迁移为 `legacy`，首次打开可手动复核；不联网自动重放、不删除回答。
- 旧缓存记录缺少 `semanticFingerprint` 时不参与语义候选查找，但仍可显示为历史结果；下一次成功生成才补齐字段。
- 所有迁移字段只接受白名单类型、长度和正整数 ID；URL、CSRF、令牌、原始 HTML、动作参数和模型原始响应不得落盘。
- 摘要仍只是背景，不能进入 `evidenceSnapshot`；站内写操作显式使用空历史、空摘要和空引用复核上下文。

## 测试与验收

### 纯函数测试

- 相同帖子排序和重复引用产生稳定材料指纹。
- 正文、作者、帖子 ID、楼层或分页变化分别产生对应 diff。
- 楼层缺失、范围变化和异常输入不会生成已验证引用。
- Unicode 截断、脱敏和预算限制不泄露 URL/凭据。

### 副驾测试

- 材料指纹变化使回答缓存失效并携带当前材料。
- 引用复核只读取去重后的页面，不调用模型。
- 当前 DOM、分页 GET、部分失败和 AbortSignal 都按状态返回。
- 复核结果写入缓存但不改变旧回答；生成失败/停止不覆盖旧记录。
- 摘要、对话历史、site-action 计划与复核数据互相隔离。

### 工作台测试

- 旧回答版本可展开、引用差异正确渲染。
- 重新生成成功切换当前版本；失败、停止、路由变化和会话切换保留旧版本。
- legacy 历史安全迁移，复核状态和 revisions 受容量限制。
- 写计划、执行、重试和结果检查没有 `freshness`、`revisions`、`evidenceSnapshot` 或历史摘要。

### 真实浏览器验收

本地模型 fixture 验证材料变化、引用消失、分页复核、复核中止、旧/新回答对照、引用链接渲染和网络中断。不得调用真实站内写接口或付费模型。交付前运行：

```text
npm test
npm run build
npm run verify:dist
git diff --check
node scripts/check-ai-workbench-browser.mjs
```

## 版本与交付切分

- 基座：`0.1.52`，提供 `api.ai.evidence`。
- `ai-copilot`：`0.11.0`，提供材料快照、引用复核和缓存新鲜度字段。
- `ai-workbench`：`0.7.0`，提供旧回答版本、复核状态和差异 UI。
- Oxygen/LTS：`1.0.132`，同步模块清单和产物校验。

交付分为 M14.1（纯函数与缓存契约）、M14.2（引用复核与取消）、M14.3（工作台对照 UI 与迁移），每部分都先写失败测试、跑定向测试，再跑完整回归和真实浏览器验收。
