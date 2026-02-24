export type IconGlyph =
  // Love
  | 'heart' | 'broken-heart' | 'ring' | 'rose' | 'lips'
  | 'hands-reaching' | 'two-figures' | 'alone-figure'
  | 'tear' | 'kiss-mark' | 'embrace' | 'heartbeat-line'
  // Power & Success
  | 'crown' | 'fist' | 'trophy' | 'diamond' | 'money-stack'
  | 'key' | 'throne' | 'shield' | 'chains' | 'broken-chains'
  // Nature & Elements
  | 'fire' | 'wave' | 'lightning' | 'sun' | 'moon' | 'rain'
  | 'snow-crystal' | 'mountain' | 'flower' | 'wind'
  | 'cloud' | 'star'
  // Journey & Motion
  | 'plane' | 'road-horizon' | 'compass' | 'footsteps'
  | 'arrow-up' | 'arrow-forward' | 'bridge' | 'rocket'
  // Darkness & Struggle
  | 'skull' | 'prison-bars' | 'falling-figure' | 'storm-cloud'
  | 'crying-eye' | 'hourglass' | 'ghost' | 'shadow'
  // City & Night
  | 'city-skyline' | 'car' | 'bottle' | 'clock-midnight'
  | 'phone' | 'street-light' | 'crowd'
  // Faith & Transcendence
  | 'wings' | 'cross' | 'praying-hands' | 'dove'
  | 'halo' | 'eye-of-providence' | 'infinity' | 'light-beam'
  // Freedom
  | 'bird-flying' | 'open-cage' | 'open-door' | 'horizon'
  | 'butterfly'
  // Music
  | 'microphone' | 'vinyl-record' | 'headphones'
  | 'music-note' | 'speaker-wave'

export type IconStyle = 'outline' | 'filled' | 'ghost'
export type IconPosition = 'behind' | 'above' | 'beside' | 'replace'

export interface IconDirective {
  glyph: IconGlyph
  style: IconStyle
  position: IconPosition
  scale: number
  opacity: number
}

// All icons drawn in normalized space then transformed
// ctx already translated to (x, y) center, scaled to size
type IconDrawFn = (ctx: CanvasRenderingContext2D) => void

const drawFigure = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath()
  ctx.arc(0, -0.6, 0.18, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -0.42)
  ctx.lineTo(0, 0.2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -0.1)
  ctx.lineTo(-0.2, 0.3)
  ctx.moveTo(0, -0.1)
  ctx.lineTo(0.2, 0.3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, 0.2)
  ctx.lineTo(-0.15, 0.7)
  ctx.moveTo(0, 0.2)
  ctx.lineTo(0.15, 0.7)
  ctx.stroke()
}

export const ICON_PATHS: Record<IconGlyph, IconDrawFn> = {

  // LOVE
  'heart': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, 0.3)
    ctx.bezierCurveTo(-0.1, 0.1, -0.5, 0.1, -0.5, -0.2)
    ctx.bezierCurveTo(-0.5, -0.6, 0, -0.5, 0, -0.2)
    ctx.bezierCurveTo(0, -0.5, 0.5, -0.6, 0.5, -0.2)
    ctx.bezierCurveTo(0.5, 0.1, 0.1, 0.1, 0, 0.3)
    ctx.stroke()
  },

  'broken-heart': (ctx) => {
    // Left half
    ctx.beginPath()
    ctx.moveTo(0, 0.3)
    ctx.bezierCurveTo(-0.1, 0.1, -0.5, 0.1, -0.5, -0.2)
    ctx.bezierCurveTo(-0.5, -0.6, -0.1, -0.55, 0, -0.3)
    ctx.lineTo(-0.15, -0.05)
    ctx.lineTo(0.05, 0.0)
    ctx.stroke()
    // Right half — offset
    ctx.beginPath()
    ctx.moveTo(0.05, 0.0)
    ctx.lineTo(-0.1, -0.25)
    ctx.lineTo(0, -0.3)
    ctx.bezierCurveTo(0.1, -0.55, 0.5, -0.6, 0.5, -0.2)
    ctx.bezierCurveTo(0.5, 0.1, 0.1, 0.1, 0, 0.3)
    ctx.stroke()
    // Crack line
    ctx.beginPath()
    ctx.moveTo(0, -0.3)
    ctx.lineTo(-0.12, -0.05)
    ctx.lineTo(0.05, 0.05)
    ctx.stroke()
  },

  'ring': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 0.32, 0, Math.PI * 2)
    ctx.stroke()
    // Diamond on top
    ctx.beginPath()
    ctx.moveTo(0, -0.65)
    ctx.lineTo(0.15, -0.5)
    ctx.lineTo(0, -0.38)
    ctx.lineTo(-0.15, -0.5)
    ctx.closePath()
    ctx.stroke()
  },

  'rose': (ctx) => {
    // Stem
    ctx.beginPath()
    ctx.moveTo(0, 0.9)
    ctx.bezierCurveTo(0.1, 0.5, -0.1, 0.2, 0, 0.1)
    ctx.stroke()
    // Leaf
    ctx.beginPath()
    ctx.moveTo(0.05, 0.5)
    ctx.bezierCurveTo(0.3, 0.3, 0.4, 0.6, 0.2, 0.65)
    ctx.stroke()
    // Petals
    ctx.beginPath()
    ctx.arc(0, -0.1, 0.35, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-0.35, -0.1)
    ctx.bezierCurveTo(-0.5, -0.5, 0, -0.7, 0, -0.45)
    ctx.bezierCurveTo(0, -0.7, 0.5, -0.5, 0.35, -0.1)
    ctx.stroke()
  },

  'lips': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.5, 0)
    ctx.bezierCurveTo(-0.4, -0.35, -0.15, -0.4, 0, -0.25)
    ctx.bezierCurveTo(0.15, -0.4, 0.4, -0.35, 0.5, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-0.5, 0)
    ctx.bezierCurveTo(-0.3, 0.45, 0.3, 0.45, 0.5, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-0.2, 0)
    ctx.bezierCurveTo(-0.1, -0.15, 0.1, -0.15, 0.2, 0)
    ctx.stroke()
  },

  'hands-reaching': (ctx) => {
    // Left hand reaching right
    ctx.beginPath()
    ctx.moveTo(-0.9, 0.2)
    ctx.lineTo(-0.2, 0.2)
    ctx.bezierCurveTo(0, 0.2, 0, -0.1, -0.1, -0.1)
    ctx.stroke()
    // Fingers left
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.1 - i * 0.1, -0.1)
      ctx.bezierCurveTo(-0.05 - i * 0.1, -0.4, -0.2 - i * 0.1, -0.4, -0.2 - i * 0.1, -0.1)
      ctx.stroke()
    }
    // Right hand reaching left — mirror
    ctx.save()
    ctx.scale(-1, 1)
    ctx.beginPath()
    ctx.moveTo(-0.9, 0.2)
    ctx.lineTo(-0.2, 0.2)
    ctx.bezierCurveTo(0, 0.2, 0, -0.1, -0.1, -0.1)
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.1 - i * 0.1, -0.1)
      ctx.bezierCurveTo(-0.05 - i * 0.1, -0.4, -0.2 - i * 0.1, -0.4, -0.2 - i * 0.1, -0.1)
      ctx.stroke()
    }
    ctx.restore()
  },

  'two-figures': (ctx) => {
    ctx.save()
    ctx.translate(-0.35, 0)
    drawFigure(ctx)
    ctx.restore()
    ctx.save()
    ctx.translate(0.35, 0)
    drawFigure(ctx)
    ctx.restore()
  },

  'alone-figure': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, -0.6, 0.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -0.4)
    ctx.lineTo(0, 0.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, -0.1)
    ctx.lineTo(-0.25, 0.2)
    ctx.moveTo(0, -0.1)
    ctx.lineTo(0.25, 0.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0.2)
    ctx.lineTo(-0.15, 0.7)
    ctx.moveTo(0, 0.2)
    ctx.lineTo(0.15, 0.7)
    ctx.stroke()
  },

  'tear': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, -0.7)
    ctx.bezierCurveTo(0.4, -0.2, 0.4, 0.3, 0, 0.5)
    ctx.bezierCurveTo(-0.4, 0.3, -0.4, -0.2, 0, -0.7)
    ctx.stroke()
  },

  'kiss-mark': (ctx) => {
    // Two overlapping ovals
    ctx.beginPath()
    ctx.ellipse(-0.2, 0, 0.3, 0.5, -0.3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0.2, 0, 0.3, 0.5, 0.3, 0, Math.PI * 2)
    ctx.stroke()
  },

  'embrace': (ctx) => {
    // Two figures hugging
    ctx.beginPath()
    ctx.arc(-0.15, -0.6, 0.18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0.15, -0.6, 0.18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-0.15, -0.42)
    ctx.bezierCurveTo(-0.15, 0, 0.15, 0, 0.15, -0.42)
    ctx.stroke()
    // Arms wrapping
    ctx.beginPath()
    ctx.moveTo(-0.15, -0.2)
    ctx.bezierCurveTo(-0.5, 0, -0.4, 0.5, 0, 0.5)
    ctx.bezierCurveTo(0.4, 0.5, 0.5, 0, 0.15, -0.2)
    ctx.stroke()
  },

  'heartbeat-line': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.9, 0)
    ctx.lineTo(-0.4, 0)
    ctx.lineTo(-0.25, -0.6)
    ctx.lineTo(-0.1, 0.6)
    ctx.lineTo(0.05, -0.3)
    ctx.lineTo(0.15, 0)
    ctx.lineTo(0.9, 0)
    ctx.stroke()
  },

  // POWER & SUCCESS
  'crown': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.6, 0.3)
    ctx.lineTo(-0.6, -0.2)
    ctx.lineTo(-0.3, 0.1)
    ctx.lineTo(0, -0.5)
    ctx.lineTo(0.3, 0.1)
    ctx.lineTo(0.6, -0.2)
    ctx.lineTo(0.6, 0.3)
    ctx.closePath()
    ctx.stroke()
    // Jewels
    ctx.beginPath()
    ctx.arc(-0.6, -0.2, 0.05, 0, Math.PI * 2)
    ctx.arc(0, -0.5, 0.06, 0, Math.PI * 2)
    ctx.arc(0.6, -0.2, 0.05, 0, Math.PI * 2)
    ctx.fill()
  },

  'fist': (ctx) => {
    // Knuckles
    ctx.beginPath()
    ctx.roundRect(-0.4, -0.5, 0.8, 0.35, 0.1)
    ctx.stroke()
    // Palm
    ctx.beginPath()
    ctx.roundRect(-0.4, -0.15, 0.75, 0.5, 0.08)
    ctx.stroke()
    // Thumb
    ctx.beginPath()
    ctx.moveTo(-0.4, 0.0)
    ctx.bezierCurveTo(-0.7, -0.1, -0.75, 0.2, -0.55, 0.3)
    ctx.bezierCurveTo(-0.4, 0.38, -0.4, 0.3, -0.4, 0.2)
    ctx.stroke()
    // Finger lines
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.2 + i * 0.25, -0.15)
      ctx.lineTo(-0.2 + i * 0.25, -0.5)
      ctx.stroke()
    }
  },

  'trophy': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.45, -0.7)
    ctx.lineTo(-0.45, -0.1)
    ctx.bezierCurveTo(-0.45, 0.3, 0.45, 0.3, 0.45, -0.1)
    ctx.lineTo(0.45, -0.7)
    ctx.closePath()
    ctx.stroke()
    // Handles
    ctx.beginPath()
    ctx.moveTo(-0.45, -0.5)
    ctx.bezierCurveTo(-0.75, -0.5, -0.75, -0.1, -0.45, -0.1)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0.45, -0.5)
    ctx.bezierCurveTo(0.75, -0.5, 0.75, -0.1, 0.45, -0.1)
    ctx.stroke()
    // Stem
    ctx.beginPath()
    ctx.moveTo(-0.15, 0.3)
    ctx.lineTo(-0.15, 0.6)
    ctx.lineTo(-0.4, 0.6)
    ctx.lineTo(-0.4, 0.75)
    ctx.lineTo(0.4, 0.75)
    ctx.lineTo(0.4, 0.6)
    ctx.lineTo(0.15, 0.6)
    ctx.lineTo(0.15, 0.3)
    ctx.stroke()
  },

  'diamond': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0.55, -0.2)
    ctx.lineTo(0.55, 0.1)
    ctx.lineTo(0, 0.8)
    ctx.lineTo(-0.55, 0.1)
    ctx.lineTo(-0.55, -0.2)
    ctx.closePath()
    ctx.stroke()
    // Facet lines
    ctx.beginPath()
    ctx.moveTo(-0.55, -0.2)
    ctx.lineTo(0, 0.1)
    ctx.lineTo(0.55, -0.2)
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0, 0.1)
    ctx.stroke()
  },

  'money-stack': (ctx) => {
    // Three stacked bills
    for (let i = 2; i >= 0; i--) {
      const yOff = i * 0.15
      ctx.beginPath()
      ctx.roundRect(-0.6, -0.3 + yOff, 1.2, 0.45, 0.05)
      ctx.stroke()
      if (i === 0) {
        ctx.beginPath()
        ctx.arc(0, -0.08, 0.15, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  },

  'key': (ctx) => {
    ctx.beginPath()
    ctx.arc(-0.2, -0.2, 0.38, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0.12, 0.0)
    ctx.lineTo(0.8, 0.65)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0.5, 0.35)
    ctx.lineTo(0.65, 0.2)
    ctx.moveTo(0.65, 0.5)
    ctx.lineTo(0.8, 0.35)
    ctx.stroke()
  },

  'throne': (ctx) => {
    // Seat
    ctx.beginPath()
    ctx.rect(-0.5, 0.1, 1.0, 0.15)
    ctx.stroke()
    // Legs
    ctx.beginPath()
    ctx.moveTo(-0.4, 0.25)
    ctx.lineTo(-0.4, 0.75)
    ctx.moveTo(0.4, 0.25)
    ctx.lineTo(0.4, 0.75)
    ctx.stroke()
    // Back
    ctx.beginPath()
    ctx.moveTo(-0.5, 0.1)
    ctx.lineTo(-0.5, -0.75)
    ctx.lineTo(0.5, -0.75)
    ctx.lineTo(0.5, 0.1)
    ctx.stroke()
    // Crown top
    ctx.beginPath()
    ctx.moveTo(-0.5, -0.75)
    ctx.lineTo(-0.35, -0.95)
    ctx.lineTo(-0.15, -0.75)
    ctx.lineTo(0, -0.95)
    ctx.lineTo(0.15, -0.75)
    ctx.lineTo(0.35, -0.95)
    ctx.lineTo(0.5, -0.75)
    ctx.stroke()
  },

  'shield': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0.6, -0.5)
    ctx.lineTo(0.6, 0.1)
    ctx.bezierCurveTo(0.6, 0.5, 0.3, 0.7, 0, 0.85)
    ctx.bezierCurveTo(-0.3, 0.7, -0.6, 0.5, -0.6, 0.1)
    ctx.lineTo(-0.6, -0.5)
    ctx.closePath()
    ctx.stroke()
  },

  'chains': (ctx) => {
    // Chain links horizontal
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.ellipse(i * 0.38, 0, 0.2, 0.12, 0, 0, Math.PI * 2)
      ctx.stroke()
      if (i < 2) {
        ctx.beginPath()
        ctx.ellipse(i * 0.38 + 0.19, 0, 0.12, 0.2, Math.PI / 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  },

  'broken-chains': (ctx) => {
    // Left chain
    ctx.beginPath()
    ctx.ellipse(-0.55, 0, 0.2, 0.12, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(-0.2, 0, 0.12, 0.2, Math.PI / 2, 0, Math.PI * 2)
    ctx.stroke()
    // Break gap
    ctx.beginPath()
    ctx.moveTo(-0.05, -0.15)
    ctx.lineTo(0.05, 0.15)
    ctx.stroke()
    // Right chain
    ctx.beginPath()
    ctx.ellipse(0.55, 0, 0.2, 0.12, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0.2, 0, 0.12, 0.2, Math.PI / 2, 0, Math.PI * 2)
    ctx.stroke()
  },

  // NATURE & ELEMENTS
  'fire': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, 0.8)
    ctx.bezierCurveTo(-0.5, 0.4, -0.5, -0.1, -0.2, -0.3)
    ctx.bezierCurveTo(-0.3, 0.1, -0.1, 0.2, 0, 0.1)
    ctx.bezierCurveTo(0.1, -0.3, -0.1, -0.6, 0, -0.9)
    ctx.bezierCurveTo(0.3, -0.5, 0.5, -0.1, 0.3, 0.2)
    ctx.bezierCurveTo(0.5, 0.0, 0.5, 0.4, 0.3, 0.5)
    ctx.bezierCurveTo(0.5, 0.7, 0.3, 0.9, 0, 0.8)
    ctx.stroke()
    // Inner flame
    ctx.beginPath()
    ctx.moveTo(0, 0.5)
    ctx.bezierCurveTo(-0.2, 0.2, -0.1, -0.1, 0, -0.3)
    ctx.bezierCurveTo(0.1, -0.1, 0.2, 0.2, 0, 0.5)
    ctx.stroke()
  },

  'wave': (ctx) => {
    // Three wave lines
    for (let i = 0; i < 3; i++) {
      const y = -0.3 + i * 0.3
      ctx.beginPath()
      ctx.moveTo(-0.8, y)
      ctx.bezierCurveTo(-0.5, y - 0.2, -0.3, y + 0.2, 0, y)
      ctx.bezierCurveTo(0.3, y - 0.2, 0.5, y + 0.2, 0.8, y)
      ctx.stroke()
    }
  },

  'lightning': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0.2, -0.9)
    ctx.lineTo(-0.25, 0.0)
    ctx.lineTo(0.15, 0.0)
    ctx.lineTo(-0.2, 0.9)
    ctx.stroke()
  },

  'sun': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.35, 0, Math.PI * 2)
    ctx.stroke()
    // Rays
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * 0.45, Math.sin(angle) * 0.45)
      ctx.lineTo(Math.cos(angle) * 0.75, Math.sin(angle) * 0.75)
      ctx.stroke()
    }
  },

  'moon': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.55, 0.4, Math.PI * 2 - 0.4)
    ctx.arc(0.2, 0, 0.45, Math.PI * 2 - 0.3, 0.3, true)
    ctx.stroke()
  },

  'rain': (ctx) => {
    // Cloud top
    ctx.beginPath()
    ctx.arc(-0.2, -0.4, 0.28, Math.PI, 0)
    ctx.arc(0.15, -0.5, 0.22, Math.PI, 0)
    ctx.lineTo(0.5, -0.2)
    ctx.lineTo(-0.5, -0.2)
    ctx.closePath()
    ctx.stroke()
    // Rain drops
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.4 + i * 0.2, 0.0)
      ctx.lineTo(-0.5 + i * 0.2, 0.4)
      ctx.stroke()
    }
  },

  'snow-crystal': (ctx) => {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7)
      ctx.stroke()
      // Branch lines
      const mid = 0.4
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * mid, Math.sin(angle) * mid)
      ctx.lineTo(
        Math.cos(angle) * mid + Math.cos(angle + Math.PI / 2) * 0.2,
        Math.sin(angle) * mid + Math.sin(angle + Math.PI / 2) * 0.2
      )
      ctx.moveTo(Math.cos(angle) * mid, Math.sin(angle) * mid)
      ctx.lineTo(
        Math.cos(angle) * mid + Math.cos(angle - Math.PI / 2) * 0.2,
        Math.sin(angle) * mid + Math.sin(angle - Math.PI / 2) * 0.2
      )
      ctx.stroke()
    }
  },

  'mountain': (ctx) => {
    // Back peak
    ctx.beginPath()
    ctx.moveTo(-0.1, -0.3)
    ctx.lineTo(0.35, 0.7)
    ctx.lineTo(-0.6, 0.7)
    ctx.closePath()
    ctx.stroke()
    // Front peak
    ctx.beginPath()
    ctx.moveTo(-0.05, -0.8)
    ctx.lineTo(0.7, 0.7)
    ctx.lineTo(-0.8, 0.7)
    ctx.closePath()
    ctx.stroke()
    // Snow cap
    ctx.beginPath()
    ctx.moveTo(-0.05, -0.8)
    ctx.lineTo(0.2, -0.35)
    ctx.lineTo(-0.3, -0.35)
    ctx.closePath()
    ctx.stroke()
  },

  'flower': (ctx) => {
    // Petals
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.ellipse(
        Math.cos(angle) * 0.38,
        Math.sin(angle) * 0.38,
        0.18, 0.28, angle, 0, Math.PI * 2
      )
      ctx.stroke()
    }
    // Center
    ctx.beginPath()
    ctx.arc(0, 0, 0.18, 0, Math.PI * 2)
    ctx.stroke()
    // Stem
    ctx.beginPath()
    ctx.moveTo(0, 0.55)
    ctx.lineTo(0, 0.9)
    ctx.stroke()
  },

  'wind': (ctx) => {
    // Three flowing wind lines
    const lines = [
      { y: -0.3, x1: -0.8, x2: 0.5, curve: -0.15 },
      { y: 0.0,  x1: -0.5, x2: 0.8, curve: 0.15 },
      { y: 0.3,  x1: -0.7, x2: 0.3, curve: -0.1 },
    ]
    for (const l of lines) {
      ctx.beginPath()
      ctx.moveTo(l.x1, l.y)
      ctx.bezierCurveTo(l.x1 + 0.3, l.y + l.curve, l.x2 - 0.3, l.y - l.curve, l.x2, l.y)
      ctx.stroke()
    }
  },

  'cloud': (ctx) => {
    ctx.beginPath()
    ctx.arc(-0.25, 0, 0.3, Math.PI / 2, Math.PI * 3 / 2)
    ctx.arc(0, -0.2, 0.28, Math.PI, 0)
    ctx.arc(0.3, 0, 0.28, Math.PI * 3 / 2, Math.PI / 2)
    ctx.lineTo(-0.25, 0.3)
    ctx.stroke()
  },

  'star': (ctx) => {
    const points = 5
    const outer = 0.7
    const inner = 0.3
    ctx.beginPath()
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
      if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
      else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
    }
    ctx.closePath()
    ctx.stroke()
  },

  // JOURNEY & MOTION
  'plane': (ctx) => {
    // Fuselage
    ctx.beginPath()
    ctx.moveTo(-0.8, 0)
    ctx.bezierCurveTo(-0.5, -0.05, 0.5, -0.05, 0.8, 0.05)
    ctx.bezierCurveTo(0.5, 0.08, -0.5, 0.05, -0.8, 0)
    ctx.stroke()
    // Wings
    ctx.beginPath()
    ctx.moveTo(-0.1, 0)
    ctx.lineTo(-0.4, 0.55)
    ctx.lineTo(0.35, 0.15)
    ctx.closePath()
    ctx.stroke()
    // Tail fin
    ctx.beginPath()
    ctx.moveTo(-0.6, 0)
    ctx.lineTo(-0.8, -0.3)
    ctx.lineTo(-0.5, -0.05)
    ctx.stroke()
    // Small tail wing
    ctx.beginPath()
    ctx.moveTo(-0.65, 0.02)
    ctx.lineTo(-0.8, 0.2)
    ctx.lineTo(-0.5, 0.08)
    ctx.stroke()
  },

  'road-horizon': (ctx) => {
    // Horizon line
    ctx.beginPath()
    ctx.moveTo(-0.9, 0)
    ctx.lineTo(0.9, 0)
    ctx.stroke()
    // Road lines converging to horizon
    ctx.beginPath()
    ctx.moveTo(-0.5, 0.8)
    ctx.lineTo(0, 0)
    ctx.lineTo(0.5, 0.8)
    ctx.stroke()
    // Dashed center line
    for (let i = 0; i < 4; i++) {
      const t = i / 4
      const y = t * 0.8
      const w = t * 0.05
      ctx.beginPath()
      ctx.moveTo(-w, y)
      ctx.lineTo(w, y + 0.15)
      ctx.stroke()
    }
  },

  'compass': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2)
    ctx.stroke()
    // N arrow up
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -0.5)
    ctx.lineTo(-0.1, -0.3)
    ctx.moveTo(0, -0.5)
    ctx.lineTo(0.1, -0.3)
    ctx.stroke()
    // S arrow down
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 0.5)
    ctx.stroke()
    // Letters
    ctx.font = `${0.25}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -0.6)
  },

  'footsteps': (ctx) => {
    // Two offset footprints
    const steps = [
      { x: -0.2, y: 0.5, angle: 0.2 },
      { x: 0.2, y: 0.1, angle: -0.2 },
      { x: -0.15, y: -0.35, angle: 0.15 },
    ]
    for (const s of steps) {
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(s.angle)
      ctx.beginPath()
      ctx.ellipse(0, 0, 0.1, 0.18, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  },

  'arrow-up': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, -0.8)
    ctx.lineTo(-0.4, -0.3)
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0.4, -0.3)
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0, 0.8)
    ctx.stroke()
  },

  'arrow-forward': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0.8, 0)
    ctx.lineTo(0.3, -0.4)
    ctx.moveTo(0.8, 0)
    ctx.lineTo(0.3, 0.4)
    ctx.moveTo(0.8, 0)
    ctx.lineTo(-0.8, 0)
    ctx.stroke()
  },

  'bridge': (ctx) => {
    // Road
    ctx.beginPath()
    ctx.moveTo(-0.9, 0.3)
    ctx.lineTo(0.9, 0.3)
    ctx.stroke()
    // Arch
    ctx.beginPath()
    ctx.arc(0, 0.3, 0.6, Math.PI, 0)
    ctx.stroke()
    // Towers
    ctx.beginPath()
    ctx.moveTo(-0.55, 0.3)
    ctx.lineTo(-0.55, -0.5)
    ctx.moveTo(0.55, 0.3)
    ctx.lineTo(0.55, -0.5)
    ctx.stroke()
    // Cables
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 0.18, -0.3)
      ctx.lineTo(i * 0.18, 0.3)
      ctx.stroke()
    }
  },

  'rocket': (ctx) => {
    // Body
    ctx.beginPath()
    ctx.moveTo(0, -0.8)
    ctx.bezierCurveTo(0.3, -0.5, 0.3, 0.2, 0.3, 0.4)
    ctx.lineTo(-0.3, 0.4)
    ctx.bezierCurveTo(-0.3, 0.2, -0.3, -0.5, 0, -0.8)
    ctx.stroke()
    // Fins
    ctx.beginPath()
    ctx.moveTo(-0.3, 0.4)
    ctx.lineTo(-0.6, 0.75)
    ctx.lineTo(-0.3, 0.6)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0.3, 0.4)
    ctx.lineTo(0.6, 0.75)
    ctx.lineTo(0.3, 0.6)
    ctx.stroke()
    // Window
    ctx.beginPath()
    ctx.arc(0, -0.2, 0.15, 0, Math.PI * 2)
    ctx.stroke()
    // Flame
    ctx.beginPath()
    ctx.moveTo(-0.15, 0.4)
    ctx.bezierCurveTo(-0.1, 0.65, 0, 0.9, 0.05, 0.7)
    ctx.bezierCurveTo(0.1, 0.65, 0.15, 0.4, 0.15, 0.4)
    ctx.stroke()
  },

  // DARKNESS & STRUGGLE
  'skull': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, -0.15, 0.5, 0, Math.PI * 2)
    ctx.stroke()
    // Jaw
    ctx.beginPath()
    ctx.moveTo(-0.35, 0.2)
    ctx.lineTo(-0.35, 0.6)
    ctx.lineTo(0.35, 0.6)
    ctx.lineTo(0.35, 0.2)
    ctx.stroke()
    // Teeth
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.rect(i * 0.22 - 0.08, 0.35, 0.16, 0.25)
      ctx.stroke()
    }
    // Eyes
    ctx.beginPath()
    ctx.ellipse(-0.18, -0.2, 0.12, 0.15, 0, 0, Math.PI * 2)
    ctx.ellipse(0.18, -0.2, 0.12, 0.15, 0, 0, Math.PI * 2)
    ctx.stroke()
  },

  'prison-bars': (ctx) => {
    // Frame
    ctx.beginPath()
    ctx.rect(-0.7, -0.8, 1.4, 1.6)
    ctx.stroke()
    // Vertical bars
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(i * 0.3, -0.8)
      ctx.lineTo(i * 0.3, 0.8)
      ctx.stroke()
    }
    // Horizontal bar
    ctx.beginPath()
    ctx.moveTo(-0.7, 0)
    ctx.lineTo(0.7, 0)
    ctx.stroke()
  },

  'falling-figure': (ctx) => {
    // Head
    ctx.beginPath()
    ctx.arc(0.3, -0.6, 0.18, 0, Math.PI * 2)
    ctx.stroke()
    // Body diagonal — falling
    ctx.beginPath()
    ctx.moveTo(0.2, -0.42)
    ctx.lineTo(-0.1, 0.2)
    ctx.stroke()
    // Arms flailing
    ctx.beginPath()
    ctx.moveTo(0.1, -0.1)
    ctx.lineTo(0.5, 0.2)
    ctx.moveTo(0.0, -0.05)
    ctx.lineTo(-0.35, -0.2)
    ctx.stroke()
    // Legs
    ctx.beginPath()
    ctx.moveTo(-0.1, 0.2)
    ctx.lineTo(0.15, 0.65)
    ctx.moveTo(-0.1, 0.2)
    ctx.lineTo(-0.4, 0.55)
    ctx.stroke()
    // Motion lines
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(0.5 + i * 0.1, -0.5 + i * 0.2)
      ctx.lineTo(0.65 + i * 0.1, -0.3 + i * 0.2)
      ctx.stroke()
    }
  },

  'storm-cloud': (ctx) => {
    ctx.beginPath()
    ctx.arc(-0.3, -0.1, 0.35, Math.PI / 2, Math.PI * 3 / 2)
    ctx.arc(-0.05, -0.35, 0.3, Math.PI, 0)
    ctx.arc(0.3, -0.1, 0.32, Math.PI * 3 / 2, Math.PI / 2)
    ctx.lineTo(-0.3, 0.25)
    ctx.stroke()
    // Lightning
    ctx.beginPath()
    ctx.moveTo(0.05, 0.25)
    ctx.lineTo(-0.1, 0.55)
    ctx.lineTo(0.05, 0.55)
    ctx.lineTo(-0.1, 0.85)
    ctx.stroke()
  },

  'crying-eye': (ctx) => {
    // Eye shape
    ctx.beginPath()
    ctx.moveTo(-0.6, 0)
    ctx.bezierCurveTo(-0.3, -0.4, 0.3, -0.4, 0.6, 0)
    ctx.bezierCurveTo(0.3, 0.3, -0.3, 0.3, -0.6, 0)
    ctx.stroke()
    // Iris
    ctx.beginPath()
    ctx.arc(0, 0, 0.22, 0, Math.PI * 2)
    ctx.stroke()
    // Tear drops
    ctx.beginPath()
    ctx.moveTo(0, 0.22)
    ctx.bezierCurveTo(0.12, 0.5, 0.12, 0.7, 0, 0.8)
    ctx.bezierCurveTo(-0.12, 0.7, -0.12, 0.5, 0, 0.22)
    ctx.stroke()
  },

  'hourglass': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.45, -0.8)
    ctx.lineTo(0.45, -0.8)
    ctx.lineTo(0, 0)
    ctx.lineTo(0.45, 0.8)
    ctx.lineTo(-0.45, 0.8)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.stroke()
    // Sand bottom
    ctx.beginPath()
    ctx.arc(0, 0.55, 0.25, 0, Math.PI)
    ctx.stroke()
    // Top frame lines
    ctx.beginPath()
    ctx.moveTo(-0.5, -0.85)
    ctx.lineTo(0.5, -0.85)
    ctx.moveTo(-0.5, 0.85)
    ctx.lineTo(0.5, 0.85)
    ctx.stroke()
  },

  'ghost': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, -0.3, 0.45, Math.PI, 0)
    ctx.lineTo(0.45, 0.5)
    ctx.bezierCurveTo(0.3, 0.7, 0.15, 0.5, 0, 0.65)
    ctx.bezierCurveTo(-0.15, 0.5, -0.3, 0.7, -0.45, 0.5)
    ctx.closePath()
    ctx.stroke()
    // Eyes
    ctx.beginPath()
    ctx.arc(-0.15, -0.3, 0.08, 0, Math.PI * 2)
    ctx.arc(0.15, -0.3, 0.08, 0, Math.PI * 2)
    ctx.stroke()
  },

  'shadow': (ctx) => {
    // Human silhouette shadow — stretched and distorted
    ctx.beginPath()
    ctx.ellipse(0.2, 0.7, 0.5, 0.12, -0.3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0.6)
    ctx.bezierCurveTo(-0.1, 0.2, -0.2, -0.2, -0.05, -0.5)
    ctx.bezierCurveTo(0.1, -0.8, 0.2, -0.6, 0.1, -0.4)
    ctx.bezierCurveTo(0.2, -0.1, 0.3, 0.3, 0.4, 0.6)
    ctx.stroke()
  },

  // CITY & NIGHT
  'city-skyline': (ctx) => {
    const buildings = [
      [-0.9, 0.4, 0.15, 0.4],
      [-0.7, 0.2, 0.18, 0.6],
      [-0.48, 0.3, 0.2, 0.5],
      [-0.25, -0.1, 0.22, 0.9],
      [0.0, 0.1, 0.2, 0.7],
      [0.22, -0.3, 0.25, 1.0],
      [0.5, 0.15, 0.18, 0.65],
      [0.7, 0.3, 0.2, 0.5],
    ]
    for (const [x, y, w, h] of buildings) {
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.stroke()
    }
    // Ground
    ctx.beginPath()
    ctx.moveTo(-0.9, 0.8)
    ctx.lineTo(0.9, 0.8)
    ctx.stroke()
  },

  'car': (ctx) => {
    // Body
    ctx.beginPath()
    ctx.moveTo(-0.7, 0.2)
    ctx.lineTo(-0.7, -0.1)
    ctx.bezierCurveTo(-0.6, -0.4, -0.3, -0.5, 0, -0.5)
    ctx.bezierCurveTo(0.3, -0.5, 0.55, -0.4, 0.65, -0.1)
    ctx.lineTo(0.7, 0.2)
    ctx.stroke()
    // Bottom
    ctx.beginPath()
    ctx.moveTo(-0.7, 0.2)
    ctx.lineTo(-0.45, 0.2)
    ctx.moveTo(-0.1, 0.2)
    ctx.lineTo(0.1, 0.2)
    ctx.moveTo(0.45, 0.2)
    ctx.lineTo(0.7, 0.2)
    ctx.stroke()
    // Wheels
    ctx.beginPath()
    ctx.arc(-0.45, 0.3, 0.2, 0, Math.PI * 2)
    ctx.arc(0.45, 0.3, 0.2, 0, Math.PI * 2)
    ctx.stroke()
    // Window
    ctx.beginPath()
    ctx.moveTo(-0.35, -0.1)
    ctx.lineTo(-0.25, -0.42)
    ctx.lineTo(0.3, -0.42)
    ctx.lineTo(0.45, -0.1)
    ctx.closePath()
    ctx.stroke()
  },

  'bottle': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(-0.15, -0.8)
    ctx.lineTo(-0.15, -0.55)
    ctx.bezierCurveTo(-0.35, -0.35, -0.4, -0.1, -0.4, 0.2)
    ctx.lineTo(-0.4, 0.75)
    ctx.lineTo(0.4, 0.75)
    ctx.lineTo(0.4, 0.2)
    ctx.bezierCurveTo(0.4, -0.1, 0.35, -0.35, 0.15, -0.55)
    ctx.lineTo(0.15, -0.8)
    ctx.closePath()
    ctx.stroke()
    // Label
    ctx.beginPath()
    ctx.rect(-0.35, 0.1, 0.7, 0.4)
    ctx.stroke()
    // Liquid level
    ctx.beginPath()
    ctx.moveTo(-0.38, 0.45)
    ctx.lineTo(0.38, 0.45)
    ctx.stroke()
  },

  'clock-midnight': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.7, 0, Math.PI * 2)
    ctx.stroke()
    // Hands pointing up — midnight
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -0.55)  // minute hand
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, -0.4)   // hour hand — same direction at midnight
    ctx.stroke()
    // Center dot
    ctx.beginPath()
    ctx.arc(0, 0, 0.05, 0, Math.PI * 2)
    ctx.fill()
    // Hour marks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
      const r1 = i % 3 === 0 ? 0.55 : 0.62
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1)
      ctx.lineTo(Math.cos(angle) * 0.68, Math.sin(angle) * 0.68)
      ctx.stroke()
    }
  },

  'phone': (ctx) => {
    ctx.beginPath()
    ctx.roundRect(-0.3, -0.8, 0.6, 1.6, 0.1)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(-0.22, -0.65, 0.44, 1.1, 0.05)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0.65, 0.07, 0, Math.PI * 2)
    ctx.stroke()
  },

  'street-light': (ctx) => {
    // Pole
    ctx.beginPath()
    ctx.moveTo(0, 0.9)
    ctx.lineTo(0, -0.5)
    ctx.stroke()
    // Arm
    ctx.beginPath()
    ctx.moveTo(0, -0.5)
    ctx.bezierCurveTo(0, -0.75, 0.4, -0.75, 0.4, -0.5)
    ctx.stroke()
    // Light fixture
    ctx.beginPath()
    ctx.ellipse(0.4, -0.45, 0.15, 0.08, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Light rays
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(0.4 + i * 0.06, -0.37)
      ctx.lineTo(0.4 + i * 0.12, -0.1)
      ctx.stroke()
    }
    // Base
    ctx.beginPath()
    ctx.moveTo(-0.15, 0.9)
    ctx.lineTo(0.15, 0.9)
    ctx.stroke()
  },

  'crowd': (ctx) => {
    // Multiple figure heads at different heights
    const figures = [
      [-0.7, 0.2], [-0.45, 0.0], [-0.2, 0.15],
      [0.05, -0.1], [0.3, 0.1], [0.55, 0.0], [0.75, 0.2],
    ]
    for (const [x, y] of figures) {
      ctx.beginPath()
      ctx.arc(x, y, 0.14, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - 0.12, y + 0.14)
      ctx.bezierCurveTo(x - 0.12, y + 0.45, x + 0.12, y + 0.45, x + 0.12, y + 0.14)
      ctx.stroke()
    }
    // Ground line
    ctx.beginPath()
    ctx.moveTo(-0.9, 0.65)
    ctx.lineTo(0.9, 0.65)
    ctx.stroke()
  },

  // FAITH & TRANSCENDENCE
  'wings': (ctx) => {
    // Left wing
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-0.2, -0.3, -0.6, -0.5, -0.9, -0.3)
    ctx.bezierCurveTo(-0.7, -0.1, -0.4, 0.0, -0.2, 0.2)
    ctx.bezierCurveTo(-0.5, 0.1, -0.75, 0.2, -0.85, 0.4)
    ctx.bezierCurveTo(-0.6, 0.35, -0.35, 0.25, -0.1, 0.3)
    ctx.stroke()
    // Right wing — mirror
    ctx.save()
    ctx.scale(-1, 1)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-0.2, -0.3, -0.6, -0.5, -0.9, -0.3)
    ctx.bezierCurveTo(-0.7, -0.1, -0.4, 0.0, -0.2, 0.2)
    ctx.bezierCurveTo(-0.5, 0.1, -0.75, 0.2, -0.85, 0.4)
    ctx.bezierCurveTo(-0.6, 0.35, -0.35, 0.25, -0.1, 0.3)
    ctx.stroke()
    ctx.restore()
  },

  'cross': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, -0.8)
    ctx.lineTo(0, 0.8)
    ctx.moveTo(-0.5, -0.25)
    ctx.lineTo(0.5, -0.25)
    ctx.stroke()
  },

  'praying-hands': (ctx) => {
    // Two hands pressed together
    ctx.beginPath()
    ctx.moveTo(0, 0.7)
    ctx.bezierCurveTo(-0.15, 0.5, -0.25, 0.2, -0.2, -0.1)
    ctx.lineTo(-0.08, -0.7)
    ctx.lineTo(0, -0.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0.7)
    ctx.bezierCurveTo(0.15, 0.5, 0.25, 0.2, 0.2, -0.1)
    ctx.lineTo(0.08, -0.7)
    ctx.lineTo(0, -0.5)
    ctx.stroke()
    // Finger lines right
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(0, -0.5 + i * 0.25)
      ctx.lineTo(0.18, -0.6 + i * 0.25)
      ctx.stroke()
    }
  },

  'dove': (ctx) => {
    // Body
    ctx.beginPath()
    ctx.ellipse(0, 0.1, 0.35, 0.22, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Head
    ctx.beginPath()
    ctx.arc(0.3, -0.15, 0.18, 0, Math.PI * 2)
    ctx.stroke()
    // Beak
    ctx.beginPath()
    ctx.moveTo(0.46, -0.15)
    ctx.lineTo(0.65, -0.1)
    ctx.lineTo(0.46, -0.05)
    ctx.stroke()
    // Tail
    ctx.beginPath()
    ctx.moveTo(-0.35, 0.1)
    ctx.lineTo(-0.65, -0.1)
    ctx.moveTo(-0.35, 0.1)
    ctx.lineTo(-0.65, 0.1)
    ctx.moveTo(-0.35, 0.1)
    ctx.lineTo(-0.65, 0.3)
    ctx.stroke()
    // Wing
    ctx.beginPath()
    ctx.moveTo(-0.1, -0.05)
    ctx.bezierCurveTo(-0.1, -0.5, 0.3, -0.6, 0.3, -0.33)
    ctx.stroke()
  },

  'halo': (ctx) => {
    ctx.beginPath()
    ctx.ellipse(0, 0, 0.6, 0.2, 0, 0, Math.PI * 2)
    ctx.stroke()
    // Glow lines
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const x = Math.cos(angle) * 0.6
      const y = Math.sin(angle) * 0.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x * 1.3, y * 1.3)
      ctx.stroke()
    }
  },

  'eye-of-providence': (ctx) => {
    // Triangle
    ctx.beginPath()
    ctx.moveTo(0, -0.75)
    ctx.lineTo(0.75, 0.55)
    ctx.lineTo(-0.75, 0.55)
    ctx.closePath()
    ctx.stroke()
    // Eye
    ctx.beginPath()
    ctx.moveTo(-0.3, 0)
    ctx.bezierCurveTo(-0.15, -0.25, 0.15, -0.25, 0.3, 0)
    ctx.bezierCurveTo(0.15, 0.25, -0.15, 0.25, -0.3, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 0.13, 0, Math.PI * 2)
    ctx.stroke()
    // Rays
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * 0.55, Math.sin(angle) * 0.55)
      ctx.lineTo(Math.cos(angle) * 0.7, Math.sin(angle) * 0.7)
      ctx.stroke()
    }
  },

  'infinity': (ctx) => {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(0.1, -0.4, 0.7, -0.4, 0.7, 0)
    ctx.bezierCurveTo(0.7, 0.4, 0.1, 0.4, 0, 0)
    ctx.bezierCurveTo(-0.1, -0.4, -0.7, -0.4, -0.7, 0)
    ctx.bezierCurveTo(-0.7, 0.4, -0.1, 0.4, 0, 0)
    ctx.stroke()
  },

  'light-beam': (ctx) => {
    // Source at top
    ctx.beginPath()
    ctx.arc(0, -0.75, 0.12, 0, Math.PI * 2)
    ctx.stroke()
    // Beam spreading down
    ctx.beginPath()
    ctx.moveTo(-0.08, -0.63)
    ctx.lineTo(-0.6, 0.8)
    ctx.moveTo(0.08, -0.63)
    ctx.lineTo(0.6, 0.8)
    ctx.stroke()
    // Horizontal rays at source
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue
      ctx.beginPath()
      ctx.moveTo(0, -0.75)
      ctx.lineTo(i * 0.35, -0.75)
      ctx.stroke()
    }
  },

  // FREEDOM
  'bird-flying': (ctx) => {
    // Simple flying bird — two curved wings
    ctx.beginPath()
    ctx.moveTo(-0.7, 0)
    ctx.bezierCurveTo(-0.4, -0.35, -0.1, -0.1, 0, 0.05)
    ctx.bezierCurveTo(0.1, -0.1, 0.4, -0.35, 0.7, 0)
    ctx.stroke()
    // Small body
    ctx.beginPath()
    ctx.arc(0, 0.05, 0.06, 0, Math.PI * 2)
    ctx.fill()
  },

  'open-cage': (ctx) => {
    // Cage bars — right side open
    ctx.beginPath()
    ctx.moveTo(-0.5, -0.7)
    ctx.lineTo(-0.5, 0.7)
    ctx.moveTo(-0.5, -0.7)
    ctx.lineTo(0.5, -0.7)
    ctx.moveTo(-0.5, 0.7)
    ctx.lineTo(0.5, 0.7)
    ctx.stroke()
    // Bars left side
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.5 + i * 0.2, -0.7)
      ctx.lineTo(-0.5 + i * 0.2, 0.7)
      ctx.stroke()
    }
    // Open door right
    ctx.beginPath()
    ctx.moveTo(0.5, -0.7)
    ctx.lineTo(0.75, -0.55)
    ctx.lineTo(0.75, 0.55)
    ctx.lineTo(0.5, 0.7)
    ctx.stroke()
    // Bird escaping
    ctx.beginPath()
    ctx.moveTo(0.6, -0.1)
    ctx.bezierCurveTo(0.75, -0.3, 0.95, -0.2, 0.9, 0)
    ctx.stroke()
  },

  'open-door': (ctx) => {
    // Door frame
    ctx.beginPath()
    ctx.moveTo(-0.5, 0.8)
    ctx.lineTo(-0.5, -0.8)
    ctx.lineTo(0.5, -0.8)
    ctx.lineTo(0.5, 0.8)
    ctx.stroke()
    // Door open — angled
    ctx.beginPath()
    ctx.moveTo(-0.5, -0.8)
    ctx.lineTo(-0.5, 0.8)
    ctx.lineTo(-0.1, 0.7)
    ctx.lineTo(-0.1, -0.65)
    ctx.closePath()
    ctx.stroke()
    // Light pouring through
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.08, -0.5 + i * 0.3)
      ctx.lineTo(0.45, -0.6 + i * 0.35)
      ctx.stroke()
    }
    // Knob
    ctx.beginPath()
    ctx.arc(-0.15, 0, 0.05, 0, Math.PI * 2)
    ctx.stroke()
  },

  'horizon': (ctx) => {
    // Wide horizon line
    ctx.beginPath()
    ctx.moveTo(-0.9, 0)
    ctx.lineTo(0.9, 0)
    ctx.stroke()
    // Sun rising
    ctx.beginPath()
    ctx.arc(0, 0, 0.3, Math.PI, 0)
    ctx.stroke()
    // Rays
    for (let i = -3; i <= 3; i++) {
      const angle = (i / 7) * Math.PI
      ctx.beginPath()
      ctx.moveTo(Math.cos(angle) * 0.35, Math.sin(angle) * 0.35)
      ctx.lineTo(Math.cos(angle) * 0.55, Math.sin(angle) * 0.55)
      ctx.stroke()
    }
    // Ground reflection lines
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.9 + i * 0.1, i * 0.2)
      ctx.lineTo(0.9 - i * 0.1, i * 0.2)
      ctx.stroke()
    }
  },

  'butterfly': (ctx) => {
    // Upper wings
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-0.1, -0.3, -0.6, -0.6, -0.75, -0.2)
    ctx.bezierCurveTo(-0.7, 0.1, -0.3, 0.1, 0, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(0.1, -0.3, 0.6, -0.6, 0.75, -0.2)
    ctx.bezierCurveTo(0.7, 0.1, 0.3, 0.1, 0, 0)
    ctx.stroke()
    // Lower wings
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-0.1, 0.2, -0.55, 0.4, -0.5, 0.6)
    ctx.bezierCurveTo(-0.3, 0.6, -0.1, 0.3, 0, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(0.1, 0.2, 0.55, 0.4, 0.5, 0.6)
    ctx.bezierCurveTo(0.3, 0.6, 0.1, 0.3, 0, 0)
    ctx.stroke()
    // Body
    ctx.beginPath()
    ctx.moveTo(0, -0.4)
    ctx.lineTo(0, 0.5)
    ctx.stroke()
    // Antennae
    ctx.beginPath()
    ctx.moveTo(0, -0.4)
    ctx.bezierCurveTo(-0.1, -0.6, -0.25, -0.7, -0.2, -0.8)
    ctx.moveTo(0, -0.4)
    ctx.bezierCurveTo(0.1, -0.6, 0.25, -0.7, 0.2, -0.8)
    ctx.stroke()
  },

  // MUSIC
  'microphone': (ctx) => {
    ctx.beginPath()
    ctx.roundRect(-0.22, -0.75, 0.44, 0.65, 0.22)
    ctx.stroke()
    // Grille lines
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(-0.2, -0.6 + i * 0.2)
      ctx.lineTo(0.2, -0.6 + i * 0.2)
      ctx.stroke()
    }
    // Stem
    ctx.beginPath()
    ctx.moveTo(0, -0.1)
    ctx.lineTo(0, 0.55)
    ctx.stroke()
    // Base
    ctx.beginPath()
    ctx.moveTo(-0.35, 0.55)
    ctx.bezierCurveTo(-0.35, 0.8, 0.35, 0.8, 0.35, 0.55)
    ctx.stroke()
  },

  'vinyl-record': (ctx) => {
    ctx.beginPath()
    ctx.arc(0, 0, 0.75, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 0.45, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 0.08, 0, Math.PI * 2)
    ctx.fill()
    // Grooves
    for (let r = 0.5; r <= 0.72; r += 0.07) {
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.globalAlpha = 0.3
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  },

  'headphones': (ctx) => {
    // Band
    ctx.beginPath()
    ctx.arc(0, 0.1, 0.55, Math.PI, 0)
    ctx.stroke()
    // Left ear cup
    ctx.beginPath()
    ctx.moveTo(-0.55, 0.1)
    ctx.lineTo(-0.55, 0.35)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(-0.7, 0.35, 0.3, 0.4, 0.1)
    ctx.stroke()
    // Right ear cup
    ctx.beginPath()
    ctx.moveTo(0.55, 0.1)
    ctx.lineTo(0.55, 0.35)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(0.4, 0.35, 0.3, 0.4, 0.1)
    ctx.stroke()
  },

  'music-note': (ctx) => {
    // Note head
    ctx.beginPath()
    ctx.ellipse(-0.15, 0.55, 0.22, 0.18, -0.4, 0, Math.PI * 2)
    ctx.stroke()
    // Stem
    ctx.beginPath()
    ctx.moveTo(0.07, 0.48)
    ctx.lineTo(0.07, -0.5)
    ctx.stroke()
    // Flag
    ctx.beginPath()
    ctx.moveTo(0.07, -0.5)
    ctx.bezierCurveTo(0.5, -0.4, 0.5, -0.1, 0.07, -0.1)
    ctx.stroke()
  },

  'speaker-wave': (ctx) => {
    // Speaker box
    ctx.beginPath()
    ctx.rect(-0.55, -0.4, 0.4, 0.8)
    ctx.stroke()
    // Cone
    ctx.beginPath()
    ctx.moveTo(-0.15, -0.3)
    ctx.lineTo(0.05, -0.1)
    ctx.lineTo(0.05, 0.1)
    ctx.lineTo(-0.15, 0.3)
    ctx.stroke()
    // Sound waves
    for (let i = 0; i < 3; i++) {
      const r = 0.2 + i * 0.2
      ctx.beginPath()
      ctx.arc(0.05, 0, r, -Math.PI / 3, Math.PI / 3)
      ctx.stroke()
    }
  },
}

export function drawIcon(
  ctx: CanvasRenderingContext2D,
  glyph: IconGlyph,
  x: number,
  y: number,
  size: number,
  color: string,
  style: IconStyle,
  opacity: number
): void {
  const fn = ICON_PATHS[glyph]
  if (!fn) return

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x, y)
  ctx.scale(size, size)

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2 / size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 8 / size

  if (style === 'ghost') {
    ctx.globalAlpha = opacity * 0.15
  }

  const ctxAny = ctx as CanvasRenderingContext2D & { stroke: (...args: any[]) => void }
  const originalStroke = ctx.stroke.bind(ctx)
  if (style === 'filled') {
    ctxAny.stroke = (...args: any[]) => {
      originalStroke(...args)
      ctx.fill()
    }
  }

  fn(ctx)

  if (style === 'filled') {
    ctxAny.stroke = originalStroke
  }

  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.restore()
}
