export async function executeHttpRequest(config: any, context: any) {
  const url = config.url;
  const method = config.method || 'GET';
  const headers = config.headers || {};
  let body = config.body;

  if (!url) {
    return { success: false, error: 'URL is required for http_request step' };
  }

  // Very basic variable substitution from context
  let finalUrl = url;
  if (typeof url === 'string') {
    for (const [key, value] of Object.entries(context)) {
      finalUrl = finalUrl.replace(`{{${key}}}`, String(value));
    }
  }

  try {
    const res = await fetch(finalUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });

    const responseText = await res.text();
    let result = responseText;
    try {
      result = JSON.parse(responseText);
    } catch(e) {}

    return {
      success: res.ok,
      result,
      status: res.status
    };
  } catch (error: any) {
    console.error("HTTP Request Error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
