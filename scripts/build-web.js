const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

function renameNodeModulesDirs(dir) {
  let renamed = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.includes("node_modules")) {
      if (entry.isDirectory()) renamed = renamed.concat(renameNodeModulesDirs(path.join(dir, entry.name)));
      continue;
    }
    const oldPath = path.join(dir, entry.name);
    const newPath = path.join(dir, entry.name.replace(/node_modules/g, "_node_modules"));
    fs.renameSync(oldPath, newPath);
    renamed.push(path.relative(DIST, newPath));
    if (entry.isDirectory()) renamed = renamed.concat(renameNodeModulesDirs(newPath));
  }
  return renamed;
}

const TEXT_EXTENSIONS = /\.(js|json|html|css|map|txt|xml|svg|webmanifest)$/i;

function rewriteNodeModulesRefs(dir) {
  let rewritten = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewritten = rewritten.concat(rewriteNodeModulesRefs(filePath));
      continue;
    }
    if (!TEXT_EXTENSIONS.test(entry.name)) continue;
    const buf = fs.readFileSync(filePath);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      continue;
    }
    if (!text.includes("node_modules")) continue;
    const updated = text.replace(/node_modules/g, "_node_modules");
    fs.writeFileSync(filePath, updated);
    rewritten.push(path.relative(DIST, filePath));
  }
  return rewritten;
}

try {
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });

  execSync("npx expo export --platform web", { cwd: ROOT, stdio: "inherit" });

  const renamedDirs = renameNodeModulesDirs(DIST);
  const rewrittenFiles = rewriteNodeModulesRefs(DIST);

  for (const rel of renamedDirs) console.log(`renamed -> ${rel}`);
  for (const rel of rewrittenFiles) console.log(`rewritten ${rel}`);
  console.log(`\nexport ok: ${renamedDirs.length} directory(ies) renamed, ${rewrittenFiles.length} file(s) rewritten.`);
} catch (error) {
  console.error(`\nbuild-web failed: ${error.message}`);
  process.exit(1);
}