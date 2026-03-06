import path from "path";

// Turbopack (Next.js 16 default) does not set result.opts.from when it invokes
// PostCSS. @tailwindcss/postcss then computes its base as:
//   path.dirname(path.resolve("")) = path.dirname(cwd) = /…/workshop  ← parent
// which causes enhanced-resolve to miss tailwindcss in this project's node_modules.
//
// @tailwindcss/node exposes globalThis.__tw_resolve as an intentional escape
// hatch (checked first in its St() resolver function). We use it here to pin
// the tailwindcss CSS entry point to the absolute path in *this* project's
// node_modules, bypassing the broken workspace-root resolution entirely.
//
// NOTE: import.meta.url resolves to a path inside .next/ when Turbopack
// evaluates this file, so we use process.cwd() which is always the project root.
//
// We avoid a static `import … from "@tailwindcss/postcss"` because that would
// cause Turbopack to statically bundle the entire chain including lightningcss's
// native .node binary, which it cannot resolve.
if (typeof globalThis.__tw_resolve !== "function") {
  const tailwindEntry = path.resolve(process.cwd(), "node_modules/tailwindcss/index.css");
  globalThis.__tw_resolve = (request) => {
    if (request === "tailwindcss") return tailwindEntry;
    return null;
  };
}

export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
