const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const REPO_OWNER = "mzeeemzimanjejeje";
const REPO_NAME = "Maintaining";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("❌ GITHUB_TOKEN not set");
  process.exit(1);
}

async function ghApi(endpoint, options = {}) {
  const method = options.method || "GET";
  const url = `https://api.github.com${endpoint}`;
  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "TRUTH-MD-Bot/1.0",
  };
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function shouldInclude(filePath) {
  const ignore = [
    "node_modules", ".env", "session/", "sessions/", "auth_info_baileys/",
    "tmp_pair_", "status_capture/", "temp/", "tmp/", ".git/", ".cache/",
    ".upm/", ".local/", "attached_assets/", "baileys_store.json",
    "message_backup.json", "error_counter.json", "sessionErrorCount.json",
    ".puppeteerrc.cjs", "player-script.js", ".replit", "replit.nix",
    "replit.md", ".breakpoints", "snippets/"
  ];
  for (const pattern of ignore) {
    if (filePath.startsWith(pattern) || filePath.includes("/" + pattern)) return false;
  }
  if (filePath.startsWith("data/") && !filePath.startsWith("data/defaults/")) return false;
  if (filePath.endsWith(".log") || filePath.endsWith(".bak")) return false;
  return true;
}

function getAllFiles(dir, base = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".cache", ".upm", ".local", "session", "sessions", "auth_info_baileys", "attached_assets"].includes(entry.name)) continue;
      files.push(...getAllFiles(path.join(dir, entry.name), rel));
    } else {
      if (shouldInclude(rel)) files.push(rel);
    }
  }
  return files;
}

async function push() {
  console.log(`Pushing to ${REPO_OWNER}/${REPO_NAME} (${BRANCH})...`);

  const refData = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${BRANCH}`);
  const latestSha = refData.object.sha;
  console.log(`Latest commit: ${latestSha.substring(0, 7)}`);

  const files = getAllFiles(process.cwd());
  console.log(`Files to push: ${files.length}`);

  const treeItems = [];
  for (const filePath of files) {
    const fullPath = path.join(process.cwd(), filePath);
    const content = fs.readFileSync(fullPath);
    const isBinary = content.includes(0x00);

    if (isBinary) {
      const blobData = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
        method: "POST",
        body: { content: content.toString("base64"), encoding: "base64" },
      });
      treeItems.push({ path: filePath, mode: "100644", type: "blob", sha: blobData.sha });
    } else {
      treeItems.push({ path: filePath, mode: "100644", type: "blob", content: content.toString("utf-8") });
    }
  }

  console.log("Creating tree...");
  const treeData = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
    method: "POST",
    body: { tree: treeItems, base_tree: latestSha },
  });

  const commitMsg = `Update TRUTH-MD bot - ${new Date().toISOString().split("T")[0]}`;
  console.log(`Creating commit: ${commitMsg}`);
  const commitData = await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
    method: "POST",
    body: { message: commitMsg, tree: treeData.sha, parents: [latestSha] },
  });

  await ghApi(`/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: { sha: commitData.sha },
  });

  console.log(`✅ Pushed successfully! Commit: ${commitData.sha.substring(0, 7)}`);
}

push().catch((err) => {
  console.error("❌ Push failed:", err.message);
  process.exit(1);
});
