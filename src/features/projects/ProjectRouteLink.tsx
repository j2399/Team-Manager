"use client"

import type * as React from "react"
import Link from "next/link"
import { useProjectRoute } from "@/features/projects/useProjectRoute"

type ProjectRouteLinkProps = {
    href: string
    projectId?: string | null
    children: React.ReactNode
    className?: string
    title?: string
    target?: string
    rel?: string
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
    onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>
    onFocus?: React.FocusEventHandler<HTMLAnchorElement>
    onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>
}

function isModifiedEvent(event: React.MouseEvent<HTMLAnchorElement>) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

export function ProjectRouteLink({
    href,
    projectId,
    children,
    className,
    title,
    target,
    rel,
    onClick,
    onMouseEnter,
    onFocus,
    onTouchStart,
}: ProjectRouteLinkProps) {
    const { prefetchProjectRoute, pushProjectRoute } = useProjectRoute()

    const prefetch = () => {
        if (!projectId) return
        prefetchProjectRoute(projectId)
    }

    return (
        <Link
            href={href}
            prefetch={false}
            className={className}
            title={title}
            target={target}
            rel={rel}
            onClick={(event) => {
                onClick?.(event)
                if (event.defaultPrevented || target === "_blank" || isModifiedEvent(event) || !projectId) {
                    return
                }
                event.preventDefault()
                pushProjectRoute(href, projectId)
            }}
            onMouseEnter={(event) => {
                onMouseEnter?.(event)
                prefetch()
            }}
            onFocus={(event) => {
                onFocus?.(event)
                prefetch()
            }}
            onTouchStart={(event) => {
                onTouchStart?.(event)
                prefetch()
            }}
        >
            {children}
        </Link>
    )
}
