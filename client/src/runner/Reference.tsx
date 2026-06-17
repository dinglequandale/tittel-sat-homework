import { RichText } from '../RichText.tsx'

// The SAT-style reference sheet (the formulas provided on every Math section).
const ROWS: string[] = [
  'Area of a circle: $A=\\pi r^2$',
  'Circumference of a circle: $C=2\\pi r$',
  'Area of a rectangle: $A=\\ell w$',
  'Area of a triangle: $A=\\tfrac{1}{2}bh$',
  'Pythagorean theorem: $c^2=a^2+b^2$',
  'Special right triangle (45°–45°–90°): sides $x,\\ x,\\ x\\sqrt{2}$',
  'Special right triangle (30°–60°–90°): sides $x,\\ x\\sqrt{3},\\ 2x$',
  'Volume of a rectangular prism: $V=\\ell w h$',
  'Volume of a cylinder: $V=\\pi r^2 h$',
  'Volume of a sphere: $V=\\tfrac{4}{3}\\pi r^3$',
  'Volume of a cone: $V=\\tfrac{1}{3}\\pi r^2 h$',
  'There are $360$ degrees ($2\\pi$ radians) in a circle.',
  'The sum of the measures of the angles of a triangle is $180$ degrees.',
]

export function Reference({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal reference" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reference">
        <div className="modal-head">
          <strong>Reference</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close reference">
            ×
          </button>
        </div>
        <ul className="reference-list">
          {ROWS.map((r, i) => (
            <li key={i}>
              <RichText text={r} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
