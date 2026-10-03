"use client"

import * as React from "react"
import { cn } from "cn"
import { Slider as SliderPrimitive } from "radix-ui"

/** One-thumb slider: a 4 px track, a white thumb with a 44 px hit area. `aria-label` names the thumb (the role="slider"). */
function Slider({ className, "aria-label": label, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex h-11 w-full touch-none items-center select-none data-disabled:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1 grow overflow-hidden rounded-full bg-white/15">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-foreground" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={label}
        className="relative block size-5 rounded-full bg-foreground shadow-[0_1px_3px_rgb(0_0_0/0.4)] outline-none after:absolute after:-inset-3 focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
