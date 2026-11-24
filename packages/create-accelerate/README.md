# @accelerate/create-accelerate

Noninteractive project generator with Node, React and Angular starter templates, registry-based dependency resolution, dry-run and overwrite protection.

```sh
npx @accelerate/create-accelerate my-app --template react --packages config-react --dry-run
npx @accelerate/create-accelerate my-app --template react --packages config-react
```

Use --list to discover implemented packages or --catalog to supply a newer registry snapshot. The bundled catalog reflects the build-time repository. Known unpublished entries are rejected; unknown publication status is not verified. The CLI generates dependency manifests but does not execute installation. Run npm install yourself after verifying publication. Starter CI and smoke tests are included; framework template builds require separate verification.
