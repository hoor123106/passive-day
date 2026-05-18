import type { ImageMetadata } from 'astro';
import fallbackImage from '../assets/images/heroImage.png';

// Eagerly import all images in src/assets/images
const localImages = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/*.{jpeg,jpg,png,gif,webp,avif,svg,PNG,JPG,JPEG,WEBP,AVIF}', { eager: true });

/**
 * Resolves an article's featured image from the local assets folder.
 * If the image is not found, returns the provided custom fallback or the default hero image.
 * 
 * @param imageFeatured The image filename from the MDX/Spreadsheet frontmatter.
 * @param customFallback Optional custom fallback image metadata.
 * @returns ImageMetadata of the resolved image.
 */
export function resolveArticleImage(
    imageFeatured: string | undefined | null,
    customFallback: ImageMetadata = fallbackImage
): ImageMetadata {
    if (!imageFeatured) {
        return customFallback;
    }

    // Clean up leading/trailing spaces or slashes
    const cleanName = imageFeatured.trim().replace(/^\//, '');

    // Try finding the image in the local assets glob
    const possiblePaths = [
        `/src/assets/images/${cleanName}`,
        `/src/assets/images/${cleanName.toLowerCase()}`,
    ];

    for (const path of possiblePaths) {
        if (localImages[path]) {
            return localImages[path].default;
        }
    }

    // If not found in the local folder, return the fallback image
    return customFallback;
}
