# ChatGPT to Notion Math

当前版本：2.5.0

一个 Firefox 扩展：把 ChatGPT 回答直接写入 Notion，并把公式保存为可编辑的 Notion 原生公式，而不是普通文本或图片。

## 当前支持

- 段落、1–3 级标题、引用
- 有序列表和无序列表
- 粗体、斜体、删除线、行内代码、链接
- 代码块
- 行内公式与独立公式块
- 复制 ChatGPT 内容后，在任意已授权 Notion 页面粘贴并追加原生块
- 不含公式时自动使用 Notion 原生粘贴，可精确插入标题或文字光标位置
- 含公式时，一级标题自动转换为可折叠标题，并收纳其后的章节内容
- 自动把 `align` / `align*` 改成 KaTeX 支持的 `aligned`

## 安装

1. 在 Firefox 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”。
3. 选择本目录中的 `manifest.json`。

临时扩展会在 Firefox 重启后消失。长期安装需要提交 Mozilla Add-ons 签名，或在 Firefox Developer Edition/Nightly 中使用开发设置。

## 配置 Notion

1. 打开 <https://www.notion.so/profile/integrations>，创建一个 Internal Integration，并启用读取、插入内容权限。
2. 复制 Integration Token。不要把 Token 发送给别人或提交到 Git。
3. 在 Notion 打开希望存放回答的父页面，通过页面菜单中的“连接 / Connections”添加刚创建的 Integration。
4. 点击 Firefox 工具栏里的扩展图标。
5. 填入 Token并保存。固定目标页面 URL 可以留空。
6. 重载扩展后刷新 ChatGPT 和 Notion 页面。

## 复制粘贴模式

1. 在 ChatGPT 中选中回答内容并复制。
2. 打开一个已经授权给 Integration 的 Notion 页面。
3. 在页面编辑区粘贴。
4. 扩展会阻止普通粘贴，通过 API 将内容和原生公式插入到光标所在块之后。

请手动选中回答内容并按 `Ctrl+C`；ChatGPT 自带的复制按钮可能绕过扩展，不能保证公式源码完整。

受 Notion API 限制，扩展不能把内容插进一段文字的中间，只能插入到光标所在块之后；无法识别当前块时会退回到页面底部。

## 为什么不再模拟粘贴

Notion 的网页编辑器没有可供扩展使用的原生公式剪贴板格式。模拟输入 `/equation` 和回车容易受焦点、语言和 Notion 前端更新影响。本扩展改用 Notion API，直接创建 `equation` block 和 equation rich text，因此公式结构更可靠。

## 隐私与安全

- Token 保存在 Firefox 的 `storage.local` 中。
- 内容只发送到 Notion API。
- 这是适合个人使用的版本。若发布给其他用户，应增加后端并改用 Notion OAuth，不能把 OAuth Client Secret 放进扩展。

## 已知限制

- Notion 使用 KaTeX，只支持 LaTeX 的一个子集。
- ChatGPT 若改变消息 DOM，内容提取选择器可能需要更新。
- 第一版不处理复杂嵌套列表、Markdown 表格、图片和附件。

