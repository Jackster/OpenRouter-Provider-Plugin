import { readFile } from "node:fs/promises"
import { transformSolidSource } from "../node_modules/@opentui/solid/scripts/solid-transform.js"
import { build } from "esbuild"

await build({
  entryPoints: ["src/tui.tsx"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  external: ["@opencode/*", "@opentui/*", "solid-js", "solid-js/*"],
  outfile: "dist/tui.js",
  plugins: [{
    name: "opentui-solid",
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => ({
        contents: await transformSolidSource(await readFile(args.path, "utf8"), { filename: args.path }),
        loader: "js",
      }))
    },
  }],
})
