async function readResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }

  return response.text().catch(() => '');
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      data && typeof data === 'object' && data.message
        ? data.message
        : 'Request failed.'
    );
  }

  return data;
}

export function getJson(url) {
  return request(url);
}

// Walks a cursor-paginated endpoint to completion and returns the flattened
// items. The catalog is still filtered client-side, so both catalog screens need
// the full set; the guard below keeps a server that never stops returning a
// cursor from spinning forever.
export async function getAllPages(url, { pageSize = 100, maxPages = 50 } = {}) {
  const items = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page += 1) {
    const requestUrl = new URL(url, window.location.origin);
    requestUrl.searchParams.set('limit', String(pageSize));

    if (cursor) {
      requestUrl.searchParams.set('cursor', cursor);
    }

    const payload = await request(`${requestUrl.pathname}${requestUrl.search}`);

    items.push(...(payload.items || []));
    cursor = payload.nextCursor || null;

    if (!cursor) {
      break;
    }
  }

  return items;
}

export function postJson(url, body) {
  return request(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function postForm(url, body) {
  return request(url, {
    method: 'POST',
    credentials: 'same-origin',
    body
  });
}
