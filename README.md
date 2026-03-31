# GPT CDKEY 套壳前端

一个纯前端静态页面，封装 `https://gpt.86gamestore.com/api/check` 和 `/api/activate`，方便输入 CDKEY 并查验/激活。页面结构简单，可直接部署在任意静态托管服务（Vercel、GitHub Pages、静态代理等）。

## 使用方式

1. **准备环境**：
   - 确保可以通过浏览器访问 `https://gpt.86gamestore.com/api`，建议通过自建代理消除 CORS 影响。
   - 如果你的部署环境无法直接访问该域名，请在服务器端做接口中转，并在页面加载后通过 `window.GPT_SHELL_CONFIG = { apiBaseUrl: 'https://你的代理域名/api' };` 覆盖默认值。
2. **运行页面**：
   - 直接双击 `index.html`（某些浏览器对 fetch 可能有限制，建议用本地静态服务器）：
     ```bash
     cd gpt-shell-frontend
     npx serve .
     ```
     或者使用 `live-server`、`http-server`、`python -m http.server` 等。
3. **操作流程**：
   - 在“CDKEY”输入框填写完整的密钥，点击“查验状态”可查看 `use_status`、`status_hint`、冷却信息等。
   - 如果要激活，填写 `session_info`（必须是 JSON 字符串，`planType` 只能是 `"free"`），再点击“激活 CDKEY”。
   - 结果会在下方分别呈现，所有错误信息会原样显示 `msg` 内容。

## 自定义配置

页面默认的 API 基础地址是：
```
https://gpt.86gamestore.com/api
```
如需覆盖，可在全局脚本前声明：
```html
<script>
  window.GPT_SHELL_CONFIG = { apiBaseUrl: 'https://your.proxy/api' };
</script>
```
确保在 `app.js` 被加载前执行上述脚本。

## 部署建议

- 将此目录推送到任意支持 HTTPS 的静态站点，或作为前端模块集成到现有项目。前端本身不包含任何后端逻辑，所有请求都原样转发到 GPT 接口。
- 若需隐藏 `session_info`，建议在后端存储并只返回临时 token，再让前端调用代理接口（后端再调用 `/activate`）。
