# 🌳 概念学习树（独立桌面应用）

树形概念学习网——从一个概念出发，沿着回答中的子概念不断延伸，所有学过的概念以可点击卡片呈现。**独立桌面应用**（Electron 封装，不依赖浏览器），自带 OpenAI 兼容 AI 接入，不依赖 dsh。

## 环境要求

- **Windows 10 / 11**（桌面应用与 API Key 的 DPAPI 加密依赖 Windows）
- **Node.js ≥ 18**（建议 20 或 22），自带 npm

## 下载与安装

1. **获取代码**（二选一）：
   - 命令行：`git clone https://github.com/ankingo1797-boop/ConceptTree.git`
   - 或在 GitHub 页面点 **Code → Download ZIP** 后解压
2. **安装依赖**：在项目根目录执行
   ```sh
   npm install
   ```
3. 之后按下方「快速开始」运行即可。

> 🔒 **隐私说明**：`config.json`（含 DPAPI 加密后的 API Key）与 `data/`（你使用 app 时添加的概念等学习数据）都在 `.gitignore` 中，**不会被提交或上传**；仓库不含任何个人数据或密钥。

## 快速开始

1. **双击** `启动概念学习树.bat` —— 打开独立桌面窗口（Electron，无需浏览器）
   - 或命令行 `npm run app`（Electron）/ `npm run start`（浏览器模式）
2. 首次进入在**设置页**填写：
   - **API URL**：OpenAI 兼容平台地址，如 `https://api.deepseek.com/v1`
   - **模型名**（可选）：如 `deepseek-chat`、`gpt-4o-mini`；留空用默认
   - **API Key**：你的密钥（DPAPI 加密存储，应用启动自动读取，无需每次重填）
3. 保存进入 → 在主页输入名称（如「机器学习」）**新建**一棵概念树 → 点进去体验
   > 首次安装是**空**的——你自己的历史数据（`data/`）不随仓库分发，需要重新添加或从备份导入。

## 两种运行模式

| 模式 | 命令 | 说明 |
|---|---|---|
| **桌面应用（推荐）** | `启动概念学习树.bat` 或 `npm run app` | Electron 独立窗口，渲染进程沙箱+禁用 Node 集成，Key 更安全 |
| 浏览器模式 | `npm run start` + 打开 8930 | 传统 Web 方式 |

## 功能

```
系列管理（顶级入口）
├── 新建系列 / 导入导出
├── 系列列表（点击进入）
└── 最近学习（按更新时间排序）
进入系列后（左右分栏）
├── 左：画布（概念树）
│   ├── 卡片拖拽自由摆放（拖过即切手动布局）
│   ├── 缩放 / 平移 / 适应 / 搜索定位
│   ├── 迷你地图（右下角）
│   ├── 双击卡片重命名
│   ├── 右键菜单（状态/加子概念/删除）
│   ├── Ctrl+点击多选 → 批量设状态/删除
│   ├── 撤销 ↩ / 重做 ↪
│   ├── 复习模式（按状态过滤）
│   └── 拖卡片边缘 🔗 建关联边
└── 右：概念对话 + 笔记
    ├── 与 AI 流式对话（OpenAI 兼容）
    ├── 候选概念检测（规则 / AI增强，可切换）
    │   └── 回答后自动检测 → 点击候选词即加入树
    ├── 四态切换（未学习/学习中/已掌握/存疑）
    └── 📝 我的笔记（与 AI 回答分离）
```

## 数据与配置

| 文件 | 说明 |
|---|---|
| `data/concept-tree.json` | 学习数据（系列/概念/边/对话历史/笔记） |
| `config.json` | 用户配置（apiUrl/apiKey/model）——**Key 只存本机，服务端代理，不暴露浏览器** |
| `dist/` | Vite 构建产物（前端静态文件） |
| `src/` | React 源码（JavaScript） |

## 开发命令

```sh
# 开发模式（热更新）
npm run dev

# 构建前端（dist/）
npm run build

# 启动服务（生产）
npm run start        # 或 node server.js

# 离线测试 AI 链路（无需真实 Key）
# 1) 终端1: node mock-openai.mjs        （模拟 OpenAI 平台，端口 9899）
# 2) 终端2: node server.js              （概念学习树服务，8930）
# 3) 设置页填 URL=http://127.0.0.1:9899/v1, Key=任意, 模型名=mock-model
```

## 技术栈

- **前端**：React 19 + Vite 6（JavaScript）
- **服务端**：Node 原生 http（无框架依赖），一体式托管
- **AI 接入**：OpenAI 兼容协议（`{apiUrl}/chat/completions`），支持任意兼容平台
- **安全**：API Key 用 **Windows DPAPI 加密**后存本地 `config.json`（`apiKeyEnc` 字段，无明文），启动时自动解密；由本地服务代理请求（规避 CORS，Key 不暴露浏览器，不落盘明文）

### Key 安全说明

- **存储**：加密后存 `config.json` 的 `apiKeyEnc` 字段（DPAPI，绑定当前 Windows 用户）
- **读取**：应用启动时自动解密，**无需每次重填**
- **代理**：Key 只发往你配置的 API 平台，前端/浏览器接触不到明文
- **清空**：设置页 Key 留空保存 = 删除已存 Key

## 端口

固定 **8930**。若被占用，`启动概念学习树.bat` 会自动清理旧进程。

## 常见问题

| 问题 | 处理 |
|---|---|
| 对话报 "model not found" | 在设置页填写你平台的正确模型名（如 deepseek-chat） |
| 对话报 "请先填写 API URL 和 API Key" | 设置页未配置，或 Key 留空 |
| 端口被占用 | bat 已自动清理；手动 `netstat -ano \| findstr :8930` 查占用 |
| 数据不保存 | 检查 `data/concept-tree.json` 是否可写（服务有权写该目录） |
