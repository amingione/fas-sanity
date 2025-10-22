# Set up and configure Dashboard

## Set up your content operations dashboard

> [!TIP]
> Find your dashboard
> To find your organization dashboard, visit [www.sanity.io/welcome](https://www.sanity.io/welcome)!

The Sanity Dashboard is the hub for your organization's content operations. Here you'll find your deployed studios, custom apps, and official Sanity apps like [Canvas](/docs/canvas) or [Media Library](/docs/media-library).

![The Sanity Dashboard home page](https://cdn.sanity.io/images/3do82whm/next/acb30da7d5120de7fa8c38ad8fd71235098d76b2-1256x965.png)

Your dashboard is centered around your organization, and gives access to all deployed studios and apps within the organization, across projects and datasets.

> [!NOTE]
> Dashboard plugin
> As the keen reader may have observed, there is already a "dashboard" in the Sanity ecosystem, namely the official [dashboard plugin](/docs/studio/dashboard) for Sanity Studio. This plugin will continue to be available for your intra-studio dashboard needs.

## Disable dashboard

You can disable the dashboard for your organization by navigating to the organization in [Sanity Manage](https://www.sanity.io/manage).

![Screenshot of the manage settings screen.](https://cdn.sanity.io/images/3do82whm/next/0d5bc2581522298518ade2793794c8bf25906b1a-2572x1130.png)

From your organization's manage page:

1. Select the "**Settings**" tab.
2. Toggle the "**Dashboard is enabled**" switch to disable the dashboard.

This setting affects all users in your organization.

## Configure your studios

![a computer screen shows a list of movies including galaxy quest](https://cdn.sanity.io/images/3do82whm/next/2c70c211650d4f8368bafef8c24eabbbdebb959e-1250x920.png)

For almost everyone: Your pre-dashboard studios will automatically work as before, with all your customization intact. To fully enjoy the benefits of the integrated dashboard, a studio deployment is required. Depending on your setup, this process will differ slightly.

### Requirements

Dashboard should work with studios going all the way back to v2.28.0 (shoutout to OGs still running v2), but for the best experience we heartily recommend [upgrading](/docs/studio/upgrade) to `@latest`.

- Studio version must be:
  - At least >= `v2.28.0`
  - Preferably >= `v3.88.1`
  - Ideally `@latest`

- Schema and manifest files must be extracted and made available. For a detailed look at how schema deployment works, visit [this article](/docs/apis-and-sdks/schema-deployment).
- Self-hosted and embedded studios must also define the canonical studio URL in the [project management settings](https://sanity.io/manage).
- For self-hosted and embedded studios that are not compiled using Sanity build tools (`sanity build` or `sanity deploy`), you'll also need to add a small bridge script to connect with the dashboard.

## Sanity-hosted studio

If you are using Sanity's hosting service, you get the most straightforward route. To set up your project to automatically generate the necessary schema and manifest files on every deployment, follow these steps:

- Make sure your project is [upgraded](/docs/studio/upgrade) to `v3.88.1` or later of Sanity Studio. `@latest` is always recommended!
- Deploy your studio by running the command `npx sanity deploy`.

The Sanity CLI will automatically build your studio and manifest files and deploy them to the configured host. The manifest file should be available at `<studioHost>.sanity.studio/static/create-manifest.json`

> [!TIP]
> Even auto-updating studios?
> Yes! Even if you are opted into [auto-updating studios](/docs/studio/latest-version-of-sanity), you still need to make a one-time manual deployment in order to fully integrate with the dashboard.
> Update your local studio to `sanity@latest`, then run `npx sanity deploy`.

## Self-hosted studio

If you are not using Sanity's hosting service, you will need to manually deploy your studio schema and make sure the resulting files are available at the expected location.

- Make sure your project is updated to `v3.88.1` or later of Sanity Studio. `@latest` is always recommended!
- Generate and deploy the schema and manifest files by running `npx sanity schema deploy`.
- Serve the manifest files over HTTP GET from `<custom-studio-url>/static/<manifest-file>` (see filenames above).
- You can control where the manifest will be stored in your project by using the `--manifest-dir` parameter. For example, to extract the files into `./dist/static` you'd run `npx sanity schema deploy --manifest-dir ./dist/static`
- Ensure the manifest files are publicly accessible on the internet without authentication.
- Add the studio URL in your [project management settings](https://sanity.io/manage).

#### Vercel

To self host your studio and schema files on Vercel, we recommend using the following configuration.

**vercel.json**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "sanity-v3",
  "buildCommand": "sanity build && sanity schema deploy --manifest-dir ./dist/static"
}
```

### Studio embedded in Next.js

For Next.js projects with embedded studios, you should follow the same steps as in the previous section, with a small change to how you generate the manifest files.

- Make sure your project is [upgraded](/docs/studio/upgrade) to `v3.88.1` or later of Sanity Studio. `@latest` is always recommended!
- Generate the manifest files running `npx sanity manifest extract`. You'll need to specify a `--path` for the generated files that corresponds to the path of your studio relative to the root of your Next.js project. E.g., `npx sanity manifest extract --path public/studio/static`
- Generate and deploy your schema by running `npx sanity schema deploy`.
- Next.js will handle serving your manifest over HTTP GET for Dashboard when you deploy your application.
- Add the studio URL in your [project management settings](https://sanity.io/manage). Make sure you include the full path to your studio. E.g., `https://cool-domain.com/admin`.
- Finally, add the dashboard bridge script to your studio route as shown in the next section, and deploy your project.

### Adding the bridge component

For self-hosted and embedded studios that are not compiled using `sanity build` or `sanity deploy`, or that rely on [next-sanity](https://github.com/sanity-io/next-sanity), you will also need to add a small script to enable the dashboard to properly interact with your studios.

**index.html**

```html
<script src="https://core.sanity-cdn.com/bridge.js" async type="module" />
```

Exactly where you should put the script will vary depending on your exact setup, but a generalized example might look as follows:

**./route/to/studio/layout.tsx**

```tsx
import {preloadModule} from 'react-dom'

const bridgeScript = 'https://core.sanity-cdn.com/bridge.js'

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  preloadModule(bridgeScript, {as: 'script'})
  return (
    <>
      <script src={bridgeScript} async type="module" />
      {children}
    </>
  )
}
```

## Add a token for CI/CD pipelines

If you deploy your studio as part of an automated workflow, you will need to add a deploy token to your project in the Sanity project management settings and include a schema deployment step with the following command:

**Terminal**

```sh
SANITY_AUTH_TOKEN=<deploy_token> npx sanity schema deploy
```

A deploy token can be obtained by navigating to the API section of your [project management dashboard](https://sanity.io/manage).

#### Next steps

[Canvas](/docs/canvas)

[Media Library](/docs/media-library)

[Studio](/docs/studio)

[App SDK](/docs/app-sdk)
