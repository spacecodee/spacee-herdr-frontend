import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmBubbleGroup],hlm-bubble-group',
  exportAs: 'hlmBubbleGroup',
  host: { 'data-slot': 'bubble-group' },
})
export class HlmBubbleGroup {
  constructor() {
    classes(() => 'gap-3 flex min-w-0 flex-col');
  }
}
