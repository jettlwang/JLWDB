const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyzlpUyEWsnMN8UB2qE7e-IkM1Z-o9-u_MaelVWCyYCqZsHs9OxW_9m5OvJxnTQc0b/exec";

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

function logVisit(context, url, sessionId) {
  const userAgent = context.request.headers.get('User-Agent') || '';
  const botPattern = /gptbot|claudebot|perplexity|google-extended|cohere|bytespider|facebookexternalhit|meta-external/i;
  const isAiBot = botPattern.test(userAgent);
  const country = context.request.cf?.country || "Unknown";
  const city = context.request.cf?.city || "Unknown";
  const device = userAgent.includes("Mobi") ? "mobile" : "desktop";

  const match = isAiBot ? userAgent.match(botPattern) : null;
  const botName = match ? match[0].toLowerCase() : "N/A";

  const logData = {
    session: sessionId,
    type: isAiBot ? "bot" : "human",
    path: url.pathname,
    location: `${city}, ${country}`,
    device: isAiBot ? "server" : device,
    botName: botName,
    userAgent: userAgent
  };

  context.waitUntil(
    fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logData),
      redirect: "follow"
    }).catch(err => console.error("Logging failed:", err))
  );
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Skip static assets like images, CSS, or JS so we don't break the page styling
  const isStaticAsset = url.pathname.match(/\.(png|jpe?g|gif|svg|css|js|ico|json)$/i);
  const isMarkdown = url.pathname.match(/\.md$/i);

  // Static assets never get logged as page views
  if (isStaticAsset) {
    return context.next();
  }

  // No redirects anywhere: visitor id is derived server-side per request,
  // so the URL a crawler or human sees never changes.
  const sessionId = await deriveVisitorId(context);
  logVisit(context, url, sessionId);

  if (isMarkdown) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return context.next();
}
