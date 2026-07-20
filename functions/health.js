// functions/health.js
// 健康检查端点 · 返回 OK + 当前活跃 key 数

export async function onRequestGet(context) {
  const { env } = context;
  let active = 0;
  let inCooldown = 0;
  try {
    const list = await env.NIM_KEYS.list({ prefix: 'key:' });
    const now = Date.now();
    for (const k of list.keys) {
      const v = await env.NIM_KEYS.get(k.name, { type: 'json' });
      if (v && (!v.cooldownUntil || v.cooldownUntil < now)) active++;
      else inCooldown++;
    }
  } catch (e) {
    return new Response(JSON.stringify({ status: 'down', error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({
    status: 'ok',
    active_keys: active,
    cooldown_keys: inCooldown,
    service: 'nim-rotator',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
