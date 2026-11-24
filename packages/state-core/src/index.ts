export type Listener=()=>void;
export interface Store<T>{getSnapshot():T;subscribe(listener:Listener):()=>void;set(value:T):void;update(reducer:(previous:T)=>T):void;}
export function createStore<T>(initial:T):Store<T>{let value=initial;const listeners=new Set<Listener>();const set=(next:T)=>{if(Object.is(value,next))return;value=next;for(const listener of [...listeners])listener();};return {getSnapshot:()=>value,subscribe(listener){listeners.add(listener);return ()=>{listeners.delete(listener);};},set,update:reducer=>set(reducer(value))};}
