import {useEffect, useState} from 'react'
import {Card, Flex, Heading, Stack, Text, TextArea, Badge, Avatar, Box, Button} from '@sanity/ui'
import {useClient} from 'sanity'
import {UsersIcon, CommentIcon, PublishIcon} from '@sanity/icons'

type Presence = {userId: string; name: string; avatar?: string; status: 'viewing' | 'editing'}
type Comment = {id: string; author: string; text: string; createdAt: string; resolved?: boolean}

const mockPresence: Presence[] = [
  {userId: 'u1', name: 'Alex', status: 'editing'},
  {userId: 'u2', name: 'Riley', status: 'viewing'},
]

const mockComments: Comment[] = [
  {id: 'c1', author: 'Alex', text: 'Consider mapping price to unit_amount', createdAt: new Date().toISOString()},
  {id: 'c2', author: 'Riley', text: 'Need approval on shipping address transform', createdAt: new Date().toISOString()},
]

export function CollaborativeEditorTool() {
  const client = useClient({apiVersion: '2024-10-01'})
  const [draft, setDraft] = useState('// Collaborative mapping notes')
  const [presence, setPresence] = useState<Presence[]>(mockPresence)
  const [comments, setComments] = useState<Comment[]>(mockComments)

  useEffect(() => {
    // Future: subscribe to presence channel via WS/CRDT
    setPresence(mockPresence)
    setComments(mockComments)
  }, [client])

  const addComment = () => {
    setComments((prev) => [
      ...prev,
      {
        id: `c-${prev.length + 1}`,
        author: 'You',
        text: 'New comment',
        createdAt: new Date().toISOString(),
      },
    ])
  }

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <UsersIcon />
        <Heading size={3}>Collaborative Editor (preview)</Heading>
      </Flex>

      <Card padding={3} radius={2} shadow={1}>
        <Flex gap={2} wrap="wrap">
          {presence.map((user) => (
            <Flex key={user.userId} align="center" gap={2}>
              <Avatar size={2} src={user.avatar} alt={user.name} />
              <Badge tone={user.status === 'editing' ? 'primary' : 'default'}>
                {user.name} — {user.status}
              </Badge>
            </Flex>
          ))}
        </Flex>
      </Card>

      <Card padding={3} radius={2} shadow={1}>
        <Stack space={3}>
          <Text weight="semibold">Shared mapping draft</Text>
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            rows={8}
            spellCheck={false}
          />
          <Flex gap={2} justify="flex-end">
            <Button icon={PublishIcon} text="Propose changes" tone="primary" disabled />
          </Flex>
        </Stack>
      </Card>

      <Card padding={3} radius={2} shadow={1}>
        <Stack space={3}>
          <Flex align="center" gap={2}>
            <CommentIcon />
            <Text weight="semibold">Comments</Text>
          </Flex>
          <Stack space={2}>
            {comments.map((c) => (
              <Card key={c.id} padding={2} radius={2} tone={c.resolved ? 'positive' : 'transparent'}>
                <Flex justify="space-between" align="center">
                  <Text size={1} weight="semibold">
                    {c.author}
                  </Text>
                  <Badge tone={c.resolved ? 'positive' : 'default'}>
                    {c.resolved ? 'Resolved' : new Date(c.createdAt).toLocaleTimeString()}
                  </Badge>
                </Flex>
                <Box marginTop={1}>
                  <Text size={1}>{c.text}</Text>
                </Box>
              </Card>
            ))}
            <Button text="Add comment" onClick={addComment} tone="primary" />
          </Stack>
        </Stack>
      </Card>
    </Stack>
  )
}
