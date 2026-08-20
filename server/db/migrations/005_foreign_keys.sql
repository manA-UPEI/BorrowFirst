-- Referential integrity. Until now every relationship in this schema was implied by
-- column naming only, so nothing at the database level stopped a product from
-- pointing at a deleted lender, or a loan from outliving the product it was for.
--
-- Each constraint is preceded by a cleanup of the rows that would violate it, so the
-- migration is safe to apply to a database that has already accumulated orphans.
-- Deletes cascade in dependency order: child rows first, then the parents.

DELETE FROM product_images WHERE product_id NOT IN (SELECT "Product_ID" FROM products);
DELETE FROM pickup_options WHERE product_id NOT IN (SELECT "Product_ID" FROM products);
DELETE FROM notifications WHERE product_id NOT IN (SELECT "Product_ID" FROM products);
DELETE FROM notifications WHERE lender_id NOT IN (SELECT id FROM users);
DELETE FROM notifications WHERE borrower_id NOT IN (SELECT id FROM users);
DELETE FROM ratings WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM ratings WHERE rater_id NOT IN (SELECT id FROM users);
DELETE FROM products WHERE "Product_Lender_ID" NOT IN (SELECT id FROM users);

UPDATE products
SET "Product_Borrower_ID" = NULL
WHERE "Product_Borrower_ID" IS NOT NULL
  AND "Product_Borrower_ID" NOT IN (SELECT id FROM users);

UPDATE notifications
SET pickup_verified_by_user_id = NULL
WHERE pickup_verified_by_user_id IS NOT NULL
  AND pickup_verified_by_user_id NOT IN (SELECT id FROM users);

UPDATE notifications
SET returned_by_user_id = NULL
WHERE returned_by_user_id IS NOT NULL
  AND returned_by_user_id NOT IN (SELECT id FROM users);

-- A lender cannot be removed while their listings exist; server/db/init.js's
-- deleteDemoUserData already deletes in that order.
ALTER TABLE products
  ADD CONSTRAINT fk_products_lender
  FOREIGN KEY ("Product_Lender_ID") REFERENCES users(id);

ALTER TABLE products
  ADD CONSTRAINT fk_products_borrower
  FOREIGN KEY ("Product_Borrower_ID") REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE product_images
  ADD CONSTRAINT fk_product_images_product
  FOREIGN KEY (product_id) REFERENCES products("Product_ID") ON DELETE CASCADE;

ALTER TABLE pickup_options
  ADD CONSTRAINT fk_pickup_options_product
  FOREIGN KEY (product_id) REFERENCES products("Product_ID") ON DELETE CASCADE;

ALTER TABLE ratings
  ADD CONSTRAINT fk_ratings_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ratings
  ADD CONSTRAINT fk_ratings_rater
  FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_product
  FOREIGN KEY (product_id) REFERENCES products("Product_ID") ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_lender
  FOREIGN KEY (lender_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_borrower
  FOREIGN KEY (borrower_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_pickup_verifier
  FOREIGN KEY (pickup_verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_returner
  FOREIGN KEY (returned_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
