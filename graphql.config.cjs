const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
const token =
  process.env.SANITY_GRAPHQL_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  ''

const schemaUrl = `https://${projectId}.api.sanity.io/v1/graphql/${dataset}/default`

module.exports = {
  schema: token
    ? [
        {
          [schemaUrl]: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        },
      ]
    : schemaUrl,
  documents: ['**/*.{graphql,gql}'],
}
