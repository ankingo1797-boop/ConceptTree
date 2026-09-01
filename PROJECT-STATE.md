# 概念学习树 — 项目状态总览（2026-09-01 更新：第十四轮 代码优化 + 深入清理）

## 当前状态

- **第十四轮完成（代码优化 + 深入清理）**：删除死文件（ShinyText/SpotlightCard）与死 CSS；状态元数据合并到 `src/features/status.ts`；清理未使用导入/局部/参数；**ID 生成统一到 `src/features/uid.ts`**（9 处）；核对`dueText/dueLabel`、`GRADE_META/GRADE_STYLE` 为刻意区分不合并；确认无死导出；功能零回归（记录 §29 + 14.1）
- **上轮（第十三轮）已复验通过**：开场粒子汇聚动画
- 门禁全绿：**单测 241/241** + **e2e 7/7**、**tsc 零错误**、build 成功、冒烟 `/` 与 `/logo.png` 200
- 备份标签：`backup/pre-optimize-2`、`backup/pre-optimize`、`backup/pre-entrance-anim`、`backup/pre-component-ui`、`backup/pre-ui-overhaul`
- 第二轮新架构要点：顶栏三件套（全局搜索/日历/主题切换，仅打开系列时显示搜索与日历）；日历与搜索均走「App 请求 → SeriesPage 透传 → ConceptTreeView 执行（选中+飞行）」链路；暗色主题为纯令牌覆盖（组件零逻辑改动）
- **设计系统**（Notion 体系）：暖白底 + 暖灰四阶 + 单一强调色 Notion 紫 #5645d4（克制使用）+ 链接蓝 #0075de；状态色用 Notion 粉彩标签；令牌在 `index.html`（CSS 变量 `--ct-*`）；图标全部内联 SVG（`src/icons.tsx`）；系统无衬线字体栈（离线可用）；已安装技能门禁：`impeccable` / `redesign-existing-projects` / `design-taste-frontend`
- 数据：机械学习系列（3 概念、3 边）。本轮清理了反向重复边 e-8x27wqp0（事前备份在 `backups/`，可回滚）
- 配置：config.json 已配置（apiUrl/model/apiKeyEnc DPAPI 密文，非空）
- 备份：`backups/` 现有 2 份（启动自动备份 + 清理前安全备份）；启动时距上次 >24h 会自动备份，FIFO 保留 10 份

## 第一轮交付清单

| 模块 | 内容 |
|---|---|
| A 复习模式 | Leitner 调度器纯函数（间隔阶梯 1/2/4/7/15/30/60 天）；首次「已掌握」自动入列；右键加入/移出复习；系列卡片到期徽章；工具栏「⏰ 复习 N」呼吸灯；全屏复习会话（快照→揭示→三档评级带间隔预览→逐条持久化→结束统计→Esc 保留进度）；空态「今天没有到期的复习 🎉」 |
| B 数据安心 | saveStatus 状态机（顶栏：保存中/✓已保存 1.8s/失败+重试）；笔记与一句话总结 700ms 防抖 + onBlur + diff 守卫；💾 手动保存冲刷草稿；底栏「仅保存在这台电脑 · 上次备份 X」；设置页「数据与备份」（立即备份/列表/恢复确认模态/导出）；服务端备份栈（原子写 + JSON 校验 + 恢复前安全备份 + 失败回滚） |
| C 画布升级 | 视口命令层 `src/viewport.ts` flyTo（搜索 focus / 小地图 pan-to / 适应 overview / 候选入树聚焦，动画可打断去重，尊重 reduced-motion）；屏外裁剪 + 集合相等守卫（小地图仍画全树）；自动布局切换 FLIP 位移过渡；右下角操作提示（可折叠、偏好持久化） |
| 卫生 | H1 detect 后缀过度吞字修复（虚词过滤 + 尾部延伸约束 + 回归测试）；H2 重复边清理（事前备份）；H3 本文件重写；H4 交接文档过时项修正 |
| 基建 | vitest 引入（73 测试）；server.js 抽出 server/detect.mjs、server/backup.mjs（路径可注入）；端口/目录环境变量覆盖（CT_PORT/CT_DATA_DIR/…，默认不变） |

## 测试资产

```
tests/detect.test.mjs            检测规则快照 + H1 回归（8）
tests/backup.test.mjs            备份栈全场景：创建/列表/prune/恢复回滚/自动备份/导出（12）
tests/server-backup-api.test.mjs 真服务集成：启动自动备份/创建/恢复/损坏回滚/导出（5）
tests/save-ui.test.tsx           saveStatus 状态机 + 底栏安心锚组件（7）
tests/chatpane-drafts.test.tsx   草稿纪律：防抖/失焦冲刷/切换概念写回旧概念回归（4）
tests/reviewScheduler.test.ts    调度器：三档/边界/旧数据宽容/到期判定/自动入列决策（17）
tests/review-session.test.tsx    复习会话：全流程/空态/评级落盘/Esc（4）
tests/viewport.test.ts           视口命令：focus/pan-to/overview/裁剪/集合守卫（16）
tests/treeLayout.test.ts         1.5 新增：tidy 布局算法（同列不重叠/居中/多根/环保护）（8）
```

运行：`npm test`（全量）或 `npx vitest run tests/<file>`（单文件）。

## 已知问题与说明

1. 状态过滤器激活时，指向被过滤概念的连线不再渲染（原先是悬空线）——行为修正，非回归
2. `Markdown.jsx` / `main.jsx` 仍为 JS（低收益未改 TS）
3. 日志中文在部分终端显示乱码（文件本身 UTF-8 正确）
4. NN 概念历史里有一条空 assistant 消息（历史遗留，无害，未清理）
5. Playwright 浏览器 E2E 未引入（按 PRD §12.8 留待第二轮）

## 下一步

- 用户复验：按 `docs/ROUND1-PHASE.md` §4 + §8 核对 9 条反馈的修复与新界面；反馈写入 §7 追加
- 第二轮方向（候选）：复习日历热力图、搜索增强、Playwright E2E、暗色主题
