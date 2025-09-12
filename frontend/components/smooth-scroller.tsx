"use client"

import { ReactLenis, useLenis } from "@studio-freight/react-lenis"
import { ReactNode } from "react"

function SmoothScroller({ children }: { children: ReactNode }) {
  const lenis = useLenis(({ scroll }) => {
    // called every frame
  })

  return (
    <ReactLenis root>
      { children }
    </ReactLenis>
  )
}

export default SmoothScroller 