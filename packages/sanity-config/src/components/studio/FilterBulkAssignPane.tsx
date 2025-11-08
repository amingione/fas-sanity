import React, {useState} from 'react'

import FilterBulkAssign from './FilterBulkAssign'

const FilterBulkAssignPane = React.forwardRef<HTMLDivElement, Record<string, never>>(
  (_props, ref) => {
    const [tagInput, setTagInput] = useState('performance')
    const normalized = tagInput.trim()

    return (
      <div ref={ref} className="studio-page">
        <div className="studio-content">
          <div className="mx-auto w-full max-w-4xl">
            <header className="mb-6">
              <h1 className="text-lg font-semibold text-[var(--studio-text)]">
                Bulk Assign Products to Filter
              </h1>
              <p className="mt-2 text-sm text-[var(--studio-muted)]">
                Choose a filter tag and add it to multiple products at once.
              </p>
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.currentTarget.value)}
                  placeholder="Enter filter tag (e.g. wheels)"
                  className="w-full rounded-xl border border-[var(--studio-border-strong)] bg-[var(--studio-surface-strong)] px-4 py-2 text-sm text-[var(--studio-text)] shadow-sm transition focus:border-[var(--studio-accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.25)]"
                />
              </div>
            </header>
            {normalized ? (
              <FilterBulkAssign key={normalized} tag={normalized} />
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--studio-border-strong)] bg-[var(--studio-surface-soft)] px-4 py-8 text-center text-sm text-[var(--studio-muted)]">
                Enter a filter tag above to begin assigning products.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
)

FilterBulkAssignPane.displayName = 'FilterBulkAssignPane'

export default FilterBulkAssignPane
