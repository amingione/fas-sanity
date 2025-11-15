export type KeyFeatureIconOption = {
  /** Unique identifier that the storefront icon map understands. */
  value: string
  /** Friendly label that helps merchandisers pick the right glyph. */
  title: string
  /** Optional helper copy rendered inside Studio only. */
  description?: string
}

/**
 * Shared dropdown options for product key feature icons.
 * Keep the list in sync with the storefront icon registry so editors
 * can only pick glyphs that actually render on the marketing site.
 */
export const KEY_FEATURE_ICON_OPTIONS: KeyFeatureIconOption[] = [
  {
    value: 'badge-performance',
    title: 'Performance badge',
    description: 'Use for overall horsepower or dyno-proven gains.',
  },
  {
    value: 'boost-gauge',
    title: 'Boost gauge',
    description: 'Great for airflow, pressure, or turbo/supercharger callouts.',
  },
  {
    value: 'turbo',
    title: 'Turbo impeller',
    description: 'Highlights forced-induction upgrades or larger wheels.',
  },
  {
    value: 'engine',
    title: 'Engine bay',
    description: 'Use for long-blocks, short-blocks, or rotating assemblies.',
  },
  {
    value: 'bolt',
    title: 'Bolt / quick install',
    description: 'Signals no-cut installs, bolt-on kits, or easy retrofits.',
  },
  {
    value: 'shield',
    title: 'Shield / reliability',
    description: 'Perfect for warranty, protection, or durability messaging.',
  },
  {
    value: 'speedometer',
    title: 'Speedometer',
    description: 'Use for top-speed, response time, or acceleration benefits.',
  },
  {
    value: 'fuel-system',
    title: 'Fuel system',
    description: 'Great for injectors, rails, pumps, or fueling improvements.',
  },
  {
    value: 'cooling',
    title: 'Cooling fins',
    description: 'Highlights intercoolers, radiators, or thermal efficiency.',
  },
  {
    value: 'weight',
    title: 'Feather / lightweight',
    description: 'Use when emphasizing weight savings or material changes.',
  },
  {
    value: 'trophy',
    title: 'Trophy / motorsport',
    description: 'Signals track-proven parts or race program pedigree.',
  },
  {
    value: 'package',
    title: 'Bundle / package',
    description: 'Ideal for kits that combine multiple upgrades together.',
  },
]

export const KEY_FEATURE_ICON_LOOKUP = new Map(
  KEY_FEATURE_ICON_OPTIONS.map((option) => [option.value, option]),
)

