const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const productImageFormModuleUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'public', 'js', 'productImageForm.mjs')
).href;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

function uninstallDom(dom) {
  dom.window.close();
  delete global.window;
  delete global.document;
}

test('validateSelectedProductImages rejects invalid file sets and createProductListingFormData keeps cover metadata', async () => {
  const productImageForm = await import(productImageFormModuleUrl);
  const validFiles = [
    { type: 'image/png', size: 1024 },
    { type: 'image/jpeg', size: 2048 }
  ];
  const tooManyFiles = new Array(6).fill({ type: 'image/png', size: 1024 });
  const invalidTypeFiles = [{ type: 'text/plain', size: 10 }];
  const oversizedFiles = [{ type: 'image/png', size: (5 * 1024 * 1024) + 1 }];

  assert.equal(productImageForm.validateSelectedProductImages(validFiles).message, '');
  assert.equal(
    productImageForm.validateSelectedProductImages(tooManyFiles).message,
    'You can upload up to 5 photos per listing.'
  );
  assert.equal(
    productImageForm.validateSelectedProductImages(invalidTypeFiles).message,
    'Only PNG, JPEG, WebP, and GIF images are allowed.'
  );
  assert.equal(
    productImageForm.validateSelectedProductImages(oversizedFiles).message,
    'Each image must be 5 MiB or smaller.'
  );

  const dom = installDom();

  try {
    const files = [
      new dom.window.File(['one'], 'one.png', { type: 'image/png' }),
      new dom.window.File(['two'], 'two.jpg', { type: 'image/jpeg' })
    ];
    const formData = productImageForm.createProductListingFormData(
      {
        name: 'Camera Kit',
        price: 25,
        condition: 'Excellent',
        description: 'A gallery listing'
      },
      files,
      1
    );

    assert.equal(formData.get('name'), 'Camera Kit');
    assert.equal(formData.get('price'), '25');
    assert.equal(formData.get('coverIndex'), '1');
    assert.equal(formData.getAll('images').length, 2);
  } finally {
    uninstallDom(dom);
  }
});

test('createProductImagePreviewCard renders cover state and selection callback safely', async () => {
  const dom = installDom();

  try {
    const productImageForm = await import(`${productImageFormModuleUrl}?preview`);
    let selectedIndex = null;
    const previewCard = productImageForm.createProductImagePreviewCard({
      fileName: 'camera-front.png',
      previewUrl: 'blob:http://localhost/camera-front',
      index: 2,
      isCover: true,
      onSelect: (index) => {
        selectedIndex = index;
      }
    });

    document.body.appendChild(previewCard);
    previewCard.querySelector('input').dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.equal(previewCard.classList.contains('is-cover'), true);
    assert.equal(previewCard.querySelector('strong').textContent, 'camera-front.png');
    assert.equal(previewCard.querySelector('span').textContent, 'Cover photo');
    assert.equal(previewCard.querySelector('input').checked, true);
    assert.equal(selectedIndex, 2);
  } finally {
    uninstallDom(dom);
  }
});
