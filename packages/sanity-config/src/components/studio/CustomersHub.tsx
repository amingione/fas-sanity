import React, {useMemo, useState} from 'react'
import {Button, Card, Flex, Menu, MenuButton, MenuDivider, MenuItem, Stack, Text} from '@sanity/ui'
import {useRouter} from 'sanity/router'

import CustomerDashboard from './CustomerDashboard'
import QuotesDashboard from './QuotesDashboard'

type CustomerTab = 'overview' | 'quotes'

const tabs: Array<{id: CustomerTab; label: string; description: string}> = [
  {id: 'overview', label: 'Overview', description: 'Recent activity, top customers, and quick actions.'},
  {id: 'quotes', label: 'Quotes', description: 'Manage estimates, send proposals, and convert wins into invoices.'},
]

const CustomersHub = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>('overview')
  const router = useRouter()

  const activeMeta = tabs.find((tab) => tab.id === activeTab)

  const quickMenus = useMemo(
    () => [
      {
        id: 'customers',
        title: 'Customer records',
        description: 'Jump to the customer collection or add a new contact.',
        actions: [
          {title: 'Browse customers', intent: 'type' as const, params: {type: 'customer'}},
          {title: 'Create customer', intent: 'create' as const, params: {type: 'customer'}},
        ],
      },
      {
        id: 'orders',
        title: 'Orders & quotes',
        description: 'Keep tabs on active sales conversations.',
        actions: [
          {title: 'View orders', intent: 'type' as const, params: {type: 'order'}},
          {title: 'View quotes', intent: 'type' as const, params: {type: 'quote'}},
        ],
      },
      {
        id: 'invoices',
        title: 'Billing',
        description: 'Head to invoicing tools when you need them.',
        actions: [
          {title: 'Browse invoices', intent: 'type' as const, params: {type: 'invoice'}},
          {title: 'Create invoice', intent: 'create' as const, params: {type: 'invoice'}},
        ],
      },
    ],
    [],
  )

  const handleIntent = (intent: 'type' | 'create' | 'edit', params: Record<string, unknown>) => {
    router.navigateIntent(intent, params as any)
  }

  return (
    <div ref={ref} className="studio-page">
      <header className="studio-header">
        <div className="studio-header__inner">
          <div className="studio-header__titles">
            <h1 className="studio-header__title">Customer Hub</h1>
            <p className="studio-header__description">{activeMeta?.description}</p>
          </div>
          <nav className="studio-tablist" role="tablist" aria-label="Customer workspaces">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`studio-tablist__button${isActive ? ' studio-tablist__button--active' : ''}`}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
        <Card padding={[3, 4]} radius={3} shadow={1} tone="transparent" className="mt-6 w-full">
          <Flex direction={['column', 'row']} gap={3} wrap="wrap">
            {quickMenus.map((menu) => (
              <Card key={menu.id} padding={3} radius={2} shadow={1} tone="transparent" style={{minWidth: 220}}>
                <Stack space={3}>
                  <Stack space={2}>
                    <Text size={2} weight="semibold">
                      {menu.title}
                    </Text>
                    <Text muted size={1} style={{minHeight: '2.5em'}}>
                      {menu.description}
                    </Text>
                  </Stack>
                  <MenuButton
                    id={`customers-hub-menu-${menu.id}`}
                    popover={{portal: true}}
                    placement="right"
                    button={<Button mode="ghost" text="Quick actions" />}
                    menu={
                      <Menu>
                        {menu.actions.map((action, index) => (
                          <MenuItem
                            key={`${menu.id}-${index}`}
                            text={action.title}
                            onClick={() => handleIntent(action.intent, action.params)}
                          />
                        ))}
                        <MenuDivider />
                        <MenuItem text="Open customer hub" onClick={() => setActiveTab('overview')} />
                      </Menu>
                    }
                  />
                </Stack>
              </Card>
            ))}
          </Flex>
        </Card>
      </header>

      <main className="studio-content">
        {activeTab === 'overview' ? <CustomerDashboard /> : <QuotesDashboard />}
      </main>
    </div>
  )
})

CustomersHub.displayName = 'CustomersHub'

export default CustomersHub
