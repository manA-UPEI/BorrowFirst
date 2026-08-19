import { createListProducts } from '../../application/products/listProducts.mjs';
import { createLegacyProductRepository } from '../../infrastructure/products/legacyProductRepository.mjs';

const listProducts = createListProducts(createLegacyProductRepository());

function toLegacyProductResponse(product: Awaited<ReturnType<typeof listProducts.execute>>[number]) {
  return {
    Product_ID: product.id,
    Product_Name: product.name,
    Product_Lender_ID: product.lenderId,
    Product_Borrower_ID: product.borrowerId,
    Product_Is_Active: product.isActive ? 1 : 0,
    Product_Description: product.description,
    Product_Condition: product.condition,
    Product_Url: product.imageUrl,
    Product_Lending_Charge: product.lendingCharge,
    image_count: product.imageCount,
    Current_Transaction_Status: product.currentTransactionStatus
  };
}

export async function listProductsHandler(_request: unknown, response: {
  json: (payload: unknown) => void;
}): Promise<void> {
  const products = await listProducts.execute();
  response.json(products.map(toLegacyProductResponse));
}