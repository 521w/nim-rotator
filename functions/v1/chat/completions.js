// functions/v1/chat/completions.js
// Cloudflare Pages Function · OpenAI 兼容 chat completions endpoint
// 多 key 轮换 · 撞限记冷却到 KV

export async function onRequestPost(context) {
  const { request, env } = context;

  // 校验 authorization · 简单挡门外人薅羊毛
  const expected = env.PROXY_AUTH || 'anything';
  const got = request.headers.get('Authorization') || '';
  if (got !== `Bearer ${expected}` && got !== expected) {
    // 允许 Claude Code 不带 token · 仅对 attached /v1/models 加严
    // 这里默认开闸,生产可改严
  }

  // 拉 NIM keys (KV namespace NIM_KEYS · 多个 key 命名 key:1 key:2 key:3)
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: { message: 'invalid json body' } }, 400);
  }

  const list = await env.NIM_KEYS.list({ prefix: 'key:' });
  const candidates = [];
  const now = Date.now();
  for (const k of list.keys) {
    const v = await env.NIM_KEYS.get(k.name, { type: 'json' });
    if (v && (!v.cooldownUntil || v.cooldownUntil < now)) {
      candidates.push({ name: k.name, value: v.value });
    }
  }

  if (candidates.length === 0) {
    return jsonResponse({ error: { message: 'all keys cooling down' } }, 503);
  }

  // 随机选一条 · 多 key 均摊 · 等价 round-robin
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  // 透传到 NVIDIA NIM
  let resp;
  try {
    resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${chosen.value}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return jsonResponse({ error: { message: 'NIM fetch failed' } }, 502);
  }

  // 撞限处理 · KV 记 cooldownUntil
  if (resp.status === 429 || resp.status === 402) {
    const ra = Number(resp.headers.get('retry-after') || 0);
    const retryMs = ra > 0 ? ra * 1000 : 5 * 60 * 1000; // 默认 5 分钟
    await env.NIM_KEYS.put(chosen.name, JSON.stringify({
      value: chosen.value,
      cooldownUntil: Date.now() + retryMs,
      lastFailStatus: resp.status,
    }));
    const txt = await resp.text();
    return new Response(txt, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Key-Cooling': chosen.name,
      },
    });
  }

  // 透传
  const txt = await resp.text();
  return new Response(txt, {
    status: resp.status,
    headers: {
      'Content-Type': 'application/json',
      'X-Key-Used': chosen.name,
    },
  });
}

export async function onRequestGet() {
  // GET 不支持 · 返回方法说明
  return jsonResponse({
    error: { message: 'method not allowed · use POST' },
    hint: 'POST {"model":"meta/llama-3.3-70b-instruct","messages":[...]}',
  }, 405);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
