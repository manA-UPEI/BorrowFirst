const { run, all } = require('../db/connection');

function listWindows(productId) {
  return all(
    `SELECT id, product_id, kind, start_date, end_date
     FROM product_availability
     WHERE product_id = ?
     ORDER BY kind ASC, start_date ASC, id ASC`,
    [productId]
  );
}

// Availability is edited as a whole set rather than row by row: the lender is
// describing the shape of their offer, not amending individual rows, and a
// replace keeps the stored windows consistent with what they last saw.
async function replaceWindows(productId, windows) {
  await run('DELETE FROM product_availability WHERE product_id = ?', [productId]);

  for (const window of windows) {
    await run(
      `INSERT INTO product_availability (product_id, kind, start_date, end_date)
       VALUES (?, ?, ?, ?)`,
      [productId, window.kind, window.startDate, window.endDate]
    );
  }
}

module.exports = {
  listWindows,
  replaceWindows
};
