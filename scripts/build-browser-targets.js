const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const sharedFiles = [
  "background.js",
  "contentScript.js",
  "options.html",
  "popup.html",
  "settings.css",
  "settings.js",
  "styles.css",
  "LICENSE",
  "README.md",
  "ADAPTERS.md",
  "BROWSER_SUPPORT.md",
  "STORE_LISTING.md"
];

const targets = {
  chrome: {},
  edge: {},
  firefox: {
    browser_specific_settings: {
      gecko: {
        id: "askanchor@example.com",
        strict_min_version: "109.0"
      }
    }
  },
  safari: {}
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function copyFileIfExists(relativePath, targetDir) {
  const source = path.join(rootDir, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }

  fs.copyFileSync(source, path.join(targetDir, relativePath));
}

function copyDirectory(relativePath, targetDir) {
  const source = path.join(rootDir, relativePath);
  if (!fs.existsSync(source)) {
    return;
  }

  copyDirectoryRecursive(source, path.join(targetDir, relativePath));
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(source, target);
      return;
    }

    if (entry.isFile()) {
      fs.copyFileSync(source, target);
    }
  });
}

function buildTarget(targetName, manifestOverrides) {
  const targetDir = path.join(distDir, targetName);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const manifest = {
    ...readJson(path.join(rootDir, "manifest.json")),
    ...manifestOverrides
  };

  writeJson(path.join(targetDir, "manifest.json"), manifest);
  sharedFiles.forEach((file) => copyFileIfExists(file, targetDir));
  copyDirectory("assets", targetDir);
  copyDirectory("src", targetDir);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

Object.entries(targets).forEach(([targetName, manifestOverrides]) => {
  buildTarget(targetName, manifestOverrides);
});

console.log(`Built ${Object.keys(targets).join(", ")} packages in ${distDir}`);
