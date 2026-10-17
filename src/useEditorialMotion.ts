import {useEffect,type RefObject} from 'react';

/** Progressive enhancement: content stays visible without IntersectionObserver or animation. */
export function useEditorialMotion(root:RefObject<HTMLElement|null>){
  useEffect(()=>{
    const element=root.current;
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!element||preference.matches||!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    },{threshold:0.08,rootMargin:'0px 0px 70px 0px'});
    const targets=element.querySelectorAll<HTMLElement>('[data-reveal]');
    targets.forEach(target=>{
      if(target.getBoundingClientRect().top<window.innerHeight*0.94)return;
      target.classList.add('will-reveal');
      observer.observe(target);
    });
    const revealAll=()=>{
      if(!preference.matches)return;
      targets.forEach(target=>target.classList.add('is-revealed'));
      observer.disconnect();
    };
    preference.addEventListener('change',revealAll);
    return()=>{
      observer.disconnect();
      preference.removeEventListener('change',revealAll);
      targets.forEach(target=>target.classList.remove('will-reveal','is-revealed'));
    };
  },[root]);
}
