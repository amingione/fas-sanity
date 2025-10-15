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
    <div ref={ref} className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Customer Hub</h1>
            <p className="text-sm text-slate-500">{activeMeta?.description}</p>
          </div>
          <nav className="flex rounded-full border border-slate-200 bg-slate-100 p-1 text-sm font-medium text-slate-600 shadow-sm">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-4 py-2 transition ${
                    isActive ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex flex-1 min-h-0 flex-col">
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
