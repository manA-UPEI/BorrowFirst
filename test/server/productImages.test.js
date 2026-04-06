const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.APP_ORIGIN = 'http://127.0.0.1';
process.env.SESSION_NAME = 'borrowfirst.sid';

const createApp = require('../../server/app');
const { run, get, all, close } = require('../../server/db/connection');
const { hashPassword } = require('../../server/services/passwordService');
const nativeFetch = global.fetch;

let server;
let baseUrl;
const originalCloudinaryEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET
};

async function startServer() {
  const app = await createApp();

  return new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
}

async function apiRequest(requestPath, {
  method = 'GET',
  body,
  cookie = '',
  origin = process.env.APP_ORIGIN,
  headers = {}
} = {}) {
  const requestHeaders = { ...headers };
  let requestBody = body;

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  if (cookie) {
    requestHeaders.Cookie = cookie;
  }

  if (method !== 'GET' && origin) {
    requestHeaders.Origin = origin;
  }

  const response = await nativeFetch(`${baseUrl}${requestPath}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
    redirect: 'manual'
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return { response, payload };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.split(';')[0];
}

async function resetDatabase() {
  await run('DELETE FROM sessions');
  await run('DELETE FROM rate_limits');
  await run('DELETE FROM pending_registrations');
  await run('DELETE FROM notifications');
  await run('DELETE FROM pickup_options');
  await run('DELETE FROM product_images');
  await run('DELETE FROM products');
  await run('DELETE FROM ratings');
  await run('DELETE FROM users');
}

async function seedUser({
  username = 'alice',
  fullName = 'Alice Example',
  email = 'alice@upei.ca',
  password = 'StrongPassword123!',
  address = '123 University Avenue',
  phone = '+19025550100',
  country = 'Canada'
} = {}) {
  const result = await run(
    `INSERT INTO users (username, full_name, email, password, address, phone, country)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id AS "lastID"`,
    [username, fullName, email, hashPassword(password), address, phone, country]
  );

  return {
    id: result.lastID,
    email,
    password
  };
}

async function loginAs(user) {
  const response = await apiRequest('/api/login', {
    method: 'POST',
    body: {
      email: user.email,
      password: user.password
    }
  });

  assert.equal(response.response.status, 200);
  return readSessionCookie(response.response);
}

function createImageBlob(contents, type) {
  return new Blob([contents], { type });
}

test.before(async () => {
  server = await startServer();
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.APP_ORIGIN = baseUrl;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  process.env.CLOUDINARY_CLOUD_NAME = originalCloudinaryEnv.cloudName;
  process.env.CLOUDINARY_API_KEY = originalCloudinaryEnv.apiKey;
  process.env.CLOUDINARY_API_SECRET = originalCloudinaryEnv.apiSecret;
  global.fetch = nativeFetch;
  await close();
});

test.beforeEach(async () => {
  await resetDatabase();
  process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
  process.env.CLOUDINARY_API_KEY = 'demo-key';
  process.env.CLOUDINARY_API_SECRET = 'demo-secret';
  global.fetch = nativeFetch;
});

test('product creation without uploaded images keeps the placeholder image', async () => {
  const user = await seedUser({ email: 'placeholder@upei.ca' });
  const cookie = await loginAs(user);
  const createResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: {
      name: 'Desk Lamp',
      price: 12,
      condition: 'Good',
      description: 'A steady study lamp.'
    }
  });

  assert.equal(createResponse.response.status, 200);
  const product = await get(
    'SELECT "Product_Url" FROM products WHERE "Product_ID" = ?',
    [createResponse.payload.id]
  );
  const productImages = await all(
    'SELECT id FROM product_images WHERE product_id = ?',
    [createResponse.payload.id]
  );
  const detailsResponse = await apiRequest(`/api/products/${createResponse.payload.id}`, {
    cookie
  });

  assert.equal(product.Product_Url, '/images/campus-placeholder.svg');
  assert.equal(productImages.length, 0);
  assert.equal(detailsResponse.payload.images.length, 1);
  assert.equal(detailsResponse.payload.images[0].url, '/images/campus-placeholder.svg');
});

test('multipart product creation stores Cloudinary-backed images and cover metadata', async () => {
  const user = await seedUser({ email: 'gallery@upei.ca' });
  const cookie = await loginAs(user);
  const uploadedUrls = [
    'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/image-1.png',
    'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/image-2.png',
    'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/image-3.png'
  ];
  let uploadCount = 0;

  global.fetch = async (url) => {
    if (!String(url).includes('/image/upload')) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }

    const nextIndex = uploadCount;
    uploadCount += 1;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        public_id: `borrowfirst/products/image-${nextIndex + 1}`,
        secure_url: uploadedUrls[nextIndex],
        width: 1200,
        height: 900,
        bytes: 2048
      })
    };
  };

  const formData = new FormData();
  formData.append('name', 'Camera Kit');
  formData.append('price', '25');
  formData.append('condition', 'Excellent');
  formData.append('description', 'Three useful photos for the listing.');
  formData.append('coverIndex', '1');
  formData.append('images', createImageBlob('one', 'image/png'), 'one.png');
  formData.append('images', createImageBlob('two', 'image/jpeg'), 'two.jpg');
  formData.append('images', createImageBlob('three', 'image/webp'), 'three.webp');

  const createResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: formData
  });

  assert.equal(createResponse.response.status, 200);
  const productId = createResponse.payload.id;
  const storedProduct = await get(
    'SELECT "Product_Url" FROM products WHERE "Product_ID" = ?',
    [productId]
  );
  const storedImages = await all(
    `SELECT cloudinary_public_id, image_url, sort_order, is_cover
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC`,
    [productId]
  );
  const listResponse = await apiRequest('/api/products', { cookie });
  const detailsResponse = await apiRequest(`/api/products/${productId}`, { cookie });

  assert.equal(uploadCount, 3);
  assert.equal(storedProduct.Product_Url, uploadedUrls[1]);
  assert.equal(storedImages.length, 3);
  assert.deepEqual(
    storedImages.map((image) => ({
      imageUrl: image.image_url,
      sortOrder: Number(image.sort_order),
      isCover: Boolean(image.is_cover)
    })),
    [
      { imageUrl: uploadedUrls[0], sortOrder: 0, isCover: false },
      { imageUrl: uploadedUrls[1], sortOrder: 1, isCover: true },
      { imageUrl: uploadedUrls[2], sortOrder: 2, isCover: false }
    ]
  );
  assert.equal(listResponse.payload[0].image_count, 3);
  assert.equal(listResponse.payload[0].Product_Url, uploadedUrls[1]);
  assert.deepEqual(
    detailsResponse.payload.images.map((image) => ({
      url: image.url,
      sortOrder: image.sortOrder,
      isCover: image.isCover
    })),
    [
      { url: uploadedUrls[0], sortOrder: 0, isCover: false },
      { url: uploadedUrls[1], sortOrder: 1, isCover: true },
      { url: uploadedUrls[2], sortOrder: 2, isCover: false }
    ]
  );
});

test('multipart product creation rejects unsupported, oversized, and too-many files', async () => {
  const user = await seedUser({ email: 'limits@upei.ca' });
  const cookie = await loginAs(user);

  const invalidTypeForm = new FormData();
  invalidTypeForm.append('name', 'Bad Upload');
  invalidTypeForm.append('price', '10');
  invalidTypeForm.append('condition', 'Good');
  invalidTypeForm.append('description', 'Invalid type.');
  invalidTypeForm.append('images', createImageBlob('plain text', 'text/plain'), 'bad.txt');

  const invalidTypeResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: invalidTypeForm
  });

  assert.equal(invalidTypeResponse.response.status, 400);
  assert.equal(invalidTypeResponse.payload.message, 'Only PNG, JPEG, WebP, and GIF images up to 5 MiB are allowed.');

  const oversizedForm = new FormData();
  oversizedForm.append('name', 'Large Upload');
  oversizedForm.append('price', '10');
  oversizedForm.append('condition', 'Good');
  oversizedForm.append('description', 'Too large.');
  oversizedForm.append('images', createImageBlob(Buffer.alloc((5 * 1024 * 1024) + 1), 'image/png'), 'large.png');

  const oversizedResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: oversizedForm
  });

  assert.equal(oversizedResponse.response.status, 400);
  assert.equal(oversizedResponse.payload.message, 'Each image must be 5 MiB or smaller.');

  const tooManyForm = new FormData();
  tooManyForm.append('name', 'Many Uploads');
  tooManyForm.append('price', '10');
  tooManyForm.append('condition', 'Good');
  tooManyForm.append('description', 'Too many.');

  for (let index = 0; index < 6; index += 1) {
    tooManyForm.append('images', createImageBlob(`image-${index}`, 'image/png'), `image-${index}.png`);
  }

  const tooManyResponse = await apiRequest('/api/products', {
    method: 'POST',
    cookie,
    body: tooManyForm
  });

  assert.equal(tooManyResponse.response.status, 400);
  assert.equal(tooManyResponse.payload.message, 'You can upload up to 5 photos per listing.');
});

test('legacy products still synthesize a single detail image without product_images rows', async () => {
  const user = await seedUser({ email: 'legacy@upei.ca' });
  const cookie = await loginAs(user);
  const productResult = await run(
    `INSERT INTO products (
      "Product_Name",
      "Product_Lender_ID",
      "Product_Borrower_ID",
      "Product_Is_Active",
      "Product_Description",
      "Product_Condition",
      "Product_Url",
      "Product_Lending_Charge"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING "Product_ID" AS "lastID"`,
    [
      'Legacy Bike',
      user.id,
      null,
      1,
      'Original single-image listing.',
      'Good',
      '/images/bike.svg',
      18
    ]
  );

  const detailsResponse = await apiRequest(`/api/products/${productResult.lastID}`, { cookie });

  assert.equal(detailsResponse.response.status, 200);
  assert.deepEqual(detailsResponse.payload.images, [
    {
      id: `legacy-${productResult.lastID}`,
      url: '/images/bike.svg',
      sortOrder: 0,
      isCover: true,
      alt: 'Legacy Bike'
    }
  ]);
});

test('listing removal deletes Cloudinary assets and clears stored image metadata after success', async () => {
  const user = await seedUser({ email: 'cleanup@upei.ca' });
  const cookie = await loginAs(user);
  const productResult = await run(
    `INSERT INTO products (
      "Product_Name",
      "Product_Lender_ID",
      "Product_Borrower_ID",
      "Product_Is_Active",
      "Product_Description",
      "Product_Condition",
      "Product_Url",
      "Product_Lending_Charge"
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING "Product_ID" AS "lastID"`,
    [
      'Cleanup Camera',
      user.id,
      null,
      1,
      'Listing with stored gallery images.',
      'Good',
      'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/cover.png',
      20
    ]
  );

  await run(
    `INSERT INTO product_images (
      product_id,
      cloudinary_public_id,
      image_url,
      sort_order,
      is_cover
    ) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    [
      productResult.lastID,
      'borrowfirst/products/cover',
      'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/cover.png',
      0,
      true,
      productResult.lastID,
      'borrowfirst/products/detail',
      'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/detail.png',
      1,
      false
    ]
  );

  const destroyCalls = [];

  global.fetch = async (url) => {
    if (!String(url).includes('/image/destroy')) {
      throw new Error(`Unexpected fetch call: ${url}`);
    }

    destroyCalls.push(String(url));

    return {
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok' })
    };
  };

  const removeResponse = await apiRequest(`/api/products/${productResult.lastID}/remove`, {
    method: 'POST',
    cookie,
    body: {}
  });
  const remainingImages = await all(
    'SELECT id FROM product_images WHERE product_id = ?',
    [productResult.lastID]
  );
  const removedProduct = await get(
    'SELECT "Product_Is_Active", "Product_Url" FROM products WHERE "Product_ID" = ?',
    [productResult.lastID]
  );

  assert.equal(removeResponse.response.status, 200);
  assert.equal(destroyCalls.length, 2);
  assert.equal(remainingImages.length, 0);
  assert.equal(Number(removedProduct.Product_Is_Active), 0);
  assert.equal(removedProduct.Product_Url, '/images/campus-placeholder.svg');
});
