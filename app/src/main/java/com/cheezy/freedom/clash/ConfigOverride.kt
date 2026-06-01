package com.cheezy.freedom.clash

/**
 * A reusable patch that can be applied on top of the provider's downloaded
 * config (base.yaml) to produce the effective config.yaml that mihomo loads.
 *
 * Implementations are stateless singletons (typically `object`s). They mutate
 * the parsed map in place. Replacement-vs-merge semantics are decided per
 * override — there is no global policy.
 */
interface ConfigOverride {
    /** Stable identifier; used as a SharedPreferences key. */
    val id: String

    /** Mutates the YAML map: adds, replaces or removes keys as needed. */
    fun apply(yaml: MutableMap<String, Any?>)

    /**
     * Returns true when the provider's base.yaml already satisfies what this
     * override would do, so the UI should disable the corresponding switch
     * and inform the user that the provider is in control.
     */
    fun isForcedByBase(baseYaml: Map<String, Any?>): Boolean = false
}
