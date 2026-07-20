# Cloudflare Pages 多 key 轮换代理 → NVIDIA NIM

不花现金、不缠本地进程。GitHub + Cloudflare Pages 一键部署：

- 仓库克隆
- Pages 连到 GitHub
- Dashboard 里绑 KV namespace
- 部署完直接拿 Pages URL 当 OpenAI 兼容 endpoint 用

## 仓库结构

```
functions/
  v1/chat/completions.js   ← OpenAI 兼容 chat completions
  v1/models.js             ← OpenAI 兼容 models list
  health.js                ← 健康检查端点
index.html                 ← Pages 默认首页
package.json               ← 占位(无 npm 依赖)
```

Functions 自动识别 · 不需要 wrangler · 不需要 npm install

## 用法

部署完成后,你的 endpoint = `https://YOUR-PROJ.pages.dev/v1`

### OpenAI SDK

```python
from openai import OpenAI
client = OpenAI(
    base_url="https://YOUR-PROJ.pages.dev/v1",
    api_key="anything",
)
resp = client.chat.completions.create(
    model="meta/llama-3.3-70b-instruct",
    messages=[{"role": "user", "content": "hello"}],
)
print(resp.choices[0].message.content)
```

### Hermes Agent

```yaml
# ~/.hermes/config.yaml
providers:
  - name: nim_cf_pages
    type: openai
    base_url: "https://YOUR-PROJ.pages.dev/v1"
    api_key: "anything"
    models:
      - meta/llama-3.3-70b-instruct
default_provider: nim_cf_pages
default_model: meta/llama-3.3-70b-instruct
```

### 健康检查

```
curl https://YOUR-PROJ.pages.dev/health
```

返回 `{status: "ok", active_keys: 3, cooldown_keys: 0, ...}`

## 部署

### 1. Cloudflare Pages 创建项目

- 登录 https://dash.cloudflare.com
- Workers & Pages → Create
- 选择 `Pages` 标签 → Connect to Git
- 选 `521w/cloudflare-pages-nim-rotator`
- Build settings:
  - Build command: 留空
  - Build output directory: 留空(或 `/`)
  - Root directory: `/`
- 点击 Save and Deploy

### 2. 绑 KV namespace

- 项目 Settings → Functions → KV namespace bindings
- Variable name: `NIM_KEYS`
- KV namespace: Create new → 命名 `nim_keys_prod`
- Save

绑完须 redeploy 一次。

### 3. 加 key

Cloudflare Dashboard → Storage → KV → Your namespace → `nim_keys_prod`

对每个 key 添加一行:

| Key 名称 | Value |
|---|---|
| `key:1` | `{"value":"nvapi-XXX","cooldownUntil":0}` |
| `key:2` | `{"value":"nvapi-XXX","cooldownUntil":0}` |
| `key:3` | `{"value":"nvapi-XXX","cooldownUntil":0}` |

将上表里的 `nvapi-XXX` 替换成 https://build.nvidia.com 注册的真实 nvapi key。

### 4. 验证

```
curl https://YOUR-PROJ.pages.dev/health
curl https://YOUR-PROJ.pages.dev/v1/chat/completions \
  -H "Authorization: Bearer anything" \
  -H "Content-Type: application/json" \
  -d '{"model":"meta/llama-3.3-70b-instruct","messages":[{"role":"user","content":"hi"}]}'
```

第一条返回 200 + 模型输出 → 完成。

## 多 key 轮换怎么工作

1. 每次请求 → Pages Function 读 KV 所有 `key:*` 记录
2. 当前时间超过各 key 的 `cooldownUntil` → 加入候选
3. 候选空了 → 返回 503 `all keys cooling down`
4. 随机选一条 → 透传 NVIDIA NIM
5. NIM 返回 429/402 → KV 里更新 `cooldownUntil = now + retry-after` (默认 5 分钟) → 返回 NIM 原状态
6. 候选 > 1 → 同样执行轮换

冷却期间该 key 不会被选中。冷却结束后自动恢复。

## 限制

- Cloudflare Pages 免费层 100,000 请求/天,超出 503
- 不绑卡 · 不充电费 · 0 元
- Function cold start ~100ms · 首请求慢点
- 只支持 `/v1/chat/completions` 和 `/v1/models` · embedding / rerank 不支持
- KV 限额:100k read/天 + 1k write/天 · 冷却写不频繁,配额一般不会撞

## 许可证

MIT · 自由使用
