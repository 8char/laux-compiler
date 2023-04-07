export const VISITOR_KEYS = {};
export const BUILDER_KEYS = {};
export const ALIAS_KEYS = {};

export default function defineType(type, opts = {}) {
  VISITOR_KEYS[type] = opts.visitors || [];
  BUILDER_KEYS[type] = opts.builder || [];
  ALIAS_KEYS[type] = opts.aliases || [];
}
