import React, {useState} from 'react'

import CustomerDashboard from './CustomerDashboard'
import QuotesDashboard from './QuotesDashboard'
import BookingCalendar from './BookingCalendar'

type CustomerTab = 'overview' | 'quotes' | 'appointments'

const tabs: Array<{id: CustomerTab; label: string; description: string}> = [
  {id: 'overview', label: 'Overview', description: 'Recent activity, top customers, and quick actions.'},
  {id: 'quotes', label: 'Quotes', description: 'Manage estimates, send proposals, and convert wins into invoices.'},
  {id: 'appointments', label: 'Appointments', description: 'View and manage upcoming service bookings.'},
]

const CustomersHub = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>('overview')

  const activeMeta = tabs.find((tab) => tab.id === activeTab)

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
      </header>

      <main className="studio-content">
        {activeTab === 'overview' ? (
          <CustomerDashboard />
        ) : activeTab === 'quotes' ? (
          <QuotesDashboard />
        ) : (
          <BookingCalendar />
        )}
      </main>
    </div>
  )
})

CustomersHub.displayName = 'CustomersHub'

export default CustomersHub
