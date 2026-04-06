const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const renderingModuleUrl = pathToFileURL(
  path.join(__dirname, '..', '..', 'public', 'js', 'rendering.mjs')
).href;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  return dom;
}

function uninstallDom(dom) {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.Node;
}

test('createProductCard renders malicious product text as inert text and sanitizes images', async () => {
  const dom = installDom();

  try {
    const rendering = await import(renderingModuleUrl);
    const card = rendering.createProductCard({
      Product_Name: '<img src=x onerror=alert(1)>',
      Product_Description: '<script>alert(1)</script>',
      Product_Condition: 'Good',
      Product_Url: 'https://evil.example/tracker.png',
      Product_Lending_Charge: 12
    });

    document.body.appendChild(card);

    assert.equal(card.querySelector('script'), null);
    assert.equal(card.querySelector('h3').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(card.querySelector('.card-description').textContent, '<script>alert(1)</script>');
    assert.equal(
      card.querySelector('img').src,
      'http://localhost/images/campus-placeholder.svg'
    );
  } finally {
    uninstallDom(dom);
  }
});

test('renderSummary and createRatingRow keep user-controlled text inert', async () => {
  const dom = installDom();

  try {
    const rendering = await import(renderingModuleUrl);
    const container = document.createElement('div');
    const ratingRow = rendering.createRatingRow('<svg onload=alert(1)>', 5);

    rendering.renderSummary(container, [
      { label: 'Product', value: '<script>alert(1)</script>' },
      { label: 'Pickup', value: '<img src=x onerror=alert(1)>' }
    ]);

    document.body.appendChild(container);
    document.body.appendChild(ratingRow);

    assert.equal(container.querySelector('script'), null);
    assert.equal(container.querySelector('img'), null);
    assert.equal(container.querySelectorAll('.summary-value')[0].textContent, '<script>alert(1)</script>');
    assert.equal(container.querySelectorAll('.summary-value')[1].textContent, '<img src=x onerror=alert(1)>');
    assert.equal(ratingRow.querySelector('svg'), null);
    assert.equal(ratingRow.firstElementChild.textContent, '<svg onload=alert(1)>');
    assert.equal(ratingRow.lastElementChild.textContent, '5/5');
  } finally {
    uninstallDom(dom);
  }
});

test('setImageSource accepts safe Cloudinary delivery URLs', async () => {
  const dom = installDom();

  try {
    const rendering = await import(`${renderingModuleUrl}?cloudinary`);
    const image = document.createElement('img');

    rendering.setImageSource(
      image,
      'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/camera.png',
      'Camera'
    );

    assert.equal(
      image.src,
      'https://res.cloudinary.com/demo-cloud/image/upload/v1/borrowfirst/products/camera.png'
    );
    assert.equal(image.alt, 'Camera');
  } finally {
    uninstallDom(dom);
  }
});
