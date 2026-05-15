import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const articlesCollection = defineCollection({
    loader: glob({ pattern: '**/*.mdx', base: './src/content/articles' }),
    schema: z.object({
        'Publish': z.string().optional(),
        'ID': z.string().optional(),
        'Home': z.string().optional(),
        'Featured': z.string().optional(),
        'Popular': z.string().optional(),
        'Editor Pick': z.string().optional(),
        'Category': z.string().optional(),
        'Date': z.string().optional(),
        'Slug': z.string().optional(),
        'Title': z.string().optional(),
        'Meta Title': z.string().optional(),
        'Meta Description': z.string().optional(),
        'Image Featured': z.string().optional(),
        'Image ALT': z.string().optional(),
        'Tags': z.string().optional(),
        'Author ID': z.string().optional(),
        'Author Name': z.string().optional(),
        'Segment': z.string().optional(),
        'Order': z.any().optional(),
        'title': z.string().optional(),
        'slug': z.string().optional(),
    }).catchall(z.any()),
});

export const collections = {
    articles: articlesCollection,
};
