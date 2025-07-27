/**
 * Model used to create or update a TextMate language definition,
 * grouping various configurable components by category.
 */
export type TmLanguageCreateModel = {
    /**
     * Custom metadata annotations for the language definition.
     * Can be used to attach arbitrary notes or markers.
     */
    annotations?: any;
    
    /**
     * Assertion rules to validate language constructs,
     * ensuring syntax or semantics meet expected conditions.
     */
    assertions?: any;
    
    /**
     * Attribute definitions that describe properties
     * available on tokens or grammar elements.
     */
    attributes?: any;
    
    /**
     * Locator patterns used to identify or reference
     * specific parts of the language (e.g., scopes or regions).
     */
    locators?: any;
    
    /**
     * Macro definitions for reusable snippets or patterns
     * within the language grammar.
     */
    macros?: any;
    
    /**
     * Data models representing structured entities,
     * used by the language to define complex constructs.
     */
    models?: any;
    
    /**
     * Operator definitions for expressions and computations,
     * specifying precedence and symbol mappings.
     */
    operators?: any;
    
    /**
     * Plugin extensions that augment or modify
     * the core language parsing/processing behavior.
     */
    plugins?: any;
    
    /**
     * Verb definitions specifying actions or commands
     * available in the language or tooling pipeline.
     */
    verbs?: any;
};
