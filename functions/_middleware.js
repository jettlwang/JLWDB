// Best-effort "same person" ID: hash of IP + User-Agent, so repeat visits
// from the same device/network collapse to the same id without cookies.
async function deriveVisitorId(context) {
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const ua = context.request.headers.get('User-Agent') || '';
  const data = new TextEncoder().encode(`${ip}::${ua}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.substring(0, 10);
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Skip static assets like images, CSS, or JS so we don't break the page styling
  const isStaticAsset = url.pathname.match(/\.(png|jpe?g|gif|svg|css|js|ico|json)$/i);

  // If there is no version parameter AND it is not a static asset, redirect them with a unique ID
  if (!url.searchParams.has('v') && !isStaticAsset) {
    const sessionId = await deriveVisitorId(context);
    url.searchParams.set('v', sessionId);

    // Redirect to the new URL carrying the session ID (302 temporary redirect)
    return Response.redirect(url.toString(), 302);
  }

  // Static assets never get a session param and shouldn't be logged as page views
  if (isStaticAsset) {
    return context.next();
  }

  // 2. Parse clean telemetry values
  const sessionId = url.searchParams.get('v');
  const userAgent = context.request.headers.get('User-Agent') || '';
  const isAiBot = /gptbot|claudebot|perplexity|google-extended|cohere|bytespider|facebookexternalhit|meta-external/i.test(userAgent);
  const country = context.request.cf?.country || "Unknown";
  const city = context.request.cf?.city || "Unknown";
  const device = userAgent.includes("Mobi") ? "mobile" : "desktop";
  
  let botName = "N/A";
  if (isAiBot) {
    const match = userAgent.match(/(gptbot|claudebot|perplexity|google-extended|cohere|bytespider|facebookexternalhit|meta-external)/i);
    if (match) {
      botName = match[0].toLowerCase();
    }
  }

  const logData = {
    session: sessionId,
    type: isAiBot ? "bot" : "human",
    path: url.pathname,
    location: `${city}, ${country}`,
    device: isAiBot ? "server" : device,
    botName: botName,
    userAgent: userAgent
  };

  // 3. Fire-and-forget payload dispatch to Google Sheets URL
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyzlpUyEWsnMN8UB2qE7e-IkM1Z-o9-u_MaelVWCyYCqZsHs9OxW_9m5OvJxnTQc0b/exec"; 

  context.waitUntil(
    fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
      redirect: "follow"
    }).catch(err => console.error("Logging failed:", err))
  );
  
  // Otherwise, let the request go through to the page normally
  return context.next();
}