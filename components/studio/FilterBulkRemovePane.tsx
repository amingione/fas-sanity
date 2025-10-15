import React, {useState} from 'react'

import FilterBulkRemove from './FilterBulkRemove'

const FilterBulkRemovePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const [tagInput, setTagInput] = useState('performance')
  const normalized = tagInput.trim()

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Bulk Remove Filter From Products</h1>
          <p className="mt-2 text-sm text-slate-500">
            Remove an existing filter tag from multiple products in one pass.
          </p>
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.currentTarget.value)}
              placeholder="Enter filter tag (e.g. wheels)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </header>
        {normalized ? (
          <FilterBulkRemove key={normalized} tag={normalized} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Enter a filter tag above to load matching products.
          </div>
        )}
      </div>
    </div>
  )
})

FilterBulkRemovePane.displayName = 'FilterBulkRemovePane'

export default FilterBulkRemovePane
