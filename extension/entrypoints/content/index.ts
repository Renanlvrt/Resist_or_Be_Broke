import { createApp } from 'vue';
import App from '../../components/App.vue';
import '../../components/style.css';
export default defineContentScript({
  matches: ['http://*/*','https://*/*'], // KEEPHARD: corner hover -> dashboard on every site (Amazon purchase hooks stay Amazon-only via isAmazon)
  cssInjectionMode:'ui',
  async main(ctx) {
    if(document.querySelector('pocket-companion'))return;
    const ui=await createShadowRootUi(ctx,{
      name:'pocket-companion',position:'overlay',anchor:document.documentElement,
      zIndex:2147483647,inheritStyles:true,
      onMount(container,_shadow,host){
        // Keep Amazon's body, transforms and overflow out of the overlay ancestry.
        host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;z-index:2147483647!important;display:block!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;transform:none!important;filter:none!important;perspective:none!important;contain:none!important;isolation:isolate!important;pointer-events:none!important;';
        container.style.cssText='position:fixed;inset:0;overflow:visible;pointer-events:none;';
        // A manual popover puts the complete scene in the top layer without making
        // the page inert. Pointer events remain enabled only on actual UI controls.
        const raise=()=>{
          if(typeof host.showPopover!=='function')return;
          try{
            if(host.matches(':popover-open'))host.hidePopover();
            host.showPopover();
          }catch{/* Fixed maximum-z-index positioning remains the fallback. */}
        };
        if(typeof host.showPopover==='function')host.setAttribute('popover','manual');
        host.addEventListener('pocket:raise',raise,{signal:ctx.signal});
        const app=createApp(App);app.mount(container);raise();return app;
      },
      onRemove(app){app?.unmount();},
    });
    ui.mount();
  },
});
