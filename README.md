# YSClaude

精简版 Claude 客户端，React Native + Expo 构建，打包为 Android APK。个人使用。

## 技术栈

| 层面 | 选型 |
|------|------|
| 框架 | React Native + Expo (SDK 56) |
| 路由 | expo-router |
| 状态管理 | Zustand (persist) |
| 本地存储 | expo-sqlite |
| API 格式 | OpenAI 兼容 (`/v1/chat/completions`) |
| Markdown | @ronradtke/react-native-markdown-display |
| TTS | MiniMax T2A (expo-audio + expo-file-system) |
| 打包 | EAS Build → APK |

## 功能

### 核心（已完成）
- 文本对话（OpenAI 兼容格式）
- 流式输出（SSE 逐 token 渲染）
- Markdown 渲染（代码块深色高亮）
- 对话历史管理（SQLite 持久化、恢复、删除、重命名）
- 多 API 配置管理（命名保存、同名覆盖、拉取模型列表、测试连接）
- 多模型随时切换
- TTS 语音播放（MiniMax 语音合成，支持自定义 Voice ID）
- System Prompt 自定义（自动在最前注入当前时间）
- 消息隐藏（节省 token）
- AI 输出长度限制
- 时间戳分隔（相邻消息间隔 ≥ 30 分钟时，聊天页插入居中小字时间，并同步告知 AI）

### 扩展（规划中）
- MCP Tool 调用
  - Memory Vault 记忆库检索
  - Tavily 联网搜索

### 未来规划：
  - 文生图（OpenAI 格式）
  - 本地文件管理

## TTS 配置

使用 MiniMax 语音合成服务，需在设置 > TTS 配置中填写：

- **Group ID** — MiniMax 控制台获取
- **API Key** — MiniMax API 密钥
- **Voice ID** — 音色 ID（如 `male-qn-qingse`、`Wise_Woman` 等）
- **模型** — `speech-02-hd` / `speech-02-turbo` / `speech-2.8-hd`
- 语速、音量、音调可调

配置完成后可点击「测试播放」验证，保存后持久化到本地。

## 运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npx expo start

# 手机测试（Expo Go 扫码）
npx expo start --tunnel

# 浏览器预览
npx expo start --web
```

## 项目结构

```
app/                        # expo-router 页面
├── _layout.tsx             # 根布局（Stack）
├── index.tsx               # 对话主界面
├── history.tsx             # 对话历史（☰ 触发）
├── settings.tsx            # 设置页（⋯ 触发）
└── chat/[id].tsx           # 历史对话详情

src/
├── components/
│   ├── ChatBubble.tsx      # 消息气泡 + 操作图标
│   ├── ChatInput.tsx       # 输入框 + 工具栏
│   ├── ModelSelector.tsx   # 模型切换弹窗
│   └── TimeDivider.tsx     # 消息间居中时间分隔（间隔 >30min 时显示）
├── services/
│   ├── api.ts              # 流式 API 调用（SSE）
│   └── tts.ts              # MiniMax TTS 语音合成
├── utils/
│   └── time.ts             # 时间格式化 + 消息间隔时间戳阈值
├── stores/
│   ├── chat.ts             # 对话状态 + 持久化
│   └── settings.ts         # 配置状态（zustand persist + sqlite）
├── db/
│   ├── database.ts         # SQLite 初始化 + schema
│   ├── operations.ts       # 对话/消息 CRUD
│   └── kv-storage.ts       # KV 存储适配器
├── hooks/
│   └── useKeyboardHeight.ts # 软键盘高度监听（edge-to-edge 输入框避让）
├── types/
│   └── index.ts            # TypeScript 类型定义
└── theme/
    ├── colors.ts           # 主题配色
    └── fonts.ts            # 字体配置
```

## 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 项目骨架 + 对话 + 流式 + Markdown | ✅ |
| P1 | SQLite 持久化 + 历史管理 + 多配置 | ✅ |
| P2 | TTS 语音合成 + System Prompt + 对话设置 | ✅ |
| P3 | MCP Tool 框架 | - |
| P4 | Memory Vault + Tavily 搜索 | ✅ |
| P5 | EAS Build 打包 APK | - |
| P6 | 时间感知（system 注入当前时间 + 消息时间戳分隔） | ✅ |

## UI 设计

- 浅色暖米色主题，参考 Claude 官方客户端
- 顶栏：☰ 历史 / ✎ 新建 / ⋯ 设置
- 对话气泡：用户右对齐浅棕色，助手左对齐无背景 + Markdown
- 底部输入框：大圆角，内嵌模型选择器 pill
- 助手消息下方操作图标行（复制 / 删除 / TTS 播放）

## License

MIT
