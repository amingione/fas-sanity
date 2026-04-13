# Alt Text Input Integration Guide

Use the following steps to enable the custom alt text generator inside the existing `altText` schema. The schema itself does not need structural changes—only the `text` field's input component is extended.

1. **Import the component at the top of `altText.ts`:**
   ```ts
   import AltTextInput from '../components/AltTextInput'
   ```

   Adjust the relative path if your schema directory differs from the default `schemas` folder.

2. **Attach the component to the `text` field using the `components` property:**
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

3. **Restart Sanity Studio (if running) to load the new input.**

Once applied, editors can open the generator, paste product details, and insert concise alt text suggestions directly into the field.
