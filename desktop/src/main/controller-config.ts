import yaml from 'js-yaml'

export interface ControllerConfig {
  secret: string
  externalUi: string
  externalUiName: string
}

export interface ControllerRuntime extends ControllerConfig {
  profileId: string
}

const DEFAULT_UI_URL =
  'https://github.com/Zephyruso/zashboard/releases/latest/download/dist-firasans-only.zip'

function stringField(doc: Record<string, unknown>, key: string): string {
  const value = doc[key]
  if (value == null) return ''
  // Do not trim, log or silently replace the user's credentials.
  if (typeof value !== 'string') throw new Error(`Config field ${key} must be a string`)
  return value
}

export function readControllerConfig(payload: string): ControllerConfig {
  let doc: unknown
  try {
    doc = yaml.load(payload)
  } catch {
    // YAML parser errors can include source snippets containing credentials.
    throw new Error('Cannot parse controller configuration')
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Controller configuration must be a YAML mapping')
  }
  const mapping = doc as Record<string, unknown>
  return {
    secret: stringField(mapping, 'secret'),
    externalUi: stringField(mapping, 'external-ui'),
    externalUiName: stringField(mapping, 'external-ui-name'),
  }
}

/** Keep the controller local, but never inject or replace the profile's secret. */
export function applyControllerDefaults(doc: Record<string, unknown>): void {
  stringField(doc, 'secret')
  doc['external-controller'] = '127.0.0.1:9090'
  if (!doc['external-ui']) doc['external-ui'] = 'ui'
  if (!doc['external-ui-url']) doc['external-ui-url'] = DEFAULT_UI_URL
}

export function controllerRequiresRestart(
  current: ControllerRuntime | null,
  profileId: string,
  next: ControllerConfig,
): boolean {
  return !current || current.profileId !== profileId || current.secret !== next.secret ||
    current.externalUi !== next.externalUi || current.externalUiName !== next.externalUiName
}

export function zashboardUrl(controller: ControllerConfig): string {
  const suffix = controller.externalUiName
    ? controller.externalUiName.split(/[\\/]/).map(encodeURIComponent).join('/') + '/'
    : ''
  const params = new URLSearchParams({
    protocol: 'http',
    hostname: '127.0.0.1',
    port: '9090',
    secret: controller.secret,
  })
  // Zashboard consumes setup parameters from the hash, not the HTTP query.
  return `http://127.0.0.1:9090/ui/${suffix}#/setup?${params}`
}
