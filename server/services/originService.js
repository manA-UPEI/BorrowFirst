function getAppOrigin() {
  const rawAppOrigin = typeof process.env.APP_ORIGIN === 'string'
    ? process.env.APP_ORIGIN.trim()
    : '';
  const rawRenderExternalUrl = typeof process.env.RENDER_EXTERNAL_URL === 'string'
    ? process.env.RENDER_EXTERNAL_URL.trim()
    : '';
  const rawValue = rawAppOrigin || rawRenderExternalUrl;

  if (!rawValue) {
    return '';
  }

  try {
    return new URL(rawValue).origin;
  } catch (error) {
    return '';
  }
}

function getRequestOrigin(headerValue) {
  if (typeof headerValue !== 'string' || !headerValue.trim()) {
    return '';
  }

  try {
    return new URL(headerValue).origin;
  } catch (error) {
    return '';
  }
}

function requestMatchesAppOrigin(req) {
  const appOrigin = getAppOrigin();

  if (!appOrigin) {
    return false;
  }

  const originHeader = getRequestOrigin(req.get('origin'));
  const refererHeader = getRequestOrigin(req.get('referer'));

  return originHeader === appOrigin || refererHeader === appOrigin;
}

module.exports = {
  getAppOrigin,
  requestMatchesAppOrigin
};
