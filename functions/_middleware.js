// ============================================================
// Host redirect — canonicalize all traffic to bermudi.dev
// qr.dabg.uk and www.bermudi.dev → bermudi.dev (same path)
// ============================================================

const CANONICAL_HOST = 'bermudi.dev';
const REDIRECT_HOSTS = new Set(['qr.dabg.uk', 'www.bermudi.dev']);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (REDIRECT_HOSTS.has(url.hostname)) {
    const target = new URL(url.pathname + url.search, `https://${CANONICAL_HOST}`);
    return Response.redirect(target.href, 301);
  }

  return context.next();
}
