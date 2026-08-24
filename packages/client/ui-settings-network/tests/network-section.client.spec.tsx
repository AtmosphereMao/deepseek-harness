// @vitest-environment jsdom
/**
 * NetworkSection behavior: renders the committed proxy, commits a valid edit
 * only on Save (or Enter), blocks unusable URLs, discards a pending draft, and
 * degrades when the namespace is unavailable or read-only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { NetworkSection } from '../src/client/NetworkSection.tsx'
import type { NetworkSectionInjected, NetworkSettings } from '../src/client/NetworkSection.tsx'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'nav': 'Network',
  'title': 'Network proxy',
  'intro': 'Intro',
  'proxyLabel': 'Proxy URL',
  'proxyPlaceholder': 'http://127.0.0.1:7890',
  'proxyHint': 'Hint',
  'invalidUrl': 'Enter a valid http:// or https:// proxy URL.',
  'unsaved': 'Unsaved changes',
  'discard': 'Discard',
  'save': 'Save',
  'readOnly': 'Read only',
  'unavailable': 'Unavailable',
}

function snapshot(overrides: Partial<SettingsScopeSnapshot<NetworkSettings>> = {}): SettingsScopeSnapshot<NetworkSettings> {
  return {
    status: 'ready',
    value: { proxy: 'http://127.0.0.1:7890' },
    base: undefined,
    user: undefined,
    revision: 0,
    writable: true,
    mode: 'host',
    ...overrides,
  }
}

function mount(initial: SettingsScopeSnapshot<NetworkSettings>) {
  const store = createSnapshotStore(initial)
  const setProxy = vi.fn()
  const injected: NetworkSectionInjected = {
    useSnapshot: bindSnapshotSelector(store),
    setProxy,
    t: key => COPY[key] ?? key,
  }
  render(<NetworkSection {...injected} />)
  return { store, setProxy }
}

const input = (): HTMLInputElement => screen.getByRole('textbox') as HTMLInputElement
const save = (): HTMLButtonElement => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
const discard = (): HTMLButtonElement => screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement

describe('NetworkSection', () => {
  it('renders the committed proxy in the field', () => {
    mount(snapshot())
    expect(screen.getByText('Network proxy')).toBeDefined()
    expect(input().value).toBe('http://127.0.0.1:7890')
  })

  it('commits an http:// edit through setProxy on Save', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'http://127.0.0.1:9999' } })
    fireEvent.click(save())
    expect(setProxy).toHaveBeenCalledWith('http://127.0.0.1:9999')
  })

  it('commits an https:// edit through setProxy on Save', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'https://proxy.example:8443' } })
    fireEvent.click(save())
    expect(setProxy).toHaveBeenCalledWith('https://proxy.example:8443')
  })

  it('commits a valid edit through setProxy on Enter', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'http://127.0.0.1:9999' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(setProxy).toHaveBeenCalledWith('http://127.0.0.1:9999')
  })

  it('ignores a non-Enter key press', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.keyDown(input(), { key: 'a' })
    expect(setProxy).not.toHaveBeenCalled()
  })

  it('blocks an unparseable URL on Save and does not call setProxy', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'not a url' } })
    fireEvent.click(save())
    expect(screen.getByText('Enter a valid http:// or https:// proxy URL.')).toBeDefined()
    expect(setProxy).not.toHaveBeenCalled()
  })

  it('blocks a non-http scheme on Save and does not call setProxy', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'ftp://proxy.example' } })
    fireEvent.click(save())
    expect(screen.getByText('Enter a valid http:// or https:// proxy URL.')).toBeDefined()
    expect(setProxy).not.toHaveBeenCalled()
  })

  it('clears to inherit when saved with an empty field', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: '' } })
    fireEvent.click(save())
    expect(setProxy).toHaveBeenCalledWith('')
  })

  it('shows an unsaved indicator while the draft differs from the committed value', () => {
    mount(snapshot())
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.change(input(), { target: { value: 'http://127.0.0.1:8080' } })
    expect(screen.getByText('Unsaved changes')).toBeDefined()
  })

  it('keeps Save and Discard disabled while the field has no draft', () => {
    mount(snapshot())
    expect(save()).toHaveProperty('disabled', true)
    expect(discard()).toHaveProperty('disabled', true)
  })

  it('discards a pending draft and restores the committed value', () => {
    const { setProxy } = mount(snapshot())
    fireEvent.change(input(), { target: { value: 'http://127.0.0.1:8080' } })
    fireEvent.click(discard())
    expect(input().value).toBe('http://127.0.0.1:7890')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(setProxy).not.toHaveBeenCalled()
  })

  it('disables the field and Save when the namespace is read-only', () => {
    mount(snapshot({ writable: false }))
    expect(input()).toHaveProperty('disabled', true)
    expect(save()).toHaveProperty('disabled', true)
    expect(screen.getByText('Read only')).toBeDefined()
  })

  it('renders the unavailable notice when the namespace is not exposed', () => {
    mount(snapshot({ status: 'unavailable', value: undefined, writable: false }))
    expect(screen.getByText('Unavailable')).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('reflects an external committed change while the field has no draft', () => {
    const { store } = mount(snapshot())
    act(() => {
      store.set(snapshot({ value: { proxy: 'http://127.0.0.1:8080' } }))
    })
    expect(input().value).toBe('http://127.0.0.1:8080')
  })

  it('renders nothing while the shell has not injected the slot face', () => {
    render(<NetworkSection />)
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
