// 内外部主播使用不同标识，不能按姓名合并。
export function anchorKey(anchorId: string | null, externalAnchorId: string | null) { return externalAnchorId ? `external:${externalAnchorId}` : anchorId; }
export function anchorIds(key: string) { return key.startsWith("external:") ? { anchorId: null, externalAnchorId: key.slice(9) } : { anchorId: key || null, externalAnchorId: null }; }
