import {
  Component,
  ComponentFactory,
  ComponentRef,
  OnInit,
  Input,
  ViewChild,
  ViewContainerRef,
  OnDestroy,
  EventEmitter,
  ElementRef,
  Injector,
  Type,
} from '@angular/core';
import { NgxElementService } from './ngx-element.service';
import { merge, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
    selector: 'lib-ngx-element',
    template: `<ng-template #container></ng-template>`,
    styles: [],
    standalone: false
})
export class NgxElementComponent implements OnInit, OnDestroy {
  private ngElementEventsSubscription: Subscription;
  @Input() selector: string;
  @ViewChild('container', { read: ViewContainerRef }) container;
  componentRef: ComponentRef<any>;
  componentToLoad: Type<any>;
  injector: Injector;

  constructor(
    private ngxElementService: NgxElementService,
    private elementRef: ElementRef
  ) {}

  private setProxiedOutputs(factory: ComponentFactory<any>): void {
    const eventEmitters = factory.outputs.map(({ propName, templateName }) => {
      const emitter = (this.componentRef.instance as any)[propName] as EventEmitter<any>;
      return emitter.pipe(map((value: any) => ({ name: templateName, value })));
    });
    const outputEvents = merge(...eventEmitters);
    this.ngElementEventsSubscription = outputEvents.subscribe((subscription) => {
      const customEvent = document.createEvent('CustomEvent');
      customEvent.initCustomEvent(subscription.name, false, false, subscription.value);
      this.elementRef.nativeElement.dispatchEvent(customEvent);
    });
  }

  ngOnInit(): void {
    this.ngxElementService.getComponentToLoad(this.selector).subscribe((event) => {
      this.componentToLoad = event.componentClass;
      const attributes = this.getElementAttributes();
      this.createComponent(attributes);
    });
  }

  createComponent(attributes) {
    this.container.clear();
    const factory = this.ngxElementService.getComponentFactoryResolver(this.componentToLoad).resolveComponentFactory(this.componentToLoad);
    this.injector = Injector.create({
      providers: [{ provide: this.componentToLoad, useValue: this.componentToLoad }],
      parent: this.ngxElementService.getInjector(this.componentToLoad),
    });
    this.componentRef = this.container.createComponent(factory, 0, this.injector);
    this.setAttributes(attributes);
    this.listenToAttributeChanges();
    this.setProxiedOutputs(factory);
  }

  setAttributes(attributes) {
    attributes.forEach((attr) => {
      this.componentRef.instance[attr.name] = attr.value;
    });
  }

  getElementAttributes() {
    const attrs = this.elementRef.nativeElement.attributes;
    const attributes = [];
    for (let attr, i = 0; i < attrs.length; i++) {
      attr = attrs[i];
      if (attr.nodeName.match('^data-')) {
        attributes.push({
          name: this.camelCaseAttribute(attr.nodeName),
          value: attr.nodeValue,
        });
      }
    }
    return attributes;
  }

  camelCaseAttribute(attribute: string) {
    const attr = attribute.replace('data-', '');
    const chunks = attr.split('-');
    if (chunks.length > 1) {
      return chunks[0] + chunks.slice(1).map((chunk) => chunk.replace(/^\w/, (c) => c.toUpperCase())).join('');
    }
    return attr;
  }

  listenToAttributeChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const attributes = this.getElementAttributes();
          this.setAttributes(attributes);
        }
      });
    });
    observer.observe(this.elementRef.nativeElement, {
      attributes: true,
    });
  }

  ngOnDestroy() {
    this.componentRef.destroy();
    this.ngElementEventsSubscription.unsubscribe();
  }
}
