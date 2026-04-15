"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rounded-xl bg-slate-100 p-1 gap-1 h-10",
        line: "gap-1 bg-transparent border-b border-slate-200 rounded-none h-10 pb-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // base
        "relative inline-flex h-full items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap cursor-pointer transition-all select-none",
        "text-slate-500 hover:text-slate-800",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5067F4]/40 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",

        // default variant — pill style
        "group-data-[variant=default]/tabs-list:rounded-lg",
        "group-data-[variant=default]/tabs-list:hover:bg-slate-200/60 group-data-[variant=default]/tabs-list:hover:text-slate-700",
        "group-data-[variant=default]/tabs-list:data-[active]:bg-white group-data-[variant=default]/tabs-list:data-[active]:text-[#5067F4] group-data-[variant=default]/tabs-list:data-[active]:shadow-sm group-data-[variant=default]/tabs-list:data-[active]:font-semibold",

        // line variant — underline style
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:mb-[-1px]",
        "group-data-[variant=line]/tabs-list:hover:text-slate-700 group-data-[variant=line]/tabs-list:hover:border-slate-300",
        "group-data-[variant=line]/tabs-list:data-[active]:text-[#5067F4] group-data-[variant=line]/tabs-list:data-[active]:border-[#5067F4] group-data-[variant=line]/tabs-list:data-[active]:font-semibold",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
