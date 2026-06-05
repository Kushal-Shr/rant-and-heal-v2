---
name: Soft Clay Realism
colors:
  surface: '#fff8f5'
  surface-dim: '#fed2ab'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1e8'
  surface-container: '#ffeada'
  surface-container-high: '#ffe3cd'
  surface-container-highest: '#ffdcbf'
  on-surface: '#2c1601'
  on-surface-variant: '#414845'
  inverse-surface: '#442b10'
  inverse-on-surface: '#ffeee1'
  outline: '#717974'
  outline-variant: '#c1c8c3'
  surface-tint: '#446558'
  primary: '#325347'
  on-primary: '#ffffff'
  primary-container: '#4a6b5e'
  on-primary-container: '#c6eada'
  inverse-primary: '#abcebf'
  secondary: '#785741'
  on-secondary: '#ffffff'
  secondary-container: '#fed1b4'
  on-secondary-container: '#795841'
  tertiary: '#793b26'
  on-tertiary: '#ffffff'
  tertiary-container: '#96523b'
  on-tertiary-container: '#ffdacf'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c6ebda'
  primary-fixed-dim: '#abcebf'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#2d4d41'
  secondary-fixed: '#ffdcc6'
  secondary-fixed-dim: '#e9bea2'
  on-secondary-fixed: '#2d1605'
  on-secondary-fixed-variant: '#5e402b'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390b00'
  on-tertiary-fixed-variant: '#723521'
  background: '#fff8f5'
  on-background: '#2c1601'
  surface-variant: '#ffdcbf'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.3'
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '300'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '300'
    lineHeight: '1.6'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2.5rem
  xl: 4rem
  gutter: 1.5rem
  margin_safe: 2rem
---

## Brand & Style

This design system is built on the philosophy of "Soft Clay Realism." It transforms the digital interface into a tactile sanctuary that feels physically present yet impossibly gentle. The goal is to lower the user's cortisol levels through visual weight and softness, moving away from the "flatness" of traditional tech toward a dream-like, marshmallow-textured world.

The brand personality is empathetic, patient, and non-judgmental. It uses organic, fluid shapes—specifically "blob" accents—to represent the messy, non-linear nature of mental healing. Every element should feel like it could be squeezed or pressed, providing a sensory comfort that mirrors the act of "venting" or "healing."

## Colors

The palette is split into two distinct emotional states. The **Light Mode** (Daybreak) focuses on warm, earthen tones that suggest a safe, sunlit garden. Backgrounds use "Dough" and "Sand" tones to reduce blue-light strain, while the Moss Green provides a grounding anchor for headings.

**Dark Mode** (Nightfall) shifts the experience into a cosmic, quiet space. It utilizes deep navies and purples to represent the subconscious. Accents in this mode, like Aurora Teal and Gold, act as "guiding lights" or sparks of hope within the venting process.

In both modes, colors should never be applied at 100% saturation. They are always softened to maintain the "clay" aesthetic.

## Typography

This design system utilizes **Plus Jakarta Sans** for its exceptionally soft apertures and rounded terminals, which perfectly complement the clay-like visuals. 

Headings use a **500 weight (Medium)** to maintain presence without becoming "heavy" or aggressive. Body text is set at **300 weight (Light)** with generous line-height to maximize whitespace and readability during long "ranting" sessions. Text colors avoid pure black or pure white, instead using the Brown (#8A6848) in light mode to keep the interface feeling organic.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model but with intentionally "imperfect" padding to emphasize the organic theme. Elements should rarely feel "cramped." 

1. **Breathing Room:** Use the `xl` (4rem) spacing for vertical gaps between major content sections to allow the 3D shadows room to diffuse.
2. **Organic Blobs:** Blob accents should be placed asymmetrically in the background, often bleeding off the edge of the viewport to create a sense of an infinite, soft world.
3. **The "Float" Margin:** Elements should maintain a minimum of 2rem from the viewport edges to ensure they feel like objects floating in space rather than components pinned to a screen.

## Elevation & Depth

Depth is the core of "Soft Clay Realism." Unlike flat material design, this system uses a multi-layered shadow approach:

1. **The Object Shadow:** A large, highly diffused ambient shadow tinted with the background color (e.g., a brown-tinted shadow for light mode).
2. **The Contact Shadow:** A smaller, darker, more opaque shadow directly beneath the element to "ground" it.
3. **Inner Depth:** Interactive elements like input fields should use **Inner Shadows** to appear as though they have been pressed into the clay surface.
4. **Z-Axis Hierarchy:** 
   - *Level 0:* Background Blobs (No shadow, slight blur).
   - *Level 1:* Main Content Cards (Soft ambient shadow).
   - *Level 2:* Buttons and Interactive Chips (High-contrast contact shadow).
   - *Level 3:* Overlays and Modals (Deepest, most diffused shadows).

## Shapes

Shapes in this design system must never have sharp corners. All primary containers use a radius between **32px and 48px**. 

- **Primary Cards:** 40px radius.
- **Buttons:** Fully pill-shaped (100vh radius) to suggest they are squishy and safe to press.
- **Organic Blobs:** Generated using non-uniform border radii (e.g., `60% 40% 30% 70% / 60% 30% 70% 40%`) to create "cloud" or "clay" silhouettes.

## Components

### Buttons
Buttons are "Marshmallow" style. They use a primary color fill with a subtle 1px inner highlight on the top edge to simulate a 3D light source. 
- **Interaction:** On press, the button should physically scale down to 96% and the shadow should shrink, simulating a physical "squish."

### Cards
Cards are the primary containers for "Healing" content. They are multi-layered; a card might sit on a slightly larger, lighter-colored "shadow card" to give it physical thickness.

### Input Fields
Inputs should look like indents in the clay. Use a soft inner shadow and the Moss Green for the cursor. When focused, the inner shadow glows slightly with the Butter accent color.

### Momo Mascot
Momo is a 3D marshmallow cloud. Momo should utilize an "Idle Float" animation (y-axis movement of 10px over 3 seconds). When the user is "ranting" (typing fast), Momo's "Breathing Pulse" animation should speed up slightly to encourage the user to regulate their breath.

### Progress Bubbles
Instead of flat bars, use a series of round clay spheres that "pop" or grow in size when a milestone is reached.