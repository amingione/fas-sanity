import {useEffect, useMemo, useState} from 'react'
import {Badge, Card, Flex, Grid, Heading, Label, Select, Stack, Text, TextArea, Button} from '@sanity/ui'
import {WrenchIcon, CopyIcon} from '@sanity/icons'

type Snippet = {
  id: string
  name: string
  version: string
  description: string
  category: string
  code: string
}

type Payload = {snippets: Snippet[]}

const endpoint =
  process.env.SANITY_STUDIO_TRANSFORM_ENDPOINT ||
  process.env.VITE_SANITY_STUDIO_TRANSFORM_ENDPOINT ||
  '/.netlify/functions/transformation-library'

const categories = ['all', 'string', 'number', 'date']

export function TransformationLibraryTool() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [category, setCategory] = useState<string>('all')
  const [active, setActive] = useState<Snippet | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const fetchSnippets = async () => {
      setError(undefined)
      try {
        const url = new URL(endpoint, window.location.origin)
        if (category !== 'all') url.searchParams.set('category', category)
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Transform fetch failed: ${res.status}`)
        const payload = (await res.json()) as Payload
        setSnippets(payload.snippets || [])
        setActive(payload.snippets?.[0] || null)
      } catch (err: any) {
        setError(err?.message || 'Failed to load transformations')
      }
    }
    fetchSnippets()
  }, [category])

  const filtered = useMemo(() => snippets, [snippets])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <WrenchIcon />
        <Heading size={3}>Transformation Library</Heading>
      </Flex>

      <Card padding={3} radius={2} shadow={1}>
        <Grid columns={[1, 3]} gap={3}>
          <Stack space={2}>
            <Label size={1}>Category</Label>
            <Select value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Stack>
          <Stack space={2}>
            <Label size={1}>Snippets</Label>
            <Select
              value={active?.id || ''}
              onChange={(e) => {
                const next = filtered.find((s) => s.id === e.currentTarget.value)
                if (next) setActive(next)
              }}
            >
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Stack>
          <Stack space={2}>
            <Label size={1}>Version</Label>
            <Badge tone="default">{active?.version || '-'}</Badge>
          </Stack>
        </Grid>
      </Card>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {active ? (
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={2}>
            <Flex justify="space-between" align="center">
              <Text weight="bold">{active.name}</Text>
              <Badge tone="primary">{active.category}</Badge>
            </Flex>
            <Text size={1} muted>
              {active.description}
            </Text>
            <TextArea value={active.code} readOnly rows={10} spellCheck={false} />
            <Flex justify="flex-end">
              <Button
                text="Copy snippet"
                icon={CopyIcon}
                onClick={() => navigator.clipboard?.writeText(active.code)}
              />
            </Flex>
          </Stack>
        </Card>
      ) : (
        <Card padding={3} radius={2}>
          <Text>No snippet selected.</Text>
        </Card>
      )}
    </Stack>
  )
}
