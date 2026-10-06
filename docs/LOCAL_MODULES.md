# Hourleaf 本地模块规范

## 分发与信任边界

Hourleaf 的商店包只包含通用专注核心和本地模块导入器。扩展不会读取 GitHub 模块目录、远程更新清单或任意 URL 来获取逻辑。用户必须先在浏览器外下载文件，再通过文件选择器明确导入。

本地模块最多 32 个。每个模块最多声明 32 个精确 HTTP(S) 来源、128 个元素选择器、100 KB CSS 和 150 KB 用户脚本。通配主机、凭据 URL、远程文件引用、DNR 规则和跨 frame 脚本均会被拒绝。

仓库维护的模块源码位于 `optional-modules/<slug>/`。`npm run package` 会验证基础元数据和引用文件集合，再为每个目录生成独立的 `dist/modules/hourleaf-module-<slug>-<version>.zip` 与 SHA-256；这些资产只发布到 GitHub Release，不进入三平台扩展安装包。

所有可导入内容必须声明非空作者名称和固定格式标识 `hourleaf.local-module`。格式不从扩展名猜测，也不会为旧文件自动补全作者。

## 能力矩阵

| 能力               | Chromium 商店版                           | Firefox AMO 版                  | Safari App Store 版              |
| ------------------ | ----------------------------------------- | ------------------------------- | -------------------------------- |
| 精确域名计时与名单 | 支持                                      | 支持                            | 支持                             |
| 元素隐藏与 CSS     | 支持                                      | 支持                            | 支持                             |
| 本地 DNR 动态规则  | 禁用                                      | 禁用                            | 禁用                             |
| 用户脚本           | 仅 User Scripts API，需用户在扩展详情启用 | 仅 User Scripts API，需可选权限 | 禁用；Apple 商店包不执行导入代码 |

用户脚本固定运行在浏览器的 `USER_SCRIPT` 隔离世界、`document_idle`、顶层 frame，不获得 Hourleaf 的 storage、permissions、tabs 或其他扩展 API。核心不使用 `eval`、`Function`、script 标签或 `scripting.executeScript({code})` 执行导入文本。

## JSON 清单

```json
{
  "schemaVersion": 1,
  "format": "hourleaf.local-module",
  "id": "example.local.focus",
  "name": "Example Focus",
  "author": "Example Author",
  "version": "1.0.0",
  "description": "可选说明",
  "matches": ["https://example.com/*"],
  "domainPolicy": "timed",
  "hideSelectors": [],
  "filterGroups": [
    {
      "id": "home-recommendations",
      "name": "首页推荐",
      "description": "隐藏首页中的普通推荐卡片。",
      "selectors": [".recommendations > .card"]
    }
  ],
  "cssFiles": ["focus.css"],
  "userScriptFiles": ["focus.user.js"]
}
```

- `domainPolicy`：`timed`、`always-allow` 或 `always-block`。黑名单优先于白名单；插件总开关关闭时两者都暂停。
- `format`：必须为 `hourleaf.local-module`；`author` 必须是 1–100 个字符的非空文本。
- `hideSelectors`：只生成 `display: none !important` 规则；这些选择器在模块启用期间始终生效，适合少量不可配置的基础规则。
- `filterGroups`：可选的用户级屏蔽分组，最多 24 组且总选择器数仍受 128 条上限约束。`id` 必须是稳定的小写 kebab-case；`name`、`description` 用于屏蔽页显示，`selectors` 非空。分组默认开启，用户关闭的组 ID 随安装记录保存；模块更新新增组时默认开启，删除的组会从设置中清理。
- `shadowRoots`：可选数组，最多 8 项，格式为 `{ "hostSelector": "#bewly", "mountEvent": "bewlyMounted" }`。宿主选择器遵循普通选择器的 300 字符限制；可选事件名只接受字母开头、最多 64 字符的字母/数字/下划线/冒号/连字符。核心仅将该模块自身的 CSS 和已启用分组规则同步到声明宿主的开放 Shadow DOM，不混入其他模块规则，不穿透关闭的根或 iframe。挂载事件只触发本地根发现，不读取事件数据或执行代码；未声明时仅处理宿主插入及已有页面状态刷新。旧清单默认不进入任何 Shadow DOM。
- `css` / `cssFiles`：内联 CSS 或同一次文件选择中按名称引用的本地 CSS；`@import` 和所有 `url()` 外部资源都会被拒绝。
- `dnrRules`：为兼容 schema 可省略或保留空数组；任何非空规则都会被拒绝。浏览器 DNR 的 `initiatorDomains` 只能表达域名并会覆盖子域，无法兑现 Hourleaf 的精确协议、主机和端口来源契约。
- `userScript` / `userScriptFiles`：仅通过 User Scripts API 注册。

清单不能引用网络 URL。引用文件必须与清单在同一次导入中由用户选择。

## 独立 CSS / User Script

没有 JSON 清单时，文件头必须包含 `@format`、`@id`、`@name`、`@author`、`@version` 和至少一个精确 `@match`：

```text
// ==UserScript==
// @format  hourleaf.local-module
// @id      example.local.script
// @name    Example Script
// @author  Example Author
// @version 1.0.0
// @match   https://example.com/*
// ==/UserScript==
```

`.css` 可使用同样的元数据行。没有 JSON 清单时，每个所选文件都必须完整声明 `@format`、`@id`、`@name`、`@author`、`@version` 和至少一个 `@match`；同次文件的格式、ID、名称、作者与版本必须一致。多个文件一起导入时会合并为一个模块，但不会跟随任何外部引用。

## 导入确认与安全边界

导入确认页必须显示模块名称、作者、格式、版本、精确网站范围和能力。用户必须明确确认：安全检测只是有限防线，不代表 Hourleaf 已审核或担保第三方内容安全；用户应先阅读来源并自行承担导入与运行风险。未确认时不得发起网站授权或导入。

`createLocalModuleImportPreview()` 提供不持久化的确认页数据：`author`、`format`、`version`、`matches`、`capabilities`、`hasUserScript` 以及 `riskDisclosure`。`riskDisclosure.code` 固定为 `review-content-and-assume-risk`，且 `acknowledgementRequired` 固定为 `true`；UI 应用本地化文案显示免责说明，不应把错误码或英文能力名直接呈现给用户。确认后，`IMPORT_LOCAL_MODULE` 还必须携带同一个固定 code，特权消息边界会拒绝缺失或伪造的确认值。

导入器对最多 150 KB 的脚本做一次线性、有限的静态检查，拒绝以下明显不符合专注模块边界的功能：

- `eval` / `Function`、字符串计时器、动态 `import`、`importScripts` 和 WebAssembly 代码生成；
- `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 和 `sendBeacon` 直接外联；
- 常见扩展特权 API 访问、动态 `<script>` 元素注入和 `document.cookie` 访问。

扫描器以一次有界线性遍历识别字符串与注释边界，再检查点号、方括号成员和限定构造器等常见写法，避免字符串中的 `/*` / `*/` 吞掉后续危险代码。这不是通用 JavaScript 恶意代码扫描器，不解压、不解混淆、不追踪别名或数据流，也不保存扫描报告。代码仅在导入和特权边界做同样的归一化；通过后仍只能由浏览器 `USER_SCRIPT` 隔离世界执行。

## 错误码与恢复

`LocalModuleImportError` 提供稳定 `code`、简短默认消息和 `recoverable: true`。UI 可按错误码做多语言映射：

| 错误码                                                       | 用户恢复方向                       |
| ------------------------------------------------------------ | ---------------------------------- |
| `selection-required` / `file-limit-exceeded`                 | 重新选择 1–16 个文件               |
| `invalid-file` / `duplicate-file` / `unsupported-file-type`  | 修正文件名、大小、重名或类型       |
| `multiple-manifests` / `invalid-json` / `invalid-manifest`   | 只保留一个有效 JSON 清单并修正字段 |
| `invalid-reference` / `missing-reference`                    | 修正清单引用或同时选择被引用文件   |
| `metadata-required` / `metadata-conflict`                    | 补全并统一独立文件头               |
| `author-required` / `format-required` / `unsupported-format` | 填写作者并改用标准格式标识         |
| `unsupported-dnr`                                            | 移除所有非空 DNR 规则              |
| `unsafe-css` / `unsafe-user-script`                          | 移除外联资源或被禁高风险功能       |

## 迁移影响

作者、格式标识和空 DNR 是 schema v1 的安全收紧。升级后，本地存储中缺少 `author`、缺少 `format: "hourleaf.local-module"` 或包含非空 DNR 的旧安装不再进入运行时；初始化会清理 Hourleaf 旧版本注册的本地模块 DNR ID 区间。作者需要先更新原始文件，用户再手动重新导入；Hourleaf 不会猜测作者或自动将旧文件标记为已信任。

## 内容分组的启用时间段

每个分组使用统一卡片，上方显示说明和开关，下方提供“启用时间段”摘要；展开后可多选配置页已经保存的对应网站时间段，不会列出其他网站的时段。模块精确来源与配置网站通过共用的网站范围规则匹配；Bilibili 的已审核子域名家族共用时段，其他网站仍按精确来源匹配。默认“不限时间”；选择后，采用每日黑名单：只有当前时间处于任一所选时段的起止范围时才屏蔽。仅借用起止时间，忽略配置时段的星期、启停、访问策略、额度及分组设置；例如选择 12:00–18:00 后，每天从 12:00 开始屏蔽，18:00 恢复，即便此配置时段已停用。取消“不限时间”且没有选择时间段时，该项不屏蔽。模块总开关和分组开关关闭时，时间选择不会越过开关。

安装偏好使用可选 `filterGroupSchedules`，格式为 `{ "group-id": [{ "targetId": "...", "periodId": "..." }] }`，每组最多 64 个引用。缺少组键表示不限时间，空数组表示未选择。此字段是核心保存的用户偏好，不能通过模块清单定义；普通与计划偏好独立，并随配置备份保存。旧安装/备份不含此字段时保持原行为。

修改配置中的起止时间立即影响绑定；修改星期或停用原配置时段不影响屏蔽。删除时间段、删除网站或引用不再属于此模块对应网站后均不再生效；旧的跨站引用显示为失效项供取消，全部失效不会回退为不限时间；规则不受额度或访问策略影响，起止相同表示全天，跨午夜按每天的两侧时间匹配，结束边界不包含。Document 与开放 Shadow DOM 使用相同的有效分组选择器；重新导入模块保留时间绑定。

## 计划期间的屏蔽偏好

设置项 `planMode.enableAllBlocking` 默认开启。有效计划期间，已安装模块的 `planPreferences` 默认 `{ enabled: true, disabledFilterGroupIds: [] }`；屏蔽页现有开关只修改当前普通或计划偏好，不额外添加配置入口。停止/完成/到期及关闭此设置后恢复普通偏好；再次开始计划保留之前的计划调整。导入新版模块保留两组偏好，只清理已经删除的分组 ID。配置备份包含两组纯数据偏好，不包含脚本源码。内容屏蔽受已有网站权限约束；不自动安装模块、申请权限或覆盖普通域名策略。
