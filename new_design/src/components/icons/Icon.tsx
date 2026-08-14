import { forwardRef, type SVGAttributes } from 'react';

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  /** Icon size in pixels (default: 24) */
  size?: number | string;
  /** Stroke width (default: 2) */
  strokeWidth?: number | string;
  /** Custom className */
  className?: string;
  /** Title for accessibility */
  title?: string;
  /** ARIA label */
  'aria-label'?: string;
}

/**
 * Base Icon component - all custom icons use this wrapper
 * Ensures consistent sizing, currentColor theming, and accessibility
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ 
    children, 
    size = 24, 
    strokeWidth = 2, 
    className = '', 
    title, 
    'aria-label': ariaLabel,
    ...props 
  }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={!title && !ariaLabel}
      aria-labelledby={title ? 'icon-title' : undefined}
      {...props}
    >
      {title && <title id="icon-title">{title}</title>}
      {ariaLabel && !title && <title id="icon-title">{ariaLabel}</title>}
      {children}
    </svg>
  )
);

Icon.displayName = 'Icon';

/**
 * Factory for creating consistent icon components
 */
export function createIcon(
  name: string,
  paths: React.ReactNode[],
  defaultProps?: Partial<IconProps>
) {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
      <Icon 
        ref={ref} 
        {...defaultProps} 
        {...props} 
        aria-label={props['aria-label'] ?? name}
      >
        {paths}
      </Icon>
    )
  );
  Component.displayName = name;
  return Component;
}