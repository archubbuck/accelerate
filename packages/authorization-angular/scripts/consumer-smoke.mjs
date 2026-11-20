import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const cwd = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "accelerate-angular-consumer-"));
const run = (cmd, args, dir = temporary) => execFileSync(cmd, args, { cwd: dir, stdio: "inherit", timeout: 240000 });
try {
  // Generate a real Angular application, without a network-dependent CLI version lookup.
  const cli = resolve(cwd, "node_modules/.bin/ng");
  run(cli, ["new", "consumer", "--defaults", "--skip-git", "--skip-install", "--style=css", "--routing=false", "--standalone=true", "--package-manager=npm"]);
  const app = join(temporary, "consumer");
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  // Install the actual npm tarball rather than a symlink to workspace output.
  const packed = execFileSync("npm", ["pack", "--json", "--pack-destination", temporary], { cwd: resolve(cwd, "dist"), encoding: "utf8" });
  const archive = JSON.parse(packed)[0];
  const tarball = archive?.filename;
  if (!tarball) throw new Error("npm pack did not return an Angular package tarball");
  const manifest = JSON.parse(readFileSync(join(cwd, "dist/package.json"), "utf8"));
  const exportedFiles = [manifest.exports?.["."]?.default, manifest.exports?.["."]?.types];
  const packedFiles = new Set((archive.files ?? []).map(file => file.path));
  for (const entry of exportedFiles) {
    if (typeof entry !== "string" || !packedFiles.has(entry.startsWith("./") ? entry.slice(2) : entry)) {
      throw new Error(`Angular package export missing from npm tarball: ${entry}`);
    }
  }
  pkg.dependencies["@accelerate/authorization-angular"] = `file:${join(temporary, tarball)}`;
  writeFileSync(join(app, "package.json"), JSON.stringify(pkg, null, 2));
  run("npm", ["install", "--no-audit", "--no-fund"], app);
  const source = join(app, "src/app/app.component.ts");
  writeFileSync(source, `import { Component, inject } from '@angular/core';
import { AuthCanDirective, AuthorizationService } from '@accelerate/authorization-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AuthCanDirective],
  template: \`<span *authCan="'documents.read'">Authorized</span>\`
})
export class AppComponent {
  readonly auth = inject(AuthorizationService);
}
`);
  const configFile = join(app, "src/app/app.config.ts");
  const originalConfig = readFileSync(configFile, "utf8");
  if (!originalConfig.includes("providers: [")) throw new Error("Angular application config shape changed");
  const configured = originalConfig.replace("providers: [", "providers: [provideAuthorization({ loader: async () => ({ userId: 'demo', roles: ['reader'], permissions: ['documents.read'] }) }), ");
  writeFileSync(configFile, "import { provideAuthorization } from '@accelerate/authorization-angular';" + String.fromCharCode(10) + configured);
  run("npm", ["run", "build", "--", "--configuration", "production"], app);
  console.log("Angular consumer production build succeeded");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
