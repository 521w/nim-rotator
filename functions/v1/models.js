// functions/v1/models.js
// 返回 OpenAI 兼容 /v1/models list · 让客户端能拉模型列表

export async function onRequestGet() {
  return new Response(JSON.stringify({
    object: 'list',
    data: [
      {
        id: 'meta/llama-3.3-70b-instruct',
        object: 'model',
        created: 1730000000,
        owned_by: 'meta',
      },
      {
        id: 'mistralai/mistral-7b-instruct-v0.1',
        object: 'model',
        created: 1690000000,
        owned_by: 'mistralai',
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
