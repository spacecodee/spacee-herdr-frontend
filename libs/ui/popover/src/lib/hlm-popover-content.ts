import { Directive, inject } from '@angular/core';
import { BrnOverlayRef } from '@spartan-ng/brain/overlay';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmPopoverContent],hlm-popover-content',
  exportAs: 'hlmPopoverContent',
  host: {
    'data-slot': 'popover-content',
    '[attr.data-state]': 'state()',
  },
})
export class HlmPopoverContent {
  private readonly _overlayRef = inject(BrnOverlayRef);
  public state = this._overlayRef.state;

  constructor() {
    classes(
      () =>
        'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 gap-4 rounded-3xl p-4 text-sm border duration-100 relative flex w-72 flex-col outline-none',
    );
  }
}
