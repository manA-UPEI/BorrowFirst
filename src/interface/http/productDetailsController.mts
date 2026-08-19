import { createGetProductDetailsUseCase } from '../../application/products/getProductDetails.mjs';
import { createLegacyProductDetailsRepository } from '../../infrastructure/products/legacyProductDetailsRepository.mjs';

const getProductDetails = createGetProductDetailsUseCase(createLegacyProductDetailsRepository());

export async function productDetailsHandler(request: any, response: any): Promise<void> {
  try {
    const product = await getProductDetails.execute(Number(request.params.id), Number(request.session.userId));
    response.json({
      Product_ID: product.id,
      Product_Name: product.name,
      Product_Lender_ID: product.lenderId,
      Product_Borrower_ID: product.borrowerId,
      Product_Is_Active: product.isActive ? 1 : 0,
      Product_Description: product.description,
      Product_Condition: product.condition,
      Product_Url: product.imageUrl,
      Product_Lending_Charge: product.lendingCharge,
      images: product.images.map((image) => ({
        id: image.id || `legacy-${product.id}`,
        url: image.url,
        sortOrder: image.sortOrder,
        isCover: image.isCover,
        ...(image.id ? {} : { alt: product.name || 'Product image' })
      })),
      current_transaction_status: product.currentTransactionStatus,
      listing_is_active: product.isActive,
      viewer_is_lender: product.viewerIsLender,
      viewer_is_borrower: product.viewerIsBorrower,
      viewer_can_request: product.viewerCanRequest
    });
  } catch (error: any) {
    response.status(error.statusCode || 500).json({ message: error.message || 'Unable to load product.' });
  }
}