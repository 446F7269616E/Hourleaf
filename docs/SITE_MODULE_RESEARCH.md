# 站点模块选择器研究

本记录用于维护仓库中的可选站点模块。研究日期为 2026-08-24。所有实现均重新按 Hourleaf 本地模块协议编写，只借鉴公开项目中的 DOM 语义、页面范围和安全失效方法，没有复制第三方项目的大段代码。

## 选择器策略

- 优先使用站点自定义元素、稳定 ID、`data-testid`、页面类型属性和目标链接。
- 只选择具体内容项，不选择可能混合多种内容类型的整块列表或侧栏。
- 对已知边界标记使用 `:not()` / `:has()` 做保守排除；标记不明确时宁可保持可见。
- SPA 页面需要路由范围时，只写入不含页面内容的根节点标记；路由变化检查为常数时间，不扫描页面正文。
- 选择器失效时应“什么也不隐藏”。站点改版后先复验，再发布 patch 版本。

## 小红书

模块：`optional-modules/xiaohongshu/`

- [LuceTu/xiaohongshu-focus](https://github.com/LuceTu/xiaohongshu-focus)（MIT）：确认首页/探索页与搜索、用户页、笔记详情需要按路径分开，公开实现使用 `.feeds-container` 作为首页流容器。Hourleaf 只借鉴路由范围与容器语义，并把实际规则下钻到 `.note-item`。
- [DIYgod/RSSHub issue #12364](https://github.com/DIYgod/RSSHub/issues/12364)（RSSHub 仓库 AGPL-3.0）：历史抓取错误中记录了 `.feeds-container ... .note-item` 组合，作为 note 卡片语义的交叉验证；未采用其抓取逻辑。

实现要点：用户脚本只在根节点维护 `data-hourleaf-xhs-page=home|other`，普通首页卡片由 `home-recommendations` 组控制。Safari 不执行用户脚本时该组安全地不生效，不会扩大页面范围。

## X

模块：`optional-modules/x/`

- [MaryanPrydatko/video-bouncer](https://github.com/MaryanPrydatko/video-bouncer)（MIT）：确认 `article[data-testid="tweet"]` 是当前帖子根节点，并记录 X 会复用虚拟列表节点、`data-testid` 可能改名。Hourleaf 只使用该语义锚点，不引入 MutationObserver 或内容解析。
- [alixaprodev/x_mate](https://github.com/alixaprodev/x_mate)（MIT）：确认 `data-testid="placementTracking"` 不能被当成普通视频标记。Hourleaf 对带该标记的列表项保持可见，未复用该项目的过滤或统计代码。

实现要点：使用当前选中的 `/home` tab 限定主页，再下钻到 `cellInnerDiv` 中的 tweet；选择器改名时规则自然失效。

## YouTube

模块：`optional-modules/youtube/`

- [lenadweb/yt-clean](https://github.com/lenadweb/yt-clean)（MIT）及其 [Selector guide](https://github.com/lenadweb/yt-clean/blob/main/docs/selector-guide.md)：借鉴“自定义 renderer / 稳定 ID / 目标链接优先，避开 `style-scope`、深层位置和文本选择器”的维护方法；`ytd-browse[page-subtype="home"]` 用于只限定首页。
- [yokoffing/filterlists](https://github.com/yokoffing/filterlists/blob/main/youtube_clear_view.txt)（仓库未声明许可证）：交叉验证 `ytd-reel-shelf-renderer`、`#related ytd-compact-video-renderer` 等 renderer 仍用于 Shorts 与相关视频。只借鉴选择器名称，未复制规则集合。

实现要点：首页、Shorts、相关视频与评论拆成四个独立组；视频卡片规则下钻到具体 renderer，避免隐藏整个 grid 或 secondary 容器。

## 百度贴吧

模块：`optional-modules/baidu-tieba/`

- [0xb1aded/Tieba-Remix](https://github.com/0xb1aded/Tieba-Remix)（MIT）：确认旧版首页推荐通过 `/f/index/feedlist` 加载，容器为 `#new_list`，普通 feed 节点使用 `.j_feed_li`；项目也记录 2026 年新版贴吧仍在逐步适配。
- [hgztask/贴吧内容屏蔽器（Greasy Fork）](https://greasyfork.org/zh-CN/scripts/554869-%E8%B4%B4%E5%90%A7%E5%86%85%E5%AE%B9%E5%B1%8F%E8%94%BD%E5%99%A8/code)（GPL-3.0）：仅交叉验证首页动态接口与分页面处理方式，未复制代码。

实现要点：规则只下钻到 `#new_list > .j_feed_li`；不处理新版中尚无稳定语义锚点的区域。新版 DOM 改动时该组会安全失效。

## Bilibili

模块：`optional-modules/bilibili/`

- [jromwu/ublock-static-filter-bilibili](https://gist.github.com/jromwu/07aebf08cbbdb9ade8d15de764b73829)（未声明许可证）：交叉验证 `.bili-video-card__info--ad`、`.feed-card`、`.bili-feed-card` 与 `.is-rcmd` 的当前语义；只使用选择器名称做边界判断，未复制规则列表。
- [Anivie/B站动态自定义过滤](https://gist.github.com/Anivie/ea443081bfd458d41e40fd5c3fa3321e)（未声明许可证）：交叉验证 `.bili-dyn-list` 仍是动态流根语义；未采用轮询、网络请求或 jQuery 逻辑。

实现要点：原有单组 `hideSelectors` 已拆为首页推荐、动态、相关视频和评论四组；首页与相关视频规则只下钻到普通卡片。斜杠键聚焦搜索脚本保持无网络、输入态保护和找不到节点时静默退出。

## 复验清单

每次选择器升级至少验证：未登录与已登录、首页与详情页、深浅色、200% 缩放、Chromium 与 Firefox。包含用户脚本的模块另外验证 Safari 上安全降级。仓库测试直接读取每个模块目录的真实清单及引用文件，并通过 `parseLocalModuleFiles()` 导入，防止示例与协议漂移。

## BewlyBewly / Ave Mujica 首页兼容（2026-09-11）

- [BewlyBewly/BewlyBewly](https://github.com/BewlyBewly/BewlyBewly/tree/d42143547bf4e9cc6864f227fcbcbd396bbff25b)（MIT，核对提交 `d42143547bf4e9cc6864f227fcbcbd396bbff25b`）。
- [VentusUta/BewlyBewly-AveMujica](https://github.com/VentusUta/BewlyBewly-AveMujica/tree/3271070c551485b9fe45a84dea659d02c1e9f833)（主许可证 AGPL-3.0，另附原版 MIT；核对版本 1.8.32，提交 `3271070c551485b9fe45a84dea659d02c1e9f833`）。只研究公开 DOM 和生命周期，不复制第三方实现。
- 两者的 `src/contentScripts/index.ts` 在 `#bewly` 上创建开放 Shadow DOM；`views/App.vue` 在 window 派发 `bewlyMounted`。主文档 CSS 无法直接命中根内卡片；旧站点适配器不在本地模块执行链上。
- Ave Mujica 的 `src/background/messageListeners/api/video.ts` 分别请求 Web `/x/web-interface/wbi/index/top/feed/rcmd` 与 App `/x/v2/feed/index`。屏蔽使用呈现后的 DOM，不拦截接口或读取登录凭据。
- 两版 `views/Home/Home.vue`、`Home/components/ForYou.vue` 与 `components/VideoCard/VideoCard.vue` 共同形成 `#bewly-wrapper main > header ~ div > grid > 单张卡片外壳 > div > .video-card > a`。网格类为 `grid-adaptive`、`grid-two-columns`、`grid-one-column`。规则仅选择带标准视频链接的单张卡片外壳，并排除商业标记；搜索、收藏、历史不具备首页结构，因此保持可见。首页内关注/热门等使用相同结构的普通视频也随首页开关隐藏；不按语言文本猜测当前子标签。
- 上游 ForYou 在渲染前排除 Web `goto=ad`、App banner 与 `cm_v1`。本模块仍保留 `.ad-report`、commercial 类和商业跳转链接，未知结构、番剧付费链接、直播、骨架及导航不作扩大隐藏。

回归入口：`tests/e2e/local-rules-ui-contract.spec.ts` 基于上述源码结构在 Chromium / Firefox 检验实际计算样式，覆盖三种网格、原生首页、商业/未知节点保留、晚挂载、根替换、分页、开关恢复和其他根隔离。此测试是源码结构复现，不能替代用户实际安装版本、账号状态与线上 A/B 页面联调。

本次验证结果：168 项单元测试、类型检查、lint、三平台构建及 Chromium 5 项浏览器回归通过；已生成 Bilibili 1.2.1 模块 ZIP 并更新本机 Debug 构建。Firefox 自动化在浏览器启动阶段受本机进程沙箱/GPU helper 错误阻断，尚未完成 Firefox 浏览器验证；未声称已在用户实际账号页面完成端到端联调。

## 播放结束推荐、动态悬停弹窗与热搜榜（2026-10-01）

维护入口仍为 `optional-modules/bilibili/hourleaf-module.json`，版本 1.2.2；无需改动核心或用户脚本，新增选择器放入原有 `related-videos` / `dynamic-feed` 分组，普通与计划开关通过已有规则生成层生效。

- [哔哩哔哩屏蔽增强器源码](https://greasyfork.org/zh-CN/scripts/461382/code)（Apache-2.0）：交叉核对 `.bpx-player-ending-related` 下 `.bpx-player-ending-related-item` 的结束推荐语义；只借鉴 DOM 名称，不使用其事件、轮询、网络或删除逻辑。旧版兼容使用 `.bilibili-player-ending-panel-box-videos` 下的 `.bilibili-player-ending-panel-box-recommend`。只隐藏推荐卡片，保留结束面板的其他操作。
- [B站美化显示效果源码](https://greasyfork.org/en/scripts/504579-b%E7%AB%99%E7%BE%8E%E5%8C%96%E6%98%BE%E7%A4%BA%E6%95%88%E6%9E%9C/code)（MIT）：核对原生 `.dynamic-panel-popover` 名称，不使用其按导航位置隐藏或整站布局修改方式。
- 修改前只读检查本机已打开的 `https://t.bilibili.com/` 与 Bilibili 视频页 DOM：动态页热搜榜为 `.bili-dyn-search-trendings`，独立于右侧横幅；Bewly 开放根中的动态弹窗为 `.right-side-item` 内指向 `https://t.bilibili.com` 的入口后方 `.bew-popover`。按动态入口链接定位，避免误隐藏收藏、历史和通知弹窗，不依赖 Vue 哈希属性或中文文本。
- 新增规则保留商业标记排除；结束推荐另排除付费课程链接。样式随现有分组启停，后插入的弹窗与卡片自然受 CSS 控制，不增加扫描、监听或权限。

仓库模块显示名统一使用网站名；清单、CSS/脚本元数据同步改名和版本，模块 ID、分组 ID 与已有开关保持稳定。按本次开发要求，编码后仅进行编译/构建检查：`npm run typecheck`、`npm run build`（Chromium / Firefox / Safari）及 `npm run build:debug` 均通过，本机 Debug 输出已更新。未运行单元或浏览器回归；实际账号、悬停、播放结束和跨浏览器行为交由人工验收，清单见 `MANUAL_ACCEPTANCE.md`。


## 片尾隐藏后仍自动续播（2026-10-04）

维护入口为 Bilibili 1.2.3 的 `focus.user.js` 和 `related-videos` 分组。CSS 隐藏片尾卡片不会取消网站的连播状态，故不能仅靠继续增加隐藏选择器解决。

- 编码前只读核对现有视频页原生 DOM：“接下来播放”使用 `.next-play`，开关为 `.continuous-btn`，开启状态由子节点 `.switch-btn.on` 表达。
- 阅读该页面加载的[官方视频页脚本](https://s1.hdslb.com/bfs/static/jinkela/video/video.05af4e80b6081ba56c1b5b943d4c8e621df3f875.js)及[官方播放器脚本](https://s1.hdslb.com/bfs/static/player/main/core.ba67b466.js)：原生 `continuousPlay` watcher 同步更新 `relatedAutoplay` 并调用 `setHandoff(Abort)`。只借鉴公开控件与状态语义，不复制上游代码、不在模块中调用内部播放器对象或修改网站存储。
- 用户脚本创建无内容、零尺寸的 `#hourleaf-bilibili-related-playback-guard` 标记，仅将其选择器加入相关视频分组。标记被核心隐藏时才临时关闭原生自动连播，因此普通/计划偏好、组开关、全局关闭及配置时段沿用现有 CSS 规则，不另建时间逻辑。
- 局部 MutationObserver 处理控件晚挂载、相关推荐替换及开关状态变化，样式新增/修改/移除触发状态同步；合并微任务，不轮询，不阻止手动播放或调用视频的播放 API。只在标准 `/video/` 页面且存在普通视频卡片、没有已知商业/课程标记时操作；未知结构安全降级。
- 当前页面内，屏蔽失效时仅恢复脚本曾关闭的现存控件；`pagehide` 断开观察并恢复，后退缓存 `pageshow` 重新绑定。网页整页卸载后的原生持久化状态仍受网站自己的事件队列影响，不承诺浏览器强制关闭后的恢复。
- 此修复需要 Chromium/Firefox 的 User Scripts API；缺少能力时只执行原有视觉过滤，Safari Release 仍不执行用户脚本。

按项目要求仅进行脚本语法、TypeScript 编译及正式/Debug 构建检查，未执行单元或浏览器回归；真实片尾倒计时、已进入倒计时后切换、启用时段及跨浏览器效果留给人工验收。


## 动态更新及消息提醒标识（2026-10-04）

Bilibili 1.2.4 的新增选择器仍加入 `dynamic-feed`，不增加脚本或来源权限。编码前只读核对现有视频页导航结构，并阅读其[官方导航脚本](https://s1.hdslb.com/bfs/seed/laputa-header/bili-header.umd.js)和已记录版本的 [Ave Mujica TopBar.vue](https://github.com/VentusUta/BewlyBewly-AveMujica/blob/3271070c551485b9fe45a84dea659d02c1e9f833/src/components/TopBar/TopBar.vue)。

- 原生动态与消息入口分别为 `.dynamic-entry`、`.message-entry`，红点和数量由入口链接中的 `.red-point`、`.red-num` 表达。只选择这些标识，不隐藏入口、图标、会员提示或其他导航角标。
- Bewly 使用 `.right-side-item` 的直接子节点 `.unread-dot` / `.unread-num-dot`。动态按直接入口的 `t.bilibili.com` 链接定位；通知按消息链接或入口内部的 `i-tabler:bell` 图标属性定位，覆盖通知以 `#` 打开抽屉的情况。避免依赖中文文本、节点位置、Vue 哈希属性或隐藏整个弹窗。
- 新的更新标识由现有 CSS 自动命中，无需轮询、读取消息或修改已读状态；分组启停、每日黑名单时段及普通/计划偏好统一控制 Document 和已声明开放根。

同时修正内容屏蔽时段为独立每日黑名单，只读取引用时段的起止时间；配置页的星期、启停、额度、访问方式不参与匹配。人工验收需检查 12:00–18:00 的两端、已停用源时段、跨午夜、切回后台标签及标识恢复。按要求仅做语法、编译、构建及打包检查，不执行浏览器或单元测试。
