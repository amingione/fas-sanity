# Configure content mapping for Canvas

Connecting Canvas to Sanity Studio requires a little bit of Studio configuration and a quick deployment so Canvas can read your schemas. Once the setup is complete, writers can open the **Studio** panel in Canvas and map their freeform documents to structured content types in your workspace.

## Prerequisites

- A Studio running Sanity v3.88.1 or later. (Canvas depends on the schema manifest that ships with modern Studio builds.)
- A deployed Studio with public access to its manifest files. See [Set up and configure Dashboard](../dashboard-setup.md) if you need a refresher on Studio deployments.
- The Canvas app enabled for your organization in the [Sanity Dashboard](https://www.sanity.io/welcome).

## 1. Enable Canvas in your Studio config

Canvas discovers your workspace through the Studio manifest. Make sure the Canvas app is enabled in `sanity.config.ts` before you redeploy:

```ts
// sanity.config.ts
export default defineConfig({
  // …other settings…
  apps: {
    canvas: {
      enabled: true,
      fallbackStudioOrigin: process.env.SANITY_STUDIO_CANVAS_FALLBACK_ORIGIN || undefined,
    },
  },
})
```

If you use multiple environments, set `SANITY_STUDIO_CANVAS_FALLBACK_ORIGIN` to a deployed Studio URL so Canvas knows where to open documents when a workspace has not yet been fully integrated.

## 2. Deploy a schema manifest Canvas can read

Canvas reads your content model from the same manifest that powers the Sanity Dashboard. Deploy the manifest any time you ship schema changes:

- **Sanity-hosted Studio** – run `npx sanity deploy`.
- **Self-hosted Studio** – run `npx sanity schema deploy` and serve the resulting files from `<studio-url>/static/create-manifest.json`.
- **Embedded Studio (Next.js, Remix, etc.)** – run `npx sanity manifest extract --path public/studio/static` followed by `npx sanity schema deploy`.

After deployment, confirm that the manifest URL is publicly reachable. Canvas cannot list document types until it can fetch this file.

## 3. Allow Canvas to use your dataset

1. Open the [Sanity Dashboard](https://www.sanity.io/welcome) and switch to the **Canvas** tab.
2. Choose the Studio deployment you want to connect.
3. Pick the dataset(s) Canvas should read and grant access.
4. Optional: restrict which document types appear in Canvas by toggling them off in the Canvas settings panel.

It may take a minute for the access changes to propagate. Once they do, the Studio dropdown inside Canvas lists your workspace and any document types marked as available.

## 4. Connect a Canvas document

Editors can now map content without leaving Canvas:

1. Open a Canvas document and click **Studio** in the top-right corner.
2. Select your Studio deployment, workspace, and target document type.
3. Click **Connect and start mapping →** and follow the minimap to map fields.
4. When you are satisfied, click **+ Link to new studio document** to create the linked record.

Mappings sync automatically whenever the Canvas document is saved. If you later unlink the document from Canvas, the Studio record becomes editable directly inside Studio.

## Troubleshooting

- **Studio not listed in Canvas?** Double-check that the manifest URL is reachable and that the Canvas app has been granted access to the dataset.
- **Missing document types?** Confirm the Studio was redeployed after you added new schema types and that they remain enabled in the Canvas settings panel.
- **Mapping status stuck?** Reload the Canvas document after redeploying the Studio to pick up schema changes, or clear and reapply the connection from the Studio panel.

With these steps in place your writers can draft in Canvas while your structured content stays in sync with Sanity Studio.
