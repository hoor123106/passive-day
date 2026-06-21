// Updated fetch-articles.js to also generate product MDX files and support product shortcode
import fs from "fs";
import path from "path";
import axios from "axios";
import { parse } from "csv-parse/sync";

// --- Sheet URLs ------------------------------------------------------------
const ARTICLES_SHEET_URL = "https://docs.google.com/spreadsheets/d/1_eh1ea10_SzEjvGxHodMpazEegdIorsrmfGwJsIpdfg/export?format=csv&gid=0";
const PRODUCTS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1_eh1ea10_SzEjvGxHodMpazEegdIorsrmfGwJsIpdfg/export?format=csv&gid=1100781313";

// --- Shortcode handling ----------------------------------------------------
// Matches [#$NAME] or [#$NAME,1,2,3]
const SHORTCODE_REGEX = /\[#\$(\w+)(?:,([^\]]+))?\]/gi;

const SHORTCODE_MAP = {
  NEWSLETTER: "Newsletter",
  PRODUCT: "Products",
};

function processShortcodes(str) {
  const usedComponents = new Set();
  const body = str.replace(SHORTCODE_REGEX, (match, name, ids) => {
    const componentName = SHORTCODE_MAP[name.toUpperCase()];
    if (!componentName) {
      console.warn(`⚠️ Unknown shortcode: ${match}`);
      return "";
    }
    usedComponents.add(componentName);
    if (ids) {
      // remove whitespace and keep as is for the component prop
      const cleaned = ids.replace(/\s+/g, "");
      return `<${componentName} ids="${cleaned}" />`;
    }
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
    /<img(.*?)src=\"images\/(.*?)\"(.*?)>/gi,
    '<img$1src=\"/images/$2\"$3>'
  );
  return out.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

async function fetchAndGenerate() {
  console.log("🚀 Fetching Articles Sheet data...");
  const articleResp = await axios.get(ARTICLES_SHEET_URL, {
    timeout: 30000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const productResp = await axios.get(PRODUCTS_SHEET_URL, {
    timeout: 30000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const articleRecords = parse(articleResp.data, { columns: true, skip_empty_lines: true });
  const productRecords = parse(productResp.data, { columns: true, skip_empty_lines: true });

  // ---------------------------------------------------
  // Articles (existing behaviour – generate MDX in src/content/articles)
  // ---------------------------------------------------
  const articleDir = path.join(process.cwd(), "src", "content", "articles");
  if (fs.existsSync(articleDir)) {
    console.log("🧹 Cleaning old article MDX files...");
    fs.readdirSync(articleDir).forEach((file) => {
      if (file.endsWith(".mdx")) fs.unlinkSync(path.join(articleDir, file));
    });
  } else {
    fs.mkdirSync(articleDir, { recursive: true });
  }

  articleRecords.forEach((row, index) => {
    // Helper to fetch a column value case‑insensitively
    const getVal = (keys) => {
      const hit = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()));
      return hit ? row[hit]?.trim() : null;
    };
    const title = getVal(["title", "article title", "name"]) || "";
    let slug = getVal(["slug", "url"]) || title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `article-${index}`;
    slug = slug.toString().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    const publish = (getVal(["publish", "published", "status"]) || "y").toLowerCase();
    if (publish !== "y" && publish !== "yes") return;

    const frontmatter = {};
    for (let [k, v] of Object.entries(row)) {
      const cleanKey = k.trim();
      if (["content", "body"].includes(cleanKey.toLowerCase())) continue;
      frontmatter[cleanKey] = v;
    }
    frontmatter.title = title;
    frontmatter.slug = slug;

    let mdx = "---\n";
    for (const [k, v] of Object.entries(frontmatter)) mdx += `${k}: ${JSON.stringify(v)}\n`;
    mdx += "---\n\n";

    const rawBody = getVal(["content", "body"]) || "";
    const { body, imports } = processShortcodes(sanitizeContent(rawBody));
    if (imports) mdx += `${imports}\n\n`;
    mdx += body;

    const outPath = path.join(articleDir, `${slug}.mdx`);
    fs.writeFileSync(outPath, mdx, "utf-8");
    console.log(`✅ Created article: ${slug}.mdx`);
  });

  // ---------------------------------------------------
  // Products – generate one MDX per product row
  // ---------------------------------------------------
  const productDir = path.join(process.cwd(), "src", "content", "products");
  if (fs.existsSync(productDir)) {
    console.log("🧹 Cleaning old product MDX files...");
    fs.readdirSync(productDir).forEach((file) => {
      if (file.endsWith(".mdx")) fs.unlinkSync(path.join(productDir, file));
    });
  } else {
    fs.mkdirSync(productDir, { recursive: true });
  }

  productRecords.forEach((row) => {
    // Expected columns: Publish ID, Order, Name, Description, Button Text, Button Link, Publish (optional)
    const getVal = (keys) => {
      const hit = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()));
      return hit ? row[hit]?.trim() : null;
    };
    const publishFlag = (getVal(["publish", "published", "status"]) || "y").toLowerCase();
    if (publishFlag !== "y" && publishFlag !== "yes") return; // respect publish Y

    const publishId = getVal(["publish id"]) || getVal(["id"]);
    if (!publishId) return; // must have an ID to address via shortcode
    const order = Number(getVal(["order"])) || 0;
    const name = getVal(["name", "title"]) || "";
    const description = getVal(["description", "desc"]) || "";
    const buttonText = getVal(["button text", "buttontext", "cta"]) || "";
    const buttonLink = getVal(["button link", "buttonlink", "link"]) || "";

    const front = {
      publishId,
      order,
      name,
      description,
      buttonText,
      buttonLink,
    };

    let mdx = "---\n";
    for (const [k, v] of Object.entries(front)) mdx += `${k}: ${JSON.stringify(v)}\n`;
    mdx += "---\n\n"; // body left empty – component will render based on frontmatter only

    const fileName = `product-${publishId}.mdx`;
    const outPath = path.join(productDir, fileName);
    fs.writeFileSync(outPath, mdx, "utf-8");
    console.log(`✅ Created product: ${fileName}`);
  });

  console.log("✨ Sync complete!");
}

fetchAndGenerate().catch(console.error);
