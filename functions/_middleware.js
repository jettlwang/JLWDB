export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Skip static assets like images, CSS, or JS so we don't break the page styling
  const isStaticAsset = url.pathname.match(/\.(png|jpe?g|gif|svg|css|js|ico|json)$/i);
  
  // If there is no version parameter AND it is not a static asset, redirect them with a unique ID
  if (!url.searchParams.has('v') && !isStaticAsset) {
    // Generate a random 8-character alphanumeric ID
    const sessionId = Math.random().toString(36).substring(2, 10);
    url.searchParams.set('v', sessionId);

    // Redirect to the new URL carrying the session ID (302 temporary redirect)
    return Response.redirect(url.toString(), 302);
  }
  
  // Otherwise, let the request go through to the page normally
  return context.next();
}