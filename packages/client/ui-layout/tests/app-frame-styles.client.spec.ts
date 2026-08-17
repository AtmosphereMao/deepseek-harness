/**
 * AppFrame grid-placement contract. jsdom applies no CSS-module styles, so the
 * DOM tests cannot see track placement; these assertions read the stylesheet
 * source instead.
 *
 * The regression they guard: the phone states position the sidebar column
 * absolutely (floating control / overlay drawer). Under grid auto-placement
 * that took the sidebar out of flow and shifted every later child up one
 * track — the conversation landed on the 0px sidebar track and the details
 * panel inherited the 1fr center, so a phone showed a full-width Details pane
 * and no chat. Each column must therefore pin its own track explicitly.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('AppFrame.module.css grid placement', () => {
  it('pins every column to its own track so an out-of-flow sidebar cannot shift the rest', () => {
    // The three occupants map 1:1 onto the three tracks of gridTemplateColumns.
    expect(declarations('.sidebarCol')?.get('grid-column')).toBe('1')
    expect(declarations('.centerCol')?.get('grid-column')).toBe('2')
    expect(declarations('.detailsCol')?.get('grid-column')).toBe('3')
  })

  it('keeps both phone sidebar states out of flow and above the center', () => {
    // Out of flow is what makes the center span the full viewport; the explicit
    // columns above are what keep that safe.
    for (const selector of ['.sidebarFloating', '.sidebarOverlay']) {
      expect(declarations(selector)?.get('position')).toBe('absolute')
    }
    // The scrim sits under the drawer, both under the shell overlay layer (20).
    expect(declarations('.scrim')?.get('z-index')).toBe('15')
    expect(declarations('.sidebarOverlay')?.get('z-index')).toBe('16')
    expect(declarations('.sidebarFloating')?.get('z-index')).toBe('16')
    expect(declarations('.overlayLayer')?.get('z-index')).toBe('20')
  })

  it('lets the floating control shrink to its button box, unlike the drawer', () => {
    // A stretched grid item would cover the whole conversation column and
    // swallow taps; the drawer deliberately spans top-to-bottom instead.
    const floating = declarations('.sidebarFloating')
    expect(floating?.get('height')).toBe('auto')
    expect(floating?.get('background')).toBe('none')
    expect(floating?.get('border-right')).toBe('none')
    const drawer = declarations('.sidebarOverlay')
    expect(drawer?.get('top')).toBe('0')
    expect(drawer?.get('bottom')).toBe('0')
  })
})
