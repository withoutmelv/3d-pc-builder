export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('无法连接服务，请检查后端是否已启动');
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('服务暂时不可用，请稍后重试');
  }
  if (!response.ok) throw new Error(payload.message || '请求失败，请稍后重试');
  return payload.data;
}
export const send = (path, method, body) => request(path, { method, body: JSON.stringify(body) });
