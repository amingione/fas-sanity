import React, {useState} from 'react'

import OrdersDashboard from './OrdersDashboard'
import InvoiceDashboard from './InvoiceDashboard'

type SalesTab = 'orders' | 'invoices'

const tabs: Array<{id: SalesTab; label: string}> = [
  {id: 'orders', label: 'Orders'},
  {id: 'invoices', label: 'Invoices'},
]

const SalesHub = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const [activeTab, setActiveTab] = useState<SalesTab>('orders')

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Sales &amp; Get Paid</h1>
            <p className="text-sm text-slate-500">
              Manage orders, invoices, and in-person payments from one workspace.
            </p>
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
        {activeTab === 'orders' ? (
          <OrdersDashboard />
        ) : (
          <InvoiceDashboard />
        )}
      </main>
    </div>
  )
})

SalesHub.displayName = 'SalesHub'

export default SalesHub
