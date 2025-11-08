# Cloudflare Workers 部署指南

本文档说明如何将 `ai-conversation-worker` 项目部署到 Cloudflare Workers，并介绍本地调试、环境变量及验证方式。

## 1. 前置条件
- Node.js 18+、npm
- 一个 Cloudflare 帐号，已创建至少一个 Workers 项目
- OpenAI API Key（用于向 `https://api.openai.com/v1/chat/completions` 发起请求）
- Wrangler CLI：项目已在 `devDependencies` 中包含，可通过 `npx wrangler ...` 使用；如需全局命令可运行 `npm install -g wrangler`

## 2. 安装依赖
```bash
npm install
```

## 3. 本地开发
1. 登录 Cloudflare：`npx wrangler login`
2. 设定 OpenAI 密钥（仅本地开发时就绪，可直接使用环境变量）：  
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   # 按提示输入真实的 OpenAI API Key
   ```
3. 可选：覆盖默认模型（`wrangler.toml` 中默认为 `gpt-4o-mini`）。若想根据环境灵活切换，可改用 `wrangler secret put OPENAI_MODEL`。
4. 启动本地开发服务器：
   ```bash
   npm run dev
   ```
   Wrangler 会在 `http://127.0.0.1:8787/graphql` 暴露 GraphQL Yoga 端点，可使用例如 GraphiQL、Insomnia 或 `curl` 测试：
   ```bash
   curl -X POST 'http://127.0.0.1:8787/graphql' \
     -H 'Content-Type: application/json' \
     -d '{"query":"mutation($input:ChatInput!){generateResponse(input:$input){content model finishReason}}","variables":{"input":{"message":"你好"}}}'
   ```

## 4. 部署步骤
1. 确保 `wrangler.toml` 中的 `name` 与 Cloudflare Workers 服务名称一致，`main` 指向 `src/index.ts`。
2. 登录 Cloudflare（如未登录）：`npx wrangler login`
3. 为生产环境设置密钥（与本地相同命令）：
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   # 可选：npx wrangler secret put OPENAI_MODEL
   ```
4. 部署：
   ```bash
   npm run deploy
   ```
   Wrangler 会将构建产物上传到 Cloudflare，并返回 `https://<your-worker>.<subdomain>.workers.dev` 等可访问的 URL。

## 5. 部署验证
1. 通过 `curl` 或 API 客户端调用 Worker 暴露的 GraphQL 端点：
   ```bash
   curl -X POST 'https://<your-worker>.workers.dev/graphql' \
     -H 'Content-Type: application/json' \
     -d '{"query":"{status{message model}}"}'
   ```
   返回值应包含 `message`（例如“服务可用”）与所选模型。
2. 如需实时查看日志，可使用 `npx wrangler tail ai-conversation-worker`。

## 6. 常见问题
- **401/403**：确认 `OPENAI_API_KEY` 是否正确配置，且 Workers 环境能访问 OpenAI。
- **模型不符**：检查 `wrangler.toml` 中的 `[vars].OPENAI_MODEL` 或 Secret 是否被覆盖。
- **超时/429**：OpenAI 接口限流或 Cloudflare Worker 超出执行时间，尝试降低并发或在代码中进行重试/退避控制。

至此，Cloudflare Workers 上的 AI 对话服务即可上线。若需自定义域名，可在 Cloudflare 控制台的 Worker 路由设置中绑定。
