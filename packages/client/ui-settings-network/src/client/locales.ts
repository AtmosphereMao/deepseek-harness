/** `settings.network` namespace dictionaries (the Network settings section copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '网络',
  'title': '网络代理',
  'intro': '为所有对外请求配置一个 HTTP(S) 代理：模型 API、网页抓取和网页搜索都会经由它发出。留空表示直连。',
  'proxyLabel': '代理地址',
  'proxyPlaceholder': 'http://127.0.0.1:7890',
  'proxyHint': '支持 http:// 与 https:// 协议；保存后对下一个请求生效，无需重启。',
  'invalidUrl': '请输入有效的 http:// 或 https:// 代理地址。',
  'unsaved': '有未保存的更改',
  'discard': '放弃',
  'save': '保存',
  'readOnly': '当前设置文档为只读，无法修改代理。',
  'unavailable': '当前会话未提供网络代理设置。',
} satisfies Record<string, string>

/** The settings.network namespace key union. */
export type NetworkKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Network',
  'title': 'Network proxy',
  'intro': 'Configure one HTTP(S) proxy for every outbound request — the model API, web fetch, and web search all route through it. Leave empty for direct connections.',
  'proxyLabel': 'Proxy URL',
  'proxyPlaceholder': 'http://127.0.0.1:7890',
  'proxyHint': 'http:// and https:// schemes are supported; a saved change applies to the next request without a restart.',
  'invalidUrl': 'Enter a valid http:// or https:// proxy URL.',
  'unsaved': 'Unsaved changes',
  'discard': 'Discard',
  'save': 'Save',
  'readOnly': 'The settings document is read-only; the proxy cannot be changed.',
  'unavailable': 'Network proxy settings are not available in this session.',
} satisfies Record<NetworkKey, string>
