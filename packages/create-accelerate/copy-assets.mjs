import {copyFileSync} from "node:fs";
copyFileSync(new URL("./src/cli.mjs",import.meta.url),new URL("./dist/cli.mjs",import.meta.url));
copyFileSync(new URL("../../registry/packages.json",import.meta.url),new URL("./dist/catalog.json",import.meta.url));
