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
