import fs from "fs";
import path from "path";
import axios from "axios";
import { parse } from "csv-parse/sync";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_eh1ea10_SzEjvGxHodMpazEegdIorsrmfGwJsIpdfg/export?format=csv&gid=0";

const SHORTCODE_REGEX = /\[\#\$(\w+)\]/gi;

const SHORTCODE_MAP = {
  NEWSLETTER: "Newsletter",
};

function processShortcodes(str) {
  const usedComponents = new Set();

  const body = str.replace(SHORTCODE_REGEX, (match, name) => {
    const componentName = SHORTCODE_MAP[name.toUpperCase()];

    if (!componentName) {
      console.warn(`⚠️ Unknown shortcode: ${match}`);
      return "";
    }

    usedComponents.add(componentName);
    return `<${componentName} />`;
  });

  const imports = [...usedComponents]
    .map((c) => `import ${c} from '../../components/${c}.astro';`)
    .join("\n");

  return { body, imports };
}

function sanitizeContent(str) {
  if (!str) return "";

  let out = str.replace(/!\[(.*?)\]\(images\/(.*?)\)/gi, "![$1](/images/$2)");

  out = out.replace(
    /<img(.*?)src="images\/(.*?)"(.*?)>/gi,
    '<img$1src="/images/$2"$3>',
  );

  return out.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

async function fetchAndGenerate() {
  console.log("🚀 Fetching Articles Sheet data...");

  const response = await axios.get(SHEET_URL, {
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const csvText = response.data;

  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  });

  const contentDir = path.join(process.cwd(), "src", "content", "articles");

  if (fs.existsSync(contentDir)) {
    console.log("🧹 Cleaning old MDX files...");

    const files = fs.readdirSync(contentDir);

    for (const file of files) {
      if (file.endsWith(".mdx")) {
        fs.unlinkSync(path.join(contentDir, file));
      }
    }
  } else {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  records.forEach((row, index) => {
    const getVal = (keys) => {
      const key = Object.keys(row).find((k) =>
        keys.includes(k.trim().toLowerCase()),
      );

      return key ? row[key]?.trim() : null;
    };

    const title = getVal(["title", "article title", "name"]) || "";

    let slug =
      getVal(["slug", "url"]) ||
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
      `article-${index}`;

    slug = slug
      .toString()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    const publish = (
      getVal(["publish", "published", "status"]) || "y"
    ).toLowerCase();

    if (publish !== "y" && publish !== "yes") {
      console.log(`⏩ Skipping: ${title}`);
      return;
    }

    const frontmatter = {};

    for (let [key, value] of Object.entries(row)) {
      const cleanKey = key.trim();

      if (["content", "body"].includes(cleanKey.toLowerCase())) {
        continue;
      }

      frontmatter[cleanKey] = value;
    }

    frontmatter.title = title;
    frontmatter.slug = slug;

    let mdxContent = `---\n`;

    for (const [key, value] of Object.entries(frontmatter)) {
      mdxContent += `${key}: ${JSON.stringify(value)}\n`;
    }

    mdxContent += `---\n\n`;

    const rawBody = getVal(["content", "body"]) || "";
    const { body, imports } = processShortcodes(sanitizeContent(rawBody));

    if (imports) {
      mdxContent += `${imports}\n\n`;
    }

    mdxContent += body;

    const filePath = path.join(contentDir, `${slug}.mdx`);

    fs.writeFileSync(filePath, mdxContent, "utf-8");

    console.log(`✅ Created: ${slug}.mdx`);
  });

  console.log("✨ Article sync complete!");
}

fetchAndGenerate().catch(console.error);
