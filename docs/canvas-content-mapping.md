# Content mapping for Canvas

> [!WARNING]
> **Experimental feature**
> Content mapping is currently experimental. APIs and behavior may change, and documentation may lag behind the latest release.

Canvas is excellent for freeform writing, but when you're ready to operationalize that content you can link it to Sanity Studio and benefit from structured content. Content mapping connects rich Canvas documents to Studio document types so that content can flow into the rest of your system.

> [!WARNING]
> **Gotcha**
> A studio maintainer must perform some initial setup before content mapping can work. See the guide on [configuring content mapping](/docs/canvas/configure-content-mapping).

For example, you might draft a blog post in Canvas and then map it to a new Studio document of type `blogPost` with fields such as `title`, `excerpt`, `body`, and `tags`. A background "bot" analyzes the Canvas document, matches blocks of content to fields, and applies the mapping automatically—subject to any overrides you make.

You can label parts of the Canvas document as **context** so the bot ignores notes-to-self and other non-content. Context can also include hints like `// slug: my-cool-post` or `!! title below`. The bot uses these cues to decide what to treat as content, and you can correct anything it gets wrong.

![A side-by-side view of Canvas and the Studio form](https://cdn.sanity.io/images/3do82whm/next/12a7a0278863030e0037ae130977b58feaf2ae27-5348x3516.png)

## Get started

### Locate your project in the Studio panel

1. In Canvas, click the **Studio** button in the upper-right corner (or the schema icon on smaller screens).
2. A **Studio** panel opens. Select your studio deployment, workspace, and the document type you want to map to.

> [!WARNING]
> **Gotcha**
> If no projects appear in the dropdown, ask a studio maintainer to [enable content mapping in Sanity Studio](/docs/canvas/configure-content-mapping).

### Select and apply a document type

1. Click **Connect and start mapping →**.
2. The Studio panel displays a minimap of the selected document type. Use the arrows to expand nested fields.
3. Watch the status indicator in the lower-right corner to see mapping progress as the bot runs in the background.

![A mapped document with the Studio panel open](https://cdn.sanity.io/images/3do82whm/next/db2f76b43ac5950a1f1613979bf103893ed50747-2674x1758.png)

## Explore the Studio panel

As content is mapped, the minimap fills with field values and changes color to reflect mapping status.

![A mapped document with the Studio panel open, with all fields unfurled](https://cdn.sanity.io/images/3do82whm/next/5c2ad5fd6ae5911c1c59a92c4e9c7c3f5935853e-2674x1758.png)

### Mapping colors

![Green – Automatically mapped. Gray – Treated as context. Yellow – Manually mapped. Black / white – Not yet analyzed.](https://cdn.sanity.io/images/3do82whm/next/c165edd6bd1216f399d6a998f6377747e4b3e64b-2800x1078.png)

- **Green** – Automatically mapped content or fields.
- **Gray** – Content treated as context.
- **Yellow** – Manual mappings created by an editor.
- **Black/white** – Content that the bot has not yet analyzed.

### Adjust the results

Automatic mapping is usually accurate, but you can make adjustments directly in Canvas:

- Click a content block and choose **Map to field…** to connect it to a Studio field. Canvas focuses the Studio panel so you can pick the target field. Manual mappings appear in yellow.
- To unmap content, click **Clear mapping**. Unless you mark it as context, the bot will try to remap it on the next pass.
- Select sentences or phrases for even more granular mappings.
- Leave contextual hints (for example, headings or inline notes) to guide the bot. See [content mapping tips and tricks](#content-mapping-tips-and-tricks) for examples.

![Selecting custom field mapping mode in the Studio panel](https://cdn.sanity.io/images/3do82whm/next/73d809751a129e01dd1cbc3fa354a648a5bd5352-2674x1758.png)

## Link to a new Studio document

> [!TIP]
> **Protip**
> This guide maps content first, then creates the Studio document. You can reverse that order if it fits your workflow better.

When you are satisfied with the mappings:

1. Click **+ Link to new studio document** at the top of the Studio panel.
2. Confirm the success message. The button label changes to **Linked document**.
3. Click **Linked document** to open the Studio with the new document selected. The document is read-only while linked to Canvas.

![A view of the Studio once it has been linked to Canvas](https://cdn.sanity.io/images/3do82whm/next/930f33274d3a4b467219a8f98ebdcaca8a8c7bba-2674x1758.png)

Any edits you make in Canvas will sync to the linked Studio document automatically.

### Unlink to edit in Studio

Canvas acts as the source of truth while the link persists. To edit directly in Sanity Studio:

1. Open the contextual menu next to **Publish** and click **Unlink**.
2. Confirm the dialog. The Studio document becomes editable and no longer syncs with Canvas.

![The document context menu showing how to unlink a document from Canvas](https://cdn.sanity.io/images/3do82whm/next/4cce0bd87287bbac6d05eecb23608c4a79b1b3e1-817x677.png)

> [!TIP]
> **Protip**
> Unlinking does not delete your content. You can keep working in Canvas, but further changes will not sync to Studio.

## Content mapping tips and tricks

- **Procedural discovery** – The bot processes content sequentially and may make multiple passes. Adding hints above a block can prompt it to reconsider mappings.
- **Provide context** – Mark words, lines, or entire blocks as context so the bot treats them as notes. Inline hints like `slug: my-cool-slug` or `[description below]` can also steer the mapping.

![Examples of using context and hints for better mapping](https://cdn.sanity.io/images/3do82whm/next/a8c1ee0678d7b9ede0c2007dd05a3fff99ef693b-2800x1078.png)

## Troubleshooting

### Can't find your project?

Ensure the studio is [configured properly](/docs/canvas/configure-content-mapping) and deployed with content mapping enabled.

### Missing document types or fields?

Verify that the document types and fields you expect are not excluded from content mapping and redeploy the studio if necessary.

### Bot making too many mistakes?

Give it more context:

- Inline instructions such as `slug: my-cool-slug` for simple fields.
- Headings or notes that label sections.
- Plain-language notes like `Note: Use this part for description`.
- Manual adjustments when needed.

### Unable to map the Canvas document title?

Mapping the Canvas document title is not yet supported due to technical limitations, but it is planned for a future update.
