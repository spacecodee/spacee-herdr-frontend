import { Directive, input } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const codeBlockVariants = cva(
  'has-[>[data-slot=code-block-content]:focus-visible]:ring-ring/30 rounded-2xl text-sm has-[>[data-slot=code-block-content]:focus-visible]:ring-3 data-[size=sm]:rounded-xl data-[size=sm]:text-xs group/code-block relative flex w-full min-w-0 flex-col overflow-hidden',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground ring-foreground/5 dark:ring-foreground/10 ring-1',
        destructive:
          'bg-destructive/5 text-destructive ring-destructive/15 dark:bg-destructive/10 dark:ring-destructive/20 ring-1',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type CodeBlockVariants = VariantProps<typeof codeBlockVariants>;

@Directive({
  selector: '[hlmCodeBlock],hlm-code-block',
  exportAs: 'hlmCodeBlock',
  host: {
    'data-slot': 'code-block',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
  },
})
export class HlmCodeBlock {
  public readonly variant = input<CodeBlockVariants['variant']>('default');
  public readonly size = input<'default' | 'sm'>('default');

  constructor() {
    classes(() => codeBlockVariants({ variant: this.variant() }));
  }
}
