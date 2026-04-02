/** Vercel Cron：见 https://vercel.com/docs/cron-jobs/manage-cron-jobs（Authorization: Bearer <CRON_SECRET>） */
export function assertCronAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return Response.json({ error: "server_misconfigured", detail: "Missing CRON_SECRET" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

  const headerSecret =
    bearer ||
    request.headers.get("x-cron-secret")?.trim() ||
    request.headers.get("x-vercel-cron-secret")?.trim() ||
    "";

  if (!headerSecret || headerSecret !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
