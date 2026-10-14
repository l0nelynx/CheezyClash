import { useEffect, useState, type RefObject } from 'react'

/** Mouse-wheel and grab-to-scroll gestures without turning a drag into a tab click. */
export function useHorizontalScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean): boolean {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    setDragging(false)
    let drag: { id: number; x: number; left: number; moved: boolean } | null = null
    let suppressClick = false
    const wheel = (event: WheelEvent): void => {
      if (event.ctrlKey || element.scrollWidth <= element.clientWidth) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1
      element.scrollBy({ left: delta * scale, behavior: 'instant' })
    }
    const down = (event: PointerEvent): void => {
      suppressClick = false
      if (event.button !== 0 || event.pointerType === 'touch' || element.scrollWidth <= element.clientWidth) return
      // Leave the native scrollbar free to handle its own drag.
      if (event.clientY >= element.getBoundingClientRect().top + element.clientHeight) return
      element.scrollTo({ left: element.scrollLeft, behavior: 'instant' })
      drag = { id: event.pointerId, x: event.clientX, left: element.scrollLeft, moved: false }
    }
    const move = (event: PointerEvent): void => {
      if (!drag || event.pointerId !== drag.id) return
      const distance = event.clientX - drag.x
      if (!drag.moved && Math.abs(distance) < 5) return
      if (!drag.moved) {
        drag.moved = true
        suppressClick = true
        element.setPointerCapture(event.pointerId)
        setDragging(true)
      }
      event.preventDefault()
      element.scrollTo({ left: drag.left - distance, behavior: 'instant' })
    }
    const finish = (event: PointerEvent): void => {
      if (!drag || event.pointerId !== drag.id) return
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
      drag = null
      setDragging(false)
      if (event.type === 'pointercancel') suppressClick = false
    }
    const leave = (): void => { if (drag && !drag.moved) drag = null }
    const click = (event: MouseEvent): void => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault()
        event.stopPropagation()
      }
      suppressClick = false
    }
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
    element.addEventListener('pointerleave', leave)
    element.addEventListener('click', click, true)
    return () => {
      if (drag && element.hasPointerCapture(drag.id)) element.releasePointerCapture(drag.id)
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
      element.removeEventListener('pointerleave', leave)
      element.removeEventListener('click', click, true)
    }
  }, [ref, enabled])
  return dragging
}
