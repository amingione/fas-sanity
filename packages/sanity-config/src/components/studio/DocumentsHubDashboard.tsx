import React, {useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Badge, Box, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {FolderIcon} from '@sanity/icons'

interface Category {
  _id: string
  slug?: {current?: string}
  title: string
  description?: string
  icon?: string
  color?: string
  docCount: number
}

interface HubStats {
  total: number
  internal: number
  public: number
  admin: number
}

const API_VERSION = '2024-10-01'

export default function DocumentsHubDashboard() {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [stats, setStats] = useState<HubStats>({total: 0, internal: 0, public: 0, admin: 0})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [cats, statData] = await Promise.all([
        client.fetch(
          `
            *[_type == "internalDocCategory" && active == true] | order(order asc) {
              _id,
              slug,
              title,
              description,
              icon,
              color,
              "docCount": count(*[_type == "downloadResource" && internalCategory._ref == ^._id])
            }
          `,
        ),
        client.fetch(`{
            "total": count(*[_type == "downloadResource"]),
            "internal": count(*[_type == "downloadResource" && accessLevel == "internal"]),
            "public": count(*[_type == "downloadResource" && accessLevel == "public"]),
            "admin": count(*[_type == "downloadResource" && accessLevel == "admin"])
          }`),
      ])
      setCategories(cats)
      setStats(statData)
      setLoading(false)
    }

    void fetchData()
  }, [client])

  const CATEGORY_PATHS: Record<string, string> = {
    technical: '/desk/documents-hub;hub-category-technical-docs',
    operations: '/desk/documents-hub;hub-category-operations-docs',
    marketing: '/desk/documents-hub;hub-category-marketing-docs',
    legal: '/desk/documents-hub;hub-category-legal-docs',
    templates: '/desk/documents-hub;hub-category-templates-docs',
    integration: '/desk/documents-hub;hub-category-integration-docs',
  }

  const handleCategoryClick = (slug?: string) => {
    if (!slug) return
    const path = CATEGORY_PATHS[slug]
    if (!path) return

    if (router.navigateUrl) {
      router.navigateUrl({path})
      return
    }

    if (typeof window !== 'undefined') {
      window.location.hash = `#${path}`
    }
  }

  if (loading) {
    return (
      <Box padding={6}>
        <Text muted>Loading Documents Hub...</Text>
      </Box>
    )
  }

  return (
    <Box padding={5}>
      <Stack space={4} marginBottom={6}>
        <Flex align="center" gap={3}>
          <FolderIcon style={{fontSize: 28}} />
          <Heading size={3}>Internal Documents Hub</Heading>
        </Flex>
        <Text muted size={1}>
          Internal knowledge base, separate from blog content.
        </Text>

        <Flex gap={3} wrap="wrap">
          <Card padding={3} radius={2} tone="default" border>
            <Stack space={1}>
              <Text size={0} muted>
                Total Documents
              </Text>
              <Text size={3} weight="bold">
                {stats.total}
              </Text>
            </Stack>
          </Card>
          <Card padding={3} radius={2} tone="caution" border>
            <Stack space={1}>
              <Text size={0} muted>
                Internal
              </Text>
              <Text size={3} weight="bold">
                {stats.internal}
              </Text>
            </Stack>
          </Card>
          <Card padding={3} radius={2} tone="positive" border>
            <Stack space={1}>
              <Text size={0} muted>
                Public
              </Text>
              <Text size={3} weight="bold">
                {stats.public}
              </Text>
            </Stack>
          </Card>
          <Card padding={3} radius={2} tone="critical" border>
            <Stack space={1}>
              <Text size={0} muted>
                Admin Only
              </Text>
              <Text size={3} weight="bold">
                {stats.admin}
              </Text>
            </Stack>
          </Card>
        </Flex>
      </Stack>

      {categories.length === 0 ? (
        <Card padding={5} radius={2} border tone="default">
          <Stack space={3} style={{textAlign: 'center'}}>
            <Text muted>No categories yet. Create your first Internal Doc Category to begin.</Text>
          </Stack>
        </Card>
      ) : (
        <Grid columns={[1, 2, 3]} gap={4}>
          {categories.map((cat) => (
            <Card
              key={cat._id}
              as="button"
              padding={4}
              radius={3}
              border
              tone="default"
              onClick={() => handleCategoryClick(cat.slug?.current)}
              style={{
                borderLeft: cat.color ? `4px solid ${cat.color}` : '4px solid var(--card-border-color)',
                cursor: cat.slug?.current ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              <Stack space={3}>
                <Flex align="center" justify="space-between">
                  <Flex align="center" gap={2}>
                    {cat.icon && <Text size={3}>{cat.icon}</Text>}
                    <Text weight="semibold" size={2}>
                      {cat.title}
                    </Text>
                  </Flex>
                  <Badge tone={cat.docCount > 0 ? 'primary' : 'default'} padding={2} radius={2}>
                    {cat.docCount} docs
                  </Badge>
                </Flex>
                {cat.description && (
                  <Text size={1} muted>
                    {cat.description}
                  </Text>
                )}
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Box>
  )
}
