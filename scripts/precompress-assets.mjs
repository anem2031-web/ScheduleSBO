import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const compressBrotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
const TEXT_ASSET = /\.(?:js|mjs|css|html|svg|json|txt|webmanifest)$/i;

export async function precompressAssets(directory) {
  const root = path.resolve(directory);
  const totals = { files: 0, originalBytes: 0, brotliBytes: 0, gzipBytes: 0 };
  async function visit(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (entry.isFile() && TEXT_ASSET.test(entry.name)) {
        const source = await fs.readFile(filename);
        if (source.length < 1024) continue;
        const [br, gz] = await Promise.all([
          compressBrotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } }),
          compressGzip(source, { level: 9 }),
        ]);
        await Promise.all([
          br.length < source.length ? fs.writeFile(filename + ".br", br) : fs.rm(filename + ".br", { force: true }),
          gz.length < source.length ? fs.writeFile(filename + ".gz", gz) : fs.rm(filename + ".gz", { force: true }),
        ]);
        totals.files++;
        totals.originalBytes += source.length;
        totals.brotliBytes += Math.min(source.length, br.length);
        totals.gzipBytes += Math.min(source.length, gz.length);
      }
    }
  }
  await visit(root);
  return totals;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await precompressAssets(process.argv[2] ?? "dist/public");
  console.log("Precompressed static assets:", JSON.stringify(summary));
}
