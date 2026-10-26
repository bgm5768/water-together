const API = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const TOKEN_KEY = 'water-session:' + import.meta.env.BASE_URL;
export const session = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  idempotency?: string,
  options?: { keepalive?: boolean },
): Promise<T> {
  const token = session.get();
  let response: Response;
  try {
    response = await fetch(API + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      keepalive: options?.keepalive,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      '서버에 연결하지 못했어요. 변경 내용의 저장 여부를 새로고침으로 확인해 주세요.',
      0,
    );
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || '요청을 처리하지 못했어요.', response.status);
  return data;
}
export function vapidBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
