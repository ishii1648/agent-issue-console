import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compile = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.app.json", "--noEmit", "false", "--outDir", "dist-app-js"], {
  cwd: packageDirectory,
  encoding: "utf8",
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);

const capnwebPath = fileURLToPath(import.meta.resolve("capnweb"));
const capnweb = readFileSync(capnwebPath, "utf8").replaceAll("</script>", "<\\/script>");
const app = readFileSync(resolve(packageDirectory, "dist-app-js/main.js"), "utf8")
  .replace(/^import .*? from "capnweb";\n/m, "")
  .replace(/^import "\.\/styles\.css";\n/m, "")
  .replaceAll("</script>", "<\\/script>");
const css = readFileSync(resolve(packageDirectory, "app/styles.css"), "utf8").replaceAll("</style>", "<\\/style>");
const html = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Agent Issue Console</title><style>${css}</style></head><body><div id="root"></div><script type="module">${capnweb}\n${app}</script></body></html>`;
const destination = resolve(packageDirectory, "src/generated/app.txt");
const contents = `<!-- Generated from packages/custom-gatekeeper/app. Do not edit. -->\n${html}`;
if (!existsSync(destination) || readFileSync(destination, "utf8") !== contents) {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}
process.stdout.write(`built Agent Issue Console UI (${Math.round(contents.length / 1024)} KiB)\n`);
