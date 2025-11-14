# Alt Text Input Integration Guide

Use the following steps to enable the auto-generation button inside the existing `altText` schema. The schema itself does not need structural changes—only the `text` field's input component is extended.

1. **Create the component in `schemaTypes/components/AltTextInput.tsx`.**
   The component renders the default string input and adds the "🤖 Generate from Product" button that fetches the related product, extracts keywords, and populates the field when possible. Save the provided file in `schemaTypes/components` so that the relative import below resolves correctly.

2. **Import the component at the top of `altText.ts`:**
   ```ts
   import AltTextInput from '../components/AltTextInput'
   ```

   Adjust the relative path if your schema directory differs from the default `schemas` folder.

3. **Attach the component to the `text` field using the `components` property:**
   ```ts
   defineField({
     name: 'text',
     title: 'Alternative Text',
     type: 'string',
     description:
       'The actual alt text string for accessibility and SEO (e.g., "FAS Motorsports 6.7L Powerstroke High-Flow Piping Kit installed in a 2022 Ford F-250 engine bay.")',
     validation: (Rule) =>
       Rule.required()
         .min(10)
         .max(125)
       .warning('Alt text should be descriptive (10-125 characters recommended).'),
     components: {
       input: AltTextInput,
     },
   })
   ```

4. **Restart Sanity Studio (if running) to load the new input.**

## Testing tips

1. Open Sanity Studio and edit an Alt Text document that is referenced from a product.
2. Click **🤖 Generate from Product**. If a related product with `title` and `description` exists, the component will fill in a generated alt text string while showing a confirmation message.
3. If no related product is found, or if the content is insufficient, the component displays an inline error message so editors can adjust manually.
