import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1_eh1ea10_SzEjvGxHodMpazEegdIorsrmfGwJsIpdfg/export?format=csv&gid=0';

function sanitizeContent(str) {
    if (!str) return '';
    // Fix image paths: change ![](images/...) to ![](/images/...)
    let out = str.replace(/!\[(.*?)\]\(images\/(.*?)\)/gi, '![$1](/images/$2)');
    // Fix HTML img tags: <img src="images/..." /> to <img src="/images/..." />
    out = out.replace(/<img(.*?)src="images\/(.*?)"(.*?)>/gi, '<img$1src="/images/$2"$3>');

    // Escape { and } for MDX
    return out.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

async function fetchAndGenerate() {
    console.log('🚀 Fetching Articles Sheet data...');
    const response = await fetch(SHEET_URL);
    const csvText = await response.text();

    if (!response.ok || csvText.includes('<!DOCTYPE html>')) {
        throw new Error(`Sheet fetch failed. Ensure the sheet is public (Anyone with link can view).`);
    }

    const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
    });

    const contentDir = path.join(process.cwd(), 'src', 'content', 'articles');

    if (fs.existsSync(contentDir)) {
        console.log('🧹 Cleaning old MDX files...');
        const files = fs.readdirSync(contentDir);
        for (const file of files) {
            if (file.endsWith('.mdx')) fs.unlinkSync(path.join(contentDir, file));
        }
    } else {
        fs.mkdirSync(contentDir, { recursive: true });
    }

    records.forEach((row, index) => {
        // Helper to get value regardless of casing
        const getVal = (keys) => {
            const key = Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));
            return key ? row[key]?.trim() : null;
        };

        const title = getVal(['title', 'article title', 'name']) || '';
        let slug = getVal(['slug', 'url']) || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `article-${index}`;

        // Clean slug
        slug = slug.toString().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

        const publish = (getVal(['publish', 'published', 'status']) || 'y').toLowerCase();
        if (publish !== 'y' && publish !== 'yes') {
            console.log(`⏩ Skipping: ${title} (Status: ${publish})`);
            return;
        }

        // Gather all other columns for frontmatter
        const frontmatter = {};
        for (let [key, value] of Object.entries(row)) {
            const cleanKey = key.trim();
            if (['content', 'body'].includes(cleanKey.toLowerCase())) continue;

            // Map common fields to standard names if needed, or just use as is
            frontmatter[cleanKey] = value;
        }

        // Ensure title and slug are explicitly set in frontmatter
        frontmatter.title = title;
        frontmatter.slug = slug;

        let mdxContent = `---\n`;
        for (const [key, value] of Object.entries(frontmatter)) {
            mdxContent += `${key}: ${JSON.stringify(value)}\n`;
        }
        mdxContent += `---\n\n`;

        const body = getVal(['content', 'body']) || '';
        mdxContent += sanitizeContent(body);

        const filePath = path.join(contentDir, `${slug}.mdx`);
        fs.writeFileSync(filePath, mdxContent, 'utf-8');
        console.log(`✅ Created: ${slug}.mdx`);
    });

    console.log('✨ Article sync complete!');
}

fetchAndGenerate().catch(console.error);
