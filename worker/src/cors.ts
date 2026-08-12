/**
 * 지정된 소수 인원이 쓰는 프로토타입이라는 전제(기획서 §12.3)를 그대로 따라
 * Access-Control-Allow-Origin 을 전면 허용한다. 쿠키 기반 인증이 없어(uid 는
 * 요청 본문/쿼리로만 오간다) 이 완화가 다른 사용자의 자격증명을 노출하지 않는다.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(data: unknown, status = 200): Response {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}
