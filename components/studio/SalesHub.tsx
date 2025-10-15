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
    <div ref={ref} className="studio-page">
      <header className="studio-header">
        <div className="studio-header__inner">
          <div className="studio-header__titles">
            <h1 className="studio-header__title">Sales &amp; Get Paid</h1>
            <p className="studio-header__description">
              Manage orders, invoices, and in-person payments from one workspace.
            </p>
          </div>
          <nav className="studio-tablist" role="tablist" aria-label="Sales workspaces">
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
        {activeTab === 'orders' ? <OrdersDashboard /> : <InvoiceDashboard />}
      </main>
    </div>
  )
})

SalesHub.displayName = 'SalesHub'

export default SalesHub
