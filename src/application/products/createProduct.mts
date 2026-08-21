import type { ImageStorage, ProductImageFile } from '../ports/imageStorage.mjs';
import type { AvailabilityInput, PickupWindow, ProductWriter } from '../ports/productWriter.mjs';
import type { TransactionRunner } from '../ports/transactionRunner.mjs';

export interface ProductFieldInput {
  readonly name: unknown;
  readonly description: unknown;
  readonly condition: unknown;
  readonly price: unknown;
  readonly imageUrl: unknown;
}

export interface ProductFieldValidation {
  readonly message?: string;
  readonly name?: string;
  readonly description?: string;
  readonly condition?: string;
  readonly price?: number;
  readonly imageUrl?: string;
}

export interface ProductValidator {
  validateFields(input: ProductFieldInput): ProductFieldValidation;
  validateCoverIndex(value: unknown, imageCount: number): { message?: string; coverIndex?: number };
  validatePickupWindows(value: unknown): { message?: string; pickupWindows?: PickupWindow[] };
  validateAvailability(value: unknown): { message?: string; availability?: AvailabilityInput[] };
}

export class ProductCreationError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'ProductCreationError';
  }
}

export interface CreateProductInput {
  readonly lenderId: number;
  readonly fields: ProductFieldInput;
  readonly coverIndex: unknown;
  readonly files: readonly ProductImageFile[];
  /** Optional. Omitted means "use the default campus pickup windows". */
  readonly pickupWindows?: unknown;
  /** Optional. Omitted means "available at any time". */
  readonly availability?: unknown;
}

export function createProductUseCase(
  validator: ProductValidator,
  productWriter: ProductWriter,
  imageStorage: ImageStorage,
  transactionRunner: TransactionRunner
) {
  return {
    async execute(input: CreateProductInput): Promise<number> {
      const fields = validator.validateFields(input.fields);

      if (fields.message) {
        throw new ProductCreationError(fields.message);
      }

      const cover = validator.validateCoverIndex(input.coverIndex, input.files.length);

      if (cover.message) {
        throw new ProductCreationError(cover.message);
      }

      const pickup = validator.validatePickupWindows(input.pickupWindows);

      if (pickup.message) {
        throw new ProductCreationError(pickup.message);
      }

      const availability = validator.validateAvailability(input.availability);

      if (availability.message) {
        throw new ProductCreationError(availability.message);
      }

      const uploadedAssets: ProductImageAsset[] = [];

      try {
        return await transactionRunner.run(async () => {
          const productId = await productWriter.createProduct({
            name: fields.name!,
            lenderId: input.lenderId,
            description: fields.description!,
            condition: fields.condition!,
            price: fields.price!,
            imageUrl: input.files.length ? '/images/campus-placeholder.svg' : fields.imageUrl!
          });

          // Only replace the defaults when the lender actually supplied windows;
          // an empty list leaves ensurePickupOptions to fill in the campus ones.
          if (pickup.pickupWindows?.length) {
            await productWriter.replacePickupOptions(productId, pickup.pickupWindows);
          }

          if (availability.availability?.length) {
            await productWriter.replaceAvailability(productId, availability.availability);
          }

          for (let index = 0; index < input.files.length; index += 1) {
            const asset = await imageStorage.uploadProductImage(input.files[index], {
              productId,
              lenderId: input.lenderId,
              sortOrder: index
            });
            uploadedAssets.push(asset);
            await productWriter.addProductImage({
              productId,
              asset,
              sortOrder: index,
              isCover: index === cover.coverIndex
            });
          }

          const coverAsset = uploadedAssets[cover.coverIndex!] || uploadedAssets[0];

          if (coverAsset?.url) {
            await productWriter.updateCoverImage(productId, coverAsset.url);
          }

          return productId;
        });
      } catch (error) {
        await Promise.all(uploadedAssets.map((asset) => (
          asset.publicId
            ? imageStorage.deleteProductImage(asset.publicId).catch(() => false)
            : Promise.resolve(false)
        )));
        throw error;
      }
    }
  };
}

type ProductImageAsset = import('../ports/productWriter.mjs').ProductImageAsset;