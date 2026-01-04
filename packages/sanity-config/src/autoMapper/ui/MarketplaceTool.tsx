import {useEffect, useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Grid, Heading, Label, Select, Stack, Text, TextInput} from '@sanity/ui'
import {DownloadIcon, PackageIcon, SyncIcon} from '@sanity/icons'

type Pack = {
  name: string
  version: string
  description: string
  author: string
  category: string
  tags: string[]
  documentation: string
  license: string
  repository: string
  endpoints: string[]
}

type MarketplaceResponse = {
  packs: Pack[]
  meta: {
    total: number
    categories: string[]
    tags: string[]
  }
}

const defaultEndpoint =
  process.env.SANITY_STUDIO_MARKETPLACE_ENDPOINT ||
  '/.netlify/functions/marketplace'

export function MarketplaceTool() {
  const [endpoint] = useState(defaultEndpoint)
  const [packs, setPacks] = useState<Pack[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const fetchPacks = async () => {
      setLoading(true)
      setError(undefined)
      try {
        const url = new URL(endpoint, window.location.origin)
        if (search) url.searchParams.set('q', search)
        if (category) url.searchParams.set('category', category)
        if (tag) url.searchParams.set('tag', tag)
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Marketplace fetch failed: ${res.status}`)
        const payload = (await res.json()) as MarketplaceResponse
        setPacks(payload.packs || [])
        setCategories(payload.meta?.categories || [])
        setTags(payload.meta?.tags || [])
      } catch (err: any) {
        setError(err?.message || 'Unable to fetch marketplace')
      } finally {
        setLoading(false)
      }
    }
    fetchPacks()
  }, [endpoint, search, category, tag])

  const visiblePacks = useMemo(() => packs, [packs])

  const toggleInstall = (pack: Pack) => {
    setInstalled((prev) => {
      const next = new Set(prev)
      if (next.has(pack.name)) {
        next.delete(pack.name)
      } else {
        next.add(pack.name)
      }
      return next
    })
  }

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <PackageIcon />
        <Heading size={3}>Integration Marketplace</Heading>
      </Flex>
      <Card padding={3} radius={2} shadow={1}>
        <Grid columns={[1, 3]} gap={3}>
          <Stack space={2}>
            <Label size={1}>Search</Label>
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search packs..."
            />
          </Stack>
          <Stack space={2}>
            <Label size={1}>Category</Label>
            <Select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Stack>
          <Stack space={2}>
            <Label size={1}>Tag</Label>
            <Select value={tag} onChange={(e) => setTag(e.currentTarget.value)}>
              <option value="">All</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Stack>
        </Grid>
      </Card>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      <Grid columns={[1, 2]} gap={3}>
        {visiblePacks.map((pack) => {
          const isInstalled = installed.has(pack.name)
          return (
            <Card key={pack.name} padding={4} radius={2} shadow={1} tone="transparent">
              <Stack space={3}>
                <Flex justify="space-between" align="center">
                  <Text weight="bold">{pack.name}</Text>
                  <Badge tone={isInstalled ? 'positive' : 'default'}>
                    {isInstalled ? 'Installed' : `v${pack.version}`}
                  </Badge>
                </Flex>
                <Text size={1} muted>
                  {pack.description}
                </Text>
                <Flex gap={2} wrap="wrap">
                  <Badge tone="default">{pack.category}</Badge>
                  {pack.tags.slice(0, 3).map((t) => (
                    <Badge key={t} tone="primary">
                      {t}
                    </Badge>
                  ))}
                </Flex>
                <Flex gap={2} wrap="wrap">
                  <Button
                    text={isInstalled ? 'Uninstall' : 'Install'}
                    tone={isInstalled ? 'caution' : 'primary'}
                    icon={isInstalled ? SyncIcon : DownloadIcon}
                    onClick={() => toggleInstall(pack)}
                  />
                  {pack.documentation && (
                    <Button
                      as="a"
                      href={pack.documentation}
                      target="_blank"
                      rel="noreferrer"
                      text="Docs"
                      tone="default"
                      mode="ghost"
                    />
                  )}
                  {pack.repository && (
                    <Button
                      as="a"
                      href={pack.repository}
                      target="_blank"
                      rel="noreferrer"
                      text="Repo"
                      tone="default"
                      mode="ghost"
                    />
                  )}
                </Flex>
                <Box>
                  <Text size={1} muted>
                    Author: {pack.author}
                  </Text>
                  <Text size={1} muted>
                    Endpoints: {pack.endpoints.join(', ')}
                  </Text>
                </Box>
              </Stack>
            </Card>
          )
        })}
      </Grid>

      {loading && (
        <Card padding={3} radius={2} tone="transparent">
          <Flex gap={2} align="center">
            <SyncIcon />
            <Text>Loading marketplace...</Text>
          </Flex>
        </Card>
      )}

      {!loading && visiblePacks.length === 0 && (
        <Card padding={3} radius={2} tone="transparent">
          <Text>No packs found for this filter.</Text>
        </Card>
      )}
    </Stack>
  )
}
