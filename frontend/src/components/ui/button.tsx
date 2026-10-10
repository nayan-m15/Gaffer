import { buttonVariants } from "./button-variants"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Slot } from "@radix-ui/react-slot"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

type ButtonProps = Omit<ButtonPrimitive.Props, "style"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    style?: React.CSSProperties
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }))

  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={classes}
        {...props}
      />
    )
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      className={classes}
      {...props}
    />
  )
}

export { Button }
